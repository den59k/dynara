import { test, expect } from "bun:test"
import { schema } from "compact-json-schema"
import { Router, HTTPError, isValidationError } from "../src"

// Task 2 — setErrorHandler.

const build = () => {
  const app = new Router()
  app.setErrorHandler((err, req) => {
    if (err instanceof HTTPError) {
      return Response.json({ envelope: "http", status: err.statusCode, message: err.message }, { status: err.statusCode })
    }
    if (isValidationError(err)) {
      return Response.json({ envelope: "validation" }, { status: 422 })
    }
    return Response.json({ envelope: "internal", path: new URL(req.raw.url).pathname }, { status: 500 })
  })

  app.get("/http", () => { throw new HTTPError("nope", 403) })
  app.post("/validate", { body: schema({ name: "string" }) }, () => ({ ok: true }))
  app.get("/boom", () => { throw new Error("kaboom") })
  return app
}

test("routes a thrown HTTPError through the custom handler", async () => {
  const res = await build().inject("/http")
  expect(res.status).toBe(403)
  expect(await res.json()).toEqual({ envelope: "http", status: 403, message: "nope" })
})

test("routes a validation failure through the custom handler", async () => {
  const res = await build().inject({ method: "POST", url: "/validate", body: { name: 123 } })
  expect(res.status).toBe(422)
  expect(await res.json()).toEqual({ envelope: "validation" })
})

test("routes a generic Error through the custom handler with the request", async () => {
  const res = await build().inject("/boom")
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ envelope: "internal", path: "/boom" })
})

test("params validation failure also routes through the custom handler", async () => {
  const app = new Router()
  app.setErrorHandler(() => Response.json({ caught: true }, { status: 422 }))
  app.get("/users/:id", [{ id: "number" }], (req) => ({ id: req.params.id }))
  const res = await app.inject("/users/not-a-number")
  expect(res.status).toBe(422)
  expect(await res.json()).toEqual({ caught: true })
})

test("a throwing custom handler falls back to the default mapping without crashing", async () => {
  const app = new Router()
  app.setErrorHandler(() => { throw new Error("handler exploded") })
  app.get("/boom", () => { throw new HTTPError("teapot", 418) })

  const res = await app.inject("/boom")
  expect(res.status).toBe(418)
  expect(await res.text()).toBe("teapot")
})

test("the custom handler applies to register() children (app-global)", async () => {
  const app = new Router()
  app.setErrorHandler(() => Response.json({ global: true }, { status: 400 }))
  app.register((child) => {
    child.get("/x", () => { throw new Error("child error") })
  }, { prefix: "/c" })

  const res = await app.inject("/c/x")
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ global: true })
})

test("without a custom handler the default behavior is unchanged", async () => {
  const app = new Router()
  app.get("/boom", () => { throw new HTTPError("teapot", 418) })
  const res = await app.inject("/boom")
  expect(res.status).toBe(418)
  expect(await res.text()).toBe("teapot")
})

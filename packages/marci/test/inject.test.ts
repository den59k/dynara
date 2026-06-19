import { test, expect } from "bun:test"
import { schema } from "compact-json-schema"
import { MarciApp, HTTPError } from "../src"

const app = new MarciApp()

app.get("/items/:itemIds", [{ itemIds: { type: "array", items: "number" } }], (req) => {
  return { params: req.params }
})

const query = schema({ raw: "boolean" })
app.get("/test/*", [{}, query], (req) => {
  return { query: req.query }
})

const bodySchema = schema({ name: "string" })
app.post("/items", { body: bodySchema }, (req) => {
  return { created: req.body }
})

app.get("/boom", () => {
  throw new HTTPError("teapot", 418)
})

test("matches a route and parses array params", async () => {
  const res = await app.inject("/items/1,2,3")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ params: { itemIds: [1, 2, 3] } })
})

test("parses typed query string", async () => {
  const res = await app.inject("/test/anything?raw=true")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ query: { raw: true } })
})

test("sends a JSON body on POST", async () => {
  const res = await app.inject({ method: "POST", url: "/items", body: { name: "Alice" } })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ created: { name: "Alice" } })
})

test("runs body validation through the real error handler", async () => {
  const res = await app.inject({ method: "POST", url: "/items", body: { name: 123 } })
  expect(res.status).toBe(400)
})

test("maps HTTPError to its status code", async () => {
  const res = await app.inject("/boom")
  expect(res.status).toBe(418)
  expect(await res.text()).toBe("teapot")
})

test("returns 404 for unknown routes", async () => {
  const res = await app.inject("/nope")
  expect(res.status).toBe(404)
})

test("dispatches concurrent requests independently", async () => {
  const results = await Promise.all([
    app.inject("/items/1"),
    app.inject({ method: "POST", url: "/items", body: { name: "Bob" } }),
    app.inject("/boom"),
  ])
  expect(results[0].status).toBe(200)
  expect(await results[0].json()).toEqual({ params: { itemIds: [1] } })
  expect(results[1].status).toBe(200)
  expect(await results[1].json()).toEqual({ created: { name: "Bob" } })
  expect(results[2].status).toBe(418)
})

test("resolves routes registered through a plugin", async () => {
  const plugged = new MarciApp()
  plugged.register((child) => {
    child.get("/health", () => ({ status: "up" }))
  }, { prefix: "/api" })
  const res = await plugged.inject("/api/health")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: "up" })
})

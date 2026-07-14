import { test, expect } from "bun:test"
import { schema } from "compact-json-schema"
import { Router, HTTPError } from "../src"

// Task 3 — onResponse lifecycle hook.

const build = () => {
  const seen: number[] = []
  const app = new Router()
  app.addHook("onResponse", (_req, res) => { seen.push(res.status) })

  app.get("/ok", () => ({ ok: true }))
  app.get("/http", () => { throw new HTTPError("nope", 403) })
  app.post("/validate", { body: schema({ name: "string" }) }, () => ({ ok: true }))
  return { app, seen }
}

test("fires with 200 for a normal handler", async () => {
  const { app, seen } = build()
  await app.inject("/ok")
  expect(seen).toEqual([200])
})

test("fires with the HTTPError status", async () => {
  const { app, seen } = build()
  await app.inject("/http")
  expect(seen).toEqual([403])
})

test("fires with 400 for a validation failure", async () => {
  const { app, seen } = build()
  await app.inject({ method: "POST", url: "/validate", body: { name: 1 } })
  expect(seen).toEqual([400])
})

test("fires with 404 for a not-found route", async () => {
  const { app, seen } = build()
  await app.inject("/nope")
  expect(seen).toEqual([404])
})

test("a throwing onResponse hook does not change the returned response", async () => {
  const app = new Router()
  app.addHook("onResponse", () => { throw new Error("hook boom") })
  app.get("/ok", () => ({ ok: true }))

  const res = await app.inject("/ok")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})

test("fires for routes mounted through register() at the root", async () => {
  const seen: string[] = []
  const app = new Router()
  app.addHook("onResponse", (req, res) => { seen.push(`${new URL(req.raw.url).pathname}:${res.status}`) })
  app.register((child) => {
    child.get("/deep", () => ({ ok: true }))
  }, { prefix: "/c" })

  await app.inject("/c/deep")
  expect(seen).toEqual(["/c/deep:200"])
})

test("latency: a start time stamped in onRequest is readable in onResponse", async () => {
  let measured = -1
  const app = new Router<{ startedAt?: number }>()
  app.addHook("onRequest", (req) => { req.startedAt = 1000 })
  app.addHook("onResponse", (req) => { measured = (req.startedAt ?? -1) })
  app.get("/ok", () => ({ ok: true }))

  await app.inject("/ok")
  expect(measured).toBe(1000)
})

test("interaction: onResponse sees the status of a response mapped by a custom error handler", async () => {
  const seen: number[] = []
  const app = new Router()
  app.setErrorHandler(() => Response.json({ e: true }, { status: 451 }))
  app.addHook("onResponse", (_req, res) => { seen.push(res.status) })
  app.get("/boom", () => { throw new Error("x") })

  const res = await app.inject("/boom")
  expect(res.status).toBe(451)
  expect(seen).toEqual([451])
})

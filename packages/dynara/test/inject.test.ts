import { test, expect } from "bun:test"
import { schema } from "compact-json-schema"
import { Router, HTTPError } from "../src"

const app = new Router()

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
  const plugged = new Router()
  plugged.register((child) => {
    child.get("/health", () => ({ status: "up" }))
  }, { prefix: "/api" })
  const res = await plugged.inject("/api/health")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: "up" })
})

// --- date type: decoded into a JS Date before the handler runs ---

const eventSchema = schema({ title: "string", startsAt: "date", endsAt: "date??" })
app.post("/events", { body: eventSchema }, (req) => {
  return {
    isDate: req.body.startsAt instanceof Date,
    startsAt: req.body.startsAt.toISOString(),
    endsAt: req.body.endsAt ?? null,
  }
})

test("decodes an ISO date string body field into a Date", async () => {
  const res = await app.inject({ method: "POST", url: "/events", body: { title: "Demo", startsAt: "2020-01-02T03:04:05.000Z" } })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ isDate: true, startsAt: "2020-01-02T03:04:05.000Z", endsAt: null })
})

test("decodes a date-only string and epoch milliseconds", async () => {
  const res = await app.inject({ method: "POST", url: "/events", body: { title: "Demo", startsAt: "2020-01-02", endsAt: 1577934245000 } })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.isDate).toBe(true)
  expect(body.endsAt).toBe("2020-01-02T03:04:05.000Z")
})

test("accepts null for a nullable date and omission of an optional one", async () => {
  const res = await app.inject({ method: "POST", url: "/events", body: { title: "Demo", startsAt: "2020-01-02", endsAt: null } })
  expect(res.status).toBe(200)
  expect((await res.json()).endsAt).toBeNull()
})

test("rejects a malformed date string", async () => {
  const res = await app.inject({ method: "POST", url: "/events", body: { title: "Demo", startsAt: "not-a-date" } })
  expect(res.status).toBe(400)
  const err = await res.json()
  expect(err.fields.startsAt).toBeDefined()
})

test("parses a date query param into a Date", async () => {
  const app2 = new Router()
  app2.get("/since", [{}, schema({ from: "date?" })], (req) => ({
    isDate: (req.query as any).from instanceof Date,
  }))
  const res = await app2.inject("/since?from=2021-05-01")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ isDate: true })
})

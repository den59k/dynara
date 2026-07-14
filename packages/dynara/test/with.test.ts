import { test, expect } from "bun:test"
import { schema } from "compact-json-schema"
import { Router, HTTPError, dynara } from "../src"

// Task 4 — per-route app.with(plugin) guard.

type Auth = { auth: { userId: number } }

const useAuth = (app: Router<Auth>) => {
  app.addHook("onRequest", (req) => {
    const token = req.raw.headers.get("authorization")
    if (!token) throw new HTTPError("Unauthorized", 401)
    req.auth = { userId: Number(token) }
  })
}

type Role = { role: string }
const useRole = (app: Router<Auth & Role>) => {
  app.addHook("onRequest", (req) => { req.role = req.auth.userId === 1 ? "admin" : "user" })
}

test("with(useAuth) guards only its own route; a sibling stays open", async () => {
  const app = new Router()
  app.with(useAuth).get("/me", (req) => ({ userId: req.auth.userId }))
  app.get("/public", () => ({ open: true }))

  const noToken = await app.inject("/me")
  expect(noToken.status).toBe(401)

  const withToken = await app.inject({ url: "/me", headers: { authorization: "7" } })
  expect(withToken.status).toBe(200)
  expect(await withToken.json()).toEqual({ userId: 7 })

  const pub = await app.inject("/public")
  expect(pub.status).toBe(200)
  expect(await pub.json()).toEqual({ open: true })
})

test("with is one-shot: a later plain route does not inherit the guard", async () => {
  const app = new Router()
  app.with(useAuth).get("/guarded", (req) => ({ userId: req.auth.userId }))
  app.get("/after", () => ({ ok: true }))

  expect((await app.inject("/guarded")).status).toBe(401)
  expect((await app.inject("/after")).status).toBe(200)
})

test("with(a).with(b) composes both hooks and both contexts in order", async () => {
  const app = new Router()
  app.with(useAuth).with(useRole).get("/me", (req) => ({ userId: req.auth.userId, role: req.role }))

  const res = await app.inject({ url: "/me", headers: { authorization: "1" } })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ userId: 1, role: "admin" })

  expect((await app.inject("/me")).status).toBe(401)
})

test("with works with schema options: typed body + params alongside the guard", async () => {
  const app = new Router()
  app.with(useAuth).post("/orgs/:id", { params: schema({ id: "number" }), body: schema({ name: "string" }) }, (req) => ({
    id: req.params.id,
    name: req.body.name,
    userId: req.auth.userId,
  }))

  const ok = await app.inject({ method: "POST", url: "/orgs/9", body: { name: "Acme" }, headers: { authorization: "3" } })
  expect(ok.status).toBe(200)
  expect(await ok.json()).toEqual({ id: 9, name: "Acme", userId: 3 })

  // guard runs before body validation
  const unauth = await app.inject({ method: "POST", url: "/orgs/9", body: { name: "Acme" } })
  expect(unauth.status).toBe(401)
})

test("with-guards run after group-level (.use / propagated) hooks", async () => {
  const order: string[] = []
  const app = new Router()
  app.addHook("onRequest", () => { order.push("group") })
  const guard = (a: Router) => { a.addHook("onRequest", () => { order.push("with") }) }
  app.with(guard).get("/x", () => { order.push("handler"); return { ok: true } })

  await app.inject("/x")
  expect(order).toEqual(["group", "with", "handler"])
})

test("the same plugin works at group level (.use) and route level (.with)", async () => {
  const app = new Router()
  // group level through the dynara builder
  const guarded = dynara<Auth>().use(useAuth).routes((r) => {
    r.get("/group-me", (req) => ({ userId: req.auth.userId }))
  })
  app.register(guarded, { prefix: "/g" })
  // route level
  app.with(useAuth).get("/me", (req) => ({ userId: req.auth.userId }))

  expect((await app.inject("/g/group-me")).status).toBe(401)
  expect((await app.inject({ url: "/g/group-me", headers: { authorization: "2" } })).status).toBe(200)
  expect((await app.inject("/me")).status).toBe(401)
  expect((await app.inject({ url: "/me", headers: { authorization: "2" } })).status).toBe(200)
})

test("with fires onResponse too (interaction with Task 3)", async () => {
  const seen: number[] = []
  const app = new Router()
  app.addHook("onResponse", (_req, res) => { seen.push(res.status) })
  app.with(useAuth).get("/me", (req) => ({ userId: req.auth.userId }))

  await app.inject("/me") // 401
  await app.inject({ url: "/me", headers: { authorization: "5" } }) // 200
  expect(seen).toEqual([401, 200])
})

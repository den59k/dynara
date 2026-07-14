import { test, expect } from "bun:test"
import { Router } from "../src"

// Task 1 — onRequest hooks propagate from the root down into register() children.

test("a root onRequest hook runs for routes mounted via register()", async () => {
  const app = new Router()
  app.addHook("onRequest", (req) => { (req as any).marked = true })
  app.register((r) => r.get("/x", (req) => ({ marked: (req as any).marked ?? false })), { prefix: "/api" })

  const res = await app.inject("/api/x")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ marked: true })
})

test("propagates through nested register() in root -> child -> grandchild order", async () => {
  const order: string[] = []
  const app = new Router()
  app.addHook("onRequest", () => { order.push("root") })
  app.register((child) => {
    child.addHook("onRequest", () => { order.push("child") })
    child.register((grand) => {
      grand.addHook("onRequest", () => { order.push("grand") })
      grand.get("/deep", () => ({ ok: true }))
    }, { prefix: "/g" })
  }, { prefix: "/c" })

  const res = await app.inject("/c/g/deep")
  expect(res.status).toBe(200)
  expect(order).toEqual(["root", "child", "grand"])
})

test("a hook added inside a child does not run for a sibling child or root routes", async () => {
  const app = new Router()
  app.get("/root", (req) => ({ hit: (req as any).hit ?? "none" }))

  app.register((a) => {
    a.addHook("onRequest", (req) => { (req as any).hit = "a" })
    a.get("/a", (req) => ({ hit: (req as any).hit ?? "none" }))
  }, { prefix: "/a" })

  app.register((b) => {
    b.get("/b", (req) => ({ hit: (req as any).hit ?? "none" }))
  }, { prefix: "/b" })

  expect(await (await app.inject("/a/a")).json()).toEqual({ hit: "a" })
  expect(await (await app.inject("/b/b")).json()).toEqual({ hit: "none" })
  expect(await (await app.inject("/root")).json()).toEqual({ hit: "none" })
})

test("hooks run outermost first: root before child", async () => {
  const order: string[] = []
  const app = new Router()
  app.addHook("onRequest", () => { order.push("root") })
  app.register((child) => {
    child.addHook("onRequest", () => { order.push("child") })
    child.get("/x", () => ({ ok: true }))
  }, { prefix: "/c" })

  await app.inject("/c/x")
  expect(order).toEqual(["root", "child"])
})

test("a parent hook that throws short-circuits the child route", async () => {
  let handlerRan = false
  const app = new Router()
  app.addHook("onRequest", () => { throw new Error("blocked") })
  app.register((child) => {
    child.get("/x", () => { handlerRan = true; return { ok: true } })
  }, { prefix: "/c" })

  const res = await app.inject("/c/x")
  expect(res.status).toBe(500)
  expect(handlerRan).toBe(false)
})

test("a hook added to the root AFTER register() still applies to child routes", async () => {
  const app = new Router()
  app.register((child) => {
    child.get("/x", (req) => ({ marked: (req as any).marked ?? false }))
  }, { prefix: "/c" })
  // added after the child route was declared
  app.addHook("onRequest", (req) => { (req as any).marked = true })

  expect(await (await app.inject("/c/x")).json()).toEqual({ marked: true })
})

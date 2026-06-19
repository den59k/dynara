import { test, expect, afterAll } from "bun:test"
import { schema } from "compact-json-schema"
import { MarciApp, HTTPError } from "../src"

// Guards that the in-process matcher used by `inject()` stays byte-for-byte
// identical to Bun's real router. If a future Bun version changes its routing
// semantics, this test catches the drift.

const build = () => {
  const app = new MarciApp()
  app.get("/", () => ({ root: true }))
  app.get("/items/all", () => ({ all: true }))
  app.get("/items/:itemIds", [{ itemIds: { type: "array", items: "number" } }], (r) => ({ params: r.params }))
  app.get("/users/:id", [{ id: "number" }], (r) => ({ id: r.params.id }))
  app.get("/users/:id/posts/:postId", [{ id: "number", postId: "number" }], (r) => ({ p: r.params }))
  app.get("/files/*", () => ({ wild: true }))
  app.get("/search", [{}, schema({ raw: "boolean" })], (r) => ({ query: r.query }))
  app.post("/items", { body: schema({ name: "string" }) }, (r) => ({ created: r.body }))
  app.get("/boom", () => { throw new HTTPError("teapot", 418) })
  return app
}

const cases: Array<{ method?: string, url: string, body?: any }> = [
  { url: "/" },
  { url: "/items/all" },                                   // static beats :itemIds
  { url: "/items/1,2,3" },
  { url: "/users/42" },
  { url: "/users/42/posts/7" },
  { url: "/files/a/b/c" },                                 // multi-segment wildcard
  { url: "/files" },                                       // wildcard needs >= 1 segment -> 404
  { url: "/files/" },
  { url: "/users/42/" },                                   // trailing slash -> 404
  { url: "/search?raw=true" },
  { url: "/nope/nope" },                                   // unknown -> 404
  { method: "POST", url: "/items", body: { name: "X" } },
  { method: "POST", url: "/items", body: { name: 123 } },  // validation -> 400
  { method: "DELETE", url: "/users/42" },                  // wrong method -> 404
  { url: "/boom" },                                        // error handler -> 418
]

const injectApp = build()
const realApp = build()
const server = await realApp.listen(0)
afterAll(() => server.stop(true))

test.each(cases)("inject matches the real Bun router: $method $url", async (c) => {
  const method = c.method ?? "GET"
  const init: any = { method }
  if (c.body !== undefined) {
    init.body = JSON.stringify(c.body)
    init.headers = { "content-type": "application/json" }
  }

  const injected = await injectApp.inject(c.body !== undefined ? { method, url: c.url, body: c.body } : { method, url: c.url })
  const real = await fetch(new URL(c.url, server.url), init)

  expect(injected.status).toBe(real.status)
  expect(await injected.text()).toBe(await real.text())
})

import { test, expect } from "bun:test"
import { Router } from "../src"

// Type-level checks for Task 4. These assert at compile time (bunx tsc --noEmit)
// that `.with()` contributes context to the guarded handler and that unguarded
// handlers do NOT see it. The runtime body is trivial — the value is in tsc.

type Auth = { auth: { userId: number } }
const useAuth = (app: Router<Auth>) => {
  app.addHook("onRequest", (req) => { req.auth = { userId: 1 } })
}

test("with-guarded handlers see req.auth; unguarded do not", () => {
  const app = new Router()

  app.with(useAuth).get("/me", (req) => {
    const id: number = req.auth.userId // typed present
    return { id }
  })

  app.get("/public", (req) => {
    // @ts-expect-error auth is not part of the context here
    req.auth
    return { ok: true }
  })

  expect(true).toBe(true)
})

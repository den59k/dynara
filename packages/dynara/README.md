# Dynara

[![NPM version](https://img.shields.io/npm/v/dynara)](https://www.npmjs.com/package/dynara)

An extremely simple HTTP framework for Bun — practically a typed wrapper around `Bun.serve`, with Fastify-style routing and fast schema validation. Made for people switching over from Fastify.

- **Bun only** — Node.js and Deno are not supported.
- **Minimal overhead** — routing is delegated to Bun's native router.
- **Typed validation** — powered by [TypeBox](https://www.npmjs.com/package/@sinclair/typebox), written with the compact [compact-json-schema](https://www.npmjs.com/package/compact-json-schema) syntax.

## Install

```sh
bun add dynara
```

## Quick start

```ts
import { Router } from 'dynara'

const app = new Router()

app.get('/', () => {
  return { hello: 'world' }
})

app.listen(3000)
```

A handler may return a plain value (sent as JSON), a `Response` (sent as-is), or `undefined` (an empty `200`).

## Routes & validation

Routes use Bun's native patterns — `:param` for a single segment, `*` for a wildcard. The methods are `get`, `post`, `put`, `patch`, and `delete`.

Schemas are written with [compact-json-schema](https://www.npmjs.com/package/compact-json-schema) and validated with TypeBox. Pass them as a route-option object, or as a positional array — `[params]` / `[params, query]` for `GET`, `[params, body, query]` for the others. Validated `req.params`, `req.query`, and `req.body` are fully typed.

```ts
import { schema } from 'compact-json-schema'

const params = schema({ id: 'number' })
const body = schema({ name: 'string', age: 'number?' }) // ? optional, ?? nullable

// Option object
app.post('/users/:id', { params, body }, (req) => {
  req.params.id   // number
  req.body.name   // string
  return { ok: true }
})

// Positional array
app.get('/users/:id', [params], (req) => {
  return { id: req.params.id } // number
})
```

A few conveniences:

- **Array params** are comma-split: `GET /items/1,2,3` with `{ itemIds: { type: 'array', items: 'number' } }` yields `[1, 2, 3]`.
- **Query booleans** accept `?flag=true` or a bare `?flag`.
- **Dates**: a `"date"` field accepts an ISO-8601 string (`"2020-01-02"`, optionally with a time part) or epoch milliseconds, and is decoded into a JS `Date` before your handler runs — `req.body.startsAt instanceof Date`. Works in bodies, query strings, and params; `"date?"` / `"date??"` behave like every other type.
- `req.raw` exposes the underlying `BunRequest`, and `req.server` the Bun `Server`.

```ts
const event = schema({ title: 'string', startsAt: 'date', endsAt: 'date??' })
app.post('/events', { body: event }, (req) => {
  return { day: req.body.startsAt.getDay() } // startsAt is a Date
})
```

## Hooks

```ts
app.addHook('onRequest', (req) => {
  // runs before every handler; throw to short-circuit the request
})

app.addHook('onResponse', (req, res) => {
  // runs after the response is produced (incl. errors and 404s); observational
  console.log(`${req.raw.method} ${new URL(req.raw.url).pathname} -> ${res.status}`)
})

app.addHook('onListen', (server) => {
  console.log(`Listening on ${server.url}`)
})
```

`onRequest` runs before body parsing/validation; throwing short-circuits into the
error handler. `onResponse` runs after a `Response` exists — from a handler, an
error, or a 404 — and can read `res.status` / `res.headers`. It is observational:
its return value is ignored, and a throw is logged but never changes the response.

**Hooks propagate into `register()` children.** A hook added on the root (or any
ancestor) runs for every route mounted under it, outermost→innermost, before the
child's own hooks — so a root-level `onRequest` for auth/request-id/logging
applies everywhere. Encapsulation stays one-directional: a hook added *inside* a
child never affects the parent or sibling routers.

```ts
app.addHook('onRequest', (req) => { req.requestId = crypto.randomUUID() })
app.register((api) => {
  api.get('/health', (req) => ({ id: req.requestId })) // sees the root hook
}, { prefix: '/api' })
```

### Latency timing

There is no built-in timing API — stamp a start time in `onRequest` and read it
back in `onResponse`. Type the app's context so the field is available on `req`:

```ts
const app = new Router<{ startedAt?: number }>()
app.addHook('onRequest', (req) => { req.startedAt = performance.now() })
app.addHook('onResponse', (req, res) => {
  console.log(`${res.status} in ${performance.now() - (req.startedAt ?? 0)}ms`)
})
```

## Plugins & context

`register` mounts a group of routes under a prefix. Type the app with a context type to share data attached by hooks:

```ts
type Ctx = { user: { id: number } }

app.register((users: Router<Ctx>) => {
  users.addHook('onRequest', (req) => { req.user = { id: 1 } })
  users.get('/me', (req) => req.user)
}, { prefix: '/users' })
```

For composable, reusable plugins there is the `dynara()` builder. `use` adds plugins, `routes` adds handlers, and the result can be passed to `register`:

```ts
import { dynara, Router } from 'dynara'

const useAuth = (app: Router<Ctx>) => {
  app.addHook('onRequest', (req) => { req.user = { id: 1 } })
}

const users = dynara<Ctx>()
  .use(useAuth)
  .routes((app) => {
    app.get('/me', (req) => req.user)
  })

app.register(users, { prefix: '/users' })
```

### Per-route guards with `.with()`

To guard a *single* route without wrapping it in a whole sub-group, use
`app.with(plugin)`. It takes the same plugin shape as `.use()`, so the same guard
works at both group level (`.use()`) and route level (`.with()`). It is
type-contributing — whatever the plugin guarantees on `req` (e.g. `req.auth`) is
typed as present in the handler — and one-shot: the guard applies only to the
single route method called on the scope. Chain `.with(a).with(b)` to compose.

```ts
const useAuth = (app: Router<{ auth: { userId: number } }>) => {
  app.addHook('onRequest', (req) => {
    const token = req.raw.headers.get('authorization')
    if (!token) throw new HTTPError('Unauthorized', 401)
    req.auth = { userId: Number(token) }
  })
}

export default dynara().routes((app) => {
  app.post('/request-code', { body }, handler)                    // public
  app.post('/verify', { body }, handler)                          // public
  app.with(useAuth).post('/complete-profile', { body }, handler)  // guarded — req.auth guaranteed
  app.with(useAuth).get('/me', (req) => req.auth)                 // guarded
})
```

Guards run in the `onRequest` phase — after group-level / propagated parent hooks
and before body validation.

## Errors

Throw `HTTPError` to send an explicit status code; validation failures are turned into `400` responses automatically.

```ts
import { HTTPError } from 'dynara'

app.get('/secret', () => {
  throw new HTTPError('Forbidden', 403)        // text body
  // throw new HTTPError({ reason: 'forbidden' }, 403)  // JSON body
})
```

### Custom error handler

Install an app-global handler with `setErrorHandler` to control the error
envelope, hide internals in production, or forward errors to Sentry. It receives
the raw error (so it can special-case `HTTPError` / validation errors) plus the
request, and returns the `Response`. Every error from a hook or handler flows
through it, including `register()` children. If the handler itself throws, dynara
falls back to the built-in mapping and never crashes.

```ts
import { HTTPError, isValidationError } from 'dynara'

app.setErrorHandler((err, req) => {
  if (err instanceof HTTPError) {
    return Response.json({ error: err.message }, { status: err.statusCode })
  }
  if (isValidationError(err)) {
    return Response.json({ error: 'Invalid input' }, { status: 400 })
  }
  Sentry.captureException(err)
  return Response.json({ error: 'Internal error' }, { status: 500 })
})
```

## Testing

`inject()` dispatches a request through your routes in-process — no server, no socket — and returns a real `Response`. It reuses the same routing, validation, and error handling as a live server.

```ts
import { test, expect } from 'bun:test'

test('returns a user', async () => {
  const res = await app.inject('/users/1')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ id: 1 })
})

// With a body:
await app.inject({ method: 'POST', url: '/users', body: { name: 'Alice' } })
```

> Under `inject()` there is no Bun `Server`, so `req.server` is `undefined` and WebSocket upgrades are not exercised.

## WebSockets

```ts
app.registerWsHandler('/ws', {
  open(ws) { ws.send('hello') },
  message(ws, msg) { ws.send(msg) },
})
```

## Changelog

### Unreleased

- **Breaking (pre-1.0): `onRequest` hooks now propagate into `register()` children.**
  Previously a hook added on the root did **not** run for routes mounted under a
  prefixed sub-router. Now ancestor hooks run for descendant routes
  (outermost→innermost), matching Fastify. Hooks added inside a child remain
  scoped to that child and its descendants — they never affect a parent or
  sibling. If you relied on root hooks *not* applying to a sub-router, move that
  hook into the specific child instead.
- **New:** `Router.setErrorHandler(handler)` for a custom, app-global error
  response, plus the `isValidationError(err)` type guard.
- **New:** `onResponse` lifecycle hook, fired for every produced response
  (including errors and 404s).
- **New:** `Router.with(plugin)` for a type-contributing per-route guard that
  reuses the `.use()` plugin shape.

## License

MIT

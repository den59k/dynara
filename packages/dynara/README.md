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

app.addHook('onListen', (server) => {
  console.log(`Listening on ${server.url}`)
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

## Errors

Throw `HTTPError` to send an explicit status code; validation failures are turned into `400` responses automatically.

```ts
import { HTTPError } from 'dynara'

app.get('/secret', () => {
  throw new HTTPError('Forbidden', 403)        // text body
  // throw new HTTPError({ reason: 'forbidden' }, 403)  // JSON body
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

## License

MIT

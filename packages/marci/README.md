# Marci

[![NPM version](https://img.shields.io/npm/v/%40den59k%2Fmarci)](https://www.npmjs.com/package/@den59k/marci)

An extremely simple HTTP framework (practically a wrapper for `Bun.serve`) for those who are also switching from Fastify

Works with only Bun (NodeJS and Deno are not supported)

## Features

* Minimal overhead as much as possible

* Fastify style routing

* Fast validation (powered by [typebox](https://www.npmjs.com/package/@sinclair/typebox), but writing with [compact-json-schema](https://www.npmjs.com/package/compact-json-schema))

## Using

```

import { MarciApp } from '@den59k/marci'
import usersRoutes from './usersRoutes'

const app = new MarciApp()

app.get("/api/", (req) => {
  return { hello: 'world' }
})

app.register(userRoutes, { prefix: "/users" })

```

```
// usersRoutes.ts
import { schema } from 'compact-json-schema'

type UserContext = {
  user: { id: number }
}

export const useAuth = (ctx: MarciRequest<UserContext>) => {
  ctx.user = { id: 2 }
}

export default async (app: MarciApp<UserContext>) => {
  app.addHook("onRequest", useAuth)

  /** Get me info */
  app.get("/me", () => {
    return ctx.user
  })

  const userParams = schema({ userId: "number" })
  /** Get user by ID */
  app.get("/:userId", [userParams], (req) => {
    return { id: req.params.userId }
  })

  const createUserPost = schema({ text: "string" })
  /** Create new user post */
  app.post("/:userId/post", { params: userParams, body: createUserPost }, (req) => {
    
    return { userId: req.params.userId, post: req.body }
  })

}

```
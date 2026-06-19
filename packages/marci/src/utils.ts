import { Type } from "@sinclair/typebox"
import type { TypeCheck } from "@sinclair/typebox/compiler"
import type { BunRequest } from "bun"
import { type SchemaItem, provideTypeBoxMap } from "compact-json-schema"
import type { RouteOptions } from "./common"
import { HTTPError, ValidationError } from "./error"

export type GetOptionsFromSchemaList <T extends readonly SchemaItem[]> = 
  T extends [SchemaItem]? { params: T[0] }: 
  T extends [SchemaItem, SchemaItem]? { params: T[0], query: T[1] }: 
  {}

export type PostOptionsFromSchemaList <T extends readonly SchemaItem[]> = 
  T extends [SchemaItem]? { params: T[0] }: 
  T extends [SchemaItem, SchemaItem]? { params: T[0], body: T[1] }: 
  {}

export const getRouteOptions = (method: string, schemas: SchemaItem[]): RouteOptions => {
  if (schemas.length === 0) return {}
  if (schemas.length === 1) {
    return { params: schemas[0] }
  }
  if (method === "GET") {
    return { params: schemas[0], query: schemas[1] }
  } else {
    if (schemas.length === 2) {
      return { params: schemas[0], body: schemas[1] }
    } else {
      return { params: schemas[0], body: schemas[1], query: schemas[2] }
    }
  }
}

export const getValidationError = (obj: any, step?: string): string => {
  if (step) {
    return `{"cause":"Validation error","where":"${step}","fields":{"${obj.path.slice(1)}":{"message":"${obj.message}"}}}`
  } else {
    return `{"cause":"Validation error","fields":{"${obj.path.slice(1)}":{"message":"${obj.message}"}}}`
  }
}

provideTypeBoxMap({
  string: Type.String,
  boolean: Type.Boolean,
  number: Type.Number,
  integer: Type.Integer,
  object: Type.Object,
  array: Type.Array,
  bigint: Type.BigInt,
  union: Type.Union,
  null: Type.Null,
  literal: Type.Literal,
  optional: Type.Optional,
  any: Type.Any,
})

export const isDefault = (schema: SchemaItem): boolean => {
  if (typeof schema !== "object" || schema === null) return true
  for (let value of Object.values(schema)) {
    if (value !== "string" && value !== "string?" && value !== "string??") {
      return false
    }
  }
  return true
}

export const parseBody = (schema: TypeCheck<any>, req: BunRequest): Promise<any> => {
  return new Promise((res, rej) => {
    req.json()
      .catch((e: any) => {
        rej(new HTTPError(`Error on parsing body (${e.message})`, 400))
      })
      .then((resp) => {
        const check = schema.Check(resp)
        if (!check) {
          const error = schema.Errors(resp).First()
          const err = new ValidationError(error, "body")
          rej(err)
        }
        res(resp)
      })
  })
}

type RouteHandler = (req: any) => any

const matchSegments = (pattern: string, segments: string[]): Record<string, string> | null => {
  const patternSegments = pattern.split("/")
  const params: Record<string, string> = {}
  for (let i = 0; i < patternSegments.length; i++) {
    const part = patternSegments[i]
    if (i >= segments.length) return null
    if (part === "*") {
      // Wildcard consumes the rest of the path (at least one segment); Bun does
      // not surface it in params
      return params
    }
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(segments[i])
    } else if (part !== segments[i]) {
      return null
    }
  }
  return segments.length === patternSegments.length? params: null
}

const scorePattern = (pattern: string): number => {
  let score = 0
  for (const part of pattern.split("/")) {
    if (part === "*") score -= 1000
    else if (part.startsWith(":")) score += 1
    else score += 10
  }
  return score
}

/**
 * Finds the route registered for `pathname`+`method`, mirroring Bun's matching
 * precedence (static > parameter > wildcard). Returns the handler and the
 * extracted params, or null when nothing matches. Used by `inject()` to route
 * requests in-process without a server.
 */
export const matchRoute = (routes: Record<string, any>, method: string, pathname: string): { handler: RouteHandler, params: Record<string, string> } | null => {
  const segments = pathname.split("/")
  let best: { handler: RouteHandler, params: Record<string, string> } | null = null
  let bestScore = -Infinity
  for (const pattern in routes) {
    const methods = routes[pattern]
    if (!methods || typeof methods[method] !== "function") continue
    const params = matchSegments(pattern, segments)
    if (params === null) continue
    const score = scorePattern(pattern)
    if (score > bestScore) {
      bestScore = score
      best = { handler: methods[method], params }
    }
  }
  return best
}

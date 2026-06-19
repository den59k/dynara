import { Value } from "@sinclair/typebox/value"
import type { BunRequest, Server } from "bun"
import type { SchemaType } from "compact-json-schema"
import type { RouteOptions } from "./common"

export class MarciRequestInternal<T extends RouteOptions = {}> {

  server: Server
  raw: BunRequest
  params: T["params"] extends object? SchemaType<T["params"]>: unknown
  query: T["query"] extends object? SchemaType<T["query"]>: unknown
  body: T["body"] extends object? SchemaType<T["body"]>: unknown = null as any

  constructor(req: BunRequest, server: Server, paramsSchema: any, querySchema: any) {
    if (paramsSchema && paramsSchema.arrayKeys) {
      const params = req.params as any
      for (let key of paramsSchema.arrayKeys) {
        if (params[key] && !params[key].startsWith('[')) {
          params[key] = params[key].split(",")
        }
      }
      this.params = Value.Parse(paramsSchema, params) as any
    } else {
      this.params = paramsSchema === null? req.params: Value.Parse(paramsSchema, req.params) as any
    }

    if (req.url.includes("?")) {
      const queryParams = new URL(req.url).searchParams
      if (querySchema && querySchema.type === "object") {
        const query = {} as any
        for (let [key, value] of queryParams.entries()) {
          const schema = querySchema.properties[key]
          if (!schema) continue
          if (schema.type === "boolean" && value === "") {
            query[key] = true
            continue
          }
          query[key] = Value.Parse(schema, value)
        }
        this.query = query
      } else {
        this.query = Object.fromEntries(queryParams.entries()) as any
      }
    } else if (querySchema) {
      this.query = Value.Parse(querySchema, {})
    } else {
      this.query = null as any
    }

    this.raw = req
    this.server = server
  }
}
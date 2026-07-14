import { Value } from "@sinclair/typebox/value"
import type { BunRequest, Server } from "bun"
import type { SchemaType } from "compact-json-schema"
import type { RouteOptions } from "./common"

export class DynaraRequestInternal<T extends RouteOptions = {}> {

  server: Server
  raw: BunRequest
  params: T["params"] extends object? SchemaType<T["params"]>: unknown = undefined as any
  query: T["query"] extends object? SchemaType<T["query"]>: unknown = undefined as any
  body: T["body"] extends object? SchemaType<T["body"]>: unknown = null as any

  private paramsSchema: any
  private querySchema: any

  constructor(req: BunRequest, server: Server, paramsSchema: any, querySchema: any) {
    this.raw = req
    this.server = server
    this.paramsSchema = paramsSchema
    this.querySchema = querySchema
  }

  /**
   * Parses `params` and `query` off the raw request against their schemas. Kept
   * separate from the constructor so the request object always exists (even when
   * validation throws), which lets the error handler and `onResponse` hooks run
   * with a real request. May throw a TypeBox validation error.
   */
  parse(): void {
    const req = this.raw
    const paramsSchema = this.paramsSchema
    const querySchema = this.querySchema

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
  }
}

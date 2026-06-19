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

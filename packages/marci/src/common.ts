import type { BunRequest, Server } from "bun";
import type { SchemaItem, SchemaType } from "compact-json-schema";

export type RouteOptions = {
  params?: SchemaItem,
  body?: SchemaItem,
  query?: SchemaItem,
}

export type GetRouteOptions = {
  params?: SchemaItem,
  query?: SchemaItem,
}

export interface MarciContext {
  
}

export type MarciRequest<R extends object = {}, T extends RouteOptions = {}> = MarciContext & R & {
  params: T["params"] extends object? SchemaType<T["params"]>: unknown
  query: T["query"] extends object? SchemaType<T["query"]>: unknown
  body: T["body"] extends object? SchemaType<T["body"]>: unknown
  raw: BunRequest
  server: Server
}

export type GetMarciRequest<R extends object = {}, T extends GetRouteOptions = {}> = MarciContext & R & {
  params: T["params"] extends object? SchemaType<T["params"]>: unknown
  query: T["query"] extends object? SchemaType<T["query"]>: unknown
  raw: BunRequest
  server: Server
}

export type RouteAction <T extends RouteOptions, R extends object = {}> = (req: MarciRequest<R, T>) => (any | Promise<any>)
export type GetRouteAction <T extends GetRouteOptions, R extends object = {}> = (req: GetMarciRequest<R, T>) => (any | Promise<any>)

export type RegisterPluginOptions = { prefix?: string }
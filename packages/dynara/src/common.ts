import type { BunRequest, Server, HeadersInit, BodyInit } from "bun";
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

export interface DynaraContext {

}

export type DynaraRequest<R extends object = {}, T extends RouteOptions = {}> = DynaraContext & R & {
  params: T["params"] extends object? SchemaType<T["params"]>: unknown
  query: T["query"] extends object? SchemaType<T["query"]>: unknown
  body: T["body"] extends object? SchemaType<T["body"]>: unknown
  raw: BunRequest
  server: Server
}

export type GetDynaraRequest<R extends object = {}, T extends GetRouteOptions = {}> = DynaraContext & R & {
  params: T["params"] extends object? SchemaType<T["params"]>: unknown
  query: T["query"] extends object? SchemaType<T["query"]>: unknown
  raw: BunRequest
  server: Server
}

export type RouteAction <T extends RouteOptions, R extends object = {}> = (req: DynaraRequest<R, T>) => (any | Promise<any>)
export type GetRouteAction <T extends GetRouteOptions, R extends object = {}> = (req: GetDynaraRequest<R, T>) => (any | Promise<any>)

export type RegisterPluginOptions = { prefix?: string }

export type InjectOptions = {
  method?: string,
  url: string,
  headers?: HeadersInit,
  body?: BodyInit | Record<string, any> | null,
}
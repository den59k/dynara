import type { BunRequest, Server, HeadersInit, BodyInit } from "bun";
import type { SchemaItem, SchemaType } from "compact-json-schema";
import type { Router } from "./Router";
import type { GetOptionsFromSchemaList, PostOptionsFromSchemaList } from "./utils";

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

/**
 * A custom error handler installed with `Router.setErrorHandler`. Receives the
 * raw error thrown by any hook or handler (including `HTTPError` and validation
 * errors) plus the request, and returns the `Response` to send.
 */
export type ErrorHandler = (err: unknown, req: DynaraRequest) => Response | Promise<Response>

/**
 * An `onResponse` hook. Runs after a `Response` has been produced (by a handler
 * or the error path), before it is returned. Observational — the return value
 * is ignored, and throwing does not change the outgoing response.
 */
export type OnResponseHook<R extends object = {}> = (req: DynaraRequest<R>, res: Response) => void | Promise<void>

/**
 * The one-shot route builder returned by `Router.with(plugin)`. Exposes only the
 * route methods plus `with` (for chaining); the collected `onRequest` hooks apply
 * to the single route declared on it. `with` contributes context like `.use()`.
 */
export interface RouteScope<R extends object = {}> {
  with<S extends object = {}>(plugin: (app: Router<R & S>) => void | Promise<void>): RouteScope<R & S>

  get(path: string, callback: GetRouteAction<{}, R>): void
  get<T extends GetRouteOptions>(path: string, options: T, callback: GetRouteAction<T, R>): void
  get<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: GetRouteAction<GetOptionsFromSchemaList<T>, R>): void

  post(path: string, callback: RouteAction<{}, R>): void
  post<T extends RouteOptions>(path: string, options: T, callback: RouteAction<T, R>): void
  post<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: RouteAction<PostOptionsFromSchemaList<T>, R>): void

  put(path: string, callback: RouteAction<{}, R>): void
  put<T extends RouteOptions>(path: string, options: T, callback: RouteAction<T, R>): void
  put<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: RouteAction<PostOptionsFromSchemaList<T>, R>): void

  patch(path: string, callback: RouteAction<{}, R>): void
  patch<T extends RouteOptions>(path: string, options: T, callback: RouteAction<T, R>): void
  patch<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: RouteAction<PostOptionsFromSchemaList<T>, R>): void

  delete(path: string, callback: RouteAction<{}, R>): void
  delete<T extends RouteOptions>(path: string, options: T, callback: RouteAction<T, R>): void
  delete<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: RouteAction<PostOptionsFromSchemaList<T>, R>): void
}

export type InjectOptions = {
  method?: string,
  url: string,
  headers?: HeadersInit,
  body?: BodyInit | Record<string, any> | null,
}
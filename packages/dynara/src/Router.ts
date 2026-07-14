import type { BunRequest, Server, WebSocketHandler } from 'bun'
import { unfoldTypeBoxSchema, type SchemaItem } from 'compact-json-schema'
import { TypeBoxError } from '@sinclair/typebox'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { HTTPError, ValidationError } from './error'
import { DynaraRequestInternal } from './request'
import type { ErrorHandler, GetRouteAction, GetRouteOptions, InjectOptions, DynaraRequest, OnResponseHook, RegisterPluginOptions, RouteAction, RouteOptions, RouteScope } from './common'
import { getRouteOptions, isDefault, parseBody, matchRoute, type GetOptionsFromSchemaList, getValidationError, type PostOptionsFromSchemaList } from './utils'

type Hook = (ctx: any, ...rest: any[]) => (void | Promise<void>)

export class Router<R extends object = {}> {

  private routes: Record<string, any> = {}
  private promises: Promise<void>[] = []
  private prefix = ""
  private root: Router | null = null
  private parent: Router | null = null

  private server!: Server

  private onListenHooks: Array<(ctx: any) => (void | Promise<void>)> = []
  private onRequestHooks: Hook[] = []
  private onResponseHooks: Hook[] = []
  private errorHandler?: ErrorHandler

  /**
   * Collects hooks of one kind from the root down to this router, in
   * outermost→innermost registration order. This is what makes parent hooks
   * propagate into `register()` children (Task 1): a route runs every ancestor's
   * hooks before its own, while hooks added to a child stay scoped to that child.
   */
  private collectHooks(kind: "onRequest" | "onResponse"): Hook[] {
    const chain: Router[] = []
    let cur: Router | null = this
    while (cur) {
      chain.push(cur)
      cur = cur.parent
    }
    const result: Hook[] = []
    for (let i = chain.length - 1; i >= 0; i--) {
      result.push(...(kind === "onRequest"? chain[i].onRequestHooks: chain[i].onResponseHooks))
    }
    return result
  }

  private add(path: string, method: string, _options: RouteOptions | SchemaItem[], callback: RouteAction<any>, withHooks: Hook[] = []) {
    let fullPath = (this.prefix + (path.endsWith("/")? path.slice(0, -1): path)) || "/"
    if (!(fullPath in this.routes)) {
      this.routes[fullPath] = {}
    }

    const options: RouteOptions = Array.isArray(_options)? getRouteOptions(method, _options): _options
    const paramsSchema = (options.params && !isDefault(options.params))? unfoldTypeBoxSchema(options.params): null
    const querySchema = options.query? unfoldTypeBoxSchema(options.query): null
    const bodyValidation = options.body? TypeCompiler.Compile(unfoldTypeBoxSchema(options.body)): null

    if (paramsSchema && paramsSchema.properties) {
      const arrayKeys = Object.entries(paramsSchema.properties).filter((i: any) => i[1].type === 'array').map(i => i[0])
      if (arrayKeys.length > 0) {
        paramsSchema.arrayKeys = arrayKeys
      }
    }

    this.routes[fullPath][method] = async (req: BunRequest) => {
      const request = new DynaraRequestInternal(req, this.root?.server ?? this.server, paramsSchema, querySchema)

      let response: Response
      try {
        request.parse()

        for (const callback of this.collectHooks("onRequest")) {
          await callback(request as any)
        }
        // Route-level `.with()` guards run after group/propagated hooks, before validation.
        for (const callback of withHooks) {
          await callback(request as any)
        }

        const body = bodyValidation === null? undefined: await parseBody(bodyValidation, req)
        request.body = body as any

        const resp = await callback(request as any)
        if (resp === undefined) {
          response = new Response()
        } else if (resp instanceof Response) {
          response = resp
        } else {
          response = Response.json(resp)
        }
      } catch (err) {
        response = await this.resolveError(err, request as any)
      }

      await this.runOnResponse(request as any, response)
      return response
    }
  }

  addHook(where: "onListen", callback: (server: Bun.Server) => void): void
  addHook(where: "onRequest", callback: (ctx: DynaraRequest<R>) => void | Promise<void>): void
  addHook(where: "onResponse", callback: OnResponseHook<R>): void
  addHook(where: "onRequest" | "onResponse" | "onListen", callback: (ctx: any, ...rest: any[]) => void): void {
    if (where === "onRequest") {
      this.onRequestHooks.push(callback)
    } else if (where === "onResponse") {
      this.onResponseHooks.push(callback)
    } else if (where === "onListen") {
      this.onListenHooks.push(callback)
    }
  }

  /**
   * Installs a custom error handler for the whole app (including `register()`
   * children). Any error thrown from a hook or handler — `HTTPError`, a
   * validation failure, or a generic `throw` — is routed to it. If the handler
   * itself throws, dynara falls back to the built-in mapping and never crashes.
   */
  setErrorHandler(handler: ErrorHandler): this {
    (this.root ?? this).errorHandler = handler
    return this
  }

  get(path: string, callback: GetRouteAction<{}, R>): void
  get<T extends GetRouteOptions>(path: string, options: T, callback: GetRouteAction<T, R>): void
  get<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: GetRouteAction<GetOptionsFromSchemaList<T>, R>): void
  get(path: string, ...args: any[]): void {
    if (args.length === 1) {
      this.add(path, "GET", {}, args[0])
    } else {
      this.add(path, "GET", args[0], args[1])
    }
  }
  
  post(path: string, callback: RouteAction<{}, R>): void
  post<T extends RouteOptions>(path: string, options: T, callback: RouteAction<T, R>): void
  post<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: RouteAction<PostOptionsFromSchemaList<T>, R>): void
  post(path: string, ...args: any[]): void {
    if (args.length === 1) {
      this.add(path, "POST", {}, args[0])
    } else {
      this.add(path, "POST", args[0], args[1])
    }
  }

  put(path: string, callback: RouteAction<{}, R>): void
  put<T extends RouteOptions>(path: string, options: T, callback: RouteAction<T, R>): void
  put<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: RouteAction<PostOptionsFromSchemaList<T>, R>): void
  put(path: string, ...args: any[]): void {
    if (args.length === 1) {
      this.add(path, "PUT", {}, args[0])
    } else {
      this.add(path, "PUT", args[0], args[1])
    }
  }

  patch(path: string, callback: RouteAction<{}, R>): void
  patch<T extends RouteOptions>(path: string, options: T, callback: RouteAction<T, R>): void
  patch<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: RouteAction<PostOptionsFromSchemaList<T>, R>): void
  patch(path: string, ...args: any[]): void {
    if (args.length === 1) {
      this.add(path, "PATCH", {}, args[0])
    } else {
      this.add(path, "PATCH", args[0], args[1])
    }
  }

  delete(path: string, callback: RouteAction<{}, R>): void
  delete<T extends RouteOptions>(path: string, options: T, callback: RouteAction<T, R>): void
  delete<T extends readonly SchemaItem[]>(path: string, schemas: [...T], callback: RouteAction<PostOptionsFromSchemaList<T>, R>): void
  delete(path: string, ...args: any[]): void {
    if (args.length === 1) {
      this.add(path, "DELETE", {}, args[0])
    } else {
      this.add(path, "DELETE", args[0], args[1])
    }
  }


  /**
   * Per-route guard. `with(plugin)` applies the same plugin shape as `.use()`
   * against a hook collector and returns a `RouteScope` whose `get`/`post`/…
   * attach the collected `onRequest` hooks to that single route only. Chainable:
   * `.with(a).with(b)` composes both hooks and both context contributions.
   */
  with<S extends object = {}>(plugin: (app: Router<R & S>) => void | Promise<void>): RouteScope<R & S> {
    return this.buildRouteScope(plugin, [])
  }

  private buildRouteScope(plugin: (app: Router<any>) => void | Promise<void>, existing: Hook[]): RouteScope<any> {
    const collector = new Router()
    plugin(collector as any)
    const hooks = [...existing, ...collector.onRequestHooks]
    const router = this

    const addRoute = (path: string, method: string, args: any[]) => {
      if (args.length === 1) {
        router.add(path, method, {}, args[0], hooks)
      } else {
        router.add(path, method, args[0], args[1], hooks)
      }
    }

    return {
      with(nextPlugin: (app: Router<any>) => void | Promise<void>) {
        return router.buildRouteScope(nextPlugin, hooks)
      },
      get: (path: string, ...args: any[]) => addRoute(path, "GET", args),
      post: (path: string, ...args: any[]) => addRoute(path, "POST", args),
      put: (path: string, ...args: any[]) => addRoute(path, "PUT", args),
      patch: (path: string, ...args: any[]) => addRoute(path, "PATCH", args),
      delete: (path: string, ...args: any[]) => addRoute(path, "DELETE", args),
    } as RouteScope<any>
  }

  register(plugin: (app: Router<any>) => void | Promise<void>, options: RegisterPluginOptions = {}): void {
    const app = new Router()

    app.root = this.root ?? this as any
    app.parent = this
    app.routes = this.routes
    app.onListenHooks = this.onListenHooks
    app.prefix = this.prefix + (options.prefix ?? "")

    const resp = plugin(app)
    if (typeof resp === "object") {
      this.promises.push(resp)
    }
  }

  private websocket?: WebSocketHandler<any>
  private websocketPath?: string
  private websocketFetch?: (req: BunRequest) => any

  registerWsHandler<T>(ws: WebSocketHandler<T>): void
  registerWsHandler<T>(path: string, ws: WebSocketHandler<T>): void
  registerWsHandler<T>(onFetch: (req: BunRequest) => any, ws: WebSocketHandler<T>): void
  registerWsHandler<T>(path: string | WebSocketHandler<T> | ((req: BunRequest) => any), ws?: WebSocketHandler<T>): void {
    if (typeof path === "string") {
      this.websocket = ws
      this.websocketPath = path
    } else if (typeof path === "function") {
      this.websocket = ws
      this.websocketFetch = path
    } else {
      this.websocket = path
    }
  }

  private fetch = async (req: BunRequest, server: Server): Promise<Response> => {
    const path = new URL(req.url).pathname
    if ((!this.websocketPath || this.websocketPath.startsWith(path)) && this.websocket) {
      const data = this.websocketFetch? await this.websocketFetch(req): {}
      if (data instanceof Response) {
        return data
      }
      if (server.upgrade(req, { data })) {
        return undefined as any
      }
    }
    return new Response(`Route ${req.method}:${path} not found`, { status: 404 });
  }

  // private notFoundHandler?: (path: string, req: Request, server: Server) => Response | Promise<Response | undefined>
  registerNotFoundHandler(handler: (path: string, req: Request, server: Server) => Response | Promise<Response | undefined>): void {
    this.fetch = async (req, server) => {
      const path = new URL(req.url).pathname
      if ((!this.websocketPath || this.websocketPath.startsWith(path)) && this.websocket) {
        const data = this.websocketFetch? await this.websocketFetch(req): {}
        if (data instanceof Response) {
          return data
        }
        if (server.upgrade(req, { data })) {
          return undefined as any
        }
      }
      const resp = await handler(path, req, server)
      return resp as any
    }
  }

  /**
   * The not-found / websocket entry point, wrapped so `onResponse` hooks also
   * fire for a 404 (or a custom not-found handler's response). Skipped when the
   * underlying fetch performs a websocket upgrade (no Response produced).
   */
  private handleFetch = async (req: BunRequest, server: Server): Promise<Response> => {
    const resp = await this.fetch(req, server)
    if (resp instanceof Response) {
      const request = new DynaraRequestInternal(req, server, null, null)
      await this.runOnResponse(request as any, resp)
    }
    return resp
  }

  async listen(port?: number, hostname?: string): Promise<Bun.Server> {
    if (this.promises.length > 0) {
      await Promise.all(this.promises)
    }
    const server = Bun.serve({
      routes: this.routes,
      port,
      hostname,
      fetch: this.handleFetch as any,
      websocket: this.websocket,
      error: (err) => this.handleError(err),
    })

    this.server = server

    for (const callback of this.onListenHooks) {
      await callback(server)
    }

    return server
  }

  /**
   * Maps a thrown error to a Response, routing through the app's custom
   * `setErrorHandler` when one is installed and falling back to the built-in
   * mapping if none is set or the custom handler itself throws.
   */
  private async resolveError(err: any, request: DynaraRequest<R>): Promise<Response> {
    const handler = (this.root ?? this).errorHandler
    if (handler) {
      try {
        return await handler(err, request as any)
      } catch (secondary) {
        console.error(secondary)
        return this.handleError(err)
      }
    }
    return this.handleError(err)
  }

  /** Runs `onResponse` hooks (root→leaf); a throwing hook is logged, never fatal. */
  private async runOnResponse(request: DynaraRequest<R>, response: Response): Promise<void> {
    for (const callback of this.collectHooks("onResponse")) {
      try {
        await callback(request as any, response)
      } catch (err) {
        console.error(err)
      }
    }
  }

  /** Converts a thrown error into the same Response Bun's `error` handler produces. */
  private handleError(err: any): Response {
    if (err instanceof HTTPError) {
      if (err.data) {
        return Response.json(err.data, { status: err.statusCode })
      }
      return new Response(err.message, { status: err.statusCode })
    } else if (err instanceof TypeBoxError || err instanceof ValidationError) {
      return new Response(
        getValidationError((err as any).error, (err as any).where),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    } else {
      console.error(err)
      return new Response(err.message, { status: 500 })
    }
  }

  /**
   * Dispatches a request through the app's routes in-process — no server, no
   * socket. Matches the route the same way Bun would, then runs the onRequest
   * hooks, validation, handler, and error mapping, returning the Response.
   * Intended for integration testing.
   *
   * @example
   * const res = await app.inject("/users/1")
   * const res = await app.inject({ method: "POST", url: "/users", body: { name: "Alice" } })
   * expect(res.status).toBe(200)
   * expect(await res.json()).toEqual({ ... })
   */
  async inject(options: string | InjectOptions): Promise<Response> {
    if (this.root) return this.root.inject(options)

    const opts: InjectOptions = typeof options === "string"? { url: options }: options

    if (this.promises.length > 0) {
      await Promise.all(this.promises)
    }

    const method = (opts.method ?? "GET").toUpperCase()
    const rawUrl = opts.url.includes("://")? opts.url: "http://localhost" + (opts.url.startsWith("/")? opts.url: "/" + opts.url)
    const url = new URL(rawUrl)
    const pathname = url.pathname

    const headers = new Headers(opts.headers)
    let body: any = opts.body
    if (
      body !== undefined && body !== null && typeof body === "object" &&
      !(body instanceof ReadableStream) && !(body instanceof Blob) &&
      !(body instanceof FormData) && !(body instanceof URLSearchParams) &&
      !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)
    ) {
      body = JSON.stringify(body)
      if (!headers.has("content-type")) headers.set("content-type", "application/json")
    }

    const req = new Request(url.href, { method, headers, body: body ?? undefined }) as any

    const match = matchRoute(this.routes, method, pathname)
    if (!match) {
      return this.handleFetch(req, { upgrade: () => false } as any)
    }

    req.params = match.params
    // The route handler catches its own errors and runs onResponse internally,
    // so it resolves to a Response; the catch here is a defensive fallback.
    try {
      return await match.handler(req)
    } catch (err) {
      return this.handleError(err)
    }
  }
}

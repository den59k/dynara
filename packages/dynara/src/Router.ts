import type { BunRequest, Server, WebSocketHandler } from 'bun'
import { unfoldTypeBoxSchema, type SchemaItem } from 'compact-json-schema'
import { TypeBoxError } from '@sinclair/typebox'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { HTTPError, ValidationError } from './error'
import { DynaraRequestInternal } from './request'
import type { GetRouteAction, GetRouteOptions, InjectOptions, DynaraRequest, RegisterPluginOptions, RouteAction, RouteOptions } from './common'
import { getRouteOptions, isDefault, parseBody, matchRoute, type GetOptionsFromSchemaList, getValidationError, type PostOptionsFromSchemaList } from './utils'

export class Router<R extends object = {}> {

  private routes: Record<string, any> = {}
  private promises: Promise<void>[] = []
  private prefix = ""
  private root: Router | null = null
  
  private server!: Server

  private onListenHooks: Array<(ctx: any) => (void | Promise<void>)> = []
  private onRequestHooks: Array<(ctx: DynaraRequest<R>) => (void | Promise<void>)> = []

  private add(path: string, method: string, _options: RouteOptions | SchemaItem[], callback: RouteAction<any>) {
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

      for (const callback of this.onRequestHooks) {
        await callback(request as any)
      }

      const body = bodyValidation === null? undefined: await parseBody(bodyValidation, req)     
      request.body = body as any

      const resp = await callback(request as any)
      if (resp === undefined) {
        return new Response()
      } else if (resp instanceof Response) {
        return resp
      } else {
        return Response.json(resp)
      }
    }
  }

  addHook(where: "onListen", callback: (server: Bun.Server) => void): void
  addHook(where: "onRequest", callback: (ctx: DynaraRequest<R>) => void): void
  addHook(where: "onRequest" | "onListen", callback: (ctx: any) => void): void {
    if (where === "onRequest") {
      this.onRequestHooks.push(callback)
    } else if (where === "onListen") {
      this.onListenHooks.push(callback)
    }
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


  register(plugin: (app: Router<any>) => void | Promise<void>, options: RegisterPluginOptions = {}): void {
    const app = new Router()

    app.root = this.root ?? this as any
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

  async listen(port?: number, hostname?: string): Promise<Bun.Server> {
    if (this.promises.length > 0) {
      await Promise.all(this.promises)
    }
    const server = Bun.serve({
      routes: this.routes,
      port,
      hostname,
      fetch: this.fetch as any,
      websocket: this.websocket,
      error: (err) => this.handleError(err),
    })

    this.server = server

    for (const callback of this.onListenHooks) {
      await callback(server)
    }

    return server
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
      return this.fetch(req, { upgrade: () => false } as any)
    }

    req.params = match.params
    try {
      return await match.handler(req)
    } catch (err) {
      return this.handleError(err)
    }
  }
}

import type { BunRequest, Server, WebSocketHandler } from 'bun'
import { unfoldTypeBoxSchema, type SchemaItem } from 'compact-json-schema'
import { TypeBoxError } from '@sinclair/typebox'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { HTTPError, ValidationError } from './error'
import { MarciRequestInternal } from './request'
import type { GetRouteAction, GetRouteOptions, MarciRequest, RegisterPluginOptions, RouteAction, RouteOptions } from './common'
import { getRouteOptions, isDefault, parseBody, type GetOptionsFromSchemaList, getValidationError, type PostOptionsFromSchemaList } from './utils'

export class MarciApp<R extends object = {}> {

  private routes: Record<string, any> = {}
  private promises: Promise<void>[] = []
  private prefix = ""
  private root: MarciApp | null = null
  
  private server!: Server

  private onListenHooks: Array<(ctx: any) => (void | Promise<void>)> = []
  private onRequestHooks: Array<(ctx: MarciRequest<R>) => (void | Promise<void>)> = []

  private add(path: string, method: string, _options: RouteOptions | SchemaItem[], callback: RouteAction<any>) {
    let fullPath = (this.prefix + (path.endsWith("/")? path.slice(0, -1): path)) || "/"
    if (!(fullPath in this.routes)) {
      this.routes[fullPath] = {}
    }

    const options: RouteOptions = Array.isArray(_options)? getRouteOptions(method, _options): _options
    const paramsSchema = (options.params && !isDefault(options.params))? unfoldTypeBoxSchema(options.params): null
    const querySchema = options.query? unfoldTypeBoxSchema(options.query): null
    const bodyValidation = options.body? TypeCompiler.Compile(unfoldTypeBoxSchema(options.body)): null

    this.routes[fullPath][method] = async (req: BunRequest) => {

      const request = new MarciRequestInternal(req, this.root?.server ?? this.server, paramsSchema, querySchema)

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
  addHook(where: "onRequest", callback: (ctx: MarciRequest<R>) => void): void
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


  register(plugin: (app: MarciApp<any>) => void | Promise<void>, options: RegisterPluginOptions = {}): void {
    const app = new MarciApp()

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
      error(err) {
        if (err instanceof HTTPError) {
          if (err.data) {
            return Response.json(err.data, { status: err.statusCode })
          }
          return new Response(
            err.message, 
            { status: err.statusCode }
          )
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
    })

    this.server = server
    
    for (const callback of this.onListenHooks) {
      await callback(server)
    }

    return server
  }
}

import type { Router } from "./Router"

export type Plugin<R extends object = {}> =
((app: Router<any>) => Promise<void>) &
{
  use<S extends object = {}, A extends any[] = []>
    (plugin: (app: Router<R & S>, ...args: A) => Promise<void> | void, ...args: A): Plugin<R & S>,
  routes(app: (app: Router<R>) => Promise<void> | void): Plugin<R>
};


export const dynara = <R extends object = {}>(): Plugin<R> => {

  const plugins: any[] = []
  const handlers: ((app: Router<R>) => void | Promise<void>)[] = []

  const app: any = Object.assign(async (app: Router<R>) => {
    for (let plugin of plugins) {
      await plugin[0](app, ...plugin.slice(1))
    }
    for (let handler of handlers) {
      await handler(app)
    }
  }, {
    use(plugin: (app: Router<R>) => void | Promise<void>, ...args: any[]) {
      plugins.push([ plugin, ...args ])
      return this
    },
    routes(handler: (app: Router<R>) => void | Promise<void>) {
      handlers.push(handler)
      return this
    }
  })

  return app
}
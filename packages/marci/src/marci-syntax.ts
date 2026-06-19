import type { MarciApp } from "./MarciApp"

export type MarciSyntax<R extends object = {}> = 
((app: MarciApp<any>) => Promise<void>) &
{
  use<S extends object = {}, A extends any[] = []>
    (plugin: (app: MarciApp<R & S>, ...args: A) => Promise<void> | void, ...args: A): MarciSyntax<R & S>,
  routes(app: (app: MarciApp<R>) => Promise<void> | void): MarciSyntax<R>
};


export const marci = <R extends object = {}>(): MarciSyntax<R> => {

  const plugins: any[] = []
  const handlers: ((app: MarciApp<R>) => void | Promise<void>)[] = []
  
  const app: any = Object.assign(async (app: MarciApp<R>) => {
    for (let plugin of plugins) {
      await plugin[0](app, ...plugin.slice(1))
    }
    for (let handler of handlers) {
      await handler(app)
    }
  }, {
    use(plugin: (app: MarciApp<R>) => void | Promise<void>, ...args: any[]) {
      plugins.push([ plugin, ...args ])
      return this
    },
    routes(handler: (app: MarciApp<R>) => void | Promise<void>) {
      handlers.push(handler)
      return this
    }
  })

  return app
}

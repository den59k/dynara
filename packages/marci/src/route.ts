import { marci, MarciApp } from "."

type UserContext = { user: string }

export const useAuth = (app: MarciApp<UserContext>): void => {
  app.addHook("onRequest", (req) => {
    req.user = "test"
  })
}

const child = marci().use(useAuth).routes((app) => {
  const child = marci().routes(() => {
    
  })

  app.register(child)
})

export default child as any

// export default (app: MarciApp<{ user: string }>): void => {

//   const userParams = schema({ userId: "number" })
//   const createNewUser = schema({ name: { type: "string" } })

//   app.addHook("onRequest", useAuth)

//   app.get("/", () => {
//     return { status: "up" }
//   })

//   app.get("/users", () => {
//     return []
//   })

//   app.get("/users/:userId", [userParams], async (req) => {
//     return { id: req.params.userId }
//   })

//   app.post("/users/:userId", [userParams, createNewUser], async (req) => {
    
//     console.log(req.user)

//     return { id: req.params.userId, name: req.body.name }
//   })
// }
import { schema } from "compact-json-schema";
import { Router } from "dynara";

const app = new Router()

app.register(app => {
  app.addHook("onListen", (server) => {
    console.info("Server listened at " + server.url.toString())
  })
  const query = schema({ raw: "boolean" })
  app.get("/test/*", [{}, query], (req) => {
    return { status: "ok", query: req.query, params: req.params }
  })

  app.get("/items/:itemIds", [{ itemIds: { type: "array", items: "number" } }], (req) => {
    return { status: "ok", query: req.query, params: req.params }
  })

  const bodySchema = schema({ name: "string??" })
  app.post("/items", { body: bodySchema }, async (req) => {
    console.log(req.body)
  })
})


app.listen(4000)
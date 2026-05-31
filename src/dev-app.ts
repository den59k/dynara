import { schema } from "compact-json-schema";
import { MarciApp } from ".";

const app = new MarciApp()

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
})


app.listen(4000)
export class HTTPError extends Error {
  statusCode: number
  data?: any
  override message: string
  constructor(message: string | object, statusCode?: number) {
    super()
    if (typeof message === "string") {
      this.message = message
    } else if (typeof message === "object" && message !== null && !("error" in message)) {
      this.data = { error: message }
      this.message = "HTTP Error"
    } else {
      this.data = message
      this.message = "HTTP Error"
    }
    this.statusCode = statusCode ?? 400
  }
}

export class ValidationError extends Error {
  error: any
  where?: string
  constructor(err: any, where?: string) {
    super(err.message)
    this.error = err
    this.where = where
  }
}
import { TypeBoxError } from "@sinclair/typebox"

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

/**
 * True for the errors dynara maps to a `400` by default — a body
 * `ValidationError` or a TypeBox error from params/query parsing. Handy inside a
 * custom `setErrorHandler` to special-case validation failures.
 */
export const isValidationError = (err: unknown): err is ValidationError | TypeBoxError =>
  err instanceof ValidationError || err instanceof TypeBoxError
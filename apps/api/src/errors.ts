export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Readonly<Record<string, unknown>> | undefined

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

export function apiErrorResponse(error: ApiError): Response {
  return Response.json(
    {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : error.details),
    },
    {
      status: error.status,
      headers: { "cache-control": "no-store" },
    },
  )
}

export function invalidRequest(message: string): ApiError {
  return new ApiError(400, "invalid_request", message)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

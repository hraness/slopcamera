import { createApiHandler } from "./handler.js"
import { readApiConfig } from "./config.js"
import { toolEnvironmentWithOidc } from "./oidc.js"

/**
 * Vercel Functions adapter for the hosted API. `vercel.json` rewrites the
 * public `/v1/…` surface under `/api/…`; each `api/**` entry file pins its
 * canonical API path because this framework preset passes dynamic segments
 * through `req.query`, not the URL. Adapts the Node request/response pair
 * onto the web-standard handler. No Vercel packages are imported so the file
 * stays dependency-free.
 */

const handler = createApiHandler({
  config: readApiConfig(process.env),
  env: process.env,
})

export interface VercelRequestLike extends AsyncIterable<Uint8Array> {
  readonly method?: string
  readonly url?: string
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly query?: Record<string, string | string[] | undefined>
}

export interface VercelResponseLike {
  status(code: number): VercelResponseLike
  setHeader(name: string, value: string): void
  send(body: Uint8Array | string): void
}

export async function handleVercelRequest(
  req: VercelRequestLike,
  res: VercelResponseLike,
  apiPath: string,
): Promise<void> {
  const url = new URL(apiPath, "https://local.invalid")
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    headers.set(name, Array.isArray(value) ? value.join(", ") : value)
  }
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(chunk)
  const body =
    chunks.length === 0
      ? undefined
      : Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
  const toolEnv = toolEnvironmentWithOidc(
    process.env,
    req.headers["x-vercel-oidc-token"],
  )
  const response = await handler(
    new Request(url.href, {
      method: req.method ?? "GET",
      headers,
      body,
    }),
    toolEnv === undefined ? undefined : { toolEnv },
  )
  res.status(response.status)
  for (const [name, value] of response.headers) res.setHeader(name, value)
  res.send(Buffer.from(await response.arrayBuffer()))
}

export function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

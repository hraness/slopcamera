import { createApiHandler } from "../apps/api/src/handler.ts"
import { readApiConfig } from "../apps/api/src/config.ts"

/**
 * Vercel Functions adapter for the hosted API. `vercel.json` rewrites every
 * path under `/api/…`; this adapter strips that prefix, adapts the Node
 * request/response pair onto the web-standard handler, and streams the
 * response back. No Vercel packages are imported so the file stays
 * dependency-free and typechecks under the root tsconfig.
 */

const handler = createApiHandler({
  config: readApiConfig(process.env),
  env: process.env,
})

interface VercelRequestLike extends AsyncIterable<Uint8Array> {
  readonly method?: string
  readonly url?: string
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
}

interface VercelResponseLike {
  status(code: number): VercelResponseLike
  setHeader(name: string, value: string): void
  send(body: Uint8Array | string): void
}

export default async function vercelApiHandler(
  req: VercelRequestLike,
  res: VercelResponseLike,
): Promise<void> {
  const url = new URL(req.url ?? "/", "https://local.invalid")
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/u, "") || "/"
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    headers.set(name, Array.isArray(value) ? value.join(", ") : value)
  }
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(chunk)
  const hasBody = req.method !== "GET" && req.method !== "HEAD"
  const body =
    hasBody && chunks.length > 0
      ? new Uint8Array(Buffer.concat(chunks.map((c) => Buffer.from(c))))
      : undefined
  const request = new Request(url.href, {
    method: req.method ?? "GET",
    headers,
    ...(body === undefined ? {} : { body }),
  })
  const response = await handler(request)
  res.status(response.status)
  response.headers.forEach((value, name) => {
    res.setHeader(name, value)
  })
  res.send(Buffer.from(await response.arrayBuffer()))
}

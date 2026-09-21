import { createHash, createHmac } from "node:crypto"
import { ApiError } from "./errors.ts"

/**
 * Minimal Cloudflare R2 client over the S3-compatible API.
 *
 * Two signing modes are supported:
 *  - `presign` produces query-authenticated URLs for client-side GET/PUT.
 *  - Server operations (`put`, `get`, `head`) presign the request and then
 *    fetch it directly, so one code path signs everything.
 *
 * The R2 region is always `auto` and the service name is `s3`.
 */

export interface R2Config {
  readonly accountId: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly bucket: string
  /** Public base used in returned URLs; defaults to the S3 endpoint. */
  readonly endpoint?: string
}

interface SigningKey {
  readonly key: Uint8Array
  readonly dateStamp: string
  readonly scope: string
}

const R2_REGION = "auto"
const R2_SERVICE = "s3"
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: string | Uint8Array, value: string): Uint8Array {
  return createHmac("sha256", key).update(value).digest()
}

function encodePathKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function hostFor(config: R2Config): string {
  if (config.endpoint !== undefined) {
    return new URL(config.endpoint).host
  }
  return `${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`
}

function deriveSigningKey(config: R2Config, dateStamp: string): SigningKey {
  const scope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, R2_REGION)
  const serviceKey = hmac(regionKey, R2_SERVICE)
  return { key: hmac(serviceKey, "aws4_request"), dateStamp, scope }
}

function amzDates(now: Date): { dateStamp: string; amzDate: string } {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  return { dateStamp: iso.slice(0, 8), amzDate: iso }
}

export interface PresignOptions {
  /** Additional headers the URL holder must send verbatim. */
  readonly signedHeaders?: Readonly<Record<string, string>>
  readonly expiresSeconds?: number
  readonly now?: Date
}

function presign(
  config: R2Config,
  method: "GET" | "PUT" | "HEAD",
  key: string,
  options: PresignOptions = {},
): string {
  const host = hostFor(config)
  const { dateStamp, amzDate } = amzDates(options.now ?? new Date())
  const signing = deriveSigningKey(config, dateStamp)
  const expires = Math.min(Math.max(options.expiresSeconds ?? 900, 1), 604800)

  const extraHeaders = options.signedHeaders ?? {}
  const headerEntries = Object.entries(extraHeaders).map(([name, value]) => [
    name.toLowerCase(),
    value.trim(),
  ])
  const signedHeaderNames = ["host", ...headerEntries.map(([name]) => name)]
    .sort()
    .join(";")
  const canonicalHeaders =
    [`host:${host}`, ...headerEntries.map(([n, v]) => `${n}:${v}`)]
      .sort()
      .join("\n") + "\n"

  const query: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${signing.scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", signedHeaderNames],
  ]
  const canonicalQuery = query
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&")

  const canonicalRequest = [
    method,
    `/${encodePathKey(key)}`,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames,
    UNSIGNED_PAYLOAD,
  ].join("\n")

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    signing.scope,
    sha256Hex(canonicalRequest),
  ].join("\n")

  const signature = Buffer.from(
    hmac(signing.key, stringToSign),
  ).toString("hex")

  const base = config.endpoint ?? `https://${host}`
  return `${base}/${encodePathKey(key)}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

export class R2Store {
  constructor(private readonly config: R2Config) {}

  /** Presigned URL a client may PUT object bytes to within `expiresSeconds`. */
  presignPut(
    key: string,
    options: {
      contentType: string
      maxBytes: number
      metadata?: Record<string, string>
      expiresSeconds?: number
    },
  ): { url: string; headers: Record<string, string>; expiresSeconds: number } {
    const headers: Record<string, string> = {
      "content-type": options.contentType,
      ...(options.metadata === undefined
        ? {}
        : Object.fromEntries(
            Object.entries(options.metadata).map(([name, value]) => [
              `x-amz-meta-${name}`,
              value,
            ]),
          )),
    }
    const expiresSeconds = options.expiresSeconds ?? 900
    return {
      url: presign(this.config, "PUT", key, {
        signedHeaders: headers,
        expiresSeconds,
      }),
      headers,
      expiresSeconds,
    }
  }

  /** Presigned URL a client may GET object bytes from. */
  presignGet(key: string, expiresSeconds = 3600): string {
    return presign(this.config, "GET", key, { expiresSeconds })
  }

  async putObject(
    key: string,
    body: Uint8Array,
    options: { contentType: string; metadata?: Record<string, string> },
  ): Promise<void> {
    const headers: Record<string, string> = {
      "content-type": options.contentType,
      "content-length": String(body.byteLength),
      ...(options.metadata === undefined
        ? {}
        : Object.fromEntries(
            Object.entries(options.metadata).map(([name, value]) => [
              `x-amz-meta-${name}`,
              value,
            ]),
          )),
    }
    const url = presign(this.config, "PUT", key, {
      signedHeaders: headers,
      expiresSeconds: 300,
    })
    const response = await fetch(url, { method: "PUT", headers, body })
    if (!response.ok) {
      throw new ApiError(503, "storage_unavailable", "Artifact storage write failed.")
    }
  }

  async getObject(
    key: string,
    maximumBytes: number,
  ): Promise<Uint8Array | undefined> {
    const url = presign(this.config, "GET", key, { expiresSeconds: 300 })
    const response = await fetch(url)
    if (response.status === 404) return undefined
    if (!response.ok || response.body === null) {
      throw new ApiError(503, "storage_unavailable", "Artifact storage read failed.")
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maximumBytes) {
        await reader.cancel()
        throw new ApiError(503, "storage_unavailable", "Artifact exceeded its recorded size.")
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }

  async headObject(
    key: string,
  ): Promise<{ bytes: number; metadata: Record<string, string> } | undefined> {
    const url = presign(this.config, "HEAD", key, { expiresSeconds: 300 })
    const response = await fetch(url, { method: "HEAD" })
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new ApiError(503, "storage_unavailable", "Artifact storage check failed.")
    }
    const metadata: Record<string, string> = {}
    for (const [name, value] of response.headers) {
      if (name.startsWith("x-amz-meta-")) {
        metadata[name.slice("x-amz-meta-".length)] = value
      }
    }
    return {
      bytes: Number(response.headers.get("content-length") ?? "0"),
      metadata,
    }
  }
}

import { createHmac } from "node:crypto"
import { ApiError } from "./errors.js"

/**
 * Client for the `slopcamera-objects` worker: the private R2 bucket behind
 * an HMAC-signed request proxy. One shared secret signs the operation, key,
 * expiry, and declared byte cap into every URL — the bucket itself never
 * needs a Cloudflare-issued S3 credential.
 *
 * `presignPut`/`presignGet` mint bearer URLs for clients; the server-side
 * operations sign and fetch directly so one code path signs everything.
 */

export interface ObjectProxyConfig {
  /** Worker base URL, e.g. `https://slopcamera-objects.<sub>.workers.dev`. */
  readonly url: string
  readonly secret: string
}

const MAX_PROXY_PUT_BYTES = 64 * 1024 * 1024

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex")
}

function encodePathKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export class ObjectProxyStore {
  private readonly base: string

  constructor(private readonly config: ObjectProxyConfig) {
    this.base = config.url.replace(/\/+$/, "")
  }

  private signedUrl(
    method: "GET" | "HEAD" | "PUT",
    key: string,
    options: { expiresSeconds: number; maxBytes?: number },
  ): string {
    const exp =
      Math.floor(Date.now() / 1000) +
      Math.min(Math.max(options.expiresSeconds, 1), 3600)
    const max = options.maxBytes === undefined ? "" : String(options.maxBytes)
    const sig = hmacHex(
      this.config.secret,
      `${method}\n${key}\n${String(exp)}\n${max}`,
    )
    const query = `exp=${String(exp)}&sig=${sig}${max === "" ? "" : `&max=${max}`}`
    return `${this.base}/o/${encodePathKey(key)}?${query}`
  }

  /** Bearer URL a client may PUT object bytes to within `expiresSeconds`. */
  presignPut(
    key: string,
    options: {
      contentType: string
      maxBytes: number
      metadata?: Record<string, string>
      expiresSeconds?: number
    },
  ): { url: string; headers: Record<string, string>; expiresSeconds: number } {
    const expiresSeconds = options.expiresSeconds ?? 900
    return {
      url: this.signedUrl("PUT", key, {
        expiresSeconds,
        maxBytes: options.maxBytes,
      }),
      headers: { "content-type": options.contentType },
      expiresSeconds,
    }
  }

  /** Bearer URL a client may GET object bytes from. */
  presignGet(key: string, expiresSeconds = 3600): string {
    return this.signedUrl("GET", key, { expiresSeconds })
  }

  async putObject(
    key: string,
    body: Uint8Array,
    options: { contentType: string; metadata?: Record<string, string> },
  ): Promise<void> {
    if (body.byteLength > MAX_PROXY_PUT_BYTES) {
      throw new ApiError(503, "storage_unavailable", "Object exceeds the store cap.")
    }
    const url = this.signedUrl("PUT", key, {
      expiresSeconds: 300,
      maxBytes: body.byteLength,
    })
    const headers: Record<string, string> = {
      "content-type": options.contentType,
      "content-length": String(body.byteLength),
      ...(options.metadata === undefined
        ? {}
        : Object.fromEntries(
            Object.entries(options.metadata).map(([name, value]) => [
              `x-meta-${name}`,
              value,
            ]),
          )),
    }
    const response = await fetch(url, { method: "PUT", headers, body })
    if (!response.ok) {
      throw new ApiError(503, "storage_unavailable", "Artifact storage write failed.")
    }
  }

  async getObject(
    key: string,
    maximumBytes: number,
  ): Promise<Uint8Array | undefined> {
    const url = this.signedUrl("GET", key, { expiresSeconds: 300 })
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
    const url = this.signedUrl("HEAD", key, { expiresSeconds: 300 })
    const response = await fetch(url, { method: "HEAD" })
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new ApiError(503, "storage_unavailable", "Artifact storage check failed.")
    }
    const metadata: Record<string, string> = {}
    for (const [name, value] of response.headers) {
      if (name.startsWith("x-meta-")) {
        metadata[name.slice("x-meta-".length)] = value
      }
    }
    return {
      bytes: Number(response.headers.get("content-length") ?? "0"),
      metadata,
    }
  }
}

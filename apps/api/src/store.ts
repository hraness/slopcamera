import { createHash, randomUUID } from "node:crypto"
import { ApiError, isRecord } from "./errors.ts"
import type { R2Store } from "./r2.ts"

/**
 * Artifact tickets. Bytes live at `a/<id>/<safe-name>`; a small JSON record
 * at `t/<id>.json` is the resolvable ticket. Both objects expire through the
 * bucket lifecycle rule — currently one week — so nothing needs deletion.
 */

export interface ArtifactRecord {
  readonly id: string
  readonly name: string
  readonly bytes: number
  readonly sha256: string
  readonly contentType: string
  readonly tool: string
  readonly model?: string
  readonly requestId?: string
  readonly createdAt: string
}

const TICKET_MAX_BYTES = 16 * 1024
const ARTIFACT_MAX_BYTES = 128 * 1024 * 1024

export function safeArtifactName(name: string): string {
  const base = name.split("/").pop() ?? "artifact"
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return cleaned.length === 0 ? "artifact" : cleaned.slice(0, 128)
}

export class ArtifactStore {
  constructor(
    private readonly r2: R2Store,
    private readonly ttlDays: number,
  ) {}

  async put(options: {
    name: string
    bytes: Uint8Array
    contentType: string
    tool: string
    model?: string
    requestId?: string
  }): Promise<ArtifactRecord> {
    if (options.bytes.byteLength > ARTIFACT_MAX_BYTES) {
      throw new ApiError(413, "too_large", "The artifact exceeds the storage bound.")
    }
    const id = randomUUID()
    const name = safeArtifactName(options.name)
    const key = `a/${id}/${name}`
    const sha256 = createHash("sha256").update(options.bytes).digest("hex")
    const createdAt = new Date().toISOString()

    const metadata: Record<string, string> = {
      sha256,
      tool: options.tool,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.requestId === undefined
        ? {}
        : { request: options.requestId.slice(0, 128) }),
    }
    await this.r2.putObject(key, options.bytes, {
      contentType: options.contentType,
      metadata,
    })

    const record: ArtifactRecord = {
      id,
      name,
      bytes: options.bytes.byteLength,
      sha256,
      contentType: options.contentType,
      tool: options.tool,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.requestId === undefined
        ? {}
        : { requestId: options.requestId }),
      createdAt,
    }
    await this.r2.putObject(
      `t/${id}.json`,
      new TextEncoder().encode(JSON.stringify({ ...record, key })),
      { contentType: "application/json" },
    )
    return record
  }

  async get(id: string): Promise<(ArtifactRecord & { key: string }) | undefined> {
    if (!/^[0-9a-f-]{36}$/iu.test(id)) return undefined
    const raw = await this.r2.getObject(`t/${id}.json`, TICKET_MAX_BYTES)
    if (raw === undefined) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(new TextDecoder().decode(raw))
    } catch {
      return undefined
    }
    if (
      !isRecord(parsed) ||
      typeof parsed.key !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.bytes !== "number" ||
      typeof parsed.sha256 !== "string" ||
      typeof parsed.contentType !== "string"
    ) {
      return undefined
    }
    return {
      id,
      key: parsed.key,
      name: parsed.name,
      bytes: parsed.bytes,
      sha256: parsed.sha256,
      contentType: parsed.contentType,
      tool: typeof parsed.tool === "string" ? parsed.tool : "unknown",
      ...(typeof parsed.model === "string" ? { model: parsed.model } : {}),
      ...(typeof parsed.requestId === "string"
        ? { requestId: parsed.requestId }
        : {}),
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date(0).toISOString(),
    }
  }

  expiresAt(): string {
    return new Date(Date.now() + this.ttlDays * 86_400_000).toISOString()
  }
}

export function artifactView(
  baseUrl: string,
  record: ArtifactRecord,
  expiresAt: string,
): Record<string, unknown> {
  return {
    id: record.id,
    name: record.name,
    bytes: record.bytes,
    sha256: record.sha256,
    contentType: record.contentType,
    tool: record.tool,
    ...(record.model === undefined ? {} : { model: record.model }),
    ...(record.requestId === undefined
      ? {}
      : { requestId: record.requestId }),
    createdAt: record.createdAt,
    expiresAt,
    url: `${baseUrl}/v1/artifacts/${record.id}`,
    contentUrl: `${baseUrl}/v1/artifacts/${record.id}/content`,
  }
}

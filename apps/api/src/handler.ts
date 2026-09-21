import { randomUUID } from "node:crypto"
import type { ApiConfig } from "./config.ts"
import { CreditsClient, CreditsShortfall } from "./credits.ts"
import {
  ApiError,
  apiErrorResponse,
  invalidRequest,
  isApiError,
  isRecord,
} from "./errors.ts"
import { handleMcpRequest } from "./mcp.ts"
import { openApiDocument } from "./openapi.ts"
import { RateLimiter } from "./ratelimit.ts"
import { R2Store } from "./r2.ts"
import { ArtifactStore, artifactView } from "./store.ts"
import {
  CREDITS_OPERATION,
  callHostedTool,
  hostedTool,
  hostedTools,
  paidOperationModel,
} from "./tools.ts"
import { harvestOutputs, materializeWorkspace } from "./workspace.ts"

export interface ApiEnvironment {
  readonly config: ApiConfig
  readonly env: Record<string, string | undefined>
  readonly limiter?: RateLimiter
  readonly fetchImpl?: typeof fetch
}

const BODY_MAX_BYTES = 16 * 1024 * 1024
const UPLOAD_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/json",
  "application/octet-stream",
])

export interface HostedCallRequest {
  readonly name: string
  readonly arguments: unknown
  readonly files: unknown
  readonly idempotencyKey: string | undefined
  readonly token: string | undefined
  readonly clientKey: string
}

export interface HostedCallResult {
  readonly ok: boolean
  readonly result: unknown
  readonly artifacts: ReadonlyArray<Record<string, unknown>>
  readonly isError?: true
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const hop = forwarded?.split(",")[0]?.trim()
  return hop !== undefined && hop.length > 0 ? hop : "unknown"
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization")
  if (header === null) return undefined
  const match = header.match(/^Bearer\s+(.+)$/iu)
  return match?.[1]?.trim()
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

async function readJsonBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length > BODY_MAX_BYTES) {
    throw new ApiError(413, "too_large", "Request body exceeds the service limit.")
  }
  const text = await request.text()
  if (Buffer.byteLength(text, "utf8") > BODY_MAX_BYTES) {
    throw new ApiError(413, "too_large", "Request body exceeds the service limit.")
  }
  try {
    return JSON.parse(text)
  } catch {
    throw invalidRequest("Body must be valid JSON.")
  }
}

function admitOrThrow(
  limiter: RateLimiter,
  key: string,
  perHour: number,
  burst: number,
): void {
  const retryAfter = limiter.check(key, perHour, burst)
  if (retryAfter > 0) {
    throw new ApiError(429, "rate_limited", "Too many requests; retry later.", {
      retryAfterSeconds: retryAfter,
    })
  }
}

export function paidToolUnauthorizedError(): ApiError {
  return new ApiError(
    401,
    "unauthorized",
    "This tool requires a Hraness Credits device token.",
    {
      signup: {
        claims: "POST https://credits.hraness.com/v1/claims",
        product: "slopcamera",
        usage:
          "Create a claim with your device id, pay the presented pack link, poll the claim with its secret to receive a cr_dev_ token, then retry with Authorization: Bearer <token>.",
      },
    },
  )
}

/**
 * The service's fetch handler, portable across Bun.serve, Node adapters, and
 * tests. Constructed once per process with its config; per-request state
 * (workspaces, runtimes) never persists.
 */
export function createApiHandler(environment: ApiEnvironment) {
  const { config } = environment
  const limiter = environment.limiter ?? new RateLimiter()
  const r2 = config.r2 === undefined ? undefined : new R2Store(config.r2)
  const artifacts =
    r2 === undefined
      ? undefined
      : new ArtifactStore(r2, config.artifactTtlDays)
  const credits =
    config.credits === undefined
      ? undefined
      : new CreditsClient({
          baseUrl: config.credits.baseUrl,
          productKey: config.credits.productKey,
          ...(environment.fetchImpl === undefined
            ? {}
            : { fetchImpl: environment.fetchImpl }),
        })

  /**
   * Shared tool invocation for the REST and MCP surfaces. Owns admission,
   * billing, the ephemeral workspace, and artifact harvest.
   */
  async function invokeTool(call: HostedCallRequest): Promise<HostedCallResult> {
    const name = call.name
    const tool = hostedTool(name)
    if (tool === undefined) {
      throw new ApiError(404, "not_found", `No hosted tool named ${name}.`)
    }
    const args = call.arguments

    const token = call.token
    let holdId: string | undefined
    let settleCostMicroUsd = 0
    let paidModel: string | undefined

    if (tool.tier === "paid") {
      if (token === undefined || !token.startsWith("cr_dev_")) {
        throw paidToolUnauthorizedError()
      }
      if (credits === undefined) {
        throw new ApiError(503, "billing_unavailable", "Billing is not configured.")
      }
      const { model, ceilingMicroUsd } = paidOperationModel(
        args,
        config.modelCostsMicroUsd,
      )
      paidModel = model
      settleCostMicroUsd = ceilingMicroUsd
      const idempotencyKey = `slopcamera-api:${call.idempotencyKey ?? randomUUID()}`
      const hold = await credits.hold({
        subjectToken: token,
        operation: CREDITS_OPERATION,
        ceilingMicroUsd,
        idempotencyKey,
        context: { tool: tool.name, model },
      })
      holdId = hold.holdId
    } else {
      const perHour =
        tool.tier === "render"
          ? config.renderCallsPerHour
          : config.freeCallsPerHour
      admitOrThrow(
        limiter,
        `${tool.tier}:${call.clientKey}`,
        perHour,
        Math.max(4, Math.ceil(perHour / 6)),
      )
    }

    const workspace = await materializeWorkspace(
      call.files,
      {
        maximumInlineBytes: config.maximumInlineBytes,
        maximumUploadBytes: config.maximumUploadBytes,
      },
      r2,
    )
    try {
      const result = await callHostedTool(
        tool,
        args,
        workspace.directory,
        environment.env,
      )
      if (result.isError === true && holdId !== undefined) {
        await credits?.release(holdId)
        holdId = undefined
      }

      const harvested = await harvestOutputs(
        workspace.directory,
        workspace.inputNames,
      )
      const storedArtifacts: Array<Record<string, unknown>> = []
      if (harvested.length > 0) {
        if (artifacts === undefined) {
          throw new ApiError(
            503,
            "storage_unavailable",
            "Artifact storage is not configured.",
          )
        }
        for (const file of harvested) {
          const record = await artifacts.put({
            name: file.relativePath,
            bytes: file.bytes,
            contentType: contentTypeFor(file.relativePath),
            tool: tool.name,
            ...(paidModel === undefined ? {} : { model: paidModel }),
          })
          storedArtifacts.push(
            artifactView(config.publicBaseUrl, record, artifacts.expiresAt()),
          )
        }
      }

      if (holdId !== undefined) {
        await credits?.settle(holdId, [
          {
            provider: "vercel-ai-gateway",
            operation: CREDITS_OPERATION,
            microUsd: settleCostMicroUsd,
            basis: "contractual",
          },
        ])
        holdId = undefined
      }

      return {
        ok: result.isError !== true,
        result: result.structuredContent ?? {
          text: result.content.map((entry) => entry.text).join("\n"),
        },
        artifacts: storedArtifacts,
        ...(result.isError === true ? { isError: true as const } : {}),
      }
    } catch (error) {
      if (holdId !== undefined) {
        try {
          await credits?.release(holdId)
        } catch {
          // Release failures must not mask the original error.
        }
      }
      throw error
    } finally {
      await workspace.cleanup()
    }
  }

  async function callToolRoute(request: Request, name: string): Promise<Response> {
    const body = await readJsonBody(request)
    if (!isRecord(body)) {
      throw invalidRequest("Body must be a JSON object.")
    }
    const args = body.arguments
    const files =
      body.files !== undefined
        ? body.files
        : isRecord(args)
          ? args.files
          : undefined
    const cleanArgs = isRecord(args) ? { ...args } : args
    if (isRecord(cleanArgs) && "files" in cleanArgs) {
      delete cleanArgs.files
    }
    const outcome = await invokeTool({
      name,
      arguments: cleanArgs,
      files,
      idempotencyKey:
        typeof body.idempotencyKey === "string"
          ? body.idempotencyKey.slice(0, 96)
          : undefined,
      token: bearerToken(request),
      clientKey: clientKey(request),
    })
    return jsonResponse({
      ok: outcome.ok,
      result: outcome.result,
      artifacts: outcome.artifacts,
    })
  }

  async function createUpload(request: Request): Promise<Response> {
    if (r2 === undefined) {
      throw new ApiError(503, "storage_unavailable", "Upload storage is not configured.")
    }
    admitOrThrow(
      limiter,
      `upload:${clientKey(request)}`,
      config.uploadsPerHour,
      10,
    )
    const body = await readJsonBody(request)
    if (!isRecord(body)) {
      throw invalidRequest("Body must be a JSON object.")
    }
    const contentType = body.contentType
    if (typeof contentType !== "string" || !UPLOAD_CONTENT_TYPES.has(contentType)) {
      throw invalidRequest(
        `contentType must be one of: ${[...UPLOAD_CONTENT_TYPES].join(", ")}.`,
      )
    }
    const bytes = body.bytes
    if (
      typeof bytes !== "number" ||
      !Number.isInteger(bytes) ||
      bytes < 1 ||
      bytes > config.maximumUploadBytes
    ) {
      throw invalidRequest(
        `bytes must be an integer between 1 and ${config.maximumUploadBytes}.`,
      )
    }
    const uploadId = randomUUID()
    const signed = r2.presignPut(`u/${uploadId}`, {
      contentType,
      maxBytes: bytes,
      expiresSeconds: 900,
      ...(typeof body.sha256 === "string"
        ? { metadata: { sha256: body.sha256.slice(0, 128) } }
        : {}),
    })
    return jsonResponse(
      {
        uploadId,
        url: signed.url,
        headers: signed.headers,
        expiresAt: new Date(Date.now() + signed.expiresSeconds * 1000).toISOString(),
        usage:
          "PUT the bytes to url with the returned headers, then reference this id as files.<name>.upload in a tool call.",
      },
      201,
    )
  }

  async function getArtifact(id: string): Promise<Response> {
    if (artifacts === undefined) {
      throw new ApiError(503, "storage_unavailable", "Artifact storage is not configured.")
    }
    const record = await artifacts.get(id)
    if (record === undefined) {
      throw new ApiError(404, "not_found", "Unknown or expired artifact.")
    }
    return jsonResponse(
      artifactView(config.publicBaseUrl, record, artifacts.expiresAt()),
    )
  }

  async function getArtifactContent(id: string): Promise<Response> {
    if (artifacts === undefined || r2 === undefined) {
      throw new ApiError(503, "storage_unavailable", "Artifact storage is not configured.")
    }
    const record = await artifacts.get(id)
    if (record === undefined) {
      throw new ApiError(404, "not_found", "Unknown or expired artifact.")
    }
    return new Response(null, {
      status: 302,
      headers: {
        location: r2.presignGet(record.key, 3600),
        "cache-control": "private, max-age=60",
      },
    })
  }

  return async function apiHandler(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const path = url.pathname.replace(/\/+$/, "") || "/"
      const method = request.method

      if (method === "GET" && path === "/") {
        return jsonResponse({
          service: "slopcamera-api",
          endpoints: {
            tools: "GET /v1/tools",
            call: "POST /v1/tools/{name}/call",
            uploads: "POST /v1/uploads",
            artifacts: "GET /v1/artifacts/{id}",
            mcp: "POST /v1/mcp",
            openapi: "GET /v1/openapi.json",
          },
        })
      }
      if (method === "GET" && path === "/v1/health") {
        return jsonResponse({
          ok: true,
          storage: r2 !== undefined,
          billing: credits !== undefined,
          models: Object.keys(config.modelCostsMicroUsd).length,
        })
      }
      if (method === "GET" && path === "/v1/tools") {
        return jsonResponse({
          tools: hostedTools.map((tool) => ({
            name: tool.name,
            tier: tool.tier,
            title: tool.definition.title,
            description: tool.definition.description,
            inputSchema: tool.definition.inputSchema,
          })),
        })
      }
      if (method === "GET" && path === "/v1/openapi.json") {
        return jsonResponse(openApiDocument(config.publicBaseUrl))
      }
      const toolMatch = path.match(/^\/v1\/tools\/([a-z_]+)\/call$/u)
      if (method === "POST" && toolMatch !== null) {
        return await callToolRoute(request, toolMatch[1] ?? "")
      }
      if (method === "POST" && path === "/v1/uploads") {
        return await createUpload(request)
      }
      const artifactMatch = path.match(
        /^\/v1\/artifacts\/([0-9a-f-]{36})(\/content)?$/iu,
      )
      if (method === "GET" && artifactMatch !== null) {
        const id = artifactMatch[1] ?? ""
        return artifactMatch[2] === "/content"
          ? await getArtifactContent(id)
          : await getArtifact(id)
      }
      if (method === "POST" && path === "/v1/mcp") {
        return await handleMcpRequest(request, invokeTool, clientKey(request))
      }
      throw new ApiError(404, "not_found", "Unknown route.")
    } catch (error) {
      if (error instanceof CreditsShortfall) {
        return jsonResponse(
          {
            error: "insufficient_credits",
            message: error.message,
            ...(error.required === undefined
              ? {}
              : { required: error.required }),
            ...(error.balance === undefined ? {} : { balance: error.balance }),
            ...(error.topup === undefined ? {} : { topup: error.topup }),
          },
          402,
        )
      }
      if (isApiError(error)) {
        return apiErrorResponse(error)
      }
      return jsonResponse(
        { error: "internal", message: "The request failed." },
        500,
      )
    }
  }
}

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  if (lower.endsWith(".json")) return "application/json"
  if (lower.endsWith(".tldr")) return "application/json"
  if (lower.endsWith(".md")) return "text/markdown"
  return "application/octet-stream"
}

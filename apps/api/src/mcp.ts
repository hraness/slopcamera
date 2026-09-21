import { isApiError, isRecord } from "./errors.ts"
import type { HostedCallRequest, HostedCallResult } from "./handler.ts"
import { hostedTools } from "./tools.ts"
import { SLOPCAMERA_VERSION } from "../../../src/version.ts"

/**
 * Stateless streamable-HTTP MCP endpoint. Each POST carries one JSON-RPC
 * message; notifications and batches return 202/204 with no body. Tool
 * results carry artifact tickets as `resource_link` content alongside the
 * JSON payload.
 */

const PROTOCOL_VERSION = "2025-11-25"

type InvokeTool = (call: HostedCallRequest) => Promise<HostedCallResult>

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { headers: { "cache-control": "no-store" } },
  )
}

function rpcError(id: unknown, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { headers: { "cache-control": "no-store" } },
  )
}

function isJsonRpcId(value: unknown): value is string | number {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isSafeInteger(value))
  )
}

function mcpErrorStatus(error: unknown): { code: number; message: string } {
  if (isApiError(error)) {
    const message =
      error.details !== undefined && error.details.topup !== undefined
        ? `${error.message} Top up at ${String((error.details.topup as Record<string, unknown>).url ?? "")}`
        : error.message
    return { code: -32000, message }
  }
  return { code: -32603, message: "The request failed." }
}

export async function handleMcpRequest(
  request: Request,
  invokeTool: InvokeTool,
  clientKey: string,
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return rpcError(null, -32700, "Body must be valid JSON.")
  }
  if (!isRecord(body)) {
    return rpcError(null, -32600, "Expected a JSON-RPC object.")
  }
  const id = "id" in body && isJsonRpcId(body.id) ? body.id : undefined
  const method = body.method
  if (typeof method !== "string") {
    return rpcError(id ?? null, -32600, "Missing method.")
  }

  if (id === undefined) {
    // Notification (e.g. notifications/initialized): accept, no response.
    return new Response(null, { status: 202 })
  }

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "hraness-slopcamera-api",
          version: SLOPCAMERA_VERSION,
        },
      })
    case "ping":
      return rpcResult(id, {})
    case "tools/list":
    case "tools.list":
      return rpcResult(id, {
        tools: hostedTools.map((tool) => ({
          name: tool.name,
          title: tool.definition.title,
          description: tool.definition.description,
          inputSchema: tool.definition.inputSchema,
          annotations: tool.definition.annotations,
        })),
      })
    case "tools/call":
    case "tools.call": {
      const params = isRecord(body.params) ? body.params : {}
      const name = typeof params.name === "string" ? params.name : ""
      const args = isRecord(params.arguments) ? { ...params.arguments } : {}
      const files = args.files
      if ("files" in args) delete args.files
      try {
        const outcome = await invokeTool({
          name,
          arguments: args,
          files,
          idempotencyKey:
            typeof params.idempotencyKey === "string"
              ? params.idempotencyKey.slice(0, 96)
              : undefined,
          token: bearerToken(request),
          clientKey,
        })
        const artifactLinks = outcome.artifacts.map((artifact) => ({
          type: "resource_link" as const,
          uri: String(artifact.contentUrl ?? artifact.url),
          name: String(artifact.name),
          mimeType: String(artifact.contentType),
        }))
        return rpcResult(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { ok: outcome.ok, result: outcome.result },
                null,
                2,
              ),
            },
            ...artifactLinks,
          ],
          structuredContent: {
            ok: outcome.ok,
            result: outcome.result,
            artifacts: outcome.artifacts,
          },
          ...(outcome.isError === true ? { isError: true } : {}),
        })
      } catch (error) {
        if (isApiError(error) && error.status === 402) {
          return rpcResult(id, {
            content: [
              {
                type: "text",
                text: `insufficient_credits: ${error.message}`,
              },
            ],
            isError: true,
          })
        }
        const { code, message } = mcpErrorStatus(error)
        return rpcError(id, code, message)
      }
    }
    default:
      return rpcError(id, -32601, `Method ${method} is not supported.`)
  }
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization")
  if (header === null) return undefined
  const match = header.match(/^Bearer\s+(.+)$/iu)
  return match?.[1]?.trim()
}

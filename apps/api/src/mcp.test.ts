import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ApiConfig } from "./config.js"
import { createApiHandler } from "./handler.js"

const DIAGRAM = await readFile(
  join(import.meta.dir, "../../../examples/semantic-flow.diagram.json"),
  "utf8",
)

const config: ApiConfig = {
  publicBaseUrl: "http://localhost:8787",
  r2Proxy: undefined,
  r2: undefined,
  credits: undefined,
  modelCostsMicroUsd: {},
  artifactTtlDays: 7,
  freeCallsPerHour: 120,
  renderCallsPerHour: 30,
  uploadsPerHour: 60,
  maximumInlineBytes: 4 * 1024 * 1024,
  maximumUploadBytes: 32 * 1024 * 1024,
}

function rpc(body: unknown) {
  return new Request("http://localhost:8787/v1/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("mcp endpoint", () => {
  test("initializes and lists the hosted registry", async () => {
    const handler = createApiHandler({ config, env: {} })
    const init = (await (
      await handler(
        rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      )
    ).json()) as { result: { protocolVersion: string; serverInfo: { name: string } } }
    expect(init.result.protocolVersion).toBe("2025-11-25")
    expect(init.result.serverInfo.name).toBe("hraness-slopcamera-api")

    const list = (await (
      await handler(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }))
    ).json()) as { result: { tools: Array<{ name: string }> } }
    const names = list.result.tools.map((tool) => tool.name)
    expect(names).toContain("check_diagram")
    expect(names).toContain("execute_slopcamera")
  })

  test("calls a tool through JSON-RPC with inline files", async () => {
    const handler = createApiHandler({ config, env: {} })
    const response = (await (
      await handler(
        rpc({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "check_diagram",
            arguments: {
              path: "example.diagram.json",
              files: { "example.diagram.json": { text: DIAGRAM } },
            },
          },
        }),
      )
    ).json()) as {
      result: {
        structuredContent: { ok: boolean; result: { summary: { shapeCount: number } } }
        isError?: boolean
      }
    }
    expect(response.result.isError).toBeUndefined()
    expect(response.result.structuredContent.ok).toBe(true)
    expect(response.result.structuredContent.result.summary.shapeCount).toBe(3)
  })

  test("accepts notifications and rejects unknown methods", async () => {
    const handler = createApiHandler({ config, env: {} })
    const notification = await handler(
      rpc({ jsonrpc: "2.0", method: "notifications/initialized" }),
    )
    expect(notification.status).toBe(202)

    const unknown = (await (
      await handler(rpc({ jsonrpc: "2.0", id: 4, method: "resources/list" }))
    ).json()) as { error: { code: number } }
    expect(unknown.error.code).toBe(-32601)
  })
})

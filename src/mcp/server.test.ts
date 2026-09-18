import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { HostResourceCoordinator } from "../host-resources.ts"
import { createSpatialSceneStarter } from "../spatial-scene/authoring.ts"
import { runMcpServer } from "./server.ts"

/** Hermetic admission: machine-global contention belongs to host-resource tests. */
const testCoordinator: HostResourceCoordinator = {
  profile: { id: "slopcamera.mcp-server-test/v1", capacities: [] },
  scope: "process",
  async withLease(claims, callback) {
    return await callback({
      claims,
      inheritedFileDescriptor: -1,
      profile: { id: "slopcamera.mcp-server-test/v1", capacities: [] },
      ticket: "1",
      assertOwned: () => Promise.resolve(),
    })
  },
}

async function runSession(
  rootDirectory: string,
  messages: readonly unknown[],
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const output: string[] = []
  async function* input() {
    for (const message of messages) {
      yield `${typeof message === "string" ? message : JSON.stringify(message)}\n`
    }
  }
  await runMcpServer({
    rootDirectory,
    input: input(),
    writeLine: (line) => {
      output.push(line)
    },
    hostResourceCoordinator: testCoordinator,
  })
  return output.map((line) => JSON.parse(line) as Readonly<Record<string, unknown>>)
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "slopcamera-test", version: "1" },
  },
} as const

const initialized = {
  jsonrpc: "2.0",
  method: "notifications/initialized",
} as const

describe("Slopcamera MCP stdio server", () => {
  test("handshakes, preserves compatibility tools, and searches/executes semantic operations", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-server-"))
    try {
      await writeFile(
        join(root, "flow.diagram.json"),
        JSON.stringify({
          version: 1,
          name: "flow",
          canvas: { width: 800, height: 300 },
          layout: { type: "stack", direction: "horizontal" },
          shapes: [
            { id: "one", type: "rect", width: 160, height: 100 },
            { id: "two", type: "rect", width: 160, height: 100 },
          ],
          edges: [{ id: "one-two", from: "one", to: "two" }],
        }),
      )
      await writeFile(
        join(root, "scene.json"),
        JSON.stringify(createSpatialSceneStarter()),
      )
      const responses = await runSession(root, [
        initialize,
        initialized,
        { jsonrpc: "2.0", id: 2, method: "ping" },
        { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "check_diagram",
            arguments: { path: "flow.diagram.json" },
          },
        },
        {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "search_slopcamera",
            arguments: { query: "diagram" },
          },
        },
        {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "execute_slopcamera",
            arguments: {
              operation: "slopcamera.diagram.check",
              input: { path: "flow.diagram.json" },
            },
          },
        },
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: {
            name: "check_scene",
            arguments: { path: "scene.json" },
          },
        },
      ])

      expect(responses).toHaveLength(7)
      expect(responses[0]?.result).toMatchObject({
        protocolVersion: "2025-11-25",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "hraness-slopcamera", version: "3.2.8" },
      })
      const listed = responses[2]?.result as {
        readonly tools: readonly Readonly<Record<string, unknown>>[]
      }
      expect(listed.tools.map(({ name }) => name)).toEqual([
        "check_diagram",
        "render_diagram",
        "search_slopcamera",
        "execute_slopcamera",
        "check_scene",
        "inspect_scene",
        "audit_scene",
        "diff_scenes",
        "evaluate_scene",
        "check_scene_direction",
        "plan_scene_direction",
        "plan_scene_gallery",
        "check_scene_effects",
        "plan_scene_effects",
        "audit_scene_temporal",
      ])
      expect(listed.tools[0]?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      })
      expect(listed.tools[3]?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      })
      for (const tool of listed.tools.slice(4)) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
        })
      }
      expect(responses[3]?.result).toMatchObject({
        structuredContent: {
          ok: true,
          source: "flow.diagram.json",
        },
      })
      expect(responses[3]?.result).not.toHaveProperty("isError")
      expect(responses[4]?.result).toMatchObject({
        structuredContent: {
          ok: true,
          operations: [
            { code: "slopcamera.diagram.check" },
            { code: "slopcamera.diagram.render" },
          ],
        },
      })
      expect(responses[5]?.result).toMatchObject({
        structuredContent: {
          ok: true,
          operation: "slopcamera.diagram.check",
          result: {
            ok: true,
            source: "flow.diagram.json",
          },
        },
      })
      expect(responses[6]?.result).toMatchObject({
        structuredContent: {
          ok: true,
          source: "scene.json",
          sceneId: "scene_starter",
          summary: { entityCount: 4, cameraCount: 1 },
        },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects normal operations before initialization and frames errors as JSON-RPC", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-lifecycle-"))
    try {
      const responses = await runSession(root, [
        { jsonrpc: "2.0", id: "early", method: "tools/list" },
        "{not-json",
        [],
      ])
      expect(responses).toEqual([
        {
          jsonrpc: "2.0",
          id: "early",
          error: { code: -32002, message: "Server is not initialized" },
        },
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        },
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid Request" },
        },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects invalid request ids and incomplete initialize parameters", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-invalid-init-"))
    try {
      const responses = await runSession(root, [
        { jsonrpc: "2.0", id: null, method: "initialize", params: initialize.params },
        { jsonrpc: "2.0", id: 1.5, method: "initialize", params: initialize.params },
        { jsonrpc: "2.0", id: 2, method: "initialize", params: {} },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "slopcamera-test" },
          },
        },
      ])
      expect(responses).toEqual([
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid Request" },
        },
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid Request" },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          error: { code: -32602, message: "Invalid initialize parameters" },
        },
        {
          jsonrpc: "2.0",
          id: 3,
          error: { code: -32602, message: "Invalid initialize parameters" },
        },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects an initialized request with an id and caps an unterminated message", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-framing-"))
    try {
      const output: string[] = []
      async function* input() {
        yield `${JSON.stringify(initialize)}\n`
        yield `${JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
          method: "notifications/initialized",
        })}\n`
        yield "x".repeat(1024 * 1024 + 1)
      }
      await runMcpServer({
        rootDirectory: root,
        input: input(),
        writeLine: (line) => {
          output.push(line)
        },
      })
      expect(output.map((line) => JSON.parse(line))).toEqual([
        expect.objectContaining({ id: 1 }),
        {
          jsonrpc: "2.0",
          id: 9,
          error: { code: -32600, message: "Invalid Request" },
        },
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("returns tool failures as successful JSON-RPC envelopes with isError", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-tool-error-"))
    try {
      const responses = await runSession(root, [
        initialize,
        initialized,
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: {
            name: "check_diagram",
            arguments: { path: "../outside.diagram.json" },
          },
        },
      ])
      expect(responses[1]).toMatchObject({
        jsonrpc: "2.0",
        id: 7,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: expect.stringContaining("[INVALID_PATH]"),
            },
          ],
        },
      })
      expect(responses[1]?.result).not.toHaveProperty("structuredContent")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects unknown tool names as invalid JSON-RPC parameters", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-unknown-tool-"))
    try {
      const responses = await runSession(root, [
        initialize,
        initialized,
        {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: {
            name: "delete_diagram",
            arguments: {},
          },
        },
      ])
      expect(responses[1]).toEqual({
        jsonrpc: "2.0",
        id: 8,
        error: { code: -32602, message: "Unknown tool" },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

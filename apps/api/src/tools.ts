import {
  slopcameraMcpTools,
  SlopcameraMcpToolRuntime,
} from "../../../src/mcp/tools.js"
import type { McpToolDefinition, McpToolResult } from "../../../src/mcp/types.js"
import { invalidRequest, isRecord } from "./errors.ts"

/**
 * The hosted tool surface. Every entry delegates to the canonical MCP
 * runtime over a per-request ephemeral workspace; the workspace is the only
 * difference between local and hosted execution.
 *
 * Tiers:
 *  - "free"   anonymous, rate-limited, read-only or compute-light.
 *  - "render" anonymous but CPU-bound; tighter rate limit.
 *  - "paid"   requires a Credits device token; the handler holds, runs, then
 *             settles with the reported upstream cost.
 */

export type ToolTier = "free" | "render" | "paid"

export interface HostedTool {
  readonly name: string
  readonly tier: ToolTier
  readonly definition: McpToolDefinition
}

const FREE_TOOL_NAMES = [
  "check_diagram",
  "search_slopcamera",
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
  "check_scene_behavior",
  "audit_scene_behavior",
  "audit_scene_temporal",
] as const

const RENDER_TOOL_NAMES = ["render_diagram"] as const

/** The only hosted operation: bounded single-image Gateway generation. */
export const PAID_OPERATION = "slopcamera.image.generate"
export const CREDITS_OPERATION = "image_generate"

function toolDefinition(name: string): McpToolDefinition {
  const definition = slopcameraMcpTools.find((tool) => tool.name === name)
  if (definition === undefined) {
    throw new Error(`hosted registry references unknown tool ${name}`)
  }
  return definition
}

function paidExecuteDefinition(): McpToolDefinition {
  const base = toolDefinition("execute_slopcamera")
  return {
    ...base,
    description:
      "Run one bounded hosted operation. The hosted service currently admits only slopcamera.image.generate, billed through Hraness Credits.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["operation", "input"],
      properties: {
        operation: { type: "string", enum: [PAID_OPERATION] },
        input: {
          type: "object",
          description:
            "Typed input for slopcamera.image.generate: model (provider/model), prompt, outputPath (.png/.jpg/.webp).",
        },
      },
    },
  }
}

export const hostedTools: readonly HostedTool[] = [
  ...FREE_TOOL_NAMES.map((name) => ({
    name,
    tier: "free" as const,
    definition: toolDefinition(name),
  })),
  ...RENDER_TOOL_NAMES.map((name) => ({
    name,
    tier: "render" as const,
    definition: toolDefinition(name),
  })),
  {
    name: "execute_slopcamera",
    tier: "paid" as const,
    definition: paidExecuteDefinition(),
  },
]

export function hostedTool(name: string): HostedTool | undefined {
  return hostedTools.find((tool) => tool.name === name)
}

function paidArguments(
  args: unknown,
): { operation: string; input: Record<string, unknown> } {
  if (!isRecord(args)) {
    throw invalidRequest("arguments must be an object.")
  }
  if (args.operation !== PAID_OPERATION) {
    throw invalidRequest(
      `Hosted execute_slopcamera admits only ${PAID_OPERATION}.`,
    )
  }
  const input = isRecord(args.input) ? { ...args.input } : {}
  return { operation: PAID_OPERATION, input }
}

/**
 * The model id a paid call requests, used for admission and ceiling pricing
 * before any provider work begins. Throws unless the model is allowlisted.
 */
export function paidOperationModel(
  args: unknown,
  modelCostsMicroUsd: Readonly<Record<string, number>>,
): { model: string; ceilingMicroUsd: number } {
  const { input } = paidArguments(args)
  const model = input.model
  if (typeof model !== "string") {
    throw invalidRequest("input.model must be a provider/model id string.")
  }
  const ceiling = modelCostsMicroUsd[model]
  if (ceiling === undefined) {
    throw invalidRequest(
      `Model ${JSON.stringify(model)} is not admitted by this service.`,
    )
  }
  return { model, ceilingMicroUsd: ceiling }
}

/**
 * Invoke one hosted tool inside a prepared workspace. The runtime is created
 * per request so no caller state can leak between calls. Paid calls get a
 * pinned `generated/` output path so artifact harvest is unambiguous.
 */
export async function callHostedTool(
  tool: HostedTool,
  args: unknown,
  workspaceDirectory: string,
  environment: Record<string, string | undefined>,
): Promise<McpToolResult> {
  let effectiveArgs = args
  if (tool.tier === "paid") {
    const { operation, input } = paidArguments(args)
    const requested =
      typeof input.outputPath === "string" ? input.outputPath : "image.png"
    const extension = requested.match(/\.(png|jpe?g|webp)$/iu)?.[1] ?? "png"
    effectiveArgs = {
      operation,
      input: {
        ...input,
        outputPath: `generated/image.${extension.toLowerCase()}`,
      },
    }
  }

  const runtime = await SlopcameraMcpToolRuntime.create(workspaceDirectory, {
    environment,
  })
  return await runtime.call(tool.name, effectiveArgs)
}

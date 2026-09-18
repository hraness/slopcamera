import type { SlopcameraGenerateDependencies } from "../generate.js"
import type { HostResourceCoordinator } from "../host-resources.js"

export type JsonRpcId = string | number
export type JsonRpcResponseId = JsonRpcId | null

export interface JsonRpcSuccess {
  readonly jsonrpc: "2.0"
  readonly id: JsonRpcId
  readonly result: unknown
}

export interface JsonRpcFailure {
  readonly jsonrpc: "2.0"
  readonly id: JsonRpcResponseId
  readonly error: {
    readonly code: number
    readonly message: string
  }
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure

export interface McpTextContent {
  readonly type: "text"
  readonly text: string
}

export interface McpToolResult {
  readonly content: readonly McpTextContent[]
  readonly structuredContent?: Readonly<Record<string, unknown>>
  readonly isError?: true
}

export interface McpToolDefinition {
  readonly name:
    | "check_diagram"
    | "render_diagram"
    | "search_slopcamera"
    | "execute_slopcamera"
    | "check_scene"
    | "inspect_scene"
    | "audit_scene"
    | "diff_scenes"
    | "evaluate_scene"
    | "check_scene_direction"
    | "plan_scene_direction"
    | "plan_scene_gallery"
    | "check_scene_effects"
    | "plan_scene_effects"
    | "audit_scene_temporal"
  readonly title: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly outputSchema: Readonly<Record<string, unknown>>
  readonly annotations: {
    readonly title: string
    readonly readOnlyHint: boolean
    readonly destructiveHint: boolean
    readonly idempotentHint: boolean
    readonly openWorldHint: boolean
  }
}

export interface McpServerOptions {
  /**
   * The only filesystem root visible to the server. Defaults to process.cwd().
   * The directory must already exist.
   */
  readonly rootDirectory?: string
  /**
   * An injectable newline-delimited input stream. Defaults to process.stdin.
   */
  readonly input?: AsyncIterable<string | Uint8Array>
  /**
   * Receives one compact JSON-RPC response without a trailing newline.
   * Defaults to writing one newline-terminated response to process.stdout.
   */
  readonly writeLine?: (line: string) => void | Promise<void>
  readonly serverVersion?: string
  /** Injectable Gateway runtime, environment, and fixed-origin fetch seams. */
  readonly generateDependencies?: SlopcameraGenerateDependencies
  /**
   * Injectable host-resource admission coordinator. Defaults to the
   * machine-global coordinator; tests inject a process-local stand-in.
   */
  readonly hostResourceCoordinator?: HostResourceCoordinator
}

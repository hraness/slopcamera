import { rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { SlopcameraCodeError } from "../code/errors.js"
import { SlopcameraCloudError } from "../cloud-errors.js"
import {
  generateSlopcameraImageFile,
  type SlopcameraGenerateDependencies,
} from "../generate.js"
import { generateSlopcameraImageGallery } from "../image-gallery.js"
import { builtInIcons } from "../icons.js"
import { lintDiagram } from "../lint.js"
import {
  SlopcameraOperationError,
  slopcameraOperationCodes,
  parseSlopcameraOperationInput,
  searchSlopcameraOperations,
  withSlopcameraOperationHostAdmission,
  type CheckSlopcameraOperationInput,
  type GallerySlopcameraOperationInput,
  type GenerateSlopcameraOperationInput,
  type SlopcameraOperationCode,
  type RenderSlopcameraOperationInput,
  type VectorizeSlopcameraOperationInput,
} from "../operations.js"
import {
  createDefaultHostResourceCoordinator,
  HostResourceError,
  type HostResourceCoordinator,
  type HostResourceLease,
} from "../host-resources.js"
import { DiagramValidationError, parseDiagramSpec } from "../parse.js"
import { renderPng, renderSvg } from "../render.js"
import {
  auditSpatialScene,
  normalizeSpatialAuditAssetBounds,
  SPATIAL_AUDIT_LIMITS,
  type SpatialAuditEntity,
} from "../spatial-scene/audit.js"
import {
  SPATIAL_SCENE_LIMITS,
  type SpatialSceneV1,
} from "../spatial-scene/contracts.js"
import { evaluateSpatialScene } from "../spatial-scene/evaluate.js"
import {
  parseSpatialScene,
  SpatialSceneError,
  spatialValueSha256,
} from "../spatial-scene/identity.js"
import { inspectSpatialScene } from "../spatial-scene/inspect.js"
import { diffSpatialScenes } from "../spatial-scene/patch.js"
import { serializeTldr } from "../tldr.js"
import type {
  DiagramConfig,
  DiagramSpec,
  LintFinding,
  RenderArtifacts,
} from "../types.js"
import {
  vectorizeHardLimits,
  vectorizeImage,
  VectorizeError,
} from "../vectorize/index.js"
import {
  WorkspaceBoundary,
  WorkspaceBoundaryError,
  type WorkspaceSource,
} from "./boundary.js"
import type {
  McpToolDefinition,
  McpToolResult,
} from "./types.js"

export const mcpMaximumScale = 4
export const mcpMaximumRenderedPixels = 16_777_216
export const mcpMaximumShapes = 64
export const mcpMaximumEdges = 128
export const mcpMaximumReturnedFindings = 40
export const mcpMaximumReturnedEntities = 256
export const mcpMaximumReturnedAuditSamples = 8_192
export const mcpMaximumReturnedDiffEntries = 1_024

const defaultScale = 2
const maximumShapeIdsPerFinding = 12
const builtInConfig: DiagramConfig = Object.freeze({ icons: builtInIcons })

const findingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "shapeIds"],
  properties: {
    code: { type: "string" },
    message: { type: "string" },
    shapeIds: { type: "array", items: { type: "string" } },
  },
} as const

const scenePathSchema = {
  type: "string",
  description:
    "Root-relative path to a spatial scene JSON source (1 MiB maximum).",
} as const

const sceneCameraIdSchema = {
  type: "string",
  maxLength: 128,
  pattern: "^camera_[a-zA-Z0-9][a-zA-Z0-9_-]*$",
  description: "Identifier of a camera declared by the scene (camera_…).",
} as const

const entityTruncationSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["entityCount", "returnedEntityCount", "entitiesTruncated"],
  properties: {
    entityCount: { type: "integer", minimum: 0 },
    returnedEntityCount: { type: "integer", minimum: 0 },
    entitiesTruncated: { type: "boolean" },
  },
} as const

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value
  }
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

export const slopcameraMcpTools: readonly McpToolDefinition[] = deepFreeze([
  {
    name: "check_diagram",
    title: "Check diagram",
    description:
      "Parse and lint one root-relative Slopcamera diagram source without changing files. Uses only built-in icons and themes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description: "Root-relative path to a diagram JSON source (1 MiB maximum).",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "source", "findings", "summary"],
      properties: {
        ok: { const: true },
        source: { type: "string" },
        findings: { type: "array", items: findingSchema },
        summary: {
          type: "object",
          additionalProperties: false,
          required: [
            "shapeCount",
            "edgeCount",
            "findingCount",
            "returnedFindingCount",
            "findingsTruncated",
          ],
          properties: {
            shapeCount: { type: "integer", minimum: 0 },
            edgeCount: { type: "integer", minimum: 0 },
            findingCount: { type: "integer", minimum: 0 },
            returnedFindingCount: { type: "integer", minimum: 0 },
            findingsTruncated: { type: "boolean" },
          },
        },
      },
    },
    annotations: {
      title: "Check diagram",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "render_diagram",
    title: "Render diagram",
    description:
      "Render one root-relative Slopcamera diagram source with built-in icons and themes, overwriting its paired .tldr, light/dark SVG, and light/dark PNG artifacts.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description: "Root-relative path to a diagram JSON source (1 MiB maximum).",
        },
        out_dir: {
          type: "string",
          description:
            "Optional root-relative output directory. Defaults to the source directory.",
        },
        scale: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: mcpMaximumScale,
          default: defaultScale,
          description: "PNG scale. The scaled canvas may contain at most 16,777,216 pixels.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "source", "scale", "findings", "artifacts", "summary"],
      properties: {
        ok: { const: true },
        source: { type: "string" },
        scale: { type: "number" },
        findings: { type: "array", items: findingSchema },
        artifacts: {
          type: "object",
          additionalProperties: false,
          required: ["tldr", "lightSvg", "darkSvg", "lightPng", "darkPng"],
          properties: {
            tldr: { type: "string" },
            lightSvg: { type: "string" },
            darkSvg: { type: "string" },
            lightPng: { type: "string" },
            darkPng: { type: "string" },
          },
        },
        summary: {
          type: "object",
          additionalProperties: false,
          required: [
            "shapeCount",
            "edgeCount",
            "findingCount",
            "returnedFindingCount",
            "findingsTruncated",
          ],
          properties: {
            shapeCount: { type: "integer", minimum: 0 },
            edgeCount: { type: "integer", minimum: 0 },
            findingCount: { type: "integer", minimum: 0 },
            returnedFindingCount: { type: "integer", minimum: 0 },
            findingsTruncated: { type: "boolean" },
          },
        },
      },
    },
    annotations: {
      title: "Render diagram",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "search_slopcamera",
    title: "Search Slopcamera operations",
    description:
      "Search the fixed semantic Slopcamera operation registry by bounded text. This never executes code or changes files.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          maxLength: 200,
          description: "Optional terms matched against operation codes and descriptions.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 4,
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "operations"],
      properties: {
        ok: { const: true },
        operations: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            required: [
              "code",
              "title",
              "description",
              "execution",
              "authentication",
              "inputSchema",
            ],
          },
        },
      },
    },
    annotations: {
      title: "Search Slopcamera operations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "execute_slopcamera",
    title: "Execute Slopcamera operation",
    description:
      "Execute one exact operation code with typed JSON input. Never accepts or evaluates source code. Local paths remain confined to the configured workspace root.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["operation", "input"],
      properties: {
        operation: {
          type: "string",
          enum: slopcameraOperationCodes,
        },
        input: {
          type: "object",
          description:
            "Typed input matching the selected operation's registry schema.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "operation", "result"],
      properties: {
        ok: { const: true },
        operation: { type: "string", enum: slopcameraOperationCodes },
        result: { type: "object" },
      },
    },
    annotations: {
      title: "Execute Slopcamera operation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "check_scene",
    title: "Check scene",
    description:
      "Parse and validate one root-relative Slopcamera spatial scene JSON source without changing files.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: { path: scenePathSchema },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "source", "sceneId", "sceneSha256", "summary"],
      properties: {
        ok: { const: true },
        source: { type: "string" },
        sceneId: { type: "string" },
        sceneSha256: { type: "string" },
        summary: {
          type: "object",
          additionalProperties: false,
          required: [
            "durationUs",
            "entityCount",
            "cameraCount",
            "assetCount",
            "animationCount",
            "generatorCount",
            "overrideCount",
          ],
          properties: {
            durationUs: { type: "integer", minimum: 0 },
            entityCount: { type: "integer", minimum: 0 },
            cameraCount: { type: "integer", minimum: 0 },
            assetCount: { type: "integer", minimum: 0 },
            animationCount: { type: "integer", minimum: 0 },
            generatorCount: { type: "integer", minimum: 0 },
            overrideCount: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    annotations: {
      title: "Check scene",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "inspect_scene",
    title: "Inspect scene",
    description:
      "Snapshot one root-relative spatial scene's entities, editable controls, placements, assets, and generators without changing files.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: { path: scenePathSchema },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "source", "inspection", "summary"],
      properties: {
        ok: { const: true },
        source: { type: "string" },
        inspection: { type: "object" },
        summary: entityTruncationSummarySchema,
      },
    },
    annotations: {
      title: "Inspect scene",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "audit_scene",
    title: "Audit scene",
    description:
      "Sample one root-relative spatial scene against a camera and report per-entity geometric coverage, visibility findings, and bounds gaps. Optional asset_bounds accepts a Record<assetId,{min,max}> map, a slopcamera.spatial-asset-admission document, a {manifest,facts} pair, or an array of those.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "camera_id"],
      properties: {
        path: scenePathSchema,
        camera_id: sceneCameraIdSchema,
        times_us: {
          type: "array",
          items: {
            type: "integer",
            minimum: 0,
            maximum: SPATIAL_SCENE_LIMITS.durationUs,
          },
          minItems: 1,
          maxItems: SPATIAL_AUDIT_LIMITS.samples,
          description:
            "Optional sample times in microseconds. Defaults to evenly spaced coverage of the scene duration.",
        },
        asset_bounds: {
          description:
            "Optional decoded scene-space asset bounds: a Record<assetId,{min,max}> map, a slopcamera.spatial-asset-admission document, a {manifest,facts} pair, or an array of those documents.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "source", "report", "summary"],
      properties: {
        ok: { const: true },
        source: { type: "string" },
        report: { type: "object" },
        summary: {
          type: "object",
          additionalProperties: false,
          required: [
            "findingCount",
            "returnedFindingCount",
            "findingsTruncated",
            "entityCount",
            "returnedEntityCount",
            "entitiesTruncated",
          ],
          properties: {
            findingCount: { type: "integer", minimum: 0 },
            returnedFindingCount: { type: "integer", minimum: 0 },
            findingsTruncated: { type: "boolean" },
            entityCount: { type: "integer", minimum: 0 },
            returnedEntityCount: { type: "integer", minimum: 0 },
            entitiesTruncated: { type: "boolean" },
          },
        },
      },
    },
    annotations: {
      title: "Audit scene",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "diff_scenes",
    title: "Diff scenes",
    description:
      "Compare two root-relative spatial scene JSON sources and report added, removed, and changed collection entries without changing files.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "other"],
      properties: {
        path: scenePathSchema,
        other: {
          type: "string",
          description:
            "Root-relative path to the second spatial scene JSON source (1 MiB maximum).",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "ok",
        "source",
        "other",
        "sceneSha256",
        "otherSha256",
        "diff",
        "summary",
      ],
      properties: {
        ok: { const: true },
        source: { type: "string" },
        other: { type: "string" },
        sceneSha256: { type: "string" },
        otherSha256: { type: "string" },
        diff: { type: "array" },
        summary: {
          type: "object",
          additionalProperties: false,
          required: ["entryCount", "returnedEntryCount", "diffTruncated"],
          properties: {
            entryCount: { type: "integer", minimum: 0 },
            returnedEntryCount: { type: "integer", minimum: 0 },
            diffTruncated: { type: "boolean" },
          },
        },
      },
    },
    annotations: {
      title: "Diff scenes",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "evaluate_scene",
    title: "Evaluate scene",
    description:
      "Evaluate one root-relative spatial scene at one camera and integer microsecond time into an immutable snapshot without changing files.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "camera_id", "time_us"],
      properties: {
        path: scenePathSchema,
        camera_id: sceneCameraIdSchema,
        time_us: {
          type: "integer",
          minimum: 0,
          maximum: SPATIAL_SCENE_LIMITS.durationUs,
          description: "Evaluation time in integer microseconds.",
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "source", "snapshot", "summary"],
      properties: {
        ok: { const: true },
        source: { type: "string" },
        snapshot: { type: "object" },
        summary: entityTruncationSummarySchema,
      },
    },
    annotations: {
      title: "Evaluate scene",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
])

class ToolFailure extends Error {
  readonly code: string
  readonly issues?: readonly string[]

  constructor(code: string, message: string, issues?: readonly string[]) {
    super(message)
    this.name = "ToolFailure"
    this.code = code
    if (issues !== undefined) this.issues = issues
  }
}

interface ParsedCheckArguments {
  readonly path: string
}

interface ParsedRenderArguments extends ParsedCheckArguments {
  readonly outDirectory?: string
  readonly scale: number
}

interface ParsedSearchArguments {
  readonly query: string
  readonly limit: number
}

interface ParsedExecuteArguments {
  readonly operation: SlopcameraOperationCode
  readonly input: unknown
}

interface ParsedSceneSourceArguments {
  readonly path: string
}

interface ParsedAuditSceneArguments extends ParsedSceneSourceArguments {
  readonly cameraId: string
  readonly timesUs?: readonly number[]
  readonly assetBounds?: unknown
}

interface ParsedDiffScenesArguments extends ParsedSceneSourceArguments {
  readonly other: string
}

interface ParsedEvaluateSceneArguments extends ParsedSceneSourceArguments {
  readonly cameraId: string
  readonly timeUs: number
}

interface LoadedScene {
  readonly source: WorkspaceSource
  readonly scene: SpatialSceneV1
}

interface LoadedDiagram {
  readonly source: WorkspaceSource
  readonly spec: DiagramSpec
}

interface PublicArtifactPaths {
  readonly tldr: string
  readonly lightSvg: string
  readonly darkSvg: string
  readonly lightPng: string
  readonly darkPng: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function safeFragment(value: string, maximumLength = 160): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength)
}

function safeIssues(issues: readonly string[]): readonly string[] {
  return issues.slice(0, 24).map((issue) => safeFragment(issue, 240))
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length > 0) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      `Unsupported argument: ${safeFragment(unknown[0] ?? "unknown")}.`,
    )
  }
}

function parsePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      "path must be a non-empty root-relative string.",
    )
  }
  if (!value.toLowerCase().endsWith(".diagram.json")) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      "path must end in .diagram.json.",
    )
  }
  return value
}

function parseCheckArguments(value: unknown): ParsedCheckArguments {
  if (!isRecord(value)) {
    throw new ToolFailure("INVALID_ARGUMENTS", "Tool arguments must be an object.")
  }
  rejectUnknownKeys(value, new Set(["path"]))
  return { path: parsePath(value.path) }
}

function parseRenderArguments(value: unknown): ParsedRenderArguments {
  if (!isRecord(value)) {
    throw new ToolFailure("INVALID_ARGUMENTS", "Tool arguments must be an object.")
  }
  rejectUnknownKeys(value, new Set(["path", "out_dir", "scale"]))
  const outDirectory = value.out_dir
  if (
    outDirectory !== undefined &&
    (typeof outDirectory !== "string" || outDirectory.length === 0)
  ) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      "out_dir must be a non-empty root-relative string when present.",
    )
  }
  const scale = value.scale ?? defaultScale
  if (
    typeof scale !== "number" ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > mcpMaximumScale
  ) {
    throw new ToolFailure(
      "RENDER_LIMIT",
      `scale must be greater than zero and no more than ${mcpMaximumScale}.`,
    )
  }
  return {
    path: parsePath(value.path),
    ...(outDirectory === undefined ? {} : { outDirectory }),
    scale,
  }
}

function parseSearchArguments(value: unknown): ParsedSearchArguments {
  if (!isRecord(value)) {
    throw new ToolFailure("INVALID_ARGUMENTS", "Tool arguments must be an object.")
  }
  rejectUnknownKeys(value, new Set(["query", "limit"]))
  const query = value.query ?? ""
  const limit = value.limit ?? slopcameraOperationCodes.length
  if (
    typeof query !== "string" ||
    query.length > 200 ||
    /[\u0000-\u001f\u007f]/u.test(query) ||
    !Number.isInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > 20
  ) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      "query must be a bounded string and limit must be an integer from 1 through 20.",
    )
  }
  return { query, limit: limit as number }
}

function parseExecuteArguments(value: unknown): ParsedExecuteArguments {
  if (!isRecord(value)) {
    throw new ToolFailure("INVALID_ARGUMENTS", "Tool arguments must be an object.")
  }
  rejectUnknownKeys(value, new Set(["operation", "input"]))
  if (
    typeof value.operation !== "string" ||
    !slopcameraOperationCodes.includes(value.operation as SlopcameraOperationCode) ||
    !isRecord(value.input)
  ) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      "operation must be an exact Slopcamera operation code and input must be an object.",
    )
  }
  return {
    operation: value.operation as SlopcameraOperationCode,
    input: value.input,
  }
}

const sceneCameraIdPattern = /^camera_[a-zA-Z0-9][a-zA-Z0-9_-]*$/u

function parseScenePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      `${label} must be a non-empty root-relative string.`,
    )
  }
  if (!value.toLowerCase().endsWith(".json")) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      `${label} must end in .json.`,
    )
  }
  return value
}

function parseSceneCameraId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !sceneCameraIdPattern.test(value)
  ) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      "camera_id must be a scene camera identifier (camera_ followed by letters, digits, _ or -).",
    )
  }
  return value
}

function parseSceneSourceArguments(value: unknown): ParsedSceneSourceArguments {
  if (!isRecord(value)) {
    throw new ToolFailure("INVALID_ARGUMENTS", "Tool arguments must be an object.")
  }
  rejectUnknownKeys(value, new Set(["path"]))
  return { path: parseScenePath(value.path, "path") }
}

function parseAuditSceneArguments(value: unknown): ParsedAuditSceneArguments {
  if (!isRecord(value)) {
    throw new ToolFailure("INVALID_ARGUMENTS", "Tool arguments must be an object.")
  }
  rejectUnknownKeys(value, new Set(["path", "camera_id", "times_us", "asset_bounds"]))
  let timesUs: readonly number[] | undefined
  if (value.times_us !== undefined) {
    if (
      !Array.isArray(value.times_us) ||
      value.times_us.length === 0 ||
      value.times_us.length > SPATIAL_AUDIT_LIMITS.samples ||
      value.times_us.some((timeUs) => (
        !Number.isSafeInteger(timeUs) ||
        (timeUs as number) < 0 ||
        (timeUs as number) > SPATIAL_SCENE_LIMITS.durationUs
      ))
    ) {
      throw new ToolFailure(
        "INVALID_ARGUMENTS",
        `times_us must be an array of 1–${SPATIAL_AUDIT_LIMITS.samples} integer microsecond times within the scene duration bound.`,
      )
    }
    timesUs = [...value.times_us] as number[]
  }
  return {
    path: parseScenePath(value.path, "path"),
    cameraId: parseSceneCameraId(value.camera_id),
    ...(timesUs === undefined ? {} : { timesUs }),
    ...("asset_bounds" in value ? { assetBounds: value.asset_bounds } : {}),
  }
}

function parseDiffScenesArguments(value: unknown): ParsedDiffScenesArguments {
  if (!isRecord(value)) {
    throw new ToolFailure("INVALID_ARGUMENTS", "Tool arguments must be an object.")
  }
  rejectUnknownKeys(value, new Set(["path", "other"]))
  return {
    path: parseScenePath(value.path, "path"),
    other: parseScenePath(value.other, "other"),
  }
}

function parseEvaluateSceneArguments(value: unknown): ParsedEvaluateSceneArguments {
  if (!isRecord(value)) {
    throw new ToolFailure("INVALID_ARGUMENTS", "Tool arguments must be an object.")
  }
  rejectUnknownKeys(value, new Set(["path", "camera_id", "time_us"]))
  const timeUs = value.time_us
  if (
    typeof timeUs !== "number" ||
    !Number.isSafeInteger(timeUs) ||
    timeUs < 0 ||
    timeUs > SPATIAL_SCENE_LIMITS.durationUs
  ) {
    throw new ToolFailure(
      "INVALID_ARGUMENTS",
      `time_us must be an integer microsecond time from 0 through ${SPATIAL_SCENE_LIMITS.durationUs}.`,
    )
  }
  return {
    path: parseScenePath(value.path, "path"),
    cameraId: parseSceneCameraId(value.camera_id),
    timeUs,
  }
}

function assertBuiltInIcons(spec: DiagramSpec): void {
  for (const shape of spec.shapes) {
    if (
      (shape.type === "rect" || shape.type === "ellipse") &&
      shape.icon !== undefined &&
      !Object.hasOwn(builtInIcons, shape.icon)
    ) {
      throw new ToolFailure(
        "UNKNOWN_ICON",
        `Shape ${safeFragment(shape.id)} requests unavailable built-in icon ${safeFragment(shape.icon)}.`,
      )
    }
  }
}

function assertComplexityLimits(spec: DiagramSpec): void {
  const edgeCount = spec.edges?.length ?? 0
  if (spec.shapes.length > mcpMaximumShapes || edgeCount > mcpMaximumEdges) {
    throw new ToolFailure(
      "COMPLEXITY_LIMIT",
      `Diagram may contain at most ${mcpMaximumShapes} shapes and ${mcpMaximumEdges} edges in MCP mode.`,
    )
  }
}

function assertRawComplexityLimits(value: unknown): void {
  if (!isRecord(value)) return
  const shapeCount = Array.isArray(value.shapes) ? value.shapes.length : 0
  const edgeCount = Array.isArray(value.edges) ? value.edges.length : 0
  if (shapeCount > mcpMaximumShapes || edgeCount > mcpMaximumEdges) {
    throw new ToolFailure(
      "COMPLEXITY_LIMIT",
      `Diagram may contain at most ${mcpMaximumShapes} shapes and ${mcpMaximumEdges} edges in MCP mode.`,
    )
  }
}

function assertRenderLimits(spec: DiagramSpec, scale: number): void {
  const scaledWidth = spec.canvas.width * scale
  const scaledHeight = spec.canvas.height * scale
  const pixels = Math.ceil(scaledWidth) * Math.ceil(scaledHeight)
  if (
    !Number.isFinite(pixels) ||
    scaledWidth < 1 ||
    scaledHeight < 1 ||
    pixels > mcpMaximumRenderedPixels
  ) {
    throw new ToolFailure(
      "RENDER_LIMIT",
      `Scaled canvas must be at least 1 pixel on each axis and no more than ${mcpMaximumRenderedPixels.toLocaleString("en-US")} pixels total.`,
    )
  }
}

function boundedSlice<T>(items: readonly T[], maximum: number): readonly T[] {
  return items.length > maximum ? items.slice(0, maximum) : items
}

function publicFinding(finding: LintFinding): LintFinding {
  return {
    code: safeFragment(finding.code, 64),
    message: safeFragment(finding.message, 240),
    shapeIds: finding.shapeIds
      .slice(0, maximumShapeIdsPerFinding)
      .map((shapeId) => safeFragment(shapeId, 120)),
  }
}

function publicFindings(
  findings: readonly LintFinding[],
): readonly LintFinding[] {
  return findings
    .slice(0, mcpMaximumReturnedFindings)
    .map(publicFinding)
}

function diagramSummary(
  spec: DiagramSpec,
  findingCount: number,
  returnedFindingCount: number,
): Readonly<Record<string, number | boolean>> {
  return {
    shapeCount: spec.shapes.length,
    edgeCount: spec.edges?.length ?? 0,
    findingCount,
    returnedFindingCount,
    findingsTruncated: returnedFindingCount < findingCount,
  }
}

function successResult(
  text: string,
  structuredContent: Readonly<Record<string, unknown>>,
): McpToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  }
}

function failureResult(error: unknown): McpToolResult {
  let code = "INTERNAL_ERROR"
  let message = "The tool failed safely."
  let issues: readonly string[] | undefined

  if (error instanceof ToolFailure) {
    code = error.code
    message = safeFragment(error.message, 320)
    issues = error.issues
  } else if (error instanceof WorkspaceBoundaryError) {
    code = error.code
    message = safeFragment(error.message, 320)
  } else if (error instanceof SlopcameraCloudError) {
    code = error.code
    message = safeFragment(
      error.message.replace(/^\[[A-Z_]+\]\s*/u, ""),
      320,
    )
  } else if (error instanceof SlopcameraOperationError) {
    code = error.code
    message = safeFragment(
      error.message.replace(/^\[[A-Z_]+\]\s*/u, ""),
      320,
    )
  } else if (error instanceof VectorizeError) {
    code = `VECTORIZE_${error.code.toUpperCase()}`
    message = "Local vectorization failed safely."
  } else if (error instanceof DiagramValidationError) {
    code = "INVALID_DIAGRAM"
    message = "Diagram source did not pass validation."
    issues = safeIssues(error.issues)
  } else if (error instanceof SlopcameraCodeError) {
    code = error.code.toUpperCase().replace(/-/g, "_")
    message = safeFragment(error.message, 320)
  } else if (error instanceof HostResourceError) {
    code = `HOST_RESOURCE_${error.code}`
    message = "Host-resource admission failed safely."
  } else if (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray(error.issues) &&
    error.issues.every((issue) => typeof issue === "string")
  ) {
    code = "INVALID_LAYOUT"
    message = "Diagram layout could not be resolved."
    issues = safeIssues(error.issues)
  }

  const issueText =
    issues === undefined || issues.length === 0
      ? ""
      : `\n${issues.map((issue) => `- ${issue}`).join("\n")}`
  return {
    content: [{ type: "text", text: `[${code}] ${message}${issueText}` }],
    isError: true,
  }
}

function portableDirectory(filePath: string): string {
  const separator = filePath.lastIndexOf("/")
  return separator === -1 ? "." : filePath.slice(0, separator)
}

async function atomicOverwrite(
  filePath: string,
  data: string | Uint8Array,
): Promise<void> {
  const temporaryPath = join(
    dirname(filePath),
    `.${crypto.randomUUID()}.slopcamera-mcp.tmp`,
  )
  try {
    await writeFile(temporaryPath, data, { flag: "wx" })
    try {
      await rename(temporaryPath, filePath)
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined
      if (code !== "EEXIST" && code !== "EPERM") throw error
      // Windows does not consistently replace an existing destination with
      // rename. The render queue prevents another MCP render from racing this
      // narrow replacement fallback.
      await rm(filePath, { force: true })
      await rename(temporaryPath, filePath)
    }
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function loadDiagram(
  boundary: WorkspaceBoundary,
  path: string,
): Promise<LoadedDiagram> {
  const source = await boundary.readSource(path)
  let parsed: unknown
  try {
    parsed = JSON.parse(source.text)
  } catch {
    throw new ToolFailure("INVALID_JSON", "Diagram source is not valid JSON.")
  }
  assertRawComplexityLimits(parsed)
  const spec = parseDiagramSpec(parsed)
  assertComplexityLimits(spec)
  assertBuiltInIcons(spec)
  return { source, spec }
}

async function loadScene(
  boundary: WorkspaceBoundary,
  path: string,
): Promise<LoadedScene> {
  const source = await boundary.readSource(path, "Scene source")
  let parsed: unknown
  try {
    parsed = JSON.parse(source.text)
  } catch {
    throw new ToolFailure("INVALID_JSON", "Scene source is not valid JSON.")
  }
  try {
    return { source, scene: parseSpatialScene(parsed) }
  } catch (error) {
    if (error instanceof SpatialSceneError) {
      const where = error.path === "scene" ? "" : ` at ${error.path}`
      throw new ToolFailure(
        "INVALID_SCENE",
        `Scene source did not pass validation${where}: ${safeFragment(error.message, 240)}`,
      )
    }
    throw error
  }
}

export class SlopcameraMcpToolRuntime {
  readonly boundary: WorkspaceBoundary
  readonly generateDependencies: SlopcameraGenerateDependencies
  readonly hostResourceCoordinator: HostResourceCoordinator
  private renderQueue: Promise<void> = Promise.resolve()

  private constructor(
    boundary: WorkspaceBoundary,
    generateDependencies: SlopcameraGenerateDependencies,
    hostResourceCoordinator: HostResourceCoordinator,
  ) {
    this.boundary = boundary
    this.generateDependencies = generateDependencies
    this.hostResourceCoordinator = hostResourceCoordinator
  }

  static async create(
    rootDirectory: string,
    generateDependencies: SlopcameraGenerateDependencies = {},
    hostResourceCoordinator?: HostResourceCoordinator,
  ): Promise<SlopcameraMcpToolRuntime> {
    return new SlopcameraMcpToolRuntime(
      await WorkspaceBoundary.create(rootDirectory),
      generateDependencies,
      hostResourceCoordinator ?? createDefaultHostResourceCoordinator(),
    )
  }

  private async withHostAdmission<T>(
    operation: SlopcameraOperationCode,
    callback: (lease: HostResourceLease) => T | Promise<T>,
  ): Promise<T> {
    return await withSlopcameraOperationHostAdmission(operation, callback, {
      hostResourceCoordinator: this.hostResourceCoordinator,
    })
  }

  /**
   * Scene tools are dedicated read-only surface, not registry operations, so
   * they claim the diagram-check claim shape (cpu + local-io) directly.
   */
  private async withSceneAdmission<T>(
    callback: (lease: HostResourceLease) => T | Promise<T>,
  ): Promise<T> {
    return await this.hostResourceCoordinator.withLease(
      [
        { resource: "cpu", amount: 1 },
        { resource: "local-io", amount: 1 },
      ],
      async (lease) => {
        await lease.assertOwned()
        return await callback(lease)
      },
    )
  }

  private enqueueRender<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.renderQueue.then(operation, operation)
    this.renderQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async call(name: string, argumentsValue: unknown): Promise<McpToolResult> {
    try {
      if (name === "check_diagram") {
        const options = parseCheckArguments(argumentsValue)
        return await this.withHostAdmission(
          "slopcamera.diagram.check",
          async () => await this.check(options),
        )
      }
      if (name === "render_diagram") {
        const options = parseRenderArguments(argumentsValue)
        return await this.enqueueRender(async () => (
          await this.withHostAdmission(
            "slopcamera.diagram.render",
            async () => await this.render(options),
          )
        ))
      }
      if (name === "search_slopcamera") {
        const options = parseSearchArguments(argumentsValue)
        const operations = searchSlopcameraOperations(
          options.query,
          options.limit,
        )
        return successResult(
          `Found ${operations.length} Slopcamera operation${operations.length === 1 ? "" : "s"}.`,
          { ok: true, operations },
        )
      }
      if (name === "execute_slopcamera") {
        const options = parseExecuteArguments(argumentsValue)
        return await this.execute(options)
      }
      if (name === "check_scene") {
        const options = parseSceneSourceArguments(argumentsValue)
        return await this.withSceneAdmission(
          async () => await this.checkScene(options),
        )
      }
      if (name === "inspect_scene") {
        const options = parseSceneSourceArguments(argumentsValue)
        return await this.withSceneAdmission(
          async () => await this.inspectScene(options),
        )
      }
      if (name === "audit_scene") {
        const options = parseAuditSceneArguments(argumentsValue)
        return await this.withSceneAdmission(
          async () => await this.auditScene(options),
        )
      }
      if (name === "diff_scenes") {
        const options = parseDiffScenesArguments(argumentsValue)
        return await this.withSceneAdmission(
          async () => await this.diffScenes(options),
        )
      }
      if (name === "evaluate_scene") {
        const options = parseEvaluateSceneArguments(argumentsValue)
        return await this.withSceneAdmission(
          async () => await this.evaluateScene(options),
        )
      }
      throw new ToolFailure("UNKNOWN_TOOL", "Requested tool is not available.")
    } catch (error) {
      return failureResult(error)
    }
  }

  private wrapSemanticResult(
    operation: SlopcameraOperationCode,
    result: McpToolResult,
  ): McpToolResult {
    if (result.isError === true) return result
    return {
      content: result.content,
      structuredContent: {
        ok: true,
        operation,
        result: result.structuredContent ?? {},
      },
    }
  }

  private async execute(
    options: ParsedExecuteArguments,
  ): Promise<McpToolResult> {
    if (options.operation === "slopcamera.diagram.check") {
      const input = parseSlopcameraOperationInput(
        options.operation,
        options.input,
      ) as CheckSlopcameraOperationInput
      return this.wrapSemanticResult(
        options.operation,
        await this.withHostAdmission(
          options.operation,
          async () => await this.check({ path: input.path }),
        ),
      )
    }
    if (options.operation === "slopcamera.diagram.render") {
      const input = parseSlopcameraOperationInput(
        options.operation,
        options.input,
      ) as RenderSlopcameraOperationInput
      return this.enqueueRender(async () => await this.withHostAdmission(
        options.operation,
        async () => this.wrapSemanticResult(
          options.operation,
          await this.render({
            path: input.path,
            ...(input.outDirectory === undefined
              ? {}
              : { outDirectory: input.outDirectory }),
            scale: input.scale ?? defaultScale,
          }),
        ),
      ))
    }
    if (options.operation === "slopcamera.image.vectorize") {
      const input = parseSlopcameraOperationInput(
        options.operation,
        options.input,
      ) as VectorizeSlopcameraOperationInput
      return this.enqueueRender(async () => await this.withHostAdmission(
        options.operation,
        async (lease) => {
          const source = await this.boundary.resolveInputFile(
            input.inputPath,
            vectorizeHardLimits.maxInputBytes,
          )
          const output = await this.boundary.prepareOutputFile(input.outputPath)
          const result = await vectorizeImage(source.absolutePath, {
            outputPath: output.absolutePath,
            ...(input.duotone === undefined ? {} : { duotone: input.duotone }),
            ...(input.alphaCutoff === undefined
              ? {}
              : { alphaCutoff: input.alphaCutoff }),
            ...(input.timeoutMs === undefined
              ? {}
              : { limits: { maxDurationMs: input.timeoutMs } }),
            inheritedFileDescriptors: [lease.inheritedFileDescriptor],
          })
          return successResult(
            `Executed ${options.operation}: ${output.relativePath}`,
            {
              ok: true,
              operation: options.operation,
              result: {
                inputPath: source.relativePath,
                outputPath: output.relativePath,
                receipt: result.receipt,
              },
            },
          )
        },
      ))
    }
    if (options.operation === "slopcamera.image.gallery") {
      const input = parseSlopcameraOperationInput(
        options.operation,
        options.input,
      ) as GallerySlopcameraOperationInput
      return await this.withHostAdmission(options.operation, async () => {
        const output = await this.boundary.prepareOutputDirectory(input.outputDir)
        const receipt = await generateSlopcameraImageGallery(
          { ...input, outputDir: output.absolutePath },
          this.generateDependencies,
        )
        return successResult(
          `Executed ${options.operation}: ${receipt.counts.generated}/${receipt.counts.requested} candidates in ${output.relativePath}.`,
          {
            ok: true,
            operation: options.operation,
            result: {
              ...receipt,
              outputDir: output.relativePath,
            },
          },
        )
      })
    }
    return await this.withHostAdmission(options.operation, async () => {
      const input = parseSlopcameraOperationInput(
        options.operation,
        options.input,
      ) as GenerateSlopcameraOperationInput
      const output = await this.boundary.prepareOutputFile(input.outputPath)
      const generated = await generateSlopcameraImageFile(
        { ...input, outputPath: output.absolutePath },
        this.generateDependencies,
      )
      return successResult(
        `Executed ${options.operation}: ${output.relativePath} (request ${safeFragment(generated.requestId, 256)}).`,
        {
          ok: true,
          operation: options.operation,
          result: {
            bytes: generated.bytes,
            mediaType: generated.mediaType,
            model: generated.model,
            outputPath: output.relativePath,
            provider: generated.provider,
            requestId: generated.requestId,
            sha256: generated.sha256,
            warnings: generated.warnings,
          },
        },
      )
    })
  }

  private async check(options: ParsedCheckArguments): Promise<McpToolResult> {
    const { source, spec } = await loadDiagram(this.boundary, options.path)
    const allFindings = lintDiagram(spec)
    const findings = publicFindings(allFindings)
    const summary = diagramSummary(spec, allFindings.length, findings.length)
    const text =
      allFindings.length === 0
        ? `Checked ${source.relativePath}: no findings.`
        : `Checked ${source.relativePath}: ${allFindings.length} finding${allFindings.length === 1 ? "" : "s"}; ${findings.length} returned in structured content${findings.length < allFindings.length ? " (truncated)" : ""}.`
    return successResult(text, {
      ok: true,
      source: source.relativePath,
      findings,
      summary,
    })
  }

  private async render(options: ParsedRenderArguments): Promise<McpToolResult> {
    const { source, spec } = await loadDiagram(this.boundary, options.path)
    assertRenderLimits(spec, options.scale)
    const outputDirectory = await this.boundary.prepareOutputDirectory(
      options.outDirectory ?? portableDirectory(source.relativePath),
    )

    // Serialize before raster work so the existing generated-record budget is
    // enforced before a render can consume substantial CPU or write anything.
    const tldr = serializeTldr(spec, builtInConfig)
    const [light, dark] = await Promise.all([
      renderSvg(spec, "light", builtInConfig),
      renderSvg(spec, "dark", builtInConfig),
    ])
    const lightPng = renderPng(light, builtInConfig, options.scale)
    const darkPng = renderPng(dark, builtInConfig, options.scale)
    const absoluteArtifacts = {
      spec: source.absolutePath,
      tldr: join(outputDirectory.absolutePath, `${spec.name}.tldr`),
      lightSvg: join(outputDirectory.absolutePath, `${spec.name}.light.svg`),
      darkSvg: join(outputDirectory.absolutePath, `${spec.name}.dark.svg`),
      lightPng: join(outputDirectory.absolutePath, `${spec.name}.light.png`),
      darkPng: join(outputDirectory.absolutePath, `${spec.name}.dark.png`),
    } satisfies RenderArtifacts

    await Promise.all([
      atomicOverwrite(
        absoluteArtifacts.tldr,
        tldr,
      ),
      atomicOverwrite(absoluteArtifacts.lightSvg, light.svg),
      atomicOverwrite(absoluteArtifacts.darkSvg, dark.svg),
      atomicOverwrite(absoluteArtifacts.lightPng, lightPng),
      atomicOverwrite(absoluteArtifacts.darkPng, darkPng),
    ])

    const artifacts: PublicArtifactPaths = {
      tldr: this.boundary.toRelativePath(absoluteArtifacts.tldr),
      lightSvg: this.boundary.toRelativePath(absoluteArtifacts.lightSvg),
      darkSvg: this.boundary.toRelativePath(absoluteArtifacts.darkSvg),
      lightPng: this.boundary.toRelativePath(absoluteArtifacts.lightPng),
      darkPng: this.boundary.toRelativePath(absoluteArtifacts.darkPng),
    }
    const allFindings = lintDiagram(spec)
    const findings = publicFindings(allFindings)
    const summary = diagramSummary(spec, allFindings.length, findings.length)
    const text = [
      `Rendered ${source.relativePath} with built-in assets:`,
      ...Object.values(artifacts).map((artifact) => `- ${artifact}`),
    ].join("\n")
    return successResult(text, {
      ok: true,
      source: source.relativePath,
      scale: options.scale,
      findings,
      artifacts,
      summary,
    })
  }

  private async checkScene(
    options: ParsedSceneSourceArguments,
  ): Promise<McpToolResult> {
    const { source, scene } = await loadScene(this.boundary, options.path)
    const summary = {
      durationUs: scene.durationUs,
      entityCount: scene.entities.length,
      cameraCount: scene.cameras.length,
      assetCount: scene.assets.length,
      animationCount: scene.animations.length,
      generatorCount: scene.generators.length,
      overrideCount: scene.overrides.length,
    }
    return successResult(
      `Checked ${source.relativePath}: scene ${safeFragment(scene.sceneId, 128)} is valid (${summary.entityCount} entities, ${summary.cameraCount} cameras).`,
      {
        ok: true,
        source: source.relativePath,
        sceneId: scene.sceneId,
        sceneSha256: spatialValueSha256(scene),
        summary,
      },
    )
  }

  private async inspectScene(
    options: ParsedSceneSourceArguments,
  ): Promise<McpToolResult> {
    const { source, scene } = await loadScene(this.boundary, options.path)
    const inspection = inspectSpatialScene(scene)
    const entities = boundedSlice(
      inspection.entities,
      mcpMaximumReturnedEntities,
    )
    const summary = {
      entityCount: inspection.entities.length,
      returnedEntityCount: entities.length,
      entitiesTruncated: entities.length < inspection.entities.length,
    }
    return successResult(
      `Inspected ${source.relativePath}: ${summary.entityCount} entities${summary.entitiesTruncated ? `, first ${summary.returnedEntityCount} returned in structured content` : ""}.`,
      {
        ok: true,
        source: source.relativePath,
        inspection: { ...inspection, entities },
        summary,
      },
    )
  }

  private async auditScene(
    options: ParsedAuditSceneArguments,
  ): Promise<McpToolResult> {
    const { source, scene } = await loadScene(this.boundary, options.path)
    const report = auditSpatialScene(scene, {
      cameraId: options.cameraId,
      ...(options.timesUs === undefined ? {} : { timesUs: options.timesUs }),
      ...(options.assetBounds === undefined
        ? {}
        : {
            assetBounds: normalizeSpatialAuditAssetBounds(options.assetBounds),
          }),
    })
    // Report rows are capped by count and by cumulative samples so one result
    // stays bounded even at the portable entitySamples limit.
    let sampleBudget = mcpMaximumReturnedAuditSamples
    const entities: SpatialAuditEntity[] = []
    for (const entity of report.entities) {
      if (
        entities.length >= mcpMaximumReturnedEntities ||
        entity.samples.length > sampleBudget
      ) {
        break
      }
      sampleBudget -= entity.samples.length
      entities.push(entity)
    }
    const findings = boundedSlice(
      report.findings,
      mcpMaximumReturnedFindings,
    )
    const findingCount = report.findings.length + report.omittedFindings
    const summary = {
      findingCount,
      returnedFindingCount: findings.length,
      findingsTruncated: findings.length < findingCount,
      entityCount: report.entities.length,
      returnedEntityCount: entities.length,
      entitiesTruncated: entities.length < report.entities.length,
    }
    return successResult(
      `Audited ${source.relativePath} under ${options.cameraId}: ${findingCount} finding${findingCount === 1 ? "" : "s"} across ${report.entities.length} entities and ${report.timesUs.length} samples${summary.findingsTruncated || summary.entitiesTruncated ? " (truncated)" : ""}.`,
      {
        ok: true,
        source: source.relativePath,
        report: { ...report, entities, findings },
        summary,
      },
    )
  }

  private async diffScenes(
    options: ParsedDiffScenesArguments,
  ): Promise<McpToolResult> {
    const { source, scene } = await loadScene(this.boundary, options.path)
    const other = await loadScene(this.boundary, options.other)
    const entries = diffSpatialScenes(scene, other.scene)
    const diff = boundedSlice(entries, mcpMaximumReturnedDiffEntries)
    const summary = {
      entryCount: entries.length,
      returnedEntryCount: diff.length,
      diffTruncated: diff.length < entries.length,
    }
    return successResult(
      `Diffed ${source.relativePath} against ${other.source.relativePath}: ${summary.entryCount} entr${summary.entryCount === 1 ? "y" : "ies"}${summary.diffTruncated ? `, first ${summary.returnedEntryCount} returned in structured content` : ""}.`,
      {
        ok: true,
        source: source.relativePath,
        other: other.source.relativePath,
        sceneSha256: spatialValueSha256(scene),
        otherSha256: spatialValueSha256(other.scene),
        diff,
        summary,
      },
    )
  }

  private async evaluateScene(
    options: ParsedEvaluateSceneArguments,
  ): Promise<McpToolResult> {
    const { source, scene } = await loadScene(this.boundary, options.path)
    const snapshot = evaluateSpatialScene(scene, {
      timeUs: options.timeUs,
      cameraId: options.cameraId,
    })
    const entities = boundedSlice(
      snapshot.entities,
      mcpMaximumReturnedEntities,
    )
    const summary = {
      entityCount: snapshot.entities.length,
      returnedEntityCount: entities.length,
      entitiesTruncated: entities.length < snapshot.entities.length,
    }
    return successResult(
      `Evaluated ${source.relativePath} at timeUs ${options.timeUs} under ${options.cameraId}: ${summary.entityCount} entities${summary.entitiesTruncated ? `, first ${summary.returnedEntityCount} returned in structured content` : ""}.`,
      {
        ok: true,
        source: source.relativePath,
        snapshot: { ...snapshot, entities },
        summary,
      },
    )
  }
}

import { describe, expect, test } from "bun:test"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  slopcameraImageModels,
} from "../generate.ts"
import type {
  HostResourceClaim,
  HostResourceCoordinator,
} from "../host-resources.ts"
import { createSpatialSceneStarter } from "../spatial-scene/authoring.ts"
import { behaviorOrganismSha256, type SpatialBehaviorOrganism } from "../spatial-scene/behavior.ts"
import { auditSpatialBehaviorTrace } from "../spatial-scene/behavior-audit.ts"
import { bakeSpatialBehavior } from "../spatial-scene/behavior-bake.ts"
import { spatialValueSha256 } from "../spatial-scene/identity.ts"
import { fixtureAsset } from "../spatial-scene/test-fixture.ts"
import {
  SlopcameraMcpToolRuntime,
  mcpMaximumEdges,
  mcpMaximumReturnedFindings,
  mcpMaximumShapes,
} from "./tools.ts"
import type { McpToolResult } from "./types.ts"

function recordingCoordinator(record: {
  assertions: number
  claims: HostResourceClaim[][]
}, inheritedFileDescriptor = 97): HostResourceCoordinator {
  const profile = {
    id: "slopcamera.mcp-test-host/v1",
    capacities: [],
  } as const
  return {
    profile,
    scope: "process",
    async withLease(claims, callback) {
      record.claims.push([...claims])
      return await callback({
        claims,
        inheritedFileDescriptor,
        profile,
        ticket: String(record.claims.length),
        assertOwned: () => {
          record.assertions += 1
          return Promise.resolve()
        },
      })
    },
  }
}

function expectToolError(result: McpToolResult, code: string): void {
  expect(result).toMatchObject({
    isError: true,
    content: [
      {
        type: "text",
        text: expect.stringContaining(`[${code}]`),
      },
    ],
  })
  expect(result).not.toHaveProperty("structuredContent")
}

function source(options: { readonly width?: number; readonly height?: number } = {}) {
  return JSON.stringify({
    version: 1,
    name: "agent-flow",
    canvas: {
      width: options.width ?? 800,
      height: options.height ?? 300,
    },
    layout: { type: "stack", direction: "horizontal" },
    shapes: [
      {
        id: "source",
        type: "rect",
        width: 160,
        height: 100,
        icon: "document",
      },
      {
        id: "result",
        type: "rect",
        width: 160,
        height: 100,
        icon: "check",
      },
    ],
    edges: [{ id: "source-result", from: "source", to: "result" }],
  })
}

describe("Slopcamera MCP tools", () => {
  test("uses built-ins without discovering or executing workspace config", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-config-"))
    const marker = join(root, "config-executed")
    try {
      await writeFile(join(root, "agent-flow.diagram.json"), source())
      await writeFile(
        join(root, "slopcamera.config.ts"),
        `await Bun.write(${JSON.stringify(marker)}, "executed"); export default {}\n`,
      )
      const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
      const runtime = await SlopcameraMcpToolRuntime.create(
        root,
        {},
        recordingCoordinator(admission),
      )
      const result = await runtime.call("check_diagram", {
        path: "agent-flow.diagram.json",
      })
      expect(result.isError).toBeUndefined()
      expect(result.structuredContent).toMatchObject({
        ok: true,
        source: "agent-flow.diagram.json",
      })
      expect(await Bun.file(marker).exists()).toBe(false)
      expect(admission.claims).toEqual([[
        { resource: "cpu", amount: 1 },
        { resource: "local-io", amount: 1 },
      ]])
      expect(admission.assertions).toBe(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("renders and safely replaces all five root-relative artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-render-"))
    try {
      await writeFile(join(root, "agent-flow.diagram.json"), source())
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator({ assertions: 0, claims: [] }),
      )
      const first = await runtime.call("render_diagram", {
        path: "agent-flow.diagram.json",
        out_dir: "out",
        scale: 1,
      })
      expect(first.isError).toBeUndefined()
      expect(first.structuredContent).toMatchObject({
        ok: true,
        source: "agent-flow.diagram.json",
        artifacts: {
          tldr: "out/agent-flow.tldr",
          lightSvg: "out/agent-flow.light.svg",
          darkSvg: "out/agent-flow.dark.svg",
          lightPng: "out/agent-flow.light.png",
          darkPng: "out/agent-flow.dark.png",
        },
      })
      await writeFile(join(root, "out", "agent-flow.light.svg"), "stale")
      const second = await runtime.call("render_diagram", {
        path: "agent-flow.diagram.json",
        out_dir: "out",
        scale: 1,
      })
      expect(second.isError).toBeUndefined()
      expect(await readFile(join(root, "out", "agent-flow.light.svg"), "utf8"))
        .toStartWith("<svg")
      for (const suffix of [
        ".tldr",
        ".light.svg",
        ".dark.svg",
        ".light.png",
        ".dark.png",
      ]) {
        expect(await Bun.file(join(root, "out", `agent-flow${suffix}`)).exists())
          .toBe(true)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects traversal, symlink escapes, unsupported suffixes, and render limits", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-boundary-"))
    const outside = await mkdtemp(join(tmpdir(), "slopcamera-mcp-outside-"))
    try {
      await writeFile(join(root, "large.diagram.json"), source({
        width: 5_000,
        height: 5_000,
      }))
      await writeFile(join(outside, "escape.diagram.json"), source())
      await symlink(
        join(outside, "escape.diagram.json"),
        join(root, "escape.diagram.json"),
      )
      await mkdir(join(outside, "writes"))
      await symlink(join(outside, "writes"), join(root, "outside-output"))
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator({ assertions: 0, claims: [] }),
      )

      const traversal = await runtime.call("check_diagram", {
        path: "../escape.diagram.json",
      })
      expectToolError(traversal, "INVALID_PATH")
      const sourceEscape = await runtime.call("check_diagram", {
        path: "escape.diagram.json",
      })
      expectToolError(sourceEscape, "PATH_OUTSIDE_ROOT")
      const suffix = await runtime.call("check_diagram", { path: "file.json" })
      expectToolError(suffix, "INVALID_ARGUMENTS")
      const outputEscape = await runtime.call("render_diagram", {
        path: "large.diagram.json",
        out_dir: "outside-output",
        scale: 0.1,
      })
      expectToolError(outputEscape, "PATH_OUTSIDE_ROOT")
      const pixelLimit = await runtime.call("render_diagram", {
        path: "large.diagram.json",
        scale: 1,
      })
      expectToolError(pixelLimit, "RENDER_LIMIT")
    } finally {
      await Promise.all([
        rm(root, { recursive: true, force: true }),
        rm(outside, { recursive: true, force: true }),
      ])
    }
  })

  test("rejects sources above one MiB before parsing", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-source-cap-"))
    try {
      await writeFile(
        join(root, "oversized.diagram.json"),
        `{"padding":"${"x".repeat(1024 * 1024)}"}`,
      )
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator({ assertions: 0, claims: [] }),
      )
      const result = await runtime.call("check_diagram", {
        path: "oversized.diagram.json",
      })
      expectToolError(result, "SOURCE_TOO_LARGE")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects diagrams above the MCP shape and edge complexity caps", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-complexity-"))
    try {
      await writeFile(
        join(root, "too-many-shapes.diagram.json"),
        JSON.stringify({
          version: 1,
          name: "too-many-shapes",
          canvas: { width: 1_000, height: 1_000 },
          shapes: Array.from(
            { length: mcpMaximumShapes + 1 },
            (_, index) => ({
              id: `shape-${index}`,
              type: "rect",
              x: 10,
              y: 10,
              width: 120,
              height: 64,
            }),
          ),
        }),
      )
      await writeFile(
        join(root, "too-many-edges.diagram.json"),
        JSON.stringify({
          version: 1,
          name: "too-many-edges",
          canvas: { width: 800, height: 300 },
          shapes: [
            {
              id: "one",
              type: "rect",
              x: 40,
              y: 80,
              width: 160,
              height: 100,
            },
            {
              id: "two",
              type: "rect",
              x: 600,
              y: 80,
              width: 160,
              height: 100,
            },
          ],
          edges: Array.from(
            { length: mcpMaximumEdges + 1 },
            (_, index) => ({
              id: `edge-${index}`,
              from: "one",
              to: "two",
            }),
          ),
        }),
      )
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator({ assertions: 0, claims: [] }),
      )
      const [tooManyShapes, tooManyEdges] = await Promise.all([
        runtime.call("check_diagram", {
          path: "too-many-shapes.diagram.json",
        }),
        runtime.call("check_diagram", {
          path: "too-many-edges.diagram.json",
        }),
      ])
      expectToolError(tooManyShapes, "COMPLEXITY_LIMIT")
      expectToolError(tooManyEdges, "COMPLEXITY_LIMIT")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects oversized raw arrays before semantic parsing", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-raw-complexity-"))
    try {
      await writeFile(
        join(root, "malformed-dense.diagram.json"),
        JSON.stringify({
          shapes: Array.from({ length: 20_000 }, () => ({})),
          edges: Array.from({ length: 20_000 }, () => ({})),
        }),
      )
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator({ assertions: 0, claims: [] }),
      )
      const result = await runtime.call("check_diagram", {
        path: "malformed-dense.diagram.json",
      })
      expectToolError(result, "COMPLEXITY_LIMIT")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("bounds returned findings without duplicating them into prose", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-findings-"))
    try {
      await writeFile(
        join(root, "dense.diagram.json"),
        JSON.stringify({
          version: 1,
          name: "dense",
          canvas: { width: 100, height: 100 },
          shapes: Array.from(
            { length: mcpMaximumShapes },
            (_, index) => ({
              id: `shape-${index}`,
              type: "rect",
              x: -1,
              y: 0,
              width: 10,
              height: 10,
              label: "a deliberately long label for a finding",
            }),
          ),
        }),
      )
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator({ assertions: 0, claims: [] }),
      )
      const result = await runtime.call("check_diagram", {
        path: "dense.diagram.json",
      })
      expect(result.isError).toBeUndefined()
      const structured = result.structuredContent as {
        readonly findings: readonly {
          readonly code: string
          readonly message: string
          readonly shapeIds: readonly string[]
        }[]
        readonly summary: {
          readonly shapeCount: number
          readonly edgeCount: number
          readonly findingCount: number
          readonly returnedFindingCount: number
          readonly findingsTruncated: boolean
        }
      }
      expect(structured.findings).toHaveLength(mcpMaximumReturnedFindings)
      expect(structured.summary).toEqual({
        shapeCount: mcpMaximumShapes,
        edgeCount: 0,
        findingCount: mcpMaximumShapes * 4 + 1,
        returnedFindingCount: mcpMaximumReturnedFindings,
        findingsTruncated: true,
      })
      expect(
        structured.findings.every(
          (finding) =>
            finding.code.length <= 64 &&
            finding.message.length <= 240 &&
            finding.shapeIds.length <= 12 &&
            finding.shapeIds.every((shapeId) => shapeId.length <= 120),
        ),
      ).toBe(true)
      expect(result.content[0]?.text).toContain("truncated")
      expect(result.content[0]?.text).not.toContain("outside-canvas")
      expect(JSON.stringify(result).length).toBeLessThan(20_000)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("searches the fixed registry and rejects source text in semantic execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-semantic-"))
    const marker = join(root, "executed")
    try {
      await writeFile(join(root, "flow.diagram.json"), source())
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator({ assertions: 0, claims: [] }),
      )
      const search = await runtime.call("search_slopcamera", {
        query: "diagram",
      })
      expect(search.structuredContent).toMatchObject({
        ok: true,
        operations: [
          { code: "slopcamera.diagram.check" },
          { code: "slopcamera.diagram.render" },
        ],
      })
      const execute = await runtime.call("execute_slopcamera", {
        operation: "slopcamera.diagram.check",
        input: {
          path: "flow.diagram.json",
          source: `await Bun.write(${JSON.stringify(marker)}, "executed")`,
        },
      })
      expectToolError(execute, "INVALID_OPERATION_INPUT")
      expect(await Bun.file(marker).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("executes direct Gateway generation to a confined file with metadata-only output", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-generate-"))
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x58,
    ])
    const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
    try {
      const runtime = await SlopcameraMcpToolRuntime.create(root, {
        environment: { AI_GATEWAY_API_KEY: "mcp-gateway-key-1" },
        loadRuntime: async () => ({
          createGateway: settings => {
            expect(settings.apiKey).toBe("mcp-gateway-key-1")
            return { imageModel: modelId => modelId }
          },
          generateImage: async settings => {
            expect(settings.maxRetries).toBe(0)
            return {
              images: [{ mediaType: "image/webp", uint8Array: webp }],
              providerMetadata: { gateway: { generationId: "mcp_request" } },
              warnings: [],
            }
          },
        }),
      }, recordingCoordinator(admission))
      const result = await runtime.call("execute_slopcamera", {
        operation: "slopcamera.image.generate",
        input: {
          model: slopcameraImageModels[0],
          prompt: "one bounded image",
          outputPath: "generated/image.webp",
        },
      })
      expect(admission.claims).toEqual([[
        { resource: "local-io", amount: 1 },
        { resource: "network", amount: 1 },
        { resource: "paid-call", amount: 1 },
      ]])
      expect(result.isError).toBeUndefined()
      expect(result.content).toHaveLength(1)
      expect(result.structuredContent).toMatchObject({
        ok: true,
        operation: "slopcamera.image.generate",
        result: {
          mediaType: "image/webp",
          model: slopcameraImageModels[0],
          outputPath: "generated/image.webp",
          provider: "vercel-ai-gateway",
          requestId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
      })
      expect(JSON.stringify(result.structuredContent)).not.toContain(
        Buffer.from(webp).toString("base64"),
      )
      expect(await readFile(join(root, "generated", "image.webp"))).toEqual(
        Buffer.from(webp),
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("Slopcamera MCP scene tools", () => {
  const splatScene = () => {
    const scene = createSpatialSceneStarter() as unknown as Record<string, unknown>
    return {
      ...scene,
      assets: [
        ...(scene.assets as readonly unknown[]),
        {
          assetId: "asset_splat",
          payload: { path: "assets/splat.spz", sha256: "a".repeat(64), bytes: 100 },
          interpretation: { kind: "splat", format: "spz", metersPerUnit: 1, sourceUp: "y" },
          dependencies: [],
          provenance: { source: "authored", description: "Fixture" },
        },
      ],
      entities: [
        ...(scene.entities as readonly unknown[]),
        {
          entityId: "entity_splat",
          kind: "splat",
          name: "Splat",
          parentId: null,
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
          placement: { kind: "world" },
          origin: { kind: "authored" },
          visible: true,
          assetId: "asset_splat",
        },
      ],
    }
  }

  test("checks, inspects, audits, diffs, and evaluates a root-relative scene", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-scene-"))
    try {
      const scene = createSpatialSceneStarter()
      await writeFile(join(root, "scene.json"), JSON.stringify(scene))
      const changed = {
        ...scene,
        entities: scene.entities.map(entity =>
          entity.entityId === "entity_product"
            ? { ...entity, name: "Renamed" }
            : entity,
        ),
      }
      await writeFile(join(root, "changed.json"), JSON.stringify(changed))
      const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator(admission),
      )

      const checked = await runtime.call("check_scene", { path: "scene.json" })
      expect(checked.isError).toBeUndefined()
      expect(checked.structuredContent).toMatchObject({
        ok: true,
        source: "scene.json",
        sceneId: "scene_starter",
        sceneSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        summary: {
          entityCount: scene.entities.length,
          cameraCount: scene.cameras.length,
          assetCount: scene.assets.length,
          durationUs: scene.durationUs,
        },
      })

      const inspected = await runtime.call("inspect_scene", { path: "scene.json" })
      expect(inspected.isError).toBeUndefined()
      expect(inspected.structuredContent).toMatchObject({
        ok: true,
        source: "scene.json",
        summary: {
          entityCount: scene.entities.length,
          returnedEntityCount: scene.entities.length,
          entitiesTruncated: false,
        },
      })
      const inspection = (inspected.structuredContent as { inspection: { entities: readonly { entityId: string; editableControls: readonly string[] }[] } }).inspection
      const product = inspection.entities.find(({ entityId }) => entityId === "entity_product")
      expect(product?.editableControls).toEqual(["color", "opacity", "emissive", "instances", "castShadow", "receiveShadow"])

      const audited = await runtime.call("audit_scene", {
        path: "scene.json",
        camera_id: "camera_hero",
        times_us: [0, 2_000_000],
      })
      expect(audited.isError).toBeUndefined()
      expect(audited.structuredContent).toMatchObject({
        ok: true,
        source: "scene.json",
        summary: { entityCount: scene.entities.length, findingCount: 0 },
      })
      const report = (audited.structuredContent as { report: { timesUs: readonly number[]; entities: readonly { entityId: string }[] } }).report
      expect(report.timesUs).toEqual([0, 2_000_000])

      const diffed = await runtime.call("diff_scenes", {
        path: "scene.json",
        other: "changed.json",
      })
      expect(diffed.isError).toBeUndefined()
      const diff = diffed.structuredContent as {
        diff: readonly { kind: string; collection?: string; id?: string; properties?: string[] }[]
      }
      expect(diff.diff).toContainEqual(
        expect.objectContaining({ kind: "changed", collection: "entities", id: "entity_product" }),
      )

      const evaluated = await runtime.call("evaluate_scene", {
        path: "scene.json",
        camera_id: "camera_hero",
        time_us: 1_000_000,
      })
      expect(evaluated.isError).toBeUndefined()
      expect(evaluated.structuredContent).toMatchObject({
        ok: true,
        source: "scene.json",
        summary: { entityCount: scene.entities.length },
      })
      const snapshot = (evaluated.structuredContent as { snapshot: { timeUs: number; camera: { cameraId: string } } }).snapshot
      expect(snapshot.timeUs).toBe(1_000_000)
      expect(snapshot.camera.cameraId).toBe("camera_hero")

      for (const claims of admission.claims) {
        expect(claims).toEqual([
          { resource: "cpu", amount: 1 },
          { resource: "local-io", amount: 1 },
        ])
      }
      expect(admission.claims).toHaveLength(5)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("checks, plans, and audits direction, effects, and temporal evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-direction-"))
    try {
      const scene = createSpatialSceneStarter()
      const sceneSha256 = spatialValueSha256(scene)
      await writeFile(join(root, "scene.json"), JSON.stringify(scene))
      const direction = {
        kind: "slopcamera.spatial-direction",
        schemaVersion: 1,
        entityId: "entity_product",
        projectDigest: sceneSha256,
        beats: [{ id: "beat_intro", startUs: 0, endUs: 4_000_000, intent: "Introduce the product", emotion: "calm" }],
        actions: [{ id: "act_turn", characterId: "entity_product", startUs: 0, endUs: 2_000_000, action: "turn" }],
        coverage: [{ id: "cov_orbit", startUs: 0, endUs: 2_000_000, rigKind: "orbit", framing: "medium", subjectId: "entity_product" }],
        looks: [{ id: "look_cold", startUs: 0, endUs: 4_000_000, lighting: "cool key", atmosphere: "clear" }],
      }
      await writeFile(join(root, "direction.json"), JSON.stringify(direction))
      const draft = {
        renderPlan: {
          kind: "slopcamera.spatial-render-plan",
          schemaVersion: 1,
          quality: {
            outputBytes: 8_000_000, particleCount: 0, pixelBudget: 640 * 480,
            simulationSteps: 0, texturePixelBudget: 1_000_000, tier: "final",
          },
          postProcess: {
            kind: "slopcamera.spatial-post-process", schemaVersion: 1,
            steps: [{ kind: "tone-map", exposure: 1, whitePoint: 4 }],
          },
        },
      }
      await writeFile(join(root, "draft.json"), JSON.stringify(draft))
      const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator(admission),
      )

      const directionCheck = await runtime.call("check_scene_direction", {
        scene: "scene.json", direction: "direction.json",
      })
      expect(directionCheck.isError).toBeUndefined()
      expect(directionCheck.structuredContent).toMatchObject({
        ok: true,
        source: "scene.json",
        summary: { errorCount: 0 },
      })

      const planned = await runtime.call("plan_scene_direction", {
        scene: "scene.json", direction: "direction.json",
      })
      expect(planned.isError).toBeUndefined()
      const compilation = (planned.structuredContent as {
        compilation: {
          sceneSha256: string
          verified: boolean
          proposals: { shots: readonly { shotId: string }[]; cameraRigs: readonly unknown[] }
        }
      }).compilation
      expect(compilation.sceneSha256).toBe(sceneSha256)
      expect(compilation.verified).toBe(false)
      expect(compilation.proposals.shots.length).toBeGreaterThan(0)
      expect(compilation.proposals.cameraRigs.length).toBeGreaterThan(0)

      const gallery = await runtime.call("plan_scene_gallery", {
        scene: "scene.json", direction: "direction.json", axis: "camera",
      })
      expect(gallery.isError).toBeUndefined()
      const galleryPlan = (gallery.structuredContent as {
        gallery: { candidates: readonly { documentSha256: string }[]; selection?: unknown }
      }).gallery
      expect(galleryPlan.candidates.length).toBeGreaterThan(1)
      expect(galleryPlan).not.toHaveProperty("selection")
      expect(new Set(galleryPlan.candidates.map((c) => c.documentSha256)).size).toBe(galleryPlan.candidates.length)

      const bound = await runtime.call("plan_scene_effects", {
        scene: "scene.json", draft: "draft.json",
      })
      expect(bound.isError).toBeUndefined()
      const binding = (bound.structuredContent as { binding: { document: unknown; documentSha256: string } }).binding
      expect(binding.documentSha256).toMatch(/^[a-f0-9]{64}$/u)
      await writeFile(join(root, "effects.json"), JSON.stringify(binding.document))

      const effectsCheck = await runtime.call("check_scene_effects", {
        scene: "scene.json", effects: "effects.json",
      })
      expect(effectsCheck.isError).toBeUndefined()
      expect(effectsCheck.structuredContent).toMatchObject({
        ok: true,
        summary: { errorCount: 0 },
      })

      const emitOrganism: SpatialBehaviorOrganism = {
        contract: "morphogen.organism.v1",
        key: "organism:emit-window",
        name: "Emit window",
        cells: [
          { id: "in", kind: "input", outputs: { win: { type: "json" } } },
          {
            id: "cfg", kind: "const",
            outputs: {
              channel: { type: "text", value: "alert" },
              value: { type: "json", value: "ping" },
            },
          },
          { id: "emit", kind: "fn", fn: "channel.emit.v1" },
        ],
        edges: [
          { from: { cell: "in", port: "win" }, to: { cell: "emit", port: "window" } },
          { from: { cell: "cfg", port: "channel" }, to: { cell: "emit", port: "channel" } },
          { from: { cell: "cfg", port: "value" }, to: { cell: "emit", port: "value" } },
        ],
        interface: {
          inputs: { win: { cell: "in", port: "win" } },
          outputs: { out: { cell: "emit", port: "emitted" } },
        },
      }
      const emitDigest = behaviorOrganismSha256(emitOrganism)
      await writeFile(join(root, "behavior.json"), JSON.stringify({
        kind: "slopcamera.spatial-behavior",
        schemaVersion: 1,
        behaviorId: "behavior_alert",
        entityId: "entity_product",
        sceneSha256,
        seed: 7,
        rangeUs: { startUs: 0, endUs: 1_000_000 },
        organisms: { [emitDigest]: emitOrganism },
        entry: emitDigest,
        channels: ["alert"],
        args: { win: { ticks: [{ tUs: 0 }, { tUs: 500_000 }] } },
      }))
      const behaviorCheck = await runtime.call("check_scene_behavior", {
        scene: "scene.json", behavior: "behavior.json",
      })
      expect(behaviorCheck.isError).toBeUndefined()
      expect(behaviorCheck.structuredContent).toMatchObject({
        ok: true,
        source: "scene.json",
        summary: { errorCount: 0 },
      })
      const behaviorOutside = await runtime.call("check_scene_behavior", {
        scene: "scene.json", behavior: "../outside/escape.diagram.json",
      })
      expect(behaviorOutside.isError).toBe(true)

      const { bake } = await bakeSpatialBehavior({
        behavior: JSON.parse(await readFile(join(root, "behavior.json"), "utf8")) as unknown, scene,
      })
      await writeFile(join(root, "bake-audit.json"), JSON.stringify(bake))
      const behaviorAudit = await runtime.call("audit_scene_behavior", {
        bake: "bake-audit.json",
      })
      expect(behaviorAudit.isError).toBeUndefined()
      expect(behaviorAudit.structuredContent).toMatchObject({
        ok: true,
        source: "bake-audit.json",
        summary: { channelCount: 1, emittedCount: 2 },
        report: auditSpatialBehaviorTrace({
          behaviorSha256: bake.behaviorSha256, emittedSha256: bake.receipt.emittedSha256,
          emitted: bake.emitted, rangeUs: bake.rangeUs,
        }),
      })

      const temporal = await runtime.call("audit_scene_temporal", {
        path: "scene.json", camera_id: "camera_hero", times_us: [0, 2_000_000],
      })
      expect(temporal.isError).toBeUndefined()
      const temporalReport = (temporal.structuredContent as {
        report: { sampleCount: number; findings: readonly { kind: string }[] }
        summary: { sampleCount: number }
      })
      expect(temporalReport.report.sampleCount).toBe(2)
      expect(temporalReport.summary.sampleCount).toBe(2)

      for (const claims of admission.claims) {
        expect(claims).toEqual([
          { resource: "cpu", amount: 1 },
          { resource: "local-io", amount: 1 },
        ])
      }
      expect(admission.claims).toHaveLength(9)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects bad arguments, invalid sources, and boundary escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-scene-"))
    const outside = await mkdtemp(join(tmpdir(), "slopcamera-mcp-outside-"))
    try {
      await writeFile(join(root, "scene.json"), JSON.stringify(createSpatialSceneStarter()))
      await writeFile(join(root, "invalid.json"), "{not json")
      await writeFile(join(root, "broken.json"), JSON.stringify({ kind: "slopcamera.spatial-scene" }))
      await writeFile(join(outside, "escape.json"), JSON.stringify(createSpatialSceneStarter()))
      await symlink(join(outside, "escape.json"), join(root, "escape.json"))
      const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator(admission),
      )

      const codeOf = async (
        name: Parameters<typeof runtime.call>[0],
        args: Record<string, unknown>,
      ) => {
        const result = await runtime.call(name, args)
        const match = /^\[([A-Z_]+)\]/u.exec(result.content[0]?.text ?? "")
        expectToolError(result, match?.[1] ?? "")
        return match?.[1]
      }

      expect(await codeOf("check_scene", { path: "../outside.json" })).toBe("INVALID_PATH")
      expect(await codeOf("check_scene", { path: "escape.json" })).toBe("PATH_OUTSIDE_ROOT")
      expect(await codeOf("check_scene", { path: "scene.txt" })).toBe("INVALID_ARGUMENTS")
      expect(await codeOf("check_scene", { path: "invalid.json" })).toBe("INVALID_JSON")
      expect(await codeOf("check_scene", { path: "broken.json" })).toBe("INVALID_SCENE")
      expect(await codeOf("check_scene", { path: "missing.json" })).toBe("SOURCE_NOT_FOUND")
      expect(await codeOf("check_scene", { path: "scene.json", extra: 1 })).toBe("INVALID_ARGUMENTS")
      expect(await codeOf("check_scene", {})).toBe("INVALID_ARGUMENTS")
      expect(await codeOf("evaluate_scene", {
        path: "scene.json", camera_id: "camera_missing", time_us: 0,
      })).toBe("NOT_FOUND")
      expect(await codeOf("evaluate_scene", {
        path: "scene.json", camera_id: "nope", time_us: 0,
      })).toBe("INVALID_ARGUMENTS")
      expect(await codeOf("evaluate_scene", {
        path: "scene.json", camera_id: "camera_hero", time_us: 5_000_000,
      })).toBe("INVALID_DATA")
      expect(await codeOf("evaluate_scene", {
        path: "scene.json", camera_id: "camera_hero", time_us: 1.5,
      })).toBe("INVALID_ARGUMENTS")
      expect(await codeOf("audit_scene", {
        path: "scene.json", camera_id: "camera_missing",
      })).toBe("NOT_FOUND")
      expect(await codeOf("audit_scene", {
        path: "scene.json", camera_id: "camera_hero", times_us: [],
      })).toBe("INVALID_ARGUMENTS")
      expect(await codeOf("audit_scene", {
        path: "scene.json", camera_id: "camera_hero", times_us: Array.from({ length: 65 }, () => 0),
      })).toBe("INVALID_ARGUMENTS")
      expect(await codeOf("audit_scene", {
        path: "scene.json", camera_id: "camera_hero", times_us: [5_000_000],
      })).toBe("INVALID_DATA")
      expect(await codeOf("audit_scene", {
        path: "scene.json", camera_id: "camera_hero", asset_bounds: "nope",
      })).toBe("INVALID_DATA")
      expect(await codeOf("diff_scenes", {
        path: "scene.json", other: "../escape.json",
      })).toBe("INVALID_PATH")
      expect(await codeOf("diff_scenes", {
        path: "scene.json", other: "missing.json",
      })).toBe("SOURCE_NOT_FOUND")
      expect(await codeOf("diff_scenes", {
        path: "scene.json", other: "invalid.json",
      })).toBe("INVALID_JSON")
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  test("audit_scene normalizes inline asset bounds and reports conflicts", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-scene-"))
    try {
      await writeFile(join(root, "scene.json"), JSON.stringify(splatScene()))
      const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator(admission),
      )

      const audit = async (assetBounds?: unknown) => {
        const args: Record<string, unknown> = { path: "scene.json", camera_id: "camera_hero" }
        if (assetBounds !== undefined) args.asset_bounds = assetBounds
        const result = await runtime.call("audit_scene", args)
        return result
      }
      const splatEnclosure = (result: McpToolResult) => {
        const report = (result.structuredContent as {
          report: { entities: readonly { entityId: string; enclosure: { status: string; reason?: string } }[] }
        }).report
        return report.entities.find(({ entityId }) => entityId === "entity_splat")?.enclosure
      }
      const errorCode = (result: McpToolResult) => {
        expect(result.isError).toBe(true)
        return /^\[([A-Z_]+)\]/u.exec(result.content[0]?.text ?? "")?.[1]
      }

      const unbounded = await audit()
      expect(unbounded.isError).toBeUndefined()
      expect(splatEnclosure(unbounded)).toMatchObject({
        status: "unknown",
        reason: "requires-asset-decoding",
      })

      const mapBounds = { asset_splat: { min: [-1, -1, -1], max: [1, 1, 1] } }
      const bounded = await audit(mapBounds)
      expect(bounded.isError).toBeUndefined()
      expect(splatEnclosure(bounded)?.status).toBe("bounded")

      const manifest = fixtureAsset("asset_splat")
      const facts = {
        kind: "slopcamera.spatial-asset-facts",
        schemaVersion: 1,
        subject: { path: "assets/image.png", sha256: "a".repeat(64), bytes: 100 },
        subjectManifestSha256: "b".repeat(64),
        profile: "slopcamera.glb-triangles-trs-pbr-basecolor-v1",
        nodeCount: 1,
        clipDurationsSeconds: [],
        bounds: {
          modelSpace: { min: [-1, -1, -1], max: [1, 1, 1] },
          sceneSpace: { min: [-2, -2, -2], max: [2, 2, 2] },
        },
      }
      const paired = await audit({ manifest, facts })
      expect(paired.isError).toBeUndefined()
      expect(splatEnclosure(paired)?.status).toBe("bounded")

      const merged = await audit([mapBounds, mapBounds])
      expect(merged.isError).toBeUndefined()
      expect(splatEnclosure(merged)?.status).toBe("bounded")

      const conflicted = await audit([
        mapBounds,
        { asset_splat: { min: [-9, -9, -9], max: [9, 9, 9] } },
      ])
      expect(errorCode(conflicted)).toBe("CONFLICT")

      const bareFacts = await audit(facts)
      expect(errorCode(bareFacts)).toBe("INVALID_DATA")

      const unknownAsset = await audit({ asset_missing: { min: [-1, -1, -1], max: [1, 1, 1] } })
      expect(errorCode(unknownAsset)).toBe("INVALID_DATA")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("bounds returned entities, diff entries, and findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-scene-"))
    try {
      const scene = createSpatialSceneStarter() as unknown as Record<string, unknown>
      const baseEntity = (scene.entities as readonly Record<string, unknown>[])[0]!
      const manyEntities = Array.from({ length: 300 }, (_, index) => ({
        ...baseEntity,
        entityId: `entity_extra_${index}`,
        name: `Extra ${index}`,
      }))
      const wideScene = { ...scene, entities: [...(scene.entities as readonly unknown[]), ...manyEntities] }
      await writeFile(join(root, "wide.json"), JSON.stringify(wideScene))
      const other = {
        ...wideScene,
        entities: (wideScene.entities as readonly Record<string, unknown>[]).map(entity => ({
          ...entity,
          name: `${entity.name} changed`,
        })),
      }
      await writeFile(join(root, "other.json"), JSON.stringify(other))
      const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
      const runtime = await SlopcameraMcpToolRuntime.create(
        root, {}, recordingCoordinator(admission),
      )

      const inspected = await runtime.call("inspect_scene", { path: "wide.json" })
      expect(inspected.isError).toBeUndefined()
      expect(inspected.structuredContent).toMatchObject({
        ok: true,
        summary: { entityCount: 304, returnedEntityCount: 256, entitiesTruncated: true },
      })
      const inspection = (inspected.structuredContent as { inspection: { entities: readonly unknown[] } }).inspection
      expect(inspection.entities).toHaveLength(256)

      const evaluated = await runtime.call("evaluate_scene", {
        path: "wide.json", camera_id: "camera_hero", time_us: 0,
      })
      expect(evaluated.isError).toBeUndefined()
      const snapshot = (evaluated.structuredContent as { snapshot: { entities: readonly unknown[] } }).snapshot
      expect(snapshot.entities).toHaveLength(256)
      expect(evaluated.structuredContent).toMatchObject({
        summary: { entityCount: 304, returnedEntityCount: 256, entitiesTruncated: true },
      })

      const diffed = await runtime.call("diff_scenes", { path: "wide.json", other: "other.json" })
      expect(diffed.isError).toBeUndefined()
      const diff = diffed.structuredContent as {
        diff: readonly unknown[]
        summary: { entryCount: number; returnedEntryCount: number; diffTruncated: boolean }
      }
      expect(diff.summary).toMatchObject({ entryCount: 304, returnedEntryCount: 304, diffTruncated: false })
      expect(diff.diff.length).toBeLessThanOrEqual(1_024)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

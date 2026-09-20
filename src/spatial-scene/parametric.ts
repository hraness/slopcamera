import { z } from "zod"
import { canonicalJson } from "../code/canonical-json.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { createSha256HexHasher } from "../code/sha256.js"
import {
  SpatialAssetManifestSchema,
  SpatialEntitySchema,
  SpatialGeneratorIdSchema,
  SpatialMaterialSchema,
  SpatialTransformSchema,
  type SpatialAssetManifest,
  type SpatialEntity,
  type SpatialGenerator,
  type SpatialMaterial,
  type SpatialSceneV1,
  type SpatialTransform,
} from "./contracts.js"
import { SpatialAssetFactsV1Schema, SpatialCollisionProxySchema, type SpatialAssetFactsV1, type SpatialCollisionProxy, type SpatialRetainedArtifact } from "./asset-admission.js"
import { mulberry32 } from "./build.js"
import {
  SPATIAL_GEOMETRY_PROFILE, SpatialGeometryGraphSchema, emitSpatialGeometryGlb, evaluateSpatialGeometry, estimateSpatialGeometryGraph, parseSpatialGeometryGraph,
  type SpatialGeometryMesh,
} from "./geometry.js"
import {
  validateSpatialGeometryNativeReceipt, verifySpatialGeometryNativeOutputs,
  spatialGeometryNativeRequestSha256, spatialGeometryNativeReceiptSha256,
} from "./geometry-native.js"
import {
  generatedSpatialEntityId, parseSpatialScene, parseSpatialValue, SpatialSceneError,
  spatialAssetManifestSha256, spatialValueSha256,
} from "./identity.js"
import {
  buildSpatialGeneratorRecord, deriveSpatialGeneratorSeed, mergeSpatialGeneratorOutput,
  spatialGeneratorParametersSha256,
} from "./generate.js"
import { evaluateSpatialScene } from "./evaluate.js"
import { transformBounds, type Bounds, type Mat4 } from "./math.js"

/**
 * Bounded parametric architecture generators. Each kind compiles authored
 * semantic parameters (width, archCount, bevelRadius, seed, …) into the
 * geometry DAG of geometry.ts, evaluates it deterministically, emits a closed
 * GLB payload per LOD level, stamps stable generated entity ids and generator
 * keys, and binds everything into the same retained-asset contract as admitted
 * GLBs: owned asset manifests, derived facts manifests (generator identity,
 * spec/parameter digests, LOD set, collision proxies, retained artifacts) and a
 * content-addressed emission receipt. Identical specs produce byte-identical
 * payloads and receipts; scatter uses only authored seeds through the
 * checked-in mulberry32 stream. Nothing here executes source, reads files, or
 * touches a provider.
 */
export const SPATIAL_PARAMETRIC_LIMITS = Object.freeze({
  openings: 8,
  pathPoints: 64,
  scatterCount: 1_024,
  exclusions: 64,
  panes: 8,
  risers: 200,
  archCount: 64,
  parts: 64,
  scatterAttempts: 128,
})

const meter = z.number().finite().min(0.000001).max(1_000_000)
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const specVec2 = z.tuple([coordinate, coordinate])
const specVec3 = z.tuple([coordinate, coordinate, coordinate])
const editable = z.array(z.enum(["color", "opacity", "transform"])).max(3).optional()
const partPlacement = { transform: SpatialTransformSchema.optional(), editable, castShadow: z.boolean().optional(), receiveShadow: z.boolean().optional() }

const opening = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("rect"), center: specVec2, width: meter, height: meter }),
  z.strictObject({ kind: z.literal("arch"), center: specVec2, width: meter, height: meter }),
])

export const SpatialParametricSpecSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...partPlacement, kind: z.literal("geometry"), graph: SpatialGeometryGraphSchema,
    materials: z.array(SpatialMaterialSchema).min(1).max(16) }),
  z.strictObject({ ...partPlacement, kind: z.literal("wall"), length: meter, height: meter, thickness: meter,
    openings: z.array(opening).max(SPATIAL_PARAMETRIC_LIMITS.openings).optional(), material: SpatialMaterialSchema }),
  z.strictObject({ ...partPlacement, kind: z.literal("floor"), width: meter, depth: meter, thickness: meter, material: SpatialMaterialSchema }),
  z.strictObject({ ...partPlacement, kind: z.literal("stairs"), width: meter, risers: z.number().int().min(2).max(SPATIAL_PARAMETRIC_LIMITS.risers),
    riserHeight: meter, treadDepth: meter, material: SpatialMaterialSchema }),
  z.strictObject({ ...partPlacement, kind: z.literal("arch"), width: meter, height: meter, springline: meter, depth: meter,
    count: z.number().int().min(1).max(SPATIAL_PARAMETRIC_LIMITS.archCount).optional(), spacing: meter.optional(), material: SpatialMaterialSchema }),
  z.strictObject({ ...partPlacement, kind: z.literal("column"), height: meter, radius: meter,
    taper: z.number().finite().min(0.25).max(1).optional(), capital: z.enum(["none", "doric"]).optional(),
    segments: z.number().int().min(8).max(128).optional(), material: SpatialMaterialSchema }),
  z.strictObject({ ...partPlacement, kind: z.literal("window"), width: meter, height: meter, frameWidth: meter, depth: meter,
    panesX: z.number().int().min(1).max(SPATIAL_PARAMETRIC_LIMITS.panes).optional(), panesY: z.number().int().min(1).max(SPATIAL_PARAMETRIC_LIMITS.panes).optional(),
    sill: z.boolean().optional(), material: SpatialMaterialSchema, glassMaterial: SpatialMaterialSchema.optional() }),
  z.strictObject({ ...partPlacement, kind: z.literal("roof"), style: z.enum(["gable", "hip", "shed"]), width: meter, depth: meter,
    rise: meter, overhang: meter.optional(), material: SpatialMaterialSchema }),
  z.strictObject({ ...partPlacement, kind: z.literal("pipe"), radius: meter, segments: z.number().int().min(4).max(64).optional(),
    path: z.array(specVec3).min(2).max(SPATIAL_PARAMETRIC_LIMITS.pathPoints), material: SpatialMaterialSchema }),
  z.strictObject({ ...partPlacement, kind: z.literal("trim"), length: meter, size: meter, profile: z.enum(["square", "cove", "chamfer"]),
    material: SpatialMaterialSchema }),
  z.strictObject({ ...partPlacement, kind: z.literal("scatter"), count: z.number().int().min(1).max(SPATIAL_PARAMETRIC_LIMITS.scatterCount),
    area: z.strictObject({ width: meter, depth: meter }), seed: z.number().int().safe().min(0).max(0xffff_ffff),
    subject: z.discriminatedUnion("shape", [
      z.strictObject({ shape: z.literal("box"), size: z.tuple([meter, meter, meter]) }),
      z.strictObject({ shape: z.literal("cylinder"), radius: meter, height: meter, segments: z.number().int().min(8).max(64).optional() }),
      z.strictObject({ shape: z.literal("sphere"), radius: meter, segments: z.number().int().min(8).max(64).optional() }),
    ]),
    exclusions: z.array(z.strictObject({ center: specVec2, halfExtents: specVec2 })).max(SPATIAL_PARAMETRIC_LIMITS.exclusions).optional(),
    material: SpatialMaterialSchema }),
])
export type SpatialParametricSpec = Readonly<z.infer<typeof SpatialParametricSpecSchema>>

export const SpatialParametricRequestSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-parametric-request"),
  schemaVersion: z.literal(1),
  generatorId: SpatialGeneratorIdSchema,
  /** Semantic display name; generated identity and payload bytes remain independent of labels. */
  name: z.string().min(1).max(160).optional(),
  spec: SpatialParametricSpecSchema,
  /** Authored seed override; absent derives deterministically from the spec kind source. */
  seed: z.number().int().safe().min(0).max(0xffff_ffff).optional(),
  /** Collision proxies override the per-part automatic proxies (validated against retained artifacts). */
  collision: z.array(SpatialCollisionProxySchema).max(16).optional(),
  /** Optional verified retained-native exchange bound into every part's facts. */
  native: z.strictObject({ request: z.unknown(), receipt: z.unknown(), outputs: z.array(z.instanceof(Uint8Array)).min(1).max(16) }).optional(),
})
export type SpatialParametricRequest = Readonly<z.infer<typeof SpatialParametricRequestSchema>>

const IDENTITY_TRANSFORM: SpatialTransform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }

function pfail(message: string, path = "parametric"): never {
  throw new SpatialSceneError("invalid-data", `${SPATIAL_GEOMETRY_PROFILE}: ${message}`, path)
}

// ---------------------------------------------------------------------------
// Part planning: one part per spec (multi-slot parts share one GLB)
// ---------------------------------------------------------------------------

interface PartLod { readonly level: number; readonly switchDistanceM: number; readonly graph: unknown }
interface PartPlan {
  readonly key: string
  readonly transform: SpatialTransform
  readonly editable: readonly ("color" | "opacity" | "transform")[]
  readonly materials: readonly SpatialMaterial[]
  readonly collision: readonly SpatialCollisionProxy[]
  readonly lods: readonly PartLod[]
  readonly instances?: readonly SpatialTransform[]
}

const graph = (nodes: readonly unknown[], output: string) => ({ kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1, nodes, output })

function boxBounds(bounds: Bounds): SpatialCollisionProxy {
  return {
    kind: "box",
    center: [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2],
    halfExtents: [Math.max(0.0005, (bounds.max[0] - bounds.min[0]) / 2), Math.max(0.0005, (bounds.max[1] - bounds.min[1]) / 2), Math.max(0.0005, (bounds.max[2] - bounds.min[2]) / 2)],
  }
}

const LOD1_DISTANCE_M = 25

function planWall(spec: Extract<SpatialParametricSpec, { kind: "wall" }>): PartPlan[] {
  const { length, height, thickness } = spec
  const openings = spec.openings ?? []
  const cutterNodes: unknown[] = [], cutterIds: string[] = []
  for (const [index, item] of openings.entries()) {
    const cx = item.center[0], baseY = item.center[1]
    if (cx - item.width / 2 < -length / 2 || cx + item.width / 2 > length / 2 || baseY < 0 || baseY + item.height > height) {
      pfail(`Wall opening ${index} must stay inside the wall rectangle.`, "spec.openings")
    }
    const rectId = `cut${index}`
    cutterNodes.push({ id: rectId, kind: "box", size: [item.width, item.height, thickness * 4] })
    cutterNodes.push({ id: `${rectId}p`, kind: "transform", input: rectId, transform: { position: [cx, baseY + item.height / 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } })
    cutterIds.push(`${rectId}p`)
    if (item.kind === "arch") {
      const radius = item.width / 2
      if (radius > item.height) pfail(`Arch opening ${index} rise exceeds its height.`, "spec.openings")
      const cylId = `cyl${index}`
      // Half-cylinder lintel: cylinder rotated so its axis runs through the wall thickness.
      cutterNodes.push({ id: cylId, kind: "cylinder", radius, height: thickness * 4, segments: 24 })
      cutterNodes.push({ id: `${cylId}r`, kind: "transform", input: cylId, transform: { position: [cx, baseY + item.height - radius, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], scale: [1, 1, 1] } })
      cutterIds.push(`${cylId}r`)
    }
  }
  const nodes: unknown[] = [{ id: "body", kind: "box", size: [length, height, thickness] }]
  let output = "body"
  if (cutterIds.length > 0) {
    nodes.push(...cutterNodes)
    nodes.push({ id: "wall", kind: "boolean", operation: "difference", a: "body", cutters: cutterIds })
    output = "wall"
  }
  // Base at y=0: lift the centered box by half the height.
  nodes.push({ id: "lift", kind: "transform", input: output, transform: { position: [0, height / 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } })
  const lod1 = graph([
    { id: "proxy", kind: "box", size: [length, height, thickness] },
    { id: "lift", kind: "transform", input: "proxy", transform: { position: [0, height / 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
  ], "lift")
  return [{
    key: "wall", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "lift") }, { level: 1, switchDistanceM: LOD1_DISTANCE_M, graph: lod1 }],
    collision: [],
  }]
}

function planFloor(spec: Extract<SpatialParametricSpec, { kind: "floor" }>): PartPlan[] {
  const nodes = [
    { id: "slab", kind: "box", size: [spec.width, spec.thickness, spec.depth] },
    { id: "drop", kind: "transform", input: "slab", transform: { position: [0, -spec.thickness / 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
  ]
  return [{
    key: "floor", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "drop") }],
    collision: [],
  }]
}

function planStairs(spec: Extract<SpatialParametricSpec, { kind: "stairs" }>): PartPlan[] {
  const points: [number, number][] = [[0, 0]]
  let x = 0, y = 0
  for (let step = 0; step < spec.risers; step++) {
    y += spec.riserHeight; points.push([x, y])
    x += spec.treadDepth; points.push([x, y])
  }
  points.push([x, 0])
  const run = spec.risers * spec.treadDepth, rise = spec.risers * spec.riserHeight
  const nodes = [
    { id: "flight", kind: "profile", points },
    { id: "mesh", kind: "extrude", profile: "flight", depth: spec.width },
    // Recenter the extrusion (depth axis is centered already) so the run starts at x=0 stays centered.
    { id: "shift", kind: "transform", input: "mesh", transform: { position: [-run / 2, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
  ]
  const lod1 = graph([
    { id: "proxy", kind: "box", size: [run, rise, spec.width] },
    { id: "lift", kind: "transform", input: "proxy", transform: { position: [0, rise / 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
  ], "lift")
  return [{
    key: "stairs", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "shift") }, { level: 1, switchDistanceM: LOD1_DISTANCE_M, graph: lod1 }],
    collision: [],
  }]
}

function archProfile(width: number, height: number, springline: number, leg: number, arcSegments: number): [number, number][] {
  const half = width / 2, outer = half + leg
  const points: [number, number][] = [[-outer, 0], [-outer, height], [outer, height], [outer, 0], [half, 0], [half, springline]]
  for (let index = 1; index <= arcSegments; index++) {
    const angle = Math.PI * index / arcSegments
    points.push([half * Math.cos(angle), springline + half * Math.sin(angle)])
  }
  points.push([-half, 0])
  return points
}

function planArch(spec: Extract<SpatialParametricSpec, { kind: "arch" }>): PartPlan[] {
  const count = spec.count ?? 1, spacing = spec.spacing ?? spec.width
  if (spec.springline >= spec.height) pfail("Arch springline must stay below its apex height.", "spec.springline")
  // Equality pinches the polygon at the crown and creates a self-intersection.
  if (spec.height - spec.springline <= spec.width / 2 + 1e-9) {
    pfail("Arch apex height must leave positive material above the opening radius.", "spec.height")
  }
  const leg = Math.min(spec.width * 0.25, spec.depth)
  const points = archProfile(spec.width, spec.height, spec.springline, leg, 16)
  const nodes: unknown[] = [
    { id: "profile", kind: "profile", points },
    { id: "one", kind: "extrude", profile: "profile", depth: spec.depth },
  ]
  let output = "one"
  const span = spec.width + 2 * leg
  if (count > 1) nodes.push({ id: "row", kind: "array", input: "one", count, step: [span + spacing, 0, 0] })
  if (count > 1) output = "row"
  nodes.push({ id: "center", kind: "transform", input: output, transform: { position: [-((count - 1) * (span + spacing)) / 2, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } })
  const lod1 = graph([
    { id: "proxy", kind: "box", size: [span * count + spacing * (count - 1), spec.height, spec.depth] },
    { id: "lift", kind: "transform", input: "proxy", transform: { position: [0, spec.height / 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
  ], "lift")
  return [{
    key: "arch", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "center") }, { level: 1, switchDistanceM: LOD1_DISTANCE_M, graph: lod1 }],
    collision: [],
  }]
}

function planColumn(spec: Extract<SpatialParametricSpec, { kind: "column" }>): PartPlan[] {
  const segments = spec.segments ?? 32, taper = spec.taper ?? 0.85, capital = spec.capital ?? "doric"
  const r = spec.radius, h = spec.height
  const profile: [number, number][] = capital === "doric"
    ? [[r * 1.15, 0], [r * 1.15, h * 0.05], [r, h * 0.08], [r * taper, h * 0.9], [r * taper, h * 0.94], [r * 1.18, h * 0.97], [r * 1.18, h], [0, h], [0, 0]]
    : [[r * 1.1, 0], [r * 1.1, h * 0.05], [r, h * 0.08], [r * taper, h * 0.96], [r * taper, h], [0, h], [0, 0]]
  const nodes = [
    { id: "silhouette", kind: "profile", points: profile },
    { id: "shaft", kind: "revolve", profile: "silhouette", segments },
  ]
  const lod1Profile: [number, number][] = [[r * 1.18, 0], [r * 1.18, h], [0, h], [0, 0]]
  const lod1 = graph([
    { id: "silhouette", kind: "profile", points: lod1Profile },
    { id: "shaft", kind: "revolve", profile: "silhouette", segments: Math.max(8, Math.floor(segments / 4)) },
  ], "shaft")
  return [{
    key: "column", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "shaft") }, { level: 1, switchDistanceM: 20, graph: lod1 }],
    collision: [],
  }]
}

function planWindow(spec: Extract<SpatialParametricSpec, { kind: "window" }>): PartPlan[] {
  const { width, height, frameWidth, depth } = spec
  const panesX = spec.panesX ?? 2, panesY = spec.panesY ?? 1
  const nodes: unknown[] = []
  const box = (id: string, size: [number, number, number], position: [number, number, number]) => {
    nodes.push({ id, kind: "box", size })
    nodes.push({ id: `${id}t`, kind: "transform", input: id, transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] } })
    return `${id}t`
  }
  const hw = width / 2, hh = height / 2, fw = frameWidth / 2
  const frame = [
    box("top", [width, frameWidth, depth], [0, hh - fw, 0]),
    box("bottom", [width, frameWidth, depth], [0, -hh + fw, 0]),
    box("left", [frameWidth, height - 2 * frameWidth, depth], [-hw + fw, 0, 0]),
    box("right", [frameWidth, height - 2 * frameWidth, depth], [hw - fw, 0, 0]),
  ]
  if (spec.sill) frame.push(box("sill", [width + 2 * frameWidth, frameWidth, depth * 1.5], [0, -hh - frameWidth / 2, 0]))
  const bars: string[] = []
  for (let index = 1; index < panesX; index++) bars.push(box(`vx${index}`, [frameWidth * 0.5, height - 2 * frameWidth, depth * 0.5], [-hw + frameWidth + index * (width - 2 * frameWidth) / panesX, 0, 0]))
  for (let index = 1; index < panesY; index++) bars.push(box(`hy${index}`, [width - 2 * frameWidth, frameWidth * 0.5, depth * 0.5], [0, -hh + frameWidth + index * (height - 2 * frameWidth) / panesY, 0]))
  nodes.push({ id: "frame", kind: "merge", inputs: [...frame, ...bars] })
  nodes.push({ id: "glass", kind: "box", size: [width - 2 * frameWidth, height - 2 * frameWidth, depth * 0.15] })
  nodes.push({ id: "slot1", kind: "material-slot", input: "glass", slot: 1 })
  nodes.push({ id: "all", kind: "merge", inputs: ["frame", "slot1"] })
  nodes.push({ id: "lift", kind: "transform", input: "all", transform: { position: [0, hh, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } })
  const lod1 = graph([
    { id: "proxy", kind: "box", size: [width, height + (spec.sill ? frameWidth : 0), depth * (spec.sill ? 1.5 : 1)] },
    { id: "lift", kind: "transform", input: "proxy", transform: { position: [0, (height + (spec.sill ? frameWidth : 0)) / 2 - (spec.sill ? frameWidth : 0), 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
  ], "lift")
  const glass = spec.glassMaterial ?? { kind: "standard" as const, color: "#a8c8e0", opacity: 0.4, roughness: 0.1, metalness: 0 }
  return [{
    key: "window", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material, glass], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "lift") }, { level: 1, switchDistanceM: LOD1_DISTANCE_M, graph: lod1 }],
    collision: [],
  }]
}

function planRoof(spec: Extract<SpatialParametricSpec, { kind: "roof" }>): PartPlan[] {
  const { width, depth, rise } = spec, overhang = spec.overhang ?? 0
  const w = width + 2 * overhang, d = depth + 2 * overhang
  let nodes: unknown[]
  if (spec.style === "gable") {
    nodes = [
      { id: "face", kind: "profile", points: [[-w / 2, 0], [w / 2, 0], [0, rise]] },
      { id: "prism", kind: "extrude", profile: "face", depth: d },
    ]
  } else if (spec.style === "shed") {
    nodes = [
      { id: "face", kind: "profile", points: [[-w / 2, 0], [w / 2, 0], [w / 2, rise]] },
      { id: "prism", kind: "extrude", profile: "face", depth: d },
    ]
  } else {
    const ridge = Math.max(0.02, Math.abs(w - d))
    const alongX = w >= d
    nodes = [
      { id: "eave", kind: "rect", width: w, height: d },
      { id: "ridge", kind: "rect", width: alongX ? ridge : 0.02, height: alongX ? 0.02 : ridge },
      { id: "hip", kind: "loft", bottom: "eave", top: "ridge", height: rise },
    ]
  }
  const lod1 = graph([
    { id: "proxy", kind: "box", size: [w, rise, d] },
    { id: "lift", kind: "transform", input: "proxy", transform: { position: [0, rise / 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
  ], "lift")
  return [{
    key: "roof", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, spec.style === "hip" ? "hip" : "prism") }, { level: 1, switchDistanceM: LOD1_DISTANCE_M, graph: lod1 }],
    collision: [],
  }]
}

function planPipe(spec: Extract<SpatialParametricSpec, { kind: "pipe" }>): PartPlan[] {
  const segments = spec.segments ?? 12
  const nodes = [
    { id: "section", kind: "ellipse", radiusX: spec.radius, radiusY: spec.radius, segments },
    { id: "run", kind: "sweep", profile: "section", path: spec.path },
  ]
  const lod1 = graph([
    { id: "section", kind: "ellipse", radiusX: spec.radius, radiusY: spec.radius, segments: Math.max(4, Math.floor(segments / 4)) },
    { id: "run", kind: "sweep", profile: "section", path: spec.path },
  ], "run")
  const collision: SpatialCollisionProxy[] = []
  const path = spec.path
  for (let index = 0; index + 1 < path.length && collision.length < 16; index++) {
    const a = path[index]!, c = path[index + 1]!
    const delta = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const
    const length = Math.hypot(delta[0], delta[1], delta[2])
    if (length < 1e-9) continue
    const axisIndex = [Math.abs(delta[0]), Math.abs(delta[1]), Math.abs(delta[2])].reduce((best, value, axis) => value > Math.abs(delta[best]!) ? axis : best, 0)
    collision.push({
      kind: "capsule",
      center: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2],
      axis: (["x", "y", "z"] as const)[axisIndex]!, radius: spec.radius,
      halfLength: length / 2 + spec.radius,
    })
  }
  return [{
    key: "pipe", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "run") }, { level: 1, switchDistanceM: 20, graph: lod1 }],
    collision,
  }]
}

function planTrim(spec: Extract<SpatialParametricSpec, { kind: "trim" }>): PartPlan[] {
  const s = spec.size
  const points: [number, number][] = spec.profile === "chamfer"
    ? [[0, 0], [s, 0], [s, s - s * 0.3], [s - s * 0.3, s], [0, s]]
    : spec.profile === "cove"
      ? [[0, 0], [s, 0], [s, s * 0.35], [s * 0.85, s * 0.5], [s * 0.6, s * 0.68], [s * 0.35, s], [0, s]]
      : [[0, 0], [s, 0], [s, s], [0, s]]
  const nodes = [
    { id: "section", kind: "profile", points },
    { id: "rail", kind: "extrude", profile: "section", depth: spec.length },
  ]
  const lod1 = graph([
    { id: "proxy", kind: "box", size: [s, s, spec.length] },
    { id: "lift", kind: "transform", input: "proxy", transform: { position: [s / 2, s / 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
  ], "lift")
  return [{
    key: "trim", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "rail") }, { level: 1, switchDistanceM: LOD1_DISTANCE_M, graph: lod1 }],
    collision: [],
  }]
}

function yawQuaternion(radians: number): readonly [number, number, number, number] {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)]
}

function planScatter(spec: Extract<SpatialParametricSpec, { kind: "scatter" }>): PartPlan[] {
  const subject = spec.subject
  const subjectNode = subject.shape === "box"
    ? { id: "subject", kind: "box", size: subject.size }
    : subject.shape === "cylinder"
      ? { id: "subject", kind: "cylinder", radius: subject.radius, height: subject.height, segments: subject.segments ?? 16 }
      : { id: "subject", kind: "sphere", radius: subject.radius, segments: subject.segments ?? 16 }
  const subjectBounds = subject.shape === "box"
    ? { x: subject.size[0] / 2, y: subject.size[1] / 2, z: subject.size[2] / 2, yBase: 0 }
    : subject.shape === "cylinder"
      ? { x: subject.radius, y: subject.height / 2, z: subject.radius, yBase: 0 }
      : { x: subject.radius, y: subject.radius, z: subject.radius, yBase: 0 }
  const lod1Node = subject.shape === "box" ? subjectNode
    : subject.shape === "cylinder" ? { id: "subject", kind: "cylinder", radius: subject.radius, height: subject.height, segments: 8 }
    : { id: "subject", kind: "sphere", radius: subject.radius, segments: 8 }
  const exclusions = spec.exclusions ?? []
  const random = mulberry32(spec.seed)
  const instances: SpatialTransform[] = []
  const halfW = spec.area.width / 2, halfD = spec.area.depth / 2
  let attempts = 0
  while (instances.length < spec.count && ++attempts <= SPATIAL_PARAMETRIC_LIMITS.scatterAttempts * Math.min(spec.count, 64)) {
    const x = (random() * 2 - 1) * Math.max(0, halfW - subjectBounds.x)
    const z = (random() * 2 - 1) * Math.max(0, halfD - subjectBounds.z)
    const blocked = exclusions.some(zone =>
      x + subjectBounds.x > zone.center[0] - zone.halfExtents[0] && x - subjectBounds.x < zone.center[0] + zone.halfExtents[0]
      && z + subjectBounds.z > zone.center[1] - zone.halfExtents[1] && z - subjectBounds.z < zone.center[1] + zone.halfExtents[1])
    if (blocked) continue
    const yaw = random() * Math.PI * 2
    const scale = 0.85 + random() * 0.3
    instances.push({ position: [x, subjectBounds.yBase, z], rotation: [...yawQuaternion(yaw)] as [number, number, number, number], scale: [scale, scale, scale] })
  }
  if (instances.length < spec.count) {
    pfail(`Scatter placed ${instances.length} of ${spec.count} subjects; relax exclusions or shrink the subject.`, "spec.exclusions")
  }
  const nodes = [subjectNode]
  const lod1 = graph([lod1Node], "subject")
  return [{
    key: "scatter", transform: spec.transform ?? IDENTITY_TRANSFORM, editable: spec.editable ?? ["transform"],
    materials: [spec.material], lods: [{ level: 0, switchDistanceM: 0, graph: graph(nodes, "subject") }, { level: 1, switchDistanceM: LOD1_DISTANCE_M, graph: lod1 }],
    collision: [], instances,
  }]
}

const PLANNERS: { [K in SpatialParametricSpec["kind"]]: (spec: Extract<SpatialParametricSpec, { kind: K }>) => PartPlan[] } = {
  geometry: spec => [{ key: "geometry", transform: spec.transform ?? IDENTITY_TRANSFORM,
    editable: spec.editable ?? ["transform"], materials: spec.materials, collision: [],
    lods: [{ level: 0, switchDistanceM: 0, graph: spec.graph }] }],
  wall: planWall, floor: planFloor, stairs: planStairs, arch: planArch, column: planColumn,
  window: planWindow, roof: planRoof, pipe: planPipe, trim: planTrim, scatter: planScatter,
}

/** Retained GLB entities support the closed untextured material profile. */
function validatePartMaterials(plans: readonly PartPlan[]): void {
  for (const part of plans) {
    for (const material of part.materials) {
      if (material.kind === "pbr" || material.map !== undefined) {
        pfail("Retained parametric geometry requires untextured standard or unlit materials; PBR extension materials and texture maps are unsupported.", "spec.materials")
      }
    }
    for (const lod of part.lods) {
      const parsed = parseSpatialGeometryGraph(lod.graph)
      for (const node of parsed.nodes) {
        const slots = ["slot" in node ? node.slot : undefined, "sideSlot" in node ? node.sideSlot : undefined, "capSlot" in node ? node.capSlot : undefined]
        if (slots.some(slot => slot !== undefined && slot >= part.materials.length)) pfail("Geometry material slot has no declared material.", "spec.materials")
      }
    }
  }
}

/** Conservative aggregate retained-output budget, computed before mesh evaluation. */
export interface SpatialParametricEstimate {
  readonly parts: number
  readonly assets: number
  readonly vertices: number
  readonly triangles: number
  readonly bytes: number
}

export function estimateSpatialParametric(input: unknown): SpatialParametricEstimate {
  const spec = parseSpatialValue(SpatialParametricSpecSchema, input, "parametric spec")
  const plans = PLANNERS[spec.kind](spec as never)
  if (plans.length > SPATIAL_PARAMETRIC_LIMITS.parts) pfail("Spec expands beyond the part budget.", "spec")
  validatePartMaterials(plans)
  let assets = 0, vertices = 0, triangles = 0, bytes = 0
  for (const part of plans) {
    assets += part.lods.length + 1
    // Includes GLB framing, material JSON, facts, and per-part instance metadata.
    bytes += 65_536 + (part.instances?.length ?? 0) * 512
    for (const lod of part.lods) {
      const estimate = estimateSpatialGeometryGraph(lod.graph)
      vertices += estimate.vertices
      triangles += estimate.triangles
      bytes += estimate.bytes + 65_536
    }
  }
  return deepFreezeJson({ parts: plans.length, assets, vertices, triangles, bytes })
}

// ---------------------------------------------------------------------------
// Emission: graphs → meshes → GLB payloads → manifests → entities → facts
// ---------------------------------------------------------------------------

export interface SpatialParametricArtifact { readonly assetId: string; readonly path: string; readonly bytes: Uint8Array }
export interface SpatialParametricFacts { readonly manifest: SpatialAssetManifest; readonly facts: SpatialAssetFactsV1 }
export interface SpatialParametricReceipt {
  readonly name?: string
  readonly kind: "slopcamera.spatial-parametric-receipt"
  readonly schemaVersion: 1
  readonly generatorId: string
  readonly specSha256: string
  readonly parametersSha256: string
  readonly seed: number
  readonly profile: typeof SPATIAL_GEOMETRY_PROFILE
  readonly assets: readonly { assetId: string; sha256: string }[]
  readonly entities: readonly string[]
  readonly native: readonly { requestSha256: string; receiptSha256: string }[]
}
export interface SpatialParametricOutput {
  readonly generator: SpatialGenerator
  readonly entities: readonly SpatialEntity[]
  readonly manifests: readonly SpatialAssetManifest[]
  readonly artifacts: readonly SpatialParametricArtifact[]
  readonly facts: readonly SpatialParametricFacts[]
  readonly receipt: SpatialParametricReceipt
  readonly receiptSha256: string
}

function sha256Bytes(bytes: Uint8Array): string {
  const hasher = createSha256HexHasher(); hasher.update(bytes); return hasher.digestHex()
}

const GLTF_INTERPRETATION = { kind: "gltf" as const, format: "glb" as const, metersPerUnit: 1, sourceUp: "y" as const }

/**
 * Compiles a bounded parametric spec into retained generator output: stamped
 * entities, GLB payloads and manifests per LOD level, derived facts manifests,
 * and a content-addressed receipt. Deterministic and effect-free.
 */
export function emitSpatialParametric(input: unknown): SpatialParametricOutput {
  const request = parseSpatialValue(SpatialParametricRequestSchema, input, "parametric request")
  const { generatorId, spec } = request
  const retainedArtifacts: SpatialRetainedArtifact[] = []
  if (request.native !== undefined) {
    const receipt = validateSpatialGeometryNativeReceipt({ request: request.native.request, receipt: request.native.receipt })
    const outputs = verifySpatialGeometryNativeOutputs(receipt, request.native.outputs)
    retainedArtifacts.push({
      operation: receipt.operation,
      requestSha256: spatialGeometryNativeRequestSha256(request.native.request),
      receiptSha256: spatialGeometryNativeReceiptSha256(receipt),
      outputs: [...outputs],
    })
  }
  const sourceSha256 = spatialValueSha256({ domain: "slopcamera.parametric-source.v1", profile: SPATIAL_GEOMETRY_PROFILE, kind: spec.kind })
  const parametersSha256 = spatialGeneratorParametersSha256(spec)
  const specSha256 = spatialValueSha256({ domain: "slopcamera.parametric-spec.v1", spec })
  const seed = request.seed ?? deriveSpatialGeneratorSeed(sourceSha256)
  const runtimeSha256 = spatialValueSha256({ domain: "slopcamera.parametric-runtime.v1", profile: SPATIAL_GEOMETRY_PROFILE })
  const plans = PLANNERS[spec.kind](spec as never)
  if (plans.length > SPATIAL_PARAMETRIC_LIMITS.parts) pfail("Spec expands beyond the part budget.", "spec")
  validatePartMaterials(plans)
  const manifests: SpatialAssetManifest[] = []
  const artifacts: SpatialParametricArtifact[] = []
  const entities: SpatialEntity[] = []
  const factsList: SpatialParametricFacts[] = []
  const editableKeys: { key: string; properties: ("color" | "opacity" | "transform")[] }[] = []
  const receiptAssets: { assetId: string; sha256: string }[] = []
  const lod0ByPart = new Map<string, { assetId: string; manifest: SpatialAssetManifest; mesh: SpatialGeometryMesh; part: PartPlan }>()
  for (const part of plans) {
    const lods: { level: number; assetId: string; sha256: string; switchDistanceM: number }[] = []
    for (const lod of part.lods) {
      const evaluation = evaluateSpatialGeometry(lod.graph)
      const bytes = emitSpatialGeometryGlb(evaluation.mesh, part.materials)
      const sha256 = sha256Bytes(bytes)
      const assetId = `asset_${spatialValueSha256({ domain: "slopcamera.parametric-asset.v1", generatorId, key: part.key, level: lod.level, sha256 }).slice(0, 32)}`
      const path = `generated/${generatorId}/${part.key}-lod${lod.level}.glb`
      const manifest = parseSpatialValue(SpatialAssetManifestSchema, {
        assetId, payload: { path, sha256, bytes: bytes.byteLength },
        interpretation: GLTF_INTERPRETATION, dependencies: [],
        provenance: { source: "generated", description: `Parametric ${spec.kind} part "${part.key}" LOD ${lod.level}.`, receiptSha256: "0".repeat(64) },
      }, `parametric asset ${part.key}`)
      manifests.push(manifest)
      artifacts.push({ assetId, path, bytes })
      lods.push({ level: lod.level, assetId, sha256, switchDistanceM: lod.switchDistanceM })
      if (lod.level === 0) lod0ByPart.set(part.key, { assetId, manifest, mesh: evaluation.mesh, part })
    }
    lods.sort((a, b) => a.level - b.level)
    const lod0 = lod0ByPart.get(part.key)!
    if (part.lods[0] === undefined) pfail("Every part requires a level-0 LOD.", "spec")
    // Facts document for the level-0 subject.
    const subject = lod0.manifest.payload
    const collision = request.collision !== undefined ? [...request.collision]
      : part.collision.length > 0 ? [...part.collision]
      : [boxBounds(lod0.mesh.bounds)]
    const materialFacts = part.materials.map(material => ({
      alphaMode: (material.opacity < 1 ? "BLEND" : "OPAQUE") as "BLEND" | "OPAQUE",
      doubleSided: false, maps: [] as [],
      ...(material.kind === "standard" && material.emissive !== undefined
        ? { emissiveLinear: [1, 1, 1].map(() => 0) as [number, number, number] } : {}),
    }))
    const facts = parseSpatialValue(SpatialAssetFactsV1Schema, {
      kind: "slopcamera.spatial-asset-facts", schemaVersion: 1,
      subject: { path: subject.path, sha256: subject.sha256, bytes: subject.bytes },
      subjectManifestSha256: spatialAssetManifestSha256(lod0.manifest),
      profile: SPATIAL_GEOMETRY_PROFILE, nodeCount: 1, clipDurationsSeconds: [],
      bounds: { modelSpace: lod0.mesh.bounds, sceneSpace: lod0.mesh.bounds },
      materials: materialFacts,
      generator: {
        generatorId, parametricKind: spec.kind, specSha256, parametersSha256,
        lods: lods.map(lod => ({ level: lod.level, assetId: lod.assetId, sha256: lod.sha256, switchDistanceM: lod.switchDistanceM })),
        collision,
        ...(retainedArtifacts.length === 0 ? {} : { retainedArtifacts }),
      },
    }, `parametric facts ${part.key}`)
    const factsText = `${canonicalJson(facts)}\n`
    const factsBytes = new TextEncoder().encode(factsText)
    const factsSha256 = sha256Bytes(factsBytes)
    const factsManifest = parseSpatialValue(SpatialAssetManifestSchema, {
      assetId: `asset_${spatialValueSha256({ domain: "slopcamera.parametric-facts.v1", generatorId, key: part.key, sha256: factsSha256 }).slice(0, 32)}`,
      payload: { path: `generated/${generatorId}/${part.key}-facts.json`, sha256: factsSha256, bytes: factsBytes.byteLength },
      interpretation: { kind: "metadata", format: "json", schema: "slopcamera.spatial-asset-facts" },
      dependencies: [lod0.assetId],
      provenance: { source: "derived", description: `Derived parametric facts for ${lod0.assetId}.`, receiptSha256: "0".repeat(64) },
    }, `parametric facts manifest ${part.key}`)
    manifests.push(factsManifest)
    artifacts.push({ assetId: factsManifest.assetId, path: factsManifest.payload.path, bytes: factsBytes })
    factsList.push({ manifest: factsManifest, facts })
    const entityId = generatedSpatialEntityId(generatorId, part.key)
    const multiSlot = part.materials.length > 1
    const entity = parseSpatialValue(SpatialEntitySchema, {
      entityId, kind: "mesh", name: request.name === undefined ? `${spec.kind}:${part.key}` : plans.length === 1 ? request.name : `${request.name}:${part.key}`, parentId: null,
      transform: part.transform, placement: { kind: "world" },
      origin: { kind: "generated", generatorId, key: part.key }, visible: true,
      geometry: { kind: "asset", assetId: lod0.assetId, materialMode: multiSlot ? "source" : "entity" },
      material: part.materials[0]!,
      ...(spec.castShadow === undefined ? {} : { castShadow: spec.castShadow }),
      ...(spec.receiveShadow === undefined ? {} : { receiveShadow: spec.receiveShadow }),
      ...(part.instances === undefined ? {} : { instances: [...part.instances] }),
    }, `parametric entity ${part.key}`)
    entities.push(entity)
    editableKeys.push({ key: part.key, properties: multiSlot ? ["transform"] : [...part.editable] })
    receiptAssets.push(...lods.map(lod => ({ assetId: lod.assetId, sha256: lod.sha256 })))
    receiptAssets.push({ assetId: factsManifest.assetId, sha256: factsSha256 })
  }
  const closureSha256 = spatialValueSha256({ domain: "slopcamera.parametric-closure.v1", sourceSha256, parametersSha256, seed, specSha256 })
  const assetIds = manifests.map(manifest => manifest.assetId).sort()
  const record = buildSpatialGeneratorRecord({
    generatorId, sourceSha256, closureSha256, parametersSha256, seed, runtimeSha256,
    entities, editableKeys, assets: assetIds,
  })
  const receipt = deepFreezeJson({
    kind: "slopcamera.spatial-parametric-receipt" as const, schemaVersion: 1 as const,
    generatorId, specSha256, parametersSha256, seed,
    ...(request.name === undefined ? {} : { name: request.name }),
    profile: SPATIAL_GEOMETRY_PROFILE,
    assets: receiptAssets,
    entities: entities.map(entity => entity.entityId).sort(),
    native: retainedArtifacts.map(artifact => ({ requestSha256: artifact.requestSha256, receiptSha256: artifact.receiptSha256 })),
  })
  const receiptSha256 = spatialValueSha256({ domain: "slopcamera.spatial-parametric-receipt.v1", receipt })
  // Bind the receipt digest into generated provenance now that it exists.
  const bound = manifests.map(manifest => manifest.provenance.source === "generated"
    ? parseSpatialValue(SpatialAssetManifestSchema, { ...manifest, provenance: { ...manifest.provenance, receiptSha256 } }, `parametric asset ${manifest.assetId}`)
    : manifest)
  // Payload buffers are owned binary outputs, outside the canonical JSON domain.
  const metadata = deepFreezeJson({ generator: record, entities, manifests: bound, facts: factsList, receipt, receiptSha256 })
  return Object.freeze({ ...metadata, artifacts: Object.freeze(artifacts.map(artifact => Object.freeze(artifact))) })
}

/** Merges one emission into a scene through the retained-output contract. */
export function mergeSpatialParametricOutput(scene: SpatialSceneV1 | undefined, output: SpatialParametricOutput): SpatialSceneV1 {
  return mergeSpatialGeneratorOutput(scene, output.generator, output.entities, output.manifests)
}

// ---------------------------------------------------------------------------
// LOD selection and audit
// ---------------------------------------------------------------------------

/** Deterministic LOD rule: the greatest level whose switch distance is met. */
export function selectSpatialLod(lods: readonly { level: number; assetId: string; switchDistanceM: number }[], distanceM: number): { level: number; assetId: string; switchDistanceM: number } {
  let selected = lods[0]!
  for (const lod of lods) {
    if (lod.level === 0) selected = lod
    else if (distanceM >= lod.switchDistanceM && lod.level > selected.level) selected = lod
  }
  return selected
}

export interface SpatialParametricAuditEntry {
  readonly entityId: string
  readonly key: string
  readonly generatorId: string
  readonly distanceM: number
  readonly lodAssetId: string
  readonly lodLevel: number
  readonly collision: readonly string[]
  readonly retainedArtifacts: number
}

/**
 * Reports which LOD/proxy each parametric entity resolves under one camera:
 * distance from the camera position to the transformed bounds center selects
 * the deterministic level, and collision kinds + retained artifact counts come
 * from the asset facts documents.
 */
export function auditSpatialParametricScene(sceneInput: unknown, factsInput: readonly unknown[], options: { cameraId: string; timeUs?: number }): readonly SpatialParametricAuditEntry[] {
  const scene = parseSpatialScene(sceneInput)
  const factsBySubject = new Map<string, SpatialAssetFactsV1>()
  for (const input of factsInput) {
    const facts = parseSpatialValue(SpatialAssetFactsV1Schema, input, "asset facts")
    if (facts.generator !== undefined) factsBySubject.set(facts.subject.sha256, facts)
  }
  const snapshot = evaluateSpatialScene(scene, { cameraId: options.cameraId, timeUs: options.timeUs ?? 0 })
  const camera = snapshot.camera.pose.position
  const assetsById = new Map(scene.assets.map(asset => [asset.assetId, asset]))
  const entries: SpatialParametricAuditEntry[] = []
  for (const item of snapshot.entities) {
    const { entity, worldMatrix } = item
    if (entity.origin.kind !== "generated" || entity.kind !== "mesh" || entity.geometry.kind !== "asset") continue
    const asset = assetsById.get(entity.geometry.assetId)
    if (asset === undefined) continue
    const facts = factsBySubject.get(asset.payload.sha256)
    if (facts === undefined || facts.generator === undefined) continue
    const bounds = transformBounds(worldMatrix as Mat4, facts.bounds.modelSpace)
    const center = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2] as const
    const distance = Math.hypot(center[0] - camera[0], center[1] - camera[1], center[2] - camera[2])
    const lod = selectSpatialLod(facts.generator.lods, distance)
    entries.push({
      entityId: entity.entityId, key: entity.origin.key, generatorId: entity.origin.generatorId,
      distanceM: distance, lodAssetId: lod.assetId, lodLevel: lod.level,
      collision: facts.generator.collision.map(proxy => proxy.kind),
      retainedArtifacts: facts.generator.retainedArtifacts?.length ?? 0,
    })
  }
  return deepFreezeJson(entries)
}

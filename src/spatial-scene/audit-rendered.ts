import { z } from "zod"
import { createBoundedJsonValueSnapshot, deepFreezeJson } from "../code/json-snapshot.js"
import {
  SPATIAL_SCENE_LIMITS, SpatialAssetIdSchema, SpatialCameraIdSchema, SpatialDigestSchema,
  SpatialEntityIdSchema, SpatialPlacementSchema, SpatialSceneIdSchema, SpatialTimeUsSchema,
  type SpatialEntity,
} from "./contracts.js"
import { auditSpatialSceneInContext, SPATIAL_AUDIT_LIMITS, SpatialAuditBoundsSchema } from "./audit.js"
import { createSpatialEvaluationContext, type SpatialEvaluationContext } from "./evaluate.js"
import {
  parseSpatialValue, sortSpatialBy, SpatialSceneError,
} from "./identity.js"
import type { Bounds } from "./math.js"

export const SPATIAL_RENDERED_AUDIT_LIMITS = Object.freeze({
  /** Decoded object-ID frames per audit; the geometric audit owns sample cadence. */
  samples: SPATIAL_AUDIT_LIMITS.samples,
  /** Retained findings; any excess is counted in `omittedFindings`. */
  findings: SPATIAL_AUDIT_LIMITS.findings,
  /** Joint bound on entities × frames so reports stay bounded. */
  entitySamples: SPATIAL_AUDIT_LIMITS.entitySamples,
  /** Canonical report byte bound checked before return. */
  reportBytes: SPATIAL_AUDIT_LIMITS.reportBytes,
  /** Selection codes occupy [1, 4096] in the RGB big-endian uint24 pass. */
  selectionIds: 4_096,
  /** A single decoded object-ID frame stays inside the renderer's pixel budget. */
  frameDimension: 8_192,
  framePixels: 33_554_432,
})

const ENTITY_KINDS = ["group", "mesh", "image", "diagram", "video", "text", "light", "splat", "environment"] as const
const ELIGIBILITY = ["renderable", "proxy-coverage", "view-masked", "no-surface", "unsupported-kind"] as const
const BOUNDS_UNKNOWN_REASONS = ["requires-asset-decoding", "requires-text-layout", "no-surface"] as const
const FINDING_KINDS = [
  "never-rendered", "unsupported-kind", "proxy-coverage", "occluded", "unattributed-pixels", "empty-render", "bounds-unknown",
] as const
const SAMPLE_NOTES = ["out-of-range", "other-camera", "unlowered-expected"] as const

/**
 * The lowering-evidence representation label for a splat lowered as its
 * bounding-box proxy. The host derives the box from the prepared splat's
 * decoded position bounds, so the emitted pixels are approximate coverage —
 * never splat pixel truth. The string is part of the lowering↔audit contract;
 * frame evidence uses it so this analyzer can tell an honest proxy from a
 * surface that must not claim splat attribution.
 */
export const SPATIAL_SPLAT_PROXY_REPRESENTATION =
  "splat-bounding-box-proxy;spz-position-bounds;approximate-not-pixel-truth"

/**
 * The coverage policy rendered by the host. Mirrored from the overlay batch
 * contract rather than imported so this boundary stays portable: alpha-threshold
 * admits every surface whose effective alpha reaches the threshold; opaque
 * requires exactly opaque materials and textures.
 */
export const SpatialRenderedAuditCoverageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("opaque") }),
  z.strictObject({ kind: z.literal("alpha-threshold"), threshold: z.number().finite().gt(0).max(1) }),
])
export type SpatialRenderedAuditCoverage = z.infer<typeof SpatialRenderedAuditCoverageSchema>
/** The default audit pass counts a pixel when effective alpha reaches one half. */
export const SPATIAL_RENDERED_AUDIT_COVERAGE: SpatialRenderedAuditCoverage = Object.freeze({ kind: "alpha-threshold", threshold: 0.5 })

const selectionIdSchema = z.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.selectionIds)
const selectionKeyPattern = /^(?:0|[1-9]\d{0,3})$/u
const pixelCountSchema = z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels)

/** One entity-to-selection evidence row from the rendered batch metadata. */
export const SpatialRenderedAuditObjectSchema = z.strictObject({
  entityId: SpatialEntityIdSchema,
  selectionId: selectionIdSchema,
  representation: z.string().min(1).max(256),
  placement: z.enum(["world", "view"]),
  assetManifestSha256: SpatialDigestSchema.optional(),
  /** Lowered instance count; the object-ID pass attributes every instance to this entity's selection code. */
  instances: z.number().int().min(1).max(SPATIAL_SCENE_LIMITS.entities).optional(),
})

/** One decoded object-ID frame: per-selection pixel counts plus lowering evidence. */
export const SpatialRenderedAuditFrameSchema = z.strictObject({
  timeUs: SpatialTimeUsSchema,
  width: z.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension),
  height: z.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension),
  /** Digest of the exact rendered bytes these counts were decoded from. */
  pngSha256: SpatialDigestSchema,
  counts: z.record(z.string().regex(selectionKeyPattern), pixelCountSchema),
  objects: z.array(SpatialRenderedAuditObjectSchema).max(SPATIAL_SCENE_LIMITS.entities),
}).superRefine((frame, context) => {
  const pixels = frame.width * frame.height
  if (pixels > SPATIAL_RENDERED_AUDIT_LIMITS.framePixels) {
    context.addIssue({ code: "custom", message: "Object-ID frame exceeds the pixel budget." })
  }
  let total = 0
  for (const [key, count] of Object.entries(frame.counts)) {
    const code = Number(key)
    if (!Number.isInteger(code) || code < 1 || code > SPATIAL_RENDERED_AUDIT_LIMITS.selectionIds) {
      context.addIssue({ code: "custom", message: "Object-ID counts must key selection codes in [1,4096]." })
    }
    total += count
  }
  if (total > pixels) {
    context.addIssue({ code: "custom", message: "Object-ID counts exceed the frame pixel count." })
  }
  const entityIds = new Set<string>(), selectionIds = new Set<number>()
  for (const object of frame.objects) {
    if (entityIds.has(object.entityId) || selectionIds.has(object.selectionId)) {
      context.addIssue({ code: "custom", message: "Frame evidence must name each entity and selection code once." })
    }
    entityIds.add(object.entityId); selectionIds.add(object.selectionId)
  }
})

export const SpatialRenderedAuditSampleSchema = z.strictObject({
  timeUs: SpatialTimeUsSchema,
  /** The entity was eligible and effectively visible under the audited camera. */
  expected: z.boolean(),
  /** The renderer lowered the entity into this frame's object-ID pass. */
  lowered: z.boolean(),
  /** At least one frame pixel was attributed to this entity. */
  rendered: z.boolean(),
  pixels: z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels),
  framePercent: z.number().finite().min(0).max(100),
  /** Geometric corner-projection estimate in px² when bounds exist. */
  geometricPixels: z.number().finite().min(0).max(1e15).optional(),
  /** rendered pixels ÷ geometricPixels; absent when the estimate is zero. */
  coverageRatio: z.number().finite().min(0).max(1e15).optional(),
  note: z.enum(SAMPLE_NOTES).optional(),
})
export const SpatialRenderedAuditEntitySchema = z.strictObject({
  entityId: SpatialEntityIdSchema,
  name: z.string().min(1).max(256),
  kind: z.enum(ENTITY_KINDS),
  placement: SpatialPlacementSchema,
  /** Whether the object-ID pass can attribute pixels to this entity at all. */
  eligibility: z.enum(ELIGIBILITY),
  selectionId: selectionIdSchema,
  enclosure: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("bounded") }),
    z.strictObject({ status: z.literal("unknown"), reason: z.enum(BOUNDS_UNKNOWN_REASONS) }),
  ]),
  /** Present on mesh entities only when local-space instances are declared. */
  instances: z.number().int().min(1).max(SPATIAL_SCENE_LIMITS.entities).optional(),
  samples: z.array(SpatialRenderedAuditSampleSchema).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
  totals: z.strictObject({
    expected: z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    lowered: z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    rendered: z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    pixels: z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels * SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    maxPixels: z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels),
    maxFramePercent: z.number().finite().min(0).max(100),
  }),
})
export const SpatialRenderedAuditFrameReportSchema = z.strictObject({
  timeUs: SpatialTimeUsSchema,
  pngSha256: SpatialDigestSchema,
  renderedPixels: pixelCountSchema,
  /** Pixels carrying selection codes absent from the frame's attributable evidence. */
  unattributedPixels: pixelCountSchema,
  loweredEntities: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
})
export const SpatialRenderedAuditFindingSchema = z.strictObject({
  severity: z.enum(["info", "warning"]),
  kind: z.enum(FINDING_KINDS),
  entityId: SpatialEntityIdSchema.optional(),
  timeUs: SpatialTimeUsSchema.optional(),
  detail: z.string().min(1).max(1_024),
})
export const SpatialRenderedAuditReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-rendered-audit"),
  schemaVersion: z.literal(1),
  sceneId: SpatialSceneIdSchema,
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  durationUs: SpatialTimeUsSchema,
  /** Ascending unique sample times, one decoded frame each. */
  timesUs: z.array(SpatialTimeUsSchema).min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
  mode: z.strictObject({ kind: z.literal("object-id"), coverage: SpatialRenderedAuditCoverageSchema }),
  frame: z.strictObject({
    width: z.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension),
    height: z.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension),
    pixels: pixelCountSchema,
  }),
  summary: z.strictObject({
    entities: z.strictObject({
      total: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      renderable: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      /** Splats lowered as bounding-box proxies — approximate coverage, never splat pixel truth. */
      proxyCoverage: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities).optional(),
      viewMasked: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      noSurface: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      unsupported: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
    }),
    /** Authored-visible renderable or view entities that produced zero attributed pixels. */
    entitiesNeverRendered: z.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    entitiesUnsupported: z.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    entitiesViewMasked: z.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    entitiesProxyCoverage: z.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities).optional(),
    renderedPixels: z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels * SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    unattributedPixels: z.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels * SPATIAL_RENDERED_AUDIT_LIMITS.samples),
  }),
  entities: z.array(SpatialRenderedAuditEntitySchema).max(SPATIAL_SCENE_LIMITS.entities),
  frames: z.array(SpatialRenderedAuditFrameReportSchema).min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
  findings: z.array(SpatialRenderedAuditFindingSchema).max(SPATIAL_RENDERED_AUDIT_LIMITS.findings),
  omittedFindings: z.number().int().min(0),
})

/**
 * Structural report types mirror the schemas above rather than inferring from
 * them, following `audit.ts`: recursive readonly mappers over the strict-object
 * graph measurably slow every authored-source typecheck that reaches this
 * module through the `./code` surface.
 */
export interface SpatialRenderedAuditObject {
  readonly entityId: string
  readonly selectionId: number
  readonly representation: string
  readonly placement: "world" | "view"
  readonly assetManifestSha256?: string | undefined
  readonly instances?: number | undefined
}
export interface SpatialRenderedAuditFrame {
  readonly timeUs: number
  readonly width: number
  readonly height: number
  readonly pngSha256: string
  readonly counts: Readonly<Record<string, number>>
  readonly objects: readonly SpatialRenderedAuditObject[]
}
export interface SpatialRenderedAuditSample {
  readonly timeUs: number
  readonly expected: boolean
  readonly lowered: boolean
  readonly rendered: boolean
  readonly pixels: number
  readonly framePercent: number
  readonly geometricPixels?: number | undefined
  readonly coverageRatio?: number | undefined
  readonly note?: (typeof SAMPLE_NOTES)[number] | undefined
}
export interface SpatialRenderedAuditEntity {
  readonly entityId: string
  readonly name: string
  readonly kind: (typeof ENTITY_KINDS)[number]
  readonly placement: SpatialEntity["placement"]
  readonly eligibility: (typeof ELIGIBILITY)[number]
  readonly selectionId: number
  readonly enclosure:
    | { readonly status: "bounded" }
    | { readonly status: "unknown"; readonly reason: (typeof BOUNDS_UNKNOWN_REASONS)[number] }
  readonly instances?: number | undefined
  readonly samples: readonly SpatialRenderedAuditSample[]
  readonly totals: {
    readonly expected: number
    readonly lowered: number
    readonly rendered: number
    readonly pixels: number
    readonly maxPixels: number
    readonly maxFramePercent: number
  }
}
export interface SpatialRenderedAuditFinding {
  readonly severity: "info" | "warning"
  readonly kind: (typeof FINDING_KINDS)[number]
  readonly entityId?: string | undefined
  readonly timeUs?: number | undefined
  readonly detail: string
}
export interface SpatialRenderedAuditReport {
  readonly kind: "slopcamera.spatial-rendered-audit"
  readonly schemaVersion: 1
  readonly sceneId: string
  readonly sceneSha256: string
  readonly cameraId: string
  readonly durationUs: number
  readonly timesUs: readonly number[]
  readonly mode: { readonly kind: "object-id"; readonly coverage: SpatialRenderedAuditCoverage }
  readonly frame: { readonly width: number; readonly height: number; readonly pixels: number }
  readonly summary: {
    readonly entities: {
      readonly total: number
      readonly renderable: number
      readonly proxyCoverage?: number | undefined
      readonly viewMasked: number
      readonly noSurface: number
      readonly unsupported: number
    }
    readonly entitiesNeverRendered: readonly string[]
    readonly entitiesUnsupported: readonly string[]
    readonly entitiesViewMasked: readonly string[]
    readonly entitiesProxyCoverage?: readonly string[] | undefined
    readonly renderedPixels: number
    readonly unattributedPixels: number
  }
  readonly entities: readonly SpatialRenderedAuditEntity[]
  readonly frames: readonly {
    readonly timeUs: number
    readonly pngSha256: string
    readonly renderedPixels: number
    readonly unattributedPixels: number
    readonly loweredEntities: number
  }[]
  readonly findings: readonly SpatialRenderedAuditFinding[]
  readonly omittedFindings: number
}

export const SpatialRenderedAuditOptionsSchema = z.strictObject({
  cameraId: SpatialCameraIdSchema,
  assetBounds: z.record(SpatialAssetIdSchema, SpatialAuditBoundsSchema).optional(),
  /** Records which coverage policy produced the decoded frames. */
  coverage: SpatialRenderedAuditCoverageSchema.optional(),
})
export interface SpatialRenderedAuditOptions {
  readonly cameraId: string
  readonly assetBounds?: Readonly<Record<string, Bounds>>
  readonly coverage?: SpatialRenderedAuditCoverage
}

/**
 * Decodes one binary-validity object-ID frame into per-selection pixel counts.
 * No-hit is exactly [0,0,0,0]; every drawn pixel must carry alpha 255 and a
 * selection code in [1,4096]. Anything else is not a qualified pass output.
 */
export function decodeObjectIdPixels(rgba: Uint8Array, width: number, height: number): Record<string, number> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension || height > SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension
    || width * height > SPATIAL_RENDERED_AUDIT_LIMITS.framePixels) {
    throw new RangeError("Object-ID frame dimensions exceed their bound.")
  }
  if (rgba.length !== width * height * 4) {
    throw new RangeError("Object-ID pixels must be exactly width × height RGBA8.")
  }
  const counts: Record<string, number> = {}
  for (let index = 0; index < rgba.length; index += 4) {
    const red = rgba[index]!, green = rgba[index + 1]!, blue = rgba[index + 2]!, alpha = rgba[index + 3]!
    if (alpha === 0) {
      if (red !== 0 || green !== 0 || blue !== 0) {
        throw new RangeError("Object-ID no-hit pixels must be exactly [0,0,0,0].")
      }
      continue
    }
    const code = red * 65_536 + green * 256 + blue
    if (alpha !== 255 || code === 0 || code > SPATIAL_RENDERED_AUDIT_LIMITS.selectionIds) {
      throw new RangeError("Object-ID pixels must be alpha-255 selection codes in [1,4096].")
    }
    counts[String(code)] = (counts[String(code)] ?? 0) + 1
  }
  return counts
}

const round3 = (value: number): number => Math.round(value * 1_000) / 1_000

function eligibility(entity: SpatialEntity, assetBounds: Readonly<Record<string, Bounds>>): (typeof ELIGIBILITY)[number] {
  if (entity.kind === "splat") {
    // A world-placed splat with supplied bounds lowers its bounding-box proxy
    // in the object-ID pass — approximate coverage, never pixel truth. A view
    // placement or absent bounds keeps the honest unsupported report.
    return entity.placement.kind === "world" && assetBounds[entity.assetId] !== undefined
      ? "proxy-coverage" : "unsupported-kind"
  }
  if (entity.kind === "group" || entity.kind === "light" || entity.kind === "environment") return "no-surface"
  if (entity.placement.kind === "view") return "view-masked"
  return "renderable"
}

/** The manifest-bearing asset an entity's lowered representation binds, if any. */
function entityAssetId(entity: SpatialEntity): string | undefined {
  switch (entity.kind) {
    case "mesh": return entity.geometry.kind === "asset" ? entity.geometry.assetId : entity.material.map
    case "image": case "diagram": case "video": case "environment": return entity.assetId
    case "text": return entity.fontAssetId
    case "splat": return entity.assetId
    default: return undefined
  }
}

type Finding = SpatialRenderedAuditFinding
const findingOrder = (finding: Finding): string =>
  `${finding.kind}:${finding.entityId ?? ""}:${String(finding.timeUs ?? -1).padStart(12, "0")}`

interface FrameDraft {
  readonly timeUs: number
  readonly width: number
  readonly height: number
  readonly pngSha256: string
  /** selectionId → attributed entity pixels for every declared evidence code. */
  readonly attributed: ReadonlyMap<number, number>
  readonly lowered: ReadonlyMap<string, SpatialRenderedAuditObject>
  readonly renderedPixels: number
  readonly unattributedPixels: number
}

/**
 * Reconciles decoded object-ID frames against per-frame lowering evidence and
 * the geometric audit's expectations. Pure and deterministic: the renderer,
 * decoding and file IO all live in the host; this module sees only counts,
 * evidence rows, and the parsed scene. Unsupported kinds are reported, never
 * estimated; a splat with supplied bounds reports `proxy-coverage` — the proxy
 * attribution is real while its drawn shape stays an approximation.
 */
export function auditSpatialSceneRendered(
  sceneInput: unknown,
  framesInput: unknown,
  options: SpatialRenderedAuditOptions,
): SpatialRenderedAuditReport {
  return auditSpatialSceneRenderedInContext(createSpatialEvaluationContext(sceneInput), framesInput, options)
}

/**
 * The rendered audit against a shared evaluation context. The embedded
 * geometric audit consumes the same context, so one parse and index pass
 * covers frame reconciliation and every geometric sample.
 */
export function auditSpatialSceneRenderedInContext(
  context: SpatialEvaluationContext,
  framesInput: unknown,
  options: SpatialRenderedAuditOptions,
): SpatialRenderedAuditReport {
  const scene = context.scene
  const captured = parseSpatialValue(SpatialRenderedAuditOptionsSchema, options, "rendered audit options")
  const coverage = captured.coverage ?? SPATIAL_RENDERED_AUDIT_COVERAGE
  const cameraId = captured.cameraId
  if (!context.camerasById.has(cameraId)) {
    throw new SpatialSceneError("not-found", `Unknown camera ${cameraId}.`, "cameraId")
  }
  const assetIds = new Set(scene.assets.map(asset => asset.assetId))
  for (const assetId of Object.keys(captured.assetBounds ?? {})) {
    if (!assetIds.has(assetId)) throw new SpatialSceneError("invalid-data", `Asset bounds reference unknown ${assetId}.`, "assetBounds")
  }
  const frames = parseSpatialValue(
    z.array(SpatialRenderedAuditFrameSchema).min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    framesInput, "rendered audit frames",
  )
  const timeSet = new Set(frames.map(frame => frame.timeUs))
  if (timeSet.size !== frames.length) {
    throw new SpatialSceneError("invalid-data", "Rendered audit frames must have unique sample times.", "frames")
  }
  const timesUs = [...timeSet].sort((a, b) => a - b)
  for (const timeUs of timesUs) {
    if (timeUs > scene.durationUs) throw new SpatialSceneError("invalid-data", "Rendered audit sample time exceeds scene duration.", "frames")
  }
  if (scene.entities.length * timesUs.length > SPATIAL_RENDERED_AUDIT_LIMITS.entitySamples) {
    throw new SpatialSceneError("invalid-data", "Rendered audit entity-sample budget exceeded; pass fewer frames.", "frames")
  }
  const first = frames[0]!
  for (const frame of frames) {
    if (frame.width !== first.width || frame.height !== first.height) {
      throw new SpatialSceneError("invalid-data", "Rendered audit frames must share one calibrated dimension.", "frames")
    }
  }
  const framePixels = first.width * first.height

  // Frame evidence must be internally consistent with the parsed scene: the
  // selection code is the canonical entity index and an asset digest must match
  // the declared manifest closure.
  const entityIndex = new Map(scene.entities.map((entity, index) => [entity.entityId, index + 1]))
  const manifestDigests = context.assetDigests
  const frameDrafts = new Map<number, FrameDraft>()
  for (const frame of frames) {
    const attributed = new Map<number, number>()
    const lowered = new Map<string, SpatialRenderedAuditObject>()
    for (const object of frame.objects) {
      const entity = scene.entities.find(candidate => candidate.entityId === object.entityId)
      if (entity === undefined) {
        throw new SpatialSceneError("invalid-data", `Frame evidence names unknown entity ${object.entityId}.`, "frames")
      }
      if (object.selectionId !== entityIndex.get(object.entityId)!) {
        throw new SpatialSceneError("invalid-data", `Frame evidence selection id differs from the canonical index for ${object.entityId}.`, "frames")
      }
      if (object.assetManifestSha256 !== undefined) {
        const assetId = entityAssetId(entity)
        if (assetId === undefined || manifestDigests[assetId] !== object.assetManifestSha256) {
          throw new SpatialSceneError("invalid-data", `Frame evidence asset digest does not match the declared manifest for ${object.entityId}.`, "frames")
        }
      }
      if (entity.kind === "splat") {
        // A lowered splat is exactly its supplied-bounds box under the normal
        // selection code; any other representation must not claim attribution.
        if (object.representation !== SPATIAL_SPLAT_PROXY_REPRESENTATION || object.placement !== "world"
          || entity.placement.kind !== "world" || captured.assetBounds?.[entity.assetId] === undefined) {
          throw new SpatialSceneError("invalid-data", `Frame evidence may lower splat ${object.entityId} only as its supplied-bounds bounding-box proxy.`, "frames")
        }
      } else if (object.representation === SPATIAL_SPLAT_PROXY_REPRESENTATION) {
        throw new SpatialSceneError("invalid-data", `Frame evidence must not mark non-splat ${object.entityId} as a splat bounding-box proxy.`, "frames")
      }
      const declaredInstances = entity.kind === "mesh" && entity.instances !== undefined ? entity.instances.length : undefined
      if (object.instances !== declaredInstances) {
        throw new SpatialSceneError("invalid-data", `Frame evidence instance count differs from the authored declaration for ${object.entityId}.`, "frames")
      }
      lowered.set(object.entityId, object)
      // The object-ID pass writes the declared selection code for every lowered
      // surface, including view placement; only the depth pass masks view to
      // no-hit. Codes without evidence remain unattributed.
      attributed.set(object.selectionId, 0)
    }
    let renderedPixels = 0, unattributedPixels = 0
    for (const [key, count] of Object.entries(frame.counts)) {
      const code = Number(key)
      if (!attributed.has(code)) { unattributedPixels += count; continue }
      attributed.set(code, count)
      renderedPixels += count
    }
    frameDrafts.set(frame.timeUs, {
      timeUs: frame.timeUs, width: frame.width, height: frame.height, pngSha256: frame.pngSha256,
      attributed, lowered, renderedPixels, unattributedPixels,
    })
  }

  // The geometric audit supplies effective visibility and corner-projection
  // coverage; the rendered audit compares, never substitutes, its estimate.
  const geometric = auditSpatialSceneInContext(context, {
    cameraId, timesUs,
    ...(captured.assetBounds === undefined ? {} : { assetBounds: captured.assetBounds }),
  })
  const geometricEntities = new Map(geometric.entities.map(entity => [entity.entityId, entity]))
  const geometricSamples = new Map(geometric.entities.map(entity => [
    entity.entityId, new Map(entity.samples.map(sample => [sample.timeUs, sample])),
  ]))

  const findings: Finding[] = []
  const entities: SpatialRenderedAuditEntity[] = []
  const entitiesNeverRendered: string[] = []
  const entitiesUnsupported: string[] = []
  const entitiesViewMasked: string[] = []
  const entitiesProxyCoverage: string[] = []
  const suppliedAssetBounds = captured.assetBounds ?? {}
  const eligibilityCounts = { renderable: 0, "proxy-coverage": 0, "view-masked": 0, "no-surface": 0, "unsupported-kind": 0 }
  for (const entity of scene.entities) {
    const entityEligibility = eligibility(entity, suppliedAssetBounds)
    eligibilityCounts[entityEligibility]++
    if (entityEligibility === "unsupported-kind") entitiesUnsupported.push(entity.entityId)
    if (entityEligibility === "view-masked") entitiesViewMasked.push(entity.entityId)
    if (entityEligibility === "proxy-coverage") entitiesProxyCoverage.push(entity.entityId)
    const selectionId = entityIndex.get(entity.entityId)!
    const geometricEntity = geometricEntities.get(entity.entityId)!
    const geoSamples = geometricSamples.get(entity.entityId)!
    const samples: SpatialRenderedAuditSample[] = []
    for (const timeUs of timesUs) {
      const frame = frameDrafts.get(timeUs)!
      const geo = geoSamples.get(timeUs)!
      const evidence = frame.lowered.get(entity.entityId)
      const expected = (entityEligibility === "renderable" || entityEligibility === "view-masked" || entityEligibility === "proxy-coverage")
        && geo.visible && geo.note !== "other-camera"
      const lowered = evidence !== undefined
      const pixels = evidence !== undefined ? frame.attributed.get(selectionId) ?? 0 : 0
      const note: (typeof SAMPLE_NOTES)[number] | undefined = expected && !lowered ? "unlowered-expected" : geo.note
      samples.push({
        timeUs, expected, lowered, rendered: pixels > 0, pixels,
        framePercent: round3(pixels * 100 / framePixels),
        ...(geo.frustum === undefined ? {} : { geometricPixels: geo.frustum.pixelFootprint }),
        ...(geo.frustum !== undefined && geo.frustum.pixelFootprint > 0
          ? { coverageRatio: round3(pixels / geo.frustum.pixelFootprint) } : {}),
        ...(note === undefined ? {} : { note }),
      })
    }
    const totals = {
      expected: samples.filter(sample => sample.expected).length,
      lowered: samples.filter(sample => sample.lowered).length,
      rendered: samples.filter(sample => sample.rendered).length,
      pixels: samples.reduce((sum, sample) => sum + sample.pixels, 0),
      maxPixels: samples.reduce((maximum, sample) => Math.max(maximum, sample.pixels), 0),
      maxFramePercent: samples.reduce((maximum, sample) => Math.max(maximum, sample.framePercent), 0),
    }
    entities.push({
      entityId: entity.entityId, name: entity.name, kind: entity.kind, placement: entity.placement,
      eligibility: entityEligibility, selectionId, enclosure: geometricEntity.enclosure,
      ...(entity.kind === "mesh" && entity.instances !== undefined ? { instances: entity.instances.length } : {}),
      samples, totals,
    })
    if (entityEligibility === "unsupported-kind") {
      findings.push({
        severity: "info", kind: "unsupported-kind", entityId: entity.entityId,
        detail: entity.placement.kind === "world"
          ? "The object-ID pass cannot lower this splat's bounding-box proxy without decoded splat-position bounds; retained collider evidence is approximate, never pixel truth."
          : "The object-ID pass cannot lower a view-placed splat; bounding-box proxies require world placement.",
      })
      if (geometricEntity.enclosure.status === "unknown" && geometricEntity.enclosure.reason !== "no-surface") {
        findings.push({
          severity: "info", kind: "bounds-unknown", entityId: entity.entityId,
          detail: "Bounds require decoded asset data; supply assetBounds so the object-ID pass can lower a bounding-box proxy.",
        })
      }
      continue
    }
    if (entityEligibility === "no-surface") continue
    if (entityEligibility === "proxy-coverage") {
      findings.push({
        severity: "info", kind: "proxy-coverage", entityId: entity.entityId,
        detail: "Object-ID coverage counts this entity's bounding-box proxy built from supplied splat-position bounds — approximate coverage, never splat pixel truth.",
      })
    }
    if (entityEligibility === "view-masked"
      && entity.placement.kind === "view" && entity.placement.cameraId === cameraId && totals.lowered > 0) {
      findings.push({
        severity: "info", kind: "unsupported-kind", entityId: entity.entityId,
        detail: "View surfaces draw after world content and write their own selection code; their pixels are attributed to the entity and can occlude world counts.",
      })
    }
    if (entity.visible && totals.rendered === 0) {
      entitiesNeverRendered.push(entity.entityId)
      const covered = samples.filter(sample => sample.expected && (sample.geometricPixels ?? 0) > 0).length
      const maximum = samples.reduce((value, sample) => Math.max(value, sample.geometricPixels ?? 0), 0)
      findings.push({
        severity: totals.expected === 0 ? "info" : "warning",
        kind: "never-rendered", entityId: entity.entityId,
        detail: totals.expected === 0
          ? "Authored visible but effectively invisible at every sampled time; zero rendered pixels is consistent."
          : covered === 0
            ? `Effectively visible at ${String(totals.expected)} sampled time${totals.expected === 1 ? "" : "s"} but its geometric estimate never covered the frame; zero pixels is consistent.`
            : `Zero pixels at every expected sample despite up to ${String(maximum)} px² of geometric coverage; fully occluded, masked, or below the coverage threshold.`,
      })
    } else if (totals.rendered > 0) {
      const occluded = samples.filter(sample => sample.expected && (sample.geometricPixels ?? 0) > 0 && sample.pixels === 0).length
      if (occluded > 0) {
        findings.push({
          severity: "info", kind: "occluded", entityId: entity.entityId,
          detail: `Zero rendered pixels at ${String(occluded)} of ${String(totals.expected)} expected samples despite positive geometric coverage; occluded, masked, or below the coverage threshold.`,
        })
      }
    }
    if (geometricEntity.enclosure.status === "unknown" && totals.expected > 0 && geometricEntity.enclosure.reason !== "no-surface") {
      findings.push({
        severity: "info", kind: "bounds-unknown", entityId: entity.entityId,
        detail: geometricEntity.enclosure.reason === "requires-asset-decoding"
          ? "Bounds require decoded asset data; supply assetBounds for a geometric footprint delta."
          : "Text bounds require font layout; the rendered footprint has no geometric delta.",
      })
    }
  }

  const frameReports = timesUs.map(timeUs => {
    const frame = frameDrafts.get(timeUs)!
    return {
      timeUs, pngSha256: frame.pngSha256,
      renderedPixels: frame.renderedPixels, unattributedPixels: frame.unattributedPixels,
      loweredEntities: frame.lowered.size,
    }
  })
  const renderedPixels = frameReports.reduce((sum, frame) => sum + frame.renderedPixels, 0)
  const unattributedPixels = frameReports.reduce((sum, frame) => sum + frame.unattributedPixels, 0)
  if (unattributedPixels > 0) {
    const framesWithUnattributed = frameReports.filter(frame => frame.unattributedPixels > 0).length
    findings.push({
      severity: "warning", kind: "unattributed-pixels",
      detail: `${String(unattributedPixels)} pixel${unattributedPixels === 1 ? "" : "s"} across ${String(framesWithUnattributed)} frame${framesWithUnattributed === 1 ? "" : "s"} carried selection codes absent from attributable evidence.`,
    })
  }
  if (renderedPixels === 0) {
    const expectedSamples = entities.reduce((sum, entity) => sum + entity.totals.expected, 0)
    findings.push({
      severity: "warning", kind: "empty-render",
      detail: `No attributed object-ID pixel appeared in any sampled frame (${String(expectedSamples)} expected entity-samples).`,
    })
  }

  const sortedFindings = sortSpatialBy(findings, findingOrder)
  const retainedFindings = sortedFindings.slice(0, SPATIAL_RENDERED_AUDIT_LIMITS.findings)
  const report = {
    kind: "slopcamera.spatial-rendered-audit" as const, schemaVersion: 1 as const,
    sceneId: scene.sceneId, sceneSha256: context.sceneSha256, cameraId,
    durationUs: scene.durationUs, timesUs,
    mode: { kind: "object-id" as const, coverage },
    frame: { width: first.width, height: first.height, pixels: framePixels },
    summary: {
      entities: {
        total: scene.entities.length,
        renderable: eligibilityCounts.renderable,
        proxyCoverage: eligibilityCounts["proxy-coverage"],
        viewMasked: eligibilityCounts["view-masked"],
        noSurface: eligibilityCounts["no-surface"],
        unsupported: eligibilityCounts["unsupported-kind"],
      },
      entitiesNeverRendered: sortSpatialBy(entitiesNeverRendered, id => id),
      entitiesUnsupported: sortSpatialBy(entitiesUnsupported, id => id),
      entitiesViewMasked: sortSpatialBy(entitiesViewMasked, id => id),
      entitiesProxyCoverage: sortSpatialBy(entitiesProxyCoverage, id => id),
      renderedPixels, unattributedPixels,
    },
    entities, frames: frameReports,
    findings: retainedFindings,
    omittedFindings: sortedFindings.length - retainedFindings.length,
  }
  const parsed: SpatialRenderedAuditReport = SpatialRenderedAuditReportSchema.parse(report)
  try {
    createBoundedJsonValueSnapshot(parsed, SPATIAL_RENDERED_AUDIT_LIMITS.reportBytes, "rendered audit report", {
      maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth + 8,
      maximumValues: SPATIAL_SCENE_LIMITS.sourceValues + SPATIAL_RENDERED_AUDIT_LIMITS.entitySamples * 16,
    })
  } catch (error) {
    throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : "Rendered audit report exceeds its bounded size.", "rendered audit")
  }
  return deepFreezeJson(parsed)
}

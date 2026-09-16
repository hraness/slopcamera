import { z } from "zod"
import { createBoundedJsonValueSnapshot, deepFreezeJson } from "../code/json-snapshot.js"
import {
  SPATIAL_SCENE_LIMITS, SpatialAssetIdSchema, SpatialCameraIdSchema, SpatialDigestSchema,
  SpatialEntityIdSchema, SpatialPlacementSchema, SpatialSceneIdSchema, SpatialTimeUsSchema,
  type SpatialEntity,
} from "./contracts.js"
import { evaluateSpatialScene } from "./evaluate.js"
import { parseSpatialScene, parseSpatialValue, sortSpatialBy, spatialValueSha256, SpatialSceneError } from "./identity.js"
import { cameraMathView, projectPoint, transformBounds, type Bounds, type Camera, type Vec3 } from "./math.js"

export const SPATIAL_AUDIT_LIMITS = Object.freeze({
  /** Caller-selected or default sample times per audit. */
  samples: 64,
  /** Default evenly spaced sample count covering [0, durationUs]. */
  defaultSamples: 9,
  /** Retained findings; any excess is counted in `omittedFindings`. */
  findings: 1_024,
  /** Joint bound on entities × samples so reports stay bounded. */
  entitySamples: 65_536,
  /** Canonical report byte bound checked before return. */
  reportBytes: 33_554_432,
})

const ENTITY_KINDS = ["group", "mesh", "image", "diagram", "video", "text", "light", "splat"] as const
const BOUNDS_UNKNOWN_REASONS = ["requires-asset-decoding", "requires-text-layout", "no-surface"] as const
const CONTAINED = ["full", "partial", "outside", "behind-camera", "clipped"] as const
const FINDING_KINDS = ["never-visible", "off-camera", "empty-scene-region", "bounds-unknown", "behind-camera-all-samples"] as const
// Fixed histogram order for deterministic finding details.
const CONTAINED_HISTOGRAM_ORDER = ["full", "partial", "outside", "clipped", "behind-camera"] as const

const auditVector = z.tuple([
  z.number().finite().min(-1e12).max(1e12),
  z.number().finite().min(-1e12).max(1e12),
  z.number().finite().min(-1e12).max(1e12),
])
export const SpatialAuditBoundsSchema = z.strictObject({ min: auditVector, max: auditVector })
  .refine(bounds => bounds.min.every((value, index) => value <= bounds.max[index]!), "Bounds min must not exceed max.")

export const SpatialAuditOptionsSchema = z.strictObject({
  cameraId: SpatialCameraIdSchema,
  timesUs: z.array(SpatialTimeUsSchema).min(1).max(SPATIAL_AUDIT_LIMITS.samples).optional(),
  assetBounds: z.record(SpatialAssetIdSchema, SpatialAuditBoundsSchema).optional(),
})
export interface SpatialAuditOptions {
  readonly cameraId: string
  readonly timesUs?: readonly number[]
  readonly assetBounds?: Readonly<Record<string, Bounds>>
}

export const SpatialAuditFrustumSchema = z.strictObject({
  contained: z.enum(CONTAINED),
  /** Estimated covered image area in px²: corner-pixel bbox ∩ image, rounded to 3 decimals. */
  pixelFootprint: z.number().finite().min(0).max(1e15),
})
export const SpatialAuditSampleSchema = z.strictObject({
  timeUs: SpatialTimeUsSchema,
  /** Effective visibility under the audited camera at this sample. */
  visible: z.boolean(),
  /** Placement-domain enclosure: world meters for world entities, view units for view entities. */
  bounds: SpatialAuditBoundsSchema.optional(),
  frustum: SpatialAuditFrustumSchema.optional(),
  note: z.enum(["out-of-range", "other-camera"]).optional(),
})
export const SpatialAuditEntitySchema = z.strictObject({
  entityId: SpatialEntityIdSchema,
  name: z.string().min(1).max(256),
  kind: z.enum(ENTITY_KINDS),
  placement: SpatialPlacementSchema,
  enclosure: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("bounded") }),
    z.strictObject({ status: z.literal("unknown"), reason: z.enum(BOUNDS_UNKNOWN_REASONS) }),
  ]),
  samples: z.array(SpatialAuditSampleSchema).max(SPATIAL_AUDIT_LIMITS.samples),
})
export const SpatialAuditFindingSchema = z.strictObject({
  severity: z.enum(["info", "warning"]),
  kind: z.enum(FINDING_KINDS),
  entityId: SpatialEntityIdSchema.optional(),
  timeUs: SpatialTimeUsSchema.optional(),
  detail: z.string().min(1).max(1_024),
})
const entityKindCounts = z.strictObject({
  group: z.number().int().min(0), mesh: z.number().int().min(0), image: z.number().int().min(0),
  diagram: z.number().int().min(0), video: z.number().int().min(0), text: z.number().int().min(0),
  light: z.number().int().min(0), splat: z.number().int().min(0),
})
export const SpatialAuditReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-audit"),
  schemaVersion: z.literal(1),
  sceneId: SpatialSceneIdSchema,
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  durationUs: SpatialTimeUsSchema,
  timesUs: z.array(SpatialTimeUsSchema).min(1).max(SPATIAL_AUDIT_LIMITS.samples),
  summary: z.strictObject({
    entities: z.strictObject({
      total: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      bounded: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      unknownBounds: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      byKind: entityKindCounts,
    }),
    animations: z.strictObject({
      channels: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.channels),
      targets: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities + SPATIAL_SCENE_LIMITS.cameras),
      properties: z.strictObject({
        position: z.number().int().min(0), rotation: z.number().int().min(0),
        scale: z.number().int().min(0), opacity: z.number().int().min(0),
      }),
    }),
    cameras: z.array(SpatialCameraIdSchema).max(SPATIAL_SCENE_LIMITS.cameras),
    /** Entities whose effective visibility is false at every sample. */
    entitiesNeverVisible: z.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    /** Bounded entities with at least one visible sample but no full/partial containment. */
    entitiesNeverInFrustum: z.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
  }),
  entities: z.array(SpatialAuditEntitySchema).max(SPATIAL_SCENE_LIMITS.entities),
  findings: z.array(SpatialAuditFindingSchema).max(SPATIAL_AUDIT_LIMITS.findings),
  omittedFindings: z.number().int().min(0),
})

/**
 * Structural report types mirror the schemas above rather than inferring from
 * them: recursive readonly mappers over the strict-object graph measurably
 * slow every authored-source typecheck that reaches this module through the
 * `./code` surface. `auditSpatialScene` returns schema-parsed output, so any
 * divergence between a schema and its declared type fails compilation at the
 * return site below.
 */
export interface SpatialAuditBounds {
  readonly min: readonly [number, number, number]
  readonly max: readonly [number, number, number]
}
export interface SpatialAuditFrustum {
  readonly contained: (typeof CONTAINED)[number]
  readonly pixelFootprint: number
}
export interface SpatialAuditSample {
  readonly timeUs: number
  readonly visible: boolean
  readonly bounds?: SpatialAuditBounds | undefined
  readonly frustum?: SpatialAuditFrustum | undefined
  readonly note?: "out-of-range" | "other-camera" | undefined
}
export interface SpatialAuditEntity {
  readonly entityId: string
  readonly name: string
  readonly kind: (typeof ENTITY_KINDS)[number]
  readonly placement: SpatialEntity["placement"]
  readonly enclosure:
    | { readonly status: "bounded" }
    | { readonly status: "unknown"; readonly reason: (typeof BOUNDS_UNKNOWN_REASONS)[number] }
  readonly samples: readonly SpatialAuditSample[]
}
export interface SpatialAuditFinding {
  readonly severity: "info" | "warning"
  readonly kind: (typeof FINDING_KINDS)[number]
  readonly entityId?: string | undefined
  readonly timeUs?: number | undefined
  readonly detail: string
}
export interface SpatialAuditReport {
  readonly kind: "slopcamera.spatial-audit"
  readonly schemaVersion: 1
  readonly sceneId: string
  readonly sceneSha256: string
  readonly cameraId: string
  readonly durationUs: number
  readonly timesUs: readonly number[]
  readonly summary: {
    readonly entities: {
      readonly total: number
      readonly bounded: number
      readonly unknownBounds: number
      readonly byKind: Readonly<Record<(typeof ENTITY_KINDS)[number], number>>
    }
    readonly animations: {
      readonly channels: number
      readonly targets: number
      readonly properties: Readonly<Record<"position" | "rotation" | "scale" | "opacity", number>>
    }
    readonly cameras: readonly string[]
    readonly entitiesNeverVisible: readonly string[]
    readonly entitiesNeverInFrustum: readonly string[]
  }
  readonly entities: readonly SpatialAuditEntity[]
  readonly findings: readonly SpatialAuditFinding[]
  readonly omittedFindings: number
}

type Enclosure =
  | { readonly status: "bounded"; readonly bounds: Bounds }
  | { readonly status: "unknown"; readonly reason: (typeof BOUNDS_UNKNOWN_REASONS)[number] }

/** Authored enclosures or caller-decoded asset bounds; never invented. */
function auditLocalBounds(entity: SpatialEntity, assetBounds: Readonly<Record<string, Bounds>>): Enclosure {
  const supplied = (assetId: string): Enclosure =>
    assetBounds[assetId] === undefined
      ? { status: "unknown", reason: "requires-asset-decoding" }
      : { status: "bounded", bounds: assetBounds[assetId]! }
  let half: Vec3
  if (entity.kind === "mesh") {
    switch (entity.geometry.kind) {
      case "asset": return supplied(entity.geometry.assetId)
      case "box": half = entity.geometry.size.map(value => value / 2) as unknown as Vec3; break
      case "plane": half = [entity.geometry.width / 2, entity.geometry.height / 2, 0]; break
      case "sphere": half = [entity.geometry.radius, entity.geometry.radius, entity.geometry.radius]; break
      case "cylinder": half = [entity.geometry.radius, entity.geometry.height / 2, entity.geometry.radius]; break
    }
  } else if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video") {
    half = [entity.width / 2, entity.height / 2, 0]
  } else if (entity.kind === "splat") return supplied(entity.assetId)
  else return { status: "unknown", reason: entity.kind === "text" ? "requires-text-layout" : "no-surface" }
  return { status: "bounded", bounds: { min: [-half[0], -half[1], -half[2]], max: half } }
}

const round3 = (value: number): number => Math.round(value * 1_000) / 1_000

function boundsCorners(bounds: Bounds): readonly Vec3[] {
  const corners: Vec3[] = []
  for (let mask = 0; mask < 8; mask++) {
    corners.push([
      mask & 1 ? bounds.max[0] : bounds.min[0],
      mask & 2 ? bounds.max[1] : bounds.min[1],
      mask & 4 ? bounds.max[2] : bounds.min[2],
    ])
  }
  return corners
}

/**
 * Corner-projection containment. "full" requires every corner inside image and
 * clip range; "partial" covers any visible corner or a camera-plane crossing;
 * "outside" is an image miss inside the depth range; "clipped" is an all-corner
 * near/far miss; "behind-camera" is all corners at non-positive depth. The
 * footprint is the projected-corner bbox intersected with the image, which may
 * still cover the frame when all corners fall outside it.
 */
function classifyWorldFrustum(view: Camera, bounds: Bounds): SpatialAuditFrustum {
  const { width, height } = view.projection
  let behind = 0, inside = 0, inClip = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const corner of boundsCorners(bounds)) {
    const projected = projectPoint(view, corner)
    if (projected === null) { behind++; continue }
    minX = Math.min(minX, projected.pixel[0]); maxX = Math.max(maxX, projected.pixel[0])
    minY = Math.min(minY, projected.pixel[1]); maxY = Math.max(maxY, projected.pixel[1])
    if (projected.insideClip) inClip++
    if (projected.insideImage && projected.insideClip) inside++
  }
  const contained = behind === 8 ? "behind-camera"
    : inside === 8 ? "full"
    : inside > 0 || behind > 0 ? "partial"
    : inClip > 0 ? "outside"
    : "clipped"
  const pixelFootprint = behind === 8 ? 0 : round3(
    Math.max(0, Math.min(maxX, width) - Math.max(minX, 0))
    * Math.max(0, Math.min(maxY, height) - Math.max(minY, 0)),
  )
  return { contained, pixelFootprint }
}

/**
 * View overlays render in a camera-bound orthographic domain (X right, Y down;
 * normalized units scaled by output dimensions, pixel units verbatim). Depth
 * ordering is declared by placement order, so only image containment applies.
 */
function classifyViewOverlay(
  bounds: Bounds, units: "pixels" | "normalized", width: number, height: number,
): SpatialAuditFrustum {
  const scaleX = units === "normalized" ? width : 1
  const scaleY = units === "normalized" ? height : 1
  const minX = bounds.min[0] * scaleX, maxX = bounds.max[0] * scaleX
  const minY = bounds.min[1] * scaleY, maxY = bounds.max[1] * scaleY
  const pixelFootprint = round3(
    Math.max(0, Math.min(maxX, width) - Math.max(minX, 0))
    * Math.max(0, Math.min(maxY, height) - Math.max(minY, 0)),
  )
  const contained = minX >= 0 && minY >= 0 && maxX <= width && maxY <= height ? "full"
    : pixelFootprint > 0 ? "partial"
    : "outside"
  return { contained, pixelFootprint }
}

/** Evenly spaced default samples over [0, durationUs], endpoints included. Shared by the rendered audit. */
export function spatialAuditDefaultTimesUs(durationUs: number): readonly number[] {
  const count = SPATIAL_AUDIT_LIMITS.defaultSamples
  return Array.from({ length: count }, (_, index) => Math.round(index * durationUs / (count - 1)))
}

type Finding = SpatialAuditFinding
const findingOrder = (finding: Finding): string =>
  `${finding.kind}:${finding.entityId ?? ""}:${String(finding.timeUs ?? -1).padStart(12, "0")}`

/** Intermediate draft shapes; the report schema owns the emitted value types. */
interface SampleDraft {
  readonly timeUs: number
  readonly visible: boolean
  readonly bounds?: Bounds
  readonly frustum?: SpatialAuditFrustum
  readonly note?: "out-of-range" | "other-camera"
}
interface EntityDraft {
  readonly entityId: string
  readonly name: string
  readonly kind: SpatialEntity["kind"]
  readonly placement: SpatialEntity["placement"]
  readonly enclosure: { readonly status: "bounded" } | { readonly status: "unknown"; readonly reason: (typeof BOUNDS_UNKNOWN_REASONS)[number] }
  readonly samples: SampleDraft[]
}

/**
 * Samples a scene against one camera and reports per-entity geometric coverage.
 * Pure and deterministic: no IO, decoding or renderer; caller-decoded asset
 * bounds arrive through options and absent bounds are reported, not invented.
 */
export function auditSpatialScene(sceneInput: unknown, options: SpatialAuditOptions): SpatialAuditReport {
  const scene = parseSpatialScene(sceneInput)
  const captured = parseSpatialValue(SpatialAuditOptionsSchema, options, "audit options")
  const cameraId = captured.cameraId
  if (!scene.cameras.some(camera => camera.cameraId === cameraId)) {
    throw new SpatialSceneError("not-found", `Unknown camera ${cameraId}.`, "cameraId")
  }
  const assetIds = new Set(scene.assets.map(asset => asset.assetId))
  const assetBounds: Record<string, Bounds> = Object.create(null) as Record<string, Bounds>
  for (const [assetId, bounds] of Object.entries(captured.assetBounds ?? {})) {
    if (!assetIds.has(assetId)) throw new SpatialSceneError("invalid-data", `Asset bounds reference unknown ${assetId}.`, "assetBounds")
    assetBounds[assetId] = Object.freeze({ min: Object.freeze([...bounds.min]), max: Object.freeze([...bounds.max]) }) as Bounds
  }
  const timesUs = [...new Set(captured.timesUs ?? spatialAuditDefaultTimesUs(scene.durationUs))].sort((a, b) => a - b)
  for (const timeUs of timesUs) {
    if (timeUs > scene.durationUs) throw new SpatialSceneError("invalid-data", "Audit sample time exceeds scene duration.", "timesUs")
  }
  if (scene.entities.length * timesUs.length > SPATIAL_AUDIT_LIMITS.entitySamples) {
    throw new SpatialSceneError("invalid-data", "Audit entity-sample budget exceeded; pass fewer timesUs samples.", "timesUs")
  }

  const enclosures = new Map(scene.entities.map(entity => [entity.entityId, auditLocalBounds(entity, assetBounds)]))
  const samplesByEntity = new Map(scene.entities.map(entity => [entity.entityId, [] as SampleDraft[]]))
  for (const timeUs of timesUs) {
    const snapshot = evaluateSpatialScene(scene, { timeUs, cameraId })
    const view = cameraMathView(snapshot.camera)
    const { width, height } = snapshot.camera.projection
    for (const entry of snapshot.entities) {
      const entity = entry.entity
      const samples = samplesByEntity.get(entity.entityId)!
      const placement = entity.placement
      if (placement.kind === "view" && placement.cameraId !== cameraId) {
        // A view overlay bound to another camera has no domain under this one.
        samples.push({ timeUs, visible: entry.visible, note: "other-camera" })
        continue
      }
      const enclosure = enclosures.get(entity.entityId)!
      if (enclosure.status === "unknown") {
        samples.push({ timeUs, visible: entry.visible })
        continue
      }
      try {
        const domain = transformBounds(entry.worldMatrix, enclosure.bounds)
        const frustum = placement.kind === "view"
          ? classifyViewOverlay(domain, placement.units, width, height)
          : classifyWorldFrustum(view, domain)
        samples.push({ timeUs, visible: entry.visible, bounds: domain, frustum })
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
        samples.push({ timeUs, visible: entry.visible, note: "out-of-range" })
      }
    }
  }

  const findings: Finding[] = []
  const neverVisible: string[] = []
  const neverInFrustum: string[] = []
  const auditedEntities: EntityDraft[] = []
  for (const entity of scene.entities) {
    const enclosure = enclosures.get(entity.entityId)!
    const samples = samplesByEntity.get(entity.entityId)!
    auditedEntities.push({
      entityId: entity.entityId, name: entity.name, kind: entity.kind, placement: entity.placement,
      enclosure: enclosure.status === "bounded" ? { status: "bounded" } : { status: "unknown", reason: enclosure.reason },
      samples,
    })
    const applicable = samples.filter(sample => sample.note !== "other-camera")
    const visible = applicable.filter(sample => sample.visible)
    if (visible.length === 0) {
      neverVisible.push(entity.entityId)
      findings.push({
        severity: "info", kind: "never-visible", entityId: entity.entityId,
        detail: entity.placement.kind === "view" && entity.placement.cameraId !== cameraId
          ? `View-bound to ${entity.placement.cameraId}; not evaluated under ${cameraId}.`
          : "Effective visibility is false at every sampled time.",
      })
      continue
    }
    if (enclosure.status === "unknown") {
      if (enclosure.reason !== "no-surface") {
        findings.push({
          severity: "info", kind: "bounds-unknown", entityId: entity.entityId,
          detail: enclosure.reason === "requires-asset-decoding"
            ? "Bounds require decoded asset data; supply assetBounds to audit this entity."
            : "Text bounds require font layout; audited for visibility only.",
        })
      }
      continue
    }
    const outOfRange = visible.filter(sample => sample.note === "out-of-range").length
    if (outOfRange > 0) {
      findings.push({
        severity: "info", kind: "bounds-unknown", entityId: entity.entityId,
        detail: `World bounds exceed numeric limits at ${String(outOfRange)} visible sample${outOfRange === 1 ? "" : "s"}.`,
      })
    }
    const statuses = visible.filter(sample => sample.frustum !== undefined).map(sample => sample.frustum!.contained)
    if (statuses.length === 0) continue
    if (!statuses.some(status => status === "full" || status === "partial")) {
      neverInFrustum.push(entity.entityId)
      if (statuses.every(status => status === "behind-camera")) {
        findings.push({
          severity: "warning", kind: "behind-camera-all-samples", entityId: entity.entityId,
          detail: `Every visible sample is behind the camera plane (${String(statuses.length)} sample${statuses.length === 1 ? "" : "s"}).`,
        })
      } else {
        const histogram = CONTAINED_HISTOGRAM_ORDER
          .map(status => [status, statuses.filter(value => value === status).length] as const)
          .filter(([, count]) => count > 0)
          .map(([status, count]) => `${status} ×${String(count)}`)
          .join(", ")
        findings.push({
          severity: "warning", kind: "off-camera", entityId: entity.entityId,
          detail: `Never inside the camera frustum: ${histogram} across ${String(statuses.length)} visible samples.`,
        })
      }
    }
  }

  const boundedVisible = scene.entities.filter(entity => enclosures.get(entity.entityId)!.status === "bounded"
    && samplesByEntity.get(entity.entityId)!.some(sample => sample.visible && sample.note !== "other-camera")).length
  const everInFrustum = scene.entities.some(entity =>
    samplesByEntity.get(entity.entityId)!.some(sample =>
      sample.visible && (sample.frustum?.contained === "full" || sample.frustum?.contained === "partial")))
  if (!everInFrustum) {
    const unknownCount = scene.entities.length - [...enclosures.values()].filter(item => item.status === "bounded").length
    findings.push({
      severity: "warning", kind: "empty-scene-region",
      detail: `No visible bounded entity intersects the camera frustum at any sampled time (${String(boundedVisible)} bounded visible, ${String(unknownCount)} with unknown bounds).`,
    })
  }

  const sortedFindings = sortSpatialBy(findings, findingOrder)
  const retainedFindings = sortedFindings.slice(0, SPATIAL_AUDIT_LIMITS.findings)
  const byKind = Object.fromEntries(ENTITY_KINDS.map(kind => [kind, 0])) as Record<(typeof ENTITY_KINDS)[number], number>
  for (const entity of scene.entities) byKind[entity.kind]++
  const properties = { position: 0, rotation: 0, scale: 0, opacity: 0 }
  for (const channel of scene.animations) properties[channel.property]++
  const report = {
    kind: "slopcamera.spatial-audit" as const, schemaVersion: 1 as const,
    sceneId: scene.sceneId, sceneSha256: spatialValueSha256(scene), cameraId,
    durationUs: scene.durationUs, timesUs,
    summary: {
      entities: {
        total: scene.entities.length,
        bounded: [...enclosures.values()].filter(item => item.status === "bounded").length,
        unknownBounds: [...enclosures.values()].filter(item => item.status === "unknown").length,
        byKind,
      },
      animations: {
        channels: scene.animations.length,
        targets: new Set(scene.animations.map(channel => channel.targetId)).size,
        properties,
      },
      cameras: scene.cameras.map(camera => camera.cameraId),
      entitiesNeverVisible: sortSpatialBy(neverVisible, id => id),
      entitiesNeverInFrustum: sortSpatialBy(neverInFrustum, id => id),
    },
    entities: auditedEntities,
    findings: retainedFindings,
    omittedFindings: sortedFindings.length - retainedFindings.length,
  }
  const parsed: SpatialAuditReport = SpatialAuditReportSchema.parse(report)
  try {
    createBoundedJsonValueSnapshot(parsed, SPATIAL_AUDIT_LIMITS.reportBytes, "audit report", {
      maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth + 8,
      maximumValues: SPATIAL_SCENE_LIMITS.sourceValues + SPATIAL_AUDIT_LIMITS.entitySamples * 16,
    })
  } catch (error) {
    throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : "Audit report exceeds its bounded size.", "audit")
  }
  return deepFreezeJson(parsed)
}

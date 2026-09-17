import { z } from "zod"
import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  EvaluatedSpatialSceneSchema, SPATIAL_SCENE_LIMITS, SpatialCameraIdSchema, SpatialOverrideSchema, SpatialPoseSchema,
  SpatialShotV1Schema, SpatialTimeUsSchema,
  type EvaluatedSpatialScene, type SpatialAnimation, type SpatialCamera, type SpatialEntity,
  type SpatialOverride, type SpatialPose, type SpatialSceneV1, type SpatialShotV1,
} from "./contracts.js"
import {
  parseSpatialScene, parseSpatialValue, sortSpatialBy, spatialAssetClosureDigests,
  SpatialSceneError, spatialPropertySupported, spatialStateValueSha256, spatialTopologicalIds, spatialValueSha256, validateSpatialOverrides,
} from "./identity.js"
import { composeTransform, multiplyTransforms, slerpQuaternion, type Mat4 } from "./math.js"

export interface EvaluateSpatialSceneOptions {
  readonly timeUs: number
  readonly cameraId: string
  readonly overrides?: readonly SpatialOverride[]
  readonly cameraPoseOverride?: SpatialPose
}

/**
 * Immutable per-scene evaluation context: every index, ordering, digest and
 * merged-override value that absolute-time evaluation re-derives identically
 * for each sample. Built once by `createSpatialEvaluationContext`, then shared
 * by any number of `evaluateSpatialSceneInContext` calls — audits, renders and
 * camera tracks sample one scene repeatedly, so the parse and indexing happen
 * once per scene rather than once per sample.
 *
 * The context is the optional memo seam of `evaluateSpatialScene`; both public
 * signatures and snapshot bytes are unchanged whether or not a caller builds
 * one. Treat it as opaque and immutable: it shares the parsed scene's frozen
 * values and must never be mutated between calls.
 */
export interface SpatialEvaluationContext {
  /** The parsed, normalized, deep-frozen scene this context is bound to. */
  readonly scene: SpatialSceneV1
  readonly sceneSha256: string
  readonly entitiesById: ReadonlyMap<string, SpatialEntity>
  readonly camerasById: ReadonlyMap<string, SpatialCamera>
  /** Entity ids in parent-before-child order; hierarchy is evaluation-invariant. */
  readonly entityOrder: readonly string[]
  /** Effective authored visibility; channels and overrides never write `visible`. */
  readonly visibilityById: ReadonlyMap<string, boolean>
  /** Animation channels targeting entities, in canonical order. */
  readonly entityChannels: readonly SpatialAnimation[]
  /** Animation channels targeting cameras, keyed by camera id. */
  readonly cameraChannelsById: ReadonlyMap<string, readonly SpatialAnimation[]>
  /** Scene-level overrides already merged and validated by the scene parse. */
  readonly baseOverrides: readonly SpatialOverride[]
  readonly assetDigests: Readonly<Record<string, string>>
}

const EvaluatedOptionsSchema = z.strictObject({
  timeUs: SpatialTimeUsSchema, cameraId: SpatialCameraIdSchema,
  overrides: z.array(SpatialOverrideSchema).max(SPATIAL_SCENE_LIMITS.entities).optional(),
  cameraPoseOverride: SpatialPoseSchema.optional(),
})

export function mergeSpatialOverrides(sceneOverrides: readonly SpatialOverride[], shotOverrides: readonly SpatialOverride[]): readonly SpatialOverride[] {
  const effective = new Map(sceneOverrides.map(override => [`${override.entityId}:${override.property}`, override]))
  const seen = new Set<string>()
  for (const override of shotOverrides) {
    const key = `${override.entityId}:${override.property}`
    if (seen.has(key)) throw new SpatialSceneError("conflict", `Duplicate shot override ${key}.`, "shot.overrides")
    seen.add(key)
    effective.set(key, override)
  }
  return deepFreezeJson(sortSpatialBy([...effective.values()], item => `${item.entityId}:${item.property}`))
}

export function applySpatialEntityOverride(entity: SpatialEntity, override: SpatialOverride): SpatialEntity {
  if (!spatialPropertySupported(entity, override.property)) throw new SpatialSceneError("conflict", `Unsupported override ${entity.entityId}.${override.property}.`)
  if (override.property === "transform") return { ...entity, transform: override.value }
  if (override.property === "color") {
    const color = override.value.toLowerCase()
    if (entity.kind === "mesh") return { ...entity, material: { ...entity.material, color } }
    if (entity.kind === "text" || entity.kind === "light") return { ...entity, color }
  }
  if (override.property === "opacity") {
    if (entity.kind === "mesh") return { ...entity, material: { ...entity.material, opacity: override.value } }
    if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video") return { ...entity, opacity: override.value }
  }
  throw new SpatialSceneError("conflict", `Unsupported override ${entity.entityId}.${override.property}.`)
}

function sampleChannel(channel: SpatialAnimation, timeUs: number): number | readonly number[] {
  const keys = channel.keys
  if (timeUs <= keys[0]!.timeUs) return keys[0]!.value
  if (timeUs >= keys[keys.length - 1]!.timeUs) return keys[keys.length - 1]!.value
  let lower = 0, upper = keys.length - 1
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2)
    if (keys[middle]!.timeUs <= timeUs) lower = middle
    else upper = middle
  }
  const a = keys[lower]!, b = keys[upper]!
  if (channel.interpolation === "step") return a.value
  const t = (timeUs - a.timeUs) / (b.timeUs - a.timeUs)
  if (channel.property === "rotation") {
    return slerpQuaternion(channel.keys[lower]!.value, channel.keys[upper]!.value, t)
  }
  if (typeof a.value === "number" && typeof b.value === "number") return a.value + (b.value - a.value) * t
  const av = a.value as readonly number[], bv = b.value as readonly number[]
  return av.map((value, index) => value + (bv[index]! - value) * t)
}

export function validateSpatialShot(sceneInput: unknown, shotInput: unknown): SpatialShotV1 {
  const context = createSpatialEvaluationContext(sceneInput)
  const scene = context.scene
  const shot = parseSpatialValue(SpatialShotV1Schema, shotInput, "shot")
  if (shot.sceneSha256 !== context.sceneSha256) throw new SpatialSceneError("conflict", "Shot pins another scene revision.", "shot.sceneSha256")
  if (!context.camerasById.has(shot.cameraId)) throw new SpatialSceneError("invalid-data", "Shot camera is absent from its scene.", "shot.cameraId")
  if (shot.sceneStartUs >= scene.durationUs) throw new SpatialSceneError("invalid-data", "Shot scene start must precede scene duration.", "shot.sceneStartUs")
  if (shot.playback === "once" && shot.sceneStartUs + shot.range.endUs - shot.range.startUs > scene.durationUs) throw new SpatialSceneError("invalid-data", "Once playback exceeds scene duration.", "shot.range")
  validateSpatialOverrides(scene, mergeSpatialOverrides(scene.overrides, shot.overrides))
  if (shot.cameraPoseOverride && context.cameraChannelsById.has(shot.cameraId)) throw new SpatialSceneError("conflict", "Camera animation and shot pose override both own camera pose.", "shot.cameraPoseOverride")
  return deepFreezeJson(shot)
}

/**
 * Parses and indexes a scene once so repeated absolute-time evaluations share
 * the constant work: entity and camera lookup maps, the parent-before-child
 * entity order, effective authored visibility, per-target channel lists, merged
 * scene-level overrides, the asset closure digests and the scene digest.
 * The result is immutable; callers never mutate it and may share it across any
 * number of `evaluateSpatialSceneInContext` calls and audit runs.
 */
export function createSpatialEvaluationContext(sceneInput: unknown): SpatialEvaluationContext {
  const scene = parseSpatialScene(sceneInput)
  const entitiesById = new Map(scene.entities.map(entity => [entity.entityId, entity]))
  const camerasById = new Map(scene.cameras.map(camera => [camera.cameraId, camera]))
  const entityOrder = spatialTopologicalIds(new Map(scene.entities.map(entity => [entity.entityId, entity.parentId === null ? [] : [entity.parentId]])), "entity hierarchy")
  const visibilityById = new Map<string, boolean>()
  for (const id of entityOrder) {
    const entity = entitiesById.get(id)!
    visibilityById.set(id, entity.visible && (entity.parentId === null || visibilityById.get(entity.parentId) === true))
  }
  const entityChannels: SpatialAnimation[] = []
  const cameraChannelsById = new Map<string, SpatialAnimation[]>()
  for (const channel of scene.animations) {
    if (entitiesById.has(channel.targetId)) entityChannels.push(channel)
    else {
      const list = cameraChannelsById.get(channel.targetId) ?? []
      list.push(channel)
      cameraChannelsById.set(channel.targetId, list)
    }
  }
  return Object.freeze({
    scene, sceneSha256: spatialValueSha256(scene), entitiesById, camerasById,
    entityOrder, visibilityById, entityChannels,
    cameraChannelsById, baseOverrides: mergeSpatialOverrides(scene.overrides, []),
    assetDigests: spatialAssetClosureDigests(scene.assets),
  })
}

/**
 * Evaluates one immutable snapshot against a shared evaluation context. This is
 * the hot path `evaluateSpatialScene` delegates to after building the context;
 * per-sample work is channel sampling, transform composition and the emitted
 * snapshot's own identity, schema parse and freeze.
 */
export function evaluateSpatialSceneInContext(context: SpatialEvaluationContext, options: EvaluateSpatialSceneOptions): EvaluatedSpatialScene {
  const scene = context.scene
  // Capture the complete options object before inspecting optional properties.
  const capturedOptions = parseSpatialValue(
    // Explicit object schema also rejects unsupported simulation or executable fields.
    EvaluatedOptionsSchema, options, "evaluation options",
  )
  const timeUs = capturedOptions.timeUs
  if (timeUs > scene.durationUs) throw new SpatialSceneError("invalid-data", "Evaluation time exceeds scene duration.", "timeUs")
  let camera = context.camerasById.get(capturedOptions.cameraId)
  if (!camera) throw new SpatialSceneError("not-found", `Unknown camera ${capturedOptions.cameraId}.`, "cameraId")
  // Without per-call overrides the merged scene-level set is a context constant
  // already validated by the scene parse; per-call overrides re-merge and
  // re-validate against the parsed scene exactly as a standalone call would.
  const overrides = capturedOptions.overrides === undefined ? context.baseOverrides : mergeSpatialOverrides(scene.overrides, capturedOptions.overrides)
  if (capturedOptions.overrides !== undefined) validateSpatialOverrides(scene, overrides)
  if (capturedOptions.cameraPoseOverride && context.cameraChannelsById.has(camera.cameraId)) throw new SpatialSceneError("conflict", "Camera animation conflicts with camera pose override.", "cameraPoseOverride")
  const entities = new Map(context.entitiesById)
  // Entity and camera channels write disjoint slots, so applying the entity
  // subset first and then this camera's channels matches interleaved order.
  for (const channel of context.entityChannels) {
    const value = sampleChannel(channel, timeUs)
    const entity = entities.get(channel.targetId)!
    if (channel.property === "opacity") entities.set(entity.entityId, applySpatialEntityOverride(entity, { entityId: entity.entityId, property: "opacity", value: value as number }))
    else entities.set(entity.entityId, { ...entity, transform: { ...entity.transform, [channel.property]: value } } as SpatialEntity)
  }
  for (const channel of context.cameraChannelsById.get(camera.cameraId) ?? []) {
    const value = sampleChannel(channel, timeUs)
    camera = { ...camera, pose: { ...camera.pose, [channel.property]: value } } as SpatialCamera
  }
  for (const override of overrides) entities.set(override.entityId, applySpatialEntityOverride(entities.get(override.entityId)!, override))
  if (capturedOptions.cameraPoseOverride) camera = { ...camera, pose: capturedOptions.cameraPoseOverride }
  const matrices = new Map<string, Mat4>()
  for (const id of context.entityOrder) {
    const entity = entities.get(id)!
    try {
      const local = composeTransform(entity.transform)
      matrices.set(id, entity.parentId === null ? local : multiplyTransforms(matrices.get(entity.parentId)!, local))
    } catch (error) {
      throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : "Invalid evaluated transform.", `entities.${id}.transform`)
    }
  }
  const evaluated = scene.entities.map((source, index) => ({
    entity: entities.get(source.entityId)!, worldMatrix: matrices.get(source.entityId)!,
    visible: context.visibilityById.get(source.entityId)!, selectionId: index + 1,
  }))
  // The state identity excludes camera choice, camera pose, asset locator and provenance.
  const stateSha256 = spatialStateValueSha256({ domain: "slopcamera.spatial-state.v1", timeUs, entities: evaluated, assetDigests: context.assetDigests })
  const viewSha256 = spatialValueSha256({ domain: "slopcamera.spatial-view.v1", stateSha256, camera })
  const result = EvaluatedSpatialSceneSchema.parse({
    kind: "slopcamera.spatial-snapshot", schemaVersion: 1, sceneSha256: context.sceneSha256,
    stateSha256, viewSha256, timeUs, camera,
    entities: evaluated.map(item => ({ ...item, visible: item.visible && (item.entity.placement.kind === "world" || item.entity.placement.cameraId === camera.cameraId) })),
    assets: scene.assets,
  })
  return deepFreezeJson(result)
}

/** Absolute time evaluation produces one immutable snapshot; calls share no mutable state. */
export function evaluateSpatialScene(sceneInput: unknown, options: EvaluateSpatialSceneOptions): EvaluatedSpatialScene {
  return evaluateSpatialSceneInContext(createSpatialEvaluationContext(sceneInput), options)
}

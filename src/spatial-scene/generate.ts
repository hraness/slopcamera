import { z } from "zod"
import type { JsonValue } from "../code/contracts.js"
import { deepFreezeJson, createBoundedJsonValueSnapshot } from "../code/json-snapshot.js"
import {
  SPATIAL_SCENE_LIMITS, SpatialDigestSchema, SpatialEntitySchema, SpatialGeneratorIdSchema,
  SpatialGeneratorSchema,
  type SpatialEntity, type SpatialGenerator, type SpatialSceneV1,
} from "./contracts.js"
import {
  generatedSpatialEntityId, parseSpatialScene, parseSpatialValue, SpatialSceneError,
  spatialGeneratorOutputSha256, spatialValueSha256,
} from "./identity.js"

/**
 * Authoring-time generator support. These functions shape and validate the
 * output of an already-executed generator module; importing or running module
 * source is a host effect owned by the CLI layer, never this portable layer.
 */
export const SPATIAL_GENERATOR_LIMITS = Object.freeze({
  moduleSourceBytes: 1_048_576,
  parametersBytes: 65_536,
  parametersDepth: 16,
  parametersValues: 8_192,
})

/** The module contract: generate(ctx) returns entities without identity plus declared editable keys. */
export interface SpatialGeneratorModuleContext {
  readonly seed: number
  readonly parameters: JsonValue
  readonly lib: {
    /** Derived identity for a sibling key, for parentId links inside one output. */
    readonly entityId: (key: string) => string
  }
}

const moduleResultSchema = z.strictObject({
  entities: z.array(z.unknown()).max(SPATIAL_SCENE_LIMITS.entities),
  editableKeys: SpatialGeneratorSchema.shape.editableKeys.optional(),
})

export interface ValidatedSpatialGeneratorOutput {
  readonly entities: readonly SpatialEntity[]
  readonly editableKeys: SpatialGenerator["editableKeys"]
}

/** Parameters are bounded plain JSON; modules receive the frozen captured value. */
export function parseSpatialGeneratorParameters(input: unknown): JsonValue {
  return createBoundedJsonValueSnapshot(input, SPATIAL_GENERATOR_LIMITS.parametersBytes, "generator parameters", {
    maximumDepth: SPATIAL_GENERATOR_LIMITS.parametersDepth,
    maximumValues: SPATIAL_GENERATOR_LIMITS.parametersValues,
  }).value
}

export function spatialGeneratorParametersSha256(parameters: unknown): string {
  return spatialValueSha256({ domain: "slopcamera.generator-parameters.v1", parameters })
}

/** Absent --seed derives a stable uint32 from the exact source bytes. */
export function deriveSpatialGeneratorSeed(sourceSha256: string): number {
  SpatialDigestSchema.parse(sourceSha256)
  return Number.parseInt(sourceSha256.slice(0, 8), 16)
}

/**
 * Content-addressed attempt identity. Identical inputs reproduce the identical
 * retained record; a changed source, parameters, seed, runtime, or output is a
 * different attempt.
 */
export function spatialGeneratorAttemptId(options: {
  readonly generatorId: string
  readonly sourceSha256: string
  readonly parametersSha256: string
  readonly runtimeSha256: string
  readonly outputSha256: string
  readonly seed: number
}): string {
  return `attempt_${spatialValueSha256({ domain: "slopcamera.generator-attempt.v1", ...options }).slice(0, 32)}`
}

function generatedAssetReference(entity: SpatialEntity): string | undefined {
  if (entity.kind === "mesh") {
    if (entity.geometry.kind === "asset") return entity.geometry.assetId
    return entity.material.map
  }
  if (entity.kind === "text") return entity.fontAssetId
  return "assetId" in entity ? entity.assetId : undefined
}

/**
 * Stamps generated identity onto keyed entities and validates the result.
 * Modules must not set entityId or origin: the host owns the
 * entityId == generatedSpatialEntityId(generatorId, key) invariant, so a module
 * cannot forge authored provenance or another generator's output. This version
 * rejects asset references; generated output is mesh primitives, lights, and
 * groups only.
 */
export function validateSpatialGeneratorOutput(generatorId: string, output: unknown): ValidatedSpatialGeneratorOutput {
  SpatialGeneratorIdSchema.parse(generatorId)
  const result = parseSpatialValue(moduleResultSchema, output, "generator output")
  const seen = new Set<string>()
  const entities: SpatialEntity[] = []
  for (const [index, raw] of result.entities.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new SpatialSceneError("invalid-data", `Generated entity ${index} must be a plain object carrying a stable key.`, "generator output")
    }
    const record = raw as Readonly<Record<string, unknown>>
    const key = record.key
    if (typeof key !== "string" || key.length < 1 || key.length > 256) {
      throw new SpatialSceneError("invalid-data", `Generated entity ${index} must carry a string "key" of 1–256 characters.`, "generator output")
    }
    if ("entityId" in record || "origin" in record) {
      throw new SpatialSceneError("invalid-data", `Generated entity "${key}" must not set entityId or origin; the host stamps generated identity.`, "generator output")
    }
    if (seen.has(key)) throw new SpatialSceneError("invalid-data", `Duplicate generator output key "${key}".`, "generator output")
    seen.add(key)
    const { key: _omitted, ...fields } = record
    const entity = parseSpatialValue(SpatialEntitySchema, {
      ...fields,
      entityId: generatedSpatialEntityId(generatorId, key),
      origin: { kind: "generated", generatorId, key },
    }, `generator output ${key}`)
    const assetId = generatedAssetReference(entity)
    if (assetId !== undefined) {
      throw new SpatialSceneError("invalid-data", `Generated entity "${key}" references ${assetId}; generated entities cannot reference assets in this version.`, "generator output")
    }
    entities.push(entity)
  }
  const editableKeys = result.editableKeys ?? []
  const declared = new Set<string>()
  for (const editable of editableKeys) {
    if (declared.has(editable.key)) throw new SpatialSceneError("invalid-data", `Duplicate editable key "${editable.key}".`, "generator editableKeys")
    declared.add(editable.key)
    if (!seen.has(editable.key)) {
      throw new SpatialSceneError("invalid-data", `Editable key "${editable.key}" does not match any produced entity key.`, "generator editableKeys")
    }
  }
  return deepFreezeJson({ entities, editableKeys })
}

/** Builds the retained attempt record; outputSha256 is recomputed from stamped entities. */
export function buildSpatialGeneratorRecord(options: {
  readonly generatorId: string
  readonly sourceSha256: string
  readonly closureSha256: string
  readonly parametersSha256: string
  readonly seed: number
  readonly runtimeSha256: string
  readonly entities: readonly SpatialEntity[]
  readonly editableKeys: SpatialGenerator["editableKeys"]
}): SpatialGenerator {
  const outputSha256 = spatialGeneratorOutputSha256(options.entities)
  const attemptId = spatialGeneratorAttemptId({
    generatorId: options.generatorId,
    sourceSha256: options.sourceSha256,
    parametersSha256: options.parametersSha256,
    runtimeSha256: options.runtimeSha256,
    outputSha256,
    seed: options.seed,
  })
  return parseSpatialValue(SpatialGeneratorSchema, {
    generatorId: options.generatorId,
    sourceSha256: options.sourceSha256,
    closureSha256: options.closureSha256,
    parametersSha256: options.parametersSha256,
    seed: options.seed,
    outputSha256,
    execution: { kind: "attempt", attemptId, runtimeSha256: options.runtimeSha256 },
    editableKeys: options.editableKeys,
  }, "generator")
}

/** A minimal editable scene: one calibrated default camera, no authored entities. */
export function createSpatialGeneratorSceneShell(): unknown {
  return {
    kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_generated",
    coordinates: "right-handed-y-up-meters", durationUs: 4_000_000,
    entities: [],
    cameras: [{ cameraId: "camera_main", name: "Main", pose: { position: [0, 3, 8], rotation: [0, 0, 0, 1] },
      projection: { kind: "perspective", width: 960, height: 540, fx: 650, fy: 650, cx: 480, cy: 270, near: 0.1, far: 200 } }],
    assets: [], animations: [], generators: [], overrides: [],
  }
}

/**
 * Applies replace-generator-output semantics to a whole scene: retained output
 * for this generatorId is removed wholesale, the stamped entities and the new
 * generator record are installed, and the merged document is revalidated end to
 * end. Other generators' retained output and all authored content are preserved.
 */
export function mergeSpatialGeneratorOutput(scene: SpatialSceneV1 | undefined, generator: SpatialGenerator, entities: readonly SpatialEntity[]): SpatialSceneV1 {
  const base = scene ?? (parseSpatialScene(createSpatialGeneratorSceneShell()) as SpatialSceneV1)
  const retained = new Set(entities.map(entity => entity.entityId))
  const removed = new Set<string>()
  const kept: SpatialEntity[] = []
  for (const entity of base.entities) {
    if (entity.origin.kind === "generated" && entity.origin.generatorId === generator.generatorId) {
      if (!retained.has(entity.entityId)) removed.add(entity.entityId)
      continue
    }
    kept.push(entity)
  }
  for (const override of base.overrides) {
    if (removed.has(override.entityId)) {
      throw new SpatialSceneError("conflict", `Regeneration removed ${override.entityId}; remove its ${override.property} override or restore the produced key.`, "overrides")
    }
  }
  for (const channel of base.animations) {
    if (removed.has(channel.targetId)) {
      throw new SpatialSceneError("conflict", `Regeneration removed ${channel.targetId}; remove channel ${channel.channelId} or restore the produced key.`, "animations")
    }
  }
  const keptIds = new Set(kept.map(entity => entity.entityId))
  for (const entity of entities) {
    if (keptIds.has(entity.entityId)) throw new SpatialSceneError("conflict", `Generator output collides with ${entity.entityId}.`, "entities")
  }
  const generators = [...base.generators.filter(record => record.generatorId !== generator.generatorId), generator]
  return parseSpatialScene({ ...base, entities: [...kept, ...entities], generators })
}

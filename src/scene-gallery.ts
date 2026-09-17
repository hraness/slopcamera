import { z } from "zod"

import { createBoundedJsonValueSnapshot } from "./code/json-snapshot.js"
import {
  SPATIAL_SCENE_LIMITS,
  SpatialDigestSchema,
  SpatialPatchOperationSchema,
  type SpatialPatchOperation,
  type SpatialSceneV1,
} from "./spatial-scene/contracts.js"
import {
  parseSpatialScene,
  parseSpatialValue,
  SpatialSceneError,
  spatialSceneSha256,
  spatialValueSha256,
} from "./spatial-scene/identity.js"
import {
  applySpatialScenePatch,
  type SpatialSceneDiffEntry,
} from "./spatial-scene/patch.js"

/**
 * Scene-variant galleries for agent review.
 *
 * One authored base scene plus a bounded list of typed patch variants derives
 * one candidate scene per variant — no generation, no paid calls. The desktop
 * host renders each derived scene into a beauty still and composes the stills
 * into the shared labelled contact sheet, so an agent reviews world variants
 * the same way it reviews generated image candidates. The authored scene is
 * never modified: every variant is a new derived document with its own digest,
 * and promotion is an explicit authored patch afterward.
 */

export const slopcameraSceneGalleryLimits = Object.freeze({
  variants: 16,
  variantsBytes: 1024 * 1024,
  idEdge: 64,
  labelEdge: 256,
  summaryEdge: 256,
})

const variantId = z
  .string()
  .min(1)
  .max(slopcameraSceneGalleryLimits.idEdge)
  .regex(
    /^[a-z0-9][a-z0-9-]*$/u,
    "Variant ids are lowercase slugs like dusk or golden-hour-2.",
  )

/**
 * A variant patch is the versioned spatial patch document with the expected
 * base digest optional: when omitted the planner stamps the gallery's base
 * scene digest, when present it must match exactly.
 */
const SceneVariantPatchSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-scene-patch"),
  schemaVersion: z.literal(1),
  expectedSceneSha256: SpatialDigestSchema.optional(),
  operations: z
    .array(SpatialPatchOperationSchema)
    .min(1)
    .max(SPATIAL_SCENE_LIMITS.patchOperations),
})

const SceneGalleryVariantSchema = z.strictObject({
  id: variantId,
  label: z.string().min(1).max(slopcameraSceneGalleryLimits.labelEdge).optional(),
  patch: SceneVariantPatchSchema,
})

export const SlopcameraSceneVariantsSchema = z.strictObject({
  kind: z.literal("slopcamera.scene-variants"),
  schemaVersion: z.literal(1),
  variants: z
    .array(SceneGalleryVariantSchema)
    .min(1)
    .max(slopcameraSceneGalleryLimits.variants),
})

export type SlopcameraSceneVariantSpec = z.infer<typeof SceneGalleryVariantSchema>

/** A compact per-variant description recorded as the candidate's prompt. */
export function summarizeSceneVariantPatch(
  operations: readonly SpatialPatchOperation[],
): string {
  const parts = operations.map(operation => {
    const target =
      ("entityId" in operation ? operation.entityId : undefined)
      ?? ("camera" in operation ? operation.camera.cameraId : undefined)
      ?? ("channel" in operation ? operation.channel.channelId : undefined)
      ?? ("asset" in operation ? operation.asset.assetId : undefined)
      ?? ("generator" in operation ? operation.generator.generatorId : undefined)
      ?? ("entity" in operation ? operation.entity.entityId : undefined)
      ?? ("override" in operation ? operation.override.entityId : undefined)
    return target === undefined ? operation.kind : `${operation.kind} ${target}`
  })
  const summary = parts.join("; ")
  return summary.length <= slopcameraSceneGalleryLimits.summaryEdge
    ? summary
    : `${summary.slice(0, slopcameraSceneGalleryLimits.summaryEdge - 1)}…`
}

export function parseSlopcameraSceneVariants(
  input: unknown,
): readonly SlopcameraSceneVariantSpec[] {
  const value = createBoundedJsonValueSnapshot(
    input,
    slopcameraSceneGalleryLimits.variantsBytes,
    "scene variants",
  ).value
  const document = parseSpatialValue(
    SlopcameraSceneVariantsSchema,
    value,
    "scene variants",
  )
  const ids = new Set<string>()
  for (const variant of document.variants) {
    if (ids.has(variant.id)) {
      throw new SpatialSceneError(
        "invalid-data",
        `Duplicate scene variant id ${variant.id}.`,
        "variants",
      )
    }
    ids.add(variant.id)
  }
  return document.variants
}

export interface SlopcameraSceneGalleryVariant {
  readonly index: number
  readonly id: string
  readonly label: string
  readonly prompt: string
  readonly patchSha256: string
  readonly scene: SpatialSceneV1
  readonly sceneSha256: string
  readonly diff: readonly SpatialSceneDiffEntry[]
}

export interface SlopcameraSceneGalleryPlan {
  readonly scene: SpatialSceneV1
  readonly baseSceneSha256: string
  readonly variants: readonly SlopcameraSceneGalleryVariant[]
}

/**
 * Parses and applies every variant patch before returning — invalid input is
 * rejected before the host renders anything. Each derived scene is validated
 * again by the patch transaction itself.
 */
export function planSlopcameraSceneGallery(input: {
  readonly scene: unknown
  readonly variants: unknown
}): SlopcameraSceneGalleryPlan {
  const scene = parseSpatialScene(input.scene)
  const baseSceneSha256 = spatialSceneSha256(scene)
  const specs = parseSlopcameraSceneVariants(input.variants)
  const variants = specs.map((spec, offset) => {
    const expected = spec.patch.expectedSceneSha256 ?? baseSceneSha256
    if (expected !== baseSceneSha256) {
      throw new SpatialSceneError(
        "conflict",
        `Variant ${spec.id} was authored against a different scene revision.`,
        "variants",
      )
    }
    const patch = { ...spec.patch, expectedSceneSha256: expected }
    const result = applySpatialScenePatch(scene, patch)
    return {
      diff: result.diff,
      id: spec.id,
      index: offset + 1,
      label: spec.label ?? spec.id,
      patchSha256: spatialValueSha256(patch),
      prompt: summarizeSceneVariantPatch(patch.operations),
      scene: result.scene,
      sceneSha256: result.sceneSha256,
    }
  })
  return { baseSceneSha256, scene, variants }
}

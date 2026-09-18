import { z } from "zod"

import {
  SpatialCameraIdSchema,
  SpatialDigestSchema,
  SpatialTimeUsSchema,
} from "./contracts.js"
import { SpatialDirectionSchema } from "./direction.js"
import { SpatialRenderPlanSchema } from "./effects.js"
import { SpatialGalleryAxisSchema } from "./gallery.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { parseSpatialValue, spatialValueSha256 } from "./identity.js"
import { SpatialParticleSystemSchema } from "./particle.js"
import { SpatialSimulationBakeReceiptSchema } from "./simulation.js"
import { SpatialTemporalContactSchema } from "./temporal-audit.js"

/**
 * Declarative recipe packs for Phase 13.
 *
 * A recipe pack is the bounded, inert, content-addressed document a coding
 * agent authors to parameterize the built-in `cinematic-world` workflow. It
 * names an admitted scene by digest, one authored direction document, the
 * gallery axes to explore, preview render requests, optional effect systems to
 * bind, and optional sampled temporal-audit settings. A pack is data, never
 * code: admission parses it from `unknown`, and the workflow independently
 * revalidates every embedded render request before planning.
 */
export const SPATIAL_RECIPE_PACK_LIMITS = Object.freeze({
  axes: 6,
  previews: 4,
  timesUs: 64,
})

export const SpatialRecipePackPreviewSchema = z.strictObject({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/u),
  /** Validated again by the host render-request schema at workflow admission. */
  request: z.unknown(),
})
export type SpatialRecipePackPreview = Readonly<z.infer<typeof SpatialRecipePackPreviewSchema>>

export const SpatialRecipePackEffectsSchema = z.strictObject({
  particleSystems: z.array(SpatialParticleSystemSchema).max(64).default([]),
  renderPlan: SpatialRenderPlanSchema,
  simulationBakes: z.array(SpatialSimulationBakeReceiptSchema).max(64).default([]),
})
export type SpatialRecipePackEffects = Readonly<z.infer<typeof SpatialRecipePackEffectsSchema>>

export const SpatialRecipePackAuditSchema = z.strictObject({
  contacts: z.array(SpatialTemporalContactSchema).max(64).default([]),
  cutBeforeUs: z.array(SpatialTimeUsSchema).max(64).default([]),
  timesUs: z.array(SpatialTimeUsSchema).min(2).max(SPATIAL_RECIPE_PACK_LIMITS.timesUs).optional(),
})
export type SpatialRecipePackAudit = Readonly<z.infer<typeof SpatialRecipePackAuditSchema>>

export const SpatialRecipePackSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-recipe-pack"),
  schemaVersion: z.literal(1),
  packId: z.string().regex(/^recipe_[a-zA-Z0-9_-]{1,64}$/u),
  sceneSha256: SpatialDigestSchema,
  direction: SpatialDirectionSchema,
  cameraId: SpatialCameraIdSchema.optional(),
  axes: z.array(SpatialGalleryAxisSchema).min(1).max(SPATIAL_RECIPE_PACK_LIMITS.axes),
  previews: z.array(SpatialRecipePackPreviewSchema).max(SPATIAL_RECIPE_PACK_LIMITS.previews).default([]),
  effects: SpatialRecipePackEffectsSchema.optional(),
  temporalAudit: SpatialRecipePackAuditSchema.optional(),
}).superRefine((pack, context) => {
  if (new Set(pack.axes).size !== pack.axes.length) {
    context.addIssue({ code: "custom", message: "Recipe pack gallery axes must be unique.", path: ["axes"] })
  }
  const names = pack.previews.map(preview => preview.name)
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: "custom", message: "Recipe pack preview names must be unique.", path: ["previews"] })
  }
  if (pack.temporalAudit !== undefined && pack.cameraId === undefined) {
    context.addIssue({ code: "custom", message: "A temporal audit requires the pack cameraId.", path: ["temporalAudit"] })
  }
})
export type SpatialRecipePack = Readonly<z.infer<typeof SpatialRecipePackSchema>>

export function parseSpatialRecipePack(input: unknown): SpatialRecipePack {
  return deepFreezeJson(parseSpatialValue(SpatialRecipePackSchema, input, "spatial recipe pack"))
}

export function spatialRecipePackSha256(pack: SpatialRecipePack): string {
  return spatialValueSha256(pack)
}

import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialAssetIdSchema } from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"

export const positiveDimension = z.number().finite().positive().max(1_000_000)
export const unit = z.number().finite().min(0).max(1)

/**
 * Bounded post-processing and render-quality contracts for Phase 7.
 * Beauty finishing passes are lowered behind the desktop host; diagnostic
 * AOVs (object-ID, depth, motion) never pass through these operators.
 */

export const SPATIAL_EFFECT_LIMITS = Object.freeze({
  dust: 500_000,
  embers: 1_000_000,
  luts: 4,
  outputBytes: 8_000_000_000,
  postProcessStack: 8,
  previewParticles: 100_000,
  rain: 100_000,
  renderPixels: 67_108_864,
  simulationFrames: 10_000,
  simulationSteps: 10_000,
  texturePixels: 268_435_456,
})

const boundedPixels = z.number().int().safe().positive()

export const SpatialRenderQualitySchema = z.strictObject({
  outputBytes: z.number().int().safe().positive().max(SPATIAL_EFFECT_LIMITS.outputBytes),
  particleCount: z.number().int().safe().min(0).max(SPATIAL_EFFECT_LIMITS.embers),
  pixelBudget: boundedPixels.max(SPATIAL_EFFECT_LIMITS.renderPixels),
  simulationSteps: z.number().int().safe().min(0).max(SPATIAL_EFFECT_LIMITS.simulationSteps),
  texturePixelBudget: boundedPixels.max(SPATIAL_EFFECT_LIMITS.texturePixels),
  tier: z.enum(["preview", "final"]),
})

export const SpatialBloomSchema = z.strictObject({
  intensity: unit,
  kind: z.literal("bloom"),
  radius: z.number().finite().min(0).max(64),
  threshold: unit,
})

export const SpatialDepthOfFieldSchema = z.strictObject({
  aperture: z.number().finite().positive().max(256),
  focalLength: z.number().finite().positive().max(10_000),
  focusDistance: positiveDimension,
  kind: z.literal("depth-of-field"),
})

export const SpatialMotionBlurSchema = z.strictObject({
  kind: z.literal("motion-blur"),
  samples: z.number().int().min(1).max(64),
  shutterAngle: z.number().finite().min(0).max(360),
})

export const SpatialToneMapSchema = z.strictObject({
  exposure: z.number().finite().min(-20).max(20),
  kind: z.literal("tone-map"),
  whitePoint: z.number().finite().positive().max(1_000_000),
})

export const SpatialVignetteSchema = z.strictObject({
  intensity: unit,
  kind: z.literal("vignette"),
  radius: unit,
})

export const SpatialChromaticAberrationSchema = z.strictObject({
  kind: z.literal("chromatic-aberration"),
  offsetPixels: z.number().finite().min(0).max(64),
  radialFalloff: unit,
})

export const SpatialGrainSchema = z.strictObject({
  intensity: unit,
  kind: z.literal("grain"),
  seed: z.number().int().min(0).max(2_147_483_647),
})

export const SpatialFlareSchema = z.strictObject({
  ghosts: z.number().int().min(0).max(16),
  haloWidth: unit,
  intensity: unit,
  kind: z.literal("flare"),
  threshold: unit,
})

export const SpatialLutGradeSchema = z.strictObject({
  assetId: SpatialAssetIdSchema,
  intensity: unit,
  kind: z.literal("lut-grade"),
})

export const SpatialPostProcessStepSchema = z.discriminatedUnion("kind", [
  SpatialBloomSchema,
  SpatialDepthOfFieldSchema,
  SpatialMotionBlurSchema,
  SpatialToneMapSchema,
  SpatialVignetteSchema,
  SpatialChromaticAberrationSchema,
  SpatialGrainSchema,
  SpatialFlareSchema,
  SpatialLutGradeSchema,
])

export const SpatialPostProcessStackSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-post-process"),
  schemaVersion: z.literal(1),
  steps: z.array(SpatialPostProcessStepSchema).min(1).max(SPATIAL_EFFECT_LIMITS.postProcessStack),
}).superRefine((stack, context) => {
  if (stack.steps.filter(step => step.kind === "lut-grade").length > SPATIAL_EFFECT_LIMITS.luts) {
    context.addIssue({ code: "custom", path: ["steps"], message: `Post-process stacks support at most ${SPATIAL_EFFECT_LIMITS.luts} LUT grades.` })
  }
})

export const SpatialRenderPlanSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-render-plan"),
  postProcess: SpatialPostProcessStackSchema.optional(),
  quality: SpatialRenderQualitySchema,
  schemaVersion: z.literal(1),
})

export type SpatialRenderQuality = Readonly<z.infer<typeof SpatialRenderQualitySchema>>
export type SpatialPostProcessStack = Readonly<z.infer<typeof SpatialPostProcessStackSchema>>
export type SpatialRenderPlan = Readonly<z.infer<typeof SpatialRenderPlanSchema>>

export function parseSpatialRenderPlan(input: unknown): SpatialRenderPlan {
  const plan = parseSpatialValue(SpatialRenderPlanSchema, input, "render plan")
  if (plan.quality.tier === "preview" && plan.quality.particleCount > SPATIAL_EFFECT_LIMITS.previewParticles) {
    throw new SpatialSceneError("invalid-data", `Preview tier cannot request more than ${SPATIAL_EFFECT_LIMITS.previewParticles.toLocaleString("en-US")} particles.`, "render-plan.quality.particleCount")
  }
  if (plan.quality.outputBytes < plan.quality.particleCount * 64) {
    throw new SpatialSceneError("invalid-data", "Output byte budget is too small for declared particle count.", "render-plan.quality.outputBytes")
  }
  return deepFreezeJson(plan)
}

export function spatialRenderPlanAssetIds(plan: SpatialRenderPlan): readonly string[] {
  return Object.freeze([...new Set(plan.postProcess?.steps.flatMap(step => step.kind === "lut-grade" ? [step.assetId] : []) ?? [])].sort())
}

export function spatialRenderPlanSha256(plan: SpatialRenderPlan): string {
  return spatialValueSha256(plan)
}

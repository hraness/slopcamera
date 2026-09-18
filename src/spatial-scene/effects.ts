import { z } from "zod";
import { deepFreezeJson } from "../code/json-snapshot.js";
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js";

export const positiveDimension = z.number().finite().min(0);
export const unit = z.number().finite().min(0).max(1);

/**
 * Bounded post-processing and render-quality contracts for Phase 7.
 * Beauty finishing passes are lowered behind the desktop host; diagnostic
 * AOVs (object-ID, depth, motion) never pass through these operators.
 */

export const SPATIAL_EFFECT_LIMITS = {
  postProcessStack: 8,
  luts: 4,
  embers: 1_000_000,
  rain: 100_000,
  dust: 500_000,
  simulationSteps: 10_000,
  simulationFrames: 10_000,
} as const;

export const SpatialRenderQualitySchema = z.strictObject({
  tier: z.enum(["preview", "final"]),
  pixelBudget: positiveDimension,
  texturePixelBudget: positiveDimension,
  particleCount: z.number().int().min(0).max(SPATIAL_EFFECT_LIMITS.embers),
  simulationSteps: z.number().int().min(0).max(SPATIAL_EFFECT_LIMITS.simulationSteps),
  outputBytes: z.number().int().min(0).max(8_000_000_000),
});

export const SpatialBloomSchema = z.strictObject({
  kind: z.literal("bloom"),
  threshold: unit,
  intensity: unit,
  radius: positiveDimension,
});

export const SpatialDepthOfFieldSchema = z.strictObject({
  kind: z.literal("depth-of-field"),
  focusDistance: positiveDimension,
  focalLength: positiveDimension,
  aperture: positiveDimension,
});

export const SpatialMotionBlurSchema = z.strictObject({
  kind: z.literal("motion-blur"),
  shutterAngle: z.number().finite().min(0).max(360),
  samples: z.number().int().min(1).max(64),
});

export const SpatialToneMapSchema = z.strictObject({
  kind: z.literal("tone-map"),
  exposure: z.number().finite(),
  whitePoint: positiveDimension,
});

export const SpatialVignetteSchema = z.strictObject({
  kind: z.literal("vignette"),
  intensity: unit,
  radius: unit,
});

export const SpatialGrainSchema = z.strictObject({
  kind: z.literal("grain"),
  intensity: unit,
  seed: z.number().int().min(0).max(2_147_483_647),
});

export const SpatialLutGradeSchema = z.strictObject({
  kind: z.literal("lut-grade"),
  assetId: z.string().min(1).max(128),
  intensity: unit,
});

export const SpatialPostProcessStepSchema = z.discriminatedUnion("kind", [
  SpatialBloomSchema,
  SpatialDepthOfFieldSchema,
  SpatialMotionBlurSchema,
  SpatialToneMapSchema,
  SpatialVignetteSchema,
  SpatialGrainSchema,
  SpatialLutGradeSchema,
]);

export const SpatialPostProcessStackSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-post-process"),
  schemaVersion: z.literal(1),
  steps: z.array(SpatialPostProcessStepSchema).max(SPATIAL_EFFECT_LIMITS.postProcessStack),
});

export const SpatialRenderPlanSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-render-plan"),
  schemaVersion: z.literal(1),
  quality: SpatialRenderQualitySchema,
  postProcess: SpatialPostProcessStackSchema.optional(),
});

export type SpatialRenderQuality = Readonly<z.infer<typeof SpatialRenderQualitySchema>>;
export type SpatialPostProcessStack = Readonly<z.infer<typeof SpatialPostProcessStackSchema>>;
export type SpatialRenderPlan = Readonly<z.infer<typeof SpatialRenderPlanSchema>>;

export function parseSpatialRenderPlan(input: unknown): SpatialRenderPlan {
  const plan = parseSpatialValue(SpatialRenderPlanSchema, input, "render plan");
  if (plan.quality.tier === "preview" && plan.quality.particleCount > 100_000) {
    throw new SpatialSceneError("invalid-data", "Preview tier cannot request more than 100,000 particles.");
  }
  if (plan.quality.outputBytes < plan.quality.particleCount * 64) {
    throw new SpatialSceneError("invalid-data", "Output byte budget is too small for declared particle count.");
  }
  return deepFreezeJson(plan);
}

export function spatialRenderPlanSha256(plan: SpatialRenderPlan): string {
  return spatialValueSha256(plan);
}

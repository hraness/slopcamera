import { z } from "zod";
import { deepFreezeJson } from "../code/json-snapshot.js";
import { parseSpatialValue, spatialValueSha256 } from "./identity.js";
import { positiveDimension, unit } from "./effects.js";

/**
 * Bounded deterministic particle systems for Phase 7.
 * All randomness is seeded; emitters, forces, collision/kill volumes, and
 * count tiers are validated before any renderer or native bake admission.
 */

export const SPATIAL_PARTICLE_LIMITS = {
  emitters: 64,
  forces: 16,
  killVolumes: 16,
  preview: 100_000,
  final: 1_000_000,
} as const;

export const SpatialParticleEmitterShapeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("point") }),
  z.strictObject({ kind: z.literal("sphere"), radius: positiveDimension }),
  z.strictObject({ kind: z.literal("box"), size: z.tuple([positiveDimension, positiveDimension, positiveDimension]) }),
  z.strictObject({ kind: z.literal("disc"), radius: positiveDimension }),
  z.strictObject({ kind: z.literal("surface"), assetId: z.string().min(1).max(128) }),
  z.strictObject({ kind: z.literal("spline"), controlPoints: z.array(z.tuple([positiveDimension, positiveDimension, positiveDimension])).min(2).max(64) }),
]);

export const SpatialParticleForceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("gravity"), direction: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) }),
  z.strictObject({ kind: z.literal("drag"), coefficient: unit }),
  z.strictObject({ kind: z.literal("vortex"), axis: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), strength: z.number().finite() }),
  z.strictObject({ kind: z.literal("turbulence"), seed: z.number().int().min(0).max(2_147_483_647), scale: positiveDimension, strength: positiveDimension }),
]);

export const SpatialParticleKillVolumeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("box"), min: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), max: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) }),
  z.strictObject({ kind: z.literal("sphere"), center: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), radius: positiveDimension }),
]);

export const SpatialParticleCurveSchema = z.strictObject({
  keys: z.array(z.strictObject({ t: unit, value: unit })).min(1).max(16),
});

export const SpatialParticleEmitterSchema = z.strictObject({
  id: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  seed: z.number().int().min(0).max(2_147_483_647),
  rate: z.number().int().min(0).max(SPATIAL_PARTICLE_LIMITS.final),
  burst: z.number().int().min(0).max(SPATIAL_PARTICLE_LIMITS.final).optional(),
  lifetimeUs: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  shape: SpatialParticleEmitterShapeSchema,
  velocity: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  velocitySpread: z.tuple([unit, unit, unit]),
  sizeOverLife: SpatialParticleCurveSchema,
  colorOverLife: z.array(z.tuple([unit, unit, unit, unit])).min(1).max(16),
  opacityOverLife: SpatialParticleCurveSchema,
});

export const SpatialParticleSystemSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-particle-system"),
  schemaVersion: z.literal(1),
  entityId: z.string().min(1).max(128),
  countTier: z.enum(["preview", "final"]),
  maxCount: z.number().int().min(0).max(SPATIAL_PARTICLE_LIMITS.final),
  emitters: z.array(SpatialParticleEmitterSchema).max(SPATIAL_PARTICLE_LIMITS.emitters),
  forces: z.array(SpatialParticleForceSchema).max(SPATIAL_PARTICLE_LIMITS.forces),
  killVolumes: z.array(SpatialParticleKillVolumeSchema).max(SPATIAL_PARTICLE_LIMITS.killVolumes),
  preBake: z.boolean().default(false),
});

export type SpatialParticleSystem = Readonly<z.infer<typeof SpatialParticleSystemSchema>>;
export type SpatialParticleEmitter = Readonly<z.infer<typeof SpatialParticleEmitterSchema>>;

export function parseSpatialParticleSystem(input: unknown): SpatialParticleSystem {
  const system = parseSpatialValue(SpatialParticleSystemSchema, input, "particle system");
  const tierLimit = system.countTier === "preview" ? SPATIAL_PARTICLE_LIMITS.preview : SPATIAL_PARTICLE_LIMITS.final;
  if (system.maxCount > tierLimit) {
    throw new TypeError(`Particle system ${system.entityId} requests ${system.maxCount} particles, exceeding the ${system.countTier} tier limit of ${tierLimit}.`);
  }
  const maxRate = system.emitters.reduce((sum, e) => sum + e.rate + (e.burst ?? 0), 0);
  if (maxRate > system.maxCount) {
    throw new TypeError(`Particle system ${system.entityId} peak emission rate (${maxRate}) exceeds maxCount (${system.maxCount}).`);
  }
  return deepFreezeJson(system);
}

export function spatialParticleSystemSha256(system: SpatialParticleSystem): string {
  return spatialValueSha256(system);
}

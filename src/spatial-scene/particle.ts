import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialAssetIdSchema, SpatialEntityIdSchema, SpatialTimeUsSchema } from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"

/**
 * Bounded deterministic particle systems for Phase 7.
 * All randomness is seeded; emitters, forces, collision/kill volumes, and
 * count tiers are validated before any renderer or native bake admission.
 */

export const SPATIAL_PARTICLE_LIMITS = Object.freeze({
  collisionVolumes: 16,
  curveKeys: 16,
  durationUs: 3_600_000_000,
  emitters: 64,
  final: 1_000_000,
  forces: 16,
  killVolumes: 16,
  preview: 100_000,
  splinePoints: 64,
})

const finiteCoordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const positiveDimension = z.number().finite().positive().max(1_000_000)
const unit = z.number().finite().min(0).max(1)
const vec3 = z.tuple([finiteCoordinate, finiteCoordinate, finiteCoordinate])
const rgba = z.tuple([unit, unit, unit, unit])
const particleId = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/u)

const scalarCurveKey = z.strictObject({ t: unit, value: unit })
const scalarCurveKeys = z.array(scalarCurveKey).min(2).max(SPATIAL_PARTICLE_LIMITS.curveKeys).superRefine((keys, context) => {
  if (keys[0]?.t !== 0 || keys[keys.length - 1]?.t !== 1) {
    context.addIssue({ code: "custom", message: "Particle curves must cover normalized time from 0 through 1." })
  }
  for (let index = 1; index < keys.length; index += 1) {
    if (keys[index]!.t <= keys[index - 1]!.t) {
      context.addIssue({ code: "custom", path: [index, "t"], message: "Particle curve keys must have strictly increasing time." })
    }
  }
})

const colorCurveKey = z.strictObject({ t: unit, color: rgba })
const keyedColorCurve = z.array(colorCurveKey).min(2).max(SPATIAL_PARTICLE_LIMITS.curveKeys).superRefine((keys, context) => {
  if (keys[0]?.t !== 0 || keys[keys.length - 1]?.t !== 1) {
    context.addIssue({ code: "custom", message: "Particle color curves must cover normalized time from 0 through 1." })
  }
  for (let index = 1; index < keys.length; index += 1) {
    if (keys[index]!.t <= keys[index - 1]!.t) {
      context.addIssue({ code: "custom", path: [index, "t"], message: "Particle color keys must have strictly increasing time." })
    }
  }
})
const legacyColorCurve = z.array(rgba).min(2).max(SPATIAL_PARTICLE_LIMITS.curveKeys).transform(colors => (
  colors.map((color, index) => ({ t: index / (colors.length - 1), color }))
))

export const SpatialParticleEmitterShapeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("point") }),
  z.strictObject({ kind: z.literal("sphere"), radius: positiveDimension, volume: z.boolean().default(true) }),
  z.strictObject({ kind: z.literal("box"), size: z.tuple([positiveDimension, positiveDimension, positiveDimension]), volume: z.boolean().default(true) }),
  z.strictObject({ kind: z.literal("disc"), radius: positiveDimension }),
  z.strictObject({ kind: z.literal("surface"), assetId: SpatialAssetIdSchema }),
  z.strictObject({ kind: z.literal("spline"), controlPoints: z.array(vec3).min(2).max(SPATIAL_PARTICLE_LIMITS.splinePoints) }),
])

export const SpatialParticleForceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("gravity"), acceleration: vec3 }),
  z.strictObject({ kind: z.literal("drag"), coefficient: unit }),
  z.strictObject({ kind: z.literal("vortex"), axis: vec3, strength: z.number().finite().min(-1_000_000).max(1_000_000) }),
  z.strictObject({ kind: z.literal("turbulence"), seed: z.number().int().min(0).max(2_147_483_647), scale: positiveDimension, strength: positiveDimension }),
])

const boxVolumeShape = {
  kind: z.literal("box"),
  max: vec3,
  min: vec3,
}
const sphereVolumeShape = {
  center: vec3,
  kind: z.literal("sphere"),
  radius: positiveDimension,
}

export const SpatialParticleKillVolumeSchema = z.discriminatedUnion("kind", [
  z.strictObject(boxVolumeShape),
  z.strictObject(sphereVolumeShape),
])

export const SpatialParticleCollisionVolumeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...boxVolumeShape, response: z.enum(["bounce", "slide"]), restitution: unit }),
  z.strictObject({ ...sphereVolumeShape, response: z.enum(["bounce", "slide"]), restitution: unit }),
])

export const SpatialParticleCurveSchema = z.strictObject({ keys: scalarCurveKeys })

export const SpatialParticleEmitterSchema = z.strictObject({
  burst: z.number().int().min(0).max(SPATIAL_PARTICLE_LIMITS.final).optional(),
  colorOverLife: z.union([keyedColorCurve, legacyColorCurve]),
  enabled: z.boolean().default(true),
  id: particleId,
  lifetimeUs: z.tuple([
    SpatialTimeUsSchema.min(1).max(SPATIAL_PARTICLE_LIMITS.durationUs),
    SpatialTimeUsSchema.min(1).max(SPATIAL_PARTICLE_LIMITS.durationUs),
  ]),
  opacityOverLife: SpatialParticleCurveSchema,
  rate: z.number().int().min(0).max(SPATIAL_PARTICLE_LIMITS.final),
  seed: z.number().int().min(0).max(2_147_483_647),
  shape: SpatialParticleEmitterShapeSchema,
  sizeOverLife: SpatialParticleCurveSchema,
  velocity: vec3,
  velocitySpread: z.tuple([unit, unit, unit]),
}).superRefine((emitter, context) => {
  if (emitter.lifetimeUs[1] < emitter.lifetimeUs[0]) {
    context.addIssue({ code: "custom", path: ["lifetimeUs", 1], message: "Maximum particle lifetime must not precede minimum lifetime." })
  }
  if (emitter.rate === 0 && (emitter.burst ?? 0) === 0) {
    context.addIssue({ code: "custom", message: "An emitter must declare a positive rate or burst." })
  }
  if (emitter.shape.kind === "spline") {
    const distinct = new Set(emitter.shape.controlPoints.map(point => point.join(",")))
    if (distinct.size < 2) context.addIssue({ code: "custom", path: ["shape", "controlPoints"], message: "A spline emitter needs at least two distinct control points." })
  }
})

export const SpatialParticleRendererSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("sprite"), assetId: SpatialAssetIdSchema.optional(), billboard: z.boolean().default(true) }),
  z.strictObject({ kind: z.literal("instanced-mesh"), assetId: SpatialAssetIdSchema }),
])

export const SpatialParticleSystemSchema = z.strictObject({
  collisionVolumes: z.array(SpatialParticleCollisionVolumeSchema).max(SPATIAL_PARTICLE_LIMITS.collisionVolumes).default([]),
  countTier: z.enum(["preview", "final"]),
  emitters: z.array(SpatialParticleEmitterSchema).min(1).max(SPATIAL_PARTICLE_LIMITS.emitters),
  entityId: SpatialEntityIdSchema,
  forces: z.array(SpatialParticleForceSchema).max(SPATIAL_PARTICLE_LIMITS.forces),
  killVolumes: z.array(SpatialParticleKillVolumeSchema).max(SPATIAL_PARTICLE_LIMITS.killVolumes),
  kind: z.literal("slopcamera.spatial-particle-system"),
  maxCount: z.number().int().min(1).max(SPATIAL_PARTICLE_LIMITS.final),
  preBake: z.boolean().default(false),
  renderer: SpatialParticleRendererSchema.default({ kind: "sprite", billboard: true }),
  schemaVersion: z.literal(1),
})

export type SpatialParticleSystem = Readonly<z.infer<typeof SpatialParticleSystemSchema>>
export type SpatialParticleEmitter = Readonly<z.infer<typeof SpatialParticleEmitterSchema>>

function assertBoxVolume(volume: { readonly kind: string; readonly min?: readonly number[]; readonly max?: readonly number[] }, label: string): void {
  if (volume.kind !== "box" || volume.min === undefined || volume.max === undefined) return
  if (volume.min.some((value, index) => value >= volume.max![index]!)) {
    throw new SpatialSceneError("invalid-data", `${label} box minimum coordinates must be below maximum coordinates.`, "particle-system")
  }
}

export function parseSpatialParticleSystem(input: unknown): SpatialParticleSystem {
  const system = parseSpatialValue(SpatialParticleSystemSchema, input, "particle system")
  const tierLimit = system.countTier === "preview" ? SPATIAL_PARTICLE_LIMITS.preview : SPATIAL_PARTICLE_LIMITS.final
  if (system.maxCount > tierLimit) {
    throw new SpatialSceneError("invalid-data", `Particle system ${system.entityId} requests ${system.maxCount} particles, exceeding the ${system.countTier} tier limit of ${tierLimit}.`, "particle-system")
  }
  const emitterIds = system.emitters.map(emitter => emitter.id)
  if (new Set(emitterIds).size !== emitterIds.length) {
    throw new SpatialSceneError("invalid-data", `Particle system ${system.entityId} has duplicate emitter IDs.`, "particle-system")
  }
  const simultaneousBound = system.emitters.reduce((sum, emitter) => (
    emitter.enabled
      ? sum + (emitter.burst ?? 0) + Math.ceil(emitter.rate * emitter.lifetimeUs[1] / 1_000_000)
      : sum
  ), 0)
  if (simultaneousBound > system.maxCount) {
    throw new SpatialSceneError("invalid-data", `Particle system ${system.entityId} simultaneous bound (${simultaneousBound}) exceeds maxCount (${system.maxCount}).`, "particle-system")
  }
  for (const volume of system.killVolumes) assertBoxVolume(volume, "Kill volume")
  for (const volume of system.collisionVolumes) assertBoxVolume(volume, "Collision volume")
  for (const force of system.forces) {
    if (force.kind === "vortex" && force.axis.every(value => value === 0)) {
      throw new SpatialSceneError("invalid-data", "Vortex axes must be nonzero.", "particle-system")
    }
  }
  return deepFreezeJson(system)
}

export function spatialParticleAssetIds(system: SpatialParticleSystem): readonly string[] {
  const ids = new Set<string>()
  if ("assetId" in system.renderer && system.renderer.assetId !== undefined) ids.add(system.renderer.assetId)
  for (const emitter of system.emitters) {
    if (emitter.shape.kind === "surface") ids.add(emitter.shape.assetId)
  }
  return Object.freeze([...ids].sort())
}

export function spatialParticleSystemSha256(system: SpatialParticleSystem): string {
  return spatialValueSha256(system)
}

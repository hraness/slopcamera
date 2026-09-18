import { z } from "zod";
import { deepFreezeJson } from "../code/json-snapshot.js";
import { parseSpatialValue, spatialValueSha256 } from "./identity.js";
import { positiveDimension } from "./effects.js";

/**
 * Deterministic fixed-step physics and secondary-motion bakes.
 * No live mutable physics — these are cache-bound, authored plans that emit
 * ordinary deterministic animation curves for renderer lowering and audit.
 */

export const SPATIAL_SIMULATION_LIMITS = {
  bodies: 256,
  constraints: 256,
  steps: 100_000,
  substeps: 128,
} as const;

export const SpatialRigidBodySchema = z.strictObject({
  id: z.string().min(1).max(64),
  mass: positiveDimension,
  restitution: z.number().finite().min(0).max(1),
  friction: z.number().finite().min(0).max(1),
  shape: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("sphere"), radius: positiveDimension }),
    z.strictObject({ kind: z.literal("box"), size: z.tuple([positiveDimension, positiveDimension, positiveDimension]) }),
    z.strictObject({ kind: z.literal("capsule"), radius: positiveDimension, height: positiveDimension }),
  ]),
  initialPosition: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  initialOrientation: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  initialVelocity: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  initialAngularVelocity: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  pinned: z.boolean().default(false),
});

export const SpatialConstraintSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hinge"), bodyA: z.string(), bodyB: z.string(), axis: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), limits: z.tuple([z.number().finite(), z.number().finite()]).optional() }),
  z.strictObject({ kind: z.literal("spring"), bodyA: z.string(), bodyB: z.string(), stiffness: positiveDimension, damping: positiveDimension }),
  z.strictObject({ kind: z.literal("fixed"), bodyA: z.string(), bodyB: z.string(), localA: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), localB: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) }),
]);

export const SpatialSimulationPlanSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-simulation-plan"),
  schemaVersion: z.literal(1),
  entityId: z.string().min(1).max(128),
  engine: z.string().min(1).max(64),
  cacheId: z.string().min(1).max(128),
  sourceDigest: z.string().length(64),
  seed: z.number().int().min(0).max(2_147_483_647),
  timeStepUs: z.number().int().min(1),
  stepCount: z.number().int().min(0).max(SPATIAL_SIMULATION_LIMITS.steps),
  maxSubsteps: z.number().int().min(1).max(SPATIAL_SIMULATION_LIMITS.substeps),
  bodies: z.array(SpatialRigidBodySchema).max(SPATIAL_SIMULATION_LIMITS.bodies),
  constraints: z.array(SpatialConstraintSchema).max(SPATIAL_SIMULATION_LIMITS.constraints),
  gravity: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
});

export type SpatialSimulationPlan = Readonly<z.infer<typeof SpatialSimulationPlanSchema>>;

export function parseSpatialSimulationPlan(input: unknown): SpatialSimulationPlan {
  const plan = parseSpatialValue(SpatialSimulationPlanSchema, input, "simulation plan");
  const bodyIds = new Set(plan.bodies.map((b) => b.id));
  for (const c of plan.constraints) {
    if (!bodyIds.has(c.bodyA) || !bodyIds.has(c.bodyB)) {
      throw new TypeError(`Constraint ${c.kind} references unknown body ${c.bodyA} or ${c.bodyB}.`);
    }
  }
  const floatsPerBody = 7 + 3;
  const estimatedBytes = plan.bodies.length * plan.stepCount * floatsPerBody * 4;
  if (estimatedBytes > 1_000_000_000) {
    throw new TypeError(`Simulation ${plan.entityId} estimated animation bytes (${estimatedBytes}) exceed 1 GB.`);
  }
  return deepFreezeJson(plan);
}

export function spatialSimulationPlanSha256(plan: SpatialSimulationPlan): string {
  return spatialValueSha256(plan);
}

import { z } from "zod"

import { canonicalJsonSha256 } from "../code/canonical-json.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  SpatialDigestSchema,
  SpatialEntityIdSchema,
  SpatialQuaternionSchema,
  SpatialTimeUsSchema,
  SpatialVec3Schema,
} from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"

/**
 * Deterministic fixed-step physics and secondary-motion bakes.
 * No live mutable physics — these are cache-bound, authored plans that emit
 * ordinary deterministic animation curves for renderer lowering and audit.
 */

export const SPATIAL_SIMULATION_LIMITS = Object.freeze({
  bodies: 256,
  constraints: 256,
  durationUs: 3_600_000_000,
  outputBytes: 1_000_000_000,
  steps: 100_000,
  substeps: 128,
})

const positiveDimension = z.number().finite().positive().max(1_000_000)
const unit = z.number().finite().min(0).max(1)
const bodyId = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/u)
const constraintId = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/u)

export const SpatialSimulationEngineSchema = z.strictObject({
  identitySha256: SpatialDigestSchema,
  profile: z.enum(["slopcamera-rigid-body-reference-v1", "slopcamera-native-secondary-motion-v1"]),
})

export const SpatialRigidBodySchema = z.strictObject({
  entityId: SpatialEntityIdSchema,
  friction: unit,
  id: bodyId,
  initialAngularVelocity: SpatialVec3Schema,
  initialOrientation: SpatialQuaternionSchema,
  initialPosition: SpatialVec3Schema,
  initialVelocity: SpatialVec3Schema,
  mass: z.number().finite().min(0).max(1_000_000_000),
  pinned: z.boolean().default(false),
  restitution: unit,
  shape: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("sphere"), radius: positiveDimension }),
    z.strictObject({ kind: z.literal("box"), size: z.tuple([positiveDimension, positiveDimension, positiveDimension]) }),
    z.strictObject({ height: positiveDimension, kind: z.literal("capsule"), radius: positiveDimension }),
  ]),
}).superRefine((body, context) => {
  if (!body.pinned && body.mass <= 0) {
    context.addIssue({ code: "custom", path: ["mass"], message: "Unpinned rigid bodies require positive mass." })
  }
})

const constraintBase = {
  bodyA: bodyId,
  bodyB: bodyId,
  constraintId,
}

export const SpatialConstraintSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...constraintBase, axis: SpatialVec3Schema, kind: z.literal("hinge"), limits: z.tuple([z.number().finite(), z.number().finite()]).optional() }),
  z.strictObject({ ...constraintBase, damping: z.number().finite().min(0).max(1_000_000), kind: z.literal("spring"), stiffness: positiveDimension }),
  z.strictObject({ ...constraintBase, kind: z.literal("fixed"), localA: SpatialVec3Schema, localB: SpatialVec3Schema }),
])

export const SpatialSimulationPlanSchema = z.strictObject({
  bodies: z.array(SpatialRigidBodySchema).min(1).max(SPATIAL_SIMULATION_LIMITS.bodies),
  cacheId: z.string().min(1).max(128).regex(/^cache_[a-z0-9][a-z0-9_-]*$/u),
  constraints: z.array(SpatialConstraintSchema).max(SPATIAL_SIMULATION_LIMITS.constraints),
  engine: SpatialSimulationEngineSchema,
  entityId: SpatialEntityIdSchema,
  gravity: SpatialVec3Schema,
  kind: z.literal("slopcamera.spatial-simulation-plan"),
  maxSubsteps: z.number().int().min(1).max(SPATIAL_SIMULATION_LIMITS.substeps),
  maximumOutputBytes: z.number().int().safe().positive().max(SPATIAL_SIMULATION_LIMITS.outputBytes).default(SPATIAL_SIMULATION_LIMITS.outputBytes),
  schemaVersion: z.literal(1),
  seed: z.number().int().min(0).max(2_147_483_647),
  simulationKind: z.enum(["rigid-body", "secondary-motion"]).default("rigid-body"),
  sourceDigest: SpatialDigestSchema,
  stepCount: z.number().int().min(1).max(SPATIAL_SIMULATION_LIMITS.steps),
  timeStepUs: SpatialTimeUsSchema.min(1).max(1_000_000),
}).superRefine((plan, context) => {
  if ((plan.simulationKind === "rigid-body" && plan.engine.profile !== "slopcamera-rigid-body-reference-v1")
    || (plan.simulationKind === "secondary-motion" && plan.engine.profile !== "slopcamera-native-secondary-motion-v1")) {
    context.addIssue({ code: "custom", path: ["engine", "profile"], message: "Simulation kind must match its closed engine profile." })
  }
  if (plan.timeStepUs * plan.stepCount > SPATIAL_SIMULATION_LIMITS.durationUs) {
    context.addIssue({ code: "custom", path: ["stepCount"], message: "Simulation duration exceeds one hour." })
  }
  const bodyIds = new Set<string>()
  const entityIds = new Set<string>()
  for (const [index, body] of plan.bodies.entries()) {
    if (bodyIds.has(body.id)) context.addIssue({ code: "custom", path: ["bodies", index, "id"], message: `Duplicate rigid-body id ${body.id}.` })
    if (entityIds.has(body.entityId)) context.addIssue({ code: "custom", path: ["bodies", index, "entityId"], message: `Entity ${body.entityId} has more than one rigid body.` })
    bodyIds.add(body.id)
    entityIds.add(body.entityId)
  }
  const constraintIds = new Set<string>()
  for (const [index, constraint] of plan.constraints.entries()) {
    if (constraintIds.has(constraint.constraintId)) context.addIssue({ code: "custom", path: ["constraints", index, "constraintId"], message: `Duplicate constraint id ${constraint.constraintId}.` })
    constraintIds.add(constraint.constraintId)
    const missingBodies = [constraint.bodyA, constraint.bodyB].filter(id => !bodyIds.has(id))
    if (missingBodies.length > 0) {
      context.addIssue({ code: "custom", path: ["constraints", index], message: `Constraint ${constraint.constraintId} references unknown body ${missingBodies.join(", ")}.` })
    }
    if (constraint.bodyA === constraint.bodyB) {
      context.addIssue({ code: "custom", path: ["constraints", index], message: `Constraint ${constraint.constraintId} cannot connect a body to itself.` })
    }
    if (constraint.kind === "hinge") {
      if (constraint.axis.every(value => value === 0)) context.addIssue({ code: "custom", path: ["constraints", index, "axis"], message: "Hinge axes must be nonzero." })
      if (constraint.limits !== undefined && constraint.limits[1] < constraint.limits[0]) context.addIssue({ code: "custom", path: ["constraints", index, "limits"], message: "Hinge limits must be ordered." })
    }
  }
  const estimatedBytes = plan.bodies.length * plan.stepCount * 10 * Float64Array.BYTES_PER_ELEMENT
  if (estimatedBytes > plan.maximumOutputBytes) {
    context.addIssue({ code: "custom", path: ["maximumOutputBytes"], message: `Estimated ordinary-animation bytes (${estimatedBytes}) exceed maximumOutputBytes (${plan.maximumOutputBytes}).` })
  }
})

const simulationBakeReceiptBodySchema = z.strictObject({
  cacheId: z.string().min(1).max(128).regex(/^cache_[a-z0-9][a-z0-9_-]*$/u),
  engine: SpatialSimulationEngineSchema,
  kind: z.literal("slopcamera.spatial-simulation-bake-receipt"),
  output: z.strictObject({
    animationSha256: SpatialDigestSchema,
    bytes: z.number().int().safe().positive().max(SPATIAL_SIMULATION_LIMITS.outputBytes),
    channelCount: z.number().int().min(1).max(SPATIAL_SIMULATION_LIMITS.bodies * 2),
    keyCount: z.number().int().min(1).max(SPATIAL_SIMULATION_LIMITS.bodies * SPATIAL_SIMULATION_LIMITS.steps * 2),
  }),
  planSha256: SpatialDigestSchema,
  schemaVersion: z.literal(1),
  seed: z.number().int().min(0).max(2_147_483_647),
  sourceDigest: SpatialDigestSchema,
  stepCount: z.number().int().min(1).max(SPATIAL_SIMULATION_LIMITS.steps),
  timeStepUs: SpatialTimeUsSchema.min(1).max(1_000_000),
})

export const SpatialSimulationBakeReceiptSchema = simulationBakeReceiptBodySchema.extend({
  receiptSha256: SpatialDigestSchema,
})

export type SpatialSimulationPlan = Readonly<z.infer<typeof SpatialSimulationPlanSchema>>
export type SpatialSimulationBakeReceipt = Readonly<z.infer<typeof SpatialSimulationBakeReceiptSchema>>

export function parseSpatialSimulationPlan(input: unknown): SpatialSimulationPlan {
  return deepFreezeJson(parseSpatialValue(SpatialSimulationPlanSchema, input, "simulation plan"))
}

export function spatialSimulationPlanSha256(plan: SpatialSimulationPlan): string {
  return spatialValueSha256(plan)
}

export function createSpatialSimulationBakeReceipt(input: z.input<typeof simulationBakeReceiptBodySchema>): SpatialSimulationBakeReceipt {
  const body = simulationBakeReceiptBodySchema.parse(input)
  return deepFreezeJson(SpatialSimulationBakeReceiptSchema.parse({ ...body, receiptSha256: canonicalJsonSha256(body) }))
}

export function parseSpatialSimulationBakeReceipt(input: unknown): SpatialSimulationBakeReceipt {
  const receipt = parseSpatialValue(SpatialSimulationBakeReceiptSchema, input, "simulation bake receipt")
  const { receiptSha256, ...body } = receipt
  if (canonicalJsonSha256(body) !== receiptSha256) {
    throw new SpatialSceneError("conflict", "Simulation bake receipt digest does not match its body.", "simulation-bake")
  }
  return deepFreezeJson(receipt)
}

export function reconcileSpatialSimulationBakeReceipt(planInput: unknown, receiptInput: unknown): SpatialSimulationBakeReceipt {
  const plan = parseSpatialSimulationPlan(planInput)
  const receipt = parseSpatialSimulationBakeReceipt(receiptInput)
  const planSha256 = spatialSimulationPlanSha256(plan)
  if (receipt.planSha256 !== planSha256 || receipt.cacheId !== plan.cacheId || receipt.sourceDigest !== plan.sourceDigest
    || receipt.engine.profile !== plan.engine.profile || receipt.engine.identitySha256 !== plan.engine.identitySha256
    || receipt.seed !== plan.seed || receipt.stepCount !== plan.stepCount || receipt.timeStepUs !== plan.timeStepUs) {
    throw new SpatialSceneError("conflict", "Simulation bake receipt is stale or belongs to a different plan, cache, source, engine, seed, or clock.", "simulation-bake")
  }
  if (receipt.output.bytes > plan.maximumOutputBytes) {
    throw new SpatialSceneError("invalid-data", "Simulation bake output exceeds the plan output-byte budget.", "simulation-bake")
  }
  return deepFreezeJson(receipt)
}

import { z } from "zod"

import { canonicalJson } from "../code/canonical-json.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  SpatialDigestSchema,
  SpatialEntityIdSchema,
  SpatialQuaternionSchema,
  SpatialTimeUsSchema,
  SpatialVec3Schema,
} from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"
import {
  SPATIAL_SIMULATION_LIMITS,
  createSpatialSimulationBakeReceipt,
  parseSpatialSimulationPlan,
  spatialSimulationPlanSha256,
  type SpatialSimulationBakeReceipt,
} from "./simulation.js"

/**
 * Deterministic fixed-step reference bake for `slopcamera-rigid-body-reference-v1`.
 * Semi-implicit Euler with analytic forces only — gravity, declared springs,
 * and fixed-constraint projection — plus free rigid rotation from the initial
 * angular velocity. The integrator is deliberately narrow: undeclared world
 * colliders, contact, and hinge constraints are outside this qualification and
 * reject rather than approximate. All arithmetic is IEEE-754 binary64 in
 * declared plan order, so identical plans produce identical bytes everywhere.
 * The native secondary-motion profile stays fail-closed here.
 */

export const SPATIAL_SIMULATION_BAKE_LIMITS = Object.freeze({
  channels: SPATIAL_SIMULATION_LIMITS.bodies,
  keysPerChannel: SPATIAL_SIMULATION_LIMITS.steps,
})

const transformKeySchema = z.strictObject({
  orientation: SpatialQuaternionSchema,
  position: SpatialVec3Schema,
  timeUs: SpatialTimeUsSchema,
})

export const SpatialSimulationBakeChannelSchema = z.strictObject({
  entityId: SpatialEntityIdSchema,
  keys: z.array(transformKeySchema).min(1).max(SPATIAL_SIMULATION_BAKE_LIMITS.keysPerChannel),
  kind: z.literal("transform"),
})

export const SpatialSimulationBakeDocumentSchema = z.strictObject({
  cacheId: z.string().min(1).max(128).regex(/^cache_[a-z0-9][a-z0-9_-]*$/u),
  channels: z.array(SpatialSimulationBakeChannelSchema).min(1).max(SPATIAL_SIMULATION_BAKE_LIMITS.channels),
  engineProfile: z.literal("slopcamera-rigid-body-reference-v1"),
  kind: z.literal("slopcamera.spatial-simulation-bake"),
  planSha256: SpatialDigestSchema,
  schemaVersion: z.literal(1),
  stepCount: z.number().int().min(1).max(SPATIAL_SIMULATION_LIMITS.steps),
  timeStepUs: SpatialTimeUsSchema.min(1).max(1_000_000),
}).superRefine((document, context) => {
  const entityIds = new Set<string>()
  for (const [index, channel] of document.channels.entries()) {
    if (entityIds.has(channel.entityId)) context.addIssue({ code: "custom", path: ["channels", index, "entityId"], message: `Duplicate bake channel for ${channel.entityId}.` })
    entityIds.add(channel.entityId)
    let previous = -1
    for (const [keyIndex, key] of channel.keys.entries()) {
      if (key.timeUs <= previous) context.addIssue({ code: "custom", path: ["channels", index, "keys", keyIndex, "timeUs"], message: "Bake keys must be strictly ordered by timeUs." })
      previous = key.timeUs
    }
    if (channel.keys.length !== document.stepCount) {
      context.addIssue({ code: "custom", path: ["channels", index, "keys"], message: `Bake channel must carry exactly ${document.stepCount} ordered keys.` })
    }
  }
})

export type SpatialSimulationBakeDocument = Readonly<z.infer<typeof SpatialSimulationBakeDocumentSchema>>

export function parseSpatialSimulationBakeDocument(input: unknown): SpatialSimulationBakeDocument {
  return deepFreezeJson(parseSpatialValue(SpatialSimulationBakeDocumentSchema, input, "simulation bake"))
}

export function spatialSimulationBakeSha256(document: SpatialSimulationBakeDocument): string {
  return spatialValueSha256(document)
}

const round = (value: number): number => (Object.is(value, -0) ? 0 : value)

export interface SpatialSimulationBakeResult {
  readonly document: SpatialSimulationBakeDocument
  readonly receipt: SpatialSimulationBakeReceipt
}

/**
 * Executes one admitted plan and returns the canonical bake document plus its
 * reconciled receipt. Only the reference profile executes; every other engine
 * identity, including the native secondary-motion profile, rejects here even
 * when the plan parses.
 */
export function bakeSpatialSimulation(planInput: unknown): SpatialSimulationBakeResult {
  const plan = parseSpatialSimulationPlan(planInput)
  if (plan.engine.profile !== "slopcamera-rigid-body-reference-v1" || plan.simulationKind !== "rigid-body") {
    throw new SpatialSceneError("invalid-data", `Simulation engine ${plan.engine.profile} is not qualified for portable deterministic baking.`, "simulation-bake")
  }
  for (const constraint of plan.constraints) {
    if (constraint.kind === "hinge") {
      throw new SpatialSceneError("invalid-data", `Hinge constraint ${constraint.constraintId} is not qualified in the reference integrator.`, "simulation-bake")
    }
  }
  const dt = plan.timeStepUs / 1_000_000
  interface BodyState { position: [number, number, number]; velocity: [number, number, number]; orientation: [number, number, number, number]; angular: [number, number, number] }
  const states: BodyState[] = plan.bodies.map(body => ({
    position: [...body.initialPosition],
    velocity: [...body.initialVelocity],
    orientation: [...body.initialOrientation],
    angular: [...body.initialAngularVelocity],
  }))
  const indexByBodyId = new Map(plan.bodies.map((body, index) => [body.id, index]))
  const springs = plan.constraints.filter((constraint): constraint is Extract<typeof constraint, { kind: "spring" }> => constraint.kind === "spring")
    .map(constraint => {
      const a = states[indexByBodyId.get(constraint.bodyA)!]!, b = states[indexByBodyId.get(constraint.bodyB)!]!
      const dx = b.position[0] - a.position[0], dy = b.position[1] - a.position[1], dz = b.position[2] - a.position[2]
      return { a: indexByBodyId.get(constraint.bodyA)!, b: indexByBodyId.get(constraint.bodyB)!, damping: constraint.damping, restLength: Math.sqrt(dx * dx + dy * dy + dz * dz), stiffness: constraint.stiffness }
    })
  const fixed = plan.constraints.filter((constraint): constraint is Extract<typeof constraint, { kind: "fixed" }> => constraint.kind === "fixed")
    .map(constraint => {
      const a = states[indexByBodyId.get(constraint.bodyA)!]!, b = states[indexByBodyId.get(constraint.bodyB)!]!
      return { a: indexByBodyId.get(constraint.bodyA)!, b: indexByBodyId.get(constraint.bodyB)!,
        offset: [b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]] as const }
    })
  const keys: { orientation: [number, number, number, number]; position: [number, number, number]; timeUs: number }[][] = plan.bodies.map(() => [])
  for (let step = 0; step < plan.stepCount; step++) {
    const forces = plan.bodies.map(body => [body.pinned || body.mass <= 0 ? 0 : plan.gravity[0] * body.mass,
      body.pinned || body.mass <= 0 ? 0 : plan.gravity[1] * body.mass,
      body.pinned || body.mass <= 0 ? 0 : plan.gravity[2] * body.mass] as [number, number, number])
    for (const spring of springs) {
      const a = states[spring.a]!, b = states[spring.b]!
      const dx = b.position[0] - a.position[0], dy = b.position[1] - a.position[1], dz = b.position[2] - a.position[2]
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const nx = distance > 0 ? dx / distance : 0, ny = distance > 0 ? dy / distance : 0, nz = distance > 0 ? dz / distance : 0
      const stretch = distance - spring.restLength
      const relative = (b.velocity[0] - a.velocity[0]) * nx + (b.velocity[1] - a.velocity[1]) * ny + (b.velocity[2] - a.velocity[2]) * nz
      const magnitude = spring.stiffness * stretch + spring.damping * relative
      const fa = forces[spring.a]!, fb = forces[spring.b]!
      fa[0] += magnitude * nx; fa[1] += magnitude * ny; fa[2] += magnitude * nz
      fb[0] -= magnitude * nx; fb[1] -= magnitude * ny; fb[2] -= magnitude * nz
    }
    for (const [index, body] of plan.bodies.entries()) {
      if (body.pinned || body.mass <= 0) continue
      const state = states[index]!, force = forces[index]!
      state.velocity[0] += force[0] / body.mass * dt
      state.velocity[1] += force[1] / body.mass * dt
      state.velocity[2] += force[2] / body.mass * dt
      state.position[0] += state.velocity[0] * dt
      state.position[1] += state.velocity[1] * dt
      state.position[2] += state.velocity[2] * dt
      const [wx, wy, wz] = state.angular
      if (wx !== 0 || wy !== 0 || wz !== 0) {
        const [qx, qy, qz, qw] = state.orientation
        const hx = 0.5 * dt * (wx * qw + wy * qz - wz * qy)
        const hy = 0.5 * dt * (wy * qw + wz * qx - wx * qz)
        const hz = 0.5 * dt * (wz * qw + wx * qy - wy * qx)
        const hw = 0.5 * dt * (-wx * qx - wy * qy - wz * qz)
        const nx = qx + hx, ny = qy + hy, nz = qz + hz, nw = qw + hw
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw)
        state.orientation = [nx / length, ny / length, nz / length, nw / length]
      }
    }
    for (const constraint of fixed) {
      const a = states[constraint.a]!, b = states[constraint.b]!
      b.position[0] = a.position[0] + constraint.offset[0]
      b.position[1] = a.position[1] + constraint.offset[1]
      b.position[2] = a.position[2] + constraint.offset[2]
      b.velocity[0] = a.velocity[0]; b.velocity[1] = a.velocity[1]; b.velocity[2] = a.velocity[2]
    }
    const timeUs = step * plan.timeStepUs
    for (const [index, state] of states.entries()) {
      keys[index]!.push({ orientation: [round(state.orientation[0]), round(state.orientation[1]), round(state.orientation[2]), round(state.orientation[3])],
        position: [round(state.position[0]), round(state.position[1]), round(state.position[2])], timeUs })
    }
  }
  const document = parseSpatialSimulationBakeDocument({
    cacheId: plan.cacheId,
    channels: plan.bodies.map((body, index) => ({ entityId: body.entityId, keys: keys[index]!, kind: "transform" })),
    engineProfile: "slopcamera-rigid-body-reference-v1",
    kind: "slopcamera.spatial-simulation-bake",
    planSha256: spatialSimulationPlanSha256(plan),
    schemaVersion: 1,
    stepCount: plan.stepCount,
    timeStepUs: plan.timeStepUs,
  })
  const bytes = new TextEncoder().encode(`${canonicalJson(document)}\n`).byteLength
  if (bytes > plan.maximumOutputBytes) {
    throw new SpatialSceneError("invalid-data", `Simulation bake output (${bytes} bytes) exceeds the plan output-byte budget (${plan.maximumOutputBytes}).`, "simulation-bake")
  }
  const receipt = createSpatialSimulationBakeReceipt({
    cacheId: plan.cacheId,
    engine: plan.engine,
    kind: "slopcamera.spatial-simulation-bake-receipt",
    output: { animationSha256: spatialSimulationBakeSha256(document), bytes, channelCount: document.channels.length, keyCount: document.channels.reduce((sum, channel) => sum + channel.keys.length, 0) },
    planSha256: spatialSimulationPlanSha256(plan),
    schemaVersion: 1,
    seed: plan.seed,
    sourceDigest: plan.sourceDigest,
    stepCount: plan.stepCount,
    timeStepUs: plan.timeStepUs,
  })
  return { document, receipt }
}

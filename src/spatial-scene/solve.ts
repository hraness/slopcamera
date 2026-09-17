import { z } from "zod"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { align, facing, groundSnap, nextTo, onTopOf, type SpatialAxis, type SpatialLayoutEntry } from "./build.js"
import {
  SpatialEntityIdSchema, SpatialQuaternionSchema, SpatialScenePatchV1Schema, SpatialTransformSchema,
  SpatialVec3Schema, type SpatialScenePatchV1, type SpatialTransform,
} from "./contracts.js"
import { parseSpatialValue, SpatialSceneError } from "./identity.js"
import { composeTransform, transformBounds, type Bounds, type Quaternion, type Transform, type Vec3 } from "./math.js"

/**
 * Declarative relation goals solved into concrete transforms plus a
 * ready-to-apply patch document. The solver composes the phase-1 placement
 * primitives (`onTopOf`, `nextTo`, `facing`, `align`, `groundSnap`) over a
 * dependency DAG: a goal whose relations name another goal entity runs after
 * it, so targets see solved transforms. Within one goal, relations apply in
 * declared order and each sees earlier results.
 *
 * Relation contract:
 * - `onTopOf`/`nextTo`/`align`/`groundSnap` need local bounds on every
 *   participating entity; a missing enclosure fails `bounds-unknown` naming
 *   that entity. `align` moves the goal entity's `edge` (min | center | max)
 *   on `axis` onto the target's same edge; it is expressed through `align`
 *   on the pair, transferring the anchor's would-be delta back to the mover
 *   so the named target never moves.
 * - `facing` rotates the goal entity so local -Z looks at the target's
 *   transform position (camera poses arrive as bases the same way). `at`
 *   assigns absolute transform components. Neither needs bounds.
 *
 * Determinism: identical input yields byte-identical output. The emitted
 * patch carries `SPATIAL_SOLVE_PENDING_SCENE_SHA256` in place of the scene
 * digest; the caller fills it (e.g. from `scene inspect`) before `scene
 * patch`, keeping solve output stable across scene revisions.
 */

export const SPATIAL_SOLVE_LIMITS = Object.freeze({
  goals: 64,
  relationsPerGoal: 8,
  bases: 1_024,
})

/** Emitted patch digest slot: parses as a digest and conflicts honestly on apply until the caller fills it. */
export const SPATIAL_SOLVE_PENDING_SCENE_SHA256 = "0".repeat(64)

export type SpatialSolveErrorCode =
  | "invalid-data"
  | "unknown-entity"
  | "bounds-unknown"
  | "relation-cycle"
  | "duplicate-goal"
  | "relation-failed"

/** Typed solver failures; `path` addresses the offending goal, relation or base entry. */
export class SpatialSolveError extends Error {
  readonly code: SpatialSolveErrorCode
  readonly path: string
  constructor(code: SpatialSolveErrorCode, message: string, path = "solve") {
    super(message)
    this.name = "SpatialSolveError"
    this.code = code
    this.path = path
  }
}

/** Goal entities must be scene entity IDs so emitted `set-transform` operations stay schema-valid. */
export const SpatialSolveEntityKeySchema = SpatialEntityIdSchema
/** Anchor keys also cover cameras and caller-declared virtual bases, so only the shared id charset applies. */
export const SpatialSolveAnchorKeySchema = z.string().min(1).max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u, "Solve keys start alphanumeric and may contain _ or -.")

const axisSchema = z.enum(["x", "y", "z"])
const boundedNumber = z.number().finite().min(-1_000_000).max(1_000_000)
const positiveDimension = z.number().finite().min(0.000001).max(1_000_000)
const scaleTuple = z.tuple([positiveDimension, positiveDimension, positiveDimension])

export const SpatialSolveBoundsSchema = z.strictObject({ min: SpatialVec3Schema, max: SpatialVec3Schema })
  .refine(bounds => bounds.min.every((value, index) => value <= bounds.max[index]!), "Bounds min must not exceed max.")

export const SpatialSolveRelationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("onTopOf"), target: SpatialSolveAnchorKeySchema }),
  z.strictObject({
    kind: z.literal("nextTo"), target: SpatialSolveAnchorKeySchema,
    axis: axisSchema.optional(), side: z.enum(["before", "after"]).optional(), gap: boundedNumber.optional(),
  }),
  z.strictObject({ kind: z.literal("facing"), target: SpatialSolveAnchorKeySchema, up: SpatialVec3Schema.optional() }),
  z.strictObject({
    kind: z.literal("align"), target: SpatialSolveAnchorKeySchema,
    axis: axisSchema, edge: z.enum(["min", "center", "max"]).optional(),
  }),
  z.strictObject({
    kind: z.literal("at"),
    position: SpatialVec3Schema.optional(), rotation: SpatialQuaternionSchema.optional(), scale: scaleTuple.optional(),
  }).refine(
    relation => relation.position !== undefined || relation.rotation !== undefined || relation.scale !== undefined,
    "An at relation sets at least one of position, rotation, or scale.",
  ),
  z.strictObject({ kind: z.literal("groundSnap"), floorY: boundedNumber.optional() }),
])

export const SpatialSolveGoalSchema = z.strictObject({
  entityKey: SpatialSolveEntityKeySchema,
  relations: z.array(SpatialSolveRelationSchema).min(1).max(SPATIAL_SOLVE_LIMITS.relationsPerGoal),
})

export const SpatialSolveBaseSchema = z.strictObject({
  transform: SpatialTransformSchema,
  bounds: SpatialSolveBoundsSchema.optional(),
})

export const SpatialSolveRequestSchema = z.strictObject({
  goals: z.array(SpatialSolveGoalSchema).min(1).max(SPATIAL_SOLVE_LIMITS.goals),
  bases: z.record(SpatialSolveAnchorKeySchema, SpatialSolveBaseSchema),
})

/** Goals-file variant: base entries may supply only the fields the scene cannot derive. */
export const SpatialSolveBasePatchSchema = z.strictObject({
  transform: SpatialTransformSchema.optional(),
  bounds: SpatialSolveBoundsSchema.optional(),
})
export const SpatialSolveGoalsFileSchema = z.strictObject({
  goals: z.array(SpatialSolveGoalSchema).min(1).max(SPATIAL_SOLVE_LIMITS.goals),
  bases: z.record(SpatialSolveAnchorKeySchema, SpatialSolveBasePatchSchema).optional(),
})

/**
 * Structural interfaces mirror the schemas rather than inferring from them —
 * recursive readonly mappers over the nested strict-object graph measurably
 * slow authored-source typechecks. `solveSpatialRelations` parses foreign
 * input through the schemas, so any drift fails compilation at the parse site.
 */
export type SpatialSolveRelation =
  | { readonly kind: "onTopOf"; readonly target: string }
  | {
    readonly kind: "nextTo"; readonly target: string
    readonly axis?: SpatialAxis | undefined; readonly side?: "before" | "after" | undefined; readonly gap?: number | undefined
  }
  | { readonly kind: "facing"; readonly target: string; readonly up?: Vec3 | undefined }
  | { readonly kind: "align"; readonly target: string; readonly axis: SpatialAxis; readonly edge?: "min" | "center" | "max" | undefined }
  | { readonly kind: "at"; readonly position?: Vec3 | undefined; readonly rotation?: Quaternion | undefined; readonly scale?: Vec3 | undefined }
  | { readonly kind: "groundSnap"; readonly floorY?: number | undefined }

export interface SpatialSolveGoal {
  readonly entityKey: string
  readonly relations: readonly SpatialSolveRelation[]
}
export interface SpatialSolveBase {
  readonly transform: Transform
  readonly bounds?: Bounds | undefined
}
export interface SpatialSolveRequest {
  readonly goals: readonly SpatialSolveGoal[]
  readonly bases: Readonly<Record<string, SpatialSolveBase>>
}
export interface SpatialSolveBasePatch {
  readonly transform?: Transform | undefined
  readonly bounds?: Bounds | undefined
}
export interface SpatialSolveGoalsFile {
  readonly goals: readonly SpatialSolveGoal[]
  readonly bases?: Readonly<Record<string, SpatialSolveBasePatch>> | undefined
}
export interface SpatialSolveResult {
  /** Solved transforms keyed by goal entity, in declared goal order. */
  readonly transforms: Readonly<Record<string, SpatialTransform>>
  readonly patch: SpatialScenePatchV1
}

interface SolveState {
  transform: Transform
  readonly bounds: Bounds | undefined
}

function parseSolveRequest(input: unknown): SpatialSolveRequest {
  let parsed: z.infer<typeof SpatialSolveRequestSchema>
  try {
    parsed = parseSpatialValue(SpatialSolveRequestSchema, input, "solve request")
  } catch (error) {
    if (error instanceof SpatialSceneError) throw new SpatialSolveError("invalid-data", error.message, error.path)
    throw error
  }
  if (Object.keys(parsed.bases).length > SPATIAL_SOLVE_LIMITS.bases) {
    throw new SpatialSolveError("invalid-data", `Solve bases are bounded to ${SPATIAL_SOLVE_LIMITS.bases} entries.`, "bases")
  }
  const request: SpatialSolveRequest = parsed
  return request
}

/**
 * Deterministic topological order preferring declared goal order. Edges point
 * from a goal to each goal entity its relations target; bases are static
 * anchors. Leftover goals form cycles — one concrete cycle is named.
 */
function orderGoals(goals: readonly SpatialSolveGoal[], dependencies: ReadonlyMap<string, ReadonlySet<string>>): readonly SpatialSolveGoal[] {
  const remaining = new Map(goals.map(goal => [goal.entityKey, goal]))
  const ordered: SpatialSolveGoal[] = []
  for (;;) {
    const ready = goals.find(goal => {
      if (!remaining.has(goal.entityKey)) return false
      for (const dependency of dependencies.get(goal.entityKey)!) if (remaining.has(dependency)) return false
      return true
    })
    if (ready === undefined) break
    remaining.delete(ready.entityKey)
    ordered.push(ready)
  }
  if (remaining.size === 0) return ordered
  // Extract one concrete cycle over the leftover dependency subgraph.
  const stack: string[] = []
  const seen = new Set<string>()
  let current: string | undefined = goals.find(goal => remaining.has(goal.entityKey))!.entityKey
  while (current !== undefined && remaining.has(current) && !seen.has(current)) {
    seen.add(current)
    stack.push(current)
    current = [...dependencies.get(current)!].find(dependency => remaining.has(dependency))
  }
  const from = current === undefined ? 0 : stack.indexOf(current)
  const cycle = stack.slice(from === -1 ? 0 : from)
  if (current !== undefined) cycle.push(current)
  throw new SpatialSolveError("relation-cycle", `Relation goals form a cycle: ${cycle.join(" → ")}.`, "goals")
}

function requireState(states: ReadonlyMap<string, SolveState>, key: string, path: string): SolveState {
  const state = states.get(key)
  if (state === undefined) {
    throw new SpatialSolveError("unknown-entity", `Relation target ${key} has no base and is not a solve goal.`, path)
  }
  return state
}

function requireBounds(state: SolveState, key: string, kind: string, path: string): Bounds {
  if (state.bounds === undefined) {
    throw new SpatialSolveError("bounds-unknown", `Entity ${key} has no bounds; ${kind} needs local bounds on every participant.`, path)
  }
  return state.bounds
}

function emitTransform(transform: Transform, path: string): SpatialTransform {
  try {
    return parseSpatialValue(SpatialTransformSchema, {
      position: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale],
    }, "solved transform")
  } catch (error) {
    if (error instanceof SpatialSceneError) throw new SpatialSolveError("relation-failed", error.message, path)
    throw error
  }
}

function applyRelation(
  relation: SpatialSolveRelation, entityKey: string, mover: SolveState,
  states: ReadonlyMap<string, SolveState>, path: string,
): Transform {
  try {
    switch (relation.kind) {
      case "onTopOf": {
        const target = requireState(states, relation.target, path)
        return onTopOf(
          requireBounds(mover, entityKey, relation.kind, path), mover.transform,
          requireBounds(target, relation.target, relation.kind, path), target.transform,
        )
      }
      case "nextTo": {
        const target = requireState(states, relation.target, path)
        return nextTo(
          requireBounds(mover, entityKey, relation.kind, path), mover.transform,
          requireBounds(target, relation.target, relation.kind, path), target.transform,
          {
            ...(relation.axis === undefined ? {} : { axis: relation.axis }),
            ...(relation.side === undefined ? {} : { side: relation.side }),
            ...(relation.gap === undefined ? {} : { gap: relation.gap }),
          },
        )
      }
      case "facing": {
        const target = requireState(states, relation.target, path)
        return facing(mover.transform, target.transform.position, relation.up ?? [0, 1, 0])
      }
      case "align": {
        const target = requireState(states, relation.target, path)
        const moverBounds = requireBounds(mover, entityKey, relation.kind, path)
        const targetBounds = requireBounds(target, relation.target, relation.kind, path)
        const entries: SpatialLayoutEntry[] = [
          { entityId: entityKey, transform: mover.transform, bounds: moverBounds },
          { entityId: relation.target, transform: target.transform, bounds: targetBounds },
        ]
        const [moved, anchorMoved] = align(entries, relation.axis, relation.edge ?? "center")
        // Transfer the anchor's would-be delta back to the mover: the result
        // places the mover's edge exactly on the anchor's edge while the named
        // target never moves. Off-axis components of the correction are zero.
        const correction = target.transform.position.map((value, index) => value - anchorMoved!.position[index]!)
        return emitTransform({
          position: moved!.position.map((value, index) => value + correction[index]!) as unknown as Vec3,
          rotation: moved!.rotation, scale: moved!.scale,
        }, path)
      }
      case "at":
        return emitTransform({
          position: relation.position ?? mover.transform.position,
          rotation: relation.rotation ?? mover.transform.rotation,
          scale: relation.scale ?? mover.transform.scale,
        }, path)
      case "groundSnap": {
        const bounds = requireBounds(mover, entityKey, relation.kind, path)
        const world = transformBounds(composeTransform(mover.transform), bounds)
        return groundSnap(mover.transform, mover.transform.position[1] - world.min[1], relation.floorY ?? 0)
      }
    }
  } catch (error) {
    if (error instanceof SpatialSolveError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new SpatialSolveError("relation-failed", `${relation.kind} failed: ${message}`, path)
  }
}

/**
 * Resolves declarative relation goals into transforms and a patch document.
 * The patch's `expectedSceneSha256` is `SPATIAL_SOLVE_PENDING_SCENE_SHA256`;
 * the caller replaces it with the scene's actual digest before `scene patch`.
 */
export function solveSpatialRelations(input: unknown): SpatialSolveResult {
  const request = parseSolveRequest(input)
  const goalKeys = new Set<string>()
  for (const [index, goal] of request.goals.entries()) {
    if (goalKeys.has(goal.entityKey)) {
      throw new SpatialSolveError("duplicate-goal", `Duplicate solve goal for ${goal.entityKey}.`, `goals[${index}]`)
    }
    goalKeys.add(goal.entityKey)
  }
  const states = new Map<string, SolveState>()
  for (const [key, base] of Object.entries(request.bases)) {
    states.set(key, { transform: base.transform, bounds: base.bounds })
  }
  const dependencies = new Map<string, ReadonlySet<string>>()
  for (const [index, goal] of request.goals.entries()) {
    if (!states.has(goal.entityKey)) {
      throw new SpatialSolveError("unknown-entity", `Goal entity ${goal.entityKey} has no base transform; add bases.${goal.entityKey}.`, `goals[${index}]`)
    }
    const required = new Set<string>()
    for (const [relationIndex, relation] of goal.relations.entries()) {
      if (!("target" in relation)) continue
      const path = `goals[${index}].relations[${relationIndex}].target`
      if (!states.has(relation.target) && !goalKeys.has(relation.target)) {
        throw new SpatialSolveError("unknown-entity", `Relation target ${relation.target} has no base and is not a solve goal.`, path)
      }
      if (goalKeys.has(relation.target)) required.add(relation.target)
    }
    dependencies.set(goal.entityKey, required)
  }
  for (const goal of orderGoals(request.goals, dependencies)) {
    const state = states.get(goal.entityKey)!
    const index = request.goals.indexOf(goal)
    for (const [relationIndex, relation] of goal.relations.entries()) {
      state.transform = applyRelation(relation, goal.entityKey, state, states, `goals[${index}].relations[${relationIndex}]`)
    }
  }
  const transforms: Record<string, SpatialTransform> = {}
  for (const goal of request.goals) {
    transforms[goal.entityKey] = emitTransform(states.get(goal.entityKey)!.transform, `transforms.${goal.entityKey}`)
  }
  const patch = parseSpatialValue(SpatialScenePatchV1Schema, {
    kind: "slopcamera.spatial-scene-patch",
    schemaVersion: 1,
    expectedSceneSha256: SPATIAL_SOLVE_PENDING_SCENE_SHA256,
    operations: request.goals.map(goal => ({ kind: "set-transform", entityId: goal.entityKey, transform: transforms[goal.entityKey] })),
  }, "solve patch")
  return deepFreezeJson({ transforms, patch })
}

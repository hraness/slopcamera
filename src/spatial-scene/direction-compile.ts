import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import { spatialEntityLocalBounds } from "./audit.js"
import { SpatialCameraRigSchema, type SpatialCameraRig } from "./camera-rig.js"
import {
  SpatialCameraIdSchema,
  SpatialDigestSchema,
  SpatialEntityIdSchema,
  SpatialSceneV1Schema,
  SpatialShotV1Schema,
  SpatialTimeUsSchema,
  type SpatialSceneV1,
  type SpatialShotV1,
} from "./contracts.js"
import {
  SPATIAL_DIRECTION_LIMITS,
  parseSpatialDirection,
  SpatialDirectionSchema,
  spatialDirectionSha256,
  type SpatialDirection,
} from "./direction.js"
import { SpatialPostProcessStepSchema } from "./effects.js"

type SpatialCameraCoverage = SpatialDirection["coverage"][number]
import { createSpatialEvaluationContext, evaluateSpatialSceneInContext } from "./evaluate.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"

/**
 * Deterministic direction compiler for Phase 12.
 *
 * Semantic direction compiles into inspectable proposals: complete camera rigs
 * and spatial shots where world state resolves them, plus explicitly unbound
 * performance and look descriptors. The compilation never applies itself:
 * `verified` is always false, every unbound slot is named in
 * `unresolvedIntents`, and derived identities stay separate from sources.
 */

export const SPATIAL_DIRECTION_COMPILER_ID = "slopcamera.spatial-direction-compiler@v1"

export const SPATIAL_DIRECTION_COMPILATION_LIMITS = Object.freeze({
  advisories: 256,
  unresolvedIntents: 256,
  checks: 512,
})

export const SpatialDirectionAdvisoryCodeSchema = z.enum([
  "unresolved-reference",
  "stale-digest",
  "defaulted-camera",
  "missing-camera",
  "bounds-unknown",
  "interval-outside-scene",
  "coverage-ungrouped",
])
export type SpatialDirectionAdvisoryCode = z.infer<typeof SpatialDirectionAdvisoryCodeSchema>

export const SpatialDirectionAdvisorySchema = z.strictObject({
  code: SpatialDirectionAdvisoryCodeSchema,
  referenceId: z.string().min(1).max(128).optional(),
  detail: z.string().min(1).max(240),
})
export type SpatialDirectionAdvisory = Readonly<z.infer<typeof SpatialDirectionAdvisorySchema>>

export const SpatialUnresolvedIntentDomainSchema = z.enum(["performance", "camera", "shot", "look"])
export const SpatialUnresolvedIntentSchema = z.strictObject({
  intentId: z.string().min(1).max(96).regex(/^prop_[a-f0-9]{16}$/u),
  domain: SpatialUnresolvedIntentDomainSchema,
  referenceId: z.string().min(1).max(128),
  slot: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/u),
  detail: z.string().min(1).max(240),
})
export type SpatialUnresolvedIntent = Readonly<z.infer<typeof SpatialUnresolvedIntentSchema>>

const unresolvedSlot = (intentId: string, domain: SpatialUnresolvedIntent["domain"], referenceId: string, slot: string, detail: string): SpatialUnresolvedIntent =>
  deepFreezeJson({ intentId, domain, referenceId, slot, detail })

export const SpatialPerformanceClipKindSchema = z.enum([
  "idle",
  "walk-cycle",
  "run-cycle",
  "turn",
  "gesture",
  "interact",
  "expression",
])
export type SpatialPerformanceClipKind = z.infer<typeof SpatialPerformanceClipKindSchema>

export const SpatialPerformanceProposalSchema = z.strictObject({
  proposalId: z.string().min(1).max(96).regex(/^prop_[a-f0-9]{16}$/u),
  actionId: z.string().min(1).max(64),
  characterId: z.string().min(1).max(128),
  action: SpatialDirectionSchema.shape.actions.element.shape.action,
  clipKind: SpatialPerformanceClipKindSchema,
  startUs: SpatialTimeUsSchema,
  endUs: SpatialTimeUsSchema,
  characterEntityId: SpatialEntityIdSchema.optional(),
  targetEntityId: SpatialEntityIdSchema.optional(),
  unresolved: z.array(z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/u)).min(1).max(16),
})
export type SpatialPerformanceProposal = Readonly<z.infer<typeof SpatialPerformanceProposalSchema>>

export const SpatialLookProposalSchema = z.strictObject({
  proposalId: z.string().min(1).max(96).regex(/^prop_[a-f0-9]{16}$/u),
  lookId: z.string().min(1).max(64),
  startUs: SpatialTimeUsSchema,
  endUs: SpatialTimeUsSchema,
  lighting: z.string().min(1).max(128),
  atmosphere: z.string().min(1).max(128),
  unresolved: z.array(z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/u)).min(1).max(16),
  suggestedLightingPreset: z.string().min(1).max(64).optional(),
  suggestedMaterialPalette: z.string().min(1).max(64).optional(),
  suggestedPostProcess: z.array(SpatialPostProcessStepSchema).max(16).optional(),
})
export type SpatialLookProposal = Readonly<z.infer<typeof SpatialLookProposalSchema>>

export const SpatialDirectionProposalsSchema = z.strictObject({
  performance: z.array(SpatialPerformanceProposalSchema).max(SPATIAL_DIRECTION_LIMITS.actions),
  cameraRigs: z.array(SpatialCameraRigSchema).max(SPATIAL_DIRECTION_LIMITS.coverage),
  shots: z.array(SpatialShotV1Schema).max(SPATIAL_DIRECTION_LIMITS.coverage),
  lookIntents: z.array(SpatialLookProposalSchema).max(SPATIAL_DIRECTION_LIMITS.looks),
})

export const SpatialDirectionCompilationSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-direction-compilation"),
  schemaVersion: z.literal(1),
  directionSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  compilerVersion: z.literal(SPATIAL_DIRECTION_COMPILER_ID),
  verified: z.literal(false),
  cameraId: SpatialCameraIdSchema.optional(),
  proposals: SpatialDirectionProposalsSchema,
  advisories: z.array(SpatialDirectionAdvisorySchema).max(SPATIAL_DIRECTION_COMPILATION_LIMITS.advisories),
  unresolvedIntents: z.array(SpatialUnresolvedIntentSchema).max(SPATIAL_DIRECTION_COMPILATION_LIMITS.unresolvedIntents),
})
export type SpatialDirectionCompilation = Readonly<z.infer<typeof SpatialDirectionCompilationSchema>>

export const SpatialDirectionCheckFindingSchema = z.strictObject({
  code: SpatialDirectionAdvisoryCodeSchema,
  severity: z.enum(["error", "warning"]),
  referenceId: z.string().min(1).max(128).optional(),
  detail: z.string().min(1).max(240),
})
export type SpatialDirectionCheckFinding = Readonly<z.infer<typeof SpatialDirectionCheckFindingSchema>>

export const SpatialDirectionCheckReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-direction-check"),
  schemaVersion: z.literal(1),
  directionSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  findings: z.array(SpatialDirectionCheckFindingSchema).max(SPATIAL_DIRECTION_COMPILATION_LIMITS.checks),
  counts: z.strictObject({
    beats: z.number().int().min(0),
    actions: z.number().int().min(0),
    coverage: z.number().int().min(0),
    looks: z.number().int().min(0),
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
  }),
})
export type SpatialDirectionCheckReport = Readonly<z.infer<typeof SpatialDirectionCheckReportSchema>>

export function spatialDirectionCompilationSha256(compilation: SpatialDirectionCompilation): string {
  return spatialValueSha256(compilation)
}

const proposalId = (domain: string, referenceId: string): string =>
  `prop_${spatialValueSha256({ domain: `slopcamera.direction-proposal.v1.${domain}`, referenceId }).slice(0, 16)}`

/** Direction references are semantic ids; scene entities are entity_-prefixed. */
function resolveEntityId(scene: SpatialSceneV1, referenceId: string): string | undefined {
  const ids = new Set(scene.entities.map((entity) => entity.entityId))
  if (ids.has(referenceId)) return referenceId
  const prefixed = `entity_${referenceId}`
  return ids.has(prefixed) ? prefixed : undefined
}

const FRAMING_DISTANCE_M: Readonly<Record<SpatialCameraCoverage["framing"], number>> = {
  "insert": 0.5,
  "extreme-close-up": 0.8,
  "close-up": 1.4,
  "medium-close-up": 2.4,
  "medium": 4,
  "medium-wide": 6.5,
  "wide": 11,
  "extreme-wide": 20,
  "over-shoulder": 1.8,
}

const CLIP_KIND_BY_ACTION: Readonly<Record<SpatialPerformanceProposal["action"], SpatialPerformanceClipKind>> = {
  idle: "idle",
  walk: "walk-cycle",
  run: "run-cycle",
  turn: "turn",
  gesture: "gesture",
  interact: "interact",
  morph: "expression",
}

const normalize = (v: readonly [number, number, number]): [number, number, number] => {
  const n = Math.hypot(v[0], v[1], v[2])
  return n < 1e-9 ? [0, 0, -1] : [v[0] / n, v[1] / n, v[2] / n]
}
const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
]
function quaternionFromBasis(x: readonly number[], y: readonly number[], z: readonly number[]): [number, number, number, number] {
  const m00 = x[0]!, m01 = y[0]!, m02 = z[0]!, m10 = x[1]!, m11 = y[1]!, m12 = z[1]!, m20 = x[2]!, m21 = y[2]!, m22 = z[2]!, trace = m00 + m11 + m22
  let q: [number, number, number, number]
  if (trace > 0) { const s = 2 * Math.sqrt(trace + 1); q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4] }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s] }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 + m20) / s] }
  else { const s = 2 * Math.sqrt(1 + m22 - m11 - m00); q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s] }
  const n = Math.hypot(...q); return q.map(v => v / n) as [number, number, number, number]
}
function lookAtQuaternion(position: readonly number[], target: readonly number[]): [number, number, number, number] {
  const forward = [target[0]! - position[0]!, target[1]! - position[1]!, target[2]! - position[2]!] as const
  if (Math.hypot(...forward) < 1e-9) throw new SpatialSceneError("invalid-data", "Camera and look-at target must not coincide.")
  const f = normalize(forward as [number, number, number]), up = Math.abs(f[1]!) > 0.999999 ? [0, 0, 1] : [0, 1, 0]
  const right = normalize(cross(f, up) as [number, number, number]), correctedUp = cross(right, f)
  return quaternionFromBasis(right, correctedUp, [-f[0], -f[1], -f[2]])
}

const shakeSeed = (coverageId: string): number => {
  let seed = 0
  const digest = spatialValueSha256({ domain: "slopcamera.direction-shake-seed.v1", coverageId })
  for (let index = 0; index < 8; index += 1) seed = (seed * 16 + Number.parseInt(digest[index]!, 16)) >>> 0
  return seed
}

interface ResolvedSubject {
  readonly entityId: string | undefined
  readonly position: [number, number, number]
  readonly positionEnd: [number, number, number]
  readonly radiusM: number
}

interface CompilationContext {
  readonly direction: SpatialDirection
  readonly scene: SpatialSceneV1
  readonly sceneSha256: string
  readonly cameraId: string | undefined
  readonly advisories: SpatialDirectionAdvisory[]
  readonly unresolvedIntents: SpatialUnresolvedIntent[]
}

const advisory = (code: SpatialDirectionAdvisoryCode, detail: string, referenceId?: string): SpatialDirectionAdvisory =>
  deepFreezeJson(referenceId === undefined ? { code, detail } : { code, referenceId, detail })

function resolveSubject(
  context: CompilationContext,
  coverage: SpatialCameraCoverage,
  evaluation: ReturnType<typeof createSpatialEvaluationContext> | undefined,
): ResolvedSubject | undefined {
  if (coverage.subjectId === undefined || evaluation === undefined || context.cameraId === undefined) return undefined
  const entityId = resolveEntityId(context.scene, coverage.subjectId)
  if (entityId === undefined) {
    context.advisories.push(advisory("unresolved-reference", `Coverage ${coverage.id} subject ${coverage.subjectId} is not a scene entity.`, coverage.id))
    return undefined
  }
  const positionAt = (timeUs: number): [number, number, number] | undefined => {
    const clamped = Math.min(Math.max(timeUs, 0), context.scene.durationUs)
    const snapshot = evaluateSpatialSceneInContext(evaluation, { cameraId: context.cameraId!, timeUs: clamped })
    const evaluated = snapshot.entities.find((item) => item.entity.entityId === entityId)
    if (evaluated === undefined) return undefined
    return [evaluated.worldMatrix[12]!, evaluated.worldMatrix[13]!, evaluated.worldMatrix[14]!]
  }
  const position = positionAt(coverage.startUs)
  const positionEnd = positionAt(coverage.endUs)
  if (position === undefined || positionEnd === undefined) {
    context.advisories.push(advisory("unresolved-reference", `Coverage ${coverage.id} subject ${coverage.subjectId} is absent from evaluated state.`, coverage.id))
    return undefined
  }
  const entity = context.scene.entities.find((item) => item.entityId === entityId)!
  const enclosure = spatialEntityLocalBounds(entity, {})
  let radiusM = 1
  if (enclosure.status === "bounded") {
    const { min, max } = enclosure.bounds
    radiusM = Math.min(Math.max(Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2, 0.000001), 1_000_000)
  } else {
    context.advisories.push(advisory("bounds-unknown", `Coverage ${coverage.id} subject ${entityId} has unbounded geometry (${enclosure.reason}); radius defaulted to 1m.`, coverage.id))
  }
  return { entityId, position, positionEnd, radiusM }
}

function cameraOffset(coverage: SpatialCameraCoverage, subject: ResolvedSubject | undefined): [number, number, number] {
  const distance = FRAMING_DISTANCE_M[coverage.framing]!
  const base = subject?.position ?? [0, 1, 0]
  const lateral = coverage.screenDirection === "left" ? -distance * 0.6 : coverage.screenDirection === "right" ? distance * 0.6 : 0
  const height = subject === undefined ? 1.6 : Math.min(Math.max(subject.radiusM, 0.4), 8)
  return [base[0] + lateral, base[1] + height, base[2] - distance]
}

function compileCoverageRig(context: CompilationContext, coverage: SpatialCameraCoverage, subject: ResolvedSubject | undefined): SpatialCameraRig | undefined {
  const cameraId = context.cameraId
  if (cameraId === undefined) return undefined
  const base = { cameraId, startUs: coverage.startUs, endUs: coverage.endUs } as const
  const targetPosition = subject?.position ?? [0, 1, 0]
  const target = subject === undefined
    ? { position: [0, 1, 0] as [number, number, number], radiusM: 1 }
    : { entityId: subject.entityId, position: targetPosition, radiusM: subject.radiusM }
  const position = cameraOffset(coverage, subject)
  const distance = FRAMING_DISTANCE_M[coverage.framing]!
  try {
    switch (coverage.rigKind) {
      case "tripod":
        return SpatialCameraRigSchema.parse({ ...base, kind: "tripod", pose: { position, rotation: lookAtQuaternion(position, targetPosition) }, target })
      case "handheld":
        return SpatialCameraRigSchema.parse({
          ...base, kind: "handheld",
          pose: { position, rotation: lookAtQuaternion(position, targetPosition) },
          target, shake: { seed: shakeSeed(coverage.id), amplitudeM: 0.05, frequencyHz: 1.5, layers: 2 },
        })
      case "dolly": {
        const toward: [number, number, number] = normalize([targetPosition[0] - position[0], 0, targetPosition[2] - position[2]])
        const from: [number, number, number] = [position[0] + toward[0] * distance * 0.5, position[1], position[2] + toward[2] * distance * 0.5]
        return SpatialCameraRigSchema.parse({ ...base, kind: "dolly", from, to: position, target })
      }
      case "crane":
        return SpatialCameraRigSchema.parse({ ...base, kind: "crane", from: [position[0], position[1] + Math.min(4, distance), position[2]], to: position, target })
      case "orbit":
        return SpatialCameraRigSchema.parse({
          ...base, kind: "orbit",
          center: targetPosition, radiusM: Math.max(distance, subject?.radiusM ?? 1),
          startAngleRad: Math.PI, endAngleRad: Math.PI * 2, heightM: subject === undefined ? 1.6 : Math.min(Math.max(subject.radiusM, 0.4), 8),
          target,
        })
      case "rail": {
        const half = Math.max(distance * 0.5, 0.5)
        return SpatialCameraRigSchema.parse({
          ...base, kind: "rail",
          points: [[position[0] - half, position[1], position[2]], position, [position[0] + half, position[1], position[2]]],
          target,
        })
      }
      case "chase":
        return SpatialCameraRigSchema.parse({
          ...base, kind: "chase", target,
          offset: [0, Math.min(Math.max(subject?.radiusM ?? 1, 0.4), 8), -distance],
          ...(subject === undefined ? {} : { toTarget: subject.positionEnd }),
          shake: { seed: shakeSeed(coverage.id), amplitudeM: 0.03, frequencyHz: 2, layers: 1 },
        })
      case "target-tracking": {
        const half = Math.max(distance * 0.5, 0.5)
        return SpatialCameraRigSchema.parse({
          ...base, kind: "target-tracking",
          from: [position[0] - half, position[1], position[2]], to: [position[0] + half, position[1], position[2]],
          target, ...(subject === undefined ? {} : { targetEnd: subject.positionEnd }),
        })
      }
    }
    throw new SpatialSceneError("invalid-data", `Unsupported coverage rig kind ${coverage.rigKind}.`, "coverage.rigKind")
  } catch (error) {
    context.advisories.push(advisory("unresolved-reference", `Coverage ${coverage.id} rig ${coverage.rigKind} failed deterministic construction: ${error instanceof Error ? error.message : String(error)}`, coverage.id))
    return undefined
  }
}

const compileOptionsSchema = z.strictObject({
  direction: z.unknown(),
  scene: z.unknown(),
  cameraId: z.string().min(1).max(128).optional(),
})

/**
 * Compiles direction into one immutable proposal document. Direction and scene
 * parse from `unknown`; identity derives only from canonical inputs, so equal
 * inputs always compile to equal output.
 */
export function compileSpatialDirection(input: unknown): SpatialDirectionCompilation {
  const options = parseSpatialValue(compileOptionsSchema, input, "direction compilation")
  const direction = parseSpatialDirection(options.direction)
  const scene = parseSpatialValue(SpatialSceneV1Schema, options.scene, "scene")
  const sceneSha256 = spatialValueSha256(scene)
  const advisories: SpatialDirectionAdvisory[] = []
  const unresolvedIntents: SpatialUnresolvedIntent[] = []

  if (direction.projectDigest !== sceneSha256) {
    advisories.push(advisory("stale-digest", `Direction projectDigest ${direction.projectDigest} does not match the scene digest ${sceneSha256}.`))
  }
  if (resolveEntityId(scene, direction.entityId) === undefined) {
    advisories.push(advisory("unresolved-reference", `Directed entity ${direction.entityId} is not a scene entity.`, direction.entityId))
  }

  let cameraId: string | undefined
  if (options.cameraId !== undefined) {
    cameraId = scene.cameras.find((camera) => camera.cameraId === options.cameraId)?.cameraId
    if (cameraId === undefined) throw new SpatialSceneError("not-found", `Unknown camera ${options.cameraId}.`, "cameraId")
  } else if (scene.cameras.length === 1) {
    cameraId = scene.cameras[0]!.cameraId
  } else if (scene.cameras.length > 1) {
    cameraId = [...scene.cameras].map((camera) => camera.cameraId).sort()[0]
    advisories.push(advisory("defaulted-camera", `Scene declares ${scene.cameras.length} cameras; coverage defaulted to ${cameraId}. Pass cameraId explicitly to silence this advisory.`))
  } else if (direction.coverage.length > 0) {
    advisories.push(advisory("missing-camera", "Scene declares no cameras; coverage cannot resolve rigs or shots."))
  }

  const context: CompilationContext = { direction, scene, sceneSha256, cameraId, advisories, unresolvedIntents }
  const evaluation = cameraId === undefined ? undefined : createSpatialEvaluationContext(scene)

  const checkInterval = (id: string, endUs: number): void => {
    if (endUs > scene.durationUs) {
      advisories.push(advisory("interval-outside-scene", `Entry ${id} ends at ${endUs}us beyond scene duration ${scene.durationUs}us.`, id))
    }
  }

  const performance: SpatialPerformanceProposal[] = []
  for (const action of direction.actions) {
    checkInterval(action.id, action.endUs)
    const characterEntityId = resolveEntityId(scene, action.characterId)
    const targetEntityId = action.targetId === undefined ? undefined : resolveEntityId(scene, action.targetId)
    if (characterEntityId === undefined) {
      advisories.push(advisory("unresolved-reference", `Action ${action.id} character ${action.characterId} is not a scene entity.`, action.id))
    }
    if (action.targetId !== undefined && targetEntityId === undefined) {
      advisories.push(advisory("unresolved-reference", `Action ${action.id} target ${action.targetId} is not a scene entity.`, action.id))
    }
    const intentId = proposalId("performance", action.id)
    const unresolved = ["clip-digest", "rig-digest", "mapping-digest"]
    if (characterEntityId === undefined) unresolved.push("character-entity")
    if (action.targetId !== undefined && targetEntityId === undefined) unresolved.push("target-entity")
    for (const slot of unresolved) {
      unresolvedIntents.push(unresolvedSlot(intentId, "performance", action.id, slot, `Action ${action.id} cannot bind ${slot}; compile and admit a real clip, rig, and humanoid mapping first.`))
    }
    performance.push(deepFreezeJson({
      proposalId: intentId,
      actionId: action.id,
      characterId: action.characterId,
      action: action.action,
      clipKind: CLIP_KIND_BY_ACTION[action.action],
      startUs: action.startUs,
      endUs: action.endUs,
      ...(characterEntityId === undefined ? {} : { characterEntityId }),
      ...(targetEntityId === undefined ? {} : { targetEntityId }),
      unresolved,
    }))
  }

  const beats = direction.beats.map((beat) => ({ id: beat.id, startUs: beat.startUs, endUs: beat.endUs }))
  for (const beat of direction.beats) checkInterval(beat.id, beat.endUs)

  const cameraRigs: SpatialCameraRig[] = []
  const shots: SpatialShotV1[] = []
  for (const coverage of direction.coverage) {
    checkInterval(coverage.id, coverage.endUs)
    if (beats.length > 0 && !beats.some((beat) => beat.startUs <= coverage.startUs && beat.endUs >= coverage.endUs)) {
      advisories.push(advisory("coverage-ungrouped", `Coverage ${coverage.id} is not contained in any dramatic beat.`, coverage.id))
    }
    const subject = resolveSubject(context, coverage, evaluation)
    const rig = compileCoverageRig(context, coverage, subject)
    if (rig !== undefined) {
      cameraRigs.push(rig)
      unresolvedIntents.push(unresolvedSlot(proposalId("camera", coverage.id), "camera", coverage.id, "camera-track", `Coverage ${coverage.id} rig is a proposal; compile it to a camera track before admission.`))
    } else if (cameraId !== undefined) {
      unresolvedIntents.push(unresolvedSlot(proposalId("camera", coverage.id), "camera", coverage.id, "rig", `Coverage ${coverage.id} could not resolve a deterministic ${coverage.rigKind} rig.`))
    }
    if (cameraId !== undefined) {
      const shotId = `shot_${spatialValueSha256({ domain: "slopcamera.direction-shot.v1", coverageId: coverage.id }).slice(0, 16)}`
      shots.push(deepFreezeJson(SpatialShotV1Schema.parse({
        shotId, sceneSha256, cameraId,
        range: { startUs: coverage.startUs, endUs: coverage.endUs },
        sceneStartUs: coverage.startUs,
        playback: "once",
        overrides: [],
        ...(rig !== undefined && (rig.kind === "tripod" || rig.kind === "handheld") ? { cameraPoseOverride: rig.pose } : {}),
      })))
      unresolvedIntents.push(unresolvedSlot(proposalId("shot", coverage.id), "shot", coverage.id, "render-plan", `Shot ${shotId} is unverified; bind a render plan and audit evidence before admission.`))
    }
  }

  const lookIntents: SpatialLookProposal[] = []
  for (const look of direction.looks) {
    checkInterval(look.id, look.endUs)
    const intentId = proposalId("look", look.id)
    for (const slot of ["material-lighting", "post-process"] as const) {
      unresolvedIntents.push(unresolvedSlot(intentId, "look", look.id, slot, `Look ${look.id} carries authored text; compile ${slot} documents before admission.`))
    }
    lookIntents.push(deepFreezeJson({
      proposalId: intentId, lookId: look.id, startUs: look.startUs, endUs: look.endUs,
      lighting: look.lighting, atmosphere: look.atmosphere,
      unresolved: ["material-lighting", "post-process"],
    }))
  }

  return deepFreezeJson(SpatialDirectionCompilationSchema.parse({
    kind: "slopcamera.spatial-direction-compilation",
    schemaVersion: 1,
    directionSha256: spatialDirectionSha256(direction),
    sceneSha256,
    compilerVersion: SPATIAL_DIRECTION_COMPILER_ID,
    verified: false,
    ...(cameraId === undefined ? {} : { cameraId }),
    proposals: { performance, cameraRigs, shots, lookIntents },
    advisories,
    unresolvedIntents,
  }))
}

const checkOptionsSchema = z.strictObject({
  direction: z.unknown(),
  scene: z.unknown(),
})

/**
 * Validates a direction document against one scene without compiling. Reports
 * stale digests, unresolved references, and intervals outside scene duration as
 * errors; weaker structural notes as warnings.
 */
export function checkSpatialDirection(input: unknown): SpatialDirectionCheckReport {
  const options = parseSpatialValue(checkOptionsSchema, input, "direction check")
  const direction = parseSpatialDirection(options.direction)
  const scene = parseSpatialValue(SpatialSceneV1Schema, options.scene, "scene")
  const sceneSha256 = spatialValueSha256(scene)
  const findings: SpatialDirectionCheckFinding[] = []
  const finding = (code: SpatialDirectionAdvisoryCode, severity: "error" | "warning", detail: string, referenceId?: string): void => {
    findings.push(deepFreezeJson(referenceId === undefined ? { code, severity, detail } : { code, severity, referenceId, detail }))
  }

  if (direction.projectDigest !== sceneSha256) {
    finding("stale-digest", "error", `Direction projectDigest ${direction.projectDigest} does not match scene digest ${sceneSha256}; re-author or rebind the direction.`)
  }
  if (resolveEntityId(scene, direction.entityId) === undefined) {
    finding("unresolved-reference", "error", `Directed entity ${direction.entityId} is not a scene entity.`, direction.entityId)
  }
  if (scene.cameras.length === 0 && direction.coverage.length > 0) {
    finding("missing-camera", "error", "Direction declares camera coverage but the scene declares no cameras.")
  }
  for (const action of direction.actions) {
    if (resolveEntityId(scene, action.characterId) === undefined) {
      finding("unresolved-reference", "error", `Action ${action.id} character ${action.characterId} is not a scene entity.`, action.id)
    }
    if (action.targetId !== undefined && resolveEntityId(scene, action.targetId) === undefined) {
      finding("unresolved-reference", "error", `Action ${action.id} target ${action.targetId} is not a scene entity.`, action.id)
    }
    if (action.endUs > scene.durationUs) {
      finding("interval-outside-scene", "error", `Action ${action.id} ends at ${action.endUs}us beyond scene duration ${scene.durationUs}us.`, action.id)
    }
  }
  for (const coverage of direction.coverage) {
    if (coverage.subjectId !== undefined && resolveEntityId(scene, coverage.subjectId) === undefined) {
      finding("unresolved-reference", "error", `Coverage ${coverage.id} subject ${coverage.subjectId} is not a scene entity.`, coverage.id)
    }
    if (coverage.endUs > scene.durationUs) {
      finding("interval-outside-scene", "error", `Coverage ${coverage.id} ends at ${coverage.endUs}us beyond scene duration ${scene.durationUs}us.`, coverage.id)
    }
  }
  const beats = direction.beats.map((beat) => ({ id: beat.id, startUs: beat.startUs, endUs: beat.endUs }))
  for (const beat of direction.beats) {
    if (beat.endUs > scene.durationUs) {
      finding("interval-outside-scene", "error", `Beat ${beat.id} ends at ${beat.endUs}us beyond scene duration ${scene.durationUs}us.`, beat.id)
    }
  }
  if (beats.length > 0) {
    for (const coverage of direction.coverage) {
      if (!beats.some((beat) => beat.startUs <= coverage.startUs && beat.endUs >= coverage.endUs)) {
        finding("coverage-ungrouped", "warning", `Coverage ${coverage.id} is not contained in any dramatic beat.`, coverage.id)
      }
    }
  }
  for (const look of direction.looks) {
    if (look.endUs > scene.durationUs) {
      finding("interval-outside-scene", "error", `Look ${look.id} ends at ${look.endUs}us beyond scene duration ${scene.durationUs}us.`, look.id)
    }
  }

  const errors = findings.filter((item) => item.severity === "error").length
  return deepFreezeJson(SpatialDirectionCheckReportSchema.parse({
    kind: "slopcamera.spatial-direction-check",
    schemaVersion: 1,
    directionSha256: spatialDirectionSha256(direction),
    sceneSha256,
    findings,
    counts: {
      beats: direction.beats.length,
      actions: direction.actions.length,
      coverage: direction.coverage.length,
      looks: direction.looks.length,
      errors,
      warnings: findings.length - errors,
    },
  }))
}

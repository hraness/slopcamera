import { z } from "zod"
import { HUMANOID_BONE_NAMES } from "./character.js"
import {
  SPATIAL_SCENE_LIMITS,
  SpatialDigestSchema,
  SpatialQuaternionSchema,
  SpatialTimeUsSchema,
  SpatialTransformSchema,
  SpatialVec3Schema,
} from "./contracts.js"
import { SpatialPerformanceDirectiveSchema, type SpatialPerformanceDirective } from "./performance.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { parseSpatialValue, spatialValueSha256, SpatialSceneError } from "./identity.js"
import type { JsonValue } from "../code/contracts.js"
import type { SpatialBehaviorFn } from "./behavior-fns.js"

// ------------------------------------------------------------------ limits ---

export const SPATIAL_BEHAVIOR_TRACE_LIMITS = Object.freeze({
  emitted: 16_384,
  channels: 64,
  clipChannels: 16,
  clipValues: 64,
  attachments: 8,
  trajectories: 8,
  directives: 4_096,
  unresolvedIntents: 256,
})

// ----------------------------------------------------------------- emitted ---

const channelName = z.string().regex(/^[a-z][a-z0-9_.-]{0,62}$/u)

/** One emitted channel record — the vocabulary organisms surface at bake. */
export const SpatialBehaviorEmittedSchema = z.strictObject({
  tUs: SpatialTimeUsSchema,
  channel: channelName,
  value: z.unknown(),
})
export type SpatialBehaviorEmitted = Readonly<z.infer<typeof SpatialBehaviorEmittedSchema>>

/** Validates one organism output value as a bounded emitted-record array. */
export function parseSpatialBehaviorEmissions(input: unknown, what: string): SpatialBehaviorEmitted[] {
  return parseSpatialValue(z.array(SpatialBehaviorEmittedSchema).max(SPATIAL_BEHAVIOR_TRACE_LIMITS.emitted), input, what)
}

// -------------------------------------------------------------- channel map ---

const humanoidBone = z.enum(HUMANOID_BONE_NAMES)
const bindingChannel = channelName
const clipValue = z.string().min(1).max(64)

/**
 * Host-supplied bindings from emitted channels to performance-directive
 * assets. Clip digests, prop identities and attachment bones are
 * scene-admission concerns, so they live outside the portable behavior doc:
 * the map rides the bake request. Channels absent from the map stay
 * trace-only; a mapped channel missing a sub-binding reports an unresolved
 * intent rather than fabricating identity.
 */
export const SpatialBehaviorChannelMapSchema = z.strictObject({
  clips: z.record(
    bindingChannel,
    z.record(clipValue, z.strictObject({
      clipDigest: SpatialDigestSchema,
      durationUs: SpatialTimeUsSchema.refine((value) => value > 0, "Clip duration must be positive."),
    })),
  ).refine(
    (clips) => Object.keys(clips).length <= SPATIAL_BEHAVIOR_TRACE_LIMITS.clipChannels
      && Object.values(clips).every((values) => Object.keys(values).length <= SPATIAL_BEHAVIOR_TRACE_LIMITS.clipValues),
    { message: `At most ${SPATIAL_BEHAVIOR_TRACE_LIMITS.clipChannels} clip channels with ${SPATIAL_BEHAVIOR_TRACE_LIMITS.clipValues} values each.` },
  ).optional(),
  attachments: z.array(z.strictObject({
    attachChannel: bindingChannel,
    releaseChannel: bindingChannel,
    propId: z.string().min(1).max(128),
    bone: humanoidBone,
    localOffset: SpatialTransformSchema,
  })).max(SPATIAL_BEHAVIOR_TRACE_LIMITS.attachments).optional(),
  trajectories: z.array(bindingChannel).max(SPATIAL_BEHAVIOR_TRACE_LIMITS.trajectories).optional(),
}).superRefine((map, context) => {
  const attachChannels = new Set<string>()
  for (const [index, attachment] of (map.attachments ?? []).entries()) {
    if (attachChannels.has(attachment.attachChannel)) {
      context.addIssue({ code: "custom", path: ["attachments", index, "attachChannel"], message: `Attach channel ${attachment.attachChannel} is bound twice.` })
    }
    attachChannels.add(attachment.attachChannel)
  }
  for (const name of map.trajectories ?? []) {
    if (map.clips !== undefined && name in map.clips) {
      context.addIssue({ code: "custom", path: ["trajectories"], message: `Channel ${name} is bound as both clip and trajectory.` })
    }
  }
})
export type SpatialBehaviorChannelMap = Readonly<z.infer<typeof SpatialBehaviorChannelMapSchema>>

export function parseSpatialBehaviorChannelMap(input: unknown): SpatialBehaviorChannelMap {
  return deepFreezeJson(parseSpatialValue(SpatialBehaviorChannelMapSchema, input, "behavior channel map"))
}

// ----------------------------------------------------------- unresolved ----

export const SpatialBehaviorUnresolvedIntentSchema = z.strictObject({
  intentId: z.string().regex(/^prop_[a-f0-9]{16}$/u),
  domain: z.literal("behavior"),
  referenceId: z.string().min(1).max(128),
  slot: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/u),
  detail: z.string().min(1).max(240),
})
export type SpatialBehaviorUnresolvedIntent = Readonly<z.infer<typeof SpatialBehaviorUnresolvedIntentSchema>>

const intentId = (domain: string, reference: string): string =>
  `prop_${spatialValueSha256({ domain: `slopcamera.behavior-intent.${domain}`, reference }).slice(0, 16)}`

const unresolved = (domain: string, referenceId: string, slot: string, detail: string): SpatialBehaviorUnresolvedIntent =>
  deepFreezeJson({ intentId: intentId(domain, `${referenceId}/${slot}`), domain: "behavior", referenceId, slot, detail })

// ------------------------------------------------------------ mapper --------

const emittedValueKey = (value: unknown): string => {
  try {
    return spatialValueSha256(value as JsonValue)
  } catch {
    return "\u0000unrepresentable"
  }
}

const directiveId = (domain: string, parts: readonly (string | number)[]): string =>
  `dir_${domain}_${spatialValueSha256({ domain: `slopcamera.behavior-directive.${domain}`, parts }).slice(0, 12)}`

export interface SpatialBehaviorDirectiveCompilation {
  readonly directives: readonly SpatialPerformanceDirective[]
  readonly unresolvedIntents: readonly SpatialBehaviorUnresolvedIntent[]
}

/**
 * Maps a validated emitted trace to performance directives under a channel
 * map. Clip channels emit contiguous same-value runs as clip directives;
 * attach/release channels pair into prop bindings; trajectory channels
 * accumulate waypoint values into one root-trajectory directive. Unmapped
 * channels contribute nothing — their records stay trace evidence only.
 */
export function compileSpatialBehaviorDirectives(input: {
  readonly emitted: readonly SpatialBehaviorEmitted[]
  readonly channelMap?: SpatialBehaviorChannelMap
  readonly rangeUs: { readonly startUs: number; readonly endUs: number }
}): SpatialBehaviorDirectiveCompilation {
  const { emitted, channelMap, rangeUs } = input
  const directives: SpatialPerformanceDirective[] = []
  const unresolvedIntents: SpatialBehaviorUnresolvedIntent[] = []
  const map = channelMap ?? {}

  const sorted = [...emitted].sort((a, b) => a.tUs - b.tUs || a.channel.localeCompare(b.channel))

  const clipChannels = Object.keys(map.clips ?? {})
  for (const channel of clipChannels) {
    const bindings = map.clips![channel]!
    const records = sorted.filter((record) => record.channel === channel)
    if (records.length === 0) continue
    let runStart = records[0]!.tUs
    let runValue = emittedValueKey(records[0]!.value)
    let runLabel = records[0]!.value
    const flush = (endUs: number): void => {
      const label = typeof runLabel === "string" ? runLabel : undefined
      const binding = label === undefined ? undefined : bindings[label]
      if (binding === undefined) {
        unresolvedIntents.push(unresolved("clip", `${channel}:${label ?? "non-string"}`, "clip-binding",
          `Channel ${channel} emitted ${label === undefined ? "a non-string value" : `value ${label}`} with no clip binding at ${runStart}us.`))
        return
      }
      const intervalUs = endUs - runStart
      if (intervalUs <= 0) return
      directives.push(deepFreezeJson(SpatialPerformanceDirectiveSchema.parse({
        directiveId: directiveId("clip", [channel, runStart, endUs]),
        kind: "clip",
        clipDigest: binding.clipDigest,
        startUs: runStart,
        endUs,
        trimStartUs: 0,
        trimEndUs: Math.min(intervalUs, binding.durationUs),
        loop: intervalUs > binding.durationUs ? Math.ceil(intervalUs / binding.durationUs) : "once",
        timeScale: 1,
      })))
    }
    for (let index = 1; index < records.length; index += 1) {
      const record = records[index]!
      const key = emittedValueKey(record.value)
      if (key !== runValue) {
        flush(record.tUs)
        runStart = record.tUs
        runValue = key
        runLabel = record.value
      }
    }
    flush(rangeUs.endUs)
  }

  for (const attachment of map.attachments ?? []) {
    const attachRecords = sorted.filter((record) => record.channel === attachment.attachChannel)
    const releaseRecords = sorted.filter((record) => record.channel === attachment.releaseChannel)
    if (attachRecords.length === 0 && releaseRecords.length === 0) continue
    if (releaseRecords.length > attachRecords.length) {
      unresolvedIntents.push(unresolved("attach", attachment.propId, "release-order",
        `Channel ${attachment.releaseChannel} emits ${releaseRecords.length} releases against ${attachRecords.length} attaches on ${attachment.attachChannel}.`))
      continue
    }
    for (const [index, attachRecord] of attachRecords.entries()) {
      const releaseRecord = releaseRecords[index]
      if (releaseRecord !== undefined && releaseRecord.tUs <= attachRecord.tUs) {
        unresolvedIntents.push(unresolved("attach", attachment.propId, "release-order",
          `Release on ${attachment.releaseChannel} at ${releaseRecord.tUs}us does not follow attach on ${attachment.attachChannel} at ${attachRecord.tUs}us.`))
        continue
      }
      const endUs = releaseRecord !== undefined ? releaseRecord.tUs : rangeUs.endUs
      directives.push(deepFreezeJson(SpatialPerformanceDirectiveSchema.parse({
        directiveId: directiveId("attach", [attachment.propId, attachRecord.tUs]),
        kind: "attach",
        propId: attachment.propId,
        bone: attachment.bone,
        localOffset: attachment.localOffset,
        startUs: attachRecord.tUs,
        endUs,
      })))
      if (releaseRecord !== undefined) {
        directives.push(deepFreezeJson(SpatialPerformanceDirectiveSchema.parse({
          directiveId: directiveId("release", [attachment.propId, releaseRecord.tUs]),
          kind: "release",
          propId: attachment.propId,
          startUs: releaseRecord.tUs,
        })))
      }
    }
  }

  for (const channel of map.trajectories ?? []) {
    const records = sorted.filter((record) => record.channel === channel)
    if (records.length === 0) continue
    const waypoints: { timeUs: number; position: readonly number[]; rotation: readonly number[] }[] = []
    let malformed = 0
    for (const record of records) {
      const value = record.value
      if (value === null || typeof value !== "object" || Array.isArray(value)) { malformed += 1; continue }
      const waypoint = value as { position?: unknown; rotation?: unknown }
      const position = SpatialVec3Schema.safeParse(waypoint.position)
      const rotation = waypoint.rotation === undefined ? undefined : SpatialQuaternionSchema.safeParse(waypoint.rotation)
      if (!position.success || (rotation !== undefined && !rotation.success)) { malformed += 1; continue }
      waypoints.push({
        timeUs: record.tUs,
        position: position.data,
        rotation: rotation === undefined ? [0, 0, 0, 1] : rotation.data,
      })
    }
    if (malformed > 0) {
      unresolvedIntents.push(unresolved("trajectory", channel, "waypoint-shape",
        `Channel ${channel} emitted ${malformed} malformed waypoint records; waypoints need {position, rotation?}.`))
    }
    if (waypoints.length < 2) {
      unresolvedIntents.push(unresolved("trajectory", channel, "waypoint-count",
        `Channel ${channel} produced ${waypoints.length} valid waypoints; a root trajectory needs at least 2.`))
      continue
    }
    directives.push(deepFreezeJson(SpatialPerformanceDirectiveSchema.parse({
      directiveId: directiveId("trajectory", [channel, waypoints[0]!.timeUs, waypoints.length]),
      kind: "root-trajectory",
      waypoints,
    })))
  }

  if (directives.length > SPATIAL_BEHAVIOR_TRACE_LIMITS.directives) {
    throw new SpatialSceneError("invalid-data", `over-bound: channel map produced ${directives.length} directives beyond ${SPATIAL_BEHAVIOR_TRACE_LIMITS.directives}.`, "behavior-trace")
  }
  return deepFreezeJson({ directives, unresolvedIntents })
}

// ------------------------------------------------------------- bake ---------

export const SpatialBehaviorBakeReceiptSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-behavior-bake-receipt"),
  schemaVersion: z.literal(1),
  behaviorSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  entry: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  manifestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  runDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  runtime: z.strictObject({ name: z.string().min(1).max(64), version: z.string().min(1).max(64) }),
  fnCatalogSha256: SpatialDigestSchema,
  emittedSha256: SpatialDigestSchema,
  channelMapSha256: SpatialDigestSchema.optional(),
  outcome: z.enum(["complete", "failed", "stuck"]),
  work: z.strictObject({
    steps: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.durationUs),
    agentCalls: z.number().int().min(0).max(65_536),
    units: z.number().int().min(0).max(100_000_000),
  }),
})
export type SpatialBehaviorBakeReceipt = Readonly<z.infer<typeof SpatialBehaviorBakeReceiptSchema>>

export const SpatialBehaviorBakeSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-behavior-bake"),
  schemaVersion: z.literal(1),
  behaviorSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  entry: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  seed: z.number().int().min(0).max(4_294_967_295),
  rangeUs: z.strictObject({ startUs: SpatialTimeUsSchema, endUs: SpatialTimeUsSchema }),
  emitted: z.array(SpatialBehaviorEmittedSchema).max(SPATIAL_BEHAVIOR_TRACE_LIMITS.emitted),
  directives: z.array(SpatialPerformanceDirectiveSchema).max(SPATIAL_BEHAVIOR_TRACE_LIMITS.directives),
  unresolvedIntents: z.array(SpatialBehaviorUnresolvedIntentSchema).max(SPATIAL_BEHAVIOR_TRACE_LIMITS.unresolvedIntents),
  receipt: SpatialBehaviorBakeReceiptSchema,
})
export type SpatialBehaviorBake = Readonly<z.infer<typeof SpatialBehaviorBakeSchema>>

export function spatialBehaviorBakeSha256(bake: SpatialBehaviorBake): string {
  return spatialValueSha256(bake)
}

/** Digest binding the admitted fn catalog — names, port signatures, and modeled work costs. */
export function spatialBehaviorFnCatalogSha256(fns: ReadonlyMap<string, SpatialBehaviorFn>): string {
  const projection: Record<string, unknown> = {}
  for (const name of [...fns.keys()].sort()) {
    const signature = fns.get(name)!.signature
    projection[name] = { inputs: signature.inputs, outputs: signature.outputs, cost: signature.cost }
  }
  return spatialValueSha256({ domain: "slopcamera.behavior-fn-catalog.v1", fns: projection } as JsonValue & Record<string, unknown>)
}

import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialDigestSchema, SpatialTimeUsSchema } from "./contracts.js"
import { parseSpatialValue, spatialValueSha256 } from "./identity.js"
import type { SpatialBehaviorEmitted } from "./behavior-trace.js"

/**
 * Behavior-trace audit: analyzes a baked emitted trace for pathological
 * patterns that indicate a degenerate, trivially cyclic, or underspecified
 * behavior. Findings are advisory — they inform gallery review and agent
 * iteration, not automatic selection.
 *
 * Finding kinds:
 * - `state-thrash` — a state channel transitions more than `maxTransitionsPerSecond`
 *   times within a one-second window, suggesting an underspecified dwell guard.
 * - `exact-periodicity` — a channel's values repeat with a fixed period across
 *   the entire trace, suggesting a degenerate constant or trivial cycle.
 * - `dead-channel` — a channel emits the same value at every tick, contributing
 *   no dynamic information to the performance.
 * - `unreachable-state` — for FSM channels where the transition sub-channel
 *   is present, any state that appears in transitions as `to` but is never
 *   the current value is considered unreachable within this trace window.
 */

export const SPATIAL_BEHAVIOR_AUDIT_LIMITS = Object.freeze({
  findings: 128,
  channels: 64,
})

export const SpatialBehaviorAuditFindingKindSchema = z.enum([
  "state-thrash",
  "exact-periodicity",
  "dead-channel",
  "unreachable-state",
])
export type SpatialBehaviorAuditFindingKind = z.infer<typeof SpatialBehaviorAuditFindingKindSchema>

export const SpatialBehaviorAuditFindingSchema = z.strictObject({
  kind: SpatialBehaviorAuditFindingKindSchema,
  channel: z.string().min(1).max(64),
  severity: z.enum(["warning", "info"]),
  detail: z.string().min(1).max(240),
  measured: z.number().finite().optional(),
  limit: z.number().finite().optional(),
})
export type SpatialBehaviorAuditFinding = Readonly<z.infer<typeof SpatialBehaviorAuditFindingSchema>>

export const SpatialBehaviorAuditOptionsSchema = z.strictObject({
  maxTransitionsPerSecond: z.number().int().min(1).max(1000).default(10),
  minDistinctValues: z.number().int().min(2).max(100).default(2),
  maxPeriodicityWindowUs: z.number().int().min(100_000).max(60_000_000).default(5_000_000),
})
export type SpatialBehaviorAuditOptions = Readonly<z.infer<typeof SpatialBehaviorAuditOptionsSchema>>

export const SpatialBehaviorAuditReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-behavior-audit-report"),
  schemaVersion: z.literal(1),
  behaviorSha256: SpatialDigestSchema,
  emittedSha256: SpatialDigestSchema,
  rangeUs: z.strictObject({ startUs: SpatialTimeUsSchema, endUs: SpatialTimeUsSchema }),
  emittedCount: z.number().int().min(0),
  channelCount: z.number().int().min(0),
  findings: z.array(SpatialBehaviorAuditFindingSchema).max(SPATIAL_BEHAVIOR_AUDIT_LIMITS.findings),
  omittedFindings: z.number().int().min(0),
})
export type SpatialBehaviorAuditReport = Readonly<z.infer<typeof SpatialBehaviorAuditReportSchema>>

export function spatialBehaviorAuditReportSha256(report: SpatialBehaviorAuditReport): string {
  return spatialValueSha256(report)
}

// -------------------------------------------------------------- internals ---

const valueKey = (value: unknown): string => {
  if (typeof value === "string") return value
  if (typeof value === "number") return `n:${value}`
  if (typeof value === "boolean") return `b:${value ? 1 : 0}`
  try { return JSON.stringify(value) } catch { return "\0" }
}

interface ChannelTrace {
  readonly channel: string
  readonly records: readonly SpatialBehaviorEmitted[]
  readonly values: readonly string[]
  readonly distinctValues: Set<string>
}

function groupByChannel(emitted: readonly SpatialBehaviorEmitted[]): Map<string, ChannelTrace> {
  const groups = new Map<string, SpatialBehaviorEmitted[]>()
  for (const record of emitted) {
    let list = groups.get(record.channel)
    if (list === undefined) { list = []; groups.set(record.channel, list) }
    list.push(record)
  }
  const result = new Map<string, ChannelTrace>()
  for (const [channel, records] of groups) {
    const values = records.map((record) => valueKey(record.value))
    result.set(channel, { channel, records, values, distinctValues: new Set(values) })
  }
  return result
}

function checkStateThrash(
  trace: ChannelTrace,
  maxTransitionsPerSecond: number,
  findings: SpatialBehaviorAuditFinding[],
): void {
  const { records, values } = trace
  if (records.length < 3) return
  const windowUs = 1_000_000
  let windowStart = 0
  let transitions = 0
  let maxSeen = 0
  for (let i = 1; i < records.length; i += 1) {
    if (values[i] !== values[i - 1]) transitions += 1
    while (windowStart < i && records[i]!.tUs - records[windowStart]!.tUs > windowUs) {
      if (values[windowStart + 1] !== values[windowStart]) transitions -= 1
      windowStart += 1
    }
    maxSeen = Math.max(maxSeen, transitions)
  }
  if (maxSeen > maxTransitionsPerSecond) {
    findings.push({
      kind: "state-thrash", channel: trace.channel, severity: "warning",
      detail: `${maxSeen} transitions/sec in a 1s window exceeds ${maxTransitionsPerSecond}/sec threshold.`,
      measured: maxSeen, limit: maxTransitionsPerSecond,
    })
  }
}

function checkDeadChannel(
  trace: ChannelTrace,
  minDistinct: number,
  findings: SpatialBehaviorAuditFinding[],
): void {
  if (trace.records.length < 2) return
  if (trace.distinctValues.size < minDistinct) {
    findings.push({
      kind: "dead-channel", channel: trace.channel, severity: "info",
      detail: `Channel emits ${trace.distinctValues.size} distinct value(s) across ${trace.records.length} records.`,
      measured: trace.distinctValues.size, limit: minDistinct,
    })
  }
}

function checkExactPeriodicity(
  trace: ChannelTrace,
  maxWindowUs: number,
  findings: SpatialBehaviorAuditFinding[],
): void {
  const { records, values } = trace
  if (records.length < 6) return
  const rangeUs = records[records.length - 1]!.tUs - records[0]!.tUs
  if (rangeUs <= 0) return
  // Check if the value sequence repeats with period P for P in [2, half-length].
  const halfLen = Math.floor(values.length / 2)
  const maxPeriod = Math.min(halfLen, Math.floor(values.length * maxWindowUs / rangeUs))
  for (let period = 2; period <= maxPeriod; period += 1) {
    let match = true
    for (let i = period; i < values.length; i += 1) {
      if (values[i] !== values[i - period]) { match = false; break }
    }
    if (match) {
      findings.push({
        kind: "exact-periodicity", channel: trace.channel, severity: "info",
        detail: `Values repeat exactly every ${period} records — the behavior may be trivially cyclic.`,
        measured: period,
      })
      return
    }
  }
}

function checkUnreachableStates(
  channels: Map<string, ChannelTrace>,
  findings: SpatialBehaviorAuditFinding[],
): void {
  for (const [channel, trace] of channels) {
    const transitionChannel = `${channel}.transition`
    const transitionTrace = channels.get(transitionChannel)
    if (transitionTrace === undefined) continue

    const visited = new Set<string>()
    for (const value of trace.values) {
      if (typeof value === "string") visited.add(value)
    }

    const referenced = new Set<string>()
    for (const record of transitionTrace.records) {
      const value = record.value
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const typed = value as { to?: unknown; from?: unknown }
        if (typeof typed.to === "string") referenced.add(typed.to)
        if (typeof typed.from === "string") referenced.add(typed.from)
      }
    }

    for (const state of referenced) {
      if (!visited.has(state)) {
        findings.push({
          kind: "unreachable-state", channel, severity: "warning",
          detail: `State "${state}" appears in ${transitionChannel} transitions but never as the current ${channel} value.`,
        })
      }
    }
  }
}

// ---------------------------------------------------------------- public ---

const auditInputSchema = z.strictObject({
  emitted: z.array(z.strictObject({
    tUs: SpatialTimeUsSchema,
    channel: z.string().min(1).max(64),
    value: z.unknown(),
  })).max(16_384),
  behaviorSha256: SpatialDigestSchema,
  emittedSha256: SpatialDigestSchema,
  rangeUs: z.strictObject({ startUs: SpatialTimeUsSchema, endUs: SpatialTimeUsSchema }),
  options: SpatialBehaviorAuditOptionsSchema.optional(),
})

export function auditSpatialBehaviorTrace(input: unknown): SpatialBehaviorAuditReport {
  const parsed = parseSpatialValue(auditInputSchema, input, "behavior audit")
  const options = parsed.options ?? SpatialBehaviorAuditOptionsSchema.parse({})
  const channels = groupByChannel(parsed.emitted)
  const findings: SpatialBehaviorAuditFinding[] = []

  for (const trace of channels.values()) {
    if (findings.length >= SPATIAL_BEHAVIOR_AUDIT_LIMITS.findings) break
    checkStateThrash(trace, options.maxTransitionsPerSecond, findings)
    checkDeadChannel(trace, options.minDistinctValues, findings)
    checkExactPeriodicity(trace, options.maxPeriodicityWindowUs, findings)
  }
  checkUnreachableStates(channels, findings)

  const bounded = findings.slice(0, SPATIAL_BEHAVIOR_AUDIT_LIMITS.findings)
  const omitted = findings.length - bounded.length

  return deepFreezeJson(SpatialBehaviorAuditReportSchema.parse({
    kind: "slopcamera.spatial-behavior-audit-report",
    schemaVersion: 1,
    behaviorSha256: parsed.behaviorSha256,
    emittedSha256: parsed.emittedSha256,
    rangeUs: parsed.rangeUs,
    emittedCount: parsed.emitted.length,
    channelCount: channels.size,
    findings: bounded,
    omittedFindings: omitted,
  }))
}

import { describe, expect, test } from "bun:test"

import { auditSpatialBehaviorTrace } from "./behavior-audit"

const RANGE = { startUs: 0, endUs: 500_000 }
const SHA = "a".repeat(64)

function emitted(records: readonly { tUs: number; channel: string; value: unknown }[]) {
  return {
    emitted: records,
    behaviorSha256: SHA,
    emittedSha256: SHA,
    rangeUs: RANGE,
  }
}

describe("auditSpatialBehaviorTrace", () => {
  test("returns a clean report for a well-behaved trace", () => {
    const report = auditSpatialBehaviorTrace(emitted([
      { tUs: 0, channel: "locomotion", value: "idle" },
      { tUs: 100_000, channel: "locomotion", value: "walk" },
      { tUs: 200_000, channel: "locomotion", value: "walk" },
      { tUs: 300_000, channel: "locomotion", value: "done" },
    ]))
    expect(report.kind).toBe("slopcamera.spatial-behavior-audit-report")
    expect(report.findings.length).toBe(0)
    expect(report.channelCount).toBe(1)
    expect(report.emittedCount).toBe(4)
  })

  test("detects state thrash when transitions exceed threshold", () => {
    // 20 alternations within 1 second → thrash
    const records: { tUs: number; channel: string; value: unknown }[] = []
    for (let i = 0; i < 40; i += 1) {
      records.push({ tUs: i * 25_000, channel: "state", value: i % 2 === 0 ? "a" : "b" })
    }
    const report = auditSpatialBehaviorTrace(emitted(records))
    const thrash = report.findings.filter((f) => f.kind === "state-thrash")
    expect(thrash.length).toBe(1)
    expect(thrash[0]!.channel).toBe("state")
    expect(thrash[0]!.severity).toBe("warning")
    expect(thrash[0]!.measured).toBeGreaterThan(10)
  })

  test("detects dead channels with a single constant value", () => {
    const records = [0, 100_000, 200_000, 300_000].map((tUs) => ({
      tUs, channel: "mood", value: { calm: 0.5 },
    }))
    const report = auditSpatialBehaviorTrace(emitted(records))
    const dead = report.findings.filter((f) => f.kind === "dead-channel")
    expect(dead.length).toBe(1)
    expect(dead[0]!.channel).toBe("mood")
    expect(dead[0]!.severity).toBe("info")
  })

  test("detects exact periodicity in a trivially cyclic trace", () => {
    // Repeating pattern: a, b, a, b, a, b...
    const records: { tUs: number; channel: string; value: unknown }[] = []
    for (let i = 0; i < 20; i += 1) {
      records.push({ tUs: i * 20_000, channel: "state", value: i % 2 === 0 ? "idle" : "walk" })
    }
    const report = auditSpatialBehaviorTrace(emitted(records))
    const periodic = report.findings.filter((f) => f.kind === "exact-periodicity")
    expect(periodic.length).toBe(1)
    expect(periodic[0]!.channel).toBe("state")
    expect(periodic[0]!.measured).toBe(2)
  })

  test("detects unreachable states from transition records", () => {
    const report = auditSpatialBehaviorTrace(emitted([
      { tUs: 0, channel: "locomotion", value: "idle" },
      { tUs: 100_000, channel: "locomotion", value: "walk" },
      { tUs: 200_000, channel: "locomotion", value: "walk" },
      { tUs: 0, channel: "locomotion.transition", value: { from: "idle", to: "walk" } },
      // "run" is referenced but never visited
      { tUs: 100_000, channel: "locomotion.transition", value: { from: "walk", to: "run" } },
    ]))
    const unreachable = report.findings.filter((f) => f.kind === "unreachable-state")
    expect(unreachable.length).toBe(1)
    expect(unreachable[0]!.detail).toContain("run")
    expect(unreachable[0]!.severity).toBe("warning")
  })

  test("does not false-positive on a diverse non-periodic trace", () => {
    const records: { tUs: number; channel: string; value: unknown }[] = []
    const states = ["idle", "walk", "jog", "sprint", "idle", "crouch", "walk", "idle"]
    for (let i = 0; i < states.length; i += 1) {
      records.push({ tUs: i * 50_000, channel: "locomotion", value: states[i] })
    }
    const report = auditSpatialBehaviorTrace(emitted(records))
    expect(report.findings.filter((f) => f.kind === "exact-periodicity")).toEqual([])
    expect(report.findings.filter((f) => f.kind === "state-thrash")).toEqual([])
  })

  test("respects custom options", () => {
    // High threshold means even rapid transitions don't trigger
    const records: { tUs: number; channel: string; value: unknown }[] = []
    for (let i = 0; i < 40; i += 1) {
      records.push({ tUs: i * 25_000, channel: "state", value: i % 2 === 0 ? "a" : "b" })
    }
    const report = auditSpatialBehaviorTrace({
      ...emitted(records),
      options: { maxTransitionsPerSecond: 100 },
    })
    expect(report.findings.filter((f) => f.kind === "state-thrash")).toEqual([])
  })
})

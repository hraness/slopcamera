import { expect, test } from "bun:test"
import fc from "fast-check"
import { canonicalJson, canonicalJsonSha256 } from "../code/canonical-json.js"
import { HUMANOID_BONE_NAMES, parseHumanoidMapping } from "./character.js"
import { SPATIAL_GLB_RIGGED_PROFILE } from "./gltf.js"
import { type SpatialFrameRate } from "./contracts.js"
import {
  compileSpatialPerformance,
  SPATIAL_PERFORMANCE_COMPILER_ID,
  type SpatialPerformanceClip,
  type SpatialPerformanceDirective,
  type SpatialPerformancePlan,
  type SpatialPerformanceSources,
} from "./performance.js"

const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } as const
const sceneSha256 = "a".repeat(64)
const rigSha256 = "b".repeat(64)
const mappingSourceSha256 = "c".repeat(64)
const frameRate: SpatialFrameRate = { numerator: 24, denominator: 1 }

function makeMapping() {
  const bones = HUMANOID_BONE_NAMES.map((canonicalName, index) => ({ canonicalName, sourceNodeIndex: index + 1, restOffset: identity }))
  return parseHumanoidMapping({
    kind: "slopcamera.spatial-humanoid-mapping",
    schemaVersion: 1,
    sourceAssetSha256: mappingSourceSha256,
    sourceProfile: SPATIAL_GLB_RIGGED_PROFILE,
    bones,
  })
}

const clip = {
  kind: "slopcamera.spatial-performance-clip",
  schemaVersion: 1,
  durationUs: 1_000_000,
  channels: [{ bone: "hips", keys: [{ timeUs: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] }, { timeUs: 1_000_000, position: [0, 0, 0], rotation: [0, 0, 0, 1] }] }],
}
const clipSha = canonicalJsonSha256(clip)

test("attachment sampling agrees with chronological ownership replay for arbitrary event timelines", () => {
  const mapping = makeMapping()
  const sources = {
    sceneSha256, rigSha256, mapping, clips: {},
    props: { parcel: { propId: "parcel", localOffset: identity }, cup: { propId: "cup", localOffset: identity } },
  } as unknown as SpatialPerformanceSources
  const event = fc.record({
    kind: fc.constantFrom("attach", "release"),
    propId: fc.constantFrom("parcel", "cup"),
    start: fc.integer({ min: 0, max: 9 }),
    length: fc.integer({ min: 1, max: 10 }),
    bone: fc.constantFrom("leftHand", "rightHand"),
    offset: fc.integer({ min: -2, max: 2 }),
  })
  fc.assert(fc.property(fc.array(event, { minLength: 1, maxLength: 16 }), (events) => {
    const directives = events.map((event, index) => ({
      directiveId: `event-${index}`, kind: event.kind, propId: event.propId, startUs: event.start * 100_000,
      ...(event.kind === "attach" ? {
        bone: event.bone,
        localOffset: { ...identity, position: [event.offset, 0, 0] },
        endUs: Math.min(10, event.start + event.length) * 100_000,
      } : {}),
    })) as unknown as readonly SpatialPerformanceDirective[]
    const plan = {
      kind: "slopcamera.spatial-performance-plan", schemaVersion: 1,
      sceneSha256, rigSha256, mappingSha256: canonicalJsonSha256(mapping),
      compilerVersion: SPATIAL_PERFORMANCE_COMPILER_ID, seed: 0,
      durationUs: 1_100_000, frameRate: { numerator: 10, denominator: 1 }, directives,
    } as unknown as SpatialPerformancePlan
    const take = compileSpatialPerformance(plan, sources)
    expect(compileSpatialPerformance(plan, sources)).toEqual(take)
    // An independent event replay: releases clear current ownership; attaches
    // replace it. Expiry clears only that current interval, never an old one.
    const chronological = events.map((event, index) => ({ ...event, index })).sort((a, b) =>
      a.start - b.start || Number(a.kind === "attach") - Number(b.kind === "attach") || a.index - b.index)
    const ownership = new Map<string, (typeof chronological)[number]>()
    let nextEvent = 0
    for (const sample of take.samples) {
      while (nextEvent < chronological.length && chronological[nextEvent]!.start * 100_000 <= sample.timeUs) {
        const event = chronological[nextEvent++]!
        if (event.kind === "release") ownership.delete(event.propId)
        else ownership.set(event.propId, event)
      }
      for (const propId of ["parcel", "cup"]) {
        const owner = ownership.get(propId)
        if (owner !== undefined && sample.timeUs >= Math.min(10, owner.start + owner.length) * 100_000) ownership.delete(propId)
        const current = ownership.get(propId)
        const actual = sample.attachments[propId]!
        expect(actual.attached).toBe(current !== undefined)
        expect(actual.parentBone).toBe(current?.bone)
        expect(actual.localOffset?.position).toEqual(current === undefined ? undefined : [current.offset, 0, 0])
      }
    }
  }), { numRuns: 60 })
}, { timeout: 10000 })

test("compilation is deterministic and bounded for varying seeds and durations", () => {
  const mapping = makeMapping()
  const mappingSha256 = canonicalJsonSha256(mapping)
  const sources: SpatialPerformanceSources = {
    sceneSha256,
    rigSha256,
    mapping,
    clips: { [clipSha]: clip },
    props: {},
  } as unknown as SpatialPerformanceSources
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 0xffff_ffff }),
      fc.integer({ min: 1_000_000, max: 2_000_000 }),
      (seed, durationUs) => {
        const plan: SpatialPerformancePlan = {
          kind: "slopcamera.spatial-performance-plan",
          schemaVersion: 1,
          sceneSha256,
          rigSha256,
          mappingSha256,
          compilerVersion: SPATIAL_PERFORMANCE_COMPILER_ID,
          seed,
          durationUs,
          frameRate,
          directives: [{
            directiveId: "d1",
            kind: "clip",
            clipDigest: clipSha,
            startUs: 0,
            endUs: durationUs,
            trimStartUs: 0,
            trimEndUs: 1_000_000,
            loop: "once",
            timeScale: 1,
          }],
        } as unknown as SpatialPerformancePlan
        const first = compileSpatialPerformance(plan, sources)
        const second = compileSpatialPerformance(plan, sources)
        expect(canonicalJson(first)).toBe(canonicalJson(second))
        for (const channel of first.channels) {
          if (channel.kind === "bone-pose") {
            for (const key of channel.keys) {
              for (const component of key.position) {
                expect(Math.abs(component)).toBeLessThanOrEqual(100)
              }
            }
          }
        }
      },
    ),
    { numRuns: 30 },
  )
}, { timeout: 10000 })

test("parsed plan rejects a clip digest that does not match its canonical source", () => {
  const mapping = makeMapping()
  const mappingSha256 = canonicalJsonSha256(mapping)
  fc.assert(
    fc.property(
      fc.string({ minLength: 64, maxLength: 64 }).map((s) => s.replace(/[^a-f0-9]/gu, "0")),
      (wrongDigest) => {
        const plan: SpatialPerformancePlan = {
          kind: "slopcamera.spatial-performance-plan",
          schemaVersion: 1,
          sceneSha256,
          rigSha256,
          mappingSha256,
          compilerVersion: SPATIAL_PERFORMANCE_COMPILER_ID,
          seed: 0,
          durationUs: 500_000,
          frameRate,
          directives: [{
            directiveId: "d1",
            kind: "clip",
            clipDigest: wrongDigest,
            startUs: 0,
            endUs: 500_000,
            trimStartUs: 0,
            trimEndUs: 1_000_000,
            loop: "once",
            timeScale: 1,
          }],
        } as unknown as SpatialPerformancePlan
        const sources: SpatialPerformanceSources = {
          sceneSha256,
          rigSha256,
          mapping,
          clips: { [clipSha]: clip },
          props: {},
        } as unknown as SpatialPerformanceSources
        expect(() => compileSpatialPerformance(plan, sources)).toThrow()
      },
    ),
    { numRuns: 10 },
  )
})

test("additive clip layers respect body mask isolation and stay deterministic", () => {
  const mapping = makeMapping()
  const mappingSha256 = canonicalJsonSha256(mapping)
  const baseClip = {
    kind: "slopcamera.spatial-performance-clip",
    schemaVersion: 1,
    durationUs: 1_000_000,
    channels: [
      { bone: "leftUpperArm", keys: [{ timeUs: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] }, { timeUs: 1_000_000, position: [0, 0, 0], rotation: [0, 0, 0, 1] }] },
      { bone: "rightUpperArm", keys: [{ timeUs: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] }, { timeUs: 1_000_000, position: [0, 0, 0], rotation: [0, 0, 0, 1] }] },
    ],
  }
  const addClip = {
    kind: "slopcamera.spatial-performance-clip",
    schemaVersion: 1,
    durationUs: 1_000_000,
    channels: [
      { bone: "leftUpperArm", keys: [{ timeUs: 0, position: [0, 0.1, 0], rotation: [0, 0, 0, 1] }, { timeUs: 1_000_000, position: [0, 0.1, 0], rotation: [0, 0, 0, 1] }] },
      { bone: "rightUpperArm", keys: [{ timeUs: 0, position: [0, 0.5, 0], rotation: [0, 0, 0, 1] }, { timeUs: 1_000_000, position: [0, 0.5, 0], rotation: [0, 0, 0, 1] }] },
    ],
  }
  const baseSha = canonicalJsonSha256(baseClip)
  const addSha = canonicalJsonSha256(addClip)
  const sources: SpatialPerformanceSources = {
    sceneSha256,
    rigSha256,
    mapping,
    clips: { [baseSha]: baseClip as unknown as SpatialPerformanceClip, [addSha]: addClip as unknown as SpatialPerformanceClip },
    props: {},
  } as unknown as SpatialPerformanceSources
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: 1, max: 0xffff_ffff }),
      (maskLeftArm, seed) => {
        const plan: SpatialPerformancePlan = {
          kind: "slopcamera.spatial-performance-plan",
          schemaVersion: 1,
          sceneSha256,
          rigSha256,
          mappingSha256,
          compilerVersion: SPATIAL_PERFORMANCE_COMPILER_ID,
          seed,
          durationUs: 1_000_000,
          frameRate,
          directives: [{
            directiveId: "base",
            kind: "clip",
            clipDigest: baseSha,
            startUs: 0,
            endUs: 1_000_000,
            trimStartUs: 0,
            trimEndUs: 1_000_000,
            loop: "once",
            timeScale: 1,
          }, {
            directiveId: "add",
            kind: "clip",
            mode: "additive",
            mask: maskLeftArm ? "leftArm" : "rightArm",
            clipDigest: addSha,
            startUs: 0,
            endUs: 1_000_000,
            trimStartUs: 0,
            trimEndUs: 1_000_000,
            loop: "once",
            timeScale: 1,
          }],
        } as unknown as SpatialPerformancePlan
        const first = compileSpatialPerformance(plan, sources)
        const second = compileSpatialPerformance(plan, sources)
        expect(canonicalJson(first)).toBe(canonicalJson(second))
        const leftArmY = first.samples[0]!.boneWorld["leftUpperArm"]!.position[1]
        const rightArmY = first.samples[0]!.boneWorld["rightUpperArm"]!.position[1]
        if (maskLeftArm) {
          expect(leftArmY).toBeCloseTo(0.1, 4)
          expect(rightArmY).toBeCloseTo(0, 4)
        } else {
          expect(leftArmY).toBeCloseTo(0, 4)
          expect(rightArmY).toBeCloseTo(0.5, 4)
        }
      },
    ),
    { numRuns: 20 },
  )
}, { timeout: 10000 })

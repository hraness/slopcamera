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

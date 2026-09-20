import { describe, expect, test } from "bun:test"
import { canonicalJson, canonicalJsonSha256 } from "../code/canonical-json.js"
import { CORE_HUMANOID_BONE_NAMES, HUMANOID_BONE_NAMES, parseHumanoidMapping } from "./character.js"
import { SPATIAL_GLB_RIGGED_PROFILE } from "./gltf.js"
import { type SpatialFrameRate } from "./contracts.js"
import { compileSpatialBehaviorDirectives, parseSpatialBehaviorChannelMap } from "./behavior-trace.js"
import {
  auditSpatialPerformance,
  compileSpatialPerformance,
  parseSpatialPerformanceBakeReceipt,
  parseSpatialPerformanceBakeRequest,
  parseSpatialPerformanceGalleryPlan,
  parseSpatialPerformanceGallerySelection,
  parseSpatialPerformancePlan,
  poseFromMatrix,
  SPATIAL_PERFORMANCE_COMPILER_ID,
  validatePerformanceBakeReceipt,
  validatePerformanceGallerySelection,
  type SpatialPerformanceAttachmentChannel,
  type SpatialPerformanceBakeReceipt,
  type SpatialPerformanceBakeRequest,
  type SpatialPerformanceBoneChannel,
  type SpatialPerformanceClip,
  type SpatialPerformanceMorphChannel,
  type SpatialPerformancePlan,
  type SpatialPerformanceSources,
} from "./performance.js"

const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } as const
const sceneSha256 = "a".repeat(64)
const rigSha256 = "b".repeat(64)
const mappingSourceSha256 = "c".repeat(64)
const frameRate: SpatialFrameRate = { numerator: 24, denominator: 1 }

function fullMapping() {
  const bones = HUMANOID_BONE_NAMES.map((canonicalName, index) => ({ canonicalName, sourceNodeIndex: index + 1, restOffset: identity }))
  return parseHumanoidMapping({
    kind: "slopcamera.spatial-humanoid-mapping",
    schemaVersion: 1,
    sourceAssetSha256: mappingSourceSha256,
    sourceProfile: SPATIAL_GLB_RIGGED_PROFILE,
    bones,
  })
}

function coreMapping() {
  const bones = CORE_HUMANOID_BONE_NAMES.map((canonicalName, index) => ({ canonicalName, sourceNodeIndex: index + 1, restOffset: identity }))
  return parseHumanoidMapping({
    kind: "slopcamera.spatial-humanoid-mapping",
    schemaVersion: 1,
    sourceAssetSha256: mappingSourceSha256,
    sourceProfile: SPATIAL_GLB_RIGGED_PROFILE,
    bones,
  })
}

function clipSha256(clip: SpatialPerformanceClip): string {
  return canonicalJsonSha256(clip)
}

function poseKeys(
  timeUs: number,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number, number],
): { timeUs: number; position: readonly [number, number, number]; rotation: readonly [number, number, number, number] }[] {
  return [{ timeUs: 0, position, rotation }, { timeUs, position, rotation }]
}

function buildPlan(directives: SpatialPerformancePlan["directives"], mappingSha256: string, durationUs = 1_000_000, seed = 42): SpatialPerformancePlan {
  return {
    kind: "slopcamera.spatial-performance-plan",
    schemaVersion: 1,
    sceneSha256,
    rigSha256,
    mappingSha256,
    compilerVersion: SPATIAL_PERFORMANCE_COMPILER_ID,
    seed,
    durationUs,
    frameRate,
    directives,
  } as unknown as SpatialPerformancePlan
}

function buildSources(mapping: ReturnType<typeof fullMapping>, clips: Record<string, SpatialPerformanceClip>, props: Record<string, unknown> = {}): SpatialPerformanceSources {
  return {
    sceneSha256,
    rigSha256,
    mapping,
    clips,
    props,
  } as unknown as SpatialPerformanceSources
}

describe("parseSpatialPerformancePlan", () => {
  test("rejects an invalid plan kind", () => {
    expect(() => parseSpatialPerformancePlan({ kind: "wrong" })).toThrow()
  })

  test("accepts a plan with a single directive", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    expect(take.receipt.outputSha256).toHaveLength(64)
    expect(take.receipt.compiler).toBe("slopcamera.spatial-performance-compiler@v3")
    expect(take.receipt.compilerSha256).toBe(canonicalJsonSha256(SPATIAL_PERFORMANCE_COMPILER_ID))
    expect(() => parseSpatialPerformancePlan({ ...plan, compilerVersion: "slopcamera.spatial-performance-compiler@v2" })).toThrow()
  })
})

describe("poseFromMatrix", () => {
  function axisAngle(axis: readonly [number, number, number], radians: number): readonly [number, number, number, number] {
    const length = Math.hypot(...axis)
    const sine = Math.sin(radians / 2)
    return [axis[0] / length * sine, axis[1] / length * sine, axis[2] / length * sine, Math.cos(radians / 2)]
  }

  test("recovers identity from the identity matrix", () => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    const pose = poseFromMatrix(m)
    expect(pose.position).toEqual([0, 0, 0])
    expect(pose.rotation[0]).toBeCloseTo(0, 10)
    expect(pose.rotation[1]).toBeCloseTo(0, 10)
    expect(pose.rotation[2]).toBeCloseTo(0, 10)
    expect(pose.rotation[3]).toBeCloseTo(1, 10)
  })

  test("recovers a translation and a rotation around Y", () => {
    const q = axisAngle([0, 1, 0], Math.PI / 2)
    const m = [
      0, 0, -1, 0,
      0, 1, 0, 0,
      1, 0, 0, 0,
      3, -2, 7, 1,
    ]
    const pose = poseFromMatrix(m)
    expect(pose.position).toEqual([3, -2, 7])
    // q and -q represent the same rotation; accept either sign convention.
    const rotation = pose.rotation as readonly number[]
    const sameSign = q.every((value, i) => Math.abs(value - rotation[i]!) < 1e-10)
    const oppositeSign = q.every((value, i) => Math.abs(value + rotation[i]!) < 1e-10)
    expect(sameSign || oppositeSign).toBe(true)
  })
})

describe("compileSpatialPerformance", () => {
  test("rejects a stale mapping digest", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }], "d".repeat(64))
    const sources = buildSources(mapping, { [sha]: clip })
    expect(() => compileSpatialPerformance(plan, sources)).toThrow("Stale or mismatched mapping digest")
  })

  test("rejects a missing or unmapped bone", () => {
    const mapping = coreMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "look-at",
      bone: "rightToes",
      target: [0, 0, 10],
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    expect(() => compileSpatialPerformance(plan, sources)).toThrow("Canonical bone rightToes is not mapped")
  })

  test("walks a planned root path", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "root",
      kind: "root-trajectory",
      waypoints: [
        { timeUs: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] },
        { timeUs: 1_000_000, position: [5, 0, 0], rotation: [0, 0, 0, 1] },
      ],
    }, {
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    const hipChannel = take.channels.find((c): c is SpatialPerformanceBoneChannel => c.kind === "bone-pose" && c.bone === "hips")
    expect(hipChannel).toBeDefined()
    const first = hipChannel!.keys[0]!.position[0]
    const last = hipChannel!.keys[hipChannel!.keys.length - 1]!.position[0]
    expect(last).toBeGreaterThan(first)
    expect(last).toBeCloseTo(5, 0)
  })

  test("looks at a target", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "head", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "gaze",
      kind: "look-at",
      bone: "head",
      target: [0, 0, 10],
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    const head = take.samples[0]!.boneWorld["head"]!
    const forward = head.rotation
    // A head looking at [0,0,10] from origin keeps its forward along +Z (identity)
    expect(forward[0]).toBeCloseTo(0, 3)
    expect(forward[1]).toBeCloseTo(0, 3)
    expect(forward[2]).toBeCloseTo(0, 3)
    expect(forward[3]).toBeCloseTo(1, 3)
  })

  test("reaches for, carries, and releases a prop", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "rightUpperArm", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "rightLowerArm", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "rightHand", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
      ],
    }
    const sha = clipSha256(clip)
    const prop = { propId: "sword", localOffset: identity }
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "carry",
      kind: "attach",
      propId: "sword",
      bone: "rightHand",
      localOffset: identity,
      startUs: 250_000,
      endUs: 750_000,
    }, {
      directiveId: "drop",
      kind: "release",
      propId: "sword",
      startUs: 750_000,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip }, { sword: prop })
    const take = compileSpatialPerformance(plan, sources)
    const channel = take.channels.find((c): c is SpatialPerformanceAttachmentChannel => c.kind === "attachment" && c.propId === "sword")!
    const first = channel.keys[0]!.attached
    const mid = channel.keys[channel.keys.length / 2 | 0]!.attached
    const last = channel.keys[channel.keys.length - 1]!.attached
    expect(first).toBe(false)
    expect(mid).toBe(true)
    expect(last).toBe(false)
  })

  test("native behavior releases do not prevent a later prop pickup", () => {
    const mapping = fullMapping()
    const channelMap = parseSpatialBehaviorChannelMap({ attachments: [{
      attachChannel: "parcel.attach", releaseChannel: "parcel.release",
      propId: "parcel", bone: "leftHand", localOffset: identity,
    }] })
    const compilation = compileSpatialBehaviorDirectives({
      emitted: [
        { tUs: 0, channel: "parcel.attach", value: true },
        { tUs: 700_000, channel: "parcel.release", value: true },
        { tUs: 4_900_000, channel: "parcel.attach", value: true },
      ],
      channelMap,
      rangeUs: { startUs: 0, endUs: 8_000_000 },
    })
    expect(compilation.unresolvedIntents).toEqual([])
    expect(compilation.directives.map((directive) => directive.kind)).toEqual(["attach", "release", "attach"])
    const plan = { ...buildPlan(compilation.directives, canonicalJsonSha256(mapping), 8_000_000), frameRate: { numerator: 10, denominator: 1 } }
    const sources = buildSources(mapping, {}, { parcel: { propId: "parcel", localOffset: identity } })
    const take = compileSpatialPerformance(plan, sources)
    const attachmentAt = (timeUs: number) => take.samples.find((sample) => sample.timeUs === timeUs)!.attachments["parcel"]!
    expect(attachmentAt(0)).toMatchObject({ attached: true, parentBone: "leftHand" })
    expect(attachmentAt(700_000).attached).toBe(false)
    expect(attachmentAt(4_800_000).attached).toBe(false)
    expect(attachmentAt(4_900_000)).toMatchObject({ attached: true, parentBone: "leftHand" })
    expect(attachmentAt(7_900_000).attached).toBe(true)
    const channel = take.channels.find((candidate): candidate is SpatialPerformanceAttachmentChannel => candidate.kind === "attachment")!
    expect(channel.keys.map((key) => key.attached)).toEqual(take.samples.map((sample) => sample.attachments["parcel"]!.attached))
    expect(compileSpatialPerformance(plan, sources)).toEqual(take)
  })

  test("prop ownership follows event time and never revives an older attachment", () => {
    const mapping = fullMapping()
    const sources = buildSources(mapping, {}, { parcel: { propId: "parcel", localOffset: identity } })
    const directives: SpatialPerformancePlan["directives"] = [
      { directiveId: "new", kind: "attach", propId: "parcel", bone: "leftHand", localOffset: identity, startUs: 500_000, endUs: 700_000 },
      { directiveId: "old", kind: "attach", propId: "parcel", bone: "rightHand", localOffset: identity, startUs: 0, endUs: 1_000_000 },
      { directiveId: "early-drop", kind: "release", propId: "parcel", startUs: 300_000 },
    ]
    const plan = { ...buildPlan(directives, canonicalJsonSha256(mapping)), frameRate: { numerator: 10, denominator: 1 } }
    const take = compileSpatialPerformance(plan, sources)
    expect(take.samples.map((sample) => sample.attachments["parcel"]!.parentBone ?? null)).toEqual([
      "rightHand", "rightHand", "rightHand", null, null, "leftHand", "leftHand", null, null, null,
    ])
    const reordered = compileSpatialPerformance({ ...plan, directives: [...directives].reverse() }, sources)
    expect(reordered.samples).toEqual(take.samples)
    expect(reordered.channels).toEqual(take.channels)
  })

  test("native behavior can release and reattach at the same instant", () => {
    const mapping = fullMapping()
    const compilation = compileSpatialBehaviorDirectives({
      emitted: [
        { tUs: 0, channel: "parcel.attach", value: true },
        { tUs: 500_000, channel: "parcel.release", value: true },
        { tUs: 500_000, channel: "parcel.attach", value: true },
        { tUs: 800_000, channel: "parcel.release", value: true },
      ],
      channelMap: parseSpatialBehaviorChannelMap({ attachments: [{
        attachChannel: "parcel.attach", releaseChannel: "parcel.release",
        propId: "parcel", bone: "leftHand", localOffset: identity,
      }] }),
      rangeUs: { startUs: 0, endUs: 1_000_000 },
    })
    expect(compilation.unresolvedIntents).toEqual([])
    const plan = { ...buildPlan(compilation.directives, canonicalJsonSha256(mapping)), frameRate: { numerator: 10, denominator: 1 } }
    const take = compileSpatialPerformance(plan, buildSources(mapping, {}, { parcel: { propId: "parcel", localOffset: identity } }))
    expect(take.samples.map((sample) => sample.attachments["parcel"]!.attached)).toEqual([
      true, true, true, true, true, true, true, true, false, false,
    ])
  })

  test("simultaneous releases precede attaches, and simultaneous attaches preserve authored precedence", () => {
    const mapping = fullMapping()
    const sources = buildSources(mapping, {}, { parcel: { propId: "parcel", localOffset: identity } })
    const first = { directiveId: "first", kind: "attach", propId: "parcel", bone: "rightHand", localOffset: identity, startUs: 0, endUs: 1_000_000 } as const
    const second = { ...first, directiveId: "second", bone: "leftHand" } as const
    const drop = { directiveId: "drop", kind: "release", propId: "parcel", startUs: 0 } as const
    for (const directives of [[first, second], [second, first]]) {
      const take = compileSpatialPerformance(buildPlan(directives, canonicalJsonSha256(mapping)), sources)
      expect(take.samples[0]!.attachments["parcel"]!.parentBone).toBe(directives[1]!.bone)
    }
    for (const directives of [[drop, first, second], [second, first, drop]]) {
      const take = compileSpatialPerformance(buildPlan(directives, canonicalJsonSha256(mapping)), sources)
      const lastAttach = directives.filter((directive) => directive.kind === "attach").at(-1)!
      expect(take.samples.every((sample) => sample.attachments["parcel"]!.parentBone === lastAttach.bone)).toBe(true)
    }
  })

  test("sets a morph expression", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "smile",
      kind: "morph",
      index: 0,
      weight: 0.75,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    const morph = take.channels.find((c): c is SpatialPerformanceMorphChannel => c.kind === "morph" && c.index === 0)!
    for (const key of morph.keys) {
      expect(key.value).toBe(0.75)
    }
  })

  test("crossfades two clips without a transform jump", () => {
    const mapping = fullMapping()
    const clipA: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const clipB: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [10, 0, 0], [0, 0, 0, 1]) }],
    }
    const shaA = clipSha256(clipA)
    const shaB = clipSha256(clipB)
    const plan = buildPlan([{
      directiveId: "clipA",
      kind: "clip",
      clipDigest: shaA,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "clipB",
      kind: "clip",
      clipDigest: shaB,
      startUs: 500_000,
      endUs: 1_500_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "xf",
      kind: "crossfade",
      fromClipId: "clipA",
      toClipId: "clipB",
      startUs: 500_000,
      durationUs: 500_000,
    }], canonicalJsonSha256(mapping), 1_500_000)
    const sources = buildSources(mapping, { [shaA]: clipA, [shaB]: clipB })
    const take = compileSpatialPerformance(plan, sources)
    const hipChannel = take.channels.find((c): c is SpatialPerformanceBoneChannel => c.kind === "bone-pose" && c.bone === "hips")!
    const first = hipChannel.keys[0]!
    const mid = hipChannel.keys.find((k) => k.timeUs >= 750_000)!
    // The crossfade transitions from clip A to a later active clip.
    expect(first.position[0]).toBe(0)
    expect(mid.position[0]).toBeGreaterThan(0)
  })

  test("produces byte-identical output for identical inputs", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const first = compileSpatialPerformance(plan, sources)
    const second = compileSpatialPerformance(plan, sources)
    expect(canonicalJson(first)).toBe(canonicalJson(second))
    expect(first.receipt.outputSha256).toBe(second.receipt.outputSha256)
  })

  test("rejects duplicate directive ids", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "same",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 500_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "same",
      kind: "clip",
      clipDigest: sha,
      startUs: 500_000,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    expect(() => compileSpatialPerformance(plan, sources)).toThrow("Duplicate directiveId")
  })

  test("rejects clip and attach intervals that exceed plan duration", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_100_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    expect(() => compileSpatialPerformance(plan, sources)).toThrow("ends after plan duration")
  })

  test("rejects a crossfade that references an unknown clip directive", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "clipA",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "xf",
      kind: "crossfade",
      fromClipId: "missing",
      toClipId: "clipA",
      startUs: 500_000,
      durationUs: 250_000,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    expect(() => compileSpatialPerformance(plan, sources)).toThrow("unknown fromClipId")
  })

  test("crossfades match the source clips at the fade boundaries", () => {
    const mapping = fullMapping()
    const clipA: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const clipB: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [10, 0, 0], [0, 0, 0, 1]) }],
    }
    const shaA = clipSha256(clipA)
    const shaB = clipSha256(clipB)
    const plan = buildPlan([{
      directiveId: "clipA",
      kind: "clip",
      clipDigest: shaA,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "clipB",
      kind: "clip",
      clipDigest: shaB,
      startUs: 500_000,
      endUs: 1_500_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "xf",
      kind: "crossfade",
      fromClipId: "clipA",
      toClipId: "clipB",
      startUs: 500_000,
      durationUs: 500_000,
    }], canonicalJsonSha256(mapping), 1_500_000)
    const sources = buildSources(mapping, { [shaA]: clipA, [shaB]: clipB })
    const take = compileSpatialPerformance(plan, sources)
    const hipChannel = take.channels.find((c): c is SpatialPerformanceBoneChannel => c.kind === "bone-pose" && c.bone === "hips")!
    const start = hipChannel.keys.find((k) => k.timeUs === 500_000)!
    const end = hipChannel.keys.find((k) => k.timeUs === 1_000_000)!
    expect(start.position[0]).toBeCloseTo(0, 2)
    // At the end of the fade the output equals the toClip pose, which is constant at 10.
    expect(end.position[0]).toBeCloseTo(10, 2)
  })

  test("looks at a target on the +X axis", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "head", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "gaze",
      kind: "look-at",
      bone: "head",
      target: [10, 0, 0],
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    const head = take.samples[0]!.boneWorld["head"]!
    expect(head.rotation[0]).toBeCloseTo(0, 3)
    expect(head.rotation[1]).toBeCloseTo(Math.SQRT1_2, 3)
    expect(head.rotation[2]).toBeCloseTo(0, 3)
    expect(head.rotation[3]).toBeCloseTo(Math.SQRT1_2, 3)
  })

  test("plants a foot at the ground plane", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "leftUpperLeg", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "leftLowerLeg", keys: poseKeys(1_000_000, [0, -0.5, 0], [0, 0, 0, 1]) },
        { bone: "leftFoot", keys: poseKeys(1_000_000, [0, -0.5, 0], [0, 0, 0, 1]) },
      ],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "plant",
      kind: "foot-plant",
      bone: "leftFoot",
      groundY: 0,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    for (const sample of take.samples) {
      expect(sample.boneWorld["leftFoot"]!.position[1]).toBeCloseTo(0, 4)
    }
  })

  test("attachment world position respects a rotated parent bone", () => {
    const mapping = fullMapping()
    const quarterY: readonly [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2]
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "rightUpperArm", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "rightLowerArm", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "rightHand", keys: poseKeys(1_000_000, [0, 0, 0], quarterY) },
      ],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "carry",
      kind: "attach",
      propId: "sword",
      bone: "rightHand",
      localOffset: { position: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      startUs: 0,
      endUs: 1_000_000,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip }, { sword: { propId: "sword", localOffset: identity } })
    const take = compileSpatialPerformance(plan, sources)
    const sample = take.samples[0]!
    const prop = sample.attachments["sword"]!
    expect(prop.worldPosition[0]).toBeCloseTo(0, 4)
    expect(prop.worldPosition[1]).toBeCloseTo(0, 4)
    expect(prop.worldPosition[2]).toBeCloseTo(-1, 4)
  })
})

describe("auditSpatialPerformance", () => {
  function fixtureTakeAndSources(): { take: ReturnType<typeof compileSpatialPerformance>; sources: SpatialPerformanceSources; mappingSha: string } {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "leftUpperLeg", keys: poseKeys(1_000_000, [0, -0.5, 0], [0, 0, 0, 1]) },
        { bone: "leftLowerLeg", keys: poseKeys(1_000_000, [0, -0.5, 0], [0, 0, 0, 1]) },
        { bone: "leftFoot", keys: [{ timeUs: 0, position: [0.5, 0, 0], rotation: [0, 0, 0, 1] }, { timeUs: 1_000_000, position: [1.0, 0, 0], rotation: [0, 0, 0, 1] }] },
        { bone: "head", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
      ],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "attach",
      kind: "attach",
      propId: "sword",
      bone: "rightHand",
      localOffset: { position: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      startUs: 0,
      endUs: 1_000_000,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip }, { sword: { propId: "sword", localOffset: identity } })
    const take = compileSpatialPerformance(plan, sources)
    return { take, sources, mappingSha: canonicalJsonSha256(mapping) }
  }

  test("detects planted foot slide", () => {
    const take: ReturnType<typeof compileSpatialPerformance> = {
      kind: "slopcamera.spatial-performance-take",
      schemaVersion: 1,
      planSha256: "0".repeat(64),
      durationUs: 200_000,
      samples: [
        { timeUs: 0, boneWorld: { leftFoot: { position: [0.5, 0, 0], rotation: [0, 0, 0, 1] } }, attachments: {} },
        { timeUs: 100_000, boneWorld: { leftFoot: { position: [0.8, 0, 0], rotation: [0, 0, 0, 1] } }, attachments: {} },
      ],
      channels: [],
      receipt: {
        kind: "slopcamera.spatial-performance-receipt",
        schemaVersion: 1,
        compiler: SPATIAL_PERFORMANCE_COMPILER_ID,
        compilerSha256: "1".repeat(64),
        sceneSha256: sceneSha256,
        rigSha256: rigSha256,
        mappingSha256: "2".repeat(64),
        directivesSha256: "3".repeat(64),
        seed: 0,
        outputSha256: "4".repeat(64),
        durationUs: 200_000,
        sampleCount: 2,
      },
    } as unknown as ReturnType<typeof compileSpatialPerformance>
    const report = auditSpatialPerformance(take, { groundY: 0 })
    expect(report.findings.some((f) => f.kind === "foot-slide")).toBe(true)
  })

  test("detects gaze error", () => {
    const { take } = fixtureTakeAndSources()
    const report = auditSpatialPerformance(take, { gazeTarget: [0, 0, -10] })
    expect(report.findings.some((f) => f.kind === "gaze-error")).toBe(true)
  })

  test("detects joint overextension", () => {
    const { take } = fixtureTakeAndSources()
    const report = auditSpatialPerformance(take, {})
    expect(report.findings.some((f) => f.kind === "joint-limit")).toBe(true)
  })

  test("detects attachment drift", () => {
    const { take } = fixtureTakeAndSources()
    const report = auditSpatialPerformance(take, {})
    expect(report.findings.some((f) => f.kind === "attachment-drift")).toBe(true)
  })

  test("findings are stable-sorted", () => {
    const { take } = fixtureTakeAndSources()
    const report = auditSpatialPerformance(take, { groundY: -1 })
    const keys = report.findings.map((f) =>
      `${String(f.timeUs).padStart(16, "0")}|${f.bone ?? ""}|${f.kind}|${f.severity}|${f.entityId ?? ""}|${f.detail}`
    )
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
  })

  test("omits findings beyond the audit limit and reports the count", () => {
    const take: ReturnType<typeof compileSpatialPerformance> = {
      kind: "slopcamera.spatial-performance-take",
      schemaVersion: 1,
      planSha256: "0".repeat(64),
      durationUs: 200_000,
      samples: Array.from({ length: 1200 }, (_, i) => ({
        timeUs: i * 166,
        boneWorld: { leftFoot: { position: [0, -0.05, 0], rotation: [0, 0, 0, 1] } },
        attachments: {},
      })),
      channels: [],
      receipt: {
        kind: "slopcamera.spatial-performance-receipt",
        schemaVersion: 1,
        compiler: SPATIAL_PERFORMANCE_COMPILER_ID,
        compilerSha256: "1".repeat(64),
        sceneSha256: sceneSha256,
        rigSha256: rigSha256,
        mappingSha256: "2".repeat(64),
        directivesSha256: "3".repeat(64),
        seed: 0,
        outputSha256: "4".repeat(64),
        durationUs: 200_000,
        sampleCount: 1200,
      },
    } as unknown as ReturnType<typeof compileSpatialPerformance>
    const report = auditSpatialPerformance(take, { groundY: 0 })
    expect(report.findings.length).toBeLessThanOrEqual(1024)
    expect(report.omittedFindings).toBeGreaterThan(0)
  })
})

describe("compileSpatialPerformance two-bone IK", () => {
  function armClip(): SpatialPerformanceClip {
    return {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "rightShoulder", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "rightUpperArm", keys: poseKeys(1_000_000, [0, 0, 0.5], [0, 0, 0, 1]) },
        { bone: "rightLowerArm", keys: poseKeys(1_000_000, [0, 0, 0.5], [0, 0, 0, 1]) },
        { bone: "rightHand", keys: poseKeys(1_000_000, [0, 0, 0.5], [0, 0, 0, 1]) },
      ],
    }
  }

  test("places the hand at the target within reach", () => {
    const mapping = fullMapping()
    const clip = armClip()
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "reach",
      kind: "two-bone-ik",
      endBone: "rightHand",
      target: [0.5, 0, 0.5],
      pole: [0, 1, 0],
      policy: "stretch",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    const hand = take.samples[0]!.boneWorld["rightHand"]!
    expect(hand.position[0]).toBeCloseTo(0.5, 2)
    expect(hand.position[1]).toBeCloseTo(0, 2)
    expect(hand.position[2]).toBeCloseTo(0.5, 2)
  })

  test("stretches toward an unreachable target instead of snapping", () => {
    const mapping = fullMapping()
    const clip = armClip()
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "reach",
      kind: "two-bone-ik",
      endBone: "rightHand",
      target: [10, 0, 0],
      pole: [0, 1, 0],
      policy: "stretch",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    const hand = take.samples[0]!.boneWorld["rightHand"]!
    const base = take.samples[0]!.boneWorld["rightUpperArm"]!
    const reach = Math.hypot(hand.position[0] - base.position[0], hand.position[1] - base.position[1], hand.position[2] - base.position[2])
    expect(reach).toBeCloseTo(1, 4)
  })

  test("preserves authored pose for unreachable targets when policy is preserve", () => {
    const mapping = fullMapping()
    const clip = armClip()
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "reach",
      kind: "two-bone-ik",
      endBone: "rightHand",
      target: [10, 0, 0],
      pole: [0, 1, 0],
      policy: "preserve",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    const take = compileSpatialPerformance(plan, sources)
    const hand = take.samples[0]!.boneWorld["rightHand"]!
    expect(hand.position[0]).toBeCloseTo(0, 4)
    expect(hand.position[1]).toBeCloseTo(0, 4)
    expect(hand.position[2]).toBeCloseTo(1.5, 4)
  })
})

describe("compileSpatialPerformance additive clip layers and body masks", () => {
  test("additive layer only affects masked bones", () => {
    const mapping = fullMapping()
    const baseClip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "head", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
      ],
    }
    const addClip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "head", keys: poseKeys(1_000_000, [0, 0.2, 0], [0, 0, 0, 1]) },
        { bone: "hips", keys: poseKeys(1_000_000, [0, 0.5, 0], [0, 0, 0, 1]) },
      ],
    }
    const baseSha = clipSha256(baseClip)
    const addSha = clipSha256(addClip)
    const plan = buildPlan([{
      directiveId: "base",
      kind: "clip",
      clipDigest: baseSha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "add",
      kind: "clip",
      mode: "additive",
      mask: "head",
      clipDigest: addSha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [baseSha]: baseClip, [addSha]: addClip })
    const take = compileSpatialPerformance(plan, sources)
    const head = take.samples[0]!.boneWorld["head"]!
    const hips = take.samples[0]!.boneWorld["hips"]!
    expect(head.position[1]).toBeCloseTo(0.2, 3)
    expect(hips.position[1]).toBeCloseTo(0, 3)
  })

  test("canonical body mask bones are isolated from unmasked directives", () => {
    const mapping = fullMapping()
    const baseClip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "leftUpperArm", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
        { bone: "rightUpperArm", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) },
      ],
    }
    const addClip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [
        { bone: "leftUpperArm", keys: poseKeys(1_000_000, [0, 0.3, 0], [0, 0, 0, 1]) },
        { bone: "rightUpperArm", keys: poseKeys(1_000_000, [0, 0.3, 0], [0, 0, 0, 1]) },
      ],
    }
    const baseSha = clipSha256(baseClip)
    const addSha = clipSha256(addClip)
    const plan = buildPlan([{
      directiveId: "base",
      kind: "clip",
      clipDigest: baseSha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }, {
      directiveId: "add",
      kind: "clip",
      mode: "additive",
      mask: "leftArm",
      clipDigest: addSha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [baseSha]: baseClip, [addSha]: addClip })
    const take = compileSpatialPerformance(plan, sources)
    const leftArm = take.samples[0]!.boneWorld["leftUpperArm"]!
    const rightArm = take.samples[0]!.boneWorld["rightUpperArm"]!
    expect(leftArm.position[1]).toBeCloseTo(0.3, 3)
    expect(rightArm.position[1]).toBeCloseTo(0, 3)
  })

  test("rejects an additive clip without a body mask", () => {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "add",
      kind: "clip",
      mode: "additive",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    expect(() => compileSpatialPerformance(plan, sources)).toThrow("must declare a body mask")
  })
})

describe("performance gallery planning and selection", () => {
  function galleryTake(): ReturnType<typeof compileSpatialPerformance> {
    const mapping = fullMapping()
    const clip: SpatialPerformanceClip = {
      kind: "slopcamera.spatial-performance-clip",
      schemaVersion: 1,
      durationUs: 1_000_000,
      channels: [{ bone: "hips", keys: poseKeys(1_000_000, [0, 0, 0], [0, 0, 0, 1]) }],
    }
    const sha = clipSha256(clip)
    const plan = buildPlan([{
      directiveId: "d1",
      kind: "clip",
      clipDigest: sha,
      startUs: 0,
      endUs: 1_000_000,
      trimStartUs: 0,
      trimEndUs: 1_000_000,
      loop: "once",
      timeScale: 1,
      mode: "override",
    }], canonicalJsonSha256(mapping))
    const sources = buildSources(mapping, { [sha]: clip })
    return compileSpatialPerformance(plan, sources)
  }

  test("accepts a selection bound to matching take and receipt digests", () => {
    const take = galleryTake()
    const plan = parseSpatialPerformanceGalleryPlan({
      kind: "slopcamera.spatial-performance-gallery-plan",
      schemaVersion: 1,
      planSha256: "a".repeat(64),
      candidates: [{
        candidateId: "take-1",
        takeSha256: canonicalJsonSha256(take),
        receiptOutputSha256: take.receipt.outputSha256,
        label: "First take",
      }],
    })
    const selection = parseSpatialPerformanceGallerySelection({
      kind: "slopcamera.spatial-performance-gallery-selection",
      schemaVersion: 1,
      galleryPlanSha256: canonicalJsonSha256(plan),
      selectedCandidateId: "take-1",
      takeSha256: canonicalJsonSha256(take),
      receiptOutputSha256: take.receipt.outputSha256,
    })
    expect(() => validatePerformanceGallerySelection(selection, plan, take)).not.toThrow()
  })

  test("rejects a stale take digest", () => {
    const take = galleryTake()
    const plan = parseSpatialPerformanceGalleryPlan({
      kind: "slopcamera.spatial-performance-gallery-plan",
      schemaVersion: 1,
      planSha256: "a".repeat(64),
      candidates: [{
        candidateId: "take-1",
        takeSha256: canonicalJsonSha256(take),
        receiptOutputSha256: take.receipt.outputSha256,
        label: "First take",
      }],
    })
    const selection = parseSpatialPerformanceGallerySelection({
      kind: "slopcamera.spatial-performance-gallery-selection",
      schemaVersion: 1,
      galleryPlanSha256: canonicalJsonSha256(plan),
      selectedCandidateId: "take-1",
      takeSha256: "b".repeat(64),
      receiptOutputSha256: take.receipt.outputSha256,
    })
    expect(() => validatePerformanceGallerySelection(selection, plan, take)).toThrow("Stale or mismatched take digest")
  })

  test("rejects a stale receipt output digest", () => {
    const take = galleryTake()
    const plan = parseSpatialPerformanceGalleryPlan({
      kind: "slopcamera.spatial-performance-gallery-plan",
      schemaVersion: 1,
      planSha256: "a".repeat(64),
      candidates: [{
        candidateId: "take-1",
        takeSha256: canonicalJsonSha256(take),
        receiptOutputSha256: take.receipt.outputSha256,
        label: "First take",
      }],
    })
    const selection = parseSpatialPerformanceGallerySelection({
      kind: "slopcamera.spatial-performance-gallery-selection",
      schemaVersion: 1,
      galleryPlanSha256: canonicalJsonSha256(plan),
      selectedCandidateId: "take-1",
      takeSha256: canonicalJsonSha256(take),
      receiptOutputSha256: "c".repeat(64),
    })
    expect(() => validatePerformanceGallerySelection(selection, plan, take)).toThrow("Stale or mismatched receipt output digest")
  })

  test("rejects a selection that differs from the candidate's bound digests", () => {
    const take = galleryTake()
    const otherTake = { ...take, durationUs: take.durationUs + 1 } as unknown as ReturnType<typeof compileSpatialPerformance>
    const plan = parseSpatialPerformanceGalleryPlan({
      kind: "slopcamera.spatial-performance-gallery-plan",
      schemaVersion: 1,
      planSha256: "a".repeat(64),
      candidates: [{
        candidateId: "take-1",
        takeSha256: canonicalJsonSha256(otherTake),
        receiptOutputSha256: take.receipt.outputSha256,
        label: "First take",
      }],
    })
    const selection = parseSpatialPerformanceGallerySelection({
      kind: "slopcamera.spatial-performance-gallery-selection",
      schemaVersion: 1,
      galleryPlanSha256: canonicalJsonSha256(plan),
      selectedCandidateId: "take-1",
      takeSha256: canonicalJsonSha256(take),
      receiptOutputSha256: take.receipt.outputSha256,
    })
    expect(() => validatePerformanceGallerySelection(selection, plan, take)).toThrow("does not match the gallery candidate")
  })
})

describe("performance bake request/receipt validation", () => {
  function fakeBakeRequest(): SpatialPerformanceBakeRequest {
    return parseSpatialPerformanceBakeRequest({
      kind: "slopcamera.spatial-performance-bake-request",
      schemaVersion: 1,
      engine: { engineId: "fake-baker", profile: "v1" },
      input: { inputSha256: "a".repeat(64), inputProfile: "gltf+yup" },
      outputs: [{ outputProfile: "png" }, { outputProfile: "webp" }],
    })
  }

  function fakeBakeReceipt(request: SpatialPerformanceBakeRequest): SpatialPerformanceBakeReceipt {
    return parseSpatialPerformanceBakeReceipt({
      kind: "slopcamera.spatial-performance-bake-receipt",
      schemaVersion: 1,
      requestSha256: canonicalJsonSha256(request),
      engine: { engineId: "fake-baker", profile: "v1" },
      input: { inputSha256: "a".repeat(64), inputProfile: "gltf+yup" },
      outputs: [
        { outputProfile: "png", outputSha256: "b".repeat(64) },
        { outputProfile: "webp", outputSha256: "c".repeat(64) },
      ],
    })
  }

  test("accepts a receipt matching the request identities", () => {
    const request = fakeBakeRequest()
    const receipt = fakeBakeReceipt(request)
    expect(() => validatePerformanceBakeReceipt(request, receipt)).not.toThrow()
  })

  test("rejects a stale request digest", () => {
    const request = fakeBakeRequest()
    const receipt = parseSpatialPerformanceBakeReceipt({
      kind: "slopcamera.spatial-performance-bake-receipt",
      schemaVersion: 1,
      requestSha256: "d".repeat(64),
      engine: { engineId: "fake-baker", profile: "v1" },
      input: { inputSha256: "a".repeat(64), inputProfile: "gltf+yup" },
      outputs: [{ outputProfile: "png", outputSha256: "b".repeat(64) }],
    })
    expect(() => validatePerformanceBakeReceipt(request, receipt)).toThrow("Stale or mismatched bake request digest")
  })

  test("rejects mismatched engine identity", () => {
    const request = fakeBakeRequest()
    const receipt = parseSpatialPerformanceBakeReceipt({
      kind: "slopcamera.spatial-performance-bake-receipt",
      schemaVersion: 1,
      requestSha256: canonicalJsonSha256(request),
      engine: { engineId: "other-baker", profile: "v1" },
      input: { inputSha256: "a".repeat(64), inputProfile: "gltf+yup" },
      outputs: [{ outputProfile: "png", outputSha256: "b".repeat(64) }],
    })
    expect(() => validatePerformanceBakeReceipt(request, receipt)).toThrow("engine/profile identity mismatch")
  })

  test("rejects mismatched input identity", () => {
    const request = fakeBakeRequest()
    const receipt = parseSpatialPerformanceBakeReceipt({
      kind: "slopcamera.spatial-performance-bake-receipt",
      schemaVersion: 1,
      requestSha256: canonicalJsonSha256(request),
      engine: { engineId: "fake-baker", profile: "v1" },
      input: { inputSha256: "e".repeat(64), inputProfile: "gltf+yup" },
      outputs: [{ outputProfile: "png", outputSha256: "b".repeat(64) }],
    })
    expect(() => validatePerformanceBakeReceipt(request, receipt)).toThrow("input identity mismatch")
  })

  test("rejects unexpected output profile", () => {
    const request = fakeBakeRequest()
    const receipt = parseSpatialPerformanceBakeReceipt({
      kind: "slopcamera.spatial-performance-bake-receipt",
      schemaVersion: 1,
      requestSha256: canonicalJsonSha256(request),
      engine: { engineId: "fake-baker", profile: "v1" },
      input: { inputSha256: "a".repeat(64), inputProfile: "gltf+yup" },
      outputs: [
        { outputProfile: "png", outputSha256: "b".repeat(64) },
        { outputProfile: "jpeg", outputSha256: "c".repeat(64) },
      ],
    })
    expect(() => validatePerformanceBakeReceipt(request, receipt)).toThrow("not in the request")
  })

  test("fake adapter binds engine/profile/input/output identities", () => {
    const request = fakeBakeRequest()
    const receipt = fakeBakeReceipt(request)
    expect(receipt.engine.engineId).toBe(request.engine.engineId)
    expect(receipt.engine.profile).toBe(request.engine.profile)
    expect(receipt.input.inputSha256).toBe(request.input.inputSha256)
    expect(receipt.input.inputProfile).toBe(request.input.inputProfile)
    expect(receipt.outputs.map((output) => output.outputProfile).sort()).toEqual(request.outputs.map((output) => output.outputProfile).sort())
  })
})

import { describe, expect, test } from "bun:test"
import {
  CORE_HUMANOID_BONE_NAMES,
  evaluateHumanoidAttachmentMatrix,
  HUMANOID_BONE_NAMES,
  parseHumanoidAttachment,
  parseHumanoidMapping,
  type SpatialHumanoidAttachment,
} from "./character.js"
import { SPATIAL_GLB_PROFILE, SPATIAL_GLB_RIGGED_PROFILE, type SpatialGlbEvaluateOptions, type SpatialGlbModel, type SpatialGlbRigFacts } from "./gltf.js"
import { composeTransform, IDENTITY_MATRIX, multiplyTransforms, type Mat4 } from "./math.js"

const sourceSha256 = "a".repeat(64)
const otherSha256 = "b".repeat(64)
const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } as const
const offset = { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } as const
const options: SpatialGlbEvaluateOptions = { metersPerUnit: 1, sourceUp: "y", timeUs: 0 }

function coreMapping() {
  const bones = CORE_HUMANOID_BONE_NAMES.map((name, index) => ({ canonicalName: name, sourceNodeIndex: index + 1, restOffset: identity }))
  return { kind: "slopcamera.spatial-humanoid-mapping", schemaVersion: 1, sourceAssetSha256: sourceSha256, sourceProfile: SPATIAL_GLB_RIGGED_PROFILE, bones }
}

function rigModel(joints: readonly number[], world: Mat4, calls: { nodeIndex: number; options: SpatialGlbEvaluateOptions }[]) {
  const rigFacts = {
    profile: SPATIAL_GLB_RIGGED_PROFILE,
    skins: [{ jointNodeIndices: joints, inverseBindMatricesAccessor: 0 }],
    morphTargets: [],
    clips: [],
  } as unknown as SpatialGlbRigFacts
  return {
    profile: SPATIAL_GLB_RIGGED_PROFILE,
    rigFacts,
    nodeCount: 100,
    jointWorldMatrix: (passed: SpatialGlbEvaluateOptions, nodeIndex: number) => {
      calls.push({ nodeIndex, options: passed })
      return world
    },
  } as unknown as SpatialGlbModel
}

describe("humanoid bone names", () => {
  test("core set is a subset of the canonical names", () => {
    const names = new Set(HUMANOID_BONE_NAMES)
    for (const name of CORE_HUMANOID_BONE_NAMES) {
      expect(names.has(name)).toBe(true)
    }
  })
})

describe("parseHumanoidMapping", () => {
  test("accepts a mapping with the full core set", () => {
    const parsed = parseHumanoidMapping(coreMapping())
    expect(parsed.kind).toBe("slopcamera.spatial-humanoid-mapping")
    expect(parsed.bones.length).toBe(CORE_HUMANOID_BONE_NAMES.length)
  })

  test("rejects an unsupported canonical bone name", () => {
    const mapping = { ...coreMapping(), bones: [{ canonicalName: "unknown", sourceNodeIndex: 1, restOffset: identity }] }
    expect(() => parseHumanoidMapping(mapping)).toThrow(/Invalid option/)
  })

  test("rejects a mapping missing core bones", () => {
    const mapping = { ...coreMapping(), bones: [{ canonicalName: "hips", sourceNodeIndex: 1, restOffset: identity }] }
    expect(() => parseHumanoidMapping(mapping)).toThrow("Core bone spine is required.")
  })

  test("rejects duplicate canonical bone names", () => {
    const mapping = { ...coreMapping(), bones: [...coreMapping().bones, { canonicalName: "hips", sourceNodeIndex: 100, restOffset: identity }] }
    expect(() => parseHumanoidMapping(mapping)).toThrow("Canonical bone name must be unique.")
  })

  test("rejects duplicate source node indices", () => {
    const bones = coreMapping().bones
    bones[2] = { canonicalName: "head", sourceNodeIndex: 1, restOffset: identity }
    expect(() => parseHumanoidMapping({ ...coreMapping(), bones })).toThrow("Source node index must be unique.")
  })
})

describe("parseHumanoidAttachment", () => {
  test("accepts a named attachment", () => {
    const mapping = coreMapping()
    const attachment = {
      kind: "slopcamera.spatial-humanoid-attachment",
      schemaVersion: 1,
      name: "Hat",
      mapping,
      bone: "head",
      localOffset: identity,
    }
    const parsed = parseHumanoidAttachment(attachment)
    expect(parsed.name).toBe("Hat")
    expect(parsed.bone).toBe("head")
  })
})

describe("evaluateHumanoidAttachmentMatrix", () => {
  test("returns the joint world matrix composed with source-rest and authored local offsets", () => {
    const restOffset = { position: [0, 4, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } as const
    const source = coreMapping()
    const leftHandIndex = source.bones.findIndex((bone) => bone.canonicalName === "leftHand")
    const mapping = { ...source, bones: source.bones.map((bone, index) => index === leftHandIndex ? { ...bone, restOffset } : bone) }
    const attachment = {
      kind: "slopcamera.spatial-humanoid-attachment",
      schemaVersion: 1,
      name: "Hand item",
      mapping,
      bone: "leftHand",
      localOffset: offset,
    } as unknown as SpatialHumanoidAttachment
    const world = composeTransform({ position: [10, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] })
    const calls: { nodeIndex: number; options: SpatialGlbEvaluateOptions }[] = []
    const model = rigModel(Array.from({ length: 30 }, (_, i) => i + 1), world, calls)
    const result = evaluateHumanoidAttachmentMatrix(attachment, model, options, sourceSha256)
    expect(result).toEqual(multiplyTransforms(world, multiplyTransforms(composeTransform(restOffset), composeTransform(offset))))
    expect(calls.length).toBe(1)
    const call = calls[0]!
    expect(call.nodeIndex).toBe(leftHandIndex + 1)
    expect(call.options).toBe(options)
  })

  test("rejects a stale source digest", () => {
    const mapping = coreMapping()
    const attachment = {
      kind: "slopcamera.spatial-humanoid-attachment",
      schemaVersion: 1,
      name: "Hat",
      mapping,
      bone: "head",
      localOffset: identity,
    } as unknown as SpatialHumanoidAttachment
    const model = rigModel([1, 2, 3], IDENTITY_MATRIX, [])
    expect(() => evaluateHumanoidAttachmentMatrix(attachment, model, options, otherSha256)).toThrow("Stale source asset digest.")
  })

  test("rejects a non-rigged or mismatched source profile", () => {
    const mapping = coreMapping()
    const attachment = {
      kind: "slopcamera.spatial-humanoid-attachment",
      schemaVersion: 1,
      name: "Hat",
      mapping,
      bone: "head",
      localOffset: identity,
    } as unknown as SpatialHumanoidAttachment
    const model = { profile: SPATIAL_GLB_PROFILE, rigFacts: undefined, nodeCount: 100, jointWorldMatrix: () => IDENTITY_MATRIX } as unknown as SpatialGlbModel
    expect(() => evaluateHumanoidAttachmentMatrix(attachment, model, options, sourceSha256)).toThrow("Source profile does not match or model is not rigged.")
  })

  test("rejects an attachment bone that is not mapped", () => {
    const mapping = coreMapping()
    const attachment = {
      kind: "slopcamera.spatial-humanoid-attachment",
      schemaVersion: 1,
      name: "Eye item",
      mapping,
      bone: "leftEye",
      localOffset: identity,
    } as unknown as SpatialHumanoidAttachment
    const model = rigModel([1, 2, 3], IDENTITY_MATRIX, [])
    expect(() => evaluateHumanoidAttachmentMatrix(attachment, model, options, sourceSha256)).toThrow("Canonical bone leftEye is not mapped.")
  })

  test("rejects a mapped source node that is not a rig joint", () => {
    const mapping = { ...coreMapping() }
    const bones = mapping.bones.slice()
    const leftHandIndex = bones.findIndex((bone) => bone.canonicalName === "leftHand")
    bones[leftHandIndex] = { canonicalName: "leftHand", sourceNodeIndex: 200, restOffset: identity }
    mapping.bones = bones
    const attachment = {
      kind: "slopcamera.spatial-humanoid-attachment",
      schemaVersion: 1,
      name: "Hand item",
      mapping,
      bone: "leftHand",
      localOffset: identity,
    } as unknown as SpatialHumanoidAttachment
    const model = rigModel(Array.from({ length: 20 }, (_, i) => i + 1), IDENTITY_MATRIX, [])
    expect(() => evaluateHumanoidAttachmentMatrix(attachment, model, options, sourceSha256)).toThrow("Source node 200 is not a rig joint.")
  })
})

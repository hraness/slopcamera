import { describe, expect, test } from "bun:test"
import { SpatialAssetFactsV1Schema } from "./asset-admission.js"
import { SPATIAL_GLB_PROFILE, SPATIAL_GLB_RIGGED_PROFILE } from "./gltf.js"

const digest = "a".repeat(64)
const base = {
  kind: "slopcamera.spatial-asset-facts" as const,
  schemaVersion: 1 as const,
  subject: { path: "assets/fixture.glb", sha256: digest, bytes: 128 },
  subjectManifestSha256: digest,
  nodeCount: 3,
  clipDurationsSeconds: [1],
  bounds: { modelSpace: { min: [0, 0, 0], max: [1, 2, 1] }, sceneSpace: { min: [0, 0, 0], max: [1, 2, 1] } },
  materials: [],
}
const rig = {
  profile: SPATIAL_GLB_RIGGED_PROFILE as typeof SPATIAL_GLB_RIGGED_PROFILE,
  skins: [{ jointNodeIndices: [1, 2], inverseBindMatricesAccessor: 5 }],
  morphTargets: [[[{ name: "smile", hasPosition: true, hasNormal: false }]]],
  clips: [{ durationSeconds: 1, channels: [{ nodeIndex: 2, path: "rotation" as const }] }],
}

describe("spatial rig asset facts", () => {
  test("bind exact rig facts to the additive profile", () => {
    expect(SpatialAssetFactsV1Schema.parse({ ...base, profile: SPATIAL_GLB_RIGGED_PROFILE, rig }).rig).toEqual(rig)
    expect(() => SpatialAssetFactsV1Schema.parse({ ...base, profile: SPATIAL_GLB_RIGGED_PROFILE })).toThrow()
    expect(() => SpatialAssetFactsV1Schema.parse({ ...base, profile: SPATIAL_GLB_PROFILE, rig })).toThrow()
  })

  test("preserves legacy static facts without a rig block", () => {
    expect(SpatialAssetFactsV1Schema.parse({ ...base, profile: SPATIAL_GLB_PROFILE }).rig).toBeUndefined()
  })
})

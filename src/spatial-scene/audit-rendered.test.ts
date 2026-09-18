import { describe, expect, test } from "bun:test"
import { auditSpatialScene } from "./audit.js"
import {
  auditSpatialSceneRendered, decodeObjectIdPixels, SPATIAL_SPLAT_PROXY_REPRESENTATION,
  SpatialRenderedAuditReportSchema, type SpatialRenderedAuditFrame,
} from "./audit-rendered.js"
import type { SpatialEntity, SpatialSceneV1 } from "./contracts.js"
import { spatialAssetClosureDigests } from "./identity.js"
import { fixtureEntity, fixtureScene, fixtureTransform } from "./test-fixture.js"

const DIGEST = "a".repeat(64)
const OTHER_DIGEST = "b".repeat(64)
const WORLD_OBJECT = { entityId: "entity_box", selectionId: 1, representation: "primitive-box", placement: "world" as const }

function frame(timeUs: number, counts: Record<string, number>, objects: SpatialRenderedAuditFrame["objects"] = [WORLD_OBJECT], dimensions: { width?: number; height?: number } = {}): SpatialRenderedAuditFrame {
  return { timeUs, width: dimensions.width ?? 960, height: dimensions.height ?? 540, pngSha256: DIGEST, counts, objects }
}

function pixels(width: number, height: number, cells: readonly (readonly [number, number, number, number, number])[]): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  for (const [x, y, r, g, b] of cells) {
    const index = (y * width + x) * 4
    rgba[index] = r; rgba[index + 1] = g; rgba[index + 2] = b; rgba[index + 3] = 255
  }
  return rgba
}

describe("decodeObjectIdPixels", () => {
  test("counts RGB big-endian uint24 selection codes and treats [0,0,0,0] as no-hit", () => {
    const rgba = pixels(4, 2, [
      [0, 0, 0, 0, 1], [1, 0, 0, 0, 1], [0, 1, 0, 1, 0], [2, 1, 0, 16, 0],
    ])
    expect(decodeObjectIdPixels(rgba, 4, 2)).toEqual({ "1": 2, "256": 1, "4096": 1 })
    expect(decodeObjectIdPixels(new Uint8Array(8 * 4), 2, 4)).toEqual({})
  })

  test("rejects malformed validity, out-of-range codes, and wrong buffers", () => {
    const malformedAlpha = pixels(1, 1, [[0, 0, 0, 0, 1]])
    malformedAlpha[3] = 128
    expect(() => decodeObjectIdPixels(malformedAlpha, 1, 1)).toThrow(RangeError)
    const alphaZeroCode = pixels(1, 1, [[0, 0, 0, 0, 1]])
    alphaZeroCode[3] = 0
    expect(() => decodeObjectIdPixels(alphaZeroCode, 1, 1)).toThrow(RangeError)
    const zeroCode = pixels(1, 1, [[0, 0, 0, 0, 0]])
    zeroCode[3] = 255
    expect(() => decodeObjectIdPixels(zeroCode, 1, 1)).toThrow(RangeError)
    const oversized = pixels(1, 1, [[0, 0, 0, 16, 1]]) // code 4097
    expect(() => decodeObjectIdPixels(oversized, 1, 1)).toThrow(RangeError)
    expect(() => decodeObjectIdPixels(new Uint8Array(3), 1, 1)).toThrow(RangeError)
    expect(() => decodeObjectIdPixels(new Uint8Array(4), 0, 1)).toThrow(RangeError)
  })
})

describe("auditSpatialSceneRendered", () => {
  test("attributes pixels per sample with geometric footprint deltas", () => {
    const scene = fixtureScene()
    const report = auditSpatialSceneRendered(scene, [
      frame(0, { "1": 5_184 }),
      frame(500_000, {}),
      frame(1_000_000, { "1": 2_592 }),
    ], { cameraId: "camera_main" })
    expect(report.kind).toBe("slopcamera.spatial-rendered-audit")
    expect(report.mode).toEqual({ kind: "object-id", coverage: { kind: "alpha-threshold", threshold: 0.5 } })
    expect(report.frame).toEqual({ width: 960, height: 540, pixels: 518_400 })
    const entity = report.entities.find(item => item.entityId === "entity_box")!
    expect(entity.eligibility).toBe("renderable")
    expect(entity.selectionId).toBe(1)
    expect(entity.samples.map(sample => [sample.rendered, sample.pixels])).toEqual([[true, 5_184], [false, 0], [true, 2_592]])
    expect(entity.samples.map(sample => sample.expected)).toEqual([true, true, true])
    expect(entity.samples.map(sample => sample.lowered)).toEqual([true, true, true])
    expect(entity.samples[0]!.framePercent).toBe(1)
    expect(entity.totals).toEqual({ expected: 3, lowered: 3, rendered: 2, pixels: 7_776, maxPixels: 5_184, maxFramePercent: 1 })
    const geometric = auditSpatialScene(scene, { cameraId: "camera_main", timesUs: [0, 500_000, 1_000_000] })
    for (const [index, sample] of entity.samples.entries()) {
      const estimate = geometric.entities[0]!.samples[index]!.frustum!.pixelFootprint
      expect(sample.geometricPixels).toBe(estimate)
      expect(estimate).toBeGreaterThan(0)
      expect(sample.coverageRatio).toBe(Math.round(sample.pixels / estimate * 1_000) / 1_000)
    }
    expect(report.frames.map(item => [item.renderedPixels, item.unattributedPixels, item.loweredEntities])).toEqual([[5_184, 0, 1], [0, 0, 1], [2_592, 0, 1]])
    expect(report.summary.renderedPixels).toBe(7_776)
    expect(report.findings).toEqual([{
      severity: "info", kind: "occluded", entityId: "entity_box",
      detail: "Zero rendered pixels at 1 of 3 expected samples despite positive geometric coverage; occluded, masked, or below the coverage threshold.",
    }])
    expect(report.summary.entitiesNeverRendered).toEqual([])
    expect(Object.isFrozen(report) && Object.isFrozen(entity.samples)).toBe(true)
    expect(SpatialRenderedAuditReportSchema.parse(report)).toEqual(JSON.parse(JSON.stringify(report)))
  })

  test("reports never-rendered warnings for expected entities that drew nothing", () => {
    const report = auditSpatialSceneRendered(fixtureScene(), [frame(0, {}), frame(1_000_000, {})], { cameraId: "camera_main" })
    const entity = report.entities[0]!
    expect(entity.totals.rendered).toBe(0)
    expect(report.summary.entitiesNeverRendered).toEqual(["entity_box"])
    expect(report.findings.some(finding => finding.kind === "never-rendered" && finding.severity === "warning" && finding.entityId === "entity_box")).toBe(true)
    expect(report.findings.some(finding => finding.kind === "empty-render" && finding.severity === "warning")).toBe(true)
  })

  test("never-rendered stays informational when authored visibility never became effective", () => {
    const hidden: SpatialEntity = { ...fixtureEntity("entity_hidden"), parentId: "entity_group" }
    const group: SpatialEntity = {
      entityId: "entity_group", kind: "group", name: "Hidden", parentId: null, transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      origin: { kind: "authored" }, placement: { kind: "world" }, visible: false,
    }
    const scene: SpatialSceneV1 = { ...fixtureScene(), entities: [group, hidden] }
    // entity_group is index 1 after canonical sorting; the invisible child is not lowered.
    const objects = [
      { entityId: "entity_group", selectionId: 1, representation: "group", placement: "world" as const },
    ]
    const report = auditSpatialSceneRendered(scene, [frame(0, {}, objects)], { cameraId: "camera_main" })
    const entity = report.entities.find(item => item.entityId === "entity_hidden")!
    expect(entity.totals.expected).toBe(0)
    expect(entity.samples[0]!.lowered).toBe(false)
    expect(report.summary.entitiesNeverRendered).toEqual(["entity_hidden"])
    const finding = report.findings.find(item => item.kind === "never-rendered" && item.entityId === "entity_hidden")!
    expect(finding.severity).toBe("info")
  })

  test("flags occlusion when an expected sample with geometric coverage draws zero pixels", () => {
    const report = auditSpatialSceneRendered(fixtureScene(), [
      frame(0, { "1": 1_000 }),
      frame(500_000, {}),
    ], { cameraId: "camera_main" })
    const entity = report.entities[0]!
    expect(entity.samples[1]!.rendered).toBe(false)
    expect(entity.samples[1]!.geometricPixels).toBeGreaterThan(0)
    const finding = report.findings.find(item => item.kind === "occluded")!
    expect(finding.severity).toBe("info")
    expect(finding.entityId).toBe("entity_box")
    expect(finding.detail).toContain("1 of 2 expected samples")
  })

  test("honestly reports splats and camera-bound view masks as unsupported", () => {
    const splat: SpatialEntity = {
      entityId: "entity_splat", kind: "splat", name: "Splat", parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      origin: { kind: "authored" }, placement: { kind: "world" }, visible: true, assetId: "asset_splat",
    }
    const hud: SpatialEntity = {
      entityId: "entity_hud", kind: "image", name: "HUD", parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      origin: { kind: "authored" }, placement: { kind: "view", cameraId: "camera_main", units: "normalized", order: 0 }, visible: true,
      assetId: "asset_image", width: 1, height: 0.2, fit: "contain", opacity: 1,
    }
    const scene: SpatialSceneV1 = {
      ...fixtureScene(),
      entities: [fixtureEntity(), splat, hud],
      assets: [
        { assetId: "asset_splat", payload: { path: "assets/cloud.spz", sha256: DIGEST, bytes: 100 }, interpretation: { kind: "splat", format: "spz", metersPerUnit: 1, sourceUp: "y" }, dependencies: [], provenance: { source: "authored", description: "fixture" } },
        { assetId: "asset_image", payload: { path: "assets/hud.png", sha256: OTHER_DIGEST, bytes: 100 }, interpretation: { kind: "image", mimeType: "image/png", width: 8, height: 2, colorSpace: "srgb", alpha: "straight" }, dependencies: [], provenance: { source: "authored", description: "fixture" } },
      ],
    }
    // Sorted: entity_box(1), entity_hud(2), entity_splat(3). The real object-ID
    // pass writes the declared selection code for view surfaces too, so code 2
    // pixels attribute to entity_hud rather than reporting as unattributed.
    const objects = [
      WORLD_OBJECT,
      { entityId: "entity_hud", selectionId: 2, representation: "prepared-image-raster", placement: "view" as const, assetManifestSha256: assetDigest(scene, "asset_image") },
    ]
    const report = auditSpatialSceneRendered(scene, [frame(0, { "1": 100, "2": 20 }, objects)], { cameraId: "camera_main" })
    const byId = new Map(report.entities.map(entity => [entity.entityId, entity]))
    expect(byId.get("entity_splat")!.eligibility).toBe("unsupported-kind")
    expect(byId.get("entity_splat")!.enclosure).toEqual({ status: "unknown", reason: "requires-asset-decoding" })
    expect(byId.get("entity_hud")!.eligibility).toBe("view-masked")
    expect(byId.get("entity_hud")!.samples[0]!.lowered).toBe(true)
    expect(byId.get("entity_hud")!.samples[0]!.rendered).toBe(true)
    expect(byId.get("entity_hud")!.samples[0]!.pixels).toBe(20)
    expect(byId.get("entity_hud")!.samples[0]!.expected).toBe(true)
    expect(report.frames[0]!.unattributedPixels).toBe(0)
    expect(report.summary.renderedPixels).toBe(120)
    expect(report.summary.entitiesUnsupported).toEqual(["entity_splat"])
    expect(report.summary.entitiesViewMasked).toEqual(["entity_hud"])
    expect(report.summary.entities.proxyCoverage).toBe(0)
    expect(report.summary.entitiesProxyCoverage).toEqual([])
    const kinds = new Map(report.findings.filter(finding => finding.kind === "unsupported-kind").map(finding => [finding.entityId, finding.severity]))
    expect(kinds).toEqual(new Map([["entity_splat", "info"], ["entity_hud", "info"]]))
    // A world splat without supplied bounds reports why no proxy can stand in.
    expect(report.findings.some(finding => finding.kind === "bounds-unknown" && finding.entityId === "entity_splat")).toBe(true)
  })

  test("a bounded world splat reports proxy-coverage and attributes its proxy pixels", () => {
    const splat: SpatialEntity = {
      entityId: "entity_splat", kind: "splat", name: "Splat", parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      origin: { kind: "authored" }, placement: { kind: "world" }, visible: true, assetId: "asset_splat",
    }
    const scene: SpatialSceneV1 = {
      ...fixtureScene(),
      entities: [fixtureEntity(), splat],
      assets: [{ assetId: "asset_splat", payload: { path: "assets/cloud.spz", sha256: DIGEST, bytes: 100 }, interpretation: { kind: "splat", format: "spz", metersPerUnit: 1, sourceUp: "y" }, dependencies: [], provenance: { source: "authored", description: "fixture" } }],
    }
    // Sorted: entity_box(1), entity_splat(2). The proxy evidence row carries the
    // entity's normal selection code and names its approximate representation.
    const objects = [
      WORLD_OBJECT,
      { entityId: "entity_splat", selectionId: 2, representation: SPATIAL_SPLAT_PROXY_REPRESENTATION, placement: "world" as const, assetManifestSha256: assetDigest(scene, "asset_splat") },
    ]
    const report = auditSpatialSceneRendered(scene, [
      frame(0, { "1": 100, "2": 64 }, objects),
      frame(500_000, { "1": 90 }, objects),
    ], { cameraId: "camera_main", assetBounds: { asset_splat: { min: [-1, -1, -1], max: [1, 1, 1] } } })
    const byId = new Map(report.entities.map(entity => [entity.entityId, entity]))
    const row = byId.get("entity_splat")!
    expect(row.eligibility).toBe("proxy-coverage")
    expect(row.enclosure).toEqual({ status: "bounded" })
    expect(row.samples.map(sample => [sample.expected, sample.lowered, sample.pixels])).toEqual([[true, true, 64], [true, true, 0]])
    expect(row.samples[0]!.geometricPixels).toBeGreaterThan(0)
    expect(row.samples[0]!.coverageRatio).toBe(Math.round(64 / row.samples[0]!.geometricPixels! * 1_000) / 1_000)
    expect(report.summary.entities.proxyCoverage).toBe(1)
    expect(report.summary.entitiesProxyCoverage).toEqual(["entity_splat"])
    expect(report.summary.entitiesUnsupported).toEqual([])
    const finding = report.findings.find(item => item.kind === "proxy-coverage")!
    expect(finding).toMatchObject({ severity: "info", entityId: "entity_splat" })
    expect(finding.detail).toContain("approximate")
    expect(report.findings.some(item => item.kind === "occluded" && item.entityId === "entity_splat")).toBe(true)
    expect(SpatialRenderedAuditReportSchema.parse(report)).toEqual(JSON.parse(JSON.stringify(report)))
  })

  test("splat proxy evidence is rejected without supplied bounds or for non-splat entities", () => {
    const splat: SpatialEntity = {
      entityId: "entity_splat", kind: "splat", name: "Splat", parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      origin: { kind: "authored" }, placement: { kind: "world" }, visible: true, assetId: "asset_splat",
    }
    const viewSplat: SpatialEntity = { ...splat, entityId: "entity_view_splat", placement: { kind: "view", cameraId: "camera_main", units: "normalized", order: 0 } }
    const scene: SpatialSceneV1 = {
      ...fixtureScene(),
      entities: [fixtureEntity(), splat, viewSplat],
      assets: [{ assetId: "asset_splat", payload: { path: "assets/cloud.spz", sha256: DIGEST, bytes: 100 }, interpretation: { kind: "splat", format: "spz", metersPerUnit: 1, sourceUp: "y" }, dependencies: [], provenance: { source: "authored", description: "fixture" } }],
    }
    // Sorted: entity_box(1), entity_splat(2), entity_view_splat(3).
    const proxy = { entityId: "entity_splat", selectionId: 2, representation: SPATIAL_SPLAT_PROXY_REPRESENTATION, placement: "world" as const, assetManifestSha256: assetDigest(scene, "asset_splat") }
    const bounds = { asset_splat: { min: [-1, -1, -1] as const, max: [1, 1, 1] as const } }
    // A proxy row without supplied bounds cannot prove its enclosure.
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}, [WORLD_OBJECT, proxy])], { cameraId: "camera_main" })).toThrow("bounding-box proxy")
    // The view placement never lowers a proxy.
    const viewProxy = { entityId: "entity_view_splat", selectionId: 3, representation: SPATIAL_SPLAT_PROXY_REPRESENTATION, placement: "world" as const, assetManifestSha256: assetDigest(scene, "asset_splat") }
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}, [WORLD_OBJECT, proxy, viewProxy])], { cameraId: "camera_main", assetBounds: bounds })).toThrow("bounding-box proxy")
    // Non-splat evidence must not claim the approximate representation.
    const forged = { ...WORLD_OBJECT, representation: SPATIAL_SPLAT_PROXY_REPRESENTATION }
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}, [forged, proxy])], { cameraId: "camera_main", assetBounds: bounds })).toThrow("bounding-box proxy")
    // A splat lowered under any other representation fails closed.
    const mislabeled = { ...proxy, representation: "prepared-static-triangle-mesh" }
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}, [WORLD_OBJECT, mislabeled])], { cameraId: "camera_main", assetBounds: bounds })).toThrow("bounding-box proxy")
  })

  test("a view-placed splat stays unsupported even when its asset bounds are supplied", () => {
    const viewSplat: SpatialEntity = {
      entityId: "entity_splat", kind: "splat", name: "Splat", parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      origin: { kind: "authored" }, placement: { kind: "view", cameraId: "camera_main", units: "normalized", order: 0 }, visible: true, assetId: "asset_splat",
    }
    const scene: SpatialSceneV1 = {
      ...fixtureScene(),
      entities: [fixtureEntity(), viewSplat],
      assets: [{ assetId: "asset_splat", payload: { path: "assets/cloud.spz", sha256: DIGEST, bytes: 100 }, interpretation: { kind: "splat", format: "spz", metersPerUnit: 1, sourceUp: "y" }, dependencies: [], provenance: { source: "authored", description: "fixture" } }],
    }
    const report = auditSpatialSceneRendered(scene, [frame(0, { "1": 10 }, [WORLD_OBJECT])], {
      cameraId: "camera_main", assetBounds: { asset_splat: { min: [-1, -1, -1], max: [1, 1, 1] } },
    })
    const row = report.entities.find(item => item.entityId === "entity_splat")!
    expect(row.eligibility).toBe("unsupported-kind")
    const finding = report.findings.find(item => item.kind === "unsupported-kind" && item.entityId === "entity_splat")!
    expect(finding.detail).toContain("view-placed")
    expect(report.findings.every(item => item.kind !== "bounds-unknown")).toBe(true)
  })

  test("warns on unattributed selection codes and never invents coverage", () => {
    const report = auditSpatialSceneRendered(fixtureScene(), [
      frame(0, { "1": 10, "4096": 7 }),
      frame(500_000, { "2048": 3 }),
    ], { cameraId: "camera_main" })
    expect(report.frames[0]!.unattributedPixels).toBe(7)
    expect(report.frames[1]!.unattributedPixels).toBe(3)
    expect(report.summary.unattributedPixels).toBe(10)
    const finding = report.findings.find(item => item.kind === "unattributed-pixels")!
    expect(finding.severity).toBe("warning")
    expect(finding.detail).toContain("10 pixels across 2 frames")
  })

  test("an authored-invisible renderable entity is not a never-rendered finding", () => {
    const report = auditSpatialSceneRendered({ ...fixtureScene(), entities: [{ ...fixtureEntity(), visible: false }] },
      [frame(0, {})], { cameraId: "camera_main" })
    expect(report.entities[0]!.totals.expected).toBe(0)
    expect(report.summary.entitiesNeverRendered).toEqual([])
    expect(report.findings.every(finding => finding.kind !== "never-rendered")).toBe(true)
    expect(report.findings.some(finding => finding.kind === "empty-render")).toBe(true)
  })

  test("bounds-unknown stays informational for asset-backed entities without decoded bounds", () => {
    const assetMesh: SpatialEntity = {
      entityId: "entity_asset", kind: "mesh", name: "Asset", parentId: null, transform: fixtureTransform,
      origin: { kind: "authored" }, placement: { kind: "world" }, visible: true,
      geometry: { kind: "asset", assetId: "asset_gltf" }, material: { kind: "unlit", color: "#aa00ff", opacity: 1 },
    }
    const scene: SpatialSceneV1 = {
      ...fixtureScene(),
      entities: [assetMesh],
      assets: [{ assetId: "asset_gltf", payload: { path: "assets/model.glb", sha256: DIGEST, bytes: 100 }, interpretation: { kind: "gltf", format: "glb", metersPerUnit: 1, sourceUp: "y" }, dependencies: [], provenance: { source: "authored", description: "fixture" } }],
    }
    const objects = [{ entityId: "entity_asset", selectionId: 1, representation: "prepared-static-triangle-mesh", placement: "world" as const, assetManifestSha256: assetDigest(scene, "asset_gltf") }]
    const report = auditSpatialSceneRendered(scene, [frame(0, { "1": 50 }, objects)], { cameraId: "camera_main" })
    const entity = report.entities[0]!
    expect(entity.enclosure).toEqual({ status: "unknown", reason: "requires-asset-decoding" })
    expect(entity.samples[0]!.geometricPixels).toBeUndefined()
    expect(entity.samples[0]!.coverageRatio).toBeUndefined()
    expect(report.findings.some(finding => finding.kind === "bounds-unknown" && finding.entityId === "entity_asset")).toBe(true)
  })

  test("assetBounds supplies the geometric delta for asset-backed entities", () => {
    const assetMesh: SpatialEntity = {
      entityId: "entity_asset", kind: "mesh", name: "Asset", parentId: null, transform: fixtureTransform,
      origin: { kind: "authored" }, placement: { kind: "world" }, visible: true,
      geometry: { kind: "asset", assetId: "asset_gltf" }, material: { kind: "unlit", color: "#aa00ff", opacity: 1 },
    }
    const scene: SpatialSceneV1 = {
      ...fixtureScene(),
      entities: [assetMesh],
      assets: [{ assetId: "asset_gltf", payload: { path: "assets/model.glb", sha256: DIGEST, bytes: 100 }, interpretation: { kind: "gltf", format: "glb", metersPerUnit: 1, sourceUp: "y" }, dependencies: [], provenance: { source: "authored", description: "fixture" } }],
    }
    const objects = [{ entityId: "entity_asset", selectionId: 1, representation: "prepared-static-triangle-mesh", placement: "world" as const, assetManifestSha256: assetDigest(scene, "asset_gltf") }]
    const report = auditSpatialSceneRendered(scene, [frame(0, { "1": 50 }, objects)], {
      cameraId: "camera_main", assetBounds: { asset_gltf: { min: [-1, -1, -1], max: [1, 1, 1] } },
    })
    const sample = report.entities[0]!.samples[0]!
    expect(sample.geometricPixels).toBeGreaterThan(0)
    expect(sample.coverageRatio).toBeDefined()
    expect(report.findings.every(finding => finding.kind !== "bounds-unknown")).toBe(true)
  })

  test("is deterministic and keeps finding order canonical", () => {
    const frames = [frame(500_000, { "4096": 1 }), frame(0, {})]
    const first = auditSpatialSceneRendered(fixtureScene(), frames, { cameraId: "camera_main" })
    const second = auditSpatialSceneRendered(fixtureScene(), frames, { cameraId: "camera_main" })
    expect(second).toEqual(first)
    expect(first.timesUs).toEqual([0, 500_000])
    const order = first.findings.map(finding => `${finding.kind}:${finding.entityId ?? ""}`)
    expect(order).toEqual([...order].sort())
  })

  test("rejects evidence inconsistent with the scene or decoder contract", () => {
    const scene = fixtureScene()
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}, [{ ...WORLD_OBJECT, entityId: "entity_ghost", selectionId: 1 }])], { cameraId: "camera_main" })).toThrow("unknown entity")
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}, [{ ...WORLD_OBJECT, selectionId: 2 }])], { cameraId: "camera_main" })).toThrow("selection id")
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}), frame(0, {})], { cameraId: "camera_main" })).toThrow("unique sample times")
    expect(() => auditSpatialSceneRendered(scene, [frame(2_000_000, {})], { cameraId: "camera_main" })).toThrow("exceeds scene duration")
    expect(() => auditSpatialSceneRendered(scene, [frame(0, { "5000": 1 })], { cameraId: "camera_main" })).toThrow()
    expect(() => auditSpatialSceneRendered(scene, [frame(0, { "1": 518_401 })], { cameraId: "camera_main" })).toThrow()
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}, [WORLD_OBJECT], { height: 541 }), frame(500_000, {}, [WORLD_OBJECT])], { cameraId: "camera_main" })).toThrow("one calibrated dimension")
    expect(() => auditSpatialSceneRendered(scene, [], { cameraId: "camera_main" })).toThrow()
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {})], { cameraId: "camera_missing" })).toThrow("Unknown camera")
    expect(() => auditSpatialSceneRendered(scene, [frame(0, {}, [{ ...WORLD_OBJECT, assetManifestSha256: OTHER_DIGEST }])], { cameraId: "camera_main" })).toThrow("manifest")
  })

  test("bounds the entity-sample budget", () => {
    const entities = Array.from({ length: 2_048 }, (_, index) => fixtureEntity(`entity_${String(index).padStart(4, "0")}`))
    const frames = Array.from({ length: 33 }, (_, index) => frame(index * 30_000, {}))
    expect(() => auditSpatialSceneRendered({ ...fixtureScene(), durationUs: 960_000, entities }, frames, { cameraId: "camera_main" })).toThrow("entity-sample budget")
  })
})

function assetDigest(scene: SpatialSceneV1, assetId: string): string {
  return spatialAssetClosureDigests(scene.assets)[assetId]!
}

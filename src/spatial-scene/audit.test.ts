import { describe, expect, test } from "bun:test"
import { auditSpatialScene, SpatialAuditReportSchema } from "./audit.js"
import { createSpatialSceneStarter } from "./authoring.js"
import { fixtureAsset, fixtureCamera, fixtureEntity, fixtureScene, fixtureTransform } from "./test-fixture.js"

const auditStarter = () => auditSpatialScene(createSpatialSceneStarter(), { cameraId: "camera_hero" })

describe("geometric scene audit", () => {
  test("starter scene audits clean with bounded per-sample geometry", () => {
    const report = auditStarter()
    expect(report.kind).toBe("slopcamera.spatial-audit")
    expect(report.cameraId).toBe("camera_hero")
    expect(report.timesUs).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 3_500_000, 4_000_000])
    expect(report.summary.entities).toEqual({
      total: 4, bounded: 2, unknownBounds: 2,
      byKind: { group: 0, mesh: 2, image: 0, diagram: 0, video: 0, text: 0, light: 2, splat: 0 },
    })
    expect(report.summary.animations).toEqual({ channels: 1, targets: 1, properties: { position: 0, rotation: 1, scale: 0, opacity: 0 } })
    expect(report.summary.cameras).toEqual(["camera_hero"])
    expect(report.summary.entitiesNeverVisible).toEqual([])
    expect(report.summary.entitiesNeverInFrustum).toEqual([])
    expect(report.findings).toEqual([])
    expect(report.omittedFindings).toBe(0)
    const product = report.entities.find(entity => entity.entityId === "entity_product")!
    expect(product.enclosure).toEqual({ status: "bounded" })
    expect(product.samples).toHaveLength(9)
    for (const sample of product.samples) {
      expect(sample.visible).toBe(true)
      expect(sample.bounds!.min[0]).toBeLessThan(0)
      expect(sample.bounds!.max[0]).toBeGreaterThan(0)
      expect(sample.frustum!.contained).toBe("full")
      expect(sample.frustum!.pixelFootprint).toBeGreaterThan(0)
    }
    const key = report.entities.find(entity => entity.entityId === "entity_key")!
    expect(key.enclosure).toEqual({ status: "unknown", reason: "no-surface" })
    expect(key.samples[0]).toEqual({ timeUs: 0, visible: true })
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.findings)).toBe(true)
    expect(Object.isFrozen(product.samples[0]!.bounds)).toBe(true)
  })

  test("an off-camera entity is flagged while on-camera entities stay clean", () => {
    const starter = createSpatialSceneStarter()
    const scene = {
      ...starter,
      entities: [...starter.entities,
        { ...fixtureEntity("entity_away"), name: "Away", transform: { ...fixtureTransform, position: [50, 0, 0] } }],
    }
    const report = auditSpatialScene(scene, { cameraId: "camera_hero" })
    const finding = report.findings.find(item => item.entityId === "entity_away")!
    expect(finding).toMatchObject({ severity: "warning", kind: "off-camera" })
    expect(finding.detail).toContain("outside ×9")
    expect(report.summary.entitiesNeverInFrustum).toEqual(["entity_away"])
    const away = report.entities.find(entity => entity.entityId === "entity_away")!
    expect(away.samples.every(sample => sample.frustum!.contained === "outside")).toBe(true)
    expect(report.findings.some(item => item.kind === "empty-scene-region")).toBe(false)
  })

  test("an entity behind the camera at every sample is flagged distinctly", () => {
    const scene = {
      ...fixtureScene(),
      entities: [{ ...fixtureEntity(), transform: { ...fixtureTransform, position: [0, 0, 20] } }],
    }
    const report = auditSpatialScene(scene, { cameraId: "camera_main" })
    expect(report.findings.map(item => item.kind)).toEqual(["behind-camera-all-samples", "empty-scene-region"])
    expect(report.findings[0]).toMatchObject({ severity: "warning", entityId: "entity_box" })
    expect(report.summary.entitiesNeverInFrustum).toEqual(["entity_box"])
    const sample = report.entities[0]!.samples[0]!
    expect(sample.frustum!.contained).toBe("behind-camera")
    expect(sample.frustum!.pixelFootprint).toBe(0)
  })

  test("view-placement entities count only under their bound camera", () => {
    const overlay = {
      entityId: "entity_hud", kind: "image" as const, name: "HUD", parentId: null,
      transform: { position: [200, 200, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      placement: { kind: "view" as const, cameraId: "camera_main", units: "pixels" as const, order: 0 },
      origin: { kind: "authored" as const }, visible: true,
      assetId: "asset_image", width: 100, height: 50, fit: "contain" as const, opacity: 1,
    }
    const other = { ...overlay, entityId: "entity_hud_b", placement: { kind: "view" as const, cameraId: "camera_b", units: "pixels" as const, order: 0 } }
    const scene = {
      ...fixtureScene(),
      entities: [overlay, other],
      cameras: [fixtureCamera(), fixtureCamera("camera_b")],
      assets: [fixtureAsset()],
    }
    const report = auditSpatialScene(scene, { cameraId: "camera_main" })
    const hud = report.entities.find(entity => entity.entityId === "entity_hud")!
    expect(hud.samples[0]!.frustum).toEqual({ contained: "full", pixelFootprint: 5_000 })
    expect(hud.samples[0]!.bounds!.max[0]).toBe(250) // view-domain units, not meters
    const hudB = report.entities.find(entity => entity.entityId === "entity_hud_b")!
    expect(hudB.samples.every(sample => sample.note === "other-camera" && sample.bounds === undefined)).toBe(true)
    const finding = report.findings.find(item => item.entityId === "entity_hud_b")!
    expect(finding).toMatchObject({ severity: "info", kind: "never-visible" })
    expect(finding.detail).toContain("camera_b")
    expect(report.summary.entitiesNeverVisible).toEqual(["entity_hud_b"])
    expect(report.summary.entitiesNeverInFrustum).toEqual([])
    expect(report.findings.some(item => item.kind === "off-camera" && item.entityId === "entity_hud_b")).toBe(false)
    const otherView = auditSpatialScene(scene, { cameraId: "camera_b" })
    expect(otherView.summary.entitiesNeverVisible).toEqual(["entity_hud"])
  })

  test("caller-supplied asset bounds resolve splat enclosures; absence reports honestly", () => {
    const splat = {
      entityId: "entity_splat", kind: "splat" as const, name: "Splat", parentId: null,
      transform: fixtureTransform, placement: { kind: "world" as const },
      origin: { kind: "authored" as const }, visible: true, assetId: "asset_splat",
    }
    const scene = {
      ...fixtureScene(),
      entities: [splat],
      assets: [{ ...fixtureAsset("asset_splat"), interpretation: { kind: "splat" as const, format: "spz" as const, metersPerUnit: 1, sourceUp: "y" as const } }],
    }
    const unaudited = auditSpatialScene(scene, { cameraId: "camera_main" })
    expect(unaudited.entities[0]!.enclosure).toEqual({ status: "unknown", reason: "requires-asset-decoding" })
    expect(unaudited.entities[0]!.samples[0]!.frustum).toBeUndefined()
    const boundsFinding = unaudited.findings.find(item => item.kind === "bounds-unknown")!
    expect(boundsFinding).toMatchObject({ entityId: "entity_splat", severity: "info" })
    expect(boundsFinding.detail).toContain("assetBounds")
    expect(unaudited.findings.some(item => item.kind === "empty-scene-region")).toBe(true)
    const audited = auditSpatialScene(scene, {
      cameraId: "camera_main",
      assetBounds: { asset_splat: { min: [-1, -1, -1], max: [1, 1, 1] } },
    })
    expect(audited.entities[0]!.enclosure).toEqual({ status: "bounded" })
    expect(audited.entities[0]!.samples[0]!.frustum!.contained).toBe("full")
    expect(audited.findings).toEqual([])
    expect(() => auditSpatialScene(scene, { cameraId: "camera_main", assetBounds: { asset_missing: { min: [0, 0, 0], max: [1, 1, 1] } } }))
      .toThrow(/unknown asset_missing/u)
  })

  test("sampling, ordering and output are deterministic and bounded", () => {
    const a = auditSpatialScene(fixtureScene(), { cameraId: "camera_main", timesUs: [500_000, 0, 1_000_000, 500_000] })
    const b = auditSpatialScene(fixtureScene(), { cameraId: "camera_main", timesUs: [1_000_000, 500_000, 0, 500_000] })
    expect(a).toEqual(b)
    expect(a.timesUs).toEqual([0, 500_000, 1_000_000])
    expect(a.entities[0]!.samples.map(sample => sample.timeUs)).toEqual([0, 500_000, 1_000_000])
    const roundTripped = SpatialAuditReportSchema.parse(JSON.parse(JSON.stringify(a)) as unknown)
    expect(roundTripped).toEqual(JSON.parse(JSON.stringify(a)))
    expect(() => auditSpatialScene(fixtureScene(), { cameraId: "camera_main", timesUs: [2_000_000] })).toThrow(/exceeds scene duration/u)
    expect(() => auditSpatialScene(fixtureScene(), { cameraId: "camera_main", timesUs: Array.from({ length: 65 }, (_, index) => index) })).toThrow()
    expect(() => auditSpatialScene(fixtureScene(), { cameraId: "camera_missing" })).toThrow(/Unknown camera/u)
  })

  test("an empty or never-visible scene reports its region honestly", () => {
    const empty = auditSpatialScene({ ...fixtureScene(), entities: [] }, { cameraId: "camera_main" })
    expect(empty.findings).toHaveLength(1)
    expect(empty.findings[0]).toMatchObject({ kind: "empty-scene-region", severity: "warning" })
    const hidden = auditSpatialScene({ ...fixtureScene(), entities: [{ ...fixtureEntity(), visible: false }] }, { cameraId: "camera_main" })
    expect(hidden.findings.map(item => item.kind)).toEqual(["empty-scene-region", "never-visible"])
    expect(hidden.findings[1]).toMatchObject({ severity: "info", entityId: "entity_box" })
    expect(hidden.summary.entitiesNeverVisible).toEqual(["entity_box"])
  })
})

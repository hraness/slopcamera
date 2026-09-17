import { describe, expect, test } from "bun:test"
import { auditSpatialScene } from "./audit.js"
import { auditSpatialSceneRendered } from "./audit-rendered.js"
import { evaluateSpatialScene } from "./evaluate.js"
import { parseSpatialScene, spatialSceneSha256 } from "./identity.js"
import { inspectSpatialScene } from "./inspect.js"
import { applySpatialScenePatch } from "./patch.js"
import { fixtureAsset, fixtureEntity, fixtureScene, fixtureTransform } from "./test-fixture.js"

const environment = (overrides: Record<string, unknown> = {}) => ({
  entityId: "entity_sky", kind: "environment" as const, name: "Sky", parentId: null,
  transform: fixtureTransform, placement: { kind: "world" as const },
  origin: { kind: "authored" as const }, visible: true,
  assetId: "asset_image", role: "both" as const, intensity: 1,
  ...overrides,
})

function patch(scene: unknown, operations: unknown[]) {
  return { kind: "slopcamera.spatial-scene-patch", schemaVersion: 1, expectedSceneSha256: spatialSceneSha256(scene), operations }
}

describe("material maps and environment entities", () => {
  test("a procedural mesh material map binds an image asset into identity, inspection, and evaluation", () => {
    const scene = parseSpatialScene({
      ...fixtureScene(),
      entities: [{ ...fixtureEntity(), material: { kind: "standard", color: "#ffffff", opacity: 1, roughness: 0.8, metalness: 0, map: "asset_image" } }],
      assets: [fixtureAsset()],
    })
    expect(inspectSpatialScene(scene).entities[0]!.assetIds).toEqual(["asset_image"])
    const snapshot = evaluateSpatialScene(scene, { timeUs: 0, cameraId: "camera_main" })
    const entity = snapshot.entities[0]!.entity
    expect(entity.kind === "mesh" && entity.material.map).toBe("asset_image")
    const unmapped = parseSpatialScene({
      ...fixtureScene(),
      entities: [{ ...fixtureEntity(), material: { kind: "standard", color: "#ffffff", opacity: 1, roughness: 0.8, metalness: 0 } }],
      assets: [fixtureAsset()],
    })
    expect(spatialSceneSha256(scene)).not.toBe(spatialSceneSha256(unmapped))
    // The map is an authored material reference, not an editable override surface.
    expect(inspectSpatialScene(scene).entities[0]!.editableControls).toEqual(["color", "opacity", "transform"])
  })

  test("material maps reject missing references, non-image assets, and asset geometry", () => {
    const textured = { ...fixtureEntity(), material: { kind: "unlit" as const, color: "#ffffff", opacity: 1, map: "asset_image" } }
    for (const variant of [
      { entities: [textured] },
      { entities: [textured], assets: [{ ...fixtureAsset(), interpretation: { kind: "gltf" as const, format: "glb" as const, metersPerUnit: 1, sourceUp: "y" as const } }] },
      { entities: [{ ...textured, geometry: { kind: "asset" as const, assetId: "asset_image" } }], assets: [fixtureAsset()] },
      { entities: [{ ...textured, material: { kind: "unlit" as const, color: "#ffffff", opacity: 1, map: "asset_missing" } }], assets: [fixtureAsset()] },
    ]) expect(() => parseSpatialScene({ ...fixtureScene(), ...variant })).toThrow()
    expect(parseSpatialScene({ ...fixtureScene(), entities: [textured], assets: [fixtureAsset()] }).entities[0]).toMatchObject({ material: { map: "asset_image" } })
  })

  test("set-material replaces the whole authored material and validates the result", () => {
    const scene = parseSpatialScene({ ...fixtureScene(), assets: [fixtureAsset()] })
    const applied = applySpatialScenePatch(scene, patch(scene, [
      { kind: "set-material", entityId: "entity_box", material: { kind: "standard", color: "#112233", opacity: 0.75, roughness: 0.4, metalness: 0.2, map: "asset_image" } },
    ]))
    expect(applied.scene.entities[0]).toMatchObject({ material: { kind: "standard", color: "#112233", map: "asset_image" } })
    expect(applied.diff).toEqual([{ kind: "changed", collection: "entities", id: "entity_box", properties: ["material"] }])
    expect(() => applySpatialScenePatch(scene, patch(scene, [
      { kind: "set-material", entityId: "entity_box", material: { kind: "unlit", color: "#ffffff", opacity: 1, map: "asset_missing" } },
    ]))).toThrow()
    expect(() => applySpatialScenePatch(scene, patch(scene, [
      { kind: "set-material", entityId: "entity_missing", material: { kind: "unlit", color: "#ffffff", opacity: 1 } },
    ]))).toThrow()
    const sourceScene = parseSpatialScene({
      ...fixtureScene(),
      assets: [{ ...fixtureAsset("asset_model"), interpretation: { kind: "gltf" as const, format: "glb" as const, metersPerUnit: 1, sourceUp: "y" as const } }],
      entities: [{ ...fixtureEntity(), geometry: { kind: "asset" as const, assetId: "asset_model", materialMode: "source" as const } }],
    })
    expect(() => applySpatialScenePatch(sourceScene, patch(sourceScene, [
      { kind: "set-material", entityId: "entity_box", material: { kind: "unlit", color: "#ffffff", opacity: 1 } },
    ]))).toThrow("inert")
    const skyScene = parseSpatialScene({ ...fixtureScene(), entities: [environment()], assets: [fixtureAsset()] })
    expect(() => applySpatialScenePatch(skyScene, patch(skyScene, [
      { kind: "set-material", entityId: "entity_sky", material: { kind: "unlit", color: "#ffffff", opacity: 1 } },
    ]))).toThrow("mesh entity")
  })

  test("environment entities are unparented world placements over image assets", () => {
    const scene = parseSpatialScene({ ...fixtureScene(), entities: [environment()], assets: [fixtureAsset()] })
    expect(scene.entities[0]).toMatchObject({ kind: "environment", role: "both", intensity: 1 })
    for (const variant of [
      { entities: [{ ...environment(), placement: { kind: "view" as const, cameraId: "camera_main", units: "normalized" as const, order: 0 } }], assets: [fixtureAsset()] },
      { entities: [environment(), { ...environment({ entityId: "entity_child" }), parentId: "entity_sky" }], assets: [fixtureAsset()] },
      { entities: [{ ...environment(), role: "sky" }], assets: [fixtureAsset()] },
      { entities: [environment()], assets: [{ ...fixtureAsset(), interpretation: { kind: "splat" as const, format: "spz" as const, metersPerUnit: 1, sourceUp: "y" as const } }] },
      { entities: [environment()], assets: [] },
    ]) expect(() => parseSpatialScene({ ...fixtureScene(), ...variant })).toThrow()
    expect(inspectSpatialScene(scene).entities[0]!).toMatchObject({ kind: "environment", assetIds: ["asset_image"], editableControls: ["transform"], bounds: { status: "unknown", reason: "no-surface" } })
  })

  test("environment entities audit as no-surface without pixel expectations", () => {
    const scene = parseSpatialScene({ ...fixtureScene(), entities: [fixtureEntity(), environment()], assets: [fixtureAsset()] })
    const geometric = auditSpatialScene(scene, { cameraId: "camera_main" })
    expect(geometric.summary.entities.byKind.environment).toBe(1)
    const sky = geometric.entities.find(entity => entity.entityId === "entity_sky")!
    expect(sky.enclosure).toEqual({ status: "unknown", reason: "no-surface" })
    expect(geometric.findings.some(finding => finding.entityId === "entity_sky")).toBe(false)
    const rendered = auditSpatialSceneRendered(scene, [{
      timeUs: 0, width: 4, height: 4, pngSha256: "a".repeat(64), counts: { "1": 16 },
      objects: [{ entityId: "entity_box", selectionId: 1, representation: "primitive-box", placement: "world" }],
    }], { cameraId: "camera_main" })
    const auditedSky = rendered.entities.find(entity => entity.entityId === "entity_sky")!
    expect(auditedSky.eligibility).toBe("no-surface")
    expect(auditedSky.totals).toMatchObject({ expected: 0, lowered: 0, rendered: 0 })
  })

  test("environment rotation animates through the shared evaluation path", () => {
    const scene = parseSpatialScene({
      ...fixtureScene(),
      entities: [environment()],
      assets: [fixtureAsset()],
      animations: [{ channelId: "channel_sky", targetId: "entity_sky", property: "rotation", interpolation: "slerp",
        keys: [{ timeUs: 0, value: [0, 0, 0, 1] }, { timeUs: 1_000_000, value: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }] }],
    })
    const rotated = evaluateSpatialScene(scene, { timeUs: 1_000_000, cameraId: "camera_main" }).entities[0]!
    expect(rotated.entity.transform.rotation[1]).toBeCloseTo(Math.SQRT1_2, 6)
    const hidden = evaluateSpatialScene(parseSpatialScene({ ...scene, entities: [{ ...environment(), visible: false }] }), { timeUs: 0, cameraId: "camera_main" })
    expect(hidden.entities[0]!.visible).toBe(false)
  })
})

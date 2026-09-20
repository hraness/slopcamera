import { expect, test } from "bun:test"
import fc from "fast-check"
import { createSpatialSceneStarter } from "./authoring"
import { checkSpatialBehavior } from "./behavior"
import { bakeSpatialBehavior } from "./behavior-bake"
import { spatialBehaviorFnSignatures } from "./behavior-fns"
import { planSpatialBehaviorGallery } from "./behavior-gallery"
import { SPATIAL_BEHAVIOR_STDLIB_INTERACT } from "./behavior-stdlib"
import { SpatialSceneV1Schema } from "./contracts"
import { parseSpatialScene, spatialSceneSha256, spatialValueSha256 } from "./identity"

const starter = createSpatialSceneStarter()
const scene = {
  ...starter,
  entities: ["entity_product", "entity_pedestal"].map((id) => starter.entities.find((entity) => entity.entityId === id)!),
}
const behavior = {
  kind: "slopcamera.spatial-behavior", schemaVersion: 1, behaviorId: "behavior_identity",
  entityId: "entity_product", sceneSha256: spatialSceneSha256(scene), seed: 42,
  rangeUs: { startUs: 0, endUs: 100_000 },
  organisms: SPATIAL_BEHAVIOR_STDLIB_INTERACT.organisms, entry: SPATIAL_BEHAVIOR_STDLIB_INTERACT.entry,
  channels: ["interact", "interact.phase"],
  args: {
    state: { phaseIndex: 0, enteredUs: 0 },
    spec: { channel: "interact", phases: [{ name: "notice", minUs: 100_000 }] },
    win: { ticks: [{ tUs: 0 }, { tUs: 100_000 }] },
  },
}
const signatures = spatialBehaviorFnSignatures()

test("behavior check, bake, and gallery bind the canonical scene identity", async () => {
  const canonical = parseSpatialScene(scene)
  expect(scene.entities.map((entity) => entity.entityId)).toEqual(["entity_product", "entity_pedestal"])
  expect(canonical.entities.map((entity) => entity.entityId)).toEqual(["entity_pedestal", "entity_product"])
  const check = checkSpatialBehavior({ behavior, scene }, signatures)
  expect(check.counts.errors).toBe(0)
  expect(check.sceneSha256).toBe(spatialSceneSha256(scene))
  expect(check).toEqual(checkSpatialBehavior({ behavior, scene: canonical }, signatures))
  const bake = await bakeSpatialBehavior({ behavior, scene })
  expect(bake).toEqual(await bakeSpatialBehavior({ behavior, scene: canonical }))
  expect(bake.bake.sceneSha256).toBe(check.sceneSha256)
  expect(bake.bake.receipt.sceneSha256).toBe(check.sceneSha256)
  const gallery = await planSpatialBehaviorGallery({ behavior, scene })
  expect(gallery).toEqual(await planSpatialBehaviorGallery({ behavior, scene: canonical }))
  expect(gallery.sceneSha256).toBe(check.sceneSha256)
  for (const candidate of gallery.candidates) expect(candidate.document).toMatchObject({ sceneSha256: check.sceneSha256 })
})

test("noncanonical byte digests are stale rather than silently rebound", async () => {
  const rawDigest = spatialValueSha256(SpatialSceneV1Schema.parse(scene))
  expect(rawDigest).not.toBe(spatialSceneSha256(scene))
  const stale = { ...behavior, sceneSha256: rawDigest }
  expect(checkSpatialBehavior({ behavior: stale, scene }, signatures).findings.map((finding) => finding.code)).toContain("stale-digest")
  await expect(bakeSpatialBehavior({ behavior: stale, scene })).rejects.toThrow("stale-digest")
  await expect(planSpatialBehaviorGallery({ behavior: stale, scene })).rejects.toThrow("stale-digest")
})

test("behavior admission validates scene reference closure before execution", async () => {
  const invalid = { ...scene, entities: scene.entities.map((entity) => ({ ...entity, parentId: "entity_missing" })) }
  const bound = { ...behavior, sceneSha256: spatialValueSha256(SpatialSceneV1Schema.parse(invalid)) }
  expect(() => checkSpatialBehavior({ behavior: bound, scene: invalid }, signatures)).toThrow("entity_missing")
  await expect(bakeSpatialBehavior({ behavior: bound, scene: invalid })).rejects.toThrow("entity_missing")
  await expect(planSpatialBehaviorGallery({ behavior: bound, scene: invalid })).rejects.toThrow("entity_missing")
})

test("entity permutations preserve behavior admission and byte-identical bakes", async () => {
  const bound = { ...behavior, sceneSha256: spatialSceneSha256(starter) }
  const expectedCheck = checkSpatialBehavior({ behavior: bound, scene: starter }, signatures)
  const expectedBake = await bakeSpatialBehavior({ behavior: bound, scene: starter })
  await fc.assert(fc.asyncProperty(
    fc.shuffledSubarray([...starter.entities], { minLength: starter.entities.length, maxLength: starter.entities.length }),
    async (entities) => {
      const reordered = { ...starter, entities }
      expect(checkSpatialBehavior({ behavior: bound, scene: reordered }, signatures)).toEqual(expectedCheck)
      expect(await bakeSpatialBehavior({ behavior: bound, scene: reordered })).toEqual(expectedBake)
    },
  ), { numRuns: 24 })
})

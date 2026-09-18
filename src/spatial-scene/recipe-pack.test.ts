import { describe, expect, test } from "bun:test"

import { parseSpatialRecipePack, spatialRecipePackSha256 } from "./recipe-pack"

const pack = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "slopcamera.spatial-recipe-pack",
  schemaVersion: 1,
  packId: "recipe_fixture",
  sceneSha256: "a".repeat(64),
  direction: {
    kind: "slopcamera.spatial-direction",
    schemaVersion: 1,
    entityId: "hero",
    projectDigest: "a".repeat(64),
    beats: [{ id: "beat_one", startUs: 0, endUs: 4_000_000, intent: "Hero turns.", emotion: "calm" }],
    actions: [],
    coverage: [{ id: "coverage_one", startUs: 0, endUs: 4_000_000, rigKind: "tripod", framing: "medium", subjectId: "hero" }],
    looks: [],
  },
  axes: ["camera"],
  ...overrides,
})

describe("spatial recipe packs", () => {
  test("parse a minimal pack and derive a stable content digest", () => {
    const parsed = parseSpatialRecipePack(pack())
    expect(parsed.kind).toBe("slopcamera.spatial-recipe-pack")
    expect(parsed.axes).toEqual(["camera"])
    expect(parsed.previews).toEqual([])
    expect(spatialRecipePackSha256(parsed)).toMatch(/^[a-f0-9]{64}$/u)
    expect(spatialRecipePackSha256(parseSpatialRecipePack(pack()))).toBe(
      spatialRecipePackSha256(parsed),
    )
  })

  test("reject duplicate axes, duplicate preview names, and missing audit camera", () => {
    expect(() => parseSpatialRecipePack(pack({ axes: ["camera", "camera"] })))
      .toThrow(/axes must be unique/u)
    expect(() => parseSpatialRecipePack(pack({
      previews: [
        { name: "reel", request: {} },
        { name: "reel", request: {} },
      ],
    }))).toThrow(/names must be unique/u)
    const noCamera = pack({ temporalAudit: { timesUs: [0, 1_000_000] } })
    delete noCamera.cameraId
    expect(() => parseSpatialRecipePack(noCamera)).toThrow(/requires the pack cameraId/u)
  })

  test("enforce declared bounds on axes, previews, samples, and identity", () => {
    expect(() => parseSpatialRecipePack(pack({
      axes: ["camera", "lighting", "materials", "effects", "performance", "sequence", "camera"],
    }))).toThrow()
    expect(() => parseSpatialRecipePack(pack({
      previews: [1, 2, 3, 4, 5].map(index => ({ name: `p${index}`, request: {} })),
    }))).toThrow()
    expect(() => parseSpatialRecipePack(pack({
      cameraId: "camera_main",
      temporalAudit: { timesUs: Array.from({ length: 65 }, (_, index) => index * 1_000) },
    }))).toThrow()
    expect(() => parseSpatialRecipePack(pack({ packId: "bad-id" }))).toThrow()
    expect(() => parseSpatialRecipePack(pack({ previews: [{ name: "Reel", request: {} }] }))).toThrow()
  })

  test("carry declared effects and audit options through canonical identity", () => {
    const parsed = parseSpatialRecipePack(pack({
      cameraId: "camera_main",
      effects: {
        particleSystems: [],
        renderPlan: {
          kind: "slopcamera.spatial-render-plan", schemaVersion: 1,
          postProcess: {
              kind: "slopcamera.spatial-post-process", schemaVersion: 1,
              steps: [{ exposure: 0, kind: "tone-map", whitePoint: 1 }],
            },
          quality: {
            outputBytes: 8_000_000, particleCount: 0, pixelBudget: 2_073_600,
            simulationSteps: 0, texturePixelBudget: 2_073_600, tier: "preview",
          },
        },
        simulationBakes: [],
      },
      temporalAudit: { contacts: [], cutBeforeUs: [], timesUs: [0, 2_000_000] },
    }))
    expect(parsed.effects?.particleSystems).toEqual([])
    expect(parsed.effects?.renderPlan.quality.tier).toBe("preview")
    expect(parsed.temporalAudit?.contacts).toEqual([])
    expect(parsed.temporalAudit?.timesUs).toEqual([0, 2_000_000])
  })
})

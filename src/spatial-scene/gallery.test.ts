import { describe, expect, test } from "bun:test"

import { perspectiveFromFov } from "./build"
import { parseSpatialDirection } from "./direction"
import { parseSpatialScene, spatialValueSha256 } from "./identity"
import {
  planSpatialDirectionGallery,
  SPATIAL_GALLERY_LIMITS,
  spatialGalleryPlanSha256,
} from "./gallery"
import { SpatialDirectionCompilationSchema } from "./direction-compile"

const boxEntity = (entityId: string, position: [number, number, number]) => ({
  entityId, name: entityId, kind: "mesh", parentId: null,
  placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
  transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  geometry: { kind: "box", size: [1, 1, 1] },
  material: { kind: "unlit", color: "#112233", opacity: 1 },
})

function scene(): unknown {
  return {
    kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_gallery",
    coordinates: "right-handed-y-up-meters", durationUs: 10_000_000,
    entities: [boxEntity("entity_hero", [0, 0.5, 0])],
    cameras: [{
      cameraId: "camera_main", name: "Main",
      pose: { position: [0, 1.6, 6], rotation: [0, 0, 0, 1] },
      projection: perspectiveFromFov({ fovDeg: 50, width: 640, height: 480, near: 0.1, far: 200 }),
    }],
    animations: [], assets: [], generators: [], overrides: [],
  }
}

const sceneSha = () => spatialValueSha256(parseSpatialScene(scene()))

function direction(): unknown {
  return {
    kind: "slopcamera.spatial-direction", schemaVersion: 1,
    entityId: "hero", projectDigest: sceneSha(),
    beats: [{ id: "beat_one", startUs: 0, endUs: 6_000_000, intent: "Hero moves.", emotion: "calm" }],
    actions: [{ id: "action_walk", characterId: "hero", startUs: 0, endUs: 3_000_000, action: "walk" }],
    coverage: [
      { id: "coverage_a", startUs: 0, endUs: 2_000_000, rigKind: "dolly", framing: "wide", subjectId: "hero" },
      { id: "coverage_b", startUs: 2_000_000, endUs: 4_000_000, rigKind: "tripod", framing: "medium", subjectId: "hero" },
      { id: "coverage_c", startUs: 4_000_000, endUs: 6_000_000, rigKind: "orbit", framing: "close-up", subjectId: "hero" },
    ],
    looks: [{ id: "look_dusk", startUs: 0, endUs: 6_000_000, lighting: "warm key", atmosphere: "quiet" }],
  }
}

describe("spatial direction gallery", () => {
  test("camera axis produces six distinct rig-family candidates", () => {
    const plan = planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "camera" })
    expect(plan.kind).toBe("slopcamera.spatial-gallery-plan")
    expect(plan.axis).toBe("camera")
    expect(plan.candidates).toHaveLength(6)
    expect(new Set(plan.candidates.map((candidate) => candidate.documentSha256)).size).toBe(6)
    expect(plan.sourceSha256).toBe(spatialValueSha256(parseSpatialDirection(direction())))
    expect(plan.sceneSha256).toBe(sceneSha())
    for (const candidate of plan.candidates) {
      expect(candidate.documentKind).toBe("slopcamera.spatial-direction-compilation")
      const rigs = (candidate.document as { proposals: { cameraRigs: { kind: string }[] } }).proposals.cameraRigs
      expect(rigs.every((rig) => rig.kind === candidate.parameter)).toBe(true)
      expect(SpatialDirectionCompilationSchema.parse(candidate.document)).toBeTruthy()
    }
    expect(plan.selection).toBeUndefined()
    expect(plan.previewReel!.sampleTimesUs.length).toBeGreaterThan(0)
    expect(plan.previewReel!.sampleTimesUs.length).toBeLessThanOrEqual(SPATIAL_GALLERY_LIMITS.previewSamples)
  })

  test("sequence axis merges coverage windows and dedupes identical candidates", () => {
    const plan = planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "sequence" })
    const shotCounts = plan.candidates.map((candidate) => (candidate.document as { proposals: { shots: unknown[] } }).proposals.shots.length)
    expect(shotCounts[0]).toBe(3)
    expect(shotCounts).toContain(1)
    expect(new Set(plan.candidates.map((candidate) => candidate.documentSha256)).size).toBe(plan.candidates.length)
  })

  test("performance axis scales action pacing", () => {
    const plan = planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "performance" })
    const durations = plan.candidates.map((candidate) => {
      const doc = candidate.document as { proposals: { performance: { startUs: number; endUs: number }[] } }
      return doc.proposals.performance[0]!.endUs - doc.proposals.performance[0]!.startUs
    })
    expect(durations).toContain(3_000_000)
    expect(durations).toContain(4_500_000)
    expect(new Set(durations).size).toBeGreaterThanOrEqual(5)
  })

  test("lighting, materials, and effects axes annotate compiled look intents", () => {
    const lighting = planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "lighting" })
    for (const candidate of lighting.candidates) {
      const intents = (candidate.document as { proposals: { lookIntents: { suggestedLightingPreset?: string }[] } }).proposals.lookIntents
      expect(intents[0]!.suggestedLightingPreset).toBe(candidate.parameter)
    }
    const materials = planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "materials" })
    for (const candidate of materials.candidates) {
      const intents = (candidate.document as { proposals: { lookIntents: { suggestedMaterialPalette?: string }[] } }).proposals.lookIntents
      expect(intents[0]!.suggestedMaterialPalette).toBe(candidate.parameter)
    }
    const effects = planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "effects" })
    for (const candidate of effects.candidates) {
      expect(SpatialDirectionCompilationSchema.parse(candidate.document)).toBeTruthy()
    }
    const empty = effects.candidates.find((candidate) => candidate.parameter === "stack-0")!
    const intents = (empty.document as { proposals: { lookIntents: { suggestedPostProcess?: unknown[] }[] } }).proposals.lookIntents
    expect(intents[0]!.suggestedPostProcess).toHaveLength(0)
  })

  test("is deterministic and never selects", () => {
    const first = planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "camera" })
    const second = planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "camera" })
    expect(spatialGalleryPlanSha256(first)).toBe(spatialGalleryPlanSha256(second))
    expect(first.selection).toBeUndefined()
    expect(first.candidates.every((candidate) => /^cand_[a-f0-9]{16}$/u.test(candidate.candidateId))).toBe(true)
  })

  test("rejects malformed input and unknown axes", () => {
    expect(() => planSpatialDirectionGallery({ direction: direction(), scene: scene(), axis: "bogus" })).toThrow()
    expect(() => planSpatialDirectionGallery({ direction: { kind: "nope" }, scene: scene(), axis: "camera" })).toThrow()
  })
})

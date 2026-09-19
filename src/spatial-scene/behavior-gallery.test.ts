import { describe, expect, test } from "bun:test"

import { perspectiveFromFov } from "./build"
import { behaviorOrganismSha256, type SpatialBehaviorOrganism } from "./behavior"
import { planSpatialBehaviorGallery, spatialBehaviorGalleryPlanSha256 } from "./behavior-gallery"
import { parseSpatialScene, spatialValueSha256 } from "./identity"

const seededOrganism: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:seeded-draws",
  name: "Seeded draws",
  cells: [
    { id: "in", kind: "input", outputs: { seed: { type: "json" }, win: { type: "json" } } },
    { id: "cfg", kind: "const", outputs: { count: { type: "json", value: 2 }, channel: { type: "text", value: "seed.draws" } } },
    { id: "rng", kind: "fn", fn: "rng.seeded.v1" },
    { id: "emit", kind: "fn", fn: "channel.emit.v1" },
  ],
  edges: [
    { from: { cell: "in", port: "seed" }, to: { cell: "rng", port: "seed" } },
    { from: { cell: "cfg", port: "count" }, to: { cell: "rng", port: "count" } },
    { from: { cell: "in", port: "win" }, to: { cell: "emit", port: "window" } },
    { from: { cell: "cfg", port: "channel" }, to: { cell: "emit", port: "channel" } },
    { from: { cell: "rng", port: "draws" }, to: { cell: "emit", port: "value" } },
  ],
  interface: {
    inputs: { seed: { cell: "in", port: "seed" }, win: { cell: "in", port: "win" } },
    outputs: { out: { cell: "emit", port: "emitted" } },
  },
}
const SEEDED_DIGEST = behaviorOrganismSha256(seededOrganism)

const constantOrganism: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:emit-window",
  name: "Emit window",
  cells: [
    { id: "in", kind: "input", outputs: { win: { type: "json" } } },
    { id: "cfg", kind: "const", outputs: { channel: { type: "text", value: "alert" }, value: { type: "json", value: "ping" } } },
    { id: "emit", kind: "fn", fn: "channel.emit.v1" },
  ],
  edges: [
    { from: { cell: "in", port: "win" }, to: { cell: "emit", port: "window" } },
    { from: { cell: "cfg", port: "channel" }, to: { cell: "emit", port: "channel" } },
    { from: { cell: "cfg", port: "value" }, to: { cell: "emit", port: "value" } },
  ],
  interface: {
    inputs: { win: { cell: "in", port: "win" } },
    outputs: { out: { cell: "emit", port: "emitted" } },
  },
}
const CONSTANT_DIGEST = behaviorOrganismSha256(constantOrganism)

function scene(): unknown {
  return {
    kind: "slopcamera.spatial-scene",
    schemaVersion: 1,
    sceneId: "scene_behaved",
    coordinates: "right-handed-y-up-meters",
    durationUs: 10_000_000,
    entities: [
      {
        entityId: "entity_hero", name: "Hero", kind: "mesh", parentId: null,
        placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
        transform: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        geometry: { kind: "box", size: [0.6, 1.8, 0.4] },
        material: { kind: "unlit", color: "#224466", opacity: 1 },
      },
    ],
    cameras: [{
      cameraId: "camera_main", name: "Main",
      pose: { position: [0, 1.6, 6], rotation: [0, 0, 0, 1] },
      projection: perspectiveFromFov({ fovDeg: 50, width: 1920, height: 1080, near: 0.1, far: 200 }),
    }],
    animations: [],
    assets: [],
    generators: [],
    overrides: [],
  }
}

const sceneSha = () => spatialValueSha256(parseSpatialScene(scene()))

const behavior = (organisms: Record<string, SpatialBehaviorOrganism>, entry: string, channels: string[]): Record<string, unknown> => ({
  kind: "slopcamera.spatial-behavior",
  schemaVersion: 1,
  behaviorId: "behavior_galleried",
  entityId: "hero",
  sceneSha256: sceneSha(),
  seed: 100,
  rangeUs: { startUs: 0, endUs: 250_000 },
  organisms,
  entry,
  channels,
  args: { win: { ticks: [{ tUs: 0 }] } },
})

describe("planSpatialBehaviorGallery", () => {
  test("bakes deterministic seed variants as content-addressed candidates", async () => {
    const plan = await planSpatialBehaviorGallery({
      behavior: behavior({ [SEEDED_DIGEST]: seededOrganism }, SEEDED_DIGEST, ["seed.draws"]),
      scene: scene(),
    })
    expect(plan.kind).toBe("slopcamera.spatial-behavior-gallery")
    expect(plan.candidates).toHaveLength(6)
    expect(new Set(plan.candidates.map((candidate) => candidate.documentSha256)).size).toBe(6)
    expect(plan.candidates.map((candidate) => candidate.parameter)).toEqual([
      "seed:100", "seed:101", "seed:102", "seed:105", "seed:111", "seed:123",
    ])
    for (const candidate of plan.candidates) {
      expect(candidate.documentKind).toBe("slopcamera.spatial-behavior-bake")
      expect(candidate.candidateId).toMatch(/^cand_[a-f0-9]{16}$/u)
    }
    expect(plan).not.toHaveProperty("selection")
    expect(spatialBehaviorGalleryPlanSha256(plan)).toMatch(/^[a-f0-9]{64}$/u)
  })

  test("collapses seed-agnostic organisms to a single honest candidate", async () => {
    const plan = await planSpatialBehaviorGallery({
      behavior: behavior({ [CONSTANT_DIGEST]: constantOrganism }, CONSTANT_DIGEST, ["alert"]),
      scene: scene(),
    })
    expect(plan.candidates).toHaveLength(1)
    expect(plan.candidates[0]?.parameter).toBe("seed:100")
  })

  test("rejects a stale scene binding before baking variants", async () => {
    const doc = { ...behavior({ [CONSTANT_DIGEST]: constantOrganism }, CONSTANT_DIGEST, ["alert"]), sceneSha256: "0".repeat(64) }
    await expect(planSpatialBehaviorGallery({ behavior: doc, scene: scene() }))
      .rejects.toThrow(/stale-digest|behavior-check-failed/)
  })
})

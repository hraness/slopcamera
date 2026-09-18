import { describe, expect, test } from "bun:test"

import { perspectiveFromFov } from "./build"
import { parseSpatialScene, parseSpatialValue, spatialValueSha256 } from "./identity"
import { SpatialRenderPlanSchema, spatialRenderPlanSha256 } from "./effects"
import { SpatialParticleSystemSchema, spatialParticleSystemSha256 } from "./particle"
import {
  checkSpatialRenderEffects,
  planSpatialRenderEffects,
  spatialRenderEffectsSha256,
} from "./render-effects"

const scene = (): unknown => ({
  kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_effects",
  coordinates: "right-handed-y-up-meters", durationUs: 2_000_000,
  entities: [{
    entityId: "entity_emitter", name: "Emitter", kind: "mesh", parentId: null,
    placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    geometry: { kind: "box", size: [1, 1, 1] },
    material: { kind: "unlit", color: "#112233", opacity: 1 },
  }],
  cameras: [{
    cameraId: "camera_main", name: "Main",
    pose: { position: [0, 1.6, 6], rotation: [0, 0, 0, 1] },
    projection: perspectiveFromFov({ fovDeg: 50, width: 640, height: 480, near: 0.1, far: 200 }),
  }],
  animations: [], assets: [], generators: [], overrides: [],
})

const sceneSha = (): string => spatialValueSha256(parseSpatialScene(scene()))

const renderPlan = (): unknown => ({
  kind: "slopcamera.spatial-render-plan",
  schemaVersion: 1,
  quality: {
    outputBytes: 8_000_000, particleCount: 0, pixelBudget: 640 * 480,
    simulationSteps: 0, texturePixelBudget: 1_000_000, tier: "final",
  },
  postProcess: {
    kind: "slopcamera.spatial-post-process", schemaVersion: 1,
    steps: [{ kind: "tone-map", exposure: 1, whitePoint: 4 }],
  },
})

const particleSystem = (entityId: string = "entity_emitter"): unknown => ({
  kind: "slopcamera.spatial-particle-system",
  schemaVersion: 1,
  entityId,
  countTier: "preview",
  maxCount: 8,
  emitters: [{
    id: "emitter_01", seed: 3, rate: 4,
    shape: { kind: "point" },
    velocity: [0, 1, 0], velocitySpread: [0.1, 0.1, 0.1],
    lifetimeUs: [500_000, 1_000_000],
    colorOverLife: [[1, 1, 1, 1], [1, 0.5, 0.1, 0]],
    opacityOverLife: { keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
    sizeOverLife: { keys: [{ t: 0, value: 0.1 }, { t: 1, value: 0 }] },
  }],
  forces: [],
  killVolumes: [],
})

describe("spatial render effects plan and check", () => {
  test("plan assembles a self-verifying binding bound to the scene digest", () => {
    const binding = planSpatialRenderEffects({ scene: scene(), renderPlan: renderPlan() })
    expect(binding.document.sceneSha256).toBe(sceneSha())
    expect(binding.documentSha256).toBe(spatialRenderEffectsSha256(binding.document))
    expect(binding.document.renderPlanSha256).toBe(spatialRenderPlanSha256(binding.document.renderPlan))
    const report = checkSpatialRenderEffects({ effects: binding, scene: scene() })
    expect(report.counts.errors).toBe(0)
    expect(report.documentSha256).toBe(binding.documentSha256)
  })

  test("plan rejects particle systems on unknown entities before forming the document", () => {
    expect(() => planSpatialRenderEffects({
      scene: scene(), renderPlan: renderPlan(),
      particleSystems: [particleSystem("entity_ghost")],
    })).toThrow(/does not resolve/)
  })

  test("check flags a stale scene digest on a foreign-bound document", () => {
    const binding = planSpatialRenderEffects({ scene: scene(), renderPlan: renderPlan() })
    const stale = {
      ...binding.document,
      sceneSha256: "f".repeat(64),
    }
    const report = checkSpatialRenderEffects({ effects: stale, scene: scene() })
    expect(report.findings.some((item) => item.code === "stale-scene" && item.severity === "error")).toBe(true)
    expect(report.counts.errors).toBe(1)
  })

  test("check flags unresolved particle entities and missing assets", () => {
    const document = {
      kind: "slopcamera.spatial-render-effects",
      schemaVersion: 1,
      sceneSha256: sceneSha(),
      renderPlan: {
        kind: "slopcamera.spatial-render-plan", schemaVersion: 1,
        quality: { outputBytes: 8_000_000, particleCount: 8, pixelBudget: 640 * 480, simulationSteps: 0, texturePixelBudget: 1_000_000, tier: "final" },
      },
      renderPlanSha256: "",
      particleSystems: [{ system: particleSystem("entity_ghost"), systemSha256: "" }],
      simulationBakes: [],
    }
    // Recompute honest digests so only the closure findings fire.
    const planSha = spatialRenderPlanSha256(parseSpatialValue(SpatialRenderPlanSchema, document.renderPlan, "render plan"))
    const system = parseSpatialValue(SpatialParticleSystemSchema, document.particleSystems[0]!.system, "particle system")
    const sysSha = spatialParticleSystemSha256(system)
    document.renderPlanSha256 = planSha
    document.particleSystems[0]!.systemSha256 = sysSha
    const report = checkSpatialRenderEffects({ effects: document, scene: scene() })
    expect(report.findings.some((item) => item.code === "unresolved-entity")).toBe(true)
    expect(report.counts.particleSystems).toBe(1)
  })

  test("plan is deterministic and rejects malformed drafts", () => {
    const first = planSpatialRenderEffects({ scene: scene(), renderPlan: renderPlan() })
    const second = planSpatialRenderEffects({ scene: scene(), renderPlan: renderPlan() })
    expect(first).toEqual(second)
    expect(() => planSpatialRenderEffects({ scene: scene(), renderPlan: { kind: "nope" } })).toThrow()
    expect(() => checkSpatialRenderEffects({ effects: { kind: "nope" }, scene: scene() })).toThrow()
  })
})

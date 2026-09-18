import { describe, expect, test } from "bun:test"
import {
  SpatialPbrMaterialSchema,
  SpatialFogSchema,
  SpatialLightingRigTypeSchema,
  SpatialDerivationCandidateSchema,
  SpatialPbrMapSchema,
  SpatialUvTransformSchema,
  pbrMaterialMapAssetIds,
  pbrDerivationCandidates,
  lightingRig,
  lightingRigDescription,
  planMaterialProbeGallery,
  validatePbrMaterial,
  type SpatialPbrMaterial,
} from "./material-lighting.js"
import { SpatialMaterialSchema } from "./contracts.js"
import { parseSpatialScene, spatialSceneSha256 } from "./identity.js"
import { inspectSpatialScene } from "./inspect.js"
import { evaluateSpatialScene } from "./evaluate.js"
import { applySpatialScenePatch } from "./patch.js"
import { fixtureAsset, fixtureScene, fixtureTransform } from "./test-fixture.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalPbr(overrides: Record<string, unknown> = {}): SpatialPbrMaterial {
  return SpatialPbrMaterialSchema.parse({
    kind: "pbr", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0,
    ...overrides,
  })
}

function pbrMap(assetId = "asset_image", channel: string = "rgb", colorSpace: string = "srgb") {
  return { assetId, channel, colorSpace }
}

function fixtureLinearMap(assetId = "asset_normal") {
  return { assetId, channel: "xy-normal" as const, colorSpace: "linear" as const }
}

function pbrEntity(materialOverrides: Record<string, unknown> = {}, entityId = "entity_pbr") {
  return {
    entityId, kind: "mesh" as const, name: "PBR Box", parentId: null,
    transform: fixtureTransform,
    origin: { kind: "authored" as const }, placement: { kind: "world" as const }, visible: true,
    geometry: { kind: "box" as const, size: [2, 2, 2] as const },
    material: { kind: "pbr" as const, color: "#ff8800", opacity: 1, roughness: 0.5, metalness: 0.3, ...materialOverrides },
  }
}

function fixtureScenePbr(materialOverrides: Record<string, unknown> = {}, assets: unknown[] = []) {
  return {
    ...fixtureScene(),
    entities: [pbrEntity(materialOverrides)],
    assets,
  }
}

function patchFor(scene: unknown, operations: unknown[]) {
  return {
    kind: "slopcamera.spatial-scene-patch",
    schemaVersion: 1,
    expectedSceneSha256: spatialSceneSha256(scene),
    operations,
  }
}

// ---------------------------------------------------------------------------
// PBR Material Schema
// ---------------------------------------------------------------------------

describe("PBR material schema", () => {
  test("parses a minimal PBR material", () => {
    const material = minimalPbr()
    expect(material.kind).toBe("pbr")
    expect(material.roughness).toBe(0.5)
    expect(material.metalness).toBe(0)
  })

  test("parses PBR with all core maps", () => {
    const material = minimalPbr({
      baseColorMap: pbrMap("asset_base", "rgba", "srgb"),
      normalMap: fixtureLinearMap(),
      ormMap: { assetId: "asset_orm", channel: "orm", colorSpace: "linear" },
    })
    expect(material.baseColorMap?.assetId).toBe("asset_base")
    expect(material.normalMap?.channel).toBe("xy-normal")
    expect(material.ormMap?.channel).toBe("orm")
  })

  test("parses PBR with explicit separate roughness/metalness/AO maps", () => {
    const material = minimalPbr({
      roughnessMap: { assetId: "asset_r", channel: "g", colorSpace: "linear" },
      metalnessMap: { assetId: "asset_m", channel: "b", colorSpace: "linear" },
      aoMap: { assetId: "asset_ao", channel: "r", colorSpace: "linear" },
      aoMapIntensity: 0.8,
    })
    expect(material.roughnessMap?.assetId).toBe("asset_r")
    expect(material.aoMapIntensity).toBe(0.8)
  })

  test("rejects ORM and separate maps combined", () => {
    expect(() => SpatialPbrMaterialSchema.parse({
      kind: "pbr", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0,
      ormMap: { assetId: "asset_orm", channel: "orm", colorSpace: "linear" },
      roughnessMap: { assetId: "asset_r", channel: "r", colorSpace: "linear" },
    })).toThrow("ORM")
  })

  test("rejects wrong color space on base-color map", () => {
    expect(() => SpatialPbrMaterialSchema.parse({
      kind: "pbr", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0,
      baseColorMap: { assetId: "asset_base", channel: "rgb", colorSpace: "linear" },
    })).toThrow("sRGB")
  })

  test("rejects wrong channel on normal map", () => {
    expect(() => SpatialPbrMaterialSchema.parse({
      kind: "pbr", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0,
      normalMap: { assetId: "asset_n", channel: "rgb", colorSpace: "linear" },
    })).toThrow("xy-normal")
  })

  test("rejects wrong color space on normal map", () => {
    expect(() => SpatialPbrMaterialSchema.parse({
      kind: "pbr", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0,
      normalMap: { assetId: "asset_n", channel: "xy-normal", colorSpace: "srgb" },
    })).toThrow("linear")
  })

  test("parses PBR with clearcoat, transmission, sheen, anisotropy, IOR", () => {
    const material = minimalPbr({
      clearcoat: { factor: 1, roughness: 0.1 },
      transmission: { factor: 0.9 },
      sheen: { color: "#ff0000", roughness: 0.5 },
      anisotropy: { strength: 0.8, rotation: 1.57 },
      ior: 1.5,
    })
    expect(material.clearcoat?.factor).toBe(1)
    expect(material.transmission?.factor).toBe(0.9)
    expect(material.sheen?.color).toBe("#ff0000")
    expect(material.anisotropy?.strength).toBe(0.8)
    expect(material.ior).toBe(1.5)
  })

  test("parses PBR with emissive including map", () => {
    const material = minimalPbr({
      emissive: { color: "#ff8800", intensity: 5, map: pbrMap("asset_emissive", "rgb", "srgb") },
    })
    expect(material.emissive?.map?.assetId).toBe("asset_emissive")
  })

  test("parses PBR with height map", () => {
    const material = minimalPbr({
      heightMap: { assetId: "asset_height", channel: "r", colorSpace: "linear" },
      heightScale: 0.05,
    })
    expect(material.heightMap?.assetId).toBe("asset_height")
    expect(material.heightScale).toBe(0.05)
  })

  test("parses PBR with UV transform", () => {
    const material = minimalPbr({
      baseColorMap: { assetId: "asset_base", channel: "rgb", colorSpace: "srgb", uvTransform: { offset: [0.5, 0.5] as [number, number], rotation: 0.1, scale: [2, 2] as [number, number] } },
    })
    expect(material.baseColorMap?.uvTransform?.rotation).toBe(0.1)
  })

  test("parses PBR with alpha mode and cutoff", () => {
    const material = minimalPbr({ alphaMode: "MASK", alphaCutoff: 0.5 })
    expect(material.alphaMode).toBe("MASK")
    expect(material.alphaCutoff).toBe(0.5)
  })

  test("rejects alphaCutoff without MASK mode", () => {
    expect(() => SpatialPbrMaterialSchema.parse({
      kind: "pbr", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0,
      alphaMode: "OPAQUE", alphaCutoff: 0.5,
    })).toThrow("MASK")
  })

  test("rejects wrong channel on height map", () => {
    expect(() => SpatialPbrMaterialSchema.parse({
      kind: "pbr", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0,
      heightMap: { assetId: "asset_h", channel: "rgb", colorSpace: "linear" },
    })).toThrow("red channel")
  })
})

// ---------------------------------------------------------------------------
// PBR in the discriminated material union
// ---------------------------------------------------------------------------

describe("PBR in material discriminated union", () => {
  test("SpatialMaterialSchema accepts pbr kind", () => {
    const parsed = SpatialMaterialSchema.parse(minimalPbr())
    expect(parsed.kind).toBe("pbr")
  })

  test("unlit and standard still parse unchanged", () => {
    expect(SpatialMaterialSchema.parse({ kind: "unlit", color: "#ffffff", opacity: 1 }).kind).toBe("unlit")
    expect(SpatialMaterialSchema.parse({ kind: "standard", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0 }).kind).toBe("standard")
  })
})

// ---------------------------------------------------------------------------
// Map asset ID collection
// ---------------------------------------------------------------------------

describe("pbrMaterialMapAssetIds", () => {
  test("collects all unique map asset IDs", () => {
    const material = minimalPbr({
      baseColorMap: pbrMap("asset_base", "rgba", "srgb"),
      normalMap: fixtureLinearMap("asset_normal"),
      ormMap: { assetId: "asset_orm", channel: "orm", colorSpace: "linear" },
      emissive: { color: "#ffffff", intensity: 1, map: pbrMap("asset_emissive", "rgb", "srgb") },
      heightMap: { assetId: "asset_height", channel: "r", colorSpace: "linear" }, heightScale: 0.05,
    })
    const ids = pbrMaterialMapAssetIds(material)
    expect(ids).toContain("asset_base")
    expect(ids).toContain("asset_normal")
    expect(ids).toContain("asset_orm")
    expect(ids).toContain("asset_emissive")
    expect(ids).toContain("asset_height")
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("returns empty array for mapless PBR material", () => {
    expect(pbrMaterialMapAssetIds(minimalPbr())).toEqual([])
  })

  test("deduplicates when same asset used for multiple maps", () => {
    const material = minimalPbr({
      baseColorMap: pbrMap("asset_shared", "rgba", "srgb"),
      emissive: { color: "#ffffff", intensity: 1, map: pbrMap("asset_shared", "rgb", "srgb") },
    })
    expect(pbrMaterialMapAssetIds(material)).toEqual(["asset_shared"])
  })
})

// ---------------------------------------------------------------------------
// Derivation candidates
// ---------------------------------------------------------------------------

describe("pbrDerivationCandidates", () => {
  test("suggests normal from height when height map present and no normal", () => {
    const material = minimalPbr({ heightMap: { assetId: "asset_h", channel: "r", colorSpace: "linear" }, heightScale: 0.05 })
    const candidates = pbrDerivationCandidates(material)
    expect(candidates.some(c => c.method === "sobel-normal-from-height")).toBe(true)
    expect(candidates.every(c => c.provenance === "derived-candidate")).toBe(true)
  })

  test("does not suggest normal from height when normal map already present", () => {
    const material = minimalPbr({
      heightMap: { assetId: "asset_h", channel: "r", colorSpace: "linear" }, heightScale: 0.05,
      normalMap: fixtureLinearMap("asset_n"),
    })
    expect(pbrDerivationCandidates(material).some(c => c.method === "sobel-normal-from-height")).toBe(false)
  })

  test("suggests roughness from base-color when no roughness/ORM map", () => {
    const material = minimalPbr({ baseColorMap: pbrMap("asset_base", "rgba", "srgb") })
    const candidates = pbrDerivationCandidates(material)
    expect(candidates.some(c => c.method === "average-luminance-roughness")).toBe(true)
  })

  test("suggests height from base-color when no height map", () => {
    const material = minimalPbr({ baseColorMap: pbrMap("asset_base", "rgba", "srgb") })
    const candidates = pbrDerivationCandidates(material)
    expect(candidates.some(c => c.method === "luminance-height")).toBe(true)
  })

  test("returns no candidates for a mapless PBR material", () => {
    expect(pbrDerivationCandidates(minimalPbr())).toEqual([])
  })

  test("all candidates validate against the schema", () => {
    const material = minimalPbr({
      baseColorMap: pbrMap("asset_base", "rgba", "srgb"),
      heightMap: { assetId: "asset_h", channel: "r", colorSpace: "linear" }, heightScale: 0.05,
    })
    for (const candidate of pbrDerivationCandidates(material)) {
      expect(() => SpatialDerivationCandidateSchema.parse(candidate)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// Fog
// ---------------------------------------------------------------------------

describe("fog schema", () => {
  test("parses linear fog", () => {
    const fog = SpatialFogSchema.parse({ kind: "linear", color: "#808080", near: 10, far: 100 })
    expect(fog.kind).toBe("linear")
  })

  test("parses height fog", () => {
    const fog = SpatialFogSchema.parse({ kind: "height", color: "#cccccc", density: 0.5, heightFalloff: 2, baseHeight: 0 })
    expect(fog.kind).toBe("height")
  })

  test("rejects linear fog with far <= near", () => {
    expect(() => SpatialFogSchema.parse({ kind: "linear", color: "#808080", near: 100, far: 10 })).toThrow("far")
  })
})

// ---------------------------------------------------------------------------
// Lighting rigs
// ---------------------------------------------------------------------------

describe("lighting rigs", () => {
  const rigTypes = ["portrait", "product", "moonlight", "golden-hour", "neon-noir", "interior-window", "volumetric-stage"] as const

  for (const type of rigTypes) {
    test(`${type} rig produces valid light entities`, () => {
      const rig = lightingRig(type)
      expect(rig.description.length).toBeGreaterThan(0)
      expect(rig.entities.length).toBeGreaterThan(0)
      for (const entity of rig.entities) {
        expect(entity.kind).toBe("light")
        expect(entity.entityId).toMatch(/^entity_rig_/)
        expect(entity.placement.kind).toBe("world")
        expect(entity.intensity).toBeGreaterThan(0)
      }
    })

    test(`${type} rig has unique entity IDs`, () => {
      const ids = lightingRig(type).entities.map(e => e.entityId)
      expect(new Set(ids).size).toBe(ids.length)
    })

    test(`${type} rig description matches`, () => {
      expect(lightingRigDescription(type)).toBe(lightingRig(type).description)
    })
  }

  test("volumetric-stage uses spot lights with cone parameters", () => {
    const rig = lightingRig("volumetric-stage")
    const spots = rig.entities.filter(e => e.light === "spot")
    expect(spots.length).toBeGreaterThan(0)
    for (const spot of spots) {
      expect(spot.spot).toBeDefined()
      expect(spot.spot!.angle).toBeGreaterThan(0)
    }
  })

  test("rejects unknown rig type", () => {
    expect(() => SpatialLightingRigTypeSchema.parse("unknown")).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Material probe gallery planning
// ---------------------------------------------------------------------------

describe("planMaterialProbeGallery", () => {
  test("produces a default gallery plan", () => {
    const plan = planMaterialProbeGallery({ material: minimalPbr() })
    expect(plan.geometries.length).toBe(3)
    expect(plan.lightingRigs.length).toBe(3)
    expect(plan.cameraDistances.length).toBe(2)
    expect(plan.description).toContain("18 probes")
    expect(plan.gallerySha256).toMatch(/^[a-f0-9]{64}$/)
    expect(plan.materialSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(plan.heroAsset?.assetId).toBe("asset_material_hero_original")
    expect(plan.cells).toHaveLength(18)
    expect(new Set(plan.cells.map(cell => cell.cellId)).size).toBe(18)
  })

  test("respects custom geometry/rig/distance arrays", () => {
    const plan = planMaterialProbeGallery({
      material: minimalPbr(),
      geometries: ["sphere"],
      lightingRigs: ["moonlight"],
      cameraDistances: [5],
    })
    expect(plan.geometries).toEqual(["sphere"])
    expect(plan.lightingRigs).toEqual(["moonlight"])
    expect(plan.description).toContain("1 probe")
  })

  test("notes extensions in the description", () => {
    const plan = planMaterialProbeGallery({
      material: minimalPbr({ clearcoat: { factor: 1, roughness: 0.1 }, transmission: { factor: 0.5 } }),
    })
    expect(plan.description).toContain("clearcoat")
    expect(plan.description).toContain("transmission")
  })

  test("rejects invalid camera distance", () => {
    expect(() => planMaterialProbeGallery({ material: minimalPbr(), cameraDistances: [-1] })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Pre-render validation
// ---------------------------------------------------------------------------

describe("validatePbrMaterial", () => {
  test("passes for a mapless PBR material", () => {
    const result = validatePbrMaterial(minimalPbr(), new Map())
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("rejects missing map asset", () => {
    const material = minimalPbr({ baseColorMap: pbrMap("asset_missing", "rgba", "srgb") })
    const result = validatePbrMaterial(material, new Map())
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("missing asset")
  })

  test("rejects non-image asset for map", () => {
    const material = minimalPbr({ baseColorMap: pbrMap("asset_model", "rgba", "srgb") })
    const lookup = new Map([["asset_model", { width: 512, height: 512, kind: "gltf" }]])
    const result = validatePbrMaterial(material, lookup)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("not an image")
  })

  test("rejects pixel budget overflow", () => {
    const material = minimalPbr({
      baseColorMap: pbrMap("asset_huge", "rgba", "srgb"),
      normalMap: fixtureLinearMap("asset_huge2"),
    })
    const lookup = new Map([
      ["asset_huge", { width: 8192, height: 8192, kind: "image" }],
      ["asset_huge2", { width: 8192, height: 8192, kind: "image" }],
    ])
    const result = validatePbrMaterial(material, lookup, 100_000_000)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes("pixel"))).toBe(true)
  })

  test("rejects different decoded dimensions across material maps", () => {
    const material = minimalPbr({ baseColorMap: pbrMap("asset_base", "rgba", "srgb"), normalMap: fixtureLinearMap("asset_normal") })
    const result = validatePbrMaterial(material, new Map([
      ["asset_base", { width: 1024, height: 1024, kind: "image" }],
      ["asset_normal", { width: 512, height: 1024, kind: "image" }],
    ]))
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.includes("dimensions"))).toBe(true)
  })

  test("passes for valid PBR with maps within budget", () => {
    const material = minimalPbr({
      baseColorMap: pbrMap("asset_base", "rgba", "srgb"),
      normalMap: fixtureLinearMap("asset_normal"),
    })
    const lookup = new Map([
      ["asset_base", { width: 1024, height: 1024, kind: "image" }],
      ["asset_normal", { width: 1024, height: 1024, kind: "image" }],
    ])
    const result = validatePbrMaterial(material, lookup)
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Scene integration: PBR material in a full scene
// ---------------------------------------------------------------------------

describe("PBR scene integration", () => {
  test("a PBR mesh entity parses, evaluates, and inspects", () => {
    const scene = parseSpatialScene(fixtureScenePbr())
    expect(scene.entities[0]!.kind).toBe("mesh")
    const snapshot = evaluateSpatialScene(scene, { timeUs: 0, cameraId: "camera_main" })
    expect(snapshot.entities[0]!.entity.kind).toBe("mesh")
    const inspection = inspectSpatialScene(scene)
    expect(inspection.entities[0]!.editableControls).toContain("color")
    expect(inspection.entities[0]!.editableControls).toContain("emissive")
  })

  test("PBR scene identity differs from standard material identity", () => {
    const pbrScene = parseSpatialScene(fixtureScenePbr())
    const stdScene = parseSpatialScene({
      ...fixtureScene(),
      entities: [{
        ...pbrEntity(), material: { kind: "standard", color: "#ff8800", opacity: 1, roughness: 0.5, metalness: 0.3 },
      }],
    })
    expect(spatialSceneSha256(pbrScene)).not.toBe(spatialSceneSha256(stdScene))
  })

  test("PBR material map references are validated against scene assets", () => {
    expect(() => parseSpatialScene(fixtureScenePbr({
      baseColorMap: pbrMap("asset_missing", "rgba", "srgb"),
    }))).toThrow()

    // Valid: map references a declared image asset
    const scene = parseSpatialScene(fixtureScenePbr(
      { baseColorMap: pbrMap("asset_image", "rgba", "srgb") },
      [fixtureAsset()],
    ))
    expect(scene.entities[0]).toMatchObject({ material: { kind: "pbr" } })
  })

  test("PBR material map rejects non-image assets", () => {
    expect(() => parseSpatialScene(fixtureScenePbr(
      { baseColorMap: pbrMap("asset_model", "rgba", "srgb") },
      [{
        ...fixtureAsset("asset_model"),
        interpretation: { kind: "gltf" as const, format: "glb" as const, metersPerUnit: 1, sourceUp: "y" as const },
      }],
    ))).toThrow("image")
  })

  test("PBR material map rejects asset geometry entities", () => {
    expect(() => parseSpatialScene({
      ...fixtureScene(),
      entities: [{
        ...pbrEntity({ baseColorMap: pbrMap("asset_model", "rgba", "srgb") }),
        geometry: { kind: "asset" as const, assetId: "asset_model" },
      }],
      assets: [{
        ...fixtureAsset("asset_model"),
        interpretation: { kind: "gltf" as const, format: "glb" as const, metersPerUnit: 1, sourceUp: "y" as const },
      }],
    })).toThrow("procedural")
  })
})

// ---------------------------------------------------------------------------
// Scene integration: fog
// ---------------------------------------------------------------------------

describe("fog scene integration", () => {
  test("scene with linear fog parses and evaluates", () => {
    const scene = parseSpatialScene({
      ...fixtureScene(),
      fog: { kind: "linear", color: "#808080", near: 5, far: 50 },
    })
    expect(scene.fog).toMatchObject({ kind: "linear", near: 5, far: 50 })
    const snapshot = evaluateSpatialScene(scene, { timeUs: 0, cameraId: "camera_main" })
    expect(snapshot.fog).toMatchObject({ kind: "linear" })
  })

  test("scene with height fog parses and evaluates", () => {
    const scene = parseSpatialScene({
      ...fixtureScene(),
      fog: { kind: "height", color: "#cccccc", density: 0.3, heightFalloff: 1, baseHeight: 0 },
    })
    expect(scene.fog!.kind).toBe("height")
  })

  test("scene without fog remains undefined", () => {
    const scene = parseSpatialScene(fixtureScene())
    expect(scene.fog).toBeUndefined()
  })

  test("fog contributes to scene identity", () => {
    const noFog = parseSpatialScene(fixtureScene())
    const withFog = parseSpatialScene({ ...fixtureScene(), fog: { kind: "linear", color: "#808080", near: 5, far: 50 } })
    expect(spatialSceneSha256(noFog)).not.toBe(spatialSceneSha256(withFog))
  })
})

// ---------------------------------------------------------------------------
// Patch integration: PBR material operations
// ---------------------------------------------------------------------------

describe("PBR patch integration", () => {
  test("set-material replaces with PBR material", () => {
    const scene = parseSpatialScene(fixtureScene())
    const patched = applySpatialScenePatch(scene, patchFor(scene, [
      { kind: "set-material", entityId: "entity_box", material: minimalPbr({ color: "#112233" }) },
    ]))
    const entity = patched.scene.entities[0]!
    expect(entity.kind === "mesh" && entity.material.kind).toBe("pbr")
    expect(entity.kind === "mesh" && entity.material.color).toBe("#112233")
  })

  test("set-emissive works on PBR materials", () => {
    const scene = parseSpatialScene({
      ...fixtureScene(),
      entities: [pbrEntity()],
    })
    const patched = applySpatialScenePatch(scene, patchFor(scene, [
      { kind: "set-emissive", entityId: "entity_pbr", emissive: { color: "#ff0000", intensity: 5 } },
    ]))
    const entity = patched.scene.entities[0]!
    expect(entity.kind === "mesh" && entity.material.kind === "pbr" && entity.material.emissive?.intensity).toBe(5)
  })

  test("set-emissive can clear PBR emissive", () => {
    const scene = parseSpatialScene({
      ...fixtureScene(),
      entities: [pbrEntity({ emissive: { color: "#ff0000", intensity: 5 } })],
    })
    const patched = applySpatialScenePatch(scene, patchFor(scene, [
      { kind: "set-emissive", entityId: "entity_pbr", emissive: null },
    ]))
    const entity = patched.scene.entities[0]!
    expect(entity.kind === "mesh" && entity.material.kind === "pbr" && entity.material.emissive).toBeUndefined()
  })

  test("color override works on PBR material", () => {
    const scene = parseSpatialScene({
      ...fixtureScene(),
      entities: [pbrEntity()],
    })
    const patched = applySpatialScenePatch(scene, patchFor(scene, [
      { kind: "set-color", entityId: "entity_pbr", color: "#00ff00" },
    ]))
    const entity = patched.scene.entities[0]!
    expect(entity.kind === "mesh" && entity.material.color).toBe("#00ff00")
  })
})

// ---------------------------------------------------------------------------
// UV transform schema
// ---------------------------------------------------------------------------

describe("UV transform schema", () => {
  test("parses with identity values", () => {
    const uv = SpatialUvTransformSchema.parse({ offset: [0, 0], rotation: 0, scale: [1, 1] })
    expect(uv.offset).toEqual([0, 0])
    expect(uv.rotation).toBe(0)
    expect(uv.scale).toEqual([1, 1])
  })

  test("parses with explicit values", () => {
    const uv = SpatialUvTransformSchema.parse({ offset: [0.5, 0.5], rotation: 1.0, scale: [2, 3] })
    expect(uv.offset).toEqual([0.5, 0.5])
    expect(uv.rotation).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// PBR map schema
// ---------------------------------------------------------------------------

describe("PBR map schema", () => {
  test("parses valid map reference", () => {
    const map = SpatialPbrMapSchema.parse({ assetId: "asset_base", channel: "rgb", colorSpace: "srgb" })
    expect(map.assetId).toBe("asset_base")
    expect(map.uvTransform).toBeUndefined()
  })

  test("parses map with UV transform", () => {
    const map = SpatialPbrMapSchema.parse({
      assetId: "asset_base", channel: "rgba", colorSpace: "srgb",
      uvTransform: { offset: [0.1, 0.2], rotation: 0, scale: [1, 1] },
    })
    expect(map.uvTransform?.offset).toEqual([0.1, 0.2])
  })

  test("rejects invalid channel", () => {
    expect(() => SpatialPbrMapSchema.parse({ assetId: "asset_base", channel: "invalid", colorSpace: "srgb" })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Legacy material backward compatibility
// ---------------------------------------------------------------------------

describe("legacy material backward compatibility", () => {
  test("existing unlit material tests still pass (smoke)", () => {
    const scene = parseSpatialScene(fixtureScene())
    expect(scene.entities[0]!.kind === "mesh" && scene.entities[0]!.material.kind).toBe("unlit")
  })

  test("existing standard material with emissive still works", () => {
    const scene = parseSpatialScene({
      ...fixtureScene(),
      entities: [{
        ...pbrEntity(), material: { kind: "standard", color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0, emissive: { color: "#ff0000", intensity: 2 } },
      }],
    })
    const entity = scene.entities[0]!
    expect(entity.kind === "mesh" && entity.material.kind).toBe("standard")
  })
})

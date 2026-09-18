import { describe, expect, test } from "bun:test"

import type { SpatialAssetManifest } from "./contracts.js"
import { parseSpatialScene } from "./identity.js"
import { galleryProbeRenderRequest, galleryProbeScene } from "./probe.js"

const candidateAsset: SpatialAssetManifest = {
  assetId: "asset_candidate",
  dependencies: [],
  interpretation: {
    alpha: "opaque",
    colorSpace: "srgb",
    height: 512,
    kind: "image",
    mimeType: "image/png",
    width: 512,
  },
  payload: {
    bytes: 1_024,
    path: "candidate.png",
    sha256: "a".repeat(64),
  },
  provenance: {
    description: "Gallery candidate probe preview.",
    source: "generated",
  },
}

describe("galleryProbeScene", () => {
  test("binds a texture candidate to lit subject geometry", () => {
    const scene = galleryProbeScene("texture", candidateAsset)
    expect(scene.kind).toBe("slopcamera.spatial-scene")
    const meshes = scene.entities.filter(entity => entity.kind === "mesh")
    expect(meshes.length).toBeGreaterThanOrEqual(5)
    const mapped = meshes.filter(
      entity => entity.entityId === "entity_subject"
        || entity.entityId.startsWith("entity_wall_"),
    )
    expect(mapped).toHaveLength(5)
    for (const mesh of mapped) {
      expect(mesh.material.kind !== "pbr" && mesh.material.map).toBe("asset_candidate")
    }
    expect(scene.entities.some(entity => entity.kind === "light")).toBe(true)
    expect(scene.cameras[0]?.cameraId).toBe("camera_probe")
  })

  test("binds a skybox candidate as the scene environment", () => {
    const scene = galleryProbeScene("skybox", candidateAsset)
    const environment = scene.entities.find(
      entity => entity.kind === "environment",
    )
    expect(environment).toMatchObject({
      assetId: "asset_candidate",
      kind: "environment",
      role: "both",
    })
    expect(
      scene.entities.some(
        entity => entity.kind === "mesh" && entity.material.kind !== "pbr" && entity.material.map === "asset_candidate",
      ),
    ).toBe(false)
  })

  test("binds a backdrop candidate to a scene surface", () => {
    const scene = galleryProbeScene("backdrop", candidateAsset)
    const backdrop = scene.entities.find(entity => entity.kind === "image")
    expect(backdrop).toMatchObject({
      assetId: "asset_candidate",
      entityId: "entity_backdrop",
      kind: "image",
    })
  })

  test("rejects malformed scenes and non-candidate asset ids", () => {
    for (const mode of ["texture", "skybox", "backdrop"] as const) {
      const scene = galleryProbeScene(mode, candidateAsset)
      expect(() => parseSpatialScene(scene)).not.toThrow()
    }
    expect(() => galleryProbeScene("texture", {
      ...candidateAsset,
      assetId: "not-prefixed",
    })).toThrow()
  })
})

describe("galleryProbeRenderRequest", () => {
  test("requests one beauty frame from the probe camera", () => {
    expect(galleryProbeRenderRequest()).toEqual({
      cameraId: "camera_probe",
      mode: { kind: "beauty" },
      selection: { kind: "frame", timeUs: 0 },
    })
  })
})

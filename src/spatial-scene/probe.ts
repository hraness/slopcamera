import type { SpatialAssetManifest, SpatialSceneV1 } from "./contracts.js"
import { parseSpatialScene } from "./identity.js"

/**
 * The gallery probe scene is a fixed checked-in template — never
 * caller-authored — that substitutes one admitted candidate asset so a
 * rendered still proves how it behaves in a scene: on lit geometry for a
 * texture, as `scene.background`/`scene.environment` lighting for a skybox,
 * or as a flat backdrop surface behind a lit subject.
 */
export type SlopcameraGalleryProbeMode = "texture" | "skybox" | "backdrop"

const transform = (position: readonly [number, number, number]) => ({
  position,
  rotation: [0, 0, 0, 1] as const,
  scale: [1, 1, 1] as const,
})

const entityBase = {
  parentId: null,
  placement: { kind: "world" as const },
  origin: { kind: "authored" as const },
  visible: true,
}

const neutral = {
  kind: "standard" as const,
  color: "#8b95a7",
  opacity: 1,
  roughness: 0.55,
  metalness: 0.05,
}

export function galleryProbeScene(
  mode: SlopcameraGalleryProbeMode,
  asset: SpatialAssetManifest,
): SpatialSceneV1 {
  const subjectMaterial = mode === "texture"
    ? { kind: "standard" as const, color: "#ffffff", opacity: 1, roughness: 0.75, metalness: 0, map: asset.assetId }
    : mode === "skybox"
      // A reflective sphere shows what the environment actually lights.
      ? { kind: "standard" as const, color: "#cfd6e4", opacity: 1, roughness: 0.18, metalness: 0.85 }
      : neutral
  const entities: unknown[] = [
    {
      ...entityBase, entityId: "entity_subject", name: "Subject", kind: "mesh",
      transform: transform([0, 0.15, 0]),
      geometry: { kind: "sphere", radius: 0.9 },
      material: subjectMaterial,
    },
    {
      ...entityBase, entityId: "entity_ground", name: "Ground", kind: "mesh",
      transform: {
        position: [0, -0.75, 0],
        rotation: [-0.7071067811865476, 0, 0, 0.7071067811865476],
        scale: [1, 1, 1],
      },
      geometry: { kind: "plane", width: 10, height: 10 },
      material: { ...neutral, roughness: 0.9 },
    },
    {
      ...entityBase, entityId: "entity_fill", name: "Fill", kind: "light",
      transform: transform([0, 0, 0]),
      light: "ambient", color: "#ffffff", intensity: 1.6,
    },
    {
      ...entityBase, entityId: "entity_key", name: "Key", kind: "light",
      transform: transform([3, 4, 5]),
      light: "directional", color: "#ffffff", intensity: 3,
    },
  ]
  if (mode === "texture") {
    const wallTiles = [
      [-2.5, 0.2, -3],
      [2.5, 0.2, -3],
      [-2.5, 3, -3],
      [2.5, 3, -3],
    ] as const
    for (const [index, position] of wallTiles.entries()) {
      entities.push({
        ...entityBase,
        entityId: `entity_wall_${String(index + 1)}`,
        name: `Wall tile ${String(index + 1)}`,
        kind: "mesh",
        transform: transform(position),
        geometry: { kind: "plane", width: 5, height: 2.8 },
        material: {
          kind: "standard", color: "#ffffff", opacity: 1, roughness: 0.85,
          metalness: 0, map: asset.assetId,
        },
      })
    }
  }
  if (mode === "skybox") {
    entities.push({
      ...entityBase, entityId: "entity_environment", name: "Environment",
      kind: "environment", transform: transform([0, 0, 0]),
      assetId: asset.assetId, role: "both", intensity: 1,
    })
  }
  if (mode === "backdrop") {
    entities.push({
      ...entityBase, entityId: "entity_backdrop", name: "Backdrop", kind: "image",
      transform: transform([0, 1.6, -3]),
      assetId: asset.assetId, width: 12, height: 6.75, fit: "cover", opacity: 1,
    })
  }
  return parseSpatialScene({
    kind: "slopcamera.spatial-scene",
    schemaVersion: 1,
    sceneId: "scene_gallery_probe",
    coordinates: "right-handed-y-up-meters",
    durationUs: 4_000_000,
    entities,
    cameras: [{
      cameraId: "camera_probe",
      name: "Probe",
      pose: { position: [0, 0.5, 4.4], rotation: [0, 0, 0, 1] },
      projection: {
        kind: "perspective", width: 960, height: 540,
        fx: 650, fy: 650, cx: 480, cy: 270, near: 0.1, far: 100,
      },
    }],
    assets: [asset],
    animations: [],
    generators: [],
    overrides: [],
  })
}

export function galleryProbeRenderRequest() {
  return {
    cameraId: "camera_probe",
    mode: { kind: "beauty" as const },
    selection: { kind: "frame" as const, timeUs: 0 },
  }
}

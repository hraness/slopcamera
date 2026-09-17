import { describe, expect, test } from "bun:test"

import {
  parseSlopcameraSceneVariants,
  planSlopcameraSceneGallery,
  slopcameraSceneGalleryLimits,
  summarizeSceneVariantPatch,
} from "./scene-gallery.js"
import type { SpatialSceneV1 } from "./spatial-scene/contracts.js"
import {
  parseSpatialScene,
  spatialSceneSha256,
} from "./spatial-scene/identity.js"
import { diffSpatialScenes } from "./spatial-scene/patch.js"

const baseScene: SpatialSceneV1 = parseSpatialScene({
  kind: "slopcamera.spatial-scene",
  schemaVersion: 1,
  sceneId: "scene_gallery_base",
  coordinates: "right-handed-y-up-meters",
  durationUs: 1_000_000,
  entities: [
    {
      entityId: "entity_subject",
      name: "Subject",
      kind: "mesh",
      parentId: null,
      placement: { kind: "world" },
      origin: { kind: "authored" },
      visible: true,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      geometry: { kind: "sphere", radius: 1 },
      material: {
        kind: "standard",
        color: "#8899aa",
        opacity: 1,
        roughness: 0.5,
        metalness: 0.1,
      },
    },
  ],
  cameras: [
    {
      cameraId: "camera_main",
      name: "Main",
      pose: {
        position: [0, 1, 5],
        rotation: [0, 0, 0, 1],
      },
      projection: {
        kind: "perspective",
        width: 960,
        height: 540,
        near: 0.1,
        far: 100,
        fx: 800,
        fy: 800,
        cx: 480,
        cy: 270,
      },
    },
  ],
  assets: [],
  animations: [],
  generators: [],
  overrides: [],
})

const variantsDocument = {
  kind: "slopcamera.scene-variants",
  schemaVersion: 1,
  variants: [
    {
      id: "dusk",
      label: "Dusk",
      patch: {
        kind: "slopcamera.spatial-scene-patch",
        schemaVersion: 1,
        operations: [
          { kind: "set-color", entityId: "entity_subject", color: "#ff5522" },
        ],
      },
    },
    {
      id: "wide",
      patch: {
        kind: "slopcamera.spatial-scene-patch",
        schemaVersion: 1,
        operations: [
          {
            kind: "set-transform",
            entityId: "entity_subject",
            transform: {
              position: [2, 0, 0],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
            },
          },
        ],
      },
    },
  ],
}

describe("planSlopcameraSceneGallery", () => {
  test("derives one bounded variant per typed patch with digests", () => {
    const gallery = planSlopcameraSceneGallery({
      scene: baseScene,
      variants: variantsDocument,
    })
    expect(gallery.baseSceneSha256).toBe(spatialSceneSha256(baseScene))
    expect(gallery.variants).toHaveLength(2)

    const dusk = gallery.variants[0]!
    expect(dusk.id).toBe("dusk")
    expect(dusk.index).toBe(1)
    expect(dusk.label).toBe("Dusk")
    expect(dusk.prompt).toContain("set-color entity_subject")
    expect(dusk.patchSha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(dusk.sceneSha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(dusk.sceneSha256).not.toBe(gallery.baseSceneSha256)
    // The derived scene carries the patched color; the base is untouched.
    const subject = dusk.scene.entities.find(
      entity => entity.entityId === "entity_subject",
    )
    expect(subject?.kind).toBe("mesh")
    if (subject?.kind === "mesh") {
      expect(subject.material.color).toBe("#ff5522")
    }
    const baseSubject = gallery.scene.entities.find(
      entity => entity.entityId === "entity_subject",
    )
    if (baseSubject?.kind === "mesh") {
      expect(baseSubject.material.color).toBe("#8899aa")
    }
    expect(dusk.diff).toEqual(diffSpatialScenes(baseScene, dusk.scene))
  })

  test("stamps the base digest when a patch omits it and honors an exact match", () => {
    const gallery = planSlopcameraSceneGallery({
      scene: baseScene,
      variants: {
        kind: "slopcamera.scene-variants",
        schemaVersion: 1,
        variants: [
          {
            id: "pinned",
            patch: {
              kind: "slopcamera.spatial-scene-patch",
              schemaVersion: 1,
              expectedSceneSha256: spatialSceneSha256(baseScene),
              operations: [
                {
                  kind: "set-opacity",
                  entityId: "entity_subject",
                  opacity: 0.5,
                },
              ],
            },
          },
        ],
      },
    })
    expect(gallery.variants[0]?.id).toBe("pinned")
  })

  test("rejects a patch authored against a different scene revision", () => {
    expect(() =>
      planSlopcameraSceneGallery({
        scene: baseScene,
        variants: {
          kind: "slopcamera.scene-variants",
          schemaVersion: 1,
          variants: [
            {
              id: "stale",
              patch: {
                kind: "slopcamera.spatial-scene-patch",
                schemaVersion: 1,
                expectedSceneSha256: "0".repeat(64),
                operations: [
                  {
                    kind: "set-color",
                    entityId: "entity_subject",
                    color: "#112233",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toThrow(/different scene revision|Scene revision changed/u)
  })

  test("rejects duplicate ids, unknown ops, and over-bounded documents", () => {
    expect(() =>
      planSlopcameraSceneGallery({
        scene: baseScene,
        variants: {
          kind: "slopcamera.scene-variants",
          schemaVersion: 1,
          variants: [variantsDocument.variants[0], variantsDocument.variants[0]],
        },
      }),
    ).toThrow(/Duplicate scene variant id/u)

    expect(() =>
      planSlopcameraSceneGallery({
        scene: baseScene,
        variants: {
          kind: "slopcamera.scene-variants",
          schemaVersion: 1,
          variants: [
            {
              id: "bogus",
              patch: {
                kind: "slopcamera.spatial-scene-patch",
                schemaVersion: 1,
                operations: [{ kind: "explode", entityId: "entity_subject" }],
              },
            },
          ],
        },
      }),
    ).toThrow()

    const many = Array.from(
      { length: slopcameraSceneGalleryLimits.variants + 1 },
      (_, index) => ({
        id: `variant-${index}`,
        patch: {
          kind: "slopcamera.spatial-scene-patch",
          schemaVersion: 1,
          operations: [
            {
              kind: "set-color",
              entityId: "entity_subject",
              color: "#112233",
            },
          ],
        },
      }),
    )
    expect(() =>
      planSlopcameraSceneGallery({
        scene: baseScene,
        variants: {
          kind: "slopcamera.scene-variants",
          schemaVersion: 1,
          variants: many,
        },
      }),
    ).toThrow()
  })

  test("rejects a failed patch and leaves the base scene intact", () => {
    expect(() =>
      planSlopcameraSceneGallery({
        scene: baseScene,
        variants: {
          kind: "slopcamera.scene-variants",
          schemaVersion: 1,
          variants: [
            variantsDocument.variants[0],
            {
              id: "missing-entity",
              patch: {
                kind: "slopcamera.spatial-scene-patch",
                schemaVersion: 1,
                operations: [
                  {
                    kind: "set-color",
                    entityId: "entity_absent",
                    color: "#112233",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toThrow(/entity_absent/u)
  })
})

describe("parseSlopcameraSceneVariants", () => {
  test("parses a bounded variants document and defaults labels", () => {
    const specs = parseSlopcameraSceneVariants(variantsDocument)
    expect(specs).toHaveLength(2)
    expect(specs[1]?.label).toBeUndefined()
  })

  test("rejects foreign keys and malformed ids", () => {
    expect(() =>
      parseSlopcameraSceneVariants({
        kind: "slopcamera.scene-variants",
        schemaVersion: 1,
        variants: [],
      }),
    ).toThrow()
    expect(() =>
      parseSlopcameraSceneVariants({
        kind: "slopcamera.scene-variants",
        schemaVersion: 1,
        variants: [
          {
            id: "Not A Slug",
            patch: {
              kind: "slopcamera.spatial-scene-patch",
              schemaVersion: 1,
              operations: [
                {
                  kind: "set-color",
                  entityId: "entity_subject",
                  color: "#112233",
                },
              ],
            },
          },
        ],
      }),
    ).toThrow()
  })
})

describe("summarizeSceneVariantPatch", () => {
  test("summarizes operations within the bound", () => {
    const summary = summarizeSceneVariantPatch([
      { kind: "set-color", entityId: "entity_subject", color: "#ff5522" },
      {
        kind: "set-camera",
        camera: baseScene.cameras[0]!,
      },
    ])
    expect(summary).toBe(
      "set-color entity_subject; set-camera camera_main",
    )
    const long = summarizeSceneVariantPatch(
      Array.from(
        { length: 20 },
        () => ({
          kind: "set-color" as const,
          entityId: "entity_subject",
          color: "#ff5522",
        }),
      ),
    )
    expect(long.length).toBeLessThanOrEqual(
      slopcameraSceneGalleryLimits.summaryEdge,
    )
  })
})

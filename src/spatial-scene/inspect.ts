import { deepFreezeJson } from "../code/json-snapshot.js"
import type { SpatialEntity, SpatialOverride, SpatialSceneV1 } from "./contracts.js"
import { evaluateSpatialScene } from "./evaluate.js"
import { parseSpatialScene, spatialAssetClosureDigests, spatialPropertySupported, spatialValueSha256 } from "./identity.js"
import { composeTransform, multiplyTransforms, transformBounds, type Bounds, type Vec3 } from "./math.js"

export type SpatialInspectedBounds =
  | { readonly status: "authored-enclosure"; readonly coordinateDomain: SpatialEntity["placement"]; readonly atTimeUs: 0; readonly bounds: Bounds }
  | { readonly status: "unknown"; readonly reason: "requires-asset-decoding" | "requires-text-layout" | "no-surface" }

/** Authored-edit surface beyond the override properties: patch operations own these controls. */
export type SpatialEditableControl = SpatialOverride["property"] | "emissive" | "instances" | "castShadow" | "receiveShadow" | "spot" | "shadow"

export interface SpatialSceneInspection {
  readonly sceneId: string
  readonly sceneSha256: string
  readonly durationUs: number
  readonly entities: readonly {
    readonly entityId: string
    readonly name: string
    readonly kind: SpatialEntity["kind"]
    readonly origin: SpatialEntity["origin"]
    readonly parentId: string | null
    readonly placement: SpatialEntity["placement"]
    readonly editableControls: readonly SpatialEditableControl[]
    readonly animatedProperties: readonly string[]
    readonly assetIds: readonly string[]
    readonly bounds: SpatialInspectedBounds
  }[]
  readonly cameras: SpatialSceneV1["cameras"]
  readonly assets: readonly { readonly assetId: string; readonly manifestSha256: string; readonly manifest: SpatialSceneV1["assets"][number] }[]
  readonly generators: SpatialSceneV1["generators"]
}

function localBounds(entity: SpatialEntity): Bounds | SpatialInspectedBounds {
  let half: Vec3
  if (entity.kind === "mesh") {
    switch (entity.geometry.kind) {
      case "asset": return { status: "unknown", reason: "requires-asset-decoding" }
      case "box": half = entity.geometry.size.map(value => value / 2) as unknown as Vec3; break
      case "plane": half = [entity.geometry.width / 2, entity.geometry.height / 2, 0]; break
      case "sphere": half = [entity.geometry.radius, entity.geometry.radius, entity.geometry.radius]; break
      case "cylinder": half = [entity.geometry.radius, entity.geometry.height / 2, entity.geometry.radius]; break
    }
  } else if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video") half = [entity.width / 2, entity.height / 2, 0]
  else return { status: "unknown", reason: entity.kind === "text" ? "requires-text-layout" : entity.kind === "splat" ? "requires-asset-decoding" : "no-surface" }
  return { min: [-half[0], -half[1], -half[2]], max: half }
}

/** Authored enclosures are labelled explicitly; inspection never decodes or invents imported bounds. */
export function inspectSpatialScene(input: unknown): SpatialSceneInspection {
  const scene = parseSpatialScene(input)
  const snapshot = evaluateSpatialScene(scene, { timeUs: 0, cameraId: scene.cameras[0]!.cameraId })
  const digests = spatialAssetClosureDigests(scene.assets)
  return deepFreezeJson({
    sceneId: scene.sceneId, sceneSha256: spatialValueSha256(scene), durationUs: scene.durationUs,
    entities: snapshot.entities.map(({ entity, worldMatrix }) => {
      const origin = entity.origin
      const declared: readonly SpatialEditableControl[] = origin.kind === "generated"
        ? scene.generators.find(generator => generator.generatorId === origin.generatorId)!.editableKeys.find(item => item.key === origin.key)?.properties ?? []
        : [
            ...(["color", "opacity", "transform"] as const).filter(property => spatialPropertySupported(entity, property)),
            ...(entity.kind === "mesh" ? [
              ...(entity.material.kind === "standard" && spatialPropertySupported(entity, "color") ? ["emissive" as const] : []),
              "instances" as const, "castShadow" as const, "receiveShadow" as const,
            ] : []),
            ...(entity.kind === "light" ? [
              ...(entity.light === "spot" ? ["spot" as const] : []),
              ...(entity.light !== "ambient" ? ["shadow" as const] : []),
            ] : []),
          ]
      const animatedProperties = scene.animations.filter(channel => channel.targetId === entity.entityId).map(channel => channel.property)
      const editableControls = declared.filter(property => !animatedProperties.some(animated => animated === property || (property === "transform" && ["position", "rotation", "scale"].includes(animated))))
      const local = localBounds(entity)
      const localDomains: Bounds[] = "status" in local ? []
        : entity.kind === "mesh" && entity.instances !== undefined
          ? entity.instances.map(instance => transformBounds(multiplyTransforms(worldMatrix, composeTransform(instance)), local))
          : [transformBounds(worldMatrix, local)]
      const bounds: SpatialInspectedBounds = "status" in local ? local : {
        status: "authored-enclosure", coordinateDomain: entity.placement, atTimeUs: 0,
        bounds: localDomains.reduce((union, next) => ({
          min: union.min.map((value, axis) => Math.min(value, next.min[axis]!)) as unknown as Bounds["min"],
          max: union.max.map((value, axis) => Math.max(value, next.max[axis]!)) as unknown as Bounds["max"],
        })),
      }
      const assetIds = entity.kind === "mesh"
        ? [...entity.geometry.kind === "asset" ? [entity.geometry.assetId] : [], ...entity.material.map === undefined ? [] : [entity.material.map]]
        : entity.kind === "text" ? [entity.fontAssetId] : "assetId" in entity ? [entity.assetId] : []
      return { entityId: entity.entityId, name: entity.name, kind: entity.kind, origin, parentId: entity.parentId, placement: entity.placement, editableControls, animatedProperties, assetIds, bounds }
    }),
    cameras: scene.cameras, assets: scene.assets.map(manifest => ({ assetId: manifest.assetId, manifestSha256: digests[manifest.assetId]!, manifest })), generators: scene.generators,
  })
}

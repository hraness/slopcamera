import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialScenePatchV1Schema, type SpatialEntity, type SpatialSceneV1 } from "./contracts.js"
import { applySpatialEntityOverride } from "./evaluate.js"
import { parseSpatialScene, parseSpatialValue, SpatialSceneError, spatialAssetClosureDigests, spatialPropertySupported, spatialValueSha256 } from "./identity.js"

export interface SpatialSceneDiffEntry {
  readonly kind: "added" | "removed" | "changed"
  readonly collection: "entities" | "cameras" | "animations" | "generators" | "overrides" | "assets"
  readonly id: string
  readonly properties: readonly string[]
}
export interface SpatialScenePatchResult {
  readonly scene: SpatialSceneV1
  readonly sceneSha256: string
  readonly diff: readonly SpatialSceneDiffEntry[]
}

function diffCollection<T extends object>(collection: SpatialSceneDiffEntry["collection"], before: readonly T[], after: readonly T[], identify: (item: T) => string): SpatialSceneDiffEntry[] {
  const old = new Map(before.map(item => [identify(item), item]))
  const current = new Map(after.map(item => [identify(item), item]))
  const result: SpatialSceneDiffEntry[] = []
  for (const id of [...new Set([...old.keys(), ...current.keys()])].sort()) {
    const a = old.get(id), b = current.get(id)
    if (a === undefined || b === undefined) {
      result.push({ kind: a === undefined ? "added" : "removed", collection, id, properties: Object.keys(a ?? b!).sort() })
    } else {
      const aRecord = a as Record<string, unknown>, bRecord = b as Record<string, unknown>
      const properties = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter(key =>
        spatialValueSha256(Object.hasOwn(a, key) ? { value: aRecord[key] } : {}) !== spatialValueSha256(Object.hasOwn(b, key) ? { value: bRecord[key] } : {}))
      if (properties.length) result.push({ kind: "changed", collection, id, properties })
    }
  }
  return result
}

/** Structural comparison of two parsed scenes, in canonical collection order. */
export function diffSpatialScenes(beforeInput: unknown, afterInput: unknown): readonly SpatialSceneDiffEntry[] {
  const before = parseSpatialScene(beforeInput)
  const after = parseSpatialScene(afterInput)
  return deepFreezeJson([
    ...diffCollection("assets", before.assets, after.assets, asset => asset.assetId),
    ...diffCollection("entities", before.entities, after.entities, entity => entity.entityId),
    ...diffCollection("cameras", before.cameras, after.cameras, camera => camera.cameraId),
    ...diffCollection("animations", before.animations, after.animations, channel => channel.channelId),
    ...diffCollection("generators", before.generators, after.generators, generator => generator.generatorId),
    ...diffCollection("overrides", before.overrides, after.overrides, override => `${override.entityId}:${override.property}`),
  ])
}

/** Atomic in-memory transaction. Final closure is checked once, before publishing any result. */
export function applySpatialScenePatch(sceneInput: unknown, patchInput: unknown): SpatialScenePatchResult {
  const original = parseSpatialScene(sceneInput)
  const patch = parseSpatialValue(SpatialScenePatchV1Schema, patchInput, "scene patch")
  if (patch.expectedSceneSha256 !== spatialValueSha256(original)) throw new SpatialSceneError("conflict", "Scene revision changed; inspect and rebase the patch.", "expectedSceneSha256")
  const entities = new Map(original.entities.map(entity => [entity.entityId, entity]))
  const assets = new Map(original.assets.map(asset => [asset.assetId, asset]))
  const addressedGeometry = new Set<string>(), replacedGenerators = new Set<string>()
  const cameras = new Map(original.cameras.map(camera => [camera.cameraId, camera]))
  const animations = new Map(original.animations.map(channel => [channel.channelId, channel]))
  const generators = new Map(original.generators.map(generator => [generator.generatorId, generator]))
  const overrides = new Map(original.overrides.map(override => [`${override.entityId}:${override.property}`, override]))
  function authored(id: string): SpatialEntity {
    const entity = entities.get(id)
    if (!entity) throw new SpatialSceneError("not-found", `Entity ${id} does not exist.`, "operations")
    if (entity.origin.kind !== "authored") throw new SpatialSceneError("conflict", "Generated entities can be edited only through declared overrides or retained output replacement.", "operations")
    return entity
  }
  for (const operation of patch.operations) {
    switch (operation.kind) {
      case "add-asset":
        if (assets.has(operation.asset.assetId)) throw new SpatialSceneError("conflict", `Asset ${operation.asset.assetId} already exists.`)
        assets.set(operation.asset.assetId, operation.asset)
        break
      case "replace-asset":
        if (!assets.has(operation.asset.assetId)) throw new SpatialSceneError("not-found", `Asset ${operation.asset.assetId} does not exist.`)
        assets.set(operation.asset.assetId, operation.asset)
        break
      case "set-mesh-geometry": {
        const entity = authored(operation.entityId)
        if (entity.kind !== "mesh") throw new SpatialSceneError("conflict", "Geometry replacement requires an authored mesh wrapper.")
        entities.set(operation.entityId, { ...entity, geometry: operation.geometry })
        addressedGeometry.add(operation.entityId)
        break
      }
      case "set-material": {
        const entity = authored(operation.entityId)
        if (entity.kind !== "mesh") throw new SpatialSceneError("conflict", "Material replacement requires an authored mesh entity.")
        if (entity.geometry.kind === "asset" && entity.geometry.materialMode === "source") throw new SpatialSceneError("conflict", "Source-material meshes consume source materials only; the entity material is inert.")
        entities.set(operation.entityId, { ...entity, material: operation.material })
        break
      }
      case "rename-entity": entities.set(operation.entityId, { ...authored(operation.entityId), name: operation.name }); break
      case "reparent-entity": entities.set(operation.entityId, { ...authored(operation.entityId), parentId: operation.parentId }); break
      case "set-transform": entities.set(operation.entityId, { ...authored(operation.entityId), transform: operation.transform }); break
      case "set-color": entities.set(operation.entityId, applySpatialEntityOverride(authored(operation.entityId), { entityId: operation.entityId, property: "color", value: operation.color })); break
      case "set-opacity": entities.set(operation.entityId, applySpatialEntityOverride(authored(operation.entityId), { entityId: operation.entityId, property: "opacity", value: operation.opacity })); break
      case "set-emissive": {
        const entity = authored(operation.entityId)
        if (entity.kind !== "mesh" || entity.material.kind !== "standard") throw new SpatialSceneError("conflict", "Emissive edits require an authored mesh with a standard material.", "operations")
        if (!spatialPropertySupported(entity, "color")) throw new SpatialSceneError("conflict", "Source-material mode leaves emissive control to the retained GLB material.", "operations")
        const { emissive: _cleared, ...material } = entity.material
        entities.set(operation.entityId, { ...entity, material: operation.emissive === null ? material : { ...material, emissive: operation.emissive } })
        break
      }
      case "set-spot": {
        const entity = authored(operation.entityId)
        if (entity.kind !== "light" || entity.light !== "spot") throw new SpatialSceneError("conflict", "Spot cone edits require an authored spot light.", "operations")
        entities.set(operation.entityId, { ...entity, spot: operation.spot })
        break
      }
      case "set-instances": {
        const entity = authored(operation.entityId)
        if (entity.kind !== "mesh") throw new SpatialSceneError("conflict", "Instance edits apply to authored mesh entities.", "operations")
        const { instances: _cleared, ...rest } = entity
        entities.set(operation.entityId, operation.instances === null ? rest : { ...rest, instances: operation.instances })
        break
      }
      case "set-mesh-shadow": {
        const entity = authored(operation.entityId)
        if (entity.kind !== "mesh") throw new SpatialSceneError("conflict", "Mesh shadow flags apply to authored mesh entities.", "operations")
        const { castShadow: _cast, receiveShadow: _receive, ...rest } = entity
        entities.set(operation.entityId, {
          ...rest,
          ...(operation.castShadow === null ? {} : { castShadow: operation.castShadow }),
          ...(operation.receiveShadow === null ? {} : { receiveShadow: operation.receiveShadow }),
        })
        break
      }
      case "set-light-shadow": {
        const entity = authored(operation.entityId)
        if (entity.kind !== "light") throw new SpatialSceneError("conflict", "Light shadow flags apply to authored light entities.", "operations")
        if (entity.light === "ambient" && operation.shadow !== null) throw new SpatialSceneError("conflict", "Ambient lights cannot cast shadows.", "operations")
        const { shadow: _shadow, ...rest } = entity
        entities.set(operation.entityId, operation.shadow === null ? rest : { ...rest, shadow: operation.shadow })
        break
      }
      case "set-camera": cameras.set(operation.camera.cameraId, operation.camera); break
      case "set-channel": animations.set(operation.channel.channelId, operation.channel); break
      case "remove-channel":
        if (!animations.delete(operation.channelId)) throw new SpatialSceneError("not-found", `Channel ${operation.channelId} does not exist.`)
        break
      case "add-entity":
        if (entities.has(operation.entity.entityId)) throw new SpatialSceneError("conflict", `Entity ${operation.entity.entityId} already exists.`)
        if (operation.entity.origin.kind !== "authored") throw new SpatialSceneError("conflict", "Add generated entities through retained generator output replacement.")
        entities.set(operation.entity.entityId, operation.entity)
        if (operation.entity.kind === "mesh") addressedGeometry.add(operation.entity.entityId)
        break
      case "remove-entity": authored(operation.entityId); entities.delete(operation.entityId); break
      case "set-override": overrides.set(`${operation.override.entityId}:${operation.override.property}`, operation.override); break
      case "remove-override":
        if (!overrides.delete(`${operation.entityId}:${operation.property}`)) throw new SpatialSceneError("not-found", "Override does not exist.")
        break
      case "replace-generator-output": {
        const generatorId = operation.generator.generatorId
        replacedGenerators.add(generatorId)
        for (const entity of entities.values()) if (entity.origin.kind === "generated" && entity.origin.generatorId === generatorId) entities.delete(entity.entityId)
        for (const entity of operation.entities) {
          if (entity.origin.kind !== "generated" || entity.origin.generatorId !== generatorId) throw new SpatialSceneError("conflict", "Generator replacement must contain only its own retained output.")
          if (entities.has(entity.entityId)) throw new SpatialSceneError("conflict", `Generator output collides with ${entity.entityId}.`)
          entities.set(entity.entityId, entity)
        }
        generators.set(generatorId, operation.generator)
        break
      }
    }
  }
  const scene = parseSpatialScene({ ...original, assets: [...assets.values()], entities: [...entities.values()], cameras: [...cameras.values()], animations: [...animations.values()], generators: [...generators.values()], overrides: [...overrides.values()] })
  const beforeAssets = new Map(original.assets.map(asset => [asset.assetId, asset]))
  const oldClosure = spatialAssetClosureDigests(original.assets), newClosure = spatialAssetClosureDigests(scene.assets)
  for (const entity of scene.entities) {
    const referenced: string[] = entity.kind === "mesh" && entity.geometry.kind === "asset" ? [entity.geometry.assetId]
      : entity.kind === "text" ? [entity.fontAssetId] : "assetId" in entity ? [entity.assetId] : []
    if (entity.kind === "mesh" && entity.material.map !== undefined) referenced.push(entity.material.map)
    for (const assetId of referenced) {
      if (entity.origin.kind === "generated" && oldClosure[assetId] !== undefined && oldClosure[assetId] !== newClosure[assetId] && !replacedGenerators.has(entity.origin.generatorId)) {
        throw new SpatialSceneError("conflict", "Changing a generated part's asset closure requires explicit retained generator output replacement.")
      }
    }
    if (entity.kind === "mesh" && entity.geometry.kind === "asset" && (entity.geometry.nodeIndex !== undefined || entity.geometry.clip !== undefined)
      && beforeAssets.has(entity.geometry.assetId) && beforeAssets.get(entity.geometry.assetId)!.payload.sha256 !== assets.get(entity.geometry.assetId)!.payload.sha256
      && !addressedGeometry.has(entity.entityId) && !(entity.origin.kind === "generated" && replacedGenerators.has(entity.origin.generatorId))) {
      throw new SpatialSceneError("conflict", "Replacing addressed GLB bytes requires explicit set-mesh-geometry with the new local node/clip addresses; internal correspondence is not inferred.")
    }
  }
  const diff = diffSpatialScenes(original, scene)
  return deepFreezeJson({ scene, sceneSha256: spatialValueSha256(scene), diff })
}

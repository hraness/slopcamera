import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { compileSpatialDesign, editSpatialDesignParameters, inspectSpatialDesign } from "./design.js"
import { createSpatialDesignStarter, listSpatialDesignTemplates } from "./design-templates.js"
import { spatialSceneSha256 } from "./identity.js"

describe("spatial design starters", () => {
  test("the inert catalog has stable identities and rejects prototype-property names", () => {
    const catalog = listSpatialDesignTemplates()
    expect(catalog.map(template => template.id)).toEqual(["crescent-pavilion", "spiral-stair", "ribbed-tower", "modular-bookshelf"])
    expect(Object.isFrozen(catalog)).toBe(true)
    for (const id of ["unknown", "__proto__", "constructor", "toString"]) expect(() => createSpatialDesignStarter(id)).toThrow("Unknown spatial design template")
    expect(() => createSpatialDesignStarter({ toString: () => { throw new Error("must not coerce") } })).toThrow("catalog ID string")
  })

  for (const template of listSpatialDesignTemplates()) {
    test(`${template.id}: checked source reproduces deterministic retained geometry and staging`, async () => {
      const starter = createSpatialDesignStarter(template.id)
      const exampleDesign = JSON.parse(await readFile(new URL(`../../examples/design/${template.id}.design.json`, import.meta.url), "utf8"))
      const exampleScene = JSON.parse(await readFile(new URL(`../../examples/design/${template.id}.scene.json`, import.meta.url), "utf8"))
      expect(exampleDesign).toEqual(starter.design)
      expect(exampleScene).toEqual(starter.scene)
      expect(starter.design.parameters.map(parameter => parameter.name).sort()).toEqual([...template.parameterNames].sort())
      expect(starter.scene.cameras.map(camera => camera.cameraId).sort()).toEqual(["camera_detail", "camera_hero", "camera_plan"])
      expect(starter.scene.entities.some(entity => entity.kind === "light" && entity.shadow)).toBe(true)

      const first = compileSpatialDesign(starter.design, { scene: starter.scene })
      const replay = compileSpatialDesign(exampleDesign, { scene: exampleScene })
      expect(first.receiptSha256).toBe(replay.receiptSha256)
      expect(first.outputs.flatMap(output => output.artifacts.map(artifact => artifact.bytes)))
        .toEqual(replay.outputs.flatMap(output => output.artifacts.map(artifact => artifact.bytes)))
      expect(first.scene.entities.filter(entity => entity.origin.kind === "authored")).toEqual([...starter.scene.entities])
      for (const entity of first.scene.entities.filter(entity => entity.kind === "mesh" && entity.origin.kind === "generated")) {
        expect(entity.kind === "mesh" && entity.castShadow && entity.receiveShadow).toBe(true)
      }
      expect(first.receipt.estimate.assets).toBeLessThanOrEqual(16)
      expect(first.receipt.estimate.triangles).toBeLessThan(40_000)
      expect(spatialSceneSha256(first.scene)).toBe(first.receipt.sceneSha256)
    })
  }

  for (const entry of [
    { id: "crescent-pavilion", changes: { length: 13 }, dependentStages: ["timber-ribs", "longitudinal-ties", "curved-plinth"] },
    { id: "spiral-stair", changes: { height: 6.5 }, dependentStages: ["stone-treads", "balusters", "handrails", "central-support"] },
    { id: "ribbed-tower", changes: { radius: 3.5 }, dependentStages: ["bronze-exoskeleton", "floor-plates", "central-core", "podium"] },
    { id: "modular-bookshelf", changes: { width: 5.2 }, dependentStages: ["horizontal-shelves", "vertical-dividers", "inset-backs", "books", "ceramic", "plinth"] },
  ]) {
    test(`${entry.id}: changing one control regenerates every dependent stage with stable part identities`, () => {
      const starter = createSpatialDesignStarter(entry.id)
      const first = compileSpatialDesign(starter.design, { scene: starter.scene })
      const next = compileSpatialDesign(starter.design, { scene: first.scene, parameters: entry.changes })
      expect(next.scene.entities.map(entity => entity.entityId)).toEqual(first.scene.entities.map(entity => entity.entityId))
      const changed = next.receipt.stages.filter(stage => stage.changed).map(stage => stage.stageId)
      expect(changed.sort()).toEqual([...entry.dependentStages].sort())
      expect(next.scene.entities.filter(entity => entity.origin.kind === "authored")).toEqual([...starter.scene.entities])
      expect(next.receipt.sceneSha256).not.toBe(first.receipt.sceneSha256)
    })
  }

  test("linked dimensional constraints reject closed walkways, narrow stairs, merged ribs and undersized shelves", () => {
    const cases = [
      { id: "crescent-pavilion", parameters: { length: 8, bend: 1.7, span: 8 }, reason: "open inner edge" },
      { id: "spiral-stair", parameters: { radius: 1.6, innerRadius: 0.9 }, reason: "1.1 m" },
      { id: "ribbed-tower", parameters: { radius: 2.5, taper: 0.45, ribRadius: 0.11 }, reason: "daylight" },
      { id: "modular-bookshelf", parameters: { height: 2.2, rows: 6 }, reason: "0.34 m" },
    ]
    for (const entry of cases) expect(() => editSpatialDesignParameters(createSpatialDesignStarter(entry.id).design, entry.parameters)).toThrow(entry.reason)
  })

  test("bookshelf integer counts remain linked to array instances and opening pitch", () => {
    const starter = createSpatialDesignStarter("modular-bookshelf")
    const changed = inspectSpatialDesign(starter.design, { parameters: { bays: 6, rows: 5 } })
    const findArrayCount = (id: string) => {
      const stage = changed.stages.find(stage => stage.stageId === id)!
      if (stage.spec.kind !== "geometry") throw new Error("Expected geometry stage")
      return stage.spec.graph.nodes.find(node => node.kind === "array")
    }
    expect(findArrayCount("horizontal-shelves")).toMatchObject({ count: 6 })
    expect(findArrayCount("vertical-dividers")).toMatchObject({ count: 7 })
    expect(changed.values.find(value => value.name === "bayPitch")!.value).toBeCloseTo((4.8 - 0.042) / 6)
    expect(() => editSpatialDesignParameters(starter.design, { bays: 5.5 })).toThrow()
  })
})

import { deepFreezeJson } from "../code/json-snapshot.js"
import { lookAtPose, perspectiveFromFov } from "./build.js"
import type { SpatialMaterial, SpatialSceneV1 } from "./contracts.js"
import { parseSpatialDesign, type SpatialDesignV1 } from "./design.js"
import { parseSpatialScene, SpatialSceneError } from "./identity.js"

/** Original architectural studies. These functions author inert design data;
 * compilation and rendering remain separate, explicit operations. */
export interface SpatialDesignTemplate {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly parameterNames: readonly string[]
  readonly cameraId: "camera_hero"
}

export interface SpatialDesignStarter {
  readonly design: SpatialDesignV1
  readonly scene: SpatialSceneV1
}

type Expression = number | { $param: string } | { $value: string } | { op: string; args: Expression[] }
type Json = null | boolean | number | string | { [key: string]: Json } | Json[]
const p = (name: string): Expression => ({ $param: name })
const v = (name: string): Expression => ({ $value: name })
const op = (name: string, ...args: Expression[]): Expression => ({ op: name, args })
const add = (a: Expression, b: Expression) => op("add", a, b)
const sub = (a: Expression, b: Expression) => op("sub", a, b)
const mul = (a: Expression, b: Expression) => op("mul", a, b)
const div = (a: Expression, b: Expression) => op("div", a, b)
const sin = (a: Expression) => op("sin", a)
const cos = (a: Expression) => op("cos", a)
const expr = (value: Expression): Json => typeof value === "number" ? value : { $expr: value as Json }
const xyz = (x: Expression, y: Expression, z: Expression): Json[] => [expr(x), expr(y), expr(z)]
const transform = (position: Json[] = [0, 0, 0], rotation: Json[] = [0, 0, 0, 1]): Json => ({ position, rotation, scale: [1, 1, 1] })
const yaw = (angle: Expression): Json[] => [0, expr(sin(mul(angle, 0.5))), 0, expr(cos(mul(angle, 0.5)))]
const parameter = (name: string, label: string, value: number, min: number, max: number, unit: string, step?: number) => ({ name, label, value, min, max, unit, ...(step === undefined ? {} : { step }) })
const standard = (color: string, roughness = 0.55, metalness = 0): SpatialMaterial => ({ kind: "standard", color, opacity: 1, roughness, metalness })
const OAK = standard("#b98249", 0.43)
const WALNUT = standard("#71503c", 0.46)
const BRONZE = standard("#bc9864", 0.32, 0.64)
const INK = standard("#283335", 0.39, 0.22)
const STONE = standard("#d0c4ac", 0.83)
const CREAM = standard("#eee8dc", 0.87)

function geometry(stageId: string, name: string, nodes: Json[], output: string, material: SpatialMaterial, placement?: Json): Json {
  return {
    kind: "geometry", stageId, name,
    graph: { kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1, nodes, output },
    materials: [material as Json], castShadow: true, receiveShadow: true,
    editable: ["color", "transform"], ...(placement === undefined ? {} : { transform: placement }),
  }
}

function merge(nodes: Json[], inputs: string[]): string {
  if (inputs.length === 1) return inputs[0]!
  nodes.push({ id: "assembly", kind: "merge", inputs })
  return "assembly"
}

function stageScene(id: string, options: { position: [number, number, number]; target: [number, number, number]; extent: number; dark?: boolean }): SpatialSceneV1 {
  const { position, target, extent, dark = false } = options
  const common = { parentId: null, placement: { kind: "world" }, origin: { kind: "authored" }, visible: true }
  const light = (name: string, location: [number, number, number], color: string, intensity: number, shadow = false) => ({
    ...common, kind: "light", entityId: `entity_${name}`, name,
    transform: { ...lookAtPose(location, target), scale: [1, 1, 1] },
    light: "directional", color, intensity, shadow,
  })
  const camera = (cameraId: string, name: string, location: [number, number, number], aim: [number, number, number], fovDeg: number) => ({
    cameraId, name, pose: lookAtPose(location, aim),
    projection: perspectiveFromFov({ fovDeg, width: 1440, height: 1080, near: 0.05, far: 300 }),
  })
  return parseSpatialScene({
    kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: `scene_design_${id.replaceAll("-", "_")}`,
    coordinates: "right-handed-y-up-meters", durationUs: 4_000_000,
    entities: [
      { ...common, kind: "mesh", entityId: "entity_ground", name: "Matte studio ground", transform: transform([0, -0.14, 0]),
        geometry: { kind: "box", size: [200, 0.25, 200] }, material: standard(dark ? "#263638" : "#e3ded3", 0.94), receiveShadow: true },
      { ...common, kind: "light", entityId: "entity_ambient", name: "Soft sky fill", transform: transform(), light: "ambient", color: "#e0ecf1", intensity: dark ? 1.1 : 1.5 },
      light("key", [-extent, extent * 1.7, extent], "#ffe7c5", 3.3, true),
      light("fill", [extent, extent * 0.7, extent * 0.3], "#c6dbef", 1.1),
      light("rim", [extent * 0.3, extent, -extent], "#fff0db", 2.1),
    ],
    cameras: [
      camera("camera_hero", "Architectural three-quarter", position, target, 48),
      camera("camera_detail", "Material and connection study", [position[0] * 0.6, target[1] + (position[1] - target[1]) * 0.5, position[2] * 0.6], target, 46),
      camera("camera_plan", "Plan and structural rhythm", [0.01, extent * 2.5, 0], [0, 0, 0], 52),
    ],
    assets: [], animations: [], generators: [], overrides: [],
  })
}

function pavilion(): SpatialDesignStarter {
  const stations = 29
  const angle = (t: number) => mul(p("bend"), t)
  const centerX = (t: number) => mul(v("curveRadius"), sub(1, cos(angle(t))))
  const centerZ = (t: number) => mul(v("curveRadius"), sin(angle(t)))
  const archPath = Array.from({ length: 25 }, (_, i) => {
    const a = Math.PI * i / 24
    return xyz(mul(p("span"), -0.5 * Math.cos(a)), add(0.16, mul(p("rise"), Math.sin(a))), 0)
  })
  const ribs: Json[] = [
    { id: "section", kind: "rect", width: expr(p("ribDepth")), height: expr(p("ribWidth")) },
    { id: "rib", kind: "sweep", profile: "section", path: archPath },
  ]
  const ribIds: string[] = []
  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1) - 0.5, id = `rib_${i}`
    ribs.push({ id, kind: "transform", input: "rib", transform: transform(xyz(centerX(t), 0, centerZ(t)), yaw(angle(t))) })
    ribIds.push(id)
  }
  const deckPath = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32 * 1.1 - 0.55
    return xyz(centerX(t), 0.1, centerZ(t))
  })
  const rails: Json[] = [{ id: "section", kind: "rect", width: 0.075, height: 0.11 }]
  const railIds: string[] = []
  for (const [i, sectionAngle] of [Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6].entries()) {
    const lateral = mul(p("span"), 0.5 * Math.cos(sectionAngle)), id = `rail_${i}`
    rails.push({ id, kind: "sweep", profile: "section", path: Array.from({ length: 33 }, (_, j) => {
      const t = j / 32 - 0.5
      return xyz(add(centerX(t), mul(lateral, cos(angle(t)))), add(0.16, mul(p("rise"), Math.sin(sectionAngle))), sub(centerZ(t), mul(lateral, sin(angle(t)))))
    }) })
    railIds.push(id)
  }
  return {
    design: parseSpatialDesign({
      kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "crescent-pavilion",
      parameters: [
        parameter("span", "Clear span", 6.2, 4, 8, "m"), parameter("length", "Walk length", 11.5, 8, 16, "m"),
        parameter("rise", "Crown height", 4.1, 2.8, 5.5, "m"), parameter("bend", "Plan curvature", 1.1, 0.15, 1.7, "rad"),
        parameter("ribDepth", "Rib depth", 0.26, 0.15, 0.38, "m"), parameter("ribWidth", "Rib width", 0.13, 0.08, 0.2, "m"),
      ],
      values: [{ name: "curveRadius", expression: div(p("length"), p("bend")) }],
      constraints: [
        { name: "inside-radius", left: v("curveRadius"), operator: "gt", right: add(mul(p("span"), 0.5), 1), message: "The curve must leave an open inner edge; increase length or reduce bend/span." },
        { name: "rib-spacing", left: p("ribWidth"), operator: "lt", right: mul(div(p("length"), stations - 1), 0.6), message: "Timber ribs need daylight between them." },
      ],
      stages: [
        geometry("timber-ribs", "Laminated oak arch ribs", ribs, merge(ribs, ribIds), OAK),
        geometry("longitudinal-ties", "Bronze longitudinal ties", rails, merge(rails, railIds), BRONZE),
        geometry("curved-plinth", "Continuous limestone walk", [
          { id: "section", kind: "rect", width: 0.2, height: expr(add(p("span"), 1.1)) },
          { id: "deck", kind: "sweep", profile: "section", path: deckPath },
        ], "deck", STONE),
      ],
    }),
    scene: stageScene("crescent-pavilion", { position: [15, 12, 18], target: [0.6, 1.5, 0], extent: 12 }),
  }
}

function spiralStair(): SpatialDesignStarter {
  const steps = 36
  const theta = (t: number) => mul(p("turns"), Math.PI * 2 * t)
  const elevation = (t: number) => add(0.25, mul(p("height"), t))
  const tread: Json[] = []
  for (let i = 0; i <= 6; i++) tread.push(xyz(mul(p("radius"), cos(mul(v("stepAngle"), i / 6))), mul(p("radius"), sin(mul(v("stepAngle"), i / 6))), 0).slice(0, 2))
  for (let i = 6; i >= 0; i--) tread.push(xyz(mul(p("innerRadius"), cos(mul(v("stepAngle"), i / 6))), mul(p("innerRadius"), sin(mul(v("stepAngle"), i / 6))), 0).slice(0, 2))
  const treads: Json[] = [
    { id: "outline", kind: "profile", points: tread },
    { id: "solid", kind: "extrude", profile: "outline", depth: expr(p("treadThickness")) },
    { id: "tread", kind: "transform", input: "solid", transform: transform([0, 0, 0], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]) },
  ]
  const treadIds: string[] = []
  for (let i = 0; i < steps; i++) {
    const id = `tread_${i}`
    treads.push({ id, kind: "transform", input: "tread", transform: transform(xyz(0, elevation((i + 1) / steps), 0), yaw(mul(theta(i / steps), -1))) })
    treadIds.push(id)
  }
  const metal: Json[] = [{ id: "post", kind: "cylinder", radius: 0.018, height: expr(p("railHeight")), segments: 8 }]
  const metalIds: string[] = []
  for (const [side, r] of [sub(p("radius"), 0.06), add(p("innerRadius"), 0.065)].entries()) {
    const posts: string[] = []
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps, id = `baluster_${side}_${i}`
      metal.push({ id, kind: "transform", input: "post", transform: transform(xyz(mul(r, cos(theta(t))), add(elevation((i + 1) / steps), mul(p("railHeight"), 0.5)), mul(r, sin(theta(t))))) })
      posts.push(id)
    }
    const id = `balustrade_${side}`
    metal.push({ id, kind: "merge", inputs: posts })
    metalIds.push(id)
  }
  const rails: Json[] = [{ id: "round", kind: "ellipse", radiusX: 0.04, radiusY: 0.04, segments: 12 }]
  const railIds: string[] = []
  for (const [i, radius] of [sub(p("radius"), 0.06), add(p("innerRadius"), 0.065)].entries()) {
    const id = `handrail_${i}`
    rails.push({ id, kind: "sweep", profile: "round", path: Array.from({ length: 73 }, (_, j) => {
      const t = j / 72
      return xyz(mul(radius, cos(theta(t))), add(elevation(t), add(p("railHeight"), div(p("height"), steps * 2))), mul(radius, sin(theta(t))))
    }) })
    railIds.push(id)
  }
  return {
    design: parseSpatialDesign({
      kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "spiral-stair",
      parameters: [
        parameter("height", "Total rise", 6, 4.5, 7.2, "m"), parameter("radius", "Outer radius", 2.25, 1.6, 3, "m"),
        parameter("innerRadius", "Central support radius", 0.55, 0.3, 0.9, "m"), parameter("turns", "Spiral turns", 1.25, 1, 1.5, "ratio"),
        parameter("treadThickness", "Stone tread thickness", 0.095, 0.055, 0.13, "m"), parameter("railHeight", "Handrail height", 1.05, 0.9, 1.2, "m"),
      ],
      values: [{ name: "stepAngle", expression: mul(div(mul(p("turns"), Math.PI * 2), steps), 0.96) }],
      constraints: [
        { name: "walking-width", left: sub(p("radius"), p("innerRadius")), operator: "gte", right: 1.1, message: "Leave at least 1.1 m between the central opening and outer edge." },
        { name: "tread-clearance", left: p("treadThickness"), operator: "lt", right: mul(div(p("height"), steps), 0.85), message: "Tread thickness must leave a visible gap below the next tread." },
        { name: "headroom", left: div(p("height"), p("turns")), operator: "gte", right: 2.4, message: "The spiral needs at least 2.4 m rise per revolution." },
      ],
      stages: [
        geometry("stone-treads", "Radial limestone treads", treads, merge(treads, treadIds), standard("#d5be96", 0.63)),
        geometry("balusters", "Slender bronze balusters", metal, merge(metal, metalIds), BRONZE),
        geometry("handrails", "Continuous dark handrails", rails, merge(rails, railIds), INK),
        geometry("central-support", "Central bronze support", [{ id: "column", kind: "cylinder", radius: expr(add(p("innerRadius"), 0.035)), height: expr(add(p("height"), 0.38)), segments: 64 }], "column", INK, transform(xyz(0, mul(add(p("height"), 0.38), 0.5), 0))),
        geometry("plinth", "Circular limestone plinth", [{ id: "base", kind: "cylinder", radius: expr(add(p("radius"), 0.4)), height: 0.22, segments: 96 }], "base", STONE, transform([0, 0.11, 0])),
      ],
    }),
    scene: stageScene("spiral-stair", { position: [11, 9, 12], target: [0, 3.3, 0], extent: 8 }),
  }
}

function ribbedTower(): SpatialDesignStarter {
  const ribs: Json[] = [{ id: "section", kind: "ellipse", radiusX: expr(p("ribRadius")), radiusY: expr(p("ribRadius")), segments: 8 }]
  const ids: string[] = []
  const radiusAt = (t: number) => mul(p("radius"), add(sub(1, mul(p("taper"), t)), mul(p("belly"), Math.sin(t * Math.PI))))
  ribs.push({ id: "rib", kind: "sweep", profile: "section", path: Array.from({ length: 25 }, (_, j) => {
    const t = j / 24, a = mul(p("twist"), t), r = radiusAt(t)
    return xyz(mul(r, cos(a)), add(0.35, mul(p("height"), t)), mul(r, sin(a)))
  }) })
  for (let i = 0; i < 40; i++) {
    const id = `rib_${i}`, phase = i / 40 * Math.PI * 2
    ribs.push({ id, kind: "transform", input: "rib", transform: transform([0, 0, 0], [0, Math.sin(-phase / 2), 0, Math.cos(-phase / 2)]) })
    ids.push(id)
  }
  const floors: Json[] = []
  const floorIds: string[] = []
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, id = `floor_${i}`
    floors.push({ id: `${id}_solid`, kind: "cylinder", radius: expr(sub(radiusAt(t), 0.025)), height: 0.12, segments: 64 })
    floors.push({ id, kind: "transform", input: `${id}_solid`, transform: transform(xyz(0, add(0.35, mul(p("height"), t)), 0)) })
    floorIds.push(id)
  }
  return {
    design: parseSpatialDesign({
      kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "ribbed-tower",
      parameters: [
        parameter("height", "Tower height", 16, 12, 21, "m"), parameter("radius", "Ground radius", 3.25, 2.5, 4.2, "m"),
        parameter("twist", "Facade rotation", 1.35, 0, 2.3, "rad"), parameter("taper", "Crown taper", 0.27, 0.05, 0.45, "ratio"),
        parameter("belly", "Mid-height swell", 0.2, 0, 0.4, "ratio"), parameter("ribRadius", "Bronze rib radius", 0.065, 0.035, 0.11, "m"),
      ],
      constraints: [{ name: "rib-daylight", left: mul(p("ribRadius"), 3), operator: "lt", right: mul(mul(p("radius"), sub(1, p("taper"))), Math.PI * 2 / 40), message: "The narrow crown needs daylight between adjacent bronze ribs." }],
      stages: [
        geometry("bronze-exoskeleton", "Forty continuous twisting bronze ribs", ribs, merge(ribs, ids), BRONZE),
        geometry("floor-plates", "Thirteen recessed floor plates", floors, merge(floors, floorIds), standard("#33494a", 0.42, 0.3)),
        geometry("central-core", "Opaque central service core", [{ id: "core", kind: "cylinder", radius: expr(mul(p("radius"), 0.47)), height: expr(p("height")), segments: 64 }], "core", standard("#253738", 0.33, 0.3), transform(xyz(0, add(0.35, mul(p("height"), 0.5)), 0))),
        geometry("podium", "Low circular podium", [{ id: "podium", kind: "cylinder", radius: expr(add(p("radius"), 0.9)), height: 0.32, segments: 96 }], "podium", standard("#a6a795", 0.83), transform([0, 0.16, 0])),
      ],
    }),
    scene: stageScene("ribbed-tower", { position: [24, 17, 29], target: [0, 8, 0], extent: 17, dark: true }),
  }
}

function bookshelf(): SpatialDesignStarter {
  const board: Json[] = [
    { id: "board", kind: "box", size: xyz(p("width"), p("thickness"), p("depth")) },
    { id: "levels", kind: "array", input: "board", count: expr(add(p("rows"), 1)), step: xyz(0, v("rowPitch"), 0) },
  ]
  const uprights: Json[] = [
    { id: "upright", kind: "box", size: xyz(p("thickness"), sub(p("height"), p("thickness")), p("depth")) },
    { id: "bays", kind: "array", input: "upright", count: expr(add(p("bays"), 1)), step: xyz(v("bayPitch"), 0, 0) },
  ]
  const cellX = (column: number) => add(mul(p("width"), -0.5), add(mul(p("thickness"), 0.5), mul(v("bayPitch"), column + 0.5)))
  const shelfY = (row: number) => add(0.19, add(mul(v("rowPitch"), row), p("thickness")))
  const backs: Json[] = [{ id: "panel", kind: "box", size: xyz(sub(v("bayPitch"), p("thickness")), sub(v("rowPitch"), p("thickness")), 0.018) }]
  const backIds: string[] = []
  for (const [i, [column, row]] of [[0, 0], [2, 1], [1, 2]].entries()) {
    const id = `back_${i}`
    backs.push({ id, kind: "transform", input: "panel", transform: transform(xyz(cellX(column!), add(shelfY(row!), mul(sub(v("rowPitch"), p("thickness")), 0.5)), mul(p("depth"), -0.5))) })
    backIds.push(id)
  }
  const books: Json[] = [], bookIds: string[] = []
  for (let i = 0; i < 8; i++) {
    const id = `book_${i}`, column = i < 4 ? 0 : 2, row = i < 4 ? 1 : 0, offset = (i % 4 - 1.5) * 0.07
    const bookHeight = mul(v("rowPitch"), 0.58 + (i % 3) * 0.09)
    books.push({ id: `${id}_solid`, kind: "box", size: xyz(0.055, bookHeight, mul(p("depth"), 0.68)) })
    books.push({ id, kind: "transform", input: `${id}_solid`, transform: transform(xyz(add(cellX(column), offset), add(shelfY(row), mul(bookHeight, 0.5)), mul(p("depth"), 0.04))) })
    bookIds.push(id)
  }
  const vase: Json[] = [
    { id: "profile", kind: "profile", points: [[0, 0], [0.075, 0], [0.1, 0.06], [0.105, 0.16], [0.08, 0.24], [0.048, 0.27], [0.048, 0.32], [0, 0.32]] },
    { id: "vase", kind: "revolve", profile: "profile", segments: 48 },
  ]
  return {
    design: parseSpatialDesign({
      kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "modular-bookshelf",
      parameters: [
        parameter("width", "Overall width", 4.8, 3.6, 6.2, "m"), parameter("height", "Overall height", 2.7, 2.2, 3.4, "m"),
        parameter("depth", "Shelf depth", 0.42, 0.3, 0.6, "m"), parameter("thickness", "Board thickness", 0.042, 0.025, 0.065, "m"),
        parameter("bays", "Vertical bays", 5, 3, 8, "count", 1), parameter("rows", "Shelf rows", 4, 3, 6, "count", 1),
      ],
      values: [
        { name: "bayPitch", expression: div(sub(p("width"), p("thickness")), p("bays")) },
        { name: "rowPitch", expression: div(sub(p("height"), p("thickness")), p("rows")) },
      ],
      constraints: [
        { name: "book-clearance", left: sub(v("rowPitch"), p("thickness")), operator: "gte", right: 0.34, message: "Shelf openings must leave 0.34 m for the retained ceramic and books." },
        { name: "bay-clearance", left: sub(v("bayPitch"), p("thickness")), operator: "gte", right: 0.4, message: "Bays need at least 0.4 m clear width." },
        { name: "shelf-span", left: v("bayPitch"), operator: "lte", right: 1.25, message: "Keep unsupported shelf spans at or below 1.25 m." },
      ],
      stages: [
        geometry("horizontal-shelves", "Continuous walnut shelves", board, "levels", WALNUT, transform(xyz(0, add(0.19, mul(p("thickness"), 0.5)), 0))),
        geometry("vertical-dividers", "Walnut uprights", uprights, "bays", WALNUT, transform(xyz(mul(sub(p("width"), p("thickness")), -0.5), add(0.19, mul(p("height"), 0.5)), 0))),
        geometry("inset-backs", "Alternating terracotta backs", backs, merge(backs, backIds), standard("#ad6048", 0.89)),
        geometry("books", "Indigo clothbound books", books, merge(books, bookIds), standard("#536d80", 0.87)),
        geometry("ceramic", "Ivory turned ceramic", vase, "vase", CREAM, transform(xyz(cellX(1), shelfY(2), 0.015))),
        geometry("plinth", "Recessed dark plinth", [{ id: "plinth", kind: "box", size: xyz(sub(p("width"), 0.14), 0.2, sub(p("depth"), 0.1)) }], "plinth", INK, transform([0, 0.1, 0])),
      ],
    }),
    scene: stageScene("modular-bookshelf", { position: [5.2, 3.4, 7.8], target: [0, 1.35, 0], extent: 6 }),
  }
}

const TEMPLATES: readonly SpatialDesignTemplate[] = deepFreezeJson([
  { id: "crescent-pavilion", name: "Crescent timber pavilion", description: "Twenty-nine oak arches follow a curved limestone walk; span, rise and curvature reshape the whole assembly.", parameterNames: ["span", "length", "rise", "bend", "ribDepth", "ribWidth"], cameraId: "camera_hero" },
  { id: "spiral-stair", name: "Sculptural spiral stair", description: "Thirty-six stone treads, bronze balusters and continuous handrails share one controlled helix.", parameterNames: ["height", "radius", "innerRadius", "turns", "treadThickness", "railHeight"], cameraId: "camera_hero" },
  { id: "ribbed-tower", name: "Twisting bronze tower", description: "Forty swept bronze ribs wrap thirteen floor plates with a shared taper, swell and twist.", parameterNames: ["height", "radius", "twist", "taper", "belly", "ribRadius"], cameraId: "camera_hero" },
  { id: "modular-bookshelf", name: "Modular walnut bookshelf", description: "An editable furniture system with linked bays, rows, joinery thickness and retained display objects.", parameterNames: ["width", "height", "depth", "thickness", "bays", "rows"], cameraId: "camera_hero" },
])

/** The fixed catalog is inert, deterministic metadata suitable for CLI discovery. */
export function listSpatialDesignTemplates(): readonly SpatialDesignTemplate[] { return TEMPLATES }

/** Return editable source plus a staged base scene, without generating assets. */
export function createSpatialDesignStarter(id: unknown): SpatialDesignStarter {
  if (typeof id !== "string") throw new SpatialSceneError("invalid-data", "Spatial design template must be a catalog ID string.", "template")
  const factories: Record<string, () => SpatialDesignStarter> = {
    "crescent-pavilion": pavilion, "spiral-stair": spiralStair, "ribbed-tower": ribbedTower, "modular-bookshelf": bookshelf,
  }
  const factory = Object.prototype.hasOwnProperty.call(factories, id) ? factories[id] : undefined
  if (factory === undefined) throw new SpatialSceneError("invalid-data", `Unknown spatial design template ${id.slice(0, 80)}. Choose ${TEMPLATES.map(template => template.id).join(", ")}.`, "template")
  return deepFreezeJson(factory())
}

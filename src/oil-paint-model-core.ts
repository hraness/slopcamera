export const SLOPCAMERA_OIL_PAINT_VERSION = 1 as const

export const slopcameraOilPaintLimits = Object.freeze({
  widthMin: 8, widthMax: 512, heightMin: 8, heightMax: 512, maxPixels: 262_144,
  maxOutputBytes: 2_000_000, maxInputBytes: 512 * 1024, maxReplayBytes: 1_024 * 1_024,
  maxTubes: 16, maxPiles: 16, maxPileIngredients: 8, maxLayers: 8, maxStrokes: 128,
  maxLayerStrokes: 64, maxPointsPerStroke: 128, maxTotalPoints: 8_192, maxBristles: 48,
  maxBrushWidth: 48, maxStrokeSamples: 1_024, maxSimulationSteps: 120_000,
  maxClockSteps: 256, maxClockWork: 16_000_000, maxNameBytes: 64, maxLogBytes: 1_024 * 1_024,
})

export const SPECTRAL_BANDS = 12
export const DEFAULT_GROUND = "#e8dcc8"
export type Point = readonly [number, number]

export type OilPaintBrushKind = "round" | "hog" | "filbert" | "fan"
export interface SlopcameraOilPaintBrush { readonly kind: OilPaintBrushKind; readonly bristles: number; readonly width: number; readonly length: number; readonly stiffness: number; readonly pickup: number; readonly push: number; readonly lay: number; readonly splay: number; readonly jitter: number }
export interface SlopcameraOilPaintTube { readonly name: string; readonly color: string; readonly opacity: number; readonly scattering: number; readonly drying: number }
export interface SlopcameraOilPaintIngredient { readonly tube: string; readonly amount: number }
export interface SlopcameraOilPaintPile { readonly name: string; readonly ingredients: readonly SlopcameraOilPaintIngredient[]; readonly knifePasses: number }
export interface SlopcameraOilPaintStroke { readonly pile: string; readonly points: readonly Point[]; readonly pressure: readonly [number, number]; readonly attack: number; readonly release: number; readonly angle: number; readonly load: number; readonly brush: SlopcameraOilPaintBrush; readonly seed: number }
export interface SlopcameraOilPaintLayer { readonly name: string; readonly strokes: readonly SlopcameraOilPaintStroke[]; readonly waitSteps: number }
export interface SlopcameraOilPaintGround { readonly color: string; readonly tooth: number; readonly relief: number }
export interface SlopcameraOilPaintSource { readonly version: 1; readonly width: number; readonly height: number; readonly seed: number; readonly ground: SlopcameraOilPaintGround; readonly tubes: readonly SlopcameraOilPaintTube[]; readonly piles: readonly SlopcameraOilPaintPile[]; readonly layers: readonly SlopcameraOilPaintLayer[] }
export interface SlopcameraOilPaintStrokeLog extends SlopcameraOilPaintStroke { readonly version: 1; readonly layer: number; readonly index: number }
export interface SlopcameraOilPaintReplayDocument { readonly version: 1; readonly input: SlopcameraOilPaintSource; readonly strokeLog: readonly SlopcameraOilPaintStrokeLog[] }

export interface Pigment { readonly k: Float64Array; readonly s: Float64Array; readonly drying: number }
export interface TubeModel { readonly source: SlopcameraOilPaintTube; readonly pigment: Pigment }
export interface PileModel { readonly source: SlopcameraOilPaintPile; readonly pigment: Pigment }
export interface ParsedOilPaintInput { readonly source: SlopcameraOilPaintSource; readonly tubes: ReadonlyMap<string, TubeModel>; readonly piles: ReadonlyMap<string, PileModel>; readonly totalWaitSteps: number }

export function oilPaintFail(message: string): never { throw new Error(`Invalid oil-paint input: ${message}`) }
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
export function record(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!isRecord(value)) oilPaintFail(`${label} must be an object`)
  const unknown = Object.keys(value).filter(key => !allowed.includes(key))
  if (unknown.length > 0) oilPaintFail(`${label} contains unsupported field ${unknown[0]}`)
  return value
}
export function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength }
export function boundedText(value: unknown, name: string, maxBytes: number = slopcameraOilPaintLimits.maxNameBytes): string {
  if (typeof value !== "string" || value.trim().length === 0 || byteLength(value) > maxBytes || /[\u0000-\u001f\u007f]/u.test(value)) oilPaintFail(`${name} must be a bounded non-empty text value`)
  return value.trim()
}
export function finite(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) oilPaintFail(`${name} must be finite and between ${minimum} and ${maximum}`)
  return value
}
export function integer(value: unknown, name: string, minimum: number, maximum: number): number { const result = finite(value, name, minimum, maximum); if (!Number.isSafeInteger(result)) oilPaintFail(`${name} must be an integer`); return result }
export function parseColor(value: unknown, name: string): string { const candidate = boundedText(value, name, 7); if (!/^#[a-f\d]{6}$/iu.test(candidate)) oilPaintFail(`${name} must be a six-digit #RRGGBB color`); return candidate.toLowerCase() }
export function rgb(value: string): readonly [number, number, number] { return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)] }
export function clamp(value: number, minimum = 0, maximum = 1): number { return Math.max(minimum, Math.min(maximum, value)) }
export function linearChannel(value: number): number { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4 }
export function hash32(seed: number, value: number): number { let hash = Math.imul(seed | 0, 0x45d9f3b); hash = Math.imul(hash ^ (value | 0), 0x45d9f3b); hash ^= hash >>> 16; hash = Math.imul(hash, 0x45d9f3b); hash ^= hash >>> 16; return hash >>> 0 }
export function noise(seed: number, x: number, y: number): number { return hash32(seed ^ Math.imul(x + 1, 0x27d4eb2d), y + 1) / 4_294_967_295 }
export function seededRandom(seed: number): () => number { let state = (seed >>> 0) || 0x6d2b79f5; return () => { state = Math.imul(state ^ (state >>> 15), state | 1); state ^= state + Math.imul(state ^ (state >>> 7), state | 61); return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_296 } }
export function nextSeed(seed: number, layer: number, index: number): number { return hash32(seed, Math.imul(layer + 1, 65_537) ^ index) >>> 0 }
export function smoothstep(value: number): number { const t = clamp(value); return t * t * (3 - 2 * t) }

/** Twelve broad wavelength bands are enough for bounded paint while keeping layer optics spectral. */
export function spectralColor(value: readonly [number, number, number]): Float64Array {
  const channels: readonly [number, number, number] = [linearChannel(value[0]), linearChannel(value[1]), linearChannel(value[2])]
  const white = Math.min(channels[0], channels[1], channels[2])
  const result = new Float64Array(SPECTRAL_BANDS)
  for (let index = 0; index < SPECTRAL_BANDS; index += 1) {
    const wavelength = 410 + index * 25
    const red = Math.exp(-(((wavelength - 610) / 58) ** 2))
    const green = Math.exp(-(((wavelength - 535) / 48) ** 2))
    const blue = Math.exp(-(((wavelength - 455) / 42) ** 2))
    result[index] = 0.035 + 0.91 * clamp(white * 0.92 + (channels[0] - white) * red + (channels[1] - white) * green + (channels[2] - white) * blue)
  }
  return result
}

export function pigmentFromTube(tube: SlopcameraOilPaintTube): Pigment {
  const reflectance = spectralColor(rgb(tube.color)); const k = new Float64Array(SPECTRAL_BANDS); const s = new Float64Array(SPECTRAL_BANDS)
  for (let index = 0; index < SPECTRAL_BANDS; index += 1) { const visible = clamp(1 - tube.opacity * (1 - reflectance[index]!)); const ratio = (1 - visible) ** 2 / Math.max(2 * visible, 1e-6); s[index] = tube.scattering; k[index] = ratio * tube.scattering }
  return { k, s, drying: tube.drying }
}
export function mixPigments(parts: readonly { readonly pigment: Pigment; readonly amount: number }[]): Pigment {
  const total = parts.reduce((sum, part) => sum + part.amount, 0); if (!(total > 0) || !Number.isFinite(total)) oilPaintFail("a pile must contain positive ingredient amounts")
  const k = new Float64Array(SPECTRAL_BANDS); const s = new Float64Array(SPECTRAL_BANDS); let drying = 0
  for (const part of parts) { const weight = part.amount / total; drying += part.pigment.drying * weight; for (let index = 0; index < SPECTRAL_BANDS; index += 1) { k[index] = k[index]! + part.pigment.k[index]! * weight; s[index] = s[index]! + part.pigment.s[index]! * weight } }
  return { k, s, drying }
}

function parseBrush(value: unknown): SlopcameraOilPaintBrush {
  const input = value === undefined ? {} : record(value, ["kind", "bristles", "width", "length", "stiffness", "pickup", "push", "lay", "splay", "jitter"], "brush")
  const kindValue = input.kind === undefined ? "hog" : boundedText(input.kind, "brush.kind")
  if (kindValue !== "round" && kindValue !== "hog" && kindValue !== "filbert" && kindValue !== "fan") oilPaintFail("brush.kind must be round, hog, filbert, or fan")
  const kind = kindValue as OilPaintBrushKind
  const defaults: Record<OilPaintBrushKind, Omit<SlopcameraOilPaintBrush, "kind">> = {
    round: { bristles: 20, width: 12, length: 9, stiffness: 0.28, pickup: 0.16, push: 0.06, lay: 1, splay: 0.45, jitter: 0.12 },
    hog: { bristles: 32, width: 20, length: 10, stiffness: 0.82, pickup: 0.24, push: 0.24, lay: 1.15, splay: 0.16, jitter: 0.3 },
    filbert: { bristles: 28, width: 24, length: 11, stiffness: 0.58, pickup: 0.2, push: 0.15, lay: 1.1, splay: 0.24, jitter: 0.2 },
    fan: { bristles: 24, width: 28, length: 16, stiffness: 0.5, pickup: 0.13, push: 0.1, lay: 0.75, splay: 0.3, jitter: 0.4 },
  }
  const base = defaults[kind]
  return { kind, bristles: integer(input.bristles === undefined ? base.bristles : input.bristles, "brush.bristles", 1, slopcameraOilPaintLimits.maxBristles), width: finite(input.width === undefined ? base.width : input.width, "brush.width", 0.5, slopcameraOilPaintLimits.maxBrushWidth), length: finite(input.length === undefined ? base.length : input.length, "brush.length", 0, 96), stiffness: finite(input.stiffness === undefined ? base.stiffness : input.stiffness, "brush.stiffness", 0, 1), pickup: finite(input.pickup === undefined ? base.pickup : input.pickup, "brush.pickup", 0, 1), push: finite(input.push === undefined ? base.push : input.push, "brush.push", 0, 1), lay: finite(input.lay === undefined ? base.lay : input.lay, "brush.lay", 0, 2), splay: finite(input.splay === undefined ? base.splay : input.splay, "brush.splay", 0, 1), jitter: finite(input.jitter === undefined ? base.jitter : input.jitter, "brush.jitter", 0, 1) }
}
function parsePoint(value: unknown, name: string, width: number, height: number): Point { if (!Array.isArray(value) || value.length !== 2) oilPaintFail(`${name} must be [x, y]`); return [finite(value[0], `${name}.x`, 0, width), finite(value[1], `${name}.y`, 0, height)] }
function parseStroke(value: unknown, width: number, height: number, defaultSeed: number): SlopcameraOilPaintStroke {
  const input = record(value, ["pile", "points", "pressure", "attack", "release", "angle", "load", "brush", "seed"], "stroke")
  if (!Array.isArray(input.points) || input.points.length < 2 || input.points.length > slopcameraOilPaintLimits.maxPointsPerStroke) oilPaintFail(`stroke.points must contain 2 through ${slopcameraOilPaintLimits.maxPointsPerStroke} points`)
  const points = input.points.map((point, index) => parsePoint(point, `stroke.points[${index}]`, width, height)); const pressureValue = input.pressure === undefined ? [0.82, 0.68] : input.pressure
  if (!Array.isArray(pressureValue) || pressureValue.length !== 2) oilPaintFail("stroke.pressure must be [start, end]")
  const pressure: readonly [number, number] = [finite(pressureValue[0], "stroke.pressure.start", 0, 1), finite(pressureValue[1], "stroke.pressure.end", 0, 1)]
  return { pile: boundedText(input.pile, "stroke.pile"), points, pressure, attack: finite(input.attack === undefined ? 0.08 : input.attack, "stroke.attack", 0, 1), release: finite(input.release === undefined ? 0.14 : input.release, "stroke.release", 0, 1), angle: finite(input.angle === undefined ? 0 : input.angle, "stroke.angle", -Math.PI, Math.PI), load: finite(input.load === undefined ? 1 : input.load, "stroke.load", 0.05, 1.5), brush: parseBrush(input.brush), seed: integer(input.seed === undefined ? defaultSeed : input.seed, "stroke.seed", 0, 4_294_967_295) }
}

export function parseOilPaintModel(value: unknown): ParsedOilPaintInput {
  const input = record(value, ["version", "width", "height", "seed", "ground", "tubes", "piles", "layers"], "oil-paint source")
  const version = input.version === undefined ? 1 : integer(input.version, "version", 1, 1); if (version !== 1) oilPaintFail("version must be 1")
  const width = integer(input.width, "width", slopcameraOilPaintLimits.widthMin, slopcameraOilPaintLimits.widthMax); const height = integer(input.height, "height", slopcameraOilPaintLimits.heightMin, slopcameraOilPaintLimits.heightMax)
  if (width * height > slopcameraOilPaintLimits.maxPixels) oilPaintFail(`canvas must contain at most ${slopcameraOilPaintLimits.maxPixels} pixels`)
  const seed = integer(input.seed === undefined ? 0 : input.seed, "seed", 0, 4_294_967_295)
  const groundInput = record(input.ground === undefined ? {} : input.ground, ["color", "tooth", "relief"], "ground")
  const ground: SlopcameraOilPaintGround = { color: parseColor(groundInput.color === undefined ? DEFAULT_GROUND : groundInput.color, "ground.color"), tooth: finite(groundInput.tooth === undefined ? 0.55 : groundInput.tooth, "ground.tooth", 0, 1), relief: finite(groundInput.relief === undefined ? 0.8 : groundInput.relief, "ground.relief", 0, 1) }
  if (!Array.isArray(input.tubes) || input.tubes.length < 1 || input.tubes.length > slopcameraOilPaintLimits.maxTubes) oilPaintFail(`tubes must contain 1 through ${slopcameraOilPaintLimits.maxTubes} named tubes`)
  const tubes: SlopcameraOilPaintTube[] = []; const tubeModels = new Map<string, TubeModel>()
  for (const [index, value] of input.tubes.entries()) {
    const item = record(value, ["name", "color", "opacity", "scattering", "drying"], `tube ${index + 1}`); const name = boundedText(item.name, `tube ${index + 1}.name`)
    const tube: SlopcameraOilPaintTube = { name, color: parseColor(item.color, `tube ${index + 1}.color`), opacity: finite(item.opacity === undefined ? 0.94 : item.opacity, `tube ${index + 1}.opacity`, 0.05, 1), scattering: finite(item.scattering === undefined ? 1 : item.scattering, `tube ${index + 1}.scattering`, 0.2, 3), drying: finite(item.drying === undefined ? 0.7 : item.drying, `tube ${index + 1}.drying`, 0.1, 1) }
    if (tubeModels.has(name)) oilPaintFail(`tube name ${name} is duplicated`); tubes.push(tube); tubeModels.set(name, { source: tube, pigment: pigmentFromTube(tube) })
  }
  if (!Array.isArray(input.piles) || input.piles.length < 1 || input.piles.length > slopcameraOilPaintLimits.maxPiles) oilPaintFail(`piles must contain 1 through ${slopcameraOilPaintLimits.maxPiles} named piles`)
  const piles: SlopcameraOilPaintPile[] = []; const pileModels = new Map<string, PileModel>()
  for (const [index, value] of input.piles.entries()) {
    const item = record(value, ["name", "ingredients", "knifePasses"], `pile ${index + 1}`); const name = boundedText(item.name, `pile ${index + 1}.name`)
    if (pileModels.has(name)) oilPaintFail(`pile name ${name} is duplicated`)
    if (!Array.isArray(item.ingredients) || item.ingredients.length < 1 || item.ingredients.length > slopcameraOilPaintLimits.maxPileIngredients) oilPaintFail(`pile ${name}.ingredients must contain 1 through ${slopcameraOilPaintLimits.maxPileIngredients} named tubes`)
    const ingredients: SlopcameraOilPaintIngredient[] = []; const parts: { readonly pigment: Pigment; readonly amount: number }[] = []; const names = new Set<string>()
    for (const [partIndex, valuePart] of item.ingredients.entries()) {
      const part = record(valuePart, ["tube", "amount"], `pile ${name}.ingredients[${partIndex}]`); const tubeName = boundedText(part.tube, `pile ${name}.ingredients[${partIndex}].tube`); const tube = tubeModels.get(tubeName)
      if (tube === undefined) oilPaintFail(`pile ${name} names unknown tube ${tubeName}`); if (names.has(tubeName)) oilPaintFail(`pile ${name} repeats tube ${tubeName}`); names.add(tubeName)
      const amount = finite(part.amount, `pile ${name}.ingredients[${partIndex}].amount`, 0.0001, 1_000_000); ingredients.push({ tube: tubeName, amount }); parts.push({ pigment: tube.pigment, amount })
    }
    const pile: SlopcameraOilPaintPile = { name, ingredients, knifePasses: integer(item.knifePasses === undefined ? 3 : item.knifePasses, `pile ${name}.knifePasses`, 1, 16) }
    piles.push(pile); pileModels.set(name, { source: pile, pigment: mixPigments(parts) })
  }
  if (!Array.isArray(input.layers) || input.layers.length < 1 || input.layers.length > slopcameraOilPaintLimits.maxLayers) oilPaintFail(`layers must contain 1 through ${slopcameraOilPaintLimits.maxLayers} layers`)
  const layers: SlopcameraOilPaintLayer[] = []; let strokeCount = 0; let pointCount = 0; let totalSamples = 0; let totalWaitSteps = 0
  for (const [layerIndex, layerValue] of input.layers.entries()) {
    const item = record(layerValue, ["name", "strokes", "waitSteps"], `layer ${layerIndex + 1}`)
    if (!Array.isArray(item.strokes) || item.strokes.length < 1 || item.strokes.length > slopcameraOilPaintLimits.maxLayerStrokes) oilPaintFail(`layer ${layerIndex + 1}.strokes must contain 1 through ${slopcameraOilPaintLimits.maxLayerStrokes} strokes`)
    const strokes: SlopcameraOilPaintStroke[] = []
    for (const [strokeIndex, strokeValue] of item.strokes.entries()) {
      const stroke = parseStroke(strokeValue, width, height, nextSeed(seed, layerIndex, strokeIndex)); if (!pileModels.has(stroke.pile)) oilPaintFail(`stroke ${layerIndex + 1}.${strokeIndex + 1} names unknown pile ${stroke.pile}; paint can only come from a named pile`)
      let length = 0; for (let pointIndex = 1; pointIndex < stroke.points.length; pointIndex += 1) { const a = stroke.points[pointIndex - 1]!; const b = stroke.points[pointIndex]!; length += Math.hypot(b[0] - a[0], b[1] - a[1]) }
      const samples = Math.ceil(length / Math.max(0.75, stroke.brush.width * 0.32)) + 1; if (samples > slopcameraOilPaintLimits.maxStrokeSamples) oilPaintFail(`stroke ${layerIndex + 1}.${strokeIndex + 1} exceeds ${slopcameraOilPaintLimits.maxStrokeSamples} simulated bristle steps`)
      strokeCount += 1; pointCount += stroke.points.length; totalSamples += samples * stroke.brush.bristles; if (strokeCount > slopcameraOilPaintLimits.maxStrokes) oilPaintFail(`source exceeds ${slopcameraOilPaintLimits.maxStrokes} strokes`); if (pointCount > slopcameraOilPaintLimits.maxTotalPoints) oilPaintFail(`source exceeds ${slopcameraOilPaintLimits.maxTotalPoints} stroke points`); strokes.push(stroke)
    }
    const waitSteps = integer(item.waitSteps === undefined ? 0 : item.waitSteps, `layer ${layerIndex + 1}.waitSteps`, 0, slopcameraOilPaintLimits.maxClockSteps); totalWaitSteps += waitSteps
    layers.push({ name: item.name === undefined ? `layer-${layerIndex + 1}` : boundedText(item.name, `layer ${layerIndex + 1}.name`), strokes, waitSteps })
  }
  if (totalSamples + totalWaitSteps > slopcameraOilPaintLimits.maxSimulationSteps) oilPaintFail(`source exceeds ${slopcameraOilPaintLimits.maxSimulationSteps} bounded simulation steps`)
  if (width * height * totalWaitSteps > slopcameraOilPaintLimits.maxClockWork) oilPaintFail("canvas and drying clock exceed the bounded clock work budget")
  return { source: { version: 1, width, height, seed, ground, tubes, piles, layers }, tubes: tubeModels, piles: pileModels, totalWaitSteps }
}

export function kmRatio(k: number, s: number): number { return Math.max(0, k / Math.max(s, 1e-9)) }
export function kmReflectance(k: number, s: number): number { const ratio = kmRatio(k, s); return clamp(1 + ratio - Math.sqrt(ratio * ratio + 2 * ratio)) }
export function kmLayer(k: number, s: number, thickness: number, substrate: number): number { if (thickness <= 0 || s <= 1e-9) return substrate; const infinite = kmReflectance(k, s); const attenuation = Math.exp(-Math.sqrt(Math.max(0, k * (k + 2 * s))) * thickness); return clamp(infinite + (substrate - infinite) * attenuation * (1 - infinite) / Math.max(1e-6, 1 - infinite * substrate)) }
export function inspectKmMix(tubes: readonly SlopcameraOilPaintTube[], ingredients: readonly SlopcameraOilPaintIngredient[]): readonly number[] {
  if (tubes.length === 0 || ingredients.length === 0) oilPaintFail("KM inspection needs tubes and ingredients")
  const map = new Map(tubes.map(tube => [tube.name, pigmentFromTube(tube)] as const)); const parts = ingredients.map(ingredient => { const pigment = map.get(ingredient.tube); if (pigment === undefined) oilPaintFail(`KM inspection names unknown tube ${ingredient.tube}`); return { pigment, amount: finite(ingredient.amount, "ingredient.amount", 0.0001, 1_000_000) } }); const mixed = mixPigments(parts); return Array.from(mixed.k, (value, index) => value / Math.max(1e-9, mixed.s[index]!))
}

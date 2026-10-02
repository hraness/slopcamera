import {
  clamp, kmLayer, noise, nextSeed, parseOilPaintModel, rgb, seededRandom, smoothstep,
  SPECTRAL_BANDS, type Bristle, type ParsedOilPaintInput, type PileModel, type Point,
  type Pigment, type SlopcameraOilPaintStroke, type SlopcameraOilPaintStrokeLog,
  slopcameraOilPaintLimits,
} from "./oil-paint-model.js"

export interface OilPaintEngineResult {
  readonly width: number
  readonly height: number
  readonly clockSteps: number
  readonly layers: number
  readonly strokes: number
  readonly wetPixels: number
  readonly image: Uint8Array
  readonly strokeLog: readonly SlopcameraOilPaintStrokeLog[]
}

interface SimulationCanvas {
  readonly width: number
  readonly height: number
  readonly size: number
  readonly substrate: Float64Array
  readonly wetK: Float64Array
  readonly wetS: Float64Array
  readonly wetVolume: Float64Array
  readonly wetCure: Float64Array
  readonly wetDrying: Float64Array
  readonly relief: Float64Array
}

function linear(value: number): number { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4 }
function encoded(value: number): number { const channel = clamp(value); return 255 * (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055) }
function spectralColor(value: readonly [number, number, number]): Float64Array {
  const channels: readonly [number, number, number] = [linear(value[0]), linear(value[1]), linear(value[2])]; const white = Math.min(...channels); const result = new Float64Array(SPECTRAL_BANDS)
  for (let band = 0; band < SPECTRAL_BANDS; band += 1) { const wavelength = 410 + band * 25; const red = Math.exp(-(((wavelength - 610) / 58) ** 2)); const green = Math.exp(-(((wavelength - 535) / 48) ** 2)); const blue = Math.exp(-(((wavelength - 455) / 42) ** 2)); result[band] = 0.035 + 0.91 * clamp(white * 0.92 + (channels[0] - white) * red + (channels[1] - white) * green + (channels[2] - white) * blue) }
  return result
}

function createCanvas(parsed: ParsedOilPaintInput): SimulationCanvas {
  const { source } = parsed; const size = source.width * source.height
  const substrate = new Float64Array(size * SPECTRAL_BANDS); const wetK = new Float64Array(size * SPECTRAL_BANDS); const wetS = new Float64Array(size * SPECTRAL_BANDS); const wetVolume = new Float64Array(size); const wetCure = new Float64Array(size); const wetDrying = new Float64Array(size); const relief = new Float64Array(size)
  const ground = spectralColor(rgb(source.ground.color))
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    const index = y * source.width + x; relief[index] = Math.max(0, source.ground.relief * 0.35 + (noise(source.seed ^ 0x19a7, x, y) - 0.5) * source.ground.tooth); const base = index * SPECTRAL_BANDS
    for (let band = 0; band < SPECTRAL_BANDS; band += 1) substrate[base + band] = clamp(ground[band]! * (1 - source.ground.tooth * 0.018 * (0.5 + noise(source.seed + band * 31, x, y))))
  }
  return { width: source.width, height: source.height, size, substrate, wetK, wetS, wetVolume, wetCure, wetDrying, relief }
}

function mixIntoWet(canvas: SimulationCanvas, index: number, pigment: Pigment, amount: number, cure: number): void {
  if (amount <= 0) return; const previous = canvas.wetVolume[index]!; const next = previous + amount; const base = index * SPECTRAL_BANDS
  if (previous <= 1e-12) { for (let band = 0; band < SPECTRAL_BANDS; band += 1) { canvas.wetK[base + band] = pigment.k[band]!; canvas.wetS[base + band] = pigment.s[band]! }; canvas.wetCure[index] = cure; canvas.wetDrying[index] = pigment.drying }
  else { const ratio = amount / next; for (let band = 0; band < SPECTRAL_BANDS; band += 1) { canvas.wetK[base + band] = canvas.wetK[base + band]! + (pigment.k[band]! - canvas.wetK[base + band]!) * ratio; canvas.wetS[base + band] = canvas.wetS[base + band]! + (pigment.s[band]! - canvas.wetS[base + band]!) * ratio }; canvas.wetCure[index] = canvas.wetCure[index]! + (cure - canvas.wetCure[index]!) * ratio; canvas.wetDrying[index] = canvas.wetDrying[index]! + (pigment.drying - canvas.wetDrying[index]!) * ratio }
  canvas.wetVolume[index] = next; canvas.relief[index] = canvas.relief[index]! + amount * 0.32
}
function takeWet(canvas: SimulationCanvas, index: number, amount: number, bristle: Bristle): number {
  const available = canvas.wetVolume[index]!; const taken = Math.min(Math.max(0, amount), available); if (taken <= 0) return 0; const weight = taken / Math.max(1e-9, bristle.load + taken); const base = index * SPECTRAL_BANDS
  for (let band = 0; band < SPECTRAL_BANDS; band += 1) { bristle.k[band] = bristle.k[band]! + (canvas.wetK[base + band]! - bristle.k[band]!) * weight; bristle.s[band] = bristle.s[band]! + (canvas.wetS[base + band]! - bristle.s[band]!) * weight }
  bristle.cure += (canvas.wetCure[index]! - bristle.cure) * weight; bristle.load = Math.min(2, bristle.load + taken * 0.45); canvas.wetVolume[index] = available - taken
  if (canvas.wetVolume[index]! <= 1e-8) { canvas.wetVolume[index] = 0; canvas.wetCure[index] = 0; canvas.wetDrying[index] = 0 }
  return taken
}
function transferWet(canvas: SimulationCanvas, source: number, destination: number, amount: number): void {
  if (source === destination) return; const available = canvas.wetVolume[source]!; const moved = Math.min(Math.max(0, amount), available); if (moved <= 0) return; const base = source * SPECTRAL_BANDS
  const pigment: Pigment = { k: canvas.wetK.slice(base, base + SPECTRAL_BANDS), s: canvas.wetS.slice(base, base + SPECTRAL_BANDS), drying: canvas.wetDrying[source]! }; const cure = canvas.wetCure[source]!
  canvas.wetVolume[source] = available - moved; canvas.relief[source] = Math.max(0, canvas.relief[source]! - moved * 0.2); mixIntoWet(canvas, destination, pigment, moved, cure)
  if (canvas.wetVolume[source]! <= 1e-8) { canvas.wetVolume[source] = 0; canvas.wetCure[source] = 0; canvas.wetDrying[source] = 0 }
}
function brushPigment(bristle: Bristle): Pigment { return { k: bristle.k, s: bristle.s, drying: bristle.drying } }
function samplesFor(points: readonly Point[], step: number): readonly { readonly point: Point; readonly distance: number }[] {
  const result: { point: Point; distance: number }[] = []; let travelled = 0; result.push({ point: points[0]!, distance: 0 })
  for (let segment = 1; segment < points.length; segment += 1) { const a = points[segment - 1]!; const b = points[segment]!; const length = Math.hypot(b[0] - a[0], b[1] - a[1]); const count = Math.max(1, Math.ceil(length / step)); for (let part = 1; part <= count; part += 1) { const amount = part / count; result.push({ point: [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount], distance: travelled + length * amount }) }; travelled += length }
  return result
}
function makeBristles(stroke: SlopcameraOilPaintStroke, pile: PileModel): Bristle[] {
  const random = seededRandom(stroke.seed); const bristles: Bristle[] = []; const golden = Math.PI * (3 - Math.sqrt(5)); const radius = Math.max(0.6, stroke.brush.width * (0.42 + stroke.brush.splay * 0.18) / Math.sqrt(stroke.brush.bristles))
  for (let index = 0; index < stroke.brush.bristles; index += 1) {
    const fraction = (index + 0.5) / stroke.brush.bristles; const radial = Math.sqrt(fraction); const angle = index * golden; const randomLateral = (random() - 0.5) * stroke.brush.jitter * stroke.brush.width * 0.12; const randomAlong = (random() - 0.5) * stroke.brush.jitter * stroke.brush.length * 0.08
    let lateral = radial * Math.cos(angle) * stroke.brush.width * 0.5 + randomLateral; let along = radial * Math.sin(angle) * stroke.brush.length * 0.2 + randomAlong
    if (stroke.brush.kind === "fan") { lateral = (fraction * 2 - 1) * stroke.brush.width * 0.5 + randomLateral; along = Math.abs(fraction * 2 - 1) * stroke.brush.length * 0.2 + randomAlong }
    const normalized = Math.min(1, Math.hypot(lateral / Math.max(1, stroke.brush.width * 0.5), along / Math.max(1, stroke.brush.length))); const threshold = stroke.brush.kind === "round" || stroke.brush.kind === "filbert" ? 0.08 + normalized * 0.58 : 0.03 + normalized * 0.12
    bristles.push({ x: stroke.points[0]![0], y: stroke.points[0]![1], rootLateral: lateral, rootAlong: along, threshold, radius, load: stroke.load, cure: 0, k: pile.pigment.k.slice(), s: pile.pigment.s.slice(), drying: pile.pigment.drying })
  }
  return bristles
}
function paintStroke(canvas: SimulationCanvas, stroke: SlopcameraOilPaintStroke, pile: PileModel): number {
  const samples = samplesFor(stroke.points, Math.max(0.75, stroke.brush.width * 0.32)); const totalDistance = samples[samples.length - 1]?.distance ?? 0; const bristles = makeBristles(stroke, pile)
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const sample = samples[sampleIndex]!; const u = totalDistance <= 0 ? 0 : sample.distance / totalDistance; const attack = stroke.attack <= 0 ? 1 : 0.08 + 0.92 * smoothstep(u / stroke.attack); const release = stroke.release <= 0 ? 1 : 0.06 + 0.94 * smoothstep((1 - u) / stroke.release); const pressure = clamp((stroke.pressure[0] + (stroke.pressure[1] - stroke.pressure[0]) * u) * attack * release)
    const next = samples[Math.min(samples.length - 1, sampleIndex + 1)]!.point; const previous = samples[Math.max(0, sampleIndex - 1)]!.point; const tangent = Math.atan2(next[1] - previous[1], next[0] - previous[0]); const lateralAngle = tangent + Math.PI / 2 + stroke.angle; const lateralX = Math.cos(lateralAngle); const lateralY = Math.sin(lateralAngle); const alongX = Math.cos(tangent); const alongY = Math.sin(tangent)
    for (const bristle of bristles) {
      const targetX = sample.point[0] + lateralX * bristle.rootLateral * (0.55 + pressure * 0.45) + alongX * bristle.rootAlong * pressure; const targetY = sample.point[1] + lateralY * bristle.rootLateral * (0.55 + pressure * 0.45) + alongY * bristle.rootAlong * pressure; const response = 0.35 + stroke.brush.stiffness * 0.5; bristle.x += (targetX - bristle.x) * response; bristle.y += (targetY - bristle.y) * response
      if (pressure < bristle.threshold) continue; const centerX = Math.round(bristle.x); const centerY = Math.round(bristle.y); const extent = Math.ceil(bristle.radius); const centerIndex = Math.max(0, Math.min(canvas.size - 1, centerY * canvas.width + centerX)); const contact = clamp(0.72 + stroke.brush.stiffness * 0.28 - canvas.relief[centerIndex]! * 0.06 * (1 - stroke.brush.stiffness), 0.25, 1)
      for (let y = centerY - extent; y <= centerY + extent; y += 1) { if (y < 0 || y >= canvas.height) continue; for (let x = centerX - extent; x <= centerX + extent; x += 1) { if (x < 0 || x >= canvas.width) continue; const distance = Math.hypot(x - bristle.x, y - bristle.y); if (distance > bristle.radius) continue; const coverage = (1 - distance / Math.max(1e-6, bristle.radius)) ** 2 * contact; const index = y * canvas.width + x; const picked = takeWet(canvas, index, canvas.wetVolume[index]! * stroke.brush.pickup * coverage * (1 - canvas.wetCure[index]!) * 0.16, bristle); const amount = bristle.load * stroke.brush.lay * pressure * coverage * 0.018; mixIntoWet(canvas, index, brushPigment(bristle), amount, bristle.cure); if (picked > 0) bristle.load = Math.min(2, bristle.load + picked * 0.02)
        if (stroke.brush.push > 0 && pressure > 0.15) { const aheadX = Math.round(x + alongX * Math.max(1, stroke.brush.width * 0.16)); const aheadY = Math.round(y + alongY * Math.max(1, stroke.brush.width * 0.16)); if (aheadX >= 0 && aheadX < canvas.width && aheadY >= 0 && aheadY < canvas.height) transferWet(canvas, index, aheadY * canvas.width + aheadX, canvas.wetVolume[index]! * stroke.brush.push * coverage * 0.035) }
      } }
      bristle.load = Math.max(0, bristle.load * (1 - 0.018 * pressure))
    }
  }
  return samples.length
}
function advanceClock(canvas: SimulationCanvas, steps: number): void {
  for (let step = 0; step < steps; step += 1) for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    const index = y * canvas.width + x; const volume = canvas.wetVolume[index]!; if (volume <= 0) continue; const drying = canvas.wetDrying[index]!; canvas.wetCure[index] = Math.min(1, canvas.wetCure[index]! + 0.035 * (0.55 + drying * 0.75) / (1 + volume * 0.006))
    const left = canvas.relief[y * canvas.width + Math.max(0, x - 1)]!; const right = canvas.relief[y * canvas.width + Math.min(canvas.width - 1, x + 1)]!; const above = canvas.relief[Math.max(0, y - 1) * canvas.width + x]!; const below = canvas.relief[Math.min(canvas.height - 1, y + 1) * canvas.width + x]!; const average = (left + right + above + below) / 4; const leveling = 0.018 * (1 - canvas.wetCure[index]!) / (1 + volume * 0.08); canvas.relief[index] = canvas.relief[index]! + (average - canvas.relief[index]!) * leveling
  }
}
function commitDry(canvas: SimulationCanvas): void {
  for (let index = 0; index < canvas.size; index += 1) { const volume = canvas.wetVolume[index]!; if (volume <= 0 || canvas.wetCure[index]! < 0.92) continue; const base = index * SPECTRAL_BANDS; for (let band = 0; band < SPECTRAL_BANDS; band += 1) { canvas.substrate[base + band] = kmLayer(canvas.wetK[base + band]!, canvas.wetS[base + band]!, volume * 0.45, canvas.substrate[base + band]!); canvas.wetK[base + band] = 0; canvas.wetS[base + band] = 0 } canvas.wetVolume[index] = 0; canvas.wetCure[index] = 0; canvas.wetDrying[index] = 0 }
}
function rgbFromSpectrum(spectrum: Float64Array): readonly [number, number, number] {
  const red = [0.02, 0.04, 0.09, 0.18, 0.32, 0.5, 0.72, 0.9, 1, 0.91, 0.62, 0.3]; const green = [0.14, 0.42, 0.78, 1, 0.9, 0.56, 0.26, 0.1, 0.04, 0.02, 0.01, 0]; const blue = [0.86, 1, 0.92, 0.62, 0.3, 0.1, 0.03, 0.01, 0, 0, 0, 0]
  const convert = (weights: readonly number[]): number => spectrum.reduce((sum, value, index) => sum + value * weights[index]!, 0) / weights.reduce((sum, value) => sum + value, 0); return [convert(red), convert(green), convert(blue)]
}
function renderPpm(canvas: SimulationCanvas): Uint8Array {
  const header = new TextEncoder().encode(`P6\n${canvas.width} ${canvas.height}\n255\n`); const output = new Uint8Array(header.byteLength + canvas.size * 3); output.set(header)
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    const index = y * canvas.width + x; const base = index * SPECTRAL_BANDS; const spectrum = new Float64Array(SPECTRAL_BANDS); const volume = canvas.wetVolume[index]!; for (let band = 0; band < SPECTRAL_BANDS; band += 1) spectrum[band] = volume > 0 ? kmLayer(canvas.wetK[base + band]!, canvas.wetS[base + band]!, volume * 0.45, canvas.substrate[base + band]!) : canvas.substrate[base + band]!
    const value = rgbFromSpectrum(spectrum); const left = canvas.relief[y * canvas.width + Math.max(0, x - 1)]!; const right = canvas.relief[y * canvas.width + Math.min(canvas.width - 1, x + 1)]!; const above = canvas.relief[Math.max(0, y - 1) * canvas.width + x]!; const below = canvas.relief[Math.min(canvas.height - 1, y + 1) * canvas.width + x]!; const shade = clamp(1 + (left - right + above - below) * 0.09, 0.82, 1.18); const offset = header.byteLength + index * 3; output[offset] = Math.round(encoded(value[0] * shade)); output[offset + 1] = Math.round(encoded(value[1] * shade)); output[offset + 2] = Math.round(encoded(value[2] * shade))
  }
  if (output.byteLength > slopcameraOilPaintLimits.maxOutputBytes) throw new Error(`Invalid oil-paint input: rendered PPM exceeds ${slopcameraOilPaintLimits.maxOutputBytes} bytes`); return output
}

export function runOilPaintEngine(parsed: ParsedOilPaintInput): OilPaintEngineResult {
  const canvas = createCanvas(parsed); const logs: SlopcameraOilPaintStrokeLog[] = []; let clockSteps = 0; let simulatedSteps = 0
  for (const [layerIndex, layer] of parsed.source.layers.entries()) { for (const [strokeIndex, stroke] of layer.strokes.entries()) { const pile = parsed.piles.get(stroke.pile); if (pile === undefined) throw new Error(`Invalid oil-paint input: unknown pile ${stroke.pile}`); simulatedSteps += paintStroke(canvas, stroke, pile); logs.push({ version: 1, layer: layerIndex, index: strokeIndex, ...stroke }) }; advanceClock(canvas, layer.waitSteps); clockSteps += layer.waitSteps; simulatedSteps += layer.waitSteps; commitDry(canvas) }
  if (simulatedSteps > slopcameraOilPaintLimits.maxSimulationSteps) throw new Error("Invalid oil-paint input: simulation exceeded its step bound")
  const image = renderPpm(canvas); return { width: parsed.source.width, height: parsed.source.height, clockSteps, layers: parsed.source.layers.length, strokes: logs.length, wetPixels: canvas.wetVolume.reduce((count, volume) => count + (volume > 0 ? 1 : 0), 0), image, strokeLog: logs }
}

export function runOilPaintSource(value: unknown): { readonly parsed: ParsedOilPaintInput; readonly result: OilPaintEngineResult } { const parsed = parseOilPaintModel(value); return { parsed, result: runOilPaintEngine(parsed) } }

export function replayLogMatches(value: unknown, result: OilPaintEngineResult): boolean { return JSON.stringify(result.strokeLog) === JSON.stringify(value) }

export function deriveStrokeSeed(sourceSeed: number, layer: number, index: number): number { return nextSeed(sourceSeed, layer, index) }

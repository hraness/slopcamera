import sharp from "sharp"

/** Local, deterministic post-processing. This module performs no provider I/O. */
export interface SlopcameraPixelLandscapeInput {
  panels: readonly Uint8Array[]
  width: number
  panelHeight: number
  overlap: number
  pixelSize: number
  background: string
  primary: string
  secondary: string
  ink?: string
  alphaMax?: number
  gamma?: number
  /** Gain applied to extracted darkness before gamma; preserves source opacity. */
  inkContrast?: number | undefined
  /** Width fraction of central content corridor; 0 disables its 90% attenuation. */
  quietCenter?: number
  /** Integer Lanczos interpolation scale, never generated detail. */
  upscale?: number
}

export interface SlopcameraPixelLandscapeResult {
  raster: Uint8Array
  pixels: Uint8Array
  preview: Uint8Array
  mask: Uint8Array
  width: number
  height: number
  ink: string
  metrics: {
    /** Mean premultiplied RGBA mismatch along overlap seams, normalized 0..1. */
    seamError: number
    /** Mean alpha of all output pixels, normalized 0..1. */
    alphaCoverage: number
    /** Mean alpha in the middle third, normalized 0..1. */
    centerCoverage: number
    /** Actual minimum OKLab distance, including any intentional neutral surface overlap. */
    paletteDistance: number
  }
  warnings: readonly string[]
}

type Rgb = readonly [number, number, number]
type Lab = readonly [number, number, number]
type PaletteInput = Pick<SlopcameraPixelLandscapeInput, "background" | "primary" | "secondary" | "ink" | "alphaMax">

const MAX_PIXELS = 64_000_000
const MAX_PANEL_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 128 * 1024 * 1024
const MIN_PALETTE_DISTANCE = 0.055
const DEFAULT_ALPHA_MAX = 0.85

function clamp(value: number, low = 0, high = 1): number {
  return Math.max(low, Math.min(high, value))
}

function finite(value: unknown, name: string, low: number, high: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new Error(`${name} must be a finite number from ${low} to ${high}`)
  }
  return value
}

function integer(value: unknown, name: string, low: number, high: number): number {
  const result = finite(value, name, low, high)
  if (!Number.isSafeInteger(result)) throw new Error(`${name} must be an integer`)
  return result
}

function parseColor(value: unknown, name: string): Rgb {
  if (typeof value !== "string" || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) {
    throw new Error(`${name} must be an opaque #RGB or #RRGGBB color`)
  }
  const hex = value.length === 4 ? [...value.slice(1)].map((part) => part + part).join("") : value.slice(1)
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

function hexColor(rgb: Rgb): string {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`
}

function linear(value: number): number {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function srgb(value: number): number {
  return 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)
}

function oklab(rgb: Rgb): Lab {
  const r = linear(rgb[0])
  const g = linear(rgb[1])
  const b = linear(rgb[2])
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

/** Gamut-map by reducing chroma, preserving the background hue. */
function fromOklch(lightness: number, chroma: number, hue: number): Rgb {
  let result: Rgb = [0, 0, 0]
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = chroma * Math.cos(hue)
    const b = chroma * Math.sin(hue)
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
    const channels = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    result = channels.map((channel) => Math.round(srgb(clamp(channel)))) as unknown as Rgb
    if (channels.every((channel) => channel >= -0.000001 && channel <= 1.000001)) return result
    chroma *= 0.9
  }
  return result
}

function distance(left: Lab, right: Lab): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
}

function composite(background: Rgb, ink: Rgb, alpha: number): Rgb {
  // Browser source-over compositing occurs in encoded sRGB for these PNG/CSS colors.
  return [
    Math.round(background[0] * (1 - alpha) + ink[0] * alpha),
    Math.round(background[1] * (1 - alpha) + ink[1] * alpha),
    Math.round(background[2] * (1 - alpha) + ink[2] * alpha),
  ]
}

interface Accent {
  name: "primary" | "secondary"
  lab: Lab
  surface: boolean
}

function paletteAccents(input: PaletteInput, background: Rgb): readonly Accent[] {
  const primary = oklab(parseColor(input.primary, "primary"))
  const secondary = oklab(parseColor(input.secondary, "secondary"))
  // A near-background neutral secondary is a surface fill, not an accent identity.
  // Keep primary strict even when neutral so important foreground identity is protected.
  const surface = Math.hypot(secondary[1], secondary[2]) < 0.04 && distance(oklab(background), secondary) < 0.12
  return [{ name: "primary", lab: primary, surface: false }, { name: "secondary", lab: secondary, surface }]
}

function analyzePalette(background: Rgb, ink: Rgb, accents: readonly Accent[], alphaMax: number): { distance: number; safeDistance: number; warnings: readonly string[] } {
  let closest = Math.min(...accents.map((accent) => distance(oklab(ink), accent.lab)))
  let safeDistance = closest
  const overlappingSurfaces = new Set<string>()
  const ceiling = Math.round(alphaMax * 255)
  for (let alpha = 0; alpha <= ceiling; alpha++) {
    const lab = oklab(composite(background, ink, alpha / 255))
    for (const accent of accents) {
      const delta = distance(lab, accent.lab)
      closest = Math.min(closest, delta)
      if (!accent.surface) safeDistance = Math.min(safeDistance, delta)
      else if (delta < MIN_PALETTE_DISTANCE) overlappingSurfaces.add(accent.name)
    }
  }
  return { distance: closest, safeDistance, warnings: [...overlappingSurfaces].map((name) => `The alpha ramp passes near the neutral ${name} surface color; only full ink separation is guaranteed for this surface. Chromatic accent separation remains enforced.`) }
}

function sameHueDarker(background: Lab, ink: Lab): boolean {
  if (ink[0] > background[0] - 0.025) return false
  const backgroundChroma = Math.hypot(background[1], background[2])
  const inkChroma = Math.hypot(ink[1], ink[2])
  if (backgroundChroma < 0.012) return inkChroma < 0.025
  if (inkChroma < 0.002) return false
  const hueDifference = Math.atan2(ink[2], ink[1]) - Math.atan2(background[2], background[1])
  const difference = Math.atan2(Math.sin(hueDifference), Math.cos(hueDifference))
  return Math.abs(difference) <= Math.PI / 12
}

/** Select same-hue darker ink; reject palettes whose rendered alpha ramp hits an accent. */
export function chooseSlopcameraLandscapeInk(input: PaletteInput): string {
  if (typeof input !== "object" || input === null) throw new Error("palette must be an object")
  const background = parseColor(input.background, "background")
  const accents = paletteAccents(input, background)
  const alphaMax = finite(input.alphaMax === undefined ? DEFAULT_ALPHA_MAX : input.alphaMax, "alphaMax", 0, 1)
  const lab = oklab(background)
  if (input.ink !== undefined) {
    const ink = parseColor(input.ink, "ink")
    if (!sameHueDarker(lab, oklab(ink))) throw new Error("ink must be darker than background and preserve its OKLCH hue")
    if (analyzePalette(background, ink, accents, alphaMax).safeDistance < MIN_PALETTE_DISTANCE) throw new Error("ink or its alpha composites collide with primary/secondary colors")
    return hexColor(ink)
  }
  const hue = Math.atan2(lab[2], lab[1])
  const chroma = Math.hypot(lab[1], lab[2])
  for (const depth of [0.22, 0.3, 0.38, 0.46, 0.14, 0.1, 0.06]) {
    const lightness = Math.max(0.035, lab[0] - depth)
    for (const chromaScale of [0.85, 0.65, 1, 0.4]) {
      const ink = fromOklch(lightness, chroma * chromaScale, hue)
      if (sameHueDarker(lab, oklab(ink)) && analyzePalette(background, ink, accents, alphaMax).safeDistance >= MIN_PALETTE_DISTANCE) return hexColor(ink)
    }
  }
  throw new Error("No darker same-hue landscape ink avoids this palette's primary/secondary colors at every alpha step; change the palette or ink")
}

interface ParsedInput {
  panels: readonly Uint8Array[]
  width: number
  panelHeight: number
  height: number
  overlap: number
  pixelSize: number
  background: Rgb
  ink: Rgb
  inkHex: string
  alphaMax: number
  gamma: number
  inkContrast: number
  quietCenter: number
  paletteDistance: number
  paletteWarnings: readonly string[]
  upscale: number
}

function parseInput(input: SlopcameraPixelLandscapeInput): ParsedInput {
  if (typeof input !== "object" || input === null) throw new Error("landscape input must be an object")
  if (!Array.isArray(input.panels) || input.panels.length < 1 || input.panels.length > 8) throw new Error("panels must contain 1 to 8 images")
  let total = 0
  for (const panel of input.panels) {
    if (!(panel instanceof Uint8Array) || panel.byteLength === 0 || panel.byteLength > MAX_PANEL_BYTES) throw new Error("each panel must be nonempty Uint8Array image bytes, at most 32 MiB")
    total += panel.byteLength
  }
  if (total > MAX_TOTAL_BYTES) throw new Error("combined panel input must not exceed 128 MiB")
  const upscale = integer(input.upscale === undefined ? 1 : input.upscale, "upscale", 1, 4)
  const width = integer(input.width, "width", 1, 16_384) * upscale
  const panelHeight = integer(input.panelHeight, "panelHeight", 1, 16_384) * upscale
  const overlap = integer(input.overlap, "overlap", 0, input.panelHeight - 1) * upscale
  const height = panelHeight + (input.panels.length - 1) * (panelHeight - overlap)
  if (width * height > MAX_PIXELS) throw new Error("full landscape output must not exceed 64 million pixels")
  const pixelSize = integer(input.pixelSize, "pixelSize", 1, Math.max(width, height))
  const alphaMax = finite(input.alphaMax === undefined ? DEFAULT_ALPHA_MAX : input.alphaMax, "alphaMax", 0, 1)
  const gamma = finite(input.gamma === undefined ? 1.35 : input.gamma, "gamma", 0.1, 8)
  const inkContrast = finite(input.inkContrast === undefined ? 1 : input.inkContrast, "inkContrast", 0.1, 8)
  const quietCenter = finite(input.quietCenter === undefined ? 0.55 : input.quietCenter, "quietCenter", 0, 1)
  const inkHex = chooseSlopcameraLandscapeInk(input)
  const background = parseColor(input.background, "background")
  const ink = parseColor(inkHex, "ink")
  const analysis = analyzePalette(background, ink, paletteAccents(input, background), alphaMax)
  return { panels: input.panels.map((panel) => Uint8Array.from(panel)), width, panelHeight, height, overlap, pixelSize, background, ink, inkHex, alphaMax, gamma, inkContrast, quietCenter, upscale, paletteDistance: analysis.distance, paletteWarnings: analysis.warnings }
}

async function decode(panel: Uint8Array, width: number, height: number, index: number): Promise<Uint8Array> {
  try {
    const image = sharp(panel, { limitInputPixels: MAX_PIXELS, failOn: "error", sequentialRead: true })
    const metadata = await image.metadata()
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS || (metadata.pages ?? 1) !== 1) throw new Error("panel dimensions/pages exceed limits")
    if (!["png", "jpeg", "webp", "avif", "heif"].includes(metadata.format ?? "")) throw new Error("only static PNG, JPEG, WebP, AVIF/HEIF raster images are accepted")
    return await image.rotate().resize(width, height, { fit: "fill", kernel: "lanczos3" }).toColourspace("srgb").ensureAlpha().raw().toBuffer()
  } catch {
    throw new Error(`panel ${index + 1} is not a supported, valid, bounded static raster image`)
  }
}

function pixelError(left: Uint8Array, leftOffset: number, right: Uint8Array, rightOffset: number): number {
  const la = left[leftOffset + 3]! / 255
  const ra = right[rightOffset + 3]! / 255
  let error = Math.abs(la - ra)
  for (let channel = 0; channel < 3; channel++) error += Math.abs(left[leftOffset + channel]! * la - right[rightOffset + channel]! * ra) / 255
  return error / 4
}

/** Dynamic-programming horizontal seam; adjacent columns move at most one row. */
function findSeam(top: Uint8Array, bottom: Uint8Array, width: number, overlap: number): { rows: Int32Array; error: number } {
  const rows = new Int32Array(width)
  const backtrack = new Int8Array(width * overlap)
  let previous = new Float64Array(overlap)
  let next = new Float64Array(overlap)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < overlap; y++) {
      let best = y
      if (x > 0) {
        for (let candidate = Math.max(0, y - 1); candidate <= Math.min(overlap - 1, y + 1); candidate++) {
          if (previous[candidate]! < previous[best]!) best = candidate
        }
      }
      // Prefer the middle on exact ties, making identical overlaps predictable.
      const tie = Math.abs(y - (overlap - 1) / 2) * 1e-10
      next[y] = pixelError(top, (y * width + x) * 4, bottom, (y * width + x) * 4) + tie + (x === 0 ? 0 : previous[best]!)
      backtrack[x * overlap + y] = best - y
    }
    const swap = previous
    previous = next
    next = swap
  }
  let row = 0
  for (let y = 1; y < overlap; y++) if (previous[y]! < previous[row]!) row = y
  let error = 0
  for (let x = width - 1; x >= 0; x--) {
    rows[x] = row
    error += pixelError(top, (row * width + x) * 4, bottom, (row * width + x) * 4)
    row += backtrack[x * overlap + row]!
  }
  return { rows, error: error / width }
}

function blendPixel(output: Uint8Array, outputOffset: number, top: Uint8Array, topOffset: number, bottom: Uint8Array, bottomOffset: number, amount: number): void {
  const ta = top[topOffset + 3]! / 255 * (1 - amount)
  const ba = bottom[bottomOffset + 3]! / 255 * amount
  const alpha = ta + ba
  for (let channel = 0; channel < 3; channel++) output[outputOffset + channel] = alpha === 0 ? 0 : Math.round((top[topOffset + channel]! * ta + bottom[bottomOffset + channel]! * ba) / alpha)
  output[outputOffset + 3] = Math.round(alpha * 255)
}

function smoothstep(value: number): number {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}

function pixelize(raster: Uint8Array, input: ParsedInput): { pixels: Uint8Array; mask: Uint8Array; alphaCoverage: number; centerCoverage: number } {
  const { width, height, pixelSize, ink, alphaMax, gamma, quietCenter } = input
  const pixels = new Uint8Array(width * height * 4)
  const mask = new Uint8Array(pixels.length)
  let alphaTotal = 0
  let centerTotal = 0
  let centerCount = 0
  const endFade = Math.min(height * 0.018, pixelSize * 3)
  // Area-average into cells, then nearest-expand on ONE grid for the entire scroll.
  for (let cy = 0; cy < height; cy += pixelSize) {
    for (let cx = 0; cx < width; cx += pixelSize) {
      const right = Math.min(width, cx + pixelSize)
      const bottom = Math.min(height, cy + pixelSize)
      let opacity = 0
      let brightness = 0
      for (let y = cy; y < bottom; y++) {
        for (let x = cx; x < right; x++) {
          const offset = (y * width + x) * 4
          const alpha = raster[offset + 3]! / 255
          opacity += alpha
          brightness += (0.2126 * raster[offset]! + 0.7152 * raster[offset + 1]! + 0.0722 * raster[offset + 2]!) / 255 * alpha
        }
      }
      const area = (right - cx) * (bottom - cy)
      const darkness = opacity === 0 ? 0 : 1 - brightness / opacity
      const midpointX = (cx + right) / 2
      const midpointY = (cy + bottom) / 2
      const corridorDistance = quietCenter === 0 ? 1 : Math.abs(midpointX / width - 0.5) / (quietCenter / 2)
      const corridor = quietCenter === 0 ? 0 : 1 - smoothstep((corridorDistance - 0.6) / 0.4)
      const ends = endFade === 0 ? 1 : smoothstep(Math.min(midpointY, height - midpointY) / endFade)
      const alpha = Math.round(255 * alphaMax * (opacity / area) * clamp(darkness * input.inkContrast) ** gamma * (1 - 0.9 * corridor) * ends)
      for (let y = cy; y < bottom; y++) {
        for (let x = cx; x < right; x++) {
          const offset = (y * width + x) * 4
          pixels[offset] = ink[0]
          pixels[offset + 1] = ink[1]
          pixels[offset + 2] = ink[2]
          pixels[offset + 3] = alpha
          mask[offset] = 255
          mask[offset + 1] = 255
          mask[offset + 2] = 255
          mask[offset + 3] = alpha
          alphaTotal += alpha / 255
          if (x + 0.5 >= width / 3 && x + 0.5 < width * 2 / 3) {
            centerTotal += alpha / 255
            centerCount++
          }
        }
      }
    }
  }
  return { pixels, mask, alphaCoverage: alphaTotal / (width * height), centerCoverage: centerCount === 0 ? 0 : centerTotal / centerCount }
}

function png(bytes: Uint8Array, width: number, height: number): Promise<Buffer> {
  return sharp(bytes, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

export async function processSlopcameraPixelLandscape(input: SlopcameraPixelLandscapeInput): Promise<SlopcameraPixelLandscapeResult> {
  const parsed = parseInput(input)
  const { width, panelHeight, height, overlap } = parsed
  const raster = new Uint8Array(width * height * 4)
  let seamTotal = 0
  for (let index = 0; index < parsed.panels.length; index++) {
    const panel = await decode(parsed.panels[index]!, width, panelHeight, index)
    const start = index * (panelHeight - overlap)
    if (index === 0 || overlap === 0) {
      raster.set(panel, start * width * 4)
      continue
    }
    const top = raster.subarray(start * width * 4, (start + overlap) * width * 4)
    const bottom = panel.subarray(0, overlap * width * 4)
    const seam = findSeam(top, bottom, width, overlap)
    seamTotal += seam.error
    const feather = Math.max(1, Math.min(overlap / 4, overlap * 0.08))
    for (let y = 0; y < overlap; y++) {
      for (let x = 0; x < width; x++) {
        const localOffset = (y * width + x) * 4
        const amount = overlap > 1 && y === 0 ? 0 : overlap > 1 && y === overlap - 1 ? 1 : smoothstep((y - seam.rows[x]! + feather) / (2 * feather))
        // top aliases output; each pixel is read completely before being written.
        blendPixel(raster, ((start + y) * width + x) * 4, top, localOffset, bottom, localOffset, amount)
      }
    }
    raster.set(panel.subarray(overlap * width * 4), (start + overlap) * width * 4)
  }
  const pixelized = pixelize(raster, parsed)
  const warnings = ["Panels are resized with Lanczos3 interpolation; upscaling does not generate new detail.", "Palette checks cover opaque ink and every 8-bit alpha composite against accents; changing CSS colors requires rechecking the palette.", ...parsed.paletteWarnings]
  if (parsed.upscale > 1) warnings.push(`Requested ${parsed.upscale}x interpolation scale.`)
  if (parsed.panels.length > 1 && overlap === 0) warnings.push("Panels have no overlap; join continuity cannot be assessed.")
  const seamError = overlap === 0 || parsed.panels.length === 1 ? 0 : seamTotal / (parsed.panels.length - 1)
  if (seamError > 0.12) warnings.push("Overlap seams have high source mismatch; regenerate related panels before accepting this image.")
  const [rasterPng, pixelsPng, maskPng, preview] = await Promise.all([
    png(raster, width, height),
    png(pixelized.pixels, width, height),
    png(pixelized.mask, width, height),
    sharp(pixelized.pixels, { raw: { width, height, channels: 4 } }).flatten({ background: { r: parsed.background[0], g: parsed.background[1], b: parsed.background[2] } }).png().toBuffer(),
  ])
  return { raster: rasterPng, pixels: pixelsPng, mask: maskPng, preview, width, height, ink: parsed.inkHex, metrics: { seamError, alphaCoverage: pixelized.alphaCoverage, centerCoverage: pixelized.centerCoverage, paletteDistance: parsed.paletteDistance }, warnings }
}

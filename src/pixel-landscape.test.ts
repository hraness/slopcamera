import { describe, expect, test } from "bun:test"
import sharp from "sharp"
import { chooseSlopcameraLandscapeInk, processSlopcameraPixelLandscape } from "./pixel-landscape.ts"

const palette = { background: "#f2eee6", primary: "#cb2569", secondary: "#0063ae" }

async function solid(color: { r: number; g: number; b: number; alpha?: number }, width = 32, height = 32): Promise<Uint8Array> {
  return sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer()
}

async function raw(bytes: Uint8Array): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { bytes: data, width: info.width, height: info.height }
}

describe("landscape palette", () => {
  test("chooses deterministic opaque darker same-hue ink", () => {
    const ink = chooseSlopcameraLandscapeInk(palette)
    expect(ink).toMatch(/^#[a-f0-9]{6}$/)
    expect(chooseSlopcameraLandscapeInk(palette)).toBe(ink)
    expect(chooseSlopcameraLandscapeInk({ ...palette, ink })).toBe(ink)
  })

  test("accepts short hex and rejects ambiguous colors and impossible dark backgrounds", () => {
    expect(chooseSlopcameraLandscapeInk({ background: "#eee", primary: "#e16", secondary: "#06b" })).toMatch(/^#[a-f0-9]{6}$/)
    for (const background of ["red", "#ffeecc80", "rgb(0,0,0)", "var(--background)", " #eee", "#12", "#GGGGGG"]) {
      expect(() => chooseSlopcameraLandscapeInk({ ...palette, background })).toThrow(/opaque/)
    }
    expect(() => chooseSlopcameraLandscapeInk({ ...palette, background: "#000000" })).toThrow(/No darker/)
    expect(() => chooseSlopcameraLandscapeInk({ ...palette, primary: palette.background })).toThrow(/No darker/)
  })

  test("rejects accent collisions along the composited ramp even when full ink differs", () => {
    const ink = chooseSlopcameraLandscapeInk(palette)
    const mix = (hex: string): number[] => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
    const backgroundChannels = mix(palette.background)
    const inkChannels = mix(ink)
    const primary = `#${backgroundChannels.map((value, channel) => Math.round(value * (1 - 128 / 255) + inkChannels[channel]! * 128 / 255).toString(16).padStart(2, "0")).join("")}`
    expect(() => chooseSlopcameraLandscapeInk({ ...palette, ink, primary })).toThrow(/composites collide/)
    expect(() => chooseSlopcameraLandscapeInk({ ...palette, ink: "#2200ff" })).toThrow(/preserve/)
    expect(() => chooseSlopcameraLandscapeInk({ ...palette, ink: "#ffffff" })).toThrow(/darker/)
  })
})

describe("landscape processing", () => {
  test("stitched height, all artifacts, and seamless identical overlap are measured", async () => {
    const panel = await solid({ r: 40, g: 40, b: 40 })
    const result = await processSlopcameraPixelLandscape({ ...palette, panels: [panel, panel, panel], width: 32, panelHeight: 32, overlap: 8, pixelSize: 4 })
    expect([result.width, result.height]).toEqual([32, 80])
    for (const artifact of [result.raster, result.pixels, result.mask, result.preview]) {
      const metadata = await sharp(artifact).metadata()
      expect([metadata.width, metadata.height, metadata.format]).toEqual([32, 80, "png"])
    }
    expect(result.metrics.seamError).toBe(0)
    expect(result.metrics.paletteDistance).toBeGreaterThanOrEqual(0.055)
    expect(result.metrics.centerCoverage).toBeLessThan(result.metrics.alphaCoverage)
    expect(result.warnings.join(" ")).toContain("does not generate new detail")
  })

  test("black can be fully opaque and white fully transparent", async () => {
    const black = await solid({ r: 0, g: 0, b: 0 })
    const white = await solid({ r: 255, g: 255, b: 255 })
    const options = { ...palette, width: 32, panelHeight: 32, overlap: 0, pixelSize: 4, alphaMax: 1, quietCenter: 0 }
    const dark = await processSlopcameraPixelLandscape({ ...options, panels: [black] })
    const bright = await processSlopcameraPixelLandscape({ ...options, panels: [white] })
    const darkRaw = (await raw(dark.pixels)).bytes
    const brightRaw = (await raw(bright.pixels)).bytes
    expect([...darkRaw.filter((_, index) => index % 4 === 3)]).toEqual(Array(32 * 32).fill(255))
    expect([...brightRaw.filter((_, index) => index % 4 === 3)]).toEqual(Array(32 * 32).fill(0))
    expect(dark.metrics.alphaCoverage).toBe(1)
    expect(bright.metrics.alphaCoverage).toBe(0)
  })

  test("respects source transparency and emits a neutral mask sharing exact alpha", async () => {
    const hidden = await solid({ r: 0, g: 0, b: 0, alpha: 0 })
    const half = await solid({ r: 0, g: 0, b: 0, alpha: 0.5 })
    const options = { ...palette, width: 32, panelHeight: 32, overlap: 0, pixelSize: 4, alphaMax: 1, quietCenter: 0 }
    const invisible = await processSlopcameraPixelLandscape({ ...options, panels: [hidden] })
    expect(invisible.metrics.alphaCoverage).toBe(0)
    const visible = await processSlopcameraPixelLandscape({ ...options, panels: [half] })
    const pixels = (await raw(visible.pixels)).bytes
    const mask = (await raw(visible.mask)).bytes
    for (let offset = 0; offset < pixels.length; offset += 4) {
      expect([...mask.slice(offset, offset + 3)]).toEqual([255, 255, 255])
      expect(mask[offset + 3]).toBe(pixels[offset + 3])
      expect(pixels[offset + 3]).toBeLessThanOrEqual(128)
    }
  })

  test("reports mismatched seams and truthful interpolation", async () => {
    const black = await solid({ r: 0, g: 0, b: 0 }, 16, 16)
    const white = await solid({ r: 255, g: 255, b: 255 }, 16, 16)
    const result = await processSlopcameraPixelLandscape({ ...palette, panels: [black, white], width: 16, panelHeight: 16, overlap: 4, pixelSize: 4, upscale: 2 })
    expect([result.width, result.height]).toEqual([32, 56])
    expect(result.metrics.seamError).toBeCloseTo(0.75, 8)
    expect(result.warnings.join(" ")).toContain("high source mismatch")
    expect(result.warnings.join(" ")).toContain("2x interpolation")
  })

  test("supports site neutral secondary surfaces while reporting actual ramp overlap", async () => {
    const panel = await solid({ r: 0, g: 0, b: 0 })
    for (const theme of [
      { background: "#eff1f5", primary: "#1750bf", secondary: "#dce0e8" },
      { background: "#1e1e2e", primary: "#92bafa", secondary: "#313244" },
    ]) {
      const result = await processSlopcameraPixelLandscape({ ...theme, panels: [panel], width: 32, panelHeight: 32, overlap: 0, pixelSize: 4 })
      expect(result.ink).toBe(chooseSlopcameraLandscapeInk(theme))
      if (theme.background === "#eff1f5") {
        expect(result.warnings.join(" ")).toContain("neutral secondary surface")
        expect(result.metrics.paletteDistance).toBeLessThan(0.055)
      } else expect(result.metrics.paletteDistance).toBeGreaterThanOrEqual(0.055)
    }
  })

  test("quietCenter specifies corridor width with 90 percent central attenuation", async () => {
    const panel = await solid({ r: 0, g: 0, b: 0 }, 100, 20)
    const result = await processSlopcameraPixelLandscape({ ...palette, panels: [panel], width: 100, panelHeight: 20, overlap: 0, pixelSize: 2, alphaMax: 1, quietCenter: 0.4 })
    const pixels = (await raw(result.pixels)).bytes
    const alphaAt = (x: number): number => pixels[(10 * 100 + x) * 4 + 3]!
    expect(alphaAt(50)).toBe(25)
    expect(alphaAt(36)).toBeLessThan(255)
    expect(alphaAt(20)).toBe(255)
    expect(alphaAt(80)).toBe(255)
  })

  test("validates all geometry, bytes, and palette before image decode", async () => {
    const base = { ...palette, panels: [new Uint8Array([1])], width: 32, panelHeight: 32, overlap: 8, pixelSize: 4 }
    await expect(processSlopcameraPixelLandscape({ ...base, width: 1.5 })).rejects.toThrow(/integer/)
    await expect(processSlopcameraPixelLandscape({ ...base, overlap: 32 })).rejects.toThrow(/overlap/)
    await expect(processSlopcameraPixelLandscape({ ...base, pixelSize: 0 })).rejects.toThrow(/pixelSize/)
    await expect(processSlopcameraPixelLandscape({ ...base, gamma: NaN })).rejects.toThrow(/gamma/)
    await expect(processSlopcameraPixelLandscape({ ...base, quietCenter: 2 })).rejects.toThrow(/quietCenter/)
    await expect(processSlopcameraPixelLandscape({ ...base, alphaMax: 1.1 })).rejects.toThrow(/alphaMax/)
    await expect(processSlopcameraPixelLandscape({ ...base, upscale: 0.5 })).rejects.toThrow(/upscale/)
    await expect(processSlopcameraPixelLandscape({ ...base, background: "red" })).rejects.toThrow(/opaque/)
    await expect(processSlopcameraPixelLandscape({ ...base, panels: [] })).rejects.toThrow(/1 to 8/)
    await expect(processSlopcameraPixelLandscape({ ...base, panels: Array(9).fill(new Uint8Array([1])) })).rejects.toThrow(/1 to 8/)
    await expect(processSlopcameraPixelLandscape({ ...base, panels: [new Uint8Array()] })).rejects.toThrow(/32 MiB/)
    await expect(processSlopcameraPixelLandscape({ ...base, width: 16_384, panelHeight: 16_384 })).rejects.toThrow(/64 million/)
    await expect(processSlopcameraPixelLandscape(base)).rejects.toThrow(/panel 1/)
  })

  test("rejects SVG rather than executing an alternate raster decoder", async () => {
    const panel = new TextEncoder().encode('<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" fill="black"/></svg>')
    await expect(processSlopcameraPixelLandscape({ ...palette, panels: [panel], width: 32, panelHeight: 32, overlap: 0, pixelSize: 4 })).rejects.toThrow(/supported/)
  })
})

test("ink contrast reaches full opacity without raising the source opacity ceiling", async () => {
  const palette = { background: "#eff1f5", primary: "#1750bf", secondary: "#dce0e8" }
  const options = { ...palette, width: 32, panelHeight: 32, overlap: 0, pixelSize: 4, alphaMax: 1, gamma: 1, quietCenter: 0, inkContrast: 4 }
  const opaque = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } } }).png().toBuffer()
  const partial = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 0.5 } } }).png().toBuffer()
  const full = await processSlopcameraPixelLandscape({ ...options, panels: [opaque] })
  const half = await processSlopcameraPixelLandscape({ ...options, panels: [partial] })
  const fullBytes = await sharp(full.pixels).ensureAlpha().raw().toBuffer()
  const halfBytes = await sharp(half.pixels).ensureAlpha().raw().toBuffer()
  const alphas = (data: Uint8Array) => [...data].filter((_value, index) => index % 4 === 3)
  expect(Math.max(...alphas(fullBytes))).toBe(255)
  expect(Math.max(...alphas(halfBytes))).toBeLessThanOrEqual(128)
})

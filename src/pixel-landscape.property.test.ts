import { expect, test } from "bun:test"
import fc from "fast-check"
import sharp from "sharp"
import { chooseSlopcameraLandscapeInk, processSlopcameraPixelLandscape } from "./pixel-landscape.ts"

const palette = { background: "#f2eee6", primary: "#cb2569", secondary: "#0063ae" }

async function sample(width: number, height: number, brightness: number, opacity: number): Promise<Uint8Array> {
  return sharp({ create: { width, height, channels: 4, background: { r: brightness, g: brightness, b: brightness, alpha: opacity / 255 } } }).png().toBuffer()
}

async function rgba(png: Uint8Array): Promise<Uint8Array> {
  return sharp(png).ensureAlpha().raw().toBuffer()
}

test("one global grid remains constant within each cell across joins and partial edges", async () => {
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 9, max: 24 }), fc.integer({ min: 9, max: 24 }), fc.integer({ min: 2, max: 7 }), fc.integer({ min: 0, max: 255 }),
    async (width, panelHeight, pixelSize, brightness) => {
      const overlap = 3
      const panels = [await sample(width, panelHeight, brightness, 255), await sample(width, panelHeight, 255 - brightness, 255)]
      const result = await processSlopcameraPixelLandscape({ ...palette, panels, width, panelHeight, overlap, pixelSize })
      const pixels = await rgba(result.pixels)
      const ink = [1, 3, 5].map((offset) => parseInt(result.ink.slice(offset, offset + 2), 16))
      for (let y = 0; y < result.height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4
          const anchor = (Math.floor(y / pixelSize) * pixelSize * width + Math.floor(x / pixelSize) * pixelSize) * 4
          expect([...pixels.slice(offset, offset + 3)]).toEqual(ink)
          expect(pixels[offset + 3]).toBe(pixels[anchor + 3])
        }
      }
    },
  ), { numRuns: 25 })
})

test("raising alphaMax never lowers pixel alpha; quietCenter never raises it", async () => {
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 0, max: 254 }), fc.integer({ min: 1, max: 255 }), fc.integer({ min: 0, max: 255 }),
    async (brightness, opacity, cap) => {
      const panel = await sample(12, 12, brightness, opacity)
      const base = { ...palette, panels: [panel], width: 12, panelHeight: 12, overlap: 0, pixelSize: 3, quietCenter: 0 }
      const low = await processSlopcameraPixelLandscape({ ...base, alphaMax: cap / 255 })
      const high = await processSlopcameraPixelLandscape({ ...base, alphaMax: 1 })
      const quiet = await processSlopcameraPixelLandscape({ ...base, alphaMax: 1, quietCenter: 1 })
      const [lowPixels, highPixels, quietPixels] = await Promise.all([rgba(low.pixels), rgba(high.pixels), rgba(quiet.pixels)])
      for (let offset = 3; offset < lowPixels.length; offset += 4) {
        expect(lowPixels[offset]!).toBeLessThanOrEqual(highPixels[offset]!)
        expect(lowPixels[offset]!).toBeLessThanOrEqual(cap)
        expect(quietPixels[offset]!).toBeLessThanOrEqual(highPixels[offset]!)
      }
    },
  ), { numRuns: 20 })
})

test("transparent source RGB cannot create alpha", async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: 0, max: 255 }), async (brightness) => {
    const panel = await sample(12, 12, brightness, 0)
    const result = await processSlopcameraPixelLandscape({ ...palette, panels: [panel], width: 12, panelHeight: 12, overlap: 0, pixelSize: 3, alphaMax: 1 })
    const pixels = await rgba(result.pixels)
    expect(result.metrics.alphaCoverage).toBe(0)
    for (let offset = 3; offset < pixels.length; offset += 4) expect(pixels[offset]).toBe(0)
  }), { numRuns: 20 })
})

test("a palette accent equal to background always fails before claiming collision freedom", () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffff }), (value) => {
    const background = `#${value.toString(16).padStart(6, "0")}`
    expect(() => chooseSlopcameraLandscapeInk({ ...palette, background, primary: background })).toThrow()
  }), { numRuns: 100 })
})

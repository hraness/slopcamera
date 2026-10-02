import { expect, test } from "bun:test"
import fc from "fast-check"
import { simulateSlopcameraOilPaint } from "./oil-paint.ts"

const seedArb = fc.integer({ min: 0, max: 4_294_967_295 })

test("deterministic oil paint is stable across bounded seeds", () => {
  fc.assert(fc.property(seedArb, (seed) => {
    const input = {
      version: 1,
      width: 16,
      height: 16,
      seed,
      tubes: [{ name: "ochre", color: "#a66a2d" }, { name: "white", color: "#f2ead8" }],
      piles: [{ name: "warm", knifePasses: 2, ingredients: [{ tube: "ochre", amount: 3 }, { tube: "white", amount: 1 }] }],
      layers: [{ waitSteps: 0, strokes: [{ pile: "warm", points: [[2, 8], [13, 8]], brush: { kind: "hog", bristles: 6, width: 3 } }] }],
    }
    const first = simulateSlopcameraOilPaint(input)
    const second = simulateSlopcameraOilPaint(input)
    expect(first.imageSha256).toBe(second.imageSha256)
    expect(first.strokeLogSha256).toBe(second.strokeLogSha256)
    expect(first.bytes).toBeGreaterThan(16 * 16 * 3)
  }), { numRuns: 20 })
})

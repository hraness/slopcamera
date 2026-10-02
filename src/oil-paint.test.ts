import { expect, test } from "bun:test"
import {
  inspectSlopcameraOilPaintKmMix,
  parseSlopcameraOilPaintInput,
  replaySlopcameraOilPaint,
  serializeSlopcameraOilPaintReplay,
  simulateSlopcameraOilPaint,
} from "./oil-paint.ts"

const source = {
  version: 1,
  width: 32,
  height: 24,
  seed: 17,
  ground: { color: "#e7dbc9", tooth: 0.6, relief: 0.7 },
  tubes: [
    { name: "titanium white", color: "#f5f0e5", opacity: 0.96, scattering: 1.1, drying: 0.7 },
    { name: "ultramarine", color: "#1e3f9a", opacity: 0.92, scattering: 0.8, drying: 0.65 },
    { name: "burnt sienna", color: "#8c4029", opacity: 0.9, scattering: 0.9, drying: 0.8 },
  ],
  piles: [
    { name: "sky violet", knifePasses: 4, ingredients: [{ tube: "ultramarine", amount: 2 }, { tube: "titanium white", amount: 1 }] },
    { name: "earth", knifePasses: 3, ingredients: [{ tube: "burnt sienna", amount: 1 }, { tube: "titanium white", amount: 0.3 }] },
  ],
  layers: [
    {
      name: "underpainting",
      waitSteps: 16,
      strokes: [
        { pile: "earth", points: [[4, 15], [27, 14]], pressure: [0.8, 0.6], brush: { kind: "hog", bristles: 10, width: 5 } },
      ],
    },
    {
      name: "sky",
      waitSteps: 0,
      strokes: [
        { pile: "sky violet", points: [[4, 8], [27, 8]], pressure: [0.7, 0.5], brush: { kind: "round", bristles: 8, width: 4 } },
      ],
    },
  ],
} as const

test("normalization keeps named tubes, knifed piles, and bounded replay data", () => {
  const parsed = parseSlopcameraOilPaintInput(source)
  expect(parsed.version).toBe(1)
  expect(parsed.piles[0]?.ingredients.map(part => part.tube)).toEqual(["ultramarine", "titanium white"])
  expect(parsed.layers).toHaveLength(2)
})

test("same source replays byte-for-byte and clock advances only as requested", () => {
  const first = simulateSlopcameraOilPaint(source)
  const second = simulateSlopcameraOilPaint(source)
  expect(first.imageSha256).toBe(second.imageSha256)
  expect([...first.image]).toEqual([...second.image])
  expect(first.strokeLogSha256).toBe(second.strokeLogSha256)
  expect(first.clockSteps).toBe(16)
  expect(first.image.slice(0, 2)).toEqual(new TextEncoder().encode("P6"))
  const replay = JSON.parse(serializeSlopcameraOilPaintReplay(first)) as unknown
  const replayed = replaySlopcameraOilPaint(replay)
  expect(replayed.imageSha256).toBe(first.imageSha256)
  expect(replayed.strokeLog).toEqual(first.strokeLog)
})

test("foreign direct paint, unknown fields, and unbounded dimensions are rejected", () => {
  expect(() => simulateSlopcameraOilPaint({ ...source, width: 4 })).toThrow("width")
  expect(() => simulateSlopcameraOilPaint({ ...source, extra: true })).toThrow("unsupported field")
  expect(() => simulateSlopcameraOilPaint({ ...source, layers: [{ ...source.layers[0], strokes: [{ ...source.layers[0].strokes[0], pile: "tube:ultramarine" }] }] })).toThrow("unknown pile")
})

test("pile mixing uses spectral K/S rather than an RGB midpoint", () => {
  const tubes = source.tubes
  const mixed = inspectSlopcameraOilPaintKmMix(tubes, [{ tube: "ultramarine", amount: 1 }, { tube: "burnt sienna", amount: 1 }])
  const blueOnly = inspectSlopcameraOilPaintKmMix(tubes, [{ tube: "ultramarine", amount: 1 }])
  const redOnly = inspectSlopcameraOilPaintKmMix(tubes, [{ tube: "burnt sienna", amount: 1 }])
  expect(mixed).toHaveLength(12)
  expect(mixed.some((value, index) => Math.abs(value - (blueOnly[index]! + redOnly[index]!) / 2) > 1e-6)).toBe(true)
})

import { expect, test } from "bun:test"
import fc from "fast-check"
import { beatGrid } from "@hraness/soundfish/midi"
import { compose } from "@hraness/soundfish/protocol"
import {
  projectSlopcameraSoundtrackGrid,
  slopcameraSoundtrackLimits,
  soundtrackBeatTimeUs,
  type SlopcameraSoundtrackBeatGrid,
  type SlopcameraSoundtrackGrid,
} from "./soundtrack.js"

/** Synthetic grids: constant tempo, whole-beat sections that tile the score. */
const gridArbitrary = fc
  .record({
    bpm: fc.integer({ min: 2_000, max: 40_000 }).map((centi) => centi / 100),
    beatsPerBar: fc.integer({ min: 1, max: 32 }),
    sectionBars: fc.array(fc.integer({ min: 1, max: 16 }), { minLength: 1, maxLength: 24 }),
  })
  .filter(({ bpm, beatsPerBar, sectionBars }) => {
    const beats = sectionBars.reduce((sum, bars) => sum + bars, 0) * beatsPerBar
    return (beats * 60_000_000) / bpm <= slopcameraSoundtrackLimits.maxTimeUs / 2
  })
  .map(({ bpm, beatsPerBar, sectionBars }): SlopcameraSoundtrackBeatGrid => {
    let bar = 0
    const sections = sectionBars.map((bars, index) => {
      const section = {
        index: index + 1,
        label: `S${String(index % 3)}`,
        repeat: 1,
        startBar: bar,
        endBar: bar + bars,
        startBeat: bar * beatsPerBar,
        endBeat: (bar + bars) * beatsPerBar,
      }
      bar += bars
      return section
    })
    return {
      title: "Synthetic",
      bpm,
      beatsPerBar,
      beatUnit: 4,
      swing: 0,
      secondsPerBeat: Math.round((60 / bpm) * 1e6) / 1e6,
      bars: bar,
      beats: bar * beatsPerBar,
      sections,
    }
  })

const startArbitrary = fc.integer({ min: 0, max: slopcameraSoundtrackLimits.maxTimeUs / 2 })

/** The HTML scene music clock's beat position for an absolute time. */
function beatPosition(timeUs: number, grid: SlopcameraSoundtrackGrid): number {
  return ((timeUs - grid.music.beatOffsetUs) * grid.music.bpm) / 60_000_000
}

function assertGridProperties(projected: SlopcameraSoundtrackGrid): void {
  const { music, sections } = projected
  const beatUs = 60_000_000 / music.bpm
  // Cue times are monotonic and tile the score from the beat offset to the end.
  expect(sections[0]!.startUs).toBe(music.beatOffsetUs)
  expect(sections.at(-1)!.endUs).toBe(projected.endUs)
  for (const [index, section] of sections.entries()) {
    expect(section.endUs).toBeGreaterThan(section.startUs)
    if (index > 0) expect(section.startUs).toBe(sections[index - 1]!.endUs)
    // Each cue lands inside one beat of its declared beat on the scene's music
    // clock: rounding to whole microseconds moves it by at most half of one.
    for (const [timeUs, beat] of [[section.startUs, section.startBeat], [section.endUs, section.endBeat]] as const) {
      const offsetUs = (beatPosition(timeUs, projected) - beat) * beatUs
      expect(Math.abs(offsetUs)).toBeLessThanOrEqual(0.5 + 1e-6)
      expect(Math.abs(offsetUs)).toBeLessThan(beatUs)
    }
    // Downbeats: every section boundary is a bar line.
    expect(section.startBeat % music.beatsPerBar).toBe(0)
  }
  expect(projected.endUs - projected.startUs).toBe(projected.durationUs)
}

test("grid projection: monotonic cues, each within one beat of the music clock", () => {
  fc.assert(
    fc.property(gridArbitrary, startArbitrary, (grid, startUs) => {
      const projected = projectSlopcameraSoundtrackGrid(grid, "digest", startUs)
      expect(projected.music).toEqual({ bpm: grid.bpm, beatOffsetUs: startUs, beatsPerBar: grid.beatsPerBar })
      assertGridProperties(projected)
    }),
    { numRuns: 300 },
  )
})

test("grid projection is stable for the same document", () => {
  fc.assert(
    fc.property(gridArbitrary, startArbitrary, (grid, startUs) => {
      const first = projectSlopcameraSoundtrackGrid(grid, "digest", startUs)
      const second = projectSlopcameraSoundtrackGrid(structuredClone(grid), "digest", startUs)
      expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    }),
    { numRuns: 100 },
  )
})

test("beat time is monotonic and exact at whole-minute beats", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 20, max: 400 }),
      fc.integer({ min: 0, max: 100_000 }),
      fc.integer({ min: 1, max: 1_000 }),
      (bpm, beat, step) => {
        expect(soundtrackBeatTimeUs(beat + step, bpm)).toBeGreaterThan(soundtrackBeatTimeUs(beat, bpm))
        expect(soundtrackBeatTimeUs(bpm * step, bpm)).toBe(60_000_000 * step)
      },
    ),
    { numRuns: 200 },
  )
})

test("real Soundfish loops: the library's grid projects with the same properties", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 40, max: 240 }),
      fc.integer({ min: 1, max: 8 }),
      startArbitrary,
      async (bpm, bars, startUs) => {
        const row = Array.from({ length: bars }, () => "x...x...x...x...").join(" | ")
        const composed = await compose(`title Property\nbpm ${String(bpm)}\nbars ${String(bars)}\n\ndrums\nkick: ${row}\n`)
        if (!composed.ok) throw new Error(composed.error.message)
        const grid = await beatGrid(composed.document)
        if (!grid.ok) throw new Error(grid.error.message)
        const projected = projectSlopcameraSoundtrackGrid(grid, composed.digest, startUs)
        expect(projected.music.bpm).toBe(bpm)
        expect(projected.bars).toBe(bars)
        expect(projected.durationUs).toBe(soundtrackBeatTimeUs(bars * 4, bpm))
        assertGridProperties(projected)
        // The same text always yields the same digest and grid.
        const again = await compose(`title Property\nbpm ${String(bpm)}\nbars ${String(bars)}\n\ndrums\nkick: ${row}\n`)
        if (!again.ok) throw new Error(again.error.message)
        expect(again.digest).toBe(composed.digest)
      },
    ),
    { numRuns: 40 },
  )
})

test("grid projection rejects sections that do not tile the score", () => {
  const grid: SlopcameraSoundtrackBeatGrid = {
    title: "Gap",
    bpm: 120,
    beatsPerBar: 4,
    beatUnit: 4,
    swing: 0,
    secondsPerBeat: 0.5,
    bars: 2,
    beats: 8,
    sections: [
      { index: 1, label: "A", repeat: 1, startBar: 0, endBar: 1, startBeat: 0, endBeat: 4 },
      { index: 2, label: "B", repeat: 1, startBar: 1, endBar: 2, startBeat: 5, endBeat: 8 },
    ],
  }
  expect(() => projectSlopcameraSoundtrackGrid(grid, "d")).toThrow(/tile/u)
  expect(() => projectSlopcameraSoundtrackGrid({ ...grid, bpm: 500, secondsPerBeat: 0.12 }, "d")).toThrow(/Tempo/u)
  expect(() => projectSlopcameraSoundtrackGrid({ ...grid, secondsPerBeat: 0.6 }, "d")).toThrow(/beat length/u)
})

import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exportMidi } from "@hraness/soundfish/midi"
import { executeSlopcameraOperation } from "./operations.js"
import {
  composeSlopcameraSoundtrack,
  deriveSlopcameraSoundtrackGrid,
  detectSlopcameraSoundtrackFormat,
  slopcameraSoundtrackEngine,
  slopcameraSoundtrackLimits,
} from "./soundtrack.js"

const root = new URL("../", import.meta.url)

export const loopText = `title Kit check
bpm 100
bars 2
kit 8

drums
vol 9000
kick:  x.....x...x..... | x.....x...x.....
snare: ....x.......x... | ....x.......x...
`

export const songText = `title Two part
bpm 120
bars 2

section Verse x2
drums
kick:  x.......x....... | x.......x.......

section Hook
drums
kick:  x...x...x...x... | x...x...x...x...
snare: ....x.......x... | ....x.......x...
`

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "slopcamera-soundtrack-"))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

describe("soundtrack engine admission", () => {
  test("pins the exact admitted library version everywhere it is recorded", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as {
      readonly dependencies: Readonly<Record<string, string>>
    }
    const installed = JSON.parse(
      await readFile(new URL("node_modules/@hraness/soundfish/package.json", root), "utf8"),
    ) as { readonly version: string; readonly license: string }
    expect(manifest.dependencies[slopcameraSoundtrackEngine.package]).toBe(slopcameraSoundtrackEngine.version)
    expect(installed.version).toBe(slopcameraSoundtrackEngine.version)
    expect(installed.license).toBe("MIT")
  })
})

describe("slopcamera.soundtrack.compose", () => {
  test("verifies a loop, writes its document, and round-trips through JSON", async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, "loop.compose"), loopText)
      const first = await composeSlopcameraSoundtrack({
        sourcePath: join(directory, "loop.compose"),
        outputPath: join(directory, "loop.json"),
      })
      expect(first).toMatchObject({
        operation: "slopcamera.soundtrack.compose",
        source: { format: "compose" },
        kind: "loop",
        title: "Kit check",
        bpm: 100,
        beatsPerBar: 4,
        bars: 2,
        durationUs: 4_800_000,
        tracks: 1,
        sections: null,
      })
      const again = await composeSlopcameraSoundtrack({ sourcePath: join(directory, "loop.json") })
      expect(again.source.format).toBe("json")
      expect(again.digest).toBe(first.digest)
      expect(again.contentId).toBe(first.contentId)
      expect(again.output).toBeNull()
    })
  })

  test("verifies a song from song text", async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, "two.song"), songText)
      const receipt = await composeSlopcameraSoundtrack({ sourcePath: join(directory, "two.song") })
      expect(receipt).toMatchObject({
        kind: "song",
        source: { format: "song" },
        bpm: 120,
        bars: 6,
        durationUs: 12_000_000,
        sections: 2,
        tracks: null,
      })
    })
  })

  test("imports a Standard MIDI file", async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, "loop.compose"), loopText)
      await composeSlopcameraSoundtrack({
        sourcePath: join(directory, "loop.compose"),
        outputPath: join(directory, "loop.json"),
      })
      const midi = await exportMidi(JSON.parse(await readFile(join(directory, "loop.json"), "utf8")))
      if (!midi.ok) throw new Error(midi.error.message)
      await writeFile(join(directory, "loop.mid"), midi.bytes)
      expect(detectSlopcameraSoundtrackFormat(midi.bytes)).toBe("midi")
      const receipt = await composeSlopcameraSoundtrack({ sourcePath: join(directory, "loop.mid") })
      expect(receipt).toMatchObject({ source: { format: "midi" }, bpm: 100, bars: 2 })
    })
  })

  test("fails closed on bad sources and paths", async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, "loop.compose"), loopText)
      await writeFile(join(directory, "bad.compose"), "title Bad\nbpm 100\ndrums\nkick: zzzz\n")
      await writeFile(join(directory, "bad.json"), "{nope")
      await writeFile(join(directory, "binary.compose"), new Uint8Array([0xff, 0xfe, 0x00]))
      await writeFile(join(directory, "fake.mid"), "MThdnot really")
      await writeFile(join(directory, "huge.compose"), "#".repeat(slopcameraSoundtrackLimits.sourceBytes + 1))
      const cases: readonly [() => Promise<unknown>, string][] = [
        [() => composeSlopcameraSoundtrack({ sourcePath: join(directory, "bad.compose") }), "INVALID_SOUNDTRACK_SOURCE"],
        [() => composeSlopcameraSoundtrack({ sourcePath: join(directory, "bad.json") }), "INVALID_SOUNDTRACK_SOURCE"],
        [() => composeSlopcameraSoundtrack({ sourcePath: join(directory, "binary.compose") }), "SOURCE_UNREADABLE"],
        [() => composeSlopcameraSoundtrack({ sourcePath: join(directory, "fake.mid") }), "INVALID_SOUNDTRACK_SOURCE"],
        [() => composeSlopcameraSoundtrack({ sourcePath: join(directory, "huge.compose") }), "SOURCE_TOO_LARGE"],
        [() => composeSlopcameraSoundtrack({ sourcePath: join(directory, "missing.compose") }), "SOURCE_NOT_FOUND"],
        [() => composeSlopcameraSoundtrack({ sourcePath: join(directory, "loop.compose"), format: "midi" }), "INVALID_SOUNDTRACK_SOURCE"],
        [() => composeSlopcameraSoundtrack({ sourcePath: join(directory, "loop.compose"), outputPath: join(directory, "loop.txt") }), "INVALID_SOUNDTRACK_INPUT"],
        [() => deriveSlopcameraSoundtrackGrid({ sourcePath: join(directory, "loop.compose"), outputPath: join(directory, "loop.compose.json"), startUs: -1 }), "INVALID_SOUNDTRACK_INPUT"],
        [() => deriveSlopcameraSoundtrackGrid({ sourcePath: join(directory, "loop.compose"), startUs: slopcameraSoundtrackLimits.maxTimeUs }), "SOUNDTRACK_OUT_OF_RANGE"],
      ]
      for (const [run, code] of cases) {
        await expect(run()).rejects.toMatchObject({ code })
      }
    })
  })
})

describe("slopcamera.soundtrack.grid", () => {
  test("projects a song's sections onto the timeline in the music timing shape", async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, "two.song"), songText)
      const receipt = await deriveSlopcameraSoundtrackGrid({
        sourcePath: join(directory, "two.song"),
        outputPath: join(directory, "grid.json"),
        startUs: 250_000,
      })
      expect(receipt.music).toEqual({ bpm: 120, beatOffsetUs: 250_000, beatsPerBar: 4 })
      expect(receipt.sections.map(({ label, repeat, startUs, endUs }) => ({ label, repeat, startUs, endUs }))).toEqual([
        { label: "Verse", repeat: 1, startUs: 250_000, endUs: 4_250_000 },
        { label: "Verse", repeat: 2, startUs: 4_250_000, endUs: 8_250_000 },
        { label: "Hook", repeat: 1, startUs: 8_250_000, endUs: 12_250_000 },
      ])
      expect(receipt.endUs).toBe(12_250_000)
      const written = JSON.parse(await readFile(join(directory, "grid.json"), "utf8")) as Record<string, unknown>
      expect(written).toMatchObject({
        kind: "slopcamera.soundtrack-grid",
        schemaVersion: 1,
        digest: receipt.digest,
        music: receipt.music,
      })
      expect(Object.keys(written.music as object).sort()).toEqual(["beatOffsetUs", "beatsPerBar", "bpm"])
    })
  })

  test("is stable for the same document across source formats", async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, "loop.compose"), loopText)
      const fromText = await deriveSlopcameraSoundtrackGrid({
        sourcePath: join(directory, "loop.compose"),
        outputPath: join(directory, "grid-a.json"),
      })
      await composeSlopcameraSoundtrack({
        sourcePath: join(directory, "loop.compose"),
        outputPath: join(directory, "loop.json"),
      })
      const fromJson = await deriveSlopcameraSoundtrackGrid({
        sourcePath: join(directory, "loop.json"),
        outputPath: join(directory, "grid-b.json"),
      })
      expect(await readFile(join(directory, "grid-b.json"), "utf8"))
        .toBe(await readFile(join(directory, "grid-a.json"), "utf8"))
      expect(fromJson.sections).toEqual(fromText.sections)
    })
  })

  test("runs through the operation registry with parsed input", async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, "loop.compose"), loopText)
      const receipt = await executeSlopcameraOperation("slopcamera.soundtrack.grid", {
        sourcePath: join(directory, "loop.compose"),
        startUs: 1_000,
      })
      expect(receipt.music.beatOffsetUs).toBe(1_000)
      await expect(executeSlopcameraOperation("slopcamera.soundtrack.grid", {
        sourcePath: join(directory, "loop.compose"),
        startUs: 1.5,
      })).rejects.toMatchObject({ code: "INVALID_OPERATION_INPUT" })
      await expect(executeSlopcameraOperation("slopcamera.soundtrack.compose", {
        sourcePath: join(directory, "loop.compose"),
        format: "wav",
      })).rejects.toMatchObject({ code: "INVALID_OPERATION_INPUT" })
    })
  })
})

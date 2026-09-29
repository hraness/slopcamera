import { beatGrid, importMidi } from "@hraness/soundfish/midi"
import { compose, verify } from "@hraness/soundfish/protocol"
import { applyTemplate } from "@hraness/soundfish/templates"
import {
  BoundedFileError,
  decodeUtf8Source,
  hasPathCollision,
  publishReplaceableFile,
  readBoundedFile,
  sha256Hex,
} from "./bounded-file.js"

/**
 * Soundtrack scores and beat grids behind the `slopcamera.soundtrack.compose`
 * and `slopcamera.soundtrack.grid` operations.
 *
 * Parsing, verification, MIDI import and beat-grid derivation come from the
 * exact-version `@hraness/soundfish` library, called in process. Nothing is
 * spawned, fetched, rendered to audio or evaluated. Slopcamera owns the
 * operation codes, bounds, file publication and receipts, and projects the
 * grid into the `{ bpm, beatOffsetUs, beatsPerBar }` music timing that HTML
 * scene requests already accept.
 */

/** The exact admitted library release. A test pins this to the lockfile. */
export const slopcameraSoundtrackEngine = Object.freeze({
  package: "@hraness/soundfish",
  version: "0.7.0",
} as const)

export const slopcameraSoundtrackLimits = Object.freeze({
  sourceBytes: 1024 * 1024,
  outputBytes: 4 * 1024 * 1024,
  sections: 512,
  warnings: 64,
  /** Matches the HTML scene music clock's time and tempo bounds. */
  maxTimeUs: 3_600_000_000,
  minBpm: 20,
  maxBpm: 400,
  minBeatsPerBar: 1,
  maxBeatsPerBar: 32,
})

export const slopcameraSoundtrackFormats = Object.freeze(
  ["compose", "song", "json", "midi"] as const,
)
export type SlopcameraSoundtrackFormat = (typeof slopcameraSoundtrackFormats)[number]

export class SlopcameraSoundtrackError extends Error {
  readonly code: "INVALID_SOUNDTRACK_SOURCE" | "INVALID_SOUNDTRACK_INPUT" | "SOUNDTRACK_OUT_OF_RANGE"

  constructor(code: SlopcameraSoundtrackError["code"], message: string) {
    super(message)
    this.name = "SlopcameraSoundtrackError"
    this.code = code
  }
}

export interface SlopcameraSoundtrackFileRecord {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

export interface SlopcameraSoundtrackSourceRecord extends SlopcameraSoundtrackFileRecord {
  readonly format: SlopcameraSoundtrackFormat
}

export interface SlopcameraSoundtrackWarning {
  readonly code: string
  readonly message: string
}

/** Exactly the explicit music timing HTML scene requests accept. */
export interface SlopcameraSoundtrackMusicTiming {
  readonly bpm: number
  readonly beatOffsetUs: number
  readonly beatsPerBar: number
}

export interface SlopcameraSoundtrackCue {
  /** 1-based play order; a repeated section appears once per repeat. */
  readonly index: number
  readonly label: string
  /** 1-based repeat of that section. */
  readonly repeat: number
  readonly startBar: number
  readonly endBar: number
  readonly startBeat: number
  readonly endBeat: number
  readonly startUs: number
  readonly endUs: number
}

export interface SlopcameraSoundtrackComposeInput {
  readonly sourcePath: string
  readonly outputPath?: string
  readonly format?: SlopcameraSoundtrackFormat
}

export interface SlopcameraSoundtrackComposeReceipt {
  readonly receiptVersion: 1
  readonly operation: "slopcamera.soundtrack.compose"
  readonly engine: typeof slopcameraSoundtrackEngine
  readonly source: SlopcameraSoundtrackSourceRecord
  readonly kind: "loop" | "song"
  readonly title: string
  /** The library's canonical document digest. */
  readonly digest: string
  /** The loop's music CID or the song's arrangement CID. */
  readonly contentId: string
  readonly bpm: number
  readonly beatsPerBar: number
  readonly bars: number
  readonly durationUs: number
  /** Loop tracks, or null for a song. */
  readonly tracks: number | null
  /** Song sections and distinct loops, or null for a loop. */
  readonly sections: number | null
  readonly loops: number | null
  readonly warnings: readonly SlopcameraSoundtrackWarning[]
  /** The canonical score document, written only when an output path was supplied. */
  readonly output: SlopcameraSoundtrackFileRecord | null
}

export interface SlopcameraSoundtrackGridInput {
  readonly sourcePath: string
  readonly outputPath?: string
  readonly format?: SlopcameraSoundtrackFormat
  /** Where the soundtrack's first beat lands on the video timeline. */
  readonly startUs?: number
}

export interface SlopcameraSoundtrackGrid {
  readonly schemaVersion: 1
  readonly kind: "slopcamera.soundtrack-grid"
  readonly digest: string
  readonly title: string
  readonly music: SlopcameraSoundtrackMusicTiming
  readonly beatUnit: number
  /** 0–100. Swing delays off-beat sixteenths only; beats and bars stay on the grid. */
  readonly swing: number
  readonly bars: number
  readonly beats: number
  readonly startUs: number
  readonly durationUs: number
  readonly endUs: number
  readonly sections: readonly SlopcameraSoundtrackCue[]
}

export interface SlopcameraSoundtrackGridReceipt extends Omit<SlopcameraSoundtrackGrid, "kind" | "schemaVersion"> {
  readonly receiptVersion: 1
  readonly operation: "slopcamera.soundtrack.grid"
  readonly engine: typeof slopcameraSoundtrackEngine
  readonly source: SlopcameraSoundtrackSourceRecord
  readonly scoreKind: "loop" | "song"
  readonly warnings: readonly SlopcameraSoundtrackWarning[]
  /** The grid document, written only when an output path was supplied. */
  readonly output: SlopcameraSoundtrackFileRecord | null
}

/** The beat-grid fields the projection reads; structurally the library's grid. */
export interface SlopcameraSoundtrackBeatGrid {
  readonly title: string
  readonly bpm: number
  readonly beatsPerBar: number
  readonly beatUnit: number
  readonly swing: number
  readonly secondsPerBeat: number
  readonly bars: number
  readonly beats: number
  readonly sections: readonly {
    readonly index: number
    readonly label: string
    readonly repeat: number
    readonly startBar: number
    readonly endBar: number
    readonly startBeat: number
    readonly endBeat: number
  }[]
}

type BeatGrid = SlopcameraSoundtrackBeatGrid

interface LoadedScore {
  readonly format: SlopcameraSoundtrackFormat
  readonly document: Record<string, unknown>
  readonly warnings: readonly SlopcameraSoundtrackWarning[]
}

type LibraryFailure = { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

function invalidSource(message: string): never {
  throw new SlopcameraSoundtrackError("INVALID_SOUNDTRACK_SOURCE", message)
}

function invalidInput(message: string): never {
  throw new SlopcameraSoundtrackError("INVALID_SOUNDTRACK_INPUT", message)
}

function printable(value: string, limit = 240): string {
  const text = [...value]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f
    })
    .join("")
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
}

function libraryFailure(result: LibraryFailure, action: string): never {
  return invalidSource(`${action}: ${printable(result.error.code, 64)}: ${printable(result.error.message)}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Standard MIDI files open with the `MThd` header chunk. */
function isMidi(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64
}

export function detectSlopcameraSoundtrackFormat(bytes: Uint8Array): SlopcameraSoundtrackFormat {
  if (isMidi(bytes)) return "midi"
  const text = decodeUtf8Source(bytes, "Soundtrack source")
  if (text.trimStart().startsWith("{")) return "json"
  return /^[ \t]*section[ \t]/mu.test(text) ? "song" : "compose"
}

async function guarded<T>(work: () => Promise<T>, action: string): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof SlopcameraSoundtrackError || error instanceof BoundedFileError) throw error
    return invalidSource(`${action}: ${printable(error instanceof Error ? error.message : String(error))}`)
  }
}

async function loadScore(
  bytes: Uint8Array,
  requested: SlopcameraSoundtrackFormat | undefined,
): Promise<LoadedScore> {
  const format = requested ?? detectSlopcameraSoundtrackFormat(bytes)
  if (format === "midi") {
    if (!isMidi(bytes)) invalidSource("A MIDI source must be a Standard MIDI file.")
    const result = await guarded(async () => await importMidi(bytes.slice()), "MIDI import failed")
    if (!result.ok) libraryFailure(result, "MIDI import failed")
    return {
      format,
      document: result.document,
      warnings: result.warnings.map((warning) => ({
        code: printable(warning.code, 64),
        message: printable(warning.message),
      })),
    }
  }
  const text = decodeUtf8Source(bytes, "Soundtrack source")
  if (format === "json") {
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      invalidSource("Soundtrack JSON is not valid JSON.")
    }
    if (!isRecord(value)) invalidSource("Soundtrack JSON must be an object.")
    return { format, document: value, warnings: [] }
  }
  if (format === "song") {
    // A song source is template text supplied as the only template, so the
    // bundled template set is never read.
    const result = await guarded(
      async () => await applyTemplate("songs/source", { sources: [{ kind: "songs", name: "source", text }] }),
      "Song compose failed",
    )
    if (!result.ok) libraryFailure(result, "Song compose failed")
    if (!("document" in result)) invalidSource("Song compose returned no document.")
    return {
      format,
      document: result.document,
      warnings: result.warnings.map((message) => ({ code: "song", message: printable(message) })),
    }
  }
  const result = await guarded(async () => await compose(text), "Compose failed")
  if (!result.ok) libraryFailure(result, "Compose failed")
  return { format, document: result.document, warnings: [] }
}

async function readScore(
  path: string,
  format: SlopcameraSoundtrackFormat | undefined,
): Promise<{ readonly score: LoadedScore; readonly source: SlopcameraSoundtrackSourceRecord }> {
  if (format !== undefined && !slopcameraSoundtrackFormats.includes(format)) {
    invalidInput(`format must be one of ${slopcameraSoundtrackFormats.join(", ")}.`)
  }
  const bytes = await readBoundedFile(path, slopcameraSoundtrackLimits.sourceBytes, "Soundtrack source")
  const score = await loadScore(bytes, format)
  return {
    score,
    source: { path, sha256: sha256Hex(bytes), bytes: bytes.byteLength, format: score.format },
  }
}

async function gridOf(document: Record<string, unknown>): Promise<BeatGrid> {
  const grid = await guarded(async () => await beatGrid(document), "Beat grid failed")
  if (!grid.ok) libraryFailure(grid, "Beat grid failed")
  return grid
}

function outOfRange(message: string): never {
  throw new SlopcameraSoundtrackError("SOUNDTRACK_OUT_OF_RANGE", message)
}

/** Microseconds from beat zero to `beat` at a constant tempo. */
export function soundtrackBeatTimeUs(beat: number, bpm: number): number {
  return Math.round((beat * 60_000_000) / bpm)
}

function checkedTiming(grid: BeatGrid): { readonly bpm: number; readonly beatsPerBar: number } {
  const limits = slopcameraSoundtrackLimits
  if (!Number.isFinite(grid.bpm) || grid.bpm < limits.minBpm || grid.bpm > limits.maxBpm) {
    outOfRange(`Tempo ${String(grid.bpm)} BPM is outside ${String(limits.minBpm)}–${String(limits.maxBpm)} BPM.`)
  }
  if (
    !Number.isSafeInteger(grid.beatsPerBar)
    || grid.beatsPerBar < limits.minBeatsPerBar
    || grid.beatsPerBar > limits.maxBeatsPerBar
  ) {
    outOfRange(`Meter of ${String(grid.beatsPerBar)} beats per bar is outside ${String(limits.minBeatsPerBar)}–${String(limits.maxBeatsPerBar)}.`)
  }
  // The library rounds seconds per beat to microseconds; a larger gap means
  // its beat is not the tempo's beat and the projection would drift.
  if (!Number.isFinite(grid.secondsPerBeat) || Math.abs(grid.secondsPerBeat - 60 / grid.bpm) > 1e-6) {
    outOfRange("The beat grid's beat length disagrees with its tempo.")
  }
  return { bpm: grid.bpm, beatsPerBar: grid.beatsPerBar }
}

function durationUsOf(grid: BeatGrid, bpm: number): number {
  if (!Number.isSafeInteger(grid.beats) || grid.beats < 1) outOfRange("The score has no beats.")
  const durationUs = soundtrackBeatTimeUs(grid.beats, bpm)
  if (durationUs > slopcameraSoundtrackLimits.maxTimeUs) {
    outOfRange("The score is longer than the one-hour timeline bound.")
  }
  return durationUs
}

async function publishJson(path: string, value: unknown): Promise<SlopcameraSoundtrackFileRecord> {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8")
  if (bytes.byteLength > slopcameraSoundtrackLimits.outputBytes) {
    outOfRange("Soundtrack output exceeds the output byte limit.")
  }
  await publishReplaceableFile(path, bytes)
  return { path, sha256: sha256Hex(bytes), bytes: bytes.byteLength }
}

async function checkOutputPath(sourcePath: string, outputPath: string | undefined): Promise<void> {
  if (outputPath === undefined) return
  if (!outputPath.toLowerCase().endsWith(".json")) invalidInput("outputPath must end in .json.")
  if (await hasPathCollision([sourcePath, outputPath])) invalidInput("outputPath must differ from sourcePath.")
}

/**
 * Parse and verify one loop or song from compose text, song text, Soundfish
 * JSON or a Standard MIDI file. With an output path, publish the verified
 * lossless score document; without one, write nothing.
 */
export async function composeSlopcameraSoundtrack(
  input: SlopcameraSoundtrackComposeInput,
): Promise<SlopcameraSoundtrackComposeReceipt> {
  await checkOutputPath(input.sourcePath, input.outputPath)
  const { score, source } = await readScore(input.sourcePath, input.format)
  const verified = await guarded(async () => await verify(score.document), "Verification failed")
  if (!verified.ok) libraryFailure(verified, "Verification failed")
  const grid = await gridOf(score.document)
  const { bpm, beatsPerBar } = checkedTiming(grid)
  const durationUs = durationUsOf(grid, bpm)
  const output = input.outputPath === undefined ? null : await publishJson(input.outputPath, score.document)
  return {
    receiptVersion: 1,
    operation: "slopcamera.soundtrack.compose",
    engine: slopcameraSoundtrackEngine,
    source,
    kind: verified.kind,
    title: printable(grid.title, 256),
    digest: verified.digest,
    contentId: verified.kind === "loop" ? verified.musicCid : verified.arrangementCid,
    bpm,
    beatsPerBar,
    bars: grid.bars,
    durationUs,
    tracks: verified.kind === "loop" ? verified.tracks : null,
    sections: verified.kind === "song" ? verified.sections : null,
    loops: verified.kind === "song" ? verified.loops : null,
    warnings: score.warnings.slice(0, slopcameraSoundtrackLimits.warnings),
    output,
  }
}

/**
 * Project a score's tempo, meter and sections onto the video timeline. Beat
 * zero is the soundtrack's first beat at `startUs`, so `music` drops straight
 * into an HTML scene request and every cue lands on a beat of that clock.
 */
export function projectSlopcameraSoundtrackGrid(
  grid: BeatGrid,
  digest: string,
  startUs = 0,
): SlopcameraSoundtrackGrid {
  if (!Number.isSafeInteger(startUs) || startUs < 0 || startUs > slopcameraSoundtrackLimits.maxTimeUs) {
    invalidInput(`startUs must be an integer from 0 through ${String(slopcameraSoundtrackLimits.maxTimeUs)}.`)
  }
  const { bpm, beatsPerBar } = checkedTiming(grid)
  const durationUs = durationUsOf(grid, bpm)
  if (startUs + durationUs > slopcameraSoundtrackLimits.maxTimeUs) {
    outOfRange("startUs plus the score duration exceeds the one-hour timeline bound.")
  }
  if (grid.sections.length === 0 || grid.sections.length > slopcameraSoundtrackLimits.sections) {
    outOfRange(`A score must have 1–${String(slopcameraSoundtrackLimits.sections)} sections in play order.`)
  }
  let previousEndBeat = 0
  const sections = grid.sections.map((section) => {
    if (
      !Number.isSafeInteger(section.startBeat)
      || !Number.isSafeInteger(section.endBeat)
      || section.startBeat !== previousEndBeat
      || section.endBeat <= section.startBeat
      || section.endBeat > grid.beats
    ) {
      outOfRange("Beat grid sections must tile the score in play order.")
    }
    previousEndBeat = section.endBeat
    return {
      index: section.index,
      label: printable(section.label, 128),
      repeat: section.repeat,
      startBar: section.startBar,
      endBar: section.endBar,
      startBeat: section.startBeat,
      endBeat: section.endBeat,
      startUs: startUs + soundtrackBeatTimeUs(section.startBeat, bpm),
      endUs: startUs + soundtrackBeatTimeUs(section.endBeat, bpm),
    }
  })
  if (previousEndBeat !== grid.beats) outOfRange("Beat grid sections must cover the whole score.")
  return {
    schemaVersion: 1,
    kind: "slopcamera.soundtrack-grid",
    digest,
    title: printable(grid.title, 256),
    music: { bpm, beatOffsetUs: startUs, beatsPerBar },
    beatUnit: grid.beatUnit,
    swing: grid.swing,
    bars: grid.bars,
    beats: grid.beats,
    startUs,
    durationUs,
    endUs: startUs + durationUs,
    sections,
  }
}

/**
 * Derive music timing and section cues from a score. With an output path,
 * publish the grid document; without one, write nothing.
 */
export async function deriveSlopcameraSoundtrackGrid(
  input: SlopcameraSoundtrackGridInput,
): Promise<SlopcameraSoundtrackGridReceipt> {
  await checkOutputPath(input.sourcePath, input.outputPath)
  const startUs = input.startUs ?? 0
  const { score, source } = await readScore(input.sourcePath, input.format)
  const verified = await guarded(async () => await verify(score.document), "Verification failed")
  if (!verified.ok) libraryFailure(verified, "Verification failed")
  const grid = await gridOf(score.document)
  const projected = projectSlopcameraSoundtrackGrid(grid, verified.digest, startUs)
  const output = input.outputPath === undefined ? null : await publishJson(input.outputPath, projected)
  const { kind: _kind, schemaVersion: _schemaVersion, ...fields } = projected
  return {
    receiptVersion: 1,
    operation: "slopcamera.soundtrack.grid",
    engine: slopcameraSoundtrackEngine,
    source,
    scoreKind: verified.kind,
    ...fields,
    warnings: score.warnings.slice(0, slopcameraSoundtrackLimits.warnings),
    output,
  }
}

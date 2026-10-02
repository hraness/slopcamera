import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { replayLogMatches, runOilPaintSource, type OilPaintEngineResult } from "./oil-paint-engine.js"
import { byteLength, boundedText, inspectKmMix, oilPaintFail, parseOilPaintModel, record, slopcameraOilPaintLimits, SLOPCAMERA_OIL_PAINT_VERSION } from "./oil-paint-model.js"
import type { SlopcameraOilPaintIngredient, SlopcameraOilPaintReplayDocument, SlopcameraOilPaintSource, SlopcameraOilPaintStrokeLog, SlopcameraOilPaintTube } from "./oil-paint-model.js"

export * from "./oil-paint-model.js"
export function parseSlopcameraOilPaintInput(value: unknown): SlopcameraOilPaintSource { return parseOilPaintModel(value).source }

export interface SlopcameraOilPaintResult {
  readonly receiptVersion: 1
  readonly width: number
  readonly height: number
  readonly clockSteps: number
  readonly layers: number
  readonly strokes: number
  readonly wetPixels: number
  readonly bytes: number
  readonly imageSha256: string
  readonly strokeLogSha256: string
  readonly source: SlopcameraOilPaintSource
  readonly strokeLog: readonly SlopcameraOilPaintStrokeLog[]
  readonly image: Uint8Array
}
export interface SlopcameraOilPaintFileInput { readonly inputPath?: string; readonly replayPath?: string; readonly outputPath: string; readonly logPath?: string }
export interface SlopcameraOilPaintFileReceipt { readonly receiptVersion: 1; readonly width: number; readonly height: number; readonly clockSteps: number; readonly layers: number; readonly strokes: number; readonly wetPixels: number; readonly bytes: number; readonly imageSha256: string; readonly strokeLogSha256: string; readonly outputPath: string; readonly logPath: string | null }

function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex") }
function json(value: unknown): string { return JSON.stringify(value) }
function resultFromEngine(parsed: ReturnType<typeof parseOilPaintModel>, engine: OilPaintEngineResult): SlopcameraOilPaintResult { return { receiptVersion: 1, width: engine.width, height: engine.height, clockSteps: engine.clockSteps, layers: engine.layers, strokes: engine.strokes, wetPixels: engine.wetPixels, bytes: engine.image.byteLength, imageSha256: sha256(engine.image), strokeLogSha256: sha256(json(engine.strokeLog)), source: parsed.source, strokeLog: engine.strokeLog, image: engine.image } }

export function simulateSlopcameraOilPaint(value: unknown): SlopcameraOilPaintResult { const run = runOilPaintSource(value); return resultFromEngine(run.parsed, run.result) }
export function serializeSlopcameraOilPaintReplay(result: SlopcameraOilPaintResult): string { const document: SlopcameraOilPaintReplayDocument = { version: SLOPCAMERA_OIL_PAINT_VERSION, input: result.source, strokeLog: result.strokeLog }; const text = `${JSON.stringify(document, null, 2)}\n`; if (byteLength(text) > slopcameraOilPaintLimits.maxLogBytes) oilPaintFail(`stroke replay log exceeds ${slopcameraOilPaintLimits.maxLogBytes} bytes`); return text }
export function replaySlopcameraOilPaint(value: unknown): SlopcameraOilPaintResult { const input = record(value, ["version", "input", "strokeLog"], "oil-paint replay"); if (input.version !== 1) oilPaintFail("replay version must be 1"); if (!Array.isArray(input.strokeLog) || input.strokeLog.length > slopcameraOilPaintLimits.maxStrokes) oilPaintFail("replay strokeLog is outside its bound"); const run = runOilPaintSource(input.input); if (!replayLogMatches(input.strokeLog, run.result)) oilPaintFail("replay strokeLog does not match the deterministic source"); return resultFromEngine(run.parsed, run.result) }

function pathValue(value: unknown, name: string, suffix: string): string { const path = boundedText(value, name, 4_096); if (!path.toLowerCase().endsWith(suffix)) oilPaintFail(`${name} must end in ${suffix}`); return resolve(path) }
async function atomicWrite(path: string, value: Uint8Array | string): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${randomUUID()}.tmp`; try { await writeFile(temporary, value, { flag: "wx" }); await rename(temporary, path) } finally { await rm(temporary, { force: true }).catch(() => undefined) } }
export async function runSlopcameraOilPaintFile(input: SlopcameraOilPaintFileInput): Promise<SlopcameraOilPaintFileReceipt> {
  const outputPath = pathValue(input.outputPath, "outputPath", ".ppm"); const logPath = input.logPath === undefined ? undefined : pathValue(input.logPath, "logPath", ".json"); const inputPath = input.inputPath === undefined ? undefined : pathValue(input.inputPath, "inputPath", ".json"); const replayPath = input.replayPath === undefined ? undefined : pathValue(input.replayPath, "replayPath", ".json")
  if ((inputPath === undefined) === (replayPath === undefined)) oilPaintFail("provide exactly one of inputPath or replayPath")
  const sourcePath = inputPath ?? replayPath!; const bytes = await readFile(sourcePath); const limit = replayPath === undefined ? slopcameraOilPaintLimits.maxInputBytes : slopcameraOilPaintLimits.maxReplayBytes; if (bytes.byteLength > limit) oilPaintFail(`${replayPath === undefined ? "source" : "replay"} file exceeds ${limit} bytes`)
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { oilPaintFail("source/replay file must be valid UTF-8 JSON") }
  const result = replayPath === undefined ? simulateSlopcameraOilPaint(parsed) : replaySlopcameraOilPaint(parsed); await atomicWrite(outputPath, result.image); if (logPath !== undefined) await atomicWrite(logPath, serializeSlopcameraOilPaintReplay(result))
  return { receiptVersion: 1, width: result.width, height: result.height, clockSteps: result.clockSteps, layers: result.layers, strokes: result.strokes, wetPixels: result.wetPixels, bytes: result.bytes, imageSha256: result.imageSha256, strokeLogSha256: result.strokeLogSha256, outputPath, logPath: logPath ?? null }
}
export function inspectSlopcameraOilPaintKmMix(tubes: readonly SlopcameraOilPaintTube[], ingredients: readonly SlopcameraOilPaintIngredient[]): readonly number[] { return inspectKmMix(tubes, ingredients) }

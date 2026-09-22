// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- packed source types need Bun asset modules
/// <reference path="./assets.d.ts" />
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Resvg } from "@resvg/resvg-js"
import bookAsset from "./assets/fonts/nebula-sans/NebulaSans-Book.otf" with { type: "file" }
import boldAsset from "./assets/fonts/nebula-sans/NebulaSans-Bold.otf" with { type: "file" }
import { drawingSheetsPdf } from "./drawing-pdf.js"
import { layoutBoxContent } from "./label-layout.js"
import { parseDiagramSource, parseDiagramSpec } from "./parse.js"
import { renderSvg } from "./render.js"
import type { DiagramConfig, DiagramSource, DiagramSpec, ThemeColors } from "./types.js"
import { SLOPCAMERA_VERSION } from "./version.js"

export const drawingProfile = "patent-line-art-v1" as const
export const drawingSourceByteLimit = 1024 * 1024
export const drawingMinimumGlyphHeightPt = 3.2 * 72 / 25.4
export type DrawingPaper = "us-letter" | "a4"
export interface DrawingSource {
  readonly $schema?: string
  readonly version: 1
  readonly name: string
  readonly title?: string
  readonly paper: DrawingPaper
  readonly sheets: readonly { readonly figure: number; readonly diagram: DiagramSource }[]
}
export interface DrawingCheckResult {
  readonly profile: typeof drawingProfile
  readonly paper: DrawingPaper
  readonly sheetCount: number
  readonly minGlyphHeightPt: number
  readonly findings: readonly []
}
export interface DrawingReceipt {
  readonly version: 1
  readonly profile: typeof drawingProfile
  readonly rendererVersion: string
  readonly sourceSha256: string
  readonly paper: DrawingPaper
  readonly minGlyphHeightPt: number
  readonly sheets: readonly { readonly figure: number; readonly widthPt: number; readonly heightPt: number; readonly sha256: string }[]
  readonly pdfSha256: string
}
export interface DrawingRenderResult {
  readonly artifacts: { readonly source: string; readonly pdf: string; readonly sheets: readonly string[]; readonly receipt: string }
  readonly checks: DrawingCheckResult
  readonly receipt: DrawingReceipt
}
export class DrawingValidationError extends Error {
  constructor(message: string) { super(`Invalid drawing source: ${message}`); this.name = "DrawingValidationError" }
}
function fail(message: string): never { throw new DrawingValidationError(message) }
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex")
const assetPath = (asset: string): string => isAbsolute(asset) ? asset : fileURLToPath(new URL(asset, import.meta.url))
const fontFiles = [assetPath(bookAsset), assetPath(boldAsset)]
const monochrome: ThemeColors = {
  background: "#ffffff", foreground: "#000000", muted: "#000000", stroke: "#000000",
  tones: Object.fromEntries(["neutral", "blue", "orange", "green", "red", "purple", "yellow"].map(tone => [tone, { fill: "#ffffff", stroke: "#000000", text: "#000000" }])) as ThemeColors["tones"],
}
const config: DiagramConfig = {
  font: { family: "Nebula Sans", files: [{ path: fontFiles[0]!, weight: 400 }, { path: fontFiles[1]!, weight: 700 }] },
  theme: { light: monochrome },
}
const escapeXml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

export function drawingPageGeometry(paper: DrawingPaper) {
  if (paper !== "us-letter" && paper !== "a4") fail("paper must be us-letter or a4")
  const width = paper === "us-letter" ? 612 : 210 * 72 / 25.4
  const height = paper === "us-letter" ? 792 : 297 * 72 / 25.4
  const margins = { left: 25 * 72 / 25.4, top: 25 * 72 / 25.4, right: 15 * 72 / 25.4, bottom: 10 * 72 / 25.4 }
  return { width, height, margins, numberingHeight: 30, body: { x: margins.left, y: margins.top + 30, width: width - margins.left - margins.right, height: height - margins.top - margins.bottom - 60 } }
}

function record(value: unknown, keys: readonly string[], at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${at} must be an object`)
  const result = value as Record<string, unknown>
  for (const key of Object.keys(result)) if (!keys.includes(key)) fail(`${at}.${key} is unsupported`)
  return result
}

function checkDiagramEnvelope(value: unknown): void {
  const diagram = record(value, ["$schema", "version", "name", "canvas", "layout", "shapes", "edges"], "diagram")
  const bounded = (object: Record<string, unknown>): void => {
    for (const value of Object.values(object)) {
      if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 10_000)) fail("numeric drawing values must be finite and within 10000 points")
      if (typeof value === "string" && value.length > 1024) fail("drawing strings exceed the bounded text limit")
    }
  }
  bounded(diagram)
  bounded(record(diagram.canvas, ["width", "height", "padding"], "canvas"))
  if (diagram.layout !== undefined) bounded(record(diagram.layout, ["type", "direction", "gap", "align"], "layout"))
  if (!Array.isArray(diagram.shapes) || diagram.shapes.length < 1 || diagram.shapes.length > 100) fail("each sheet needs 1 to 100 shapes")
  for (const value of diagram.shapes) {
    const shape = record(value, ["id", "type", "x", "y", "tone", "opacity", "width", "height", "radius", "icon", "iconSize", "strokeWidth", "fill", "label", "labelFontSize", "labelFontFamily", "labelWeight", "labelRows", "labelRowGap", "text", "fontSize", "fontFamily", "weight", "align", "x2", "y2"], "shape")
    bounded(shape)
    const common = ["id", "type", "x", "y", "tone", "opacity"]
    const extras = shape.type === "text" ? ["text", "width", "fontSize", "fontFamily", "weight", "align"] : shape.type === "line" ? ["x2", "y2", "strokeWidth"] : ["width", "height", "radius", "icon", "iconSize", "strokeWidth", "fill", "label", "labelFontSize", "labelFontFamily", "labelWeight", "labelRows", "labelRowGap"]
    record(value, [...common, ...extras], "shape")
    if (shape.labelRows !== undefined) {
      if (!Array.isArray(shape.labelRows) || shape.labelRows.length > 4) fail("labelRows must be bounded")
      for (const row of shape.labelRows) bounded(record(row, ["text", "fontSize", "fontFamily", "weight"], "label row"))
    }
    for (const key of ["label", "text"] as const) if (typeof shape[key] === "string" && shape[key].length > 500) fail("label exceeds text limit")
  }
  if (diagram.edges !== undefined) {
    if (!Array.isArray(diagram.edges) || diagram.edges.length > 150) fail("at most 150 edges are supported")
    for (const edge of diagram.edges) bounded(record(edge, ["id", "from", "to", "label", "tone", "start", "end", "bend", "arrowhead", "startPosition", "endPosition", "labelFontSize", "labelFontFamily", "labelWeight", "labelPosition", "labelOffset"], "edge"))
  }
}

export function parseDrawingSource(value: unknown): DrawingSource {
  const raw = record(value, ["$schema", "version", "name", "title", "paper", "sheets"], "drawing")
  if (raw.version !== 1) fail("version must be 1")
  if (typeof raw.name !== "string" || raw.name.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(raw.name)) fail("name must be a bounded lowercase hyphenated name")
  if (raw.paper !== "us-letter" && raw.paper !== "a4") fail("paper must be us-letter or a4")
  if (raw.title !== undefined && (typeof raw.title !== "string" || raw.title.length < 1 || Buffer.byteLength(raw.title) > 1024 || /[\u0000-\u001f]/u.test(raw.title))) fail("title must be a bounded metadata string")
  if (raw.$schema !== undefined && typeof raw.$schema !== "string") fail("$schema must be a string")
  if (!Array.isArray(raw.sheets) || raw.sheets.length < 1 || raw.sheets.length > 20) fail("sheets must contain 1 to 20 sheets")
  const sheets = raw.sheets.map((sheet: unknown, index: number) => {
    const entry = record(sheet, ["figure", "diagram"], `sheets[${index}]`)
    if (entry.figure !== index + 1) fail("figure numbers must be consecutive beginning at 1")
    checkDiagramEnvelope(entry.diagram)
    const diagram = parseDiagramSource(entry.diagram)
    const spec = parseDiagramSpec(diagram)
    if (spec.shapes.length < 1 || spec.shapes.length > 100 || (spec.edges?.length ?? 0) > 150) fail("each sheet needs 1 to 100 shapes and at most 150 edges")
    return { figure: index + 1, diagram }
  })
  const source: DrawingSource = { version: 1, name: raw.name, paper: raw.paper, sheets, ...(raw.title === undefined ? {} : { title: raw.title as string }), ...(raw.$schema === undefined ? {} : { $schema: raw.$schema as string }) }
  if (Buffer.byteLength(JSON.stringify(source)) > drawingSourceByteLimit) fail("source exceeds 1MiB byte limit")
  return source
}

function renderer(svg: string): Resvg {
  return new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Nebula Sans" }, logLevel: "off" })
}

interface InkBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
function bounds(engine: Resvg): InkBounds {
  const box = engine.getBBox()
  if (box === undefined) fail("empty drawing ink")
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}
function inside(ink: InkBounds, box: InkBounds, label: string): void {
  const epsilon = 0.01
  if (ink.x < box.x - epsilon || ink.y < box.y - epsilon || ink.x + ink.width > box.x + box.width + epsilon || ink.y + ink.height > box.y + box.height + epsilon) fail(`${label} ink extends beyond its bounds`)
}

async function sceneSvg(spec: DiagramSpec): Promise<string> {
  return (await renderSvg(spec, "light", config, { edgeStrokeWidth: 1 })).svg.replace('<rect width="100%" height="100%" fill="#ffffff"/>', "")
}

function glyphHeight(character: string, fontSize: number, weight: number): number {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><text x="100" y="500" font-family="Nebula Sans" font-size="${fontSize}" font-weight="${weight}">${escapeXml(character)}</text></svg>`
  return bounds(renderer(svg)).height
}

function inspectLabels(spec: DiagramSpec, glyphCache: Map<string, number>): number {
  let minimum = Infinity
  const inspect = (text: string, fontSize: number, weight: number, family?: string): void => {
    if (text.length < 1 || text.length > 500 || !Array.from(text).every(character => /^[A-Z0-9 \n]$/u.test(character) || ".,:;()[]/+=_*'!?%-".includes(character))) fail("visible labels must be uppercase ASCII letters, numbers, spaces, or supported punctuation; labels are never rewritten")
    if (family !== undefined && family !== "default") fail("only the bundled default font is supported")
    if (!Number.isFinite(fontSize) || fontSize <= 0 || fontSize > 18) fail("authored font size must be positive and at most 18 points, below the 20 point sheet numbering")
    for (const character of new Set(text.match(/[A-Z0-9]/gu) ?? [])) {
      const key = `${character}:${fontSize}:${weight}`
      const measured = glyphCache.get(key) ?? glyphHeight(character, fontSize, weight)
      glyphCache.set(key, measured)
      if (glyphCache.size > 4096) fail("glyph measurement limit exceeded")
      minimum = Math.min(minimum, measured)
      if (measured + 0.001 < drawingMinimumGlyphHeightPt) fail(`glyph ${character} has ${measured.toFixed(3)}pt ink height; minimum is ${drawingMinimumGlyphHeightPt.toFixed(3)}pt (3.2mm)`)
    }
  }
  for (const shape of spec.shapes) {
    if (shape.tone !== undefined && shape.tone !== "neutral") fail("colored tones are unsupported; author monochrome relationships explicitly")
    if (shape.opacity !== undefined && shape.opacity !== 1) fail("transparency is unsupported")
    if (shape.type === "rect" || shape.type === "ellipse") {
      if (shape.icon !== undefined) fail("icons are unsupported")
      if ((shape.strokeWidth ?? 2) < 0.5 || (shape.strokeWidth ?? 2) > 4) fail("stroke width must be 0.5 to 4 points")
      for (const row of layoutBoxContent(shape).rows) inspect(row.text, row.fontSize, row.weight, row.fontFamily)
    } else if (shape.type === "text") inspect(shape.text, shape.fontSize ?? 24, shape.weight ?? 500, shape.fontFamily)
    else if ((shape.strokeWidth ?? 3) < 0.5 || (shape.strokeWidth ?? 3) > 4) fail("stroke width must be 0.5 to 4 points")
  }
  for (const edge of spec.edges ?? []) {
    if (edge.tone !== undefined && edge.tone !== "neutral") fail("colored edge tones are unsupported")
    if (edge.label !== undefined) inspect(edge.label, edge.labelFontSize ?? 18, edge.labelWeight ?? 600, edge.labelFontFamily)
  }
  return minimum
}

export async function renderDrawing(input: DrawingSource, sourceSha256?: string): Promise<{
  readonly sheets: readonly { readonly svg: string; readonly width: number; readonly height: number; readonly figure: number }[]
  readonly pdf: Uint8Array
  readonly checks: DrawingCheckResult
}> {
  const source = parseDrawingSource(input)
  const sourceDigest = sourceSha256 ?? sha256(JSON.stringify(source))
  if (!/^[a-f0-9]{64}$/u.test(sourceDigest)) fail("source SHA-256 is invalid")
  const geometry = drawingPageGeometry(source.paper)
  const sheets: { svg: string; width: number; height: number; figure: number }[] = []
  const cache = new Map<string, number>()
  let minGlyphHeightPt = Infinity
  for (const sheet of source.sheets) {
    const spec = parseDiagramSpec(sheet.diagram)
    if (spec.canvas.width > geometry.body.width + 0.001 || spec.canvas.height > geometry.body.height + 0.001) fail(`figure ${sheet.figure} canvas exceeds ${geometry.body.width.toFixed(3)} by ${geometry.body.height.toFixed(3)}pt body; no automatic scaling is performed`)
    minGlyphHeightPt = Math.min(minGlyphHeightPt, inspectLabels(spec, cache))
    const sourceSvg = await sceneSvg(spec)
    inside(bounds(renderer(sourceSvg)), { x: 0, y: 0, width: spec.canvas.width, height: spec.canvas.height }, `figure ${sheet.figure}`)
    for (const shape of spec.shapes) {
      if ((shape.type === "rect" || shape.type === "ellipse") && (shape.label !== undefined || shape.labelRows !== undefined)) {
        const inset = (shape.strokeWidth ?? 2) / 2
        const single = await sceneSvg({ ...spec, shapes: [shape], edges: [] })
        inside(bounds(renderer(single)), { x: shape.x - inset, y: shape.y - inset, width: shape.width + inset * 2, height: shape.height + inset * 2 }, `shape ${shape.id} label`)
      }
    }
    const diagramBody = sourceSvg.replace(/^<svg[^>]*>/u, "").replace(/<\/svg>$/u, "")
    const x = geometry.body.x + (geometry.body.width - spec.canvas.width) / 2
    const counter = `${sheet.figure}/${source.sheets.length}`
    const figureLabel = source.sheets.length === 1 ? "" : `<text x="${geometry.width / 2}" y="${geometry.height - geometry.margins.bottom - 8}" text-anchor="middle" font-size="20" font-family="Nebula Sans" font-weight="400">FIG. ${sheet.figure}</text>`
    const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}" viewBox="0 0 ${geometry.width} ${geometry.height}"><rect width="100%" height="100%" fill="#ffffff"/><text x="${geometry.width / 2}" y="${geometry.margins.top + 21}" text-anchor="middle" font-size="20" font-family="Nebula Sans" font-weight="400">${counter}</text><g transform="translate(${x} ${geometry.body.y})">${diagramBody}</g>${figureLabel}</svg>`
    const outlined = renderer(page).toString().replace(/width="[^"]+" height="[^"]+" viewBox="[^"]+"/u, `width="${geometry.width}pt" height="${geometry.height}pt" viewBox="0 0 ${geometry.width} ${geometry.height}"`)
    if (Buffer.byteLength(outlined) > 2 * 1024 * 1024) fail("sheet SVG exceeds output byte limit")
    sheets.push({ svg: outlined, width: geometry.width, height: geometry.height, figure: sheet.figure })
  }
  // Numbering is subject to the same measured-glyph rule as authored content.
  for (const character of "FIG0123456789") minGlyphHeightPt = Math.min(minGlyphHeightPt, glyphHeight(character, 20, 400))
  if (minGlyphHeightPt + 0.001 < drawingMinimumGlyphHeightPt) fail("sheet numbering falls below minimum glyph height")
  const checks: DrawingCheckResult = { profile: drawingProfile, paper: source.paper, sheetCount: source.sheets.length, minGlyphHeightPt, findings: [] }
  return { sheets, checks, pdf: drawingSheetsPdf(sheets, { title: source.title ?? source.name, sourceSha256: sourceDigest, rendererVersion: SLOPCAMERA_VERSION }) }
}

export async function readDrawingFile(filePath: string) {
  const absolutePath = resolve(filePath)
  if (!absolutePath.endsWith(".drawing.json")) fail("source filename must end in .drawing.json")
  const descriptor = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  let bytes: Buffer
  try {
    const info = await descriptor.stat()
    if (!info.isFile()) fail("source must be a regular file")
    if (info.size > drawingSourceByteLimit) fail("source exceeds 1MiB byte limit")
    const buffer = Buffer.alloc(drawingSourceByteLimit + 1)
    let cursor = 0
    while (cursor < buffer.length) {
      const result = await descriptor.read(buffer, cursor, buffer.length - cursor, cursor)
      if (result.bytesRead === 0) break
      cursor += result.bytesRead
    }
    if (cursor > drawingSourceByteLimit) fail("source exceeds 1MiB byte limit")
    bytes = buffer.subarray(0, cursor)
  } finally { await descriptor.close() }
  const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  return { absolutePath, source: parseDrawingSource(raw), sourceSha256: sha256(bytes) }
}
export async function checkDrawingFile(options: { readonly filePath: string }): Promise<DrawingCheckResult> {
  const { source, sourceSha256 } = await readDrawingFile(options.filePath)
  return (await renderDrawing(source, sourceSha256)).checks
}
async function atomicWrite(filePath: string, data: string | Uint8Array): Promise<void> {
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`
  try { await writeFile(temporary, data); await rename(temporary, filePath) }
  catch (error) { await rm(temporary, { force: true }); throw error }
}
export async function renderDrawingFile(options: { readonly filePath: string; readonly outDirectory?: string }): Promise<DrawingRenderResult> {
  const { absolutePath, source, sourceSha256 } = await readDrawingFile(options.filePath)
  const result = await renderDrawing(source, sourceSha256)
  const outDirectory = resolve(options.outDirectory ?? dirname(absolutePath))
  const artifacts = { source: absolutePath, pdf: join(outDirectory, `${source.name}.pdf`), sheets: result.sheets.map((_, index) => join(outDirectory, `${source.name}.sheet-${String(index + 1).padStart(3, "0")}.svg`)), receipt: join(outDirectory, `${source.name}.drawing-receipt.json`) }
  const receipt: DrawingReceipt = { version: 1, profile: drawingProfile, rendererVersion: SLOPCAMERA_VERSION, sourceSha256, paper: source.paper, minGlyphHeightPt: result.checks.minGlyphHeightPt, sheets: result.sheets.map(sheet => ({ figure: sheet.figure, widthPt: sheet.width, heightPt: sheet.height, sha256: sha256(sheet.svg) })), pdfSha256: sha256(result.pdf) }
  await mkdir(outDirectory, { recursive: true })
  // Validate every sheet before making any derived output visible; write receipt last.
  for (const [index, sheet] of result.sheets.entries()) await atomicWrite(artifacts.sheets[index]!, sheet.svg)
  await atomicWrite(artifacts.pdf, result.pdf)
  await atomicWrite(artifacts.receipt, `${JSON.stringify(receipt, null, 2)}\n`)
  return { artifacts, checks: result.checks, receipt }
}

export function starterDrawingSource(): DrawingSource {
  return {
    $schema: "https://raw.githubusercontent.com/hraness/slopcamera/main/schema/drawing.schema.json",
    version: 1, name: "sensor-control", title: "Fictional sensor and controller drawings", paper: "us-letter",
    sheets: [
      { figure: 1, diagram: { version: 1, name: "sensor-system", canvas: { width: 480, height: 500 }, shapes: [
        { id: "sensor", type: "rect", x: 105, y: 40, width: 280, height: 100, radius: 0, label: "SENSOR 100", labelFontSize: 16 },
        { id: "controller", type: "rect", x: 105, y: 280, width: 280, height: 100, radius: 0, label: "CONTROLLER 200", labelFontSize: 16 },
      ], edges: [{ id: "signal", from: "sensor", to: "controller", label: "SIGNAL", labelFontSize: 16 }] } },
      { figure: 2, diagram: { version: 1, name: "control-flow", canvas: { width: 480, height: 500 }, shapes: [
        { id: "receive", type: "rect", x: 105, y: 40, width: 280, height: 100, radius: 0, label: "RECEIVE SIGNAL 210", labelFontSize: 16 },
        { id: "actuate", type: "rect", x: 105, y: 280, width: 280, height: 100, radius: 0, label: "SET OUTPUT 220", labelFontSize: 16 },
      ], edges: [{ id: "next", from: "receive", to: "actuate" }] } },
    ],
  }
}

import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import fc from "fast-check"
import { checkDrawingFile, drawingMinimumGlyphHeightPt, drawingPageGeometry, parseDrawingSource, readDrawingFile, renderDrawing, renderDrawingFile, starterDrawingSource, type DrawingSource } from "./drawing.js"
import { parseDiagramSpec } from "./parse.js"
import { renderSvg } from "./render.js"

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function directory() { const path = await mkdtemp(join(tmpdir(), "slopcamera-drawing-")); directories.push(path); return path }
function firstShapeSource(change: Record<string, unknown>): unknown {
  const source = starterDrawingSource()
  const first = source.sheets[0]!
  const diagram = parseDiagramSpec(first.diagram)
  return { ...source, sheets: [{ ...first, diagram: { ...diagram, shapes: [{ ...diagram.shapes[0], ...change }, ...diagram.shapes.slice(1)] } }, ...source.sheets.slice(1)] }
}

describe("physical drawing sheets", () => {
  test("renders deterministic outlined vectors on both supported papers", async () => {
    for (const paper of ["us-letter", "a4"] as const) {
      const source = { ...starterDrawingSource(), paper }
      const first = await renderDrawing(source)
      const second = await renderDrawing(source)
      expect(first.pdf).toEqual(second.pdf)
      expect(first.sheets).toEqual(second.sheets)
      expect(first.sheets).toHaveLength(2)
      expect(first.checks.minGlyphHeightPt).toBeGreaterThanOrEqual(drawingMinimumGlyphHeightPt)
      expect(Buffer.from(first.pdf).toString()).toContain("/Count 2")
      expect(Buffer.from(first.pdf).toString()).not.toContain("/Subtype /Image")
      for (const sheet of first.sheets) {
        expect(sheet.svg).not.toMatch(/<(?:text|image)\b/u)
        expect(sheet.svg).toContain('width="' + drawingPageGeometry(paper).width + 'pt"')
      }
    }
  })
  test("rejects a nominally plausible font whose actual glyph is too small", async () => {
    const source = parseDrawingSource(firstShapeSource({ label: "A1", labelFontSize: 12 }))
    await expect(renderDrawing(source)).rejects.toThrow("ink height")
  })
  test("rejects unsupported meaning-bearing styles and lowercase without changing source", async () => {
    for (const change of [{ label: "Sensor 100" }, { tone: "blue" }, { opacity: 0.5 }, { icon: "document" }, { labelFontFamily: "mono" }, { labelFontSize: 19 }]) {
      const source = parseDrawingSource(firstShapeSource(change))
      await expect(renderDrawing(source)).rejects.toThrow()
    }
    expect(() => parseDrawingSource(firstShapeSource({ fillColor: "blue" }))).toThrow("unsupported")
  })
  test("checks stroke, curve, free text and actual box label extents", async () => {
    for (const change of [{ x: 0 }, { label: "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", labelFontSize: 18 }]) {
      await expect(renderDrawing(parseDrawingSource(firstShapeSource(change)))).rejects.toThrow("bounds")
    }
    const source = starterDrawingSource()
    const first = source.sheets[0]!
    const diagram = parseDiagramSpec(first.diagram)
    await expect(renderDrawing({ ...source, sheets: [{ ...first, diagram: { ...diagram, edges: [{ id: "curve", from: "sensor", to: "controller", bend: 2000 }] } }] })).rejects.toThrow("bounds")
    await expect(renderDrawing({ ...source, sheets: [{ ...first, diagram: { ...diagram, shapes: [{ id: "text", type: "text", x: 480, y: 20, text: "OUTSIDE", fontSize: 16 }], edges: [] } }] })).rejects.toThrow("bounds")
  })
  test("does not scale an oversized canvas", async () => {
    const source = starterDrawingSource()
    const first = source.sheets[0]!
    await expect(renderDrawing({ ...source, sheets: [{ ...first, diagram: { ...first.diagram, canvas: { width: 1000, height: 1000 } } }] })).rejects.toThrow("no automatic scaling")
  })
  test("bounds page count, shape count, unknown fields and numbering", () => {
    const source = starterDrawingSource()
    expect(() => parseDrawingSource({ ...source, sheets: Array(21).fill(source.sheets[0]) })).toThrow()
    expect(() => parseDrawingSource({ ...source, accidental: true })).toThrow()
    expect(() => parseDrawingSource({ ...source, sheets: [{ ...source.sheets[0], figure: 2 }] })).toThrow("consecutive")
  })
  test("property: successful parsing is JSON round-trip stable and arbitrary inputs fail safely", () => {
    fc.assert(fc.property(fc.jsonValue({ maxDepth: 4 }), raw => {
      let parsed: DrawingSource
      try {
        parsed = parseDrawingSource(raw)
      } catch (error) { expect(error).toBeInstanceOf(Error); return }
      expect(parseDrawingSource(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
    }), { numRuns: 100 })
    fc.assert(fc.property(fc.constantFrom("us-letter", "a4"), fc.integer({ min: 1, max: 20 }), (paper, count) => {
      const starter = starterDrawingSource()
      const raw = { ...starter, paper, sheets: Array.from({ length: count }, (_, index) => ({ ...starter.sheets[0], figure: index + 1 })) }
      const parsed = parseDrawingSource(raw)
      expect(parseDrawingSource(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
    }), { numRuns: 30 })
  })
  test("file receipt binds exact raw bytes and every output; checking writes nothing", async () => {
    const root = await directory()
    const filePath = join(root, "source.drawing.json")
    const raw = `${JSON.stringify(starterDrawingSource(), null, 4)}\n`
    await writeFile(filePath, raw)
    const checked = await checkDrawingFile({ filePath })
    const result = await renderDrawingFile({ filePath, outDirectory: join(root, "output") })
    expect(result.checks).toEqual(checked)
    expect(result.receipt.sourceSha256).toBe(createHash("sha256").update(raw).digest("hex"))
    expect(await readFile(filePath, "utf8")).toBe(raw)
    expect(result.receipt.pdfSha256).toBe(createHash("sha256").update(await readFile(result.artifacts.pdf)).digest("hex"))
    expect(JSON.parse(await readFile(result.artifacts.receipt, "utf8")) as unknown).toEqual(result.receipt)
  })
  test("rejects oversize, symlink, directory and non-source filenames before rendering", async () => {
    const root = await directory()
    const source = join(root, "source.drawing.json")
    await writeFile(source, JSON.stringify(starterDrawingSource()))
    const alias = join(root, "alias.drawing.json")
    await symlink(source, alias)
    await expect(readDrawingFile(alias)).rejects.toThrow()
    await expect(readDrawingFile(root)).rejects.toThrow("filename")
    await expect(readDrawingFile(join(root, "source.pdf"))).rejects.toThrow("filename")
    await writeFile(source, " ".repeat(1024 * 1024 + 1))
    await expect(readDrawingFile(source)).rejects.toThrow("1MiB")
  })
  test("ordinary diagram edge width remains unchanged while profile width is explicit", async () => {
    const spec = parseDiagramSpec(starterDrawingSource().sheets[0]!.diagram)
    const normal = await renderSvg(spec, "light", {})
    const drawing = await renderSvg(spec, "light", {}, { edgeStrokeWidth: 1 })
    expect(normal.svg).toContain('stroke-width="3" stroke-linecap="round" marker-end=')
    expect(drawing.svg).toContain('stroke-width="1" stroke-linecap="round" marker-end=')
    await expect(renderSvg(spec, "light", {}, { edgeStrokeWidth: NaN })).rejects.toThrow()
  })
})

// Keep the compile-time source contract exercised without test-only casts.
const typedStarter: DrawingSource = starterDrawingSource()
expect(typedStarter.version).toBe(1)

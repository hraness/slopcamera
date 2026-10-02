import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import { lintDiagram, tallAspectRatioLimit } from "./lint.ts"
import { parseDiagramSpec } from "./parse.ts"

describe("diagram lint", () => {
  test("finds overflowing rich labels and shared fan-in ports", () => {
    const spec = parseDiagramSpec({
      version: 1,
      name: "lint-rich-layout",
      canvas: { width: 900, height: 500 },
      shapes: [
        { id: "a", type: "rect", x: 20, y: 40, width: 180, height: 100 },
        { id: "b", type: "rect", x: 20, y: 340, width: 180, height: 100 },
        {
          id: "target",
          type: "rect",
          x: 620,
          y: 190,
          width: 220,
          height: 80,
          icon: "database",
          labelRows: [
            { text: "ONTOLOGY", fontSize: 24, fontFamily: "mono" },
            { text: "A deliberately tall detail row", fontSize: 30 },
          ],
        },
      ],
      edges: [
        { id: "a-target", from: "a", to: "target", end: "left" },
        { id: "b-target", from: "b", to: "target", end: "left" },
      ],
    })

    expect(lintDiagram(spec)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "label-overflow", shapeIds: ["target"] }),
        expect.objectContaining({ code: "shared-edge-port", shapeIds: ["target"] }),
      ]),
    )
  })

  test("accepts distributed fan-in ports", () => {
    const spec = parseDiagramSpec({
      version: 1,
      name: "lint-distributed-ports",
      canvas: { width: 900, height: 500 },
      shapes: [
        { id: "a", type: "rect", x: 20, y: 40, width: 180, height: 100 },
        { id: "b", type: "rect", x: 20, y: 340, width: 180, height: 100 },
        { id: "target", type: "rect", x: 620, y: 190, width: 220, height: 120 },
      ],
      edges: [
        { id: "a-target", from: "a", to: "target", end: "left", endPosition: 0.3 },
        { id: "b-target", from: "b", to: "target", end: "left", endPosition: 0.7 },
      ],
    })

    expect(lintDiagram(spec).some(({ code }) => code === "shared-edge-port")).toBe(false)
  })

  test("finds a single mono token that exceeds the available label width", () => {
    const spec = parseDiagramSpec({
      version: 1,
      name: "lint-horizontal-overflow",
      canvas: { width: 300, height: 200 },
      shapes: [
        {
          id: "identifier",
          type: "rect",
          x: 20,
          y: 40,
          width: 140,
          height: 120,
          labelRows: [
            {
              text: "ONE_UNBROKEN_IDENTIFIER",
              fontSize: 16,
              fontFamily: "mono",
            },
          ],
        },
      ],
    })

    expect(lintDiagram(spec)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "label-overflow", shapeIds: ["identifier"] }),
      ]),
    )
  })

  test("warns when a vertical stack becomes a tower", () => {
    const step = (id: string) => ({ id, type: "rect", width: 480, height: 144, label: id })
    const spec = parseDiagramSpec({
      version: 1,
      name: "lint-tall-aspect",
      canvas: { width: 720, height: 1232, padding: 64 },
      layout: { type: "stack", direction: "vertical", gap: 96, align: "center" },
      shapes: ["author", "check", "render", "review", "deliver"].map(step),
      edges: [
        { id: "a", from: "author", to: "check" },
        { id: "b", from: "check", to: "render" },
        { id: "c", from: "render", to: "review" },
        { id: "d", from: "review", to: "deliver" },
      ],
    })

    const finding = lintDiagram(spec).find(({ code }) => code === "tall-aspect")
    expect(finding).toEqual({
      code: "tall-aspect",
      message: expect.stringContaining("720x1232 canvas is 1.71 times taller than wide"),
      shapeIds: [],
    })
    expect(finding?.message).toContain("fold a longer sequence into two rows or columns")
  })

  test("accepts wide, square and exactly 1.5:1 canvases", () => {
    for (const [width, height] of [[1200, 520], [640, 640], [600, 900]] as const) {
      const spec = parseDiagramSpec({
        version: 1,
        name: "lint-aspect-ok",
        canvas: { width, height },
        shapes: [{ id: "a", type: "rect", x: 20, y: 20, width: 200, height: 100, label: "A" }],
      })
      expect(lintDiagram(spec).some(({ code }) => code === "tall-aspect")).toBe(false)
    }
  })

  test("tall-aspect fires exactly when height exceeds the limit times width", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 240, max: 4096 }),
        fc.integer({ min: 240, max: 4096 }),
        (width, height) => {
          const spec = parseDiagramSpec({
            version: 1,
            name: "lint-aspect-law",
            canvas: { width, height },
            shapes: [{ id: "a", type: "rect", x: 0, y: 0, width: 200, height: 100, label: "A" }],
          })
          const tall = lintDiagram(spec).some(({ code }) => code === "tall-aspect")
          expect(tall).toBe(height > width * tallAspectRatioLimit)
        },
      ),
    )
  })
})

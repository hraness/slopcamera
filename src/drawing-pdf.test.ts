import { expect, test } from "bun:test"
import { drawingSheetsPdf } from "./drawing-pdf.js"

const metadata = { title: "Fictional drawing", sourceSha256: "a".repeat(64), rendererVersion: "test" }
const svg = (body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="612pt" height="792pt" viewBox="0 0 612 792">${body}</svg>`
const render = (body: string): Uint8Array => drawingSheetsPdf([{ svg: svg(body), width: 612, height: 792 }], metadata)

test("PDF serializer emits deterministic vectors, quadratic conversion, transforms and clips", () => {
  const body = '<defs><clipPath id="c"><path d="M 0 0 L 50 0 L 50 50 Z"/></clipPath></defs><g transform="matrix(1 0 0 1 10 20)" clip-path="url(#c)"><path fill="none" stroke="#000000" d="M 0 0 Q 30 30 60 0"/></g>'
  const result = render(body)
  const text = Buffer.from(result).toString()
  expect(result).toEqual(render(body))
  expect(text).toStartWith("%PDF-1.7")
  expect(text).toContain("/MediaBox [0 0 612 792]")
  expect(text).toContain("20 20 40 20 60 0 c")
  expect(text).toContain("W n")
  expect(text).toContain("1 0 0 1 10 20 cm")
  expect(text).not.toContain("/Image")
})

test("PDF serializer fails closed on unsupported elements, attributes and paint", () => {
  for (const body of [
    '<image href="https://example.invalid/x"/>', '<text>HIDDEN</text>', '<script/>', '<path d="M 0 0 L 1 1" opacity="0.5"/>',
    '<path fill="#ff0000" d="M 0 0 L 1 1"/>', '<path d="M 0 0 A 1 1 0 0 0 4 4"/>', '<g transform="translate(1 2)"/>',
    '<g clip-path="url(#missing)"/>', '<path d="M 0 0 L 1 1" d="M 1 1"/>', '<path fill="none" stroke="#000000" stroke-width="NaN" d="M 0 0 L 1 1"/>',
  ]) expect(() => render(body)).toThrow("Unsupported drawing SVG")
})

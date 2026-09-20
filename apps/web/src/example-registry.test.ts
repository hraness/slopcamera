import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyExampleSources } from "../scripts/example-sources"
import { assertVisibleExampleGuide, readExampleAssets, validateExampleBytes } from "../scripts/example-assets"
import { exampleMarkdown, exampleMediaRecord, examplesInMarkdown, renderRegisteredExample } from "./example-content"
import { renderExampleMedia } from "./example-media"
import { renderDocsMarkdown } from "./docs-markdown"
import { parseWorkflowExamples, workflowExampleAssets, workflowExamples, type WorkflowExample } from "./example-registry"

function fixture(): WorkflowExample {
  return {
    id: "diagram-example", title: "An editable flow", description: "Three sources become one project.",
    family: "diagram", techniques: ["diagram.export"], guideSlug: "tutorials/first-diagram", guideAnchor: "", featured: false,
    requirements: "Bun and Slopcamera",
    source: { engineRevision: "a".repeat(40), files: [{ path: "examples/showcase/diagram/flow.json", sha256: "b".repeat(64) }],
      command: "slopcamera diagram render flow.json", toolVersion: "3.2.8", runtimes: ["Bun 1.3.14"], license: "MIT" },
    poster: { file: `flow-${"c".repeat(12)}.png`, sha256: "c".repeat(64), bytes: 100, mime: "image/png", width: 1280, height: 720, alt: "Three inputs connected to one project." },
    downloads: [], review: { agent: "reviewer", date: "2026-09-19", still: "passed", motion: "not-applicable", sound: "silent", captions: "not-applicable" },
  }
}

describe("reviewed workflow publication", () => {
  test("accepts stills and counts shared derivatives once", () => {
    const example = fixture()
    const records = parseWorkflowExamples([example, { ...example, id: "another-view" }])
    expect(workflowExampleAssets(records)).toHaveLength(1)
  })

  test("rejects unintended data, unsafe source paths and mutable asset names", () => {
    const example = fixture()
    expect(() => parseWorkflowExamples([{ ...example, providerReceipt: "private" }])).toThrow("unrecognized publication field")
    expect(() => parseWorkflowExamples([{ ...example, source: { ...example.source, files: [{ path: "examples/showcase/../secret.json", sha256: "b".repeat(64) }] } }])).toThrow("unsafe source closure")
    expect(() => parseWorkflowExamples([{ ...example, poster: { ...example.poster, file: "latest.png" } }])).toThrow("content-addressed")
    expect(() => parseWorkflowExamples([{ ...example, poster: { ...example.poster, sha256: "d".repeat(64) } }])).toThrow("disagree")
  })

  test("requires completed motion and sound reviews and bounded preview delivery", () => {
    const example = fixture()
    const video = { file: `flow-${"d".repeat(12)}.mp4`, sha256: "d".repeat(64), bytes: 1024, mime: "video/mp4" as const,
      width: 1280, height: 720, durationSeconds: 8, fps: 24, frames: 192, hasAudio: false }
    const record = { ...example, video, review: { ...example.review, motion: "passed" as const } }
    expect(parseWorkflowExamples([record])).toHaveLength(1)
    expect(() => parseWorkflowExamples([{ ...record, video: { ...video, hasAudio: true } }])).toThrow("sound review")
    expect(() => parseWorkflowExamples([{ ...record, video: { ...video, frames: 190 } }])).toThrow("duration/frame")
    expect(() => parseWorkflowExamples([{ ...record, featured: true, video: { ...video, durationSeconds: 16, frames: 384 } }])).toThrow("preview exceeds")
    expect(() => parseWorkflowExamples([{ ...record, review: example.review }])).toThrow("motion review")
  })

  test("verifies actual bytes before publication", () => {
    const bytes = Buffer.from("WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n")
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    const asset = { file: `captions-${sha256.slice(0, 12)}.vtt`, sha256, bytes: bytes.length, mime: "text/vtt" as const }
    expect(() => validateExampleBytes(asset, bytes)).not.toThrow()
    expect(() => validateExampleBytes(asset, Buffer.from(bytes.toString().replace("Hello", "World")))).toThrow("SHA-256 differs")
    expect(() => validateExampleBytes({ ...asset, bytes: bytes.length + 1 }, bytes)).toThrow("byte length differs")
    expect(() => validateExampleBytes({ ...asset, mime: "image/png" }, bytes)).toThrow("not PNG")
  })

  test("rejects private raster metadata even when its published hash matches", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=", "base64")
    function check(bytes: Buffer, mime: "image/png" | "image/webp") {
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      validateExampleBytes({ file: `sample-${sha256.slice(0, 12)}.${mime.split("/")[1]}`, sha256, bytes: bytes.length, mime }, bytes)
    }
    function pngChunk(kind: string, content: Buffer): Buffer {
      const body = Buffer.concat([Buffer.from(kind), content])
      let crc = 0xffffffff
      for (const byte of body) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
      }
      const result = Buffer.alloc(content.length + 12)
      result.writeUInt32BE(content.length); body.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4)
      return result
    }
    expect(() => check(png, "image/png")).not.toThrow()
    for (const kind of ["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "acTL", "iCCP"]) {
      const metadata = pngChunk(kind, Buffer.from("File\0/private/render/scene.blend"))
      expect(() => check(Buffer.concat([png.subarray(0, -12), metadata, png.subarray(-12)]), "image/png")).toThrow("unreviewed raster")
      expect(() => check(Buffer.concat([png, metadata]), "image/png")).toThrow("invalid raster framing")
    }
    const truncated = Buffer.from(png); truncated.writeUInt32BE(0xffffffff, 8)
    expect(() => check(truncated, "image/png")).toThrow("truncated raster chunk")
    expect(() => check(png.subarray(0, -12), "image/png")).toThrow("no complete static raster")
    const poster = workflowExamples.find(example => example.poster.mime === "image/webp")!.poster
    const webp = await readFile(join(import.meta.dir, "../media", poster.file))
    expect(() => check(webp, "image/webp")).not.toThrow()
    for (const kind of ["EXIF", "XMP ", "ANIM", "ICCP"]) {
      const chunk = Buffer.alloc(12); chunk.write(kind, 0, "latin1"); chunk.writeUInt32LE(4, 4); chunk.write("data", 8)
      const metadata = Buffer.concat([webp, chunk]); metadata.writeUInt32LE(metadata.length - 8, 4)
      expect(() => check(metadata, "image/webp")).toThrow("unreviewed raster")
    }
    for (const flags of [0x02, 0x04, 0x08, 0x20, 0x80]) {
      const header = Buffer.alloc(18); header.write("VP8X", 0); header.writeUInt32LE(10, 4); header[8] = flags
      const flagged = Buffer.concat([webp.subarray(0, 12), header, webp.subarray(12)]); flagged.writeUInt32LE(flagged.length - 8, 4)
      expect(() => check(flagged, "image/webp")).toThrow("WebP flags")
    }
    expect(() => check(Buffer.concat([webp, Buffer.from("private")]), "image/webp")).toThrow("invalid WebP framing")
  })
})

describe("closed documentation examples", () => {
  test("shows escaped prerequisites in docs and its text mirror without adding them to homepage cards", () => {
    const example = { ...fixture(), requirements: 'Bun, a browser & FFmpeg; review <source> and [runtime].' }
    const html = renderRegisteredExample(example.id, [example])
    expect(html).toContain('<summary>Requirements</summary><p>Requires: Bun, a browser &amp; FFmpeg; review &lt;source&gt; and [runtime].</p>')
    expect(exampleMarkdown(example)).toContain('Requires: Bun, a browser & FFmpeg; review \\<source\\> and \\[runtime\\].')
    expect(renderExampleMedia(exampleMediaRecord(example))).not.toContain('Requires:')
    expect(exampleMarkdown(example, false)).not.toContain('Requires:')
    const withDownload = { ...example, downloads: [{ ...example.poster, label: "Poster" }] }
    expect(renderRegisteredExample(withDownload.id, [withDownload])).toContain('<summary>Download this example</summary><p>Requires:')
    expect(renderRegisteredExample(withDownload.id, [withDownload])).toContain(' download>Poster</a>')
  })

  test("renders real media and mirrors useful links without enabling raw HTML", () => {
    const example = fixture()
    const body = "Before\n::example[diagram-example]\n\nAfter <script>alert(1)</script>"
    const html = renderDocsMarkdown(body, [example])
    expect(html).toContain('data-example-id="diagram-example"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(examplesInMarkdown(body, [example])).toContain(exampleMarkdown(example))
    expect(examplesInMarkdown(body, [example])).not.toContain("::example[")
  })

  test("rejects missing, malformed and duplicate publication IDs", () => {
    const examples = [fixture()]
    for (const body of ["::example[missing]", "::example[https://invalid.test]", "::example[diagram-example]\n::example[diagram-example]"]) {
      expect(() => renderDocsMarkdown(body, examples)).toThrow()
      expect(() => examplesInMarkdown(body, examples)).toThrow()
    }
  })

  test("preserves shortcode syntax when teaching it inside a code fence", () => {
    const body = "```md\n::example[missing]\n```"
    expect(renderDocsMarkdown(body)).toContain("::example[missing]")
    expect(examplesInMarkdown(body)).toBe(body)
  })

  test("keeps nested-looking fence lines literal in both projections", () => {
    const literal = "```text\n```typescript\n::example[missing]\n::example[diagram-example]\n```"
    const body = `${literal}\n\n::example[diagram-example]`
    const example = fixture()
    const html = renderDocsMarkdown(body, [example])
    expect(html).toContain("```typescript\n::example[missing]\n::example[diagram-example]")
    expect(html.match(/<figure\b/gu)).toHaveLength(1)
    expect(examplesInMarkdown(body, [example])).toBe(`${literal}\n\n${exampleMarkdown(example)}`)
    const unclosed = "```text\n```typescript\n::example[missing]"
    expect(() => renderDocsMarkdown(unclosed, [example])).toThrow("Unclosed documentation code fence")
    expect(() => examplesInMarkdown(unclosed, [example])).toThrow("Unclosed documentation code fence")
  })
})


test("source admission rejects drift after a reviewed render", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-example-source-")))
  try {
    const example = fixture()
    const source = "{\"name\":\"reviewed\"}\n"
    const path = "examples/showcase/diagram/flow.json"
    await mkdir(join(directory, "examples/showcase/diagram"), { recursive: true })
    await writeFile(join(directory, path), source)
    const record = { ...example, source: { ...example.source, files: [{ path, sha256: createHash("sha256").update(source).digest("hex") }] } }
    expect(await verifyExampleSources(directory, [record])).toBe(1)
    await writeFile(join(directory, path), source.replace("reviewed", "changed"))
    await expect(verifyExampleSources(directory, [record])).rejects.toThrow("Published example source changed")
    await expect(verifyExampleSources(directory, [record, example])).rejects.toThrow("Conflicting example source identity")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("static SVG downloads reject active links, namespace tricks and remote CSS", () => {
  function check(text: string): void {
    const bytes = Buffer.from(text)
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    validateExampleBytes({ file: `drawing-${sha256.slice(0, 12)}.svg`, sha256, bytes: bytes.length, mime: "image/svg+xml" }, bytes)
  }
  const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`
  expect(() => check(wrap('<defs><style>@font-face{font-family:Example;src:url("data:font/woff2;base64,AA==")}</style></defs><path d="M0 0L1 1"/><text>A &amp; B</text>'))).not.toThrow()
  expect(() => check(wrap('<style>.shape{font-family:"Font (Name)";fill:url("#paint");transform:translate(1,2) rotate(3)}</style><defs><linearGradient id="paint"><stop offset="0"/></linearGradient></defs><path class="shape"/>'))).not.toThrow()
  for (const body of [
    '<a href="javascript:alert(1)"><text>Open</text></a>',
    '<use data-marker=">" href="https://example.test/shape.svg#shape"/>',
    '<path data-marker=">" style="fill:url(https://example.test/paint.svg#paint)" d="M0 0L1 1"/>',
    '<use href="java&#x73;cript:alert(1)"/>',
    '<style>@import url(https://example.test/font.css);</style>',
    '<style>.shape{fill:url(https://example.test/paint.svg)}</style>',
    '<style>.shape{fill:u\\72l(https://example.test/paint.svg)}</style>',
    '<style>.shape{fill:u/**/rl(https://example.test/paint.svg)}</style>',
    '<g style="fill: url(//example.test/paint.svg)"/>',
    '<g fill="u\\72l(https://example.test/paint.svg)"/>',
    '<style>.shape{background:image-set("https://example.test/image.png" 1x)}</style>',
    '<path style="fill:url(https://example.test/paint.svg#paint"/>',
    '<path fill="url(https://example.test/paint.svg#paint"/>',
    '<path style=\'fill:url("https://example.test/paint.svg#paint"\'/>',
    '<style>@font-face{font-family:Example;src:url(https://example.test/font.woff2</style>',
    '<style>.shape{fill:url(#paint)</style>',
    '<path style="fill:url(#paint"/>',
    '<path style="fill:rgb(0,0,0"/>',
    '<path style="transform:translate(1,2]}"/>',
    '<path style="fill:url(#paint))"/>',
    '<path style=\'font-family:"Unclosed\'/>',
    '<use href="data:image/svg+xml;base64,PHN2Zy8+"/>',
    '<set attributeName="href" to="javascript:alert(1)"/>',
    '<x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script>',
  ]) expect(() => check(wrap(body))).toThrow("active or remote SVG")
  expect(() => check('<svg xmlns="http://www.w3.org/2000/svg" xmlns:é="http://www.w3.org/2000/svg"><é:script>/* inert probe */</é:script></svg>')).toThrow("active or remote SVG")
  expect(() => check('<!DOCTYPE svg [<!ENTITY x SYSTEM "https://example.test">]>' + wrap('<text>&x;</text>'))).toThrow("active or remote SVG")
  for (const separator of ["\u2028", "\u2029"]) {
    expect(() => check(wrap(`<style>path{fill:url("https://example.invalid/paint${separator}.svg#paint")}</style><path/>`))).toThrow("active or remote SVG")
  }
})


test("canonical guides require rendered figures and rendered anchors", async () => {
  const example = { id: "editorial", guideAnchor: "render-the-title" }
  expect(() => assertVisibleExampleGuide("## Render the title\n\n::example[editorial]", example)).not.toThrow()
  expect(() => assertVisibleExampleGuide("## Render the title\n\n```md\n::example[editorial]\n```", example)).toThrow("not visibly embedded")
  expect(() => assertVisibleExampleGuide("```md\n## Render the title\n```\n\n::example[editorial]", example)).toThrow("anchor does not resolve")
  expect((await readExampleAssets(new URL("..", import.meta.url).pathname)).length).toBeGreaterThan(0)
})

import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { exampleAssetPrefix, workflowExampleAssets, workflowExamples, type ExampleAsset } from "../src/example-registry"
import { docsPageForSlug, resolveDocsContent } from "../src/docs-registry"
import { renderDocsMarkdown } from "../src/docs-markdown"
import { readPreviewFile } from "./preview-file"

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Example publication refused: ${message}`)
}

/** Finite static-export profile, not a sanitizer for arbitrary SVG uploads. */
function assertStaticSvg(text: string, file: string): void {
  const message = `${file} contains active or remote SVG content`
  // This deliberately narrow export grammar rejects declarations, namespaces,
  // comments and CDATA rather than attempting to sanitize general XML.
  assert(!/<[!?]/u.test(text), message)
  const staticTags = new Set(["svg", "defs", "g", "marker", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "style", "text", "title", "desc", "tspan", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "use"])
  const stack: string[] = []
  let cursor = 0, roots = 0
  for (const token of text.matchAll(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/gu)) {
    const between = text.slice(cursor, token.index)
    assert(!between.includes("<") && (stack.length > 0 || between.trim() === ""), message)
    if (stack.at(-1) === "style") assertStaticCss(between, message)
    cursor = token.index + token[0].length
    const body = token[0].slice(1, -1)
    if (body.startsWith("/")) {
      const closing = /^\/([A-Za-z][A-Za-z0-9]*)\s*$/u.exec(body)
      assert(closing && stack.pop() === closing[1], message)
      continue
    }
    const opening = /^([A-Za-z][A-Za-z0-9]*)(?=\s|\/|$)/u.exec(body)
    assert(opening && staticTags.has(opening[1]!), message)
    const name = opening[1]!
    if (stack.length === 0) { roots++; assert(roots === 1 && name === "svg", message) }
    // Require complete lexical consumption, including unsupported Unicode or
    // namespace names. A quoted '>' never ends an attribute prematurely.
    let remainder = body.slice(opening[0].length)
    const names = new Set<string>()
    while (!/^\s*\/?$/u.test(remainder)) {
      const attribute = /^\s+([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/u.exec(remainder)
      assert(attribute, message)
      remainder = remainder.slice(attribute[0].length)
      const key = attribute[1]!, value = attribute[2] ?? attribute[3]!
      assert(!names.has(key) && !/^on/iu.test(key) && !/\\|&#/u.test(value), message)
      names.add(key)
      if (key === "xmlns") { assert(value === "http://www.w3.org/2000/svg", message); continue }
      if (key === "href" || key === "src") assert(/^#[A-Za-z_][\w.-]*$/u.test(value), message)
      if (key === "style" || /url\s*\(/iu.test(value)) assertStaticCss(value, message)
    }
    if (!remainder.trim().endsWith("/")) stack.push(name)
  }
  assert(roots === 1 && stack.length === 0 && text.slice(cursor).trim() === "", message)
}

function assertStaticCss(css: string, message: string): void {
  if (/[\u2028\u2029]/u.test(css)) throw new Error(message)
  assert(!/\\|\/\*|&|@(?!font-face\b)|expression\s*\(/iu.test(css), message)
  const functions = new Set(["url", "format", "rgb", "rgba", "hsl", "hsla", "matrix", "translate", "rotate", "scale"])
  const stack: { close: string; start: number; name?: string }[] = []
  let quote: string | undefined
  // CSS repairs unterminated URL/function tokens at EOF. This export profile
  // must reject that recovery, and validate every complete URL token itself.
  for (let index = 0; index < css.length; index++) {
    const character = css[index]!
    if (quote !== undefined) {
      assert(!/[\n\r\f]/u.test(character), message)
      if (character === quote) quote = undefined
      continue
    }
    if (character === '"' || character === "'") { quote = character; continue }
    if (character === "(") {
      let end = index
      while (end > 0 && /\s/u.test(css[end - 1]!)) end--
      let start = end
      while (start > 0 && /[a-z-]/iu.test(css[start - 1]!)) start--
      const name = css.slice(start, end).toLowerCase()
      assert(functions.has(name) && (start === 0 || !/[\w\u0080-\uffff-]/u.test(css[start - 1]!)), message)
      stack.push({ close: ")", start: index + 1, name })
    } else if (character === "{" || character === "[") {
      stack.push({ close: character === "{" ? "}" : "]", start: index + 1 })
    } else if (character === ")" || character === "}" || character === "]") {
      const opened = stack.pop()
      assert(opened?.close === character, message)
      if (opened.name === "url") {
        let url = css.slice(opened.start, index).trim()
        if (url.startsWith('"') || url.startsWith("'")) {
          assert(url.length >= 2 && url.at(-1) === url[0], message)
          url = url.slice(1, -1)
        }
        assert(/^#[A-Za-z_][\w.-]*$/u.test(url) || /^data:font\/woff2;base64,[A-Za-z0-9+/]+=*$/u.test(url), message)
      }
    }
  }
  assert(quote === undefined && stack.length === 0, message)
}

/** Reviewed raster export chunks only. Blender can attach private native paths
 * and render details to an otherwise valid PNG; hashes alone do not remove them.
 * The current exports use explicit sRGB/gamma/chromaticity chunks. Opaque ICC
 * profiles need separate byte-level review before this profile can allow them. */
function assertPublicRaster(buffer: Buffer, mime: "image/png" | "image/webp", file: string): void {
  const png = mime === "image/png"
  const allowed = new Set(png
    ? ["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "sRGB", "sBIT", "bKGD", "pHYs", "oFFs"]
    : ["VP8 ", "VP8L", "VP8X", "ALPH"])
  if (png) {
    assert(buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${file} is not PNG`)
  } else {
    assert(buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP", `${file} is not WebP`)
    assert(buffer.length >= 12 && buffer.readUInt32LE(4) + 8 === buffer.length, `${file} has invalid WebP framing`)
  }
  let cursor = png ? 8 : 12, chunks = 0, pixels = 0, ended = false
  while (cursor < buffer.length) {
    const overhead = png ? 12 : 8
    assert(buffer.length - cursor >= overhead && ++chunks <= 4096 && !ended, `${file} has invalid raster framing`)
    const length = png ? buffer.readUInt32BE(cursor) : buffer.readUInt32LE(cursor + 4)
    const kind = buffer.toString("latin1", cursor + (png ? 4 : 0), cursor + (png ? 8 : 4))
    const size = overhead + length + (png ? 0 : length % 2)
    assert(size <= buffer.length - cursor, `${file} has a truncated raster chunk`)
    assert(allowed.has(kind), `${file} contains unreviewed raster metadata or animation (${kind})`)
    if (png) {
      assert(chunks === 1 ? kind === "IHDR" && length === 13 : kind !== "IHDR", `${file} has invalid PNG header order`)
      if (kind === "IEND") { assert(length === 0, `${file} has invalid PNG end`); ended = true }
      if (kind === "IDAT") pixels++
    } else {
      if (kind === "VP8 " || kind === "VP8L") pixels++
      if (kind === "VP8X") {
        assert(chunks === 1 && length === 10, `${file} has invalid WebP extended header`)
        assert((buffer[cursor + 8]! & ~0x10) === 0, `${file} declares metadata, animation or reserved WebP flags`)
      }
      if (length % 2) assert(buffer[cursor + size - 1] === 0, `${file} has invalid WebP padding`)
    }
    cursor += size
  }
  assert(png ? ended && pixels > 0 : pixels === 1, `${file} has no complete static raster`)
}

export function validateExampleBytes(asset: ExampleAsset, bytes: Uint8Array): void {
  assert(bytes.byteLength === asset.bytes, `${asset.file} byte length differs`)
  assert(createHash("sha256").update(bytes).digest("hex") === asset.sha256, `${asset.file} SHA-256 differs`)
  const buffer = Buffer.from(bytes)
  if (asset.mime === "video/mp4") {
    assert(buffer.length > 24 && buffer.toString("ascii", 4, 8) === "ftyp", `${asset.file} is not an MP4 container`)
  } else if (asset.mime === "image/webp" || asset.mime === "image/png") {
    assertPublicRaster(buffer, asset.mime, asset.file)
  } else {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    if (asset.mime === "text/vtt") assert(text.startsWith("WEBVTT\n"), `${asset.file} is not WebVTT`)
    if (asset.mime === "application/json") JSON.parse(text)
    if (asset.mime === "image/svg+xml") {
      assertStaticSvg(text, asset.file)
    }
  }
}

export function assertVisibleExampleGuide(guide: string, example: { id: string; guideAnchor: string }): void {
  const html = renderDocsMarkdown(resolveDocsContent(guide))
  const figures = [...html.matchAll(/<figure\b[^>]*\bdata-example-id="([a-z0-9-]+)"/gu)]
  assert(figures.filter(match => match[1] === example.id).length === 1, `${example.id} is not visibly embedded in its canonical guide`)
  if (example.guideAnchor) {
    const headings = [...html.matchAll(/<h[23]\b[^>]*\bid="([a-z0-9-]+)"/gu)]
    assert(headings.some(match => match[1] === example.guideAnchor), `${example.id} guide anchor does not resolve`)
  }
}

/** Read only the reviewed derivative inventory. Native masters, job state and
 * unregistered files cannot accidentally become public through a directory copy. */
export async function readExampleAssets(appDirectory: string): Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]> {
  const directory = join(appDirectory, "media")
  const expected = workflowExampleAssets(workflowExamples)
  const listed = (await readdir(directory)).filter(file => file !== "examples.json").sort()
  assert(JSON.stringify(listed) === JSON.stringify(expected.map(file => file.file).sort()), "media directory contains missing or unregistered files")
  for (const example of workflowExamples) {
    assert(docsPageForSlug(example.guideSlug), `${example.id} has no canonical guide`)
    const guideBytes = await readPreviewFile(join(appDirectory, "src/docs", `${example.guideSlug}.md`), 64 * 1024)
    const guide = new TextDecoder("utf-8", { fatal: true }).decode(guideBytes)
    assertVisibleExampleGuide(guide, example)
  }
  return Promise.all(expected.map(async asset => {
    const path = join(directory, asset.file)
    const bytes = await readPreviewFile(path, asset.bytes)
    validateExampleBytes(asset, bytes)
    return { path: `${exampleAssetPrefix.slice(1)}${asset.file}`, bytes }
  }))
}

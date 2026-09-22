/** A closed adapter for the path-only SVG produced by the pinned resvg renderer. */
interface SvgNode { readonly tag: string; readonly attrs: Readonly<Record<string, string>>; readonly children: SvgNode[] }

function fail(message: string): never { throw new Error(`Unsupported drawing SVG: ${message}`) }
const maximumSvgBytes = 2 * 1024 * 1024

function attributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  let rest = value
  while (rest.trim().length > 0) {
    const match = /^\s+([A-Za-z][A-Za-z0-9:-]*)="([^"<>]*)"/u.exec(rest)
    if (match === null) fail("malformed attribute")
    const name = match[1]!
    if (Object.hasOwn(attrs, name)) fail("duplicate attribute")
    attrs[name] = match[2]!
    rest = rest.slice(match[0].length)
  }
  return attrs
}

function parseSvg(svg: string): SvgNode {
  if (Buffer.byteLength(svg) > maximumSvgBytes) fail("sheet exceeds byte limit")
  const roots: SvgNode[] = []
  const stack: SvgNode[] = []
  let cursor = 0
  let count = 0
  for (const token of svg.matchAll(/<[^>]*>/gu)) {
    if (svg.slice(cursor, token.index).trim() !== "") fail("text outside a path")
    cursor = token.index + token[0].length
    const raw = token[0]
    const closing = /^<\/([A-Za-z]+)>$/u.exec(raw)
    if (closing !== null) {
      if (stack.pop()?.tag !== closing[1]) fail("unbalanced tags")
      continue
    }
    const match = /^<([A-Za-z]+)([\s\S]*?)(\/?)>$/u.exec(raw)
    if (match === null) fail("unsupported markup")
    const tag = match[1]!
    if (!["svg", "defs", "clipPath", "g", "path"].includes(tag)) fail(`element ${tag}`)
    if (++count > 50_000 || stack.length > 32) fail("tree limit exceeded")
    const node: SvgNode = { tag, attrs: attributes(match[2]!), children: [] }
    const parent = stack.at(-1)
    if (parent === undefined) roots.push(node)
    else parent.children.push(node)
    if (match[3] !== "/") stack.push(node)
  }
  if (svg.slice(cursor).trim() !== "" || stack.length !== 0 || roots.length !== 1 || roots[0]?.tag !== "svg") fail("invalid document")
  return roots[0]!
}

function only(node: SvgNode, allowed: readonly string[]): void {
  for (const key of Object.keys(node.attrs)) if (!allowed.includes(key)) fail(`${node.tag}.${key}`)
}

function number(value: string): number {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value)) fail("invalid number")
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 10_000_000) fail("number outside bounds")
  return parsed
}

const decimal = (value: number): string => Number(value.toFixed(6)).toString()

function pathCommands(data: string): string {
  const tokens = data.match(/[MLCQZ]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/gu) ?? []
  if (data.replace(/[MLCQZ]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[\s,]/gu, "") !== "") fail("path command")
  if (tokens.length > 500_000) fail("path limit")
  const result: string[] = []
  let cursor = 0
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  const take = (): number => {
    const token = tokens[cursor++]
    if (token === undefined) fail("truncated path")
    return number(token)
  }
  while (cursor < tokens.length) {
    const command = tokens[cursor++]!
    if (command === "M" || command === "L") {
      x = take(); y = take()
      if (command === "M") { startX = x; startY = y }
      result.push(`${decimal(x)} ${decimal(y)} ${command === "M" ? "m" : "l"}`)
    } else if (command === "C") {
      const values = [take(), take(), take(), take(), take(), take()]
      x = values[4]!; y = values[5]!
      result.push(`${values.map(decimal).join(" ")} c`)
    } else if (command === "Q") {
      const qx = take(); const qy = take(); const nextX = take(); const nextY = take()
      result.push(`${[x + 2 * (qx - x) / 3, y + 2 * (qy - y) / 3, nextX + 2 * (qx - nextX) / 3, nextY + 2 * (qy - nextY) / 3, nextX, nextY].map(decimal).join(" ")} c`)
      x = nextX; y = nextY
    } else if (command === "Z") {
      result.push("h"); x = startX; y = startY
    } else fail("non-absolute path command")
  }
  return result.join("\n")
}

function color(value: string | undefined): "0" | "1" | undefined {
  if (value === "none") return undefined
  if (value === undefined || value === "#000000") return "0"
  if (value === "#ffffff") return "1"
  return fail("non-monochrome paint")
}

function svgStream(svg: string, width: number, height: number): string {
  const root = parseSvg(svg)
  only(root, ["width", "height", "viewBox", "xmlns"])
  if (number((root.attrs.width ?? "").replace(/pt$/u, "")) !== width || number((root.attrs.height ?? "").replace(/pt$/u, "")) !== height || root.attrs.viewBox !== `0 0 ${width} ${height}` || root.attrs.xmlns !== "http://www.w3.org/2000/svg") fail("page geometry")
  const clips = new Map<string, SvgNode>()
  for (const defs of root.children.filter(node => node.tag === "defs")) {
    only(defs, [])
    for (const clip of defs.children) {
      only(clip, ["id"])
      if (clip.tag !== "clipPath" || clip.attrs.id === undefined || clips.has(clip.attrs.id) || clip.children.some(child => child.tag !== "path")) fail("clip definition")
      clips.set(clip.attrs.id, clip)
    }
  }
  const output: string[] = [`q\n1 0 0 -1 0 ${decimal(height)} cm`]
  const emit = (node: SvgNode): void => {
    if (node.tag === "defs") return
    if (node.tag === "g") {
      only(node, ["transform", "clip-path"])
      output.push("q")
      if (node.attrs.transform !== undefined) {
        const match = /^matrix\(([^)]+)\)$/u.exec(node.attrs.transform)
        if (match === null) fail("transform")
        const values = match[1]!.trim().split(/[\s,]+/u).map(number)
        if (values.length !== 6) fail("matrix")
        output.push(`${values.map(decimal).join(" ")} cm`)
      }
      if (node.attrs["clip-path"] !== undefined) {
        const id = /^url\(#([A-Za-z0-9_-]+)\)$/u.exec(node.attrs["clip-path"])?.[1]
        const clip = id === undefined ? undefined : clips.get(id)
        if (clip === undefined) fail("missing clip")
        for (const path of clip.children) {
          only(path, ["d", "fill", "stroke", "fill-rule", "clip-rule"])
          if (path.children.length > 0) fail("path children")
          output.push(pathCommands(path.attrs.d ?? ""))
        }
        const rules = new Set(clip.children.map(path => path.attrs["clip-rule"] ?? path.attrs["fill-rule"] ?? "nonzero"))
        if (rules.size !== 1 || !["nonzero", "evenodd"].includes([...rules][0]!)) fail("clip rule")
        output.push(rules.has("evenodd") ? "W* n" : "W n")
      }
      node.children.forEach(emit)
      output.push("Q")
      return
    }
    if (node.tag !== "path") fail("nested non-path element")
    only(node, ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "fill-rule", "paint-order"])
    if (node.children.length > 0) fail("path children")
    const fill = color(node.attrs.fill)
    const stroke = color(node.attrs.stroke ?? "none")
    const cap = ["butt", "round", "square"].indexOf(node.attrs["stroke-linecap"] ?? "butt")
    const join = ["miter", "round", "bevel"].indexOf(node.attrs["stroke-linejoin"] ?? "miter")
    const strokeWidth = number(node.attrs["stroke-width"] ?? "1")
    const miter = number(node.attrs["stroke-miterlimit"] ?? "4")
    if (cap < 0 || join < 0 || strokeWidth <= 0 || miter < 1) fail("stroke style")
    const rule = node.attrs["fill-rule"] ?? "nonzero"
    if (rule !== "nonzero" && rule !== "evenodd") fail("fill rule")
    const paintOrder = node.attrs["paint-order"] ?? "normal"
    if (!["normal", "stroke", "stroke fill", "fill stroke", "stroke fill markers", "fill stroke markers"].includes(paintOrder)) fail("paint order")
    output.push("q", `${strokeWidth} w`, `${cap} J`, `${join} j`, `${miter} M`)
    if (fill !== undefined) output.push(`${fill} g`)
    if (stroke !== undefined) output.push(`${stroke} G`)
    const path = pathCommands(node.attrs.d ?? "")
    const fillOperator = rule === "evenodd" ? "f*" : "f"
    if (paintOrder.startsWith("stroke") && stroke !== undefined && fill !== undefined) output.push(path, "S", path, fillOperator)
    else output.push(path, fill === undefined ? (stroke === undefined ? "n" : "S") : stroke === undefined ? fillOperator : rule === "evenodd" ? "B*" : "B")
    output.push("Q")
  }
  root.children.forEach(emit)
  output.push("Q")
  return output.join("\n")
}

const pdfString = (value: string): string => `<FEFF${Buffer.from(value, "utf16le").swap16().toString("hex")}>`

export function drawingSheetsPdf(
  sheets: readonly { readonly svg: string; readonly width: number; readonly height: number }[],
  metadata: { readonly title: string; readonly sourceSha256: string; readonly rendererVersion: string },
): Uint8Array {
  if (sheets.length < 1 || sheets.length > 20 || !/^[a-f0-9]{64}$/u.test(metadata.sourceSha256)) throw new Error("Invalid drawing PDF input")
  const objects: string[] = ["", ""]
  const pages: number[] = []
  for (const sheet of sheets) {
    const stream = svgStream(sheet.svg, sheet.width, sheet.height)
    const streamId = objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
    pages.push(objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${decimal(sheet.width)} ${decimal(sheet.height)}] /Resources << >> /Contents ${streamId} 0 R >>`))
  }
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(id => `${id} 0 R`).join(" ")}] >>`
  const infoId = objects.push(`<< /Title ${pdfString(metadata.title)} /Producer ${pdfString(`Slopcamera ${metadata.rendererVersion}`)} /Subject ${pdfString(`source-sha256:${metadata.sourceSha256}; profile:patent-line-art-v1`)} >>`)
  const chunks: string[] = ["%PDF-1.7\n%Slopcamera vector drawings\n"]
  const offsets = [0]
  let offset = Buffer.byteLength(chunks[0]!)
  for (const [index, object] of objects.entries()) {
    offsets.push(offset)
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`
    chunks.push(chunk); offset += Buffer.byteLength(chunk)
  }
  // Each cross-reference entry is exactly 20 bytes, including its line ending.
  const freeEntry = "0000000000 65535 f".padEnd(19, " ") + "\n"
  const usedEntries = offsets.slice(1).map(value => `${String(value).padStart(10, "0")} 00000 n`.padEnd(19, " ") + "\n").join("")
  chunks.push(`xref\n0 ${objects.length + 1}\n${freeEntry}${usedEntries}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${offset}\n%%EOF\n`)
  const bytes = Buffer.from(chunks.join(""))
  if (bytes.length > 32 * 1024 * 1024) throw new Error("Drawing PDF exceeds output byte limit")
  return bytes
}

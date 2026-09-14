// Bounded Markdown subset for authored Slopcamera documentation pages. The
// renderer escapes all source HTML, permits only reviewed link schemes, and
// emits {{DOCS_*_CLASS}} placeholders on every element; the sealed graph fills
// them from its closed recipe inventory, so this module stays import-safe
// outside the compiler.
export const docsMarkdownMaxBytes = 64 * 1024

const tokenPattern = /\{\{[A-Z_]+\}\}/u

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character)
}

export function docsSlugify(value: string): string {
  const slug = value.toLowerCase().replace(/`/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "")
  if (slug === "") throw new Error("Documentation heading produced an empty anchor")
  return slug
}

function isSafeLinkTarget(href: string): boolean {
  return href.startsWith("/") || href.startsWith("#") || href.startsWith("https://")
}

function renderInline(source: string): string {
  // Tokenize code spans first so emphasis and links cannot see inside them.
  const spans: string[] = []
  const withoutCode = source.replace(/`([^`\n]+)`/gu, (_match, code: string) => {
    spans.push(`<code class="{{DOCS_CODE_CLASS}}">${escapeHtml(code)}</code>`)
    return "\u0000" + `${spans.length - 1}` + "\u0001"
  })
  const escaped = escapeHtml(withoutCode)
  const linked = escaped.replace(/\[([^\][]*)\]\(([^()\s]+)\)/gu, (_match, text: string, href: string) => {
    const decoded = href.replace(/&amp;/gu, "&")
    if (!isSafeLinkTarget(decoded) || tokenPattern.test(decoded)) {
      throw new Error(`Unsafe documentation link target: ${decoded}`)
    }
    return `<a class="{{DOCS_LINK_CLASS}}" href="${escapeHtml(decoded)}">${text}</a>`
  })
  const emphasized = linked
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/gu, "$1<em>$2</em>")
  return emphasized.replace(/\u0000(\d+)\u0001/gu, (_match, index: string) => {
    const span = spans[Number(index)]
    if (span === undefined) throw new Error("Documentation inline renderer lost a code span")
    return span
  })
}

function isTableDivider(line: string): boolean {
  return /^\|(?:\s*:?-+:?\s*\|)+\s*$/u.test(line)
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed
  const body = inner.endsWith("|") ? inner.slice(0, -1) : inner
  return body.split("|").map(cell => cell.trim())
}

/** Render one authored Markdown body to sealed-ready HTML. */
export function renderDocsMarkdown(source: string): string {
  if (Buffer.byteLength(source, "utf8") > docsMarkdownMaxBytes) {
    throw new Error("Documentation source exceeds its byte bound")
  }
  const lines = source.replace(/\r\n/gu, "\n").split("\n")
  const html: string[] = []
  const usedIds = new Set<string>()
  let index = 0

  const headingId = (text: string): string => {
    const base = docsSlugify(text)
    let id = base
    let suffix = 2
    while (usedIds.has(id)) id = `${base}-${suffix++}`
    usedIds.add(id)
    return id
  }

  while (index < lines.length) {
    const line = lines[index]!
    if (line.trim() === "") {
      index += 1
      continue
    }

    const fence = /^```([^`]*)$/u.exec(line.trim())
    if (fence !== null) {
      const language = fence[1]!.trim()
      const body: string[] = []
      index += 1
      while (index < lines.length && lines[index]!.trim() !== "```") {
        body.push(lines[index]!)
        index += 1
      }
      if (index >= lines.length) throw new Error("Unclosed documentation code fence")
      index += 1
      const languageClass = language === "" ? "" : ` data-language="${escapeHtml(language)}"`
      html.push(`<pre class="{{DOCS_PRE_CLASS}}"${languageClass}><code class="{{DOCS_PRE_CODE_CLASS}}">${escapeHtml(body.join("\n"))}\n</code></pre>`)
      continue
    }

    const heading = /^(#{2,3})\s+(.+)$/u.exec(line)
    if (heading !== null) {
      const level = heading[1]!.length
      const text = heading[2]!.trim()
      const id = headingId(text)
      const tag = level === 2 ? "h2" : "h3"
      html.push(`<${tag} class="${level === 2 ? "{{DOCS_H2_CLASS}}" : "{{DOCS_H3_CLASS}}"}" id="${id}"><a class="{{DOCS_ANCHOR_CLASS}}" href="#${id}">${renderInline(text)}</a></${tag}>`)
      index += 1
      continue
    }

    if (/^---+\s*$/u.test(line)) {
      html.push(`<hr class="{{DOCS_HR_CLASS}}">`)
      index += 1
      continue
    }

    if (line.startsWith(">")) {
      const quote: string[] = []
      while (index < lines.length && lines[index]!.startsWith(">")) {
        quote.push(lines[index]!.replace(/^>\s?/u, ""))
        index += 1
      }
      const inner = quote.join("\n").trim()
      html.push(`<blockquote class="{{DOCS_BLOCKQUOTE_CLASS}}"><p class="{{DOCS_P_CLASS}}">${renderInline(inner)}</p></blockquote>`)
      continue
    }

    if (line.trimStart().startsWith("|") && index + 1 < lines.length && isTableDivider(lines[index + 1]!)) {
      const headers = splitTableRow(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index]!.trimStart().startsWith("|") && lines[index]!.trim() !== "") {
        rows.push(splitTableRow(lines[index]!))
        index += 1
      }
      const head = headers.map(cell => `<th class="{{DOCS_TH_CLASS}}" scope="col">${renderInline(cell)}</th>`).join("")
      const body = rows.map(row => `<tr>${row.map(cell => `<td class="{{DOCS_TD_CLASS}}">${renderInline(cell)}</td>`).join("")}</tr>`).join("")
      html.push(`<div class="{{DOCS_TABLE_WRAP_CLASS}}"><table class="{{DOCS_TABLE_CLASS}}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`)
      continue
    }

    const listMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/u.exec(line)
    if (listMatch !== null) {
      const ordered = /^\d+\.$/u.test(listMatch[2]!)
      const tag = ordered ? "ol" : "ul"
      const items: string[] = []
      while (index < lines.length) {
        const item = /^(\s*)([-*]|\d+\.)\s+(.+)$/u.exec(lines[index]!)
        if (item === null) break
        if (item[1]!.length > 0) throw new Error("Documentation lists do not support nested items")
        if (/^\d+\.$/u.test(item[2]!) !== ordered) break
        items.push(`<li class="{{DOCS_LIST_ITEM_CLASS}}">${renderInline(item[3]!.trim())}</li>`)
        index += 1
      }
      html.push(`<${tag} class="{{DOCS_LIST_CLASS}}">${items.join("")}</${tag}>`)
      continue
    }

    if (/^#{1}\s/u.test(line) || /^#{4,}\s/u.test(line)) {
      throw new Error("Documentation bodies use only h2 and h3 headings")
    }
    if (tokenPattern.test(line)) {
      throw new Error(`Unresolved documentation token in line: ${line.slice(0, 80)}`)
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index]!.trim() !== ""
      && !/^(#{1,}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\s*\|)/u.test(lines[index]!)
      && !/^---+\s*$/u.test(lines[index]!)) {
      paragraph.push(lines[index]!.trim())
      index += 1
    }
    html.push(`<p class="{{DOCS_P_CLASS}}">${renderInline(paragraph.join(" "))}</p>`)
  }

  return html.join("\n")
}

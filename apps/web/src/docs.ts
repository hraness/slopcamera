import { productName } from "./messaging"
import { renderDocsMarkdown } from "./docs-markdown"
import { exampleUrl, workflowExamples } from "./example-registry"
import {
  docsCanonicalUrl, docsOrigin, docsPageForSlug, docsSectionLabels, docsSectionOrder,
  docPages, resolveDocsContent, type DocsPage,
} from "./docs-registry"
// Sealed-graph helpers for the /docs document family. Emitted markup carries
// {{DOCS_*_CLASS}} placeholders filled inside the sealed renderer, so this
// module stays import-safe for the build entrypoint and middleware.

export * from "./docs-registry"

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character)
}

/** Section-grouped documentation navigation for the shared docs shell. */
export function renderDocsNav(current: DocsPage): string {
  const items: string[] = [
    `<a class="{{DOCS_NAV_HOME_CLASS}}" href="/docs"${current.slug === "index" ? ' aria-current="page"' : ""}>Documentation</a>`,
  ]
  for (const section of docsSectionOrder) {
    const links = docPages.filter(page => page.section === section).map(page => {
      const isCurrent = page.slug === current.slug
      const className = isCurrent ? "{{DOCS_NAV_LINK_CURRENT_CLASS}}" : "{{DOCS_NAV_LINK_CLASS}}"
      const aria = isCurrent ? ' aria-current="page"' : ""
      return `<li><a class="${className}"${aria} href="/docs/${page.slug}">${escapeHtml(page.title)}</a></li>`
    })
    items.push(
      `<div class="{{DOCS_NAV_SECTION_CLASS}}"><p class="{{DOCS_NAV_SECTION_LABEL_CLASS}}">${docsSectionLabels[section]}</p>`,
      `<ul class="{{DOCS_NAV_LIST_CLASS}}">${links.join("")}</ul></div>`,
    )
  }
  const links = items.join("\n")
  const section = current.section === "index" ? "Documentation" : docsSectionLabels[current.section]
  const context = current.section === "index" ? current.title : `${section} · ${current.title}`
  return `<details class="{{DOCS_MOBILE_NAV_CLASS}}" data-docs-menu>
<summary class="{{DOCS_NAV_SUMMARY_CLASS}}"><span>Browse documentation</span><span class="{{DOCS_NAV_CONTEXT_CLASS}}">${escapeHtml(context)}</span></summary>
<nav aria-label="Documentation menu" class="{{DOCS_MOBILE_LINKS_CLASS}}" data-docs-navigation="mobile">${links}</nav>
</details>
<nav aria-label="Documentation" class="{{DOCS_NAV_CLASS}}" data-docs-navigation="desktop">${links}</nav>`
}

/** Reads the visible "## FAQ" section of an explanation page as question and answer pairs. */
export function docsFaqEntries(body: string): { question: string; answer: string }[] {
  const section = /^## FAQ\n([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(resolveDocsContent(body))?.[1]
  if (section === undefined) return []
  const plain = (text: string) => text
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[`*_]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
  return section.split(/^### /mu).slice(1).map(block => {
    const [question = "", ...rest] = block.split("\n")
    return { question: plain(question), answer: plain(rest.join("\n")) }
  }).filter(entry => entry.question !== "" && entry.answer !== "")
}

/** Per-page JSON-LD: a TechArticle bound to its breadcrumb and site graph, plus a FAQPage
 * when an explanation page shows a visible FAQ section. */
export function docsJsonLd(page: DocsPage, body = ""): string {
  const canonical = docsCanonicalUrl(page)
  const media = workflowExamples.filter(example => example.guideSlug === page.slug)
  const graph: Record<string, unknown>[] = [
    { "@id": "https://hraness.com/#organization", "@type": "Organization", name: "Hraness", url: "https://hraness.com/" },
    { "@id": `${docsOrigin}/#website`, "@type": "WebSite", name: productName, publisher: { "@id": "https://hraness.com/#organization" }, url: `${docsOrigin}/` },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: productName, item: `${docsOrigin}/` },
        { "@type": "ListItem", position: 2, name: "Documentation", item: `${docsOrigin}/docs` },
        ...(page.slug === "index" ? [] : [{ "@type": "ListItem", position: 3, name: page.title, item: canonical }]),
      ],
    },
    {
      "@type": "TechArticle",
      headline: page.title,
      description: page.description,
      inLanguage: "en",
      isPartOf: { "@id": `${docsOrigin}/#website` },
      mainEntityOfPage: canonical,
      publisher: { "@id": "https://hraness.com/#organization" },
      url: canonical,
      ...(page.modified === undefined ? {} : { datePublished: page.modified, dateModified: page.modified }),
      ...(media.length ? { image: media.map(example => ({
        "@type": "ImageObject", contentUrl: `${docsOrigin}${exampleUrl(example.poster)}`,
        caption: example.poster.alt, width: example.poster.width, height: example.poster.height,
      })) } : {}),
    },
  ]
  const faq = page.section === "explanation" ? docsFaqEntries(body) : []
  if (faq.length > 0) graph.push({
    "@id": `${canonical}#faq`,
    "@type": "FAQPage",
    mainEntity: faq.map(entry => ({ "@type": "Question", name: entry.question, acceptedAnswer: { "@type": "Answer", text: entry.answer } })),
  })
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</gu, "\\u003c")
}

export function renderDocsBody(body: string): string {
  return renderDocsMarkdown(resolveDocsContent(body))
}

/** The header each docs template renders above its article body. */
export function renderDocsArticleHeader(page: DocsPage): string {
  const section = page.section === "index" ? "" : docsSectionLabels[page.section]
  const label = section === "" ? "" : `<p class="{{DOCS_SECTION_LABEL_CLASS}}">${escapeHtml(section)}</p>`
  return `${label}<h1 class="{{DOCS_HEADING_CLASS}}">${escapeHtml(page.title)}</h1>\n<p class="{{DOCS_LEDE_CLASS}}">${escapeHtml(page.description)}</p>`
}

export function docsPageForDocument(document: string): DocsPage | undefined {
  if (!/^docs\/.+\.html$/u.test(document)) return undefined
  return docsPageForSlug(document.slice("docs/".length, -".html".length))
}

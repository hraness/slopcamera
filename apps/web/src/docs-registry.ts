import * as core from "./docs-registry-core"
import type { DocsPage } from "./docs-registry-core"

export type { DocsPage, DocsSection } from "./docs-registry-core"

export const docsOrigin = core.docsOrigin
export const docsSectionLabels = core.docsSectionLabels
export const docsSectionOrder = core.docsSectionOrder

function currentBrandPage(page: DocsPage): DocsPage {
  return {
    ...page,
    title: page.title.replaceAll("SlopCamera", "Slopcamera"),
    description: page.description.replaceAll("SlopCamera", "Slopcamera"),
  }
}

export const docsIndexPage: DocsPage = currentBrandPage(core.docsIndexPage)

const oilPaintPage: DocsPage = {
  slug: "how-to/oil-paint",
  title: "Paint a deterministic oil study",
  description: "Knife named pigment tubes into piles, carry wet paint on bounded bristles, and replay a spectral oil study.",
  section: "how-to",
  modified: "2026-10-02",
}

export const docPages: readonly DocsPage[] = [
  ...core.docPages.map(currentBrandPage),
  oilPaintPage,
]
const pageBySlug = new Map(docPages.map(page => [page.slug, page]))

export function docsPageForSlug(slug: string): DocsPage | undefined { return pageBySlug.get(slug) }
export function docsDocumentForPage(page: DocsPage): string { return `docs/${page.slug}.html` }
export function docsCanonicalUrl(page: DocsPage): string { return page.slug === "index" ? `${docsOrigin}/docs` : `${docsOrigin}/docs/${page.slug}` }
export function docsMarkdownUrl(page: DocsPage): string { return `/docs/${page.slug}.md` }
export function docsPageForRequestPath(pathname: string): DocsPage | null {
  let path = pathname
  if (path.endsWith(".md")) path = path.slice(0, -3)
  if (path === "/docs" || path === "/docs/") return docsIndexPage
  if (!path.startsWith("/docs/")) return null
  return pageBySlug.get(path.slice("/docs/".length).replace(/\/+$/u, "")) ?? null
}

export function resolveDocsContent(markdown: string): string {
  return core.resolveDocsContent(markdown)
}

export function docsPageMarkdown(page: DocsPage, body: string): string {
  return core.docsPageMarkdown(page, body)
}

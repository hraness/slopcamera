import * as core from "./docs-registry-core"
import type { DocsPage } from "./docs-registry-core"

export * from "./docs-registry-core"

const oilPaintPage: DocsPage = {
  slug: "how-to/oil-paint",
  title: "Paint a deterministic oil study",
  description: "Knife named pigment tubes into piles, carry wet paint on bounded bristles, and replay a spectral oil study.",
  section: "how-to",
  modified: "2026-10-02",
}

export const docPages: readonly DocsPage[] = [...core.docPages, oilPaintPage]
const pageBySlug = new Map(docPages.map(page => [page.slug, page]))

export function docsPageForSlug(slug: string): DocsPage | undefined { return pageBySlug.get(slug) }
export function docsDocumentForPage(page: DocsPage): string { return `docs/${page.slug}.html` }
export function docsCanonicalUrl(page: DocsPage): string { return page.slug === "index" ? `${core.docsOrigin}/docs` : `${core.docsOrigin}/docs/${page.slug}` }
export function docsMarkdownUrl(page: DocsPage): string { return `/docs/${page.slug}.md` }
export function docsPageForRequestPath(pathname: string): DocsPage | null {
  let path = pathname; if (path.endsWith(".md")) path = path.slice(0, -3); if (path === "/docs" || path === "/docs/") return core.docsIndexPage; if (!path.startsWith("/docs/")) return null; return pageBySlug.get(path.slice("/docs/".length).replace(/\/+$/u, "")) ?? null
}

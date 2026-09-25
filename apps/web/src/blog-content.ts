import {
  articleProvenanceFromAdmission, articleProvenanceSentence, assertArticleAdmissions, escapeArticleHtml,
  renderArticleHtml, renderArticleIndexHtml, renderArticleRelatedHtml, renderArticleSourcesHtml,
  type ArticleAdmission, type ArticleIsoDate,
} from "@hraness/design-kit-articles"
import { product, relatedFor } from "@hraness/design-kit-articles/portfolio"
import {
  articleJsonLd, blogJsonLd, createAtomFeed, createBlogSitemapPaths, createFeedEntry, serializeJsonLd,
  type ArticleDiscovery, type ArticleParty, type SearchSite, type SitemapPath,
} from "@hraness/web-discovery"
import { blogAdmissions } from "./blog-admissions"
import {
  blogCanonicalUrl, blogFeedPath, blogIndex, blogIndexMarkdownPath, blogMarkdownPath, blogOrigin, blogPath,
  blogPostPath, indexableBlogPosts, isBlogPostIndexable, type BlogPost,
} from "./blog-registry"
import { renderDocsMarkdown } from "./docs-markdown"
import { resolveDocsContent } from "./docs-registry"

// Build-time producer for the /blog collection. It runs in the build
// entrypoint, never inside the sealed StyleX graph: design-kit's static article
// renderer and web-discovery's schema, feed and sitemap helpers produce plain
// strings. Their class attributes become closed class tokens that only the
// sealed renderer resolves, so every blog style is a compiled recipe.

assertArticleAdmissions(blogAdmissions)

export const blogSite: SearchSite = {
  name: "Slopcamera",
  title: "Slopcamera",
  description: "A local visual studio for coding agents.",
  origin: "https://slopcamera.com",
  language: "en",
}

const byline = Object.freeze({ kind: "organization", name: "Hraness" } as const)
const hraness: ArticleParty = { kind: "Organization", name: "Hraness" }
const socialImage = {
  path: "/og.png",
  contentType: "image/png",
  alt: "Slopcamera, a visual studio for coding agents, beside a camera-frame and lens motif",
  width: 1200,
  height: 630,
} as const

/** Portfolio addresses a post may link to, resolved from design-kit's facts. */
const productTokens: Readonly<Record<string, string>> = {
  PRODUCT_URL_ALGAL: product("algal").canonicalUrl,
}

export function admissionForPost(post: Pick<BlogPost, "slug">): ArticleAdmission {
  const admission = blogAdmissions.find(record => record.href === blogPostPath(post))
  if (admission === undefined) throw new Error(`Blog post ${blogPostPath(post)} has no admission record`)
  return admission
}

function isoDate(value: string): ArticleIsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error(`Blog date must be YYYY-MM-DD: ${value}`)
  return value as ArticleIsoDate
}

function timestamp(date: string): string {
  return new Date(`${isoDate(date)}T00:00:00.000Z`).toISOString()
}

/** Substitute portfolio addresses and reviewed release tokens; unknown tokens fail closed. */
export function resolveBlogContent(markdown: string): string {
  const withProducts = markdown.replace(/\{\{(PRODUCT_URL_[A-Z_]+)\}\}/gu, (match, name: string) => {
    const value = productTokens[name]
    if (value === undefined) throw new Error(`Unknown blog product token: ${match}`)
    return value
  })
  return resolveDocsContent(withProducts)
}

/** Render a post body as plain semantic HTML for feeds. The shared bounded
 * Markdown renderer escapes source HTML and admits only reviewed link schemes;
 * its docs class tokens and heading self-links are dropped here. */
export function renderBlogBodyHtml(markdown: string): string {
  const html = renderDocsMarkdown(resolveBlogContent(markdown), [])
    .replace(/<a class="\{\{DOCS_ANCHOR_CLASS\}\}" href="#[a-z0-9-]+">([\s\S]*?)<\/a>/gu, "$1")
    .replace(/ class="\{\{DOCS_[A-Z0-9_]+\}\}"/gu, "")
  if (/\{\{[^{}]*\}\}/u.test(html)) throw new Error("Blog body kept an unresolved placeholder")
  return html
}

/** Render a post body for its page. It keeps the documentation prose class
 * tokens, which only the sealed renderer resolves to compiled recipes. */
function renderBlogPageBodyHtml(markdown: string): string {
  const html = renderDocsMarkdown(resolveBlogContent(markdown), [])
  if (/\{\{(?!DOCS_[A-Z0-9_]+_CLASS\}\})[^{}]*\}\}/u.test(html)) throw new Error("Blog body kept an unresolved placeholder")
  return html
}

// Design-kit's plain-publication markup names roles with its own classes. Blog
// pages cannot link that stylesheet inside the sealed graph, so each role maps
// to a closed class token that the sealed renderer resolves to a StyleX recipe
// (BLOG_*) or to a shared documentation prose recipe (DOCS_*). An unknown role
// fails the build instead of shipping unstyled chrome.
const publicationClassTokens: Readonly<Record<string, string>> = {
  "plain-site plain-publication plain-publication--embedded plain-publication__article": "{{BLOG_PAGE_CLASS}}",
  "plain-site plain-publication plain-publication--embedded plain-publication__list": "{{BLOG_PAGE_CLASS}}",
  "plain-publication__section-heading": "{{BLOG_BLOCK_CLASS}}",
  "plain-publication__article-list": "{{BLOG_BLOCK_CLASS}}",
  "plain-publication__entry": "{{BLOG_ENTRY_CLASS}}",
  "plain-publication__entry-label": "{{DOCS_SECTION_LABEL_CLASS}}",
  "plain-publication__entry-title": "{{BLOG_ENTRY_TITLE_CLASS}}",
  "plain-publication__entry-dek": "{{DOCS_P_CLASS}}",
  "plain-publication__entry-meta": "{{BLOG_META_CLASS}}",
  "plain-publication__article-header": "{{BLOG_HEADER_CLASS}}",
  "plain-publication__eyebrow": "{{DOCS_SECTION_LABEL_CLASS}}",
  "plain-publication__article-dek": "{{BLOG_DEK_CLASS}}",
  "plain-publication__article-meta": "{{BLOG_META_CLASS}}",
  "plain-publication__byline": "{{BLOG_BYLINE_CLASS}}",
  "plain-publication__provenance": "{{BLOG_PROVENANCE_CLASS}}",
  "plain-publication__article-layout": "{{BLOG_BLOCK_CLASS}}",
  "plain-publication__article-body": "{{BLOG_BLOCK_CLASS}}",
  "plain-publication__article-footer": "{{DOCS_FOOTER_CLASS}}",
  "plain-publication__sources": "{{BLOG_BLOCK_CLASS}}",
}

function replaceExactly(html: string, search: string, replacement: string, count: number): string {
  const found = html.split(search).length - 1
  if (found !== count) throw new Error(`Blog markup expected ${count} of ${search}, found ${found}`)
  return html.replaceAll(search, replacement)
}

/** Map design-kit article or index markup onto closed class tokens. */
export function blogMarkupWithClassTokens(html: string, kind: "article" | "index", sourceCount = 0): string {
  let mapped = html.replace(/ class="([^"]*)"/gu, (_match, value: string) => {
    if (/^\{\{(?:DOCS|BLOG)_[A-Z0-9_]+_CLASS\}\}$/u.test(value)) return ` class="${value}"`
    const token = publicationClassTokens[value]
    if (token === undefined) throw new Error(`Blog markup has an unmapped class: ${value}`)
    return ` class="${token}"`
  })
  if (kind === "index") {
    mapped = replaceExactly(mapped, `<h1 id="blog-title">`, `<h1 class="{{DOCS_HEADING_CLASS}}" id="blog-title">`, 1)
    mapped = replaceExactly(mapped, `</h1><p>`, `</h1><p class="{{BLOG_DEK_CLASS}}">`, 1)
    mapped = mapped.replaceAll(`<h2 class="{{BLOG_ENTRY_TITLE_CLASS}}"><a href=`, `<h2 class="{{BLOG_ENTRY_TITLE_CLASS}}"><a class="{{BLOG_ENTRY_LINK_CLASS}}" href=`)
  } else {
    mapped = replaceExactly(mapped, `<h1 id="article-title">`, `<h1 class="{{DOCS_HEADING_CLASS}}" id="article-title">`, 1)
    mapped = replaceExactly(mapped, `<h2 id="article-sources">`, `<h2 class="{{DOCS_H3_CLASS}}" id="article-sources">`, 1)
    mapped = replaceExactly(mapped, `</h2><ol><li>`, `</h2><ol class="{{DOCS_LIST_CLASS}}"><li>`, 1)
    mapped = replaceExactly(mapped, `<li><a href=`, `<li class="{{DOCS_LIST_ITEM_CLASS}}"><a class="{{DOCS_LINK_CLASS}}" href=`, sourceCount)
    mapped = replaceExactly(mapped, `<span>Checked `, `<span class="{{BLOG_SOURCE_CHECKED_CLASS}}">Checked `, sourceCount)
  }
  const unclassed = /<(?:h1|h2|h3|p|ol|ul|li|a|pre|code|blockquote|section|header|footer|article|div)(?=[\s>])(?![^>]*\sclass=")[^>]*>/u.exec(mapped)
  if (unclassed !== null) throw new Error(`Blog markup has an unstyled element: ${unclassed[0]}`)
  return mapped
}

export function blogArticleDiscovery(post: BlogPost): ArticleDiscovery {
  return {
    type: "BlogPosting",
    canonicalPath: blogPostPath(post),
    title: post.title,
    description: post.description,
    image: socialImage,
    publishedTime: timestamp(post.published),
    ...(post.updated === undefined ? {} : { modifiedTime: timestamp(post.updated) }),
    authors: [hraness],
    publisher: hraness,
    blogPath: "/blog",
    keywords: post.keywords,
    citations: admissionForPost(post).sources
      .map(source => source.url)
      .filter((url): url is `https://${string}` => url.startsWith("https://")),
  }
}

function relatedProductsHtml(): string {
  return renderArticleRelatedHtml({ items: relatedFor("slopcamera") })
}

export type BlogPageSlots = Readonly<{
  title: string
  description: string
  canonical: string
  markdown: string
  robots: string
  ogType: string
  articleMeta: string
  jsonLd: string
  main: string
}>

const indexableRobots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
const noindexRobots = "noindex, follow"

export function blogPostSlots(post: BlogPost, markdown: string): BlogPageSlots {
  const admission = admissionForPost(post)
  const provenance = articleProvenanceFromAdmission(admission)
  const sources = renderArticleSourcesHtml({
    sources: admission.sources.map(source => ({ title: source.title, href: source.url, checkedOn: source.checkedOn })),
  })
  const article = renderArticleHtml({
    heading: post.title,
    dek: post.description,
    eyebrow: post.eyebrow,
    author: byline,
    provenance,
    published: isoDate(post.published),
    ...(post.updated === undefined ? {} : { updated: isoDate(post.updated) }),
    bodyHtml: renderBlogPageBodyHtml(markdown),
    afterHtml: `${sources}${relatedProductsHtml()}`,
  })
  const published = timestamp(post.published)
  const articleMeta = [
    `<meta property="article:published_time" content="${published}">`,
    ...(post.updated === undefined ? [] : [`<meta property="article:modified_time" content="${timestamp(post.updated)}">`]),
    `<meta property="article:author" content="Hraness">`,
    ...post.keywords.map(keyword => `<meta property="article:tag" content="${escapeArticleHtml(keyword)}">`),
  ].join("\n    ")
  return {
    title: post.title,
    description: post.description,
    canonical: blogCanonicalUrl(post),
    markdown: blogMarkdownPath(post),
    robots: isBlogPostIndexable(post) ? indexableRobots : noindexRobots,
    ogType: "article",
    articleMeta,
    jsonLd: serializeJsonLd(articleJsonLd(blogSite, blogArticleDiscovery(post))),
    main: blogMarkupWithClassTokens(article, "article", admission.sources.length),
  }
}

export function blogIndexSlots(): BlogPageSlots {
  const list = renderArticleIndexHtml({
    heading: blogIndex.heading,
    headingId: "blog-title",
    headingLevel: 1,
    summary: blogIndex.description,
    items: indexableBlogPosts.map(post => ({
      href: blogPostPath(post),
      title: post.title,
      dek: post.description,
      eyebrow: post.eyebrow,
      published: isoDate(post.published),
      ...(post.updated === undefined ? {} : { updated: isoDate(post.updated) }),
    })),
  })
  return {
    title: blogIndex.title,
    description: blogIndex.description,
    canonical: `${blogOrigin}${blogPath}`,
    markdown: blogIndexMarkdownPath,
    robots: indexableRobots,
    ogType: "website",
    articleMeta: "",
    jsonLd: serializeJsonLd(blogJsonLd(blogSite, {
      name: blogIndex.heading, description: blogIndex.description, path: "/blog", publisher: hraness,
    }, indexableBlogPosts.map(blogArticleDiscovery))),
    main: blogMarkupWithClassTokens(list, "index"),
  }
}

function humanDate(value: string): string {
  return new Date(`${isoDate(value)}T00:00:00.000Z`).toLocaleDateString("en-US", {
    day: "numeric", month: "long", timeZone: "UTC", year: "numeric",
  })
}

/** The public Markdown mirror of a post: the same text, provenance and sources as its page. */
export function blogPostMarkdown(post: BlogPost, markdown: string): string {
  const admission = admissionForPost(post)
  const provenance = articleProvenanceSentence(articleProvenanceFromAdmission(admission))
  const sources = admission.sources.map(source => `- [${source.title}](${source.url}), checked ${source.checkedOn}`).join("\n")
  return `# ${post.title}

${post.description}

By Hraness · Published ${humanDate(post.published)}${post.updated === undefined ? "" : ` · Updated ${humanDate(post.updated)}`}

${provenance}

${resolveBlogContent(markdown).trim()}

## Sources

${sources}
`
}

export function blogIndexMarkdown(): string {
  const entries = indexableBlogPosts.map(post =>
    `- [${post.title}](${blogOrigin}${blogMarkdownPath(post)}): ${post.description} Published ${humanDate(post.published)}.`)
  return `# ${blogIndex.heading}

${blogIndex.description}

${entries.join("\n")}

Atom feed: ${blogOrigin}${blogFeedPath}
`
}

function absoluteLinks(html: string): string {
  return html.replace(/ href="\/(?!\/)/gu, ` href="${blogOrigin}/`)
}

/** Atom feed of indexable posts with their full bodies. */
export function blogAtomFeed(bodies: Readonly<Record<string, string>>): string {
  return createAtomFeed(blogSite, {
    title: "Slopcamera blog",
    description: blogIndex.description,
    homePath: "/blog",
    path: blogFeedPath,
    authors: [hraness],
  }, indexableBlogPosts.map(post => {
    const body = bodies[post.slug]
    if (body === undefined) throw new Error(`Blog feed is missing the body of ${post.slug}`)
    return createFeedEntry(blogArticleDiscovery(post), { contentHtml: absoluteLinks(renderBlogBodyHtml(body)) })
  }))
}

/** Sitemap entries for the blog index and indexable posts, each with lastmod. */
export function blogSitemapPaths(): readonly SitemapPath[] {
  return createBlogSitemapPaths({ path: "/blog" }, indexableBlogPosts.map(blogArticleDiscovery))
}


import { describe, expect, test } from "bun:test"
import { readFile, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { assertArticleAdmissions, articleProvenanceFromAdmission, articleProvenanceSentence } from "@hraness/design-kit-articles"
import { product } from "@hraness/design-kit-articles/portfolio"

import { llmsTxt, sitemapMarkdown } from "./agent-pages"
import { blogAdmissions } from "./blog-admissions"
import {
  admissionForPost, blogAtomFeed, blogIndexMarkdown, blogIndexSlots, blogMarkupWithClassTokens, blogPostMarkdown,
  blogPostSlots, blogSitemapPaths, renderBlogBodyHtml, resolveBlogContent,
} from "./blog-content"
import {
  blogCanonicalUrl, blogMarkdownPath, blogPostPath, blogPosts, blogTargetForRequestPath, indexableBlogPosts,
} from "./blog-registry"
import { docPages, docsPageForRequestPath } from "./docs-registry"
import { negotiateSiteRequest } from "./negotiate-request"
import { renderSitemapXml } from "../scripts/build"

// Pure contracts for the /blog collection. Built HTML, sealed classes and
// artifact inventories are covered by site.test.ts after a real compilation.

const appDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const bodies = Object.fromEntries(await Promise.all(blogPosts.map(async post =>
  [post.slug, await readFile(join(appDirectory, "src/blog", `${post.slug}.md`), "utf8")] as const)))
const quarantined = blogPosts.filter(post => post.lifecycle === "quarantined")
const reviewer = "Claude Opus 5.5 (claude-opus-5-5) editorial review"

describe("blog admissions", () => {
  test("design-kit validates every admission record", () => {
    expect(() => assertArticleAdmissions(blogAdmissions)).not.toThrow()
    expect(blogAdmissions.map((record): string => record.href).sort()).toEqual(blogPosts.map(blogPostPath).sort())
  })

  test("records a disclosed AI review, never a human one", () => {
    for (const record of blogAdmissions) {
      expect(record.drafting).toBe("ai-from-source")
      expect(record.review).toEqual({ reviewer, reviewerType: "ai", reviewedOn: "2026-09-24" })
      expect(record.humanReview).toBeNull()
      expect(record.review.reviewer).not.toMatch(/human/iu)
      const total = Object.values(record.scores).reduce((sum, score) => sum + score, 0)
      expect(total).toBeGreaterThanOrEqual(9)
      expect(Object.values(record.scores)).not.toContain(0)
    }
  })

  test("admits the introduction and quarantines the ALGAL post", () => {
    expect(blogPosts.map(post => [post.slug, post.lifecycle])).toEqual([
      ["how-slopcamera-uses-algal", "quarantined"],
      ["introducing-slopcamera", "indexable"],
    ])
    expect(indexableBlogPosts.map(post => post.slug)).toEqual(["introducing-slopcamera"])
  })
})

describe("blog pages", () => {
  test("every post carries the Hraness byline and the visible provenance note", () => {
    for (const post of blogPosts) {
      const slots = blogPostSlots(post, bodies[post.slug]!)
      const sentence = articleProvenanceSentence(articleProvenanceFromAdmission(admissionForPost(post)))
      expect(sentence).toBe(`Drafted with AI from the source code and reviewed by ${reviewer}.`)
      expect(slots.main).toContain(">By Hraness</span>")
      expect(slots.main).toContain(sentence)
      expect(slots.main).toContain('data-reviewer-type="ai"')
      const markdown = blogPostMarkdown(post, bodies[post.slug]!)
      expect(markdown).toContain("By Hraness · Published")
      expect(markdown).toContain(sentence)
      expect(markdown).toContain("## Sources")
    }
  })

  test("quarantined posts ship noindex and indexable posts ship index", () => {
    for (const post of blogPosts) {
      const slots = blogPostSlots(post, bodies[post.slug]!)
      expect(slots.robots).toBe(post.lifecycle === "indexable"
        ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        : "noindex, follow")
      expect(slots.canonical).toBe(blogCanonicalUrl(post))
      expect(slots.ogType).toBe("article")
      const schema = JSON.parse(slots.jsonLd) as { "@type"?: string; author?: unknown; headline?: string }
      expect(schema["@type"]).toBe("BlogPosting")
      expect(schema.headline).toBe(post.title)
      expect(JSON.stringify(schema.author)).toContain("Hraness")
    }
    expect(quarantined.map(post => post.slug)).toEqual(["how-slopcamera-uses-algal"])
  })

  test("the index lists only indexable posts", () => {
    const index = blogIndexSlots()
    for (const post of blogPosts) {
      expect(index.main.includes(`href="${blogPostPath(post)}"`)).toBe(post.lifecycle === "indexable")
      expect(index.jsonLd.includes(blogCanonicalUrl(post))).toBe(post.lifecycle === "indexable")
      expect(blogIndexMarkdown().includes(blogMarkdownPath(post))).toBe(post.lifecycle === "indexable")
    }
  })

  test("maps design-kit markup onto closed class tokens and refuses unknown roles", () => {
    const pages = [blogIndexSlots(), ...blogPosts.map(post => blogPostSlots(post, bodies[post.slug]!))]
    for (const page of pages) {
      expect(page.main).not.toContain("plain-publication")
      const tokens = [...page.main.matchAll(/class="([^"]*)"/gu)].map(match => match[1]!)
      for (const token of tokens) expect(token).toMatch(/^\{\{(?:DOCS|BLOG)_[A-Z0-9_]+_CLASS\}\}$/u)
    }
    expect(() => blogMarkupWithClassTokens('<div class="plain-publication__related"></div>', "article"))
      .toThrow("unmapped class")
    expect(() => blogMarkupWithClassTokens('<section class="plain-publication__list"><h1 id="blog-title">T</h1></section>', "index"))
      .toThrow("unmapped class")
  })
})

describe("blog links", () => {
  const manifestRoutes = new Set([
    ...blogPosts.map(blogPostPath),
    ...docPages.map(page => docsPageForRequestPath(`/docs/${page.slug}`) === null ? "" : `/docs/${page.slug}`),
    "/docs/",
  ])

  test("internal links resolve to published routes and portfolio links use registry addresses", () => {
    for (const post of blogPosts) {
      const html = renderBlogBodyHtml(bodies[post.slug]!)
      for (const [, href] of html.matchAll(/ href="([^"]+)"/gu)) {
        if (href!.startsWith("/")) {
          expect(manifestRoutes.has(href!) || docsPageForRequestPath(href!) !== null).toBe(true)
        } else {
          expect(href).toMatch(/^https:\/\//u)
        }
      }
      expect(html).not.toContain("aicharts.com/blog")
      expect(html).not.toContain("ghostget.com/webmcp")
    }
    expect(resolveBlogContent("[ALGAL]({{PRODUCT_URL_ALGAL}})")).toBe(`[ALGAL](${product("algal").canonicalUrl})`)
    expect(() => resolveBlogContent("{{PRODUCT_URL_NOPE}}")).toThrow("Unknown blog product token")
  })

  test("feed bodies use absolute links", () => {
    const feed = blogAtomFeed(bodies)
    expect(feed).not.toMatch(/href=&quot;\/(?!\/)/u)
    expect(feed).not.toMatch(/ href="\/(?!\/)/u)
  })
})

describe("blog discovery", () => {
  test("sitemap, feed and agent indexes exclude quarantined posts", () => {
    const sitemap = renderSitemapXml()
    const feed = blogAtomFeed(bodies)
    for (const post of quarantined) {
      // Admitted post bodies may link to a quarantined route; listings may not.
      for (const document of [sitemap, llmsTxt, sitemapMarkdown, blogIndexMarkdown()]) {
        expect(document).not.toContain(post.slug)
      }
      expect(feed).not.toContain(`<id>${blogCanonicalUrl(post)}</id>`)
    }
    for (const post of indexableBlogPosts) {
      for (const document of [sitemap, feed, llmsTxt, sitemapMarkdown]) {
        expect(document).toContain(post.slug)
      }
    }
    expect(blogSitemapPaths().map(entry => entry.path)).toEqual(["/blog", ...indexableBlogPosts.map(blogPostPath)])
    for (const entry of blogSitemapPaths()) expect(entry.lastModified).toBe("2026-09-24T00:00:00.000Z")
    expect(sitemap).toContain("<loc>https://slopcamera.com/blog/introducing-slopcamera</loc>\n    <lastmod>2026-09-24T00:00:00.000Z</lastmod>")
  })

  test("vercel noindex headers cover exactly the quarantined posts", async () => {
    const vercel = JSON.parse(await readFile(join(appDirectory, "vercel.json"), "utf8")) as {
      headers?: Array<{ source?: string; headers?: Array<{ key: string; value: string }> }>
    }
    const noindexSources = (vercel.headers ?? [])
      .filter(entry => entry.source?.startsWith("/blog/") && entry.headers?.some(header => header.key === "X-Robots-Tag" && header.value === "noindex"))
      .map(entry => entry.source)
    expect(noindexSources).toEqual(quarantined.map(post => `${blogPostPath(post)}(\\.md)?`))
    const headerFor = (source: string) => vercel.headers?.find(entry => entry.source === source)?.headers ?? []
    expect(headerFor("/blog/(.*\\.md)")).toContainEqual({ key: "Content-Type", value: "text/markdown; charset=utf-8" })
    expect(headerFor("/blog/feed.xml")).toContainEqual({ key: "Content-Type", value: "application/atom+xml; charset=utf-8" })
  })

  test("markdown negotiation rewrites to the mirror and keeps quarantine noindex", () => {
    for (const post of blogPosts) {
      for (const request of [
        new Request(`https://slopcamera.com${blogPostPath(post)}`, { headers: { Accept: "text/markdown" } }),
        new Request(`https://slopcamera.com${blogMarkdownPath(post)}`),
      ]) {
        const response = negotiateSiteRequest(request)
        expect(response?.status).toBe(200)
        expect(response?.headers.get("x-middleware-rewrite")).toBe(`https://slopcamera.com${blogMarkdownPath(post)}`)
        expect(response?.headers.get("link")).toContain(`<${blogCanonicalUrl(post)}>; rel="canonical"`)
        expect(response?.headers.get("x-robots-tag")).toBe(post.lifecycle === "indexable" ? null : "noindex")
      }
      expect(negotiateSiteRequest(new Request(`https://slopcamera.com${blogPostPath(post)}`, { headers: { Accept: "text/html" } }))).toBeUndefined()
    }
    const index = negotiateSiteRequest(new Request("https://slopcamera.com/blog", { headers: { Accept: "text/markdown" } }))
    expect(index?.headers.get("x-middleware-rewrite")).toBe("https://slopcamera.com/blog/index.md")
    expect(blogTargetForRequestPath("/blog/missing")).toBeNull()
    expect(negotiateSiteRequest(new Request("https://slopcamera.com/blog/missing", { headers: { Accept: "text/markdown" } }))?.status).toBe(404)
  })

  test("post sources are the registered markdown files", async () => {
    expect((await readdir(join(appDirectory, "src/blog"))).sort()).toEqual(blogPosts.map(post => `${post.slug}.md`).sort())
  })
})

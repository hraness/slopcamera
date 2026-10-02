import { blogAdmissions } from "./blog-admissions"

// The public /blog registry. Post bodies live in src/blog/<slug>.md and are
// hashed as sealed compiler inputs. Like the docs registry, this module holds
// only metadata and request-path resolution, so middleware, agent pages and
// the build entrypoint can share it without importing StyleX or design-kit.
// Lifecycle comes from the admission record; nothing here restates it.

export const blogOrigin = "https://slopcamera.com"
export const blogPath = "/blog"
export const blogFeedPath = "/blog/feed.xml"
export const blogIndexMarkdownPath = "/blog/index.md"
export const blogIndexDocument = "blog/index.html"

export const blogIndex = Object.freeze({
  title: "Blog",
  heading: "Slopcamera blog",
  description: "Posts from Hraness about Slopcamera, the media studio for agents: how its techniques work and when to use them.",
})

export type BlogLifecycle = "quarantined" | "indexable" | "archived"

export type BlogPost = Readonly<{
  slug: string
  title: string
  /** The dek: one plain sentence used as the page description and summary. */
  description: string
  eyebrow: string
  /** ISO date, YYYY-MM-DD. */
  published: string
  updated?: string
  keywords: readonly string[]
  lifecycle: BlogLifecycle
}>

type BlogPostSource = Omit<BlogPost, "lifecycle">

const sources: readonly BlogPostSource[] = [
  {
    slug: "one-shot-render-vs-installed-techniques",
    title: "Reusing source across revisions and formats",
    description: "How diagrams, titles, parametric designs and format variants keep creative changes separate from rendering.",
    eyebrow: "Frameworks and agents",
    published: "2026-09-28",
    updated: "2026-10-01",
    keywords: [
      "one-shot render", "coding agent video", "agent skills", "video framework for agents", "Claude Code video",
      "editable diagrams", "parametric design", "aspect ratio variants", "Remotion alternative", "HyperFrames alternative",
    ],
  },
  {
    slug: "make-video-with-claude-code",
    title: "How to make a video with Claude Code or Codex",
    description: "Match each shot to the engine that draws it (HTML, Three.js, Blender, Manim, or FFmpeg), then have your agent write a short source file and render it.",
    eyebrow: "Guide",
    published: "2026-09-28",
    updated: "2026-10-01",
    keywords: [
      "make video with Claude Code", "Codex video", "coding agent video", "agent skills video", "HTML to video",
      "Three.js camera move", "headless Blender", "Manim explainer", "FFmpeg edit", "Remotion alternative", "HyperFrames alternative",
    ],
  },
  {
    slug: "editable-diagrams-with-coding-agents",
    title: "Editable diagrams with coding agents",
    description: "Keep a diagram as a short JSON file your agent edits, checks, and re-renders to light and dark SVG, PNG, and tldraw, instead of drawing it again.",
    eyebrow: "Guide",
    published: "2026-09-28",
    updated: "2026-10-01",
    keywords: [
      "editable diagrams", "diagrams as code", "coding agents", "Claude Code diagrams", "architecture diagrams",
      "tldraw", "light and dark SVG", "Mermaid alternative", "slopcamera",
    ],
  },
  {
    slug: "headless-blender-manim-cadquery-for-agents",
    title: "Headless Blender, Manim and CadQuery for coding agents",
    description: "A live Blender MCP session suits exploring. A scene your agent keeps as a short program is easier to revise, re-render, and check the next day.",
    eyebrow: "Native engines",
    published: "2026-09-28",
    updated: "2026-10-01",
    keywords: [
      "headless Blender", "Blender MCP", "Blender command-line rendering", "Manim", "CadQuery", "coding agents",
      "Claude Code Blender", "parametric CAD agent", "scene as code", "Slopcamera studio",
    ],
  },
  {
    slug: "introducing-slopcamera",
    title: "Introducing Slopcamera",
    description: "Slopcamera, the media studio for agents, makes images, diagrams, animation, 3D scenes, and video from source files your coding agent can keep revising.",
    eyebrow: "Release",
    published: "2026-09-24",
    updated: "2026-10-01",
    keywords: ["slopcamera", "image generation", "ai images", "diagrams", "coding agents", "editorial images"],
  },
  {
    slug: "how-slopcamera-uses-algal",
    title: "How Slopcamera bakes character behavior with ALGAL",
    description: "Slopcamera runs a character's behavior as a small ALGAL program with no tools, models, or side effects, so the same scene and seed always bake the same motion.",
    eyebrow: "Integration",
    published: "2026-09-24",
    updated: "2026-10-01",
    keywords: ["slopcamera", "algal", "character animation", "3d scenes", "deterministic rendering", "coding agents"],
  },
]

export function blogPostPath(post: Pick<BlogPost, "slug">): `/blog/${string}` {
  return `/blog/${post.slug}`
}

function lifecycleFor(slug: string): BlogLifecycle {
  const admission = blogAdmissions.find(record => record.href === `/blog/${slug}`)
  if (admission === undefined) throw new Error(`Blog post /blog/${slug} has no admission record`)
  return admission.lifecycle
}

/** Every post, newest first, including quarantined ones (their pages exist but are noindex).
 * Posts published on the same day keep their order in `sources`, so the lead post comes first. */
export const blogPosts: readonly BlogPost[] = sources
  .map((source, index) => ({ post: Object.freeze({ ...source, lifecycle: lifecycleFor(source.slug) }), index }))
  .sort((left, right) => right.post.published.localeCompare(left.post.published) || left.index - right.index)
  .map(entry => entry.post)

for (const admission of blogAdmissions) {
  if (!blogPosts.some(post => blogPostPath(post) === admission.href)) {
    throw new Error(`Blog admission ${admission.href} has no registered post`)
  }
}
if (new Set(blogPosts.map(post => post.slug)).size !== blogPosts.length) throw new Error("Duplicate blog slug")
for (const post of blogPosts) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(post.slug) || post.slug === "index" || post.slug === "feed") {
    throw new Error(`Invalid blog slug: ${post.slug}`)
  }
}

export function isBlogPostIndexable(post: Pick<BlogPost, "lifecycle">): boolean {
  return post.lifecycle === "indexable"
}

/** Posts admitted to discovery: the blog index, sitemap, feed and llms.txt. */
export const indexableBlogPosts: readonly BlogPost[] = blogPosts.filter(isBlogPostIndexable)

export function blogPostForSlug(slug: string): BlogPost | undefined {
  return blogPosts.find(post => post.slug === slug)
}

export function blogDocumentForPost(post: Pick<BlogPost, "slug">): string {
  return `blog/${post.slug}.html`
}

export function blogPostForDocument(document: string): BlogPost | undefined {
  const match = /^blog\/([a-z0-9-]+)\.html$/u.exec(document)
  return match === null ? undefined : blogPostForSlug(match[1]!)
}

export function isBlogDocument(document: string): boolean {
  return document === blogIndexDocument || blogPostForDocument(document) !== undefined
}

export function blogCanonicalUrl(post: Pick<BlogPost, "slug">): string {
  return `${blogOrigin}${blogPostPath(post)}`
}

export function blogMarkdownPath(post: Pick<BlogPost, "slug">): string {
  return `/blog/${post.slug}.md`
}

export type BlogRequestTarget =
  | Readonly<{ kind: "index"; canonicalUrl: string; markdownPath: string; indexable: true }>
  | Readonly<{ kind: "post"; post: BlogPost; canonicalUrl: string; markdownPath: string; indexable: boolean }>

/** Resolve a request path (HTML route or .md mirror) to the blog index or a post, or null. */
export function blogTargetForRequestPath(pathname: string): BlogRequestTarget | null {
  let path = pathname
  if (path.endsWith(".md")) path = path.slice(0, -3)
  if (path === "/blog" || path === "/blog/" || path === "/blog/index") {
    return { kind: "index", canonicalUrl: `${blogOrigin}${blogPath}`, markdownPath: blogIndexMarkdownPath, indexable: true }
  }
  if (!path.startsWith("/blog/")) return null
  const post = blogPostForSlug(path.slice("/blog/".length).replace(/\/+$/u, ""))
  if (post === undefined) return null
  return { kind: "post", post, canonicalUrl: blogCanonicalUrl(post), markdownPath: blogMarkdownPath(post), indexable: isBlogPostIndexable(post) }
}

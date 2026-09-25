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
  description: "Posts about Slopcamera, the media studio for agents: what it is for, how it works, and how it connects to other Hraness tools.",
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
    slug: "introducing-slopcamera",
    title: "Introducing Slopcamera",
    description: "Slopcamera is a media studio for agents that a coding agent drives to make images, diagrams, animation, 3D scenes, and video from source files it can keep revising.",
    eyebrow: "Introducing",
    published: "2026-09-24",
    keywords: ["slopcamera", "image generation", "ai images", "diagrams", "coding agents", "editorial images"],
  },
  {
    slug: "how-slopcamera-uses-algal",
    title: "How Slopcamera uses ALGAL to bake repeatable character behavior",
    description: "Slopcamera runs a character's behavior as a small ALGAL program with no tools, models or side effects, so the same scene and seed always bake the same motion.",
    eyebrow: "Integration",
    published: "2026-09-24",
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

/** Every post, newest first, including quarantined ones (their pages exist but are noindex). */
export const blogPosts: readonly BlogPost[] = sources
  .map(source => Object.freeze({ ...source, lifecycle: lifecycleFor(source.slug) }))
  .sort((left, right) => right.published.localeCompare(left.published) || left.slug.localeCompare(right.slug))

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

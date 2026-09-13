import { archiveInstall, publishedArchiveUrl, publishedRelease, sourceInstall } from "./published-release"

// The public /docs registry. Page bodies live in src/docs/<slug>.md and are
// hashed as sealed compiler inputs. This module carries only metadata,
// reviewed token substitution, and request-path resolution, so edge middleware
// and the build entrypoint can share it without importing the StyleX surface.

export const docsOrigin = "https://slopcamera.com"

export type DocsSection = "tutorials" | "how-to" | "reference" | "explanation"

export type DocsPage = Readonly<{
  slug: string
  title: string
  description: string
  section: DocsSection | "index"
}>

export const docsSectionLabels: Record<DocsSection, string> = {
  tutorials: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
  explanation: "Explanation",
}

export const docsSectionOrder: readonly DocsSection[] = ["tutorials", "how-to", "reference", "explanation"]

export const docsIndexPage: DocsPage = {
  slug: "index",
  title: "Slopcamera documentation",
  description: "Learn, use, and extend Slopcamera: tutorials, task guides, reference, and explanation for agent-driven visual work.",
  section: "index",
}

export const docPages: readonly DocsPage[] = [
  docsIndexPage,
  // Tutorials: guided learning, including per-agent setup.
  { slug: "tutorials/first-diagram", title: "Create and revise your first diagram",
    description: "Make a two-node flow, inspect its five exports, then change a label by editing its source.",
    section: "tutorials" },
  { slug: "tutorials/first-native-film", title: "Render your first native film",
    description: "Retain a Blender source, render a small shot, and export an ordinary Slopcamera project.",
    section: "tutorials" },
  { slug: "tutorials/claude-code", title: "Set up Slopcamera for Claude Code",
    description: "Install the verified release and the matching Agent Skill so Claude Code can create visual media.",
    section: "tutorials" },
  { slug: "tutorials/codex", title: "Set up Slopcamera for Codex",
    description: "Install the verified release and the Agent Skill so Codex can create visual media in a repository.",
    section: "tutorials" },
  { slug: "tutorials/mcp", title: "Use Slopcamera from an MCP client",
    description: "Expose the fixed diagram and image toolset to Cursor, Claude Desktop, and other MCP-capable clients.",
    section: "tutorials" },
  { slug: "tutorials/other-agents", title: "Set up Slopcamera for other coding agents",
    description: "Use the portable Agent Skill target or plain CLI access from agents without a dedicated integration.",
    section: "tutorials" },
  // How-to guides: task completion for each supported technique.
  { slug: "how-to/install-from-source", title: "Build Slopcamera from source",
    description: "Record the commit, install locked dependencies, build the SDK and CLI, and define the slopcamera command.",
    section: "how-to" },
  { slug: "how-to/edit-video", title: "Edit and deliver video",
    description: "Import footage, align related tracks, place overlays, and check a delivery.",
    section: "how-to" },
  { slug: "how-to/generate-media", title: "Generate images, video, and narration",
    description: "Discover Gateway capabilities, acknowledge selected uploads, and retain the result.",
    section: "how-to" },
  { slug: "how-to/educational-video", title: "Make an educational video",
    description: "Keep mathematical visuals, narration, and timing evidence revisable.",
    section: "how-to" },
  { slug: "how-to/music-video", title: "Make a music video from an HTML scene",
    description: "Render authored visuals with a local track and retain separate sources in an editable project.",
    section: "how-to" },
  { slug: "how-to/direct-scenes", title: "Render and edit spatial scenes",
    description: "Patch named entities, use hardware rendering, import a saved world, or prepare a shot composition.",
    section: "how-to" },
  { slug: "how-to/native-films", title: "Author a native film",
    description: "Use Blender, CadQuery, or Manim; retain caches; share assets and calibrated cameras.",
    section: "how-to" },
  { slug: "how-to/direct-takes", title: "Direct short generated clips",
    description: "Budget, review takes, preserve endpoint continuity, and recover uncertain work.",
    section: "how-to" },
  { slug: "how-to/run-workflows", title: "Run or recover a workflow",
    description: "Use a built-in recipe or trusted Bun module and inspect its durable run.",
    section: "how-to" },
  // Reference: factual contracts for the multimedia engine.
  { slug: "reference/capabilities", title: "Capabilities, versions, and platforms",
    description: "Current Slopcamera capabilities, release availability, and supported runtime boundaries.",
    section: "reference" },
  { slug: "reference/sdk", title: "SDK surfaces",
    description: "Portable and local imports, operation projections, and execution contracts.",
    section: "reference" },
  { slug: "reference/engines", title: "The Slopcamera engine stack",
    description: "What each part of the multimedia engine does, what it needs, and where its limits are.",
    section: "reference" },
  // Explanation: concepts, differentiators, and extension surfaces.
  { slug: "explanation/architecture", title: "Source, representations, and projects",
    description: "What stays editable, what a receipt proves, and how local and cloud work fit together.",
    section: "explanation" },
  { slug: "explanation/why-slopcamera", title: "Why Slopcamera",
    description: "What a retained-source local studio gives an agent that a loose toolchain does not.",
    section: "explanation" },
  { slug: "explanation/extending", title: "Extend Slopcamera",
    description: "Workflows, declarative graphs, the SDK, MCP, and separately installed native engines.",
    section: "explanation" },
  { slug: "explanation/html-authoring", title: "Choose an HTML authoring surface",
    description: "Why DOM, vector, Three.js, and explicit GPU profiles serve different jobs.",
    section: "explanation" },
] as const

const pageBySlug = new Map(docPages.map(page => [page.slug, page]))

for (const page of docPages) {
  if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/u.test(page.slug)) {
    throw new Error(`Unsafe documentation slug: ${page.slug}`)
  }
  if (page.section !== "index" && !page.slug.startsWith(`${page.section}/`)) {
    throw new Error(`Documentation slug ${page.slug} does not match its ${page.section} section`)
  }
}

export function docsPageForSlug(slug: string): DocsPage | undefined {
  return pageBySlug.get(slug)
}

export function docsDocumentForPage(page: DocsPage): string {
  return `docs/${page.slug}.html`
}

export function docsCanonicalUrl(page: DocsPage): string {
  return page.slug === "index" ? `${docsOrigin}/docs` : `${docsOrigin}/docs/${page.slug}`
}

export function docsMarkdownUrl(page: DocsPage): string {
  return `/docs/${page.slug}.md`
}

const contentTokens: Readonly<Record<string, string>> = {
  PUBLISHED_VERSION: publishedRelease.version,
  RELEASE_URL: publishedRelease.releaseUrl,
  ARCHIVE_URL: publishedArchiveUrl,
  ARCHIVE_INSTALL_COMMAND: archiveInstall.command,
  DOCTOR_COMMAND: archiveInstall.checkCommand,
  SKILL_INSTALL_COMMAND: archiveInstall.skillCommand,
  SKILL_INSTALL_COMMAND_CLAUDE: archiveInstall.alternateSkillCommand,
  SOURCE_REPO_URL: sourceInstall.repositoryUrl,
  SOURCE_CHECKOUT_COMMAND: sourceInstall.checkoutCommand,
  SOURCE_ENTER_COMMAND: sourceInstall.enterCommand,
  SOURCE_SKILL_COMMAND: sourceInstall.skillCommand,
  SOURCE_SKILL_COMMAND_CLAUDE: sourceInstall.alternateSkillCommand,
  SOURCE_INSTALL_URL: sourceInstall.guideUrl,
}

/** Substitute reviewed release tokens in authored Markdown once, for both the
 * sealed HTML page and its public .md mirror. Unknown tokens fail closed. */
export function resolveDocsContent(markdown: string): string {
  return markdown.replace(/\{\{([A-Z_]+)\}\}/gu, (match, name: string) => {
    const value = contentTokens[name]
    if (value === undefined) throw new Error(`Unknown documentation token: ${match}`)
    return value
  })
}

/** The public Markdown mirror of a documentation page. */
export function docsPageMarkdown(page: DocsPage, body: string): string {
  return `# ${page.title}\n\n${page.description}\n\n${resolveDocsContent(body).trim()}\n`
}

/** Resolve a request path to a documentation page, or null when it misses. */
export function docsPageForRequestPath(pathname: string): DocsPage | null {
  let path = pathname
  if (path.endsWith(".md")) path = path.slice(0, -3)
  if (path === "/docs" || path === "/docs/") return docsIndexPage
  if (!path.startsWith("/docs/")) return null
  const slug = path.slice("/docs/".length).replace(/\/+$/u, "")
  return pageBySlug.get(slug) ?? null
}

import { homeSocialImageAlt, productMessaging, productName } from "./messaging"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { Resvg } from "@resvg/resvg-js"
import {
  createSocialImageCard, defineSocialImageSite, socialImageAlt, socialImageFit, socialImageSiteDetails,
  type SocialImageFit, type SocialImagePage,
} from "@hraness/web-discovery/social-image/card"
import satori from "satori"

import { blogIndex, blogPosts, blogDocumentForPost, blogIndexDocument } from "./blog-registry"
import { docPages, docsDocumentForPage, type DocsPage } from "./docs-registry"

// Build-time only: the sealed StyleX renderer never imports this module. The
// build renders every card and hands the renderer each page's URL and alt.

const origin = "https://slopcamera.com"
const markSvg = readFileSync(fileURLToPath(new URL("./marks/slopcamera.svg", import.meta.url)))

/** Slopcamera's one social-image declaration. Every share card comes from it. */
export const slopcameraSocialSite = defineSocialImageSite({
  name: productName,
  description: productMessaging.tagline,
  domain: "slopcamera.com",
  // Multi-word names the headline and description never split across lines.
  keepTogether: ["Agent Skill", "Claude Code", "Hraness Credits", "Vercel AI Gateway"],
  // The header's foil mark: the same camera glyph the sticky header masks
  // (src/site-foil.css) and the name exactly as the header shows it.
  brand: productName,
  brandMark: `data:image/svg+xml;base64,${markSvg.toString("base64")}`,
  // The `data-palette` every page's <html> carries.
  palette: "catppuccin",
})

export const socialImageWidth = 1200
export const socialImageHeight = 630

export type SocialImage = Readonly<{
  /** Path inside the built site, without a leading slash. */
  file: string
  url: string
  alt: string
  width: number
  height: number
  page?: SocialImagePage
}>

function socialImage(file: string, page?: SocialImagePage): SocialImage {
  return {
    file, url: `${origin}/${file}`, alt: socialImageAlt(slopcameraSocialSite, page),
    width: socialImageWidth, height: socialImageHeight, ...(page === undefined ? {} : { page }),
  }
}

/**
 * The home card is the site's header over its hero: the hero H1 as the
 * headline. The hero shows no eyebrow, so the card has none. The tagline is
 * the site description, so the card leaves it out rather than repeat it
 * under the headline.
 */
export const homeSocialImage: SocialImage = {
  ...socialImage("og.png", { headline: productMessaging.hero.heading, description: "", layout: "product" }),
  alt: homeSocialImageAlt,
}

/**
 * Card copy for pages whose own title or description does not fit the card as
 * written. A share card holds a two-line headline and a two-line description,
 * so these say the same thing in fewer words; the page keeps its full title
 * and meta description. Keyed by the page's document path.
 */
export const socialCardCopy: Readonly<Record<string, Readonly<{ headline?: string; description?: string }>>> = Object.freeze({
  // A card with an eyebrow and a two-line headline has room for one line of
  // description at the standard size, so most of these are one short line.
  "blog/index.html": { description: "Posts from Hraness on how SlopCamera's techniques work and when to use them." },
  "blog/one-shot-render-vs-installed-techniques.html": {
    headline: "What the second render takes",
    description: "Four gallery examples at one commit.",
  },
  "blog/make-video-with-claude-code.html": { description: "Match each shot to the engine that draws it." },
  "blog/editable-diagrams-with-coding-agents.html": { description: "Keep a diagram as a short JSON file." },
  "blog/headless-blender-manim-cadquery-for-agents.html": {
    headline: "Headless Blender, Manim and CadQuery",
    description: "Keep a scene as a short program to re-render.",
  },
  "blog/introducing-slopcamera.html": { description: "Images, diagrams, animation, 3D scenes, and video from files your agent revises." },
  "blog/how-slopcamera-uses-algal.html": {
    headline: "Character behavior with ALGAL",
    description: "Same scene and seed, same baked motion.",
  },
  "docs/index.html": { description: "Install it, set up your agent, follow the guides." },
  "docs/tutorials/first-diagram.html": { description: "Make a two-node flow, then edit its source." },
  "docs/tutorials/first-animation.html": { description: "Render a moonbound tram. Then revise it." },
  "docs/tutorials/first-native-film.html": { description: "Render a small shot from Blender source." },
  "docs/tutorials/claude-code.html": { description: "Ask for a first diagram and short video." },
  "docs/tutorials/codex.html": { description: "Ask for a diagram and video in a repository." },
  "docs/tutorials/mcp.html": { description: "Fixed tools for diagrams, images, and scenes." },
  "docs/tutorials/other-agents.html": { description: "Use the portable Agent Skill or the plain CLI." },
  "docs/how-to/direct-a-film.html": { description: "Brief, picture, movement, sound, and revision." },
  "docs/how-to/remix-the-showcase.html": { description: "Open the sources. Direct your own version." },
  "docs/how-to/install-from-source.html": { description: "Install locked dependencies, then build the CLI." },
  "docs/how-to/render-motion-graphics.html": { description: "HTML, SVG, shaders, or Three.js to video." },
  "docs/how-to/vectorize-images.html": { description: "Trace a raster locally and check the SVG." },
  "docs/how-to/generate-media.html": { description: "Through Vercel AI Gateway or Hraness Credits." },
  "docs/how-to/educational-video.html": { description: "Manim visuals with revisable narration." },
  "docs/how-to/music-video.html": { description: "Authored visuals with a local track." },
  "docs/how-to/direct-scenes.html": { description: "Patch named entities or import a saved world." },
  "docs/how-to/parametric-design.html": { description: "Change coupled dimensions, compare renders." },
  "docs/how-to/cinematic-worlds.html": {
    headline: "Direct a 3D scene",
    description: "Plan camera moves, lighting, and effects, then review before selecting.",
  },
  "docs/how-to/native-films.html": {
    headline: "Render native films from source",
    description: "Blender, CadQuery, or Manim, with caches.",
  },
  "docs/how-to/direct-takes.html": { description: "Budget, review takes, and keep continuity." },
  "docs/how-to/run-workflows.html": { description: "Run a recipe and inspect its durable run." },
  "docs/reference/techniques.html": {
    headline: "Techniques catalog",
    description: "Every packaged technique by job, with its first command and guide.",
  },
  "docs/reference/capabilities.html": { description: "What ships in each release, and where it runs." },
  "docs/reference/engines.html": { description: "What each engine does, needs, and cannot do." },
  "docs/reference/diagram-format.html": { description: "Version-one diagram source, its five render outputs, and configuration." },
  "docs/reference/html-profiles.html": {
    headline: "HTML render profiles",
    description: "The seven locked browser render profiles and their shared contract.",
  },
  "docs/reference/spatial-scenes.html": { description: "Entities, patches, cameras, and render profiles." },
  "docs/reference/vectorization.html": { description: "Trace a raster to SVG, then check fidelity." },
  "docs/reference/gateway-generation.html": { description: "Image, video, speech, and transcription." },
  "docs/reference/video-pipeline.html": { description: "The FFmpeg-backed project model, end to end." },
  "docs/reference/native-engines.html": { description: "How SlopCamera runs jobs from kept source." },
  "docs/reference/mcp-tools.html": { description: "The 21 fixed tools slopcamera mcp serves." },
  "docs/explanation/architecture.html": {
    headline: "How SlopCamera works",
    description: "What stays editable after a render and which work runs where.",
  },
  "docs/explanation/why-slopcamera.html": {
    headline: "Why SlopCamera",
    description: "Why an agent writes a short source file instead of a whole render pipeline.",
  },
  "docs/explanation/slopcamera-vs-remotion.html": { description: "Formats, rendering, licenses, and using both." },
  "docs/explanation/slopcamera-vs-hyperframes.html": {
    headline: "SlopCamera vs HyperFrames",
    description: "HTML video versus several engines.",
  },
  "docs/explanation/remotion-alternatives-for-coding-agents.html": { description: "Tools to use instead of or beside Remotion." },
  "docs/explanation/token-benchmark.html": { description: "Methods and reports from a controlled study of first-render and revision costs." },
  "docs/explanation/html-authoring.html": { description: "DOM, vector, Three.js, and GPU profiles." },
  "docs/explanation/use-cases.html": { description: "What people make, and where it is the wrong tool." },
  "docs/explanation/choose-an-interface.html": { description: "Agent Skill, CLI, SDK, MCP, or hosted adapter." },
})

/** The card's eyebrow per docs section, in the portfolio's singular labels. */
const docsCardEyebrows: Readonly<Record<DocsPage["section"], string>> = Object.freeze({
  index: "Documentation",
  tutorials: "Tutorial",
  "how-to": "Guide",
  reference: "Reference",
  explanation: "Explanation",
})

/**
 * Comparison pages read as comparisons wherever they sit in the docs or blog.
 * A blog post's card takes this eyebrow over its registry label; the post
 * page keeps its own.
 */
const comparisonDocuments: ReadonlySet<string> = new Set([
  "blog/one-shot-render-vs-installed-techniques.html",
  "docs/explanation/slopcamera-vs-remotion.html",
  "docs/explanation/slopcamera-vs-hyperframes.html",
  "docs/explanation/remotion-alternatives-for-coding-agents.html",
])

/** The route a document is served at, such as "/docs/how-to/edit-video". */
function documentPath(document: string): string {
  return `/${document.replace(/(?:^|\/)index\.html$/u, "").replace(/\.html$/u, "")}`
}

function pageCard(document: string, page: SocialImagePage): SocialImagePage {
  return { ...page, ...socialCardCopy[document], path: documentPath(document) }
}

function docsSocialPage(page: DocsPage): SocialImagePage {
  return pageCard(docsDocumentForPage(page), {
    // The docs index is titled "Documentation" on the site; under that
    // eyebrow the card names the product instead of repeating the section.
    headline: page.section === "index" ? "SlopCamera documentation" : page.title,
    description: page.description,
    eyebrow: comparisonDocuments.has(docsDocumentForPage(page)) ? "Comparison" : docsCardEyebrows[page.section],
  })
}

/** Each HTML document's card: page routes pass only their own copy. */
export const socialImagesByDocument: Readonly<Record<string, SocialImage>> = Object.freeze({
  [blogIndexDocument]: socialImage("og/blog.png",
    pageCard(blogIndexDocument, { headline: blogIndex.heading, description: blogIndex.description, eyebrow: "Blog" })),
  ...Object.fromEntries(blogPosts.map(post => [blogDocumentForPost(post),
    socialImage(`og/blog/${post.slug}.png`,
      pageCard(blogDocumentForPost(post), {
        headline: post.title,
        description: post.description,
        eyebrow: comparisonDocuments.has(blogDocumentForPost(post)) ? "Comparison" : post.eyebrow,
      }))])),
  ...Object.fromEntries(docPages.map(page => [docsDocumentForPage(page),
    socialImage(`og/${docsDocumentForPage(page).replace(/\.html$/u, "")}.png`, docsSocialPage(page))])),
})

export function socialImageForDocument(document: string): SocialImage {
  return socialImagesByDocument[document] ?? homeSocialImage
}

/** Every card the site publishes, the home card first. */
export const socialImages: readonly SocialImage[] = [homeSocialImage, ...Object.values(socialImagesByDocument)]

/** Lay out one card without rendering it: what the template drew, cut or removed. */
export function socialImageFitFor(image: SocialImage): SocialImageFit {
  return socialImageFit(socialImageSiteDetails(slopcameraSocialSite, image.page))
}

/** Rasterize one card with the shared template; copy that does not fit as written fails the build. */
export async function renderSocialImage(image: SocialImage): Promise<Uint8Array> {
  const card = createSocialImageCard({ ...socialImageSiteDetails(slopcameraSocialSite, image.page), strict: true })
  const svg = await satori(card.element, {
    fonts: card.fonts.map(font => ({ data: font.data, name: font.name, style: font.style, weight: font.weight })),
    height: card.height, width: card.width,
  })
  return new Uint8Array(new Resvg(svg).render().asPng())
}

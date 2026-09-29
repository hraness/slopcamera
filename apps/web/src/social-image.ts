import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { Resvg } from "@resvg/resvg-js"
import {
  createSocialImageCard, defineSocialImageSite, socialImageAlt, socialImageFit, socialImageSiteDetails,
  type SocialImageFit, type SocialImagePage,
} from "@hraness/web-discovery/social-image/card"
import satori from "satori"

import { blogIndex, blogPosts, blogDocumentForPost, blogIndexDocument } from "./blog-registry"
import { docPages, docsDocumentForPage, docsSectionLabels, type DocsPage } from "./docs-registry"

// Build-time only: the sealed StyleX renderer never imports this module. The
// build renders every card and hands the renderer each page's URL and alt.

const origin = "https://slopcamera.com"
const markSvg = readFileSync(fileURLToPath(new URL("./marks/slopcamera.svg", import.meta.url)))

/** Slopcamera's one social-image declaration. Every share card comes from it. */
export const slopcameraSocialSite = defineSocialImageSite({
  name: "SlopCamera",
  description: "Images, diagrams, animation, 3D and video your coding agent can keep revising.",
  domain: "slopcamera.com",
  // The camera glyph behind /icon.png, the header mark and the manifest icons.
  icon: { kind: "mark", src: `data:image/svg+xml;base64,${markSvg.toString("base64")}` },
  // Light-mode Catppuccin, the palette the site renders by default.
  theme: { accent: "#1e66f5", background: "#eff1f5", foreground: "#4c4f69", muted: "#6c6f85" },
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

export const homeSocialImage = socialImage("og.png")

/**
 * Card copy for pages whose own title or description does not fit the card as
 * written. A share card holds a two-line headline and a two-line description,
 * so these say the same thing in fewer words; the page keeps its full title
 * and meta description. Keyed by the page's document path.
 */
export const socialCardCopy: Readonly<Record<string, Readonly<{ headline?: string; description?: string }>>> = Object.freeze({
  "blog/index.html": { description: "Posts from Hraness on how SlopCamera's techniques work and when to use them." },
  "blog/one-shot-render-vs-installed-techniques.html": {
    headline: "What the second render takes",
    description: "Revisions, variants, and checks on four gallery examples, measured at one commit.",
  },
  "blog/make-video-with-claude-code.html": { description: "Match each shot to the engine that draws it, then have your agent write and render it." },
  "blog/editable-diagrams-with-coding-agents.html": { description: "Keep a diagram as a short JSON file your agent edits, checks, and re-renders." },
  "blog/headless-blender-manim-cadquery-for-agents.html": {
    headline: "Headless Blender, Manim and CadQuery",
    description: "A scene your agent keeps as a short program is easy to revise and re-render.",
  },
  "blog/introducing-slopcamera.html": { description: "Images, diagrams, animation, 3D scenes, and video, all from source files your agent revises." },
  "blog/how-slopcamera-uses-algal.html": {
    headline: "Character behavior with ALGAL",
    description: "The same scene and seed always bake the same motion.",
  },
  "docs/index.html": { description: "Install SlopCamera, set it up for your agent, and follow the task guides." },
  "docs/tutorials/first-animation.html": { description: "Render an eight-second HTML title, change it, and keep both results." },
  "docs/how-to/render-motion-graphics.html": { description: "Render an HTML, SVG, shader, or Three.js scene to video and keep its source." },
  "docs/how-to/vectorize-images.html": { description: "Trace a raster illustration locally and check its SVG fidelity." },
  "docs/how-to/generate-media.html": { description: "Images, video, speech, and transcripts through Vercel AI Gateway or Hraness Credits." },
  "docs/how-to/parametric-design.html": { description: "Compile an editable study, change coupled dimensions, and compare renders." },
  "docs/how-to/cinematic-worlds.html": {
    headline: "Direct a 3D scene",
    description: "Plan camera moves, lighting, and effects, then review before selecting.",
  },
  "docs/how-to/native-films.html": { headline: "Render native films from source" },
  "docs/reference/techniques.html": {
    headline: "Techniques catalog",
    description: "Every packaged technique by job, with its first command and guide.",
  },
  "docs/reference/diagram-format.html": { description: "Version-one diagram source, its five render outputs, and configuration." },
  "docs/reference/html-profiles.html": {
    headline: "HTML render profiles",
    description: "The seven locked browser render profiles and their shared contract.",
  },
  "docs/reference/spatial-scenes.html": { description: "The .scene.json contract for entities, patches, cameras, and render profiles." },
  "docs/reference/vectorization.html": { description: "How image vectorize traces a raster into SVG and checks its fidelity." },
  "docs/reference/gateway-generation.html": { description: "Image, video, speech, and transcription through your own Gateway access." },
  "docs/reference/video-pipeline.html": { description: "The FFmpeg-backed project model, from recordings to delivery variants." },
  "docs/reference/native-engines.html": { description: "How SlopCamera runs Blender, CadQuery, and Manim jobs from kept source." },
  "docs/explanation/architecture.html": {
    headline: "How SlopCamera works",
    description: "What stays editable after a render and which work runs where.",
  },
  "docs/explanation/why-slopcamera.html": {
    headline: "Why SlopCamera",
    description: "Why an agent writes a short source file instead of a whole render pipeline.",
  },
  "docs/explanation/slopcamera-vs-remotion.html": { description: "Source formats, rendering, licenses, and when to use each or both." },
  "docs/explanation/slopcamera-vs-hyperframes.html": {
    headline: "SlopCamera vs HyperFrames",
    description: "HTML video versus several engines, licenses, and using both.",
  },
  "docs/explanation/remotion-alternatives-for-coding-agents.html": { description: "Video and graphics tools an agent can use instead of or beside Remotion." },
})

function pageCard(document: string, page: SocialImagePage): SocialImagePage {
  return { ...page, ...socialCardCopy[document] }
}

function docsSocialPage(page: DocsPage): SocialImagePage {
  return pageCard(docsDocumentForPage(page), {
    // The docs index is titled "Documentation" on the site; under a "Docs"
    // eyebrow the card names the product instead of repeating the section.
    headline: page.section === "index" ? "SlopCamera documentation" : page.title,
    description: page.description,
    eyebrow: page.section === "index" ? "Docs" : docsSectionLabels[page.section],
  })
}

/** Each HTML document's card: page routes pass only their own copy. */
export const socialImagesByDocument: Readonly<Record<string, SocialImage>> = Object.freeze({
  [blogIndexDocument]: socialImage("og/blog.png",
    pageCard(blogIndexDocument, { headline: blogIndex.heading, description: blogIndex.description, eyebrow: "Blog" })),
  ...Object.fromEntries(blogPosts.map(post => [blogDocumentForPost(post),
    socialImage(`og/blog/${post.slug}.png`,
      pageCard(blogDocumentForPost(post), { headline: post.title, description: post.description, eyebrow: post.eyebrow }))])),
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

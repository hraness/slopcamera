import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { Resvg } from "@resvg/resvg-js"
import {
  createSocialImageCard, defineSocialImageSite, socialImageAlt, socialImageSiteDetails,
  type SocialImagePage,
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
  name: "Slopcamera",
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

function docsSocialPage(page: DocsPage): SocialImagePage {
  return {
    headline: page.title, description: page.description,
    eyebrow: page.section === "index" ? "Docs" : docsSectionLabels[page.section],
  }
}

/** Each HTML document's card: page routes pass only their own copy. */
export const socialImagesByDocument: Readonly<Record<string, SocialImage>> = Object.freeze({
  [blogIndexDocument]: socialImage("og/blog.png", { headline: blogIndex.heading, description: blogIndex.description, eyebrow: "Blog" }),
  ...Object.fromEntries(blogPosts.map(post => [blogDocumentForPost(post),
    socialImage(`og/blog/${post.slug}.png`, { headline: post.title, description: post.description, eyebrow: post.eyebrow })])),
  ...Object.fromEntries(docPages.map(page => [docsDocumentForPage(page),
    socialImage(`og/${docsDocumentForPage(page).replace(/\.html$/u, "")}.png`, docsSocialPage(page))])),
})

export function socialImageForDocument(document: string): SocialImage {
  return socialImagesByDocument[document] ?? homeSocialImage
}

/** Every card the site publishes, the home card first. */
export const socialImages: readonly SocialImage[] = [homeSocialImage, ...Object.values(socialImagesByDocument)]

/** Rasterize one card with the shared template. */
export async function renderSocialImage(image: SocialImage): Promise<Uint8Array> {
  const card = createSocialImageCard(socialImageSiteDetails(slopcameraSocialSite, image.page))
  const svg = await satori(card.element, {
    fonts: card.fonts.map(font => ({ data: font.data, name: font.name, style: font.style, weight: font.weight })),
    height: card.height, width: card.width,
  })
  return new Uint8Array(new Resvg(svg).render().asPng())
}

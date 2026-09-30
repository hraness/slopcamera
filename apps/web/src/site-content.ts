import { homepageMarketingSlots, homeSocialImageAlt, productName, shellProductNameSlot } from "./messaging"
import { renderHranessSiteFooter } from "@hraness/site-footer"
import { AskAiAboutThis } from "@hraness/ui"
import { PlatformInstall, type PlatformInstallTarget } from "@hraness/design-kit/react/platform-install"
import { PlatformBadges } from "@hraness/design-kit/react/server"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  docsCanonicalUrl, docsJsonLd, docsMarkdownUrl, docsPageForDocument,
  renderDocsArticleHeader, renderDocsBody, renderDocsNav,
} from "./docs"
import { highlightCode, type SyntaxLanguage } from "@hraness/design-kit/syntax-highlighting"
import { archiveInstall, publishedRelease, sourceInstall } from "./published-release"
import { interfaceExamples } from "./site-code-examples"
import { renderExampleGallery, renderExampleHero } from "./example-gallery"
import { isBlogDocument } from "./blog-registry"

// Existing content producers run within the ordinary page's captured SSR
// graph. They introduce no client renderer and retain their public APIs.
export function renderAskAiAboutThis(canonicalUrl: string): string {
  return renderToStaticMarkup(createElement(AskAiAboutThis, {
    className: "slopcamera-ask-ai",
    url: canonicalUrl,
  }))
}

/** The CLI is one Bun package, so every platform runs the same archive install. */
export const platformInstallTargets: readonly PlatformInstallTarget[] = [
  { id: "macos", command: archiveInstall.command, shell: "Terminal", note: "Requires Bun 1.3.14+" },
  { id: "linux", command: archiveInstall.command, shell: "Terminal", note: "Requires Bun 1.3.14+" },
  { id: "windows", command: archiveInstall.command, shell: "PowerShell", note: "Requires Bun 1.3.14+" },
]

/** Server markup for the shared design-kit install tabs. The static site has no
 * React client, so src/platform-install.ts enhances this markup in the browser. */
export function renderPlatformInstall(): string {
  return renderToStaticMarkup(createElement(PlatformInstall, {
    detect: false,
    id: "cli-install",
    label: "Operating system",
    platforms: platformInstallTargets,
  }))
}

export function renderPlatformBadges(): string {
  return renderToStaticMarkup(createElement(PlatformBadges, {
    platforms: platformInstallTargets.map(target => target.id),
  }))
}

function renderAppearanceMenu(): string {
  return `<div aria-busy="true" class="hraness-design-theme-toggle"
      data-display="icons" data-hraness-appearance-menu data-presentation="menu"
      data-ready="false" data-theme-value="system">
    <button aria-controls="appearance-menu" aria-expanded="false" aria-haspopup="menu"
      aria-label="Appearance: System" class="hraness-design-theme-toggle__trigger"
      disabled type="button">
      <span aria-hidden="true" data-current-appearance-icon="system"></span>
    </button>
    <div class="hraness-design-theme-toggle__popover" hidden>
      <div aria-label="Appearance" class="hraness-design-theme-toggle__menu"
        id="appearance-menu" role="menu">
        <div aria-checked="false" class="hraness-design-theme-toggle__item"
          data-theme-value="light" role="menuitemradio" tabindex="-1">
          <span aria-hidden="true" data-appearance-icon="light"></span><span>Light</span>
        </div>
        <div aria-checked="false" class="hraness-design-theme-toggle__item"
          data-theme-value="dark" role="menuitemradio" tabindex="-1">
          <span aria-hidden="true" data-appearance-icon="dark"></span><span>Dark</span>
        </div>
        <div aria-checked="true" class="hraness-design-theme-toggle__item"
          data-selected="true" data-theme-value="system" role="menuitemradio" tabindex="-1">
          <span aria-hidden="true" data-appearance-icon="system"></span><span>System</span>
        </div>
      </div>
    </div>
  </div>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character)
}

export function renderHighlightedCode(value: string, language: SyntaxLanguage): string {
  const highlighted = highlightCode(value, language, { styles: "classes" })
  return `<code class="${highlighted.className}" data-language="${highlighted.language}">${highlighted.html}</code>`
}

/** The in-flow product content footer shared by every ordinary document. It
 * lands immediately before the canonical Hraness network footer, reuses the
 * header's own destinations and metallic mark. Presentation comes from design-kit's `hraness-marketing-footer`
 * grammar; product links and disclosures stay outside the shared footer. */
function renderSiteContentFooter(): string {
  return `<footer aria-label="SlopCamera" class="hraness-marketing-footer" data-hraness-marketing="footer">
      <div class="hraness-marketing-footer__inner">
        <a aria-label="SlopCamera home" class="hraness-marketing-footer__brand" data-foil="" href="/"><span aria-hidden="true" class="hraness-foil-mark" data-foil=""><img alt="" class="hraness-foil-mark__image" height="22" src="/marks/slopcamera.svg" width="22"><span aria-hidden="true" class="hraness-foil-mark__paint"></span></span><span class="hraness-marketing-footer__name">SlopCamera</span></a>
        <nav aria-label="Footer navigation" class="hraness-marketing-footer__nav">
          <a href="/docs">Docs</a>
          <a href="https://github.com/hraness/slopcamera">GitHub</a>
          <a href="/#install">Install Slopcamera</a>
        </nav>
      </div>
    </footer>`
}

type CopyCommandOptions = Readonly<{
  alternateCommand: string
  command: string
  id: string
}>

function renderCopyCommand(options: CopyCommandOptions): string {
  const alternateCommand = escapeHtml(options.alternateCommand)
  const command = highlightCode(options.command, "shell", { styles: "classes" })
  const id = escapeHtml(options.id)
  return `<div class="copy-command {{INSTALL_COPY_CLASS}}" data-copy-command>
    <code class="copy-command__value ${command.className} {{INSTALL_VALUE_CLASS}}" data-language="shell" data-copy-command-value tabindex="0">${command.html}</code>
    <button aria-describedby="${id}" aria-label="Copy the Agent Skill install command" class="copy-command__button {{INSTALL_IDLE_CLASS}}"
      data-copy-idle-class="copy-command__button {{INSTALL_IDLE_CLASS}}"
      data-copy-copied-class="copy-command__button {{INSTALL_COPIED_CLASS}}"
      data-copy-failed-class="copy-command__button {{INSTALL_FAILED_CLASS}}"
      data-copy-command-button hidden type="button">Copy</button>
    <p class="copy-command__note {{INSTALL_COPY_NOTE_CLASS}}">For Claude Code: <code class="{{INSTALL_NOTE_CODE_CLASS}}">${alternateCommand}</code></p>
    <p aria-atomic="true" aria-live="polite" class="copy-command__status {{INSTALL_STATUS_CLASS}}"
      data-copy-command-status id="${id}"></p>
    <template data-copy-command-fallback><textarea class="{{INSTALL_FALLBACK_CLASS}}" readonly></textarea></template>
  </div>`
}

export type SiteDocument = "index.html" | "404.html" | `docs/${string}.html` | `blog/${string}.html`
/** Pre-rendered /blog page strings produced by src/blog-content.ts in the
 * build entrypoint from sealed inputs and pinned packages. */
export type BlogPageContent = Readonly<{
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
export type SiteAssets = Readonly<{
  themePath: string
  analyticsPath: string | null
  docBodies?: Readonly<Record<string, string>>
  blogPages?: Readonly<Record<string, BlogPageContent>>
  /** The 404 page's enhancement script, loaded only there. */
  statusPagePath?: string
  /** The shared design-kit status page markup, rendered by the build entrypoint. */
  statusPage?: string
  /**
   * Each docs and blog document's share card, rendered by the build from the
   * site's one @hraness/web-discovery declaration (src/social-image.ts).
   */
  socialImages?: Readonly<Record<string, SiteSocialImage>>
}>
export type SiteSocialImage = Readonly<{ url: string; alt: string; width: number; height: number }>

function socialImageFor(document: SiteDocument, assets: SiteAssets): SiteSocialImage {
  const image = assets.socialImages?.[document]
  if (image === undefined) throw new Error(`Social image missing for ${document}`)
  return image
}

function renderDocsFooter(slug: string): string {
  const sourcePath = `apps/web/src/docs/${slug}.md`
  return `<p>This page's source: <a href="https://github.com/hraness/slopcamera/blob/main/${sourcePath}"><code>${sourcePath}</code></a></p>`
}

export function siteContentSlots(document: SiteDocument, assets: SiteAssets): ReadonlyArray<readonly [string, string, number]> {
  if (!/^\/assets\/theme-[a-f0-9]{12}\.js$/u.test(assets.themePath)
    || (assets.analyticsPath !== null && !/^\/assets\/analytics-[a-f0-9]{12}\.js$/u.test(assets.analyticsPath))
    || (assets.statusPagePath !== undefined && !/^\/assets\/status-page-[a-f0-9]{12}\.js$/u.test(assets.statusPagePath))) {
    throw new Error("Site content requires exact local fingerprinted script paths")
  }
  const common: ReadonlyArray<readonly [string, string, number]> = [
    shellProductNameSlot(document),
    ["{{APPEARANCE_MENU}}", renderAppearanceMenu(), 1],
    ["{{HRANESS_SITE_FOOTER}}", `${renderSiteContentFooter()}\n    ${renderHranessSiteFooter({ mailingList: { kind: "none" }, support: {
      id: "slopcamera", name: productName, updates: false,
      valueProposition: "Support ongoing development of local media tools for agents.",
    } })}`, 1],
    ["{{THEME_ASSET}}", assets.themePath, 1],
  ]
  if (document === "404.html") {
    if (assets.statusPage === undefined || assets.statusPagePath === undefined
      || !assets.statusPage.startsWith('<div class="hraness-status-page"')) {
      throw new Error("The 404 page requires the shared status page markup and script")
    }
    return [...common, ["{{STATUS_PAGE}}", assets.statusPage, 1], ["{{STATUS_PAGE_ASSET}}", assets.statusPagePath, 1]]
  }
  if (isBlogDocument(document)) {
    const page = assets.blogPages?.[document]
    if (page === undefined) throw new Error(`Blog page content missing for ${document}`)
    return [...common,
      ["{{BLOG_TITLE}}", escapeHtml(page.title), 3],
      ["{{BLOG_DESCRIPTION}}", escapeHtml(page.description), 3],
      ["{{BLOG_CANONICAL}}", page.canonical, 2],
      ["{{BLOG_ROBOTS}}", page.robots, 1],
      ["{{BLOG_MARKDOWN}}", page.markdown, 1],
      ["{{BLOG_OG_TYPE}}", page.ogType, 1],
      ["{{BLOG_ARTICLE_META}}", page.articleMeta, 1],
      ["{{BLOG_JSONLD}}", page.jsonLd, 1],
      ["{{BLOG_MAIN}}", page.main, 1],
      ["{{BLOG_IMAGE_URL}}", socialImageFor(document, assets).url, 2],
      ["{{BLOG_IMAGE_ALT}}", escapeHtml(socialImageFor(document, assets).alt), 2],
    ]
  }
  const docsPage = docsPageForDocument(document)
  if (docsPage !== undefined) {
    const body = assets.docBodies?.[document]
    if (body === undefined) throw new Error(`Documentation body missing for ${document}`)
    const social = socialImageFor(document, assets)
    return [...common,
      ["{{DOC_TITLE}}", escapeHtml(docsPage.title), 3],
      ["{{DOC_DESCRIPTION}}", escapeHtml(docsPage.description), 3],
      ["{{DOC_CANONICAL}}", docsCanonicalUrl(docsPage), 2],
      ["{{DOC_MARKDOWN}}", docsMarkdownUrl(docsPage), 1],
      ["{{DOC_JSONLD}}", docsJsonLd(docsPage, body), 1],
      ["{{DOC_IMAGE_URL}}", social.url, 2],
      ["{{DOC_IMAGE_ALT}}", escapeHtml(social.alt), 2],
      ["{{DOC_IMAGE_WIDTH}}", String(social.width), 1],
      ["{{DOC_IMAGE_HEIGHT}}", String(social.height), 1],
      ["{{DOC_NAV}}", renderDocsNav(docsPage), 1],
      ["{{DOC_HEADER}}", renderDocsArticleHeader(docsPage), 1],
      ["{{DOC_BODY}}", renderDocsBody(body), 1],
      ["{{DOC_FOOTER}}", renderDocsFooter(docsPage.slug), 1],
    ]
  }
  return [...common, ...homepageMarketingSlots,
    ["{{HOME_IMAGE_ALT}}", escapeHtml(assets.socialImages?.[document]?.alt ?? homeSocialImageAlt), 2],
    ["{{ASK_AI_ABOUT_THIS}}", renderAskAiAboutThis("https://slopcamera.com/"), 1],
    ["{{RELEASE_VERSION}}", publishedRelease.version, 1],
    ["{{RELEASE_URL}}", publishedRelease.releaseUrl, 1],
    ["{{SOURCE_INSTALL_URL}}", sourceInstall.guideUrl, 1],
    ["{{EXAMPLE_HERO}}", renderExampleHero(), 1],
    ["{{EXAMPLE_GALLERY}}", renderExampleGallery(), 1],
    ["{{SKILL_EXAMPLE}}", renderHighlightedCode(interfaceExamples.skill, "shell"), 1],
    ["{{CLI_EXAMPLE}}", renderHighlightedCode(interfaceExamples.cli, "shell"), 1],
    ["{{SDK_EXAMPLE}}", renderHighlightedCode(interfaceExamples.sdk, "typescript"), 1],
    ["{{MCP_EXAMPLE}}", renderHighlightedCode(interfaceExamples.mcp, "shell"), 1],
    ["{{ANALYTICS_SCRIPT}}", assets.analyticsPath === null ? "" : `<script src="${assets.analyticsPath}" type="module"></script>`, 1],
    ["{{PLATFORM_BADGES}}", renderPlatformBadges(), 1],
    ["{{PLATFORM_INSTALL}}", renderPlatformInstall(), 1],
    ["{{RELEASE_INSTALL_COMMANDS}}", renderCopyCommand({
      alternateCommand: archiveInstall.alternateSkillCommand,
      command: archiveInstall.skillCommand,
      id: "skill-install-copy-status",
    }), 1],
  ]
}

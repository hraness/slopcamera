import { renderHranessSiteFooter } from "@hraness/site-footer"
import { AskAiAboutThis } from "@hraness/ui"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  docsCanonicalUrl, docsJsonLd, docsMarkdownUrl, docsPageForDocument, docsSocialImage,
  renderDocsArticleHeader, renderDocsBody, renderDocsNav,
} from "./docs"
import { highlightCode, type SyntaxLanguage } from "@hraness/design-kit/syntax-highlighting"
import { archiveInstall, publishedRelease, sourceInstall } from "./published-release"
import { interfaceExamples } from "./site-code-examples"
import { renderExampleGallery, renderExampleHero } from "./example-gallery"

// Existing content producers run within the ordinary page's captured SSR
// graph. They introduce no client renderer and retain their public APIs.
export function renderAskAiAboutThis(canonicalUrl: string): string {
  return renderToStaticMarkup(createElement(AskAiAboutThis, {
    className: "slopcamera-ask-ai",
    url: canonicalUrl,
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

// The authored Slopcamera camera mark (apps/web/src/icon.svg, byte-identical to
// apps/desktop/assets/brand-emoji/slopcamera.com.svg), normalized for inlining:
// the labelled link owns the accessible name, so the vector stays decorative and
// its gradient id is namespaced against other inline SVGs on the page.
const SLOPCAMERA_MARK_SVG = `<svg aria-hidden="true" focusable="false" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="slopcamera-footer-lens" x1="14" y1="16" x2="50" y2="50" gradientUnits="userSpaceOnUse"><stop stop-color="#fff3c2"/><stop offset=".55" stop-color="#f6b94a"/><stop offset="1" stop-color="#e97835"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="#090a12"/><path d="M12 24h10l4-6h12l4 6h10v27H12Z" fill="#16162a" stroke="url(#slopcamera-footer-lens)" stroke-linejoin="round" stroke-width="2.4"/><circle cx="32" cy="36" r="10" fill="none" stroke="url(#slopcamera-footer-lens)" stroke-width="3"/><circle cx="32" cy="36" r="5" fill="#f6b94a"/><circle cx="47" cy="29" r="1.7" fill="#fff3c2"/></svg>`

/** The in-flow product content footer shared by every ordinary document. It
 * lands immediately before the canonical Hraness network footer, reuses the
 * header's own destinations, and carries the authored camera mark rather than
 * an emoji. Presentation comes from design-kit's `hraness-marketing-footer`
 * grammar; product links and disclosures stay outside the shared footer. */
function renderSiteContentFooter(): string {
  return `<footer aria-label="Slopcamera" class="hraness-marketing-footer" data-hraness-marketing="footer">
      <div class="hraness-marketing-footer__inner">
        <a aria-label="Slopcamera home" class="hraness-marketing-footer__brand" href="/">${SLOPCAMERA_MARK_SVG}<span class="hraness-marketing-footer__name">Slopcamera</span></a>
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
    <button aria-describedby="${id}" aria-label="Copy install commands" class="copy-command__button {{INSTALL_IDLE_CLASS}}"
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

export type SiteDocument = "index.html" | "404.html" | `docs/${string}.html`
export type SiteAssets = Readonly<{
  themePath: string
  analyticsPath: string | null
  docBodies?: Readonly<Record<string, string>>
}>

function renderDocsFooter(slug: string): string {
  const sourcePath = `apps/web/src/docs/${slug}.md`
  return `<p>This page's source: <a href="https://github.com/hraness/slopcamera/blob/main/${sourcePath}"><code>${sourcePath}</code></a>.</p>`
}

export function siteContentSlots(document: SiteDocument, assets: SiteAssets): ReadonlyArray<readonly [string, string, number]> {
  if (!/^\/assets\/theme-[a-f0-9]{12}\.js$/u.test(assets.themePath)
    || (assets.analyticsPath !== null && !/^\/assets\/analytics-[a-f0-9]{12}\.js$/u.test(assets.analyticsPath))) {
    throw new Error("Site content requires exact local fingerprinted script paths")
  }
  const common: ReadonlyArray<readonly [string, string, number]> = [
    ["{{APPEARANCE_MENU}}", renderAppearanceMenu(), 1],
    ["{{HRANESS_SITE_FOOTER}}", `${renderSiteContentFooter()}\n    ${renderHranessSiteFooter({ mailingList: { kind: "none" }, support: {
      id: "slopcamera", name: "Slopcamera", updates: false,
      valueProposition: "Support ongoing development of local visual tools for agents.",
    } })}`, 1],
    ["{{THEME_ASSET}}", assets.themePath, 1],
  ]
  if (document === "404.html") return common
  const docsPage = docsPageForDocument(document)
  if (docsPage !== undefined) {
    const body = assets.docBodies?.[document]
    if (body === undefined) throw new Error(`Documentation body missing for ${document}`)
    const social = docsSocialImage(docsPage)
    return [...common,
      ["{{DOC_TITLE}}", escapeHtml(docsPage.title), 3],
      ["{{DOC_DESCRIPTION}}", escapeHtml(docsPage.description), 3],
      ["{{DOC_CANONICAL}}", docsCanonicalUrl(docsPage), 2],
      ["{{DOC_MARKDOWN}}", docsMarkdownUrl(docsPage), 1],
      ["{{DOC_JSONLD}}", docsJsonLd(docsPage), 1],
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
  return [...common,
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
    ["{{RELEASE_INSTALL_COMMANDS}}", renderCopyCommand({
      alternateCommand: archiveInstall.alternateSkillCommand,
      command: `${archiveInstall.command}\n${archiveInstall.skillCommand}`,
      id: "skill-install-copy-status",
    }), 1],
  ]
}

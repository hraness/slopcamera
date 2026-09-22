import { siteShellClassNames } from "./site-shell.stylex"
import { siteInstallClassNames } from "./site-install.stylex"
import { siteDocsClassNames } from "./site-docs.stylex"
import { docsPageForDocument } from "./docs"
import { siteContentSlots, type SiteAssets, type SiteDocument } from "./site-content"
import { assertCompiledSiteClass, replaceSiteSlot } from "./site-template"

const commonSlots = [
  ["{{SITE_SKIP_CLASS}}", siteShellClassNames.skip, 1],
  ["{{SITE_HEADER_CLASS}}", siteShellClassNames.header, 1],
  ["{{SITE_WORDMARK_CLASS}}", siteShellClassNames.wordmark, 1],
  ["{{SITE_BRAND_MARK_CLASS}}", siteShellClassNames.brandMark, 1],
  ["{{SITE_ACTIONS_CLASS}}", siteShellClassNames.actions, 1],
  ["{{SITE_NAVIGATION_CLASS}}", siteShellClassNames.navigation, 1],
] as const
const homeSlots = [
  ["{{SITE_HOME_NAVIGATION_LINK_CLASS}}", siteShellClassNames.homeNavigationLink, 4],
  ["{{SITE_NAVIGATION_ACTION_CLASS}}", siteShellClassNames.navigationAction, 1],
  ["{{INSTALL_NOTE_CLASS}}", siteInstallClassNames.note, 1],
  ["{{INSTALL_PANEL_NOTE_CLASS}}", siteInstallClassNames.panelNote, 2],
  ["{{INSTALL_PANEL_LINK_CLASS}}", siteInstallClassNames.panelLink, 2],
  ["{{INSTALL_LABEL_CLASS}}", siteInstallClassNames.label, 1],
  ["{{INSTALL_COPY_CLASS}}", siteInstallClassNames.command, 1],
  ["{{INSTALL_VALUE_CLASS}}", siteInstallClassNames.value, 1],
  ["{{INSTALL_IDLE_CLASS}}", siteInstallClassNames.idle, 2],
  ["{{INSTALL_COPIED_CLASS}}", siteInstallClassNames.copied, 1],
  ["{{INSTALL_FAILED_CLASS}}", siteInstallClassNames.failed, 1],
  ["{{INSTALL_COPY_NOTE_CLASS}}", siteInstallClassNames.copyNote, 1],
  ["{{INSTALL_NOTE_CODE_CLASS}}", siteInstallClassNames.noteCode, 1],
  ["{{INSTALL_STATUS_CLASS}}", siteInstallClassNames.status, 1],
  ["{{INSTALL_FALLBACK_CLASS}}", siteInstallClassNames.fallback, 1],
] as const
const recoverySlots = [
  ["{{SITE_NAVIGATION_LINK_CLASS}}", siteShellClassNames.navigationLink, 2],
  ["{{SITE_RECOVERY_CLASS}}", siteShellClassNames.recovery, 1],
  ["{{SITE_RECOVERY_LABEL_CLASS}}", siteShellClassNames.recoveryLabel, 1],
  ["{{SITE_RECOVERY_HEADING_CLASS}}", siteShellClassNames.recoveryHeading, 1],
  ["{{SITE_RECOVERY_PARAGRAPH_CLASS}}", siteShellClassNames.recoveryParagraph, 2],
  ["{{SITE_RECOVERY_LINK_CLASS}}", siteShellClassNames.recoveryLink, 4],
  ["{{SITE_RECOVERY_ACTION_CLASS}}", siteShellClassNames.recoveryAction, 1],
] as const
const docsSlots = [
  ["{{SITE_NAVIGATION_LINK_CLASS}}", siteShellClassNames.navigationLink, 2],
] as const
// Documentation markup emits DOCS_*_CLASS tokens at variable counts, so the
// sealed graph fills them from this closed inventory instead of slot counts.
const docsClassSlots = {
  "{{DOCS_LAYOUT_CLASS}}": siteDocsClassNames.layout,
  "{{DOCS_NAV_CLASS}}": siteDocsClassNames.nav,
  "{{DOCS_MOBILE_NAV_CLASS}}": siteDocsClassNames.mobileNav,
  "{{DOCS_NAV_SUMMARY_CLASS}}": siteDocsClassNames.navSummary,
  "{{DOCS_NAV_CONTEXT_CLASS}}": siteDocsClassNames.navContext,
  "{{DOCS_MOBILE_LINKS_CLASS}}": siteDocsClassNames.mobileLinks,
  "{{DOCS_NAV_HOME_CLASS}}": siteDocsClassNames.navHome,
  "{{DOCS_NAV_SECTION_CLASS}}": siteDocsClassNames.navSection,
  "{{DOCS_NAV_SECTION_LABEL_CLASS}}": siteDocsClassNames.navSectionLabel,
  "{{DOCS_NAV_LIST_CLASS}}": siteDocsClassNames.navList,
  "{{DOCS_NAV_LINK_CLASS}}": siteDocsClassNames.navLink,
  "{{DOCS_NAV_LINK_CURRENT_CLASS}}": siteDocsClassNames.navLinkCurrent,
  "{{DOCS_ARTICLE_CLASS}}": siteDocsClassNames.article,
  "{{DOCS_SECTION_LABEL_CLASS}}": siteDocsClassNames.sectionLabel,
  "{{DOCS_HEADING_CLASS}}": siteDocsClassNames.heading,
  "{{DOCS_LEDE_CLASS}}": siteDocsClassNames.lede,
  "{{DOCS_H2_CLASS}}": siteDocsClassNames.h2,
  "{{DOCS_H3_CLASS}}": siteDocsClassNames.h3,
  "{{DOCS_P_CLASS}}": siteDocsClassNames.p,
  "{{DOCS_LIST_CLASS}}": siteDocsClassNames.list,
  "{{DOCS_LIST_ITEM_CLASS}}": siteDocsClassNames.listItem,
  "{{DOCS_LINK_CLASS}}": siteDocsClassNames.link,
  "{{DOCS_CODE_CLASS}}": siteDocsClassNames.code,
  "{{DOCS_PRE_CLASS}}": siteDocsClassNames.pre,
  "{{DOCS_PRE_CODE_CLASS}}": siteDocsClassNames.preCode,
  "{{DOCS_BLOCKQUOTE_CLASS}}": siteDocsClassNames.blockquote,
  "{{DOCS_TABLE_WRAP_CLASS}}": siteDocsClassNames.tableWrap,
  "{{DOCS_TABLE_CLASS}}": siteDocsClassNames.table,
  "{{DOCS_TH_CLASS}}": siteDocsClassNames.th,
  "{{DOCS_TD_CLASS}}": siteDocsClassNames.td,
  "{{DOCS_HR_CLASS}}": siteDocsClassNames.hr,
  "{{DOCS_FOOTER_CLASS}}": siteDocsClassNames.footnote,
  "{{DOCS_ANCHOR_CLASS}}": siteDocsClassNames.anchor,
} as const

/** Produce the complete authored document once, before the public compiler
 * seals it. No class, stylesheet, script or content is rewritten afterward. */
export function renderSiteDocument(template: string, document: SiteDocument, assets: SiteAssets, stylesheetLinks: string): string {
  const isDocs = docsPageForDocument(document) !== undefined
  const documentSlots = document === "index.html" ? homeSlots
    : document === "404.html" ? recoverySlots
    : isDocs ? docsSlots
    : null
  if (documentSlots === null) throw new Error("Unexpected site document")
  let rendered = template
  // Copy content contains finite recipe slots. Fill it before the closed class
  // inventory; both substitutions are completed inside the sealed SSR graph.
  for (const [placeholder, value, count] of siteContentSlots(document, assets)) {
    rendered = replaceSiteSlot(rendered, placeholder, value, count)
  }
  for (const [placeholder, className, count] of [...commonSlots, ...documentSlots]) {
    assertCompiledSiteClass(className, placeholder)
    rendered = replaceSiteSlot(rendered, placeholder, className, count)
  }
  if (isDocs) {
    for (const [placeholder, className] of Object.entries(docsClassSlots)) {
      assertCompiledSiteClass(className, placeholder)
      rendered = rendered.replaceAll(placeholder, className)
    }
    if (/\{\{DOCS_[A-Z_]+\}\}/u.test(rendered)) throw new Error("Documentation page kept an unresolved class token")
  }
  rendered = replaceSiteSlot(rendered, "{{SITE_STYLES}}", stylesheetLinks, 1)
  if (/\{\{[^{}]*\}\}/u.test(rendered)) throw new Error("Site document contains an unresolved placeholder")
  return rendered
}

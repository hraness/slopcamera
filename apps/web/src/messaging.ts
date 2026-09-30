import { contract, productId, canonicalUrl, messaging } from "./portfolio-messaging.generated.json"

if (contract !== "hraness.product-messaging/v1" || productId !== "slopcamera") {
  throw new Error("The website requires the canonical slopcamera messaging snapshot.")
}
if (!canonicalUrl.startsWith("https://")) throw new Error("The product origin must use HTTPS.")

export const productMessaging = messaging
export const productName = productMessaging.names.name

/** Pure planning value; verified against the shared social-image declaration. */
export const homeSocialImageAlt = `${productName}: ${productMessaging.short}`

/** Keep canonical text inside the JSON-LD script's text boundary. */
export function serializeMarketingJson(value: string): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c")
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character)
}

/** Resolved by the existing sealed SSR producer; templates carry no local copy. */
export const homepageMarketingSlots: ReadonlyArray<readonly [string, string, number]> = [
  ["{{PRODUCT_JSON_NAME}}", serializeMarketingJson(productName), 2],
  ["{{PRODUCT_JSON_SOURCE_NAME}}", serializeMarketingJson(`${productName} source code`), 1],
  ["{{PRODUCT_JSON_TITLE}}", serializeMarketingJson(productMessaging.headings["home-search-title"]), 1],
  ["{{PRODUCT_JSON_DESCRIPTION}}", serializeMarketingJson(productMessaging.meta), 3],
  ["{{PRODUCT_DESCRIPTION}}", escapeHtml(productMessaging.meta), 3],
  ["{{PRODUCT_TITLE}}", escapeHtml(productMessaging.headings["home-search-title"]), 3],
  ["{{PRODUCT_NAME}}", escapeHtml(productName), 3],
  ["{{PRODUCT_PRIMARY_ACTION}}", escapeHtml(productMessaging.hero.primaryAction), 3],
  ["{{PRODUCT_SECONDARY_ACTION}}", escapeHtml(productMessaging.hero.secondaryAction ?? ""), 1],
  ["{{PRODUCT_EYEBROW}}", escapeHtml(productMessaging.headings["home-eyebrow"]), 1],
  ["{{PRODUCT_HERO_HEADING}}", escapeHtml(productMessaging.hero.heading), 1],
  ["{{PRODUCT_HERO_SUMMARY}}", escapeHtml(productMessaging.hero.summary), 1],
  ["{{PRODUCT_HEADING_WHY}}", escapeHtml(productMessaging.headings["home-why"]), 1],
  ["{{PRODUCT_HEADING_EXAMPLES}}", escapeHtml(productMessaging.headings["home-examples"]), 1],
  ["{{PRODUCT_HEADING_TECHNIQUES}}", escapeHtml(productMessaging.headings["home-techniques"]), 1],
  ["{{PRODUCT_HEADING_WORKFLOW}}", escapeHtml(productMessaging.headings["home-workflow"]), 1],
  ["{{PRODUCT_HEADING_INTERFACES}}", escapeHtml(productMessaging.headings["home-interfaces"]), 1],
  ["{{PRODUCT_HEADING_INSTALL}}", escapeHtml(productMessaging.headings["home-install"]), 1],
  ["{{PRODUCT_HEADING_DESIGN}}", escapeHtml(productMessaging.headings["home-design"]), 1],
  ["{{PRODUCT_HEADING_QUESTIONS}}", escapeHtml(productMessaging.headings["home-questions"]), 1],
  ["{{PRODUCT_HEADING_CTA}}", escapeHtml(productMessaging.headings["home-cta"]), 1],
  ["{{PRODUCT_HEADING_WHY_SOURCE}}", escapeHtml(productMessaging.headings["home-why-source"]), 1],
  ["{{PRODUCT_HEADING_WHY_CHECK}}", escapeHtml(productMessaging.headings["home-why-check"]), 1],
  ["{{PRODUCT_HEADING_WHY_REVISE}}", escapeHtml(productMessaging.headings["home-why-revise"]), 1],
  ["{{PRODUCT_HEADING_INTERFACE_SKILL}}", escapeHtml(productMessaging.headings["home-interface-skill"]), 1],
  ["{{PRODUCT_HEADING_INTERFACE_CLI}}", escapeHtml(productMessaging.headings["home-interface-cli"]), 1],
  ["{{PRODUCT_HEADING_INTERFACE_SDK}}", escapeHtml(productMessaging.headings["home-interface-sdk"]), 1],
  ["{{PRODUCT_HEADING_INTERFACE_MCP}}", escapeHtml(productMessaging.headings["home-interface-mcp"]), 1],
]

export function shellProductNameSlot(document: string): readonly [string, string, number] {
  const count = document === "index.html" ? 3
    : document === "404.html" ? 3
    : document.startsWith("blog/") ? 8
    : 7
  return ["{{SHELL_PRODUCT_NAME}}", escapeHtml(productName), count]
}

import { attachStatusPage } from "@hraness/design-kit-status/browser"

// The 404 page's only extra script: the shared status-page enhancement (dot
// glyph, "Did you mean", same-site Back). The page works without it.
function enhance(): void {
  const root = document.querySelector<HTMLElement>(".hraness-status-page")
  if (root !== null) attachStatusPage(root)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", enhance, { once: true })
} else {
  enhance()
}

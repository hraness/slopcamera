import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import type { CDPSession, Page } from "playwright-core"
import { selectMarketingFontRules } from "./site-marketing-font-diagnostic"

export const examplesFontOwners = [".hraness-marketing-hero__heading", ".hraness-marketing-hero__summary",
  ".hraness-marketing-hero__boundary", "#closing > h2", "#closing > .hraness-marketing-cta__summary",
  "#closing > .hraness-marketing-cta__actions > a:nth-child(1)", "#closing > .hraness-marketing-cta__actions > a:nth-child(2)",
  "#closing > .hraness-marketing-cta__footnote"] as const
const properties = ["font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant",
  "font-variant-numeric", "font-variant-ligatures", "font-feature-settings", "font-variation-settings", "font-size-adjust",
  "font-optical-sizing", "font-kerning", "font-synthesis", "letter-spacing", "word-spacing", "text-rendering", "text-transform",
  "writing-mode", "direction", "line-height", "white-space", "width", "height", "max-width", "max-inline-size", "display",
  "padding-top", "padding-bottom", "padding-left", "padding-right", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "row-gap", "column-gap", "flex-wrap", "align-items", "justify-content", "box-sizing"] as const

/** A diagnostic has no authority over acceptance. Oversize evidence is an
 * explicit failure with its exact byte count and digest, never silent loss. */
export class ExamplesDiagnosticSizeError extends Error {
  readonly metadata: { kind: "examples-diagnostic-overflow"; accepted: false; bytes: number; limit: number; sha256: string }
  constructor(text: string, limit: number) {
    const bytes = Buffer.byteLength(text, "utf8")
    super(`Examples diagnostic exceeds ${limit} UTF-8 bytes: ${bytes}`)
    this.metadata = { kind: "examples-diagnostic-overflow", accepted: false, bytes, limit,
      sha256: createHash("sha256").update(text).digest("hex") }
  }
}
export function encodeExamplesFailureDiagnostic(value: unknown): string {
  const text = JSON.stringify(value)
  assert.equal(typeof text, "string")
  if (Buffer.byteLength(text, "utf8") > 4 * 1024 * 1024) throw new ExamplesDiagnosticSizeError(text, 4 * 1024 * 1024)
  return text
}
/** Always rethrow the original failed comparison. Publication cannot turn a
 * first failing observation into success, even if the later snapshot agrees. */
export async function retainExamplesFailureDiagnostic(error: unknown, evidence: unknown,
  write: (text: string) => Promise<void>): Promise<never> {
  const failures = [error]
  try { await write(encodeExamplesFailureDiagnostic(error instanceof ExamplesDiagnosticSizeError
    ? { evidence, diagnosticOverflow: error.metadata } : evidence)) }
  catch (failure) {
    failures.push(failure)
    if (failure instanceof ExamplesDiagnosticSizeError) {
      try { await write(JSON.stringify(failure.metadata)) } catch (publication) { failures.push(publication) }
    }
  }
  if (failures.length > 1) throw new AggregateError(failures, "Original examples failure and diagnostic retention failure")
  throw error
}

/** One later read-only sample, after authoritative observations. No readiness
 * waits, font loads, frames, retries or DOM/style changes occur here. */
export async function collectExamplesFontDiagnostic(page: Page, origin: string) {
  const snapshot = await page.evaluate(({ selectors, properties, origin }) => {
    const string = (value: string) => {
      if (value.length > 512) throw new Error("Examples diagnostic string exceeds bound")
      return value
    }
    const rect = (box: DOMRect) => {
      const values = [box.x, box.y + scrollY, box.width, box.height]
      if (!values.every(Number.isFinite)) throw new Error("Nonfinite examples diagnostic rectangle")
      return values
    }
    const box = (node: Element) => {
      const style = getComputedStyle(node)
      return { rect: rect(node.getBoundingClientRect()), styles: Object.fromEntries(properties.map(key => [key, string(style.getPropertyValue(key))])) }
    }
    const exact = (selector: string) => {
      const nodes = document.querySelectorAll(selector)
      if (nodes.length !== 1 || !(nodes[0] instanceof HTMLElement)) throw new Error(`Missing exact diagnostic owner: ${selector}`)
      return nodes[0]
    }
    const elements = selectors.map(selector => {
      const node = exact(selector), range = document.createRange()
      range.selectNodeContents(node)
      const fragments = [...range.getClientRects()]
      if (fragments.length > 64) throw new Error("Examples diagnostic line fragments exceed bound")
      return { selector, ...box(node), textRects: fragments.map(rect), typedMaxInlineSize: string(String(node.computedStyleMap().get("max-inline-size"))) }
    })
    const closing = exact("#closing")
    if (closing.children.length !== 4) throw new Error("Examples diagnostic closing inventory changed")
    const children = [...closing.children].map((node, index) => ({ index, tag: node.tagName, ...box(node) }))
    const faces = [...document.fonts]
    if (faces.length > 32) throw new Error("Examples diagnostic FontFace inventory exceeds bound")
    const fonts = faces.map(face => ({ family: string(face.family), style: string(face.style), weight: string(face.weight),
      stretch: string(face.stretch), status: face.status, display: face.display, unicodeRange: string(face.unicodeRange) }))
    const entries = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter(entry => new URL(entry.name).pathname.endsWith(".woff2"))
    if (entries.length > 32) throw new Error("Examples diagnostic font resources exceed bound")
    const resources = entries.map(entry => {
      const url = new URL(entry.name)
      if (url.origin !== origin || url.search !== "" || url.hash !== "") throw new Error("Unowned diagnostic font resource")
      const values = [entry.startTime, entry.duration, entry.transferSize, entry.encodedBodySize, entry.decodedBodySize, entry.responseStatus]
      if (!values.every(value => Number.isFinite(value) && value >= 0)) throw new Error("Invalid diagnostic resource timing")
      return { path: string(url.pathname), startTime: entry.startTime, duration: entry.duration, transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize, status: entry.responseStatus }
    })
    return { capturedAt: performance.now(), fontStatus: document.fonts.status, readyState: document.readyState,
      elements, closing: box(closing), children, fonts, resources }
  }, { selectors: examplesFontOwners, properties, origin })
  let session: CDPSession | undefined
  const usedFonts = [], failures: unknown[] = []
  try {
    session = await page.context().newCDPSession(page)
    await session.send("DOM.enable"); await session.send("CSS.enable")
    const root = (await session.send("DOM.getDocument", { depth: 0 })).root.nodeId
    for (const selector of examplesFontOwners) {
      const nodeId = (await session.send("DOM.querySelector", { nodeId: root, selector })).nodeId
      assert.ok(nodeId > 0, "Missing diagnostic font owner")
      const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId })
      assert.ok(fonts.length <= 16, "Examples diagnostic platform fonts exceed bound")
      for (const font of fonts) {
        assert.ok(font.familyName.length <= 256 && font.postScriptName.length <= 256)
        assert.ok(Number.isSafeInteger(font.glyphCount) && font.glyphCount >= 0)
      }
      usedFonts.push({ selector, fonts, matchedRules: selectMarketingFontRules(await session.send("CSS.getMatchedStylesForNode", { nodeId })) })
    }
  } catch (error) { failures.push(error) }
  finally { if (session !== undefined) try { await session.detach() } catch (error) { failures.push(error) } }
  if (failures.length) throw new AggregateError(failures, "Examples diagnostic observation or owned session cleanup failed")
  const result = { kind: "examples-font-diagnostic" as const, diagnosticOnly: true as const, snapshot, usedFonts }
  const text = JSON.stringify(result)
  if (Buffer.byteLength(text, "utf8") > 64 * 1024) throw new ExamplesDiagnosticSizeError(text, 64 * 1024)
  return result
}

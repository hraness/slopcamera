import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import type { Browser, Page } from "playwright-core"
import { compareShellElements, measure, resolvedShellTheme, shellRecord, settle, settleShellRestoredStyles, shellPaintProperties,
  type ShellCase, type ShellElement, type ShellEvidence, type ShellPayload } from "./site-shell-browser-contract"
import { parseExamplesRequest, parseExamplesPhase, parseExamplesCaseFailure, examplesCaseFailure,
  examplesCaseNames, examplesNegativeControls, examplesContentType, parseExampleByteRange,
  examplesScope, examplesBaselineProfile, withExamplesPage, assertExampleGeometry, assertNativeTarget,
  checkDocsNavigation, checkExamplesDocs, assertExamplesRatioGeometry, examplesDirectedRatios, settleExamplesDisabledStyles, examplesPlayerCases, type ExamplesRequest, type ExampleVideoInput } from "./site-examples-browser-contract"
import { examplesFlowSections, examplesHomeIds } from "./site-examples-profile"
import { observeExamplesActions } from "./site-examples-cta"
import { withLanternTransparency } from "./site-lantern-browser-contract"
import { copySteps, copyNegativeControls, assertCopyPorts, type CopyEvidence } from "./site-copy-browser-contract"
import { refinementCopyElementKeys, refinementInstallCommand } from "./site-refinement-profile"
import { portfolioScope, portfolioBaselineProfile, portfolioBaselineRevision, portfolioPalette } from "./site-portfolio-profile"
import { unpackPortfolioRender } from "./site-portfolio-reference-codec"
export * from "./site-portfolio-profile"
export type { ExampleVideoInput }
export const portfolioCaseNames = examplesCaseNames
export const portfolioNegativeControls = examplesNegativeControls.map(name => name === "/-examples-css" ? "/-foundation-css" : name)
export const portfolioContentType = examplesContentType
export const parsePortfolioByteRange = parseExampleByteRange
export interface PortfolioRequest extends Omit<ExamplesRequest, "scope" | "baselineProfile"> {
  readonly scope: typeof portfolioScope
  readonly baselineProfile: typeof portfolioBaselineProfile
}
/** Reuse the closed transport/media validators, never the old visual oracle or receipt identity. */
export function portfolioProbeRequest(request: PortfolioRequest): ExamplesRequest {
  return { ...request, scope: examplesScope, baselineProfile: examplesBaselineProfile }
}
export function parsePortfolioRequest(value: unknown): PortfolioRequest {
  const item = shellRecord(value)
  assert.equal(item.scope, portfolioScope); assert.equal(item.baselineProfile, portfolioBaselineProfile)
  parseExamplesRequest({ ...item, scope: examplesScope, baselineProfile: examplesBaselineProfile })
  return item as unknown as PortfolioRequest
}
export function parsePortfolioPhase(value: unknown, sequence: 0 | 1 | 2, request: PortfolioRequest): Record<string, unknown> {
  const item = shellRecord(value)
  assert.equal(item.scope, portfolioScope); assert.equal(item.baselineProfile, portfolioBaselineProfile)
  if (sequence === 2) assert.deepEqual(item.negativeControls, portfolioNegativeControls)
  parseExamplesPhase({ ...item, scope: examplesScope, baselineProfile: examplesBaselineProfile,
    ...(sequence === 2 ? { negativeControls: examplesNegativeControls } : {}) }, sequence, portfolioProbeRequest(request))
  return item
}
export function parsePortfolioCaseFailure(value: unknown, request: PortfolioRequest): Record<string, unknown> {
  const item = shellRecord(value)
  assert.equal(item.scope, portfolioScope)
  parseExamplesCaseFailure({ ...item, scope: examplesScope }, portfolioProbeRequest(request))
  return item
}
export function portfolioCaseFailure(request: PortfolioRequest, scenario: string, stage: string, comparedCases: readonly string[], error: unknown): Record<string, unknown> {
  return { ...examplesCaseFailure(portfolioProbeRequest(request), scenario, stage, comparedCases, error), scope: portfolioScope }
}
const near = (actual: number, expected: number, label: string, tolerance = .5) =>
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`)
const rgb = (hex: string) => `rgb(${[1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(", ")})`
export const portfolioHeadingSize = (width: number, level: 1 | 2) => level === 1
  ? Math.max(48, Math.min(88, 33.6 + width * .042)) : Math.max(34, Math.min(56, 23.2 + width * .026))

/** The only new semantic island is one inert, childless-of-content decoration.
 * Compiler atom names may change; ordinary authored classes and all semantics remain paired. */
export async function portfolioDom(page: Page, current: boolean, home: boolean): Promise<string> {
  return page.evaluate(({ current, home }) => {
    const root = document.body.cloneNode(true) as HTMLElement
    const backdrops = root.querySelectorAll("[data-hraness-hero-backdrop]")
    if (backdrops.length !== (current && home ? 1 : 0)) throw new Error("Unexpected portfolio backdrop count")
    for (const node of backdrops) {
      if (node.parentElement?.getAttribute("data-hraness-marketing") !== "hero" || node.getAttribute("aria-hidden") !== "true"
        || !node.hasAttribute("inert") || node.children.length !== 2 || node.children[0]?.tagName !== "DIV" || node.children[1]?.tagName !== "SPAN"
        || node.textContent !== "" || node.children[0]!.children.length !== 0 || node.children[1]!.children.length !== 0
        || [...node.attributes].some(attribute => !["class", "aria-hidden", "inert", "data-hraness-hero-backdrop"].includes(attribute.name))
        || [...node.children[0]!.attributes].some(attribute => !["class", "data-variation"].includes(attribute.name))
        || [...node.children[1]!.attributes].some(attribute => attribute.name !== "class")
        || !["center", "east", "west"].includes(node.children[0]!.getAttribute("data-variation") ?? "")
        || node.querySelector("a,button,input,svg,img,script,[tabindex]")) throw new Error("Malformed decorative hero island")
      node.remove()
    }
    for (const script of root.querySelectorAll("script")) script.remove()
    for (const state of ["idle", "copied", "failed"]) {
      const attribute = `data-copy-${state}-class`, owners = root.querySelectorAll(`[${attribute}]`)
      if (owners.length !== (home ? 1 : 0)) throw new Error("Finite copy transport count changed")
      for (const owner of owners) {
        if (owner.tagName !== "BUTTON" || !owner.closest("#install") || !/^copy-command__button(?: x[a-z0-9]+)+$/u.test(owner.getAttribute(attribute) ?? "")) throw new Error("Unknown sealed copy transport")
        owner.setAttribute(attribute, `copy-command__button [compiled-${state}]`)
      }
    }
    const templates = [...root.querySelectorAll<HTMLTemplateElement>("template[data-copy-command-fallback]")]
    if (templates.length !== (home ? 1 : 0)) throw new Error("Finite copy fallback count changed")
    for (const template of templates) {
      if (!template.closest("#install") || template.content.children.length !== 1 || template.content.firstElementChild?.tagName !== "TEXTAREA") throw new Error("Unknown native copy fallback")
    }
    for (const element of [root, ...root.querySelectorAll("*"), ...templates.flatMap(template => [...template.content.querySelectorAll("*")])]) {
      const retained = [...element.classList].filter(name => !/^x[a-z0-9]+$/u.test(name))
      if (retained.length) element.setAttribute("class", retained.join(" ")); else element.removeAttribute("class")
      // Pointer observations must never leak decoration-only CSSOM inputs into semantic comparison.
      const style = (element as HTMLElement).style
      if (style) for (const name of [...style]) if (name.startsWith("--hraness-hero-")) style.removeProperty(name)
      if (element.getAttribute("style") === "") element.removeAttribute("style")
    }
    return root.outerHTML.replace(/>\s+</gu, "><").trim()
  }, { current, home })
}

/** Literal palette values come from the reviewed v0.16 Catppuccin contract,
 * never from the target's custom properties. Material mixes are serialized by
 * a detached probe so color-space serialization stays browser-owned. */
export async function observePortfolioPaint(page: Page, scenario: Pick<ShellCase, "width" | "theme" | "system" | "forced"> & { readonly route: string }) {
  const mode = resolvedShellTheme(scenario.theme, scenario.system), palette = portfolioPalette[mode]
  const sample = await page.evaluate(({ palette, home }) => {
    const root = document.documentElement, body = getComputedStyle(document.body)
    const target = document.querySelector<HTMLElement>(".hraness-marketing-hero")
    const canvas = document.createElement("span")
    canvas.style.color = "CanvasText"; canvas.style.backgroundColor = "Canvas"; document.body.append(canvas)
    const forced = { color: getComputedStyle(canvas).color, background: getComputedStyle(canvas).backgroundColor }; canvas.remove()
    const probe = document.createElement("span")
    probe.style.color = palette.foreground; document.body.append(probe)
    const ink = getComputedStyle(probe).color; probe.remove()
    const hero = target ? getComputedStyle(target) : null
    const backdrop = document.querySelector<HTMLElement>("[data-hraness-hero-backdrop]")
    const decoration = backdrop ? getComputedStyle(backdrop) : null
    const expected = document.createElement("span")
    const grain = [...document.styleSheets].length ? [...document.querySelectorAll('link[rel="stylesheet"]')].length : 0
    if (grain < 2) throw new Error("Missing sealed foundation and final union")
    expected.style.backgroundImage = `repeating-radial-gradient(ellipse at 24% 62%, transparent 0 2.2rem, color-mix(in oklch, ${palette.primary} 9%, transparent) 2.25rem 2.3rem, transparent 2.35rem 4.4rem), radial-gradient(ellipse at 68% 32%, color-mix(in oklch, ${palette.primary} 22%, transparent), transparent 68%), linear-gradient(110deg, color-mix(in oklch, ${palette.info} 14%, transparent), transparent 38%, color-mix(in oklch, white 4%, transparent) 65%, transparent)`
    document.body.append(expected)
    const wallLayers = getComputedStyle(expected).backgroundImage
    expected.style.boxShadow = home
      ? "inset 0 1px 0 color-mix(in oklch, white 14%, transparent), 0 2px 5px color-mix(in oklch, black 5%, transparent), 0 10px 28px -14px color-mix(in oklch, black 14%, transparent)"
      : `0 4px 20px color-mix(in srgb, ${palette.foreground} 5%, transparent)`
    const headerShadow = getComputedStyle(expected).boxShadow
    expected.style.backgroundImage = `radial-gradient(ellipse at 68% 25%, color-mix(in oklch, ${palette.info} 32%, transparent), transparent 60%), radial-gradient(ellipse at 15% 80%, color-mix(in oklch, ${palette.primary} 26%, transparent), transparent 65%)`
    const atmosphereImage = getComputedStyle(expected).backgroundImage
    expected.style.backgroundImage = `radial-gradient(ellipse 48% 70% at 68% 32%, color-mix(in oklch, ${palette.primary} 13%, transparent), transparent 76%), radial-gradient(ellipse 60% 90% at 8% 15%, color-mix(in oklch, ${palette.info} 9%, transparent), transparent 76%)`
    const lightImage = getComputedStyle(expected).backgroundImage; expected.remove()
    const atmosphere = backdrop?.firstElementChild ? getComputedStyle(backdrop.firstElementChild) : null
    const light = backdrop?.lastElementChild ? getComputedStyle(backdrop.lastElementChild) : null
    const title = document.querySelector<HTMLElement>(home ? "#page-title" : ".route-state h1")
    const titleStyle = title ? getComputedStyle(title) : null
    const header = getComputedStyle(document.querySelector(".topbar")!)
    return { palette: root.dataset.palette ?? null, theme: root.dataset.theme ?? null, pattern: root.dataset.hranessPattern ?? null,
      body: { background: body.backgroundColor, color: body.color }, forced, ink, wallLayers, headerShadow, atmosphereImage, lightImage,
      header: { edge: header.borderBottomColor, shadow: header.boxShadow },
      hero: hero ? { position: hero.position, isolation: hero.isolation, background: hero.backgroundImage, color: hero.color,
        overflow: hero.overflow, pointer: hero.pointerEvents } : null,
      decoration: decoration ? { position: decoration.position, pointer: decoration.pointerEvents, z: decoration.zIndex, display: decoration.display, opacity: decoration.opacity } : null,
      atmosphere: atmosphere ? { image: atmosphere.backgroundImage, opacity: atmosphere.opacity, position: atmosphere.backgroundPosition, variation: backdrop!.firstElementChild!.getAttribute("data-variation") } : null,
      light: light ? { image: light.backgroundImage } : null,
      title: titleStyle ? { size: parseFloat(titleStyle.fontSize), leading: parseFloat(titleStyle.lineHeight), font: titleStyle.fontFamily } : null }
  }, { palette, home: scenario.route === "/" })
  assert.equal(sample.palette, "catppuccin"); assert.equal(sample.pattern, scenario.route === "/" ? "contour" : "none")
  if (scenario.forced === "active") {
    assert.equal(sample.body.color, sample.forced.color); assert.equal(sample.body.background, sample.forced.background)
    assert.equal(sample.header.edge, sample.forced.color); assert.equal(sample.header.shadow, "none")
  } else {
    assert.equal(sample.body.color, rgb(palette.foreground)); assert.equal(sample.body.background, rgb(palette.background))
    assert.equal(sample.header.edge, "rgba(0, 0, 0, 0)"); assert.equal(sample.header.shadow, sample.headerShadow, "Exact sculpted header shadow")
  }
  if (scenario.route === "/") {
    assert.ok(sample.hero && sample.decoration && sample.title)
    assert.equal(sample.hero.position, "relative"); assert.equal(sample.hero.isolation, "isolate")
    assert.equal(sample.hero.overflow, "visible"); assert.equal(sample.hero.pointer, "auto")
    assert.equal(sample.decoration.position, "absolute"); assert.equal(sample.decoration.pointer, "none"); assert.equal(sample.decoration.z, "-1")
    if (scenario.forced === "active") { assert.equal(sample.hero.background, "none"); assert.equal(sample.decoration.opacity, "0") }
    else {
      const withoutGrain = sample.hero.background.replace(/^url\("[^"\n]+\/grain-[A-Za-z0-9_-]+\.svg"\), /u, "")
      assert.notEqual(withoutGrain, sample.hero.background, "One admitted grain layer precedes the contour")
      assert.equal(withoutGrain, sample.wallLayers, "Exact palette-derived contour and light layers")
      assert.equal(sample.decoration.opacity, "1"); assert.equal(sample.decoration.display, "block")
      assert.deepEqual(sample.atmosphere, { image: sample.atmosphereImage, opacity: "0.24", position: "50% 50%", variation: "center" })
      assert.deepEqual(sample.light, { image: sample.lightImage })
    }
    near(sample.title.size, portfolioHeadingSize(scenario.width, 1), "Responsive editorial h1")
    near(sample.title.leading, sample.title.size * 1.02, "Editorial h1 leading")
    assert.match(sample.title.font, /Instrument Serif/u)
  } else assert.equal(sample.decoration, null)
  return sample
}

/** Reviewed references are data, bound by source and artifact hashes in the
 * acceptance receipt. A capture is never acceptance: the schema requires an
 * explicit independent review and every one of the finite cases. */
export interface PortfolioRenderReference {
  readonly schemaVersion: 1
  readonly scope: typeof portfolioScope
  readonly baselineRevision: string
  readonly designKitRevision: string
  readonly reviewedBy: string
  readonly cases: Readonly<Record<string, unknown>>
}
export function parsePortfolioRenderReference(value: unknown): PortfolioRenderReference {
  const item = shellRecord(value)
  assert.deepEqual(Object.keys(item).sort(), ["schemaVersion", "scope", "baselineRevision", "designKitRevision", "reviewedBy", "cases"].sort())
  assert.equal(item.schemaVersion, 1); assert.equal(item.scope, portfolioScope)
  assert.equal(item.baselineRevision, portfolioBaselineRevision)
  assert.match(String(item.designKitRevision), /^[a-f0-9]{40}$/u)
  assert.ok(typeof item.reviewedBy === "string" && item.reviewedBy.trim().length >= 3 && item.reviewedBy.length <= 160)
  assert.ok(!/unreviewed|pending|capture/iu.test(item.reviewedBy), "A capture marker is not independent review")
  const cases = shellRecord(item.cases)
  assert.deepEqual(Object.keys(cases).sort(), [...portfolioCaseNames].sort())
  for (const name of portfolioCaseNames) {
    if ((examplesPlayerCases as readonly string[]).includes(name)) assert.equal(cases[name], null, "Player timing is validated by real probes, not a render snapshot")
    else {
      const decoded = unpackPortfolioRender(cases[name])
      assert.ok(decoded !== null && typeof decoded === "object" && !Array.isArray(decoded), `${name}: missing render observation`)
    }
  }
  const encoded = JSON.stringify(item); assert.ok(Buffer.byteLength(encoded) <= 16 * 1024 * 1024)
  return item as unknown as PortfolioRenderReference
}
export function assertPortfolioReference(actual: unknown, reference: PortfolioRenderReference, name: string): void {
  assert.ok(portfolioCaseNames.includes(name), "Unknown portfolio render case")
  const expected = (examplesPlayerCases as readonly string[]).includes(name) ? reference.cases[name] : unpackPortfolioRender(reference.cases[name])
  assert.deepEqual(actual, expected, `${name}: exact independently reviewed design reference`)
}
export function portfolioReferenceDigest(reference: PortfolioRenderReference): string {
  return createHash("sha256").update(JSON.stringify(reference)).digest("hex")
}
/** Preserve every semantic interaction against the predecessor. Geometry and
 * paint are compared separately to the independently reviewed new reference. */
export function comparePortfolioSemantics(actual: ShellEvidence, baseline: ShellEvidence, dom: string, oldDom: string): void {
  assert.equal(dom, oldDom, "All meaningful body markup remains paired")
  assert.equal(actual.direction, baseline.direction); assert.equal(actual.recovery, baseline.recovery)
  assert.deepEqual(actual.obstructions, []); assert.deepEqual(baseline.obstructions, [])
  const semantics = (items: readonly ShellElement[]) => items.map(({ styles: _styles, rect: _rect, ...item }) => item)
  assert.deepEqual(semantics(actual.elements), semantics(baseline.elements))
  assert.deepEqual(semantics(actual.focus), semantics(baseline.focus))
  assert.deepEqual(semantics(actual.hover), semantics(baseline.hover))
  assert.deepEqual(actual.appearance.map(item => [item.step, item.active, semantics(item.elements)]), baseline.appearance.map(item => [item.step, item.active, semantics(item.elements)]))
  assert.deepEqual(actual.skip.semantics, baseline.skip.semantics)
}

export async function checkPortfolioDocs(browser: Browser, request: PortfolioRequest,
  scenario: Parameters<typeof checkExamplesDocs>[2], onDesign: (value: unknown) => void) {
  const shellSelectors = [".skip-link", ".topbar", ".wordmark", ".topbar-actions", '.topbar nav[aria-label="Primary"]',
    '.topbar nav[aria-label="Primary"] a', '[data-hraness-appearance-menu] button']
  const probe = portfolioProbeRequest(request)
  const baseline = await withExamplesPage(browser, { ...probe, current: request.baseline }, scenario.route, { ...scenario }, async page => ({
    markup: await portfolioDom(page, false, false), elements: await measure(page, shellSelectors),
  }))
  return withExamplesPage(browser, probe, scenario.route, { ...scenario }, async (page, received) => {
    const dom = await portfolioDom(page, true, false)
    assert.equal(dom, baseline.markup, "Every meaningful documentation node remains paired")
    const elements = await measure(page, [...shellSelectors, "body", "#main", "article", "article h1", "article h2", "article h3", "article p", "article li", "article pre", "article code", "article table", "article th", "article td", "article blockquote", "article figcaption", "article figure", "nav[data-docs-navigation]", "nav[data-docs-navigation] a", "details[data-docs-navigation]", "details[data-docs-navigation] summary"])
    assert.ok(elements.length <= 800, "Bounded complete documentation typography inventory")
    const paint = await observePortfolioPaint(page, { ...scenario, system: scenario.theme })
    onDesign({ dom, elements, paint })
    const navigation = await checkDocsNavigation(page, scenario)
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
      figures: document.querySelectorAll("figure[data-example-id]").length,
      videos: [...document.querySelectorAll<HTMLVideoElement>("video")].map(video => ({ paused: video.paused, preview: video.hasAttribute("data-example-preview"), preload: video.preload, controls: video.controls })),
      links: [...document.querySelectorAll<HTMLAnchorElement>('article a[href^="/docs"],nav[data-docs-navigation] a')].map(link => link.getAttribute("href")!.split("#")[0]!),
      ids: [...document.querySelectorAll("[id]")].map(element => element.id) }))
    assert.equal(state.overflow, false); assert.equal(new Set(state.ids).size, state.ids.length)
    if (scenario.route === "/docs/how-to/parametric-design") {
      assert.equal(state.figures, 5); assert.equal(state.videos.length, 0)
      assert.deepEqual(await page.locator("figure[data-example-id]").evaluateAll(elements => elements.map(element => element.getAttribute("data-example-id"))),
        ["crescent-pavilion", "crescent-pavilion-wide", "spiral-stair", "ribbed-tower", "modular-bookshelf"])
    }
    if (scenario.route === "/docs/how-to/edit-video") {
      assert.equal(state.figures, 7); assert.equal(state.videos.length, 7)
      assert.deepEqual(await page.locator("figure[data-example-id]").evaluateAll(elements => elements.map(element => element.getAttribute("data-example-id"))),
        ["color-warm", "color-cool", "color-mono", ...examplesDirectedRatios.map(item => item.id)])
      const geometry = await page.locator('figure[data-example-id^="edit-directed-"] video').evaluateAll(elements => elements.map(element => {
        const video = element as HTMLVideoElement, box = video.getBoundingClientRect()
        return { id: video.closest("[data-example-id]")!.getAttribute("data-example-id")!, widthAttribute: video.width, heightAttribute: video.height,
          source: video.querySelector("source")!.getAttribute("src")!, x: box.x, width: box.width, height: box.height, objectFit: getComputedStyle(video).objectFit }
      }))
      assertExamplesRatioGeometry(geometry, request.media, scenario)
    }
    for (const link of state.links) assert.ok(request.current.resources.includes(link))
    for (const video of state.videos) assert.deepEqual(video, { paused: true, preview: false, preload: "none", controls: true })
    assert.ok(![...received].some(path => path.endsWith(".mp4")), "Manual docs fetched video before interaction")
    if (state.figures) {
      await assertExampleGeometry(page, scenario.width)
      await assertNativeTarget(page, "figure[data-example-id] .slopcamera-example__links a:first-child >> nth=0", "javascript" in scenario ? scenario.javascript : true)
    }
    await assertNativeTarget(page, '[data-slot="hraness-support-link"]', "javascript" in scenario ? scenario.javascript : true)
    return { name: scenario.name, passed: true, figures: state.figures, videos: state.videos.length, shellPaired: true,
      navigation }
  })
}
export async function observePortfolioDesign(page: Page, scenario: ShellCase, payload: ShellPayload, negative: boolean) {
  const paint = await observePortfolioPaint(page, scenario)
  if (scenario.route !== "/") return { paint, flow: [] as ShellElement[] }
  const flow = await measure(page, examplesFlowSections)
  const hero = await measure(page, [".slopcamera-product-hero", ".hraness-marketing-hero__copy", ".hraness-marketing-hero__copy > *", ".hraness-marketing-hero__frame", ".hraness-marketing-facts", ".hraness-marketing-facts > *", "[data-hraness-hero-backdrop]"])
  const structure = await page.locator(".slopcamera-product-hero").evaluate(node => {
    const children = [...node.children].filter(child => !child.hasAttribute("data-hraness-hero-backdrop"))
    return { display: getComputedStyle(node).display, columns: getComputedStyle(node).gridTemplateColumns.split(" ").map(Number.parseFloat),
      children: children.map(child => child.className), copy: children[0]?.children.length }
  })
  assert.equal(structure.display, "grid"); assert.equal(structure.children.length, 3); assert.equal(structure.copy, 5)
  assert.ok(structure.children[0]!.includes("hraness-marketing-hero__copy"))
  assert.ok(structure.children[1]!.includes("hraness-marketing-hero__frame"))
  assert.ok(structure.children[2]!.includes("hraness-marketing-facts"))
  assert.equal(structure.columns.length, scenario.width >= 992 ? 2 : 1)
  if (structure.columns.length === 2) near(structure.columns[1]! / structure.columns[0]!, 1.1 / .9, "Hero column proportion", .01)
  assert.equal(await page.locator("[data-hraness-hero-backdrop] a,[data-hraness-hero-backdrop] button,[data-hraness-hero-backdrop] [tabindex]").count(), 0)
  await assertPortfolioDisclosure(page, scenario)

  const actions = await observeExamplesActions(page, true)
  const ids = await page.locator("figure[data-example-id]").evaluateAll(elements => elements.map(element => element.getAttribute("data-example-id")))
  assert.deepEqual(ids, examplesHomeIds, "Reviewed homepage example inventory")
  await assertExampleGeometry(page, scenario.width)
  const gallery = await page.locator(".slopcamera-work-gallery").evaluate(node => {
    const style = getComputedStyle(node)
    return { display: style.display, columns: style.gridTemplateColumns.split(" ").map(Number.parseFloat), row: parseFloat(style.rowGap), column: parseFloat(style.columnGap),
      children: node.children.length, lastColumn: getComputedStyle(node.lastElementChild!).gridColumn }
  })
  assert.equal(gallery.display, "grid"); assert.equal(gallery.children, examplesHomeIds.length - 1)
  assert.equal(gallery.columns.length, scenario.width > 768 ? 2 : 1)
  for (const column of gallery.columns) assert.ok(Number.isFinite(column) && column > 0)
  near(gallery.row, scenario.width > 768 ? 48 : 40, "Gallery row spacing")
  near(gallery.column, scenario.width > 768 ? 32 : 40, "Gallery column spacing")
  assert.equal(gallery.lastColumn, "1 / -1")
  if (negative) {
    const selectors = [".slopcamera-example__media", ".slopcamera-example__caption"], before = await measure(page, selectors)
    const href = `${payload.origin}${payload.stylesheets[0]}`
    const sheet = await page.evaluateHandle(href => {
      const matches = [...document.styleSheets].filter(value => value.href === href), sheet = matches[0]
      if (matches.length !== 1 || !sheet || sheet.disabled) throw new Error("Missing exact example stylesheet")
      sheet.disabled = true; return sheet
    }, href)
    try {
      await sheet.evaluate(settleExamplesDisabledStyles, href)
      const removed = await measure(page, selectors)
      assert.notDeepEqual(removed.map(item => item.styles), before.map(item => item.styles), "Example stylesheet negative did not change paint")
    } finally {
      try {
        await sheet.evaluate((sheet, href) => {
          if (!(sheet instanceof CSSStyleSheet) || sheet.href !== href || ![...document.styleSheets].includes(sheet) || !sheet.disabled)
            throw new Error("Lost examples stylesheet before restoration")
          sheet.disabled = false
        }, href)
        await settle(page, scenario.direction)
        // A re-enabled link sheet can repaint before its media-conditional
        // custom properties finish re-evaluating; observe stable restored paint
        // before the strict comparison, matching the shell lane's restoration.
        await sheet.evaluate(settleShellRestoredStyles,
          { href, recovery: false, properties: shellPaintProperties })
      } finally { await sheet.dispose() }
    }
    compareShellElements(await measure(page, selectors), before, "Restored example stylesheet")
  }
  let transparency: unknown
  if (negative) {
    await withLanternTransparency(page, async () => {
      await settle(page, scenario.direction)
      transparency = await page.evaluate(() => ({
        wall: getComputedStyle(document.querySelector(".hraness-material-wall")!).backgroundImage,
        decoration: getComputedStyle(document.querySelector("[data-hraness-hero-backdrop]")!).opacity,
        chrome: getComputedStyle(document.querySelector(".topbar")!).backgroundColor,
        backdrop: getComputedStyle(document.querySelector(".topbar")!).backdropFilter,
      }))
      const state = transparency as { wall: string; decoration: string; chrome: string; backdrop: string }
      assert.equal(state.wall, "none"); assert.equal(state.decoration, "0"); assert.equal(state.backdrop, "none")
      assert.equal(state.chrome, rgb(portfolioPalette[resolvedShellTheme(scenario.theme, scenario.system)].surface))
    })
    await settle(page, scenario.direction)
    assert.deepEqual(await observePortfolioPaint(page, scenario), paint, "Exact restored transparency media and wall paint")
    await assertPortfolioLight(page, scenario)
  }
  return { paint, flow, hero, actions, gallery, structure, ...(transparency ? { transparency } : {}) }
}

/** Existing native disclosure behavior remains positive across every theme. */
async function assertPortfolioDisclosure(page: Page, scenario: ShellCase): Promise<void> {
  const summaries = ".hraness-material-disclosure > summary"
  assert.equal(await page.locator(summaries).count(), 9)
  const before = await measure(page, [summaries]), scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
  const target = page.locator(summaries).first(), errors: unknown[] = []
  try {
    await target.click(); await settle(page, scenario.direction)
    assert.equal(await page.locator(".hraness-material-disclosure[open]").count(), 1)
    await target.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await settle(page, scenario.direction)
    assert.equal(await target.evaluate(node => node === document.activeElement && node.matches(":focus-visible")), true)
    const focus = (await measure(page, [summaries]))[0]!
    assert.equal(focus.styles["outline-style"], "solid"); assert.equal(focus.styles["outline-width"], "2px")
    await page.keyboard.press("Enter"); await settle(page, scenario.direction)
    assert.equal(await page.locator(".hraness-material-disclosure[open]").count(), 0)
  } catch (error) { errors.push(error) }
  finally {
    try {
      if (await page.locator(".hraness-material-disclosure[open]").count()) await target.click()
      await page.locator(".wordmark").focus()
      await page.evaluate(({ x, y }) => scrollTo({ left: x, top: y, behavior: "instant" }), scroll)
      await settle(page, scenario.direction)
      compareShellElements(await measure(page, [summaries]), before, "Restored native disclosure")
    } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, "Portfolio disclosure and restoration")
}
/** Exercise the shared root-local controller, including leave and reduced-motion restoration. */
async function assertPortfolioLight(page: Page, scenario: ShellCase): Promise<void> {
  const root = page.locator(".slopcamera-product-hero"), scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
  const read = () => root.evaluate(node => ["--hraness-hero-light-x", "--hraness-hero-light-y", "--hraness-hero-drift-x", "--hraness-hero-drift-y"].map(name => (node as HTMLElement).style.getPropertyValue(name)))
  const initial = await read(), errors: unknown[] = []
  try {
    assert.deepEqual(initial, ["", "", "", ""], "Reduced motion has no live pointer paint")
    await page.emulateMedia({ reducedMotion: "no-preference" }); await settle(page, scenario.direction)
    await root.scrollIntoViewIfNeeded()
    const box = await root.boundingBox(); assert.ok(box)
    await page.mouse.move(box.x + box.width * .65, Math.max(70, box.y + Math.min(box.height * .3, 180)))
    await page.waitForFunction(() => document.querySelector<HTMLElement>(".slopcamera-product-hero")!.style.getPropertyValue("--hraness-hero-light-x") !== "")
    const changed = await read()
    assert.ok(parseFloat(changed[0]!) >= 12 && parseFloat(changed[0]!) <= 88)
    assert.ok(parseFloat(changed[1]!) >= 12 && parseFloat(changed[1]!) <= 88)
    assert.ok(Math.abs(parseFloat(changed[2]!)) <= 8 && Math.abs(parseFloat(changed[3]!)) <= 6)
    await page.mouse.move(0, 0); await settle(page, scenario.direction)
    assert.deepEqual(await read(), initial, "Pointer leave restores authored inputs")
  } catch (error) { errors.push(error) }
  finally {
    try {
      await page.emulateMedia({ reducedMotion: "reduce" }); await page.mouse.move(0, 0)
      await page.evaluate(({ x, y }) => scrollTo({ left: x, top: y, behavior: "instant" }), scroll)
      await settle(page, scenario.direction); assert.deepEqual(await read(), initial, "Motion preference restores authored inputs")
    } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, "Portfolio hero interaction and restoration")
}

export function comparePortfolioCopy(actual: CopyEvidence, baseline: CopyEvidence, scenario: ShellCase, negative: boolean) {
  assert.equal(actual.command, refinementInstallCommand); assert.equal(baseline.command, refinementInstallCommand)
  assert.deepEqual(actual.negativeControls, negative ? copyNegativeControls : []); assert.deepEqual(baseline.negativeControls, [])
  for (const side of [actual, baseline]) {
    assertCopyPorts(side.ports, refinementInstallCommand); assert.deepEqual(side.steps.map(step => step.name), copySteps)
    for (const step of side.steps) assert.deepEqual(step.elements.map(item => item.key), refinementCopyElementKeys)
  }
  for (const [index, step] of actual.steps.entries()) {
    assert.deepEqual(step.elements.map(({ styles, rect, ...semantic }) => semantic), baseline.steps[index]!.elements.map(({ styles, rect, ...semantic }) => semantic))
  }
  return { name: scenario.name, passed: true, command: refinementInstallCommand, current: actual.ports, baseline: baseline.ports }
}

/** Only ephemeral origins are normalized; every recorded property and number remains exact. */
export function normalizePortfolioRender(value: unknown, payloads: readonly ShellPayload[]): unknown {
  const normalizeUrl = (url: string): string => {
    const parsed = new URL(url), payload = payloads.find(item => item.origin === parsed.origin)
    assert.ok(payload && parsed.search === "" && parsed.hash === "" && payload.resources.includes(parsed.pathname), "Unadmitted resource in portfolio render reference")
    const stylesheet = payload.stylesheets.indexOf(parsed.pathname)
    const path = stylesheet === -1 ? parsed.pathname : stylesheet === 0 ? "/__foundation.css" : "/__compiled.css"
    return `https://portfolio-reference.invalid${path}`
  }
  const visit = (item: unknown): unknown => {
    if (item === null || typeof item === "boolean" || typeof item === "number") return item
    if (Array.isArray(item)) return item.map(visit)
    if (typeof item === "object" && item !== null) return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]))
    assert.equal(typeof item, "string", "Render normalization must not drop non-JSON values")
    const text = item as string
    // Every CSS URL is a verified resource. Existing semantic external links
    // remain literal; only the two admitted ephemeral loopback origins vary.
    const css = text.replace(/url\(["']?(https?:\/\/[^"')\s]+)["']?\)/gu, (_match, url: string) => `url("${normalizeUrl(url)}")`)
    return css.replace(/http:\/\/127\.0\.0\.1:\d{1,5}\/[^\s"'<>)]*/gu, url => normalizeUrl(url))
  }
  return visit(value)
}

import assert from "node:assert/strict"
import { isAbsolute } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import type { Browser, Page, Request } from "playwright-core"
import { bounded } from "./preview-browser-contract"
import { assertShellNode, compareShellElements, compareShellEvidence, measure, settle, chooseAppearance,
  shellRecord, shellResource, shellContentType, siteShellCases, siteShellHeaders, shellContextLifecycle,
  shellOperationTracker, denyShellWebSocket, withShellCaseCleanup, workflowExamplesHomeSelectors,
  type ShellPayload, type ShellCase, type ShellElement, type ShellEvidence, type ShellCurrentDesignPosition, type ShellCurrentDesignPositions } from "./site-shell-browser-contract"
import { siteCopyCases, assertCopyPorts, copySteps, copyNegativeControls, type CopyEvidence } from "./site-copy-browser-contract"
import { refinementCopyElementKeys, refinementInstallCommand } from "./site-refinement-profile"
import { observeRefinementHero, compareRefinementHeroCopies, type RefinementHero } from "./site-refinement-browser-contract"
import { observeExamplesActions, projectExamplesHeroActions, type ExamplesActions } from "./site-examples-cta"
import { examplesScope, examplesBaselineProfile, examplesBaselineRevision, examplesBaselineTree, examplesDeadlineMs,
  examplesIslands, examplesFlowSections, examplesHeightOwners, examplesHomeIds, examplesHeroTextures } from "./site-examples-profile"
export { examplesScope, examplesBaselineProfile, examplesBaselineRevision, examplesBaselineTree, examplesDeadlineMs }

export interface ExampleVideoInput {
  readonly id: string; readonly path: string; readonly sha256: string; readonly poster: string; readonly guide: string
  readonly width: number; readonly height: number; readonly durationSeconds: number; readonly hasAudio: boolean; readonly captions?: string
}
export interface ExamplesRequest {
  readonly schemaVersion: 1; readonly token: string; readonly scope: typeof examplesScope; readonly baselineProfile: typeof examplesBaselineProfile
  readonly appDirectory: string; readonly chromeExecutable: string; readonly endpoint: string
  readonly current: ShellPayload; readonly baseline: ShellPayload; readonly media: readonly ExampleVideoInput[]
}
const keys = (value: Record<string, unknown>, expected: readonly string[]) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
const docsRoutes = ["/docs", "/docs/tutorials/first-diagram", "/docs/tutorials/first-animation", "/docs/how-to/render-motion-graphics", "/docs/how-to/vectorize-images", "/docs/reference/capabilities", "/docs/how-to/parametric-design", "/docs/how-to/edit-video"] as const
export const examplesDocsCases = Object.freeze(docsRoutes.flatMap(route => [390, 1440].flatMap(width => (["light", "dark"] as const).map(theme => ({
  name: `docs-${route}-${width}-${theme}`, route, width, height: 900, theme, forced: "none" as const,
})))))
export const examplesDocsExtraCases = Object.freeze((["light", "dark"] as const).flatMap(theme => [
  { name: `docs-motion-320-${theme}`, route: "/docs/how-to/render-motion-graphics", width: 320, height: 900, theme, forced: "none" as const },
  { name: `docs-motion-forced-${theme}`, route: "/docs/how-to/render-motion-graphics", width: 390, height: 700, theme, forced: "active" as const },
  ...[390, 1440].map(width => ({ name: `docs-no-js-/docs/how-to/edit-video-${width}-${theme}`, route: "/docs/how-to/edit-video", width, height: 900, theme, forced: "none" as const, javascript: false as const })),
]))
export const examplesPlayerCases = ["player-no-js", "player-docs-manual", "player-visible-auto", "player-manual-pause", "player-reduced-motion", "player-save-data", "player-offscreen-hidden", "player-failed-media", "player-captions"] as const
export const examplesCaseNames = Object.freeze([...siteShellCases.map(item => item.name), ...siteCopyCases.map(item => item.name),
  ...examplesDocsCases.map(item => item.name), ...examplesDocsExtraCases.map(item => item.name), ...examplesPlayerCases])
export const examplesNegativeControls = ["/-final-css", "/-examples-css", "/404.html-final-css", ...copyNegativeControls] as const
function payload(value: unknown): void {
  const item = shellRecord(value); keys(item, ["origin", "resources", "stylesheets", "finalCss"])
  assert.ok(typeof item.origin === "string" && /^http:\/\/127\.0\.0\.1:\d{1,5}$/u.test(item.origin))
  assert.ok(Number(new URL(item.origin).port) > 0 && Number(new URL(item.origin).port) <= 65535)
  assert.ok(Array.isArray(item.resources) && item.resources.length >= 20 && item.resources.length <= 320)
  item.resources.forEach(shellResource); assert.deepEqual(item.resources, [...new Set(item.resources)].sort())
  assert.ok(item.resources.includes("/") && item.resources.includes("/404.html"))
  assert.ok(Array.isArray(item.stylesheets) && item.stylesheets.length === 2 && new Set(item.stylesheets).size === 2)
  for (const path of item.stylesheets) { shellResource(path); assert.ok(path.endsWith(".css") && item.resources.includes(path)) }
  assert.equal(item.finalCss, item.stylesheets[1]); assert.match(String(item.finalCss), /^\/assets\/site-[a-f0-9]{64}\.css$/u)
}
export function parseExamplesRequest(value: unknown): ExamplesRequest {
  const item = shellRecord(value)
  keys(item, ["schemaVersion", "token", "scope", "baselineProfile", "appDirectory", "chromeExecutable", "endpoint", "current", "baseline", "media"])
  assert.equal(item.schemaVersion, 1); assert.equal(item.scope, examplesScope); assert.equal(item.baselineProfile, examplesBaselineProfile)
  assert.ok(typeof item.token === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(item.token))
  for (const key of ["appDirectory", "chromeExecutable"]) assert.ok(typeof item[key] === "string" && item[key].length <= 4096 && isAbsolute(item[key]))
  assert.ok(typeof item.endpoint === "string" && /^ws:\/\/127\.0\.0\.1:\d{1,5}\/devtools\/browser\/[a-f0-9-]+$/u.test(item.endpoint))
  assert.ok(Number(new URL(item.endpoint).port) > 0 && Number(new URL(item.endpoint).port) <= 65535)
  payload(item.current); payload(item.baseline)
  const current = item.current as ShellPayload, baseline = item.baseline as ShellPayload
  assert.notEqual(current.origin, baseline.origin)
  for (const route of docsRoutes) assert.ok(current.resources.includes(route), `Missing mandatory docs page ${route}`)
  assert.ok(Array.isArray(item.media) && item.media.length >= 2 && item.media.length <= 64)
  const ids = new Set<string>()
  for (const value of item.media) {
    const video = shellRecord(value)
    keys(video, ["id", "path", "sha256", "poster", "guide", "width", "height", "durationSeconds", "hasAudio", ...(Object.hasOwn(video, "captions") ? ["captions"] : [])])
    assert.ok(typeof video.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(video.id) && !ids.has(video.id)); ids.add(video.id)
    assert.ok(typeof video.sha256 === "string" && /^[a-f0-9]{64}$/u.test(video.sha256))
    for (const field of ["path", "poster", "guide", ...(video.captions ? ["captions"] : [])]) {
      shellResource(video[field]); assert.ok(current.resources.includes(video[field] as string))
    }
    assert.match(String(video.path), /^\/assets\/examples\/[a-z0-9-]+\.mp4$/u)
    assert.match(String(video.poster), /^\/assets\/examples\/[a-z0-9-]+\.(?:webp|png)$/u)
    assert.match(String(video.guide), /^\/docs\/(?:tutorials|how-to|reference|explanation)\/[a-z0-9-]+$/u)
    if (video.captions) assert.match(String(video.captions), /^\/assets\/examples\/[a-z0-9-]+\.vtt$/u)
    // Match the closed publication registry, including manually played lessons
    // and measured simulation crops. Preview eligibility is verified separately
    // from the actual homepage video attributes and the 15-second renderer gate.
    for (const field of ["width", "height"]) assert.ok(Number.isSafeInteger(video[field]) && Number(video[field]) > 0 && Number(video[field]) <= 1920)
    assert.ok(typeof video.durationSeconds === "number" && video.durationSeconds > 0 && video.durationSeconds <= 120)
    assert.equal(typeof video.hasAudio, "boolean")
  }
  assert.ok(ids.has("editorial"), "Manual lesson requires its admitted editorial clip")
  return item as unknown as ExamplesRequest
}
export function parseExamplesPhase(value: unknown, sequence: 0 | 1 | 2, request: ExamplesRequest): Record<string, unknown> {
  const item = shellRecord(value), common = ["schemaVersion", "token", "scope", "baselineProfile", "sequence", "kind"]
  keys(item, sequence === 1 ? common : sequence === 0 ? [...common, "node", "playwright"] : [...common, "node", "playwright", "browser", "cases", "closed", "negativeControls", "observations"])
  assert.equal(item.schemaVersion, 1); assert.equal(item.token, request.token); assert.equal(item.scope, examplesScope)
  assert.equal(item.baselineProfile, examplesBaselineProfile); assert.equal(item.sequence, sequence); assert.equal(item.kind, ["started", "connected", "result"][sequence])
  if (sequence !== 1) { assertShellNode({ node: String(item.node) }); assert.equal(item.playwright, "1.62.0") }
  if (sequence === 2) {
    assert.match(String(item.browser), /^\d+\.\d+\.\d+\.\d+$/u); assert.equal(item.closed, true)
    assert.deepEqual(item.cases, examplesCaseNames); assert.deepEqual(item.negativeControls, examplesNegativeControls)
    assert.ok(Array.isArray(item.observations) && item.observations.length === examplesCaseNames.length)
    for (const [index, value] of item.observations.entries()) {
      const observation = shellRecord(value), name = examplesCaseNames[index]!
      assert.equal(observation.name, name); assert.equal(observation.passed, true)
      if (index < siteShellCases.length) {
        keys(observation, ["name", "passed", "currentObstructions", "baselineObstructions"])
        assert.deepEqual(observation.currentObstructions, []); assert.deepEqual(observation.baselineObstructions, [])
      } else if (index < siteShellCases.length + siteCopyCases.length) {
        keys(observation, ["name", "passed", "command", "current", "baseline"])
        assert.equal(observation.command, refinementInstallCommand)
        assertCopyPorts(observation.current as CopyEvidence["ports"], refinementInstallCommand)
        assertCopyPorts(observation.baseline as CopyEvidence["ports"], refinementInstallCommand)
      } else if (!name.startsWith("player-")) {
        keys(observation, ["name", "passed", "figures", "videos", "shellPaired", "navigation"]); assert.equal(observation.shellPaired, true)
        const scenario = [...examplesDocsCases, ...examplesDocsExtraCases].find(candidate => candidate.name === name)!
        const navigation = shellRecord(observation.navigation)
        keys(navigation, ["mode", "javascript", "currentHref", "defaultClosed", "keyboardToggle", "closedLinksHidden", "articleBeforeFold"])
        assert.equal(navigation.mode, scenario.width <= 768 ? "disclosure" : "sidebar")
        assert.equal(navigation.javascript, !("javascript" in scenario && scenario.javascript === false))
        assert.equal(navigation.currentHref, scenario.route)
        assert.equal(navigation.keyboardToggle, scenario.width <= 768 ? "enter-open-space-close" : "not-applicable")
        for (const field of ["defaultClosed", "closedLinksHidden", "articleBeforeFold"]) assert.equal(navigation[field], true)
        for (const field of ["figures", "videos"]) assert.ok(Number.isSafeInteger(observation[field]) && Number(observation[field]) >= 0 && Number(observation[field]) <= 32)
        if (name.includes("first-diagram")) assert.ok(Number(observation.figures) >= 2)
        if (name.includes("first-animation")) assert.equal(observation.videos, 2)
        if (name.includes("parametric-design")) { assert.equal(observation.figures, 5); assert.equal(observation.videos, 0) }
        if (name.includes("/edit-video-")) { assert.equal(observation.figures, 7); assert.equal(observation.videos, 7) }
      } else parsePlayerObservation(observation, request, name)

    }
  }
  return item
}
function parsePlayerObservation(item: Record<string, unknown>, request: ExamplesRequest, name: string): void {
  const captioned = request.media.some(video => video.captions)
  const quietInitial = ["player-no-js", "player-docs-manual", "player-reduced-motion", "player-save-data", "player-failed-media", "player-captions"].includes(name)
  if (name === "player-captions" && !captioned) {
    keys(item, ["name", "passed", "captions", "media", "initialMediaRequests"]); assert.equal(item.initialMediaRequests, 0); assert.equal(item.captions, "not-present"); assert.deepEqual(item.media, []); return
  }
  const additional = name === "player-save-data" ? ["policyInput"] : name === "player-offscreen-hidden" || name === "player-manual-pause" ? ["hiddenObserved"] : name === "player-captions" ? ["captionCues"] : name === "player-failed-media" ? ["failedRequests", "sourceError"] : []
  keys(item, ["name", "passed", "media", ...additional, ...(quietInitial ? ["initialMediaRequests"] : [])])
  if (quietInitial) assert.equal(item.initialMediaRequests, 0)
  assert.ok(Array.isArray(item.media) && item.media.length > 0 && item.media.length <= 32)
  const seen = new Set<string>(); let playing = 0, advanced = 0
  for (const value of item.media) {
    const sample = shellRecord(value)
    keys(sample, ["id", "paused", "time", "controls", "readyState", "muted", "error", "source"])
    assert.equal(typeof sample.id, "string"); const expected = request.media.find(media => media.id === sample.id); assert.ok(expected && !seen.has(expected.id)); seen.add(expected.id)
    assert.equal(sample.controls, true); assert.equal(typeof sample.paused, "boolean"); assert.equal(typeof sample.muted, "boolean")
    assert.ok(typeof sample.time === "number" && sample.time >= 0 && sample.time <= expected.durationSeconds + .1)
    assert.ok(Number.isSafeInteger(sample.readyState) && Number(sample.readyState) >= 0 && Number(sample.readyState) <= 4)
    assert.equal(sample.source, `${request.current.origin}${expected.path}`)
    if (name !== "player-failed-media") assert.equal(sample.error, null)
    else assert.ok(sample.error === null || [1, 2, 3, 4].includes(Number(sample.error)))
    if (!sample.paused) playing++
    if (sample.time > .04) advanced++
  }
  if (name === "player-visible-auto" || name === "player-offscreen-hidden") assert.equal(playing, 1)
  else assert.equal(playing, 0)
  if (["player-no-js", "player-docs-manual", "player-manual-pause", "player-reduced-motion", "player-save-data", "player-captions"].includes(name)) assert.ok(advanced > 0)
  if (name === "player-save-data") assert.equal(item.policyInput, "emulated-navigator-save-data")
  if (name === "player-offscreen-hidden" || name === "player-manual-pause") assert.equal(item.hiddenObserved, true)
  if (name === "player-captions") assert.ok(Number.isSafeInteger(item.captionCues) && Number(item.captionCues) > 0)
  if (name === "player-failed-media") {
    assert.equal(item.failedRequests, 1)
    const failure = shellRecord(item.sourceError), expected = request.media.find(media => media.id === "editorial")!
    keys(failure, ["id", "source", "count", "owned"])
    assert.equal(failure.id, expected.id); assert.equal(failure.source, `${request.current.origin}${expected.path}`)
    assert.equal(failure.count, 1); assert.equal(failure.owned, true)
    assert.ok(item.media.some(value => shellRecord(value).id === expected.id))
  }
}
export function parseExamplesCaseFailure(value: unknown, request: ExamplesRequest): Record<string, unknown> {
  const item = shellRecord(value)
  keys(item, ["schemaVersion", "token", "scope", "accepted", "completed", "scenario", "stage", "comparedCases", "error"])
  assert.equal(item.schemaVersion, 1); assert.equal(item.token, request.token); assert.equal(item.scope, examplesScope)
  assert.equal(item.accepted, false); assert.equal(item.completed, false)
  assert.ok(["current", "baseline", "pair", "comparison", "docs", "player"].includes(String(item.stage)))
  assert.ok(Array.isArray(item.comparedCases) && item.comparedCases.length < examplesCaseNames.length)
  assert.deepEqual(item.comparedCases, examplesCaseNames.slice(0, item.comparedCases.length)); assert.equal(item.scenario, examplesCaseNames[item.comparedCases.length])
  assert.ok(typeof item.error === "string" && item.error.length > 0 && item.error.length <= 2048 && !/[\x00-\x1f]/u.test(item.error))
  return item
}
export function examplesCaseFailure(request: ExamplesRequest, scenario: string, stage: string, comparedCases: readonly string[], error: unknown) {
  return parseExamplesCaseFailure({ schemaVersion: 1, token: request.token, scope: examplesScope, accepted: false, completed: false,
    scenario, stage, comparedCases: [...comparedCases], error: String(error).replace(/[\x00-\x1f]/gu, " ").slice(0, 2048) || "Unknown failure" }, request)
}
export function examplesContentType(path: string): string {
  if (path === "/docs" || /^\/docs\/[a-z-]+\/[a-z-]+$/u.test(path)) return "text/html; charset=utf-8"
  if (path.endsWith(".mp4")) return "video/mp4"
  if (path.endsWith(".vtt")) return "text/vtt; charset=utf-8"
  if (path.endsWith(".json") || path.endsWith(".tldr")) return "application/json; charset=utf-8"
  return shellContentType(path)
}
export function parseExampleByteRange(value: string, bytes: number, path: string): { start: number; end: number } | undefined {
  if (!path.endsWith(".mp4") || !Number.isSafeInteger(bytes) || bytes <= 0 || value.length > 64) return undefined
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value)
  if (!match || (!match[1] && !match[2])) return undefined
  const first = match[1] ? Number(match[1]) : undefined, last = match[2] ? Number(match[2]) : undefined
  if ([first, last].some(number => number !== undefined && !Number.isSafeInteger(number))) return undefined
  if (first === undefined) return last && last > 0 ? { start: Math.max(0, bytes - last), end: bytes - 1 } : undefined
  if (first >= bytes || (last !== undefined && last < first)) return undefined
  return { start: first, end: Math.min(last ?? bytes - 1, bytes - 1) }
}

/** Literal reviewed islands are checked before substitution. No old support
 * obstruction allowlist is imported; both sides must be entirely unobstructed. */
export interface ExamplesDomProjection { readonly dom: string; readonly text: Readonly<Record<string, string>> }
export async function examplesDom(page: Page, current: boolean, scenario: ShellCase): Promise<ExamplesDomProjection> {
  return page.evaluate(({ current, home, islands, selectors }) => {
    const body = document.body.cloneNode(true) as HTMLElement
    for (const script of body.querySelectorAll("script")) script.remove()
    const textOwners = selectors.flatMap(selector => (body.matches(selector) ? [body] : [...body.querySelectorAll(selector)])
      .map((node, index) => ({ key: `${selector}[${index}]`, node })))
    if (home) for (const [index, fixture] of islands.entries()) {
      const selected = body.querySelectorAll(fixture.selector)
      if (selected.length !== 1) throw new Error(`Example fixture owner count: ${fixture.selector}`)
      const element = selected[0]!
      if (element.outerHTML !== (current ? fixture.current : fixture.baseline)) throw new Error(`Unreviewed example island: ${fixture.selector}`)
      element.replaceWith(document.createComment(`reviewed-example-island-${index}`))
    }
    return { dom: body.outerHTML, text: Object.fromEntries(textOwners.map(({ key, node }) => [key,
      body.contains(node) ? node.textContent?.replace(/\s+/gu, " ").trim() ?? "" : ""])) }
  }, { current, home: scenario.route === "/", islands: examplesIslands, selectors: ["body", "#main", ...workflowExamplesHomeSelectors] })
}
const near = (actual: number, expected: number, label: string) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= .5, label)
export function compareExamplesHeroBackgroundImage(actual: string, baseline: string,
  origins: Readonly<{ current: string; baseline: string }>): string {
  for (const origin of [origins.current, origins.baseline]) {
    assert.match(origin, /^http:\/\/127\.0\.0\.1:\d{1,5}$/u)
    const port = Number(new URL(origin).port)
    assert.ok(port > 0 && port <= 65535)
  }
  assert.notEqual(origins.current, origins.baseline)
  if (actual === "none" || baseline === "none") {
    assert.equal(actual, baseline, "Paired hero background visibility changed")
    return baseline
  }
  const project = (value: string, origin: string) => {
    assert.equal(value.match(/\burl\(/giu)?.length, 2, "Hero must retain exactly two texture layers")
    assert.deepEqual([...value.matchAll(/url\("([^"\n]+)"\)/gu)].map(match => match[1]),
      examplesHeroTextures.map(asset => `${origin}/${asset.path}`), "Hero texture origin, path and order must be exact")
    for (const asset of examplesHeroTextures) value = value.replace(`url("${origin}/${asset.path}")`, `url("/${asset.path}")`)
    return value
  }
  assert.equal(project(actual, origins.current), project(baseline, origins.baseline), "Every other hero background byte remains paired")
  return baseline
}
export function compareExamplesFlow(actual: readonly ShellElement[], baseline: readonly ShellElement[]): number {
  assert.deepEqual(actual.map(item => item.key), baseline.map(item => item.key))
  let previousDelta = 0
  for (const [index, item] of actual.entries()) {
    const old = baseline[index]!, selector = item.key.replace(/\[\d+\]$/u, "")
    for (const rect of [item.rect, old.rect]) assert.ok(rect.length === 4 && rect.every(Number.isFinite), `${selector}: finite rectangle`)
    near(item.rect[0]!, old.rect[0]!, `${selector}: x`); near(item.rect[2]!, old.rect[2]!, `${selector}: width`)
    near(item.rect[1]! - old.rect[1]!, previousDelta, `${selector}: flow translation`)
    assert.ok(item.rect[3]! > 0 && old.rect[3]! > 0)
    const delta = item.rect[3]! - old.rect[3]!
    if (!examplesHeightOwners.includes(selector)) near(delta, 0, `${selector}: undeclared height change`)
    previousDelta += delta
  }
  return previousDelta
}
export interface ExamplesDesign {
  readonly flow: readonly ShellElement[]
  readonly hero: RefinementHero | undefined
  readonly actions: ExamplesActions | undefined
}
/** Ordinary flow coordinates are document-relative. A fixed ancestor instead
 * requires strict viewport coordinates from the independently observed scroll. */
export function projectExamplesState(items: readonly ShellElement[], previous: readonly ShellElement[],
  positions: readonly ShellCurrentDesignPosition[], oldPositions: readonly ShellCurrentDesignPosition[],
  deltaFor: (key: string) => number): ShellElement[] {
  assert.equal(positions.length, items.length); assert.equal(oldPositions.length, previous.length)
  assert.equal(items.length, previous.length)
  return items.map((item, index) => {
    const old = previous[index]!, position = positions[index]!, prior = oldPositions[index]!
    assert.equal(item.key, old.key); assert.equal(position.key, item.key); assert.equal(prior.key, item.key)
    assert.equal(position.fixed, prior.fixed, `${item.key}: fixed ancestry changed`)
    assert.ok(Number.isFinite(position.scrollY) && Number.isFinite(prior.scrollY))
    const delta = position.fixed ? position.scrollY - prior.scrollY : deltaFor(item.key)
    near(item.rect[1]! - old.rect[1]!, delta, `${item.key}: ${position.fixed ? "fixed viewport" : "declared flow"} Y`)
    return { ...item, rect: [item.rect[0]!, old.rect[1]!, item.rect[2]!, item.rect[3]!] }
  })
}
export function compareExamplesEvidence(actual: ShellEvidence, baseline: ShellEvidence, scenario: ShellCase,
  currentDesign: ExamplesDesign, baselineDesign: ExamplesDesign,
  currentDom: ExamplesDomProjection, baselineDom: ExamplesDomProjection,
  positions: ShellCurrentDesignPositions, oldPositions: ShellCurrentDesignPositions,
  origins: Readonly<{ current: string; baseline: string }>): void {
  assert.deepEqual(actual.obstructions, [], "Current controls are obstructed")
  assert.deepEqual(baseline.obstructions, [], "This baseline must have no inherited historical obstruction allowance")
  assert.equal(currentDom.dom, baselineDom.dom, "Only separately reviewed semantic islands may differ")
  if (scenario.route === "/404.html") { compareShellEvidence(actual, baseline, scenario.name); return }
  const currentFlow = currentDesign.flow, baselineFlow = baselineDesign.flow
  const total = compareExamplesFlow(currentFlow, baselineFlow)
  const hero = currentDesign.hero, oldHero = baselineDesign.hero
  assert.ok(hero && oldHero && currentDesign.actions && baselineDesign.actions)
  const retained = projectExamplesHeroActions(hero, oldHero, currentDesign.actions, baselineDesign.actions)
  compareRefinementHeroCopies(retained, oldHero)
  const sectionDelta = (selector: string) => {
    const item = currentFlow.find(row => row.key === `${selector}[0]`), old = baselineFlow.find(row => row.key === `${selector}[0]`)
    assert.ok(item && old); return item.rect[1]! - old.rect[1]!
  }
  const deltaFor = (key: string): number => {
    const selector = key.replace(/\[\d+\]$/u, "")
    if (examplesFlowSections.includes(selector as typeof examplesFlowSections[number])) return sectionDelta(selector)
    if (selector === "#page-title" || selector === ".hraness-marketing-hero__summary") return hero.copyTop - oldHero.copyTop
    if (selector.startsWith(".slopcamera-ask-ai")) return sectionDelta("#closing")
    if (selector === "#hraness-site-footer" || selector.startsWith(".hraness-site-footer__")) return total
    return 0
  }
  const projected = projectExamplesState(actual.elements, baseline.elements, positions.elements, oldPositions.elements, deltaFor)
    .map((item, index) => {
      const old = baseline.elements[index]!, owner = item.key.replace(/\[\d+\]$/u, "")
      let height = item.rect[3]!, styles = { ...item.styles }
      // Only these two exact hash-bound textures may differ by the two owned
      // servers' origins. Preserve raw evidence and every other paint byte.
      if (item.key === ".hraness-marketing-hero[0]") styles["background-image"] = compareExamplesHeroBackgroundImage(
        item.styles["background-image"]!, old.styles["background-image"]!, origins)
      if (owner === "body" || owner === "#main") near(height - old.rect[3]!, total, `${owner}: complete content-height delta`)
      if (owner === "body" || owner === "#main" || examplesHeightOwners.includes(owner)) { height = old.rect[3]!; styles.height = old.styles.height! }
      return { ...item, rect: [item.rect[0]!, item.rect[1]!, item.rect[2]!, height], styles,
        text: currentDom.text[item.key] ?? item.text }
    })
  const oldElements = baseline.elements.map(item => ({ ...item, text: baselineDom.text[item.key] ?? item.text }))
  // Reuse also asserts direction, skip, appearance, recovery and every retained
  // measured style/semantic property after these closed coordinate projections.
  compareShellEvidence({ ...actual, dom: currentDom.dom, elements: projected,
    focus: projectExamplesState(actual.focus, baseline.focus, positions.focus, oldPositions.focus, deltaFor),
    hover: projectExamplesState(actual.hover, baseline.hover, positions.hover, oldPositions.hover, deltaFor) },
  { ...baseline, dom: baselineDom.dom, elements: oldElements }, scenario.name)
}
export async function observeExamplesDesign(page: Page, scenario: ShellCase, payload: ShellPayload, negative: boolean) {
  if (scenario.route !== "/") return { flow: [] as ShellElement[], hero: undefined, actions: undefined }
  const flow = await measure(page, examplesFlowSections), hero = await observeRefinementHero(page, scenario)
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
    const sheet = await page.evaluateHandle(href => {
      const sheet = [...document.styleSheets].find(value => value.href === href)
      if (!sheet || sheet.disabled) throw new Error("Missing example stylesheet")
      sheet.disabled = true; return sheet
    }, `${payload.origin}${payload.stylesheets[0]}`)
    try {
      await settle(page, scenario.direction)
      const removed = await measure(page, selectors)
      assert.notDeepEqual(removed.map(item => item.styles), before.map(item => item.styles), "Example stylesheet negative did not change paint")
    } finally { await sheet.evaluate(sheet => { sheet.disabled = false }); await settle(page, scenario.direction); await sheet.dispose() }
    compareShellElements(await measure(page, selectors), before, "Restored example stylesheet")
  }
  return { flow, hero, actions }
}
export function compareExamplesCopy(actual: CopyEvidence, baseline: CopyEvidence, scenario: ShellCase, negative: boolean) {
  assert.equal(actual.command, refinementInstallCommand); assert.equal(baseline.command, refinementInstallCommand)
  assert.deepEqual(actual.negativeControls, negative ? copyNegativeControls : []); assert.deepEqual(baseline.negativeControls, [])
  for (const side of [actual, baseline]) {
    assertCopyPorts(side.ports, refinementInstallCommand); assert.deepEqual(side.steps.map(step => step.name), copySteps)
    for (const step of side.steps) assert.deepEqual(step.elements.map(item => item.key), refinementCopyElementKeys)
  }
  for (const [index, step] of actual.steps.entries()) {
    const previous = baseline.steps[index]!.elements
    const offset = step.elements[0]!.rect[1]! - previous[0]!.rect[1]!
    compareShellElements(step.elements.map(item => ({ ...item, rect: [item.rect[0]!, item.rect[1]! - offset, item.rect[2]!, item.rect[3]!] as const })), previous, `${scenario.name} ${step.name}`)
  }
  return { name: scenario.name, passed: true, command: refinementInstallCommand, current: actual.ports, baseline: baseline.ports }
}
export const examplesDirectedRatios = [
  { id: "edit-directed-landscape", width: 1280, height: 720 },
  { id: "edit-directed-portrait", width: 720, height: 1280 },
  { id: "edit-directed-square", width: 960, height: 960 },
  { id: "edit-directed-feed-portrait", width: 864, height: 1080 },
] as const
export interface ExampleRatioGeometry {
  readonly id: string; readonly widthAttribute: number; readonly heightAttribute: number; readonly source: string
  readonly x: number; readonly width: number; readonly height: number; readonly objectFit: string
}
export function assertExamplesRatioGeometry(observed: readonly ExampleRatioGeometry[], media: readonly ExampleVideoInput[], viewport: { width: number; height: number }): void {
  assert.deepEqual(observed.map(item => item.id), examplesDirectedRatios.map(item => item.id))
  for (const [index, item] of observed.entries()) {
    const expected = examplesDirectedRatios[index]!, admitted = media.find(video => video.id === expected.id)
    assert.ok(admitted, `Missing admitted ratio ${expected.id}`)
    assert.equal(admitted.width, expected.width); assert.equal(admitted.height, expected.height)
    assert.equal(item.widthAttribute, admitted.width); assert.equal(item.heightAttribute, admitted.height)
    assert.equal(item.source, admitted.path); assert.equal(item.objectFit, "contain")
    for (const value of [item.x, item.width, item.height]) assert.ok(Number.isFinite(value))
    assert.ok(item.x >= -.5 && item.width > 0 && item.x + item.width <= viewport.width + .5)
    assert.ok(item.height > 0 && item.height <= Math.min(viewport.height * .72, 672) + .5)
  }
}
async function assertExampleGeometry(page: Page, width: number): Promise<void> {
  const media = await page.locator(".slopcamera-example__media").evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element)
    return { x: box.x, width: box.width, height: box.height, fit: style.objectFit, controls: element instanceof HTMLVideoElement ? element.controls : null,
      alt: element instanceof HTMLImageElement ? element.alt : null, maximum: Math.min(innerHeight * .72, 672) }
  }))
  assert.ok(media.length > 0)
  for (const item of media) { assert.ok(item.x >= -.5 && item.x + item.width <= width + .5 && item.width > 0 && item.height > 0 && item.height <= item.maximum + .5); assert.equal(item.fit, "contain"); if (item.controls !== null) assert.equal(item.controls, true); if(item.alt !== null) assert.ok(item.alt.length > 0) }
  const captions = await page.locator(".slopcamera-example__caption").evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
    return { x: rect.x, right: rect.right, size: parseFloat(style.fontSize), line: parseFloat(style.lineHeight), overflow: element.scrollWidth > element.clientWidth + 1 }
  }))
  assert.equal(captions.length, media.length)
  for (const caption of captions) assert.ok(caption.x >= -.5 && caption.right <= width + .5 && caption.size >= 14 && caption.line >= caption.size * 1.3 && !caption.overflow)
  const links = await page.locator(".slopcamera-example__links a").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
  assert.ok(links.length >= media.length * 2); for (const height of links) assert.ok(height >= 44)
}

interface PageCaseOptions {
  readonly width: number; readonly height: number; readonly theme: "light" | "dark"; readonly forced?: "none" | "active"
  readonly javascript?: boolean; readonly reducedMotion?: boolean; readonly saveData?: boolean; readonly failMedia?: string
}
async function withExamplesPage<T>(browser: Browser, request: ExamplesRequest, route: string, options: PageCaseOptions,
  action: (page: Page, received: Set<string>, requestCounts: Map<string, number>) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, colorScheme: options.theme,
    forcedColors: options.forced ?? "none", javaScriptEnabled: options.javascript ?? true,
    reducedMotion: "reduce", bypassCSP: false, serviceWorkers: "block" })
  context.setDefaultTimeout(5_000)
  const errors: string[] = [], received = new Set<string>(), requestCounts = new Map<string, number>(), pending = new Map<Request, () => void>()
  const error = (value: string) => { if (errors.length < 64) errors.push(value.slice(0, 512)) }
  const operations = shellOperationTracker(error), lifecycle = shellContextLifecycle(error)
  browser.on("disconnected", lifecycle.browserDisconnected)
  return withShellCaseCleanup(async () => {
    if (options.saveData) await context.addInitScript(() => {
      // A controlled policy input, reported as emulation in the receipt.
      const connection = new EventTarget()
      Object.defineProperty(connection, "saveData", { value: true })
      Object.defineProperty(navigator, "connection", { value: connection })
    })
    await context.routeWebSocket("**/*", socket => operations.track("Examples WebSocket denial", denyShellWebSocket(socket, error)))
    await context.route("**/*", route => operations.track("Examples resource admission", (async () => {
      const incoming = route.request(), url = new URL(incoming.url())
      if (incoming.method() !== "GET" || url.origin !== request.current.origin || url.search !== "" || !request.current.resources.includes(url.pathname)) {
        error(`Unadmitted request ${incoming.method()} ${url.origin}${url.pathname}`); await route.abort("blockedbyclient")
      } else if (url.pathname === options.failMedia) await route.abort("failed")
      else await route.continue()
    })()))
    const page = await context.newPage()
    page.on("close", lifecycle.pageClosed)
    page.on("request", incoming => {
      const path = new URL(incoming.url()).pathname
      received.add(path); requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1)
      void operations.track("Examples request", new Promise<void>(resolve => pending.set(incoming, resolve)))
    })
    const finish = (incoming: Request) => {
      const done = pending.get(incoming)
      if (!done) error(`Unobserved request completion: ${incoming.url()}`)
      else { pending.delete(incoming); done() }
    }
    page.on("requestfinished", finish)
    page.on("requestfailed", incoming => {
      if (new URL(incoming.url()).pathname !== options.failMedia) error(`Resource failed: ${incoming.url()}`)
      finish(incoming)
    })
    page.on("pageerror", failure => error(failure.message))
    page.on("console", message => {
      if (message.type() === "error" && !(options.failMedia && message.location().url === `${request.current.origin}${options.failMedia}`
        && /Failed to load resource/u.test(message.text()))) error(message.type() === "error" ? message.text() : "")
    })
    page.on("response", response => operations.track("Examples response", (async () => {
      const path = new URL(response.url()).pathname
      assert.ok(response.status() === 200 || (path.endsWith(".mp4") && response.status() === 206), `Unexpected response status ${path}`)
      assert.equal(response.headers()["content-type"], examplesContentType(path))
      assert.equal(await response.finished(), null)
    })()))
    const protocol = await context.newCDPSession(page)
    await protocol.send("Log.enable")
    protocol.on("Log.entryAdded", ({ entry }) => {
      if (options.failMedia && entry.source === "network" && entry.url === `${request.current.origin}${options.failMedia}`) return
      if (entry.level === "error" || entry.source === "security") error(`${entry.source}: ${entry.text}`)
    })
    const response = await page.goto(`${request.current.origin}${route}`, { waitUntil: "load" })
    assert.ok(response && response.status() === 200)
    for (const [key, value] of Object.entries(siteShellHeaders)) assert.equal(response.headers()[key], value)
    assert.equal(page.frames().length, 1)
    if (options.javascript !== false) {
      await page.locator('[data-hraness-appearance-menu][data-ready="true"]').waitFor()
      await chooseAppearance(page, options.theme, options.theme)
      await page.goto(`${request.current.origin}${route}`, { waitUntil: "load" })
    }
    // Appearance setup reloads once to start native keyboard traversal at the
    // document boundary. Suppress previews until that navigation is complete,
    // then apply the actual case policy without abandoning a media request.
    if (options.reducedMotion === false) await page.emulateMedia({ reducedMotion: "no-preference" })
    await settleExamples(page, options.javascript)
    const result = await action(page, received, requestCounts)
    await operations.settle("Examples case network settlement")
    assert.deepEqual(errors, []); assert.equal(pending.size, 0); assert.equal(page.isClosed(), false); assert.equal(browser.isConnected(), true)
    await protocol.detach(); operations.seal()
    return result
  }, async () => {
    lifecycle.beginContextClose()
    try {
      await bounded(context.close(), "Examples context collection", 5_000)
      await operations.settle("Examples late operation collection")
      assert.equal(pending.size, 0); assert.equal(operations.size, 0); assert.deepEqual(errors, [])
      assert.equal(browser.isConnected(), true)
    } finally { browser.off("disconnected", lifecycle.browserDisconnected) }
  })
}
async function settleExamples(page: Page, javascript = true): Promise<void> {
  if (javascript) return settle(page)
  // Disabling script execution also suppresses page animation-frame callbacks.
  // Native font loading and a compositor screenshot still settle real paint.
  await page.evaluate(async () => {
    await document.fonts.ready
    const fonts = await Promise.all([
      document.fonts.load('400 44px "Instrument Serif"'),
      document.fonts.load('400 16px "Nebula Sans"'),
      document.fonts.load('500 16px "Nebula Sans"'),
    ])
    if (fonts.some(group => group.length === 0 || group.some(font => font.status !== "loaded"))) throw new Error("Local fonts did not load")
  })
  await page.screenshot({ animations: "allow" })
}
async function assertNativeTarget(page: Page, selector: string, javascript = true): Promise<void> {
  const target = page.locator(selector)
  assert.equal(await target.count(), 1)
  // Only native Tab moves focus. Evaluation observes focus and paint.
  let reached = await target.evaluate(node => document.activeElement === node)
  for (let index = 0; !reached && index < 256; index++) {
    await page.keyboard.press("Tab")
    if (await target.evaluate(node => document.activeElement === node)) { reached = true; break }
  }
  assert.equal(reached, true, `Native Tab never reached ${selector}`)
  await settleExamples(page, javascript)
  const evidence = await target.evaluate(node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return { visible: rect.width > 0 && rect.height > 0 && rect.top >= -.5 && rect.bottom <= innerHeight + .5,
      hit: hit === node || hit !== null && node.contains(hit), outline: style.outlineStyle, width: parseFloat(style.outlineWidth) }
  })
  assert.ok(evidence.visible && evidence.hit && evidence.outline !== "none" && evidence.width > 0, `Unreachable/unpainted target ${selector}`)
}
/** Actual native disclosure behavior, shared with the bounded local diagnostic. */
export async function checkDocsNavigation(page: Page, scenario: { readonly route: string; readonly width: number; readonly javascript?: boolean }) {
  assert.equal(await page.locator("main#main").count(), 1); assert.equal(await page.locator("h1").count(), 1)
  const mobile = scenario.width <= 768
  const menu = page.locator("details[data-docs-menu]"), summary = page.locator("details[data-docs-menu] > summary")
  const desktopNav = page.locator('nav[data-docs-navigation="desktop"]')
  const mobileNav = page.locator('nav[data-docs-navigation="mobile"]')
  assert.equal(await page.locator("nav[data-docs-navigation]").count(), 2)
  assert.deepEqual(await page.locator('nav[data-docs-navigation] a[aria-current="page"]').evaluateAll(elements => elements.map(element => element.getAttribute("href"))), [scenario.route, scenario.route])
  assert.equal(await desktopNav.isVisible(), !mobile); assert.equal(await menu.isVisible(), mobile)
  assert.equal(await menu.evaluate(element => (element as HTMLDetailsElement).open), false)
  assert.equal(await mobileNav.isVisible(), false)
  assert.equal(await page.locator('nav[data-docs-navigation="mobile"] a').evaluateAll(elements => elements.every(element => !element.checkVisibility())), true)
  const articleBeforeFold = await page.locator("h1").evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom < innerHeight - 60 })
  assert.equal(articleBeforeFold, true, "Direct guide visits must expose the article title before the fold")
  await page.keyboard.press("Tab")
  assert.equal(await page.locator(".skip-link").evaluate(node => document.activeElement === node), true)
  await page.keyboard.press("Enter")
  assert.equal(await page.locator("#main").evaluate(node => document.activeElement === node), true)
  if (mobile) {
    await page.keyboard.press("Shift+Tab")
    assert.equal(await summary.evaluate(element => document.activeElement === element), true,
      "The closed menu summary must directly precede the article in native Tab order")
    await assertNativeTarget(page, "details[data-docs-menu] > summary", scenario.javascript)
    assert.ok(await summary.evaluate(element => element.getBoundingClientRect().height >= 44))
    assert.ok((await summary.textContent())!.includes((await page.locator("h1").textContent())!))
    await page.keyboard.press("Enter")
    assert.equal(await menu.evaluate(element => (element as HTMLDetailsElement).open), true)
    assert.equal(await mobileNav.isVisible(), true); assert.equal(await desktopNav.isVisible(), false)
    assert.equal(await mobileNav.locator('a[aria-current="page"]').isVisible(), true)
    await page.keyboard.press("Space")
    assert.equal(await menu.evaluate(element => (element as HTMLDetailsElement).open), false)
    assert.equal(await mobileNav.isVisible(), false)
    await page.keyboard.press("Tab")
    assert.equal(await page.evaluate(() => document.activeElement?.closest("nav[data-docs-navigation]") === null), true,
      "Closed and breakpoint-hidden navigation links must leave the native Tab order")
  }
  return { mode: scenario.width <= 768 ? "disclosure" : "sidebar", javascript: scenario.javascript !== false, currentHref: scenario.route,
    defaultClosed: true, keyboardToggle: scenario.width <= 768 ? "enter-open-space-close" : "not-applicable", closedLinksHidden: true, articleBeforeFold }
}
export async function checkExamplesDocs(browser: Browser, request: ExamplesRequest,
  scenario: (typeof examplesDocsCases)[number] | (typeof examplesDocsExtraCases)[number]) {
  const shellSelectors = [".skip-link", ".topbar", ".wordmark", ".topbar-actions", '.topbar nav[aria-label="Primary"]',
    '.topbar nav[aria-label="Primary"] a', '[data-hraness-appearance-menu] button']
  const shellMarkup = (page: Page) => page.locator(".skip-link, .topbar, #hraness-site-footer").evaluateAll(elements => elements.map(element => element.outerHTML))
  const baseline = await withExamplesPage(browser, { ...request, current: request.baseline }, "/docs", { ...scenario }, async page => ({
    markup: await shellMarkup(page), elements: await measure(page, shellSelectors),
  }))
  return withExamplesPage(browser, request, scenario.route, { ...scenario }, async (page, received) => {
    assert.deepEqual(await shellMarkup(page), baseline.markup, "Documentation retains the exact baseline header and footer")
    compareShellElements(await measure(page, shellSelectors), baseline.elements, `${scenario.name}: retained documentation shell`)
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
const playerSelector = (id: string) => `figure[data-example-id="${id}"] video`
async function videoState(page: Page, id: string) {
  return page.locator(playerSelector(id)).evaluate((video: HTMLVideoElement) => ({ paused: video.paused, time: video.currentTime,
    controls: video.controls, readyState: video.readyState, muted: video.muted, error: video.error?.code ?? null, source: video.currentSrc || video.querySelector("source")?.src || "" }))
}
async function waitPlaying(page: Page, id: string, javascript = true): Promise<void> {
  if (!javascript) {
    const start = (await videoState(page, id)).time, deadline = performance.now() + 5_000
    while (performance.now() < deadline) {
      const state = await videoState(page, id)
      if (!state.paused && Math.abs(state.time - start) > .04) return
      await delay(20)
    }
    throw new Error("Native no-JavaScript video did not advance")
  }
  const start = (await videoState(page, id)).time
  await page.waitForFunction(({ id, start }) => { const video = document.querySelector<HTMLVideoElement>(`figure[data-example-id="${id}"] video`); return video && !video.paused && Math.abs(video.currentTime - start) > .04 }, { id, start })
}
async function assertQuiet(page: Page, ids: readonly string[], javascript = true): Promise<void> {
  if (!javascript) {
    const deadline = performance.now() + 350
    do {
      for (const id of ids) assert.equal((await videoState(page, id)).paused, true, "Unexpected native no-JavaScript playback")
      await delay(20)
    } while (performance.now() < deadline)
    return
  }
  // Observe a policy-settlement interval through actual animation frames.
  await page.evaluate(async ids => {
    const start = performance.now()
    await new Promise<void>((resolve, reject) => {
      const frame = () => {
        if (ids.some(id => { const video = document.querySelector<HTMLVideoElement>(`figure[data-example-id="${id}"] video`); return video && !video.paused })) { reject(new Error("Unexpected playback during policy settlement")); return }
        if (performance.now() - start >= 350) resolve(); else requestAnimationFrame(frame)
      }; requestAnimationFrame(frame)
    })
  }, ids)
}
async function throughRealHiddenState(page: Page, assertHidden: () => Promise<void>): Promise<void> {
  const other = await page.context().newPage()
  try {
    await other.goto("about:blank"); await other.bringToFront()
    await page.waitForFunction(() => document.visibilityState === "hidden", undefined, { polling: 50 })
    await assertHidden()
    await page.bringToFront()
    await page.waitForFunction(() => document.visibilityState === "visible")
  } finally { await other.close() }
}
async function watchOwnedSourceFailure(page: Page, id: string, sourceUrl: string) {
  return page.locator(playerSelector(id)).evaluateHandle((video: HTMLVideoElement, expected) => {
    const sources = [...video.children].filter((node): node is HTMLSourceElement => node instanceof HTMLSourceElement)
    if (sources.length !== 1 || sources[0]!.src !== expected.sourceUrl
      || video.closest("[data-example-id]")?.getAttribute("data-example-id") !== expected.id)
      throw new Error("Failed-media observation requires the exact owned source")
    const source = sources[0]!
    const state = { id: expected.id, source: source.src, count: 0, owned: true }
    const listener = (event: Event) => {
      state.count++
      state.owned &&= event.target === source && event.currentTarget === source && source.parentElement === video
    }
    source.addEventListener("error", listener)
    return { state, dispose: () => source.removeEventListener("error", listener) }
  }, { id, sourceUrl })
}
export async function checkExamplesPlayer(browser: Browser, request: ExamplesRequest, name: typeof examplesPlayerCases[number]) {
  const javascript = name !== "player-no-js"
  const lesson = request.media.find(item => item.id === "editorial")!
  const docs = name === "player-no-js" || name === "player-docs-manual" || name === "player-failed-media" || name === "player-captions"
  const captioned = request.media.find(item => item.captions)
  const target = name === "player-captions" && captioned ? captioned : lesson
  const route = docs ? target.guide : "/"
  return withExamplesPage(browser, request, route, { width: 1440, height: 1000, theme: "light", javascript: name !== "player-no-js",
    reducedMotion: docs || name === "player-reduced-motion", saveData: name === "player-save-data",
    ...(name === "player-failed-media" ? { failMedia: target.path } : {}) }, async (page, received, requestCounts) => {
    const failureObserver = name === "player-failed-media"
      ? await watchOwnedSourceFailure(page, target.id, `${request.current.origin}${target.path}`) : undefined
    try {
      let hiddenObserved = false, captionCues = 0, initialMediaRequests: number | undefined
      const ids = await page.locator("video[data-example-player]").evaluateAll(elements => elements.map(element => element.closest("[data-example-id]")!.getAttribute("data-example-id")!))
      assert.ok(ids.length > 0)
      const attributes = await page.locator("video[data-example-player]").evaluateAll(elements => elements.map(node => {
        const video = node as HTMLVideoElement
        return { controls: video.controls, inline: video.playsInline, preload: video.preload, autoplay: video.hasAttribute("autoplay"),
          poster: video.getAttribute("poster"), source: video.querySelector("source")?.getAttribute("src") }
      }))
      for (const item of attributes) { assert.equal(item.controls, true); assert.equal(item.inline, true); assert.equal(item.preload, "none"); assert.equal(item.autoplay, false); assert.ok(item.poster && request.current.resources.includes(item.poster)); assert.ok(item.source && request.current.resources.includes(item.source)) }
      if (docs || name === "player-reduced-motion" || name === "player-save-data") {
        await assertQuiet(page, ids, javascript)
        initialMediaRequests = [...received].filter(path => path.endsWith(".mp4")).length
        assert.equal(initialMediaRequests, 0, "Video downloaded without permission")
      }
      if (name === "player-captions" && !captioned) return { name, passed: true, captions: "not-present", media: [], initialMediaRequests }
      if (docs) {
        await assertNativeTarget(page, playerSelector(target.id), javascript); await page.keyboard.press("Space")
        if (name === "player-failed-media") {
          assert.ok(failureObserver)
          await page.waitForFunction(observer => observer.state.count > 0, failureObserver)
          assert.equal((await videoState(page, target.id)).controls, true)
          const fallback = page.locator(`figure[data-example-id="${target.id}"] .slopcamera-example__links a[href="${target.path}"]`)
          assert.equal(await fallback.isVisible(), true)
          const status = page.locator(`figure[data-example-id="${target.id}"] [data-example-status]`)
          assert.equal(await status.isVisible(), true)
          assert.equal(await status.textContent(), "Video could not load. Open the video file or try the video controls again.")
          await assertQuiet(page, ids)
          await page.emulateMedia({ reducedMotion: "no-preference" })
          await page.locator(".topbar").scrollIntoViewIfNeeded()
          await page.locator(playerSelector(target.id)).scrollIntoViewIfNeeded()
          await assertQuiet(page, ids); assert.equal(requestCounts.get(target.path), 1)
          assert.deepEqual(await failureObserver.evaluate(observer => observer.state), {
            id: target.id, source: `${request.current.origin}${target.path}`, count: 1, owned: true,
          })
        } else {
          await waitPlaying(page, target.id, javascript)
          if (name === "player-captions") {
            const track = page.locator(`${playerSelector(target.id)} track[kind="captions"]`)
            assert.equal(await track.getAttribute("src"), target.captions!)
            await track.evaluate((node: HTMLTrackElement) => { node.track.mode = "showing" })
            await page.waitForFunction(id => { const track = document.querySelector<HTMLTrackElement>(`figure[data-example-id="${id}"] track`); return track?.readyState === 2 && (track.track.cues?.length ?? 0) > 0 }, target.id)
            captionCues = await track.evaluate((node: HTMLTrackElement) => node.track.cues?.length ?? 0)
          }
          await page.keyboard.press("Space"); await assertQuiet(page, [target.id], javascript)
        }
      } else if (name === "player-reduced-motion" || name === "player-save-data") {
        assert.equal(name === "player-save-data" ? await page.evaluate(() => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) : await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true)
        const manual = ids[0]!
        await assertNativeTarget(page, playerSelector(manual)); await page.keyboard.press("Space"); await waitPlaying(page, manual)
        await assertQuiet(page, ids.filter(id => id !== manual))
        await page.keyboard.press("Space"); await assertQuiet(page, ids)
      } else {
        const previews = await page.locator('video[data-example-preview="true"]').evaluateAll(elements => elements.map(video => video.closest("[data-example-id]")!.getAttribute("data-example-id")!))
        assert.ok(previews.length >= 1)
        const automatic = previews[0]!
        await page.locator(playerSelector(automatic)).scrollIntoViewIfNeeded(); await waitPlaying(page, automatic)
        assert.equal((await videoState(page, automatic)).muted, true)
        const playing = await page.locator("video").evaluateAll(elements => elements.filter(video => !(video as HTMLVideoElement).paused).length)
        assert.equal(playing, 1)
        if (name === "player-visible-auto") {
          const first = request.media.find(item => item.id === automatic); assert.ok(first)
          assert.deepEqual([...received].filter(path => path.endsWith(".mp4")), [first.path], "Offscreen preview fetched media")
          for (const id of previews.slice(1)) {
            await page.locator(playerSelector(id)).scrollIntoViewIfNeeded()
            // Two cards can share a row. Any single eligible visible preview may
            // retain ownership; a sibling is not required to steal playback.
            await page.waitForFunction(() => {
              const active = [...document.querySelectorAll<HTMLVideoElement>("video")].filter(video => !video.paused)
              if (active.length !== 1) return false
              const video = active[0]!, rect = video.getBoundingClientRect()
              const area = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0))
              return video.muted && video.currentTime > .04 && area / (rect.width * rect.height) >= .5
            })
          }
        } else if (name === "player-manual-pause") {
          const manual = ids.find(id => id !== automatic); assert.ok(manual)
          await assertNativeTarget(page, playerSelector(manual)); await page.keyboard.press("Space"); await waitPlaying(page, manual)
          await assertQuiet(page, previews.filter(id => id !== manual))
          await page.keyboard.press("Space"); await assertQuiet(page, ids)
          await page.locator(".topbar").scrollIntoViewIfNeeded(); await page.locator(playerSelector(manual)).scrollIntoViewIfNeeded()
          await chooseAppearance(page, "dark", "light"); await page.emulateMedia({ reducedMotion: "reduce" }); await page.emulateMedia({ reducedMotion: "no-preference" })
          await assertQuiet(page, ids)
          await throughRealHiddenState(page, async () => {
            for (const id of ids) assert.equal((await videoState(page, id)).paused, true)
            hiddenObserved = true
          })
          await assertQuiet(page, ids)
        } else {
          await page.locator("#closing").scrollIntoViewIfNeeded(); await assertQuiet(page, [automatic])
          await page.locator(playerSelector(automatic)).scrollIntoViewIfNeeded(); await waitPlaying(page, automatic)
          await throughRealHiddenState(page, async () => {
            assert.equal((await videoState(page, automatic)).paused, true)
            hiddenObserved = true
          })
          await waitPlaying(page, automatic)
        }
      }
      const observed = []
      for (const id of ids) observed.push({ id, ...await videoState(page, id) })
      return { name, passed: true, media: observed, ...(name === "player-save-data" ? { policyInput: "emulated-navigator-save-data" } : {}),
        ...(initialMediaRequests === undefined ? {} : { initialMediaRequests }),
        ...(name === "player-offscreen-hidden" || name === "player-manual-pause" ? { hiddenObserved } : {}), ...(name === "player-captions" ? { captionCues } : {}),
        ...(failureObserver ? { failedRequests: requestCounts.get(target.path), sourceError: await failureObserver.evaluate(observer => observer.state) } : {}) }
    } finally {
      if (failureObserver) {
        try { await failureObserver.evaluate(observer => observer.dispose()) } finally { await failureObserver.dispose() }
      }
    }
  })
}

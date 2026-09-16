import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import type { Page } from "playwright-core"
import { marketingBaselineProfile, marketingScope, parseMarketingRequest } from "./site-marketing-browser-contract"
import { assertShellNode, compareShellElements, compareShellEvidence, measure, settle, shellRecord,
  siteShellCases, siteShellDeadlineMs, type ShellCase, type ShellElement, type ShellEvidence } from "./site-shell-browser-contract"
import { assertCopyPorts, copyNegativeControls, copySteps, siteCopyCases, siteCopyDeadlineMs, type CopyEvidence } from "./site-copy-browser-contract"
import { refinementCopyElementKeys, refinementInstallCommand } from "./site-refinement-profile"
import { supportBaselineProfile, supportCopyScope, supportFooterDigests, supportHref, supportScope } from "./site-support-profile"

export interface SupportRequest extends Omit<ReturnType<typeof parseMarketingRequest>, "scope" | "baselineProfile"> {
  readonly scope: typeof supportScope | typeof supportCopyScope
  readonly baselineProfile: typeof supportBaselineProfile
}
const keys = (value: Record<string, unknown>, names: readonly string[]) => assert.deepEqual(Object.keys(value).sort(), [...names].sort())
export const supportCases = (scope: SupportRequest["scope"]) => scope === supportScope ? siteShellCases : siteCopyCases
export const supportDeadline = (scope: SupportRequest["scope"]) => scope === supportScope ? siteShellDeadlineMs : siteCopyDeadlineMs
export function parseSupportRequest(value: unknown): SupportRequest {
  const item = shellRecord(value)
  assert.ok(item.scope === supportScope || item.scope === supportCopyScope)
  assert.equal(item.baselineProfile, supportBaselineProfile)
  parseMarketingRequest({ ...item, scope: marketingScope, baselineProfile: marketingBaselineProfile })
  return item as unknown as SupportRequest
}
export function parseSupportPhase(value: unknown, sequence: 0 | 1 | 2, request: SupportRequest): Record<string, unknown> {
  const item = shellRecord(value), common = ["schemaVersion", "token", "scope", "baselineProfile", "sequence", "kind"]
  keys(item, sequence === 1 ? common : sequence === 0 ? [...common, "node", "playwright"]
    : [...common, "node", "playwright", "browser", "cases", "comparison", "negativeControls", "closed", "observations"])
  assert.equal(item.schemaVersion, 1); assert.equal(item.token, request.token); assert.equal(item.scope, request.scope)
  assert.equal(item.baselineProfile, supportBaselineProfile); assert.equal(item.sequence, sequence); assert.equal(item.kind, ["started", "connected", "result"][sequence])
  if (sequence !== 1) { assertShellNode({ node: String(item.node) }); assert.equal(item.playwright, "1.62.0") }
  if (sequence === 2) {
    assert.match(String(item.browser), /^\d+\.\d+\.\d+\.\d+$/u); assert.equal(item.closed, true)
    const copy = request.scope === supportCopyScope, cases = supportCases(request.scope)
    assert.deepEqual(item.cases, cases.map(item => item.name))
    assert.equal(item.comparison, copy ? "unchanged-current-copy-state-machine" : "unchanged-page-with-exact-optional-support-footer")
    assert.deepEqual(item.negativeControls, copy ? copyNegativeControls : ["/-final-css", "/-foundation-css", "/404.html-final-css"])
    assert.ok(Array.isArray(item.observations) && item.observations.length === cases.length)
    item.observations.forEach((raw, index) => {
      const observation = shellRecord(raw); assert.equal(observation.name, cases[index]!.name)
      if (copy) {
        keys(observation, ["name", "command", "steps", "elementsPerSample", "current", "baseline"])
        assert.equal(observation.command, refinementInstallCommand); assert.deepEqual(observation.steps, copySteps)
        assert.equal(observation.elementsPerSample, refinementCopyElementKeys.length)
        assertCopyPorts(observation.current as CopyEvidence["ports"], refinementInstallCommand)
        assertCopyPorts(observation.baseline as CopyEvidence["ports"], refinementInstallCommand)
      } else {
        keys(observation, ["name", "footer", "visible", "keyboardFocus", "hitTarget", "foundationRestored"])
        assert.deepEqual(observation.footer, supportFooterDigests)
        for (const key of ["visible", "keyboardFocus", "hitTarget"]) assert.equal(observation[key], true)
        const scenario = cases[index]!
        assert.equal(observation.foundationRestored, scenario.route === "/" && scenario.width === 1440 && scenario.theme === "system" && scenario.system === "light")
      }
    })
  }
  return item
}
export function parseSupportCaseFailure(value: unknown, request: SupportRequest): Record<string, unknown> {
  const item = shellRecord(value)
  keys(item, ["schemaVersion", "scope", "token", "accepted", "completed", "scenario", "stage", "comparedCases", "error"])
  assert.equal(item.schemaVersion, 1); assert.equal(item.scope, request.scope); assert.equal(item.token, request.token)
  assert.equal(item.accepted, false); assert.equal(item.completed, false)
  assert.ok(["current", "baseline", "pair", "comparison"].includes(String(item.stage)))
  const cases = supportCases(request.scope)
  assert.ok(Array.isArray(item.comparedCases) && item.comparedCases.length < cases.length)
  assert.deepEqual(item.comparedCases, cases.slice(0, item.comparedCases.length).map(item => item.name))
  assert.equal(item.scenario, cases[item.comparedCases.length]!.name)
  assert.ok(typeof item.error === "string" && item.error.length > 0 && item.error.length <= 2048 && !/[\x00-\x1f]/u.test(item.error))
  return item
}
export function supportCaseFailure(request: SupportRequest, scenario: string, stage: string, comparedCases: readonly string[], error: unknown) {
  return parseSupportCaseFailure({ schemaVersion: 1, scope: request.scope, token: request.token, accepted: false, completed: false,
    scenario, stage, comparedCases: [...comparedCases], error: String(error).replace(/[\x00-\x1f]/gu, " ").slice(0, 2048) || "Unknown failure" }, request)
}

/** The complete canonical old/new footer is independently hash-bound. Only
 * that literal island is removed; every remaining body byte stays exact. */
export async function supportDom(page: Page, current: boolean): Promise<string> {
  const value = await page.evaluate(() => {
    const root = document.body.cloneNode(true) as HTMLElement
    for (const node of root.querySelectorAll("script")) node.remove()
    const footers = root.querySelectorAll("footer")
    if (footers.length !== 1 || footers[0]!.id !== "hraness-site-footer") throw Error("Exact canonical footer count")
    const footer = footers[0]!.outerHTML
    footers[0]!.replaceWith(document.createComment("reviewed-optional-support-footer"))
    return { footer, body: root.outerHTML }
  })
  assert.equal(createHash("sha256").update(value.footer).digest("hex"), supportFooterDigests[current ? "current" : "baseline"], "Canonical footer differs from reviewed serialization")
  return value.body
}
const isFooter = (item: ShellElement) => item.key.startsWith("#hraness-site-footer[") || item.key.startsWith(".hraness-site-footer__")
export function compareSupportEvidence(actual: ShellEvidence, baseline: ShellEvidence, label: string): void {
  const currentFooter = actual.elements.find(item => item.key === "#hraness-site-footer[0]")!
  const oldFooter = baseline.elements.find(item => item.key === "#hraness-site-footer[0]")!
  assert.ok(currentFooter && oldFooter)
  // The footer follows unchanged main content. Its origin and width stay exact;
  // only its measured height may affect the containing body's used height.
  for (const axis of [0, 1, 2]) assert.ok(Math.abs(currentFooter.rect[axis]! - oldFooter.rect[axis]!) <= .5, `${label}: footer origin/width`)
  const delta = currentFooter.rect[3]! - oldFooter.rect[3]!
  assert.ok(Number.isFinite(delta) && Math.abs(delta) <= 128, `${label}: bounded footer height change`)
  const project = (items: readonly ShellElement[]) => items.filter(item => !isFooter(item)).map(item => {
    const old = baseline.elements.find(old => old.key === item.key)
    if (item.key !== "body[0]" || old === undefined) return item
    assert.ok(Math.abs(item.rect[3]! - old.rect[3]! - delta) <= .5, `${label}: body growth must equal footer growth`)
    assert.ok(Math.abs(Number.parseFloat(item.styles.height!) - Number.parseFloat(old.styles.height!) - delta) <= .5)
    assert.equal(item.text.replace(/Support(?=Accept cookies)/u, ""), old.text, `${label}: only exact support label added to body text`)
    return { ...item, text: old.text, rect: [...item.rect.slice(0, 3), old.rect[3]!], styles: { ...item.styles, height: old.styles.height! } }
  })
  // Existing footer targets retain native coverage in checkShellCase. Their
  // new layout is covered by the closed footer observer below; header, main,
  // copy, skip, open appearance, hover and focus stay completely paired.
  compareShellEvidence({ ...actual, elements: project(actual.elements), focus: actual.focus.filter(item => !isFooter(item)), hover: actual.hover.filter(item => !isFooter(item)) },
    { ...baseline, elements: baseline.elements.filter(item => !isFooter(item)), focus: baseline.focus.filter(item => !isFooter(item)), hover: baseline.hover.filter(item => !isFooter(item)) }, label)
}

export async function observeSupportFooter(page: Page, scenario: ShellCase, foundationCss: string, negative: boolean) {
  const selector = '[data-slot="hraness-support-link"]', link = page.locator(selector)
  assert.equal(await link.count(), 1); assert.equal(await link.getAttribute("href"), supportHref)
  assert.equal(await link.getAttribute("aria-label"), "Support Slopcamera: optional paid membership")
  assert.equal(await link.textContent(), "Support"); assert.equal(await link.getAttribute("target"), null)
  assert.equal(await page.locator("footer form,footer input,footer iframe").count(), 0)
  await link.scrollIntoViewIfNeeded(); await settle(page, scenario.direction)
  const targetEvidence = await link.evaluate(node => {
    const box = node.getBoundingClientRect(), style = getComputedStyle(node), footer = node.closest(".hraness-site-footer__inner")!.getBoundingClientRect()
    const visible = box.width >= 24 && box.height >= 24 && style.display !== "none" && style.visibility === "visible" && Number(style.opacity) === 1
      && box.left >= -.5 && box.right <= innerWidth + .5 && box.top >= -.5 && box.bottom <= innerHeight + .5
      && box.top >= footer.top - .5 && box.bottom <= footer.bottom + .5
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    const peers = [...document.querySelectorAll(".hraness-site-footer__brand,.hraness-site-footer__links")].map(node => node.getBoundingClientRect())
    const reachable = hit === node || hit !== null && node.contains(hit)
    const disjoint = peers.every(other => Math.min(box.right, other.right) - Math.max(box.left, other.left) <= .5 || Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) <= .5)
    return { visible, reachable, disjoint, box: box.toJSON(), footer: footer.toJSON(), peers: peers.map(box => box.toJSON()), hit: hit?.tagName, display: style.display, visibility: style.visibility, opacity: style.opacity, viewport: [innerWidth, innerHeight] }
  })
  assert.ok(targetEvidence.visible && targetEvidence.reachable && targetEvidence.disjoint, `${scenario.name}: support target ${JSON.stringify(targetEvidence)}`)
  await page.locator(".hraness-site-footer__brand").focus(); await page.keyboard.press("Tab"); await settle(page, scenario.direction)
  assert.equal(await link.evaluate(node => node === document.activeElement && node.matches(":focus-visible")), true)
  const focused = (await measure(page, [selector]))[0]!
  assert.notEqual(focused.styles["outline-style"], "none"); assert.ok(Number.parseFloat(focused.styles["outline-width"]!) > 0)
  await link.hover(); await settle(page, scenario.direction)
  const hover = (await measure(page, [selector]))[0]!
  assert.notEqual(hover.styles.color, "rgba(0, 0, 0, 0)"); assert.notEqual(hover.styles.color, hover.styles["background-color"])
  let foundationRestored = false
  if (negative) {
    const before = await measure(page, ["body", selector])
    const sheet = await page.evaluateHandle(href => {
      const sheet = [...document.styleSheets].find(sheet => sheet.href === href)
      if (!sheet || sheet.disabled) throw Error("Missing captured foundation stylesheet")
      sheet.disabled = true; return sheet
    }, foundationCss)
    try {
      // This negative control removes the font-face declarations too. Observe
      // native paint after two frames; loaded-font settlement remains required
      // both before removal and after the complete stylesheet is restored.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      assert.notDeepEqual(await measure(page, ["body", selector]), before, "Foundation removal must change real paint")
    } finally { await sheet.evaluate(sheet => { sheet.disabled = false }); await sheet.dispose() }
    await settle(page, scenario.direction)
    compareShellElements(await measure(page, ["body", selector]), before, "Exact foundation restoration")
    foundationRestored = true
  }
  return { name: scenario.name, footer: supportFooterDigests, visible: true, keyboardFocus: true, hitTarget: true, foundationRestored }
}
export function compareSupportCopy(current: CopyEvidence, baseline: CopyEvidence, scenario: ShellCase, negative: boolean) {
  assert.equal(current.command, refinementInstallCommand); assert.equal(baseline.command, refinementInstallCommand)
  assert.deepEqual(current.negativeControls, negative ? copyNegativeControls : []); assert.deepEqual(baseline.negativeControls, [])
  for (const side of [current, baseline]) {
    assert.deepEqual(side.steps.map(step => step.name), copySteps); assertCopyPorts(side.ports, refinementInstallCommand)
    for (const step of side.steps) assert.deepEqual(step.elements.map(item => item.key), refinementCopyElementKeys)
  }
  for (const [index, step] of current.steps.entries()) compareShellElements(step.elements, baseline.steps[index]!.elements, `${scenario.name} ${step.name}`)
  return { name: scenario.name, command: current.command, steps: copySteps, elementsPerSample: refinementCopyElementKeys.length, current: current.ports, baseline: baseline.ports }
}

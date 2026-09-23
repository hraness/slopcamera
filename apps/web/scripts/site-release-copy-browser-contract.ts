import assert from "node:assert/strict"
import type { Page } from "playwright-core"
import { compareShellElements, compareShellEvidence, workflowExamplesHomeSelectors,
  type ShellCase, type ShellElement, type ShellEvidence, type ShellCurrentDesignPositions } from "./site-shell-browser-contract"
import { admitExamplesInstallDom, compareExamplesInstall } from "./site-examples-install"
import { examplesFlowSections, examplesIslands } from "./site-examples-profile"
import { projectExamplesState, compareExamplesHeroBackgroundImage, type ExamplesDesign, type ExamplesDomProjection } from "./site-examples-browser-contract"
import { releaseCopyBaselineInstall, releaseCopyScope } from "./site-release-copy-profile"

const near = (actual: number, expected: number, label: string) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= .5, label)
/** Admit one complete install island. Every other body byte remains paired. */
export async function releaseCopyDom(page: Page, current: boolean, scenario: ShellCase): Promise<ExamplesDomProjection> {
  const fixture = current ? examplesIslands.find(item => item.selector === "#install")!.current : releaseCopyBaselineInstall
  const installDom = scenario.route === "/" ? await page.locator("#install").evaluate(admitExamplesInstallDom, { fixture, copying: false }) : null
  return page.evaluate(({ home, selectors, installDom, fixture }) => {
    const body = document.body.cloneNode(true) as HTMLElement
    for (const script of body.querySelectorAll("script")) script.remove()
    const owners = selectors.flatMap(selector => (body.matches(selector) ? [body] : [...body.querySelectorAll(selector)])
      .map((node, index) => ({ key: `${selector}[${index}]`, node })))
    if (home) {
      const selected = body.querySelectorAll("#install")
      if (selected.length !== 1 || selected[0]!.outerHTML !== installDom?.raw || installDom.admitted !== fixture)
        throw Error("Release install changed between exact admission and body projection")
      selected[0]!.replaceWith(document.createComment("reviewed-release-install"))
    }
    return { dom: body.outerHTML, text: Object.fromEntries(owners.map(({ key, node }) => [key,
      body.contains(node) ? node.textContent?.replace(/\s+/gu, " ").trim() ?? "" : ""])) }
  }, { home: scenario.route === "/", selectors: ["body", "#main", ...workflowExamplesHomeSelectors], installDom, fixture })
}
/** The sole varying flow height is bound to the full native install proof. */
export function compareReleaseCopyFlow(current: readonly ShellElement[], baseline: readonly ShellElement[], installDelta: number, origins: Readonly<{ current: string; baseline: string }>): number {
  const expected = examplesFlowSections.map(selector => `${selector}[0]`)
  assert.deepEqual(current.map(item => item.key), expected); assert.deepEqual(baseline.map(item => item.key), expected)
  assert.ok(Number.isFinite(installDelta))
  let afterInstall = false
  const projected = current.map((item, index) => {
    const old = baseline[index]!, install = item.key === "#install[0]"
    near(item.rect[1]! - old.rect[1]!, afterInstall ? installDelta : 0, `${item.key}: install-derived section translation`)
    near(item.rect[3]! - old.rect[3]!, install ? installDelta : 0, `${item.key}: only install height changes`)
    if (install) afterInstall = true
    const styles = install ? projectHeight(item, old, installDelta) : { ...item.styles }
    if (item.key === ".hraness-marketing-hero[0]") styles["background-image"] = compareExamplesHeroBackgroundImage(item.styles["background-image"]!, old.styles["background-image"]!, origins)
    return { ...item, rect: [item.rect[0]!, old.rect[1]!, item.rect[2]!, old.rect[3]!],
      styles, text: install ? old.text : item.text }
  })
  compareShellElements(projected, baseline, "Strict release section flow")
  return installDelta
}
function projectHeight(item: ShellElement, old: ShellElement, delta: number): Record<string, string> {
  for (const value of [item.styles.height, old.styles.height]) assert.match(String(value), /^\d+(?:\.\d+)?px$/u)
  near(parseFloat(item.styles.height!) - parseFloat(old.styles.height!), delta, `${item.key}: derived used CSS height`)
  return { ...item.styles, height: old.styles.height! }
}
export function compareReleaseCopyEvidence(actual: ShellEvidence, baseline: ShellEvidence, scenario: ShellCase,
  currentDesign: ExamplesDesign, baselineDesign: ExamplesDesign, currentDom: ExamplesDomProjection, baselineDom: ExamplesDomProjection,
  positions: ShellCurrentDesignPositions, oldPositions: ShellCurrentDesignPositions,
  origins: Readonly<{ current: string; baseline: string }>): void {
  assert.deepEqual(actual.obstructions, []); assert.deepEqual(baseline.obstructions, [])
  assert.equal(currentDom.dom, baselineDom.dom, "Every body byte outside the exact release install stays paired")
  if (scenario.route === "/404.html") { compareShellEvidence(actual, baseline, scenario.name); return }
  assert.ok(currentDesign.install && baselineDesign.install)
  const install = compareExamplesInstall(currentDesign.install, baselineDesign.install, `${scenario.name}: release install`, releaseCopyScope)
  const delta = install.current.installHeight - install.baseline.installHeight
  compareReleaseCopyFlow(currentDesign.flow, baselineDesign.flow, delta, origins)
  for (const [side, original] of [[currentDesign, actual], [baselineDesign, baseline]] as const) {
    const section = side.flow.find(item => item.key === "#install[0]")!
    assert.deepEqual(section, side.install!.elements[0], "Install flow must be the proved native box")
    assert.deepEqual(original.elements.find(item => item.key === "#install[0]"), section)
  }
  const hero = currentDesign.hero, oldHero = baselineDesign.hero, actions = currentDesign.actions, oldActions = baselineDesign.actions
  assert.ok(hero && oldHero && actions && oldActions)
  compareShellElements(hero.elements, oldHero.elements, "Unchanged release hero, including every text and used inset")
  for (const field of ["copyTop", "boundaryLines", "boundaryLineHeight", "nameComputedInsets"] as const) assert.deepEqual(hero[field], oldHero[field])
  compareShellElements(actions.buttons, oldActions.buttons, "Unchanged release CTA widths, text and paint")
  assert.equal(actions.textRects.length, oldActions.textRects.length)
  actions.textRects.forEach((rect, index) => { assert.equal(rect.length, 4); assert.equal(oldActions.textRects[index]!.length, 4)
    rect.forEach((value, axis) => near(value, oldActions.textRects[index]![axis]!, "Unchanged CTA native text rectangle")) })
  const following = new Set<string>(examplesFlowSections.slice(examplesFlowSections.indexOf("#install") + 1))
  const deltaFor = (key: string): number => {
    const selector = key.replace(/\[\d+\]$/u, "")
    return following.has(selector) || selector.startsWith(".slopcamera-ask-ai") || selector === "#hraness-site-footer" || selector.startsWith(".hraness-site-footer__") ? delta : 0
  }
  const elements = projectExamplesState(actual.elements, baseline.elements, positions.elements, oldPositions.elements, deltaFor).map((item, index) => {
    const old = baseline.elements[index]!, heightOwner = ["body[0]", "#main[0]", "#install[0]"].includes(item.key)
    if (heightOwner) near(item.rect[3]! - old.rect[3]!, delta, `${item.key}: install-derived content height`)
    const styles = heightOwner ? projectHeight(item, old, delta) : { ...item.styles }
    if (item.key === ".hraness-marketing-hero[0]") styles["background-image"] = compareExamplesHeroBackgroundImage(item.styles["background-image"]!, old.styles["background-image"]!, origins)
    return { ...item, styles, rect: [item.rect[0]!, item.rect[1]!, item.rect[2]!, heightOwner ? old.rect[3]! : item.rect[3]!], text: currentDom.text[item.key] ?? item.text }
  })
  compareShellEvidence({ ...actual, dom: currentDom.dom, elements,
    focus: projectExamplesState(actual.focus, baseline.focus, positions.focus, oldPositions.focus, deltaFor),
    hover: projectExamplesState(actual.hover, baseline.hover, positions.hover, oldPositions.hover, deltaFor) },
  { ...baseline, dom: baselineDom.dom, elements: baseline.elements.map(item => ({ ...item, text: baselineDom.text[item.key] ?? item.text })) }, scenario.name)
}

import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { parseSupportRequest, parseSupportPhase, parseSupportCaseFailure, supportCaseFailure, supportCases, supportDeadline, compareSupportEvidence,
  compareSupportCopy, supportBaselineObstructions, parseSupportBaselineObstructions, supportObstructionOwnedByFooterBar, projectSupportBaselineCommand } from "./site-support-browser-contract"
import { supportScope, supportCopyScope, supportBaselineProfile, supportBaselineRevision, supportBaselineTree, supportFooterDigests, supportBaselineInstallCommand } from "./site-support-profile"
import { assertSupportBaselineManifest } from "./verify-site-marketing"
import { assertFooterKeyboardCoverage, shellAppearanceSteps, siteShellCases, siteShellDeadlineMs, type ShellElement, type ShellEvidence, type ShellKeyboardObstruction } from "./site-shell-browser-contract"
import { copySteps, copyNegativeControls, siteCopyCases, siteCopyDeadlineMs, type CopyEvidence } from "./site-copy-browser-contract"
import { refinementCopyElementKeys, refinementInstallCommand } from "./site-refinement-profile"
const css = `/assets/site-${"a".repeat(64)}.css`
const payload = (origin: string) => ({ origin, resources: ["/", "/404.html", "/assets/foundation.css", css, "/cells.svg", "/grain.svg", ...Array.from({ length: 14 }, (_, i) => `/font-${i}.woff2`)].sort(), stylesheets: ["/assets/foundation.css", css], finalCss: css })
const request = (scope: typeof supportScope | typeof supportCopyScope = supportScope) => parseSupportRequest({ schemaVersion: 1, token: "12345678-1234-1234-1234-123456789abc", scope, baselineProfile: supportBaselineProfile, appDirectory: "/work/apps/web", chromeExecutable: "/work/chrome", endpoint: "ws://127.0.0.1:54321/devtools/browser/1234-abcd", current: payload("http://127.0.0.1:54322"), baseline: payload("http://127.0.0.1:54323"), fieldAssets: ["/grain.svg", "/cells.svg"] })
const barHit = { tag: "div", id: "", slot: null, classes: ["hraness-site-footer__inner"], ancestors: ["hraness-site-footer", "body"] } as const
const obstruction = (key: string, hit: ShellKeyboardObstruction["hit"] = barHit): ShellKeyboardObstruction => ({ key, fragment: 0, rect: [150.890625, 394.28125, 96.109375, 30], hit })
const baselineInventory = (name: string) => (supportBaselineObstructions[name] ?? []).map(key => obstruction(key))
const result = () => ({ schemaVersion: 1, token: request().token, scope: supportScope, baselineProfile: supportBaselineProfile, sequence: 2, kind: "result", node: "24.18.1", playwright: "1.62.0", browser: "151.0.0.0", cases: siteShellCases.map(item => item.name), comparison: "unchanged-page-with-exact-optional-support-footer", closed: true, negativeControls: ["/-final-css", "/-foundation-css", "/404.html-final-css"], observations: siteShellCases.map(s => ({ name: s.name, footer: supportFooterDigests, contentFooterHeight: 64, visible: true, keyboardFocus: true, hitTarget: true, foundationRestored: s.route === "/" && s.width === 1440 && s.theme === "system" && s.system === "light", baselineObstructions: baselineInventory(s.name) })) })

test("support acceptance retains complete matrices, deadlines and a distinct closed identity", () => {
  expect(supportCases(supportScope)).toBe(siteShellCases); expect(siteShellCases).toHaveLength(76)
  expect(supportCases(supportCopyScope)).toBe(siteCopyCases); expect(siteCopyCases).toHaveLength(8)
  expect(supportDeadline(supportScope)).toBe(siteShellDeadlineMs); expect(siteShellDeadlineMs).toBe(720_000)
  expect(supportDeadline(supportCopyScope)).toBe(siteCopyDeadlineMs); expect(siteCopyDeadlineMs).toBe(180_000)
  for (const scope of [supportScope, supportCopyScope] as const) expect(request(scope).scope).toBe(scope)
  for (const mutation of [{ scope: "marketing-refinement-v1" }, { baselineProfile: "unknown" }, { extra: true }, { fieldAssets: ["https://remote/grain.svg", "/cells.svg"] }]) expect(() => parseSupportRequest({ ...request(), ...mutation })).toThrow()
})
test("closed results reject omitted cases, footer identity, native observations and cleanup", () => {
  expect(parseSupportPhase(result(), 2, request())).toEqual(result())
  for (const mutation of [{ cases: result().cases.slice(1) }, { closed: false }, { comparison: "equivalent" }, { negativeControls: ["/-final-css"] }, { observations: result().observations.slice(1) }, { extra: true }]) expect(() => parseSupportPhase({ ...result(), ...mutation }, 2, request())).toThrow()
  for (const field of ["visible", "keyboardFocus", "hitTarget", "foundationRestored", "footer"]) {
    const observations = structuredClone(result().observations)
    const index = field === "foundationRestored" ? observations.findIndex(item => item.foundationRestored) : 0
    ;(observations[index] as unknown as Record<string, unknown>)[field] = field === "footer" ? { ...supportFooterDigests, current: "0".repeat(64) } : false
    expect(() => parseSupportPhase({ ...result(), observations }, 2, request())).toThrow()
  }
  // The receipt must name exactly the reviewed pre-existing baseline obstructions.
  const reflow = result().observations.findIndex(item => item.name === "/-200pct-reflow-equivalent-light")
  expect(result().observations[reflow]!.baselineObstructions).toHaveLength(4)
  for (const value of [[], result().observations[reflow]!.baselineObstructions.slice(1), [...baselineInventory("/-200pct-reflow-equivalent-light"), obstruction(".topbar a[0]")],
    baselineInventory("/-200pct-reflow-equivalent-light").map(item => ({ ...item, hit: null })), undefined]) {
    const observations = structuredClone(result().observations) as unknown as Record<string, unknown>[]
    if (value === undefined) delete observations[reflow]!.baselineObstructions
    else observations[reflow]!.baselineObstructions = value
    expect(() => parseSupportPhase({ ...result(), observations }, 2, request())).toThrow()
  }
  const observations = structuredClone(result().observations) as unknown as Record<string, unknown>[]
  observations[0]!.baselineObstructions = [obstruction(".slopcamera-ask-ai a[0]")]
  expect(() => parseSupportPhase({ ...result(), observations }, 2, request())).toThrow("reviewed pre-existing fixed-footer inventory")
})
test("baseline binds the exact independent source, tree and captured bytes", () => {
  const snapshot = { inputs: [], artifacts: [], files: new Map(), stylesheets: ["/foundation.css", css] }
  const manifest = { schemaVersion: 5, baselineProfile: supportBaselineProfile, checkoutRevision: supportBaselineRevision, sourceRevision: supportBaselineRevision, sourceTree: supportBaselineTree, inputs: [], artifacts: [] }
  expect(() => assertSupportBaselineManifest(manifest, snapshot)).not.toThrow()
  for (const mutation of [{ sourceTree: "a".repeat(40) }, { checkoutRevision: "b".repeat(40) }, { sourceRevision: "c".repeat(40) }, { schemaVersion: 4 }, { artifacts: [{ path: "index.html" }] }, { inputs: [{ path: "package.json" }] }, { extra: true }]) expect(() => assertSupportBaselineManifest({ ...manifest, ...mutation }, snapshot)).toThrow()
})
test("failures preserve only their completed paired prefix and bounded printable diagnostics", () => {
  for (const scope of [supportScope, supportCopyScope] as const) for (let i = 0; i < supportCases(scope).length; i++) {
    const cases = supportCases(scope), failure = supportCaseFailure(request(scope), cases[i]!.name, "comparison", cases.slice(0, i).map(item => item.name), Error("specific failure\n"))
    expect(parseSupportCaseFailure(failure, request(scope))).toEqual(failure)
    for (const mutation of [{ accepted: true }, { completed: true }, { scope: "unknown" }, { scenario: "unknown" }, { error: "x".repeat(2049) }, { comparedCases: [...cases.slice(0, i).map(item => item.name), cases[i]!.name] }]) expect(() => parseSupportCaseFailure({ ...failure, ...mutation }, request(scope))).toThrow()
  }
})
const element = (key: string, height = 20): ShellElement => ({ key, rect: [0, 0, 400, height], styles: { height: `${height}px`, color: "black" }, text: "Retained", semantics: { role: null } })
const evidence = (delta: number): ShellEvidence => {
  const root = "[data-hraness-appearance-menu]", items = `${root} [role="menuitemradio"]`
  const selectors = [root, `${root} button`, `${root} .hraness-design-theme-toggle__popover`, `${root} [role="menu"]`, items, `${items} .hraness-appearance-icon`, `${items} .hraness-appearance-icon svg`]
  const appearance = selectors.flatMap((selector, index) => Array.from({ length: index < 4 ? 1 : 3 }, (_, i) => element(`${selector}[${i}]`)))
  const skip = { ...element(".skip-link[0]"), styles: { ...element(".skip-link[0]").styles, position: "fixed" }, geometrySpace: "viewport" as const, scrollY: 0, documentRect: [0, 0, 400, 20] }
  return { direction: "ltr", dom: "exact-outside-footer", recovery: false, elements: [
    { ...element("body[0]", 1000 + delta), text: `Retained${delta ? "Slopcamera Docs GitHub Install Slopcamera by Hraness" : ""}Accept cookies` },
    { ...element("#hraness-site-footer[0]", 100 + delta), rect: [0, 900, 400, 100 + delta] }, element("#main[0]")],
    focus: [element(".topbar[0]")], hover: [element(".topbar[0]")], skip, obstructions: [],
    appearance: shellAppearanceSteps.map(step => ({ step: step.name, active: step.active, elements: appearance })) }
}
test("only measured footer growth can project body height; all other page observations stay strict", () => {
  const baseline = evidence(0), current = evidence(24)
  expect(() => compareSupportEvidence(current, baseline, "synthetic")).not.toThrow()
  expect(compareSupportEvidence(current, baseline, "synthetic").baselineObstructions).toEqual([])
  const mutations: Array<(value: ShellEvidence) => ShellEvidence> = [
    value => ({ ...value, dom: "changed outside footer" }), value => ({ ...value, direction: "rtl" }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 0 ? { ...item, rect: [0, 0, 400, 1025] } : item) }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 0 ? { ...item, styles: { ...item.styles, height: "1025px" } } : item) }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 0 ? { ...item, text: item.text + "extra" } : item) }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 1 ? { ...item, rect: [0, 901, 400, 124] } : item) }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 2 ? { ...item, styles: { ...item.styles, color: "red" } } : item) }),
    value => ({ ...value, focus: [] }), value => ({ ...value, hover: [] }), value => ({ ...value, appearance: [] }),
    value => ({ ...value, skip: { ...value.skip, text: "changed skip" } }),
    value => ({ ...value, obstructions: [obstruction(".slopcamera-ask-ai a[0]")] }),
  ]
  for (const mutate of mutations) expect(() => compareSupportEvidence(mutate(structuredClone(current)), baseline, "negative")).toThrow()
  expect(() => compareSupportEvidence(evidence(129), baseline, "unbounded")).toThrow()
  // The content footer's measured height shifts the shared footer's origin by
  // exactly that amount and grows the body by the same delta.
  const shifted = structuredClone(current)
  shifted.elements[0]!.rect[3] = 1000 + 64
  shifted.elements[0]!.styles.height = "1064px"
  shifted.elements[1]!.rect = [0, 940, 400, 124]
  expect(() => compareSupportEvidence(shifted, baseline, "shifted", 40)).not.toThrow()
  expect(() => compareSupportEvidence(shifted, baseline, "shifted", 39)).toThrow()
  expect(() => compareSupportEvidence(current, baseline, "unmarked", 40)).toThrow()
  const unexpected = structuredClone(current)
  unexpected.elements[0]!.text = "RetainedSlopcamera Docs GitHub Install Slopcamera by HranessUnexpectedAccept cookies"
  expect(() => compareSupportEvidence(unexpected, baseline, "unexpected body text")).toThrow()
})
test("the current page must be unobstructed while the immutable baseline shows exactly the reviewed fixed-footer obstructions", () => {
  const reflowAskAi = [".slopcamera-ask-ai a[0]", ".slopcamera-ask-ai a[1]", ".slopcamera-ask-ai a[2]", ".slopcamera-ask-ai a[3]"], recovery = [".route-state a[2]", ".route-state a[3]"]
  expect(supportBaselineObstructions).toEqual({ "/-200pct-reflow-equivalent-light": reflowAskAi, "/-200pct-reflow-equivalent-dark": reflowAskAi,
    "/404.html-200pct-reflow-equivalent-light": recovery, "/404.html-200pct-reflow-equivalent-dark": recovery })
  for (const name of Object.keys(supportBaselineObstructions)) expect(siteShellCases.map(item => item.name)).toContain(name)
  const scenario = "/-200pct-reflow-equivalent-light", inventory = baselineInventory(scenario)
  const current = evidence(24), baseline = { ...evidence(0), obstructions: inventory }
  expect(compareSupportEvidence(current, baseline, scenario).baselineObstructions).toEqual(inventory)
  // The current page never admits a covered keyboard target, even the baseline's own.
  expect(() => compareSupportEvidence({ ...current, obstructions: [inventory[0]!] }, baseline, scenario)).toThrow("current keyboard targets must be unobstructed")
  // The baseline must show the complete reviewed inventory and nothing else.
  expect(() => compareSupportEvidence(current, { ...baseline, obstructions: inventory.slice(1) }, scenario)).toThrow("reviewed pre-existing fixed-footer inventory")
  expect(() => compareSupportEvidence(current, { ...baseline, obstructions: [...inventory, obstruction(".topbar a[0]")] }, scenario)).toThrow("reviewed pre-existing fixed-footer inventory")
  expect(() => compareSupportEvidence(current, { ...baseline, obstructions: [...inventory].reverse() }, scenario)).toThrow("reviewed pre-existing fixed-footer inventory")
  expect(() => compareSupportEvidence(current, evidence(0), scenario)).toThrow("reviewed pre-existing fixed-footer inventory")
  // Every admitted baseline obstruction must be owned by the shared fixed footer bar.
  const foreign = { tag: "a", id: "", slot: null, classes: ["skip-link"], ancestors: ["body"] }
  expect(() => compareSupportEvidence(current, { ...baseline, obstructions: inventory.map(item => ({ ...item, hit: foreign })) }, scenario)).toThrow("not owned by the fixed footer bar")
  expect(() => compareSupportEvidence(current, { ...baseline, obstructions: inventory.map(item => ({ ...item, hit: null })) }, scenario)).toThrow("not owned by the fixed footer bar")
  expect(supportObstructionOwnedByFooterBar(obstruction("x", { tag: "nav", id: "", slot: null, classes: ["hraness-site-footer__links"], ancestors: ["hraness-site-footer__inner", "hraness-site-footer", "body"] }))).toBe(true)
  expect(supportObstructionOwnedByFooterBar(obstruction("x", { tag: "a", id: "", slot: "hraness-support-link", classes: ["hraness-site-footer__support"], ancestors: ["hraness-site-footer__inner", "hraness-site-footer", "body"] }))).toBe(true)
  expect(supportObstructionOwnedByFooterBar(obstruction("x", foreign))).toBe(false)
  // Other scenarios admit no baseline obstruction at all.
  expect(compareSupportEvidence(current, evidence(0), "/-320-light-dark").baselineObstructions).toEqual([])
  expect(() => compareSupportEvidence(current, { ...evidence(0), obstructions: [inventory[0]!] }, "/-320-light-dark")).toThrow("reviewed pre-existing fixed-footer inventory")
  for (const value of [[{ ...inventory[0]!, extra: true }], [{ ...inventory[0]!, rect: [0, 0, 0, 30] }], [{ ...inventory[0]!, fragment: -1 }], [{ ...inventory[0]!, key: "" }],
    [{ ...inventory[0]!, hit: { ...barHit, extra: true } }], [{ ...inventory[0]!, hit: { ...barHit, classes: [""] } }], Array.from({ length: 129 }, () => inventory[0]!), "unbounded"]) {
    expect(() => parseSupportBaselineObstructions(value, scenario)).toThrow()
  }
})
const ports = (command: string): CopyEvidence["ports"] => ({ write: "success", fallback: "throw", writes: Array(5).fill(command), fallbacks: Array.from({ length: 3 }, () => ({ value: command, readonly: true, start: 0, end: command.length, focused: true, offscreen: true })), timers: [{ delay: 2500, started: 0, fired: 2500, cancelled: false }, { delay: 2500, started: 2501, fired: null, cancelled: true }, { delay: 2500, started: 2502, fired: null, cancelled: false }] })
const copy = (): CopyEvidence => ({ command: refinementInstallCommand, negativeControls: [], ports: ports(refinementInstallCommand), steps: copySteps.map(name => ({ name, elements: refinementCopyElementKeys.map(key => element(key)) })) })
test("copy compares both exact current commands, all states, paint, timer ports and negative controls", () => {
  const baseline = { ...copy(), command: supportBaselineInstallCommand, ports: ports(supportBaselineInstallCommand) }, current = { ...copy(), negativeControls: copyNegativeControls }, scenario = siteCopyCases[0]!
  const observation = compareSupportCopy(current, baseline, scenario, true)
  expect(observation.elementsPerSample).toBe(18); expect(observation.steps).toHaveLength(10)
  const phase = { ...result(), scope: supportCopyScope, cases: siteCopyCases.map(item => item.name), comparison: "unchanged-current-copy-state-machine", negativeControls: copyNegativeControls, observations: siteCopyCases.map(item => ({ ...observation, name: item.name })) }
  expect(() => parseSupportPhase(phase, 2, request(supportCopyScope))).not.toThrow()
  expect(() => compareSupportCopy(current, { ...baseline, command: refinementInstallCommand, ports: ports(refinementInstallCommand) }, scenario, true)).toThrow()
  for (const value of [{ ...current, command: "changed" }, { ...current, steps: current.steps.slice(1) }, { ...current, negativeControls: [] }, { ...current, ports: ports("changed") }, { ...current, steps: current.steps.map((step, i) => i === 0 ? { ...step, elements: step.elements.slice(1) } : step) }]) expect(() => compareSupportCopy(value, baseline, scenario, true)).toThrow()
  const collapse = (value: string) => value.replace(/\s+/gu, " ").trim()
  const withCommand = (evidence: CopyEvidence, command: string): CopyEvidence => ({ ...evidence, steps: evidence.steps.map((step, i) => i === 0 ? { ...step, elements: step.elements.map((item, j) => j === 0 ? { ...item, text: `Install ${collapse(command)} then continue` } : item) } : step) })
  expect(() => compareSupportCopy(withCommand(current, refinementInstallCommand), withCommand(baseline, supportBaselineInstallCommand), scenario, true)).not.toThrow()
  expect(() => compareSupportCopy(withCommand(current, refinementInstallCommand), withCommand(baseline, "bun add --global other"), scenario, true)).toThrow()
  expect(projectSupportBaselineCommand({ ...current.steps[0]!.elements[0]!, text: collapse(supportBaselineInstallCommand) }).text).toBe(collapse(refinementInstallCommand))
  expect(projectSupportBaselineCommand({ ...current.steps[0]!.elements[0]!, text: "Slopcamera v3.2.6 release", semantics: { href: "https://github.com/hraness/slopcamera/releases/tag/v3.2.6", role: null } })).toEqual({ ...current.steps[0]!.elements[0]!, text: "Slopcamera v3.3.1 release", semantics: { href: "https://github.com/hraness/slopcamera/releases/tag/v3.3.1", role: null } })
  const changed = copy(); (changed.steps[0]!.elements[0]!.styles as Record<string, string>).color = "red"
  expect(() => compareSupportCopy({ ...changed, negativeControls: copyNegativeControls }, baseline, scenario, true)).toThrow()
})
test("the new driver retains pinned browser and shared parent process custody", async () => {
  const [parent, driver] = await Promise.all([readFile(new URL("./verify-site-marketing.ts", import.meta.url), "utf8"), readFile(new URL("./site-support-browser-driver.mjs", import.meta.url), "utf8")])
  for (const boundary of ["assertWorkerInputsUnchanged(inputs, after)", "collectProtocol(protocolDirectory, observation)", "workerAbsent && chromeAbsent", "servers.every(server => server.closed)", "candidateIdentity(actualApp), candidate", "performance.now() < deadline"]) expect(parent).toContain(boundary)
  for (const boundary of ['manifest.version, "1.62.0"', 'realpath(chromium.executablePath()), request.chromeExecutable', "closeOwnedPreviewBrowser", "Both underlying case settlements", "parsePhase(result, 2, request)", "publishWorkerPhase(directory, 2, result)"]) expect(driver).toContain(boundary)
})


test("current footer keyboard coverage requires four links without relaxing historical five-link profiles", () => {
  const focused = (count: number) => Array.from({ length: count }, (_, i) => element(`.hraness-site-footer__social-link[${i}]`))
  expect(() => assertFooterKeyboardCoverage(focused(4), supportScope)).not.toThrow()
  for (const count of [0, 1, 3, 5, 6]) expect(() => assertFooterKeyboardCoverage(focused(count), supportScope)).toThrow()
  for (const profile of [undefined, "marketing-refinement-v1"] as const) {
    expect(() => assertFooterKeyboardCoverage(focused(5), profile)).not.toThrow()
    expect(() => assertFooterKeyboardCoverage(focused(4), profile)).toThrow()
  }
})

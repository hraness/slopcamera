import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { parseSupportRequest, parseSupportPhase, parseSupportCaseFailure, supportCaseFailure,
  supportCases, supportDeadline, compareSupportEvidence, compareSupportCopy } from "./site-support-browser-contract"
import { supportScope, supportCopyScope, supportBaselineProfile, supportBaselineRevision, supportBaselineTree, supportFooterDigests } from "./site-support-profile"
import { assertSupportBaselineManifest } from "./verify-site-marketing"
import { shellAppearanceSteps, siteShellCases, siteShellDeadlineMs, type ShellElement, type ShellEvidence } from "./site-shell-browser-contract"
import { copySteps, copyNegativeControls, siteCopyCases, siteCopyDeadlineMs, type CopyEvidence } from "./site-copy-browser-contract"
import { refinementCopyElementKeys, refinementInstallCommand } from "./site-refinement-profile"
const css = `/assets/site-${"a".repeat(64)}.css`
const payload = (origin: string) => ({ origin, resources: ["/", "/404.html", "/assets/foundation.css", css, "/cells.svg", "/grain.svg", ...Array.from({ length: 14 }, (_, i) => `/font-${i}.woff2`)].sort(), stylesheets: ["/assets/foundation.css", css], finalCss: css })
const request = (scope: typeof supportScope | typeof supportCopyScope = supportScope) => parseSupportRequest({ schemaVersion: 1, token: "12345678-1234-1234-1234-123456789abc", scope, baselineProfile: supportBaselineProfile, appDirectory: "/work/apps/web", chromeExecutable: "/work/chrome", endpoint: "ws://127.0.0.1:54321/devtools/browser/1234-abcd", current: payload("http://127.0.0.1:54322"), baseline: payload("http://127.0.0.1:54323"), fieldAssets: ["/grain.svg", "/cells.svg"] })
const result = () => ({ schemaVersion: 1, token: request().token, scope: supportScope, baselineProfile: supportBaselineProfile, sequence: 2, kind: "result", node: "24.18.1", playwright: "1.62.0", browser: "151.0.0.0", cases: siteShellCases.map(item => item.name), comparison: "unchanged-page-with-exact-optional-support-footer", closed: true, negativeControls: ["/-final-css", "/-foundation-css", "/404.html-final-css"], observations: siteShellCases.map(s => ({ name: s.name, footer: supportFooterDigests, visible: true, keyboardFocus: true, hitTarget: true, foundationRestored: s.route === "/" && s.width === 1440 && s.theme === "system" && s.system === "light" })) })

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
    { ...element("body[0]", 1000 + delta), text: `Retained${delta ? "Support" : ""}Accept cookies` },
    { ...element("#hraness-site-footer[0]", 100 + delta), rect: [0, 900, 400, 100 + delta] }, element("#main[0]")],
    focus: [element(".topbar[0]")], hover: [element(".topbar[0]")], skip,
    appearance: shellAppearanceSteps.map(step => ({ step: step.name, active: step.active, elements: appearance })) }
}
test("only measured footer growth can project body height; all other page observations stay strict", () => {
  const baseline = evidence(0), current = evidence(24)
  expect(() => compareSupportEvidence(current, baseline, "synthetic")).not.toThrow()
  const mutations: Array<(value: ShellEvidence) => ShellEvidence> = [
    value => ({ ...value, dom: "changed outside footer" }), value => ({ ...value, direction: "rtl" }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 0 ? { ...item, rect: [0, 0, 400, 1025] } : item) }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 0 ? { ...item, styles: { ...item.styles, height: "1025px" } } : item) }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 0 ? { ...item, text: item.text + "extra" } : item) }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 1 ? { ...item, rect: [0, 901, 400, 124] } : item) }),
    value => ({ ...value, elements: value.elements.map((item, i) => i === 2 ? { ...item, styles: { ...item.styles, color: "red" } } : item) }),
    value => ({ ...value, focus: [] }), value => ({ ...value, hover: [] }), value => ({ ...value, appearance: [] }),
    value => ({ ...value, skip: { ...value.skip, text: "changed skip" } }),
  ]
  for (const mutate of mutations) expect(() => compareSupportEvidence(mutate(structuredClone(current)), baseline, "negative")).toThrow()
  expect(() => compareSupportEvidence(evidence(129), baseline, "unbounded")).toThrow()
})
const ports = (command: string): CopyEvidence["ports"] => ({ write: "success", fallback: "throw", writes: Array(5).fill(command), fallbacks: Array.from({ length: 3 }, () => ({ value: command, readonly: true, start: 0, end: command.length, focused: true, offscreen: true })), timers: [{ delay: 2500, started: 0, fired: 2500, cancelled: false }, { delay: 2500, started: 2501, fired: null, cancelled: true }, { delay: 2500, started: 2502, fired: null, cancelled: false }] })
const copy = (): CopyEvidence => ({ command: refinementInstallCommand, negativeControls: [], ports: ports(refinementInstallCommand), steps: copySteps.map(name => ({ name, elements: refinementCopyElementKeys.map(key => element(key)) })) })
test("copy compares both exact current commands, all states, paint, timer ports and negative controls", () => {
  const baseline = copy(), current = { ...copy(), negativeControls: copyNegativeControls }, scenario = siteCopyCases[0]!
  const observation = compareSupportCopy(current, baseline, scenario, true)
  expect(observation.elementsPerSample).toBe(18); expect(observation.steps).toHaveLength(10)
  const phase = { ...result(), scope: supportCopyScope, cases: siteCopyCases.map(item => item.name), comparison: "unchanged-current-copy-state-machine", negativeControls: copyNegativeControls, observations: siteCopyCases.map(item => ({ ...observation, name: item.name })) }
  expect(() => parseSupportPhase(phase, 2, request(supportCopyScope))).not.toThrow()
  for (const value of [{ ...current, command: "changed" }, { ...current, steps: current.steps.slice(1) }, { ...current, negativeControls: [] }, { ...current, ports: ports("changed") }, { ...current, steps: current.steps.map((step, i) => i === 0 ? { ...step, elements: step.elements.slice(1) } : step) }]) expect(() => compareSupportCopy(value, baseline, scenario, true)).toThrow()
  const changed = copy(); (changed.steps[0]!.elements[0]!.styles as Record<string, string>).color = "red"
  expect(() => compareSupportCopy({ ...changed, negativeControls: copyNegativeControls }, baseline, scenario, true)).toThrow()
})
test("the new driver retains pinned browser and shared parent process custody", async () => {
  const [parent, driver] = await Promise.all([readFile(new URL("./verify-site-marketing.ts", import.meta.url), "utf8"), readFile(new URL("./site-support-browser-driver.mjs", import.meta.url), "utf8")])
  for (const boundary of ["assertWorkerInputsUnchanged(inputs, after)", "collectProtocol(protocolDirectory, observation)", "workerAbsent && chromeAbsent", "servers.every(server => server.closed)", "candidateIdentity(actualApp), candidate", "performance.now() < deadline"]) expect(parent).toContain(boundary)
  for (const boundary of ['manifest.version, "1.62.0"', 'realpath(chromium.executablePath()), request.chromeExecutable', "closeOwnedPreviewBrowser", "Both underlying case settlements", "parsePhase(result, 2, request)", "publishWorkerPhase(directory, 2, result)"]) expect(driver).toContain(boundary)
})

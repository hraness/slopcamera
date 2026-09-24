import { describe, expect, test } from "bun:test"
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { runInNewContext } from "node:vm"
import { parseFragment, serializeOuter, type DefaultTreeAdapterMap } from "parse5"
import { compareReleaseCopyFlow, compareReleaseCopyEvidence } from "./site-release-copy-browser-contract"
import { installReleaseCopyFocusGuard } from "./site-release-copy-focus"
import { releaseCopyScope, releaseCopyBaselineProfile, releaseCopyBaselineRevision, releaseCopyBaselineTree,
  releaseCopyBaselineCommand, releaseCopyBaselineNote, releaseCopyBaselineInstall, releaseCopyEditVideoIds } from "./site-release-copy-profile"
import { examplesScope, examplesBaselineProfile, examplesBaselineRevision, examplesBaselineTree, examplesFlowSections,
  examplesBaselineInstallCommand, examplesIslands, examplesHeroTextures, examplesDeadlineMs } from "./site-examples-profile"
import { parseExamplesRequest, parseExamplesPhase, parseExamplesCaseFailure, examplesCaseFailure, examplesCaseNames,
  examplesNegativeControls, examplesDocsCases, examplesDocsExtraCases, compareExamplesCopy, examplesEditVideoIds, assertExamplesEditVideoInventory, type ExamplesRequest } from "./site-examples-browser-contract"
import { compareExamplesInstall, admitExamplesInstallDom, examplesInstallNote, parseExamplesInstallPair,
  projectExamplesBaselineCopyElements, type ExamplesInstall } from "./site-examples-install"
import { refinementCopyElementKeys, refinementInstallCommand } from "./site-refinement-profile"
import { siteShellCases, shellAppearanceSteps, checkShellCase, withShellCaseCleanup, type ShellEvidence, type ShellElement } from "./site-shell-browser-contract"
import { siteCopyCases, copySteps, copyNegativeControls, type CopyEvidence } from "./site-copy-browser-contract"
import { assertExamplesBaselineManifest, assertReleaseCopyInputs, buildExamplesDriver, examplesWorkerMinify } from "./verify-site-examples"
import { decodeProfiledWorkerJson, encodeProfiledWorkerJson, examplesWorkerProtocolLimit, workerDriverLimit, workerAttachmentMs } from "./preview-browser-protocol"
import { publishedRelease, archiveInstall } from "../src/published-release"
import type { ShellSnapshot } from "./verify-site-shell"
const hash = "a".repeat(64)
const media = [{ id: "editorial", path: "/assets/examples/editorial-aaaaaaaaaaaa.mp4", sha256: hash,
  poster: "/assets/examples/editorial-aaaaaaaaaaaa.webp", guide: "/docs/tutorials/first-animation", width: 1280, height: 720, durationSeconds: 8, hasAudio: false },
{ id: "native-product", path: "/assets/examples/native-product-bbbbbbbbbbbb.mp4", sha256: "b".repeat(64),
  poster: "/assets/examples/native-product-bbbbbbbbbbbb.webp", guide: "/docs/how-to/native-films", width: 1280, height: 720, durationSeconds: 8, hasAudio: false }]
const resources = [...new Set(["/", "/404.html", "/docs", "/docs/tutorials/first-diagram", "/docs/tutorials/first-animation",
  "/docs/how-to/render-motion-graphics", "/docs/how-to/vectorize-images", "/docs/reference/capabilities", "/docs/how-to/native-films", "/docs/how-to/parametric-design", "/docs/how-to/edit-video",
  "/graphs/site-foundation/style.css", `/assets/site-${hash}.css`, ...media.flatMap(item => [item.path, item.poster]),
  ...Array.from({length: 10}, (_, i) => `/fonts/font-${i}.woff2`)])].sort()
const payload = (port: number) => ({ origin: `http://127.0.0.1:${port}`, resources, stylesheets: ["/graphs/site-foundation/style.css", `/assets/site-${hash}.css`], finalCss: `/assets/site-${hash}.css` })
function request(): ExamplesRequest { return parseExamplesRequest({ schemaVersion: 1, token: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", scope: releaseCopyScope,
  baselineProfile: releaseCopyBaselineProfile, baselineRevision: releaseCopyBaselineRevision, baselineTree: releaseCopyBaselineTree, appDirectory: "/tmp/app", chromeExecutable: "/tmp/chrome", endpoint: "ws://127.0.0.1:3211/devtools/browser/aaaaaaaa", current: payload(3212), baseline: payload(3213), media }, releaseCopyScope) }
const ports = (command = refinementInstallCommand): CopyEvidence["ports"] => ({ write: "success", fallback: "throw", writes: Array.from({length:5},()=>command),
  fallbacks: Array.from({length:3},()=>({value:command,readonly:true,start:0,end:command.length,focused:true,offscreen:true})),
  timers: [{delay:2500,started:1,fired:2501,cancelled:false},{delay:2500,started:1,fired:null,cancelled:true},{delay:2500,started:1,fired:null,cancelled:false}] })
// Text is reconstructed from the real independently authored HTML island,
// including hidden disclosure content. Geometry below is a synthetic pure
// contract fixture; only the native observer supplies actual line evidence.
function installText(current: boolean): Readonly<Record<string, string>> {
 const source = examplesIslands.find(item => item.selector === "#install")!
 const tree = parseFragment(current ? source.current : releaseCopyBaselineInstall)
 type Node = DefaultTreeAdapterMap["node"]
 type Element = DefaultTreeAdapterMap["element"]
 const descendants = (node: Node): Element[] => "childNodes" in node ? node.childNodes.flatMap(child => [...("tagName" in child ? [child] : []), ...descendants(child)]) : []
 const nodes = descendants(tree)
 const simple = (node: Element, selector: string): boolean => selector.startsWith(".") ? (node.attrs.find(a => a.name === "class")?.value.split(" ") ?? []).includes(selector.slice(1))
  : selector.startsWith("#") ? node.attrs.some(a => a.name === "id" && a.value === selector.slice(1))
  : selector.startsWith("[") ? node.attrs.some(a => a.name === selector.slice(1, -1)) : node.tagName === selector
 const matches = (node: Element, selector: string): boolean => {
  const direct = selector.split(" > "), parts = direct.length === 2 ? direct : selector.split(" ")
  if (parts.length === 1) return simple(node, selector)
  if (!simple(node, parts[1]!)) return false
  let parent = node.parentNode
  while (parent && "tagName" in parent) {
   if (simple(parent, parts[0]!)) return true
   if (direct.length === 2) return false
   parent = parent.parentNode
  }
  return false
 }
 const text = (node: Node): string => "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(text).join("") : ""
 return Object.fromEntries(refinementCopyElementKeys.map(key => {
  const selector = key.replace(/\[\d+\]$/u, ""), index = Number(/\[(\d+)\]$/u.exec(key)![1])
  const found = nodes.filter(node => matches(node, selector)); if (!found[index]) throw Error(`Missing fixture owner ${key}`)
  return [key, text(found[index]!).replace(/\s+/gu, " ").trim()]
 }))
}
function installFixture(current: boolean, row = false): ExamplesInstall {
 const texts = installText(current), top = current ? 500 : 100, scrollY = current ? 300 : 20, noteHeight = current ? 80 : 40
 const natural = 40 + 8 + noteHeight, headingHeight = row ? 240 : natural, commandTop = top + 25 + (row ? 0 : natural + 24)
 const width = row ? 626 : 350, installHeight = row ? 290 : 50 + natural + 24 + 240
 const commandX = row ? 10 + 25 + 276 : 35
 const boxes: Record<string, number[]> = {
  "#install[0]": [10, top, width, installHeight], ".install-note[0]": [35, top + 73, row ? 252 : 300, noteHeight],
  ".hraness-marketing-install__heading-group[0]": [35, top + 25, row ? 252 : 300, headingHeight],
  ".hraness-marketing-install__commands[0]": [commandX, commandTop, 300, 240],
 }
 const zero = new Set([".source-install .hraness-marketing-question__answer[0]", ".panel-note[1]", ".panel-note a[1]"])
 const elements = refinementCopyElementKeys.map((key, index): ShellElement => {
  const rect = (boxes[key] ?? (zero.has(key) ? [0, scrollY, 0, 0] : [commandX + 5, commandTop + index * 4, 100, 10])) as [number, number, number, number]
  const styles: Record<string, string> = { color: "black", height: `${rect[3]}px`, "box-sizing": "border-box", "line-height": "20px", direction: "ltr", "max-width": "500px", "align-content": "start", "align-items": "normal", display: "grid", "grid-template-columns": key === "#install[0]" && row ? "252px 300px" : "300px", "row-gap": key === "#install[0]" ? "24px" : "8px", "column-gap": "24px" }
  for (const side of ["top", "bottom", "left", "right"]) { styles[`margin-${side}`] = "0px"; styles[`padding-${side}`] = key === "#install[0]" ? "24px" : "0px"; styles[`border-${side}-width`] = key === "#install[0]" ? "1px" : "0px" }
  if (key === "[data-copy-command-status][0]") { styles.position = "absolute"; styles["clip-path"] = "inset(50%)"; rect[2] = 1; rect[3] = 1; styles.height = "1px" }
  return { key, rect, styles, text: texts[key]!, semantics: { role: null, href: null } }
 })
 const note = elements[1]!, count = current ? 4 : 2
 const fragments: [number, number, number, number][] = Array.from({ length: count }, (_, index) => [note.rect[0]!, note.rect[1]! + 2 + index * 20, 200, 16] as [number, number, number, number])
 // Three text nodes share the last line: prefix, release anchor, final period.
 const last = fragments.pop()!
 fragments.push([last[0], last[1], 100, 16], [last[0] + 100, last[1], 90, 16], [last[0] + 190, last[1], 10, 16])
 return { elements, title: { key: ".hraness-marketing-install__heading[0]", rect: [35, top + 25, 240, 40], text: "Install Slopcamera for your agent.", semantics: {}, styles: { ...elements[2]!.styles, height: "40px" } }, scrollY,
  clientRects: elements.map(item => zero.has(item.key) ? 0 : 1), fragments,
  rows: [row ? [240] : [natural, 240], [40, noteHeight]], alignSelf: ["auto", "auto"] }
}
const installReceipt = () => compareExamplesInstall(installFixture(true), installFixture(false), "receipt fixture", releaseCopyScope)
function terminal(req = request()) {
 const observations = examplesCaseNames.map((name, index) => {
  if (index < siteShellCases.length) return {name,passed:true,currentObstructions:[],baselineObstructions:[],install:siteShellCases[index]!.route==="/"?installReceipt():null}
  if (index < siteShellCases.length + siteCopyCases.length) return {name,passed:true,command:refinementInstallCommand,current:ports(),baseline:ports(releaseCopyBaselineCommand),install:{...installReceipt(),states:copySteps}}
  if (!name.startsWith("player-")) {
   const scenario = [...examplesDocsCases, ...examplesDocsExtraCases].find(item => item.name === name)!
   return {name,passed:true,figures:name.includes("parametric-design")?5:name.includes("/edit-video-")?8:2,videos:name.includes("first-animation")?2:name.includes("/edit-video-")?8:0,shellPaired:true,
    navigation:{mode:scenario.width<=768?"disclosure":"sidebar",javascript:!("javascript" in scenario&&scenario.javascript===false),currentHref:scenario.route,
     defaultClosed:true,keyboardToggle:scenario.width<=768?"enter-open-space-close":"not-applicable",closedLinksHidden:true,articleBeforeFold:true}}
  }
  if (name === "player-captions") return {name,passed:true,captions:"not-present",media:[],initialMediaRequests:0}
  return {name,passed:true,media:[{id:"editorial",paused:!['player-visible-auto','player-offscreen-hidden'].includes(name),
   time:name==='player-failed-media'?0:1,controls:true,readyState:3,muted:true,loop:['player-visible-auto','player-offscreen-hidden'].includes(name),
   error:null,source:`${req.current.origin}${media[0]!.path}`}],
   ...(name==='player-save-data'?{policyInput:'emulated-navigator-save-data'}:{}), ...(['player-offscreen-hidden','player-manual-pause'].includes(name)?{hiddenObserved:true}:{}),
   ...(['player-no-js','player-docs-manual','player-reduced-motion','player-save-data','player-failed-media'].includes(name)?{initialMediaRequests:0}:{}),
   ...(name==='player-failed-media'?{failedRequests:1,sourceError:{id:'editorial',source:`${req.current.origin}${media[0]!.path}`,count:1,owned:true}}:{})}
 })
 return {schemaVersion:1,token:req.token,scope:releaseCopyScope,baselineProfile:releaseCopyBaselineProfile,baselineRevision:releaseCopyBaselineRevision,baselineTree:releaseCopyBaselineTree,sequence:2,kind:'result',node:'24.18.1',playwright:'1.62.0',browser:'151.0.0.0',closed:true,cases:[...examplesCaseNames],negativeControls:[...examplesNegativeControls],observations}
}
const mutate = (value: unknown, action: (record: any) => void) => { const copy = structuredClone(value); action(copy); return copy }

function installDomFixture(current: boolean, state: "idle" | "copied" | "failed", admitCallback = admitExamplesInstallDom) {
 type Node = DefaultTreeAdapterMap["node"]
 type Element = DefaultTreeAdapterMap["element"]
 class Detached {
  constructor(readonly node: Node) {}
  get children(): Detached[] { return "childNodes" in this.node ? this.node.childNodes.filter((node): node is Element => "tagName" in node).map(node => new Detached(node)) : [] }
  querySelectorAll(selector: string): Detached[] {
   const name = /^\[([^\]]+)\]$/u.exec(selector)![1]!
   return this.children.flatMap(child => [...(child.getAttribute(name) !== null ? [child] : []), ...child.querySelectorAll(selector)])
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null }
  cloneNode() { return new Detached(structuredClone(this.node)) }
  get attributes() { return (this.node as Element).attrs.map(attribute => ({ name: attribute.name, value: attribute.value })) }
  getAttributeNames() { return this.attributes.map(attribute => attribute.name) }
  getAttribute(name: string) { return (this.node as Element).attrs.find(attribute => attribute.name === name)?.value ?? null }
  setAttribute(name: string, value: string) { const node = this.node as Element, old = node.attrs.find(attribute => attribute.name === name); if (old) old.value = value; else node.attrs.push({ name, value }) }
  removeAttribute(name: string) { (this.node as Element).attrs = (this.node as Element).attrs.filter(attribute => attribute.name !== name) }
  get className() { return this.getAttribute("class") ?? "" }
  set className(value: string) { this.setAttribute("class", value) }
  get hidden() { return this.getAttribute("hidden") !== null }
  set hidden(value: boolean) { if (value) this.setAttribute("hidden", ""); else this.removeAttribute("hidden") }
  get dataset() { return { copyState: this.getAttribute("data-copy-state") ?? undefined } }
  get textContent(): string { const text = (node: Node): string => "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(text).join("") : ""; return text(this.node) }
  set textContent(value: string) { const node = this.node as Element; node.childNodes = value ? [{ nodeName: "#text", value, parentNode: node }] : [] }
  get outerHTML() { return serializeOuter(this.node) }
 }
 const island = examplesIslands.find(item => item.selector === "#install")!, fixture = current ? island.current : releaseCopyBaselineInstall
 const root = new Detached(parseFragment(fixture).childNodes[0]!), button = root.querySelector("[data-copy-command-button]")!, status = root.querySelector("[data-copy-command-status]")!
 button.hidden = false; button.className = button.getAttribute(`data-copy-${state}-class`)!
 if (state !== "idle") button.setAttribute("data-copy-state", state)
 button.textContent = state === "copied" ? "Copied" : "Copy"
 status.textContent = state === "idle" ? "" : state === "copied" ? "Install command copied." : "Could not copy the command. Select it and copy it manually."
 const document = { createElement: (tag: string) => {
  if (tag !== "template") throw Error("Only a detached template is allowed")
  return { content: new Detached(parseFragment("")), set innerHTML(value: string) { this.content = new Detached(parseFragment(value)) } }
 } }
 const admit = (copying: boolean) => runInNewContext(`(${admitCallback.toString()})(root, input)`, { root, input: { fixture, copying }, document })
 return { root, button, status, fixture, admit }
}
describe("release-copy-v1 has an independent closed identity", () => {
 test("binds the a742 edit-video inventory while preserving historical seven-item acceptance", async () => {
  const historical = ["color-warm", "color-cool", "color-mono", "edit-directed-landscape", "edit-directed-portrait", "edit-directed-square", "edit-directed-feed-portrait"]
  const released = ["color-warm", "color-cool", "color-mono", "premiere-wall", "edit-directed-landscape", "edit-directed-portrait", "edit-directed-square", "edit-directed-feed-portrait"]
  const authored = await readFile(new URL("../src/docs/how-to/edit-video.md", import.meta.url), "utf8")
  expect([...authored.matchAll(/^::example\[([^\]]+)\]$/gmu)].map(match => match[1])).toEqual(released)
  expect<readonly string[]>(releaseCopyEditVideoIds).toEqual(released)
  expect(examplesEditVideoIds()).toEqual(historical)
  expect(examplesEditVideoIds(releaseCopyScope)).toEqual(released)
  expect(Object.isFrozen(examplesEditVideoIds())).toBe(true)
  expect(Object.isFrozen(examplesEditVideoIds(releaseCopyScope))).toBe(true)
  expect(() => assertExamplesEditVideoInventory(7, 7, historical)).not.toThrow()
  expect(() => assertExamplesEditVideoInventory(8, 8, released, releaseCopyScope)).not.toThrow()
  expect(() => assertExamplesEditVideoInventory(8, 8, released)).toThrow()
  expect(() => assertExamplesEditVideoInventory(7, 7, historical, releaseCopyScope)).toThrow()
  expect(() => examplesEditVideoIds("other" as any)).toThrow()
  for (const ids of [released.slice(1), [...released, "extra"], [...released].reverse(),
   released.map((id, index) => index === 3 ? "color-mono" : id), released.map((id, index) => index === 3 ? null : id)])
   expect(() => assertExamplesEditVideoInventory(8, 8, ids, releaseCopyScope)).toThrow()
  for (const figures of [7, 9]) expect(() => assertExamplesEditVideoInventory(figures, 8, released, releaseCopyScope)).toThrow()
  for (const videos of [7, 9]) expect(() => assertExamplesEditVideoInventory(8, videos, released, releaseCopyScope)).toThrow()
  const req = request(), receipt = terminal(req)
  const editCases = examplesCaseNames.filter(name => name.includes("/edit-video-"))
  expect(editCases).toHaveLength(8)
  for (const name of editCases) for (const field of ["figures", "videos"]) for (const count of [7, 9]) {
   expect(() => parseExamplesPhase(mutate(receipt, value => { value.observations.find((item: any) => item.name === name)[field] = count }), 2, req)).toThrow()
  }
 })
 test("binds scope, baseline profile/revision/tree through requests, phases and failures", () => {
  const req = request(), receipt = terminal(req), failure = examplesCaseFailure(req, examplesCaseNames[0]!, "pair", [], Error("failed"))
  expect(parseExamplesRequest(req, releaseCopyScope)).toEqual(req)
  expect(() => parseExamplesRequest(req)).toThrow()
  expect(parseExamplesPhase(receipt, 2, req)).toEqual(receipt)
  expect(parseExamplesCaseFailure(failure, req)).toEqual(failure)
  for (const [field, value] of [["scope", examplesScope], ["baselineProfile", examplesBaselineProfile], ["baselineRevision", examplesBaselineRevision], ["baselineTree", examplesBaselineTree], ["scope", "unknown"],
   ["baselineProfile", "before-release-copy-e08bacf-v1"], ["baselineRevision", "e08bacf68c140062d9e2aebf314a4bd5d4d17cb7"], ["baselineTree", "d7c1e70f77255d38a80acd8184654910be473f46"]]) {
   expect(() => parseExamplesRequest({ ...req, [field!]: value }, releaseCopyScope)).toThrow()
   expect(() => parseExamplesPhase({ ...receipt, [field!]: value }, 2, req)).toThrow()
   expect(() => parseExamplesCaseFailure({ ...failure, [field!]: value }, req)).toThrow()
  }
  for (const resource of ["/docs", media[0]!.path, media[0]!.poster]) {
   const forged = { ...req, baseline: { ...req.baseline, resources: req.baseline.resources.filter(value => value !== resource) } }
   expect(() => parseExamplesRequest(forged, releaseCopyScope)).toThrow()
  }
  const historical = { ...req, scope: examplesScope, baselineProfile: examplesBaselineProfile } as Record<string, unknown>
  delete historical.baselineRevision; delete historical.baselineTree
  expect(parseExamplesRequest(historical).scope).toBe(examplesScope)
  expect(() => parseExamplesRequest(historical, releaseCopyScope)).toThrow()
  expect(() => parseExamplesPhase(receipt, 2, parseExamplesRequest(historical))).toThrow()
  expect(() => parseExamplesCaseFailure(failure, parseExamplesRequest(historical))).toThrow()
 })
 test("all133 families retain per-side commands, finite transport and unchanged bounds", () => {
  const req = request(), receipt = terminal(req), encoded = encodeProfiledWorkerJson(receipt, releaseCopyScope)
  expect(encoded.byteLength).toBeLessThanOrEqual(examplesWorkerProtocolLimit)
  expect(parseExamplesPhase(decodeProfiledWorkerJson(encoded, releaseCopyScope), 2, req)).toEqual(receipt)
  expect(examplesCaseNames).toHaveLength(133); expect(examplesDeadlineMs).toBe(1200000)
  expect(workerDriverLimit).toBe(262144); expect(examplesWorkerProtocolLimit).toBe(131072); expect(workerAttachmentMs).toBe(10000)
  for (const action of [
   (value: any) => { value.observations.pop() }, (value: any) => { value.cases.reverse() },
   (value: any) => { value.negativeControls.pop() },
   (value: any) => { value.observations[76].baseline = ports(examplesBaselineInstallCommand) },
   (value: any) => { value.observations[76].baseline = ports(refinementInstallCommand) },
   (value: any) => { [value.observations[76].baseline, value.observations[76].current] = [value.observations[76].current, value.observations[76].baseline] },
   (value: any) => { value.observations[76].install.baseline.note = examplesInstallNote(false) },
   (value: any) => { value.observations[76].baseline.fallbacks[0].end-- },
   (value: any) => { value.observations[76].current.timers[0].fired-- },
  ]) expect(() => parseExamplesPhase(mutate(receipt, action), 2, req)).toThrow()
  const limit = { text: "a".repeat(examplesWorkerProtocolLimit - Buffer.byteLength('{"text":""}\n')) }
  expect(encodeProfiledWorkerJson(limit, releaseCopyScope).byteLength).toBe(examplesWorkerProtocolLimit)
  expect(() => encodeProfiledWorkerJson({ text: limit.text + "a" }, releaseCopyScope)).toThrow()
 })
 test("schema seven rejects historical or mixed schema-six identities", () => {
  const snapshot = { inputs: [], artifacts: [], files: new Map(), stylesheets: ["/a.css", "/b.css"] } as ShellSnapshot
  const manifest = { schemaVersion: 7, baselineProfile: releaseCopyBaselineProfile, checkoutRevision: releaseCopyBaselineRevision,
   sourceRevision: releaseCopyBaselineRevision, sourceTree: releaseCopyBaselineTree, inputs: [], artifacts: [] }
  expect(() => assertExamplesBaselineManifest(manifest, snapshot, releaseCopyScope)).not.toThrow()
  expect(() => assertExamplesBaselineManifest(manifest, snapshot)).toThrow()
  const historical = { ...manifest, schemaVersion: 6, baselineProfile: examplesBaselineProfile, checkoutRevision: examplesBaselineRevision, sourceRevision: examplesBaselineRevision, sourceTree: examplesBaselineTree }
  expect(() => assertExamplesBaselineManifest(historical, snapshot)).not.toThrow()
  expect(() => assertExamplesBaselineManifest(historical, snapshot, releaseCopyScope)).toThrow()
  for (const change of [{ schemaVersion: 6 }, { baselineProfile: examplesBaselineProfile }, { sourceRevision: examplesBaselineRevision }, { sourceTree: examplesBaselineTree }, { checkoutRevision: examplesBaselineRevision }, { extra: true },
   { baselineProfile: "before-release-copy-e08bacf-v1" }, { sourceRevision: "e08bacf68c140062d9e2aebf314a4bd5d4d17cb7" }, { sourceTree: "d7c1e70f77255d38a80acd8184654910be473f46" }])
   expect(() => assertExamplesBaselineManifest({ ...manifest, ...change }, snapshot, releaseCopyScope)).toThrow()
 })
})
describe("exact release install fragments and unchanged geometry contract", () => {
 test("actual authored3.3.6 and current HTML differs in exactly six text owners", () => {
  const current = installFixture(true), baseline = installFixture(false)
  expect(baseline.elements[1]!.text).toBe(releaseCopyBaselineNote)
  expect(examplesInstallNote(false, releaseCopyScope)).toBe(releaseCopyBaselineNote)
  expect(projectExamplesBaselineCopyElements(baseline.elements, releaseCopyScope).map(item => item.text)).toEqual(current.elements.map(item => item.text))
  expect(current.elements.filter((item, index) => item.text !== baseline.elements[index]!.text)).toHaveLength(6)
  expect(refinementInstallCommand).toBe(`${archiveInstall.command}\n${archiveInstall.skillCommand}`)
  expect(releaseCopyBaselineCommand).toContain("/v3.3.6/hraness-slopcamera-3.3.6.tgz")
  expect(examplesBaselineInstallCommand).toContain("/v3.3.3/hraness-slopcamera-3.3.3.tgz")
  for (const row of [false, true]) {
   const receipt = compareExamplesInstall(installFixture(true, row), installFixture(false, row), "synthetic layout", releaseCopyScope)
   expect(() => parseExamplesInstallPair(receipt, releaseCopyScope)).not.toThrow()
   expect(() => parseExamplesInstallPair(receipt)).toThrow()
  }
  // Synthetic dimensions exercise equations. Native acceptance must measure
  // the actual authored notes, line bands and layout independently.
 })
 test("all ten copy states keep per-side port proof; stale and reversed evidence fails", () => {
  const evidence = (current: boolean, negative = false): CopyEvidence => ({ command: current ? refinementInstallCommand : releaseCopyBaselineCommand,
   ports: ports(current ? refinementInstallCommand : releaseCopyBaselineCommand), negativeControls: negative ? copyNegativeControls : [],
   steps: copySteps.map(name => ({ name, elements: installFixture(current).elements })) })
  const current = evidence(true, true), baseline = evidence(false), scenario = siteCopyCases[0]!
  const compare = (a: CopyEvidence, b: CopyEvidence) => compareExamplesCopy(a, b, scenario, true, copySteps.map(() => installFixture(true)), copySteps.map(() => installFixture(false)), releaseCopyScope)
  expect(compare(current, baseline).install.states).toEqual(copySteps)
  for (const [a, b] of [[baseline, current], [current, { ...baseline, command: examplesBaselineInstallCommand }],
   [{ ...current, ports: ports(releaseCopyBaselineCommand) }, baseline], [current, { ...baseline, ports: ports(refinementInstallCommand) }]]) expect(() => compare(a!, b!)).toThrow()
 })
 test("wrong note, duplicate fragments, false line bands, unrelated styles and semantics cannot project", () => {
  const baseline = installFixture(false)
  for (const change of [
   (side: any) => { side.elements[1].text = examplesInstallNote(false) },
   (side: any) => { side.elements[1].text += ` ${releaseCopyBaselineNote}` },
   (side: any) => { side.elements[15].text += ` ${side.elements[15].text}` },
   (side: any) => { side.elements.push(side.elements[1]) }, (side: any) => { side.fragments.splice(0, 1) },
   (side: any) => { side.elements[1].styles["line-height"] = "21px" }, (side: any) => { side.elements[1].rect[2]++ },
   (side: any) => { side.elements[3].styles.color = "red" }, (side: any) => { side.elements[3].semantics.href = "wrong" },
  ]) expect(() => compareExamplesInstall(installFixture(true), mutate(baseline, change) as ExamplesInstall, "hostile", releaseCopyScope)).toThrow()
 })
 test("detached exact DOM admission checks every active state on both release sides", () => {
  for (const current of [false, true]) for (const state of ["idle", "copied", "failed"] as const) {
   const fixture = installDomFixture(current, state), raw = fixture.root.outerHTML
   expect(fixture.admit(true)).toEqual({ raw, admitted: fixture.fixture })
   if (state === "idle") expect(fixture.admit(false)).toEqual({ raw, admitted: fixture.fixture })
   else expect(() => fixture.admit(false)).toThrow()
   fixture.button.setAttribute("aria-label", "extra"); expect(() => fixture.admit(true)).toThrow()
  }
 })
})
const origins = { current: "http://127.0.0.1:1234", baseline: "http://127.0.0.1:1235" }
const background = (origin: string) => examplesHeroTextures.map(asset => `url("${origin}/${asset.path}")`).join(", ")
function flowFixture(current: boolean): ShellElement[] {
 let top = 100
 return examplesFlowSections.map(selector => {
  const install = selector === "#install", height = install && current ? 340 : 300
  const item = { key: `${selector}[0]`, rect: [20, top, 500, height], text: install && current ? "current install" : selector, semantics: {},
   styles: { height: `${height}px`, color: "black", "background-image": selector === ".hraness-marketing-hero" ? background(current ? origins.current : origins.baseline) : "none" } }
  top += height + 40; return item
 })
}
describe("strict ordinary scope without historical design exemptions", () => {
 test("only install height and following flow vary; texture origin projection keeps URLs/order/paint exact", () => {
  const current = flowFixture(true), baseline = flowFixture(false)
  expect(compareReleaseCopyFlow(current, baseline, 40, origins)).toBe(40)
  for (const change of [
   (rows: any) => { rows[0].rect[2]++ }, (rows: any) => { rows[0].rect[3]++ },
   (rows: any) => { rows[0].text += " changed" }, (rows: any) => { rows[2].rect[3]++ },
   (rows: any) => { rows[2].rect[1]++ }, (rows: any) => { rows[0].styles.color = "red" },
   (rows: any) => { rows[0].styles["background-image"] = background(origins.baseline) },
   (rows: any) => { rows[0].styles["background-image"] = background(origins.current).split(", ").reverse().join(", ") },
   (rows: any) => { rows[0].styles["background-image"] += ", linear-gradient(red, blue)" },
   (rows: any) => { rows[0].styles["background-image"] = background(origins.current).replace("grain-", "other-") },
   (rows: any) => { rows[1].styles.height = "999px" },
  ]) expect(() => compareReleaseCopyFlow(mutate(current, change) as ShellElement[], baseline, 40, origins)).toThrow()
  expect(() => compareReleaseCopyFlow(current, baseline, 0, origins)).toThrow()
  expect(() => compareReleaseCopyFlow(current.slice(1), baseline.slice(1), 40, origins)).toThrow()
 })
})
function inputFixture() {
 const paths = ["package.json", "published-release.json", "../../package.json", "../../bun.lock", "bun.lock", "vendor/paper-theme/paper-theme.css", "src/index.html", "scripts/build-site.ts", "media/examples.json", "../../examples/showcase/example.ts"].sort((a, b) => a.localeCompare(b))
 const baseline = { inputs: paths.map(path => ({ path, bytes: 12, sha256: hash })) }, current = structuredClone(baseline)
 const oldPackage = { dependencies: { example: "1.0.0" }, scripts: { test: "bun test original.test.ts", build: "bun build.ts" } }
 const currentPackage = { ...oldPackage, scripts: { ...oldPackage.scripts, test: `${oldPackage.scripts.test} ./scripts/site-release-copy-browser-contract.test.ts`, "verify:release-copy": "bun run ./scripts/verify-site-release-copy.ts" } }
 const datum = { version: "3.3.6", releaseUrl: "https://github.com/hraness/slopcamera/releases/tag/v3.3.6" }
 return { current, baseline, currentPackage, oldPackage, datum }
}
describe("product input and dependency closure stays exact", () => {
 test("only reviewed verifier paths, exact command/test additions and validated datum can differ", () => {
  const f = inputFixture(), check = () => assertReleaseCopyInputs(f.current, f.baseline, f.currentPackage, f.oldPackage, publishedRelease, f.datum)
  expect(check).not.toThrow()
  f.current.inputs.push({ path: "scripts/site-release-copy-profile.ts", bytes: 30, sha256: "b".repeat(64) }); expect(check).not.toThrow()
  for (const path of ["scripts/site-shell-browser-contract.ts", "scripts/site-release-copy-focus.ts"]) {
   f.current.inputs.push({ path, bytes: 30, sha256: "b".repeat(64) }); expect(check).not.toThrow()
  }
  for (const path of ["src/index.html", "scripts/build-site.ts", "media/examples.json", "../../examples/showcase/example.ts", "vendor/paper-theme/paper-theme.css", "../../package.json", "../../bun.lock", "bun.lock"]) {
   const changed = structuredClone(f.current); changed.inputs.find(item => item.path === path)!.sha256 = "c".repeat(64)
   expect(() => assertReleaseCopyInputs(changed, f.baseline, f.currentPackage, f.oldPackage, publishedRelease, f.datum)).toThrow()
  }
  for (const path of ["scripts/new-product.ts", "src/extra.ts", "../../secret", "scripts/site-release-copy-focus-runtime.ts", "src/site-release-copy-focus.ts", "scripts/site-shell-runtime.ts"]) expect(() => assertReleaseCopyInputs({ inputs: [...f.current.inputs, { path, bytes: 1, sha256: hash }] }, f.baseline, f.currentPackage, f.oldPackage, publishedRelease, f.datum)).toThrow()
  for (const change of [
   (value: any) => { value.dependencies.example = "2.0.0" }, (value: any) => { value.scripts.build += " --unsafe" },
   (value: any) => { value.scripts.test = "bun test only-new.test.ts" }, (value: any) => { value.scripts["verify:release-copy"] += " --skip" },
  ]) expect(() => assertReleaseCopyInputs(f.current, f.baseline, mutate(f.currentPackage, change), f.oldPackage, publishedRelease, f.datum)).toThrow()
  expect(() => assertReleaseCopyInputs(f.current, f.baseline, f.currentPackage, f.oldPackage, f.datum, publishedRelease)).toThrow()
 })
})
function focusGuardFixture(install = installReleaseCopyFocusGuard) {
 const listeners = new Map<string, Set<(event: any) => void>>()
 class Owner {
  readonly ownerDocument: object
  isConnected = true
  constructor(readonly selectors: string[] = [], owner?: object) { this.ownerDocument = owner ?? document }
  matches(selector: string) { return this.selectors.includes(selector) }
 }
 class Video extends Owner { controls = true }
 class Audio extends Owner { controls = true }
 class Anchor extends Owner {}
 const owners: Owner[] = []
 const document = { activeElement: null as Owner | null, querySelectorAll: (selector: string) => owners.filter(owner => owner.isConnected && owner.matches(selector)) }
 const node = (selectors: string[] = []) => { const owner = new Owner(selectors); owners.push(owner); return owner }
 const anchor = (selectors: string[] = []) => { const owner = new Anchor(selectors); owners.push(owner); return owner }
 const body = node(), unnamed = node(), skip = anchor([".skip-link"]), named = anchor([".topbar a"]), other = anchor([".topbar a"]), link = anchor()
 const video = new Video(), audio = new Audio(); owners.push(video, audio)
 document.activeElement = body
 const window = {
  addEventListener(type: string, listener: (event: any) => void, options: any) {
   expect(options).toEqual({ capture: true, passive: true })
   if (!listeners.has(type)) listeners.set(type, new Set())
   listeners.get(type)!.add(listener)
  },
  removeEventListener(type: string, listener: (event: any) => void, capture: boolean) {
   expect(capture).toBe(true); listeners.get(type)?.delete(listener)
  },
 }
 const emit = (type: string, event: object) => { for (const listener of [...(listeners.get(type) ?? [])]) listener(event) }
 const guard = runInNewContext(`(${install.toString()})()`, { window, document, Element: Owner, HTMLElement: Owner, HTMLVideoElement: Video, HTMLAnchorElement: Anchor }) as ReturnType<typeof installReleaseCopyFocusGuard>
 const keydown = (extra: object = {}) => emit("keydown", { key: "Tab", isTrusted: true, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra })
 const keyup = (extra: object = {}) => emit("keyup", { key: "Tab", isTrusted: true, composed: true, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false, isComposing: false, target: document.activeElement, ...extra })
 const gain = (owner: Owner, extra: object = {}) => { const relatedTarget = document.activeElement; document.activeElement = owner; emit("focusin", { target: owner, relatedTarget, isTrusted: true, composed: true, ...extra }) }
 const dispatch = (owner?: Owner) => { guard.prepare(); keydown(); if (owner) gain(owner); return guard.read() }
 const listenerCount = () => [...listeners.values()].reduce((count, values) => count + values.size, 0)
 return { guard, owners, node, anchor, body, unnamed, skip, named, other, link, video, audio, document, keydown, keyup, gain, emit, dispatch, listenerCount, Owner, Video, Anchor }
}
describe("release-only native Tab seek keeps every named observation guarded", () => {
 test("invalid scope is rejected before context creation", async () => {
  let contexts = 0
  const browser = { newContext() { contexts++; throw new Error("unexpected context") } } as any
  for (const [profile, mode] of [[undefined, "release-copy-v1"], ["marketing-refinement-v1", "release-copy-v1"],
   ["optional-support-v1", "release-copy-v1"], ["workflow-examples-v1", "other"], ["workflow-examples-v1", false]] as any[]) {
   await expect(checkShellCase(browser, payload(3212), siteShellCases[0]!, "current", false, undefined, profile, mode)).rejects.toThrow(/Unknown native Tab settlement profile/u)
  }
  expect(contexts).toBe(0)
 })
 test("unnamed document stops seek; skip, duplicates and named stops require settlement", () => {
  const f = focusGuardFixture()
  expect(f.dispatch(f.unnamed)).toBeNull()
  expect(f.dispatch(f.skip)).toBe("skip"); expect(f.guard.settled()).toBe("skip")
  expect(f.dispatch(f.named)).toBe(".topbar a|0"); expect(f.guard.settled()).toBe(".topbar a|0")
  expect(f.dispatch()).toBe(".topbar a|0"); expect(f.guard.settled()).toBe(".topbar a|0")
  f.guard.prepare(); f.keydown(); f.document.activeElement = f.body
  expect(f.guard.read()).toBeNull()
  f.guard.finish(); expect(f.listenerCount()).toBe(0)
  expect(() => f.guard.prepare()).toThrow(/disposed/u); f.guard.dispose(); expect(f.listenerCount()).toBe(0)
 })
 test("opaque native video epochs preserve null seeking and subsequent named settlement for every eight-epoch sequence", () => {
  // Exhaust the ordering law over every mixture of document-observed and
  // opaque native-control Tabs; the host's real keyboard call remains native.
  for (let mask = 0; mask < 256; mask++) for (const exit of ["keydown", "keyup"] as const) {
   const f = focusGuardFixture(); expect(f.dispatch(f.video)).toBeNull()
   for (let epoch = 0; epoch < 8; epoch++) {
    f.guard.prepare(); if (mask & (1 << epoch)) f.keydown()
    expect(f.guard.read()).toBeNull()
   }
   if (exit === "keydown") expect(f.dispatch(f.named)).toBe(".topbar a|0")
   else {
    f.guard.prepare(); f.gain(f.named); f.keyup()
    expect(f.guard.read()).toBe(".topbar a|0")
   }
   expect(f.guard.settled()).toBe(".topbar a|0")
   f.guard.finish(); expect(f.listenerCount()).toBe(0)
  }
 })
 test("a missing document keydown admits only the same previously controlled unnamed video", () => {
  for (const kind of ["body", "unnamed", "audio", "uncontrolled", "named"] as const) {
   const f = focusGuardFixture()
   if (kind === "uncontrolled") f.video.controls = false
   const owner = kind === "uncontrolled" ? f.video : f[kind]
   const key = f.dispatch(owner); if (key !== null) f.guard.settled()
   f.guard.prepare(); expect(() => f.guard.read()).toThrow(/native Tab dispatch missing/u)
   f.guard.dispose(); expect(f.listenerCount()).toBe(0)
  }
  for (const before of [false, true]) {
   const f = focusGuardFixture(); f.video.controls = before; expect(f.dispatch(f.video)).toBeNull()
   f.guard.prepare(); f.video.controls = !before
   expect(() => f.guard.read()).toThrow(/native Tab dispatch missing/u); f.guard.dispose()
  }
  const toggled = focusGuardFixture(); expect(toggled.dispatch(toggled.video)).toBeNull()
  toggled.video.controls = false; toggled.guard.prepare(); toggled.video.controls = true
  expect(() => toggled.guard.read()).toThrow(/native Tab dispatch missing/u); toggled.guard.dispose()
 })
 test("opaque video seeking never admits a focus gain, exit, changed owner, or named video", () => {
  for (const change of [
   (f: ReturnType<typeof focusGuardFixture>) => { f.document.activeElement = f.body },
   (f: ReturnType<typeof focusGuardFixture>) => { f.document.activeElement = f.named },
   (f: ReturnType<typeof focusGuardFixture>) => { f.document.activeElement = new f.Video() },
   (f: ReturnType<typeof focusGuardFixture>) => { f.document.activeElement = new f.Video([], {}) },
   (f: ReturnType<typeof focusGuardFixture>) => { f.video.isConnected = false },
   (f: ReturnType<typeof focusGuardFixture>) => { f.video.selectors.push(".topbar a") },
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.video) },
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.named); f.gain(f.video) },
   (f: ReturnType<typeof focusGuardFixture>) => { f.keydown({ isTrusted: false }) },
  ]) {
   const f = focusGuardFixture(); expect(f.dispatch(f.video)).toBeNull(); f.guard.prepare(); change(f)
   expect(() => f.guard.read()).toThrow(); expect(() => f.guard.read()).toThrow()
   f.guard.dispose(); expect(f.listenerCount()).toBe(0)
  }
  const named = focusGuardFixture(); named.video.selectors.push(".topbar a")
  expect(named.dispatch(named.video)).toBe(".topbar a|2"); named.guard.settled(); named.guard.prepare()
  expect(() => named.guard.read()).toThrow(/native Tab dispatch missing/u); named.guard.dispose()
  const repeated = focusGuardFixture(); repeated.dispatch(repeated.video); repeated.guard.prepare()
  expect(repeated.guard.read()).toBeNull(); expect(() => repeated.guard.read()).toThrow(/native Tab dispatch missing/u)
  repeated.guard.dispose()
 })
 test("video anchor exits need exactly one trusted focus gain and matching plain Tab release", () => {
  for (const owner of ["link", "named", "skip"] as const) {
   const f = focusGuardFixture(); f.dispatch(f.video); f.guard.prepare(); f.gain(f[owner]); f.keyup()
   const expected = owner === "link" ? null : owner === "named" ? ".topbar a|0" : "skip"
   expect(f.guard.read()).toBe(expected)
   if (expected !== null) expect(f.guard.settled()).toBe(expected)
   f.guard.finish(); expect(f.listenerCount()).toBe(0)
  }
  for (const extra of [{ isTrusted: false }, { composed: false }, { key: "Enter" }, { shiftKey: true },
   { altKey: true }, { ctrlKey: true }, { metaKey: true }, { repeat: true }, { isComposing: true }]) {
   const f = focusGuardFixture(); f.dispatch(f.video); f.guard.prepare(); f.gain(f.link); f.keyup(extra)
   expect(() => f.guard.read()).toThrow(/keyup/u); f.keyup(); expect(() => f.guard.read()).toThrow(/keyup/u)
   f.guard.dispose(); expect(f.listenerCount()).toBe(0)
  }
  for (const owner of ["video", "body", "named"] as const) {
   const f = focusGuardFixture(); f.dispatch(f.video); f.guard.prepare(); f.gain(f.link); f.keyup({ target: f[owner] })
   expect(() => f.guard.read()).toThrow(/keyup owner changed/u); f.guard.dispose()
  }
  for (const extra of [{ isTrusted: false }, { composed: false }, { relatedTarget: null }]) {
   const f = focusGuardFixture(); f.dispatch(f.video); f.guard.prepare(); f.gain(f.link, extra); f.keyup()
   expect(() => f.guard.read()).toThrow(/unproved video exit gain/u); f.guard.dispose()
  }
 })
 test("a swallowed-keydown exit never admits body, audio, video or nonauthored anchor owners", () => {
  for (const kind of ["body", "unnamed", "video", "audio", "different-video", "foreign", "disconnected"] as const) {
   const f = focusGuardFixture(); f.dispatch(f.video); f.guard.prepare()
   const owner = kind === "different-video" ? new f.Video() : kind === "foreign" ? new f.Anchor([], {}) :
    kind === "disconnected" ? f.link : f[kind]
   if (kind === "disconnected") owner.isConnected = false
   f.gain(owner); f.keyup()
   expect(() => f.guard.read()).toThrow(); f.guard.dispose(); expect(f.listenerCount()).toBe(0)
  }
 })
 test("video exit source and anchor proofs stay frozen through gain, keyup and read", () => {
  for (const stage of ["gain", "keyup", "read"] as const) for (const change of [
   (f: ReturnType<typeof focusGuardFixture>) => { f.video.controls = false },
   (f: ReturnType<typeof focusGuardFixture>) => { f.video.isConnected = false },
   (f: ReturnType<typeof focusGuardFixture>) => { f.video.selectors.push(".topbar a") },
   (f: ReturnType<typeof focusGuardFixture>) => { (f.video as any).ownerDocument = {} },
  ]) {
   const f = focusGuardFixture(); f.dispatch(f.video); f.guard.prepare()
   if (stage === "gain") change(f)
   f.gain(f.link)
   if (stage === "keyup") change(f)
   f.keyup()
   if (stage === "read") change(f)
   expect(() => f.guard.read()).toThrow(); expect(() => f.guard.read()).toThrow(); f.guard.dispose()
  }
  for (const stage of ["keyup", "read"] as const) for (const change of [
   (f: ReturnType<typeof focusGuardFixture>) => { f.link.isConnected = false },
   (f: ReturnType<typeof focusGuardFixture>) => { f.link.selectors.push(".topbar a") },
   (f: ReturnType<typeof focusGuardFixture>) => { (f.link as any).ownerDocument = {} },
   (f: ReturnType<typeof focusGuardFixture>) => { f.document.activeElement = new f.Anchor() },
  ]) {
   const f = focusGuardFixture(); f.dispatch(f.video); f.guard.prepare(); f.gain(f.link)
   if (stage === "keyup") change(f)
   f.keyup()
   if (stage === "read") change(f)
   expect(() => f.guard.read()).toThrow(); f.guard.dispose()
  }
 })
 test("video exit cannot recover from missing, premature, repeated or late native evidence", () => {
  for (const change of [
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.link) }, // Missing release.
   (f: ReturnType<typeof focusGuardFixture>) => { f.keyup() }, // Release without a gain.
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.link); f.keydown(); f.keyup() }, // Premature gain.
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.link); f.keyup(); f.keyup() },
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.link); f.keyup(); f.gain(f.link) },
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.link); f.gain(f.named); f.gain(f.link); f.keyup() },
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.link); f.keyup(); f.keydown() },
  ]) {
   const f = focusGuardFixture(); f.dispatch(f.video); f.guard.prepare(); change(f)
   expect(() => f.guard.read()).toThrow(); f.keyup(); expect(() => f.guard.read()).toThrow()
   f.guard.dispose(); expect(f.listenerCount()).toBe(0)
  }
  const named = focusGuardFixture(); named.dispatch(named.video); named.guard.prepare(); named.gain(named.named); named.keyup()
  expect(named.guard.read()).toBe(".topbar a|0"); expect(() => named.guard.prepare()).toThrow(/incomplete/u); named.guard.dispose()
  const late = focusGuardFixture(); late.dispatch(late.video); late.guard.prepare(); late.gain(late.link); late.keyup()
  expect(late.guard.read()).toBeNull(); late.gain(late.named); late.gain(late.link)
  expect(() => late.guard.prepare()).toThrow(/outside native Tab dispatch/u); late.guard.dispose()
 })
 test("all pairs of focus gains fail, even the same owner or a transient null-to-named redirect", () => {
  for (const first of ["unnamed", "named", "other"] as const) for (const second of ["unnamed", "named", "other"] as const) {
   const f = focusGuardFixture(); f.guard.prepare(); f.keydown(); f.gain(f[first]); f.gain(f[second])
   expect(() => f.guard.read()).toThrow(/multiple focus gains/u); f.guard.dispose(); expect(f.listenerCount()).toBe(0)
  }
  const f = focusGuardFixture(); f.guard.prepare(); f.keydown(); f.gain(f.unnamed); f.gain(f.named); f.gain(f.unnamed)
  expect(() => f.guard.read()).toThrow(/multiple focus gains/u); f.guard.dispose()
 })
 test("capture sees the first target before a nested redirect changes activeElement", () => {
  const f = focusGuardFixture(); f.guard.prepare(); f.keydown()
  f.gain(f.named) // Window capture runs before a later target handler redirects.
  f.gain(f.other); f.gain(f.named)
  expect(() => f.guard.read()).toThrow(/multiple focus gains/u); f.guard.dispose()
 })
 test("delayed gains between read, prepare and actual keydown stay fatal", () => {
  for (const prepared of [false, true]) {
   const f = focusGuardFixture(); expect(f.dispatch(f.unnamed)).toBeNull()
   if (prepared) f.guard.prepare()
   f.gain(f.named); f.gain(f.unnamed)
   if (prepared) f.keydown()
   expect(() => prepared ? f.guard.read() : f.guard.prepare()).toThrow(/outside native Tab dispatch/u)
   expect(() => f.guard.finish()).toThrow(/outside native Tab dispatch/u); expect(f.listenerCount()).toBe(0)
  }
 })
 test("full settlement rejects redirects, replacement nodes and changed inventory indices", () => {
  for (const change of [
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.other); f.gain(f.named) },
   (f: ReturnType<typeof focusGuardFixture>) => {
    const replacement = f.node([".topbar a"]); f.owners.splice(f.owners.indexOf(replacement), 1)
    f.owners.splice(f.owners.indexOf(f.named), 1, replacement); f.named.isConnected = false; f.document.activeElement = replacement
    expect(f.document.querySelectorAll(".topbar a")[0]).toBe(replacement)
   },
   (f: ReturnType<typeof focusGuardFixture>) => { f.owners.splice(f.owners.indexOf(f.named), 1); f.owners.push(f.named) },
  ]) {
   const f = focusGuardFixture(); expect(f.dispatch(f.named)).toBe(".topbar a|0"); change(f)
   expect(() => f.guard.settled()).toThrow(); f.guard.dispose(); expect(f.listenerCount()).toBe(0)
  }
  const f = focusGuardFixture(); f.dispatch(f.named)
  expect(() => f.guard.prepare()).toThrow(/incomplete/u); f.guard.dispose()
 })
 test("event owner, active owner and named key must agree in one atomic read", () => {
  for (const change of [
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(f.named); f.document.activeElement = f.unnamed },
   (f: ReturnType<typeof focusGuardFixture>) => { f.document.activeElement = f.named },
   (f: ReturnType<typeof focusGuardFixture>) => { f.gain(new f.Owner([".topbar a"], {})) },
   (f: ReturnType<typeof focusGuardFixture>) => { f.named.isConnected = false; f.gain(f.named) },
  ]) {
   const f = focusGuardFixture(); f.guard.prepare(); f.keydown(); change(f)
   expect(() => f.guard.read()).toThrow(); f.guard.dispose()
  }
 })
 test("queue overflow and invalid native dispatch cannot recover into a successful epoch", () => {
  const f = focusGuardFixture(); f.guard.prepare(); f.keydown()
  for (let index = 0; index < 9; index++) f.gain(f.unnamed)
  expect(() => f.guard.read()).toThrow(/overflow/u); expect(() => f.guard.read()).toThrow(/overflow/u); f.guard.dispose()
  for (const extra of [{ isTrusted: false }, { key: "Enter" }, { shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
   const invalid = focusGuardFixture(); invalid.guard.prepare(); invalid.keydown(extra); invalid.keydown()
   expect(() => invalid.guard.read()).toThrow(/unexpected native key/u); invalid.guard.dispose()
  }
  const repeated = focusGuardFixture(); repeated.guard.prepare(); repeated.keydown(); repeated.keydown()
  expect(() => repeated.guard.read()).toThrow(/unprepared/u); repeated.guard.dispose()
 })
 test("final validation removes all listeners even on a late gain or silent owner change", () => {
  for (const gained of [false, true]) {
   const f = focusGuardFixture(); f.dispatch(f.named); f.guard.settled()
   if (gained) { f.gain(f.other); f.gain(f.named) } else f.document.activeElement = f.other
   expect(() => f.guard.finish()).toThrow(); expect(f.listenerCount()).toBe(0)
   expect(() => f.guard.read()).toThrow(); f.guard.dispose()
  }
 })
 test("failure and cancellation cleanup preserve the original error without a retry", async () => {
  for (const error of [new Error("measurement failed"), new Error("cancelled")]) {
   const f = focusGuardFixture(); f.dispatch(f.named)
   await expect(withShellCaseCleanup(async () => { throw error }, async () => { f.guard.dispose() })).rejects.toBe(error)
   expect(f.listenerCount()).toBe(0); expect(() => f.guard.prepare()).toThrow(/disposed/u)
  }
 })
})
describe("private worker retains its cap and serializable release callbacks", () => {
 test("real dispatch bundle and compiled DOM admission stay inside their original runtime boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "slopcamera-release-copy-worker-"))
  try {
   const driver = await buildExamplesDriver(directory)
   expect(driver.bytes.byteLength).toBeLessThanOrEqual(workerDriverLimit)
   expect(Buffer.from(driver.bytes).toString()).not.toMatch(/\bBun\s*\.|["'](?:bun|@hraness\/direct)(?:["'/])/u)
   const callbackSource = fileURLToPath(new URL("./site-examples-install.ts", import.meta.url))
   const result = await Bun.build({ entrypoints: [callbackSource], target: "node", env: "disable", format: "esm", minify: examplesWorkerMinify, packages: "external", sourcemap: "none" })
   expect(result.success).toBe(true); expect(result.outputs).toHaveLength(1)
   const output = join(directory, "callback.mjs"); await writeFile(output, new Uint8Array(await result.outputs[0]!.arrayBuffer()), { flag: "wx" })
   const focusResult = await Bun.build({ entrypoints: [fileURLToPath(new URL("./site-release-copy-focus.ts", import.meta.url))], target: "node", env: "disable", format: "esm", minify: examplesWorkerMinify, packages: "external", sourcemap: "none" })
   expect(focusResult.success).toBe(true); expect(focusResult.outputs).toHaveLength(1)
   const focusOutput = join(directory, "focus.mjs"); await writeFile(focusOutput, new Uint8Array(await focusResult.outputs[0]!.arrayBuffer()), { flag: "wx" })
   const compiled = await import(pathToFileURL(output).href)
   for (const current of [false, true]) for (const state of ["idle", "copied", "failed"] as const) {
    const fixture = installDomFixture(current, state, compiled.admitExamplesInstallDom as typeof admitExamplesInstallDom)
    expect(fixture.admit(true)).toEqual({ raw: fixture.root.outerHTML, admitted: fixture.fixture })
   }
   const focusCompiled = await import(pathToFileURL(focusOutput).href)
   const opaque = focusGuardFixture(focusCompiled.installReleaseCopyFocusGuard as typeof installReleaseCopyFocusGuard)
   expect(opaque.dispatch(opaque.video)).toBeNull(); opaque.guard.prepare(); expect(opaque.guard.read()).toBeNull()
   expect(opaque.dispatch(opaque.named)).toBe(".topbar a|0"); expect(opaque.guard.settled()).toBe(".topbar a|0")
   opaque.guard.finish(); expect(opaque.listenerCount()).toBe(0)
   const opaqueExit = focusGuardFixture(focusCompiled.installReleaseCopyFocusGuard as typeof installReleaseCopyFocusGuard)
   opaqueExit.dispatch(opaqueExit.video); opaqueExit.guard.prepare(); opaqueExit.document.activeElement = opaqueExit.body
   expect(() => opaqueExit.guard.read()).toThrow(/outside native Tab dispatch/u); opaqueExit.guard.dispose()
   for (const owner of ["link", "named"] as const) {
    const exit = focusGuardFixture(focusCompiled.installReleaseCopyFocusGuard as typeof installReleaseCopyFocusGuard)
    exit.dispatch(exit.video); exit.guard.prepare(); exit.gain(exit[owner]); exit.keyup()
    const key = owner === "link" ? null : ".topbar a|0"
    expect(exit.guard.read()).toBe(key); if (key !== null) expect(exit.guard.settled()).toBe(key)
    exit.guard.finish(); expect(exit.listenerCount()).toBe(0)
   }
   const focus = focusGuardFixture(focusCompiled.installReleaseCopyFocusGuard as typeof installReleaseCopyFocusGuard)
   expect(focus.dispatch(focus.unnamed)).toBeNull(); expect(focus.dispatch(focus.named)).toBe(".topbar a|0")
   expect(focus.guard.settled()).toBe(".topbar a|0"); focus.guard.prepare(); focus.gain(focus.other); focus.keydown()
   expect(() => focus.guard.read()).toThrow(/outside native Tab dispatch/u); focus.guard.dispose(); expect(focus.listenerCount()).toBe(0)
   expect(await readFile(driver.path)).toEqual(Buffer.from(driver.bytes))
  } finally { await rm(directory, { recursive: true, force: true }) }
 })
})

/** Synthetic full-comparator fixture. Native observations remain mandatory. */
function ordinaryFixture(current: boolean) {
 const original = installFixture(current), installTop = 440, offset = installTop - original.elements[0]!.rect[1]!
 const shift = (rect: readonly number[]) => rect.map((value, axis) => axis === 1 ? value + offset : value)
 const install: ExamplesInstall = { ...original,
  elements: original.elements.map((item, index) => ({ ...item, rect: original.clientRects[index] ? shift(item.rect) : item.rect })),
  title: { ...original.title, rect: shift(original.title.rect) },
  fragments: original.fragments.map(rect => [rect[0], rect[1] + offset, rect[2], rect[3]]) }
 let top = 100
 const flow = flowFixture(current).map(item => {
  if (item.key === "#install[0]") { top = installTop + install.elements[0]!.rect[3]! + 40; return install.elements[0]! }
  const next = { ...item, rect: [item.rect[0]!, top, item.rect[2]!, item.rect[3]!] }; top += item.rect[3]! + 40; return next
 })
 const element = (key: string, y = 0, height = 30): ShellElement => ({ key, rect: [10, y, 300, height], text: key, styles: { height: `${height}px`, color: "black" }, semantics: {} })
 const scroll = current ? 300 : 20
 const footer = { ...element(".hraness-site-footer__brand[0]", 500 + scroll), styles: { height: "30px", color: "black", position: "fixed" } }
 const ask = element(".slopcamera-ask-ai a[0]", top - 100)
 const hero = { copyTop: 100, boundaryLines: 1, boundaryLineHeight: 20, nameComputedInsets: { top: "auto", right: "auto", bottom: "auto", left: "auto" }, elements: [element("hero-copy[0]", 110)] }
 const design = { install, flow, hero, actions: { buttons: [element("hero-action[0]", 180)], textRects: [[10, 180, 250, 20]] } }
 const root = "[data-hraness-appearance-menu]", items = `${root} [role="menuitemradio"]`
 const appearanceKeys = [root, `${root} button`, `${root} .hraness-design-theme-toggle__popover`, `${root} [role="menu"]`, items, `${items} .hraness-appearance-icon`, `${items} .hraness-appearance-icon svg`]
  .flatMap((selector, index) => Array.from({ length: index < 4 ? 1 : 3 }, (_, item) => `${selector}[${item}]`))
 const skip = { ...element(".skip-link[0]"), styles: { position: "fixed" }, geometrySpace: "viewport" as const, scrollY: 0, documentRect: [10, 0, 300, 30] }
 const evidence: ShellEvidence = { direction: "ltr", dom: "raw", recovery: false, obstructions: [], skip,
  elements: [element("body[0]", 0, top), element("#main[0]", 80, top - 80), element(".wordmark[0]", 10), ...flow, ask, footer], focus: [footer], hover: [ask],
  appearance: shellAppearanceSteps.map(step => ({ step: step.name, active: step.active, elements: appearanceKeys.map(key => element(key)) })) }
 const positions = (rows: readonly ShellElement[]) => rows.map(item => ({ key: item.key, scrollY: item.key.startsWith(".hraness-site-footer") ? scroll : 0, fixed: item.key.startsWith(".hraness-site-footer") }))
 return { evidence, design, dom: { dom: "<body>exact non-install DOM</body>", text: { "#install[0]": "" } }, positions: { elements: positions(evidence.elements), focus: positions(evidence.focus), hover: positions(evidence.hover) } }
}
test("the full strict comparator rejects outside DOM, hero/CTA/wordmark paint and unproved flow/fixed shifts", () => {
 const current = ordinaryFixture(true), baseline = ordinaryFixture(false)
 const compare = (value: ReturnType<typeof ordinaryFixture>) => compareReleaseCopyEvidence(value.evidence, baseline.evidence, siteShellCases[0]!, value.design, baseline.design, value.dom, baseline.dom, value.positions, baseline.positions, origins)
 expect(() => compare(current)).not.toThrow()
 for (const change of [
  (side: any) => { side.dom.dom += "<span>unreviewed</span>" },
  (side: any) => { side.design.hero.elements[0].rect[3]++ },
  (side: any) => { side.design.hero.elements[0].styles.color = "red" },
  (side: any) => { side.design.actions.buttons[0].rect[2]++ },
  (side: any) => { side.design.actions.buttons[0].text = "Different CTA" },
  (side: any) => { side.evidence.elements.find((item: ShellElement) => item.key === ".wordmark[0]").styles.color = "red" },
  (side: any) => { side.design.flow[2].rect[1]++ },
  (side: any) => { side.evidence.focus[0].rect[1]++ },
  (side: any) => { side.positions.focus[0].fixed = false },
 ]) expect(() => compare(mutate(current, change) as ReturnType<typeof ordinaryFixture>)).toThrow()
})

test("release hero paint pairs the native URL-free gradients in both flow and shell observations", () => {
 // Original paired /-320-light-dark samples from the retained native failure.
 const firstLayer = "linear-gradient(oklch(0.976064 0.00413431 none / 0.07) 1px, rgba(0, 0, 0, 0) 1px)"
 const secondLayer = "linear-gradient(90deg, oklch(0.976064 0.00413431 none / 0.07) 1px, rgba(0, 0, 0, 0) 1px)"
 const gradient = `${firstLayer}, ${secondLayer}, none`
 const pair = (currentPaint: string, baselinePaint: string) => {
  const withPaint = (current: boolean, paint: string) => {
   const side = ordinaryFixture(current)
   const rows = (items: readonly ShellElement[]) => items.map(item => item.key === ".hraness-marketing-hero[0]"
    ? { ...item, styles: { ...item.styles, "background-image": paint } } : item)
   return { ...side, design: { ...side.design, flow: rows(side.design.flow) },
    evidence: { ...side.evidence, elements: rows(side.evidence.elements) } }
  }
  return { current: withPaint(true, currentPaint), baseline: withPaint(false, baselinePaint) }
 }
 const compare = ({ current, baseline }: ReturnType<typeof pair>, ports = origins) => compareReleaseCopyEvidence(
  current.evidence, baseline.evidence, siteShellCases[0]!, current.design, baseline.design,
  current.dom, baseline.dom, current.positions, baseline.positions, ports)
 for (const paint of [gradient, "none"]) expect(() => compare(pair(paint, paint))).not.toThrow()
 for (const paint of [undefined, null, ""])
  expect(() => compare(pair(paint as unknown as string, paint as unknown as string))).toThrow()
 for (const paint of [gradient.replace("1px", "2px"), gradient.replace("0.07", "0.08"),
  gradient.replace("0.976064", "0.876064"), `${secondLayer}, ${firstLayer}, none`,
  gradient.replace("90deg", "91deg"), gradient.replace(", none", ""), "none",
  background(origins.current), `${gradient}, url(\"https://unreviewed.example/paint.png\")`]) {
  const data = pair(gradient, gradient)
  for (const field of ["flow", "elements"] as const) {
   const changed = structuredClone(data)
   const rows = (items: readonly ShellElement[]) => items.map(item => item.key === ".hraness-marketing-hero[0]"
    ? { ...item, styles: { ...item.styles, "background-image": paint } } : item)
   if (field === "flow") changed.current.design = { ...changed.current.design, flow: rows(changed.current.design.flow) }
   else changed.current.evidence = { ...changed.current.evidence, elements: rows(changed.current.evidence.elements) }
   expect(() => compare(changed)).toThrow()
  }
 }
 // Equal textured strings still require each side's own reviewed texture origin.
 for (const paint of [background(origins.current), 'url("https://unreviewed.example/paint.png")',
  'URL("https://unreviewed.example/paint.png")']) expect(() => compare(pair(paint, paint))).toThrow()
 expect(() => compare(pair(background(origins.current), background(origins.baseline)))).not.toThrow()
 for (const ports of [{ ...origins, current: origins.baseline }, { ...origins, current: "https://127.0.0.1:1234" },
  { ...origins, current: "http://localhost:1234" }, { ...origins, baseline: "http://127.0.0.1:0" },
  { ...origins, current: "http://127.0.0.1:65536" }]) expect(() => compare(pair(gradient, gradient), ports)).toThrow()
})

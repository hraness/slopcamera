import assert from "node:assert/strict"
import type { Page } from "playwright-core"
import { compareShellElements, measure, shellRecord, type ShellElement } from "./site-shell-browser-contract"
import { refinementCopyElementKeys, refinementCopySelectors, refinementInstallCommand } from "./site-refinement-profile"
import { examplesBaselineInstallCommand, examplesIslands } from "./site-examples-profile"
import { releaseCopyScope, releaseCopyBaselineCommand, releaseCopyBaselineNote, releaseCopyBaselineInstall, type SiteAcceptanceScope } from "./site-release-copy-profile"

const near = (actual: number, expected: number, label: string) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= .5, label)
type Rect = readonly [number, number, number, number]
const noteKey = ".install-note[0]", headingKey = ".hraness-marketing-install__heading-group[0]", commandsKey = ".hraness-marketing-install__commands[0]"
const titleSelector = ".hraness-marketing-install__heading"
export function examplesInstallNote(current: boolean, scope: SiteAcceptanceScope = "workflow-examples-v1"): string {
  assert.ok(scope === "workflow-examples-v1" || scope === releaseCopyScope)
  if (!current && scope === releaseCopyScope) return releaseCopyBaselineNote
  const command = current ? refinementInstallCommand : examplesBaselineInstallCommand
  const version = /^bun add --global https:\/\/github\.com\/hraness\/slopcamera\/releases\/download\/v(\d+\.\d+\.\d+)\/hraness-slopcamera-\1\.tgz\nslopcamera skill install --target agents$/u.exec(command)
  assert.ok(version, "One exact canonical archive and matching skill")
  return `${current ? "Tell your agent: “install Slopcamera and its skill.” Or run these two commands. Needs " : ""}Bun 1.3.14 or newer on macOS, Linux, or Windows. ${current ? "Release" : "Verified release"} v${version[1]}.`
}
/** Six fixed text owners, with each complete admitted fragment exactly once. */
export function projectExamplesBaselineCopyElements(elements: readonly ShellElement[], scope: SiteAcceptanceScope = "workflow-examples-v1"): readonly ShellElement[] {
  assert.deepEqual(elements.map(item => item.key), refinementCopyElementKeys)
  const notes = new Set(["#install[0]", noteKey, headingKey])
  const commands = new Set(["#install[0]", commandsKey, "[data-copy-command][0]", "[data-copy-command-value][0]"])
  const replace = (text: string, before: string, after: string) => {
    const parts = text.split(before)
    assert.equal(parts.length, 2, "Complete admitted install fragment must occur exactly once")
    return parts[0]! + after + parts[1]!
  }
  return elements.map(item => ({ ...item, text: commands.has(item.key)
    ? replace(notes.has(item.key) ? replace(item.text, examplesInstallNote(false, scope), examplesInstallNote(true, scope)) : item.text,
      (scope === releaseCopyScope ? releaseCopyBaselineCommand : examplesBaselineInstallCommand).replace(/\s+/gu, " "), refinementInstallCommand.replace(/\s+/gu, " "))
    : notes.has(item.key) ? replace(item.text, examplesInstallNote(false, scope), examplesInstallNote(true, scope)) : item.text }))
}
export interface ExamplesInstall {
  readonly elements: readonly ShellElement[]
  readonly title: ShellElement
  readonly scrollY: number
  readonly clientRects: readonly number[]
  readonly fragments: readonly Rect[]
  readonly rows: readonly [readonly number[], readonly number[]]
  readonly alignSelf: readonly [string, string]
}
/** Restore only the positively checked live copy state in a detached clone.
 * Reordering the button's exact attribute inventory accounts for hidden being
 * removed by JS; no attribute value, extra node or surrounding byte is erased. */
export function admitExamplesInstallDom(root: HTMLElement, input: { fixture: string; copying: boolean }): { raw: string; admitted: string } {
  const raw = root.outerHTML
  const clone = root.cloneNode(true) as HTMLElement
  const template = document.createElement("template"); template.innerHTML = input.fixture
  const expected = template.content.querySelector<HTMLButtonElement>("[data-copy-command-button]")
  const buttons = clone.querySelectorAll<HTMLButtonElement>("[data-copy-command-button]"), statuses = clone.querySelectorAll("[data-copy-command-status]")
  if (!expected || buttons.length !== 1 || statuses.length !== 1) throw Error("Exact copy owners")
  const button = buttons[0]!, status = statuses[0]!, state = button.dataset.copyState ?? "idle"
  if ((!input.copying && state !== "idle") || !["idle", "copied", "failed"].includes(state) || button.hidden || button.className !== button.getAttribute(`data-copy-${state}-class`)) throw Error("Exact active copy class")
  const text = state === "copied" ? "Copied" : "Copy", message = state === "idle" ? "" : state === "copied" ? "Install command copied." : "Could not copy the command. Select it and copy it manually."
  if (button.textContent !== text || status.textContent !== message || button.children.length || status.children.length) throw Error("Exact active copy text")
  button.className = button.getAttribute("data-copy-idle-class")!; button.hidden = true
  button.removeAttribute("data-copy-state"); button.textContent = "Copy"; status.textContent = ""
  const attributes = (element: Element) => [...element.attributes].map(item => [item.name, item.value]).sort(([a], [b]) => a!.localeCompare(b!))
  if (JSON.stringify(attributes(button)) !== JSON.stringify(attributes(expected))) throw Error("Every nonstate button attribute stays exact")
  for (const name of button.getAttributeNames()) button.removeAttribute(name)
  for (const attribute of expected.attributes) button.setAttribute(attribute.name, attribute.value)
  if (clone.outerHTML !== input.fixture) throw Error("Unreviewed install island or copy-state structure")
  return { raw, admitted: clone.outerHTML }
}
/** Observe real text-node fragments, never count an inline anchor's Range box
 * as another line. The detached clone admits only the existing copy states. */
export async function observeExamplesInstall(page: Page, current: boolean, elements?: readonly ShellElement[], scope: SiteAcceptanceScope = "workflow-examples-v1"): Promise<ExamplesInstall> {
  assert.ok(scope === "workflow-examples-v1" || scope === releaseCopyScope)
  const measured = elements ?? await measure(page, refinementCopySelectors)
  const [title] = await measure(page, [titleSelector])
  assert.ok(title)
  const fixture = examplesIslands.find(item => item.selector === "#install")!
  const dom = await page.locator("#install").evaluate(admitExamplesInstallDom, { fixture: current ? fixture.current : scope === releaseCopyScope ? releaseCopyBaselineInstall : fixture.baseline, copying: elements !== undefined })
  const metadata = await page.evaluate(({ selectors, raw }) => {
    const root = document.querySelector<HTMLElement>("#install")
    if (!root || document.querySelectorAll("#install").length !== 1) throw Error("One install owner")
    if (root.outerHTML !== raw) throw Error("Install changed between DOM and line observations")
    const nodes = selectors.flatMap(selector => [...document.querySelectorAll<HTMLElement>(selector)])
    if (nodes.some(node => node !== root && !root.contains(node))) throw Error("Install inventory escaped its owner")
    const note = root.querySelector<HTMLElement>(".install-note")!, heading = root.querySelector<HTMLElement>(".hraness-marketing-install__heading-group")!, commands = root.querySelector<HTMLElement>(".hraness-marketing-install__commands")!
    const fragments: [number, number, number, number][] = []
    const walker = document.createTreeWalker(note, NodeFilter.SHOW_TEXT)
    let textNodes = 0
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue
      if (++textNodes > 3) throw Error("Bounded note text-node inventory")
      const range = document.createRange(); range.selectNodeContents(walker.currentNode)
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
      if (!rects.length || rects.length > 16 || fragments.length + rects.length > 48) throw Error("Bounded nonempty note fragments")
      fragments.push(...rects.map(rect => [rect.x, rect.y + scrollY, rect.width, rect.height] as [number, number, number, number]))
    }
    if (textNodes !== 3) throw Error("Exact note text-node inventory")
    const rows = (node: HTMLElement) => getComputedStyle(node).gridTemplateRows.split(" ").map(value => {
      if (!/^\d+(?:\.\d+)?px$/u.test(value)) throw Error("Finite used grid row")
      return parseFloat(value)
    })
    return { scrollY, fragments, clientRects: nodes.map(node => node.getClientRects().length),
      rows: [rows(root), rows(heading)] as const, alignSelf: [getComputedStyle(heading).alignSelf, getComputedStyle(commands).alignSelf] as const }
  }, { selectors: refinementCopySelectors, raw: dom.raw })
  return { ...metadata, elements: measured, title }
}
function rectangle(value: unknown): asserts value is Rect {
  assert.ok(Array.isArray(value) && value.length === 4 && value.every(number => typeof number === "number" && Number.isFinite(number) && Math.abs(number) <= 1_000_000))
  assert.ok(value[2] > 0 && value[3] > 0)
}
/** Union only fragments on the same line band; overlapping fragments, escaped
 * boxes, uneven baselines and invented line counts cannot justify growth. */
export function examplesInstallLines(fragments: readonly Rect[], note: Rect, lineHeight: number): Rect[] {
  rectangle(note); assert.ok(Number.isFinite(lineHeight) && lineHeight >= 10 && lineHeight <= 100)
  assert.ok(fragments.length >= 3 && fragments.length <= 48)
  const bands: Rect[][] = []
  for (const rect of [...fragments].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    rectangle(rect)
    assert.ok(rect[0] >= note[0] - .5 && rect[0] + rect[2] <= note[0] + note[2] + .5 && rect[1] >= note[1] - .5 && rect[1] + rect[3] <= note[1] + note[3] + .5, "Note fragment escaped its box")
    let band = bands.find(items => Math.abs(items[0]![1] - rect[1]) <= .5)
    if (!band) { band = []; bands.push(band) }
    else near(rect[3], band[0]![3], "Inline fragments retain one font band")
    band.push(rect)
  }
  assert.ok(bands.length >= 1 && bands.length <= 16)
  const lines = bands.map(items => {
    items.sort((a, b) => a[0] - b[0])
    for (let index = 1; index < items.length; index++) assert.ok(items[index]![0] >= items[index - 1]![0] + items[index - 1]![2] - .5, "Overlapping note fragments")
    const first = items[0]!, last = items.at(-1)!
    return [first[0] - note[0], first[1] - note[1], last[0] + last[2] - first[0], first[3]] as Rect
  })
  near(note[3], lines.length * lineHeight, "Natural note height equals measured line count")
  for (const [index, line] of lines.entries()) {
    assert.ok(line[3] <= lineHeight + .5)
    if (index) near(line[1] - lines[index - 1]![1], lineHeight, "Consecutive note line bands")
  }
  return lines
}
export interface ExamplesInstallReceipt {
  readonly note: string; readonly lines: readonly Rect[]; readonly lineHeight: number; readonly mode: "column" | "row"
  readonly noteWidth: number; readonly titleHeight: number; readonly headingGap: number; readonly noteHeight: number
  readonly headingNatural: number; readonly headingHeight: number; readonly commandHeight: number; readonly installHeight: number
  readonly insets: readonly [number, number]; readonly gap: number; readonly commandOffset: number
}
function px(item: ShellElement, property: string): number {
  const value = item.styles[property]
  assert.ok(value !== undefined && /^-?\d+(?:\.\d+)?px$/u.test(value), `${item.key}: finite ${property}`)
  const result = parseFloat(value); assert.ok(Number.isFinite(result)); return result
}
function validate(side: ExamplesInstall, current: boolean, scope: SiteAcceptanceScope): ExamplesInstallReceipt {
  assert.deepEqual(side.elements.map(item => item.key), refinementCopyElementKeys)
  assert.equal(side.clientRects.length, side.elements.length)
  assert.ok(Number.isFinite(side.scrollY) && side.scrollY >= 0 && side.scrollY <= 1_000_000)
  for (const count of side.clientRects) assert.ok(Number.isInteger(count) && count >= 0 && count <= 16)
  const item = (key: string) => side.elements.find(item => item.key === key)!
  const install = item("#install[0]"), note = item(noteKey), heading = item(headingKey), commands = item(commandsKey), title = side.title
  for (const element of [install, note, heading, commands, title]) rectangle(element.rect)
  assert.equal(title.key, `${titleSelector}[0]`); assert.equal(note.text, examplesInstallNote(current, scope))
  assert.equal(install.styles.display, "grid"); assert.equal(heading.styles.display, "grid"); assert.equal(heading.styles["align-content"], "start")
  assert.ok(["normal", "stretch"].includes(install.styles["align-items"]!)); assert.deepEqual(side.alignSelf, ["auto", "auto"])
  for (const element of [note, heading, title, commands]) for (const edge of ["top", "bottom"]) near(px(element, `margin-${edge}`), 0, "Unchanged zero install margins")
  for (const element of [note, heading]) for (const edge of ["top", "bottom", "left", "right"]) {
    near(px(element, `padding-${edge}`), 0, "Note/heading padding remains zero")
    near(px(element, `border-${edge}-width`), 0, "Note/heading borders remain zero")
  }
  const columns = install.styles["grid-template-columns"]!.split(" ").map(value => { assert.match(value, /^\d+(?:\.\d+)?px$/u); return parseFloat(value) })
  assert.ok(columns.length === 1 || columns.length === 2)
  const mode = columns.length === 1 ? "column" : "row", lineHeight = px(note, "line-height"), lines = examplesInstallLines(side.fragments, note.rect as Rect, lineHeight)
  const headingGap = px(heading, "row-gap"), gap = px(install, "row-gap"), columnGap = px(install, "column-gap")
  assert.ok(headingGap >= 0 && gap >= 0 && columnGap >= 0)
  const top = px(install, "padding-top") + px(install, "border-top-width"), bottom = px(install, "padding-bottom") + px(install, "border-bottom-width")
  const left = px(install, "padding-left") + px(install, "border-left-width"), right = px(install, "padding-right") + px(install, "border-right-width")
  near(columns.reduce((sum, value) => sum + value, 0) + (mode === "row" ? columnGap : 0), install.rect[2]! - left - right, "Exact install grid width")
  near(heading.rect[2]!, columns[0]!, "Heading column width"); near(commands.rect[2]!, columns.at(-1)!, "Command column width")
  near(note.rect[2]!, Math.min(heading.rect[2]!, px(note, "max-width")), "Note retains its bounded heading measure")
  if (heading.styles.direction === "rtl") near(note.rect[0]! + note.rect[2]!, heading.rect[0]! + heading.rect[2]!, "RTL note logical start")
  else { assert.equal(heading.styles.direction, "ltr"); near(note.rect[0]!, heading.rect[0]!, "Note logical start") }
  const contentTop = install.rect[1]! + top, headingNatural = title.rect[3]! + headingGap + note.rect[3]!
  const rowHeight = Math.max(headingNatural, commands.rect[3]!)
  if (mode === "row") near(commands.rect[3]!, rowHeight, "Command block retains the stretched row height")
  near(heading.rect[1]!, contentTop, "Heading top"); near(title.rect[1]!, contentTop, "Title top")
  near(note.rect[1]!, contentTop + title.rect[3]! + headingGap, "Note follows title")
  near(heading.rect[3]!, mode === "column" ? headingNatural : rowHeight, "Derived heading grid height")
  near(commands.rect[1]!, contentTop + (mode === "column" ? headingNatural + gap : 0), "Derived command block top")
  near(install.rect[3]!, top + bottom + (mode === "column" ? headingNatural + gap + commands.rect[3]! : rowHeight), "Derived install height")
  const rows = mode === "column" ? [headingNatural, commands.rect[3]!] : [rowHeight]
  assert.equal(side.rows[0].length, rows.length); assert.equal(side.rows[1].length, 2)
  rows.forEach((value, index) => near(side.rows[0][index]!, value, "Derived install grid row"))
  ;[title.rect[3]!, note.rect[3]!].forEach((value, index) => near(side.rows[1][index]!, value, "Derived heading grid row"))
  for (const element of [install, note, heading]) {
    assert.equal(element.styles["box-sizing"], "border-box")
    near(px(element, "height"), element.rect[3]!, "Used height matches positively derived border box")
  }
  return { note: note.text, lines, lineHeight, mode, noteWidth: note.rect[2]!, titleHeight: title.rect[3]!, headingGap, noteHeight: note.rect[3]!,
    headingNatural, headingHeight: heading.rect[3]!, commandHeight: commands.rect[3]!, installHeight: install.rect[3]!, insets: [top, bottom], gap,
    commandOffset: commands.rect[1]! - install.rect[1]! }
}
export function compareExamplesInstall(current: ExamplesInstall, baseline: ExamplesInstall, label: string, scope: SiteAcceptanceScope = "workflow-examples-v1") {
  const receipt = { current: validate(current, true, scope), baseline: validate(baseline, false, scope) }
  assert.equal(receipt.current.mode, receipt.baseline.mode)
  const offset = current.elements[0]!.rect[1]! - baseline.elements[0]!.rect[1]!
  const commandDelta = receipt.current.commandOffset - receipt.baseline.commandOffset
  const previous = projectExamplesBaselineCopyElements(baseline.elements, scope)
  const projected = current.elements.map((item, index) => {
    const old = previous[index]!, visible = current.clientRects[index]! > 0
    assert.equal(visible, baseline.clientRects[index]! > 0, `${item.key}: layout participation`)
    let y = item.rect[1]!
    if (!visible) {
      // Closed-details descendants have a native zero box; document Y includes
      // scrollY even though they do not participate in section flow.
      assert.deepEqual(item.rect, [0, current.scrollY, 0, 0]); assert.deepEqual(old.rect, [0, baseline.scrollY, 0, 0])
      y = old.rect[1]!
    } else y -= offset + (["#install[0]", noteKey, headingKey].includes(item.key) ? 0 : commandDelta)
    const grows = ["#install[0]", noteKey, headingKey].includes(item.key)
    return { ...item, rect: [item.rect[0]!, y, item.rect[2]!, grows ? old.rect[3]! : item.rect[3]!] as Rect,
      styles: grows ? { ...item.styles, height: old.styles.height! } : item.styles }
  })
  compareShellElements(projected, previous, label)
  compareShellElements([{ ...current.title, rect: [current.title.rect[0]!, current.title.rect[1]! - offset, current.title.rect[2]!, current.title.rect[3]!] }], [baseline.title], `${label}: retained title`)
  return receipt
}
/** Closed, finite worker evidence; source validation retains full paint and
 * relative geometry before this compact receipt is emitted. */
export function parseExamplesInstallReceipt(value: unknown, current: boolean, scope: SiteAcceptanceScope = "workflow-examples-v1"): ExamplesInstallReceipt {
  const item = shellRecord(value)
  assert.deepEqual(Object.keys(item).sort(), ["note", "lines", "lineHeight", "mode", "noteWidth", "titleHeight", "headingGap", "noteHeight", "headingNatural", "headingHeight", "commandHeight", "installHeight", "insets", "gap", "commandOffset"].sort())
  assert.equal(item.note, examplesInstallNote(current, scope)); assert.ok(item.mode === "column" || item.mode === "row")
  for (const key of ["lineHeight", "noteWidth", "titleHeight", "headingGap", "noteHeight", "headingNatural", "headingHeight", "commandHeight", "installHeight", "gap", "commandOffset"]) assert.ok(typeof item[key] === "number" && Number.isFinite(item[key]) && Number(item[key]) >= 0 && Number(item[key]) <= 10_000)
  assert.ok(Array.isArray(item.insets) && item.insets.length === 2 && item.insets.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100))
  assert.ok(Array.isArray(item.lines) && item.lines.length >= 1 && item.lines.length <= 16)
  for (const line of item.lines) rectangle(line)
  const result = item as unknown as ExamplesInstallReceipt
  assert.ok(result.lineHeight >= 10 && result.lineHeight <= 100)
  for (const field of [result.noteWidth, result.titleHeight, result.noteHeight, result.headingNatural, result.headingHeight, result.commandHeight, result.installHeight]) assert.ok(field > 0)
  near(result.noteHeight, result.lines.length * result.lineHeight, "Receipt note lines")
  for (const [index, line] of result.lines.entries()) {
    assert.ok(line[0] >= -.5 && line[0] + line[2] <= result.noteWidth + .5 && line[1] >= -.5 && line[1] + line[3] <= result.noteHeight + .5 && line[3] <= result.lineHeight + .5)
    if (index) near(line[1] - result.lines[index - 1]![1], result.lineHeight, "Receipt line spacing")
  }
  near(result.headingNatural, result.titleHeight + result.headingGap + result.noteHeight, "Receipt heading content")
  const height = result.mode === "column" ? result.headingNatural : Math.max(result.headingNatural, result.commandHeight)
  if (result.mode === "row") near(result.commandHeight, height, "Receipt stretched command row")
  near(result.headingHeight, height, "Receipt heading height")
  near(result.installHeight, result.insets[0] + result.insets[1] + (result.mode === "column" ? height + result.gap + result.commandHeight : height), "Receipt install height")
  near(result.commandOffset, result.insets[0] + (result.mode === "column" ? height + result.gap : 0), "Receipt command offset")
  return result
}
export function parseExamplesInstallPair(value: unknown, scope: SiteAcceptanceScope = "workflow-examples-v1") {
  const item = shellRecord(value)
  assert.deepEqual(Object.keys(item).sort(), ["baseline", "current"])
  const current = parseExamplesInstallReceipt(item.current, true, scope), baseline = parseExamplesInstallReceipt(item.baseline, false, scope)
  for (const field of ["mode", "noteWidth", "lineHeight", "titleHeight", "headingGap", "insets", "gap", "commandHeight"] as const)
    assert.deepEqual(current[field], baseline[field], `Paired receipt ${field}`)
  return { current, baseline }
}

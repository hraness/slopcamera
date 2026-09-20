import assert from "node:assert/strict"
import type { Page } from "playwright-core"
import { compareShellElements, measure, type ShellElement } from "./site-shell-browser-contract"
import type { RefinementHero } from "./site-refinement-browser-contract"

const copySelector = ".slopcamera-product-hero > .hraness-marketing-hero__copy"
const actionsSelector = `${copySelector} > .hraness-marketing-hero__actions`
const buttonsSelector = `${actionsSelector} > a`
const labels = (current: boolean) => ["Install Slopcamera", current ? "Explore the examples" : "See example requests"]
export interface ExamplesActions {
  readonly buttons: readonly ShellElement[]
  readonly textRects: readonly (readonly number[])[]
}
const near = (a: number, b: number, label: string) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= .5, `${label}: ${a} != ${b}`)
const px = (item: ShellElement, property: string) => {
  const value = item.styles[property]
  assert.ok(value !== undefined && /^-?(?:\d+\.?\d*|\.\d+)px$/u.test(value), `Finite CTA ${property}`)
  return Number.parseFloat(value)
}
const right = (rect: readonly number[]) => rect[0]! + rect[2]!
const bottom = (rect: readonly number[]) => rect[1]! + rect[3]!

/** Observe real text ranges, without substituting text or changing layout. */
export async function observeExamplesActions(page: Page, current: boolean): Promise<ExamplesActions> {
  const textRects = await page.evaluate(({ selector, labels }) => {
    const rows = document.querySelectorAll(selector)
    if (rows.length !== 1) throw Error("Exact hero actions owner")
    const row = rows[0]!, children = [...row.children]
    if (children.length !== 2 || [...row.childNodes].some(node => node.nodeType !== Node.ELEMENT_NODE && (node.nodeType !== Node.TEXT_NODE || node.textContent?.trim())))
      throw Error("Exactly two hero anchors with only whitespace between them")
    return children.map((node, index) => {
      if (!(node instanceof HTMLAnchorElement) || node.childNodes.length !== 1 || node.firstChild?.nodeType !== Node.TEXT_NODE || node.textContent !== labels[index])
        throw Error("Exact single-text-node hero CTA")
      const expected: Record<string, string> = { class: "hraness-marketing-action", "data-emphasis": index === 0 ? "primary" : "secondary", href: index === 0 ? "#install" : "#examples" }
      if (node.attributes.length !== 3 || [...node.attributes].some(attribute => expected[attribute.name] !== attribute.value)) throw Error("Exact hero CTA attributes")
      for (const pseudo of ["::before", "::after"]) if (!["none", "normal"].includes(getComputedStyle(node, pseudo).content)) throw Error("No generated CTA content")
      const range = document.createRange(); range.selectNodeContents(node)
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
      if (rects.length !== 1) throw Error("One native text fragment per hero CTA")
      const rect = rects[0]!
      return [rect.x, rect.y + scrollY, rect.width, rect.height]
    })
  }, { selector: actionsSelector, labels: labels(current) })
  return { textRects, buttons: await measure(page, [buttonsSelector], ["flex-grow", "flex-shrink", "flex-basis", "align-self"]) }
}

function assertActionsLayout(hero: RefinementHero, actions: ExamplesActions, current: boolean) {
  assert.equal(hero.elements.length, 6)
  const copy = hero.elements[0]!, row = hero.elements[4]!
  assert.equal(copy.key, `${copySelector}[0]`); assert.equal(row.key, `${copySelector} > *[3]`)
  assert.deepEqual(actions.buttons.map(item => item.key), [0, 1].map(index => `${buttonsSelector}[${index}]`))
  assert.equal(actions.textRects.length, 2)
  assert.equal(row.text, labels(current).join(" "))
  assert.equal(copy.styles["justify-items"], "start")
  assert.ok(row.styles.direction === "ltr" || row.styles.direction === "rtl")
  assert.equal(row.styles.direction, copy.styles.direction)
  for (const [property, value] of Object.entries({ display: "flex", position: "static", "box-sizing": "border-box", "flex-wrap": "wrap", "flex-direction": "row", "align-items": "center", "justify-content": "flex-start" }))
    assert.equal(row.styles[property], value, `CTA row ${property}`)
  for (const edge of ["top", "right", "bottom", "left"]) {
    near(px(row, `padding-${edge}`), 0, "CTA row padding"); near(px(row, `border-${edge}-width`), 0, "CTA row border")
    if (edge !== "top") near(px(row, `margin-${edge}`), 0, "CTA row margin")
  }
  const inset = (edge: string) => px(copy, `padding-${edge}`) + px(copy, `border-${edge}-width`)
  const left = copy.rect[0]! + inset("left"), edge = right(copy.rect) - inset("right"), available = edge - left
  assert.ok(available > 0)
  const rtl = row.styles.direction === "rtl", gap = px(row, "column-gap"), rowGap = px(row, "row-gap")
  assert.ok(gap >= 0 && rowGap >= 0)
  for (const [index, button] of actions.buttons.entries()) {
    const text = actions.textRects[index]!
    assert.equal(button.text, labels(current)[index]); assert.equal(button.semantics.href, index === 0 ? "#install" : "#examples")
    assert.equal(button.rect.length, 4); assert.equal(text.length, 4)
    assert.ok([...button.rect, ...text].every(Number.isFinite) && text[2]! > 0 && text[3]! > 0)
    // A flex item blockifies authored inline-flex to computed flex.
    for (const [property, value] of Object.entries({ display: "flex", position: "static", "box-sizing": "border-box", "align-items": "center", "justify-content": "center", "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto", "align-self": "auto", order: "0", direction: row.styles.direction }))
      assert.equal(button.styles[property], value, `CTA button ${property}`)
    for (const side of ["top", "right", "bottom", "left"]) near(px(button, `margin-${side}`), 0, "CTA button margin")
    const start = px(button, "padding-left") + px(button, "border-left-width"), end = px(button, "padding-right") + px(button, "border-right-width")
    near(button.rect[2]!, text[2]! + start + end, "CTA width comes from its literal text and insets")
    near(px(button, "width"), button.rect[2]!, "CTA computed width"); near(px(button, "height"), button.rect[3]!, "CTA computed height")
    near(text[0]!, button.rect[0]! + start, "CTA text starts inside its padding")
    near(right(text), right(button.rect) - end, "CTA text ends inside its padding")
    assert.ok(text[1]! >= button.rect[1]! - .5 && bottom(text) <= bottom(button.rect) + .5, "Contained CTA text height")
    assert.ok(button.rect[0]! >= row.rect[0]! - .5 && right(button.rect) <= right(row.rect) + .5 && button.rect[1]! >= row.rect[1]! - .5 && bottom(button.rect) <= bottom(row.rect) + .5, "Contained CTA button")
  }
  const [primary, secondary] = actions.buttons as readonly [ShellElement, ShellElement]
  const natural = primary.rect[2]! + gap + secondary.rect[2]!, wrapped = natural > available + .5
  // All declared cases are separated from this threshold; an ambiguous edge
  // is a failed proof, never an arbitrary width allowance.
  assert.ok(Math.abs(natural - available) > .5, "Unambiguous CTA wrap boundary")
  near(row.rect[2]!, Math.min(available, natural), "CTA row shrink-to-fit width")
  near(px(row, "width"), row.rect[2]!, "CTA row computed width"); near(px(row, "height"), row.rect[3]!, "CTA row computed height")
  near(rtl ? right(row.rect) : row.rect[0]!, rtl ? edge : left, "CTA row logical start edge")
  const height = wrapped ? primary.rect[3]! + rowGap + secondary.rect[3]! : Math.max(primary.rect[3]!, secondary.rect[3]!)
  near(row.rect[3]!, height, "CTA natural row height")
  for (const [index, button] of actions.buttons.entries()) {
    const inlineOffset = index === 1 && !wrapped ? primary.rect[2]! + gap : 0
    near(rtl ? right(row.rect) - right(button.rect) : button.rect[0]! - row.rect[0]!, inlineOffset, "CTA flex inline placement")
    const blockOffset = wrapped ? index === 0 ? 0 : primary.rect[3]! + rowGap : (height - button.rect[3]!) / 2
    near(button.rect[1]! - row.rect[1]!, blockOffset, "CTA flex block placement")
  }
  assert.ok(row.rect[0]! >= left - .5 && right(row.rect) <= edge + .5 && row.rect[1]! >= copy.rect[1]! - .5 && bottom(row.rect) <= bottom(copy.rect) + .5, "Contained CTA row")
  return { row, copy, wrapped, rtl }
}

/** The approved secondary literal alone may change intrinsic width. Prove the
 * native component on both trees, then project that one derived row dimension.
 * Historical hero comparison and every other measured property stay intact. */
export function projectExamplesHeroActions(hero: RefinementHero, oldHero: RefinementHero, actions: ExamplesActions, oldActions: ExamplesActions): RefinementHero {
  const current = assertActionsLayout(hero, actions, true), baseline = assertActionsLayout(oldHero, oldActions, false)
  assert.equal(current.wrapped, baseline.wrapped, "CTA text must retain the paired wrapping mode")
  assert.equal(current.rtl, baseline.rtl)
  near(current.copy.rect[0]!, baseline.copy.rect[0]!, "Unchanged CTA copy left")
  near(current.copy.rect[2]!, baseline.copy.rect[2]!, "Unchanged CTA copy width")
  const widthDelta = current.row.rect[2]! - baseline.row.rect[2]!, textDelta = actions.textRects[1]![2]! - oldActions.textRects[1]![2]!
  near(widthDelta, current.wrapped ? 0 : textDelta, "Only the secondary literal changes intrinsic row width")
  near(current.row.rect[0]! - baseline.row.rect[0]!, current.rtl ? -widthDelta : 0, "Only the RTL row start follows its width delta")
  const relative = (item: ShellElement, top: number) => ({ ...item, rect: [item.rect[0]!, item.rect[1]! - top, item.rect[2]!, item.rect[3]!] })
  const buttons = actions.buttons.map((button, index) => {
    const old = oldActions.buttons[index]!, text = actions.textRects[index]!, oldText = oldActions.textRects[index]!
    near(text[3]!, oldText[3]!, "Unchanged CTA text height")
    near(text[1]! - button.rect[1]!, oldText[1]! - old.rect[1]!, "Unchanged CTA text vertical alignment")
    if (index === 0) { near(text[2]!, oldText[2]!, "Unchanged primary CTA text width"); return relative(button, hero.copyTop) }
    near(button.rect[2]! - old.rect[2]!, textDelta, "Secondary CTA width delta equals its literal width delta")
    near(button.rect[0]! - old.rect[0]!, current.rtl ? -textDelta : 0, "Secondary CTA preserves its logical start")
    return relative({ ...button, text: old.text, rect: [old.rect[0]!, button.rect[1]!, old.rect[2]!, button.rect[3]!], styles: { ...button.styles, width: old.styles.width! } }, hero.copyTop)
  })
  compareShellElements(buttons, oldActions.buttons.map(button => relative(button, oldHero.copyTop)), "Exact paired CTA buttons after proven secondary text width")
  return { ...hero, elements: hero.elements.map((item, index) => index === 4 ? { ...item, text: baseline.row.text,
    rect: [baseline.row.rect[0]!, item.rect[1]!, baseline.row.rect[2]!, item.rect[3]!], styles: { ...item.styles, width: baseline.row.styles.width! } } : item) }
}

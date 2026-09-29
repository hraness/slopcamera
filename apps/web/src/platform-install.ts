import { detectPlatform, matchDetectedPlatform } from "@hraness/design-kit"

const copyResetMilliseconds = 2_000

type Tab = HTMLButtonElement & { dataset: DOMStringMap & { platform: string } }

function selectContents(element: HTMLElement): void {
  try {
    const selection = element.ownerDocument.defaultView?.getSelection()
    if (selection == null) return
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
  } catch {
    // Selection is a convenience; the failure is still announced.
  }
}

async function writeClipboard(text: string, fallback: HTMLElement): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the selection route below.
  }
  selectContents(fallback)
  try {
    return fallback.ownerDocument.execCommand("copy")
  } catch {
    return false
  }
}

/**
 * Enhances server-rendered design-kit `PlatformInstall` markup on this static
 * site, which ships no React client: tab selection with the ARIA keyboard
 * pattern, the visitor's operating system as the initial tab, and copy
 * buttons that announce the result. Without JavaScript the component's own
 * styles show every platform's command in order.
 */
export function installPlatformInstalls(ownerDocument: Document = document): void {
  for (const root of ownerDocument.querySelectorAll<HTMLElement>("[data-hraness-platform-install]")) {
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"][data-platform]')] as Tab[]
    const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"][data-platform]')]
    const status = root.querySelector<HTMLElement>('[role="status"]')
    const selectedClass = tabs.find(tab => tab.getAttribute("aria-selected") === "true")?.className
    const idleClass = tabs.find(tab => tab.getAttribute("aria-selected") !== "true")?.className
    if (tabs.length === 0 || selectedClass === undefined || idleClass === undefined || status === null) continue

    const ids = tabs.map(tab => tab.dataset.platform)
    let chosen = false
    const select = (id: string, source: "chosen" | "detected", focus: boolean): void => {
      for (const tab of tabs) {
        const isSelected = tab.dataset.platform === id
        tab.setAttribute("aria-selected", String(isSelected))
        tab.tabIndex = isSelected ? 0 : -1
        tab.className = isSelected ? selectedClass : idleClass
        if (isSelected && focus) tab.focus()
      }
      for (const panel of panels) panel.hidden = panel.dataset.platform !== id
      root.dataset.selectedPlatform = id
      root.dataset.selectionSource = source
    }

    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        chosen = true
        select(tab.dataset.platform, "chosen", false)
      })
    }
    root.querySelector<HTMLElement>('[role="tablist"]')?.addEventListener("keydown", event => {
      const index = ids.indexOf(root.dataset.selectedPlatform ?? ids[0] ?? "")
      const next = event.key === "ArrowRight" ? (index + 1) % ids.length
        : event.key === "ArrowLeft" ? (index - 1 + ids.length) % ids.length
          : event.key === "Home" ? 0
            : event.key === "End" ? ids.length - 1
              : undefined
      const target = next === undefined ? undefined : ids[next]
      if (target === undefined) return
      event.preventDefault()
      chosen = true
      select(target, "chosen", true)
    })

    const detected = matchDetectedPlatform(detectPlatform(ownerDocument.defaultView?.navigator), ids)
    if (detected !== null && !chosen) select(detected, "detected", false)

    let resetTimer: number | undefined
    let resetActive: (() => void) | undefined
    for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-copy-state]")) {
      const block = button.closest<HTMLElement>("div[data-copy-state]")
      const pre = block?.querySelector<HTMLElement>("pre")
      // The visible label is the only unclassed span; the classed one is the
      // visually hidden subject.
      const label = button.querySelector<HTMLElement>(":scope > span:not([class])")
      const glyph = button.querySelector<SVGElement>(":scope > svg")
      const subject = pre?.getAttribute("aria-label") ?? "install command"
      if (block == null || pre == null || label === null) continue
      const idleGlyph = glyph?.innerHTML ?? ""
      const setState = (state: "idle" | "copied" | "failed"): void => {
        block.dataset.copyState = state
        button.dataset.copyState = state
        label.textContent = state === "copied" ? "Copied" : state === "failed" ? "Select to copy" : "Copy"
        if (glyph !== null) glyph.innerHTML = state === "copied" ? '<path d="M5 12.5l4.5 4.5L19 7.5"></path>' : idleGlyph
      }
      button.addEventListener("click", async () => {
        if (resetTimer !== undefined) window.clearTimeout(resetTimer)
        resetActive?.()
        resetActive = () => setState("idle")
        const ok = await writeClipboard(pre.textContent ?? "", pre)
        setState(ok ? "copied" : "failed")
        status.textContent = ok
          ? `Copied the ${subject}.`
          : `Copying failed. The ${subject} is selected; copy it with your keyboard.`
        resetTimer = window.setTimeout(() => {
          setState("idle")
          status.textContent = ""
          resetTimer = undefined
          resetActive = undefined
        }, copyResetMilliseconds)
      })
    }
  }
}

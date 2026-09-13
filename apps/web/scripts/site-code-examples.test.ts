import { expect, test } from "bun:test"
import { htmlText as text } from "./html-text.testing"
import { readFile } from "node:fs/promises"
import { diagramSession, interfaceExamples } from "../src/site-code-examples"
import { renderHighlightedCode, siteContentSlots } from "../src/site-content"
import { archiveInstall, publishedRelease } from "../src/published-release"

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("one copy target installs the verified archive before its matching skill", () => {
  const slots = new Map(siteContentSlots("index.html", { themePath: "/assets/theme-0123456789ab.js", analyticsPath: null }).map(([key, value]) => [key, value]))
  const copy = slots.get("{{RELEASE_INSTALL_COMMANDS}}")!
  const value = copy.match(/<code\b[^>]*data-copy-command-value[^>]*>([\s\S]*?)<\/code>/u)?.[1]
  expect(value).toBeDefined()
  expect(text(value!)).toBe(`${archiveInstall.command}\n${archiveInstall.skillCommand}`)
  expect(copy).toContain('data-copy-command-value tabindex="0"')
  expect(copy).toContain('aria-label="Copy install commands"')
  expect(copy).toContain('data-copy-command-button hidden type="button"')
  expect(copy).toContain(archiveInstall.alternateSkillCommand)
  expect(slots.get("{{RELEASE_URL}}")).toBe(publishedRelease.releaseUrl)
  expect(slots.has("{{SOURCE_CHECKOUT_COMMAND}}")).toBe(false)
})

test("the example shows supported local commands and labels the session as illustrative", async () => {
  const home = await read("src/index.html")
  expect(home).toContain('aria-label="Illustrative Slopcamera terminal session"')
  expect(home).toContain("Illustrative session · included starter")
  expect(home).toContain("{{DIAGRAM_SESSION}}")
  expect(home).not.toMatch(/transcript__prompt|transcript__note/u)
  const commands = ["slopcamera diagram init first.diagram.json", "slopcamera diagram check first.diagram.json --strict", "slopcamera diagram render first.diagram.json"]
  expect(commands.map(command => diagramSession.indexOf(command))).toEqual([...commands.map(command => diagramSession.indexOf(command))].sort((a, b) => a - b))
  for (const command of commands) expect(diagramSession).toContain(command)
  for (const suffix of ["tldr", "light.svg", "dark.svg", "light.png", "dark.png"]) expect(diagramSession).toContain(`example-flow.${suffix}`)
  expect(diagramSession).toContain("Valid diagram.")
  expect(interfaceExamples.mcp).toBe("slopcamera mcp --root /absolute/path/to/workspace")
  expect(home).toContain("It does not expose every CLI command.")
})

test("highlighted source preserves arbitrary text and never creates executable markup", () => {
  let state = 0x51a9b
  const pieces = ['echo "value"', "<script>alert(1)</script>", "&quot;", "α 中文 🎥", "\t", "\n", "'", "<img onerror=alert(1)>"]
  for (let sample = 0; sample < 64; sample++) {
    let source = ""
    for (let index = 0; index < 12; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      source += pieces[state % pieces.length]!
    }
    for (const language of ["shell", "typescript"] as const) {
      const html = renderHighlightedCode(source, language)
      expect(text(html)).toBe(source)
      for (const [tag] of html.matchAll(/<[^>]*>/gu)) {
        expect(tag).toMatch(/^(?:<\/(?:code|span)>|<code class="syntax-code language-(?:shell|typescript)" data-language="(?:shell|typescript)">|<span class="[A-Za-z0-9_ -]+">)$/u)
      }
      expect(html).toStartWith(`<code class="syntax-code language-${language}" data-language="${language}">`)
    }
  }
})

test("ordinary code uses the local theme and intact lines in wide interface rows", async () => {
  const [css, recipe, home] = await Promise.all([read("src/styles.css"), read("src/site-install.stylex.ts"), read("src/index.html")])
  const code = css.match(/\.hraness-marketing-page \.hraness-material-code \{([^}]+)\}/u)?.[1] ?? ""
  for (const declaration of ["background: var(--hraness-material-plane)", "color: var(--hraness-material-ink)", "white-space: pre", "overflow: auto", "overflow-wrap: normal", "word-break: normal"]) expect(code).toContain(declaration)
  expect(css).not.toContain("repeat(4, minmax(0, 1fr))")
  expect(css).toContain("grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr)")
  expect(css).toContain("--night: var(--hraness-marketing-terminal-background)")
  expect(recipe).toContain('whiteSpace: "pre", overflowWrap: "normal", wordBreak: "normal"')
  expect(home.match(/class="hraness-material-code" tabindex="0"/gu)).toHaveLength(4)
  const advanced = home.match(/<details class="source-install[^>]*>([\s\S]*?)<\/details>/u)?.[1] ?? ""
  expect(advanced).toContain("{{SOURCE_INSTALL_URL}}")
  expect(home).not.toMatch(/SOURCE_(?:CHECKOUT|ENTER)_COMMAND|After the source build/u)
})

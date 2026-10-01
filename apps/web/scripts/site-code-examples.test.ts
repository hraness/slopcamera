import { expect, test } from "bun:test"
import { htmlText as text } from "./html-text.testing"
import { readFile } from "node:fs/promises"
import { diagramSession, interfaceExamples } from "../src/site-code-examples"
import { platformInstallTargets, renderHighlightedCode, siteContentSlots } from "../src/site-content"
import { archiveInstall, publishedRelease } from "../src/published-release"

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("one universal command installs the verified archive before one skill copy target", () => {
  const slots = new Map(siteContentSlots("index.html", { themePath: "/assets/theme-0123456789ab.js", analyticsPath: null }).map(([key, value]) => [key, value]))
  const copy = slots.get("{{RELEASE_INSTALL_COMMANDS}}")!
  const value = copy.match(/<code\b[^>]*data-copy-command-value[^>]*>([\s\S]*?)<\/code>/u)?.[1]
  expect(value).toBeDefined()
  expect(text(value!)).toBe(archiveInstall.skillCommand)
  expect(copy).toContain('data-copy-command-value tabindex="0"')
  expect(copy).toContain('aria-label="Copy the Agent Skill install command"')
  const platforms = slots.get("{{PLATFORM_INSTALL}}")!
  expect(platforms).toMatch(/class="[^"]*\bslopcamera-universal-install\b/u)
  expect(platforms).toContain('aria-label="Install on macOS, Linux, or Windows"')
  expect(platforms).toContain("Terminal or PowerShell")
  expect(platformInstallTargets).toEqual([
    { id: "all", label: "macOS, Linux, and Windows", command: archiveInstall.command, shell: "Terminal or PowerShell", note: "Requires Bun 1.3.14+" },
  ])
  expect([...platforms.matchAll(/role="tabpanel"/gu)]).toHaveLength(1)
  expect(text(platforms)).toContain(archiveInstall.command)
  expect(platforms).not.toContain("unavailable")
  expect(slots.get("{{PLATFORM_BADGES}}")).toContain("data-hraness-platform-badges")
  expect(copy).toContain('data-copy-command-button hidden type="button"')
  expect(copy).toContain(archiveInstall.alternateSkillCommand)
  expect(slots.get("{{RELEASE_URL}}")).toBe(publishedRelease.releaseUrl)
  expect(slots.has("{{SOURCE_CHECKOUT_COMMAND}}")).toBe(false)
})

test("retained illustrative commands stay valid while the homepage shows actual media", async () => {
  const home = await read("src/index.html")
  expect(home).not.toContain('aria-label="Illustrative Slopcamera terminal session"')
  expect(home).not.toContain("{{DIAGRAM_SESSION}}")
  expect(home).toContain("{{EXAMPLE_HERO}}")
  expect(home).toContain("{{EXAMPLE_GALLERY}}")
  expect(home).not.toMatch(/transcript__prompt|transcript__note/u)
  const commands = ["slopcamera diagram init first.diagram.json", "slopcamera diagram check first.diagram.json --strict", "slopcamera diagram render first.diagram.json"]
  expect(commands.map(command => diagramSession.indexOf(command))).toEqual([...commands.map(command => diagramSession.indexOf(command))].sort((a, b) => a - b))
  for (const command of commands) expect(diagramSession).toContain(command)
  for (const suffix of ["tldr", "light.svg", "dark.svg", "light.png", "dark.png"]) expect(diagramSession).toContain(`example-flow.${suffix}`)
  expect(diagramSession).toContain("Valid diagram.")
  expect(interfaceExamples.mcp).toBe("slopcamera mcp --root /absolute/path/to/workspace")
  expect(home).toContain("MCP does not expose every CLI command.")
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

test("install code keeps the local theme and intact lines while command demos stay in docs", async () => {
  const [css, recipe, home] = await Promise.all([read("src/styles.css"), read("src/site-install.stylex.ts"), read("src/index.html")])
  const code = css.match(/\.hraness-marketing-page \.hraness-material-code \{([^}]+)\}/u)?.[1] ?? ""
  for (const declaration of ["background: var(--hraness-material-plane)", "color: var(--hraness-material-ink)", "white-space: pre", "overflow: auto", "overflow-wrap: normal", "word-break: normal"]) expect(code).toContain(declaration)
  expect(css).not.toContain("repeat(4, minmax(0, 1fr))")
  expect(css).toContain("--night: var(--hraness-marketing-terminal-background)")
  expect(recipe).toContain('whiteSpace: "pre", overflowWrap: "normal", wordBreak: "normal"')
  expect(home).not.toMatch(/\{\{(?:SKILL|CLI|SDK|MCP)_EXAMPLE\}\}/u)
  const advanced = home.match(/<details class="source-install[^>]*>([\s\S]*?)<\/details>/u)?.[1] ?? ""
  expect(advanced).toContain("{{SOURCE_INSTALL_URL}}")
  expect(home).not.toMatch(/SOURCE_(?:CHECKOUT|ENTER)_COMMAND|After the source build/u)
})

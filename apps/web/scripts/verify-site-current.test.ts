import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, type LaunchOptions } from "playwright-core"

import { allowsRequest, assertCurrentAppearance, assertCurrentFocus, assertStylesheetRestoration, assertStudioHomepage, currentDesign, currentBrowserLaunchOptions, currentRoutes, currentRtlCases, currentShellCases, missingRoute, requestedOrigin, resolveBuilt, resolvePinnedChrome } from "./verify-site-current.mjs"

test("selects only physical pinned Chromium and rejects ambient, missing and symlink substitutions", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-current-browser-")))
  try {
    const pinned = join(root, "pinned-chromium")
    const ambient = join(root, "Google Chrome")
    const alias = join(root, "chromium-alias")
    await writeFile(pinned, "fixture", { mode: 0o700 })
    await writeFile(ambient, "fixture", { mode: 0o700 })
    await symlink(ambient, alias)
    expect(resolvePinnedChrome(pinned, {})).toBe(pinned)
    expect(resolvePinnedChrome(pinned, { SLOPCAMERA_CHROME_PATH: pinned, CHROME_PATH: pinned })).toBe(pinned)
    for (const name of ["SLOPCAMERA_CHROME_PATH", "CHROME_PATH"]) {
      for (const candidate of [ambient, alias, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", ""]) {
        expect(() => resolvePinnedChrome(pinned, { [name]: candidate })).toThrow(`${name} must name the exact pinned Chromium executable`)
      }
    }
    expect(() => resolvePinnedChrome(join(root, "missing"), { CHROME_PATH: ambient })).toThrow("Pinned Chromium is missing")
    expect(() => resolvePinnedChrome(alias, {})).toThrow("not a symlink")
    expect(() => resolvePinnedChrome(root, {})).toThrow("regular executable")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("launch merges required features into one switch and preserves actual pinned Playwright defaults", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-current-argv-")))
  try {
    // This executable records argv and exits. It never starts a browser or uses
    // a real browser profile, while exercising the installed Playwright boundary.
    const executablePath = join(root, "argv-recorder")
    const output = join(root, "argv.json")
    await writeFile(executablePath, `#!${process.execPath}\nawait Bun.write(${JSON.stringify(output)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o700 })
    const record = async (options: Pick<LaunchOptions, "args" | "ignoreDefaultArgs" | "headless"> = {}): Promise<string[]> => {
      await rm(output, { force: true })
      await expect(chromium.launch({ executablePath, headless: true, ...options, timeout: 5_000,
        env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root } })).rejects.toThrow()
      return JSON.parse(await readFile(output, "utf8")) as string[]
    }
    const defaults = await record()
    const defaultSwitches = defaults.filter(argument => argument.startsWith("--disable-features="))
    expect(defaultSwitches).toHaveLength(1)
    const options = currentBrowserLaunchOptions()
    expect(options.ignoreDefaultArgs).toEqual(defaultSwitches)
    const actual = await record(options)
    const switches = actual.filter(argument => argument.startsWith("--disable-features="))
    expect(switches).toHaveLength(1)
    const features = switches[0]!.slice("--disable-features=".length).split(",")
    expect(features).toEqual([...new Set([...defaultSwitches[0]!.slice("--disable-features=".length).split(","), "PaintHolding", "MacAppCodeSignClone"])])
    expect(actual).toContain("--mute-audio")
    for (const argument of defaults.filter(argument => !argument.startsWith("--disable-features=") && !argument.startsWith("--user-data-dir="))) {
      expect(actual).toContain(argument)
    }
    expect(() => currentBrowserLaunchOptions("1.63.0")).toThrow("Requalify current-site browser defaults")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("live review has one fixed public origin and preserves the local network boundary", () => {
  expect(requestedOrigin([])).toBeNull()
  expect(requestedOrigin(["--production"])).toBe("https://slopcamera.com")
  expect(requestedOrigin(["--local-origin=http://127.0.0.1:12345"])).toBe("http://127.0.0.1:12345")
  expect(() => requestedOrigin(["--local-origin=https://example.com"])).toThrow()
  expect(() => requestedOrigin(["--production", "--local-origin=http://127.0.0.1:12345"])).toThrow()
  expect(() => requestedOrigin(["--local-origin=http://127.0.0.1:12345", "--local-origin=http://127.0.0.1:12346"])).toThrow()
  expect(() => requestedOrigin(["--origin", "https://example.com"])).toThrow()
  expect(() => requestedOrigin(["--production", "https://example.com"])).toThrow()
  expect(allowsRequest("http://127.0.0.1:1234/assets/site.css", "http://127.0.0.1:1234")).toBe(true)
  expect(allowsRequest("https://us.i.posthog.com/i/v0/e/", "http://127.0.0.1:1234")).toBe(false)
  expect(allowsRequest("https://us.i.posthog.com/i/v0/e/", "https://slopcamera.com")).toBe(true)
  expect(allowsRequest("http://us.i.posthog.com/i/v0/e/", "https://slopcamera.com")).toBe(false)
  expect(allowsRequest("https://us.i.posthog.com.example.com/", "https://slopcamera.com")).toBe(false)
  expect(allowsRequest("https://example.com/font.woff2", "https://slopcamera.com")).toBe(false)
  expect(allowsRequest("https://account.hraness.com/api/consent/region", "https://slopcamera.com")).toBe(true)
  expect(allowsRequest("https://account.hraness.com/api/consent/region", "http://127.0.0.1:1234")).toBe(false)
  expect(allowsRequest("https://account.hraness.com/api/account", "https://slopcamera.com")).toBe(false)
  expect(allowsRequest("https://account.hraness.com.example.com/api/consent/region", "https://slopcamera.com")).toBe(false)
  expect(allowsRequest("http://account.hraness.com/api/consent/region", "https://slopcamera.com")).toBe(false)
})

test("resolves clean URLs the way the static host does and refuses traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-current-"))
  await mkdir(join(root, "docs", "reference"), { recursive: true })
  await mkdir(join(root, "assets"))
  for (const file of ["index.html", "docs/index.html", "docs/reference/sdk.html", "assets/site.css"]) await writeFile(join(root, file), "x")

  expect(resolveBuilt(root, "/")).toBe(join(root, "index.html"))
  expect(resolveBuilt(root, "/docs")).toBe(join(root, "docs", "index.html"))
  expect(resolveBuilt(root, "/docs/reference/sdk")).toBe(join(root, "docs", "reference", "sdk.html"))
  expect(resolveBuilt(root, "/assets/site.css")).toBe(join(root, "assets", "site.css"))
  expect(resolveBuilt(root, "/missing")).toBeNull()
  expect(resolveBuilt(root, "/../../etc/passwd")).toBeNull()
})

test("covers every ordinary page family and a missing route", () => {
  expect(currentRoutes).toEqual(expect.arrayContaining(["/", "/docs", "/blog"]))
  expect(currentRoutes).not.toContain(missingRoute)
})

test("current acceptance retains both RTL shell routes and responsive keyboard journeys", () => {
  expect(currentRtlCases.map(({ path, width, scheme, direction }) => `${path}:${width}:${scheme}:${direction}`).sort()).toEqual([
    "/:390:light:rtl", "/:390:dark:rtl", "/:1440:light:rtl", "/:1440:dark:rtl",
    `${missingRoute}:390:light:rtl`, `${missingRoute}:390:dark:rtl`, `${missingRoute}:1440:light:rtl`, `${missingRoute}:1440:dark:rtl`,
  ].sort())
  expect(currentShellCases).toEqual([
    { width: 390, direction: "ltr" }, { width: 390, direction: "rtl" },
    { width: 1440, direction: "ltr" }, { width: 1440, direction: "rtl" },
  ])
})

function paintedFocus() {
  return { connected: true, active: true, focusVisible: true, visible: true, inViewport: true, ownsHit: true,
    theme: "light", preference: "system", checked: "false", menuOpen: true,
    paint: { outlineWidth: 2, outlineStyle: "solid", outlineColor: [0, 80, 200, 255],
      shadows: [] as Array<{ color: number[], lengths: number[] }>,
      foreground: [20, 20, 20, 255], background: [250, 250, 250, 255], surface: [250, 250, 250, 255] } }
}

test("native focus acceptance rejects replaced, hidden, clipped and obstructed owners", () => {
  const visible = paintedFocus()
  expect(() => assertCurrentFocus(visible, "fixture")).not.toThrow()
  for (const key of ["connected", "active"] as const) {
    expect(() => assertCurrentFocus({ ...visible, [key]: false }, "fixture")).toThrow("native focus left its exact target")
  }
  for (const key of ["focusVisible", "visible"] as const) {
    expect(() => assertCurrentFocus({ ...visible, [key]: false }, "fixture")).toThrow("keyboard focus is not visible")
  }
  for (const key of ["inViewport", "ownsHit"] as const) {
    expect(() => assertCurrentFocus({ ...visible, [key]: false }, "fixture")).toThrow("clipped or obstructed")
  }
})

test("focus-visible matching alone cannot pass without visible paint", () => {
  for (const damage of [
    { outlineWidth: 0 }, { outlineStyle: "none" }, { outlineStyle: "hidden" },
    { outlineColor: [0, 80, 200, 0] }, { outlineColor: [0, 80, 200, 1] },
    { outlineColor: [250, 250, 250, 255] },
  ]) {
    const sample = paintedFocus(); Object.assign(sample.paint, damage)
    expect(() => assertCurrentFocus(sample, "fixture")).toThrow("no visible painted indicator")
  }
  const sample = paintedFocus(); sample.paint.outlineWidth = 0
  const before = { ...structuredClone(sample), active: false }
  expect(() => assertCurrentFocus(sample, "fixture", before)).toThrow("no visible painted indicator")
  sample.paint.shadows = [{ color: [0, 80, 200, 255], lengths: [0, 0, 0, 4] }]
  expect(() => assertCurrentFocus(sample, "fixture", before)).not.toThrow()
  expect(() => assertCurrentFocus(sample, "fixture", { ...structuredClone(sample), active: false })).toThrow("no visible painted indicator")
  sample.paint.shadows[0]!.color[3] = 0
  expect(() => assertCurrentFocus(sample, "fixture", before)).toThrow("no visible painted indicator")
  sample.paint.shadows[0] = { color: [0, 80, 200, 255], lengths: [0, 0, 0, 0] }
  expect(() => assertCurrentFocus(sample, "fixture", before)).toThrow("no visible painted indicator")
})

test("menu focus can use changed paint only from an unfocused owner in the same theme, selection and open menu", () => {
  const sample = paintedFocus(); sample.paint.outlineWidth = 0
  const before = { ...structuredClone(sample), active: false }
  sample.paint.background = [215, 215, 215, 255]
  expect(() => assertCurrentFocus(sample, "fixture", before)).not.toThrow()
  for (const invalid of [
    { active: true }, { connected: false }, { theme: "dark" }, { preference: "light" },
    { checked: "true" }, { menuOpen: false },
  ]) {
    expect(() => assertCurrentFocus(sample, "fixture", { ...before, ...invalid })).toThrow("no visible painted indicator")
  }
  const closed = { ...sample, menuOpen: false }
  expect(() => assertCurrentFocus(closed, "fixture", { ...before, menuOpen: false })).toThrow("no visible painted indicator")
  sample.paint.background = before.paint.background
  sample.paint.foreground = [100, 40, 0, 255]
  expect(() => assertCurrentFocus(sample, "fixture", before)).not.toThrow()
})

test("explicit themes must match proven system paint and survive changes in system preference", () => {
  const dark = { color: "rgb(240, 240, 240)", background: "rgb(20, 20, 20)" }
  const light = { color: "rgb(20, 20, 20)", background: "rgb(240, 240, 240)" }
  const fixture = () => structuredClone({ manualDark: dark, manualDarkAfterSystemChange: dark,
    manualLight: light, manualLightAfterSystemChange: light, manualLightAfterSystemRestore: light,
    systemDark: dark, systemLight: light, restoredDark: dark, restoredLight: light })
  expect(() => assertCurrentAppearance(fixture())).not.toThrow()
  // Dataset/label changes cannot hide CSS which still follows the opposite OS.
  const followsSystem = fixture(); followsSystem.manualDark = light; followsSystem.manualLight = dark
  expect(() => assertCurrentAppearance(followsSystem)).toThrow("Explicit dark must match")
  const wrongLight = fixture(); wrongLight.manualLight = dark
  expect(() => assertCurrentAppearance(wrongLight)).toThrow("Explicit light must match")
  for (const key of ["manualDarkAfterSystemChange", "manualLightAfterSystemChange", "manualLightAfterSystemRestore", "restoredDark", "restoredLight"] as const) {
    const broken = fixture(); broken[key] = { color: "rgb(128, 128, 128)", background: "rgb(128, 128, 128)" }
    expect(() => assertCurrentAppearance(broken)).toThrow()
  }
  const frozen = fixture(); frozen.systemLight = dark
  expect(() => assertCurrentAppearance(frozen)).toThrow("System appearance must change actual paint")
})

test("stylesheet negative control requires actual paint damage and exact restoration", () => {
  const before = [{ selector: "h1", rect: [20, 50, 380, 144], styles: { "font-size": "72px", color: "rgb(240, 240, 240)" } }]
  const disabled = [{ selector: "h1", rect: [8, 50, 380, 48], styles: { "font-size": "32px", color: "rgb(0, 0, 0)" } }]
  expect(() => assertStylesheetRestoration(before, disabled, structuredClone(before))).not.toThrow()
  expect(() => assertStylesheetRestoration(before, structuredClone(before), before)).toThrow("must change observed layout or paint")
  const wrongGeometry = structuredClone(before); wrongGeometry[0]!.rect[0] += 1
  expect(() => assertStylesheetRestoration(before, disabled, wrongGeometry)).toThrow("exact layout and paint")
  const wrongPaint = structuredClone(before); wrongPaint[0]!.styles.color = "rgb(240, 240, 241)"
  expect(() => assertStylesheetRestoration(before, disabled, wrongPaint)).toThrow("exact layout and paint")
})


test("studio acceptance rejects missing revision, cropped media and hidden first-viewport proof", () => {
  const films = ["rain-bottled", "paper-ocean", "laundromat-after-midnight", "square-wave-jazz", "one-shoot-cinematic", "last-tram", "last-tram-revised"].map(id => ({
    id, source: `/assets/examples/${id}-aaaaaaaaaaaa.mp4`, poster: `/assets/examples/${id}-aaaaaaaaaaaa.webp`,
    controls: true, preload: "none", paused: true, loop: false, inWidth: true, fit: "contain", guide: true, sourceLink: true,
  }))
  const fixture = () => ({ hero: { top: 300, width: 1100, height: 618 }, height: 900,
    sections: ["examples", "revision", "start", "install", "design", "questions", "closing"],
    revision: ["last-tram", "last-tram-revised"], films: structuredClone(films) })
  expect(currentDesign).toBe("studio-screening-v1")
  expect(() => assertStudioHomepage(fixture(), 1440)).not.toThrow()
  const revisions = fixture(); revisions.revision.pop()
  expect(() => assertStudioHomepage(revisions, 1440)).toThrow()
  const duplicate = fixture(); duplicate.films[6]!.source = duplicate.films[5]!.source
  expect(() => assertStudioHomepage(duplicate, 1440)).toThrow("own rendered video")
  const cropped = fixture(); cropped.films[0]!.fit = "cover"
  expect(() => assertStudioHomepage(cropped, 1440)).toThrow("overflows or crops")
  const overflow = fixture(); overflow.films[3]!.inWidth = false
  expect(() => assertStudioHomepage(overflow, 1440)).toThrow("overflows or crops")
  const distant = fixture(); distant.hero.top = 821
  expect(() => assertStudioHomepage(distant, 1440)).toThrow("first viewport")
  const automatic = fixture(); automatic.films[0]!.paused = false
  expect(() => assertStudioHomepage(automatic, 1440)).toThrow("quiet native controls")
  const opaque = fixture(); opaque.films[0]!.sourceLink = false
  expect(() => assertStudioHomepage(opaque, 1440)).toThrow("editable source")
})

// Automated current-design review of the built site. Serves `dist/` the way
// Vercel does (clean URLs, 404.html), then drives pinned Chromium through
// every checked route in light and dark at phone and desktop widths, without
// JavaScript, and under forced colors. Run with Node 24 after `bun run build`.
import assert from "node:assert/strict"
import { constants, existsSync, accessSync, realpathSync, statSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { dirname, extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { browserOwner, ownedChromiumLaunchOptions, pinnedBrowserExecutable, pinnedChromiumDefinition, verifyOwnedChromium } from "./owned-browser.mjs"

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(appDirectory, "dist")
const appRequire = createRequire(join(appDirectory, "package.json"))
const { chromium } = appRequire("playwright-core")
const playwrightManifestPath = appRequire.resolve("playwright-core/package.json")
const playwrightManifest = appRequire(playwrightManifestPath)

// Qualified against pinned Playwright 1.62.0. The argv-recorder regression
// observes its actual defaults, so a dependency update must requalify this list.
const qualifiedPlaywrightVersion = "1.62.0"
const defaultDisabledFeatures = [
  "AvoidUnnecessaryBeforeUnloadCheckSync", "BoundaryEventDispatchTracksNodeRemoval",
  "DestroyProfileOnBrowserClose", "DialMediaRouteProvider", "GlobalMediaControls",
  "HttpsUpgrades", "LensOverlay", "MediaRouter", "PaintHolding",
  "ThirdPartyStoragePartitioning", "BlockOriginHeaderModificationOnRedirect",
  "Translate", "AutoDeElevate", "OptimizationHints", "msForceBrowserSignIn",
  "msEdgeUpdateLaunchServicesPreferredVersion",
]
const defaultDisableFeaturesArgument = `--disable-features=${defaultDisabledFeatures.join(",")}`

export const currentDesign = "studio-screening-v1"
export const currentRoutes = ["/", "/docs", "/docs/tutorials/first-diagram", "/docs/tutorials/first-animation", "/docs/how-to/direct-a-film", "/docs/how-to/remix-the-showcase", "/docs/reference/sdk", "/blog", "/blog/introducing-slopcamera"]
export const missingRoute = "/not-a-page"
export const widths = [360, 390, 1440]
export const schemes = ["light", "dark"]
// Preserve the historical RTL route/width/theme inventory as current-design
// observations, without claiming equivalence to those retained baselines.
export const currentRtlCases = ["/", missingRoute].flatMap(path => [390, 1440].flatMap(width =>
  schemes.map(scheme => ({ path, width, scheme, direction: "rtl" }))))
export const currentShellCases = [390, 1440].flatMap(width => ["ltr", "rtl"].map(direction => ({ width, direction })))
export const productionOrigin = "https://slopcamera.com"

export function requestedOrigin(args) {
  const { values } = parseArgs({ args, options: { production: { type: "boolean", default: false } } })
  return values.production ? productionOrigin : null
}

export function allowsRequest(url, origin) {
  const destination = new URL(url).origin
  return destination === origin || (origin === productionOrigin && destination === "https://us.i.posthog.com")
}

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".vtt": "text/vtt", ".json": "application/json" }

/** Resolves a request path to a built file with Vercel's clean-URL rules. */
export function resolveBuilt(root, pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/u, "")
  const candidates = clean === "/" ? ["index.html"] : [clean.slice(1), `${clean.slice(1)}.html`, join(clean.slice(1), "index.html")]
  for (const candidate of candidates) {
    const file = join(root, candidate)
    if (file.startsWith(root) && existsSync(file) && extname(file) !== "") return file
  }
  return null
}

export function resolvePinnedChrome(pinnedExecutable, env = process.env) {
  assert.ok(existsSync(pinnedExecutable),
    "Pinned Chromium is missing; install the revision selected by apps/web's playwright-core. Ambient browsers are not a fallback.")
  const physical = realpathSync(pinnedExecutable)
  assert.equal(physical, resolve(pinnedExecutable), "Pinned Chromium must be a physical executable, not a symlink")
  assert.ok(statSync(physical).isFile(), "Pinned Chromium must be a regular executable")
  accessSync(physical, constants.X_OK)
  // Explicit environment variables may identify the pinned installation, never
  // select another browser. Checking both prevents a stale ambient override from
  // silently surviving a successfully provisioned installation.
  for (const name of ["SLOPCAMERA_CHROME_PATH", "CHROME_PATH"]) {
    const candidate = env[name]
    if (candidate === undefined) continue
    assert.equal(resolve(candidate), physical, `${name} must name the exact pinned Chromium executable`)
    assert.equal(realpathSync(candidate), physical, `${name} must not redirect the pinned Chromium executable`)
  }
  return physical
}

export function currentBrowserLaunchOptions(version = playwrightManifest.version) {
  assert.equal(version, qualifiedPlaywrightVersion, "Requalify current-site browser defaults for the pinned Playwright version")
  return {
    headless: true,
    ignoreDefaultArgs: [defaultDisableFeaturesArgument],
    args: [`--disable-features=${[...new Set([...defaultDisabledFeatures, "PaintHolding", "MacAppCodeSignClone"])].join(",")}`, "--mute-audio"],
  }
}

async function currentBrowserIdentity() {
  assert.equal(playwrightManifest.version, qualifiedPlaywrightVersion)
  const manifest = JSON.parse(await readFile(join(dirname(playwrightManifestPath), "browsers.json"), "utf8"))
  const entries = manifest.browsers.filter(browser => browser.name === "chromium")
  assert.equal(entries.length, 1, "Pinned Playwright must select one Chromium revision")
  assert.match(entries[0].revision, /^\d+$/u)
  assert.match(entries[0].browserVersion, /^\d+\.\d+\.\d+\.\d+$/u)
  return { playwright: playwrightManifest.version, revision: entries[0].revision,
    browserVersion: entries[0].browserVersion, executable: resolvePinnedChrome(chromium.executablePath()) }
}

async function serve() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const file = resolveBuilt(dist, url.pathname)
    const served = file ?? join(dist, "404.html")
    response.writeHead(file === null ? 404 : 200, { "content-type": types[extname(served)] ?? "application/octet-stream" })
    const body = await readFile(served)
    response.end(body)
  })
  await new Promise(done => server.listen(0, "127.0.0.1", done))
  return { server, origin: `http://127.0.0.1:${server.address().port}` }
}

async function inspect(page) {
  return page.evaluate(async () => {
    await document.fonts.ready
    const root = document.documentElement
    const header = document.querySelector("header")
    const main = document.querySelector("main")?.getBoundingClientRect()
    const footer = document.querySelector("#hraness-site-footer")?.getBoundingClientRect()
    const sidebar = document.querySelector('nav[aria-label="Documentation"]')?.getBoundingClientRect()
    const menus = [...document.querySelectorAll("[aria-label^='Appearance:']")]
    const backdrop = document.querySelector("[data-hraness-hero-backdrop]")
    const lastAction = header ? [...header.querySelectorAll("a, button, summary")].at(-1) : null
    const heroMedia = document.querySelector(".slopcamera-product-hero .slopcamera-example__media")?.getBoundingClientRect()
    const studio = document.querySelector(".slopcamera-screening") ? {
      hero: heroMedia ? { top: heroMedia.top, width: heroMedia.width, height: heroMedia.height } : null,
      height: innerHeight,
      sections: [...document.querySelectorAll("main > div > section[id]")].map(element => element.id),
      revision: [...document.querySelectorAll(".slopcamera-revision-pair figure")].map(element => element.getAttribute("data-example-id")),
      films: [...document.querySelectorAll("main figure[data-example-id]")].map(figure => {
        const video = figure.querySelector("video")
        const box = video?.getBoundingClientRect()
        return { id: figure.getAttribute("data-example-id"), source: video?.querySelector("source")?.getAttribute("src"),
          poster: video?.getAttribute("poster"), controls: video?.controls, preload: video?.preload,
          paused: video?.paused, muted: video?.muted, loop: video?.loop,
          guide: [...figure.querySelectorAll("a")].some(link => link.textContent === "Guide" && link.getAttribute("href")?.startsWith("/docs/")),
          sourceLink: [...figure.querySelectorAll("a")].some(link => link.textContent === "Source" && link.getAttribute("href")?.startsWith("https://github.com/hraness/slopcamera/")),
          inWidth: Boolean(box && box.left >= -1 && box.right <= innerWidth + 1),
          fit: video ? getComputedStyle(video).objectFit : null }
      }),
    } : null
    return {
      studio,
      palette: root.dataset.palette ?? null,
      viewport: innerWidth,
      direction: getComputedStyle(root).direction,
      coarsePointer: matchMedia("(pointer: coarse)").matches,
      headerPosition: header ? getComputedStyle(header).position : null,
      targets: header ? [...header.querySelectorAll("a, button, summary")].map(element => {
        const box = element.getBoundingClientRect()
        return { label: element.textContent?.trim() || element.getAttribute("aria-label"), width: box.width, height: box.height }
      }).filter(box => box.width > 0 && box.height > 0) : [],
      footerAfterMain: Boolean(main && footer && footer.top >= main.bottom - 1),
      footerAtDocumentBottom: Boolean(footer && Math.abs(footer.bottom + scrollY - root.scrollHeight) <= 1),
      footerAfterSidebar: !sidebar || sidebar.width === 0 || Boolean(footer && footer.top >= sidebar.bottom - 1),
      footerInViewport: Boolean(footer && footer.left >= -1 && footer.right <= innerWidth + 1),
      overflow: root.scrollWidth - innerWidth,
      h1: document.querySelectorAll("h1").length,
      bodyFont: getComputedStyle(document.body).fontFamily,
      fontErrors: [...document.fonts].filter(face => face.status === "error" && !face.family.includes(" Fallback")).map(face => face.family),
      appearanceMenus: menus.length,
      appearanceLast: menus.length === 1 && lastAction !== null && (menus[0] === lastAction || menus[0].contains(lastAction)),
      backdropHidden: backdrop === null || getComputedStyle(backdrop).display === "none" || Number(getComputedStyle(backdrop).opacity) === 0,
      skipLink: document.querySelector("a[href^='#']")?.textContent?.trim() ?? null,
    }
  })
}

/** Current acceptance is independent of retained historical DOM profiles. */
export function assertStudioHomepage(studio, width) {
  assert.ok(studio?.hero, "Missing studio hero film")
  assert.deepEqual(studio.sections, ["examples", "revision", "start", "install", "design", "questions", "closing"])
  assert.deepEqual(studio.revision, ["last-tram", "last-tram-revised"])
  assert.deepEqual(studio.films.map(film => film.id), ["rain-bottled", "paper-ocean", "laundromat-after-midnight", "square-wave-jazz", "one-shoot-cinematic", "last-tram", "last-tram-revised"])
  assert.equal(new Set(studio.films.map(film => film.source)).size, studio.films.length, "Each film must retain its own rendered video")
  assert.ok(studio.hero.top < studio.height - 80, "Hero media must be visible in the first viewport")
  assert.ok(studio.hero.width >= width * (width < 600 ? .75 : .65), "Hero film is too small to lead the page")
  for (const film of studio.films) {
    assert.ok(film.controls && film.preload === "none" && film.paused && !film.loop, `${film.id}: quiet native controls required`)
    assert.ok(film.inWidth && film.fit === "contain", `${film.id}: video overflows or crops`)
    assert.ok(film.guide && film.sourceLink, `${film.id}: missing guide or editable source`)
    assert.match(film.source, /^\/assets\/examples\/[a-z0-9-]+\.mp4$/u)
    assert.match(film.poster, /^\/assets\/examples\/[a-z0-9-]+\.(?:webp|png)$/u)
  }
}

async function review(browser, origin, path, options) {
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height ?? (options.width === 360 ? 740 : options.width === 390 ? 844 : 900) }, colorScheme: options.scheme ?? "light",
    isMobile: options.width < 600, hasTouch: options.width < 600, serviceWorkers: "block",
    javaScriptEnabled: options.javaScript !== false, forcedColors: options.forcedColors ? "active" : "none", reducedMotion: "reduce" })
  const problems = []
  await context.route("**/*", route => allowsRequest(route.request().url(), origin) ? route.continue() : (problems.push(`external request ${route.request().url()}`), route.abort()))
  const page = await context.newPage()
  // The missing route's own document 404 is expected; any other console error is not.
  page.on("console", message => {
    if (message.type() !== "error") return
    if (path === missingRoute && message.location().url === origin + path && /status of 404/u.test(message.text())) return
    problems.push(`console: ${message.text()}`)
  })
  page.on("pageerror", error => problems.push(`page error: ${error.message}`))
  page.on("requestfailed", request => { if (new URL(request.url()).origin === origin) problems.push(`failed ${request.url()}`) })
  try {
    const response = await page.goto(origin + path, { waitUntil: "networkidle" })
    if (options.direction === "rtl") await page.evaluate(() => { document.documentElement.dir = "rtl" })
    const state = await inspect(page)
    const label = `${path} ${options.width}px${options.height ? ` × ${options.height}px` : ""} ${options.scheme ?? "light"}${options.direction === "rtl" ? " rtl" : ""}${options.javaScript === false ? " no-JS" : ""}${options.forcedColors ? " forced-colors" : ""}`
    const expectStatus = path === missingRoute ? 404 : 200
    const check = (ok, message) => { if (!ok) problems.push(message) }
    check(new URL(page.url()).origin === origin, `unexpected final origin ${new URL(page.url()).origin}`)
    check(response?.status() === expectStatus, `status ${response?.status()} (expected ${expectStatus})`)
    check(state.overflow <= 1, `horizontal overflow ${state.overflow}px`)
    check(state.viewport === options.width, `layout viewport ${state.viewport}px (expected ${options.width})`)
    check(state.direction === (options.direction ?? "ltr"), `direction ${state.direction}`)
    check(state.coarsePointer === (options.width < 600), "pointer does not match the device context")
    check(state.headerPosition === "sticky", `header position ${state.headerPosition}`)
    check(state.targets.length > 0, "missing header targets")
    check(state.targets.every(target => target.width >= 44 && target.height >= 44), `undersized header targets ${JSON.stringify(state.targets.filter(target => target.width < 44 || target.height < 44))}`)
    check(state.footerAfterMain, "network footer does not follow main content")
    check(state.footerAtDocumentBottom, "network footer does not reach the document bottom")
    check(state.footerAfterSidebar, "network footer overlaps the documentation sidebar")
    check(state.footerInViewport, "network footer exceeds the viewport")
    check(state.h1 === 1, `${state.h1} h1 elements`)
    check(state.palette === "catppuccin", `palette ${state.palette}`)
    check(/Nebula Sans/u.test(state.bodyFont), `body font ${state.bodyFont}`)
    check(state.fontErrors.length === 0, `font errors ${state.fontErrors.join(", ")}`)
    check(state.appearanceMenus === 1, `${state.appearanceMenus} appearance menus`)
    check(state.appearanceLast, "appearance menu is not the last header action")
    check(state.skipLink !== null, "missing skip link")
    if (path === "/") {
      try { assertStudioHomepage(state.studio, options.width) }
      catch (error) { problems.push(error.message) }
    }
    if (options.forcedColors) check(state.backdropHidden, "hero backdrop visible under forced colors")
    if (options.artifacts && widths.includes(options.width)) {
      const route = path === "/" ? "home" : path.replace(/[^a-z0-9-]+/giu, "_")
      await page.screenshot({ path: join(options.artifacts, `${options.width}-${options.scheme}-${route}${options.direction === "rtl" ? "-rtl" : ""}.png`), fullPage: true })
    }
    return { label, state, problems }
  } finally {
    await context.close()
  }
}

async function reviewStudioInteractions(browser, origin, policy) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
    colorScheme: "light", reducedMotion: policy === "failure" ? "reduce" : "no-preference" })
  const problems = []
  const requests = []
  let intentionalFailure = null
  await context.route("**/*", route => {
    const url = route.request().url()
    if (!allowsRequest(url, origin)) { problems.push(`external request ${url}`); return route.abort() }
    if (url === intentionalFailure) return route.abort("failed")
    if (/\.mp4(?:\?|$)/u.test(url)) requests.push(url)
    return route.continue()
  })
  if (policy === "save-data") {
    await context.addInitScript(() => Object.defineProperty(navigator, "connection", {
      value: { saveData: true, addEventListener() {}, removeEventListener() {} }, configurable: true,
    }))
  }
  const page = await context.newPage()
  page.on("pageerror", error => problems.push(`page error: ${error.message}`))
  const state = { policy, source: null, clipboard: false, keyboardFocus: false, mediaAdvanced: [], errorMessage: null }
  try {
    await page.goto(origin, { waitUntil: "networkidle" })
    if (policy === "save-data") {
      assert.equal(requests.length, 0, "Save-Data must not request video before a user action")
      assert.ok(await page.locator("video").evaluateAll(videos => videos.every(video => video.paused && !video.loop)))
      state.source = "navigator.connection.saveData=true"
    } else if (policy === "failure") {
      const figure = page.locator('[data-example-id="last-tram-revised"]')
      const video = figure.locator("video")
      intentionalFailure = new URL(await video.locator("source").getAttribute("src"), origin).href
      await video.scrollIntoViewIfNeeded()
      await video.focus()
      await video.press("Space")
      const status = figure.locator("[data-example-status]")
      await status.waitFor({ state: "visible", timeout: 10_000 })
      state.errorMessage = await status.innerText()
      assert.match(state.errorMessage, /Video could not load/u)
      assert.equal(await video.getAttribute("controls"), "")
      assert.equal(new URL(await figure.getByRole("link", { name: "Video", exact: true }).getAttribute("href"), origin).href, intentionalFailure)
    } else {
      const hero = page.locator('.slopcamera-product-hero video')
      await page.waitForFunction(() => {
        const video = document.querySelector(".slopcamera-product-hero video")
        return video && !video.paused && video.muted && video.loop && video.currentTime > .15
      }, null, { timeout: 10_000 })
      // Native transport receives a real keyboard action; focus alone is passive.
      await hero.focus()
      await hero.press("Space")
      await page.waitForFunction(() => {
        const video = document.querySelector(".slopcamera-product-hero video")
        return video?.paused && !video.loop
      }, null, { timeout: 5_000 })
      state.keyboardFocus = await hero.evaluate(video => video === document.activeElement && video.matches(":focus-visible") && getComputedStyle(video).outlineStyle !== "none")
      assert.ok(state.keyboardFocus, "Keyboard media focus must be visible")
      for (const id of ["last-tram", "last-tram-revised"]) {
        const video = page.locator(`[data-example-id="${id}"] video`)
        await video.scrollIntoViewIfNeeded()
        await video.focus()
        await video.press("Space")
        await page.waitForFunction(id => {
          const video = document.querySelector(`[data-example-id="${id}"] video`)
          return video && !video.paused && video.currentTime > .15 && !video.loop && video.readyState >= 2
        }, id, { timeout: 10_000 })
        state.mediaAdvanced.push(await video.evaluate(video => ({ source: video.currentSrc, time: video.currentTime, readyState: video.readyState, error: video.error?.code ?? null })))
        await video.press("Space")
        assert.ok(await video.evaluate(video => video.paused))
      }
      await context.grantPermissions(["clipboard-read", "clipboard-write"])
      const copy = page.getByRole("button", { name: "Copy the Agent Skill install command", exact: true })
      const expected = await page.locator("[data-copy-command-value]").textContent()
      await copy.click()
      const actual = await page.evaluate(() => navigator.clipboard.readText())
      assert.equal(actual, expected)
      assert.match(actual, /^slopcamera skill install/u)
      state.clipboard = true
      assert.ok(await hero.evaluate(video => video.paused && !video.loop), "Manual pause must survive scrolling and other actions")
    }
  } catch (error) {
    problems.push(error.message)
  } finally {
    await context.close()
  }
  return { label: `homepage ${policy} interactions`, state, problems }
}

function compositePaint(color, surface) {
  return color.slice(0, 3).map((channel, index) => channel * color[3] / 255 + surface[index] * (1 - color[3] / 255))
}

function differsVisibly(left, right) {
  return left.some((channel, index) => Math.abs(channel - right[index]) >= 8)
}

function hasFocusPaint(sample, unfocused) {
  const paint = sample.paint
  if (!paint) return false
  const visibleInk = color => color[3] >= 26 && differsVisibly(compositePaint(color, paint.surface), paint.surface)
  const outline = paint.outlineWidth >= 1 && !["none", "hidden"].includes(paint.outlineStyle) && visibleInk(paint.outlineColor)
  if (outline) return true
  if (!unfocused?.connected || unfocused.active || unfocused.theme !== sample.theme || !unfocused.paint) return false
  if (unfocused.preference !== sample.preference || unfocused.checked !== sample.checked
    || unfocused.menuOpen !== sample.menuOpen || sample.menuOpen === false) return false
  const shadow = paint.shadows.some(item => visibleInk(item.color) && item.lengths.some(length => length > 0))
    && JSON.stringify(paint.shadows) !== JSON.stringify(unfocused.paint.shadows)
  const background = compositePaint(paint.background, paint.surface)
  const beforeBackground = compositePaint(unfocused.paint.background, unfocused.paint.surface)
  return shadow || differsVisibly(background, beforeBackground)
    || differsVisibly(compositePaint(paint.foreground, background), compositePaint(unfocused.paint.foreground, beforeBackground))
}

export function assertCurrentFocus(sample, label, unfocused) {
  assert.ok(sample.connected && sample.active, `${label}: native focus left its exact target`)
  assert.ok(sample.focusVisible && sample.visible, `${label}: keyboard focus is not visible`)
  assert.ok(sample.inViewport && sample.ownsHit, `${label}: focused target is clipped or obstructed`)
  assert.ok(hasFocusPaint(sample, unfocused), `${label}: keyboard focus has no visible painted indicator`)
}

export function assertCurrentAppearance(paints) {
  assert.notDeepEqual(paints.systemDark, paints.systemLight, "System appearance must change actual paint")
  assert.deepEqual(paints.manualDark, paints.systemDark, "Explicit dark must match proven system dark paint")
  assert.deepEqual(paints.manualLight, paints.systemLight, "Explicit light must match proven system light paint")
  assert.deepEqual(paints.manualDarkAfterSystemChange, paints.manualDark, "Explicit dark paint must survive a system change")
  assert.deepEqual(paints.manualLightAfterSystemChange, paints.manualLight, "Explicit light paint must survive a system change")
  assert.deepEqual(paints.manualLightAfterSystemRestore, paints.manualLight, "Explicit light paint must survive system restoration")
  assert.deepEqual(paints.restoredDark, paints.systemDark, "System appearance must restore exact dark paint")
  assert.deepEqual(paints.restoredLight, paints.systemLight, "System appearance must restore exact light paint")
}

export function assertStylesheetRestoration(before, disabled, restored) {
  assert.notDeepEqual(disabled, before, "Disabling the owned stylesheet must change observed layout or paint")
  assert.deepEqual(restored, before, "Restoring the exact stylesheet must restore exact layout and paint")
}

async function settleCurrent(page) {
  await page.waitForFunction(() => document.fonts.status === "loaded" && document.getAnimations().every(animation =>
    animation.playState !== "running" || animation.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 2_000 })
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
}

// Serialized into the browser for both genuinely unfocused and focused samples.
// Canvas normalizes computed CSS colors (including color()/oklch()) to RGBA;
// it stays detached and does not alter the page or its styles.
function readCurrentFocus(element) {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element)
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    const menu = element.closest("[data-hraness-appearance-menu]")
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1
    const ink = canvas.getContext("2d", { willReadFrequently: true })
    const rgba = color => {
      ink.clearRect(0, 0, 1, 1); ink.fillStyle = color; ink.fillRect(0, 0, 1, 1)
      return [...ink.getImageData(0, 0, 1, 1).data]
    }
    let surface = [255, 255, 255, 255]
    const ancestors = []
    for (let node = element.parentElement; node; node = node.parentElement) ancestors.push(node)
    for (const node of ancestors.reverse()) {
      const color = rgba(getComputedStyle(node).backgroundColor)
      surface = [...color.slice(0, 3).map((channel, index) => channel * color[3] / 255 + surface[index] * (1 - color[3] / 255)), 255]
    }
    const shadows = style.boxShadow === "none" ? [] : style.boxShadow.split(/,(?![^()]*\))/u).map(value => {
      const color = value.match(/(?:rgba?|color|oklch|oklab|hsla?|lab|lch)\([^)]*\)/u)?.[0]
      return { color: rgba(color ?? "transparent"), lengths: value.replace(color ?? "", "").match(/-?[\d.]+px/gu)?.map(Number.parseFloat) ?? [] }
    })
    return { connected: element.isConnected, active: document.activeElement === element,
      theme: document.documentElement.dataset.theme,
      preference: menu?.getAttribute("data-theme-value") ?? null, checked: element.getAttribute("aria-checked"),
      menuOpen: menu ? menu.querySelector("button")?.getAttribute("aria-expanded") === "true" : null,
      focusVisible: element.matches(":focus-visible"), visible: box.width > 0 && box.height > 0 && style.visibility === "visible" && style.display !== "none" && Number(style.opacity) > 0,
      inViewport: box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1,
      ownsHit: hit === element || element.contains(hit), rect: [box.x, box.y, box.width, box.height],
      paint: { outlineWidth: Number.parseFloat(style.outlineWidth), outlineStyle: style.outlineStyle,
        outlineColor: rgba(style.outlineColor), shadows, foreground: rgba(style.color), background: rgba(style.backgroundColor), surface },
      outline: style.outline, shadow: style.boxShadow, foreground: style.color, background: style.backgroundColor }
}

async function focusEvidence(page, owner, label, unfocused) {
  await settleCurrent(page)
  // The handle binds the node before the keyboard action; a look-alike
  // replacement cannot satisfy active/connected ownership after the action.
  const sample = await owner.evaluate(readCurrentFocus)
  assertCurrentFocus(sample, label, unfocused)
  return { label, ...sample, ...(unfocused ? { unfocused } : {}) }
}

async function currentPaint(page) {
  await settleCurrent(page)
  return page.evaluate(() => {
    const selectors = ["body", ".topbar", ".wordmark", "main", "h1", ".slopcamera-screening-grid", ".slopcamera-example__media", "#hraness-site-footer"]
    const properties = ["display", "position", "color", "background-color", "background-image", "font-family", "font-size", "font-weight", "line-height", "padding", "gap", "grid-template-columns", "border", "border-radius", "object-fit", "direction"]
    return selectors.flatMap(selector => [...document.querySelectorAll(selector)].map((element, index) => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
      return { selector, index, rect: [rect.x, rect.y + scrollY, rect.width, rect.height],
        styles: Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)])) }
    }))
  })
}

async function reviewCurrentShell(browser, origin, scenario) {
  const context = await browser.newContext({ viewport: { width: scenario.width, height: 900 }, colorScheme: "light",
    isMobile: scenario.width < 600, hasTouch: scenario.width < 600, reducedMotion: "reduce", serviceWorkers: "block" })
  const problems = [], state = { ...scenario, focus: [], appearance: [], stylesheets: [], skipTransfer: false }
  await context.route("**/*", route => allowsRequest(route.request().url(), origin) ? route.continue() : (problems.push(`external request ${route.request().url()}`), route.abort()))
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  page.on("pageerror", error => problems.push(`page error: ${error.message}`))
  page.on("console", message => { if (message.type() === "error") problems.push(`console: ${message.text()}`) })
  page.on("requestfailed", request => problems.push(`failed ${request.url()}`))
  const handles = []
  try {
    await page.goto(origin, { waitUntil: "networkidle" })
    await page.evaluate(direction => { document.documentElement.dir = direction }, scenario.direction)
    await page.locator('[data-hraness-appearance-menu][data-ready="true"]').waitFor()
    await settleCurrent(page)
    const skip = await page.locator('a[href="#main"]').elementHandle()
    assert.ok(skip, "Missing skip target")
    handles.push(skip)
    const header = []
    for (const element of await page.locator('.topbar a, .topbar button, .topbar summary').elementHandles()) {
      handles.push(element)
      if (await element.evaluate(node => node.tabIndex >= 0 && !node.disabled && !node.closest("[inert]") && node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible")) header.push(element)
    }
    assert.ok(header.length > 0 && header.length <= 24, "Unexpected header Tab inventory")
    await page.keyboard.press("Tab")
    state.focus.push(await focusEvidence(page, skip, "skip"))
    for (const [index, element] of header.entries()) {
      await page.keyboard.press("Tab")
      state.focus.push(await focusEvidence(page, element, `header-${index}`))
    }
    const trigger = header.at(-1)
    assert.ok(await trigger.evaluate(element => element.matches("[data-hraness-appearance-menu] button")), "Appearance must be the final header Tab target")
    const menu = page.locator("[data-hraness-appearance-menu]")
    const choices = new Map()
    for (const value of ["light", "dark", "system"]) {
      const owner = await menu.locator(`[role="menuitemradio"][data-theme-value="${value}"]`).elementHandle()
      assert.ok(owner, "Missing appearance choice")
      handles.push(owner); choices.set(value, owner)
    }
    const unfocusedChoices = new Map()
    const menuKey = async (key, value) => {
      const owner = choices.get(value)
      await settleCurrent(page)
      const before = await owner.evaluate(readCurrentFocus)
      assert.ok(before.connected && !before.active, "Menu paint baseline must be the exact unfocused target")
      if (before.menuOpen) unfocusedChoices.set(owner, before)
      // ArrowUp reopens onto System. Its baseline is that exact handle's prior
      // open-menu unfocused sample; acceptance also binds theme and selection.
      const unfocused = unfocusedChoices.get(owner)
      await page.keyboard.press(key)
      assert.equal(await trigger.getAttribute("aria-expanded"), "true")
      state.focus.push(await focusEvidence(page, owner, `appearance-${value}`, unfocused))
    }
    const appearance = async (preference, system) => {
      const resolved = preference === "system" ? system : preference
      await page.waitForFunction(({ preference, resolved }) => document.documentElement.dataset.theme === resolved
        && document.querySelector("[data-hraness-appearance-menu]")?.getAttribute("data-theme-value") === preference, { preference, resolved })
      assert.equal(await trigger.getAttribute("aria-expanded"), "false")
      assert.equal(await trigger.getAttribute("aria-label"), `Appearance: ${preference[0].toUpperCase()}${preference.slice(1)}`)
      state.focus.push(await focusEvidence(page, trigger, `appearance-return-${preference}`))
      const paint = await page.evaluate(() => ({ color: getComputedStyle(document.body).color, background: getComputedStyle(document.body).backgroundColor }))
      state.appearance.push({ preference, resolved, paint })
      return paint
    }
    // Real keyboard opening, Home/End, wrapping, Escape and selection. No
    // click/focus shortcut can stand in for the native Tab ownership above.
    await page.keyboard.press("Enter")
    await menuKey("Home", "light")
    await menuKey("ArrowUp", "system")
    await menuKey("ArrowDown", "light")
    await menuKey("End", "system")
    await page.keyboard.press("Escape"); await appearance("system", "light")
    await menuKey("ArrowUp", "system")
    await page.keyboard.press("Home")
    await menuKey("ArrowDown", "dark")
    await page.keyboard.press("Enter"); const manualDark = await appearance("dark", "light")
    await page.emulateMedia({ colorScheme: "dark" }); const manualDarkAfterSystemChange = await appearance("dark", "dark")
    await page.keyboard.press("Space")
    await menuKey("Home", "light")
    await page.keyboard.press("Enter"); const manualLight = await appearance("light", "dark")
    await page.emulateMedia({ colorScheme: "light" }); const manualLightAfterSystemChange = await appearance("light", "light")
    await page.emulateMedia({ colorScheme: "dark" }); const manualLightAfterSystemRestore = await appearance("light", "dark")
    await page.keyboard.press("ArrowDown")
    await menuKey("End", "system")
    await page.keyboard.press("Enter")
    const dark = await appearance("system", "dark")
    await page.emulateMedia({ colorScheme: "light" })
    const light = await appearance("system", "light")
    await page.emulateMedia({ colorScheme: "dark" })
    const restoredDark = await appearance("system", "dark")
    await page.emulateMedia({ colorScheme: "light" })
    const restoredLight = await appearance("system", "light")
    assertCurrentAppearance({ manualDark, manualDarkAfterSystemChange, manualLight, manualLightAfterSystemChange,
      manualLightAfterSystemRestore, systemDark: dark, systemLight: light, restoredDark, restoredLight })
    for (const [index, element] of header.slice(0, -1).reverse().entries()) {
      await page.keyboard.press("Shift+Tab")
      state.focus.push(await focusEvidence(page, element, `header-reverse-${index}`))
    }
    await page.keyboard.press("Shift+Tab")
    state.focus.push(await focusEvidence(page, skip, "skip-return"))
    const main = await page.locator("#main").elementHandle()
    assert.ok(main, "Missing skip destination"); handles.push(main)
    await page.keyboard.press("Enter")
    assert.ok(await main.evaluate(element => element.isConnected && document.activeElement === element), "Skip link did not transfer native focus to main")
    state.skipTransfer = true
    // Each of the two compiled stylesheets receives its own negative control.
    // Keep the actual CSSStyleSheet handle across removal and restoration.
    if (scenario.width === 1440 && scenario.direction === "ltr") {
      await page.evaluate(() => scrollTo(0, 0))
      const sheets = await page.locator('link[rel="stylesheet"]').elementHandles()
      handles.push(...sheets)
      assert.equal(sheets.length, 2, "Current site must retain foundation and final stylesheets")
      for (const link of sheets) {
        const sheet = await link.evaluateHandle(element => {
          if (!element.sheet || element.sheet.disabled) throw new Error("Missing enabled stylesheet")
          return element.sheet
        })
        handles.push(sheet)
        const before = await currentPaint(page)
        let disabled
        try {
          await sheet.evaluate(value => {
            if (![...document.styleSheets].includes(value) || value.disabled) throw new Error("Stylesheet owner changed")
            value.disabled = true
          })
          disabled = await currentPaint(page)
        } finally {
          await sheet.evaluate(value => {
            if (![...document.styleSheets].includes(value) || !value.disabled) throw new Error("Disabled stylesheet owner changed")
            value.disabled = false
          })
        }
        await page.evaluate(() => scrollTo(0, 0))
        const restored = await currentPaint(page)
        assertStylesheetRestoration(before, disabled, restored)
        state.stylesheets.push({ href: await link.getAttribute("href"), changed: true, restored: true, before, disabled, after: restored })
      }
    }
  } catch (error) {
    problems.push(error.message)
  } finally {
    try { await Promise.allSettled(handles.map(handle => handle.dispose())) }
    finally { await context.close() }
  }
  return { label: `homepage ${scenario.width}px ${scenario.direction} shell interactions`, state, problems }
}

export async function main(args = process.argv.slice(2)) {
  const liveOrigin = requestedOrigin(args)
  if (!liveOrigin) assert.ok(existsSync(join(dist, "index.html")), "Build the site before running verify:current")
  const artifacts = process.env.SLOPCAMERA_SITE_ARTIFACTS
  if (artifacts) await mkdir(artifacts, { recursive: true })
  const definition = pinnedChromiumDefinition()
  const runtime = await currentBrowserIdentity()
  assert.equal(runtime.browserVersion, definition.expectedVersion, "Browser manifest differs from the admitted Playwright runtime")
  const executablePath = await pinnedBrowserExecutable(runtime.executable, process.env.SLOPCAMERA_CHROME_PATH)
  if (process.env.CHROME_PATH !== undefined) await pinnedBrowserExecutable(runtime.executable, process.env.CHROME_PATH)
  const launchOptions = ownedChromiumLaunchOptions(executablePath, definition.defaultArgs, currentBrowserLaunchOptions())
  let server = null
  let origin = liveOrigin
  let browser
  let browserIdentity
  let interruption
  const owner = browserOwner({
    launch: async () => {
      if (!liveOrigin) ({ server, origin } = await serve())
      if (interruption) throw interruption
      return chromium.launch({ ...launchOptions, timeout: 15000,
        handleSIGHUP: false, handleSIGINT: false, handleSIGTERM: false })
    },
    close: async active => { await active.close() },
    stopServer: async () => { if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) },
  })
  const handlers = [129, 130, 143].map((code, index) => ({ signal: ["SIGHUP", "SIGINT", "SIGTERM"][index],
    handler: () => {
      interruption ??= new Error(`Browser verification interrupted by ${["SIGHUP", "SIGINT", "SIGTERM"][index]}.`)
      process.exitCode = code
      void owner.stop().catch(error => { console.error(error); process.exitCode = 1 })
    } }))
  for (const { signal, handler } of handlers) process.once(signal, handler)
  const results = []
  try {
    browser = await owner.start()
    browserIdentity = await verifyOwnedChromium(browser, executablePath, definition.expectedVersion)
    console.log(`verify:current browser ${browserIdentity.browserVersion} (${browserIdentity.executable}), Playwright ${runtime.playwright}, revision ${runtime.revision}`)
    for (const path of [...currentRoutes, missingRoute]) for (const width of widths) for (const scheme of schemes) {
      results.push(await review(browser, origin, path, { width, scheme, artifacts }))
    }
    // A tall viewport exposes short-page gaps; the SDK reference also exercises
    // natural long-document growth without changing footer positioning.
    for (const path of ["/docs", "/docs/reference/sdk"]) results.push(await review(browser, origin, path, { width: 1440, height: 2400 }))
    for (const path of ["/", "/docs"]) results.push(await review(browser, origin, path, { width: 390, javaScript: false }))
    for (const path of ["/", "/blog"]) results.push(await review(browser, origin, path, { width: 1440, forcedColors: true }))
    for (const { path, ...options } of currentRtlCases) results.push(await review(browser, origin, path, { ...options, artifacts }))
    for (const policy of ["native-controls", "save-data", "failure"]) results.push(await reviewStudioInteractions(browser, origin, policy))
    for (const scenario of currentShellCases) results.push(await reviewCurrentShell(browser, origin, scenario))
  } finally {
    for (const { signal, handler } of handlers) process.off(signal, handler)
    await owner.stop()
  }
  if (interruption) throw interruption
  if (artifacts) await writeFile(join(artifacts, "browser-evidence.json"), JSON.stringify({ design: currentDesign, origin, runtime, browserIdentity, cleanup: server ? "browser and server closed" : "browser closed", results }, null, 2) + "\n")
  const failed = results.filter(result => result.problems.length > 0)
  for (const result of failed) console.error(`FAIL ${result.label}\n  ${result.problems.join("\n  ")}`)
  console.log(`verify:current ${results.length - failed.length}/${results.length} cases passed`)
  if (failed.length > 0) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()

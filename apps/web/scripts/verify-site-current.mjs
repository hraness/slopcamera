// Automated current-design review of the built site. Serves `dist/` the way
// Vercel does (clean URLs, 404.html), then drives pinned Chromium through
// every checked route in light and dark at phone and desktop widths, without
// JavaScript, and under forced colors. Run with Node 24 after `bun run build`.
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { dirname, extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { ownedChromiumOptions } from "./owned-chromium.mjs"

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(appDirectory, "dist")
const { chromium } = createRequire(join(appDirectory, "package.json"))("playwright-core")

export const currentRoutes = ["/", "/docs", "/docs/tutorials/first-diagram", "/docs/reference/sdk", "/blog", "/blog/introducing-slopcamera"]
export const missingRoute = "/not-a-page"
export const widths = [360, 390, 1440]
export const schemes = ["light", "dark"]
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
  ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".json": "application/json" }

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

function findChrome() {
  for (const candidate of [process.env.SLOPCAMERA_CHROME_PATH, chromium.executablePath()]) {
    if (candidate && existsSync(candidate)) return candidate
  }
  throw new Error("Chrome is required; set SLOPCAMERA_CHROME_PATH")
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
    return {
      palette: root.dataset.palette ?? null,
      viewport: innerWidth,
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
    const state = await inspect(page)
    const label = `${path} ${options.width}px${options.height ? ` × ${options.height}px` : ""} ${options.scheme ?? "light"}${options.javaScript === false ? " no-JS" : ""}${options.forcedColors ? " forced-colors" : ""}`
    const expectStatus = path === missingRoute ? 404 : 200
    const check = (ok, message) => { if (!ok) problems.push(message) }
    check(new URL(page.url()).origin === origin, `unexpected final origin ${new URL(page.url()).origin}`)
    check(response?.status() === expectStatus, `status ${response?.status()} (expected ${expectStatus})`)
    check(state.overflow <= 1, `horizontal overflow ${state.overflow}px`)
    check(state.viewport === options.width, `layout viewport ${state.viewport}px (expected ${options.width})`)
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
    if (options.forcedColors) check(state.backdropHidden, "hero backdrop visible under forced colors")
    if (options.artifacts && widths.includes(options.width)) {
      const route = path === "/" ? "home" : path.replace(/[^a-z0-9-]+/giu, "_")
      await page.screenshot({ path: join(options.artifacts, `${options.width}-${options.scheme}-${route}.png`), fullPage: true })
    }
    return { label, state, problems }
  } finally {
    await context.close()
  }
}

export async function main(args = process.argv.slice(2)) {
  const liveOrigin = requestedOrigin(args)
  if (!liveOrigin) assert.ok(existsSync(join(dist, "index.html")), "Build the site before running verify:current")
  const artifacts = process.env.SLOPCAMERA_SITE_ARTIFACTS
  if (artifacts) await mkdir(artifacts, { recursive: true })
  const { server, origin } = liveOrigin ? { server: null, origin: liveOrigin } : await serve()
  let browser
  const results = []
  try {
    const owned = ownedChromiumOptions(findChrome())
    browser = await chromium.launch({ ...owned, headless: true })
    console.log(`Owned Chromium: ${owned.executablePath} (${browser.version()})`)
    for (const path of [...currentRoutes, missingRoute]) for (const width of widths) for (const scheme of schemes) {
      results.push(await review(browser, origin, path, { width, scheme, artifacts }))
    }
    // A tall viewport exposes short-page gaps; the SDK reference also exercises
    // natural long-document growth without changing footer positioning.
    for (const path of ["/docs", "/docs/reference/sdk"]) results.push(await review(browser, origin, path, { width: 1440, height: 2400 }))
    for (const path of ["/", "/docs"]) results.push(await review(browser, origin, path, { width: 390, javaScript: false }))
    for (const path of ["/", "/blog"]) results.push(await review(browser, origin, path, { width: 1440, forcedColors: true }))
  } finally {
    try { await browser?.close() }
    finally { if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
  }
  if (artifacts) await writeFile(join(artifacts, "browser-evidence.json"), JSON.stringify({ origin, cleanup: server ? "browser and server closed" : "browser closed", results }, null, 2) + "\n")
  const failed = results.filter(result => result.problems.length > 0)
  for (const result of failed) console.error(`FAIL ${result.label}\n  ${result.problems.join("\n  ")}`)
  console.log(`verify:current ${results.length - failed.length}/${results.length} cases passed`)
  if (failed.length > 0) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()

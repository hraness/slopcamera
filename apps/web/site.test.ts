import { homepageMarketingSlots, productMessaging, shellProductNameSlot } from "./src/messaging"
import { paletteColors } from "@hraness/design-kit"
import { assertSiteRecipeResources } from "./scripts/site-css"
import { supportHref } from "./scripts/site-support-profile"
import { observeCompilation } from "./scripts/compilation-observer.testing"
import { assertCompilerResultPath, compilerFixtureBudgets, compilerFixtureHarnessTimeoutMs, collectTerminatedCompilerGroup, compileWebsiteInChild, decodeCompilerFrame, decodeCompilerResult, encodeCompilerFrame, encodeCompilerOptions } from "./scripts/compiler-fixture.testing"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Buffer } from "node:buffer"
import { spawn } from "node:child_process"
import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  HRANESS_HOME_URL,
  hranessSocialLinks,
} from "@hraness/site-footer"

import { posthogBrowserOptions } from "./src/analytics-options"
import {
  ExceptionBudget,
  POSTHOG_SCHEMA_VERSION,
  classifyRoute,
  createBeforeSend,
  ctaClickedEvent,
  ctaProperties,
  customEvents,
  errorFingerprint,
  installCommandCopiedEvent,
  installMethodFor,
  isSensitivePath,
  outboundLinkOpenedEvent,
  outboundProperties,
  pageNotFoundEvent,
  posthogCookielessDistinctId,
  requestedPath,
  sanitizeError,
  sanitizeEvent,
  shouldInitializeAnalytics,
  doNotTrackEnabled,
} from "./src/analytics-contract"
import {
  homeMarkdown,
  llmsTxt,
  notFoundMarkdown,
  robotsTxt,
  sitemapMarkdown,
} from "./src/agent-pages"
import {
  notAcceptableBody,
  preferredRepresentation,
  preferredRepresentationFrom,
} from "./src/negotiate"
import { renderStatusPage } from "./src/status-page-content"
import {
  docsCanonicalUrl,
  docsOrigin,
  docsDocumentForPage,
  docsMarkdownUrl,
  docsPageForRequestPath,
  docPages,
} from "./src/docs-registry"
import { blogDocumentForPost, blogIndexDocument, blogPostPath, blogPosts, indexableBlogPosts } from "./src/blog-registry"
import {
  isDocsPath,
  isHomePath,
  isNegotiableDocumentPath,
  isPreviewPath,
  negotiateSiteRequest,
} from "./src/negotiate-request"
import middleware, { config as middlewareConfig } from "./middleware"
import { buildWebsite, renderAskAiAboutThis, renderSitemapXml } from "./scripts/build"
import { homeSocialImage, renderSocialImage, slopcameraSocialSite, socialImageFitFor, socialImageForDocument, socialImages } from "./src/social-image"
import { htmlText as plainCode } from "./scripts/html-text.testing"
import { siteContentSlots } from "./src/site-content"
import { workflowExamples, workflowExampleAssets, exampleUrl } from "./src/example-registry"
import { homepageExampleName, homepageExamples } from "./src/example-gallery"
import { archiveInstall, parsePublishedRelease, publishedArchiveUrl, publishedRelease, sourceInstall } from "./src/published-release"
import { replaceSiteSlot } from "./src/site-template"
import { statusPageRoutes } from "./src/status-page-content"
const appDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryDirectory = join(appDirectory, "..", "..")
const searchDescription = "SlopCamera lets your coding agent make images, diagrams, animation, 3D scenes, and video from source files it can keep revising."
let builtAssets: Awaited<ReturnType<typeof buildWebsite>>

// Each build compiles the independent ordinary-site and preview graphs. These
// are compilation-fixture budgets, not deadlines for production operations or
// the ordinary content assertions below.
const compilationTimeoutMs = compilerFixtureHarnessTimeoutMs
const repeatedCompilationTimeoutMs = 2 * compilationTimeoutMs
type CompilationFixture = Readonly<{
  build: typeof buildWebsite
  temporaryDirectory: (prefix: string) => Promise<string>
}>
type CompilationOwner = Readonly<{ collect: () => Promise<void> }>
let compilationOwner: CompilationOwner | undefined

function ownedCompilation<T>(
  body: (fixture: CompilationFixture) => Promise<T>,
  compile: typeof buildWebsite = buildWebsite,
): Promise<T> {
  if (compilationOwner !== undefined) throw new Error("Previous compilation fixture has not settled")
  const controller = new AbortController()
  const directories = new Set<string>()
  let collection: Promise<void> | undefined
  // Register ownership before dispatch. Bun timing out a test does not cancel
  // its promise; collection revokes the next build and joins the whole callback
  // before removing any output directory or admitting another fixture.
  const task = Promise.resolve().then(() => {
    controller.signal.throwIfAborted()
    return body({
      build: async options => {
        controller.signal.throwIfAborted()
        // Real builds run in the production CLI's fresh-process lifetime. The
        // injected controlled compilers below remain in-process ownership tests.
        if (compile === buildWebsite && options?.outputDirectory !== undefined && !directories.has(options.outputDirectory)) {
          throw new Error("Compiler output directory is not owned by this fixture")
        }
        const result = compile === buildWebsite
          ? await compileWebsiteInChild(options ?? {}, controller.signal)
          : await observeCompilation(repositoryDirectory, () => compile(options))
        controller.signal.throwIfAborted()
        return result
      },
      temporaryDirectory: async prefix => {
        controller.signal.throwIfAborted()
        const directory = await mkdtemp(join(tmpdir(), prefix))
        directories.add(directory)
        controller.signal.throwIfAborted()
        return directory
      },
    })
  })
  // Observe rejection immediately, including the timeout-to-afterEach window.
  const settled = Promise.allSettled([task])
  const owner: CompilationOwner = {
    collect: () => {
      if (collection !== undefined) return collection
      controller.abort(new Error("Compilation fixture admission has ended"))
      collection = (async () => {
        await settled
        const cleanup = await Promise.allSettled([...directories].map(directory =>
          rm(directory, { force: true, recursive: true })))
        const failures = cleanup.filter(result => result.status === "rejected")
        if (failures.length !== 0) {
          throw new AggregateError(failures.map(result => result.reason), "Compilation fixture cleanup failed")
        }
        if (compilationOwner === owner) compilationOwner = undefined
      })()
      return collection
    },
  }
  compilationOwner = owner
  return task
}

async function collectCompilation(): Promise<void> {
  await compilationOwner?.collect()
}

beforeEach(() => {
  // A timed-out collection never releases ownership, even if Bun proceeds to
  // another case. Do not admit a new writer over its surviving continuation.
  if (compilationOwner !== undefined) throw new Error("Previous compilation fixture has not settled")
})
afterEach(collectCompilation, repeatedCompilationTimeoutMs)
afterAll(collectCompilation, repeatedCompilationTimeoutMs)

async function readAuthoredSource(path: string): Promise<string> {
  return await readFile(join(appDirectory, "src", path), "utf8")
}

async function readSource(path: string): Promise<string> {
  let source = await readAuthoredSource(path)
  const document = path === "doc.html" ? "docs/index.html" : path === "blog.html" ? "blog/index.html" : path
  if (["index.html", "404.html", "doc.html", "blog.html"].includes(path)) {
    const [token, value, count] = shellProductNameSlot(document)
    source = replaceSiteSlot(source, token, value, count)
  }
  if (path === "index.html") {
    for (const [token, value, count] of homepageMarketingSlots) source = replaceSiteSlot(source, token, value, count)
    source = replaceSiteSlot(source, "{{HOME_IMAGE_ALT}}", homeSocialImage.alt, 2)
  }
  return source
}

async function readBuilt(path: string): Promise<string> {
  return await readFile(join(appDirectory, "dist", path), "utf8")
}

function assertAuthoredShellBudget(template: string): number {
  let authored = template
  // Shared package producers (footer, ask-AI, and the design-kit platform
  // install tabs and badges) are bounded by the built-HTML ceiling instead.
  const outsideContent = new Set(["{{APPEARANCE_MENU}}", "{{HRANESS_SITE_FOOTER}}", "{{THEME_ASSET}}", "{{ASK_AI_ABOUT_THIS}}", "{{ANALYTICS_SCRIPT}}", "{{PLATFORM_INSTALL}}", "{{PLATFORM_BADGES}}"])
  for (const [slot, value, count] of siteContentSlots("index.html", { themePath: "/assets/theme-0123456789ab.js", analyticsPath: null })) {
    if (!outsideContent.has(slot)) authored = replaceSiteSlot(authored, slot, value, count)
  }
  // Count the full rendered gallery and highlighted commands. Discount only
  // finite compiler-slot spelling; media markup receives no budget exemption.
  for (const [slot, count] of [
    ["SITE_SKIP_CLASS", 1], ["SITE_HEADER_CLASS", 1], ["SITE_WORDMARK_CLASS", 1], ["SITE_BRAND_MARK_CLASS", 1], ["SITE_ACTIONS_CLASS", 1],
    ["SITE_NAVIGATION_CLASS", 1], ["SITE_HOME_NAVIGATION_LINK_CLASS", 4], ["SITE_NAVIGATION_ACTION_CLASS", 1],
    ["INSTALL_NOTE_CLASS", 1], ["INSTALL_LABEL_CLASS", 2], ["INSTALL_PANEL_NOTE_CLASS", 2], ["INSTALL_PANEL_LINK_CLASS", 2],
    ["INSTALL_COPY_CLASS", 1], ["INSTALL_VALUE_CLASS", 1], ["INSTALL_IDLE_CLASS", 2], ["INSTALL_COPIED_CLASS", 1],
    ["INSTALL_FAILED_CLASS", 1], ["INSTALL_COPY_NOTE_CLASS", 1], ["INSTALL_NOTE_CODE_CLASS", 1], ["INSTALL_STATUS_CLASS", 1], ["INSTALL_FALLBACK_CLASS", 1],
  ] as const) authored = replaceSiteSlot(authored, `{{${slot}}}`, "", count)
  if (/\{\{(?:SITE|INSTALL)_[^{}]*_CLASS\}\}/u.test(authored)) throw new Error("Unexpected site class slot")
  // Portfolio surface markup adds 514 bytes to the 39,495-byte predecessor:
  // 70 bytes of palette/pattern attributes and spacing, plus 444 bytes of
  // shared inert hero markup. Count all of it; keep the full HTML ceiling too.
  // The framework homepage grows the authored shell for the same sections;
  // merged with the numbered technique aisles it measured 46,105 bytes, and
  // the 46,600 ceiling bounds it with the full built-HTML ceiling below.
  const bytes = Buffer.byteLength(authored, "utf8")
  if (bytes >= 46_600) throw new Error(`Authored site shell exceeds its 46,600-byte budget: ${bytes}`)
  return bytes
}

function assertCombinedSiteCssBudget(styles: string, foundation: string): number {
  // Count both captured artifacts in full, including all three package recipes,
  // the required shared foundation, canonical snapshots, and retained product CSS.
  const bytes = Buffer.byteLength(styles, "utf8") + Buffer.byteLength(foundation, "utf8")
  // design-kit 0.35.0 and footer 0.20.5 add shared product and consent controls:
  // measured 516,718 bytes; retain 782 bytes of bounded headroom.
  if (bytes >= 517_500) throw new Error(`Combined site CSS exceeds its 517,500-byte budget: ${bytes}`)
  return bytes
}

/** The installed footer's custom-property tokens for the classes the rendered
 * footer element actually carries, split by pointer context. */
function installedFooterTokens(stylesheet: string, footerClasses: ReadonlySet<string>): Record<"fine" | "coarse", Record<string, string>> {
  const tokens: Record<"fine" | "coarse", Record<string, string>> = { fine: {}, coarse: {} }
  let depth = 0, coarseDepth: number | null = null, selector: string | null = null
  for (const line of stylesheet.split("\n")) {
    const text = line.trim()
    if (text.endsWith("{")) {
      depth += 1
      if (text.startsWith("@media (pointer: coarse)")) coarseDepth = depth
      else if (text.startsWith(".")) selector = text.slice(1, -1).trim().split(".")[0]!
      continue
    }
    if (text === "}") {
      if (coarseDepth === depth) coarseDepth = null
      depth -= 1; selector = null
      continue
    }
    const declaration = /^--_?hraness-site-footer-([\w-]+): (.+);$/u.exec(text)
    if (declaration !== null && selector !== null && footerClasses.has(selector)) tokens[coarseDepth === null ? "fine" : "coarse"][declaration[1]!] = declaration[2]!
  }
  return tokens
}

function assertBuiltHtmlBudget(html: string): number {
  // Exact predecessor 64,732 -> portfolio 65,272: palette attributes +61,
  // compiled header classes +26 and inert hero markup +453. The framework
  // homepage (why-install pillars, five technique groups, comparison rows)
  // measured 68,777; merged with the numbered technique aisles and CTA
  // analytics attributes it measured 71,721. The shared design-kit platform
  // install tabs and Runs-on badges add 30,268 bytes of server markup (each
  // Linux mark path is 5,354 bytes, drawn three times); the page measured
  // 102,334. design-kit v0.29.2 draws each install mark once as a <symbol>
  // (one Linux path fewer): 97,331. The 102,800 ceiling stays; count every byte.
  const bytes = Buffer.byteLength(html, "utf8")
  if (bytes >= 102_800) throw new Error(`Built site HTML exceeds its 102,800-byte budget: ${bytes}`)
  return bytes
}

test("built site HTML budget counts the complete UTF-8 document and rejects its exact ceiling", () => {
  expect(assertBuiltHtmlBudget("x".repeat(102_799))).toBe(102_799)
  expect(() => assertBuiltHtmlBudget("x".repeat(102_800)))
    .toThrow("Built site HTML exceeds its 102,800-byte budget: 102800")
  expect(() => assertBuiltHtmlBudget(`${"x".repeat(102_799)}é`))
    .toThrow("Built site HTML exceeds its 102,800-byte budget: 102801")
})

test("the 404 status page snapshot is byte-exact design-kit v0.21.0 and its routes are real pages", async () => {
  const { createHash } = await import("node:crypto")
  const [vendored, installed, foundationStatus, provenance] = await Promise.all([
    readFile(join(appDirectory, "vendor/status-page/status-page.css")),
    readFile(fileURLToPath(import.meta.resolve("@hraness/design-kit-status/status-page.css"))),
    readFile(fileURLToPath(import.meta.resolve("@hraness/design-kit/status-page.css"))),
    readFile(join(appDirectory, "vendor/status-page/provenance.json"), "utf8").then(text => JSON.parse(text) as {
      source: { commit: string; release: string }
      files: Record<string, { sha256: string }>
    }),
  ])
  expect(vendored.equals(installed)).toBe(true)
  expect(vendored.equals(foundationStatus)).toBe(true)
  expect(provenance.source).toMatchObject({ commit: "4a5e0b697ed9e4169c4759feccbe4a1305b4d236", release: "v0.21.0" })
  expect(createHash("sha256").update(vendored).digest("hex")).toBe(provenance.files["status-page.css"]!.sha256)
  expect(vendored.toString("utf8")).not.toContain("url(")
  const routes = statusPageRoutes()
  const known = new Set(["/", ...docPages.map(page => docsCanonicalUrl(page).slice(docsOrigin.length)), "/blog",
    ...indexableBlogPosts.map(post => blogPostPath(post))])
  expect(routes.map(route => route.href).sort()).toEqual([...known].sort())
  for (const route of routes) expect(route.label.length).toBeGreaterThan(0)
  for (const route of routes) expect(route.label.length).toBeLessThanOrEqual(48)
})

test("combined site CSS budget counts both complete UTF-8 artifacts and rejects its exact ceiling", () => {
  expect(assertCombinedSiteCssBudget("x".repeat(317_499), "x".repeat(200_000))).toBe(517_499)
  expect(() => assertCombinedSiteCssBudget("x".repeat(317_500), "x".repeat(200_000)))
    .toThrow("Combined site CSS exceeds its 517,500-byte budget: 517500")
  expect(() => assertCombinedSiteCssBudget("x".repeat(317_499), `${"x".repeat(200_000)}é`))
    .toThrow("Combined site CSS exceeds its 517,500-byte budget: 517501")
  expect(() => assertCombinedSiteCssBudget("x".repeat(517_500), ""))
    .toThrow("Combined site CSS exceeds its 517,500-byte budget: 517500")
  expect(() => assertCombinedSiteCssBudget("", "x".repeat(517_500)))
    .toThrow("Combined site CSS exceeds its 517,500-byte budget: 517500")
})

function assertThemeBundleBudget(script: string): number {
  // Build-time palette constants avoid 6,263 bytes of unused palette-table data.
  // Exact predecessor 28,561 + shared hero controller 2,906 = 31,467 bytes;
  // The shared platform-install enhancer (tabs, OS detection, copy) measured
  // 28,578 -> 32,491 bytes (+3,913); the 32,800 ceiling leaves 309 bytes and
  // includes all runtime code.
  const bytes = Buffer.byteLength(script, "utf8")
  if (bytes >= 32_800) throw new Error(`Theme bundle exceeds its 32,800-byte budget: ${bytes}`)
  return bytes
}

test("theme bundle budget counts complete UTF-8 bytes and rejects its exact ceiling", () => {
  expect(assertThemeBundleBudget("x".repeat(32_799))).toBe(32_799)
  expect(() => assertThemeBundleBudget("x".repeat(32_800)))
    .toThrow("Theme bundle exceeds its 32,800-byte budget: 32800")
  expect(() => assertThemeBundleBudget(`${"x".repeat(32_799)}é`))
    .toThrow("Theme bundle exceeds its 32,800-byte budget: 32801")
})

test("authored shell budget rejects content growth and unapproved slot discounts without compilation", async () => {
  const template = await readAuthoredSource("index.html")
  const bytes = assertAuthoredShellBudget(template)
  const grow = (suffix: string) => template.replace("</main>", `${suffix}</main>`)
  expect(bytes).toBeLessThan(46_600)
  expect(assertAuthoredShellBudget(grow("x".repeat(46_599 - bytes)))).toBe(46_599)
  expect(() => assertAuthoredShellBudget(grow("x".repeat(46_600 - bytes))))
    .toThrow("Authored site shell exceeds its 46,600-byte budget: 46600")
  expect(() => assertAuthoredShellBudget(grow(`${"x".repeat(46_599 - bytes)}é`)))
    .toThrow("Authored site shell exceeds its 46,600-byte budget: 46601")
  expect(() => assertAuthoredShellBudget(`${template}{{SITE_UNKNOWN_CLASS}}`))
    .toThrow("Unexpected site class slot")
  expect(() => assertAuthoredShellBudget(`${template}{{INSTALL_UNKNOWN_CLASS}}`))
    .toThrow("Unexpected site class slot")
  for (const [slot, count] of [["INSTALL_NOTE_CLASS", 1], ["INSTALL_PANEL_NOTE_CLASS", 2]] as const) {
    expect(() => assertAuthoredShellBudget(`${template}{{${slot}}}`))
      .toThrow(`Site document must contain ${count} instance(s) of {{${slot}}}`)
    expect(() => assertAuthoredShellBudget(template.replace(`{{${slot}}}`, "")))
      .toThrow(`Site document must contain ${count} instance(s) of {{${slot}}}`)
  }
  expect(() => assertAuthoredShellBudget(`${template}{{SITE_SKIP_CLASS}}`))
    .toThrow("Site document must contain 1 instance(s) of {{SITE_SKIP_CLASS}}")
  for (const slot of ["RELEASE_URL", "RELEASE_VERSION", "RELEASE_INSTALL_COMMANDS", "SOURCE_INSTALL_URL", "EXAMPLE_HERO", "EXAMPLE_GALLERY", "EXAMPLE_REVISION"]) {
    expect(() => assertAuthoredShellBudget(`${template}{{${slot}}}`))
      .toThrow(`Site document must contain 1 instance(s) of {{${slot}}}`)
  }
})

test("ships agent instructions for video editing and Gateway media generation", async () => {
  const [skill, video, gateway] = await Promise.all([
    readFile(join(repositoryDirectory, "skills/slopcamera/SKILL.md"), "utf8"),
    readFile(join(repositoryDirectory, "skills/slopcamera/references/video-projects.md"), "utf8"),
    readFile(join(repositoryDirectory, "skills/slopcamera/references/gateway-media.md"), "utf8"),
  ])

  expect(skill).toContain("# Create visual media with SlopCamera")
  expect(skill).toContain("[Video projects](references/video-projects.md)")
  expect(skill).toContain("[Gateway media](references/gateway-media.md)")
  // Slopcamera edits existing recordings; the Skill must not offer to record.
  expect(skill).not.toMatch(/^\| Record\b/mu)
  expect(skill).toContain("existing recordings and footage | [Video projects](references/video-projects.md)")

  for (const capability of [
    "talking-head-cleanup",
    "polished-screen-demo",
    "social-variants",
    "creative-iteration",
    "Preview and final use the same timeline and composition",
  ]) {
    expect(video).toContain(capability)
  }

  for (const command of [
    "slopcamera ai models list --type image",
    "slopcamera ai video generate",
    "slopcamera ai speech generate",
    "slopcamera ai transcribe",
    "--allow-cloud-upload",
    "--allow-cloud-audio-upload",
  ]) {
    expect(gateway).toContain(command)
  }
})

test("published release validates exact fields and safe stable versions before rendering", () => {
  for (const version of ["0.0.0", "3.2.1", "9007199254740991.0.0"]) {
    const value = { version, releaseUrl: `https://github.com/hraness/slopcamera/releases/tag/v${version}` }
    expect(parsePublishedRelease(value)).toEqual(value)
  }
  for (const value of [null, [], "3.2.0", {}, { version: "3.2.0" },
    { ...publishedRelease, verificationRun: "invented" },
    { ...publishedRelease, [Symbol("extra")]: true },
  ]) expect(() => parsePublishedRelease(value)).toThrow()
  for (const version of ["03.2.0", "3.2", "v3.2.0", "3.2.0-beta.1", "3.2.0+build", "3.2.0\n",
    "3.2.0 ", " 3.2.0", "3.2.-1", "3.2.0<script>", "9007199254740992.0.0", "1".repeat(51),
  ]) {
    expect(() => parsePublishedRelease({
      version, releaseUrl: `https://github.com/hraness/slopcamera/releases/tag/v${version}`,
    })).toThrow("canonical stable SemVer")
  }
  for (const releaseUrl of [
    "https://github.com/hraness/slopcamera/releases/tag/v3.2.1",
    `${publishedRelease.releaseUrl}?source=main`, `${publishedRelease.releaseUrl}#proof`,
    `${publishedRelease.releaseUrl}/`, "http://github.com/hraness/atet/releases/tag/v3.2.0",
    "https://github.com.evil.test/hraness/slopcamera/releases/tag/v3.2.0",
    "https://github.com/another/slopcamera/releases/tag/v3.2.0", 42, null,
  ]) expect(() => parsePublishedRelease({ version: "3.2.0", releaseUrl })).toThrow("exact Slopcamera tag")
})

test("compiler fixture TERM collection requires fresh absence after transient permission uncertainty", async () => {
  let now = 0, closed = false, calls = 0
  const denied = () => Object.assign(new Error("denied"), { code: "EPERM" })
  const pause = async (milliseconds: number) => { now += milliseconds; if (now >= 50) closed = true }
  expect(await collectTerminatedCompilerGroup(() => {
    calls++
    if (calls === 1) throw denied()
    return false
  }, () => closed, 100, () => now, pause)).toBe(true)
  expect(now).toBe(50)
  expect(calls).toBe(3)
  now = 0
  await expect(collectTerminatedCompilerGroup(() => { throw denied() }, () => true, 100,
    () => now, async milliseconds => { now += milliseconds })).rejects.toThrow("permission remained uncertain")
  expect(now).toBe(100)
  now = 0
  let uncertainCalls = 0
  await expect(collectTerminatedCompilerGroup(() => {
    if (uncertainCalls++ === 0) throw denied()
    return true
  }, () => true, 100, () => now, async milliseconds => { now += milliseconds }))
    .rejects.toThrow("permission remained uncertain")
  expect(now).toBe(100)
  now = 0
  expect(await collectTerminatedCompilerGroup(() => true, () => false, 100,
    () => now, async milliseconds => { now += milliseconds })).toBe(false)
  expect(now).toBe(100)
  await expect(collectTerminatedCompilerGroup(() => { throw new Error("unexpected") }, () => false, 100))
    .rejects.toThrow("unexpected")
})

test("compiler fixture reserves bounded collection after its unchanged work deadline", () => {
  expect(compilerFixtureBudgets.workMs).toBe(60_000)
  // A compile that consumes its whole work budget still fails; only ownership
  // collection may occupy this remaining interval before the harness cuts off.
  const collection = compilerFixtureBudgets.exitedGroupMs + compilerFixtureBudgets.termMs
    + compilerFixtureBudgets.killMs + compilerFixtureBudgets.pipesMs
  expect(collection).toBe(6500)
  expect(compilerFixtureHarnessTimeoutMs - compilerFixtureBudgets.workMs).toBe(collection)
  expect(compilationTimeoutMs).toBe(compilerFixtureHarnessTimeoutMs)
  expect(repeatedCompilationTimeoutMs).toBe(2 * compilerFixtureHarnessTimeoutMs)
})

test("compiler fixture result file isolates ordinary and ANSI logs", async () => {
  const resultDirectory = await mkdtemp(join(tmpdir(), "slopcamera-web-result-"))
  try {
    const resultPath = assertCompilerResultPath(join(resultDirectory, "result.frame"))
    const frame = encodeCompilerFrame({ ok: true })
    // The child logs plain and ANSI text on stdout and delivers the frame only through the
    // exclusive result file, exactly as the compiler child does.
    const child = spawn(process.execPath, ["-e", `const {writeSync,writeFileSync}=require("node:fs"); console.log("ordinary compiler log"); writeSync(1,"\\x1b[32mcolored compiler log\\x1b[0m\\n"); writeFileSync(${JSON.stringify(resultPath)},Buffer.from(${JSON.stringify([...frame])}),{flag:"wx"});`], {
      stdio: ["ignore", "pipe", "pipe"], timeout: 5000,
    })
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0)
    child.stdout.on("data", (bytes: Buffer) => { stdout = Buffer.concat([stdout, bytes]); if (stdout.length > 4096) child.kill() })
    child.stderr.on("data", (bytes: Buffer) => { stderr = Buffer.concat([stderr, bytes]); if (stderr.length > 4096) child.kill() })
    await new Promise<void>((resolve, reject) => { child.on("error", reject); child.on("close", () => resolve()) })
    assert.equal(child.exitCode, 0, stderr.toString())
    expect(stdout.toString()).toContain("ordinary compiler log")
    expect(stdout.toString()).toContain("\x1b[32mcolored compiler log")
    expect(await readdir(resultDirectory)).toEqual(["result.frame"])
    expect(decodeCompilerFrame(await readFile(resultPath))).toEqual({ ok: true })
    expect(() => decodeCompilerFrame(stdout)).toThrow()
    // Exclusive creation refuses a second result; the first frame stays byte-exact.
    await expect(writeFile(resultPath, frame, { flag: "wx" })).rejects.toThrow()
    expect(frame.equals(await readFile(resultPath))).toBe(true)
  } finally {
    await rm(resultDirectory, { force: true, recursive: true })
  }
})

test("compiler fixture frame rejects missing, truncated, duplicate and oversized results", () => {
  const exact = encodeCompilerFrame({ ok: true })
  expect(exact).toEqual(Buffer.from([0, 0, 0, 11, 123, 34, 111, 107, 34, 58, 116, 114, 117, 101, 125]))
  for (const invalid of [Buffer.alloc(0), exact.subarray(0, 3), exact.subarray(0, -1), Buffer.concat([exact, exact]), Buffer.from([0, 32, 0, 1]), Buffer.from([0, 0, 0, 1, 255])]) {
    expect(() => decodeCompilerFrame(invalid)).toThrow()
  }
  expect(() => encodeCompilerFrame("x".repeat(2 * 1024 * 1024))).toThrow()
})

test("compiler fixture transport preserves finite options and rejects unowned configuration", async () => {
  const options = { environment: { VERCEL_ENV: "production", NEXT_PUBLIC_POSTHOG_KEY: "phc_test-token_value", NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" } }
  expect(encodeCompilerOptions(options)).toBe(JSON.stringify(options))
  expect(encodeCompilerOptions({ environment: {} })).toBe('{"environment":{}}')
  expect(() => encodeCompilerOptions({ environment: { PRIVATE_TOKEN: "value" } })).toThrow()
  expect(() => encodeCompilerOptions({ environment: {}, outputDirectory: "/outside/output" })).toThrow()
  expect(() => encodeCompilerOptions({ environment: {}, outputDirectory: join(tmpdir(), "slopcamera-web-own", "..", "outside") })).toThrow()
  expect(() => encodeCompilerOptions({ environment: { VERCEL_ENV: "x".repeat(1025) } })).toThrow()
  const resultDirectory = join(tmpdir(), "slopcamera-web-result-fixture")
  expect(assertCompilerResultPath(join(resultDirectory, "result.frame"))).toBe(join(resultDirectory, "result.frame"))
  for (const invalid of ["result.frame", join(tmpdir(), "result.frame"), join(tmpdir(), "slopcamera-web-result-"), join(tmpdir(), "slopcamera-web-other", "result.frame"),
    join(resultDirectory, "other.frame"), join(resultDirectory, "nested", "result.frame"), `${resultDirectory}/../slopcamera-web-result-x/result.frame`, "/outside/slopcamera-web-result-x/result.frame"]) {
    expect(() => assertCompilerResultPath(invalid)).toThrow()
  }
  const controller = new AbortController()
  controller.abort(new Error("test admission ended"))
  await expect(compileWebsiteInChild({ environment: {} }, controller.signal)).rejects.toThrow("test admission ended")
  expect(() => decodeCompilerResult({})).toThrow()
  expect(() => decodeCompilerResult({ analyticsPath: null, arbitrary: true })).toThrow()
})

describe("compilation fixture ownership (controlled promises, no compiler)", () => {
  test("collection before dispatch prevents any work from starting", async () => {
    let dispatched = false
    const task = ownedCompilation(async () => { dispatched = true })
    const collection = collectCompilation()
    await expect(task).rejects.toThrow("Compilation fixture admission has ended")
    await collection
    expect(dispatched).toBe(false)
    expect(compilationOwner).toBeUndefined()
  })

  test("late build completion is joined before cleanup and cannot start another build", async () => {
    let enter!: () => void
    let release!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve })
    const released = new Promise<void>(resolve => { release = resolve })
    let directory = ""
    let builds = 0
    let reachedSecondBuild = false
    const task = ownedCompilation(async fixture => {
      directory = await fixture.temporaryDirectory("slopcamera-web-owned-settlement-")
      await fixture.build({ outputDirectory: directory })
      reachedSecondBuild = true
      await fixture.build({ outputDirectory: directory })
    }, async () => {
      builds += 1
      enter()
      await released
      await writeFile(join(directory, "late-output.txt"), "settled before cleanup")
      return builtAssets
    })
    await entered
    let collected = false
    const collection = collectCompilation().then(() => { collected = true })
    try {
      expect(compilationOwner).toBeDefined()
      expect(() => ownedCompilation(async () => {})).toThrow("Previous compilation fixture has not settled")
      expect(await readdir(directory)).toEqual([])
      expect(collected).toBe(false)
    } finally {
      release()
      await expect(task).rejects.toThrow("Compilation fixture admission has ended")
      await collection
    }
    expect(builds).toBe(1)
    expect(reachedSecondBuild).toBe(false)
    expect(collected).toBe(true)
    expect(compilationOwner).toBeUndefined()
    await expect(readdir(directory)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("a rejected build retains its exact failure and outputs until collection", async () => {
    const failure = new Error("controlled compiler rejection")
    let directory = ""
    const task = ownedCompilation(async fixture => {
      directory = await fixture.temporaryDirectory("slopcamera-web-owned-rejection-")
      await fixture.build({ outputDirectory: directory })
    }, async () => { throw failure })
    await expect(task).rejects.toBe(failure)
    expect(compilationOwner).toBeDefined()
    expect(await readdir(directory)).toEqual([])
    await collectCompilation()
    expect(compilationOwner).toBeUndefined()
    await expect(readdir(directory)).rejects.toMatchObject({ code: "ENOENT" })
    await ownedCompilation(async () => {})
    await collectCompilation()
  })
})

test("analytics preserves an optional timestamp without manufacturing an undefined field", () => {
  for (const timestamp of [undefined, new Date("2026-09-08T00:00:00.000Z")]) {
    const sanitized = sanitizeEvent({
      event: "$pageview",
      properties: { token: "phc_testtoken", distinct_id: posthogCookielessDistinctId,
        $current_url: "https://slopcamera.com/", $cookieless_mode: true, $raw_user_agent: "native test user agent" },
      uuid: "0198c6a7-7c00-7000-8000-000000000000",
      ...(timestamp === undefined ? {} : { timestamp }),
    }, "phc_testtoken")
    expect(sanitized).not.toBeNull()
    expect(Object.hasOwn(sanitized!, "timestamp")).toBe(timestamp !== undefined)
    expect(sanitized?.timestamp).toBe(timestamp)
  }
})

test("analytics removes search-referrer keywords at every property depth", () => {
  const query = "wire-private-search-canary"
  const keywords = Object.fromEntries([
    "ph_keyword", "$initial_ph_keyword", "$session_entry_ph_keyword", "$prev_pageview_ph_keyword", "$INITIAL_PH_KEYWORD",
  ].map(key => [key, query]))
  const sanitized = sanitizeEvent({
    event: "$pageview", uuid: "0198c6a7-7c00-7000-8000-000000000000",
    properties: {
      token: "phc_testtoken", distinct_id: posthogCookielessDistinctId, $cookieless_mode: true,
      $raw_user_agent: "native test user agent", $current_url: "https://slopcamera.com/",
      $referrer: `https://www.google.com/search?q=${query}`, $search_engine: "google",
      ...keywords, $diagnostic: { ...keywords, safe: 42 },
    },
  }, "phc_testtoken")
  expect(sanitized?.properties).toMatchObject({
    $referrer: "https://www.google.com", $search_engine: "google", traffic_channel: "organic_search", traffic_source: "google", $diagnostic: { safe: 42 },
  })
  expect(JSON.stringify(sanitized)).not.toContain(query)
})

test("analytics removes nested personal fields and private historical attribution", () => {
  const base = { token: "phc_testtoken", distinct_id: posthogCookielessDistinctId, $cookieless_mode: true,
    $current_url: "https://slopcamera.com/docs?utm_source=public", $raw_user_agent: "test browser" }
  for (const path of ["/account/private-person", "/%61ccount/private-person", "/%41ccount/private-person", "/%invalid"]) {
    const sanitized = sanitizeEvent({ event: "$pageview", uuid: "0198c6a7-7c00-7000-8000-000000000000",
      properties: { ...base, $initial_current_url: `https://slopcamera.com${path}?utm_campaign=private-campaign`,
        $initial_utm_source: "private-source", $email: "private-person", $diagnostic: { token: "private-token",
          email: "private-person", rows: [{ $password: "private-password", $current_url: "https://slopcamera.com/docs?gclid=private-click" }] } },
    }, "phc_testtoken")
    expect(sanitized?.properties).toMatchObject({ ...base, $current_url: "https://slopcamera.com/docs",
      $initial_current_url: "https://slopcamera.com/private", canonical_path: "/docs" })
    expect(JSON.stringify(sanitized)).not.toMatch(/private-person|private-token|private-password|private-campaign|private-source|private-click|utm_source|utm_campaign|gclid/u)
  }
  const nested = sanitizeEvent({ event: "$pageview", uuid: "0198c6a7-7c00-7000-8000-000000000000",
    properties: { ...base, $diagnostic: { $current_url: "https://slopcamera.com/account/person?utm_source=private" } },
  }, "phc_testtoken")
  expect(JSON.stringify(nested)).not.toMatch(/utm_source|\/account|person\?/u)
})

test("analytics recognizes the current portfolio domains", () => {
  for (const host of ["gobstopper.sh", "botfilter.io", "icon.place", "textbutler.app", "peopleblade.com", "sponge.computer", "swft.io", "lifecharts.io"]) {
    expect(outboundProperties(`https://${host}/`, "footer")).toMatchObject({ target_host: host, link_kind: "portfolio" })
  }
})

test("analytics rejects events beyond the registered complete UTF-8 byte budget", () => {
  const sanitized = sanitizeEvent({ event: "$pageview", uuid: "0198c6a7-7c00-7000-8000-000000000000",
    properties: { token: "phc_testtoken", distinct_id: posthogCookielessDistinctId, $cookieless_mode: true,
      $current_url: "https://slopcamera.com/", $raw_user_agent: "test browser", $diagnostic: Array(64).fill("é".repeat(2048)) },
  }, "phc_testtoken")
  expect(sanitized).toBeNull()
})

type HarnessEvent = { event: string, properties: Record<string, unknown> }
type HarnessScenario = { bodies: unknown[], received: HarnessEvent[], returned: (HarnessEvent | null)[] }

function sentEvents(scenario: HarnessScenario): HarnessEvent[] {
  return scenario.bodies.flatMap(body => {
    if (Array.isArray(body)) return body as HarnessEvent[]
    const batch = (body as { batch?: HarnessEvent[] }).batch
    return batch ?? [body as HarnessEvent]
  })
}

describe("the pinned posthog-js through the production before_send (observability test contract)", () => {
  // Regression: the sanitizer once dropped `$host`, and PostHog ingestion rejects
  // every cookieless event without it (`cookieless_missing_host`), so production
  // sent pageviews that were never stored. The harness runs the real pinned
  // bundle with the shipped options and before_send in a child process, so its
  // browser globals stay out of this process, and returns the decoded requests.
  let scenarios: Record<string, HarnessScenario>
  beforeAll(() => {
    const harness = Bun.spawnSync([process.execPath, fileURLToPath(new URL("./scripts/analytics-posthog-harness.ts", import.meta.url))], {
      cwd: dirname(fileURLToPath(import.meta.url)), stderr: "pipe", stdout: "pipe", timeout: 60_000,
    })
    expect(harness.stderr.toString()).toBe("")
    expect(harness.exitCode).toBe(0)
    scenarios = JSON.parse(harness.stdout.toString()) as Record<string, HarnessScenario>
  })

  const allowedEvents = ["$pageview", "$web_vitals", ctaClickedEvent, outboundLinkOpenedEvent, installCommandCopiedEvent, "$exception", "$pageleave"]

  test("sends every allowed built-in and custom event and drops everything else", () => {
    const attributed = scenarios.attributed!
    expect(attributed.returned.map(event => event?.event ?? null)).toEqual([...allowedEvents.slice(0, 6), null, null, "$pageleave"])
    expect(sentEvents(attributed).map(event => event.event).sort()).toEqual([...allowedEvents].sort())
    expect(sentEvents(scenarios["not-found"]!).map(event => event.event).sort())
      .toEqual([...allowedEvents, pageNotFoundEvent].sort())
    for (const name of [...customEvents]) {
      expect(name).toMatch(/^[a-z]+(?: [a-z]+)+$/u)
    }
    expect(customEvents).toEqual([ctaClickedEvent, installCommandCopiedEvent, outboundLinkOpenedEvent, pageNotFoundEvent])
  })

  test("keeps the cookieless hash inputs, identity, page, referrer and attribution on every event", () => {
    for (const event of sentEvents(scenarios.attributed!)) {
      const sent = event.properties
      expect(sent.$host).toBe("slopcamera.com")
      expect(String(sent.$raw_user_agent).trim()).not.toBe("")
      expect(sent).toMatchObject({
        $cookieless_mode: true,
        $current_url: "https://slopcamera.com/docs/how-to/music-video?utm_source=newsletter&gclid=abc123",
        $pathname: "/docs/how-to/music-video",
        $process_person_profile: false,
        $referrer: "https://news.ycombinator.com",
        $referring_domain: "news.ycombinator.com",
        analytics_schema_version: POSTHOG_SCHEMA_VERSION,
        canonical_domain: "slopcamera.com",
        canonical_path: "/docs/how-to/music-video",
        distinct_id: posthogCookielessDistinctId,
        gclid: "abc123",
        page_kind: "docs",
        site_id: "slopcamera",
        token: "phc_harnesstoken",
        traffic_channel: "referral",
        utm_source: "newsletter",
      })
      for (const key of ["$lib", "$lib_version", "$browser", "$os", "$device_type", "$screen_width", "$viewport_width", "$pageview_id"]) {
        expect(sent).toHaveProperty(key)
      }
      // Email, OAuth code, stray parameters, the fragment and the referrer path never leave.
      expect(JSON.stringify(sent)).not.toMatch(/someone|example\.com|oauth-secret|partner|other=1|#section|item\?id|token=secret|personal-marker/u)
      expect(sent).not.toHaveProperty("code")
      expect(sent).not.toHaveProperty("ref")
      expect(sent).not.toHaveProperty("command")
    }
  })

  test("sends provider fields posthog-js produces for $web_vitals, $pageleave and $exception", () => {
    const events = new Map(sentEvents(scenarios.attributed!).map(event => [event.event, event.properties]))
    expect(events.get("$web_vitals")).toMatchObject({ $web_vitals_LCP_value: 1234.5 })
    expect(events.get("$pageleave")).toHaveProperty("$prev_pageview_pathname", "/docs/how-to/music-video")
    const exception = events.get("$exception")!
    expect(exception).toMatchObject({ error_surface: "client", error_origin: "window_error" })
    expect(String(exception.error_fingerprint)).toMatch(/^e_[0-9a-f]{8}$/u)
    expect(JSON.stringify(exception.$exception_list)).toContain("[email]")
    expect(JSON.stringify(exception.$exception_list)).not.toMatch(/someone@|utm_source/u)
    expect(events.get(installCommandCopiedEvent)).toMatchObject({ install_method: "bun", placement: "inline" })
    expect(events.get(ctaClickedEvent)).toMatchObject({ cta: "install", placement: "hero" })
    expect(events.get(outboundLinkOpenedEvent)).toMatchObject({ target_host: "github.com", link_kind: "github", placement: "nav" })
  })

  test("drops the whole query on a sensitive path", () => {
    for (const event of [...sentEvents(scenarios.sensitive!), ...sentEvents(scenarios["sensitive-encoded"]!)]) {
      expect(event.properties.$current_url).toBe("https://slopcamera.com/private")
      expect(event.properties).not.toHaveProperty("utm_source")
      expect(event.properties).not.toHaveProperty("gclid")
      expect(JSON.stringify(event.properties)).not.toMatch(/oauth-secret|newsletter|abc123/u)
    }
  })

  test("strips attribution from actual wire payloads with a private historical location", () => {
    const event = sentEvents(scenarios["sensitive-history"]!).find(event => event.event === "$pageview")!
    expect(event.properties.$current_url).toBe("https://slopcamera.com/docs")
    expect(event.properties.$initial_current_url).toBe("https://slopcamera.com/private")
    expect(JSON.stringify(event)).not.toMatch(/utm_source|newsletter|private-campaign|private-person|personal-marker/u)
  })

  test("reports the 404 with the requested path and the own-host referrer path", () => {
    const events = sentEvents(scenarios["not-found"]!)
    const notFound = events.find(event => event.event === pageNotFoundEvent)!.properties
    expect(notFound).toMatchObject({ requested_path: "/missing/page", referrer_host: "slopcamera.com", page_kind: "not_found", canonical_path: "/404" })
    for (const event of events) {
      expect(event.properties.$referrer).toBe("https://slopcamera.com/docs")
      expect(event.properties.page_kind).toBe("not_found")
      expect(JSON.stringify(event.properties)).not.toContain("secret")
    }
  })

  test("sends nothing from a preview, *.vercel.app or localhost host", () => {
    for (const name of ["preview", "vercel", "localhost"]) {
      expect(scenarios[name]!.received.length).toBeGreaterThan(0)
      expect(scenarios[name]!.returned.every(event => event === null)).toBe(true)
      expect(scenarios[name]!.bodies).toEqual([])
    }
  })
})

test("before_send keeps server session and window identifiers when posthog-js supplies them", () => {
  // Cookieless mode has no client session manager; PostHog assigns sessions at
  // ingestion. If a later posthog-js sends them, they must pass unchanged.
  const sanitized = sanitizeEvent({
    event: "$pageview",
    properties: {
      $cookieless_mode: true, $current_url: "https://slopcamera.com/", $raw_user_agent: "ua",
      $session_id: "0198c6a7-7c00-7000-8000-00000000000a", $window_id: "0198c6a7-7c00-7000-8000-00000000000b",
      distinct_id: posthogCookielessDistinctId, token: "phc_testtoken",
    },
    uuid: "0198c6a7-7c00-7000-8000-000000000000",
  }, "phc_testtoken")
  expect(sanitized?.properties).toMatchObject({
    $session_id: "0198c6a7-7c00-7000-8000-00000000000a",
    $window_id: "0198c6a7-7c00-7000-8000-00000000000b",
  })
})
describe("analytics private-route guards", () => {
  const token = "phc_testtoken"
  const event = {
    event: "$pageview",
    uuid: "0198c6a7-7c00-7000-8000-000000000010",
    properties: {
      $cookieless_mode: true,
      $current_url: "https://slopcamera.com/docs?utm_campaign=launch",
      $raw_user_agent: "ua",
      distinct_id: posthogCookielessDistinctId,
      token,
      utm_campaign: "launch",
    },
  }

  test("normalizes encoded separators and dot segments before private-route classification", () => {
    for (const path of ["/public%2f..%2fauth/callback", "/public/%2e%2e%2fauth/callback", "/public%5c..%5cauth/callback", "/%2fauth/callback", "/bad%ZZ"]) {
      expect(isSensitivePath(path)).toBe(true)
      const result = sanitizeEvent({ ...event, properties: { ...event.properties, $current_url: `https://slopcamera.com${path}?utm_campaign=launch` } }, token)
      expect(result?.properties.$current_url).toBe("https://slopcamera.com/private")
      expect(result?.properties).not.toHaveProperty("utm_campaign")
    }
    expect(isSensitivePath("/docs/authentication")).toBe(false)
  })

  test("strips queued public attribution after navigation to a private path", () => {
    const location = { protocol: "https:", hostname: "slopcamera.com", pathname: "/docs" }
    const beforeSend = createBeforeSend(token, () => location, () => false)
    expect(beforeSend(event)?.properties.utm_campaign).toBe("launch")
    location.pathname = "/public%2f..%2fauth/callback"
    const result = beforeSend(event)
    expect(result?.properties.$current_url).toBe("https://slopcamera.com/docs")
    expect(result?.properties).not.toHaveProperty("utm_campaign")
  })
})

describe("static Slopcamera site", () => {
  beforeAll(async () => {
    try {
      builtAssets = await ownedCompilation(fixture => fixture.build({ environment: {} }))
    } finally {
      await collectCompilation()
    }
  }, compilationTimeoutMs)

  test("release installation advertises the exact canonical archive beside the source path", async () => {
    expect(publishedRelease).toEqual({ version: "3.10.1", releaseUrl: "https://github.com/hraness/slopcamera/releases/tag/v3.10.1" })
    expect(Object.isFrozen(publishedRelease)).toBe(true)
    expect(publishedArchiveUrl).toBe("https://github.com/hraness/slopcamera/releases/download/v3.10.1/hraness-slopcamera-3.10.1.tgz")
    expect(archiveInstall.command).toBe(`bun add --global ${publishedArchiveUrl}`)
    const html = await readBuilt("index.html")
    for (const publicText of [plainCode(html), homeMarkdown, llmsTxt]) {
      expect(publicText).toContain(archiveInstall.command)
      expect(publicText).not.toContain("No Slopcamera release archive has been published.")
      expect(publicText).not.toContain("hraness-atet-")
      expect(publicText).not.toContain("tree/v3.2.3")
    }
    for (const command of [sourceInstall.checkoutCommand, sourceInstall.enterCommand, sourceInstall.skillCommand]) expect(plainCode(html)).not.toContain(command)
    expect(html).toContain(sourceInstall.guideUrl)
    expect(html).not.toMatch(/\{\{(?:PUBLISHED|SOURCE)_[^}]+\}\}/u)
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)![1]!)["@graph"] as Record<string, unknown>[]
    for (const item of graph) {
      expect(item).not.toHaveProperty("softwareVersion")
      expect(item).not.toHaveProperty("offers")
      expect(item).not.toHaveProperty("version")
    }
    expect(await readBuilt("index.md")).toBe(homeMarkdown)
  })

  test("keeps product Ask AI links off utility pages", async () => {
    const subjectUrl = "https://slopcamera.com/"
    const prompt = `Tell me about ${subjectUrl}`
    const row = renderAskAiAboutThis(subjectUrl)
    const providers = [
      ["chatgpt", "https://chatgpt.com/", "q"],
      ["claude", "https://claude.ai/new", "q"],
      ["perplexity", "https://perplexity.ai/", "q"],
      ["grok", "https://x.com/i/grok", "text"],
    ] as const

    expect(row.match(/<nav\b/gu)).toHaveLength(1)
    expect(row).toContain('aria-label="Ask AI about this"')
    expect(row.match(/data-slot="ask-ai-about-this-link"/gu)).toHaveLength(4)
    expect(row.match(/target="_blank"/gu)).toHaveLength(4)
    expect(row.match(/rel="noopener noreferrer nofollow"/gu)).toHaveLength(4)
    for (const [provider, baseUrl, parameter] of providers) {
      const destination = new URL(baseUrl)
      destination.searchParams.set(parameter, prompt)
      const escapedDestination = destination.href.replaceAll("&", "&amp;")
      expect(row).toContain(`data-ask-ai-provider="${provider}"`)
      expect(row).toContain(`href="${escapedDestination}"`)
    }

    const home = await readBuilt("index.html")
    const builtRow = /<nav\b[^>]*data-slot="ask-ai-about-this"[\s\S]*?<\/nav>/u.exec(home)?.[0]
    expect(builtRow).toBeDefined()
    expect(home.match(/data-slot="ask-ai-about-this"/gu)).toHaveLength(1)
    expect(builtRow?.match(/data-slot="ask-ai-about-this-link"/gu)).toHaveLength(4)
    expect(builtRow?.match(/target="_blank"/gu)).toHaveLength(4)
    expect(builtRow?.match(/rel="noopener noreferrer nofollow"/gu)).toHaveLength(4)
    for (const [provider, baseUrl, parameter] of providers) {
      const destination = new URL(baseUrl)
      destination.searchParams.set(parameter, prompt)
      expect(builtRow).toContain(`data-ask-ai-provider="${provider}"`)
      expect(builtRow).toContain(`href="${destination.href.replaceAll("&", "&amp;")}"`)
    }
    expect(await readBuilt("preview.html")).not.toContain('data-slot="ask-ai-about-this"')
    expect(await readBuilt("404.html")).not.toContain('data-slot="ask-ai-about-this"')
  })

  test("makes the README a detailed agent guide with natural GitHub discovery terms", async () => {
    const readme = await readFile(join(repositoryDirectory, "README.md"), "utf8")
    const searchableReadme = readme
      .replaceAll("**", "")
      .replace(/^>\s?/gmu, "")
      .replace(/\s+/gu, " ")
      .toLowerCase()

    // Follow capabilities, installation, a first project, reference, trust and
    // contribution through their content instead of pinning editorial headings.
    const sections = readme.split(/^## /mu)
    const readerPath = [
      "https://slopcamera.com/docs/reference/techniques",
      archiveInstall.command,
      "(https://slopcamera.com/docs/how-to/remix-the-showcase)",
      "| Diagrams |",
      "`slopcamera mcp`",
      "21 fixed tools",
      "(SECURITY.md)",
      "\nbun run check\n",
      "nearest `AGENTS.md`",
    ].map(content => sections.findIndex(section => section.includes(content)))
    expect(readerPath.every(position => position >= 0)).toBe(true)
    expect(readerPath).toEqual([...readerPath].sort((left, right) => left - right))
    expect(new Set(readerPath).size).toBe(readerPath.length)

    for (const term of [
      "TypeScript SDK",
      "Bun CLI",
      "Agent Skill",
      "MCP server",
      "Vercel AI Gateway",
      "multimedia studio for your coding agent",
      "import existing footage or recording bundles",
      "image, video, speech, and transcription models",
      "clean and captioned versions",
    ]) {
      expect(searchableReadme).toContain(term.toLowerCase())
    }

    expect(searchableReadme).toContain(searchDescription.toLowerCase())

    expect(readme).toContain(sourceInstall.checkoutCommand)
    expect(readme).toContain("bun run build:sdk")
    expect(readme).toContain("bun run build:desktop:cli")
    expect(readme).toContain("slopcamera skill install --target agents")
    expect(readme).toContain(publishedArchiveUrl)
    expect(readme).toContain(`bun add --global ${publishedArchiveUrl}`)
    expect(readme).toContain("slopcamera operations list --json")
    expect(readme).toContain("docs/how-to/generate-media.md")
    expect(readme).toContain("slopcamera workflows show social-variants --json")
    expect(readme).toContain("[`CONTRIBUTING.md`](CONTRIBUTING.md)")
    expect(readme).not.toMatch(/checked step|checked path|bounded capability|delivery variant/i)
    for (const route of ["tutorials/first-native-film", "tutorials/first-animation", "how-to/educational-video"]) {
      expect(readme).toContain(`https://slopcamera.com/docs/${route}`)
    }
    const readmeHero = workflowExamples.find(example => example.id === "rain-bottled")
    expect(readmeHero).toBeDefined()
    expect(readme).toContain(`](apps/web/media/${readmeHero!.poster.file})](https://slopcamera.com/docs/how-to/remix-the-showcase#rain-bottled)`)
    expect(readme).toContain("https://slopcamera.com/docs/tutorials/first-diagram")
  })

  test("publishes one canonical Slopcamera identity across discovery metadata", async () => {
    const html = await readSource("index.html")

    expect(html).toContain("<title>SlopCamera: video, diagrams and 3D your coding agent can revise</title>")
    expect(html).toContain('<meta property="og:title" content="SlopCamera: video, diagrams and 3D your coding agent can revise">')
    expect(html).toContain(`<meta name="description" content="${searchDescription}">`)
    expect(html).toContain(`<meta property="og:description" content="${searchDescription}">`)
    expect(html).toContain(`<meta name="twitter:description" content="${searchDescription}">`)
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">')
    expect(html).not.toContain('<meta name="keywords"')
    expect(html).toContain('<link rel="canonical" href="https://slopcamera.com/">')
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="/index.md">')
    expect(html).toContain('<link rel="describedby" href="/llms.txt">')
    expect(html).toContain('<meta property="og:url" content="https://slopcamera.com/">')
    expect(html).toContain('<meta property="og:image" content="https://slopcamera.com/og.png">')
    expect(html).toContain('<meta property="og:image:width" content="1200">')
    expect(html).toContain('<meta property="og:image:height" content="630">')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(html).toContain('<meta name="twitter:image" content="https://slopcamera.com/og.png">')
    expect(html).toContain(`<meta property="og:image:alt" content="${homeSocialImage.alt}">`)
    expect(html).toContain(`<meta name="twitter:image:alt" content="${homeSocialImage.alt}">`)
    expect(html).toContain('<link rel="icon" href="/icon.png" type="image/png">')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">')
    expect(html).toContain('<a class="{{INSTALL_PANEL_LINK_CLASS}}" href="{{SOURCE_INSTALL_URL}}">complete source-install guide</a>')
    expect(html).toContain('<a class="{{INSTALL_PANEL_LINK_CLASS}}" href="https://github.com/hraness/slopcamera/blob/main/skills/slopcamera/SKILL.md">Agent Skill</a>')
  })

  test("builds an inert noindex Slopcamera preview with the homepage as canonical", async () => {
    const [source, built, productCss, recipes, css] = await Promise.all([
      readSource("preview.html"),
      readBuilt("preview.html"),
      readSource("styles.css"),
      readSource("preview.stylex.ts"),
      readBuilt(builtAssets.previewStylesPath.slice(1)),
    ])
    const semanticHooks = [
      "preview-route", "preview-shell", "preview-mark", "preview-mark__sun",
      "preview-mark__path", "preview-kicker", "preview-summary", "preview-outputs", "preview-note",
    ]

    for (const html of [source, built]) {
      expect(html.match(/<h1\b/gu)).toHaveLength(1)
      expect(html).toMatch(/<h1 id="preview-title" class="[^"]+">SlopCamera<\/h1>/u)
      expect(html).toMatch(/<main aria-labelledby="preview-title" class="preview-shell [^"]+">/u)
      expect(html).toContain("A domain-specific harness for visual creation.")
      expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">')
      expect(html).toContain('<link rel="canonical" href="https://slopcamera.com/">')
      expect(html).not.toMatch(/<script\b|<style\b|\sstyle\s*=|<a\b|<button\b|<form\b|<input\b|<select\b|<textarea\b|contenteditable/iu)
      expect(html).not.toMatch(/analytics|posthog|account|authentication|authorization|sign[ -]?in|user data/iu)
      expect(html).not.toContain('rel="alternate"')
      expect(html).not.toContain('rel="sitemap"')
      expect(html).not.toContain('rel="describedby"')
      expect(html).not.toContain("data-hraness-appearance-menu")
      expect(html).not.toContain('data-slot="hraness-site-footer"')
      expect([...html.matchAll(/\sclass="([^"]+)"/gu)]
        .flatMap(match => match[1]!.split(/\s+/u))
        .filter(token => token.startsWith("preview-"))).toEqual(semanticHooks)
    }

    expect(source.trimEnd().split("\n")).toHaveLength(33)
    expect(source).toContain("    {{PREVIEW_STYLES}}\n")
    expect(source.match(/\{\{PREVIEW_[A-Z_]+_CLASS\}\}/gu)).toHaveLength(18)
    expect(source.match(/\{\{PREVIEW_NUMBER_CLASS\}\}/gu)).toHaveLength(4)
    const stylesheetLinks = `<link rel="stylesheet" href="${builtAssets.previewFoundationPath}">\n    <link rel="stylesheet" href="${builtAssets.previewStylesPath}">`
    expect(built).toContain(stylesheetLinks)
    expect(built.match(/<link rel="stylesheet"(?=\s|>)/gu)).toHaveLength(2)
    expect(built).not.toContain(builtAssets.stylesPath)
    expect(built).not.toContain("{{")
    const withoutRecipeClasses = (html: string): string => html.replace(/\sclass="([^"]+)"/gu, (_attribute, value: string) => {
      const hooks = value.split(/\s+/u).filter(token => semanticHooks.includes(token))
      return hooks.length === 0 ? "" : ` class="${hooks.join(" ")}"`
    })
    expect(withoutRecipeClasses(built.replace(stylesheetLinks, "{{PREVIEW_STYLES}}")))
      .toBe(withoutRecipeClasses(source))
    const outputs = [...built.matchAll(/<li class="([^"]+)"><span class="([^"]+)">(0[1-4])<\/span>([^<]+)<\/li>/gu)]
    expect(outputs.map(match => [match[3], match[4]])).toEqual([
      ["01", "images"], ["02", "diagrams"], ["03", "animated loops"], ["04", "video"],
    ])
    const classAttributes = [...built.matchAll(/\sclass="([^"]+)"/gu)].map(match => match[1]!)
    expect(classAttributes).toHaveLength(18)
    for (const attribute of classAttributes) {
      expect(attribute).toMatch(/^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/u)
      const compiled = attribute.split(" ").filter(token => !semanticHooks.includes(token))
      expect(compiled.length).toBeGreaterThan(0)
      for (const token of compiled) expect(css).toContain(`.${token}`)
    }

    const declarations = (classes: string): string => {
      const selectors = classes.split(" ").map(token => new RegExp(`\\.${token}(?=[^A-Za-z0-9_-]|$)`, "u"))
      return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]
        .filter(match => selectors.some(selector => selector.test(match[1]!)))
        .map(match => match[2]).join(";").replace(/\s+/gu, "")
    }
    const routeCss = declarations(classAttributes[0]!)
    const shellCss = declarations(classAttributes[1]!)
    expect(routeCss).toContain("align-items:safecenter")
    expect(routeCss).toContain("justify-items:safecenter")
    expect(routeCss).toContain("overflow-x:hidden")
    expect(routeCss).toContain("overflow-y:auto")
    expect(routeCss).toContain("min-height:100svh")
    expect(shellCss).toMatch(/min-height:min\(38rem,(?:calc\()?100svh-2rem\)\)?/u)
    expect(shellCss).toContain("min-height:calc(100svh-1rem)")
    expect(`${routeCss};${shellCss}`).not.toMatch(/(?:^|;)overflow:hidden(?:;|$)/u)
    // The compiler normalizes max-width to its equivalent inclusive range.
    expect(css).toMatch(/@media\s*\((?:max-width:\s*|width\s*<=\s*)48rem\)/u)
    expect(css).toMatch(/@media\s*\(forced-colors:\s*active\)/u)
    expect(shellCss).toMatch(/border(?:-(?:top|right|bottom|left))?-color:CanvasText/iu)
    const outputGridCss = declarations(classAttributes[8]!)
    expect(outputGridCss).toContain("grid-template-columns:repeat(4,minmax(0,1fr))")
    expect(outputGridCss).toContain("grid-template-columns:repeat(2,minmax(0,1fr))")
    expect(declarations(outputs[2]![1]!)).toMatch(/border-left-width:0(?:px)?(?:;|$)/u)
    for (const output of outputs.slice(2)) {
      expect(declarations(output[1]!)).toContain("border-top-width:1px")
      expect(declarations(output[1]!)).toContain("border-top-style:solid")
    }
    expect(productCss).not.toMatch(/\.preview-(?:route|shell|mark|kicker|summary|outputs|note)\b/u)
    expect(recipes).toContain('import * as stylex from "@stylexjs/stylex"')
    expect(recipes).toContain('default: "min(38rem, calc(100svh - 2rem))"')
    expect(recipes).toContain('[compactViewport]: "calc(100svh - 1rem)"')
  })

  test("publishes exactly the preview HTML, two stylesheets, and thirteen approved font assets", async () => {
    expect(builtAssets.previewStylesPath).toMatch(/^\/assets\/preview-[a-f0-9]{64}\.css$/u)
    expect(builtAssets.previewFoundationPath).toMatch(/^\/graphs\/preview-foundation\/assets\/[A-Za-z0-9_.-]+\.css$/u)
    const artifacts = builtAssets.previewArtifacts
    const paths = artifacts.map(artifact => artifact.path)
    expect(artifacts).toHaveLength(16)
    expect(paths).toEqual([...paths].sort())
    expect(new Set(paths).size).toBe(16)
    expect(paths.filter(path => path.endsWith(".html"))).toEqual(["preview.html"])
    expect(paths.filter(path => path.endsWith(".css")).sort()).toEqual([
      builtAssets.previewStylesPath.slice(1), builtAssets.previewFoundationPath.slice(1),
    ].sort())
    const fonts = paths.filter(path => path.endsWith(".woff2"))
    expect(fonts).toHaveLength(13)
    for (const font of fonts) expect(font).toMatch(/^graphs\/preview-foundation\/assets\/[A-Za-z0-9_.-]+\.woff2$/u)
    for (const artifact of artifacts) {
      expect(Object.keys(artifact).sort()).toEqual(["bytes", "path", "sha256"])
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/u)
      const bytes = await readFile(join(appDirectory, "dist", artifact.path))
      expect(artifact.bytes).toBe(bytes.byteLength)
      expect(artifact.bytes).toBeGreaterThan(0)
      expect(artifact.sha256).toBe(new Bun.CryptoHasher("sha256").update(bytes).digest("hex"))
    }
    expect((await readdir(join(appDirectory, "dist/graphs"))).sort()).toEqual(["preview-foundation", "site-foundation"])
    expect(await readdir(join(appDirectory, "dist/graphs/preview-foundation"))).toEqual(["assets"])
    expect((await readdir(join(appDirectory, "dist/graphs/preview-foundation/assets"))).sort())
      .toEqual(paths.filter(path => path.startsWith("graphs/preview-foundation/assets/"))
        .map(path => path.split("/").at(-1)!).sort())
    const foundation = await readBuilt(builtAssets.previewFoundationPath.slice(1))
    expect(foundation.match(/@font-face\b/gu)).toHaveLength(13)
    expect([...foundation.matchAll(/url\(["']?([^"')]+)["']?\)/gu)].map(match => {
      const url = new URL(match[1]!, `https://slopcamera.com${builtAssets.previewFoundationPath}`)
      expect(url.origin).toBe("https://slopcamera.com")
      return url.pathname.slice(1)
    }).sort()).toEqual([...fonts].sort())
    expect(foundation).not.toMatch(/sourceMappingURL|@import\b/u)
  })

  test("publishes the sealed ordinary and documentation documents with one complete union and bound local fonts", async () => {
    const artifacts = builtAssets.siteArtifacts
    const paths = artifacts.map(item => item.path)
    const blogDocuments = [blogIndexDocument, ...blogPosts.map(blogDocumentForPost)]
    expect(artifacts).toHaveLength(17 + 2 + docPages.length + blogDocuments.length)
    expect(paths).toEqual([...paths].sort())
    expect(new Set(paths).size).toBe(17 + 2 + docPages.length + blogDocuments.length)
    expect(paths.filter(path => path.endsWith(".html"))).toEqual([
      "404.html", ...docPages.map(docsDocumentForPage), ...blogDocuments, "index.html",
    ].sort())
    expect(paths.filter(path => path.endsWith(".css")).sort()).toEqual([
      builtAssets.stylesPath.slice(1), builtAssets.siteFoundationPath.slice(1),
    ].sort())
    expect(builtAssets.stylesPath).toMatch(/^\/assets\/site-[a-f0-9]{64}\.css$/u)
    expect(builtAssets.siteFoundationPath).toMatch(/^\/graphs\/site-foundation\/assets\/[A-Za-z0-9_.-]+\.css$/u)
    for (const artifact of artifacts) {
      expect(Object.keys(artifact).sort()).toEqual(["bytes", "path", "sha256"])
      const bytes = await readFile(join(appDirectory, "dist", artifact.path))
      expect(artifact.bytes).toBe(bytes.byteLength)
      expect(artifact.bytes).toBeGreaterThan(0)
      expect(artifact.sha256).toBe(new Bun.CryptoHasher("sha256").update(bytes).digest("hex"))
    }
    const fonts = paths.filter(path => path.endsWith(".woff2"))
    expect(fonts).toHaveLength(14)
    const images = paths.filter(path => path.endsWith(".svg"))
    expect(images).toHaveLength(1)
    for (const name of ["grain.svg", "cells.svg"]) {
      const expected = await readFile(join(appDirectory, "vendor/marketing-preset/marketing-assets", name))
      expect(images.some(path => artifacts.find(item => item.path === path)!.sha256 === new Bun.CryptoHasher("sha256").update(expected).digest("hex"))).toBe(false)
    }
    // The third SVG is the foil wordmark mask: the canonical product mark bytes.
    const markBytes = await readFile(join(appDirectory, "src/marks/slopcamera.svg"))
    const markSha256 = new Bun.CryptoHasher("sha256").update(markBytes).digest("hex")
    const masks = images.filter(path => artifacts.find(item => item.path === path)!.sha256 === markSha256)
    const textures = images.filter(path => !masks.includes(path))
    expect(masks).toHaveLength(1)
    expect(textures).toHaveLength(0)
    const foundation = await readBuilt(builtAssets.siteFoundationPath.slice(1))
    const union = await readBuilt(builtAssets.stylesPath.slice(1))
    expect(foundation.match(/@font-face\b/gu)).toHaveLength(14)
    expect([...foundation.matchAll(/url\(["']?([^"')]+)["']?\)/gu)].map(match => {
      const url = new URL(match[1]!, "https://slopcamera.com" + builtAssets.siteFoundationPath)
      expect(url.origin).toBe("https://slopcamera.com")
      return url.pathname.slice(1)
    }).sort()).toEqual([...fonts, ...textures, ...textures, ...textures, ...masks].sort())
    expect(foundation).not.toMatch(/sourceMappingURL|@import\b/u)
    expect(union).not.toMatch(/@font-face|sourceMappingURL/u)
    expect(() => assertSiteRecipeResources(union, "sealed-site-union.css")).not.toThrow()
    expect(foundation).toContain("components.slopcamera-legacy")
    expect(union).toContain("components.hraness-stylex")
    expect(await readdir(join(appDirectory, "dist/graphs/site-foundation"))).toEqual(["assets"])
    expect((await readdir(join(appDirectory, "dist/graphs/site-foundation/assets"))).sort())
      .toEqual(paths.filter(path => path.startsWith("graphs/site-foundation/assets/"))
        .map(path => path.split("/").at(-1)!).sort())
    const stylesheets = '<link rel="stylesheet" href="' + builtAssets.siteFoundationPath
      + '">\n    <link rel="stylesheet" href="' + builtAssets.stylesPath + '">'
    for (const path of ["index.html", "404.html"]) {
      const html = await readBuilt(path)
      expect(html).toContain(stylesheets)
      expect(html.match(/<link rel="stylesheet"(?=\s|>)/gu)).toHaveLength(2)
      expect(html).not.toMatch(/\{\{|<style\b|\sstyle\s*=|graphs\/site-renderer/u)
      for (const marker of ["skip-link", "topbar", "wordmark", "topbar-actions"]) {
        const classes = new RegExp('class="' + marker + ' ([^"]+)"', "u").exec(html)?.[1]?.split(" ")
        expect(classes).toBeDefined()
        expect(classes!.length).toBeGreaterThan(0)
        for (const name of classes!) {
          if (marker === "topbar" && path === "index.html" && name === "hraness-material-chrome") {
            expect(foundation).toContain(".hraness-material-chrome")
            continue
          }
          if (marker === "wordmark" && name === "hraness-foil-text") {
            expect(foundation).toContain(".hraness-foil-text")
            continue
          }
          expect(name).toMatch(/^x[A-Za-z0-9_-]+$/u)
          expect(union).toContain("." + name)
        }
      }
    }
  })

  test("renders every registered documentation page with mirrors, metadata, and sealed classes", async () => {
    const stylesheets = `<link rel="stylesheet" href="${builtAssets.siteFoundationPath}">\n    <link rel="stylesheet" href="${builtAssets.stylesPath}">`
    const titles = new Set<string>()
    const descriptions = new Set<string>()
    for (const page of docPages) {
      const document = docsDocumentForPage(page)
      const [html, mirror] = await Promise.all([
        readBuilt(document),
        readBuilt(`docs/${page.slug}.md`),
      ])
      expect(html).toContain(stylesheets)
      expect(html).not.toMatch(/\{\{|<style\b|\sstyle\s*=|graphs\/site-renderer|analytics-/u)
      expect(html.match(/<h1\b/gu)).toHaveLength(1)
      expect(html).toContain(`<title>${page.title} · SlopCamera</title>`)
      expect(html).toContain(`<meta name="description" content="${page.description}">`)
      expect(html).toContain(`<link rel="canonical" href="${docsCanonicalUrl(page)}">`)
      expect(html).toContain(`<link rel="alternate" type="text/markdown" href="${docsMarkdownUrl(page)}">`)
      const faviconPath = /<link rel="icon" href="\/([^"?]+)"/u.exec(html)?.[1]
      expect(faviconPath).toBeDefined()
      expect((await readFile(join(appDirectory, "dist", faviconPath!))).byteLength).toBeGreaterThan(0)
      expect(html).toContain('<meta name="robots" content="index, follow')
      expect(html).toContain('aria-label="Documentation"')
      expect(html).toContain('aria-current="page"')
      const jsonLd = /<script type="application\/ld\+json">([\s\S]+?)<\/script>/u.exec(html)?.[1]
      const graph = (JSON.parse(jsonLd ?? "null") as { "@graph"?: Array<Record<string, unknown>> })["@graph"] ?? []
      expect(graph.some(node => node["@type"] === "TechArticle" && node.url === docsCanonicalUrl(page))).toBe(true)
      expect(graph.some(node => node["@type"] === "BreadcrumbList")).toBe(true)
      // Explanation pages with a visible FAQ carry the same questions as FAQPage markup.
      const faq = graph.find(node => node["@type"] === "FAQPage") as { mainEntity?: Array<{ name: string }> } | undefined
      const visibleQuestions = page.section === "explanation" ? [...(/^## FAQ\n([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(mirror)?.[1] ?? "").matchAll(/^### (.+)$/gmu)].map(match => match[1] ?? "") : []
      expect(faq?.mainEntity?.map(entry => entry.name) ?? []).toEqual(visibleQuestions)
      if (page.slug === "explanation/slopcamera-vs-remotion") expect(visibleQuestions).toHaveLength(4)
      if (page.modified !== undefined) expect(graph.some(node => node["@type"] === "TechArticle" && node.dateModified === page.modified)).toBe(true)
      expect(mirror.startsWith(`# ${page.title}\n\n${page.description}`)).toBe(true)
      expect(mirror).not.toMatch(/\{\{/u)
      titles.add(page.title)
      descriptions.add(page.description)
    }
    expect(titles.size).toBe(docPages.length)
    expect(descriptions.size).toBe(docPages.length)

    // The index is a real navigation page, not a redirect stub.
    const index = await readBuilt("docs/index.html")
    expect(index).toContain('href="/docs/tutorials/first-diagram"')
    expect(index).toContain("Tutorials")
    expect(index).toContain("How-to guides")
    expect(index).toContain("Reference")
    expect(index).toContain("Explanation")

    // A rendered article carries authored prose, compiled classes, and anchors.
    const diagram = await readBuilt("docs/tutorials/first-diagram.html")
    expect(diagram).toContain('id="create-the-source"')
    expect(diagram).toContain("example-flow.light.png")
    expect(diagram).toMatch(/<pre class="[^"]+"[^>]*><code class="[^"]+">/u)
    expect(diagram).not.toContain("{{")
  })

  test("links the website, product, and source in structured data", async () => {
    const html = await readBuilt("index.html")
    const match = /<script type="application\/ld\+json">([\s\S]+?)<\/script>/u.exec(html)
    expect(match?.[1]).toBeDefined()
    const value = JSON.parse(match?.[1] ?? "null") as { "@graph"?: unknown[] }

    expect(value["@graph"]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        "@id": "https://hraness.com/#organization",
        "@type": "Organization",
        name: "Hraness",
        sameAs: ["https://github.com/hraness"],
      }),
      expect.objectContaining({
        "@id": "https://slopcamera.com/#website",
        "@type": "WebSite",
        description: searchDescription,
        inLanguage: "en",
        publisher: { "@id": "https://hraness.com/#organization" },
      }),
      expect.objectContaining({
        "@id": "https://slopcamera.com/#webpage",
        "@type": "WebPage",
        isPartOf: { "@id": "https://slopcamera.com/#website" },
        mainEntity: { "@id": "https://slopcamera.com/#software" },
        publisher: { "@id": "https://hraness.com/#organization" },
      }),
      expect.objectContaining({
        "@id": "https://slopcamera.com/#software",
        "@type": "SoftwareApplication",
        description: searchDescription,
        author: { "@id": "https://hraness.com/#organization" },
        installUrl: "https://slopcamera.com/#install",
        publisher: { "@id": "https://hraness.com/#organization" },
        sameAs: ["https://github.com/hraness/slopcamera"],
        softwareRequirements: "Bun 1.3.14 or newer; native engines install separately",
      }),
      expect.objectContaining({
        "@id": "https://slopcamera.com/#source",
        "@type": "SoftwareSourceCode",
        author: { "@id": "https://hraness.com/#organization" },
        codeRepository: "https://github.com/hraness/slopcamera",
        targetProduct: { "@id": "https://slopcamera.com/#software" },
      }),
      expect.objectContaining({
        "@id": "https://slopcamera.com/#questions",
        "@type": "FAQPage",
        mainEntity: expect.arrayContaining([
          expect.objectContaining({
            "@type": "Question",
            name: "Does Slopcamera require an account or subscription?",
          }),
          expect.objectContaining({
            "@type": "Question",
            name: "When can local media leave the machine?",
          }),
        ]),
      }),
    ]))
  })

  test("puts the release and matching skill before the source-build disclosure", async () => {
    const html = await readBuilt("index.html")
    const marker = html.indexOf('data-hraness-marketing="install"')
    const installHtml = html.slice(html.lastIndexOf("<section", marker), html.indexOf("</section>", marker))
    const positions = [archiveInstall.command, archiveInstall.skillCommand].map(command => plainCode(installHtml).indexOf(command))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(installHtml).toContain("Install the CLI</p>")
    expect(installHtml).toContain("Then install its matching Agent Skill")
    expect(installHtml.match(/data-hraness-platform-install/gu)).toHaveLength(1)
    expect(installHtml.match(/data-hraness-platform-badges/gu)).toHaveLength(1)
    expect(installHtml).toContain("<summary>Build from source</summary>")
    expect(installHtml).toContain("installs locked dependencies, builds the SDK and CLI")
    expect(installHtml).toContain(sourceInstall.guideUrl)
    expect(installHtml).toContain(archiveInstall.alternateSkillCommand)
    expect(plainCode(installHtml)).toContain(archiveInstall.command)
    expect(html).not.toContain("{{SITE")
  })

  test("renders a progressively enhanced release-install copy target", async () => {
    const [html, build, client] = await Promise.all([
      readBuilt("index.html"),
      readSource("site-content.ts"),
      readSource("copy-command.ts"),
    ])

    expect(build).toContain("function renderCopyCommand(options: CopyCommandOptions)")
    expect(html.match(/data-copy-command(?:>|\s)/gu)).toHaveLength(1)
    const command = html.match(/<code\b[^>]*data-copy-command-value[^>]*>([\s\S]*?)<\/code>/u)?.[1]
    expect(command).toBeDefined()
    expect(plainCode(command!)).toBe(archiveInstall.skillCommand)
    expect(html.match(/For Claude Code: <code class="[A-Za-z_][A-Za-z0-9_ -]*">([^<]+)<\/code>/u)?.[1])
      .toBe(archiveInstall.alternateSkillCommand)
    expect(html).toContain('aria-label="Copy the Agent Skill install command"')
    expect(html).toContain("data-copy-command-button hidden type=\"button\">Copy</button>")
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-describedby="skill-install-copy-status"')
    expect(client).toContain("button.hidden = false")
    expect(client).toContain("navigator.clipboard.writeText(value)")
    expect(client).toContain('ownerDocument.execCommand("copy")')
    expect(client).toContain('button.addEventListener("click"')
    expect(client).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/)
  })

  test("presents finished films, revision and starting paths before installation and trust details", async () => {
    const html = await readSource("index.html")
    const sections = [
      'id="examples"',
      'id="revision"',
      'id="start"',
      'id="install"',
      'id="design"',
      'id="questions"',
      'id="closing"',
    ]
    const positions = sections.map(section => html.indexOf(section))
    const navigation = /<nav aria-label="Primary" class="\{\{SITE_NAVIGATION_CLASS\}\}">([\s\S]*?)<\/nav>/u.exec(html)?.[1] ?? ""

    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect([...navigation.matchAll(/href="([^"]+)"/gu)].map(match => match[1])).toEqual([
      "#examples",
      "/docs",
      "/blog",
      "https://github.com/hraness/slopcamera",
      "#install",
    ])
    expect(navigation).toContain('href="#examples">Films</a>')
    expect(navigation).toContain('class="site-action {{SITE_NAVIGATION_ACTION_CLASS}}" data-emphasis="primary" href="#install"')
    expect(html).not.toContain('class="docs-index"')
    for (const role of [
      "install",
      "questions",
      "cta",
    ]) {
      expect(html).toContain(`data-hraness-marketing="${role}"`)
    }
    expect(html).not.toContain('data-hraness-marketing="maker"')
    expect(html).not.toContain("Diátaxis")
  })

  test("states the MCP subset alongside the broader local interfaces", async () => {
    const html = await readBuilt("index.html")

    expect(html).toContain('href="/docs/tutorials/codex">Agent Skill for Codex</a>')
    expect(html).toContain('href="/docs/explanation/choose-an-interface">CLI</a>')
    expect(html).toContain('href="/docs/reference/sdk">TypeScript SDK</a>')
    expect(html).toContain('href="/docs/reference/mcp-tools">fixed MCP toolset</a>')
    expect(html).toContain("MCP does not expose every CLI command.")
    expect(html).not.toContain("Each one reaches the same project and the same operations.")
    expect(html).not.toMatch(/aria-label="(?:Agent Skill|CLI|TypeScript SDK|MCP) example"/u)
  })

  test("teaches through reviewed outputs, editable sources and canonical workflow guides", async () => {
    const html = await readBuilt("index.html")
    const ids = [...html.matchAll(/data-example-id="([^"]+)"/gu)].map(match => match[1])
    expect(ids).toEqual(homepageExamples().map(example => example.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const example of homepageExamples()) {
      expect(html).toContain(homepageExampleName(example.id))
      expect(html).toContain(exampleUrl(example.poster))
      expect(html).toContain(`/docs/${example.guideSlug}`)
    }
    // Every rendered example links to its guide and its source files.
    const figures = html.match(/<figure class="slopcamera-example"/gu) ?? []
    expect(figures.length).toBe(homepageExamples().length)
    expect(html.match(/>Guide<\/a>/gu)).toHaveLength(figures.length)
    expect(html.match(/>Source<\/a>/gu)).toHaveLength(figures.length)
    // Work leads the homepage; detailed command selection lives in the docs.
    expect(html.match(/class="slopcamera-screening-item"/gu)).toHaveLength(4)
    expect(html).toContain('class="slopcamera-revision-pair"')
    expect(html).toContain('<h3>Original</h3>')
    expect(html).toContain('<h3>Revised</h3>')
    expect(html).toContain('<a href="/docs/reference/techniques">every technique</a>')
    expect(html).not.toContain('class="slopcamera-technique-group"')
    expect(html).not.toMatch(/<table\b|class="table-wrap"/)
    expect(html).not.toMatch(/AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN|SLOPCAMERA_CACHE_DIR/)
  })

  test("offers outcome-led starting paths and the next precise revision", async () => {
    const html = await readSource("index.html")
    for (const path of ["/docs/tutorials/first-animation", "/docs/tutorials/first-native-film", "/docs/how-to/edit-video", "/docs/how-to/generate-media", "/docs/tutorials/first-diagram"]) {
      expect(html).toContain(`href="${path}"`)
    }
    expect(html).toContain("Your agent writes the source and keeps it ready for the next version.")
    expect(html).toContain("{{EXAMPLE_REVISION}}")
  })

  test("explains the architecture and trust boundary in plain language", async () => {
    const html = await readSource("index.html")
    const searchableHtml = html.replace(/\s+/gu, " ")

    expect(html).toContain("Original recordings and imported media stay unchanged")
    expect(html).toContain("Slopcamera keeps editable source beside each render")
    expect(searchableHtml).toContain("Native Python jobs require <code>--allow-trusted-code</code>")
    expect(searchableHtml).toContain("your Vercel AI Gateway account")
    expect(searchableHtml).toContain("prepaid Hraness Credits for hosted image generation")
    expect(searchableHtml).toContain("There is no Slopcamera account or hosted project database")
    expect(searchableHtml).toContain("Media uploads require acknowledgement")
    expect(searchableHtml).toContain("without an operating-system sandbox")
    expect(html).not.toMatch(/<form|type="password"|\/api\//)
  })

  test("uses the camera identity without rewriting historical mythology", async () => {
    const html = await readSource("index.html")
    expect(html.replace(/\s+/gu, " ")).toContain(searchDescription)
    // The share card carries the camera mark; its alt names the product.
    expect(html).toContain(`content="${homeSocialImage.alt}"`)
    expect(html).not.toMatch(/Atum|solar barque|Benben|hieroglyph|pharaoh|ankh/u)
  })

  test("keeps the page semantic, linkable, keyboard-operable, and responsive", async () => {
    const [html, notFound, css] = await Promise.all([
      readSource("index.html"),
      readSource("404.html"),
      readSource("styles.css"),
    ])
    const fragmentLinks = [...html.matchAll(/href="#([^"]+)"/gu)].map(match => match[1])
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/gu)].map(match => match[1]))

    expect(html.match(/<h1\b/gu)).toHaveLength(1)
    expect(html).toContain('<a class="skip-link {{SITE_SKIP_CLASS}}" href="#main">')
    expect(html).toContain('<nav aria-label="Primary" class="{{SITE_NAVIGATION_CLASS}}">')
    expect(html).toContain('<div class="topbar-actions {{SITE_ACTIONS_CLASS}}">')
    expect(html).toContain('<main data-hraness-marketing-preset="editorial" id="main" tabindex="-1">')
    expect(html).not.toMatch(/<section(?![^>]*aria-labelledby)/)
    expect(fragmentLinks.every(fragment => ids.has(fragment))).toBe(true)
    expect(renderStatusPage().match(/<h1\b/gu)).toHaveLength(1)
    expect(notFound).toContain('<a class="skip-link {{SITE_SKIP_CLASS}}" href="#main">')
    expect(notFound).toContain('<main id="main" tabindex="-1">\n      {{STATUS_PAGE}}\n    </main>')
    expect(notFound).toContain('<script defer src="{{STATUS_PAGE_ASSET}}"></script>')
    expect(notFound).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(notFound).toContain('<meta name="theme-color" content="#eff1f5" media="(prefers-color-scheme: light)">')
    expect(notFound).toContain('<meta name="theme-color" content="#1e1e2e" media="(prefers-color-scheme: dark)">')
    expect(css).toContain(":where(a, button, [tabindex]):focus-visible")
    const headerInk = '.topbar nav[aria-label="Primary"] > .site-action {\n  --gold-ink: var(--ink);\n}\n@media (forced-colors: active) {\n  .topbar nav[aria-label="Primary"] > .site-action {\n    --gold-ink: var(--primary-foreground);\n  }\n}'
    expect(css.split(headerInk)).toHaveLength(2)
    expect(css.replace(headerInk, "")).not.toContain(".topbar")
    expect(css).not.toContain(".route-state")
    expect(css).not.toMatch(/\.reading-(?:article|card|index|module)/u)
    expect(css).toContain("@media (max-width: 64rem)")
    expect(css).toContain("@media (max-width: 48rem)")
    expect(await readBuilt(builtAssets.stylesPath.slice(1))).toMatch(/@media\s*\(width\s*<=\s*34rem\)/u)
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain("@media (forced-colors: active)")
  })

  test("owns one shared appearance menu as the final action in every retained header", async () => {
    const documents = await Promise.all([
      readBuilt("index.html"),
      readBuilt("404.html"),
    ])
    for (const document of documents) {
      expect(document.match(/data-hraness-appearance-menu/gu)).toHaveLength(1)
      expect(document).toMatch(
        /<header class="topbar [^"]+">[\s\S]*?<div class="topbar-actions [^"]+">[\s\S]*?<nav aria-label="Primary" class="[^"]+">[\s\S]*?<\/nav>\s*<div[^>]*data-hraness-appearance-menu[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/header>/u,
      )
      const footerStart = document.indexOf('data-slot="hraness-site-footer"')
      expect(footerStart).toBeGreaterThan(0)
      expect(document.slice(footerStart)).not.toContain("data-hraness-appearance-menu")
      expect(document).not.toContain('class="appearance"')
      expect(document).not.toContain("data-theme-choice")
      expect(document).toContain('aria-label="Appearance: System"')
      expect(document).toContain('aria-haspopup="menu"')
      expect(document).toContain('aria-label="Appearance"')
      expect(document.match(/role="menuitemradio"/gu)).toHaveLength(3)
      expect([...document.matchAll(/data-theme-value="(light|dark|system)" role="menuitemradio"/gu)]
        .map(match => match[1])).toEqual(["light", "dark", "system"])
    }
  })

  test("ships the shared preset attributions without exposing its checker or private evidence", async () => {
    expect(builtAssets.siteAttributions.map(item => item.path)).toEqual([
      "marketing-preset/LICENSE", "marketing-preset/fonts/instrument-serif/OFL.txt",
      "marketing-preset/fonts/instrument-serif/UPSTREAM.md", "marketing-preset/marketing-assets/UPSTREAM.md",
      "lantern-material/LICENSE",
    ])
    for (const item of builtAssets.siteAttributions) {
      const bytes = await readFile(join(appDirectory, "dist", item.path))
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(item.sha256)
    }
  })

  test("uses the shared premium marketing system", async () => {
    const [css, html] = await Promise.all([readSource("styles.css"), readSource("index.html")])

    expect(css).toContain('--font-body: "Nebula Sans", ui-sans-serif, system-ui')
    expect(css).toContain("--font-sans: var(--font-body)")
    expect(css).toContain("--hraness-site-accent: var(--gold)")
    expect(css).toContain("--hraness-marketing-radius: 0.625rem")
    expect(css).toContain(':root:not([data-hraness-theme="paper"])')
    expect(css).toContain('html[data-theme="dark"]')
    expect(css).not.toMatch(/--font-display|ui-serif|Baskerville|text-transform:\s*uppercase|letter-spacing:\s*0\.\d+em/u)
    expect(css).not.toMatch(/transition|animation|@keyframes/u)
    const headerInk = '.topbar nav[aria-label="Primary"] > .site-action {\n  --gold-ink: var(--ink);\n}\n@media (forced-colors: active) {\n  .topbar nav[aria-label="Primary"] > .site-action {\n    --gold-ink: var(--primary-foreground);\n  }\n}'
    expect(css.split(headerInk)).toHaveLength(2)
    expect(css.replace(headerInk, "")).not.toContain(".topbar")
    expect(css).toContain(".transcript")
    expect(css).toContain(".origin-note")
    expect(css).not.toMatch(/@font-face|url\([^)]*\.woff/)
    expect(html).toContain('<h1 class="hraness-marketing-hero__heading" id="page-title">Give your agent a multimedia studio.</h1>')
    expect(html).toContain("{{EXAMPLE_HERO}}")
    expect(html).toContain("{{EXAMPLE_GALLERY}}")
    expect(html).not.toContain("Illustrative Slopcamera terminal session")
    expect(html).toContain('<main data-hraness-marketing-preset="editorial"')
    expect(html).toContain('data-hraness-material="lantern"')
    expect(html).not.toContain('class="hraness-marketing-field"')
    expect(await readSource("404.html")).not.toContain("data-hraness-marketing-preset")
    expect(await readSource("preview.html")).not.toContain("data-hraness-marketing-preset")
    expect(html).not.toContain("Ben Guo")
    expect(html).not.toContain('class="hraness-marketing-hero__eyebrow"')
    expect(html).toContain('class="hraness-marketing-hero slopcamera-product-hero" data-align="start"')
    expect(css).toContain("grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr)")
    for (const declaration of ["white-space: pre", "overflow-wrap: normal", "word-break: normal", "overflow: auto"]) {
      expect(css).toContain(declaration)
    }
    expect(html).not.toMatch(/<h1[^>]*>[^<]*(?:bounded|exact|authority|custody|immutable|inspectable|canonical|projection|receipt)/iu)
    const builtCss = await readBuilt(builtAssets.siteFoundationPath.slice(1))
    expect(builtCss).toMatch(/font-family:\s*"?Nebula Sans"?/u)
    expect(builtCss).toContain("Instrument Serif")
    expect(builtCss).toContain(".hraness-marketing-field")
    expect(builtCss).toContain(".hraness-marketing-hero")
    expect(builtCss).toContain(".hraness-marketing-interface-grid")
    const book = builtAssets.siteArtifacts.find(item => /\/NebulaSans-Book-[A-Za-z0-9_-]+\.woff2$/u.test(item.path))
    expect(book).toBeDefined()
    expect(book!.bytes).toBeGreaterThan(60_000)
    expect((await readFile(join(appDirectory, "dist", book!.path))).byteLength).toBe(book!.bytes)
    expect(builtAssets.siteArtifacts.filter(item => item.path.endsWith(".woff2"))).toHaveLength(14)
    expect(builtAssets.siteArtifacts.some(item => /PROVENANCE|\.(?:otf|json|map|ts|js)$/u.test(item.path))).toBe(false)
  })

  test("ships share cards only from the shared web-discovery template", async () => {
    // One declaration drives every card; pages pass only their own copy.
    expect(slopcameraSocialSite.name).toBe("SlopCamera")
    expect(slopcameraSocialSite.domain).toBe("slopcamera.com")
    // The card's header is the site's sticky header: the same foil mask, the
    // name as the nav shows it, and the palette every page's <html> declares.
    expect(slopcameraSocialSite.brand).toBe("SlopCamera")
    expect(slopcameraSocialSite.brandMark).toBe(`data:image/svg+xml;base64,${
      Buffer.from(await readSource("marks/slopcamera.svg")).toString("base64")}`)
    expect(await readSource("site-foil.css")).toContain('--hraness-foil-mask: url("./marks/slopcamera.svg")')
    expect(slopcameraSocialSite.palette).toBe("catppuccin")
    for (const template of ["index.html", "doc.html", "blog.html"]) {
      expect(await readSource(template)).toContain('data-palette="catppuccin"')
    }
    expect(slopcameraSocialSite.icon).toBeUndefined()
    expect(slopcameraSocialSite.theme).toBeUndefined()
    expect(homeSocialImage).toMatchObject({ file: "og.png", url: "https://slopcamera.com/og.png", width: 1200, height: 630 })
    // The home card is the header over the hero: the hero H1, no eyebrow
    // (the hero has none), and no tagline repeated beneath it.
    expect(homeSocialImage.page).toEqual({ headline: productMessaging.hero.heading, description: "", layout: "product" })
    expect(homeSocialImage.alt).toBe(`SlopCamera: ${productMessaging.hero.heading}`)
    expect(socialImages).toHaveLength(1 + 1 + blogPosts.length + docPages.length)
    expect(new Set(socialImages.map(image => image.file)).size).toBe(socialImages.length)
    for (const image of socialImages.slice(1)) {
      expect(image.file).toMatch(/^og\/(?:blog|docs)(?:\/[a-z0-9/-]+)?\.png$/u)
      expect(Object.keys(image.page ?? {}).sort()).toEqual(["description", "eyebrow", "headline", "path"])
      expect(image.page?.eyebrow).toMatch(/^(?:Blog|Documentation|Tutorial|Guide|Reference|Explanation|Comparison|Release|Integration|Native engines)$/u)
    }
    // The one-shot post compares two routes, so its card reads as a comparison.
    expect(socialImageForDocument("blog/one-shot-render-vs-installed-techniques.html").page).toMatchObject({
      headline: "What the second render takes",
      eyebrow: "Comparison",
      path: "/blog/one-shot-render-vs-installed-techniques",
    })
    const doc = socialImageForDocument("docs/how-to/edit-video.html")
    expect(doc).toMatchObject({ file: "og/docs/how-to/edit-video.png", page: { headline: "Edit and deliver video", eyebrow: "Guide", path: "/docs/how-to/edit-video" } })
    expect(doc.alt).toBe("Edit and deliver video, from SlopCamera")
    for (const image of [homeSocialImage, doc]) {
      const png = await renderSocialImage(image)
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
      expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      expect(view.getUint32(16)).toBe(1200)
      expect(view.getUint32(20)).toBe(630)
      expect(png.byteLength).toBeLessThan(1024 * 1024)
    }
  })

  test("fits every declared share card as written", () => {
    // Each card keeps its own headline and description whole: no clause cut,
    // no smaller or three-line headline, nothing stripped, and no finding of
    // any kind from web-discovery's fit review (not strict, so the v0.12
    // description and eyebrow codes count too).
    for (const image of socialImages) {
      const fit = socialImageFitFor(image)
      expect({ file: image.file, findings: fit.findings.map(finding => finding.code) }).toEqual({ file: image.file, findings: [] })
      expect({ file: image.file, issues: fit.issues }).toEqual({ file: image.file, issues: [] })
      expect(fit.description?.cut ?? "none").toBe("none")
      expect(fit.headline).toMatchObject({ reduced: false, threeLine: false, truncated: false })
      expect(fit.removed).toEqual([])
    }
  })

  test("points every docs and blog page at its own shared-template card", async () => {
    for (const document of ["docs/how-to/edit-video.html", blogDocumentForPost(blogPosts[0]!), blogIndexDocument]) {
      const html = await readBuilt(document)
      const image = socialImageForDocument(document)
      expect(html).toContain(`<meta property="og:image" content="${image.url}">`)
      expect(html).toContain(`<meta name="twitter:image" content="${image.url}">`)
      expect(html).toContain(`<meta property="og:image:alt" content="${image.alt.replaceAll("'", "&#39;")}">`)
      expect((await readFile(join(appDirectory, "dist", image.file))).byteLength).toBeGreaterThan(0)
    }
  })

  test("ships correctly sized icon assets", async () => {
    const apple = new Uint8Array(await Bun.file(join(appDirectory, "src/apple-touch-icon.png")).arrayBuffer())
    const icon = await readSource("icon.svg")
    const appleView = new DataView(apple.buffer, apple.byteOffset, apple.byteLength)

    expect(Array.from(apple.slice(1, 4))).toEqual([80, 78, 71])
    expect(appleView.getUint32(16)).toBe(180)
    expect(appleView.getUint32(20)).toBe(180)
    expect(icon).toContain('viewBox="0 0 64 64"')
    expect(icon).toContain('fill="#090a12"')
    expect(icon).toContain('stop-color="#f6b94a"')
  })

  test("keeps the shared footer in document flow without fixed-bar scroll compensation", async () => {
    const [css, footerCss, html] = await Promise.all([
      readSource("styles.css"),
      readFile(fileURLToPath(import.meta.resolve("@hraness/site-footer/stylex.css")), "utf8"),
      readBuilt("index.html"),
    ])
    const footerClasses = new Set(/<footer [^>]*\bclass="([^"]*)"[^>]*\bid="hraness-site-footer"/u.exec(html)?.[1]?.split(/\s+/u) ?? [])
    expect(footerClasses.size).toBeGreaterThan(10)
    const tokens = installedFooterTokens(footerCss, footerClasses)
    for (const name of ["control-block-size", "social-target"]) {
      expect(tokens.fine[name]).toBeDefined()
      expect(tokens.coarse[name]).toBeDefined()
    }
    // Check both the footprint and the visible bar; an in-flow root alone
    // would not catch the former fixed inner bar. Consent UI is separate.
    const innerClasses = new Set(/<div class="(hraness-site-footer__inner[^"]*)"/u.exec(html)?.[1]?.split(/\s+/u) ?? [])
    expect(innerClasses.size).toBeGreaterThan(10)
    const positionRules = [...footerCss.matchAll(/\.([\w-]+)\s*\{\s*position:\s*([^;]+);\s*\}/gu)]
    for (const classes of [footerClasses, innerClasses]) {
      const positions = positionRules.filter(match => classes.has(match[1]!)).map(match => match[2])
      // An omitted declaration uses CSS's initial static positioning.
      expect(positions.every(position => position === "static" || position === "relative")).toBe(true)
    }
    expect(css).not.toContain("scroll-padding-block-end")
    expect(css).toContain("body > main { flex: 1; min-inline-size: 0; }")
  })

  test("keeps the static shell fingerprinted and analytics explicit", async () => {
    const html = await readSource("index.html")
    const css = await readSource("styles.css")
    const theme = await readSource("theme.ts")
    const copyCommand = await readSource("copy-command.ts")
    const analytics = await readSource("analytics.ts")
    const build = await readFile(join(appDirectory, "scripts/build.ts"), "utf8")
    const manifest = JSON.parse(
      await readFile(join(appDirectory, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const rootManifest = JSON.parse(
      await readFile(join(repositoryDirectory, "package.json"), "utf8"),
    ) as { workspaces?: { catalog?: Record<string, string> } }
    const localLockfile = await readFile(join(appDirectory, "bun.lock"), "utf8")

    expect(manifest.dependencies).toEqual({
      "@hraness/design-kit": "github:hraness/design-kit#v0.35.0",
      "@hraness/design-kit-articles": "github:hraness/design-kit#v0.35.2",
      "@hraness/design-kit-status": "github:hraness/design-kit#v0.21.0",
      "@hraness/site-footer": "https://github.com/hraness/site-footer/releases/download/v0.20.5/hraness-site-footer-0.20.5.tgz",
      "@hraness/posthog": "https://github.com/hraness/posthog/releases/download/v0.3.9/hraness-posthog-0.3.9.tgz",
      "@hraness/ui": "github:hraness/ui#v0.5.25",
      "@hraness/web-discovery": "github:hraness/web-discovery#v0.13.0",
      "@resvg/resvg-js": "2.6.2",
      "posthog-js": "1.422.5",
      "react": "19.2.3",
      "react-dom": "19.2.3",
      "satori": "0.33.4",
    })
    expect(manifest.devDependencies).toEqual({
      "@babel/core": "7.29.7",
      "@hraness/direct": "github:hraness/direct#f19d0fdac747e4359d6e2f915537cc826269b2d7",
      "@stylexjs/babel-plugin": "0.19.0",
      "@stylexjs/stylex": "0.19.0",
      "@types/babel__core": "7.20.5",
      "@types/bun": "1.3.14",
      "@types/node": "24.13.3",
      "@types/react": "19.2.14",
      "@types/react-dom": "19.2.3",
      "lightningcss": "1.33.0",
      "parse5": "8.0.1",
      "playwright-core": "1.62.0",
      "typescript": "6.0.3",
      "vite": "8.2.1",
    })
    expect(rootManifest.workspaces?.catalog?.["posthog-js"]).toBeUndefined()
    expect(rootManifest.workspaces?.catalog?.["@hraness/design-kit"]).toBeUndefined()
    expect(localLockfile).toContain('"@hraness/design-kit": "github:hraness/design-kit#v0.35.0"')
    expect(localLockfile).toContain(
      '"@hraness/site-footer": "https://github.com/hraness/site-footer/releases/download/v0.20.5/hraness-site-footer-0.20.5.tgz"',
    )
    expect(localLockfile).toContain('"@hraness/ui": "github:hraness/ui#v0.5.25"')
    expect(localLockfile).toContain('"@hraness/design-kit-articles": "github:hraness/design-kit#v0.35.2"')
    expect(localLockfile).toContain('"@hraness/web-discovery": "github:hraness/web-discovery#v0.13.0"')
    expect(localLockfile).toContain('"@resvg/resvg-js": "2.6.2"')
    expect(localLockfile).toContain('"posthog-js": "1.422.5"')
    for (const [name, version] of Object.entries(manifest.devDependencies ?? {})) {
      expect(localLockfile).toContain(`"${name}": "${version}"`)
    }
    expect(localLockfile).not.toContain("catalog:")
    expect(assertAuthoredShellBudget(await readAuthoredSource("index.html"))).toBeLessThan(46_600)
    // Bound the full sealed document separately, including compiled classes and content producers.
    const emittedBytes = assertBuiltHtmlBudget(await readBuilt("index.html"))
    expect(builtAssets.siteArtifacts.find(artifact => artifact.path === "index.html")?.bytes).toBe(emittedBytes)
    expect(emittedBytes).toBeLessThan(102_800)
    expect(new TextEncoder().encode(css).byteLength).toBeLessThan(36_000)
    expect(new TextEncoder().encode(theme).byteLength).toBeLessThan(3_000)
    expect(new TextEncoder().encode(copyCommand).byteLength).toBeLessThan(4_000)
    expect(html).not.toMatch(/https:\/\/[^"']+\.(?:css|js)/)
    expect(html).toContain("{{SITE_STYLES}}")
    expect(html).toContain('<script src="{{THEME_ASSET}}"></script>')
    expect(html.indexOf('<script src="{{THEME_ASSET}}"></script>'))
      .toBeLessThan(html.indexOf("{{SITE_STYLES}}"))
    expect(html).toContain("{{APPEARANCE_MENU}}")
    expect(html).toContain("{{ANALYTICS_SCRIPT}}")
    expect(html.match(/<script\b/gu)).toHaveLength(2)
    expect(theme).toContain('from "@hraness/design-kit/browser"')
    expect(theme).toContain('storageKey: "slopcamera.appearance"')
    expect(theme).toContain('import { installCopyCommands } from "./copy-command"')
    expect(theme).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/)
    expect(copyCommand).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/)
    expect(analytics).toContain("...posthogBrowserOptions(")
    expect(analytics).toContain("const sanitize = createBeforeSend(")
    expect(analytics).toContain("before_send: event => consent.allowed() ? sanitize(event) : null")
    expect(analytics).not.toMatch(/identify\(|autocapture:\s*true|capture_exceptions:\s*true/)
    const options = posthogBrowserOptions("https://us.i.posthog.com")
    expect(options).toMatchObject({
      advanced_disable_flags: true,
      autocapture: false,
      capture_exceptions: false,
      capture_pageleave: true,
      capture_pageview: true,
      capture_performance: { web_vitals: true, web_vitals_allowed_metrics: ["LCP", "CLS", "FCP", "INP"], web_vitals_attribution: false },
      cookieless_mode: "always",
      defaults: "2026-05-30",
      disable_external_dependency_loading: true,
      disable_session_recording: true,
      disable_surveys: true,
      disableDeviceModel: true,
      mask_personal_data_properties: false,
      persistence: "memory",
      person_profiles: "never",
      rate_limiting: { events_per_second: 2, events_burst_limit: 12 },
      respect_dnt: true,
    })
    expect(build).toContain('createHash("sha256")')
    expect(build).toContain("Bun.build")
    expect(build).toContain('format: "iife"')
    expect(await readSource("site-foundation.css"))
      .toContain('@import "@hraness/design-kit/compiler-foundation.css"')
    expect(await readFile(join(appDirectory, "scripts/build-site.ts"), "utf8"))
      .toContain('import.meta.resolve("@hraness/design-kit/fonts.css")')
    expect(await readSource("site-content.ts")).toContain("renderAppearanceMenu()")
    expect(await readSource("site-content.ts")).toContain("renderCopyCommand({")
    expect(build).toContain('environment.VERCEL_ENV !== "production"')
    expect(build).not.toContain("docsTemplate")
    expect(build).not.toContain('outputDirectory, "docs"')
  })

  test("honors current and legacy Do Not Track preferences before the cookieless bootstrap", async () => {
    for (const enabled of ["1", "yes", "true", " YES "]) {
      expect(doNotTrackEnabled({ doNotTrack: enabled }, {})).toBe(true)
      expect(doNotTrackEnabled({ msDoNotTrack: enabled }, {})).toBe(true)
      expect(doNotTrackEnabled({}, { doNotTrack: enabled })).toBe(true)
    }
    for (const disabled of [undefined, null, "0", "no", "false", "unspecified"]) {
      expect(doNotTrackEnabled({ doNotTrack: disabled, msDoNotTrack: disabled }, { doNotTrack: disabled })).toBe(false)
    }
    let enabled = false
    const beforeSend = createBeforeSend("phc_testtoken", () => new URL("https://slopcamera.com/"), () => false, () => enabled)
    const event = { event: "$pageview", properties: { token: "phc_testtoken", distinct_id: posthogCookielessDistinctId, $cookieless_mode: true, $raw_user_agent: "test", $current_url: "https://slopcamera.com/" }, uuid: "0198c6a7-7c00-7000-8000-000000000000" }
    expect(beforeSend(event)).not.toBeNull()
    enabled = true
    expect(beforeSend(event)).toBeNull()
    const bootstrap = await readSource("analytics.ts")
    expect(bootstrap).toContain("createBeforeSend(token, () => window.location, isNotFound, dntEnabled)")
    expect(bootstrap).toContain("if (initialized || dntEnabled() || !consent?.allowed() || !shouldInitializeAnalytics(window.location, token)")
    expect(bootstrap.indexOf("if (initialized || dntEnabled()")).toBeLessThan(bootstrap.indexOf("posthog.init("))
    expect(bootstrap).toContain("|| !installConsentTransport(posthog, consent)) return")
  })

  test("classifies every public route and scrubs values without rebuilding the property set", () => {
    expect(shouldInitializeAnalytics({ protocol: "https:", hostname: "slopcamera.com" }, "phc_testtoken")).toBe(true)
    expect(shouldInitializeAnalytics({ protocol: "https:", hostname: "www.slopcamera.com" }, "phc_testtoken")).toBe(true)
    expect(shouldInitializeAnalytics({ protocol: "https:", hostname: "preview.slopcamera.com" }, "phc_testtoken")).toBe(false)
    expect(shouldInitializeAnalytics({ protocol: "https:", hostname: "slopcamera.com" }, "not-a-token")).toBe(false)
    expect(classifyRoute("/", false)).toMatchObject({ canonical_path: "/", page_kind: "home" })
    expect(classifyRoute("/docs/how-to/music-video/", false)).toMatchObject({ canonical_path: "/docs/how-to/music-video", page_kind: "docs" })
    expect(classifyRoute("/blog/feynobg", false)).toMatchObject({ page_kind: "article", content_group: "blog" })
    expect(classifyRoute("/anything", true)).toEqual({ canonical_path: "/404", page_kind: "not_found" })

    const timestamp = new Date("2026-08-19T12:00:00.000Z")
    const sanitized = sanitizeEvent({
      event: "$pageview",
      properties: {
        $browser: "Chrome",
        $cookieless_mode: true,
        $current_url: "https://www.slopcamera.com/?private=value&utm_campaign=launch#fragment",
        $pathname: "/",
        $raw_user_agent: "Slopcamera test browser",
        $referrer: "https://example.com/private?q=1",
        $referring_domain: "example.com",
        analytics_schema_version: 99,
        distinct_id: posthogCookielessDistinctId,
        email: "someone@example.com",
        site_id: "wrong",
        token: "phc_testtoken",
      },
      timestamp,
      uuid: "0198c6a7-7c00-7000-8000-000000000000",
    }, "phc_testtoken")
    expect(sanitized?.timestamp).toBe(timestamp)
    expect(sanitized?.properties).toMatchObject({
      $browser: "Chrome",
      $current_url: "https://slopcamera.com/?utm_campaign=launch",
      $host: "slopcamera.com",
      $referrer: "https://example.com",
      $referring_domain: "example.com",
      analytics_schema_version: POSTHOG_SCHEMA_VERSION,
      site_id: "slopcamera",
      traffic_channel: "referral",
      utm_campaign: "launch",
    })
    expect(sanitized?.properties).not.toHaveProperty("email")

    const base = { $cookieless_mode: true, $current_url: "https://slopcamera.com/", $raw_user_agent: "ua", distinct_id: posthogCookielessDistinctId, token: "phc_testtoken" }
    const uuid = "0198c6a7-7c00-7000-8000-000000000001"
    expect(sanitizeEvent({ event: "$autocapture", properties: base, uuid }, "phc_testtoken")).toBeNull()
    expect(sanitizeEvent({ event: "$pageview", properties: { ...base, distinct_id: "persisted-id" }, uuid }, "phc_testtoken")).toBeNull()
    expect(sanitizeEvent({ event: "$pageview", properties: { ...base, $cookieless_mode: false }, uuid }, "phc_testtoken")).toBeNull()
    expect(sanitizeEvent({ event: "$pageview", properties: { ...base, $current_url: "https://slopcamera-git-x.vercel.app/" }, uuid }, "phc_testtoken")).toBeNull()
    expect(sanitizeEvent({ event: "$pageview", properties: { ...base, token: "phc_other" }, uuid }, "phc_testtoken")).toBeNull()
  })

  test("allows only the standard's CTA, outbound, install-copy and 404 shapes", () => {
    const base = {
      $cookieless_mode: true,
      $current_url: "https://slopcamera.com/",
      $raw_user_agent: "Mozilla/5.0 Test",
      distinct_id: posthogCookielessDistinctId,
      token: "phc_testtoken",
    }
    const uuid = "0198c6a7-7c00-7000-8000-000000000009"
    expect(ctaProperties("#install", "hero")).toEqual({ cta: "install", placement: "hero" })
    expect(ctaProperties("https://github.com/hraness/slopcamera", "nav")).toEqual({ cta: "github", placement: "nav", target_host: "github.com" })
    expect(ctaProperties("/docs/how-to/music-video", "hero")).toBeNull()
    expect(ctaProperties("#install", null)).toBeNull()
    expect(outboundProperties("https://github.com/hraness/slopcamera", "nav")).toEqual({ target_host: "github.com", placement: "nav", link_kind: "github" })
    expect(outboundProperties("/docs", "nav")).toBeNull()
    expect(outboundProperties("https://slopcamera.com/docs", "nav")).toBeNull()
    expect(installMethodFor("bun add --global @hraness/slopcamera")).toBe("bun")
    expect(installMethodFor("npm install -g @hraness/slopcamera")).toBe("npm")
    expect(requestedPath(`/${"a".repeat(400)}`)).toHaveLength(256)

    const cta = sanitizeEvent({
      event: ctaClickedEvent,
      properties: { ...base, cta: "install", placement: "hero", place: "legacy", email: "a@b.c" },
      uuid,
    }, "phc_testtoken")
    expect(cta?.properties).toMatchObject({ cta: "install", placement: "hero" })
    expect(cta?.properties).not.toHaveProperty("place")
    expect(cta?.properties).not.toHaveProperty("email")
    expect(sanitizeEvent({ event: ctaClickedEvent, properties: { ...base, cta: "pricing", placement: "hero" }, uuid }, "phc_testtoken")).toBeNull()
    expect(sanitizeEvent({ event: ctaClickedEvent, properties: { ...base, cta: "install", placement: "closing" }, uuid }, "phc_testtoken")).toBeNull()

    const copied = sanitizeEvent({ event: installCommandCopiedEvent, properties: { ...base, install_method: "curl", placement: "inline", command: "secret" }, uuid }, "phc_testtoken")
    expect(copied?.properties).toMatchObject({ install_method: "curl", placement: "inline" })
    expect(copied?.properties).not.toHaveProperty("command")
    expect(sanitizeEvent({ event: installCommandCopiedEvent, properties: base, uuid }, "phc_testtoken")).toBeNull()
    expect(sanitizeEvent({ event: outboundLinkOpenedEvent, properties: { ...base, target_host: "slopcamera.com", placement: "nav" }, uuid }, "phc_testtoken")).toBeNull()
    expect(sanitizeEvent({ event: pageNotFoundEvent, properties: { ...base, requested_path: "/missing?x=1" }, uuid }, "phc_testtoken", { notFound: () => true })?.properties)
      .toMatchObject({ requested_path: "/missing", page_kind: "not_found" })
    expect(sanitizeEvent({ event: "checkout started", properties: base, uuid }, "phc_testtoken")).toBeNull()
  })

  test("budgets exceptions per fingerprint and per minute", () => {
    const budget = new ExceptionBudget()
    expect(budget.allow("e_00000001", 0)).toBe(true)
    expect(budget.allow("e_00000001", 1)).toBe(true)
    expect(budget.allow("e_00000001", 2)).toBe(false)
    const results = Array.from({ length: 30 }, (_unused, index) => budget.allow(`e_${String(index + 2).padStart(8, "0")}`, 3))
    expect(results.filter(Boolean)).toHaveLength(18)
    expect(budget.allow("e_00000001", 60_002)).toBe(true)
    expect(sanitizeError(new Error("at https://slopcamera.com/?utm_source=x for a@b.co")).message).toBe("at https://slopcamera.com/ for [email]")
    expect(sanitizeError("not an error").message).toBe("Non-Error rejection")
    expect(errorFingerprint(new Error("same"))).toMatch(/^e_[0-9a-f]{8}$/u)
  })

  test("emits analytics only for a configured Production build", async () => {
    await ownedCompilation(async fixture => {
      const productionDirectory = await fixture.temporaryDirectory("slopcamera-web-production-")
      const secondDirectory = await fixture.temporaryDirectory("slopcamera-web-production-repeat-")
      const environment = {
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
        NEXT_PUBLIC_POSTHOG_KEY: "phc_test-token_value",
        VERCEL_ENV: "production",
      } as const
      // Each build runs in its own child process and output directory, so the
      // determinism comparison below holds whether they run serially or together.
      const [first, second] = await Promise.all([
        fixture.build({ environment, outputDirectory: productionDirectory }),
        fixture.build({ environment, outputDirectory: secondDirectory }),
      ])
      expect(first.analyticsPath).toMatch(/^\/assets\/analytics-[a-f0-9]{12}\.js$/u)
      expect(second.analyticsPath).toBe(first.analyticsPath)
      expect(second.previewStylesPath).toBe(first.previewStylesPath)
      expect(second.previewFoundationPath).toBe(first.previewFoundationPath)
      expect(second.previewArtifacts).toEqual(first.previewArtifacts)
      expect(first.previewArtifacts).toEqual(builtAssets.previewArtifacts)
      expect(second.siteArtifacts).toEqual(first.siteArtifacts)
      expect(second.siteFoundationPath).toBe(first.siteFoundationPath)
      expect(second.stylesPath).toBe(first.stylesPath)
      expect(first.stylesPath).not.toBe(builtAssets.stylesPath)

      const [html, notFound, preview, asset] = await Promise.all([
        readFile(join(productionDirectory, "index.html"), "utf8"),
        readFile(join(productionDirectory, "404.html"), "utf8"),
        readFile(join(productionDirectory, "preview.html"), "utf8"),
        readFile(join(productionDirectory, first.analyticsPath?.slice(1) ?? "missing"), "utf8"),
      ])
      expect(html).toContain(`<script src="${first.analyticsPath}" type="module"></script>`)
      expect(notFound).toContain(`<script src="${first.analyticsPath}" type="module"></script>`)
      expect(notFound).toContain('data-page-kind="not_found"')
      expect(preview).not.toMatch(/<script\b|analytics-|posthog|phc_test-token_value/iu)
      expect(asset).toContain("phc_test-token_value")
      expect(asset).toContain("https://us.i.posthog.com")
      expect(asset).toStartWith("/*! posthog-js 1.422.5")
      expect(asset).toContain("Apache License\n                           Version 2.0")
      // Qualified PostHog 1.422.5 plus regional preferences and withdrawal transport measure 340,673 B.
      expect(new TextEncoder().encode(asset).byteLength).toBeLessThan(350_000)
    })
  }, repeatedCompilationTimeoutMs)

  test("keeps missing, Preview, and unsupported-host analytics builds inert", async () => {
    await ownedCompilation(async fixture => {
      const outputDirectory = await fixture.temporaryDirectory("slopcamera-web-inert-")
      const preview = await fixture.build({
        environment: {
          NEXT_PUBLIC_POSTHOG_KEY: "phc_testtoken",
          VERCEL_ENV: "preview",
        },
        outputDirectory,
      })
      expect(preview.analyticsPath).toBeNull()
      expect(await readFile(join(outputDirectory, "index.html"), "utf8"))
        .not.toMatch(/analytics-|phc_testtoken/)

      await expect(fixture.build({
        environment: {
          NEXT_PUBLIC_POSTHOG_HOST: "https://example.com",
          NEXT_PUBLIC_POSTHOG_KEY: "phc_testtoken",
          VERCEL_ENV: "production",
        },
        outputDirectory,
      })).rejects.toThrow("NEXT_PUBLIC_POSTHOG_HOST must equal https://us.i.posthog.com")
    })
  }, compilationTimeoutMs)

  test("renders one closed static page with resolved content-hashed assets", async () => {
    const [html, notFound, rootFiles, assetFiles] = await Promise.all([
      readFile(join(appDirectory, "dist/index.html"), "utf8"),
      readFile(join(appDirectory, "dist/404.html"), "utf8"),
      readdir(join(appDirectory, "dist")),
      readdir(join(appDirectory, "dist/assets")),
    ])

    expect(html).toContain(`<link rel="stylesheet" href="${builtAssets.stylesPath}">`)
    expect(html).toContain(`<script src="${builtAssets.themePath}"></script>`)
    expect(builtAssets.analyticsPath).toBeNull()
    expect(html).not.toMatch(/analytics-/)
    expect(notFound).toContain(`<link rel="stylesheet" href="${builtAssets.stylesPath}">`)
    expect(notFound).toContain(`<script src="${builtAssets.themePath}"></script>`)
    expect(`${html}\n${notFound}`).not.toContain("{{")
    expect(rootFiles.sort()).toEqual([
      "404.html",
      "apple-touch-icon.png",
      "assets",
      "blog",
      "docs",
      "graphs",
      "icon.png",
      "icons",
      "index.html",
      "index.md",
      "lantern-material",
      "llms.txt",
      "marketing-preset",
      "marks",
      "og",
      "og.png",
      "preview.html",
      "robots.txt",
      "sitemap.md",
      "sitemap.xml",
    ])
    expect(assetFiles.sort()).toEqual([
      "examples",
      "launch",
      builtAssets.previewStylesPath.split("/").at(-1)!,
      builtAssets.statusPagePath.split("/").at(-1)!,
      builtAssets.stylesPath.split("/").at(-1)!,
      builtAssets.themePath.split("/").at(-1)!,
    ].sort())
    // The 404 is the shared design-kit status page: the homepage hero's
    // install action, three next links, one agent line, known pages for
    // "Did you mean", and its own enhancement script. Only the 404 loads it.
    expect(notFound).toContain(`<script defer src="${builtAssets.statusPagePath}"></script>`)
    expect(html).not.toContain(builtAssets.statusPagePath)
    expect(notFound).toContain('<main id="main" tabindex="-1">\n      <div class="hraness-status-page" data-hraness-status-routes="')
    expect(notFound).toContain('<h1 class="hraness-status-page__title">We can’t find that page</h1>')
    expect(notFound).toContain('data-emphasis="primary" data-foil="" href="/#install">Install Slopcamera</a>')
    expect(notFound.match(/class="hraness-status-page__next-link"/gu)).toHaveLength(3)
    expect(notFound).toContain('<p class="hraness-status-page__agent">')
    expect(notFound).toContain("[&quot;/docs/tutorials/first-diagram&quot;,&quot;Create and revise your first diagram&quot;]")
    expect(notFound).not.toMatch(/sitemap\.(?:md|xml)/u)

    const [stylesAsset, foundationAsset, themeAsset] = await Promise.all([
      readFile(join(appDirectory, "dist", builtAssets.stylesPath.slice(1)), "utf8"),
      readFile(join(appDirectory, "dist", builtAssets.siteFoundationPath.slice(1)), "utf8"),
      readFile(join(appDirectory, "dist", builtAssets.themePath.slice(1)), "utf8"),
    ])
    expect(foundationAsset).toContain(".hraness-design-theme-toggle__trigger")
    expect(stylesAsset).toContain("--hraness-site-footer-social-target")
    expect(stylesAsset).not.toContain("@import \"./dist/stylex.css\"")
    expect(stylesAsset).toMatch(/@media\s*\(pointer:\s*coarse\)/u)
    // The shared foil contract ships the metallic wordmark, its product-mark
    // mask, and the pointer-tracking controller.
    expect(foundationAsset).toContain(".hraness-foil-text")
    expect(foundationAsset).toContain(".hraness-foil-mark__paint")
    for (const document of [html, notFound]) {
      expect(document).toContain('class="wordmark x')
      expect(document).toContain('hraness-foil-text" data-foil=""')
      expect(document).toContain('class="hraness-foil-mark" data-foil=""')
      expect(document).toContain('class="hraness-foil-mark__paint"')
    }
    expect(themeAsset).toContain("data-foil")
    expect(themeAsset).toContain(paletteColors.catppuccin.light.background)
    expect(themeAsset).toContain(paletteColors.catppuccin.dark.background)
    expect(themeAsset).not.toContain("__SLOPCAMERA_")
    // The reviewed 0.8 refinement graph plus the documentation recipes is
    // under 298,500 bytes before compression; the shared-footer v0.12.x
    // optional-support styles and the host scroll-padding rule that keeps
    // keyboard focus above the fixed footer bar measured 310,206 together, and
    // the shared-footer v0.13.x organization-attribution styles measure
    // 313,229. The design-kit v0.13.0 union with the shared foil wordmark
    // contract measured 346,025, and the design-kit v0.21.0 status-page
    // snapshot for the shared 404 measured 354,712. The design-kit v0.22.0
    // union with the icon library and status snapshot measured 434,750; the
    // Catppuccin palette, contour material and shared hero rollout bring it to
    // 484,800. Keep
    // a strict ceiling over the full sealed union and captured foundation;
    // no import, recipe, snapshot, or repeated layered rule is discounted.
    expect(assertCombinedSiteCssBudget(stylesAsset, foundationAsset)).toBeLessThan(517_500)
    expect(assertThemeBundleBudget(themeAsset)).toBeLessThan(32_800)
    expect(themeAsset).not.toMatch(/react|next-themes|react-aria/i)
    expect(themeAsset).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/)
  })

  test("links the homepage comparison question to the dated comparison section", async () => {
    const [home, why] = await Promise.all([readBuilt("index.html"), readBuilt("docs/explanation/why-slopcamera.html")])
    const question = "How is Slopcamera different from Remotion or HyperFrames?"
    expect(home).toContain(`<summary>${question}</summary>`)
    expect(home).toContain('href="/docs/explanation/why-slopcamera#compared-with-other-tools"')
    expect(homeMarkdown).toContain(`### ${question}`)
    expect(homeMarkdown).toContain("(https://slopcamera.com/docs/explanation/why-slopcamera.md#compared-with-other-tools)")
    expect(why.match(/id="compared-with-other-tools"/gu)).toHaveLength(1)
    expect(why).toContain("Competitor details as of 28 September 2026.")
    // The comparison stays a visible answer; FAQPage markup keeps its reviewed set.
    const graphs = [...home.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)]
      .map(match => JSON.parse(match[1]!) as { "@graph"?: Array<Record<string, unknown>> })
    const faq = graphs.flatMap(graph => graph["@graph"] ?? []).find(node => node["@type"] === "FAQPage")
    expect(faq).toBeDefined()
    expect(JSON.stringify(faq)).not.toContain("Remotion")
  })

  test("publishes crawler discovery only for retained product pages", async () => {
    const [sitemap, notFound] = await Promise.all([
      readBuilt("sitemap.xml"),
      readSource("404.html"),
    ])
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
    expect(locations).toEqual([
      "https://slopcamera.com/",
      ...docPages.map(docsCanonicalUrl),
      "https://slopcamera.com/blog",
      ...indexableBlogPosts.map(post => `https://slopcamera.com${blogPostPath(post)}`),
    ])
    expect(locations.filter(location => location?.endsWith(".md"))).toEqual([])
    expect(await readBuilt("index.md")).toBe(homeMarkdown)
    expect(await readBuilt("llms.txt")).toBe(llmsTxt)
    expect(await readBuilt("sitemap.md")).toBe(sitemapMarkdown)
    expect(await readBuilt("robots.txt")).toBe(robotsTxt)
    for (const document of [sitemap, sitemapMarkdown, homeMarkdown, llmsTxt]) {
      expect(document).not.toMatch(/\/reading|paint-with-code|draw-faces-with-javascript|feynobg|painting-with-gaussians|gemini-omni|how-i-design-with-ai/u)
      expect(document).not.toContain("/preview")
    }
    for (const crawler of [
      "OAI-SearchBot",
      "ChatGPT-User",
      "GPTBot",
      "Claude-SearchBot",
      "Claude-User",
      "ClaudeBot",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "CCBot",
    ]) {
      expect(robotsTxt).toContain(`User-agent: ${crawler}`)
    }
    expect(robotsTxt).toContain("User-agent: *\nAllow: /")
    expect(robotsTxt).not.toMatch(/^\s*Disallow:/mu)
    expect(robotsTxt).toContain("Sitemap: https://slopcamera.com/sitemap.xml")
    expect(sitemap).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
    const images = [...sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/gu)].map(match => match[1])
    expect(images).toEqual([
      ...workflowExamples.filter(example => example.featured),
      ...docPages.flatMap(page => workflowExamples.filter(example => example.guideSlug === page.slug)),
    ].map(example => `https://slopcamera.com${exampleUrl(example.poster)}`))
    expect((await readdir(join(appDirectory, "dist/assets/examples"))).sort())
      .toEqual(workflowExampleAssets(workflowExamples).map(asset => asset.file).sort())
    expect(sitemap).toBe(renderSitemapXml())
    for (const optional of ["<changefreq>", "<priority>"]) {
      expect(sitemap).not.toContain(optional)
    }
    // Blog entries carry lastmod from their admitted publication dates; docs pages carry it
    // only when the registry records the date their facts were last checked.
    const datedDocs = docPages.filter(page => page.modified !== undefined)
    expect(sitemap.match(/<lastmod>/gu)).toHaveLength(1 + indexableBlogPosts.length + datedDocs.length)
    for (const page of datedDocs) expect(sitemap).toContain(`<loc>${docsCanonicalUrl(page)}</loc>\n    <lastmod>${page.modified}</lastmod>`)
    expect(sitemap.slice(0, sitemap.indexOf("<loc>https://slopcamera.com/docs</loc>"))).not.toContain("<lastmod>")
    expect(llmsTxt).toMatch(/^# SlopCamera\n/u)
    expect(llmsTxt).toContain("> SlopCamera lets your coding agent make images, diagrams, animation, 3D scenes, and video from source files it can keep revising.")
    for (const route of ["docs/reference/techniques", "docs/explanation/slopcamera-vs-remotion", "docs/explanation/slopcamera-vs-hyperframes", "docs/explanation/remotion-alternatives-for-coding-agents"]) {
      expect(llmsTxt).toContain(`(https://slopcamera.com/${route}.md)`)
    }
    expect(llmsTxt).toContain("## When to use Slopcamera")
    expect(llmsTxt).toContain("https://slopcamera.com/index.md")
    expect(sitemapMarkdown).toMatch(/^# Sitemap\n/u)
    expect(sitemapMarkdown).toContain("https://slopcamera.com/index.md")
    expect(sitemapMarkdown).toContain("https://slopcamera.com/llms.txt")
    expect(homeMarkdown).toContain("https://slopcamera.com/sitemap.md")
    expect(homeMarkdown).toContain("https://slopcamera.com/sitemap.xml")
    expect(homeMarkdown).toContain("https://slopcamera.com/llms.txt")
    expect(notFound).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(notFoundMarkdown).toContain("https://slopcamera.com/llms.txt")
    expect(notFoundMarkdown).toContain("https://slopcamera.com/sitemap.xml")
  })

  test("routes documentation to its canonical index and preserves reviewed predecessor hosts", async () => {
    const vercel = JSON.parse(
      await readFile(join(appDirectory, "vercel.json"), "utf8"),
    ) as {
      redirects?: Array<{
        source?: string
        has?: Array<{ type?: string; value?: string }>
        destination?: string
        permanent?: boolean
      }>
    }
    const redirects = vercel.redirects ?? []
    const hostRedirects = redirects
      .filter(redirect => redirect.has !== undefined)
      .map(redirect => ({
        source: redirect.source,
        host: redirect.has?.[0],
        destination: redirect.destination,
        permanent: redirect.permanent,
      }))
    const routeRedirects = redirects
      .filter(redirect => redirect.has === undefined)
      .map(redirect => ({
        source: redirect.source,
        destination: redirect.destination,
        permanent: redirect.permanent,
      }))

    // /docs is first-party now: only the short aliases for the techniques
    // reference and the comparison pages point into it.
    expect(routeRedirects).toEqual([
      { source: "/techniques", destination: "/docs/reference/techniques", permanent: true },
      { source: "/compare/remotion", destination: "/docs/explanation/slopcamera-vs-remotion", permanent: true },
      { source: "/compare/hyperframes", destination: "/docs/explanation/slopcamera-vs-hyperframes", permanent: true },
      { source: "/compare/remotion-alternatives", destination: "/docs/explanation/remotion-alternatives-for-coding-agents", permanent: true },
    ])
    expect(hostRedirects).toEqual([
      { source: "/", host: { type: "host", value: "atet.sh" }, destination: "https://slopcamera.com/", permanent: true },
      { source: "/:path*", host: { type: "host", value: "atet.sh" }, destination: "https://slopcamera.com/:path*", permanent: true },
      { source: "/", host: { type: "host", value: "transmute.rocks" }, destination: "https://slopcamera.com/", permanent: true },
      { source: "/:path*", host: { type: "host", value: "transmute.rocks" }, destination: "https://slopcamera.com/:path*", permanent: true },
      { source: "/", host: { type: "host", value: "www.transmute.rocks" }, destination: "https://slopcamera.com/", permanent: true },
      { source: "/:path*", host: { type: "host", value: "www.transmute.rocks" }, destination: "https://slopcamera.com/:path*", permanent: true },
      { source: "/", host: { type: "host", value: "hraness.graphics" }, destination: "https://slopcamera.com/", permanent: true },
      { source: "/:path*", host: { type: "host", value: "hraness.graphics" }, destination: "https://slopcamera.com/:path*", permanent: true },
      { source: "/", host: { type: "host", value: "hraness.studio" }, destination: "https://slopcamera.com/", permanent: true },
      { source: "/:path*", host: { type: "host", value: "hraness.studio" }, destination: "https://slopcamera.com/:path*", permanent: true },
    ])

    for (const redirect of hostRedirects) {
      const sourceHost = redirect.host?.value
      expect(sourceHost).not.toBe("slopcamera.com")
      expect(new URL(redirect.destination?.replace(":path*", "") ?? "https://invalid").host)
        .not.toBe(sourceHost)
    }

    expect(new Set(hostRedirects.map(redirect => redirect.host?.value))).toEqual(new Set([
      "atet.sh",
      "transmute.rocks",
      "www.transmute.rocks",
      "hraness.graphics",
      "hraness.studio",
    ]))
  })

  test("serves strict security headers and only the retained markdown rewrite", async () => {
    const vercel = JSON.parse(
      await readFile(join(appDirectory, "vercel.json"), "utf8"),
    ) as {
      cleanUrls?: boolean
      headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>
      rewrites?: Array<{
        source?: string
        destination?: string
        has?: Array<{ type?: string; key?: string; value?: string }>
      }>
      trailingSlash?: boolean
    }
    const ordinary = vercel.headers
      ?.find(entry => entry.source === "/((?!preview$).*)")?.headers ?? []
    const preview = vercel.headers?.find(entry => entry.source === "/preview")?.headers ?? []
    const assets = vercel.headers?.find(entry => entry.source === "/assets/(.*)")?.headers ?? []
    const byKey = new Map(ordinary.map(header => [header.key, header.value]))
    const previewByKey = new Map(preview.map(header => [header.key, header.value]))
    const csp = byKey.get("Content-Security-Policy") ?? ""

    expect(vercel.headers?.find(entry => entry.source === "/(.*)")).toBeUndefined()
    expect(csp).toContain("connect-src https://us.i.posthog.com https://account.hraness.com")
    expect(csp).toContain("font-src 'self'")
    expect(csp).toContain("form-action 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toMatch(/font-src[^;]*(?:https?:|data:)/u)
    expect(byKey.get("X-Frame-Options")).toBe("DENY")
    expect(byKey.get("Referrer-Policy")).toBe("no-referrer")
    expect(byKey.get("Strict-Transport-Security")).toContain("includeSubDomains")
    expect(byKey.get("Vary")).toBe("Accept, Accept-Encoding")
    expect(previewByKey.get("Content-Security-Policy")).toBe(
      "default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'self'; "
      + "form-action 'none'; frame-ancestors https://hraness.com https://www.hraness.com; "
      + "img-src 'none'; object-src 'none'; script-src 'none'; style-src 'self'; "
      + "upgrade-insecure-requests",
    )
    expect(previewByKey.get("X-Frame-Options")).toBeUndefined()
    expect(previewByKey.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive, nosnippet",
    )
    expect(previewByKey.get("Link")).toBe('<https://slopcamera.com/>; rel="canonical"')
    for (const key of [
      "Permissions-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "Cross-Origin-Opener-Policy",
      "Strict-Transport-Security",
      "Vary",
    ]) {
      expect(previewByKey.get(key)).toBe(byKey.get(key))
    }
    expect(vercel.headers
      ?.filter(entry => entry.headers?.some(header => (
        header.key === "Content-Security-Policy"
      )))
      .map(entry => entry.source)).toEqual(["/((?!preview$).*)", "/preview"])
    const ordinaryPathPattern = /^\/((?!preview$).*)$/u
    expect(ordinaryPathPattern.test("/preview")).toBe(false)
    for (const pathname of [
      "/",
      "/Preview",
      "/preview.html",
      "/preview/",
      "/preview/child",
      "/reading/paint-with-code",
      "/assets/example.css",
      "/missing",
    ]) {
      expect(ordinaryPathPattern.test(pathname)).toBe(true)
    }
    expect(assets).toContainEqual({
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    })
    expect(vercel.cleanUrls).toBe(true)
    expect(vercel.trailingSlash).toBe(false)

    const home = vercel.headers?.find(entry => entry.source === "/")?.headers ?? []
    const markdown = vercel.headers?.find(entry => entry.source === "/index.md")?.headers ?? []
    const sitemap = vercel.headers?.find(entry => entry.source === "/sitemap.md")?.headers ?? []
    const llms = vercel.headers?.find(entry => entry.source === "/llms.txt")?.headers ?? []
    expect(home).toContainEqual({
      key: "Link",
      value: '</index.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"',
    })
    expect(markdown).toContainEqual({
      key: "Content-Type",
      value: "text/markdown; charset=utf-8",
    })
    expect(sitemap).toContainEqual({
      key: "Content-Type",
      value: "text/markdown; charset=utf-8",
    })
    const docsMarkdown = vercel.headers?.find(entry => entry.source === "/docs/(.*\\.md)")?.headers ?? []
    expect(docsMarkdown).toContainEqual({
      key: "Content-Type",
      value: "text/markdown; charset=utf-8",
    })
    expect(llms).toContainEqual({
      key: "Content-Type",
      value: "text/plain; charset=utf-8",
    })
    expect(vercel.rewrites).toEqual([
      {
        source: "/",
        has: [{ type: "header", key: "accept", value: "^text/markdown" }],
        destination: "/index.md",
      },
    ])
    expect(JSON.stringify(vercel)).not.toMatch(/\/reading|paint-with-code|draw-faces-with-javascript|feynobg|painting-with-gaussians|gemini-omni|how-i-design-with-ai/u)
  })

  test("renders the canonical Hraness network footer on every retained ordinary page", async () => {
    const documents = await Promise.all([
      readBuilt("index.html"),
      readBuilt("404.html"),
    ])
    expect(hranessSocialLinks[0]).toMatchObject({
      href: "https://substack.com/@hraness",
      platform: "substack",
    })
    const expectedHrefs = [
      HRANESS_HOME_URL,
      supportHref.replaceAll("&", "&amp;"),
      "https://hraness.com/privacy",
      ...hranessSocialLinks.map(({ href }) => href),
    ]

    for (const document of documents) {
      const footers = [...document.matchAll(/<footer\b[\s\S]*?<\/footer>/gu)].map(match => match[0])
      expect(footers).toHaveLength(2)
      const [contentFooter, footer] = footers as [string, string]
      // The in-flow product content footer lands immediately before the shared
      // footer, carries the authored camera mark (never an emoji glyph), and
      // reuses the header's own destinations.
      expect(contentFooter).toContain('<footer aria-label="SlopCamera" class="hraness-marketing-footer" data-hraness-marketing="footer">')
      expect(contentFooter).toContain('class="hraness-marketing-footer__inner"')
      expect(contentFooter).toContain('class="hraness-marketing-footer__brand"')
      expect(contentFooter).toContain('class="hraness-marketing-footer__name"')
      expect(contentFooter).toContain('aria-label="Footer navigation" class="hraness-marketing-footer__nav"')
      expect(contentFooter).toContain('class="hraness-marketing-footer__brand" data-foil=""')
      expect(contentFooter).toContain('class="hraness-foil-mark__paint"')
      expect(contentFooter).toContain('src="/marks/slopcamera.svg"')
      expect(contentFooter).not.toContain('slopcamera-footer-lens')
      expect(contentFooter).not.toMatch(/📷|📸/u)
      expect([...contentFooter.matchAll(/<a\b[^>]*\shref="([^"]+)"/gu)].map(match => match[1]))
        .toEqual(["/", "/docs", "https://github.com/hraness/slopcamera", "/#install"])
      expect(document.indexOf('data-hraness-marketing="footer"'))
        .toBeLessThan(document.indexOf('data-slot="hraness-site-footer"'))
      expect(document.indexOf(`${contentFooter}\n    <footer`)).toBeGreaterThan(-1)
      expect(footer).toContain('data-slot="hraness-site-footer"')
      expect(footer?.match(/data-slot="hraness-mark"/gu)).toHaveLength(1)
      expect(footer?.match(/data-slot="hraness-support-icon"/gu)).toHaveLength(2)
      expect(footer).toContain('aria-label="About cookies"')
      expect(footer?.match(/data-slot="social-icon"/gu)).toHaveLength(4)
      expect(footer).not.toContain("hraness-site-footer__wordmark")
      expect(
        [...(footer?.matchAll(/<a\b[^>]*\shref="([^"]+)"/gu) ?? [])]
          .map(match => match[1]),
      ).toEqual(expectedHrefs)
    }
  })

  test("attributes every public page to the organization through the shared footer only", async () => {
    // The shared footer owns the organization attribution: its home lockup
    // pairs the Ra mark with the exact "by Hraness" text. Public pages carry
    // no separate maker section and never attribute the product to a person.
    const documents = await Promise.all([
      readBuilt("index.html"),
      readBuilt("404.html"),
      ...docPages.map(page => readBuilt(docsDocumentForPage(page))),
      readBuilt(blogIndexDocument),
      ...blogPosts.map(post => readBuilt(blogDocumentForPost(post))),
    ])
    for (const document of documents) {
      const lockups = [...document.matchAll(/<a aria-label="Hraness home" class="hraness-site-footer__brand [^"]*" href="https:\/\/hraness\.com\/" lang="en" dir="ltr">[\s\S]*?<span class="hraness-site-footer__brand-name [^"]*">by Hraness<\/span><\/a>/gu)]
      expect(lockups).toHaveLength(1)
      const siteFooter = document.indexOf('data-slot="hraness-site-footer"')
      expect(siteFooter).toBeGreaterThan(-1)
      expect(document.indexOf(lockups[0]![0])).toBeGreaterThan(siteFooter)
      expect(document.indexOf('data-hraness-marketing="footer"')).toBeGreaterThan(-1)
      expect(document.indexOf('data-hraness-marketing="footer"')).toBeLessThan(siteFooter)
      expect(document.split("by Hraness")).toHaveLength(2)
      expect(document).not.toMatch(/Ben Guo|hraness-marketing-maker|id="maker"|href="#maker"/u)
    }
    const source = await readSource("index.html")
    expect(source).not.toMatch(/Ben Guo|Puerto Rico|Venmo|hraness-marketing-maker|id="maker"|href="#maker"/u)
    expect(source).toContain("<summary>Is Slopcamera the same as Atet?</summary>")
    expect(source).toContain("Atet was renamed Slopcamera in September 2026")
    expect(homeMarkdown).not.toContain("## Built by Hraness")
    expect(homeMarkdown).toContain("### Is Slopcamera the same as Atet?")
    for (const markdown of [homeMarkdown, llmsTxt, sitemapMarkdown, notFoundMarkdown]) {
      expect(markdown).not.toMatch(/Ben Guo|Puerto Rico|Venmo/u)
    }
  })

  test("selects markdown, HTML, and 406 from Accept quality values", () => {
    expect(preferredRepresentation(null)).toBe("text/html")
    expect(preferredRepresentation("")).toBe("text/html")
    expect(preferredRepresentation("*/*")).toBe("text/html")
    expect(preferredRepresentation("text/html")).toBe("text/html")
    expect(preferredRepresentation("text/markdown")).toBe("text/markdown")
    expect(preferredRepresentation("text/markdown, text/html, */*")).toBe("text/markdown")
    expect(preferredRepresentation("text/html, text/markdown;q=0.9")).toBe("text/html")
    expect(preferredRepresentation("text/html;q=0, */*;q=1")).toBe("text/markdown")
    expect(preferredRepresentation("text/markdown;q=0, text/html;q=0")).toBeNull()
    expect(preferredRepresentation("application/xml")).toBeNull()
    expect(preferredRepresentation("application/json, image/png")).toBeNull()
    expect(preferredRepresentationFrom(null, ["text/html"])).toBe("text/html")
    expect(preferredRepresentationFrom("text/html", ["text/html"])).toBe("text/html")
    expect(preferredRepresentationFrom("*/*", ["text/html"])).toBe("text/html")
    expect(preferredRepresentationFrom("text/markdown", ["text/html"])).toBeNull()
    expect(preferredRepresentationFrom("text/html;q=0, */*;q=1", ["text/html"])).toBeNull()
    expect(preferredRepresentation("text/html; q = 0.5")).toBe("text/html")
    expect(preferredRepresentation("text/html;level=1, text/markdown;q=0.4")).toBe("text/markdown")

    for (const malformed of [
      ",",
      "text/html;",
      "text/html;q",
      "text/html;q=",
      "text/html;q=wat",
      "text/html;q=.5",
      "text/html;q=00.5",
      "text/html;q=-0.1",
      "text/html;q=1.001",
      "text/html;q=2",
      "text/html;q=0.0000",
      "text/html;q=0.5;q=0.4",
      "text/html;level=1",
      "text/html;charset=utf-8",
      "text/html;q=0.5;extension=unsupported",
    ]) {
      expect(preferredRepresentation(malformed)).toBeNull()
      expect(preferredRepresentationFrom(malformed, ["text/html"])).toBeNull()
    }
  })

  test("negotiates homepage markdown, generic failures, and retired reading 404s", async () => {
    expect(isHomePath("/")).toBe(true)
    expect(isHomePath("/index.html")).toBe(true)
    expect(isDocsPath("/docs")).toBe(true)
    expect(isDocsPath("/docs/")).toBe(true)
    expect(isDocsPath("/docs/install")).toBe(true)
    expect(isDocsPath("/documentation")).toBe(false)
    expect(isPreviewPath("/preview")).toBe(true)
    expect(isPreviewPath("/preview.html")).toBe(true)
    expect(isPreviewPath("/preview/child")).toBe(false)
    expect(isNegotiableDocumentPath("/missing-route")).toBe(true)
    expect(isNegotiableDocumentPath("/reading/paint-with-code")).toBe(true)
    expect(isNegotiableDocumentPath("/llms.txt")).toBe(false)
    expect(isNegotiableDocumentPath("/index.md")).toBe(false)
    expect(isNegotiableDocumentPath("/assets/styles.css")).toBe(false)

    const markdownHome = negotiateSiteRequest(new Request("https://slopcamera.com/", {
      headers: { Accept: "text/markdown" },
    }))
    expect(markdownHome?.status).toBe(200)
    expect(markdownHome?.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(markdownHome?.headers.get("vary")).toBe("Accept, Accept-Encoding")
    expect(markdownHome?.headers.get("link")).toContain('rel="canonical"')
    expect(await markdownHome?.text()).toBe(homeMarkdown)

    expect(negotiateSiteRequest(new Request("https://slopcamera.com/", {
      headers: { Accept: "text/html" },
    }))).toBeUndefined()

    // Documentation markdown rewrites to the sealed .md sibling of each page.
    for (const path of ["/docs", "/docs/", "/docs/tutorials/claude-code"]) {
      const docsPage = docsPageForRequestPath(path)
      expect(docsPage).not.toBeNull()
      const negotiated = negotiateSiteRequest(new Request(`https://slopcamera.com${path}`, {
        headers: { Accept: "text/markdown" },
      }))
      expect(negotiated?.status).toBe(200)
      expect(negotiated?.headers.get("x-middleware-rewrite"))
        .toBe(`https://slopcamera.com${docsMarkdownUrl(docsPage!)}`)
      expect(negotiated?.headers.get("link")).toContain(`<${docsCanonicalUrl(docsPage!)}>; rel="canonical"`)
      expect(negotiated?.headers.get("vary")).toBe("Accept, Accept-Encoding")
      expect(negotiateSiteRequest(new Request(`https://slopcamera.com${path}`, {
        headers: { Accept: "text/html" },
      }))).toBeUndefined()
    }

    // Unknown documentation paths fail closed to the same markdown 404.
    const docsNotFound = negotiateSiteRequest(new Request("https://slopcamera.com/docs/not-a-page", {
      headers: { Accept: "text/markdown" },
    }))
    expect(docsNotFound?.status).toBe(404)
    expect(docsNotFound?.headers.get("x-robots-tag")).toBe("noindex")
    // A direct request for a published .md mirror serves the identical sealed
    // file with the canonical and alternate headers the negotiated response
    // carries. Unregistered .md paths still bypass to the static origin.
    for (const path of ["/docs/index.md", "/docs/tutorials/claude-code.md"]) {
      const mirrorPage = docsPageForRequestPath(path)
      expect(mirrorPage).not.toBeNull()
      const direct = negotiateSiteRequest(new Request(`https://slopcamera.com${path}`))
      expect(direct?.status).toBe(200)
      expect(direct?.headers.get("x-middleware-rewrite"))
        .toBe(`https://slopcamera.com${docsMarkdownUrl(mirrorPage!)}`)
      expect(direct?.headers.get("link"))
        .toBe(`<${docsCanonicalUrl(mirrorPage!)}>; rel="canonical", <${docsMarkdownUrl(mirrorPage!)}>; rel="alternate"; type="text/markdown"`)
      expect(direct?.headers.get("vary")).toBe("Accept, Accept-Encoding")
    }
    for (const path of ["/index.md", "/docs.md", "/docs/not-a-page.md", "/sitemap.md"]) {
      expect(negotiateSiteRequest(new Request(`https://slopcamera.com${path}`, {
        headers: { Accept: "text/markdown" },
      }))).toBeUndefined()
    }

    const markdownNotFound = negotiateSiteRequest(new Request("https://slopcamera.com/this-path-does-not-exist", {
      headers: { Accept: "text/markdown" },
    }))
    expect(markdownNotFound?.status).toBe(404)
    expect(markdownNotFound?.headers.get("cache-control")).toBe("no-store")
    expect(markdownNotFound?.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(markdownNotFound?.headers.get("vary")).toBe("Accept, Accept-Encoding")
    expect(markdownNotFound?.headers.get("x-robots-tag")).toBe("noindex")
    expect(await markdownNotFound?.text()).toBe(notFoundMarkdown)

    const notAcceptable = negotiateSiteRequest(new Request("https://slopcamera.com/", {
      headers: { Accept: "application/xml" },
    }))
    expect(notAcceptable?.status).toBe(406)
    expect(notAcceptable?.headers.get("content-type")).toBe("text/plain; charset=utf-8")
    expect(notAcceptable?.headers.get("vary")).toBe("Accept")
    expect(await notAcceptable?.text()).toBe(notAcceptableBody)

    expect(negotiateSiteRequest(new Request("https://slopcamera.com/llms.txt", {
      headers: { Accept: "application/xml" },
    }))).toBeUndefined()

    for (const accept of ["text/markdown", "application/xml", "text/html;q=0, */*;q=1"]) {
      const preview = new Request("https://slopcamera.com/preview", {
        headers: { Accept: accept },
      })
      const negotiated = negotiateSiteRequest(preview)
      expect(negotiated?.status).toBe(406)
      expect(negotiated?.headers.get("content-type")).toBe("text/plain; charset=utf-8")
      expect(negotiated?.headers.get("vary")).toBe("Accept")
      expect(await negotiated?.text()).toBe("Not Acceptable\n\nAvailable: text/html\n")

      const middlewareResponse = middleware(preview)
      expect(middlewareResponse?.status).toBe(406)
      expect(await middlewareResponse?.text()).toBe("Not Acceptable\n\nAvailable: text/html\n")
    }

    for (const accept of ["text/html", "*/*"]) {
      const preview = new Request("https://slopcamera.com/preview", {
        headers: { Accept: accept },
      })
      expect(negotiateSiteRequest(preview)).toBeUndefined()
      expect(middleware(preview)).toBeUndefined()
    }

    const headMarkdown = negotiateSiteRequest(new Request("https://slopcamera.com/", {
      headers: { Accept: "text/markdown" },
      method: "HEAD",
    }))
    expect(headMarkdown?.status).toBe(200)
    expect(headMarkdown?.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(await headMarkdown?.text()).toBe("")

    const headNotFound = negotiateSiteRequest(new Request("https://slopcamera.com/missing-route", {
      headers: { Accept: "text/markdown" },
      method: "HEAD",
    }))
    expect(headNotFound?.status).toBe(404)
    expect(await headNotFound?.text()).toBe("")

    for (const path of ["/", "/preview"]) {
      const headNotAcceptable = negotiateSiteRequest(new Request(`https://slopcamera.com${path}`, {
        headers: { Accept: "application/xml" },
        method: "HEAD",
      }))
      expect(headNotAcceptable?.status).toBe(406)
      expect(headNotAcceptable?.headers.get("vary")).toBe("Accept")
      expect(await headNotAcceptable?.text()).toBe("")

      const headHtml = new Request(`https://slopcamera.com${path}`, {
        headers: { Accept: "text/html" },
        method: "HEAD",
      })
      expect(negotiateSiteRequest(headHtml)).toBeUndefined()
      expect(middleware(headHtml)).toBeUndefined()
    }

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const path of ["/", "/missing-route", "/preview"]) {
        for (const accept of ["text/markdown", "application/xml", "text/html"]) {
          const url = `https://slopcamera.com${path}`
          expect(negotiateSiteRequest(new Request(url, {
            headers: { Accept: accept },
            method,
          }))).toBeUndefined()
          expect(middleware(new Request(url, {
            headers: { Accept: accept },
            method,
          }))).toBeUndefined()
        }
      }
    }

    expect(middlewareConfig.matcher).toContain("/")
    const middlewareMarkdown = middleware(new Request("https://slopcamera.com/", {
      headers: { Accept: "text/markdown" },
    }))
    expect(middlewareMarkdown?.status).toBe(200)
    expect(await middlewareMarkdown?.text()).toBe(homeMarkdown)

    for (const slug of [
      "",
      "draw-faces-with-javascript",
      "feynobg",
      "painting-with-gaussians",
      "gemini-omni",
      "paint-with-code",
      "how-i-design-with-ai",
    ]) {
      const removed = negotiateSiteRequest(new Request(`https://slopcamera.com/reading${slug === "" ? "" : `/${slug}`}`, {
        headers: { Accept: "text/markdown" },
      }))
      expect(removed?.status).toBe(404)
      expect(removed?.headers.get("cache-control")).toBe("no-store")
      expect(removed?.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
      expect(removed?.headers.get("vary")).toBe("Accept, Accept-Encoding")
      expect(removed?.headers.get("x-robots-tag")).toBe("noindex")
      expect(await removed?.text()).toBe(notFoundMarkdown)

      expect(negotiateSiteRequest(new Request(`https://slopcamera.com/reading${slug === "" ? "" : `/${slug}`}`, {
        headers: { Accept: "text/html" },
      }))).toBeUndefined()
    }
  })









})

test("the real analytics entry waits for regional permission and honors acceptance and refusal", () => {
  for (const mode of ["optional", "required", "malformed", "unavailable"]) {
    const result = Bun.spawnSync([
      process.execPath,
      fileURLToPath(new URL("./scripts/analytics-consent-harness.ts", import.meta.url)),
      mode,
    ], { stdout: "pipe", stderr: "pipe" })
    expect(result.exitCode).toBe(0)
    const output = JSON.parse(new TextDecoder().decode(result.stdout))
    expect(output.before).toEqual({ initialized: 0, captured: 0 })
    expect(output.afterRegion).toEqual(mode === "optional"
      ? { initialized: 1, captured: 1 }
      : { initialized: 0, captured: 0 })
    expect(output.afterAccepted).toEqual({ initialized: 1, captured: 1 })
    expect(output.allowedBeforeRefusal).toBe(true)
    expect(output.blockedAfterRefusal).toBe(true)
    expect(output.pendingAborted).toBe(true)
    expect(output.requestsAfterStaleRetry).toBe(1)
    expect(output.requestsAfterFreshCapture).toBe(2)
  }
})

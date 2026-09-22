import assert from "node:assert"
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { renderSlopcameraSocialImage } from "./generate-og"
import { buildPreview } from "./build-preview"
import type { PreviewArtifact } from "./preview-contract"
import { buildSite } from "./build-site"
import { publicIdentity, readPublicIcons } from "./public-identity"
import { readExampleAssets } from "./example-assets"
import { exampleUrl, workflowExamples, type WorkflowExample } from "../src/example-registry"
import type { SiteArtifact } from "./site-contract"
export { renderAskAiAboutThis } from "../src/site-content"
import { docsCanonicalUrl, docsMarkdownUrl, docsPageMarkdown, docPages } from "../src/docs-registry"
import {
  homeMarkdown,
  llmsTxt,
  robotsTxt,
  sitemapMarkdown,
} from "../src/agent-pages"

const appDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceDirectory = join(appDirectory, "src")
const defaultOutputDirectory = join(appDirectory, "dist")
const posthogIngestOrigin = "https://us.i.posthog.com"
const siteOrigin = "https://slopcamera.com"
const posthogPackageDirectory = dirname(fileURLToPath(import.meta.resolve("posthog-js/package.json")))
const copiedFiles = publicIdentity.files

const generatedTextFiles = {
  "index.md": homeMarkdown,
  "llms.txt": llmsTxt,
  "robots.txt": robotsTxt,
  "sitemap.xml": renderSitemapXml(),
  "sitemap.md": sitemapMarkdown,
} as const

const marketingIconMaxBytes = 128 * 1024

async function readMarketingIcons(): Promise<Readonly<{ path: string; bytes: Uint8Array }[]>> {
  const directory = join(sourceDirectory, "icons")
  const names = (await readdir(directory))
    .filter(entry => entry.endsWith(".svg") && /^[a-z0-9-]+\.svg$/u.test(entry))
    .sort()
  const icons: { path: string; bytes: Uint8Array }[] = []
  for (const name of names) {
    const bytes = new Uint8Array(await readFile(join(directory, name)))
    assert.ok(bytes.byteLength <= marketingIconMaxBytes, `Marketing icon exceeds ${marketingIconMaxBytes} bytes: ${name}`)
    icons.push({ path: `icons/${name}`, bytes })
  }
  return icons
}

async function readBrandMarks(): Promise<Readonly<{ path: string; bytes: Uint8Array }[]>> {
  const directory = join(sourceDirectory, "marks")
  const names = (await readdir(directory))
    .filter(entry => entry.endsWith(".svg") && /^[a-z0-9-]+\.svg$/u.test(entry))
    .sort()
  const marks: { path: string; bytes: Uint8Array }[] = []
  for (const name of names) {
    const bytes = new Uint8Array(await readFile(join(directory, name)))
    assert.ok(bytes.byteLength <= marketingIconMaxBytes, `Brand mark exceeds ${marketingIconMaxBytes} bytes: ${name}`)
    marks.push({ path: `marks/${name}`, bytes })
  }
  return marks
}

async function docsMirrors(): Promise<Readonly<Record<string, string>>> {
  const files: Record<string, string> = {}
  const onDisk = new Set(
    (await readdir(join(sourceDirectory, "docs"), { recursive: true }))
      .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".md"))
      .map(entry => entry.replace(/\\/gu, "/").replace(/\.md$/u, "")),
  )
  for (const page of docPages) {
    if (!onDisk.delete(page.slug)) throw new Error(`Documentation page is missing its source: src/docs/${page.slug}.md`)
    const body = await readFile(join(sourceDirectory, "docs", `${page.slug}.md`), "utf8")
    files[`docs/${page.slug}.md`] = docsPageMarkdown(page, body)
  }
  if (onDisk.size !== 0) throw new Error(`Documentation sources missing registry entries: ${[...onDisk].join(", ")}`)
  return files
}

function assetPath(name: string, bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12)
  const extensionIndex = name.lastIndexOf(".")
  const stem = name.slice(0, extensionIndex)
  const extension = name.slice(extensionIndex)
  return `/assets/${stem}-${digest}${extension}`
}

function renderSitemapUrl(path: string, examples: readonly WorkflowExample[] = []): string {
  const escapeXml = (value: string) => value.replace(/[&<>"']/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!)
  return `  <url>
    <loc>${siteOrigin}${path}</loc>
${examples.map(example => `    <image:image><image:loc>${siteOrigin}${exampleUrl(example.poster)}</image:loc><image:caption>${escapeXml(example.poster.alt)}</image:caption></image:image>`).join("\n")}
  </url>`
}

export function renderSitemapXml(): string {
  const entries = [
    renderSitemapUrl("/", workflowExamples.filter(example => example.featured)),
    renderSitemapUrl("/index.md"),
    ...docPages.flatMap(page => {
      const canonical = docsCanonicalUrl(page).slice(siteOrigin.length)
      const mirror = docsMarkdownUrl(page)
      return [
        renderSitemapUrl(canonical, workflowExamples.filter(example => example.guideSlug === page.slug)),
        renderSitemapUrl(mirror),
      ]
    }),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join("\n")}
</urlset>
`
}

type BuildEnvironment = Readonly<Record<string, string | undefined>>

type BuildOptions = Readonly<{
  environment?: BuildEnvironment
  outputDirectory?: string
}>

function productionAnalyticsConfig(environment: BuildEnvironment): Readonly<{
  host: string
  key: string
}> | null {
  const key = environment.NEXT_PUBLIC_POSTHOG_KEY?.trim()
  if (environment.VERCEL_ENV !== "production" || key === undefined || key === "") {
    return null
  }
  if (!/^phc_[A-Za-z0-9_-]+$/u.test(key)) {
    throw new Error("NEXT_PUBLIC_POSTHOG_KEY must be a PostHog project token")
  }

  const host = environment.NEXT_PUBLIC_POSTHOG_HOST?.trim() || posthogIngestOrigin
  if (host !== posthogIngestOrigin) {
    throw new Error(`NEXT_PUBLIC_POSTHOG_HOST must equal ${posthogIngestOrigin}`)
  }
  return { host, key }
}

async function bundleAnalytics(config: Readonly<{ host: string; key: string }>): Promise<Uint8Array> {
  const [license, manifestSource] = await Promise.all([
    readFile(join(posthogPackageDirectory, "LICENSE"), "utf8"),
    readFile(join(posthogPackageDirectory, "package.json"), "utf8"),
  ])
  const manifest = JSON.parse(manifestSource) as unknown
  if (
    typeof manifest !== "object"
    || manifest === null
    || !("version" in manifest)
    || typeof manifest.version !== "string"
    || license.includes("*/")
  ) {
    throw new Error("The installed PostHog package has an invalid license boundary")
  }
  const result = await Bun.build({
    banner: `/*! posthog-js ${manifest.version}\n${license.trim()}\n*/`,
    define: {
      __SLOPCAMERA_POSTHOG_HOST__: JSON.stringify(config.host),
      __SLOPCAMERA_POSTHOG_KEY__: JSON.stringify(config.key),
    },
    entrypoints: [join(sourceDirectory, "analytics.ts")],
    env: "disable",
    format: "esm",
    minify: true,
    sourcemap: "none",
    target: "browser",
  })
  const output = result.outputs[0]
  if (!result.success || result.outputs.length !== 1 || output === undefined) {
    const details = result.logs.map(log => log.message).join("\n")
    throw new Error(`Could not bundle the analytics client${details === "" ? "" : `: ${details}`}`)
  }
  return new Uint8Array(await output.arrayBuffer())
}

async function bundleTheme(): Promise<Uint8Array> {
  const result = await Bun.build({
    entrypoints: [join(sourceDirectory, "theme.ts")],
    env: "disable",
    format: "iife",
    minify: true,
    sourcemap: "none",
    target: "browser",
  })
  const output = result.outputs[0]
  if (!result.success || result.outputs.length !== 1 || output === undefined) {
    const details = result.logs.map(log => log.message).join("\n")
    throw new Error(`Could not bundle the appearance client${details === "" ? "" : `: ${details}`}`)
  }
  return new Uint8Array(await output.arrayBuffer())
}

export async function buildWebsite(options: BuildOptions = {}): Promise<Readonly<{
  analyticsPath: string | null
  previewArtifacts: readonly PreviewArtifact[]
  previewEvidenceDirectory: string
  previewFoundationPath: string
  previewStylesPath: string
  stylesPath: string
  siteArtifacts: readonly SiteArtifact[]
  siteAttributions: readonly SiteArtifact[]
  siteEvidenceDirectory: string
  siteFoundationPath: string
  themePath: string
}>> {
  const environment = options.environment ?? process.env
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory
  const analyticsConfig = productionAnalyticsConfig(environment)
  const [theme, socialImage] = await Promise.all([
    bundleTheme(), renderSlopcameraSocialImage(),
  ])
  const themePath = assetPath("theme.js", theme)
  const analytics = analyticsConfig === null ? null : await bundleAnalytics(analyticsConfig)
  const analyticsPath = analytics === null ? null : assetPath("analytics.js", analytics)
  // Finalize both independent closed graphs before replacing a public build.
  // All content and stylesheet substitutions happen inside the sealed producers.
  const site = await buildSite(appDirectory, { themePath, analyticsPath })
  const preview = await buildPreview(appDirectory)
  const icons = await readPublicIcons(appDirectory)
  const marketingIcons = await readMarketingIcons()
  const brandMarks = await readBrandMarks()
  const examples = await readExampleAssets(appDirectory)

  await rm(outputDirectory, { force: true, recursive: true })
  await mkdir(join(outputDirectory, "assets"), { recursive: true })

  await Promise.all([
    ...[...site.files, ...site.attributions, ...preview.files].map(async ({ artifact, bytes }) => {
      const destination = join(outputDirectory, artifact.path)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, bytes, { flag: "wx", mode: 0o644 })
    }),
    writeFile(join(outputDirectory, themePath.slice(1)), theme),
    writeFile(join(outputDirectory, "og.png"), socialImage),
    ...(analyticsPath === null || analytics === null
      ? []
      : [writeFile(join(outputDirectory, analyticsPath.slice(1)), analytics)]),
  ])

  for (const { path, bytes } of [...icons, ...marketingIcons, ...brandMarks, ...examples]) {
    const destination = join(outputDirectory, path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, bytes, { flag: "wx", mode: 0o644 })
  }

  const docsTextFiles = await docsMirrors()
  await Promise.all(Object.entries({ ...generatedTextFiles, ...docsTextFiles }).map(async ([file, contents]) => {
    const target = join(outputDirectory, file)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, contents)
  }))

  return {
    analyticsPath, stylesPath: site.stylesPath, themePath,
    siteArtifacts: site.files.map(item => item.artifact),
    siteAttributions: site.attributions.map(item => item.artifact),
    siteEvidenceDirectory: site.evidenceDirectory,
    siteFoundationPath: site.foundationPath,
    previewArtifacts: preview.files.map(item => item.artifact),
    previewEvidenceDirectory: preview.evidenceDirectory,
    previewFoundationPath: preview.foundationPath,
    previewStylesPath: preview.stylesPath,
  }
}

if (import.meta.main) {
  const result = await buildWebsite()
  const generatedFiles = copiedFiles.length
    + Object.keys(generatedTextFiles).length
    + 2 + result.siteArtifacts.length + result.siteAttributions.length + result.previewArtifacts.length
    + (result.analyticsPath === null ? 0 : 1)
  console.log(`Built ${generatedFiles} static files in ${defaultOutputDirectory}`)
  console.log(`Site compiler evidence retained in ${result.siteEvidenceDirectory}`)
  console.log(`Preview compiler evidence retained in ${result.previewEvidenceDirectory}`)
}

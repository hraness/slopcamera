import { homepageMarketingSlots, shellProductNameSlot } from "../src/messaging"
import { replaceSiteSlot } from "../src/site-template"
import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { homeMarkdown, llmsTxt, sitemapMarkdown } from "../src/agent-pages"
import { archiveInstall, publishedArchiveUrl, sourceInstall } from "../src/published-release"
import { diagramSession } from "../src/site-code-examples"
import { homepageExamples, renderExampleHero, renderExampleGallery, renderExampleRevision } from "../src/example-gallery"
import { exampleUrl, exampleGuideUrl } from "../src/example-registry"
import { renderSlopcameraIcons } from "./generate-icons"

const read = async (path: string) => {
  let source = await readFile(new URL(`../../../${path}`, import.meta.url), "utf8")
  if (path === "apps/web/src/index.html") {
    for (const [token, value, count] of [shellProductNameSlot("index.html"), ...homepageMarketingSlots]) {
      source = replaceSiteSlot(source, token, value, count)
    }
  }
  return source
}
const compact = (value: string) => value.replace(/\*\*|`/gu, "").replace(/\s+/gu, " ")
const definition = "SlopCamera lets your coding agent make images, diagrams, animation, 3D scenes, and video from source files it can keep revising."

describe("media studio public copy (pure, process-free)", () => {
  test("the source install is complete in the guide and never renames historical archive bytes", async () => {
    const [readme, guide, html] = await Promise.all([
      read("README.md"), read("docs/how-to/use-current-source.md"), read("apps/web/src/index.html"),
    ])
    const steps = [sourceInstall.checkoutCommand, "git rev-parse HEAD", "bun install --frozen-lockfile --ignore-scripts", "bun run build:sdk", "bun run build:desktop:cli", "export SLOPCAMERA_SOURCE_ROOT", 'slopcamera() { bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js" "$@"; }', "slopcamera doctor --json"]
    for (const source of [readme, guide]) {
      const installation = source.slice(source.indexOf(sourceInstall.checkoutCommand))
      const positions = steps.map(step => installation.indexOf(step))
      expect(positions.every(position => position >= 0)).toBe(true)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
    expect(readme).not.toContain("Historical Atet release evidence")
    expect(publishedArchiveUrl).toBe("https://github.com/hraness/slopcamera/releases/download/v3.10.1/hraness-slopcamera-3.10.1.tgz")
    expect(html).toContain("{{RELEASE_INSTALL_COMMANDS}}")
    expect(html).not.toContain("{{SOURCE_CHECKOUT_COMMAND}}")
    expect(html).toContain('<summary>Build from source</summary>')
    expect(homeMarkdown).toContain(archiveInstall.skillCommand)
    expect(llmsTxt).toContain("Spatial rendering needs a local Chrome or Chromium runtime and the GPU support required by its selected profile")
    expect(llmsTxt).toContain("Native studio engines need separately installed executables or Python environments")
    expect(llmsTxt).not.toContain("camera-track export require the current source build")
    expect(llmsTxt).toContain("scene design catalog|init|inspect|set|compile|gallery")
    expect(llmsTxt).toContain("https://github.com/hraness/slopcamera/blob/main/docs/how-to/parametric-design.md")
    expect(llmsTxt.match(/Install the verified release with/gu)).toHaveLength(1)
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)![1]!)["@graph"] as Record<string, unknown>[]
    for (const item of graph) {
      expect(item).not.toHaveProperty("softwareVersion")
      expect(item).not.toHaveProperty("version")
      expect(item).not.toHaveProperty("offers")
    }
  })

  test("the historical camera mark still reproduces its desktop asset and recorded derivatives", async () => {
    const icon = await renderSlopcameraIcons()
    const [desktop, manifest, provenance] = await Promise.all([
      readFile(new URL("../../desktop/assets/icon.png", import.meta.url)),
      read("apps/desktop/assets/brand-emoji/manifest.json"),
      read("apps/desktop/assets/brand-provenance.json"),
    ])
    expect(icon.desktop).toEqual(new Uint8Array(desktop))
    expect(JSON.parse(manifest).assets[0]).toMatchObject({ domain: "slopcamera.com", emoji: "📷", codePointID: "1f4f7", sha256: icon.sourceSha256 })
    expect(JSON.parse(provenance).source.sha256).toBe(icon.sourceSha256)
    for (const output of JSON.parse(provenance).outputs as { path: string; bytes: number; sha256: string }[]) {
      const bytes = output.path === "icon.png" ? desktop : icon.apple
      expect(bytes.byteLength).toBe(output.bytes)
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(output.sha256)
    }
  })

  test("the README, visible homepage, metadata, and agent indexes agree on the durable product", async () => {
    const [readme, html] = await Promise.all([read("README.md"), read("apps/web/src/index.html")])
    for (const source of [readme, html, homeMarkdown, llmsTxt]) expect(compact(source)).toContain(definition)
    for (const kind of ["description", "og:description", "twitter:description"]) {
      expect(html).toContain(`${kind}" content="${definition}"`)
    }
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)![1]!)
    for (const item of graph["@graph"].filter((value: { description?: unknown }) => value.description !== undefined)) {
      expect(item.description).toBe(definition)
    }
  })

  test("first value leads to an animation and retained revision with a portable diagram fallback", async () => {
    const [readme, html, guide, webGuide, originalJson, revisedJson] = await Promise.all([
      read("README.md"), read("apps/web/src/index.html"),
      read("docs/tutorials/first-animation.md"), read("apps/web/src/docs/tutorials/first-animation.md"),
      read("examples/showcase/studio-relaunch/requests/last-tram-original.json"),
      read("examples/showcase/studio-relaunch/requests/last-tram-moonrise.json"),
    ])
    expect(html).toContain("{{EXAMPLE_HERO}}")
    expect(html).toContain("{{EXAMPLE_GALLERY}}")
    for (const source of [readme, html, homeMarkdown]) {
      expect(source).toContain("/docs/tutorials/first-animation")
      expect(source).toContain("/docs/tutorials/first-diagram")
      expect(source).toContain("macOS")
    }
    const original = JSON.parse(originalJson)
    const revised = JSON.parse(revisedJson)
    expect(revised.document).toEqual(original.document)
    expect(revised.canvas).toEqual(original.canvas)
    expect(revised.timing).toEqual(original.timing)
    expect(original.parameters.variant).toBe("original")
    expect(revised.parameters.variant).toBe("moonrise")
    expect(await read(original.document.path)).not.toBeEmpty()
    const commands = [
      "slopcamera doctor --json",
      "slopcamera html render --input examples/showcase/studio-relaunch/requests/last-tram-original.json --dry-run --json",
      "slopcamera html render --input examples/showcase/studio-relaunch/requests/last-tram-original.json --json",
      "slopcamera html render --input examples/showcase/studio-relaunch/requests/last-tram-moonrise.json --json",
    ]
    for (const source of [guide, webGuide]) {
      const positions = commands.map(command => source.indexOf(command))
      expect(positions.every(position => position >= 0)).toBe(true)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
      expect(source).toContain("macOS")
      expect(source).toContain("FFmpeg")
      expect(source).toContain(`${original.timing.durationUs / 1_000_000 * original.timing.fps} frames`)
      for (const field of ["output.path", "source.path", "receipt.path", "projectId"]) expect(source).toContain(field)
    }
    expect(readme).toContain(publishedArchiveUrl)
    expect(homeMarkdown).toContain(publishedArchiveUrl)
    expect(homeMarkdown).toContain(sourceInstall.guideUrl)
    expect(readme).toContain(sourceInstall.checkoutCommand)
  })

  test("the diagram fallback retains the released commands and five real derived outputs", async () => {
    const [guide, webGuide, cli, artifacts] = await Promise.all([
      read("docs/tutorials/first-diagram.md"), read("apps/web/src/docs/tutorials/first-diagram.md"),
      read("src/cli.ts"), read("src/artifacts.ts"),
    ])
    expect(cli).toContain('name: "example-flow"')
    expect(artifacts).toContain('`${spec.name}.tldr`')
    const commands = ["slopcamera diagram init first.diagram.json", "slopcamera diagram check first.diagram.json --strict", "slopcamera diagram render first.diagram.json"]
    for (const source of [guide, webGuide, diagramSession]) {
      const positions = commands.map(command => source.indexOf(command))
      expect(positions.every(position => position >= 0)).toBe(true)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
      expect(source).not.toContain("--input job.json")
      for (const suffix of ["tldr", "light.svg", "dark.svg", "light.png", "dark.png"]) expect(source).toContain(`example-flow.${suffix}`)
    }
  })

  test("release, native trust, and MCP scope remain adjacent to the expanded creation story", async () => {
    const [html, readme, operations] = await Promise.all([read("apps/web/src/index.html"), read("README.md"), read("src/operations.ts")])
    for (const source of [html, readme, homeMarkdown, llmsTxt]) {
      const text = compact(source)
      expect(text).toContain("current user")
      expect(text).toContain("main")
      expect(text).toContain("studio")
      expect(text).toMatch(/(?:MCP.*(?:subset|toolset)|(?:subset|toolset).*MCP)/u)
      expect(text).not.toContain("Each one reaches the same project and the same operations")
      expect(text).not.toContain("Only model-backed work may upload")
    }
    const codes = operations.match(/export const slopcameraOperationCodes = \[([\s\S]*?)\] as const/u)![1]!
    expect([...codes.matchAll(/"([^"]+)"/gu)].map(match => match[1])).toEqual([
      "slopcamera.diagram.check", "slopcamera.diagram.render", "slopcamera.image.vectorize", "slopcamera.image.generate", "slopcamera.image.icon", "slopcamera.image.gallery",
      "slopcamera.icon.compose", "slopcamera.icon.render", "slopcamera.soundtrack.compose", "slopcamera.soundtrack.grid",
    ])
    expect(html).toMatch(/(?:It|MCP) does not expose every CLI command\./u)
    expect(readme).toContain("Seven editable")
    expect(llmsTxt).toContain("GPU support required by its selected profile")
    expect(llmsTxt).toContain("`scene camera-track` export")
    expect(llmsTxt).toContain("fixed set of 21 tools and ten operation codes")
    for (const surface of [llmsTxt, homeMarkdown]) {
      expect(surface).not.toContain("17-tool")
      expect(surface).not.toContain("current-source set")
    }
  })

  test("documentation discovery reaches the first-party index without inventing a hosted manual", async () => {
    const [html, config] = await Promise.all([read("apps/web/src/index.html"), read("apps/web/vercel.json")])
    expect(html).toContain('href="/docs">Docs</a>')
    for (const source of [homeMarkdown, llmsTxt, sitemapMarkdown]) expect(source).toContain("https://slopcamera.com/docs")
    // /docs is a sealed first-party surface: only the short aliases below may point into it.
    const routes = JSON.parse(config).redirects.filter((route: { has?: unknown }) => route.has === undefined)
    expect(routes).toEqual([
      { source: "/techniques", destination: "/docs/reference/techniques", permanent: true },
      { source: "/compare/remotion", destination: "/docs/explanation/slopcamera-vs-remotion", permanent: true },
      { source: "/compare/hyperframes", destination: "/docs/explanation/slopcamera-vs-hyperframes", permanent: true },
      { source: "/compare/remotion-alternatives", destination: "/docs/explanation/remotion-alternatives-for-coding-agents", permanent: true },
    ])
    const links = [...html.matchAll(/href="(https:\/\/github.com\/hraness\/slopcamera\/blob\/main\/docs\/[^"#]+)(?:#[^"]*)?"/gu)]
    expect(links.length).toBeGreaterThanOrEqual(1)
    const firstPartyLinks = [...html.matchAll(/href="(\/docs\/[^"#]+)"/gu)]
    expect(firstPartyLinks.length).toBeGreaterThanOrEqual(10)
    for (const [, route] of firstPartyLinks) expect(await Bun.file(new URL(`../src${route}.md`, import.meta.url)).exists()).toBe(true)
    const allowed = new Set(["README.md", "tutorials/first-diagram.md", "tutorials/first-native-film.md", "spatial-scenes.md", "studio.md", "directing-video.md", "how-to/edit-video.md", "how-to/generate-media.md", "how-to/educational-video.md", "how-to/run-workflows.md", "reference/capabilities.md", "architecture.md", "how-to/use-current-source.md"])
    for (const [, link] of links) expect(allowed.has(link!.split("/docs/")[1]!)).toBe(true)
    expect(html).not.toMatch(/<iframe\b/u)
    const media = renderExampleHero() + renderExampleGallery() + renderExampleRevision()
    expect(media).not.toMatch(/\sautoplay(?:\s|=|>)/u)
    for (const example of homepageExamples()) {
      expect(media).toContain(`data-example-id="${example.id}"`)
      expect(media).toContain(exampleUrl(example.poster))
      expect(media).toContain(exampleGuideUrl(example))
      expect(homeMarkdown).toContain(exampleUrl(example.poster))
    }
  })
})

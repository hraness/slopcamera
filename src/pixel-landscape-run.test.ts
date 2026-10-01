import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import fc from "fast-check"
import { createProcessLocalHostResourceCoordinator } from "./host-resources.js"
import { parseSlopcameraLandscapeJudgement, parseSlopcameraPixelLandscapeManifest, planSlopcameraPixelLandscape, runSlopcameraPixelLandscape, type SlopcameraLandscapeRunDependencies } from "./pixel-landscape-run.js"

const manifest = () => ({
  kind: "slopcamera.pixel-landscape", schemaVersion: 1, product: "Example", brief: "An orbital studio", rubric: "Review composition.",
  theme: { background: "#eff1f5", primary: "#1750bf", secondary: "#dce0e8" },
  sections: [{ id: "sky", description: "Sky observatory" }, { id: "garden", description: "Underground garden" }],
  candidates: [{ id: "first", direction: "Architectural engraving" }, { id: "second", direction: "Folded planes" }],
  generation: { provider: "vertex", model: "gemini-3-pro-image", judgeModel: "gemini-3.1-pro-preview", resolution: "2K", rounds: 1, concurrency: 2, maxImageCalls: 4, maxJudgeCalls: 2 },
  processing: { width: 64, panelHeight: 114, overlap: 16, pixelSize: 4, alphaMax: 1, gamma: 1.2, quietCenter: 0.45, upscale: 1 },
})
const score = (overall: number, defects: string[] = []) => JSON.stringify({ relevance: overall, continuity: overall, composition: overall, detail: overall, defects, revision: "" })
async function harness() {
  const png = await sharp({ create: { width: 64, height: 128, channels: 4, background: "white" } }).png().toBuffer()
  const defective = await sharp({ create: { width: 64, height: 128, channels: 4, background: "black" } }).png().toBuffer()
  let images = 0, judgements = 0
  const dependencies: SlopcameraLandscapeRunDependencies = {
    hostResourceCoordinator: createProcessLocalHostResourceCoordinator(),
    generate: async input => { images++; return { bytes: input.prompt.includes("Art direction: Architectural engraving") ? png : defective, mediaType: "image/png", model: input.model, provider: input.provider, requestId: `fake-${images}`, warnings: [] } },
    judge: async input => { judgements++; const qualified = (await sharp(input.images[0]!.bytes).raw().toBuffer())[0] === 255; return { text: score(qualified ? 8.75 : 9.5, qualified ? [] : ["broken seam"]), requestId: "fake-judge", provider: input.provider, model: input.model } },
    process: async input => { const source = input.panels[0]!; return { raster: source, pixels: source, mask: source, preview: source, width: 64, height: 128, ink: "#a8aaad", metrics: { seamError: 0, alphaCoverage: 0, centerCoverage: 0, paletteDistance: 0 }, warnings: [] } },
  }
  return { dependencies, counts: () => ({ images, judgements }) }
}
test("plan refuses a budget shortfall before effects", () => {
  const source = manifest()
  source.generation.maxImageCalls = 3
  expect(() => planSlopcameraPixelLandscape(source)).toThrow("cap")
  expect(planSlopcameraPixelLandscape(manifest()).imageCalls).toBe(4)
})
test("native tall generation uses the explicit ratio and rejects unsupported model geometry", () => {
  const input = manifest()
  const continuous = { ...input, sections: [input.sections[0]!], generation: { ...input.generation, model: "gemini-3.1-flash-image", aspectRatio: "1:4", resolution: "4K" }, processing: { ...input.processing, panelHeight: 256, overlap: 0 } }
  expect(planSlopcameraPixelLandscape(continuous).aspectRatio).toBe("1:4")
  expect(planSlopcameraPixelLandscape(continuous).height).toBe(256)
  expect(() => planSlopcameraPixelLandscape({ ...continuous, generation: { ...continuous.generation, model: "gemini-3-pro-image" } })).toThrow()
})
test("planner rejects duplicate IDs, excessive pixels, no overlap and unsupported landscape providers", () => {
  const source = manifest()
  source.sections[1]!.id = source.sections[0]!.id
  expect(() => planSlopcameraPixelLandscape(source)).toThrow("unique")
  const enormous = manifest(); enormous.processing.width = 4096; enormous.processing.panelHeight = 8192; enormous.processing.upscale = 4
  expect(() => planSlopcameraPixelLandscape(enormous)).toThrow("pixel limit")
  const noOverlap = manifest(); noOverlap.processing.overlap = 0
  expect(() => planSlopcameraPixelLandscape(noOverlap)).toThrow("overlap")
  expect(() => planSlopcameraPixelLandscape({ ...manifest(), generation: { ...manifest().generation, provider: "openai" } })).toThrow("continuity")
})
test("budget plan is invariant under section and candidate reordering", () => {
  fc.assert(fc.property(fc.boolean(), fc.boolean(), (sections, candidates) => {
    const source = manifest()
    const a = planSlopcameraPixelLandscape(source)
    if (sections) source.sections.reverse()
    if (candidates) source.candidates.reverse()
    const b = planSlopcameraPixelLandscape(source)
    expect([a.imageCalls, a.judgeCalls, a.height, a.ink]).toEqual([b.imageCalls, b.judgeCalls, b.height, b.ink])
  }), { numRuns: 30 })
})
test("parser rejects arbitrary foreign values without accepting invalid plans", () => {
  fc.assert(fc.property(fc.jsonValue(), value => {
    try {
      const parsed = parseSlopcameraPixelLandscapeManifest(value)
      expect(parsed.kind).toBe("slopcamera.pixel-landscape")
    } catch (error) { expect(error).toBeInstanceOf(Error) }
  }), { numRuns: 80 })
})
test("judgement accepts fenced JSON and rejects strings or out-of-range scores", () => {
  expect(parseSlopcameraLandscapeJudgement(`\`\`\`json\n${score(9)}\n\`\`\``).overall).toBe(9)
  expect(() => parseSlopcameraLandscapeJudgement(score(11))).toThrow()
  expect(() => parseSlopcameraLandscapeJudgement('{"relevance":"9"}')).toThrow()
})
test("qualified artwork outranks a higher mean with a blocking defect; every successful dispatch has a receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-landscape-"))
  try {
    const fake = await harness()
    const source = manifest(); source.candidates.reverse()
    const output = await runSlopcameraPixelLandscape(source, join(root, "out"), { allowCloudUpload: true }, fake.dependencies)
    expect(output.status).toBe("accepted-by-model")
    expect(output.selected).toBe("first-r1")
    expect(fake.counts()).toEqual({ images: 4, judgements: 2 })
    const attempt = JSON.parse(await readFile(join(root, "out", "first-r1", "panel-2.request.json"), "utf8")) as { references: { sha256: string }[] }
    expect(attempt.references[0]!.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(await readFile(join(root, "out", "preview.html"), "utf8")).toContain('image-rendering:pixelated')
    await expect(runSlopcameraPixelLandscape(manifest(), join(root, "out"), { allowCloudUpload: true }, fake.dependencies)).rejects.toThrow()
    expect(fake.counts().images).toBe(4)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("a failed paid panel is retained and never retried; surviving unscored artwork needs review", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-landscape-failure-"))
  try {
    const fake = await harness()
    const generate = fake.dependencies.generate!
    let failures = 0
    const output = await runSlopcameraPixelLandscape(manifest(), join(root, "out"), { allowCloudUpload: true }, {
      ...fake.dependencies,
      generate: async input => { if (input.prompt.includes("Art direction: Architectural engraving")) { failures++; throw new Error("private transport details") } return generate(input) },
      judge: async () => { throw new Error("ambiguous judging") },
    })
    expect(failures).toBe(1)
    expect(output.status).toBe("needs-review")
    expect(output.imageCalls).toBe(3)
    expect(output.failures).toHaveLength(1)
    expect(await readFile(join(root, "out", "first-r1", "panel-1.failure.json"), "utf8")).toContain("failed-or-ambiguous")
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("upload authority and fresh output are checked before paid calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-landscape-authority-"))
  try {
    const fake = await harness()
    await expect(runSlopcameraPixelLandscape(manifest(), join(root, "out"), {}, fake.dependencies)).rejects.toThrow("allow-cloud-upload")
    await mkdir(join(root, "existing"))
    await expect(runSlopcameraPixelLandscape(manifest(), join(root, "existing"), { allowCloudUpload: true }, fake.dependencies)).rejects.toThrow()
    expect(fake.counts()).toEqual({ images: 0, judgements: 0 })
  } finally { await rm(root, { recursive: true, force: true }) }
})

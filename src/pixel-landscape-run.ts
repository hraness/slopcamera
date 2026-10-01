import { createHash } from "node:crypto"
import { mkdir, realpath } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import sharp, { type OverlayOptions } from "sharp"
import { z } from "zod"
import { readBoundedFile } from "./bounded-file.js"
import { generateSlopcameraProviderImage, judgeSlopcameraProviderImages, validateSlopcameraProviderImageInput } from "./image-provider.js"
import { chooseSlopcameraLandscapeInk, processSlopcameraPixelLandscape } from "./pixel-landscape.js"
import { withSlopcameraOperationHostAdmission } from "./operations.js"
import { HostResourceError, type HostResourceCoordinator } from "./host-resources.js"
import { SlopcameraCloudError } from "./cloud-errors.js"
import { publishSlopcameraRetainedFile as retain } from "./retained-file.js"

const text = z.string().trim().min(1).max(8000)
const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/u)
const color = z.string().regex(/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/iu)
const manifestSchema = z.object({
  kind: z.literal("slopcamera.pixel-landscape"), schemaVersion: z.literal(1),
  product: text, brief: text, rubric: text,
  theme: z.object({ background: color, primary: color, secondary: color }).strict(),
  sections: z.array(z.object({ id, description: text, heading: z.string().min(1).max(256).optional(), body: z.string().max(2000).optional() }).strict()).min(1).max(8),
  content: z.array(z.object({ heading: z.string().min(1).max(256), body: z.string().max(2000) }).strict()).min(1).max(12).optional(),
  candidates: z.array(z.object({ id, direction: text }).strict()).min(1).max(4),
  generation: z.object({
    provider: z.enum(["vertex", "google", "openai", "gateway"]),
    model: z.string().min(1).max(256), judgeModel: z.string().min(1).max(256),
    aspectRatio: z.string().regex(/^\d{1,2}:\d{1,2}$/u).optional(),
    resolution: z.enum(["1K", "2K", "4K"]), rounds: z.number().int().min(1).max(2),
    concurrency: z.number().int().min(1).max(3),
    maxImageCalls: z.number().int().min(1).max(24), maxJudgeCalls: z.number().int().min(1).max(12),
  }).strict(),
  processing: z.object({
    width: z.number().int().min(64).max(4096), panelHeight: z.number().int().min(64).max(8192),
    overlap: z.number().int().min(0).max(2048), pixelSize: z.number().int().min(1).max(64),
    alphaMax: z.number().min(0.01).max(1), gamma: z.number().min(0.1).max(8),
    inkContrast: z.number().min(0.1).max(8).optional(),
    quietCenter: z.number().min(0).max(0.95), upscale: z.number().int().min(1).max(4),
    ink: color.optional(),
  }).strict(),
  panels: z.array(z.string().min(1).max(4096)).min(1).max(8).optional(),
}).strict()

export type SlopcameraPixelLandscapeManifest = z.infer<typeof manifestSchema>
export function parseSlopcameraPixelLandscapeManifest(value: unknown): SlopcameraPixelLandscapeManifest {
  const manifest = manifestSchema.parse(value)
  for (const items of [manifest.sections, manifest.candidates]) {
    if (new Set(items.map(row => row.id)).size !== items.length) throw new Error("Landscape IDs must be unique.")
  }
  const p = manifest.processing
  if (p.overlap >= p.panelHeight / 2) throw new Error("Landscape overlap must be less than half a panel.")
  if (manifest.sections.length > 1 && p.overlap === 0) throw new Error("Multiple landscape panels require an overlap.")
  const height = p.panelHeight * manifest.sections.length - p.overlap * (manifest.sections.length - 1)
  if (p.width * height * p.upscale ** 2 > 64_000_000) throw new Error("Landscape exceeds the 64 million pixel limit.")
  if (manifest.panels !== undefined && manifest.panels.length !== manifest.sections.length) throw new Error("Provide one source panel per section.")
  chooseSlopcameraLandscapeInk({ ...manifest.theme, ...(p.ink === undefined ? {} : { ink: p.ink }), alphaMax: p.alphaMax })
  return manifest
}

export function planSlopcameraPixelLandscape(value: unknown) {
  const manifest = parseSlopcameraPixelLandscapeManifest(value)
  const imageCalls = manifest.sections.length * (manifest.candidates.length + manifest.generation.rounds - 1)
  const judgeCalls = manifest.candidates.length + manifest.generation.rounds - 1
  if (imageCalls > manifest.generation.maxImageCalls || judgeCalls > manifest.generation.maxJudgeCalls) {
    throw new Error("Planned requests exceed the manifest's image or judging cap.")
  }
  if (manifest.generation.provider === "openai" || manifest.generation.provider === "gateway") {
    throw new Error("Landscape generation currently requires Vertex or Google for image continuity references and judging. Other providers remain available through image generate.")
  }
  const aspectRatio = manifest.generation.aspectRatio ?? "9:16"
  const [ratioWidth, ratioHeight] = aspectRatio.split(":").map(Number)
  if (Math.abs(manifest.processing.width / manifest.processing.panelHeight - ratioWidth! / ratioHeight!) > 0.005) throw new Error("Generated landscape panels must match the requested aspect ratio (minor pixel rounding is allowed).")
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/iu.test(manifest.generation.judgeModel)) throw new Error("Judge model must be a native Gemini model ID.")
  for (const direction of manifest.candidates) for (let index = 0; index < manifest.sections.length; index++) {
    validateSlopcameraProviderImageInput({ provider: manifest.generation.provider, model: manifest.generation.model, prompt: panelPrompt(manifest, direction.direction, index, "R".repeat(4000)), aspectRatio, resolution: manifest.generation.resolution })
  }
  const judgeBudgetPrompt = `${manifest.product}\n${manifest.brief}\n${manifest.rubric}\n${manifest.sections.map(s => s.description).join("; ")}${"M".repeat(2000)}`
  if (Buffer.byteLength(judgeBudgetPrompt, "utf8") > 32 * 1024) throw new Error("Landscape judging prompt exceeds the provider byte limit.")
  return {
    kind: "slopcamera.pixel-landscape-plan", schemaVersion: 1, product: manifest.product,
    imageCalls, judgeCalls, concurrency: manifest.generation.concurrency,
    width: manifest.processing.width * manifest.processing.upscale,
    height: (manifest.processing.panelHeight * manifest.sections.length - manifest.processing.overlap * (manifest.sections.length - 1)) * manifest.processing.upscale,
    ink: chooseSlopcameraLandscapeInk({ ...manifest.theme, ...(manifest.processing.ink === undefined ? {} : { ink: manifest.processing.ink }), alphaMax: manifest.processing.alphaMax }),
    provider: manifest.generation.provider, model: manifest.generation.model,
    aspectRatio,
    upload: "Only this run's generated predecessor panels and previews are uploaded for continuity and judging.",
    upscaling: manifest.processing.upscale > 1 ? "Lanczos interpolation; no new model-generated detail." : "No additional upscale.",
    candidates: manifest.candidates, sections: manifest.sections,
  }
}

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
async function json(path: string, value: unknown) { return retain(path, `${JSON.stringify(value, null, 2)}\n`) }
async function freshDirectory(path: string) {
  const parent = await realpath(dirname(resolve(path)))
  const output = join(parent, resolve(path).split("/").at(-1)!)
  await mkdir(output, { mode: 0o700 })
  return output
}
const judgementSchema = z.object({
  relevance: z.number().min(0).max(10), continuity: z.number().min(0).max(10),
  composition: z.number().min(0).max(10), detail: z.number().min(0).max(10),
  defects: z.array(z.string().max(1000)).max(20), revision: z.string().max(4000),
}).strip()
export function parseSlopcameraLandscapeJudgement(value: string) {
  if (typeof value !== "string" || value.length > 65_536) throw new Error("Landscape judgement must be a string of at most 65536 characters.")
  let raw = value.trim()
  if (raw.startsWith("```")) {
    raw = raw.slice(3)
    if (raw.startsWith("json")) raw = raw.slice(4)
    raw = raw.trimStart()
  }
  if (raw.endsWith("```")) raw = raw.slice(0, -3).trimEnd()
  const result = judgementSchema.parse(JSON.parse(raw) as unknown)
  return { ...result, overall: (result.relevance + result.continuity + result.composition + result.detail) / 4 }
}
type Judgement = ReturnType<typeof parseSlopcameraLandscapeJudgement>
const qualified = (j: Judgement | undefined) => j !== undefined && j.overall >= 8.5 && Math.min(j.relevance, j.continuity, j.composition, j.detail) >= 8 && j.defects.length === 0
type Processed = Awaited<ReturnType<typeof processSlopcameraPixelLandscape>>
function processingParameters(manifest: SlopcameraPixelLandscapeManifest) {
  const { ink, ...processing } = manifest.processing
  return { ...processing, ...(ink === undefined ? {} : { ink }), ...manifest.theme }
}
interface Candidate {
  id: string; direction: string; round: number; result: Processed; judgement?: Judgement;
  artifacts: Awaited<ReturnType<typeof publishProcessed>>; error?: string;
}
async function publishProcessed(directory: string, result: Processed) {
  return {
    raster: await retain(join(directory, "raster.png"), result.raster),
    pixels: await retain(join(directory, "pixels.png"), result.pixels),
    mask: await retain(join(directory, "mask.png"), result.mask),
    preview: await retain(join(directory, "preview.png"), result.preview),
    metrics: result.metrics, warnings: result.warnings, ink: result.ink, width: result.width, height: result.height,
  }
}

export interface SlopcameraLandscapeRunDependencies {
  readonly generate?: typeof generateSlopcameraProviderImage
  readonly judge?: typeof judgeSlopcameraProviderImages
  readonly process?: typeof processSlopcameraPixelLandscape
  readonly onProgress?: (message: string) => void
  readonly hostResourceCoordinator?: HostResourceCoordinator
}

function panelPrompt(manifest: SlopcameraPixelLandscapeManifest, direction: string, panelIndex: number, revision: string) {
  return [
    `Create one highly detailed portrait illustration panel for a continuous tall scrolling landscape for ${manifest.product}.`,
    manifest.brief, `Art direction: ${direction}`,
    `Whole descent: ${manifest.sections.map((s, i) => `${i + 1}. ${s.description}`).join("\n")}`,
    `THIS PANEL ${panelIndex + 1}/${manifest.sections.length}: ${manifest.sections[panelIndex]!.description}`,
    "Use monochrome charcoal drawing on pure white (#ffffff), strong legible silhouettes, finely organized architectural detail, restrained texture. No words, letters, numbers, logos, borders or captions. Do not draw pixels; the pixel treatment is applied later.",
    `Keep the central ${Math.round(manifest.processing.quietCenter * 100)}% of width mostly blank, softly atmospheric, with rich world-building clustered along both edges. Avoid horizontal divider lines.`,
    panelIndex === 0 ? "Begin in open atmospheric sky. Descend naturally to the next section; leave a compatible continuation at the bottom." :
      `The reference image is the bottom strip of the previous panel. Reproduce that strip's scene and perspective in the top ${Math.round(manifest.processing.overlap / manifest.processing.panelHeight * 100)}% of THIS image, then evolve the landscape downward. Continue the same structural lines, scale, lighting and drawing language. Do not repeat the entire previous panel.`,
    panelIndex === manifest.sections.length - 1 ? "Finish in a spacious quiet foundation with a clean atmospheric bottom fade." : "Leave coherent structures for the following panel to continue.",
    revision.length > 0 ? `Reviewer corrections: ${revision}` : "",
  ].filter(Boolean).join("\n\n")
}

export async function runSlopcameraPixelLandscape(value: unknown, outputPath: string, options: Readonly<{ allowCloudUpload?: boolean }> = {}, dependencies: SlopcameraLandscapeRunDependencies = {}) {
  const manifest = parseSlopcameraPixelLandscapeManifest(value)
  const plan = planSlopcameraPixelLandscape(manifest)
  if (options.allowCloudUpload !== true) throw new Error("Landscape continuity and judging upload this run's generated images. Supply --allow-cloud-upload.")
  const directory = await freshDirectory(outputPath)
  await json(join(directory, "manifest.json"), manifest)
  await json(join(directory, "plan.json"), plan)
  let imageCalls = 0, judgeCalls = 0
  const candidates: Candidate[] = []
  const failures: { id: string; round: number; error: string }[] = []
  const provider = manifest.generation.provider as "vertex" | "google"
  const admission = { ...(dependencies.hostResourceCoordinator === undefined ? {} : { hostResourceCoordinator: dependencies.hostResourceCoordinator }), waitTimeoutMilliseconds: 15 * 60_000 }
  async function candidate(id: string, direction: string, round: number, revision = "") {
    const target = join(directory, `${id}-r${round}`)
    await mkdir(target, { mode: 0o700 })
    const panels: Uint8Array[] = []
    for (let index = 0; index < manifest.sections.length; index++) {
      if (imageCalls >= manifest.generation.maxImageCalls) throw new Error("Image request cap reached.")
      const references = index === 0 ? [] : [{
        bytes: await sharp(panels[index - 1]!, { limitInputPixels: 64_000_000 }).resize(manifest.processing.width, manifest.processing.panelHeight, { fit: "fill" })
          .extract({ left: 0, top: manifest.processing.panelHeight - manifest.processing.overlap, width: manifest.processing.width, height: manifest.processing.overlap })
          .png().toBuffer(), mediaType: "image/png" as const,
      }]
      const prompt = panelPrompt(manifest, direction, index, revision)
      const attempt = `panel-${index + 1}`
      // Reserve the call and retain its identity before dispatch. No automatic paid retries.
      if (imageCalls >= manifest.generation.maxImageCalls) throw new Error("Image request cap reached.")
      const ordinal = ++imageCalls
      await json(join(target, `${attempt}.request.json`), { provider, model: manifest.generation.model, prompt, references: references.map(r => ({ sha256: digest(r.bytes), bytes: r.bytes.byteLength })), status: "prepared", ordinal })
      dependencies.onProgress?.(`${id} round ${round}: generating panel ${index + 1}/${manifest.sections.length}`)
      let enteredProvider = false
      try {
        const result = await withSlopcameraOperationHostAdmission("slopcamera.image.generate", () => {
          enteredProvider = true
          return (dependencies.generate ?? generateSlopcameraProviderImage)({ provider, model: manifest.generation.model, prompt, aspectRatio: manifest.generation.aspectRatio ?? "9:16", resolution: manifest.generation.resolution, references, allowCloudUpload: true })
        }, admission)
        panels.push(result.bytes)
        const extension = result.mediaType === "image/jpeg" ? "jpg" : result.mediaType === "image/webp" ? "webp" : "png"
        const output = await retain(join(target, `${attempt}.${extension}`), result.bytes)
        await json(join(target, `${attempt}.result.json`), { ...output, provider: result.provider, model: result.model, requestId: result.requestId, mediaType: result.mediaType, warnings: result.warnings, status: "completed" })
      } catch (error) {
        await json(join(target, `${attempt}.failure.json`), { status: enteredProvider ? "failed-or-ambiguous" : "not-dispatched", automaticRetry: false, ordinal, code: error instanceof SlopcameraCloudError || error instanceof HostResourceError ? error.code : null, diagnostic: error instanceof SlopcameraCloudError || error instanceof HostResourceError ? error.message : "Local transport or output failed." })
        throw new Error(`${id} panel ${index + 1} failed or may have been charged; inspect its retained attempt before a new run.`)
      }
    }
    dependencies.onProgress?.(`${id} round ${round}: stitching and applying the shared pixel grid`)
    const result = await withSlopcameraOperationHostAdmission("slopcamera.image.vectorize", () =>
      (dependencies.process ?? processSlopcameraPixelLandscape)({ panels, ...processingParameters(manifest) }), admission)
    const artifacts = await publishProcessed(target, result)
    const item: Candidate = { id, direction, round, result, artifacts }
    candidates.push(item)
    if (judgeCalls >= manifest.generation.maxJudgeCalls) throw new Error("Judging request cap reached.")
    judgeCalls++
    const images = [
      { bytes: await sharp(result.raster).resize({ width: 768, withoutEnlargement: true }).png().toBuffer(), mediaType: "image/png" as const },
      { bytes: await sharp(result.preview).resize({ width: 768, withoutEnlargement: true, kernel: "nearest" }).png().toBuffer(), mediaType: "image/png" as const },
    ]
    const seamLayers: OverlayOptions[] = []
    let seamHeight = 0
    for (let index = 1; index < manifest.sections.length; index++) {
      const joinY = (manifest.processing.panelHeight - manifest.processing.overlap) * index * manifest.processing.upscale
      const margin = 96 * manifest.processing.upscale
      const top = Math.max(0, joinY - margin)
      const height = Math.min(manifest.processing.overlap * manifest.processing.upscale + 2 * margin, result.height - top)
      const crop = await sharp(result.preview).extract({ left: 0, top, width: result.width, height }).resize({ width: 768, kernel: "nearest" }).png().toBuffer()
      seamLayers.push({ input: crop, left: 0, top: seamHeight })
      seamHeight += (await sharp(crop).metadata()).height!
    }
    if (seamHeight > 0) images.push({ bytes: await sharp({ create: { width: 768, height: seamHeight, channels: 4, background: manifest.theme.background } }).composite(seamLayers).png().toBuffer(), mediaType: "image/png" })
    const prompt = `Judge a subtle long-scroll marketing background for ${manifest.product}. The first image is stitched source; the second is the monochrome pixel treatment flattened on the site tint.\n${manifest.brief}\n${manifest.rubric}\nIntended stages: ${manifest.sections.map(s => s.description).join("; ")}\nDeterministic measurements: ${JSON.stringify(result.metrics)}\nBe demanding: look for discontinuities, repeated scenes, generic imagery, loss of useful detail, blocked central text space, and large dark masses. Return ONLY a JSON object with relevance, continuity, composition, detail (each numeric 0..10), defects (array of concrete blocking defects), revision (specific art-direction corrections). Do not assume the generation was successful.`
    await json(join(target, "judge.request.json"), { provider, model: manifest.generation.judgeModel, prompt, images: images.map(i => ({ sha256: digest(i.bytes), bytes: i.bytes.byteLength })), ordinal: judgeCalls })
    dependencies.onProgress?.(`${id} round ${round}: judging source detail, seams, and content clearance`)
    try {
      const response = await (dependencies.judge ?? judgeSlopcameraProviderImages)({ provider, model: manifest.generation.judgeModel, prompt, images, allowCloudUpload: true })
      await json(join(target, "judge.response.json"), response)
      item.judgement = parseSlopcameraLandscapeJudgement(response.text)
      await json(join(target, "judgement.json"), item.judgement)
    } catch {
      item.error = "Judging failed or returned an invalid score; human review required. No retry was dispatched."
      await json(join(target, "judge.failure.json"), { status: "failed-or-ambiguous", automaticRetry: false })
    }
    return item
  }
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(manifest.generation.concurrency, manifest.candidates.length) }, async () => {
    while (cursor < manifest.candidates.length) {
      const entry = manifest.candidates[cursor++]!
      try { await candidate(entry.id, entry.direction, 1) } catch (error) {
        failures.push({ id: entry.id, round: 1, error: error instanceof Error ? error.message : "Candidate failed." })
      }
    }
  }))
  const rank = () => [...candidates].sort((a, b) => Number(qualified(b.judgement)) - Number(qualified(a.judgement)) || (b.judgement?.overall ?? -1) - (a.judgement?.overall ?? -1) || a.id.localeCompare(b.id) || b.round - a.round)
  const first = rank()[0]
  // Refinement is a new, planned attempt; an ambiguous generation is never retried.
  if (manifest.generation.rounds === 2 && first?.judgement !== undefined && first.judgement.revision.trim().length > 0) {
    try { await candidate(first.id, first.direction, 2, first.judgement.revision) } catch (error) {
      failures.push({ id: first.id, round: 2, error: error instanceof Error ? error.message : "Refinement failed." })
    }
  }
  const selected = rank()[0]
  if (selected === undefined) {
    await json(join(directory, "receipt.json"), { kind: "slopcamera.pixel-landscape-receipt", schemaVersion: 1, status: "failed", imageCalls, judgeCalls, failures })
    throw new Error(`All candidates failed. Retained attempts: ${directory}`)
  }
  const sheet = await landscapeSheet(rank(), failures)
  await retain(join(directory, "gallery.png"), sheet)
  const j = selected.judgement
  const accepted = qualified(j)
  const receipt = {
    kind: "slopcamera.pixel-landscape-receipt", schemaVersion: 1,
    status: accepted ? "accepted-by-model" : "needs-review", selected: `${selected.id}-r${selected.round}`,
    imageCalls, judgeCalls, selectedArtifacts: selected.artifacts,
    candidates: rank().map(c => ({ id: c.id, round: c.round, artifacts: c.artifacts, judgement: c.judgement ?? null, error: c.error ?? null })), failures,
  }
  await retain(join(directory, "preview.html"), landscapePreview(manifest, rank(), receipt.selected))
  await json(join(directory, "receipt.json"), receipt)
  return { directory, ...receipt }
}

async function landscapeSheet(candidates: readonly Candidate[], failures: readonly { id: string; round: number; error: string }[] = []) {
  const width = 320, header = 48, height = Math.min(2400, Math.round(candidates[0]!.result.height / candidates[0]!.result.width * width))
  const layers: OverlayOptions[] = []
  for (const [index, c] of candidates.entries()) {
    layers.push({ input: await sharp(c.result.preview).resize(width, height, { fit: "fill", kernel: "nearest" }).png().toBuffer(), left: index * width, top: header })
    const label = `${c.id} r${c.round} | ${c.judgement?.overall.toFixed(1) ?? "unscored"}`
    layers.push({ input: Buffer.from(`<svg width="${width}" height="${header}"><rect width="100%" height="100%" fill="#17212b"/><text x="12" y="29" fill="white" font-size="14" font-family="sans-serif">${label}</text></svg>`), left: index * width, top: 0 })
  }
  for (const [index, f] of failures.entries()) {
    layers.push({ input: Buffer.from(`<svg width="${width}" height="${height + header}"><rect width="100%" height="100%" fill="#17212b"/><text x="12" y="29" fill="white" font-size="14" font-family="sans-serif">${f.id} r${f.round} | failed</text><text x="12" y="90" fill="#aab5c0" font-size="14" font-family="sans-serif">No generated candidate to compare.</text></svg>`), left: (candidates.length + index) * width, top: 0 })
  }
  return sharp({ create: { width: width * (candidates.length + failures.length), height: height + header, channels: 4, background: "#17212b" } }).composite(layers).png().toBuffer()
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
function previewTextColor(background: string) {
  const hex = background.slice(1)
  const expanded = hex.length === 3 ? [...hex].map(c => c + c).join("") : hex
  const channels = [0, 2, 4].map(offset => {
    const value = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff"
}
function landscapePreview(manifest: SlopcameraPixelLandscapeManifest, candidates: readonly Candidate[], selected: string) {
  const first = candidates.find(c => `${c.id}-r${c.round}` === selected)!
  const content = manifest.content ?? manifest.sections.map(s => ({ heading: s.heading ?? s.id.replaceAll("-", " "), body: s.body ?? manifest.product }))
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(manifest.product)} landscape review</title>
<style>*{box-sizing:border-box}body{margin:0;background:${manifest.theme.background};color:${previewTextColor(manifest.theme.background)};font:18px/1.5 system-ui}header{position:sticky;top:0;z-index:3;padding:12px 24px;background:${manifest.theme.background};border-bottom:1px solid #aaa;display:flex;gap:18px;align-items:center;flex-wrap:wrap}main{position:relative;isolation:isolate;min-height:calc(100vw * var(--art-ratio))}.art{position:absolute;top:0;left:0;width:100%;height:auto;z-index:-1;pointer-events:none;image-rendering:pixelated;opacity:var(--strength)}section{min-height:calc(100vw * var(--art-ratio) / var(--sections));max-width:760px;margin:auto;padding:clamp(96px,12vw,180px) 36px}.copy{padding:24px;background:${manifest.theme.background};border-radius:12px}h1{font-size:clamp(36px,6vw,72px);line-height:1.05}h2{font-size:clamp(28px,5vw,48px)}.card{padding:32px;border:1px solid #aab;background:${manifest.theme.background};border-radius:12px}button{background:${manifest.theme.primary};color:${previewTextColor(manifest.theme.primary)};border:0;padding:14px 24px;border-radius:8px}code{font-size:14px}label{font-size:14px}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid ${manifest.theme.primary};outline-offset:3px}@media(forced-colors:active){.art{display:none}}</style>
<header><strong>${escapeHtml(manifest.product)} · landscape study</strong><label>Direction <select id="choice">${candidates.map(c => `<option value="${c.id}-r${c.round}" ${`${c.id}-r${c.round}` === selected ? "selected" : ""}>${escapeHtml(c.id)} r${c.round}</option>`).join("")}</select></label><label>Ink strength <input id="strength" type="range" min="0" max="1" step=".01" value=".35"></label><span>Palette-checked ink <code>${first.result.ink}</code></span></header>
<main style="--ink:${first.result.ink};--strength:.35;--art-ratio:${first.result.height / first.result.width};--sections:${content.length}"><img class="art" aria-hidden="true" alt="" width="${first.result.width}" height="${first.result.height}" src="${selected}/pixels.png">${content.map((s, i) => `<section><div class="copy">${i === 0 ? `<h1>${escapeHtml(s.heading ?? manifest.product)}</h1>` : `<h2>${escapeHtml(s.heading)}</h2>`}<p>${escapeHtml(s.body)}</p><div class="card"><p>Sample content area for checking artwork density and text clearance.</p><button>Explore ${escapeHtml(manifest.product)}</button></div></div></section>`).join("")}</main>
<script>const main=document.querySelector('main'),art=document.querySelector('.art');document.querySelector('#strength').oninput=e=>main.style.setProperty('--strength',e.target.value);document.querySelector('#choice').onchange=e=>art.src=e.target.value+'/pixels.png';</script></html>`
}

export async function processSlopcameraLandscapeFiles(value: unknown, manifestPath: string, outputPath: string) {
  const manifest = parseSlopcameraPixelLandscapeManifest(value)
  if (manifest.panels === undefined) throw new Error("Local process requires panels in the manifest.")
  const panels = await Promise.all(manifest.panels.map(path => readBoundedFile(resolve(dirname(manifestPath), path), 32 * 1024 * 1024, "Landscape panel")))
  const directory = await freshDirectory(outputPath)
  const result = await withSlopcameraOperationHostAdmission("slopcamera.image.vectorize", () => processSlopcameraPixelLandscape({ panels, ...processingParameters(manifest) }))
  const artifacts = await publishProcessed(directory, result)
  await json(join(directory, "receipt.json"), { kind: "slopcamera.pixel-landscape-process", schemaVersion: 1, sources: panels.map(digest), ...artifacts })
  return { directory, ...artifacts }
}

import { createHash } from "node:crypto"
import { mkdir, realpath } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import sharp, { type OverlayOptions } from "sharp"
import { SlopcameraCloudError } from "./cloud-errors.js"
import { generateSlopcameraProviderImage, judgeSlopcameraProviderImages, validateSlopcameraProviderImageInput } from "./image-provider.js"
import { withSlopcameraOperationHostAdmission } from "./operations.js"
import { processSlopcameraPixelLandscape } from "./pixel-landscape.js"
import { parseSlopcameraLandscapeJudgement, parseSlopcameraPixelLandscapeManifest, type SlopcameraLandscapeRunDependencies, type SlopcameraPixelLandscapeManifest } from "./pixel-landscape-run.js"
import { publishSlopcameraRetainedFile as retain } from "./retained-file.js"

export interface SlopcameraPixelLandscapeRepairInput {
  source: Uint8Array
  manifest: SlopcameraPixelLandscapeManifest
  outputDirectory: string
  allowCloudUpload: true
  maxImageCalls: number
  maxJudgeCalls: number
}

interface Bridge {
  index: number
  top: number
  height: number
  bandTop: number
  bandHeight: number
  feather: number
  prompt: string
  reference: Uint8Array
}

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
const json = (path: string, value: unknown) => retain(path, `${JSON.stringify(value, null, 2)}\n`)
const smoothstep = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }

function repairPrompt(manifest: SlopcameraPixelLandscapeManifest, index: number, width: number, height: number, feather: number) {
  return [
    `Repair a single transition in this existing ${manifest.product} landscape illustration. The supplied image is the authoritative full-width crop, ${width} by ${height} pixels. Return exactly the same 4:3 composition and drawing language.`,
    manifest.brief,
    `The upper world depicts: ${manifest.sections[index - 1]!.description}\nThe lower world depicts: ${manifest.sections[index]!.description}`,
    `Keep the TOP and BOTTOM ${feather} pixel anchor strips and the scene's left/right endpoint positions, widths, perspective, scale, pure white ground and monochrome charcoal detail. Repair only the central ${height - 2 * feather} pixels. Do not redraw the whole world or add a horizontal divider.`,
    "Organically connect the existing architecture and travel paths from the upper structures into the lower scene, including any left spiral rail and right faceted spine visible in the reference. A wide blank gap or abruptly restarted rail is a defect. Use convincing curved connections and continuous structural perspective, not a blurred smudge, repeated scenery, or a pasted horizontal strip.",
    `Preserve the mostly blank middle ${Math.round(manifest.processing.quietCenter * 100)}% of width for marketing text; rich repair detail belongs along both sides. Keep source detail legible after ${manifest.processing.pixelSize}px pixel conversion. No text, numbers, logos, labels, borders or pixels.`,
  ].join("\n\n")
}

function blendBridge(raster: Uint8Array, patch: Uint8Array, width: number, bridge: Bridge): void {
  const localTop = bridge.bandTop - bridge.top
  for (let y = 0; y < bridge.bandHeight; y++) {
    const weight = smoothstep(Math.min(y, bridge.bandHeight - 1 - y) / bridge.feather)
    if (weight === 0) continue
    for (let x = 0; x < width; x++) {
      const offset = ((bridge.bandTop + y) * width + x) * 4
      const patchOffset = ((localTop + y) * width + x) * 4
      const oldAlpha = raster[offset + 3]! / 255 * (1 - weight)
      const newAlpha = patch[patchOffset + 3]! / 255 * weight
      const alpha = oldAlpha + newAlpha
      for (let channel = 0; channel < 3; channel++) {
        raster[offset + channel] = alpha === 0 ? 0 : Math.round((raster[offset + channel]! * oldAlpha + patch[patchOffset + channel]! * newAlpha) / alpha)
      }
      raster[offset + 3] = Math.round(alpha * 255)
    }
  }
}

/** Two-call maximum, retained bridge repair. Every failed/ambiguous request stops without retry. */
export async function repairSlopcameraPixelLandscape(input: SlopcameraPixelLandscapeRepairInput, dependencies: SlopcameraLandscapeRunDependencies = {}) {
  if (typeof input !== "object" || input === null) throw new Error("Repair input must be an object.")
  const manifest = parseSlopcameraPixelLandscapeManifest(input.manifest)
  const p = manifest.processing
  const provider = manifest.generation.provider
  if (provider !== "vertex" && provider !== "google") throw new Error("Landscape repair requires Vertex or Google reference-image generation.")
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/iu.test(manifest.generation.judgeModel)) throw new Error("Repair judge model must be a native Gemini model ID.")
  if (input.allowCloudUpload !== true) throw new Error("Repair uploads the retained source crops and judging images; supply --allow-cloud-upload.")
  if (!Number.isInteger(input.maxImageCalls) || input.maxImageCalls < 1 || input.maxImageCalls > 2 || !Number.isInteger(input.maxJudgeCalls) || input.maxJudgeCalls !== 1) throw new Error("Repair permits at most two image calls and exactly one judging call.")
  const count = manifest.sections.length - 1
  if (count < 1 || count > input.maxImageCalls) throw new Error("Repair's planned bridge requests exceed the image cap.")
  if (!(input.source instanceof Uint8Array) || input.source.byteLength === 0 || input.source.byteLength > 64 * 1024 * 1024) throw new Error("Repair source must contain at most 64 MiB of raster bytes.")
  if (typeof input.outputDirectory !== "string" || input.outputDirectory.length === 0 || input.outputDirectory.length > 4096) throw new Error("Repair output directory must be a bounded path.")
  const source = Uint8Array.from(input.source)
  const width = p.width * p.upscale
  const height = (p.panelHeight * manifest.sections.length - p.overlap * count) * p.upscale
  if (width > 16_384 || height > 16_384 || width * height > 64_000_000) throw new Error("Repair must fit the single-panel processor's 16,384 dimension and 64 million pixel limits.")
  const image = sharp(source, { limitInputPixels: 64_000_000, failOn: "error" })
  const metadata = await image.metadata()
  if (metadata.width !== width || metadata.height !== height || (metadata.pages ?? 1) !== 1 || !["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.orientation !== undefined && metadata.orientation !== 1)) throw new Error("Repair source must be the correctly sized static stitched raster.")
  const cropHeight = Math.round(width * 3 / 4)
  const feather = Math.max(1, Math.floor(cropHeight / 6))
  if (height < cropHeight || p.overlap * p.upscale > cropHeight - 4 * feather) throw new Error("Repair crop cannot contain the complete overlap with sufficient top/bottom anchors.")
  const bridges: Bridge[] = []
  for (let index = 1; index <= count; index++) {
    const center = (p.panelHeight - p.overlap) * p.upscale * index + p.overlap * p.upscale / 2
    const top = Math.max(0, Math.min(height - cropHeight, Math.round(center - cropHeight / 2)))
    const reference = await sharp(source, { limitInputPixels: 64_000_000 }).extract({ left: 0, top, width, height: cropHeight }).png().toBuffer()
    const prompt = repairPrompt(manifest, index, width, cropHeight, feather)
    validateSlopcameraProviderImageInput({ provider, model: manifest.generation.model, prompt, aspectRatio: "4:3", resolution: "2K", references: [{ bytes: reference, mediaType: "image/png" }], allowCloudUpload: true })
    bridges.push({ index, top, height: cropHeight, bandTop: top + feather, bandHeight: cropHeight - 2 * feather, feather, prompt, reference })
  }
  if (bridges.some((bridge, index) => index > 0 && bridges[index - 1]!.bandTop + bridges[index - 1]!.bandHeight > bridge.bandTop)) throw new Error("Repair bridge bands must not overlap.")
  const judgePrompt = `Judge the REPAIRED long-scroll marketing landscape for ${manifest.product}. Image 1 shows the whole detailed source; image 2 the whole pixel treatment; image 3 is a full-width transition contact sheet, with SOURCE LEFT and PIXEL PREVIEW RIGHT, one row for EVERY repaired join. Inspect both outer sides in every row.\n${manifest.brief}\n${manifest.rubric}\nDemand organic continuous paths and structure across both joins, matching perspective, scale and detail. Look for blank divider gaps, cut or restarted rails/spines, repeated pasted scenery, new edge seams at bridge feather boundaries, dense central text obstruction or dark masses. Do not reward a repair merely because it was attempted. Return ONLY JSON with relevance, continuity, composition, detail (numeric 0..10), defects (concrete blocking defects), revision (specific corrections).`
  if (Buffer.byteLength(judgePrompt) > 32 * 1024) throw new Error("Repair judging prompt exceeds its byte limit.")
  const target = resolve(input.outputDirectory)
  const parent = await realpath(dirname(target))
  const directory = join(parent, basename(target))
  await mkdir(directory, { mode: 0o700 })
  const admission = { ...(dependencies.hostResourceCoordinator === undefined ? {} : { hostResourceCoordinator: dependencies.hostResourceCoordinator }), waitTimeoutMilliseconds: 15 * 60_000 }
  let imageCalls = 0
  let judgeCalls = 0
  const attempts: Record<string, unknown>[] = []
  try {
    const original = await retain(join(directory, "original.png"), source)
    await json(join(directory, "manifest.json"), manifest)
    await json(join(directory, "plan.json"), { kind: "slopcamera.pixel-landscape-repair-plan", schemaVersion: 1, width, height, imageCalls: count, judgeCalls: 1, maxImageCalls: input.maxImageCalls, maxJudgeCalls: input.maxJudgeCalls, source: original, bridges: bridges.map(({ reference, prompt: _prompt, ...bridge }) => ({ ...bridge, reference: { bytes: reference.byteLength, sha256: digest(reference) } })) })
    const raster = await image.toColourspace("srgb").ensureAlpha().raw().toBuffer()
    for (const bridge of bridges) {
      const prefix = `bridge-${bridge.index}`
      const reference = await retain(join(directory, `${prefix}.reference.png`), bridge.reference)
      imageCalls++
      await json(join(directory, `${prefix}.request.json`), { provider, model: manifest.generation.model, prompt: bridge.prompt, aspectRatio: "4:3", resolution: "2K", references: [reference], ordinal: imageCalls, status: "prepared" })
      dependencies.onProgress?.(`Repairing transition ${bridge.index}/${bridges.length} with retained source anchors`)
      let enteredProvider = false
      try {
        const generated = await withSlopcameraOperationHostAdmission("slopcamera.image.generate", () => {
          enteredProvider = true
          return (dependencies.generate ?? generateSlopcameraProviderImage)({ provider, model: manifest.generation.model, prompt: bridge.prompt, aspectRatio: "4:3", resolution: "2K", references: [{ bytes: bridge.reference, mediaType: "image/png" }], allowCloudUpload: true })
        }, admission)
        if (!(generated.bytes instanceof Uint8Array) || generated.bytes.byteLength === 0 || generated.bytes.byteLength > 32 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(generated.mediaType)) throw new Error("Generated bridge bytes exceed the raster limits.")
        const extension = generated.mediaType === "image/jpeg" ? "jpg" : generated.mediaType === "image/webp" ? "webp" : "png"
        const generatedFile = await retain(join(directory, `${prefix}.generated.${extension}`), generated.bytes)
        const response = { ...generatedFile, provider: generated.provider, model: generated.model, requestId: generated.requestId, mediaType: generated.mediaType, warnings: generated.warnings, status: "completed", automaticRetry: false }
        attempts.push(response)
        await json(join(directory, `${prefix}.result.json`), response)
        const patchImage = sharp(generated.bytes, { limitInputPixels: 64_000_000, failOn: "error" })
        const patchMetadata = await patchImage.metadata()
        if ((patchMetadata.pages ?? 1) !== 1 || !["png", "jpeg", "webp"].includes(patchMetadata.format ?? "")) throw new Error("Generated bridge is not a static raster.")
        const patch = await patchImage.rotate().resize(width, bridge.height, { fit: "fill", kernel: "lanczos3" }).toColourspace("srgb").ensureAlpha().raw().toBuffer()
        blendBridge(raster, patch, width, bridge)
      } catch (error) {
        await json(join(directory, `${prefix}.failure.json`), { status: enteredProvider ? "failed-or-ambiguous" : "not-dispatched", automaticRetry: false, ordinal: imageCalls, code: error instanceof SlopcameraCloudError ? error.code : null, diagnostic: error instanceof SlopcameraCloudError ? error.message : "Repair admission, transport, decoding or retention failed." })
        throw new Error(`Repair transition ${bridge.index} failed or may have been charged; inspect retained attempts before a new run.`)
      }
    }
    const repaired = await sharp(raster, { raw: { width, height, channels: 4 } }).png().toBuffer()
    const { ink, ...processing } = p
    const result = await withSlopcameraOperationHostAdmission("slopcamera.image.vectorize", () => (dependencies.process ?? processSlopcameraPixelLandscape)({ ...processing, ...(ink === undefined ? {} : { ink }), ...manifest.theme, panels: [repaired], width, panelHeight: height, overlap: 0, upscale: 1 }), admission)
    const artifacts = {
      raster: await retain(join(directory, "raster.png"), result.raster), pixels: await retain(join(directory, "pixels.png"), result.pixels),
      mask: await retain(join(directory, "mask.png"), result.mask), preview: await retain(join(directory, "preview.png"), result.preview),
      width: result.width, height: result.height, ink: result.ink, metrics: result.metrics, warnings: result.warnings,
    }
    const wholeSource = await sharp(result.raster).resize({ width: 768, withoutEnlargement: true }).png().toBuffer()
    const wholePixels = await sharp(result.preview).resize({ width: 768, withoutEnlargement: true, kernel: "nearest" }).png().toBuffer()
    const sheetWidth = Math.min(768, width)
    const sheetRowHeight = Math.round(cropHeight * sheetWidth / width)
    const layers: OverlayOptions[] = []
    for (const [index, bridge] of bridges.entries()) {
      for (const [column, bytes] of [result.raster, result.preview].entries()) {
        layers.push({ input: await sharp(bytes).extract({ left: 0, top: bridge.top, width, height: bridge.height }).resize(sheetWidth, sheetRowHeight, { kernel: column === 0 ? "lanczos3" : "nearest" }).png().toBuffer(), left: column * sheetWidth, top: index * sheetRowHeight })
      }
    }
    const sheet = await sharp({ create: { width: sheetWidth * 2, height: sheetRowHeight * bridges.length, channels: 4, background: manifest.theme.background } }).composite(layers).png().toBuffer()
    const images = [wholeSource, wholePixels, sheet].map(bytes => ({ bytes, mediaType: "image/png" as const }))
    const judgeFiles = []
    for (const [index, reference] of images.entries()) judgeFiles.push(await retain(join(directory, `judge-${index + 1}.png`), reference.bytes))
    judgeCalls++
    await json(join(directory, "judge.request.json"), { provider, model: manifest.generation.judgeModel, prompt: judgePrompt, images: judgeFiles, ordinal: judgeCalls, status: "prepared" })
    let judgement: ReturnType<typeof parseSlopcameraLandscapeJudgement> | undefined
    let judgeFailure: string | null = null
    try {
      dependencies.onProgress?.("Judging repaired whole landscape and every full-width seam")
      const response = await (dependencies.judge ?? judgeSlopcameraProviderImages)({ provider, model: manifest.generation.judgeModel, prompt: judgePrompt, images, allowCloudUpload: true })
      await json(join(directory, "judge.response.json"), response)
      judgement = parseSlopcameraLandscapeJudgement(response.text)
      await json(join(directory, "judgement.json"), judgement)
    } catch {
      judgeFailure = "Judging failed or returned an invalid score; review required. No automatic retry."
      await json(join(directory, "judge.failure.json"), { status: "failed-or-ambiguous", automaticRetry: false })
    }
    const accepted = judgement !== undefined && judgement.overall >= 8.5 && Math.min(judgement.relevance, judgement.continuity, judgement.composition, judgement.detail) >= 8 && judgement.defects.length === 0
    const receipt = { kind: "slopcamera.pixel-landscape-repair-receipt", schemaVersion: 1, status: accepted ? "accepted-by-model" : "needs-review", imageCalls, judgeCalls, source: original, attempts, artifacts, judgement: judgement ?? null, error: judgeFailure, warnings: ["Bridge patches are resized with Lanczos3 interpolation; no additional detail is invented by resizing.", "Only central bridge bands were blended; surrounding source pixels and the original retained raster remain unchanged.", "Local bridge repair cannot fix a composition gap extending beyond the retained crop anchors."] }
    await json(join(directory, "receipt.json"), receipt)
    return { directory, ...receipt }
  } catch (error) {
    await json(join(directory, "receipt.json"), { kind: "slopcamera.pixel-landscape-repair-receipt", schemaVersion: 1, status: "failed", imageCalls, judgeCalls, attempts, automaticRetry: false })
    throw error
  }
}

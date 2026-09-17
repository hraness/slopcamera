import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import sharp from "sharp"
import { SlopcameraCloudError } from "./cloud-errors.js"
import type { SpatialSceneDiffEntry } from "./spatial-scene/patch.js"
import {
  generateSlopcameraImage,
  slopcameraImageModels,
  slopcameraMaximumPromptBytes,
  type GeneratedSlopcameraImage,
  type SlopcameraGenerateDependencies,
} from "./generate.js"

/**
 * Parallel visual-candidate galleries for agent review.
 *
 * One bounded batch produces several independent candidate rasters — texture
 * maps, skyboxes, backdrops, sprites, or plain design images — and composes
 * them into a single labelled contact sheet. Each cell carries a stable
 * candidate id so an agent can inspect the sheet once and then promote a
 * chosen candidate file into a scene asset or design slot explicitly. The
 * gallery never edits authored source: generation and selection stay
 * separate, and every candidate keeps its exact prompt, request id, media
 * type, and digest in the receipt.
 */

export const slopcameraGalleryKinds = Object.freeze([
  "image",
  "texture",
  "skybox",
  "backdrop",
  "sprite",
] as const)
export type SlopcameraGalleryKind = (typeof slopcameraGalleryKinds)[number]

export const slopcameraGalleryAxes = Object.freeze([
  "style",
  "palette",
  "material",
  "lighting",
  "mood",
  "detail",
] as const)
export type SlopcameraGalleryAxis = (typeof slopcameraGalleryAxes)[number]

export const slopcameraGalleryLimits = Object.freeze({
  candidates: 16,
  concurrency: 4,
  subjectBytes: 2_048,
  candidatePromptBytes: slopcameraMaximumPromptBytes,
  variantBytes: 1_024,
  idLength: 64,
  cellEdgeMin: 64,
  cellEdgeMax: 1_024,
  cellEdgeDefault: 512,
  labelHeight: 28,
  cellGap: 8,
  galleryPixels: 33_554_432,
  candidatePixels: 33_554_432,
  candidateEdge: 8_192,
})

interface GalleryKindContract {
  readonly aspect: readonly [number, number]
  readonly frame: (subject: string) => string
  readonly rules: string
}

const GALLERY_KIND_CONTRACTS: Record<SlopcameraGalleryKind, GalleryKindContract> = {
  image: {
    aspect: [1, 1],
    frame: subject => subject,
    rules:
      "Clean readable composition; no text, captions, borders, or watermark.",
  },
  texture: {
    aspect: [1, 1],
    frame: subject => `Seamless tileable texture of ${subject}.`,
    rules:
      "Flat orthographic top-down material surface, uniform diffuse lighting, " +
      "edge-to-edge surface detail that tiles in both directions; no shadows, " +
      "no specular highlights, no vignette, no borders, no objects, no text.",
  },
  skybox: {
    aspect: [2, 1],
    frame: subject => `Seamless equirectangular 360-degree panorama of ${subject}.`,
    rules:
      "Full spherical environment in 2:1 equirectangular projection, continuous " +
      "horizon exactly at the vertical center, left and right edges wrapping " +
      "seamlessly; no seams, no text, no watermark, no foreground frame.",
  },
  backdrop: {
    aspect: [16, 9],
    frame: subject => `Flat scenic backdrop plate of ${subject}.`,
    rules:
      "Edge-to-edge environment plate for compositing behind foreground " +
      "subjects, consistent perspective and lighting across the frame; no " +
      "borders, no text, no watermark.",
  },
  sprite: {
    aspect: [1, 1],
    frame: subject => `A single ${subject} on a plain solid neutral background.`,
    rules:
      "One centered subject, fully visible with a clean silhouette, flat even " +
      "lighting; no shadows, no extra objects, no text, no watermark.",
  },
}

const GALLERY_AXIS_DEFAULTS: Record<SlopcameraGalleryAxis, readonly string[]> = {
  style: ["photorealistic", "stylized painterly", "flat minimal", "hand-drawn"],
  palette: ["warm earthy palette", "cool desaturated palette", "neutral grayscale palette", "vivid saturated palette"],
  material: ["rough weathered surface", "smooth polished surface", "organic natural surface", "synthetic industrial surface"],
  lighting: ["soft diffuse lighting", "dramatic directional lighting", "flat ambient lighting", "golden-hour lighting"],
  mood: ["serene calm mood", "dramatic mood", "playful mood", "mysterious mood"],
  detail: ["minimal sparse detail", "balanced detail", "intricate dense detail"],
}

const SKYBOX_AXIS_DEFAULTS: Partial<Record<SlopcameraGalleryAxis, readonly string[]>> = {
  material: ["clear air", "light haze", "thin clouds", "dense dramatic clouds"],
  lighting: ["golden hour", "overcast midday", "clear night sky", "midday sun"],
}

function axisValues(kind: SlopcameraGalleryKind, axis: SlopcameraGalleryAxis): readonly string[] {
  return kind === "skybox"
    ? SKYBOX_AXIS_DEFAULTS[axis] ?? GALLERY_AXIS_DEFAULTS[axis]
    : GALLERY_AXIS_DEFAULTS[axis]
}

function invalidArgument(message: string): never {
  throw new SlopcameraCloudError("INVALID_ARGUMENT", message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, name: string, maximumBytes: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  ) {
    invalidArgument(`${name} must be non-empty text no more than ${maximumBytes} UTF-8 bytes.`)
  }
  return value.trim()
}

export function galleryCandidateId(value: unknown): string {
  const id = boundedText(value, "Candidate id", slopcameraGalleryLimits.idLength)
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(id)) {
    invalidArgument("Candidate id must start with an alphanumeric and contain only alphanumerics, '.', '_', or '-'.")
  }
  return id
}

function slug(value: string): string {
  const slugged = value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(part => part.length > 0)
    .join("-")
    .slice(0, slopcameraGalleryLimits.idLength)
  return slugged.length === 0 ? "candidate" : slugged
}

export interface SlopcameraGalleryAxisSpec {
  readonly axis: SlopcameraGalleryAxis
  readonly values?: readonly string[]
}

export interface SlopcameraGalleryExplicitCandidate {
  readonly id: string
  readonly prompt?: string
  readonly variant?: string
}

export interface SlopcameraGalleryPlanInput {
  readonly subject: string
  readonly kind?: SlopcameraGalleryKind
  readonly count?: number
  readonly vary?: readonly (SlopcameraGalleryAxisSpec | SlopcameraGalleryAxis | unknown)[]
  readonly candidates?: readonly (SlopcameraGalleryExplicitCandidate | unknown)[]
  readonly tiled?: boolean
}

export interface SlopcameraGalleryCandidate {
  readonly index: number
  readonly id: string
  readonly prompt: string
  readonly label: string
}

export interface SlopcameraGalleryPlan {
  readonly subject: string
  readonly kind: SlopcameraGalleryKind
  readonly aspect: readonly [number, number]
  readonly axes: readonly { readonly axis: SlopcameraGalleryAxis; readonly values: readonly string[] }[]
  readonly candidates: readonly SlopcameraGalleryCandidate[]
  readonly tiled: boolean
}

function galleryKind(value: unknown): SlopcameraGalleryKind {
  const kind = value ?? "image"
  if (typeof kind !== "string" || !slopcameraGalleryKinds.includes(kind as SlopcameraGalleryKind)) {
    invalidArgument(`kind must be one of: ${slopcameraGalleryKinds.join(", ")}.`)
  }
  return kind as SlopcameraGalleryKind
}

/**
 * Build the style-locked prompt for one candidate. An explicit candidate
 * `prompt` replaces the template verbatim; a `variant` phrase is appended as
 * the variation direction inside the same contract.
 */
export function galleryPromptFor(
  subject: string,
  kind: SlopcameraGalleryKind,
  variant?: string,
): string {
  const contract = GALLERY_KIND_CONTRACTS[kind]
  const sections = [contract.frame(subject), `Rules: ${contract.rules}`]
  const direction = variant?.trim()
  if (direction !== undefined && direction.length > 0) {
    sections.push(`Variation direction: ${direction}.`)
  }
  return sections.join("\n\n")
}

function axisSpec(value: unknown): SlopcameraGalleryAxisSpec {
  if (typeof value === "string") {
    const axis = value.trim()
    if (!slopcameraGalleryAxes.includes(axis as SlopcameraGalleryAxis)) {
      invalidArgument(`vary axis must be one of: ${slopcameraGalleryAxes.join(", ")}.`)
    }
    return { axis: axis as SlopcameraGalleryAxis }
  }
  if (!isRecord(value)) invalidArgument("vary entries must be axis names or {axis, values} objects.")
  const axis = value.axis
  if (!slopcameraGalleryAxes.includes(axis as SlopcameraGalleryAxis)) {
    invalidArgument(`vary axis must be one of: ${slopcameraGalleryAxes.join(", ")}.`)
  }
  const values = value.values
  if (values !== undefined) {
    if (!Array.isArray(values) || values.length < 1 || values.length > slopcameraGalleryLimits.candidates) {
      invalidArgument("vary values must be a bounded non-empty list.")
    }
    return {
      axis: axis as SlopcameraGalleryAxis,
      values: values.map(item => boundedText(item, "vary value", slopcameraGalleryLimits.variantBytes)),
    }
  }
  return { axis: axis as SlopcameraGalleryAxis }
}

function explicitCandidate(value: unknown): SlopcameraGalleryExplicitCandidate {
  if (!isRecord(value)) invalidArgument("candidates entries must be {id, prompt|variant} objects.")
  const id = galleryCandidateId(value.id)
  const prompt = value.prompt
  const variant = value.variant
  if (prompt !== undefined && variant !== undefined) {
    invalidArgument("A candidate supplies prompt or variant, not both.")
  }
  if (prompt === undefined && variant === undefined) {
    invalidArgument("A candidate requires a prompt or a variant.")
  }
  return {
    id,
    ...(prompt === undefined ? {} : { prompt: boundedText(prompt, "candidate prompt", slopcameraGalleryLimits.candidatePromptBytes) }),
    ...(variant === undefined ? {} : { variant: boundedText(variant, "candidate variant", slopcameraGalleryLimits.variantBytes) }),
  }
}

/**
 * Resolve the bounded deterministic candidate list. Automatic `--vary` axes
 * take a cartesian product of their values (later axes vary fastest); an
 * explicit candidate list supplies ids and prompt/variant pairs directly.
 */
export function planSlopcameraGallery(input: SlopcameraGalleryPlanInput): SlopcameraGalleryPlan {
  if (!isRecord(input)) invalidArgument("Gallery input must be an object.")
  const subject = boundedText(input.subject, "subject", slopcameraGalleryLimits.subjectBytes)
  const kind = galleryKind(input.kind)
  const aspect = GALLERY_KIND_CONTRACTS[kind].aspect
  const vary = (input.vary ?? []).map(axisSpec)
  const explicit = input.candidates?.map(explicitCandidate)
  if (explicit !== undefined && vary.length > 0) {
    invalidArgument("candidates and vary are mutually exclusive.")
  }
  if (explicit !== undefined && input.count !== undefined) {
    invalidArgument("candidates and count are mutually exclusive.")
  }
  if (vary.length > slopcameraGalleryAxes.length || new Set(vary.map(spec => spec.axis)).size !== vary.length) {
    invalidArgument("vary axes must be unique.")
  }
  const count = input.count
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > slopcameraGalleryLimits.candidates)) {
    invalidArgument(`count must be an integer from 1 through ${slopcameraGalleryLimits.candidates}.`)
  }
  const tiled = input.tiled
  if (tiled !== undefined && typeof tiled !== "boolean") {
    invalidArgument("tiled must be a boolean when set.")
  }

  const axes = vary.map(spec => ({
    axis: spec.axis,
    values: spec.values ?? axisValues(kind, spec.axis).slice(0, slopcameraGalleryLimits.candidates),
  }))
  const prompts: { id: string; prompt: string; label: string }[] = []
  if (explicit !== undefined) {
    if (explicit.length < 1 || explicit.length > slopcameraGalleryLimits.candidates) {
      invalidArgument(`candidates must contain 1 through ${slopcameraGalleryLimits.candidates} entries.`)
    }
    for (const candidate of explicit) {
      prompts.push({
        id: candidate.id,
        prompt: candidate.prompt ?? galleryPromptFor(subject, kind, candidate.variant),
        label: candidate.id,
      })
    }
  } else if (axes.length > 0) {
    const total = axes.reduce((product, spec) => product * spec.values.length, 1)
    if (total < 1 || total > slopcameraGalleryLimits.candidates) {
      invalidArgument(`vary expands to ${String(total)} candidates; the bound is ${slopcameraGalleryLimits.candidates}.`)
    }
    const seen = new Set<string>()
    for (let combination = 0; combination < total; combination++) {
      let remainder = combination
      const parts: string[] = []
      for (let index = axes.length - 1; index >= 0; index--) {
        const spec = axes[index]!
        const value = spec.values[remainder % spec.values.length]!
        remainder = Math.floor(remainder / spec.values.length)
        parts.unshift(`${spec.axis}: ${value}`)
      }
      const direction = parts.join("; ")
      let id = slug(parts.map(part => part.split(": ")[1]!).join("-"))
      if (seen.has(id)) id = `${id}-${String(combination + 1)}`
      seen.add(id)
      prompts.push({ id, prompt: galleryPromptFor(subject, kind, direction), label: id })
    }
  } else {
    const requested = count ?? 4
    for (let index = 0; index < requested; index++) {
      const id = `candidate-${String(index + 1)}`
      prompts.push({ id, prompt: galleryPromptFor(subject, kind), label: id })
    }
  }
  return {
    subject,
    kind,
    aspect,
    axes,
    candidates: prompts.map((candidate, index) => ({ index: index + 1, ...candidate })),
    tiled: tiled ?? kind === "texture",
  }
}

/**
 * Parse the shared `--vary` CLI grammar: `axis[=v1,v2][;axis2...]`. Both the
 * portable and desktop command surfaces accept the same spelling.
 */
export function parseSlopcameraGalleryVary(
  value: string,
): SlopcameraGalleryAxisSpec[] {
  const specs: SlopcameraGalleryAxisSpec[] = []
  for (const part of value.split(";")) {
    const trimmed = part.trim()
    if (trimmed === "") continue
    const [axis, values] = trimmed.split("=", 2)
    if (!slopcameraGalleryAxes.includes(axis!.trim() as SlopcameraGalleryAxis)) {
      invalidArgument(`vary axis must be one of: ${slopcameraGalleryAxes.join(", ")}.`)
    }
    if (values === undefined) {
      specs.push({ axis: axis!.trim() as SlopcameraGalleryAxis })
      continue
    }
    const list = values
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    if (list.length === 0 || list.length > slopcameraGalleryLimits.candidates) {
      invalidArgument("vary values must be a non-empty bounded comma-separated list.")
    }
    specs.push({ axis: axis!.trim() as SlopcameraGalleryAxis, values: list })
  }
  if (specs.length === 0) {
    invalidArgument("vary requires at least one axis, e.g. 'style; palette=warm,cool'.")
  }
  return specs
}

/* Deterministic 5×7 bitmap label font. Gallery labels must render identically
 * on every host, so text is drawn pixel-by-pixel rather than through a
 * platform font stack. */
const FONT_5X7: Readonly<Record<string, readonly string[]>> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "a": ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  "b": ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  "c": ["00000", "00000", "01110", "10000", "10000", "10001", "01110"],
  "d": ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  "e": ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  "f": ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  "g": ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  "h": ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  "i": ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  "j": ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  "k": ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  "l": ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  "m": ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  "n": ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  "o": ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  "p": ["00000", "00000", "11110", "10001", "11110", "10000", "10000"],
  "q": ["00000", "00000", "01101", "10011", "01111", "00001", "00001"],
  "r": ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  "s": ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  "t": ["01000", "01000", "11100", "01000", "01000", "01001", "00110"],
  "u": ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  "v": ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  "w": ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  "x": ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  "y": ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  "z": ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
}

function labelPixels(text: string, width: number, height: number): Buffer {
  const scale = 2
  const rgba = Buffer.alloc(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel++) {
    const index = pixel * 4
    rgba[index] = 18
    rgba[index + 1] = 21
    rgba[index + 2] = 27
    rgba[index + 3] = 255
  }
  const draw = (character: string, originX: number): void => {
    const glyph = FONT_5X7[character] ?? FONT_5X7["?"]!
    const originY = Math.floor((height - 7 * scale) / 2)
    for (let row = 0; row < 7; row++) {
      for (let column = 0; column < 5; column++) {
        if (glyph[row]![column] !== "1") continue
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = originX + column * scale + dx
            const y = originY + row * scale + dy
            if (x < 0 || x >= width || y < 0 || y >= height) continue
            const index = (y * width + x) * 4
            rgba[index] = 235
            rgba[index + 1] = 238
            rgba[index + 2] = 244
            rgba[index + 3] = 255
          }
        }
      }
    }
  }
  const advance = 6 * scale
  const maximum = Math.floor((width - 8) / advance)
  const sanitized = text.toLowerCase().replace(/[^a-z0-9 #._:=/?-]/gu, "?").slice(0, Math.max(0, maximum))
  for (let index = 0; index < sanitized.length; index++) {
    draw(sanitized[index]!, 4 + index * advance)
  }
  return rgba
}

function mediaExtension(mediaType: string): string {
  if (mediaType === "image/png") return "png"
  if (mediaType === "image/jpeg") return "jpg"
  if (mediaType === "image/webp") return "webp"
  invalidArgument("Candidate media type is unsupported.")
  return "png"
}

async function atomicPublish(path: string, bytes: Uint8Array | string): Promise<void> {
  const temporaryPath = join(
    dirname(path),
    `.${randomUUID()}.slopcamera-gallery.tmp`,
  )
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" })
    await link(temporaryPath, path)
  } catch {
    throw new SlopcameraCloudError(
      "OUTPUT_WRITE_FAILED",
      "Slopcamera could not atomically write a gallery output; existing files are never replaced.",
    )
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export interface SlopcameraGalleryInput extends SlopcameraGalleryPlanInput {
  readonly model?: string
  readonly outputDir: string
  readonly cellEdge?: number
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

export interface SlopcameraGalleryDependencies extends SlopcameraGenerateDependencies {
  readonly generate?: typeof generateSlopcameraImage
}

export interface SlopcameraGalleryCandidateReceipt {
  readonly index: number
  readonly id: string
  readonly label: string
  readonly prompt: string
  readonly status: "generated" | "failed"
  readonly path?: string
  readonly sha256?: string
  readonly bytes?: number
  readonly mediaType?: string
  readonly requestId?: string
  readonly warnings?: readonly string[]
  readonly error?: string
  /** Durable provenance record for the candidate, when the host keeps one. */
  readonly job?: string
  /** The cell repeats the candidate 2×2 so tile seams are reviewable. */
  readonly tiled?: boolean
  /**
   * Rendered review evidence composited into the cell, distinct from the
   * generated candidate identified by `path`/`sha256`. Promotion must always
   * target the candidate artifact, never this render.
   */
  readonly cellImage?: {
    readonly path?: string
    readonly sha256: string
    readonly bytes: number
    readonly mediaType: string
  }
  /**
   * Scene-variant provenance: the typed patch applied to the base scene and
   * the derived scene identity. Present only on `slopcamera.scene-gallery`
   * receipts, where `path`/`sha256` identify the derived scene document.
   */
  readonly scene?: {
    readonly patchSha256: string
    readonly sceneSha256: string
    readonly diff: readonly SpatialSceneDiffEntry[]
  }
  readonly cell?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

export interface SlopcameraGalleryReceipt {
  readonly kind: "slopcamera.image-gallery" | "slopcamera.scene-gallery"
  readonly schemaVersion: 1
  readonly subject: string
  readonly galleryKind: SlopcameraGalleryKind | "scene"
  readonly model: string
  readonly provider: "vercel-ai-gateway" | "local"
  /** Present on `slopcamera.scene-gallery` receipts: the authored base scene. */
  readonly baseSceneSha256?: string
  readonly cell: { readonly width: number; readonly height: number; readonly labelHeight: number }
  readonly axes: readonly { readonly axis: SlopcameraGalleryAxis; readonly values: readonly string[] }[]
  readonly candidates: readonly SlopcameraGalleryCandidateReceipt[]
  readonly counts: { readonly requested: number; readonly generated: number; readonly failed: number }
  readonly gallery: {
    readonly path: string
    readonly sha256: string
    readonly bytes: number
    readonly mediaType: "image/png"
    readonly width: number
    readonly height: number
  }
  readonly receiptPath: string
  readonly clientMaxRetries: 0
}

/**
 * One settled candidate outcome. `path` and `sha256` are set when the caller
 * already published the bytes durably (for example through a tracked Gateway
 * artifact job); otherwise the composition step publishes `bytes` into the
 * gallery output directory itself. `job` optionally names the durable
 * provenance record an agent can inspect before promoting the candidate.
 */
export interface SlopcameraGalleryResolvedCandidate {
  readonly index: number
  readonly id: string
  readonly label: string
  readonly prompt: string
  readonly status: "generated" | "failed"
  readonly bytes?: Uint8Array
  readonly mediaType?: string
  readonly requestId?: string
  readonly warnings?: readonly string[]
  readonly error?: string
  readonly job?: string
  readonly path?: string
  readonly sha256?: string
  /**
   * A rendered review image (for example a probe-scene still) shown in the
   * cell instead of the raw candidate. `path`/`sha256` identify the durable
   * render artifact; the candidate's own `path`/`sha256` still record the
   * generated source bytes so promotion never picks the review render.
   */
  readonly cellImage?: {
    readonly bytes: Uint8Array
    readonly mediaType: string
    readonly path?: string
    readonly sha256?: string
  }
  /**
   * Scene-variant provenance carried into the receipt row. When set the
   * candidate artifact is the derived scene document (`mediaType`
   * `application/json`) and `cellImage` is its rendered beauty still.
   */
  readonly scene?: {
    readonly patchSha256: string
    readonly sceneSha256: string
    readonly diff: readonly SpatialSceneDiffEntry[]
  }
}

async function generateCandidate(
  candidate: SlopcameraGalleryCandidate,
  model: string,
  input: SlopcameraGalleryInput,
  dependencies: SlopcameraGalleryDependencies,
): Promise<SlopcameraGalleryResolvedCandidate> {
  const generate = dependencies.generate ?? generateSlopcameraImage
  try {
    const generated: GeneratedSlopcameraImage = await generate(
      {
        model,
        prompt: candidate.prompt,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      },
      dependencies,
    )
    const bytes = Buffer.from(generated.image.base64, "base64")
    return {
      index: candidate.index,
      id: candidate.id,
      label: candidate.label,
      prompt: candidate.prompt,
      status: "generated",
      bytes,
      mediaType: generated.image.mediaType,
      requestId: generated.requestId,
      warnings: generated.warnings,
    }
  } catch (error) {
    return {
      index: candidate.index,
      id: candidate.id,
      label: candidate.label,
      prompt: candidate.prompt,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Bounded worker pool: at most `concurrency` paid requests in flight. */
async function mapBounded<In, Out>(
  items: readonly In[],
  concurrency: number,
  worker: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await worker(items[index]!)
      }
    }),
  )
  return results
}

function galleryModel(value: unknown): string {
  const model = value ?? slopcameraImageModels[1]
  if (
    typeof model !== "string" ||
    model.length > 256 ||
    !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/iu.test(model)
  ) {
    invalidArgument("model must be a bounded Vercel AI Gateway provider/model id.")
  }
  return model
}

function galleryCellEdge(value: unknown): number {
  const cellEdge = value ?? slopcameraGalleryLimits.cellEdgeDefault
  if (
    typeof cellEdge !== "number" ||
    !Number.isInteger(cellEdge) ||
    cellEdge < slopcameraGalleryLimits.cellEdgeMin ||
    cellEdge > slopcameraGalleryLimits.cellEdgeMax
  ) {
    invalidArgument(`cellEdge must be an integer from ${String(slopcameraGalleryLimits.cellEdgeMin)} through ${String(slopcameraGalleryLimits.cellEdgeMax)}.`)
  }
  return cellEdge
}

function galleryOutputDir(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 4_096 ||
    value.includes("\0")
  ) {
    invalidArgument("outputDir must be a non-empty bounded local directory path.")
  }
  return resolve(value)
}

export async function generateSlopcameraImageGallery(
  rawInput: unknown,
  dependencies: SlopcameraGalleryDependencies = {},
): Promise<SlopcameraGalleryReceipt> {
  if (!isRecord(rawInput)) invalidArgument("Gallery input must be an object.")
  const input = rawInput as unknown as SlopcameraGalleryInput
  const outputDir = galleryOutputDir(input.outputDir)
  const model = galleryModel(input.model)
  const cellEdge = galleryCellEdge(input.cellEdge)
  const plan = planSlopcameraGallery(input)
  await mkdir(outputDir, { recursive: true })

  const generated = await mapBounded(
    plan.candidates,
    slopcameraGalleryLimits.concurrency,
    async candidate => await generateCandidate(candidate, model, input, dependencies),
  )
  return await composeSlopcameraImageGallery({
    candidates: generated,
    cellEdge,
    model,
    outputDir,
    plan,
  })
}

/**
 * Receipt identity for producers that compose the same labelled contact sheet
 * without the Gateway image lane — currently `slopcamera ai scene gallery`,
 * whose candidates are derived scene documents rather than generated images.
 */
export interface SlopcameraSceneGalleryReceiptSpec {
  readonly kind: "slopcamera.scene-gallery"
  readonly baseSceneSha256: string
}

/**
 * Compose settled candidates into the labelled contact sheet and receipt.
 * Hosts that publish candidates through their own durable artifact lane set
 * `path`/`sha256`/`job` per candidate; candidates without `path` are published
 * into `outputDir` by this seam. Either way every candidate row keeps its
 * prompt, digest, and provenance so review and promotion stay explicit.
 */
export async function composeSlopcameraImageGallery(input: {
  readonly candidates: readonly SlopcameraGalleryResolvedCandidate[]
  readonly cellEdge?: number
  readonly model: string
  readonly outputDir: string
  readonly plan: SlopcameraGalleryPlan
  readonly receipt?: SlopcameraSceneGalleryReceiptSpec
}): Promise<SlopcameraGalleryReceipt> {
  const outputDir = galleryOutputDir(input.outputDir)
  const model = galleryModel(input.model)
  const cellEdge = galleryCellEdge(input.cellEdge)
  const { plan } = input
  if (!isRecord(plan) || !Array.isArray(plan.candidates) || plan.candidates.length === 0) {
    invalidArgument("plan must be a non-empty gallery plan from planSlopcameraGallery.")
  }
  const generated = input.candidates
  await mkdir(outputDir, { recursive: true })

  const labelHeight = slopcameraGalleryLimits.labelHeight
  const cellWidth = cellEdge
  const cellHeight = Math.round(cellEdge * plan.aspect[1] / plan.aspect[0])
  const cellBodyHeight = cellHeight + labelHeight
  const columns = Math.max(1, Math.ceil(Math.sqrt(generated.length)))
  const rows = Math.ceil(generated.length / columns)
  const gap = slopcameraGalleryLimits.cellGap
  const sheetWidth = columns * cellWidth + (columns - 1) * gap
  const sheetHeight = rows * cellBodyHeight + (rows - 1) * gap
  if (sheetWidth * sheetHeight > slopcameraGalleryLimits.galleryPixels) {
    invalidArgument("Gallery sheet exceeds its pixel budget; reduce count or cellEdge.")
  }

  const receiptCandidates: SlopcameraGalleryCandidateReceipt[] = []
  const overlays: { input: Buffer; left: number; top: number }[] = []
  for (const candidate of generated) {
    const column = (candidate.index - 1) % columns
    const row = Math.floor((candidate.index - 1) / columns)
    const x = column * (cellWidth + gap)
    const y = row * (cellBodyHeight + gap)
    const labelText = candidate.status === "failed"
      ? `#${String(candidate.index)} ${candidate.label} failed`
      : `#${String(candidate.index)} ${candidate.label}`
    overlays.push({
      input: await sharp(labelPixels(labelText, cellWidth, labelHeight), {
        raw: { width: cellWidth, height: labelHeight, channels: 4 },
      }).png().toBuffer(),
      left: x,
      top: y,
    })
    if (candidate.status === "generated") {
      if (candidate.bytes === undefined || candidate.mediaType === undefined) {
        invalidArgument("A generated gallery candidate requires its bytes and media type.")
      }
      const path = candidate.path ?? join(
        outputDir,
        `candidate-${String(candidate.index).padStart(2, "0")}-${slug(candidate.id)}.${mediaExtension(candidate.mediaType)}`,
      )
      if (candidate.path === undefined) {
        await atomicPublish(path, candidate.bytes)
      }
      const sha256 = createHash("sha256").update(candidate.bytes).digest("hex")
      if (candidate.sha256 !== undefined && candidate.sha256 !== sha256) {
        invalidArgument("A pre-published gallery candidate digest does not match its bytes.")
      }
      let cellSource: ReturnType<typeof sharp>
      let cellReceipt: SlopcameraGalleryCandidateReceipt["cellImage"]
      if (candidate.cellImage !== undefined) {
        const cellSha256 = createHash("sha256").update(candidate.cellImage.bytes).digest("hex")
        if (
          candidate.cellImage.sha256 !== undefined
          && candidate.cellImage.sha256 !== cellSha256
        ) {
          invalidArgument("A gallery cell image digest does not match its bytes.")
        }
        const cellCandidate = sharp(candidate.cellImage.bytes, {
          limitInputPixels: slopcameraGalleryLimits.candidatePixels,
          failOn: "warning",
        })
        const cellMetadata = await cellCandidate.metadata()
        if (
          cellMetadata.width === undefined || cellMetadata.height === undefined
          || cellMetadata.width > slopcameraGalleryLimits.candidateEdge
          || cellMetadata.height > slopcameraGalleryLimits.candidateEdge
          || cellMetadata.width * cellMetadata.height > slopcameraGalleryLimits.candidatePixels
        ) {
          invalidArgument("A gallery cell image exceeds its raster bounds.")
        }
        cellSource = cellCandidate
        cellReceipt = {
          sha256: cellSha256,
          bytes: candidate.cellImage.bytes.byteLength,
          mediaType: candidate.cellImage.mediaType,
          ...(candidate.cellImage.path === undefined
            ? {}
            : { path: candidate.cellImage.path }),
        }
      } else {
        // Without a rendered cell the candidate itself is rasterized, so it
        // must be a bounded image. Non-raster candidates (derived scene
        // documents) are only admitted when a rendered cell image exists.
        const source = sharp(candidate.bytes, {
          limitInputPixels: slopcameraGalleryLimits.candidatePixels,
          failOn: "warning",
        })
        const metadata = await source.metadata()
        if (
          metadata.width === undefined || metadata.height === undefined ||
          metadata.width > slopcameraGalleryLimits.candidateEdge ||
          metadata.height > slopcameraGalleryLimits.candidateEdge ||
          metadata.width * metadata.height > slopcameraGalleryLimits.candidatePixels
        ) {
          invalidArgument("A generated candidate exceeds its raster bounds.")
        }
        cellSource = source
      }
      const resized = await cellSource
        .resize(cellWidth, cellHeight, { fit: "cover" })
        .png()
        .toBuffer()
      const cellImage = plan.tiled && candidate.cellImage === undefined
        ? await (async () => {
          const tile = await sharp(resized)
            .resize(Math.ceil(cellWidth / 2), Math.ceil(cellHeight / 2), { fit: "fill" })
            .png()
            .toBuffer()
          const positions = [0, Math.floor(cellWidth / 2)]
          const rows = [0, Math.floor(cellHeight / 2)]
          return sharp({
            create: {
              width: cellWidth,
              height: cellHeight,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
          })
            .composite(rows.flatMap(top =>
              positions.map(left => ({ input: tile, left, top })),
            ))
            .png()
            .toBuffer()
        })()
        : resized
      overlays.push({ input: cellImage, left: x, top: y + labelHeight })
      receiptCandidates.push({
        index: candidate.index,
        id: candidate.id,
        label: candidate.label,
        prompt: candidate.prompt,
        status: "generated",
        path,
        sha256,
        bytes: candidate.bytes.byteLength,
        mediaType: candidate.mediaType,
        ...(candidate.requestId === undefined ? {} : { requestId: candidate.requestId }),
        ...(candidate.warnings === undefined ? {} : { warnings: candidate.warnings }),
        ...(candidate.job === undefined ? {} : { job: candidate.job }),
        ...(plan.tiled && candidate.cellImage === undefined ? { tiled: true } : {}),
        ...(cellReceipt === undefined ? {} : { cellImage: cellReceipt }),
        ...(candidate.scene === undefined ? {} : { scene: candidate.scene }),
        cell: { x, y, width: cellWidth, height: cellBodyHeight },
      })
    } else {
      const hasRetainedArtifact = candidate.bytes !== undefined
        || candidate.mediaType !== undefined
        || candidate.path !== undefined
        || candidate.sha256 !== undefined
      let retainedArtifact: {
        readonly bytes: number
        readonly mediaType: string
        readonly path: string
        readonly sha256: string
      } | undefined
      if (hasRetainedArtifact) {
        if (
          candidate.bytes === undefined
          || candidate.mediaType === undefined
          || candidate.path === undefined
        ) {
          invalidArgument("A failed gallery candidate artifact requires bytes, media type, and path.")
        }
        const sha256 = createHash("sha256").update(candidate.bytes).digest("hex")
        if (candidate.sha256 !== undefined && candidate.sha256 !== sha256) {
          invalidArgument("A failed gallery candidate artifact digest does not match its bytes.")
        }
        retainedArtifact = {
          bytes: candidate.bytes.byteLength,
          mediaType: candidate.mediaType,
          path: candidate.path,
          sha256,
        }
      }
      const blank = Buffer.alloc(cellWidth * cellHeight * 4)
      for (let pixel = 0; pixel < cellWidth * cellHeight; pixel++) {
        const index = pixel * 4
        blank[index] = 48
        blank[index + 1] = 52
        blank[index + 2] = 60
        blank[index + 3] = 255
      }
      overlays.push({
        input: await sharp(blank, {
          raw: { width: cellWidth, height: cellHeight, channels: 4 },
        }).png().toBuffer(),
        left: x,
        top: y + labelHeight,
      })
      receiptCandidates.push({
        index: candidate.index,
        id: candidate.id,
        label: candidate.label,
        prompt: candidate.prompt,
        status: "failed",
        ...retainedArtifact,
        ...(candidate.requestId === undefined ? {} : { requestId: candidate.requestId }),
        ...(candidate.warnings === undefined ? {} : { warnings: candidate.warnings }),
        ...(candidate.error === undefined ? {} : { error: candidate.error }),
        ...(candidate.job === undefined ? {} : { job: candidate.job }),
        ...(candidate.scene === undefined ? {} : { scene: candidate.scene }),
        cell: { x, y, width: cellWidth, height: cellBodyHeight },
      })
    }
  }

  const sheet = await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 10, g: 12, b: 16, alpha: 255 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer()
  const galleryPath = join(outputDir, "gallery.png")
  await atomicPublish(galleryPath, sheet)
  const gallerySha256 = createHash("sha256").update(sheet).digest("hex")

  const failed = generated.filter(candidate => candidate.status === "failed").length
  const receiptPath = join(outputDir, "receipt.json")
  const receipt: SlopcameraGalleryReceipt = {
    kind: input.receipt?.kind ?? "slopcamera.image-gallery",
    schemaVersion: 1,
    subject: plan.subject,
    galleryKind: input.receipt === undefined ? plan.kind : "scene",
    model,
    provider: input.receipt === undefined ? "vercel-ai-gateway" : "local",
    ...(input.receipt === undefined
      ? {}
      : { baseSceneSha256: input.receipt.baseSceneSha256 }),
    cell: { width: cellWidth, height: cellHeight, labelHeight },
    axes: plan.axes,
    candidates: receiptCandidates,
    counts: {
      requested: generated.length,
      generated: generated.length - failed,
      failed,
    },
    gallery: {
      path: galleryPath,
      sha256: gallerySha256,
      bytes: sheet.byteLength,
      mediaType: "image/png",
      width: sheetWidth,
      height: sheetHeight,
    },
    receiptPath,
    clientMaxRetries: 0,
  }
  await atomicPublish(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  if (failed === generated.length) {
    throw new SlopcameraCloudError(
      "GENERATION_FAILED",
      `Every gallery candidate failed; see ${receiptPath} for the retained attempt record.`,
    )
  }
  return receipt
}

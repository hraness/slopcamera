import { createHash, randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { z } from "zod"
import { SlopcameraCloudError } from "./cloud-errors.js"
import {
  createFixedGatewayFetch,
  generateSlopcameraImage,
  resolveSlopcameraGatewayCredential,
  slopcameraGatewayApiBaseUrl,
  type SlopcameraGenerateDependencies,
} from "./generate.js"
import {
  resolveVectorizeLimits,
  VectorizeDeadline,
  vectorizeHardLimits,
} from "./vectorize/limits.js"
import { normalizedHexColor, parseHexColor } from "./vectorize/metrics.js"
import { encodeTracePng, loadRaster } from "./vectorize/pixels.js"
import type { VectorizeReceipt } from "./vectorize/types.js"
import { vectorizeImage } from "./vectorize/vectorize.js"

/**
 * Two-class product-identity generation for developer-tool surfaces.
 *
 * `mark` produces a compact symbol built from a few bold masses that must
 * stay legible at favicon and header sizes. `illustration` produces the
 * related isometric artwork for marketing placements: simple structure,
 * bounded fills, and no hairline detail that disappears at 64 px.
 *
 * The pipeline combines four stages. A purpose-specific style-locked prompt
 * produces one bounded Gateway raster. Local pixel processing estimates the
 * background and ink colors, projects every pixel onto the background→ink
 * axis to recover antialiased stroke coverage, drops speckle components,
 * crops to content, and re-emits canonical ink-on-transparent RGBA for the
 * bounded vectorizer. Deterministic geometry gates then reject candidates
 * whose mass, aspect, or path count cannot serve the declared purpose. A
 * purpose-specific vision critique reviews the rendered SVG and its prompt
 * fix feeds the next attempt, so failed generations are retried with
 * concrete corrections instead of silently shipped.
 */

export const slopcameraIconDefaultInk = "#2474d4"
export const slopcameraIconPanel = "#f7f8fb"
export const slopcameraIconDefaultRounds = 2
export const slopcameraIconMaximumRounds = 4
export const slopcameraIconSubjectMaximumBytes = 1_024
export const slopcameraIconCritiqueDefaultModel = "google/gemini-3-flash"
export const slopcameraIconCritiqueTimeoutMs = 120_000
const iconCritiqueMaximumResponseBytes = 8 * 1024 * 1024
const iconPreviewMaximumEdge = 448
const iconCoverageAlphaFloor = 24
const iconCropAlphaFloor = 16
const iconMarginRatio = 0.08

const MARK_CRITIQUE_SYSTEM = `You are a strict design reviewer for small product marks.

Style contract:
- A distinctive, immediately recognizable silhouette or geometric symbol.
- One to three bold masses with optional negative-space cuts and one ink color.
- No fine line art, hatching, texture, tiny holes, text, shading, gradients, shadows, or background objects.
- Clear at 16 px, balanced at 32 px, centered with optical rather than excessive margin.

Judge the attached rendered mark against the contract and whether it clearly depicts the requested subject. Return pass only when it is ready for favicons, application icons, headers, and compact project cards. Score is an integer from 0 to 100. When it fails, make promptFix a concrete image-prompt correction that addresses the listed problems.`

const ILLUSTRATION_CRITIQUE_SYSTEM = `You are a strict design reviewer for product-brand illustrations.

Style contract:
- A simple isometric illustration of the requested subject that can belong to the same visual family as a separate brand mark. Do not require or include the brand mark inside the illustration.
- Uniform medium-weight structure in exactly one ink color, with at most three large filled planes.
- No hairlines, hatching, texture, tiny repeated detail, shading, gradients, shadows, text, or stray background objects.
- No important feature may disappear at 64 px. Center the subject with a modest clear margin.

Judge the attached rendered illustration against the contract and whether it clearly depicts the requested subject. Return pass only when it is ready for a marketing header or feature section. Score is an integer from 0 to 100. When it fails, make promptFix a concrete image-prompt correction that addresses the listed problems.`

export interface IconCritique {
  readonly pass: boolean
  readonly problems: readonly string[]
  readonly promptFix: string
  readonly resolvedModel: string | null
  readonly score: number
}

export interface IconAttemptReceipt {
  readonly critiqueError?: string
  readonly critiqueModel?: string
  readonly pass?: boolean
  readonly problems?: readonly string[]
  readonly requestId: string
  readonly round: number
  readonly score?: number
  readonly status: "selected" | "candidate" | "failed"
  readonly svgSha256?: string
  readonly vectorize?: VectorizeReceipt
  readonly warnings: readonly string[]
}

export interface SlopcameraIconReceipt {
  readonly attempts: readonly IconAttemptReceipt[]
  readonly ink: string
  readonly model: string
  readonly outputPath: string
  readonly purpose: SlopcameraIconPurpose
  readonly rasterPath?: string
  readonly receiptVersion: 1
  readonly rounds: number
  readonly selectedRound: number
  readonly subject: string
  readonly svgSha256: string
}

export type SlopcameraIconPurpose = "illustration" | "mark"

export interface GenerateSlopcameraIconInput {
  readonly critiqueModel?: string
  readonly inheritedFileDescriptors?: readonly number[]
  readonly ink?: string
  readonly keepRaster?: boolean
  readonly model?: string
  readonly outputPath: string
  readonly purpose?: SlopcameraIconPurpose
  readonly rounds?: number
  readonly signal?: AbortSignal
  readonly subject: string
}

export interface IconCandidate {
  readonly png: Uint8Array
  readonly requestId: string
  readonly svg: string
  readonly vectorize: VectorizeReceipt
  readonly warnings: readonly string[]
}

interface IconLanguageRuntime {
  readonly Output: {
    object(input: {
      readonly description: string
      readonly name: string
      readonly schema: z.ZodType
    }): unknown
  }
  readonly createGateway: (settings: Readonly<{
    apiKey: string
    baseURL: typeof slopcameraGatewayApiBaseUrl
    fetch: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>
  }>) => { languageModel(model: string): unknown }
  readonly generateText: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>
}

export interface SlopcameraIconDependencies
  extends SlopcameraGenerateDependencies {
  readonly critique?: (
    input: Readonly<{
      ink: string
      model: string
      png: Uint8Array
      purpose: SlopcameraIconPurpose
      signal?: AbortSignal
      subject: string
    }>,
  ) => Promise<IconCritique>
  readonly generate?: typeof generateSlopcameraImage
  readonly loadLanguageRuntime?: () => Promise<IconLanguageRuntime>
  readonly rasterize?: (svg: string) => Promise<Uint8Array>
  readonly vectorize?: typeof vectorizeImage
}

function invalidArgument(message: string): never {
  throw new SlopcameraCloudError("INVALID_ARGUMENT", message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  )
}

function validateSubject(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    Buffer.byteLength(value, "utf8") > slopcameraIconSubjectMaximumBytes
  ) {
    invalidArgument(
      `Subject must be non-empty text no more than ${slopcameraIconSubjectMaximumBytes} UTF-8 bytes.`,
    )
  }
  return value.trim()
}

function validateIconModel(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 256 ||
    !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/iu.test(value)
  ) {
    invalidArgument(`${name} must be a bounded Vercel AI Gateway provider/model id.`)
  }
  return value
}

function validateRounds(value: number | undefined): number {
  const rounds = value ?? slopcameraIconDefaultRounds
  if (
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    rounds > slopcameraIconMaximumRounds
  ) {
    invalidArgument(`rounds must be an integer from 1 through ${slopcameraIconMaximumRounds}.`)
  }
  return rounds
}

export function iconPromptFor(
  subject: string,
  options: Readonly<{
    feedback?: string
    ink?: string
    purpose?: SlopcameraIconPurpose
  }> = {},
): string {
  const ink = normalizedHexColor(options.ink ?? slopcameraIconDefaultInk)
  const purpose = options.purpose ?? "illustration"
  const sections = purpose === "mark"
    ? [
        `A single small product mark for ${subject}.`,
        "Style rules: front-facing or simple isometric geometry; a distinctive silhouette built from one to three bold masses; " +
          `one single ink color ${ink} on a flat near-white background ${slopcameraIconPanel}; ` +
          "negative space may separate major parts; no thin outlines, hatching, texture, tiny holes, shading, gradients, shadows, text, border, container shape, or extra objects; " +
          "clear and recognizable at 16 pixels, balanced at 32 pixels, centered with a modest optical margin.",
      ]
    : [
        `A single minimal product-brand illustration of ${subject}.`,
        "Style rules: simple orthographic isometric projection; uniform medium-weight structural lines and at most three large filled planes; " +
          `one single ink color ${ink} on a flat near-white background ${slopcameraIconPanel}; ` +
          "no hairlines, hatching, texture, tiny repeated detail, shading, gradients, shadows, text, border, or extra objects; " +
          "every important feature remains visible at 64 pixels; centered with a modest clear margin; clean geometric edges.",
      ]
  const feedback = options.feedback?.trim()
  if (feedback !== undefined && feedback.length > 0) {
    sections.push(`The previous attempt was rejected. Correct it: ${feedback}`)
  }
  return sections.join("\n\n")
}

function medianChannel(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]!
}

function borderBackground(
  rgba: Uint8Array,
  width: number,
  height: number,
): readonly [number, number, number] {
  const thickness = Math.max(1, Math.round(Math.min(width, height) * 0.02))
  const step = Math.max(
    1,
    Math.floor((2 * thickness * (width + height)) / 8_192),
  )
  const red: number[] = []
  const green: number[] = []
  const blue: number[] = []
  let sampled = 0
  const collect = (x: number, y: number): void => {
    if (sampled % step !== 0) {
      sampled += 1
      return
    }
    sampled += 1
    const index = (y * width + x) * 4
    const alpha = rgba[index + 3]!
    if (alpha < 128) return
    red.push(rgba[index]!)
    green.push(rgba[index + 1]!)
    blue.push(rgba[index + 2]!)
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x < thickness ||
        x >= width - thickness ||
        y < thickness ||
        y >= height - thickness
      ) {
        collect(x, y)
      }
    }
  }
  if (red.length === 0) {
    // A fully transparent border means the source is already cut-out line
    // art. Treat it as near-white: coverage is still gated by source alpha.
    return [252, 252, 252]
  }
  return [medianChannel(red), medianChannel(green), medianChannel(blue)]
}

function measuredInkColor(
  rgba: Uint8Array,
  width: number,
  height: number,
  background: readonly [number, number, number],
): readonly [number, number, number] {
  const total = width * height
  const step = Math.max(1, Math.floor(total / 1_000_000))
  const bins = new Map<number, number[]>()
  const counts = new Map<number, number>()
  for (let pixel = 0; pixel < total; pixel += step) {
    const index = pixel * 4
    if (rgba[index + 3]! < 128) continue
    const dr = rgba[index]! - background[0]
    const dg = rgba[index + 1]! - background[1]
    const db = rgba[index + 2]! - background[2]
    if (Math.sqrt(dr * dr + dg * dg + db * db) < 44) continue
    const key =
      ((rgba[index]! >> 3) << 10) |
      ((rgba[index + 1]! >> 3) << 5) |
      (rgba[index + 2]! >> 3)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    const bucket = bins.get(key) ?? []
    if (bucket.length < 4_096) {
      bucket.push(rgba[index]!, rgba[index + 1]!, rgba[index + 2]!)
      bins.set(key, bucket)
    }
  }
  const dominant = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  )[0]
  if (dominant === undefined) {
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      "The generated icon raster contains no ink strokes.",
    )
  }
  const bucket = bins.get(dominant[0])!
  const red: number[] = []
  const green: number[] = []
  const blue: number[] = []
  for (let index = 0; index + 2 < bucket.length; index += 3) {
    red.push(bucket[index]!)
    green.push(bucket[index + 1]!)
    blue.push(bucket[index + 2]!)
  }
  return [medianChannel(red), medianChannel(green), medianChannel(blue)]
}

function dropSpeckles(
  alpha: Uint8Array,
  width: number,
  height: number,
): number {
  const minimumComponent = Math.max(8, Math.floor(width * height * 0.00004))
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let removed = 0
  for (let start = 0; start < alpha.length; start += 1) {
    if (alpha[start]! < iconCoverageAlphaFloor || seen[start] === 1) continue
    let head = 0
    let tail = 0
    queue[tail] = start
    tail += 1
    seen[start] = 1
    const component: number[] = []
    let minimumX = width
    let maximumX = -1
    let minimumY = height
    let maximumY = -1
    while (head < tail) {
      const pixel = queue[head]!
      head += 1
      component.push(pixel)
      const x = pixel % width
      const y = Math.floor(pixel / width)
      minimumX = Math.min(minimumX, x)
      maximumX = Math.max(maximumX, x)
      minimumY = Math.min(minimumY, y)
      maximumY = Math.max(maximumY, y)
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x < width - 1 ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y < height - 1 ? pixel + width : -1,
      ]
      for (const neighbor of neighbors) {
        if (
          neighbor >= 0 &&
          seen[neighbor] === 0 &&
          alpha[neighbor]! >= iconCoverageAlphaFloor
        ) {
          seen[neighbor] = 1
          queue[tail] = neighbor
          tail += 1
        }
      }
    }
    const componentWidth = maximumX - minimumX + 1
    const componentHeight = maximumY - minimumY + 1
    const spansWidth = minimumX === 0 && maximumX === width - 1
    const spansHeight = minimumY === 0 && maximumY === height - 1
    const elongatedBorderArtifact =
      (spansWidth || spansHeight) &&
      Math.max(componentWidth / componentHeight, componentHeight / componentWidth) > 8
    if (component.length < minimumComponent || elongatedBorderArtifact) {
      removed += 1
      for (const pixel of component) alpha[pixel] = 0
    }
  }
  return removed
}

export interface IconLineArtExtraction {
  readonly background: string
  readonly coverageRatio: number
  readonly height: number
  readonly measuredInk: string
  readonly pixels: Uint8Array
  readonly removedComponents: number
  readonly sourceHeight: number
  readonly sourceWidth: number
  readonly width: number
}

export function iconVisualGateProblems(
  purpose: SlopcameraIconPurpose,
  metrics: Readonly<Pick<IconLineArtExtraction, "coverageRatio" | "height" | "width">>,
  pathCount: number,
): readonly string[] {
  const problems: string[] = []
  const aspectRatio = Math.max(metrics.width / metrics.height, metrics.height / metrics.width)
  if (aspectRatio > 1.8) problems.push("the subject is too narrow or elongated")
  if (purpose === "mark") {
    if (metrics.coverageRatio < 0.14) problems.push("the mark has too little bold visual mass")
    if (metrics.coverageRatio > 0.72) problems.push("the mark has too little negative space")
    if (pathCount > 12) problems.push("the mark has too many separate vector paths")
  } else {
    if (metrics.coverageRatio < 0.035) problems.push("the illustration lines are too sparse or thin")
    if (metrics.coverageRatio > 0.62) problems.push("the illustration is too visually dense")
    if (pathCount > 48) problems.push("the illustration has too much vector detail")
  }
  return problems
}

/**
 * Normalize a generated raster into canonical ink-on-transparent RGBA.
 * Background is the border median; ink is the dominant far-from-background
 * color; each pixel's alpha is its coverage projected onto the
 * background→ink axis, preserving antialiased stroke edges for the tracer.
 */
export function extractIconLineArt(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: Readonly<{ hardEdges?: boolean; ink?: string }> = {},
): IconLineArtExtraction {
  if (
    rgba.length === 0 ||
    rgba.length % 4 !== 0 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    rgba.length !== width * height * 4
  ) {
    invalidArgument("Icon line-art extraction requires a nonempty RGBA raster.")
  }
  const ink = normalizedHexColor(options.ink ?? slopcameraIconDefaultInk)
  const [inkRed, inkGreen, inkBlue] = parseHexColor(ink)
  const background = borderBackground(rgba, width, height)
  const measured = measuredInkColor(rgba, width, height, background)
  const axis = [
    measured[0] - background[0],
    measured[1] - background[1],
    measured[2] - background[2],
  ] as const
  let axisLength2 = axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]
  let direction: readonly [number, number, number] = axis
  if (axisLength2 < 27) {
    direction = [-1, -1, -1]
    axisLength2 = 3
  }
  const alpha = new Uint8Array(width * height)
  let coverageMass = 0
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4
    const sourceAlpha = rgba[index + 3]! / 255
    const coverage = Math.max(
      0,
      Math.min(
        1,
        ((rgba[index]! - background[0]) * direction[0] +
          (rgba[index + 1]! - background[1]) * direction[1] +
          (rgba[index + 2]! - background[2]) * direction[2]) /
          axisLength2,
      ),
    )
    const value = Math.round(255 * coverage * sourceAlpha)
    alpha[pixel] = value
    coverageMass += value
  }
  if (coverageMass === 0) {
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      "The generated icon raster contains no ink coverage.",
    )
  }
  const removedComponents = dropSpeckles(alpha, width, height)

  let minimumX = width
  let minimumY = height
  let maximumX = -1
  let maximumY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x]! >= iconCropAlphaFloor) {
        if (x < minimumX) minimumX = x
        if (x > maximumX) maximumX = x
        if (y < minimumY) minimumY = y
        if (y > maximumY) maximumY = y
      }
    }
  }
  if (maximumX < 0) {
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      "The generated icon raster contains no ink coverage.",
    )
  }
  const margin = Math.round(
    Math.max(maximumX - minimumX + 1, maximumY - minimumY + 1) *
      iconMarginRatio,
  )
  const cropX = Math.max(0, minimumX - margin)
  const cropY = Math.max(0, minimumY - margin)
  const cropWidth = Math.min(width, maximumX + 1 + margin) - cropX
  const cropHeight = Math.min(height, maximumY + 1 + margin) - cropY
  const pixels = new Uint8Array(cropWidth * cropHeight * 4)
  let coverage = 0
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sourceIndex = (cropY + y) * width + cropX + x
      const targetIndex = (y * cropWidth + x) * 4
      const measuredValue = alpha[sourceIndex]!
      const value = options.hardEdges === true
        ? (measuredValue >= iconCoverageAlphaFloor ? 255 : 0)
        : measuredValue
      coverage += value
      pixels[targetIndex] = inkRed
      pixels[targetIndex + 1] = inkGreen
      pixels[targetIndex + 2] = inkBlue
      pixels[targetIndex + 3] = value
    }
  }
  const toHex = (channel: number): string =>
    channel.toString(16).padStart(2, "0")
  return {
    background: `#${background.map(toHex).join("")}`,
    coverageRatio: coverage / (cropWidth * cropHeight * 255),
    height: cropHeight,
    measuredInk: `#${measured.map(toHex).join("")}`,
    pixels,
    removedComponents,
    sourceHeight: height,
    sourceWidth: width,
    width: cropWidth,
  }
}

const iconCritiqueSchema = z.object({
  pass: z.boolean(),
  problems: z.array(z.string()),
  promptFix: z.string(),
  score: z.number(),
})

function boundedText(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, maximum)
}

function parseIconCritique(
  output: unknown,
  resolvedModel: string | null,
): IconCritique {
  const parsed = iconCritiqueSchema.safeParse(output)
  if (!parsed.success) {
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      "The icon critique returned an invalid bounded object.",
    )
  }
  const score = parsed.data.score
  if (!Number.isFinite(score)) {
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      "The icon critique returned an invalid score.",
    )
  }
  return {
    pass: parsed.data.pass,
    problems: parsed.data.problems
      .slice(0, 8)
      .map(problem => boundedText(problem, 300)),
    promptFix: boundedText(parsed.data.promptFix, 2_000),
    resolvedModel,
    score: Math.max(0, Math.min(100, score)),
  }
}

async function loadIconLanguageRuntime(): Promise<IconLanguageRuntime> {
  let aiModule: unknown
  let gatewayModule: unknown
  try {
    ;[aiModule, gatewayModule] = await Promise.all([
      import("ai-v7"),
      import("@ai-sdk/gateway-v4"),
    ])
  } catch {
    throw new SlopcameraCloudError(
      "GENERATION_FAILED",
      "The Vercel AI Gateway runtime is unavailable.",
    )
  }
  if (
    !isRecord(aiModule) ||
    !isRecord(gatewayModule) ||
    typeof aiModule.generateText !== "function" ||
    !isRecord(aiModule.Output) ||
    typeof aiModule.Output.object !== "function" ||
    typeof gatewayModule.createGateway !== "function"
  ) {
    throw new SlopcameraCloudError(
      "GENERATION_FAILED",
      "The Vercel AI Gateway runtime is unavailable.",
    )
  }
  const createGateway = gatewayModule.createGateway as (
    settings: Readonly<Record<string, unknown>>,
  ) => unknown
  return {
    Output: aiModule.Output as IconLanguageRuntime["Output"],
    createGateway: settings => {
      const provider = createGateway(settings)
      if (!isObjectLike(provider) || typeof provider.languageModel !== "function") {
        throw new SlopcameraCloudError(
          "GENERATION_FAILED",
          "The Vercel AI Gateway runtime is unavailable.",
        )
      }
      const languageModel = provider.languageModel as (id: string) => unknown
      return { languageModel: id => languageModel.call(provider, id) }
    },
    generateText: aiModule.generateText as IconLanguageRuntime["generateText"],
  }
}

function disableAiSdkWarningLogging(): void {
  (
    globalThis as typeof globalThis & {
      AI_SDK_LOG_WARNINGS?: false
    }
  ).AI_SDK_LOG_WARNINGS = false
}

function resolvedModelId(value: unknown): string | null {
  const modelId = isRecord(value) ? value.modelId : undefined
  return typeof modelId === "string" &&
    modelId.length > 0 &&
    modelId.length <= 256
    ? modelId
    : null
}

export async function critiqueIconRaster(
  input: Readonly<{
    ink: string
    model: string
    png: Uint8Array
    purpose: SlopcameraIconPurpose
    signal?: AbortSignal
    subject: string
  }>,
  dependencies: SlopcameraIconDependencies,
): Promise<IconCritique> {
  const runtime = await (dependencies.loadLanguageRuntime ??
    loadIconLanguageRuntime)()
  const controller = new AbortController()
  const abort = (): void => controller.abort(input.signal?.reason)
  input.signal?.addEventListener("abort", abort, { once: true })
  if (input.signal?.aborted === true) abort()
  const timer = setTimeout(
    () => controller.abort(),
    slopcameraIconCritiqueTimeoutMs,
  )
  try {
    disableAiSdkWarningLogging()
    const apiKey = resolveSlopcameraGatewayCredential(
      dependencies.environment,
    ).token
    const gateway = runtime.createGateway({
      apiKey,
      baseURL: slopcameraGatewayApiBaseUrl,
      fetch: createFixedGatewayFetch({
        ...(dependencies.fetch === undefined
          ? {}
          : { fetch: dependencies.fetch }),
        maximumResponseBytes: iconCritiqueMaximumResponseBytes,
      }),
    })
    const output = runtime.Output.object({
      description: `One bounded style critique for a rendered product ${input.purpose}.`,
      name: "slopcamera_icon_critique",
      schema: iconCritiqueSchema,
    })
    const result = await runtime.generateText({
      abortSignal: controller.signal,
      maxOutputTokens: 2_048,
      maxRetries: 0,
      messages: [
        {
          content: [
            {
              text:
                `Subject: ${input.subject}\nPurpose: ${input.purpose}\nInk: ${input.ink}\n` +
                `Judge this rendered ${input.purpose} against the style contract.`,
              type: "text",
            },
            {
              data: input.png,
              mediaType: "image/png",
              type: "file",
            },
          ],
          role: "user",
        },
      ],
      model: gateway.languageModel(input.model),
      output,
      providerOptions: {
        gateway: {
          disallowPromptTraining: true,
          tags: ["slopcamera", "icon-critique", "v1"],
          zeroDataRetention: true,
        },
      },
      system: input.purpose === "mark"
        ? MARK_CRITIQUE_SYSTEM
        : ILLUSTRATION_CRITIQUE_SYSTEM,
      temperature: 0,
    })
    return parseIconCritique(
      isRecord(result) ? result.output : undefined,
      resolvedModelId(isRecord(result) ? result.response : undefined),
    )
  } catch (error) {
    if (error instanceof SlopcameraCloudError) throw error
    throw new SlopcameraCloudError(
      "GENERATION_FAILED",
      "The icon critique request failed; it was not retried.",
    )
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener("abort", abort)
  }
}

const markPreviewSmallSizes = [16, 32] as const

async function renderIconPreview(
  svg: string,
  purpose: SlopcameraIconPurpose,
): Promise<Uint8Array> {
  try {
    const sharp = (await import("sharp")).default
    const source = sharp(Buffer.from(svg), {
      density: 96,
      failOn: "error",
      limitInputPixels: vectorizeHardLimits.maxDecodedPixels,
    })
    if (purpose === "illustration") {
      return Uint8Array.from(
        await source
          .resize(iconPreviewMaximumEdge, iconPreviewMaximumEdge, {
            fit: "inside",
          })
          .flatten({ background: slopcameraIconPanel })
          .png({ compressionLevel: 9 })
          .toBuffer(),
      )
    }
    const large = await source
      .clone()
      .resize(iconPreviewMaximumEdge, iconPreviewMaximumEdge, {
        fit: "inside",
      })
      .flatten({ background: slopcameraIconPanel })
      .png({ compressionLevel: 9 })
      .toBuffer()
    const smallRenders: { input: Buffer; top: number; left: number }[] = []
    let cursor = 16
    for (const size of markPreviewSmallSizes) {
      const rendered = await sharp(Buffer.from(svg), {
        density: 96,
        failOn: "error",
        limitInputPixels: vectorizeHardLimits.maxDecodedPixels,
      })
        .resize(size, size, { fit: "inside" })
        .flatten({ background: slopcameraIconPanel })
        .png({ compressionLevel: 9 })
        .toBuffer()
      smallRenders.push({
        input: await sharp({
          create: {
            background: { b: 0xfb, channels: 3, g: 0xf8, r: 0xf7 },
            channels: 3,
            height: size + 32,
            width: size + 32,
          },
        })
          .composite([{ input: rendered, left: 16, top: 16 }])
          .png()
          .toBuffer(),
        left: iconPreviewMaximumEdge + 16,
        top: cursor,
      })
      cursor += size + 48
    }
    return Uint8Array.from(
      await sharp({
        create: {
          background: { b: 0xfb, channels: 3, g: 0xf8, r: 0xf7 },
          channels: 3,
          height: Math.max(iconPreviewMaximumEdge, cursor + 16),
          width: iconPreviewMaximumEdge + 16 + 96,
        },
      })
        .composite([{ input: large, left: 0, top: 0 }, ...smallRenders])
        .png({ compressionLevel: 9 })
        .toBuffer(),
    )
  } catch (error) {
    throw new SlopcameraCloudError(
      "GENERATION_FAILED",
      "The canonical icon SVG could not be rendered for critique.",
      { cause: error },
    )
  }
}

async function writeAtomically(
  path: string,
  value: string | Uint8Array,
): Promise<string> {
  const absolutePath = resolve(path)
  await mkdir(dirname(absolutePath), { recursive: true })
  const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, value, { flag: "wx" })
    await rename(temporaryPath, absolutePath)
    return absolutePath
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw new SlopcameraCloudError(
      "OUTPUT_WRITE_FAILED",
      `Slopcamera could not atomically write ${absolutePath}.`,
      { cause: error },
    )
  }
}

/**
 * Generate one canonical product mark or marketing illustration: bounded
 * Gateway raster → local normalization → supervised VTracer trace →
 * deterministic purpose gate → optional purpose-specific vision critique.
 * Only derived artifacts ever leave the machine; the uploaded critique image
 * is Slopcamera's own rendered output, never user media.
 */
export async function generateSlopcameraIcon(
  input: GenerateSlopcameraIconInput,
  dependencies: SlopcameraIconDependencies = {},
): Promise<SlopcameraIconReceipt> {
  const subject = validateSubject(input.subject)
  if (
    typeof input.outputPath !== "string" ||
    input.outputPath.length < 1 ||
    input.outputPath.length > 4_096 ||
    input.outputPath.includes("\0") ||
    !input.outputPath.toLowerCase().endsWith(".svg")
  ) {
    invalidArgument("outputPath must be a bounded local path ending in .svg.")
  }
  const model = validateIconModel(input.model ?? "recraft/recraft-v4.1-utility", "model")
  const rounds = validateRounds(input.rounds)
  const purpose = input.purpose ?? "illustration"
  if (purpose !== "illustration" && purpose !== "mark") {
    invalidArgument("purpose must be illustration or mark.")
  }
  const ink = normalizedHexColor(input.ink ?? slopcameraIconDefaultInk)
  const critiqueModel =
    input.critiqueModel === undefined
      ? slopcameraIconCritiqueDefaultModel
      : validateIconModel(input.critiqueModel, "critiqueModel")
  const critiqueEnabled = rounds > 1 || input.critiqueModel !== undefined
  const generate = dependencies.generate ?? generateSlopcameraImage
  const vectorize = dependencies.vectorize ?? vectorizeImage
  const critique = dependencies.critique ??
    ((critiqueInput: {
      ink: string
      model: string
      png: Uint8Array
      purpose: SlopcameraIconPurpose
      signal?: AbortSignal
      subject: string
    }) => critiqueIconRaster(critiqueInput, dependencies))
  const limits = resolveVectorizeLimits({})

  const attempts: IconAttemptReceipt[] = []
  const candidates: {
    candidate: IconCandidate
    critique: IconCritique | null
    extraction: IconLineArtExtraction
    round: number
  }[] = []
  let feedback: string | undefined
  let lastError: unknown
  for (let round = 1; round <= rounds; round += 1) {
    if (input.signal?.aborted === true) {
      throw new SlopcameraCloudError(
        "GENERATION_FAILED",
        "Icon generation was cancelled.",
      )
    }
    const prompt = iconPromptFor(subject, {
      ink,
      purpose,
      ...(feedback === undefined ? {} : { feedback }),
    })
    let candidate: IconCandidate
    let extraction: IconLineArtExtraction
    let attemptRequestId = ""
    let attemptProblems: readonly string[] = []
    try {
      const generated = await generate(
        {
          model,
          prompt,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        },
        dependencies,
      )
      attemptRequestId = generated.requestId
      const bytes = Buffer.from(generated.image.base64, "base64")
      const raster = await loadRaster(
        Uint8Array.from(bytes),
        limits,
        new VectorizeDeadline(limits.maxDurationMs),
      )
      extraction = extractIconLineArt(raster.pixels, raster.width, raster.height, {
        hardEdges: purpose === "mark",
        ink,
      })
      const png = await encodeTracePng(
        extraction.pixels,
        extraction.width,
        extraction.height,
      )
      const traced = await vectorize(png, {
        ...(input.inheritedFileDescriptors === undefined
          ? {}
          : { inheritedFileDescriptors: input.inheritedFileDescriptors }),
      })
      const visualProblems = iconVisualGateProblems(
        purpose,
        extraction,
        traced.receipt.pathCount,
      )
      if (visualProblems.length > 0) {
        feedback = visualProblems.join("; ")
        attemptProblems = visualProblems
        throw new SlopcameraCloudError(
          "GENERATION_INVALID_RESPONSE",
          `Generated ${purpose} failed its visual gate: ${feedback}.`,
        )
      }
      candidate = {
        png,
        requestId: generated.requestId,
        svg: traced.svg,
        vectorize: traced.receipt,
        warnings: generated.warnings,
      }
    } catch (error) {
      lastError = error
      attempts.push({
        ...(attemptProblems.length === 0 ? {} : { problems: attemptProblems }),
        requestId: attemptRequestId,
        round,
        status: "failed",
        warnings: [],
      })
      continue
    }

    let review: IconCritique | null = null
    let critiqueError: string | undefined
    if (critiqueEnabled) {
      try {
        const preview = dependencies.rasterize === undefined
          ? await renderIconPreview(candidate.svg, purpose)
          : await dependencies.rasterize(candidate.svg)
        review = await critique({
          ink,
          model: critiqueModel,
          png: preview,
          purpose,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          subject,
        })
      } catch (error) {
        critiqueError =
          error instanceof SlopcameraCloudError
            ? error.code
            : "critique-failed"
        review = null
      }
    }
    candidates.push({ candidate, critique: review, extraction, round })
    attempts.push({
      ...(critiqueError === undefined ? {} : { critiqueError }),
      ...(review === null ? {} : { critiqueModel: review.resolvedModel ?? critiqueModel }),
      ...(review === null ? {} : { pass: review.pass }),
      ...(review === null ? {} : { problems: review.problems }),
      requestId: candidate.requestId,
      round,
      ...(review === null ? {} : { score: review.score }),
      status: "candidate",
      svgSha256: createHash("sha256").update(candidate.svg).digest("hex"),
      vectorize: candidate.vectorize,
      warnings: candidate.warnings,
    })
    if (review === null || review.pass) break
    feedback = [...review.problems, review.promptFix]
      .filter(part => part.length > 0)
      .join("; ")
  }

  if (candidates.length === 0) {
    if (lastError instanceof Error) throw lastError
    throw new SlopcameraCloudError(
      "GENERATION_FAILED",
      "Every icon generation attempt failed.",
    )
  }
  const eligibleCandidates = candidates.filter(
    ({ critique: review }) => review === null || review.pass,
  )
  if (eligibleCandidates.length === 0) {
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      `Every generated ${purpose} failed its design critique.`,
    )
  }
  const selected = eligibleCandidates.sort(
    (left, right) =>
      (right.critique?.score ?? -1) - (left.critique?.score ?? -1) ||
      right.round - left.round,
  )[0]!
  const selectedAttempt = attempts.findIndex(
    attempt => attempt.round === selected.round && attempt.status === "candidate",
  )
  if (selectedAttempt >= 0) {
    attempts[selectedAttempt] = {
      ...attempts[selectedAttempt]!,
      status: "selected",
    }
  }
  const outputPath = await writeAtomically(input.outputPath, selected.candidate.svg)
  const receipt: SlopcameraIconReceipt = {
    attempts,
    ink,
    model,
    outputPath,
    purpose,
    receiptVersion: 1,
    rounds,
    selectedRound: selected.round,
    subject,
    svgSha256: createHash("sha256").update(selected.candidate.svg).digest("hex"),
  }
  if (input.keepRaster === true) {
    const rasterPath = input.outputPath.replace(/\.svg$/iu, ".lineart.png")
    return {
      ...receipt,
      rasterPath: await writeAtomically(rasterPath, selected.candidate.png),
    }
  }
  return receipt
}

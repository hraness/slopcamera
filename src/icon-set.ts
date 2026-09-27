import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { z } from "zod"
import { SlopcameraCloudError } from "./cloud-errors.js"
import {
  collectSlopcameraIconCandidates,
  extractIconLineArt,
  loadIconLanguageRuntime,
  measureIconCandidateMetrics,
  renderIconPreview,
  slopcameraIconContexts,
  slopcameraIconCritiqueDefaultModel,
  slopcameraIconCritiqueTimeoutMs,
  slopcameraIconDefaultInk,
  slopcameraIconMaximumRounds,
  slopcameraIconPanel,
  slopcameraIconSubjectMaximumBytes,
  writeAtomically,
  type IconAttemptReceipt,
  type IconCandidateRecord,
  type IconMeasuredMetrics,
  type SlopcameraIconContext,
  type SlopcameraIconDependencies,
  type SlopcameraIconPurpose,
} from "./icon.js"
import {
  createFixedGatewayFetch,
  resolveSlopcameraGatewayCredential,
  slopcameraGatewayApiBaseUrl,
} from "./generate.js"
import { normalizedHexColor } from "./vectorize/metrics.js"
import {
  resolveVectorizeLimits,
  VectorizeDeadline,
  vectorizeHardLimits,
} from "./vectorize/limits.js"
import { loadRaster } from "./vectorize/pixels.js"

/**
 * Set-level icon generation. `slopcamera image icon` evaluates one icon at a
 * time, which is exactly why shipped families drift in density and line
 * weight. This module composes the per-icon pipeline into a set: every member
 * collects a small pool of gated candidates, joint selection minimizes the
 * measured spread toward the family's median ink coverage and stroke weight,
 * a contact-sheet vision critique reviews the whole family at once, and
 * out-of-family members are regenerated with directional feedback — all
 * inside the same credential, retry, and bounded-response contracts.
 */

export const slopcameraIconSetMaximumMembers = 24
export const slopcameraIconSetMaximumSetRounds = 4
export const slopcameraIconSetDefaultSetRounds = 3
export const slopcameraIconSetDefaultPool = 2
export const slopcameraIconSetMaximumNameBytes = 120
export const slopcameraIconSetSlugPattern = /^[a-z0-9][a-z0-9-]{0,62}$/u
const iconSetSheetCellEdge = 288
const iconSetSheetGutter = 24
const iconSetSheetColumns = 4
const iconSetCoverageTolerance = 0.4
const iconSetStrokeTolerance = 0.4
const iconSetCoverageFloor = 0.06
const iconSetStrokeFloorPx = 4

const SET_CRITIQUE_SYSTEM = `You are a strict design reviewer judging whether a set of product illustrations belongs to one visual family.

The attached contact sheet shows every selected member of the set in row-major reading order, one subject per cell, in the order the message lists their slugs.

Intended family contract:
- Simple orthographic isometric projection in exactly one ink color.
- Uniform medium-weight structural strokes with at most three large filled planes.
- No hairlines, hatching, texture, tiny repeated detail, shading, gradients, shadows, text, borders, or background objects.

Judge the family as a whole, not each icon in isolation: matching stroke weight, matching ink density and level of detail, consistent projection angle and margins, and no member that looks drawn by a different hand. An icon that is individually fine but visibly sparser, denser, thinner-stroked, or more detailed than the family fails the set.

Return pass only when the full sheet reads as one family and every member still depicts its subject. For each member that breaks the family, give concrete problems and a promptFix describing how its image prompt should change.`

const INLINE_SET_CRITIQUE_CLAUSE = `

Context note: this is an inline family — every member renders beside text at about 32 to 48 pixels. Judge each cell as a small chip: bold flat or slightly dimensional pictograms satisfy the contract when their silhouettes stay recognizable at that size. Do not demand isometric depth or the detail level of a larger card illustration; consistency of ink, stroke weight, and mass balance across the sheet is what makes them one family.`

export interface SlopcameraIconSetMemberInput {
  readonly context?: SlopcameraIconContext
  readonly purpose?: SlopcameraIconPurpose
  readonly slug: string
  readonly subject: string
}

/**
 * A reference member is an already-admitted family icon (slug + local SVG
 * path resolved against the manifest). References are never regenerated or
 * written: they join the measured median, the family band, and the
 * contact-sheet critique so a new or partially refreshed set converges
 * toward the family it will ship beside.
 */
export interface SlopcameraIconSetReferenceInput {
  readonly slug: string
  readonly svg: string
}

export interface SlopcameraIconSetSpec {
  readonly context?: SlopcameraIconContext
  readonly ink?: string
  readonly members: readonly SlopcameraIconSetMemberInput[]
  readonly name?: string
  readonly references?: readonly SlopcameraIconSetReferenceInput[]
}

export interface IconSetMemberVerdict {
  readonly pass: boolean
  readonly problems: readonly string[]
  readonly promptFix: string
  readonly slug: string
}

export interface IconSetCritique {
  readonly familyProblems: readonly string[]
  readonly members: readonly IconSetMemberVerdict[]
  readonly pass: boolean
  readonly resolvedModel: string | null
}

export interface IconSetCandidateReceipt {
  readonly metrics: IconMeasuredMetrics
  readonly round: number
  readonly score?: number
  readonly selected: boolean
}

export interface SlopcameraIconSetMemberReceipt {
  readonly attempts: readonly IconAttemptReceipt[]
  readonly candidates: readonly IconSetCandidateReceipt[]
  readonly context?: SlopcameraIconContext
  readonly metrics: IconMeasuredMetrics
  readonly outputPath: string
  readonly purpose: SlopcameraIconPurpose
  readonly regenerated: number
  readonly slug: string
  readonly subject: string
  readonly svgSha256: string
}

export interface SlopcameraIconSetReceipt {
  readonly context?: SlopcameraIconContext
  readonly ink: string
  readonly members: readonly SlopcameraIconSetMemberReceipt[]
  readonly model: string
  readonly name?: string
  readonly outputDir: string
  readonly receiptVersion: 1
  readonly setRoundsUsed: number
  readonly setCritiques: readonly IconSetCritique[]
  /** How many contact-sheet critiques were lost to transport errors. */
  readonly setCritiqueErrors?: number
  readonly target: {
    readonly coverageRatio: number
    readonly strokePx: number
  }
}

export interface GenerateSlopcameraIconSetInput {
  readonly candidatesPerMember?: number
  readonly context?: SlopcameraIconContext
  readonly critiqueModel?: string
  readonly inheritedFileDescriptors?: readonly number[]
  readonly ink?: string
  readonly keepRaster?: boolean
  /** Directory the spec's reference SVG paths resolve against. */
  readonly manifestDir?: string
  readonly model?: string
  readonly outputDir: string
  readonly purpose?: SlopcameraIconPurpose
  readonly rounds?: number
  readonly setRounds?: number
  readonly signal?: AbortSignal
  readonly spec: SlopcameraIconSetSpec
}

export interface SlopcameraIconSetDependencies
  extends SlopcameraIconDependencies {
  readonly collectCandidates?: typeof collectSlopcameraIconCandidates
  readonly composeSheet?: (
    members: ReadonlyArray<{ slug: string; svg: string }>,
  ) => Promise<Uint8Array>
  readonly setCritique?: (input: Readonly<{
    context?: SlopcameraIconContext
    ink: string
    members: readonly string[]
    model: string
    png: Uint8Array
    signal?: AbortSignal
  }>) => Promise<IconSetCritique>
}

interface MemberLane {
  readonly context: SlopcameraIconContext | undefined
  readonly input: SlopcameraIconSetMemberInput
  readonly purpose: SlopcameraIconPurpose
  attempts: IconAttemptReceipt[]
  eligible: IconCandidateRecord[]
  regenerated: number
}

/**
 * An admitted reference icon: fixed metrics and artwork that anchor the
 * family target and appear in the contact sheet without being regenerated.
 */
interface SetAnchor {
  readonly metrics: IconMeasuredMetrics
  readonly slug: string
  readonly svg: string
}

function invalidArgument(message: string): never {
  throw new SlopcameraCloudError("INVALID_ARGUMENT", message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseSetMember(value: unknown, index: number): SlopcameraIconSetMemberInput {
  if (!isRecord(value)) {
    invalidArgument(`Icon set member ${index} must be an object.`)
  }
  const slug = value.slug
  if (typeof slug !== "string" || !slopcameraIconSetSlugPattern.test(slug)) {
    invalidArgument(
      `Icon set member ${index} slug must be lowercase kebab-case, at most 63 characters.`,
    )
  }
  const subject = value.subject
  if (
    typeof subject !== "string" ||
    subject.trim().length === 0 ||
    Buffer.byteLength(subject, "utf8") > slopcameraIconSubjectMaximumBytes
  ) {
    invalidArgument(`Icon set member "${slug}" needs a bounded non-empty subject.`)
  }
  const purpose = value.purpose
  if (
    purpose !== undefined &&
    purpose !== "illustration" &&
    purpose !== "mark"
  ) {
    invalidArgument(`Icon set member "${slug}" purpose must be illustration or mark.`)
  }
  const context = value.context
  if (
    context !== undefined &&
    (typeof context !== "string" ||
      !slopcameraIconContexts.includes(context as SlopcameraIconContext))
  ) {
    invalidArgument(
      `Icon set member "${slug}" context must be one of: ${slopcameraIconContexts.join(", ")}.`,
    )
  }
  return {
    ...(context === undefined
      ? {}
      : { context: context as SlopcameraIconContext }),
    ...(purpose === undefined ? {} : { purpose }),
    slug,
    subject: subject.trim(),
  }
}

/** Parse an untrusted icon-set manifest into a bounded, validated spec. */
export function parseSlopcameraIconSetSpec(
  value: unknown,
): SlopcameraIconSetSpec {
  if (!isRecord(value)) {
    invalidArgument("Icon set manifest must be a JSON object.")
  }
  const name = value.name
  if (
    name !== undefined &&
    (typeof name !== "string" ||
      name.trim().length === 0 ||
      Buffer.byteLength(name, "utf8") > slopcameraIconSetMaximumNameBytes ||
      /[/\\\u0000-\u001f\u007f]/u.test(name))
  ) {
    invalidArgument("Icon set name must be a bounded portable label.")
  }
  const ink = value.ink
  if (
    ink !== undefined &&
    (typeof ink !== "string" || !/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/iu.test(ink))
  ) {
    invalidArgument("Icon set ink must be a #rgb or #rrggbb color.")
  }
  const context = value.context
  if (
    context !== undefined &&
    (typeof context !== "string" ||
      !slopcameraIconContexts.includes(context as SlopcameraIconContext))
  ) {
    invalidArgument(
      `Icon set context must be one of: ${slopcameraIconContexts.join(", ")}.`,
    )
  }
  const members = value.members
  if (!Array.isArray(members) || members.length === 0) {
    invalidArgument("Icon set members must be a non-empty array.")
  }
  if (members.length > slopcameraIconSetMaximumMembers) {
    invalidArgument(
      `Icon sets are bounded to ${slopcameraIconSetMaximumMembers} members.`,
    )
  }
  const parsed = members.map((member, index) => parseSetMember(member, index))
  const seen = new Set<string>()
  for (const member of parsed) {
    if (seen.has(member.slug)) {
      invalidArgument(`Icon set slug "${member.slug}" is duplicated.`)
    }
    seen.add(member.slug)
  }
  const references = value.references
  const parsedReferences: SlopcameraIconSetReferenceInput[] = []
  if (references !== undefined) {
    if (!Array.isArray(references) || references.length > 8) {
      invalidArgument("Icon set references must be an array of at most 8 entries.")
    }
    for (const [index, reference] of (references as unknown[]).entries()) {
      if (!isRecord(reference)) {
        invalidArgument(`Icon set reference ${index} must be an object.`)
      }
      const slug = reference.slug
      if (typeof slug !== "string" || !slopcameraIconSetSlugPattern.test(slug)) {
        invalidArgument(
          `Icon set reference ${index} slug must be lowercase kebab-case, at most 63 characters.`,
        )
      }
      if (seen.has(slug)) {
        invalidArgument(`Icon set slug "${slug}" is duplicated.`)
      }
      seen.add(slug)
      const svg = reference.svg
      if (
        typeof svg !== "string" ||
        svg.length < 1 ||
        svg.length > 4_096 ||
        svg.includes("\0") ||
        !svg.toLowerCase().endsWith(".svg")
      ) {
        invalidArgument(`Icon set reference "${slug}" needs a bounded .svg path.`)
      }
      parsedReferences.push({ slug, svg })
    }
  }
  return {
    ...(context === undefined
      ? {}
      : { context: context as SlopcameraIconContext }),
    ...(ink === undefined ? {} : { ink }),
    members: parsed,
    ...(name === undefined ? {} : { name: (name as string).trim() }),
    ...(parsedReferences.length === 0
      ? {}
      : { references: parsedReferences }),
  }
}

const iconSetCritiqueSchema = z.object({
  familyProblems: z.array(z.string()),
  members: z.array(
    z.object({
      pass: z.boolean(),
      problems: z.array(z.string()),
      promptFix: z.string(),
      slug: z.string(),
    }),
  ),
  pass: z.boolean(),
})

function boundedText(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, maximum)
}

function parseIconSetCritique(
  output: unknown,
  resolvedModel: string | null,
  memberSlugs: ReadonlySet<string>,
): IconSetCritique {
  const parsed = iconSetCritiqueSchema.safeParse(output)
  if (!parsed.success) {
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      "The icon-set critique returned an invalid bounded object.",
    )
  }
  const members: IconSetMemberVerdict[] = []
  const seen = new Set<string>()
  for (const member of parsed.data.members) {
    if (!memberSlugs.has(member.slug) || seen.has(member.slug)) continue
    seen.add(member.slug)
    members.push({
      pass: member.pass,
      problems: member.problems
        .slice(0, 8)
        .map(problem => boundedText(problem, 300)),
      promptFix: boundedText(member.promptFix, 2_000),
      slug: member.slug,
    })
  }
  return {
    familyProblems: parsed.data.familyProblems
      .slice(0, 8)
      .map(problem => boundedText(problem, 300)),
    members,
    pass: parsed.data.pass,
    resolvedModel,
  }
}

/**
 * Send the rendered contact sheet to the critique model for a family-level
 * review. Same credential, retry, and bounded-response contract as the
 * per-icon critique; only Slopcamera's own rendered output is uploaded.
 */
export async function critiqueSlopcameraIconSet(
  input: Readonly<{
    context?: SlopcameraIconContext
    ink: string
    members: readonly string[]
    model: string
    png: Uint8Array
    signal?: AbortSignal
  }>,
  dependencies: SlopcameraIconDependencies,
): Promise<IconSetCritique> {
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
        maximumResponseBytes: 8 * 1024 * 1024,
      }),
    })
    const output = runtime.Output.object({
      description:
        "One bounded family-consistency critique for a rendered icon set contact sheet.",
      name: "slopcamera_icon_set_critique",
      schema: iconSetCritiqueSchema,
    })
    const result = await runtime.generateText({
      abortSignal: controller.signal,
      maxOutputTokens: 4_096,
      maxRetries: 0,
      messages: [
        {
          content: [
            {
              text:
                `Ink: ${input.ink}\n` +
                (input.context === undefined
                  ? ""
                  : `Context: ${input.context}\n`) +
                `Members in row-major order: ${input.members.join(", ")}\n` +
                "Judge this contact sheet against the family contract.",
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
          tags: ["slopcamera", "icon-set-critique", "v1"],
          zeroDataRetention: true,
        },
      },
      system:
        input.context === "inline"
          ? SET_CRITIQUE_SYSTEM + INLINE_SET_CRITIQUE_CLAUSE
          : SET_CRITIQUE_SYSTEM,
      temperature: 0,
    })
    return parseIconSetCritique(
      isRecord(result) ? result.output : undefined,
      resolvedModelId(isRecord(result) ? result.response : undefined),
      new Set(input.members),
    )
  } catch (error) {
    if (error instanceof SlopcameraCloudError) throw error
    throw new SlopcameraCloudError(
      "GENERATION_FAILED",
      "The icon-set critique request failed; it was not retried.",
      { cause: error },
    )
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener("abort", abort)
  }
}

function resolvedModelId(value: unknown): string | null {
  const modelId = isRecord(value) ? value.modelId : undefined
  return typeof modelId === "string" &&
    modelId.length > 0 &&
    modelId.length <= 256
    ? modelId
    : null
}

async function composeIconSetSheet(
  members: ReadonlyArray<{ slug: string; svg: string }>,
): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default
  const cell = iconSetSheetCellEdge
  const gutter = iconSetSheetGutter
  const columns = Math.min(iconSetSheetColumns, members.length)
  const rows = Math.ceil(members.length / columns)
  const width = columns * cell + (columns + 1) * gutter
  const height = rows * cell + (rows + 1) * gutter
  const [panelRed, panelGreen, panelBlue] = [0xf7, 0xf8, 0xfb]
  const composites: { input: Buffer; left: number; top: number }[] = []
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!
    const rendered = await sharp(Buffer.from(member.svg), {
      density: 96,
      failOn: "error",
      limitInputPixels: vectorizeHardLimits.maxDecodedPixels,
    })
      .resize(cell, cell, { fit: "inside" })
      .flatten({ background: slopcameraIconPanel })
      .png({ compressionLevel: 9 })
      .toBuffer()
    const column = index % columns
    const row = Math.floor(index / columns)
    composites.push({
      input: rendered,
      left: gutter + column * (cell + gutter),
      top: gutter + row * (cell + gutter),
    })
  }
  return Uint8Array.from(
    await sharp({
      create: {
        background: { b: panelBlue, g: panelGreen, r: panelRed },
        channels: 3,
        height,
        width,
      },
    })
      .composite(composites)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  )
}

function medianMetric(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function coverageToleranceBand(target: number): readonly [number, number] {
  const span = Math.max(iconSetCoverageFloor, target * iconSetCoverageTolerance)
  return [target - span, target + span]
}

function strokeToleranceBand(target: number): readonly [number, number] {
  const span = Math.max(iconSetStrokeFloorPx, target * iconSetStrokeTolerance)
  return [target - span, target + span]
}

function familyDistance(
  metrics: IconMeasuredMetrics,
  target: Readonly<{ coverageRatio: number; strokePx: number }>,
): number {
  const coverageSpan = Math.max(
    iconSetCoverageFloor,
    target.coverageRatio * iconSetCoverageTolerance,
  )
  const strokeSpan = Math.max(
    iconSetStrokeFloorPx,
    target.strokePx * iconSetStrokeTolerance,
  )
  return (
    Math.abs(metrics.coverageRatio - target.coverageRatio) / coverageSpan +
    Math.abs(metrics.strokePx - target.strokePx) / strokeSpan
  )
}

function pickMemberCandidate(
  eligible: readonly IconCandidateRecord[],
  target: Readonly<{ coverageRatio: number; strokePx: number }> | null,
): IconCandidateRecord {
  // A failed individual critique halves a candidate's quality rank: it stays
  // usable (set mode collects with requireCritiquePass off) but loses ties to
  // a critique-passing sibling candidate.
  const quality = (record: IconCandidateRecord): number =>
    record.critique === null || record.critique === undefined
      ? -1
      : record.critique.score * (record.critique.pass ? 1 : 0.5)
  const ranked = [...eligible].sort((left, right) => {
    if (target !== null) {
      const distance =
        familyDistance(left.metrics, target) -
        familyDistance(right.metrics, target)
      if (distance !== 0) return distance
    }
    return quality(right) - quality(left) || right.round - left.round
  })
  return ranked[0]!
}

/**
 * Joint selection uses a leave-one-out family center: each member picks the
 * candidate closest to the median of the *other* members' current picks, so
 * an outlier is pulled toward its siblings instead of dragging the shared
 * target toward itself. Gauss–Seidel passes over the manifest-ordered lanes
 * keep the result deterministic.
 */
function jointSelect(
  lanes: readonly MemberLane[],
  anchors: readonly SetAnchor[],
): Readonly<{ picks: Map<string, IconCandidateRecord>; target: { coverageRatio: number; strokePx: number } }> {
  const picks = new Map(
    lanes.map(lane => [lane.input.slug, pickMemberCandidate(lane.eligible, null)]),
  )
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false
    for (const lane of lanes) {
      const siblings = [
        ...lanes
          .filter(candidate => candidate !== lane)
          .map(candidate => picks.get(candidate.input.slug)!.metrics),
        ...anchors.map(anchor => anchor.metrics),
      ]
      const own = picks.get(lane.input.slug)!
      const target =
        siblings.length === 0
          ? { coverageRatio: own.metrics.coverageRatio, strokePx: own.metrics.strokePx }
          : {
              coverageRatio: medianMetric(
                siblings.map(metrics => metrics.coverageRatio),
              ),
              strokePx: medianMetric(
                siblings.map(metrics => metrics.strokePx),
              ),
            }
      const pick = pickMemberCandidate(lane.eligible, target)
      if (pick !== own) {
        picks.set(lane.input.slug, pick)
        changed = true
      }
    }
    if (!changed) break
  }
  const familyMetrics = [
    ...[...picks.values()].map(record => record.metrics),
    ...anchors.map(anchor => anchor.metrics),
  ]
  const target = {
    coverageRatio: medianMetric(
      familyMetrics.map(metrics => metrics.coverageRatio),
    ),
    strokePx: medianMetric(familyMetrics.map(metrics => metrics.strokePx)),
  }
  return { picks, target }
}

function outOfFamilyMembers(
  lanes: readonly MemberLane[],
  picks: ReadonlyMap<string, IconCandidateRecord>,
  target: Readonly<{ coverageRatio: number; strokePx: number }>,
): readonly string[] {
  const coverageBand = coverageToleranceBand(target.coverageRatio)
  const strokeBand = strokeToleranceBand(target.strokePx)
  const outliers: string[] = []
  for (const lane of lanes) {
    const pick = picks.get(lane.input.slug)
    if (pick === undefined) continue
    if (
      pick.metrics.coverageRatio < coverageBand[0] ||
      pick.metrics.coverageRatio > coverageBand[1] ||
      pick.metrics.strokePx < strokeBand[0] ||
      pick.metrics.strokePx > strokeBand[1]
    ) {
      outliers.push(lane.input.slug)
    }
  }
  return outliers
}

function directionalFamilyFeedback(
  metrics: IconMeasuredMetrics,
  target: Readonly<{ coverageRatio: number; strokePx: number }>,
  familyProblems: readonly string[],
): string {
  const fixes: string[] = []
  if (metrics.coverageRatio < target.coverageRatio) {
    fixes.push(
      "increase visual density to match the rest of the set: slightly more structural linework or one more filled plane",
    )
  } else if (metrics.coverageRatio > target.coverageRatio) {
    fixes.push(
      "reduce visual density to match the rest of the set: fewer planes and less interior detail",
    )
  }
  if (metrics.strokePx < target.strokePx) {
    fixes.push("use thicker uniform strokes like the rest of the set")
  } else if (metrics.strokePx > target.strokePx) {
    fixes.push("use thinner uniform strokes like the rest of the set")
  }
  const prefix = fixes.length === 0 ? [] : [`Match the family: ${fixes.join("; ")}.`]
  return [...prefix, ...familyProblems]
    .filter(part => part.length > 0)
    .join(" ")
}

/**
 * Generate a coherent icon family: per-member bounded candidate pools,
 * joint selection toward the family's measured median, measured-band
 * enforcement, and a contact-sheet vision critique. Members that leave the
 * family band are regenerated with directional feedback inside a bounded
 * number of set rounds. Fails closed when the set cannot converge.
 */
export async function generateSlopcameraIconSet(
  input: GenerateSlopcameraIconSetInput,
  dependencies: SlopcameraIconSetDependencies = {},
): Promise<SlopcameraIconSetReceipt> {
  if (
    typeof input.outputDir !== "string" ||
    input.outputDir.length < 1 ||
    input.outputDir.length > 4_096 ||
    input.outputDir.includes("\0")
  ) {
    invalidArgument("outputDir must be a bounded local directory path.")
  }
  const rounds = input.rounds ?? 2
  if (
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    rounds > slopcameraIconMaximumRounds
  ) {
    invalidArgument(`rounds must be an integer from 1 through ${slopcameraIconMaximumRounds}.`)
  }
  const requestedPool =
    input.candidatesPerMember ?? slopcameraIconSetDefaultPool
  if (
    !Number.isInteger(requestedPool) ||
    requestedPool < 1 ||
    requestedPool > slopcameraIconMaximumRounds
  ) {
    invalidArgument(
      `candidatesPerMember must be an integer from 1 through ${slopcameraIconMaximumRounds}.`,
    )
  }
  // A pool can never hold more passing candidates than paid attempts.
  const poolSize = Math.min(requestedPool, rounds)
  const setRounds = input.setRounds ?? slopcameraIconSetDefaultSetRounds
  if (
    !Number.isInteger(setRounds) ||
    setRounds < 1 ||
    setRounds > slopcameraIconSetMaximumSetRounds
  ) {
    invalidArgument(
      `setRounds must be an integer from 1 through ${slopcameraIconSetMaximumSetRounds}.`,
    )
  }
  const ink = normalizedHexColor(input.ink ?? input.spec.ink ?? slopcameraIconDefaultInk)
  const model = input.model ?? "recraft/recraft-v4.1-utility"
  const critiqueModel = input.critiqueModel ?? slopcameraIconCritiqueDefaultModel
  const critiqueEnabled = rounds > 1 || input.critiqueModel !== undefined
  const collect = dependencies.collectCandidates ?? collectSlopcameraIconCandidates
  const composeSheet = dependencies.composeSheet ?? composeIconSetSheet
  const setCritique =
    dependencies.setCritique ??
    ((critiqueInput: {
      context?: SlopcameraIconContext
      ink: string
      members: readonly string[]
      model: string
      png: Uint8Array
      signal?: AbortSignal
    }) => critiqueSlopcameraIconSet(critiqueInput, dependencies))

  const lanes: MemberLane[] = input.spec.members.map(member => ({
    attempts: [],
    context:
      member.context ?? input.spec.context ?? input.context ?? undefined,
    eligible: [],
    input: member,
    purpose: member.purpose ?? input.purpose ?? "illustration",
    regenerated: 0,
  }))

  const anchors: SetAnchor[] = []
  const limits = resolveVectorizeLimits({})
  for (const reference of input.spec.references ?? []) {
    const referencePath = resolve(input.manifestDir ?? ".", reference.svg)
    let svg: string
    try {
      svg = await readFile(referencePath, "utf8")
    } catch {
      throw new SlopcameraCloudError(
        "INVALID_ARGUMENT",
        `Icon set reference "${reference.slug}" could not be read: ${reference.svg}.`,
      )
    }
    if (Buffer.byteLength(svg, "utf8") > 256 * 1024) {
      invalidArgument(`Icon set reference "${reference.slug}" exceeds 256 KiB.`)
    }
    const png =
      dependencies.rasterize === undefined
        ? await renderIconPreview(svg, "illustration")
        : await dependencies.rasterize(svg)
    const raster = await loadRaster(
      png,
      limits,
      new VectorizeDeadline(limits.maxDurationMs),
    )
    const extraction = extractIconLineArt(raster.pixels, raster.width, raster.height, {
      hardEdges: true,
      ink,
    })
    const pathCount = (svg.match(/<path/gu) ?? []).length
    anchors.push({
      metrics: measureIconCandidateMetrics(extraction, svg, pathCount),
      slug: reference.slug,
      svg,
    })
  }

  const collectForLane = async (
    lane: MemberLane,
    initialFeedback?: string,
  ): Promise<void> => {
    const collected = await collect(
      {
        candidatePool: poolSize,
        ...(lane.context === undefined ? {} : { context: lane.context }),
        ...(input.critiqueModel === undefined
          ? {}
          : { critiqueModel: input.critiqueModel }),
        requireCritiquePass: false,
        ...(initialFeedback === undefined ? {} : { initialFeedback }),
        ...(input.inheritedFileDescriptors === undefined
          ? {}
          : { inheritedFileDescriptors: input.inheritedFileDescriptors }),
        ink,
        model,
        purpose: lane.purpose,
        rounds,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        subject: lane.input.subject,
      },
      dependencies,
    )
    lane.attempts.push(...collected.attempts)
    lane.eligible.push(...collected.eligible)
  }

  // Phase one: every member gets its own bounded candidate pool.
  for (const lane of lanes) {
    try {
      await collectForLane(lane)
    } catch (error) {
      const detail =
        error instanceof Error ? ` Last error: ${error.message}` : ""
      throw new SlopcameraCloudError(
        "GENERATION_FAILED",
        `Icon set member "${lane.input.slug}" produced no gated candidates.${detail}`,
        { cause: error },
      )
    }
    if (lane.eligible.length === 0) {
      throw new SlopcameraCloudError(
        "GENERATION_INVALID_RESPONSE",
        `Icon set member "${lane.input.slug}" produced no gate-passing candidates.`,
      )
    }
  }

  const setCritiques: IconSetCritique[] = []
  let setCritiqueErrors = 0
  let setRoundsUsed = 0
  for (let setRound = 1; setRound <= setRounds; setRound += 1) {
    setRoundsUsed = setRound
    const { picks, target } = jointSelect(lanes, anchors)
    const outliers = outOfFamilyMembers(lanes, picks, target)
    const fixes = new Map<string, string>()
    if (outliers.length > 0) {
      for (const slug of outliers) {
        const pick = picks.get(slug)!
        fixes.set(
          slug,
          directionalFamilyFeedback(pick.metrics, target, []),
        )
      }
    } else if (critiqueEnabled) {
      const sheet = await composeSheet([
        ...lanes.map(lane => ({
          slug: lane.input.slug,
          svg: picks.get(lane.input.slug)!.candidate.svg,
        })),
        ...anchors.map(anchor => ({ slug: anchor.slug, svg: anchor.svg })),
      ])
      let verdict: IconSetCritique | null
      try {
        verdict = await setCritique({
          ...(input.spec.context === undefined
            ? {}
            : { context: input.spec.context }),
          ink,
          members: lanes.map(lane => lane.input.slug),
          model: critiqueModel,
          png: sheet,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        })
      } catch {
        // A critique transport failure burns the round but is not fatal: the
        // measured band still constrains picks, and the next set round retries
        // the sheet. The receipt records how many verdicts were lost.
        setCritiqueErrors += 1
        continue
      }
      setCritiques.push(verdict)
      if (verdict.pass && verdict.members.every(member => member.pass)) {
        break
      }
      for (const member of verdict.members) {
        if (member.pass) continue
        const fix = [member.promptFix, ...member.problems]
          .filter(part => part.length > 0)
          .join("; ")
        fixes.set(member.slug, fix || "match the rest of the set")
      }
      if (fixes.size === 0 && verdict.familyProblems.length === 0) {
        break
      }
      if (fixes.size === 0) {
        // The model complained about the family without blaming a member;
        // steer the measured outlier if one exists, else the lowest scorer.
        const worst = [...picks.entries()].sort(
          (left, right) =>
            familyDistance(right[1].metrics, target) -
            familyDistance(left[1].metrics, target),
        )[0]!
        fixes.set(
          worst[0],
          directionalFamilyFeedback(
            worst[1].metrics,
            target,
            verdict.familyProblems,
          ),
        )
      }
    } else {
      break
    }
    if (setRound === setRounds) break
    for (const [slug, fix] of fixes) {
      const lane = lanes.find(candidate => candidate.input.slug === slug)!
      lane.regenerated += 1
      try {
        await collectForLane(lane, fix)
      } catch {
        // A failed regen round keeps the lane's existing candidates; the
        // selection below still enforces the measured band where possible.
      }
    }
  }

  const { picks, target } = jointSelect(lanes, anchors)
  const finalOutliers = outOfFamilyMembers(lanes, picks, target)
  const unresolvedCritique = setCritiques.length > 0 &&
    !setCritiques[setCritiques.length - 1]!.pass
      ? setCritiques[setCritiques.length - 1]!
          .members.filter(member => !member.pass)
          .map(member => member.slug)
      : []
  const outputDir = resolve(input.outputDir)
  const buildReceipt = (): SlopcameraIconSetReceipt => {
    const memberReceipts: SlopcameraIconSetMemberReceipt[] = lanes.map(lane => {
      const pick = picks.get(lane.input.slug)!
      return {
        attempts: lane.attempts,
        candidates: lane.eligible.map(record => ({
          metrics: record.metrics,
          round: record.round,
          ...(record.critique === null
            ? {}
            : { pass: record.critique.pass, score: record.critique.score }),
          selected: record === pick,
        })),
        ...(lane.context === undefined ? {} : { context: lane.context }),
        metrics: pick.metrics,
        outputPath: `${outputDir}/${lane.input.slug}.svg`,
        purpose: lane.purpose,
        regenerated: lane.regenerated,
        slug: lane.input.slug,
        subject: lane.input.subject,
        svgSha256: createHash("sha256").update(pick.candidate.svg).digest("hex"),
      }
    })
    const receipt: SlopcameraIconSetReceipt = {
      ...(input.spec.context === undefined && input.context === undefined
        ? {}
        : { context: input.spec.context ?? input.context }),
      ink,
      members: memberReceipts,
      model,
      ...(input.spec.name === undefined ? {} : { name: input.spec.name }),
      outputDir,
      receiptVersion: 1,
      setCritiques,
      ...(setCritiqueErrors === 0 ? {} : { setCritiqueErrors }),
      setRoundsUsed,
      target,
    }
    return receipt
  }
  if (finalOutliers.length > 0 || unresolvedCritique.length > 0) {
    const unresolved = [...new Set([...finalOutliers, ...unresolvedCritique])]
    // Failed runs still publish their diagnostic receipt: the per-member
    // candidate metrics and set critiques are exactly what a maintainer needs
    // to see why the family could not converge, and they record the paid
    // attempts that produced them.
    await writeAtomically(
      `${outputDir}/${input.spec.name ?? "icon-set"}.failed.receipt.json`,
      JSON.stringify(
        { ...buildReceipt(), unresolvedMembers: unresolved },
        null,
        2,
      ),
    )
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      `The icon set did not converge inside ${setRounds} set rounds; ` +
        `unresolved members: ${unresolved.join(", ")}. ` +
        `Diagnostic receipt: ${outputDir}/${input.spec.name ?? "icon-set"}.failed.receipt.json`,
    )
  }

  for (const lane of lanes) {
    const pick = picks.get(lane.input.slug)!
    await writeAtomically(
      `${outputDir}/${lane.input.slug}.svg`,
      pick.candidate.svg,
    )
    if (input.keepRaster === true) {
      await writeAtomically(
        `${outputDir}/${lane.input.slug}.lineart.png`,
        pick.candidate.png,
      )
    }
  }
  const receipt = buildReceipt()
  await writeAtomically(
    `${outputDir}/${input.spec.name ?? "icon-set"}.receipt.json`,
    JSON.stringify(receipt, null, 2),
  )
  return receipt
}

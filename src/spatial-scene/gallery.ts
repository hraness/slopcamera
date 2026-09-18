import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  SpatialCameraIdSchema,
  SpatialDigestSchema,
  SpatialSceneV1Schema,
  SpatialTimeUsSchema,
} from "./contracts.js"
import {
  compileSpatialDirection,
  SpatialDirectionCompilationSchema,
  spatialDirectionCompilationSha256,
  type SpatialDirectionCompilation,
} from "./direction-compile.js"
import { SpatialDirectionSchema, type SpatialDirection } from "./direction.js"
import { parseSpatialValue, spatialValueSha256 } from "./identity.js"

/**
 * Bounded direction galleries for Phase 12.
 *
 * A gallery plan enumerates at most six deterministic variants of one direction
 * along a single axis — performance pacing, camera rig families, lighting and
 * material presets, post-process suggestions, or sequence granularity. Camera
 * and sequence variants re-author the direction and recompile; look variants
 * annotate the compiled look intents. Every candidate embeds its own compiled
 * variant document: source, derived, and selection identities stay separate,
 * and the planner never renders or selects.
 */

export const SPATIAL_GALLERY_LIMITS = Object.freeze({
  candidates: 6,
  previewSamples: 8,
})

export const SpatialGalleryAxisSchema = z.enum([
  "performance",
  "camera",
  "lighting",
  "materials",
  "effects",
  "sequence",
])
export type SpatialGalleryAxis = z.infer<typeof SpatialGalleryAxisSchema>

export const SpatialGalleryCandidateSchema = z.strictObject({
  candidateId: z.string().min(1).max(96).regex(/^cand_[a-f0-9]{16}$/u),
  label: z.string().min(1).max(128),
  parameter: z.string().min(1).max(64),
  documentKind: z.literal("slopcamera.spatial-direction-compilation"),
  documentSha256: SpatialDigestSchema,
  document: z.unknown(),
})
export type SpatialGalleryCandidate = Readonly<z.infer<typeof SpatialGalleryCandidateSchema>>

export const SpatialGalleryPlanSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-gallery-plan"),
  schemaVersion: z.literal(1),
  axis: SpatialGalleryAxisSchema,
  sourceSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema.optional(),
  candidates: z.array(SpatialGalleryCandidateSchema).max(SPATIAL_GALLERY_LIMITS.candidates),
  previewReel: z.strictObject({
    sampleTimesUs: z.array(SpatialTimeUsSchema).max(SPATIAL_GALLERY_LIMITS.previewSamples),
  }).optional(),
  selection: z.strictObject({
    candidateId: z.string().min(1).max(96),
    selectorDigest: SpatialDigestSchema.optional(),
    note: z.string().min(1).max(256).optional(),
  }).optional(),
})
export type SpatialGalleryPlan = Readonly<z.infer<typeof SpatialGalleryPlanSchema>>

export function spatialGalleryPlanSha256(plan: SpatialGalleryPlan): string {
  return spatialValueSha256(plan)
}

const CAMERA_VARIANT_RIGS = ["tripod", "dolly", "orbit", "rail", "chase", "handheld"] as const
const PERFORMANCE_VARIANT_SCALE = [1, 0.9, 1.1, 0.75, 1.25, 1.5] as const
const LIGHTING_VARIANT_PRESETS = ["neutral", "low-key", "high-key", "night", "dawn", "storm"] as const
const MATERIAL_VARIANT_PALETTES = ["authored", "warm", "cool", "monochrome", "pastel", "noir"] as const
const SEQUENCE_VARIANT_STRIDE = [1, 2, 3, 4, 5, 6] as const

const EFFECTS_VARIANT_STACKS: ReadonlyArray<readonly Record<string, unknown>[]> = [
  [],
  [{ kind: "tone-map", exposure: 1, whitePoint: 4 }],
  [
    { kind: "tone-map", exposure: 1, whitePoint: 4 },
    { kind: "vignette", intensity: 0.25, radius: 0.5 },
  ],
  [
    { kind: "tone-map", exposure: 1, whitePoint: 4 },
    { kind: "grain", intensity: 0.08, seed: 7 },
  ],
  [
    { kind: "tone-map", exposure: 1, whitePoint: 4 },
    { kind: "bloom", threshold: 0.85, intensity: 0.35, radius: 0.5 },
  ],
  [
    { kind: "tone-map", exposure: 0.9, whitePoint: 2 },
    { kind: "vignette", intensity: 0.35, radius: 0.6 },
    { kind: "grain", intensity: 0.1, seed: 11 },
  ],
]

const candidateId = (axis: SpatialGalleryAxis, parameter: string, sourceSha256: string): string =>
  `cand_${spatialValueSha256({ domain: "slopcamera.gallery-candidate.v1", axis, parameter, sourceSha256 }).slice(0, 16)}`

interface GalleryVariant {
  readonly parameter: string
  readonly label: string
  readonly direction?: (direction: SpatialDirection) => SpatialDirection
  readonly document?: (compilation: SpatialDirectionCompilation) => SpatialDirectionCompilation
}

function variantsForAxis(axis: SpatialGalleryAxis, sceneDurationUs: number): readonly GalleryVariant[] {
  switch (axis) {
    case "camera":
      return CAMERA_VARIANT_RIGS.map((rigKind) => ({
        parameter: rigKind,
        label: `All coverage on ${rigKind} rigs`,
        direction: (direction) => deepFreezeJson({
          ...direction,
          coverage: direction.coverage.map((coverage) => ({ ...coverage, rigKind })),
        }),
      }))
    case "performance":
      return PERFORMANCE_VARIANT_SCALE.map((scale) => ({
        parameter: `pacing-${scale}`,
        label: `Action pacing scaled ${scale}×`,
        direction: (direction) => deepFreezeJson({
          ...direction,
          actions: direction.actions.map((action) => ({
            ...action,
            endUs: Math.min(
              action.startUs + Math.max(1, Math.round((action.endUs - action.startUs) * scale)),
              sceneDurationUs,
            ),
          })),
        }),
      }))
    case "sequence":
      return SEQUENCE_VARIANT_STRIDE.map((stride) => ({
        parameter: `stride-${stride}`,
        label: stride === 1 ? "Coverage-aligned shots" : `Merge coverage in groups of ${stride}`,
        direction: (direction) => {
          if (stride <= 1) return direction
          const coverage = []
          for (let index = 0; index < direction.coverage.length; index += stride) {
            const group = direction.coverage.slice(index, index + stride)
            const first = group[0]!
            const last = group[group.length - 1]!
            coverage.push({ ...first, endUs: last.endUs })
          }
          return deepFreezeJson({ ...direction, coverage })
        },
      }))
    case "lighting":
      return LIGHTING_VARIANT_PRESETS.map((preset) => ({
        parameter: preset,
        label: `Lighting preset ${preset}`,
        document: (compilation) => SpatialDirectionCompilationSchema.parse(deepFreezeJson({
          ...compilation,
          proposals: {
            ...compilation.proposals,
            lookIntents: compilation.proposals.lookIntents.map((intent) => ({
              ...intent,
              suggestedLightingPreset: preset,
            })),
          },
        })),
      }))
    case "materials":
      return MATERIAL_VARIANT_PALETTES.map((palette) => ({
        parameter: palette,
        label: `Material palette ${palette}`,
        document: (compilation) => SpatialDirectionCompilationSchema.parse(deepFreezeJson({
          ...compilation,
          proposals: {
            ...compilation.proposals,
            lookIntents: compilation.proposals.lookIntents.map((intent) => ({
              ...intent,
              suggestedMaterialPalette: palette,
            })),
          },
        })),
      }))
    case "effects":
      return EFFECTS_VARIANT_STACKS.map((stack, index) => ({
        parameter: `stack-${index}`,
        label: stack.length === 0
          ? "No post-process stack"
          : `Post stack: ${stack.map((step) => String(step.kind)).join(" → ")}`,
        document: (compilation) => SpatialDirectionCompilationSchema.parse(deepFreezeJson({
          ...compilation,
          proposals: {
            ...compilation.proposals,
            lookIntents: compilation.proposals.lookIntents.map((intent) => ({
              ...intent,
              suggestedPostProcess: stack,
            })),
          },
        })),
      }))
  }
}

const galleryOptionsSchema = z.strictObject({
  direction: z.unknown(),
  scene: z.unknown(),
  axis: SpatialGalleryAxisSchema,
  cameraId: z.string().min(1).max(128).optional(),
})

const compileVariant = (
  direction: SpatialDirection,
  scene: unknown,
  cameraId: string | undefined,
): SpatialDirectionCompilation =>
  compileSpatialDirection({ direction, scene, ...(cameraId === undefined ? {} : { cameraId }) })

/**
 * Builds a bounded gallery plan. Variants compile independently; candidates
 * whose documents collide keep the first so the plan stays deduplicated and
 * deterministic. `selection` is never populated by the planner.
 */
export function planSpatialDirectionGallery(input: unknown): SpatialGalleryPlan {
  const options = parseSpatialValue(galleryOptionsSchema, input, "direction gallery")
  const direction = parseSpatialValue(SpatialDirectionSchema, options.direction, "direction")
  const scene = parseSpatialValue(SpatialSceneV1Schema, options.scene, "scene")
  const base = compileSpatialDirection({
    direction, scene, ...(options.cameraId === undefined ? {} : { cameraId: options.cameraId }),
  })

  const seen = new Set<string>()
  const candidates: SpatialGalleryCandidate[] = []
  for (const variant of variantsForAxis(options.axis, scene.durationUs)) {
    const document = variant.direction !== undefined
      ? compileVariant(variant.direction(direction), scene, options.cameraId)
      : variant.document!(base)
    const documentSha256 = spatialDirectionCompilationSha256(document)
    if (seen.has(documentSha256)) continue
    seen.add(documentSha256)
    candidates.push(deepFreezeJson({
      candidateId: candidateId(options.axis, variant.parameter, base.directionSha256),
      label: variant.label,
      parameter: variant.parameter,
      documentKind: "slopcamera.spatial-direction-compilation",
      documentSha256,
      document,
    }))
    if (candidates.length >= SPATIAL_GALLERY_LIMITS.candidates) break
  }

  const sampleTimes = new Set<number>()
  for (const beat of direction.beats) {
    sampleTimes.add(Math.min(beat.startUs + Math.floor((beat.endUs - beat.startUs) / 2), scene.durationUs))
  }
  for (const coverage of direction.coverage) {
    sampleTimes.add(Math.min(coverage.startUs, scene.durationUs))
  }
  const previewReel = sampleTimes.size === 0
    ? undefined
    : { sampleTimesUs: [...sampleTimes].sort((a, b) => a - b).slice(0, SPATIAL_GALLERY_LIMITS.previewSamples) }

  return deepFreezeJson(SpatialGalleryPlanSchema.parse({
    kind: "slopcamera.spatial-gallery-plan",
    schemaVersion: 1,
    axis: options.axis,
    sourceSha256: base.directionSha256,
    sceneSha256: base.sceneSha256,
    ...(base.cameraId === undefined ? {} : { cameraId: base.cameraId }),
    candidates,
    ...(previewReel === undefined ? {} : { previewReel }),
  }))
}

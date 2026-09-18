import { z } from "zod";

import { SourceIntervalSchema } from "./edit";
import { ColorGradeSelectionSchema } from "./media-effects";
import {
  ProjectAssetIdSchema,
  ProjectPlacementIdSchema,
  ProjectStreamIdSchema,
  VideoProjectIdSchema,
} from "./project";
import { ProjectRenderTierSchema } from "./project-render";
import { Yuv420pDimensionSchema } from "./render";
import {
  IsoTimestampSchema,
  MicrosecondsSchema,
  PositiveMicrosecondsSchema,
  RepositoryRelativePathSchema,
  Sha256Schema,
  SignedMicrosecondsSchema,
  type ReadonlyInferred,
} from "./recording";
import {
  SpatialDigestSchema,
  SpatialShotIdSchema,
} from "../../../src/spatial-scene/contracts";

export const CINEMA_LIMITS = Object.freeze({
  audioCues: 256,
  beats: 128,
  clipBytes: 1_099_511_627_776,
  handleUs: 30_000_000,
  looks: 32,
  markers: 256,
  mediaSlices: 4_096,
  outputDurationUs: 3_600_000_000,
  shots: 64,
  transitionDurationUs: 10_000_000,
});

const OPAQUE_ID_SUFFIX = /^[a-z0-9][a-z0-9_-]{7,63}$/u;

function opaqueId<Prefix extends string>(prefix: Prefix) {
  return z.string().superRefine((value, context) => {
    if (!value.startsWith(prefix) || !OPAQUE_ID_SUFFIX.test(value.slice(prefix.length))) {
      context.addIssue({
        code: "custom",
        message: `Expected an opaque ${prefix} identifier.`,
      });
    }
  });
}

export const CinemaPlanIdSchema = opaqueId("cinema_").brand<"CinemaPlanId">();
export const CinemaShotIdSchema = opaqueId("cshot_").brand<"CinemaShotId">();
export const CinemaMarkerIdSchema = opaqueId("cmark_").brand<"CinemaMarkerId">();
export const CinemaBeatIdSchema = opaqueId("cbeat_").brand<"CinemaBeatId">();
export const CinemaLookIdSchema = opaqueId("clook_").brand<"CinemaLookId">();
export const CinemaCueIdSchema = opaqueId("ccue_").brand<"CinemaCueId">();

/**
 * A retained, content-addressed media artifact that can feed a cinema
 * sequence directly: a materialized spatial shot render or transition clip.
 */
export const CinemaClipArtifactSchema = z.strictObject({
  bytes: z.number().int().safe().positive().max(CINEMA_LIMITS.clipBytes),
  container: z.enum(["mkv", "mov", "mp4", "webm"]),
  durationUs: PositiveMicrosecondsSchema,
  frameRate: z.number().finite().positive().max(1_000),
  path: RepositoryRelativePathSchema,
  pixelHeight: Yuv420pDimensionSchema,
  pixelWidth: Yuv420pDimensionSchema,
  sha256: Sha256Schema,
});

export const CinemaPlacementShotSourceSchema = z.strictObject({
  kind: z.literal("placement"),
  placementId: ProjectPlacementIdSchema,
  /** Shot body window on the project clock; handles extend it inside coverage. */
  range: SourceIntervalSchema,
  streamId: ProjectStreamIdSchema,
});

export const CinemaSpatialShotSourceSchema = z.strictObject({
  /**
   * A materialized render retained beside the project. Absent artifacts admit
   * placeholder animatics; a final compile requires the rendered media.
   */
  artifact: CinemaClipArtifactSchema.optional(),
  kind: z.literal("spatial"),
  requestSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  shotId: SpatialShotIdSchema,
  shotSha256: SpatialDigestSchema,
  /** Window inside the retained artifact consumed by the shot body. */
  sourceRange: SourceIntervalSchema,
});

export const CinemaShotSourceSchema = z.discriminatedUnion("kind", [
  CinemaPlacementShotSourceSchema,
  CinemaSpatialShotSourceSchema,
]);

export const CINEMA_SCREEN_DIRECTIONS = ["left", "right", "center"] as const;
export const CINEMA_EYELINES = ["left", "right", "center"] as const;

/**
 * Optional authored continuity evidence. Audits report only on declared
 * values; they never infer direction, exposure, or focus from pixels.
 */
export const CinemaShotContinuitySchema = z.strictObject({
  cameraKey: z.string().min(1).max(256).optional(),
  exposureEv: z.number().finite().min(-32).max(32).optional(),
  eyeline: z.enum(CINEMA_EYELINES).optional(),
  focusDistanceM: z.number().finite().positive().max(1_000_000).optional(),
  screenDirection: z.enum(CINEMA_SCREEN_DIRECTIONS).optional(),
});

export const CinemaFitSchema = z.enum(["contain", "cover"]);

export const CinemaShotSchema = z.strictObject({
  continuity: CinemaShotContinuitySchema.optional(),
  fit: CinemaFitSchema.default("contain"),
  handles: z.strictObject({
    postRollUs: MicrosecondsSchema.max(CINEMA_LIMITS.handleUs),
    preRollUs: MicrosecondsSchema.max(CINEMA_LIMITS.handleUs),
  }).default({ postRollUs: 0, preRollUs: 0 }),
  lookId: CinemaLookIdSchema.optional(),
  shotId: CinemaShotIdSchema,
  source: CinemaShotSourceSchema,
});

export const CINEMA_TRANSITION_DIRECTIONS = [
  "left",
  "right",
  "up",
  "down",
] as const;

export const CinemaTransitionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("cut") }),
  z.strictObject({
    durationUs: PositiveMicrosecondsSchema.max(CINEMA_LIMITS.transitionDurationUs),
    kind: z.literal("dissolve"),
  }),
  z.strictObject({
    direction: z.enum(CINEMA_TRANSITION_DIRECTIONS),
    durationUs: PositiveMicrosecondsSchema.max(CINEMA_LIMITS.transitionDurationUs),
    kind: z.literal("wipe"),
  }),
  z.strictObject({
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/u),
    durationUs: PositiveMicrosecondsSchema.max(CINEMA_LIMITS.transitionDurationUs),
    kind: z.literal("dip-to-color"),
  }),
  z.strictObject({
    blurSigma: z.number().finite().min(1).max(64),
    direction: z.enum(CINEMA_TRANSITION_DIRECTIONS),
    durationUs: PositiveMicrosecondsSchema.max(CINEMA_LIMITS.transitionDurationUs),
    kind: z.literal("whip-pan"),
  }),
  z.strictObject({
    durationUs: PositiveMicrosecondsSchema.max(CINEMA_LIMITS.transitionDurationUs),
    kind: z.literal("light-flash"),
    peakHoldUs: MicrosecondsSchema.max(1_000_000).default(0),
  }),
  z.strictObject({
    clip: CinemaClipArtifactSchema.optional(),
    durationUs: PositiveMicrosecondsSchema.max(CINEMA_LIMITS.transitionDurationUs),
    kind: z.literal("spatial"),
  }),
  z.strictObject({
    basis: z.enum(["declared", "perceptual"]),
    kind: z.literal("match-cut"),
  }),
]);

export const CinemaAnchorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("sequence"), offsetUs: MicrosecondsSchema }),
  z.strictObject({
    kind: z.literal("shot"),
    offsetUs: SignedMicrosecondsSchema,
    shotId: CinemaShotIdSchema,
  }),
]);

export const CinemaMarkerSchema = z.strictObject({
  anchor: CinemaAnchorSchema,
  label: z.string().min(1).max(512),
  markerId: CinemaMarkerIdSchema,
});

export const CINEMA_BEAT_KINDS = [
  "act-turn",
  "climax",
  "inciting-incident",
  "midpoint",
  "resolution",
  "setup",
] as const;

export const CinemaBeatSchema = z.strictObject({
  anchor: CinemaAnchorSchema,
  beatId: CinemaBeatIdSchema,
  kind: z.enum(CINEMA_BEAT_KINDS),
  label: z.string().min(1).max(512),
});

export const CinemaLookSchema = z.strictObject({
  grade: ColorGradeSelectionSchema,
  lookId: CinemaLookIdSchema,
});

export const CINEMA_CUE_ROLES = [
  "atmosphere",
  "dialogue",
  "music",
  "sfx",
] as const;

export const CinemaAudioCueSchema = z.strictObject({
  assetId: ProjectAssetIdSchema,
  assetRange: SourceIntervalSchema,
  at: CinemaAnchorSchema,
  cueId: CinemaCueIdSchema,
  fadeInUs: MicrosecondsSchema.max(CINEMA_LIMITS.transitionDurationUs).default(0),
  fadeOutUs: MicrosecondsSchema.max(CINEMA_LIMITS.transitionDurationUs).default(0),
  gainDb: z.number().finite().min(-60).max(24).default(0),
  role: z.enum(CINEMA_CUE_ROLES),
  streamId: ProjectStreamIdSchema,
}).superRefine((cue, context) => {
  const durationUs = cue.assetRange.endUs - cue.assetRange.startUs;
  if (cue.fadeInUs + cue.fadeOutUs > durationUs) {
    context.addIssue({
      code: "custom",
      message: "Audio cue fades cannot exceed the cue duration.",
    });
  }
});

export const CinemaOutputSchema = z.strictObject({
  background: z.string().regex(/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/u).default("#000000ff"),
  frameRate: z.number().finite().positive().max(240).default(24),
  pixelHeight: Yuv420pDimensionSchema.default(1_080),
  pixelWidth: Yuv420pDimensionSchema.default(1_920),
}).superRefine((output, context) => {
  if (output.pixelWidth * output.pixelHeight > 134_217_728) {
    context.addIssue({ code: "custom", message: "Cinema output exceeds the 128-megapixel safety limit." });
  }
});

/**
 * Content-addressed cinematic sequencing sidecar. It binds one exact project
 * structure digest plus one exact project edit-plan digest, and owns shot
 * order, handles, markers, beats, transitions, looks, and audio cues without
 * mutating the underlying edit plan.
 */
export const ProjectCinemaPlanV1Schema = z.strictObject({
  audioCues: z.array(CinemaAudioCueSchema).max(CINEMA_LIMITS.audioCues).default([]),
  beats: z.array(CinemaBeatSchema).max(CINEMA_LIMITS.beats).default([]),
  cinemaPlanSha256: Sha256Schema,
  createdAt: IsoTimestampSchema,
  kind: z.literal("slopcamera.project-cinema-plan"),
  looks: z.array(CinemaLookSchema).max(CINEMA_LIMITS.looks).default([]),
  markers: z.array(CinemaMarkerSchema).max(CINEMA_LIMITS.markers).default([]),
  output: CinemaOutputSchema.default({
    background: "#000000ff",
    frameRate: 24,
    pixelHeight: 1_080,
    pixelWidth: 1_920,
  }),
  planId: CinemaPlanIdSchema,
  projectEditPlanSha256: Sha256Schema,
  projectId: VideoProjectIdSchema,
  projectStructureSha256: Sha256Schema,
  schemaVersion: z.literal(1),
  shots: z.array(CinemaShotSchema).min(1).max(CINEMA_LIMITS.shots),
  transitions: z.array(CinemaTransitionSchema).max(CINEMA_LIMITS.shots - 1).default([]),
  updatedAt: IsoTimestampSchema,
}).superRefine((plan, context) => {
  if (Date.parse(plan.updatedAt) < Date.parse(plan.createdAt)) {
    context.addIssue({ code: "custom", message: "updatedAt cannot precede createdAt." });
  }
  const shotIds = plan.shots.map(shot => shot.shotId);
  if (new Set<string>(shotIds).size !== shotIds.length) {
    context.addIssue({ code: "custom", message: "Cinema shot IDs must be unique." });
  }
  if (plan.transitions.length !== plan.shots.length - 1) {
    context.addIssue({
      code: "custom",
      message: "Cinema plans require exactly one transition between each adjacent shot pair.",
    });
  }
  const lookIds = plan.looks.map(look => look.lookId);
  if (new Set<string>(lookIds).size !== lookIds.length) {
    context.addIssue({ code: "custom", message: "Cinema look IDs must be unique." });
  }
  const knownLooks = new Set<string>(lookIds);
  for (const shot of plan.shots) {
    if (shot.lookId !== undefined && !knownLooks.has(shot.lookId)) {
      context.addIssue({ code: "custom", message: `Cinema shot ${shot.shotId} references an unknown look.` });
    }
  }
  const knownShots = new Set<string>(shotIds);
  for (const [label, entries] of [
    ["marker", plan.markers.map(entry => ({ anchor: entry.anchor, id: entry.markerId }))],
    ["beat", plan.beats.map(entry => ({ anchor: entry.anchor, id: entry.beatId }))],
    ["audio cue", plan.audioCues.map(entry => ({ anchor: entry.at, id: entry.cueId }))],
  ] as const) {
    const ids = entries.map(entry => entry.id);
    if (new Set<string>(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: `Cinema ${label} IDs must be unique.` });
    }
    for (const entry of entries) {
      if (entry.anchor.kind === "shot" && !knownShots.has(entry.anchor.shotId)) {
        context.addIssue({ code: "custom", message: `Cinema ${label} ${entry.id} anchors an unknown shot.` });
      }
    }
  }
});

export type CinemaShotId = z.infer<typeof CinemaShotIdSchema>;
export type CinemaFit = z.infer<typeof CinemaFitSchema>;
export type CinemaClipArtifact = ReadonlyInferred<typeof CinemaClipArtifactSchema>;
export type CinemaShotSource = ReadonlyInferred<typeof CinemaShotSourceSchema>;
export type CinemaShotContinuity = ReadonlyInferred<typeof CinemaShotContinuitySchema>;
export type CinemaShot = ReadonlyInferred<typeof CinemaShotSchema>;
export type CinemaTransition = ReadonlyInferred<typeof CinemaTransitionSchema>;
export type CinemaAnchor = ReadonlyInferred<typeof CinemaAnchorSchema>;
export type CinemaMarker = ReadonlyInferred<typeof CinemaMarkerSchema>;
export type CinemaBeat = ReadonlyInferred<typeof CinemaBeatSchema>;
export type CinemaLook = ReadonlyInferred<typeof CinemaLookSchema>;
export type CinemaAudioCue = ReadonlyInferred<typeof CinemaAudioCueSchema>;
export type CinemaOutput = ReadonlyInferred<typeof CinemaOutputSchema>;
export type ProjectCinemaPlanV1 = ReadonlyInferred<typeof ProjectCinemaPlanV1Schema>;

export function parseProjectCinemaPlanV1(input: unknown): ProjectCinemaPlanV1 {
  return ProjectCinemaPlanV1Schema.parse(input);
}

const CinemaMediaInputBaseShape = {
  bytes: z.number().int().safe().positive(),
  path: RepositoryRelativePathSchema,
  sha256: Sha256Schema,
  streamIndex: z.number().int().safe().nonnegative(),
} as const;

/** One contiguous decoded window consumed from a retained media file. */
export const CinemaMediaSliceSchema = z.strictObject({
  ...CinemaMediaInputBaseShape,
  /** Half-open window inside the physical file. */
  fileRange: SourceIntervalSchema,
  /** Exact window this slice occupies on the cinema output clock. */
  outputRange: SourceIntervalSchema,
});

export const CinemaResolvedShotMediaSchema = z.strictObject({
  body: z.array(CinemaMediaSliceSchema),
  inHandle: z.array(CinemaMediaSliceSchema),
  outHandle: z.array(CinemaMediaSliceSchema),
});

/** Placeholder colors derive deterministically from the shot identity. */
export const CinemaShotPlaceholderSchema = z.strictObject({
  color: z.string().regex(/^#[a-f0-9]{6}$/u),
  reason: z.literal("missing-artifact"),
});

export const CinemaResolvedShotSchema = z.strictObject({
  audio: z.strictObject({
    gainDb: z.number().finite().min(-96).max(24),
    media: CinemaResolvedShotMediaSchema,
    pan: z.number().finite().min(-1).max(1),
  }).optional(),
  durationUs: PositiveMicrosecondsSchema,
  fit: CinemaFitSchema,
  handles: z.strictObject({
    postRollUs: MicrosecondsSchema,
    preRollUs: MicrosecondsSchema,
  }),
  lookId: CinemaLookIdSchema.optional(),
  outputRange: SourceIntervalSchema,
  placeholder: CinemaShotPlaceholderSchema.optional(),
  shotId: CinemaShotIdSchema,
  /** Decoded source frame geometry used to apply the declared fit. */
  sourceFrame: z.strictObject({
    pixelHeight: Yuv420pDimensionSchema,
    pixelWidth: Yuv420pDimensionSchema,
  }),
  video: CinemaResolvedShotMediaSchema,
});

export const CinemaResolvedTransitionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("cut") }),
  z.strictObject({
    afterShotId: CinemaShotIdSchema,
    beforeShotId: CinemaShotIdSchema,
    durationUs: PositiveMicrosecondsSchema,
    kind: z.literal("dissolve"),
    outputRange: SourceIntervalSchema,
  }),
  z.strictObject({
    afterShotId: CinemaShotIdSchema,
    beforeShotId: CinemaShotIdSchema,
    direction: z.enum(CINEMA_TRANSITION_DIRECTIONS),
    durationUs: PositiveMicrosecondsSchema,
    kind: z.literal("wipe"),
    outputRange: SourceIntervalSchema,
  }),
  z.strictObject({
    afterShotId: CinemaShotIdSchema,
    beforeShotId: CinemaShotIdSchema,
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/u),
    durationUs: PositiveMicrosecondsSchema,
    kind: z.literal("dip-to-color"),
    outputRange: SourceIntervalSchema,
  }),
  z.strictObject({
    afterShotId: CinemaShotIdSchema,
    beforeShotId: CinemaShotIdSchema,
    blurSigma: z.number().finite().min(1).max(64),
    direction: z.enum(CINEMA_TRANSITION_DIRECTIONS),
    durationUs: PositiveMicrosecondsSchema,
    kind: z.literal("whip-pan"),
    outputRange: SourceIntervalSchema,
  }),
  z.strictObject({
    afterShotId: CinemaShotIdSchema,
    beforeShotId: CinemaShotIdSchema,
    durationUs: PositiveMicrosecondsSchema,
    kind: z.literal("light-flash"),
    outputRange: SourceIntervalSchema,
    peakHoldUs: MicrosecondsSchema,
  }),
  z.strictObject({
    afterShotId: CinemaShotIdSchema,
    beforeShotId: CinemaShotIdSchema,
    clip: CinemaClipArtifactSchema,
    durationUs: PositiveMicrosecondsSchema,
    kind: z.literal("spatial"),
    outputRange: SourceIntervalSchema,
  }),
  z.strictObject({
    afterShotId: CinemaShotIdSchema,
    basis: z.enum(["declared", "perceptual"]),
    beforeShotId: CinemaShotIdSchema,
    kind: z.literal("match-cut"),
  }),
]);

export const CinemaResolvedAudioCueSchema = z.strictObject({
  ...CinemaMediaInputBaseShape,
  assetId: ProjectAssetIdSchema,
  cueId: CinemaCueIdSchema,
  fadeInUs: MicrosecondsSchema,
  fadeOutUs: MicrosecondsSchema,
  fileRange: SourceIntervalSchema,
  gainDb: z.number().finite().min(-60).max(24),
  outputRange: SourceIntervalSchema,
  role: z.enum(CINEMA_CUE_ROLES),
});

export const CINEMA_ADVISORY_CODES = [
  "match-cut-declared",
  "match-cut-perceptual-unverified",
  "shot-placeholder",
] as const;

export const CinemaAdvisorySchema = z.strictObject({
  code: z.enum(CINEMA_ADVISORY_CODES),
  cueId: CinemaCueIdSchema.optional(),
  message: z.string().min(1).max(2_048),
  shotId: CinemaShotIdSchema.optional(),
  transitionIndex: z.number().int().safe().nonnegative().optional(),
});

/**
 * Fully resolved cinema render plan: every consumed media window, transition
 * recipe, audio cue, and the exact output clock are bound by content digests.
 */
export const CinemaRenderPlanV1Schema = z.strictObject({
  advisories: z.array(CinemaAdvisorySchema).max(4_096),
  audioCues: z.array(CinemaResolvedAudioCueSchema).max(CINEMA_LIMITS.audioCues),
  cinemaPlanSha256: Sha256Schema,
  kind: z.literal("slopcamera.cinema-render-plan"),
  looks: z.array(CinemaLookSchema).max(CINEMA_LIMITS.looks),
  output: z.strictObject({
    background: z.string().regex(/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/u),
    durationUs: PositiveMicrosecondsSchema.max(CINEMA_LIMITS.outputDurationUs),
    frameRate: z.number().finite().positive().max(240),
    pixelHeight: Yuv420pDimensionSchema,
    pixelWidth: Yuv420pDimensionSchema,
  }).superRefine((output, context) => {
    if (output.pixelWidth * output.pixelHeight > 134_217_728) {
      context.addIssue({ code: "custom", message: "Cinema render output exceeds the 128-megapixel safety limit." });
    }
  }),
  planSha256: Sha256Schema,
  projectEditPlanSha256: Sha256Schema,
  projectId: VideoProjectIdSchema,
  projectStructureSha256: Sha256Schema,
  schemaVersion: z.literal(1),
  shots: z.array(CinemaResolvedShotSchema).min(1).max(CINEMA_LIMITS.shots),
  transitions: z.array(CinemaResolvedTransitionSchema).max(CINEMA_LIMITS.shots - 1),
}).superRefine((plan, context) => {
  const shotIds = plan.shots.map(shot => shot.shotId);
  if (new Set<string>(shotIds).size !== shotIds.length) {
    context.addIssue({ code: "custom", message: "Resolved cinema shot IDs must be unique." });
  }
  if (plan.transitions.length !== plan.shots.length - 1) {
    context.addIssue({ code: "custom", message: "Resolved cinema transitions must cover every adjacent shot pair." });
  }
  let expectedStartUs = 0;
  for (const [index, shot] of plan.shots.entries()) {
    if (
      shot.outputRange.startUs !== expectedStartUs
      || shot.outputRange.endUs - shot.outputRange.startUs !== shot.durationUs
    ) {
      context.addIssue({ code: "custom", message: "Resolved cinema shots must tile the output clock contiguously." });
      break;
    }
    expectedStartUs = shot.outputRange.endUs;
    const transition = plan.transitions[index];
    if (transition !== undefined && transition.kind !== "cut" && transition.kind !== "match-cut") {
      if (
        transition.outputRange.startUs !== expectedStartUs
        || transition.durationUs !== transition.outputRange.endUs - transition.outputRange.startUs
      ) {
        context.addIssue({ code: "custom", message: "Resolved cinema transitions must tile the output clock contiguously." });
        break;
      }
      expectedStartUs = transition.outputRange.endUs;
    }
  }
  if (expectedStartUs !== plan.output.durationUs) {
    context.addIssue({ code: "custom", message: "Resolved cinema output duration must equal its tiled segments." });
  }
  const integrityByPath = new Map<string, { readonly bytes: number; readonly sha256: string }>();
  const sliceCount = plan.shots.reduce((total, shot) => (
    total
    + shot.video.body.length + shot.video.inHandle.length + shot.video.outHandle.length
    + (shot.audio === undefined
      ? 0
      : shot.audio.media.body.length
        + shot.audio.media.inHandle.length
        + shot.audio.media.outHandle.length)
  ), 0) + plan.audioCues.length;
  if (sliceCount > CINEMA_LIMITS.mediaSlices) {
    context.addIssue({ code: "custom", message: "Resolved cinema media slice budget exceeded." });
  }
  for (const slice of [
    ...plan.shots.flatMap(shot => [
      ...shot.video.body,
      ...shot.video.inHandle,
      ...shot.video.outHandle,
      ...(shot.audio === undefined ? [] : [
        ...shot.audio.media.body,
        ...shot.audio.media.inHandle,
        ...shot.audio.media.outHandle,
      ]),
    ]),
    ...plan.audioCues,
  ]) {
    if (slice.outputRange.endUs > plan.output.durationUs) {
      context.addIssue({ code: "custom", message: "Resolved cinema slice exceeds the output duration." });
      break;
    }
    const prior = integrityByPath.get(slice.path);
    if (prior !== undefined && (prior.bytes !== slice.bytes || prior.sha256 !== slice.sha256)) {
      context.addIssue({ code: "custom", message: "Resolved cinema slices disagree about media integrity." });
      break;
    }
    integrityByPath.set(slice.path, { bytes: slice.bytes, sha256: slice.sha256 });
  }
});

export type CinemaResolvedShotMedia = ReadonlyInferred<typeof CinemaResolvedShotMediaSchema>;
export type CinemaShotPlaceholder = ReadonlyInferred<typeof CinemaShotPlaceholderSchema>;
export type CinemaMediaSlice = ReadonlyInferred<typeof CinemaMediaSliceSchema>;
export type CinemaResolvedShot = ReadonlyInferred<typeof CinemaResolvedShotSchema>;
export type CinemaResolvedTransition = ReadonlyInferred<typeof CinemaResolvedTransitionSchema>;
export type CinemaResolvedAudioCue = ReadonlyInferred<typeof CinemaResolvedAudioCueSchema>;
export type CinemaAdvisory = ReadonlyInferred<typeof CinemaAdvisorySchema>;
export type CinemaRenderPlanV1 = ReadonlyInferred<typeof CinemaRenderPlanV1Schema>;

export function parseCinemaRenderPlanV1(input: unknown): CinemaRenderPlanV1 {
  return CinemaRenderPlanV1Schema.parse(input);
}

export const CinemaRenderInvocationSchema = z.strictObject({
  arguments: z.array(z.string()),
  executable: z.literal("ffmpeg"),
  filterGraph: z.strictObject({
    bytes: z.number().int().safe().positive().max(32 * 1024 * 1024),
    path: RepositoryRelativePathSchema,
    sha256: Sha256Schema,
  }),
  outputPath: RepositoryRelativePathSchema,
  renderPlanSha256: Sha256Schema,
});

export type CinemaRenderInvocation = ReadonlyInferred<typeof CinemaRenderInvocationSchema>;

export const CinemaRenderReceiptV1Schema = z.strictObject({
  cinemaPlanSha256: Sha256Schema,
  createdAt: IsoTimestampSchema,
  kind: z.literal("slopcamera.cinema-render-receipt"),
  output: z.strictObject({
    bytes: z.number().int().safe().positive(),
    path: RepositoryRelativePathSchema,
    sha256: Sha256Schema,
  }),
  placeholders: z.array(CinemaShotIdSchema).max(CINEMA_LIMITS.shots),
  plan: z.strictObject({
    path: RepositoryRelativePathSchema,
    sha256: Sha256Schema,
  }),
  projectId: VideoProjectIdSchema,
  schemaVersion: z.literal(1),
  tier: ProjectRenderTierSchema,
});

export type CinemaRenderReceiptV1 = ReadonlyInferred<typeof CinemaRenderReceiptV1Schema>;

export const CINEMA_FINDING_SEVERITIES = ["advisory", "warning", "error"] as const;

export const CINEMA_FINDING_CODES = [
  "axis-crossing",
  "cue-out-of-range",
  "eyeline-mismatch",
  "exposure-jump",
  "focus-jump",
  "insufficient-handles",
  "jump-cut",
  "match-on-action",
  "missing-media-coverage",
  "output-bounds-exceeded",
  "shot-media-missing",
  "stale-sidecar",
  "transition-unresolved",
] as const;

export const CinemaContinuityFindingSchema = z.strictObject({
  code: z.enum(CINEMA_FINDING_CODES),
  message: z.string().min(1).max(2_048),
  severity: z.enum(CINEMA_FINDING_SEVERITIES),
  shotIds: z.array(CinemaShotIdSchema).min(1).max(2),
  timeUs: MicrosecondsSchema,
  transitionIndex: z.number().int().safe().nonnegative().optional(),
});

export const CinemaContinuityReportSchema = z.strictObject({
  cinemaPlanSha256: Sha256Schema,
  findings: z.array(CinemaContinuityFindingSchema).max(4_096),
  kind: z.literal("slopcamera.cinema-continuity-report"),
  schemaVersion: z.literal(1),
});

export type CinemaContinuityFinding = ReadonlyInferred<typeof CinemaContinuityFindingSchema>;
export type CinemaContinuityReport = ReadonlyInferred<typeof CinemaContinuityReportSchema>;

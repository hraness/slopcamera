import {
  CINEMA_LIMITS,
  CinemaGalleryAxisSchema,
  CinemaGalleryPlanSchema,
  CinemaRenderPlanV1Schema,
  CinemaTemporalReportSchema,
  ProjectCinemaPlanV1Schema,
  type CinemaAnchor,
  type CinemaAudioCue,
  type CinemaContinuityFinding,
  type CinemaContinuityReport,
  type CinemaGalleryAxis,
  type CinemaGalleryCandidate,
  type CinemaGalleryPlan,
  type CinemaMediaSlice,
  type CinemaRenderPlanV1,
  type CinemaResolvedAudioCue,
  type CinemaResolvedShot,
  type CinemaResolvedShotMedia,
  type CinemaResolvedTransition,
  type CinemaShot,
  type CinemaShotContinuity,
  type CinemaTemporalFinding,
  type CinemaTemporalReport,
  type CinemaTransition,
  type ProjectCinemaPlanV1,
  ProjectEditPlanV1Schema,
  type ProjectPlacementV1,
  type SourceInterval,
  VideoProjectV1Schema,
  type VideoProjectV1,
} from "../contracts";
import { canonicalJsonSha256 } from "./canonical-json";
import { hashProjectEditPlan, hashProjectStructure } from "./project-plan";
import { mapProjectIntervalToAssetSlices } from "./project-time";

type CinemaShotId = ProjectCinemaPlanV1["shots"][number]["shotId"];
type CinemaLookId = ProjectCinemaPlanV1["looks"][number]["lookId"];

type ProjectMediaStream = VideoProjectV1["assets"][number]["streams"][number];

export interface CinemaSequenceWindow {
  readonly endUs: number;
  readonly startUs: number;
}

export interface CinemaSequenceLayout {
  readonly durationUs: number;
  readonly shots: readonly (CinemaSequenceWindow & { readonly shotId: string })[];
  readonly transitions: readonly (CinemaSequenceWindow & {
    readonly afterShotId: string;
    readonly beforeShotId: string;
    readonly durationUs: number;
    readonly index: number;
  })[];
}

export interface CinemaAnalysis {
  readonly findings: readonly CinemaContinuityFinding[];
  readonly layout: CinemaSequenceLayout | null;
}

export interface CinemaCompileOptions {
  /** Animatics may substitute deterministic placeholder frames for absent spatial artifacts. */
  readonly placeholders: "allow" | "reject";
}

export function hashCinemaPlanComposition(planInput: ProjectCinemaPlanV1): string {
  const plan = ProjectCinemaPlanV1Schema.parse(planInput);
  const { cinemaPlanSha256: _cinemaPlanSha256, ...body } = plan;
  void _cinemaPlanSha256;
  return canonicalJsonSha256(body);
}

export function assertCinemaPlanComposition(planInput: ProjectCinemaPlanV1): ProjectCinemaPlanV1 {
  const plan = ProjectCinemaPlanV1Schema.parse(planInput);
  const actual = hashCinemaPlanComposition(plan);
  if (actual !== plan.cinemaPlanSha256) {
    throw new TypeError(
      `Cinema plan composition hash mismatch: expected ${plan.cinemaPlanSha256}, received ${actual}.`,
    );
  }
  return plan;
}

export function hashCinemaRenderPlanComposition(planInput: CinemaRenderPlanV1): string {
  const plan = CinemaRenderPlanV1Schema.parse(planInput);
  const { planSha256: _planSha256, ...body } = plan;
  void _planSha256;
  return canonicalJsonSha256(body);
}

export function transitionDurationUs(transition: CinemaTransition): number {
  return transition.kind === "cut" || transition.kind === "match-cut" ? 0 : transition.durationUs;
}

/** Lay out every shot body and transition segment on the cinema output clock. */
export function cinemaSequenceLayout(plan: ProjectCinemaPlanV1): CinemaSequenceLayout {
  const shots: CinemaSequenceLayout["shots"][number][] = [];
  const transitions: CinemaSequenceLayout["transitions"][number][] = [];
  let cursorUs = 0;
  for (const [index, shot] of plan.shots.entries()) {
    const durationUs = shot.source.kind === "placement"
      ? shot.source.range.endUs - shot.source.range.startUs
      : shot.source.sourceRange.endUs - shot.source.sourceRange.startUs;
    shots.push({ endUs: cursorUs + durationUs, shotId: shot.shotId, startUs: cursorUs });
    cursorUs += durationUs;
    const transition = plan.transitions[index];
    if (transition !== undefined) {
      const transitionUs = transitionDurationUs(transition);
      if (transitionUs > 0) {
        transitions.push({
          afterShotId: plan.shots[index + 1]!.shotId,
          beforeShotId: shot.shotId,
          durationUs: transitionUs,
          endUs: cursorUs + transitionUs,
          index,
          startUs: cursorUs,
        });
        cursorUs += transitionUs;
      }
    }
  }
  return { durationUs: cursorUs, shots, transitions };
}

function anchorTimeUs(
  anchor: CinemaAnchor,
  layout: CinemaSequenceLayout,
): number | null {
  if (anchor.kind === "sequence") return anchor.offsetUs;
  const window = layout.shots.find(shot => shot.shotId === anchor.shotId);
  if (window === undefined) return null;
  const timeUs = window.startUs + anchor.offsetUs;
  return Number.isSafeInteger(timeUs) ? timeUs : null;
}

function finding(
  code: CinemaContinuityFinding["code"],
  severity: CinemaContinuityFinding["severity"],
  message: string,
  shotIds: readonly CinemaContinuityFinding["shotIds"][number][],
  timeUs: number,
  transitionIndex?: number,
): CinemaContinuityFinding {
  return {
    code,
    message,
    severity,
    shotIds,
    timeUs,
    ...(transitionIndex === undefined ? {} : { transitionIndex }),
  };
}

interface ResolvedStreamWindow {
  readonly coverage: readonly CinemaMediaSlice[];
  readonly complete: boolean;
}

function placementStreamWindow(
  placement: ProjectPlacementV1,
  stream: ProjectMediaStream,
  projectWindow: SourceInterval,
  outputStartUs: number,
): ResolvedStreamWindow {
  const assetSlices = mapProjectIntervalToAssetSlices(placement, projectWindow);
  const requestedUs = projectWindow.endUs - projectWindow.startUs;
  const mappedUs = assetSlices.reduce(
    (total, slice) => total + (slice.project.endUs - slice.project.startUs),
    0,
  );
  const slices: CinemaMediaSlice[] = [];
  let outputCursorUs = outputStartUs;
  let complete = mappedUs >= requestedUs;
  for (const assetSlice of assetSlices) {
    const projectDurationUs = assetSlice.project.endUs - assetSlice.project.startUs;
    const assetDurationUs = assetSlice.asset.endUs - assetSlice.asset.startUs;
    let coveredAssetUs = 0;
    for (const media of stream.segments) {
      const startUs = Math.max(assetSlice.asset.startUs, media.assetRange.startUs);
      const endUs = Math.min(assetSlice.asset.endUs, media.assetRange.endUs);
      if (endUs <= startUs) continue;
      const outputSliceStartUs = outputCursorUs + Math.round(
        projectDurationUs * coveredAssetUs / assetDurationUs,
      );
      coveredAssetUs += endUs - startUs;
      const outputSliceEndUs = outputCursorUs + Math.round(
        projectDurationUs * coveredAssetUs / assetDurationUs,
      );
      if (outputSliceEndUs <= outputSliceStartUs) continue;
      const fileStartUs = media.fileRange.startUs + (startUs - media.assetRange.startUs);
      slices.push({
        bytes: media.bytes,
        fileRange: {
          endUs: fileStartUs + (endUs - startUs),
          startUs: fileStartUs,
        },
        outputRange: {
          endUs: outputSliceEndUs,
          startUs: outputSliceStartUs,
        },
        path: media.path,
        sha256: media.sha256,
        streamIndex: media.streamIndex,
      });
    }
    if (coveredAssetUs < assetDurationUs) complete = false;
    outputCursorUs += projectDurationUs;
  }
  return { complete, coverage: slices };
}

function spatialArtifactWindow(
  artifact: { readonly bytes: number; readonly path: string; readonly sha256: string },
  window: SourceInterval,
  outputStartUs: number,
): ResolvedStreamWindow {
  return {
    complete: true,
    coverage: [{
      bytes: artifact.bytes,
      fileRange: { endUs: window.endUs, startUs: window.startUs },
      outputRange: {
        endUs: outputStartUs + (window.endUs - window.startUs),
        startUs: outputStartUs,
      },
      path: artifact.path,
      sha256: artifact.sha256,
      streamIndex: 0,
    }],
  };
}

const EMPTY_MEDIA: CinemaResolvedShotMedia = { body: [], inHandle: [], outHandle: [] };

function placeholderColor(shotId: string): string {
  // Dark, muted placeholder hues stay visually distinct from authored media.
  let hash = 0;
  for (const character of shotId) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  const hue = (hash % 360) / 360;
  const lightness = 0.22;
  const saturation = 0.28;
  const high = lightness * (1 + saturation);
  const low = 2 * lightness - high;
  const channel = (offset: number): number => {
    let t = hue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return low + (high - low) * 6 * t;
    if (t < 1 / 2) return high;
    if (t < 2 / 3) return low + (high - low) * (2 / 3 - t) * 6;
    return low;
  };
  const hex = (value: number): string => (
    Math.round(value * 255).toString(16).padStart(2, "0")
  );
  return `#${hex(channel(1 / 3))}${hex(channel(0))}${hex(channel(-1 / 3))}`;
}

export function compileCinemaSequence(
  cinemaInput: unknown,
  projectInput: unknown,
  editPlanInput: unknown,
  options: CinemaCompileOptions = { placeholders: "reject" },
): CinemaRenderPlanV1 {
  const cinema = ProjectCinemaPlanV1Schema.parse(cinemaInput);
  const project = VideoProjectV1Schema.parse(projectInput);
  const editPlan = ProjectEditPlanV1Schema.parse(editPlanInput);
  const analysis = analyzeCinemaPlan(cinema, project, editPlan);
  const blocking = analysis.findings.find(candidate => candidate.severity === "error");
  if (blocking !== undefined) {
    throw new TypeError(`cinema-${blocking.code}: ${blocking.message}`);
  }
  if (analysis.layout === null) throw new TypeError("cinema-invalid: Cinema plan could not be laid out.");
  const layout = analysis.layout;

  const advisories: CinemaRenderPlanV1["advisories"][number][] = [];
  const resolvedShots: CinemaResolvedShot[] = [];
  const resolvedTransitions: CinemaResolvedTransition[] = [];

  for (const [index, shot] of cinema.shots.entries()) {
    const window = layout.shots[index]!;
    const durationUs = window.endUs - window.startUs;
    const incoming = index === 0 ? 0 : transitionDurationUs(cinema.transitions[index - 1]!);
    const outgoing = index === cinema.shots.length - 1 ? 0 : transitionDurationUs(cinema.transitions[index]!);
    let video: CinemaResolvedShotMedia = EMPTY_MEDIA;
    let audio: CinemaResolvedShot["audio"];
    let placeholder: CinemaResolvedShot["placeholder"];
    let sourceFrame: CinemaResolvedShot["sourceFrame"] | undefined;

    if (shot.source.kind === "placement") {
      const source = shot.source;
      const placement = project.placements.find(candidate => candidate.placementId === source.placementId)!;
      const asset = project.assets.find(candidate => candidate.assetId === placement.assetId)!;
      const videoStream = asset.streams.find(
        candidate => candidate.streamId === source.streamId && candidate.kind === "video",
      );
      if (videoStream?.kind !== "video") {
        throw new TypeError(`cinema-missing-media-coverage: Shot ${shot.shotId} has no enabled video stream.`);
      }
      const bodyWindow = source.range;
      const inWindow = { endUs: bodyWindow.startUs, startUs: bodyWindow.startUs - incoming };
      const outWindow = { endUs: bodyWindow.endUs + outgoing, startUs: bodyWindow.endUs };
      const body = placementStreamWindow(placement, videoStream, bodyWindow, window.startUs);
      const inHandle = incoming === 0
        ? { complete: true, coverage: [] }
        : placementStreamWindow(placement, videoStream, inWindow, window.startUs - incoming);
      const outHandle = outgoing === 0
        ? { complete: true, coverage: [] }
        : placementStreamWindow(placement, videoStream, outWindow, window.endUs);
      if (!body.complete || !inHandle.complete || !outHandle.complete) {
        throw new TypeError(`cinema-missing-media-coverage: Shot ${shot.shotId} lacks complete media coverage.`);
      }
      video = {
        body: body.coverage,
        inHandle: inHandle.coverage,
        outHandle: outHandle.coverage,
      };
      const audioConfiguration = placement.audio.find(
        configured => configured.presentation.enabled
          && asset.streams.some(
            stream => stream.streamId === configured.streamId && stream.kind === "audio",
          ),
      );
      if (audioConfiguration !== undefined) {
        const audioStream = asset.streams.find(
          stream => stream.streamId === audioConfiguration.streamId,
        )!;
        const audioBody = placementStreamWindow(placement, audioStream, bodyWindow, window.startUs);
        const audioIn = incoming === 0
          ? { complete: true, coverage: [] }
          : placementStreamWindow(placement, audioStream, inWindow, window.startUs - incoming);
        const audioOut = outgoing === 0
          ? { complete: true, coverage: [] }
          : placementStreamWindow(placement, audioStream, outWindow, window.endUs);
        if (audioBody.complete && audioIn.complete && audioOut.complete) {
          const presentation = audioConfiguration.presentation;
          if (presentation.enabled) {
            audio = {
              gainDb: presentation.gainDb,
              media: {
                body: audioBody.coverage,
                inHandle: audioIn.coverage,
                outHandle: audioOut.coverage,
              },
              pan: presentation.pan,
            };
          }
        }
      }
      sourceFrame = {
        pixelHeight: videoStream.pixelHeight,
        pixelWidth: videoStream.pixelWidth,
      };
    } else {
      const source = shot.source;
      if (source.artifact !== undefined) {
        const artifact = source.artifact;
        sourceFrame = {
          pixelHeight: artifact.pixelHeight,
          pixelWidth: artifact.pixelWidth,
        };
        const inWindow = {
          endUs: source.sourceRange.startUs,
          startUs: source.sourceRange.startUs - incoming,
        };
        const outWindow = {
          endUs: source.sourceRange.endUs + outgoing,
          startUs: source.sourceRange.endUs,
        };
        video = {
          body: spatialArtifactWindow(artifact, source.sourceRange, window.startUs).coverage,
          inHandle: incoming === 0
            ? []
            : spatialArtifactWindow(artifact, inWindow, window.startUs - incoming).coverage,
          outHandle: outgoing === 0
            ? []
            : spatialArtifactWindow(artifact, outWindow, window.endUs).coverage,
        };
      } else {
        if (options.placeholders !== "allow") {
          throw new TypeError(`cinema-shot-media-missing: Shot ${shot.shotId} has no materialized artifact.`);
        }
        placeholder = { color: placeholderColor(shot.shotId), reason: "missing-artifact" };
        sourceFrame = {
          pixelHeight: cinema.output.pixelHeight,
          pixelWidth: cinema.output.pixelWidth,
        };
        advisories.push({
          code: "shot-placeholder",
          message: `Shot ${shot.shotId} renders from a deterministic placeholder; its spatial artifact is absent.`,
          shotId: shot.shotId,
        });
      }
    }

    if (sourceFrame === undefined) {
      throw new TypeError(`cinema-invalid: Shot ${shot.shotId} frame geometry could not be resolved.`);
    }
    resolvedShots.push({
      ...(audio === undefined ? {} : { audio }),
      durationUs,
      fit: shot.fit,
      handles: shot.handles,
      ...(shot.lookId === undefined ? {} : { lookId: shot.lookId }),
      outputRange: { endUs: window.endUs, startUs: window.startUs },
      ...(placeholder === undefined ? {} : { placeholder }),
      shotId: shot.shotId,
      sourceFrame,
      video,
    });

    const transition = cinema.transitions[index];
    if (transition !== undefined) {
      const transitionWindow = layout.transitions.find(candidate => candidate.index === index);
      resolvedTransitions.push(resolveTransition(
        transition,
        index,
        shot.shotId,
        cinema.shots[index + 1]!.shotId,
        transitionWindow,
        advisories,
      ));
    }
  }

  const audioCues: CinemaResolvedAudioCue[] = [];
  for (const cue of cinema.audioCues) {
    const startUs = anchorTimeUs(cue.at, layout)!;
    const asset = project.assets.find(candidate => candidate.assetId === cue.assetId)!;
    const stream = asset.streams.find(
      candidate => candidate.streamId === cue.streamId && candidate.kind === "audio",
    )!;
    let outputCursorUs = startUs;
    const cueDurationUs = cue.assetRange.endUs - cue.assetRange.startUs;
    for (const media of stream.segments) {
      const startUsAsset = Math.max(cue.assetRange.startUs, media.assetRange.startUs);
      const endUsAsset = Math.min(cue.assetRange.endUs, media.assetRange.endUs);
      if (endUsAsset <= startUsAsset) continue;
      const fileStartUs = media.fileRange.startUs + (startUsAsset - media.assetRange.startUs);
      const durationUs = endUsAsset - startUsAsset;
      audioCues.push({
        assetId: cue.assetId,
        bytes: media.bytes,
        cueId: cue.cueId,
        fadeInUs: cue.fadeInUs,
        fadeOutUs: cue.fadeOutUs,
        fileRange: { endUs: fileStartUs + durationUs, startUs: fileStartUs },
        gainDb: cue.gainDb,
        outputRange: {
          endUs: outputCursorUs + durationUs,
          startUs: outputCursorUs,
        },
        path: media.path,
        role: cue.role,
        sha256: media.sha256,
        streamIndex: media.streamIndex,
      });
      outputCursorUs += durationUs;
    }
    if (outputCursorUs !== startUs + cueDurationUs) {
      throw new TypeError(`cinema-missing-media-coverage: Audio cue ${cue.cueId} lacks complete media coverage.`);
    }
  }

  const body = {
    advisories,
    audioCues,
    cinemaPlanSha256: cinema.cinemaPlanSha256,
    kind: "slopcamera.cinema-render-plan" as const,
    looks: cinema.looks,
    output: {
      background: cinema.output.background,
      durationUs: layout.durationUs,
      frameRate: cinema.output.frameRate,
      pixelHeight: cinema.output.pixelHeight,
      pixelWidth: cinema.output.pixelWidth,
    },
    projectEditPlanSha256: cinema.projectEditPlanSha256,
    projectId: cinema.projectId,
    projectStructureSha256: cinema.projectStructureSha256,
    schemaVersion: 1 as const,
    shots: resolvedShots,
    transitions: resolvedTransitions,
  };
  // Hash the normalized body so schema defaults cannot drift the identity.
  const draft = CinemaRenderPlanV1Schema.parse({ ...body, planSha256: "0".repeat(64) });
  return CinemaRenderPlanV1Schema.parse({
    ...draft,
    planSha256: hashCinemaRenderPlanComposition(draft),
  });
}

function resolveTransition(
  transition: CinemaTransition,
  index: number,
  beforeShotId: CinemaShot["shotId"],
  afterShotId: CinemaShot["shotId"],
  window: CinemaSequenceWindow | undefined,
  advisories: CinemaRenderPlanV1["advisories"][number][],
): CinemaResolvedTransition {
  if (transition.kind === "cut") return { kind: "cut" };
  if (transition.kind === "match-cut") {
    advisories.push(transition.basis === "declared"
      ? {
          code: "match-cut-declared",
          message: "Match-cut similarity is declared by the plan author; it is not measured.",
          transitionIndex: index,
        }
      : {
          code: "match-cut-perceptual-unverified",
          message: "Perceptual match-cut requests are advisory: similarity is not measured.",
          transitionIndex: index,
        });
    return {
      afterShotId,
      basis: transition.basis,
      beforeShotId,
      kind: "match-cut",
    };
  }
  const range = window!;
  const shared = {
    afterShotId,
    beforeShotId,
    durationUs: transition.durationUs,
    outputRange: { endUs: range.endUs, startUs: range.startUs },
  };
  switch (transition.kind) {
    case "dissolve": return { ...shared, kind: "dissolve" };
    case "wipe": return { ...shared, direction: transition.direction, kind: "wipe" };
    case "dip-to-color": return { ...shared, color: transition.color, kind: "dip-to-color" };
    case "whip-pan": return {
      ...shared,
      blurSigma: transition.blurSigma,
      direction: transition.direction,
      kind: "whip-pan",
    };
    case "light-flash": return { ...shared, kind: "light-flash", peakHoldUs: transition.peakHoldUs };
    case "spatial": {
      if (transition.clip === undefined) {
        throw new TypeError(`cinema-transition-unresolved: Transition ${index} requests a spatial transition without a materialized clip.`);
      }
      return { ...shared, clip: transition.clip, kind: "spatial" };
    }
  }
}

/**
 * Structural plus continuity findings for one cinema sidecar. Schema-level
 * failures still throw; every content problem is a deterministic finding.
 */
export function analyzeCinemaPlan(
  cinemaInput: unknown,
  projectInput: unknown,
  editPlanInput: unknown,
): CinemaAnalysis {
  const cinema = ProjectCinemaPlanV1Schema.parse(cinemaInput);
  const project = VideoProjectV1Schema.parse(projectInput);
  const editPlan = ProjectEditPlanV1Schema.parse(editPlanInput);
  const findings: CinemaContinuityFinding[] = [];
  const firstShotId = cinema.shots[0]!.shotId;

  const structureSha256 = hashProjectStructure(project);
  const editPlanSha256 = hashProjectEditPlan(editPlan);
  if (
    cinema.projectId !== project.projectId
    || cinema.projectStructureSha256 !== structureSha256
    || cinema.projectEditPlanSha256 !== editPlanSha256
    || editPlan.projectStructureSha256 !== structureSha256
  ) {
    findings.push(finding(
      "stale-sidecar",
      "error",
      "Cinema sidecar no longer matches the current project structure or edit plan digests.",
      [firstShotId],
      0,
    ));
  }

  const layout = cinemaSequenceLayout(cinema);
  if (layout.durationUs > CINEMA_LIMITS.outputDurationUs) {
    findings.push(finding(
      "output-bounds-exceeded",
      "error",
      `Cinema output duration ${layout.durationUs}us exceeds the bounded limit.`,
      [firstShotId],
      0,
    ));
  }

  for (const [index, shot] of cinema.shots.entries()) {
    const window = layout.shots[index]!;
    const incoming = index === 0 ? 0 : transitionDurationUs(cinema.transitions[index - 1]!);
    const outgoing = index === cinema.shots.length - 1 ? 0 : transitionDurationUs(cinema.transitions[index]!);
    if (incoming > shot.handles.preRollUs) {
      findings.push(finding(
        "insufficient-handles",
        "error",
        `Shot ${shot.shotId} provides ${shot.handles.preRollUs}us of pre-roll; the incoming transition needs ${incoming}us.`,
        [shot.shotId],
        window.startUs,
        index - 1,
      ));
    }
    if (outgoing > shot.handles.postRollUs) {
      findings.push(finding(
        "insufficient-handles",
        "error",
        `Shot ${shot.shotId} provides ${shot.handles.postRollUs}us of post-roll; the outgoing transition needs ${outgoing}us.`,
        [shot.shotId],
        window.endUs,
        index,
      ));
    }
    if (shot.source.kind === "placement") {
      const source = shot.source;
      const placement = project.placements.find(candidate => candidate.placementId === source.placementId);
      const asset = placement === undefined
        ? undefined
        : project.assets.find(candidate => candidate.assetId === placement.assetId);
      const stream = asset?.streams.find(
        candidate => candidate.streamId === source.streamId && candidate.kind === "video",
      );
      if (placement === undefined || asset === undefined || stream === undefined || !placement.enabled) {
        findings.push(finding(
          "missing-media-coverage",
          "error",
          `Shot ${shot.shotId} references an unknown or disabled placement video stream.`,
          [shot.shotId],
          window.startUs,
        ));
      } else {
        const expanded = {
          endUs: source.range.endUs + outgoing,
          startUs: source.range.startUs - incoming,
        };
        if (expanded.startUs < 0) {
          findings.push(finding(
            "insufficient-handles",
            "error",
            `Shot ${shot.shotId} pre-roll reaches before project time zero.`,
            [shot.shotId],
            window.startUs,
          ));
        } else {
          const coverage = placementStreamWindow(placement, stream, expanded, 0);
          if (!coverage.complete) {
            findings.push(finding(
              "missing-media-coverage",
              "error",
              `Shot ${shot.shotId} expanded window is not fully covered by its placement media.`,
              [shot.shotId],
              window.startUs,
            ));
          }
        }
      }
    } else {
      const source = shot.source;
      if (source.artifact === undefined) {
        findings.push(finding(
          "shot-media-missing",
          "warning",
          `Shot ${shot.shotId} has no materialized artifact; animatics render a placeholder.`,
          [shot.shotId],
          window.startUs,
        ));
      } else {
        const artifact = source.artifact;
        if (
          source.sourceRange.startUs - incoming < 0
          || source.sourceRange.endUs + outgoing > artifact.durationUs
        ) {
          findings.push(finding(
            "insufficient-handles",
            "error",
            `Shot ${shot.shotId} expanded window exceeds its retained artifact duration.`,
            [shot.shotId],
            window.startUs,
          ));
        }
      }
    }
  }

  for (const [index, transition] of cinema.transitions.entries()) {
    const window = layout.transitions.find(candidate => candidate.index === index);
    if (transition.kind === "spatial" && transition.clip === undefined) {
      findings.push(finding(
        "transition-unresolved",
        "error",
        `Transition ${index} requests a spatial transition without a materialized clip.`,
        [cinema.shots[index]!.shotId, cinema.shots[index + 1]!.shotId],
        window?.startUs ?? layout.shots[index]!.endUs,
        index,
      ));
    }
    if (
      transition.kind === "spatial"
      && transition.clip !== undefined
      && transition.clip.durationUs < transition.durationUs
    ) {
      findings.push(finding(
        "transition-unresolved",
        "error",
        `Transition ${index} clip is shorter than the requested spatial transition.`,
        [cinema.shots[index]!.shotId, cinema.shots[index + 1]!.shotId],
        window?.startUs ?? layout.shots[index]!.endUs,
        index,
      ));
    }
  }

  for (const cue of cinema.audioCues) {
    const asset = project.assets.find(candidate => candidate.assetId === cue.assetId);
    const stream = asset?.streams.find(
      candidate => candidate.streamId === cue.streamId && candidate.kind === "audio",
    );
    const startUs = anchorTimeUs(cue.at, layout);
    const cueDurationUs = cue.assetRange.endUs - cue.assetRange.startUs;
    if (
      asset === undefined
      || stream === undefined
      || startUs === null
      || startUs < 0
      || startUs + cueDurationUs > layout.durationUs
    ) {
      findings.push(finding(
        "cue-out-of-range",
        "error",
        `Audio cue ${cue.cueId} does not fit the declared sequence or media.`,
        [firstShotId],
        Math.max(0, startUs ?? 0),
      ));
      continue;
    }
    let coveredUs = 0;
    for (const media of stream.segments) {
      coveredUs += Math.max(0, Math.min(cue.assetRange.endUs, media.assetRange.endUs)
        - Math.max(cue.assetRange.startUs, media.assetRange.startUs));
    }
    if (coveredUs < cueDurationUs) {
      findings.push(finding(
        "missing-media-coverage",
        "error",
        `Audio cue ${cue.cueId} is not fully covered by its asset media.`,
        [firstShotId],
        Math.max(0, startUs),
      ));
    }
  }

  const sorted = [...findings].sort((left, right) => (
    left.timeUs - right.timeUs
    || left.code.localeCompare(right.code)
    || left.shotIds.join("").localeCompare(right.shotIds.join(""))
  ));
  return {
    findings: sorted,
    layout: sorted.some(candidate => candidate.severity === "error") ? null : layout,
  };
}

function shotCameraKey(shot: CinemaShot): string {
  if (shot.continuity?.cameraKey !== undefined) return shot.continuity.cameraKey;
  return shot.source.kind === "placement"
    ? `placement:${shot.source.placementId}:${shot.source.streamId}`
    : `spatial:${shot.source.shotId}`;
}

const JUMP_CUT_GAP_US = 250_000;
const EXPOSURE_JUMP_EV = 1;
const FOCUS_JUMP_RATIO = 3;

function continuityPairFindings(
  before: CinemaShot,
  after: CinemaShot,
  boundaryUs: number,
  transition: CinemaTransition,
  transitionIndex: number,
): CinemaContinuityFinding[] {
  const findings: CinemaContinuityFinding[] = [];
  const left: CinemaShotContinuity | undefined = before.continuity;
  const right: CinemaShotContinuity | undefined = after.continuity;
  const shots = [before.shotId, after.shotId] as const;

  if (
    left?.screenDirection !== undefined
    && right?.screenDirection !== undefined
    && left.screenDirection !== "center"
    && right.screenDirection !== "center"
    && left.screenDirection !== right.screenDirection
  ) {
    findings.push(finding(
      "axis-crossing",
      "warning",
      `Screen direction crosses the axis: ${before.shotId} is ${left.screenDirection}, ${after.shotId} is ${right.screenDirection}.`,
      shots,
      boundaryUs,
      transitionIndex,
    ));
  }
  if (
    left?.eyeline !== undefined
    && right?.eyeline !== undefined
    && left.eyeline !== "center"
    && right.eyeline !== "center"
    && left.eyeline === right.eyeline
  ) {
    findings.push(finding(
      "eyeline-mismatch",
      "warning",
      `Adjacent shots share a ${left.eyeline} eyeline; a reverse-angle pair should oppose.`,
      shots,
      boundaryUs,
      transitionIndex,
    ));
  }
  if (
    left?.exposureEv !== undefined
    && right?.exposureEv !== undefined
    && Math.abs(left.exposureEv - right.exposureEv) > EXPOSURE_JUMP_EV
  ) {
    findings.push(finding(
      "exposure-jump",
      "advisory",
      `Exposure changes by ${Math.abs(left.exposureEv - right.exposureEv)} EV between adjacent shots.`,
      shots,
      boundaryUs,
      transitionIndex,
    ));
  }
  if (
    left?.focusDistanceM !== undefined
    && right?.focusDistanceM !== undefined
    && Math.max(left.focusDistanceM, right.focusDistanceM)
        / Math.min(left.focusDistanceM, right.focusDistanceM) > FOCUS_JUMP_RATIO
  ) {
    findings.push(finding(
      "focus-jump",
      "advisory",
      "Focus distance jumps more than 3× between adjacent shots.",
      shots,
      boundaryUs,
      transitionIndex,
    ));
  }
  const gapUs = transitionDurationUs(transition);
  if (shotCameraKey(before) === shotCameraKey(after) && gapUs < JUMP_CUT_GAP_US) {
    findings.push(finding(
      "jump-cut",
      "warning",
      `Adjacent shots share camera ${shotCameraKey(before)} with a ${gapUs}us boundary.`,
      shots,
      boundaryUs,
      transitionIndex,
    ));
  }
  if (transition.kind === "match-cut") {
    findings.push(finding(
      "match-on-action",
      "advisory",
      "Match-on-action timing is declared, not measured; the boundary carries shot/time evidence only.",
      shots,
      boundaryUs,
      transitionIndex,
    ));
  }
  return findings;
}

/** Pure deterministic continuity audit over declared shot evidence. */
export function auditCinemaContinuity(cinemaInput: unknown): CinemaContinuityReport {
  const cinema = ProjectCinemaPlanV1Schema.parse(cinemaInput);
  const layout = cinemaSequenceLayout(cinema);
  const findings: CinemaContinuityFinding[] = [];
  for (const [index, transition] of cinema.transitions.entries()) {
    const before = cinema.shots[index]!;
    const after = cinema.shots[index + 1]!;
    const boundaryUs = transition.kind === "cut" || transition.kind === "match-cut"
      ? layout.shots[index]!.endUs
      : layout.transitions.find(candidate => candidate.index === index)!.startUs;
    findings.push(...continuityPairFindings(
      before,
      after,
      boundaryUs,
      transition,
      index,
    ));
  }
  findings.sort((left, right) => (
    left.timeUs - right.timeUs
    || left.code.localeCompare(right.code)
    || left.shotIds.join("").localeCompare(right.shotIds.join(""))
  ));
  return {
    cinemaPlanSha256: cinema.cinemaPlanSha256,
    findings,
    kind: "slopcamera.cinema-continuity-report",
    schemaVersion: 1,
  };
}

/** Deterministic starter sidecar: one placement shot per enabled video stream. */
export function createCinemaPlanScaffold(
  projectInput: unknown,
  editPlanInput: unknown,
  planId: ProjectCinemaPlanV1["planId"],
  timestamp: string,
): ProjectCinemaPlanV1 {
  const project = VideoProjectV1Schema.parse(projectInput);
  const editPlan = ProjectEditPlanV1Schema.parse(editPlanInput);
  const structureSha256 = hashProjectStructure(project);
  if (editPlan.projectStructureSha256 !== structureSha256) {
    throw new TypeError("Project structure and edit plan are out of sync.");
  }
  const shots: ProjectCinemaPlanV1["shots"][number][] = [];
  const placements = [...project.placements].sort((left, right) => (
    left.placementId.localeCompare(right.placementId)
  ));
  for (const placement of placements) {
    if (!placement.enabled) continue;
    const asset = project.assets.find(candidate => candidate.assetId === placement.assetId);
    if (asset === undefined) continue;
    const videoStream = placement.video.find(configured => (
      configured.presentation.enabled
      && asset.streams.some(
        stream => stream.streamId === configured.streamId && stream.kind === "video",
      )
    ));
    if (videoStream === undefined) continue;
    const first = placement.sync.anchors[0]!;
    const last = placement.sync.anchors.at(-1)!;
    const suffix = String(placement.placementId).slice("placement_".length).replaceAll("-", "_");
    shots.push({
      fit: "contain",
      handles: { postRollUs: 0, preRollUs: 0 },
      shotId: `cshot_${suffix}` as ProjectCinemaPlanV1["shots"][number]["shotId"],
      source: {
        kind: "placement",
        placementId: placement.placementId,
        range: { endUs: last.projectTimeUs, startUs: first.projectTimeUs },
        streamId: videoStream.streamId,
      },
    });
  }
  if (shots.length === 0) {
    throw new TypeError("Cinema init requires at least one enabled placement video stream.");
  }
  const body = {
    audioCues: [],
    beats: [],
    createdAt: timestamp,
    kind: "slopcamera.project-cinema-plan" as const,
    looks: [],
    markers: [],
    output: {},
    planId,
    projectEditPlanSha256: hashProjectEditPlan(editPlan),
    projectId: project.projectId,
    projectStructureSha256: structureSha256,
    schemaVersion: 1 as const,
    shots,
    transitions: shots.slice(1).map(() => ({ kind: "cut" as const })),
    updatedAt: timestamp,
  };
  const parsed = ProjectCinemaPlanV1Schema.parse({
    ...body,
    cinemaPlanSha256: "0".repeat(64),
  });
  const { cinemaPlanSha256: _, ...parsedBody } = parsed;
  void _;
  const cinemaPlanSha256 = canonicalJsonSha256(parsedBody);
  return { ...parsed, cinemaPlanSha256 };
}

/** A shot shorter than this is a staccato cut that transitions cannot serve. */
const PACING_COLLAPSE_US = 250_000;
/** More than this many simultaneous audio cues is a concurrency finding. */
const CUE_CONCURRENCY_LIMIT = 3;
/** Uniform pacing fires only when every shot sits within this band of the median. */
const UNIFORM_PACING_TOLERANCE = 0.1;
const UNIFORM_PACING_MIN_SHOTS = 4;

function temporalFinding(
  code: CinemaTemporalFinding["code"],
  severity: CinemaTemporalFinding["severity"],
  message: string,
  shotIds: readonly CinemaShotId[],
  timeUs: number,
  transitionIndex?: number,
): CinemaTemporalFinding {
  return {
    code,
    message,
    severity,
    shotIds: [...shotIds],
    timeUs,
    ...(transitionIndex === undefined ? {} : { transitionIndex }),
  };
}

/**
 * Audits one cinema plan's compiled layout for pacing, transition, and cue
 * evidence the media audit does not derive. All measures come from the layout
 * and declared cues; nothing inspects pixels or decodes media.
 */
export function auditCinemaTemporal(
  cinemaInput: unknown,
  projectInput: unknown,
  editPlanInput: unknown,
): CinemaTemporalReport {
  const cinema = ProjectCinemaPlanV1Schema.parse(cinemaInput);
  VideoProjectV1Schema.parse(projectInput);
  ProjectEditPlanV1Schema.parse(editPlanInput);
  const layout = cinemaSequenceLayout(cinema);
  const findings: CinemaTemporalFinding[] = [];
  const shotId = (id: string): CinemaShotId => cinema.shots.find((shot) => shot.shotId === id)!.shotId;

  for (const transition of layout.transitions) {
    const before = layout.shots.find((shot) => shot.shotId === transition.beforeShotId)!;
    const after = layout.shots.find((shot) => shot.shotId === transition.afterShotId)!;
    const shorterUs = Math.min(before.endUs - before.startUs, after.endUs - after.startUs);
    if (transition.durationUs > shorterUs) {
      findings.push(temporalFinding(
        "transition-overrun",
        "warning",
        `Transition ${transition.index} lasts ${transition.durationUs}us, longer than the shorter adjacent shot window ${shorterUs}us.`,
        [shotId(transition.beforeShotId), shotId(transition.afterShotId)],
        transition.startUs,
        transition.index,
      ));
    }
  }

  for (const shot of layout.shots) {
    const windowUs = shot.endUs - shot.startUs;
    if (windowUs < PACING_COLLAPSE_US) {
      findings.push(temporalFinding(
        "pacing-collapse",
        "warning",
        `Shot ${shot.shotId} is visible for only ${windowUs}us, below the ${PACING_COLLAPSE_US}us pacing floor.`,
        [shotId(shot.shotId)],
        shot.startUs,
      ));
    }
  }

  const cueWindows: { endUs: number; startUs: number }[] = [];
  for (const cue of cinema.audioCues) {
    const startUs = anchorTimeUs(cue.at, layout);
    if (startUs === null) continue;
    cueWindows.push({ endUs: startUs + (cue.assetRange.endUs - cue.assetRange.startUs), startUs });
  }
  const instants = new Set<number>();
  for (const window of cueWindows) {
    instants.add(window.startUs);
    instants.add(window.endUs);
  }
  let maxConcurrentCues = 0;
  for (const instant of [...instants].sort((a, b) => a - b)) {
    const concurrent = cueWindows.filter((window) => window.startUs < instant && instant < window.endUs
      || window.startUs === instant).length;
    maxConcurrentCues = Math.max(maxConcurrentCues, concurrent);
    if (concurrent > CUE_CONCURRENCY_LIMIT) {
      findings.push(temporalFinding(
        "cue-concurrency",
        "warning",
        `${concurrent} audio cues overlap at ${instant}us, above the ${CUE_CONCURRENCY_LIMIT}-cue limit.`,
        [shotId(layout.shots.find((shot) => shot.startUs <= instant && instant < shot.endUs)?.shotId ?? layout.shots[0]!.shotId)],
        instant,
      ));
    }
  }

  const durations = layout.shots.map((shot) => shot.endUs - shot.startUs);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianShotUs = sortedDurations[Math.floor(sortedDurations.length / 2)]!;
  if (
    durations.length >= UNIFORM_PACING_MIN_SHOTS
    && durations.every((duration) => Math.abs(duration - medianShotUs) <= medianShotUs * UNIFORM_PACING_TOLERANCE)
  ) {
    findings.push(temporalFinding(
      "uniform-pacing",
      "advisory",
      `All ${durations.length} shots sit within ${UNIFORM_PACING_TOLERANCE * 100}% of the ${medianShotUs}us median; the cut has no pacing contrast.`,
      [shotId(layout.shots[0]!.shotId)],
      0,
    ));
  }

  const totalTransitionUs = layout.transitions.reduce((sum, transition) => sum + transition.durationUs, 0);
  const totalShotUs = durations.reduce((sum, duration) => sum + duration, 0);
  const sorted = [...findings].sort((left, right) => (
    left.timeUs - right.timeUs
    || left.code.localeCompare(right.code)
    || left.shotIds.join("").localeCompare(right.shotIds.join(""))
  ));
  return CinemaTemporalReportSchema.parse({
    cinemaPlanSha256: cinema.cinemaPlanSha256,
    findings: sorted,
    kind: "slopcamera.cinema-temporal-report",
    metrics: {
      audioCueCount: cinema.audioCues.length,
      maxConcurrentCues,
      maxShotUs: sortedDurations[sortedDurations.length - 1]!,
      medianShotUs,
      minShotUs: sortedDurations[0]!,
      shotCount: layout.shots.length,
      totalDurationUs: layout.durationUs,
      transitionCount: layout.transitions.length,
      transitionOverheadRatio: totalShotUs === 0 ? 0 : totalTransitionUs / totalShotUs,
    },
    schemaVersion: 1,
  });
}

interface CinemaGalleryVariant {
  readonly label: string;
  readonly mutate: (plan: ProjectCinemaPlanV1) => ProjectCinemaPlanV1;
  readonly parameter: string;
}

const scaleShotRange = (range: SourceInterval, factor: number): SourceInterval => ({
  endUs: range.startUs + Math.max(1, Math.floor((range.endUs - range.startUs) * factor)),
  startUs: range.startUs,
});

const PACING_FACTORS = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;

function pacingVariant(factor: number): CinemaGalleryVariant {
  return {
    label: factor === 1 ? "authored pacing" : `tighter coverage ${Math.round(factor * 100)}%`,
    mutate: (plan) => ({
      ...plan,
      shots: plan.shots.map((shot) => ({
        ...shot,
        source: shot.source.kind === "placement"
          ? { ...shot.source, range: scaleShotRange(shot.source.range, factor) }
          : { ...shot.source, sourceRange: scaleShotRange(shot.source.sourceRange, factor) },
      })),
    }),
    parameter: `factor:${factor}`,
  };
}

const TRANSITION_PRESETS: readonly (CinemaTransition & { readonly label: string })[] = [
  { kind: "cut", label: "hard cuts" } as CinemaTransition & { readonly label: string },
  { durationUs: 250_000, kind: "dissolve", label: "short dissolves" } as CinemaTransition & { readonly label: string },
  { durationUs: 500_000, kind: "dissolve", label: "half-second dissolves" } as CinemaTransition & { readonly label: string },
  { durationUs: 1_000_000, kind: "dissolve", label: "one-second dissolves" } as CinemaTransition & { readonly label: string },
  { color: "#000000", durationUs: 500_000, kind: "dip-to-color", label: "dips to black" } as CinemaTransition & { readonly label: string },
  { durationUs: 400_000, kind: "light-flash", label: "light flashes" } as CinemaTransition & { readonly label: string },
];

function transitionVariant(index: number): CinemaGalleryVariant {
  const preset = TRANSITION_PRESETS[index]!;
  const { label: _label, ...transition } = preset;
  void _label;
  return {
    label: preset.label,
    mutate: (plan) => ({ ...plan, transitions: plan.transitions.map(() => ({ ...transition })) }),
    parameter: `preset:${preset.kind}`,
  };
}

const LOOK_ASSIGNMENTS: readonly {
  readonly assign: (index: number, lookIds: readonly CinemaLookId[]) => CinemaLookId | undefined;
  readonly label: string;
  readonly parameter: string;
}[] = [
  { assign: () => undefined, label: "strip all looks", parameter: "strip" },
  { assign: (_index, lookIds) => lookIds[0], label: "single look", parameter: "first" },
  { assign: (index, lookIds) => lookIds[index % lookIds.length], label: "round-robin looks", parameter: "cycle" },
  { assign: (index, lookIds) => lookIds[lookIds.length - 1 - (index % lookIds.length)], label: "reverse round-robin", parameter: "reverse-cycle" },
  { assign: (index, lookIds) => (index % 2 === 0 ? lookIds[0] : lookIds[Math.min(1, lookIds.length - 1)]), label: "alternating looks", parameter: "alternate" },
  { assign: (index, lookIds) => (index === 0 ? lookIds[0] : undefined), label: "hero shot only", parameter: "hero" },
];

function lookVariant(index: number): CinemaGalleryVariant {
  const assignment = LOOK_ASSIGNMENTS[index]!;
  return {
    label: assignment.label,
    mutate: (plan) => {
      const lookIds = plan.looks.map((look) => look.lookId);
      return {
        ...plan,
        shots: plan.shots.map((shot, shotIndex) => {
          const lookId = assignment.assign(shotIndex, lookIds);
          const next = { ...shot };
          if (lookId === undefined) delete (next as { lookId?: CinemaLookId }).lookId;
          else next.lookId = lookId;
          return next;
        }),
      };
    },
    parameter: `assignment:${assignment.parameter}`,
  };
}

const AUDIO_OFFSETS_DB = [-12, -6, -3, 0, 3, 6] as const;

function audioVariant(offsetDb: number): CinemaGalleryVariant {
  return {
    label: offsetDb === 0 ? "authored gains" : `cue gain ${offsetDb > 0 ? "+" : ""}${offsetDb}dB`,
    mutate: (plan) => ({
      ...plan,
      audioCues: plan.audioCues.map((cue): CinemaAudioCue => ({
        ...cue,
        gainDb: Math.max(-60, Math.min(24, cue.gainDb + offsetDb)),
      })),
    }),
    parameter: `offset:${offsetDb}dB`,
  };
}

const STRUCTURE_ORDERS: readonly {
  readonly label: string;
  readonly order: (count: number) => number[];
  readonly parameter: string;
}[] = [
  { label: "authored order", order: (count) => Array.from({ length: count }, (_value, index) => index), parameter: "identity" },
  { label: "reverse order", order: (count) => Array.from({ length: count }, (_value, index) => count - 1 - index), parameter: "reverse" },
  { label: "rotate by one", order: (count) => Array.from({ length: count }, (_value, index) => (index + 1) % count), parameter: "rotate-1" },
  { label: "rotate by half", order: (count) => Array.from({ length: count }, (_value, index) => (index + Math.floor(count / 2)) % count), parameter: "rotate-half" },
  {
    label: "interleaved ends",
    order: (count) => {
      const order: number[] = [];
      for (let index = 0; index < count; index += 1) {
        order.push(index % 2 === 0 ? index / 2 : count - 1 - Math.floor(index / 2));
      }
      return order;
    },
    parameter: "interleave",
  },
  {
    label: "evens first",
    order: (count) => [...Array.from({ length: count }, (_value, index) => index).filter((index) => index % 2 === 0), ...Array.from({ length: count }, (_value, index) => index).filter((index) => index % 2 !== 0)],
    parameter: "evens-first",
  },
];

function structureVariant(index: number): CinemaGalleryVariant {
  const order = STRUCTURE_ORDERS[index]!;
  return {
    label: order.label,
    mutate: (plan) => ({ ...plan, shots: order.order(plan.shots.length).map((shotIndex) => plan.shots[shotIndex]!) }),
    parameter: `order:${order.parameter}`,
  };
}

const MIXED_COMPOSITIONS: readonly { readonly label: string; readonly mutate: (plan: ProjectCinemaPlanV1) => ProjectCinemaPlanV1; readonly parameter: string }[] = [
  { label: "tighter cuts, short dissolves", mutate: (plan) => transitionVariant(1).mutate(pacingVariant(0.8).mutate(plan)), parameter: "pacing-0.8+dissolve-250" },
  { label: "tighter cuts, hard cuts", mutate: (plan) => transitionVariant(0).mutate(pacingVariant(0.7).mutate(plan)), parameter: "pacing-0.7+cut" },
  { label: "reversed, quiet cues", mutate: (plan) => audioVariant(-6).mutate(structureVariant(1).mutate(plan)), parameter: "reverse+-6dB" },
  { label: "rotated, long dissolves", mutate: (plan) => transitionVariant(3).mutate(structureVariant(2).mutate(plan)), parameter: "rotate-1+dissolve-1000" },
  { label: "single look, dipped", mutate: (plan) => transitionVariant(4).mutate(lookVariant(1).mutate(plan)), parameter: "first-look+dip" },
  { label: "interleaved, louder cues", mutate: (plan) => audioVariant(6).mutate(structureVariant(4).mutate(plan)), parameter: "interleave++6dB" },
];

function variantsForCinemaAxis(axis: CinemaGalleryAxis): readonly CinemaGalleryVariant[] {
  switch (axis) {
    case "audio": return AUDIO_OFFSETS_DB.map(audioVariant);
    case "looks": return LOOK_ASSIGNMENTS.map((_assignment, index) => lookVariant(index));
    case "mixed": return MIXED_COMPOSITIONS;
    case "pacing": return PACING_FACTORS.map(pacingVariant);
    case "structure": return STRUCTURE_ORDERS.map((_order, index) => structureVariant(index));
    case "transitions": return TRANSITION_PRESETS.map((_preset, index) => transitionVariant(index));
  }
}

const CINEMA_GALLERY_CANDIDATES = 6;

/**
 * Builds a bounded gallery of candidate cinema plans. Every candidate mutates
 * the authored plan, re-parses through the canonical schema, and re-hashes
 * through the composition digest; duplicates collapse to the first occurrence.
 * `selection` is always null — the planner never promotes a candidate.
 */
export function planCinemaGallery(cinemaInput: unknown, axisInput: unknown): CinemaGalleryPlan {
  const cinema = assertCinemaPlanComposition(ProjectCinemaPlanV1Schema.parse(cinemaInput));
  const axis = CinemaGalleryAxisSchema.parse(axisInput);
  const seen = new Set<string>([cinema.cinemaPlanSha256]);
  const candidates: CinemaGalleryCandidate[] = [];
  for (const variant of variantsForCinemaAxis(axis)) {
    const mutated = variant.mutate(cinema);
    const { cinemaPlanSha256: _sha, ...body } = mutated;
    void _sha;
    const parsed = ProjectCinemaPlanV1Schema.parse({ ...body, cinemaPlanSha256: "0".repeat(64) });
    const { cinemaPlanSha256: _placeholder, ...parsedBody } = parsed;
    void _placeholder;
    const cinemaPlanSha256 = canonicalJsonSha256(parsedBody);
    if (seen.has(cinemaPlanSha256)) continue;
    seen.add(cinemaPlanSha256);
    candidates.push({
      candidateId: `gallery_${axis}_${variant.parameter.replaceAll(/[^a-zA-Z0-9]+/gu, "-")}_${cinemaPlanSha256.slice(0, 8)}`,
      cinemaPlanSha256,
      label: variant.label,
      parameter: variant.parameter,
      plan: { ...parsed, cinemaPlanSha256 },
    });
    if (candidates.length >= CINEMA_GALLERY_CANDIDATES) break;
  }
  if (candidates.length === 0) {
    throw new TypeError(`Cinema gallery axis ${axis} produced no distinct candidates from this plan.`);
  }
  return CinemaGalleryPlanSchema.parse({
    axis,
    candidates,
    cinemaPlanSha256: cinema.cinemaPlanSha256,
    kind: "slopcamera.cinema-gallery-plan",
    schemaVersion: 1,
    selection: null,
  });
}

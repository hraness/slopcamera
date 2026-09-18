import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  CinemaRenderInvocationSchema,
  resolveProjectRenderEncoderRecipe,
  type CinemaMediaSlice,
  type CinemaRenderInvocation,
  type CinemaRenderPlanV1,
  type CinemaResolvedShot,
  type CinemaResolvedTransition,
  type ProjectRenderEncoderRecipe,
  type ProjectRenderTier,
} from "../contracts";
import { CliError } from "./errors";
import { materializeFilterScript } from "./filter-script";
import { buildColorGradeFilter } from "./media-effects-service";
import {
  resolveVerifiedProjectMedia,
  verifyPhysicalProjectMedia,
  type ExpectedProjectMediaIntegrity,
} from "./project-media-integrity";

function seconds(microseconds: number): string {
  return (microseconds / 1_000_000).toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "");
}

function decimal(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(10).replace(/0+$/u, "").replace(/\.$/u, "");
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function inputSpecifier(index: number, streamIndex: number): string {
  return `${index}:${streamIndex}`;
}

function atempo(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new CliError("unsupported-plan", "Audio tempo rate must be positive.");
  }
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 100) {
    filters.push("atempo=100");
    remaining /= 100;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${decimal(remaining)}`);
  return filters.join(",");
}

function delayToOutput(startUs: number): string[] {
  // amix consumes each input from its first sample; shifting timestamps alone
  // does not place that input in the program. Insert silence at the output rate.
  const samples = (BigInt(startUs) * 48_000n + 500_000n) / 1_000_000n;
  return ["asetpts=PTS-STARTPTS", ...(samples === 0n ? [] : [`adelay=${samples}S:all=1`])];
}

const WIPE_XFADE = Object.freeze({
  down: "wipedown",
  left: "wipeleft",
  right: "wiperight",
  up: "wipeup",
} as const);

const WHIP_PAN_XFADE = Object.freeze({
  down: "slidedown",
  left: "slideleft",
  right: "slideright",
  up: "slideup",
} as const);

export interface CinemaRenderBuildOptions {
  readonly dryRun?: boolean;
  readonly ffmpeg: string;
  readonly outputPath: string;
  readonly projectDirectory: string;
  readonly repositoryRoot: string;
  /** Encoder recipe tier; animatics use "preview". */
  readonly tier?: ProjectRenderTier;
  /** Host-owned private root for materialized filter graphs. */
  readonly workspaceDirectory?: string;
}

export interface CinemaRenderPinnedInput extends ExpectedProjectMediaIntegrity {
  readonly label: string;
  readonly path: string;
}

export interface BuiltCinemaRenderInvocation {
  readonly argv: readonly [string, ...string[]];
  readonly invocation: CinemaRenderInvocation;
  readonly pinnedInputs: readonly CinemaRenderPinnedInput[];
}

export async function reverifyCinemaRenderInputs(
  inputs: readonly CinemaRenderPinnedInput[],
): Promise<void> {
  await Promise.all(inputs.map(async input => {
    await verifyPhysicalProjectMedia(input.path, input, input.label);
  }));
}

function cinemaEncoderArguments(recipe: ProjectRenderEncoderRecipe): readonly string[] {
  return [
    "-threads:v", String(recipe.video.threads),
    "-preset", recipe.video.preset,
    "-crf", String(recipe.video.crf),
    "-b:a", recipe.audio.bitrate,
  ];
}

function cinemaThreadArguments(recipe: ProjectRenderEncoderRecipe): readonly string[] {
  return [
    "-filter_threads", String(recipe.filterThreads),
    "-filter_complex_threads", String(recipe.filterComplexThreads),
  ];
}

interface GraphContext {
  readonly filters: string[];
  readonly inputIndex: ReadonlyMap<string, number>;
  readonly rate: string;
  serial: number;
}

function label(context: GraphContext, prefix: string): string {
  return `${prefix}_${context.serial++}`;
}

function sliceChain(slice: CinemaMediaSlice, inputIndex: ReadonlyMap<string, number>): string {
  const input = inputIndex.get(slice.path)!;
  const inputDurationUs = slice.fileRange.endUs - slice.fileRange.startUs;
  const outputDurationUs = slice.outputRange.endUs - slice.outputRange.startUs;
  return [
    `[${inputSpecifier(input, slice.streamIndex)}]`,
    `trim=start=${seconds(slice.fileRange.startUs)}:end=${seconds(slice.fileRange.endUs)}`,
    "settb=AVTB",
    // Source clocks may be coarse; cinema offsets stay in integer microseconds.
    `setpts=(PTS-STARTPTS)*${decimal(outputDurationUs / inputDurationUs)}+${seconds(slice.outputRange.startUs)}/TB`,
    "format=rgba",
  ].join(",");
}

/** Concatenate the declared slices of one window into a cinema-clock stream. */
function windowChain(
  context: GraphContext,
  slices: readonly CinemaMediaSlice[],
  fit: CinemaResolvedShot["fit"],
  gradeFilter: string | undefined,
  outputWidth: number,
  outputHeight: number,
  prefix: string,
): string {
  const parts: string[] = [];
  const members: string[] = [];
  for (const slice of slices) {
    const member = label(context, `${prefix}_part`);
    parts.push(`${sliceChain(slice, context.inputIndex)}[${member}]`);
    members.push(member);
  }
  const geometry = fit === "cover"
    ? `scale=w=${outputWidth}:h=${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight}`
    : `scale=w=${outputWidth}:h=${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
  const joined = label(context, prefix);
  parts.push(
    `${members.map(member => `[${member}]`).join("")}concat=n=${members.length}:v=1:a=0,${geometry},format=rgba${gradeFilter === undefined ? "" : `,${gradeFilter}`}[${joined}]`,
  );
  context.filters.push(...parts);
  return joined;
}

/** A placeholder shot is an explicit deterministic color source on the cinema clock. */
function placeholderChain(
  context: GraphContext,
  shot: CinemaResolvedShot,
  startUs: number,
  endUs: number,
  outputWidth: number,
  outputHeight: number,
): string {
  const color = shot.placeholder!.color;
  const joined = label(context, "shot_placeholder");
  context.filters.push(
    `color=c=${color}:s=${outputWidth}x${outputHeight}:r=${context.rate}:d=${seconds(endUs - startUs)},format=rgba,setpts=PTS+${seconds(startUs)}/TB[${joined}]`,
  );
  return joined;
}

/**
 * Compile one bounded transition into an owned filter recipe. Every branch is
 * a typed composition of FFmpeg primitives; caller text never reaches a filter.
 */
function transitionRecipe(transition: CinemaResolvedTransition): readonly string[] {
  switch (transition.kind) {
    case "dissolve":
      return [`xfade=transition=fade:duration=${seconds(transition.durationUs)}:offset=0`];
    case "wipe":
      return [`xfade=transition=${WIPE_XFADE[transition.direction]}:duration=${seconds(transition.durationUs)}:offset=0`];
    case "whip-pan":
      return [
        `xfade=transition=${WHIP_PAN_XFADE[transition.direction]}:duration=${seconds(transition.durationUs)}:offset=0`,
        `gblur=sigma=${decimal(transition.blurSigma)}`,
      ];
    default:
      throw new CliError("unsupported-plan", `Transition ${transition.kind} has no direct recipe.`);
  }
}

/**
 * Emit the transition window stream covering [startUs, endUs). Multi-stage
 * recipes (dip-to-color, light-flash) concat owned sub-transitions; a retained
 * spatial clip streams directly; cut and match-cut produce no stream.
 */
function transitionWindowChain(
  context: GraphContext,
  transition: CinemaResolvedTransition,
  before: CinemaResolvedShot,
  after: CinemaResolvedShot,
  gradeOf: (shot: CinemaResolvedShot) => string | undefined,
  outputWidth: number,
  outputHeight: number,
): string | null {
  if (transition.kind === "cut" || transition.kind === "match-cut") return null;
  const startUs = transition.outputRange.startUs;
  const endUs = transition.outputRange.endUs;
  const durationUs = transition.durationUs;

  const windowOf = (
    shot: CinemaResolvedShot,
    slices: readonly CinemaMediaSlice[],
    prefix: string,
    limitUs?: number,
  ): string => {
    const grade = gradeOf(shot);
    let stream: string;
    if (slices.length === 0) {
      if (shot.placeholder === undefined) {
        throw new CliError(
          "invalid-data",
          `Shot ${shot.shotId} has no media covering a required transition window.`,
        );
      }
      stream = placeholderChain(context, shot, startUs, endUs, outputWidth, outputHeight);
    } else {
      stream = windowChain(context, slices, shot.fit, grade, outputWidth, outputHeight, prefix);
    }
    const zeroed = label(context, `${prefix}_zero`);
    context.filters.push(
      `[${stream}]setpts=PTS-STARTPTS,fps=${context.rate}${limitUs === undefined ? "" : `,trim=end=${seconds(limitUs)},setpts=PTS-STARTPTS`}[${zeroed}]`,
    );
    return zeroed;
  };

  const joinSegments = (segments: readonly string[], prefix: string): string => {
    if (segments.length === 1) return segments[0]!;
    const joined = label(context, prefix);
    context.filters.push(
      `${segments.map(segment => `[${segment}]`).join("")}concat=n=${segments.length}:v=1:a=0[${joined}]`,
    );
    return joined;
  };

  const xfade = (first: string, second: string, durationText: string, name: string, prefix: string): string => {
    const joined = label(context, prefix);
    context.filters.push(`[${first}][${second}]xfade=transition=${name}:duration=${durationText}:offset=0[${joined}]`);
    return joined;
  };

  const colorSource = (color: string, durationText: string, prefix: string): string => {
    const stream = label(context, prefix);
    context.filters.push(
      `color=c=${color}:s=${outputWidth}x${outputHeight}:r=${context.rate}:d=${durationText},format=rgba[${stream}]`,
    );
    return stream;
  };

  let body: string;
  if (transition.kind === "spatial") {
    const clipIndex = context.inputIndex.get(transition.clip.path)!;
    const stream = label(context, "transition_spatial");
    context.filters.push(
      `[${clipIndex}:v:0]trim=start=0:end=${seconds(durationUs)},settb=AVTB,setpts=PTS-STARTPTS,fps=${context.rate},scale=w=${outputWidth}:h=${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba[${stream}]`,
    );
    body = stream;
  } else {
    const a = windowOf(before, before.video.outHandle, "transition_out");
    if (transition.kind === "dip-to-color") {
      const firstHalfUs = Math.floor(durationUs / 2);
      const secondHalfUs = durationUs - firstHalfUs;
      const b = windowOf(after, after.video.inHandle, "transition_in", secondHalfUs);
      const first = xfade(
        a,
        colorSource(transition.color, seconds(firstHalfUs), "dip_color_a"),
        seconds(firstHalfUs),
        "fade",
        "dip_a",
      );
      const second = xfade(
        colorSource(transition.color, seconds(secondHalfUs), "dip_color_b"),
        b,
        seconds(secondHalfUs),
        "fade",
        "dip_b",
      );
      body = joinSegments([first, second], "dip_joined");
    } else if (transition.kind === "light-flash") {
      const rampUs = Math.floor((durationUs - transition.peakHoldUs) / 2);
      const tailUs = durationUs - transition.peakHoldUs - rampUs;
      const b = windowOf(after, after.video.inHandle, "transition_in", tailUs);
      const segments = [
        xfade(a, colorSource("white", seconds(rampUs), "flash_color_a"), seconds(rampUs), "fade", "flash_a"),
        ...(transition.peakHoldUs === 0
          ? []
          : [colorSource("white", seconds(transition.peakHoldUs), "flash_hold")]),
        xfade(colorSource("white", seconds(tailUs), "flash_color_b"), b, seconds(tailUs), "fade", "flash_b"),
      ];
      body = joinSegments(segments, "flash_joined");
    } else {
      const b = windowOf(after, after.video.inHandle, "transition_in");
      const recipe = transitionRecipe(transition);
      const blended = label(context, "transition_blend");
      context.filters.push(`[${a}][${b}]${recipe.join(",")}[${blended}]`);
      body = blended;
    }
  }
  const positioned = label(context, "transition_window");
  context.filters.push(`[${body}]setpts=PTS+${seconds(startUs)}/TB[${positioned}]`);
  return positioned;
}

/**
 * Build a deterministic FFmpeg invocation for a compiled cinema render plan.
 * Pure planning stays in `core/cinema-plan.ts`; this builder owns argv, graph
 * materialization, and media re-verification only.
 */
export async function buildCinemaFfmpegInvocation(
  plan: CinemaRenderPlanV1,
  options: CinemaRenderBuildOptions,
): Promise<BuiltCinemaRenderInvocation> {
  if (plan.output.durationUs <= 0) {
    throw new CliError("unsupported-plan", "A zero-duration cinema sequence cannot render.");
  }
  const recipe = resolveProjectRenderEncoderRecipe(options.tier ?? "preview");
  const emittedRate = decimal(plan.output.frameRate);
  const projectRoot = await realpath(options.projectDirectory);
  const output = resolve(options.outputPath);
  if (!isWithin(projectRoot, output)) {
    throw new CliError("unsafe-path", "Cinema render output must remain in its project directory.");
  }
  const outputRelative = relative(projectRoot, output);
  if (!outputRelative.startsWith("renders/") || isAbsolute(outputRelative)) {
    throw new CliError("unsafe-path", "Cinema render output must remain under renders/.");
  }

  const mediaIntegrity = new Map<string, ExpectedProjectMediaIntegrity>();
  const register = (path: string, expected: ExpectedProjectMediaIntegrity): void => {
    const prior = mediaIntegrity.get(path);
    if (prior !== undefined && (prior.bytes !== expected.bytes || prior.sha256 !== expected.sha256)) {
      throw new CliError("invalid-data", `Cinema slices disagree about media integrity for ${path}.`);
    }
    mediaIntegrity.set(path, expected);
  };
  for (const shot of plan.shots) {
    for (const slice of [
      ...shot.video.inHandle,
      ...shot.video.body,
      ...shot.video.outHandle,
      ...(shot.audio === undefined ? [] : [
        ...shot.audio.media.inHandle,
        ...shot.audio.media.body,
        ...shot.audio.media.outHandle,
      ]),
    ]) {
      register(slice.path, { bytes: slice.bytes, sha256: slice.sha256 });
    }
  }
  for (const cue of plan.audioCues) register(cue.path, { bytes: cue.bytes, sha256: cue.sha256 });
  for (const transition of plan.transitions) {
    if (transition.kind === "spatial") {
      register(transition.clip.path, { bytes: transition.clip.bytes, sha256: transition.clip.sha256 });
    }
  }

  const inputIndex = new Map<string, number>();
  const inputArguments: string[] = [];
  const pinnedInputs: CinemaRenderPinnedInput[] = [];
  for (const [path, expected] of mediaIntegrity) {
    inputIndex.set(path, inputIndex.size);
    const spatialOutput = /^spatial\/outputs\/[a-f0-9]{64}\.[a-z0-9]+$/u.test(path);
    const physical = await resolveVerifiedProjectMedia({
      expected,
      label: `Cinema media ${path}`,
      path,
      repositoryRoot: spatialOutput ? projectRoot : options.repositoryRoot,
    });
    inputArguments.push("-threads", String(recipe.decoderThreads), "-i", physical);
    pinnedInputs.push({ ...expected, label: `Cinema media ${path}`, path: physical });
  }

  const context: GraphContext = {
    filters: [
      `color=c=${plan.output.background}:s=${plan.output.pixelWidth}x${plan.output.pixelHeight}:r=${emittedRate}:d=${seconds(plan.output.durationUs)},format=rgba[canvas_0]`,
    ],
    inputIndex,
    rate: emittedRate,
    serial: 0,
  };
  const width = plan.output.pixelWidth;
  const height = plan.output.pixelHeight;
  const gradeByShot = new Map<string, string>();
  for (const look of plan.looks) {
    gradeByShot.set(look.lookId, buildColorGradeFilter({
      grade: look.grade,
      kind: "slopcamera.color-grade-transform",
      outputProfile: "preserve",
      schemaVersion: 1,
      videoStreamIndex: 0,
    }).filter);
  }
  const gradeOf = (shot: CinemaResolvedShot): string | undefined => (
    shot.lookId === undefined ? undefined : gradeByShot.get(shot.lookId)
  );

  let currentVideo = "canvas_0";
  const overlay = (stream: string, startUs: number, endUs: number): void => {
    const next = label(context, "canvas");
    context.filters.push(
      `[${currentVideo}][${stream}]overlay=x=0:y=0:eof_action=repeat:repeatlast=1:enable='gte(t,${seconds(startUs)})*lt(t,${seconds(endUs)})'[${next}]`,
    );
    currentVideo = next;
  };

  for (const [index, shot] of plan.shots.entries()) {
    const body = shot.placeholder === undefined
      ? windowChain(context, shot.video.body, shot.fit, gradeOf(shot), width, height, "shot_body")
      : placeholderChain(
        context,
        shot,
        shot.outputRange.startUs,
        shot.outputRange.endUs,
        width,
        height,
      );
    overlay(body, shot.outputRange.startUs, shot.outputRange.endUs);

    const transition = plan.transitions[index];
    if (transition !== undefined) {
      const segment = transitionWindowChain(
        context,
        transition,
        shot,
        plan.shots[index + 1]!,
        gradeOf,
        width,
        height,
      );
      if (segment !== null && "outputRange" in transition) {
        overlay(segment, transition.outputRange.startUs, transition.outputRange.endUs);
      }
    }
  }
  context.filters.push(`[${currentVideo}]format=yuv420p[video_out]`);

  const audioLabels: string[] = [];
  for (const shot of plan.shots) {
    if (shot.audio === undefined) continue;
    const slices = [
      ...shot.audio.media.inHandle,
      ...shot.audio.media.body,
      ...shot.audio.media.outHandle,
    ];
    if (slices.length === 0) continue;
    const parts: string[] = [];
    const members: string[] = [];
    for (const slice of slices) {
      const member = label(context, "shot_audio_part");
      const input = inputIndex.get(slice.path)!;
      const inputDurationUs = slice.fileRange.endUs - slice.fileRange.startUs;
      const outputDurationUs = slice.outputRange.endUs - slice.outputRange.startUs;
      parts.push(
        `[${inputSpecifier(input, slice.streamIndex)}]atrim=start=${seconds(slice.fileRange.startUs)}:end=${seconds(slice.fileRange.endUs)},asetpts=PTS-STARTPTS,aresample=48000,${atempo(inputDurationUs / outputDurationUs)},atrim=duration=${seconds(outputDurationUs)}[${member}]`,
      );
      members.push(member);
    }
    const joined = label(context, "shot_audio");
    parts.push(
      `${members.map(member => `[${member}]`).join("")}concat=n=${members.length}:v=0:a=1[${joined}]`,
    );
    // Handle regions crossfade inside each adjoining transition window; bodies
    // stay at the placement gain. The extended stream starts at the pre-roll.
    const extendedStartUs = shot.outputRange.startUs - shot.audio.media.inHandle.reduce(
      (total, slice) => total + (slice.outputRange.endUs - slice.outputRange.startUs),
      0,
    );
    const inHandleUs = shot.audio.media.inHandle.reduce(
      (total, slice) => total + (slice.outputRange.endUs - slice.outputRange.startUs),
      0,
    );
    const outHandleUs = shot.audio.media.outHandle.reduce(
      (total, slice) => total + (slice.outputRange.endUs - slice.outputRange.startUs),
      0,
    );
    const bodyEndUs = inHandleUs + (shot.outputRange.endUs - shot.outputRange.startUs);
    const shaped = label(context, "shot_audio_shaped");
    parts.push(
      `[${joined}]asetpts=PTS-STARTPTS${inHandleUs === 0 ? "" : `,afade=t=in:st=0:d=${seconds(inHandleUs)}`}${outHandleUs === 0 ? "" : `,afade=t=out:st=${seconds(bodyEndUs)}:d=${seconds(outHandleUs)}`},volume=${decimal(shot.audio.gainDb)}dB,aformat=channel_layouts=stereo${shot.audio.pan === 0 ? "" : `,stereotools=balance_out=${decimal(shot.audio.pan)}`}[${shaped}]`,
    );
    const delayed = label(context, "shot_audio_out");
    parts.push(`[${shaped}]${delayToOutput(extendedStartUs).join(",")}[${delayed}]`);
    context.filters.push(...parts);
    audioLabels.push(delayed);
  }

  const cueById = new Map<string, CinemaRenderPlanV1["audioCues"][number][]>();
  for (const cue of plan.audioCues) {
    const group = cueById.get(cue.cueId) ?? [];
    group.push(cue);
    cueById.set(cue.cueId, group);
  }
  for (const [cueId, slices] of [...cueById.entries()].sort((left, right) => (
    left[0].localeCompare(right[0])
  ))) {
    const ordered = [...slices].sort((left, right) => left.outputRange.startUs - right.outputRange.startUs);
    const parts: string[] = [];
    const members: string[] = [];
    for (const slice of ordered) {
      const member = label(context, "cue_part");
      const input = inputIndex.get(slice.path)!;
      parts.push(
        `[${inputSpecifier(input, slice.streamIndex)}]atrim=start=${seconds(slice.fileRange.startUs)}:end=${seconds(slice.fileRange.endUs)},asetpts=PTS-STARTPTS,aresample=48000,atrim=duration=${seconds(slice.outputRange.endUs - slice.outputRange.startUs)}[${member}]`,
      );
      members.push(member);
    }
    const first = ordered[0]!;
    const cueDurationUs = ordered.reduce(
      (total, slice) => total + (slice.outputRange.endUs - slice.outputRange.startUs),
      0,
    );
    const joined = label(context, `cue_${cueId.replaceAll(/[^a-zA-Z0-9_]/g, "_")}`);
    const fades = [
      first.fadeInUs === 0 ? "" : `,afade=t=in:st=0:d=${seconds(first.fadeInUs)}`,
      first.fadeOutUs === 0
        ? ""
        : `,afade=t=out:st=${seconds(cueDurationUs - first.fadeOutUs)}:d=${seconds(first.fadeOutUs)}`,
    ].join("");
    parts.push(
      `${members.map(member => `[${member}]`).join("")}concat=n=${members.length}:v=0:a=1,asetpts=PTS-STARTPTS${fades},volume=${decimal(first.gainDb)}dB,aformat=channel_layouts=stereo[${joined}]`,
    );
    const delayed = label(context, "cue_out");
    parts.push(`[${joined}]${delayToOutput(first.outputRange.startUs).join(",")}[${delayed}]`);
    context.filters.push(...parts);
    audioLabels.push(delayed);
  }

  context.filters.push(`anullsrc=r=48000:cl=stereo:d=${seconds(plan.output.durationUs)}[silence]`);
  context.filters.push(
    `[silence]${audioLabels.map(item => `[${item}]`).join("")}amix=inputs=${audioLabels.length + 1}:duration=longest:dropout_transition=0:normalize=0,atrim=duration=${seconds(plan.output.durationUs)}[audio_out]`,
  );

  const filterGraph = await materializeFilterScript({
    graph: context.filters.join(";"),
    relativeDirectory: options.workspaceDirectory === undefined
      ? "renders/.filter-graphs"
      : "filter-graphs",
    root: options.workspaceDirectory ?? projectRoot,
  });
  const arguments_: string[] = [
    "-hide_banner", "-nostdin", "-y",
    ...cinemaThreadArguments(recipe),
    ...inputArguments,
    "-filter_complex_script", filterGraph.path,
    "-map", "[video_out]",
    "-map", "[audio_out]",
    "-c:v", recipe.video.codec,
    ...cinemaEncoderArguments(recipe),
    "-pix_fmt", recipe.video.pixelFormat,
    "-c:a", recipe.audio.codec,
    "-t", seconds(plan.output.durationUs),
    "-movflags", recipe.container.movflags,
    output,
  ];
  const invocation = CinemaRenderInvocationSchema.parse({
    arguments: arguments_,
    executable: "ffmpeg",
    filterGraph: {
      bytes: filterGraph.bytes,
      path: filterGraph.repositoryPath,
      sha256: filterGraph.sha256,
    },
    outputPath: outputRelative,
    renderPlanSha256: plan.planSha256,
  });
  return {
    argv: [options.ffmpeg, ...arguments_],
    invocation,
    pinnedInputs,
  };
}

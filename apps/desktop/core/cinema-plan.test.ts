import { describe, expect, test } from "bun:test";

import {
  CinemaRenderPlanV1Schema,
  EditPlanIdSchema,
  ProjectCinemaPlanV1Schema,
  VideoProjectV1Schema,
  type ProjectCinemaPlanV1,
  type VideoProjectV1,
} from "../contracts";
import { canonicalJson, canonicalJsonSha256 } from "./canonical-json";
import {
  analyzeCinemaPlan,
  assertCinemaPlanComposition,
  auditCinemaContinuity,
  cinemaSequenceLayout,
  compileCinemaSequence,
  createCinemaPlanScaffold,
  hashCinemaPlanComposition,
} from "./cinema-plan";
import {
  createDefaultProjectEditPlan,
  hashProjectEditPlan,
} from "./project-plan";
import { compileProjectRenderPlan } from "./project-render-plan";

const HASH = "c".repeat(64);
const NOW = "2026-07-22T12:00:00.000Z";
const ASSET_DURATION_US = 12_000_000;

function cinemaProject(): VideoProjectV1 {
  const media = (streamIndex: number) => ({
    assetRange: { endUs: ASSET_DURATION_US, startUs: 0 },
    bytes: 4_096,
    codec: streamIndex === 0 ? "h264" : "aac",
    container: "mov" as const,
    fileRange: { endUs: ASSET_DURATION_US, startUs: 0 },
    path: "fixtures/cinema.mov",
    sha256: HASH,
    streamIndex,
  });
  return VideoProjectV1Schema.parse({
    analyses: [],
    assets: [{
      assetId: "asset_cinema00001",
      createdAt: NOW,
      durationUs: ASSET_DURATION_US,
      label: "Cinema media",
      role: "screen",
      source: {
        importedAt: NOW,
        kind: "imported",
        originalName: "cinema.mov",
        sourceSha256: HASH,
      },
      streams: [{
        frameRate: 30,
        kind: "video",
        label: "Cinema video",
        pixelHeight: 1_080,
        pixelWidth: 1_920,
        role: "screen",
        segments: [media(0)],
        streamId: "stream_cinema_video",
      }, {
        channels: 2,
        kind: "audio",
        label: "Cinema audio",
        role: "dialogue",
        sampleRateHz: 48_000,
        segments: [media(1)],
        streamId: "stream_cinema_audio",
      }],
    }],
    createdAt: NOW,
    currentEditPlanPath: "edits/current.json",
    kind: "slopcamera.video-project",
    name: "Cinema project",
    placements: [{
      assetId: "asset_cinema00001",
      assetRange: { endUs: ASSET_DURATION_US, startUs: 0 },
      audio: [{
        presentation: { enabled: true, gainDb: -6, pan: 0 },
        streamId: "stream_cinema_audio",
      }],
      enabled: true,
      placementId: "placement_cinema001",
      sync: {
        anchors: [
          { assetTimeUs: 0, projectTimeUs: 0 },
          { assetTimeUs: ASSET_DURATION_US, projectTimeUs: ASSET_DURATION_US },
        ],
        provenance: { kind: "identity" },
      },
      video: [{
        presentation: {
          blendMode: "normal",
          crop: { kind: "none" },
          enabled: true,
          fit: "contain",
          layer: 0,
          layout: { height: 1, kind: "normalized", width: 1, x: 0, y: 0 },
          opacity: 1,
        },
        streamId: "stream_cinema_video",
      }],
    }],
    projectId: "project_cinema0001",
    referencePlacementId: "placement_cinema001",
    schemaVersion: 1,
    timeline: { durationUs: ASSET_DURATION_US, timebase: "microseconds" },
    updatedAt: NOW,
  });
}

function editPlan(project: VideoProjectV1) {
  return createDefaultProjectEditPlan(
    project,
    EditPlanIdSchema.parse("plan_cinema000001"),
    NOW,
  );
}

function placementShot(
  shotId: string,
  range: { readonly endUs: number; readonly startUs: number },
  overrides: Record<string, unknown> = {},
) {
  return {
    handles: { postRollUs: 1_000_000, preRollUs: 1_000_000 },
    shotId,
    source: {
      kind: "placement",
      placementId: "placement_cinema001",
      range,
      streamId: "stream_cinema_video",
    },
    ...overrides,
  };
}

function hashedSidecar(body: Record<string, unknown>): ProjectCinemaPlanV1 {
  const cinemaPlanSha256 = canonicalJsonSha256(body);
  return ProjectCinemaPlanV1Schema.parse({ ...body, cinemaPlanSha256 });
}

function cinemaSidecar(
  shots: readonly Record<string, unknown>[],
  transitions: readonly Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): ProjectCinemaPlanV1 {
  const project = cinemaProject();
  const edit = editPlan(project);
  const structureSha256 = hashProjectEditPlan(edit) === ""
    ? ""
    : edit.projectStructureSha256;
  return hashedSidecar({
    audioCues: [],
    beats: [],
    createdAt: NOW,
    kind: "slopcamera.project-cinema-plan",
    looks: [],
    markers: [],
    planId: "cinema_00000001",
    projectEditPlanSha256: hashProjectEditPlan(edit),
    projectId: project.projectId,
    projectStructureSha256: structureSha256,
    schemaVersion: 1,
    shots,
    transitions,
    updatedAt: NOW,
    ...overrides,
  });
}

describe("cinema sidecar scaffold", () => {
  test("creates one deterministic placement shot per enabled video stream", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const scaffold = createCinemaPlanScaffold(project, edit, "cinema_scaffold01" as ProjectCinemaPlanV1["planId"], NOW);
    expect(scaffold.shots).toHaveLength(1);
    expect(scaffold.shots[0]!.source).toEqual({
      kind: "placement",
      placementId: "placement_cinema001",
      range: { endUs: ASSET_DURATION_US, startUs: 0 },
      streamId: "stream_cinema_video",
    });
    expect(scaffold.transitions).toEqual([]);
    expect(scaffold.cinemaPlanSha256).toBe(hashCinemaPlanComposition(scaffold));
    expect(() => assertCinemaPlanComposition(scaffold)).not.toThrow();
  });

  test("detects a tampered composition hash", () => {
    const project = cinemaProject();
    const scaffold = createCinemaPlanScaffold(
      project,
      editPlan(project),
      "cinema_scaffold02" as ProjectCinemaPlanV1["planId"],
      NOW,
    );
    const tampered = ProjectCinemaPlanV1Schema.parse({
      ...scaffold,
      cinemaPlanSha256: "d".repeat(64),
    });
    expect(() => assertCinemaPlanComposition(tampered)).toThrow(/hash mismatch/u);
  });
});

describe("cinema sequence compile", () => {
  test("is deterministic and tiles the output clock with transitions", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const cinema = cinemaSidecar(
      [
        placementShot("cshot_00000001", { endUs: 4_000_000, startUs: 1_000_000 }),
        placementShot("cshot_00000002", { endUs: 8_000_000, startUs: 5_000_000 }),
      ],
      [{ durationUs: 500_000, kind: "dissolve" }],
    );
    const first = compileCinemaSequence(cinema, project, edit);
    const second = compileCinemaSequence(cinema, project, edit);
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(first.planSha256).toBe(second.planSha256);
    expect(first.output.durationUs).toBe(3_000_000 + 3_000_000 + 500_000);
    expect(first.shots[0]!.outputRange).toEqual({ endUs: 3_000_000, startUs: 0 });
    expect(first.shots[1]!.outputRange).toEqual({ endUs: 6_500_000, startUs: 3_500_000 });
    const transition = first.transitions[0]!;
    expect(transition.kind).toBe("dissolve");
    if (transition.kind === "dissolve") {
      expect(transition.outputRange).toEqual({ endUs: 3_500_000, startUs: 3_000_000 });
    }
    // Handles resolve inside placement coverage on the project clock.
    expect(first.shots[0]!.video.outHandle[0]!.outputRange)
      .toEqual({ endUs: 3_500_000, startUs: 3_000_000 });
    expect(first.shots[0]!.video.outHandle[0]!.fileRange)
      .toEqual({ endUs: 4_500_000, startUs: 4_000_000 });
    expect(first.shots[1]!.video.inHandle[0]!.fileRange)
      .toEqual({ endUs: 5_000_000, startUs: 4_500_000 });
    // The placement audio presentation rides through the resolved shot.
    expect(first.shots[0]!.audio?.gainDb).toBe(-6);
    expect(first.shots[0]!.audio?.media.body).toHaveLength(1);
    expect(() => CinemaRenderPlanV1Schema.parse(first)).not.toThrow();
  });

  test("marks a sidecar stale when project structure or edit plan digests move", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const cinema = cinemaSidecar(
      [placementShot("cshot_00000001", { endUs: 2_000_000, startUs: 0 })],
      [],
    );
    const moved = VideoProjectV1Schema.parse({
      ...project,
      timeline: { durationUs: ASSET_DURATION_US + 1, timebase: "microseconds" },
    });
    const analysis = analyzeCinemaPlan(cinema, moved, edit);
    expect(analysis.findings.some(finding => finding.code === "stale-sidecar")).toBe(true);
    expect(analysis.layout).toBeNull();
    expect(() => compileCinemaSequence(cinema, moved, edit)).toThrow(/stale/u);
  });

  test("rejects transitions whose handles exceed the declared rolls", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const cinema = cinemaSidecar(
      [
        placementShot("cshot_00000001", { endUs: 3_000_000, startUs: 1_000_000 }),
        placementShot("cshot_00000002", { endUs: 8_000_000, startUs: 6_000_000 }, {
          handles: { postRollUs: 0, preRollUs: 0 },
        }),
      ],
      [{ durationUs: 1_000_000, kind: "dissolve" }],
    );
    const analysis = analyzeCinemaPlan(cinema, project, edit);
    expect(analysis.findings.some(
      finding => finding.code === "insufficient-handles" && finding.severity === "error",
    )).toBe(true);
    expect(() => compileCinemaSequence(cinema, project, edit))
      .toThrow(/insufficient-handles/u);
  });

  test("rejects placement windows that are not covered by project media", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const cinema = cinemaSidecar(
      [placementShot("cshot_00000001", { endUs: ASSET_DURATION_US + 2_000_000, startUs: 0 })],
      [],
    );
    const analysis = analyzeCinemaPlan(cinema, project, edit);
    expect(analysis.findings.some(
      finding => finding.code === "missing-media-coverage" && finding.severity === "error",
    )).toBe(true);
  });

  test("rejects spatial transition requests without a materialized clip", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const cinema = cinemaSidecar(
      [
        placementShot("cshot_00000001", { endUs: 3_000_000, startUs: 1_000_000 }),
        placementShot("cshot_00000002", { endUs: 8_000_000, startUs: 6_000_000 }),
      ],
      [{ durationUs: 500_000, kind: "spatial" }],
    );
    const analysis = analyzeCinemaPlan(cinema, project, edit);
    expect(analysis.findings.some(
      finding => finding.code === "transition-unresolved" && finding.severity === "error",
    )).toBe(true);
    expect(() => compileCinemaSequence(cinema, project, edit))
      .toThrow(/transition-unresolved/u);
  });

  test("holds placeholders only when explicitly allowed and audits them", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const spatialShot = {
      handles: { postRollUs: 0, preRollUs: 0 },
      shotId: "cshot_00000001",
      source: {
        kind: "spatial",
        requestSha256: HASH,
        sceneSha256: HASH,
        shotId: "shot_entry",
        shotSha256: HASH,
        sourceRange: { endUs: 2_000_000, startUs: 0 },
      },
    };
    const cinema = cinemaSidecar([spatialShot], []);
    expect(() => compileCinemaSequence(cinema, project, edit))
      .toThrow(/shot-media-missing/u);
    const analysis = analyzeCinemaPlan(cinema, project, edit);
    expect(analysis.findings.some(
      finding => finding.code === "shot-media-missing" && finding.severity === "warning",
    )).toBe(true);
    const plan = compileCinemaSequence(cinema, project, edit, { placeholders: "allow" });
    expect(plan.shots[0]!.placeholder).toEqual({
      color: plan.shots[0]!.placeholder!.color,
      reason: "missing-artifact",
    });
    expect(plan.shots[0]!.placeholder!.color).toMatch(/^#[a-f0-9]{6}$/u);
    expect(plan.advisories.some(advisory => advisory.code === "shot-placeholder")).toBe(true);
    const again = compileCinemaSequence(cinema, project, edit, { placeholders: "allow" });
    expect(again.shots[0]!.placeholder).toEqual(plan.shots[0]!.placeholder);
    expect(again.planSha256).toBe(plan.planSha256);
  });

  test("resolves audio cues on the cinema clock and bounds them to the sequence", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const cinema = cinemaSidecar(
      [placementShot("cshot_00000001", { endUs: 4_000_000, startUs: 1_000_000 })],
      [],
      {
        audioCues: [{
          assetId: "asset_cinema00001",
          assetRange: { endUs: 2_000_000, startUs: 0 },
          at: { kind: "shot", offsetUs: 500_000, shotId: "cshot_00000001" },
          cueId: "ccue_00000001",
          fadeInUs: 100_000,
          role: "music",
          streamId: "stream_cinema_audio",
        }],
      },
    );
    const plan = compileCinemaSequence(cinema, project, edit);
    expect(plan.audioCues).toHaveLength(1);
    expect(plan.audioCues[0]!.outputRange).toEqual({ endUs: 2_500_000, startUs: 500_000 });
    const overflowing = cinemaSidecar(
      [placementShot("cshot_00000001", { endUs: 2_000_000, startUs: 0 })],
      [],
      {
        audioCues: [{
          assetId: "asset_cinema00001",
          assetRange: { endUs: 3_000_000, startUs: 0 },
          at: { kind: "shot", offsetUs: 1_500_000, shotId: "cshot_00000001" },
          cueId: "ccue_00000002",
          role: "music",
          streamId: "stream_cinema_audio",
        }],
      },
    );
    const analysis = analyzeCinemaPlan(overflowing, project, edit);
    expect(analysis.findings.some(
      finding => finding.code === "cue-out-of-range" && finding.severity === "error",
    )).toBe(true);
  });
});

describe("cinema continuity audit", () => {
  test("reports deterministic geometric and timing findings only from declared evidence", () => {
    const project = cinemaProject();
    const cinema = cinemaSidecar(
      [
        placementShot("cshot_00000001", { endUs: 3_000_000, startUs: 1_000_000 }, {
          continuity: {
            cameraKey: "cam-a",
            exposureEv: 0,
            eyeline: "left",
            focusDistanceM: 1,
            screenDirection: "left",
          },
        }),
        placementShot("cshot_00000002", { endUs: 8_000_000, startUs: 6_000_000 }, {
          continuity: {
            cameraKey: "cam-a",
            exposureEv: 3,
            eyeline: "left",
            focusDistanceM: 9,
            screenDirection: "right",
          },
        }),
      ],
      [{ basis: "declared", kind: "match-cut" }],
    );
    const report = auditCinemaContinuity(cinema);
    const codes = report.findings.map(finding => finding.code);
    expect(codes).toContain("axis-crossing");
    expect(codes).toContain("eyeline-mismatch");
    expect(codes).toContain("exposure-jump");
    expect(codes).toContain("focus-jump");
    expect(codes).toContain("jump-cut");
    expect(codes).toContain("match-on-action");
    expect(report.findings.every(finding => finding.shotIds.length === 2)).toBe(true);
    const edit = editPlan(project);
    const plan = compileCinemaSequence(cinema, project, edit);
    expect(plan.advisories.some(advisory => advisory.code === "match-cut-declared")).toBe(true);
    const again = auditCinemaContinuity(cinema);
    expect(canonicalJson(again)).toBe(canonicalJson(report));
  });

  test("lays out shots and transition segments contiguously", () => {
    const cinema = cinemaSidecar(
      [
        placementShot("cshot_00000001", { endUs: 2_000_000, startUs: 0 }),
        placementShot("cshot_00000002", { endUs: 6_000_000, startUs: 3_000_000 }),
        placementShot("cshot_00000003", { endUs: 9_000_000, startUs: 7_000_000 }),
      ],
      [{ kind: "cut" }, { durationUs: 250_000, kind: "dissolve" }],
    );
    const layout = cinemaSequenceLayout(cinema);
    expect(layout.shots.map(shot => [shot.startUs, shot.endUs])).toEqual([
      [0, 2_000_000],
      [2_000_000, 5_000_000],
      [5_250_000, 7_250_000],
    ]);
    expect(layout.transitions).toEqual([{
      afterShotId: "cshot_00000003",
      beforeShotId: "cshot_00000002",
      durationUs: 250_000,
      endUs: 5_250_000,
      index: 1,
      startUs: 5_000_000,
    }]);
    expect(layout.durationUs).toBe(7_250_000);
  });
});

describe("project render regression", () => {
  test("keeps the project render plan byte-identical whether or not a cinema sidecar exists", () => {
    const project = cinemaProject();
    const edit = editPlan(project);
    const options = { frameRate: 30, pixelHeight: 1_080, pixelWidth: 1_920 };
    const withoutCinema = compileProjectRenderPlan(project, edit, options);
    // Authoring a sidecar must not perturb structure, edit-plan, or render identity.
    const cinema = createCinemaPlanScaffold(
      project,
      edit,
      "cinema_regress001" as ProjectCinemaPlanV1["planId"],
      NOW,
    );
    expect(cinema.projectStructureSha256).toBe(edit.projectStructureSha256);
    expect(cinema.projectEditPlanSha256).toBe(hashProjectEditPlan(edit));
    const withCinema = compileProjectRenderPlan(project, edit, options);
    expect(withCinema.planSha256).toBe(withoutCinema.planSha256);
    expect(canonicalJson(withCinema)).toBe(canonicalJson(withoutCinema));
  });
});

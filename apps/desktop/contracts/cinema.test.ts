import { describe, expect, test } from "bun:test";

import {
  CINEMA_LIMITS,
  CinemaContinuityReportSchema,
  CinemaRenderInvocationSchema,
  CinemaRenderPlanV1Schema,
  CinemaRenderReceiptV1Schema,
  ProjectCinemaPlanV1Schema,
} from "./cinema";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const NOW = "2026-07-22T12:00:00.000Z";

function shot(overrides: Record<string, unknown> = {}) {
  return {
    handles: { postRollUs: 0, preRollUs: 0 },
    shotId: "cshot_00000001",
    source: {
      kind: "placement",
      placementId: "placement_00000001",
      range: { endUs: 4_000_000, startUs: 0 },
      streamId: "stream_video000001",
    },
    ...overrides,
  };
}

function sidecar(overrides: Record<string, unknown> = {}) {
  return {
    audioCues: [],
    beats: [],
    cinemaPlanSha256: HASH,
    createdAt: NOW,
    kind: "slopcamera.project-cinema-plan",
    looks: [],
    markers: [],
    planId: "cinema_00000001",
    projectEditPlanSha256: OTHER_HASH,
    projectId: "project_00000001",
    projectStructureSha256: HASH,
    schemaVersion: 1,
    shots: [shot()],
    transitions: [],
    updatedAt: NOW,
    ...overrides,
  };
}

describe("project cinema sidecar schema", () => {
  test("parses a minimal plan and fills deterministic defaults", () => {
    const plan = ProjectCinemaPlanV1Schema.parse(sidecar());
    expect(plan.output).toEqual({
      background: "#000000ff",
      frameRate: 24,
      pixelHeight: 1_080,
      pixelWidth: 1_920,
    });
    expect(plan.shots[0]!.fit).toBe("contain");
    expect(plan.shots[0]!.handles).toEqual({ postRollUs: 0, preRollUs: 0 });
    expect(plan.audioCues).toEqual([]);
    expect(plan.transitions).toEqual([]);
  });

  test("requires exactly one transition per adjacent shot pair", () => {
    const twoShots = sidecar({
      shots: [
        shot(),
        shot({ shotId: "cshot_00000002" }),
      ],
      transitions: [],
    });
    expect(() => ProjectCinemaPlanV1Schema.parse(twoShots)).toThrow(/transition/u);
    const withCut = sidecar({
      shots: [
        shot(),
        shot({ shotId: "cshot_00000002" }),
      ],
      transitions: [{ kind: "cut" }],
    });
    expect(ProjectCinemaPlanV1Schema.parse(withCut).transitions).toHaveLength(1);
  });

  test("rejects duplicate shot identifiers and unknown look references", () => {
    expect(() => ProjectCinemaPlanV1Schema.parse(sidecar({
      shots: [shot(), shot()],
      transitions: [{ kind: "cut" }],
    }))).toThrow(/unique/u);
    expect(() => ProjectCinemaPlanV1Schema.parse(sidecar({
      shots: [shot({ lookId: "clook_00000001" })],
    }))).toThrow(/unknown look/u);
  });

  test("rejects anchors to unknown shots and cues whose fades exceed their span", () => {
    expect(() => ProjectCinemaPlanV1Schema.parse(sidecar({
      markers: [{
        anchor: { kind: "shot", offsetUs: 0, shotId: "cshot_99999999" },
        label: "missing",
        markerId: "cmark_00000001",
      }],
    }))).toThrow(/unknown shot/u);
    expect(() => ProjectCinemaPlanV1Schema.parse(sidecar({
      audioCues: [{
        assetId: "asset_00000001",
        assetRange: { endUs: 1_000_000, startUs: 0 },
        at: { kind: "sequence", offsetUs: 0 },
        cueId: "ccue_00000001",
        fadeInUs: 800_000,
        fadeOutUs: 800_000,
        role: "music",
        streamId: "stream_audio000001",
      }],
    }))).toThrow(/fades/u);
  });

  test("accepts every bounded transition shape and rejects free-form extras", () => {
    const transitions = [
      { kind: "cut" },
      { durationUs: 500_000, kind: "dissolve" },
      { direction: "left", durationUs: 250_000, kind: "wipe" },
      { color: "#102030", durationUs: 400_000, kind: "dip-to-color" },
      { blurSigma: 12, direction: "right", durationUs: 300_000, kind: "whip-pan" },
      { durationUs: 600_000, kind: "light-flash", peakHoldUs: 100_000 },
      { durationUs: 800_000, kind: "spatial" },
      { basis: "declared", kind: "match-cut" },
    ];
    for (const transition of transitions) {
      const plan = ProjectCinemaPlanV1Schema.parse(sidecar({
        shots: [shot(), shot({ shotId: "cshot_00000002" })],
        transitions: [transition],
      }));
      expect(plan.transitions).toHaveLength(1);
    }
    expect(() => ProjectCinemaPlanV1Schema.parse(sidecar({
      shots: [shot(), shot({ shotId: "cshot_00000002" })],
      transitions: [{ durationUs: 100_000, expression: "blur='sin(t)'", kind: "dissolve" }],
    }))).toThrow();
    expect(() => ProjectCinemaPlanV1Schema.parse(sidecar({
      shots: [shot(), shot({ shotId: "cshot_00000002" })],
      transitions: [{
        durationUs: CINEMA_LIMITS.transitionDurationUs + 1,
        kind: "dissolve",
      }],
    }))).toThrow();
  });

  test("rejects an updatedAt earlier than createdAt", () => {
    expect(() => ProjectCinemaPlanV1Schema.parse(sidecar({
      createdAt: "2026-07-22T13:00:00.000Z",
      updatedAt: NOW,
    }))).toThrow(/updatedAt/u);
  });
});

function resolvedSlice(outputStartUs: number, outputEndUs: number) {
  return {
    bytes: 1_024,
    fileRange: { endUs: outputEndUs - outputStartUs, startUs: 0 },
    outputRange: { endUs: outputEndUs, startUs: outputStartUs },
    path: "fixtures/media.mov",
    sha256: HASH,
    streamIndex: 0,
  };
}

function resolvedShot(startUs: number, durationUs: number, overrides: Record<string, unknown> = {}) {
  return {
    durationUs,
    fit: "contain",
    handles: { postRollUs: 0, preRollUs: 0 },
    outputRange: { endUs: startUs + durationUs, startUs },
    shotId: `cshot_0000000${startUs === 0 ? 1 : 2}`,
    sourceFrame: { pixelHeight: 1_080, pixelWidth: 1_920 },
    video: {
      body: [resolvedSlice(startUs, startUs + durationUs)],
      inHandle: [],
      outHandle: [],
    },
    ...overrides,
  };
}

function renderPlan(overrides: Record<string, unknown> = {}) {
  return {
    advisories: [],
    audioCues: [],
    cinemaPlanSha256: HASH,
    kind: "slopcamera.cinema-render-plan",
    looks: [],
    output: {
      background: "#000000ff",
      durationUs: 5_000_000,
      frameRate: 24,
      pixelHeight: 1_080,
      pixelWidth: 1_920,
    },
    planSha256: OTHER_HASH,
    projectEditPlanSha256: OTHER_HASH,
    projectId: "project_00000001",
    projectStructureSha256: HASH,
    schemaVersion: 1,
    shots: [resolvedShot(0, 5_000_000)],
    transitions: [],
    ...overrides,
  };
}

describe("cinema render plan schema", () => {
  test("requires shots and transitions to tile the output clock exactly", () => {
    const plan = CinemaRenderPlanV1Schema.parse(renderPlan());
    expect(plan.output.durationUs).toBe(5_000_000);
    expect(() => CinemaRenderPlanV1Schema.parse(renderPlan({
      output: {
        background: "#000000ff",
        durationUs: 5_500_000,
        frameRate: 24,
        pixelHeight: 1_080,
        pixelWidth: 1_920,
      },
    }))).toThrow(/tiled|duration/u);
  });

  test("accepts a resolved transition segment between two shots", () => {
    const plan = CinemaRenderPlanV1Schema.parse(renderPlan({
      output: {
        background: "#000000ff",
        durationUs: 9_000_000,
        frameRate: 24,
        pixelHeight: 1_080,
        pixelWidth: 1_920,
      },
      shots: [
        resolvedShot(0, 4_000_000),
        resolvedShot(5_000_000, 4_000_000),
      ],
      transitions: [{
        afterShotId: "cshot_00000002",
        beforeShotId: "cshot_00000001",
        durationUs: 1_000_000,
        kind: "dissolve",
        outputRange: { endUs: 5_000_000, startUs: 4_000_000 },
      }],
    }));
    expect(plan.transitions[0]!.kind).toBe("dissolve");
    expect(() => CinemaRenderPlanV1Schema.parse(renderPlan({
      output: {
        background: "#000000ff",
        durationUs: 9_000_000,
        frameRate: 24,
        pixelHeight: 1_080,
        pixelWidth: 1_920,
      },
      shots: [resolvedShot(0, 4_000_000), resolvedShot(5_000_000, 4_000_000)],
      transitions: [{
        afterShotId: "cshot_00000002",
        beforeShotId: "cshot_00000001",
        durationUs: 1_000_000,
        kind: "dissolve",
        outputRange: { endUs: 5_500_000, startUs: 4_000_000 },
      }],
    }))).toThrow(/contiguous|transition/u);
  });

  test("rejects slices that disagree about media integrity or exceed the output", () => {
    const clashing = resolvedShot(0, 5_000_000, {
      video: {
        body: [
          resolvedSlice(0, 2_500_000),
          { ...resolvedSlice(2_500_000, 5_000_000), sha256: OTHER_HASH },
        ],
        inHandle: [],
        outHandle: [],
      },
    });
    expect(() => CinemaRenderPlanV1Schema.parse(renderPlan({ shots: [clashing] })))
      .toThrow(/integrity/u);
    const overflowing = resolvedShot(0, 5_000_000, {
      audio: {
        gainDb: 0,
        media: {
          body: [{ ...resolvedSlice(0, 6_000_000), streamIndex: 1 }],
          inHandle: [],
          outHandle: [],
        },
        pan: 0,
      },
    });
    expect(() => CinemaRenderPlanV1Schema.parse(renderPlan({ shots: [overflowing] })))
      .toThrow(/exceeds|duration/u);
  });

  test("round-trips the invocation, receipt, and continuity report documents", () => {
    const invocation = CinemaRenderInvocationSchema.parse({
      arguments: ["-hide_banner", "-nostdin"],
      executable: "ffmpeg",
      filterGraph: { bytes: 128, path: "renders/.filter-graphs/x.ffgraph", sha256: HASH },
      outputPath: "renders/cinema/animatic.mp4",
      renderPlanSha256: OTHER_HASH,
    });
    expect(invocation.executable).toBe("ffmpeg");
    const receipt = CinemaRenderReceiptV1Schema.parse({
      cinemaPlanSha256: HASH,
      createdAt: NOW,
      kind: "slopcamera.cinema-render-receipt",
      output: { bytes: 4_096, path: "renders/cinema/animatic.mp4", sha256: HASH },
      placeholders: ["cshot_00000002"],
      plan: { path: "cinema/plans/plan.json", sha256: OTHER_HASH },
      projectId: "project_00000001",
      schemaVersion: 1,
      tier: "preview",
    });
    expect(receipt.placeholders).toEqual(["cshot_00000002"]);
    const report = CinemaContinuityReportSchema.parse({
      cinemaPlanSha256: HASH,
      findings: [{
        code: "axis-crossing",
        message: "Screen direction crosses the axis.",
        severity: "warning",
        shotIds: ["cshot_00000001", "cshot_00000002"],
        timeUs: 4_000_000,
        transitionIndex: 0,
      }],
      kind: "slopcamera.cinema-continuity-report",
      schemaVersion: 1,
    });
    expect(report.findings[0]!.code).toBe("axis-crossing");
    expect(() => CinemaContinuityReportSchema.parse({
      ...report,
      findings: [{ ...report.findings[0]!, shotIds: [] }],
    })).toThrow();
  });
});

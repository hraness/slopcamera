import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpatialSceneStarter, spatialSceneSha256, SpatialRenderPlanSchema, spatialRenderEffectsSha256, spatialRenderPlanSha256 } from "../../../src/spatial-scene";
import { spatialDirectionCompilationSha256 } from "../../../src/spatial-scene/direction-compile";
import { operationApplicationContext } from "../application/operations/test-support";
import { parseCliArgs } from "./args";
import { CliError } from "./errors";
import { executeSpatialSceneCommand } from "./spatial-scene-service";

async function fixture(run: (application: ReturnType<typeof operationApplicationContext>, root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-scene-direction-")));
  try {
    await run(operationApplicationContext(root), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

const direction = (sceneSha256: string): Record<string, unknown> => ({
  kind: "slopcamera.spatial-direction",
  schemaVersion: 1,
  entityId: "entity_product",
  projectDigest: sceneSha256,
  beats: [{ id: "beat_intro", startUs: 0, endUs: 4_000_000, intent: "Introduce the product", emotion: "calm" }],
  actions: [{ id: "act_turn", characterId: "entity_product", startUs: 0, endUs: 2_000_000, action: "turn" }],
  coverage: [{ id: "cov_orbit", startUs: 0, endUs: 2_000_000, rigKind: "orbit", framing: "medium", subjectId: "entity_product" }],
  looks: [{ id: "look_cold", startUs: 0, endUs: 4_000_000, lighting: "cool key", atmosphere: "clear" }],
});

const effectsDraft = (): Record<string, unknown> => ({
  renderPlan: {
    kind: "slopcamera.spatial-render-plan",
    schemaVersion: 1,
    quality: {
      outputBytes: 8_000_000, particleCount: 0, pixelBudget: 640 * 480,
      simulationSteps: 0, texturePixelBudget: 1_000_000, tier: "final",
    },
    postProcess: {
      kind: "slopcamera.spatial-post-process", schemaVersion: 1,
      steps: [{ kind: "tone-map", exposure: 1, whitePoint: 4 }],
    },
  },
});

const simulationPlan = (): Record<string, unknown> => ({
  bodies: [{
    entityId: "entity_product",
    friction: 0.1,
    id: "body_01",
    initialAngularVelocity: [0, 0, 0],
    initialOrientation: [0, 0, 0, 1],
    initialPosition: [0, 1, 0],
    initialVelocity: [0, 0, 0],
    mass: 1,
    restitution: 0.5,
    shape: { kind: "sphere", radius: 0.5 },
  }],
  cacheId: "cache_00000001",
  constraints: [],
  engine: { identitySha256: "1".repeat(64), profile: "slopcamera-rigid-body-reference-v1" },
  entityId: "entity_product",
  gravity: [0, -9.8, 0],
  kind: "slopcamera.spatial-simulation-plan",
  maxSubsteps: 4,
  schemaVersion: 1,
  seed: 1,
  sourceDigest: "2".repeat(64),
  stepCount: 4,
  timeStepUs: 250_000,
});

describe("direction, effects, and temporal CLI parsing", () => {
  test("parses scene direction check|plan|gallery", () => {
    expect(parseCliArgs(["scene", "direction", "check", "direction.json", "--scene", "scene.json", "--json"]))
      .toMatchObject({ kind: "spatial-scene", action: "direction-check", direction: "direction.json", scene: "scene.json", json: true });
    expect(parseCliArgs(["scene", "direction", "plan", "direction.json", "--scene", "scene.json", "--camera", "camera_hero", "--output", "compiled.json"]))
      .toMatchObject({ action: "direction-plan", camera: "camera_hero", output: "compiled.json" });
    expect(parseCliArgs(["scene", "direction", "gallery", "direction.json", "--scene", "scene.json", "--axis", "lighting"]))
      .toMatchObject({ action: "direction-gallery", axis: "lighting" });
    expect(() => parseCliArgs(["scene", "direction", "check", "direction.json"])).toThrow("--scene");
    expect(() => parseCliArgs(["scene", "direction", "gallery", "direction.json", "--scene", "scene.json"])).toThrow("--axis");
    expect(() => parseCliArgs(["scene", "direction", "bogus", "direction.json", "--scene", "scene.json"])).toThrow("Usage");
  });

  test("parses scene effects check|plan|bake", () => {
    expect(parseCliArgs(["scene", "effects", "check", "effects.json", "--scene", "scene.json"]))
      .toMatchObject({ kind: "spatial-scene", action: "effects-check", effects: "effects.json", scene: "scene.json" });
    expect(parseCliArgs(["scene", "effects", "plan", "draft.json", "--scene", "scene.json", "--output", "effects.json"]))
      .toMatchObject({ action: "effects-plan", draft: "draft.json", output: "effects.json" });
    expect(parseCliArgs(["scene", "effects", "bake", "sim.json", "--scene", "scene.json", "--output", "bake.json"]))
      .toMatchObject({ action: "effects-bake", simulation: "sim.json", output: "bake.json" });
    expect(() => parseCliArgs(["scene", "effects", "bake", "sim.json", "--scene", "scene.json"])).toThrow("--output");
    expect(() => parseCliArgs(["scene", "effects", "bogus", "x.json", "--scene", "scene.json"])).toThrow("Usage");
  });

  test("parses scene temporal-audit with bounded lists", () => {
    expect(parseCliArgs(["scene", "temporal-audit", "scene.json", "--camera", "camera_hero", "--times-us", "0,500000", "--cut-before-us", "1000000", "--contacts", "contacts.json", "--json"]))
      .toMatchObject({
        kind: "spatial-scene", action: "temporal-audit", camera: "camera_hero",
        timesUs: [0, 500_000], cutBeforeUs: [1_000_000], contacts: "contacts.json", json: true,
      });
    expect(() => parseCliArgs(["scene", "temporal-audit", "scene.json"])).toThrow("--camera");
    expect(() => parseCliArgs(["scene", "temporal-audit", "scene.json", "--camera", "camera_hero", "--times-us", "0,x"])).toThrow("--times-us");
    expect(() => parseCliArgs(["scene", "temporal-audit", "scene.json", "--camera", "camera_hero", "--times-us", Array.from({ length: 65 }, () => "0").join(",")])).toThrow("bounded");
  });

  test("parses project cinema audit and gallery", () => {
    expect(parseCliArgs(["project", "cinema", "audit", "project_example001", "--json"]))
      .toMatchObject({ kind: "project-cinema", action: "audit", project: "project_example001" });
    expect(parseCliArgs(["project", "cinema", "gallery", "project_example001", "--axis", "pacing", "--output", "cinema/galleries/g.json"]))
      .toMatchObject({ action: "gallery", axis: "pacing", output: "cinema/galleries/g.json" });
    expect(() => parseCliArgs(["project", "cinema", "gallery", "project_example001"])).toThrow("--axis");
    expect(() => parseCliArgs(["project", "cinema", "audit", "project_example001", "--axis", "pacing"])).toThrow("--axis");
    expect(() => parseCliArgs(["project", "cinema", "audit", "project_example001", "--output", "x.json"])).toThrow("--output");
    expect(() => parseCliArgs(["project", "cinema", "gallery", "project_example001", "--axis", "pacing", "--dry-run"])).toThrow("--dry-run");
  });
});

describe("scene direction commands", () => {
  test("direction check reports errors for stale digests and passes a bound direction", async () => await fixture(async (application, root) => {
    const scene = createSpatialSceneStarter();
    await writeFile(join(root, "scene.json"), JSON.stringify(scene));
    const bound = direction(spatialSceneSha256(scene));
    await writeFile(join(root, "direction.json"), JSON.stringify(bound));
    const stale = direction("0".repeat(64));
    await writeFile(join(root, "stale.json"), JSON.stringify(stale));

    const ok = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "direction-check", direction: "direction.json", scene: "scene.json", json: true,
    }) as { counts: { errors: number }; sceneSha256: string };
    expect(ok.counts.errors).toBe(0);
    expect(ok.sceneSha256).toBe(spatialSceneSha256(scene));

    const bad = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "direction-check", direction: "stale.json", scene: "scene.json", json: false,
    }) as { counts: { errors: number }; findings: readonly { code: string }[] };
    expect(bad.counts.errors).toBeGreaterThan(0);
    expect(bad.findings.some(finding => finding.code === "stale-digest")).toBe(true);
  }));

  test("direction plan emits unverified proposals and publishes the compilation", async () => await fixture(async (application, root) => {
    const scene = createSpatialSceneStarter();
    await writeFile(join(root, "scene.json"), JSON.stringify(scene));
    await writeFile(join(root, "direction.json"), JSON.stringify(direction(spatialSceneSha256(scene))));

    const compiled = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "direction-plan", direction: "direction.json", scene: "scene.json", json: true,
    }) as { verified: boolean; proposals: { shots: readonly unknown[]; cameraRigs: readonly unknown[] } };
    expect(compiled.verified).toBe(false);
    expect(compiled.proposals.shots.length).toBeGreaterThan(0);
    expect(compiled.proposals.cameraRigs.length).toBeGreaterThan(0);

    const published = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "direction-plan", direction: "direction.json", scene: "scene.json",
      output: "compiled.json", json: false,
    }) as { path: string; compilationSha256: string };
    const written = JSON.parse(await readFile(published.path, "utf8")) as Record<string, unknown>;
    expect(published.compilationSha256).toBe(spatialDirectionCompilationSha256(written as never));
    await expect(executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "direction-plan", direction: "direction.json", scene: "scene.json",
      output: "compiled.json", json: false,
    })).rejects.toBeInstanceOf(CliError);
  }));

  test("direction gallery returns separate candidates and never selects", async () => await fixture(async (application, root) => {
    const scene = createSpatialSceneStarter();
    await writeFile(join(root, "scene.json"), JSON.stringify(scene));
    await writeFile(join(root, "direction.json"), JSON.stringify(direction(spatialSceneSha256(scene))));

    const plan = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "direction-gallery", direction: "direction.json", scene: "scene.json",
      axis: "lighting", json: true,
    }) as { axis: string; candidates: readonly { documentSha256: string }[]; selection?: unknown };
    expect(plan.axis).toBe("lighting");
    expect(plan.candidates.length).toBeGreaterThan(1);
    expect(plan).not.toHaveProperty("selection");
    expect(new Set(plan.candidates.map(candidate => candidate.documentSha256)).size).toBe(plan.candidates.length);
  }));
});

describe("scene effects commands", () => {
  test("effects plan binds the actual scene digest and effects check validates it", async () => await fixture(async (application, root) => {
    const scene = createSpatialSceneStarter();
    await writeFile(join(root, "scene.json"), JSON.stringify(scene));
    await writeFile(join(root, "draft.json"), JSON.stringify(effectsDraft()));

    const bound = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "effects-plan", draft: "draft.json", scene: "scene.json",
      output: "effects.json", json: true,
    }) as { path: string; documentSha256: string };
    expect(bound.documentSha256).toMatch(/^[a-f0-9]{64}$/u);
    const written = JSON.parse(await readFile(bound.path, "utf8")) as { document: { sceneSha256: string } };
    expect(written.document.sceneSha256).toBe(spatialSceneSha256(scene));

    const report = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "effects-check", effects: "effects.json", scene: "scene.json", json: true,
    }) as { counts: { errors: number }; documentSha256: string };
    expect(report.counts.errors).toBe(0);
    expect(report.documentSha256).toBe(bound.documentSha256);
  }));

  test("effects check reports stale scene bindings and effects bake runs the reference integrator", async () => await fixture(async (application, root) => {
    const scene = createSpatialSceneStarter();
    await writeFile(join(root, "scene.json"), JSON.stringify(scene));
    const staleDocument = {
      kind: "slopcamera.spatial-render-effects",
      schemaVersion: 1,
      sceneSha256: "0".repeat(64),
      renderPlan: SpatialRenderPlanSchema.parse(effectsDraft().renderPlan),
      renderPlanSha256: spatialRenderPlanSha256(SpatialRenderPlanSchema.parse(effectsDraft().renderPlan)),
      particleSystems: [],
      simulationBakes: [],
    };
    const staleBinding = { document: staleDocument, documentSha256: spatialRenderEffectsSha256(staleDocument as never) };
    await writeFile(join(root, "stale-effects.json"), JSON.stringify(staleBinding));
    const report = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "effects-check", effects: "stale-effects.json", scene: "scene.json", json: true,
    }) as { counts: { errors: number }; findings: readonly { code: string }[] };
    expect(report.counts.errors).toBeGreaterThan(0);
    expect(report.findings.some(finding => finding.code === "stale-scene")).toBe(true);

    await writeFile(join(root, "sim.json"), JSON.stringify(simulationPlan()));
    const baked = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "effects-bake", simulation: "sim.json", scene: "scene.json",
      output: "bake.json", json: true,
    }) as { path: string; documentSha256: string; receipt: { stepCount: number } };
    expect(baked.documentSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(baked.receipt.stepCount).toBe(4);
    const written = JSON.parse(await readFile(baked.path, "utf8")) as { channels: readonly { keys: readonly { timeUs: number }[] }[] };
    expect(written.channels[0]!.keys).toHaveLength(4);
  }));
});

describe("scene temporal-audit", () => {
  test("evaluates bounded samples and reports deterministic findings", async () => await fixture(async (application, root) => {
    const scene = createSpatialSceneStarter();
    await writeFile(join(root, "scene.json"), JSON.stringify(scene));

    const report = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "temporal-audit", path: "scene.json", camera: "camera_hero",
      timesUs: [0, 2_000_000, 4_000_000], json: true,
    }) as { sampleCount: number; findings: readonly { kind: string }[]; reportSha256: string };
    expect(report.sampleCount).toBe(3);
    expect(report.reportSha256).toMatch(/^[a-f0-9]{64}$/u);

    const defaulted = await executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "temporal-audit", path: "scene.json", camera: "camera_hero", json: false,
    }) as { sampleCount: number; firstTimeUs: number; lastTimeUs: number };
    expect(defaulted.sampleCount).toBeGreaterThanOrEqual(2);
    expect(defaulted.firstTimeUs).toBe(0);
    expect(defaulted.lastTimeUs).toBe(4_000_000);

    await expect(executeSpatialSceneCommand(application, {
      kind: "spatial-scene", action: "temporal-audit", path: "scene.json", camera: "camera_missing", json: false,
    })).rejects.toBeInstanceOf(CliError);
  }));
});

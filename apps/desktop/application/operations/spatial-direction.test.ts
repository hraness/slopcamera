import { describe, expect, test } from "bun:test";

import { createSpatialSceneStarter } from "../../../../src/spatial-scene/authoring";
import { spatialSceneSha256 } from "../../../../src/spatial-scene/index";
import type { SpatialDirectionCompilation, SpatialDirectionCheckReport, SpatialEffectsCheckReport, SpatialGalleryPlan, SpatialRenderEffectsBinding, SpatialTemporalAuditReport } from "../../../../src/spatial-scene/index";
import { createApplicationOperationRegistry } from "../default-registry";
import { operationApplicationContext } from "./test-support";

const registry = createApplicationOperationRegistry();
const context = { application: operationApplicationContext("/tmp/slopcamera-scene-planning-unused"), abortSignal: new AbortController().signal };

const direction = (digest: string) => ({
  kind: "slopcamera.spatial-direction", schemaVersion: 1,
  entityId: "product",
  projectDigest: digest,
  beats: [{ id: "beat_spin", startUs: 0, endUs: 4_000_000, intent: "Product turns to face the camera.", emotion: "confident" }],
  actions: [{ id: "action_turn", characterId: "product", startUs: 0, endUs: 4_000_000, action: "turn" }],
  coverage: [{ id: "coverage_orbit", startUs: 0, endUs: 4_000_000, rigKind: "orbit", framing: "medium", subjectId: "product" }],
  looks: [{ id: "look_studio", startUs: 0, endUs: 4_000_000, lighting: "soft studio key", atmosphere: "clean product stage" }],
});

const renderPlan = {
  kind: "slopcamera.spatial-render-plan", schemaVersion: 1,
  postProcess: {
              kind: "slopcamera.spatial-post-process", schemaVersion: 1,
              steps: [{ exposure: 0, kind: "tone-map", whitePoint: 1 }],
            },
  quality: {
    outputBytes: 8_000_000, particleCount: 0, pixelBudget: 2_073_600,
    simulationSteps: 0, texturePixelBudget: 2_073_600, tier: "preview",
  },
};

describe("scene planning operations", () => {
  test("register six pure operations with complete JSON schemas", () => {
    for (const kind of [
      "scene.direction.check",
      "scene.direction.compile",
      "scene.direction.gallery",
      "scene.effects.check",
      "scene.effects.plan",
      "scene.temporal-audit",
    ] as const) {
      const description = registry.describe(kind, 1);
      expect(description.inputJsonSchema.type).toBe("object");
      expect(description.policy.effect).toBe("pure");
      expect(description.inputSchemaId).toBe(`slopcamera.operation.${kind}.input/v1`);
      expect(description.outputSchemaId).toBe(`slopcamera.operation.${kind}.output/v1`);
    }
  });

  test("check and compile direction against the admitted scene without applying it", async () => {
    const scene = createSpatialSceneStarter();
    const input = { direction: direction(spatialSceneSha256(scene)), scene };
    const check = await registry.execute(context, { kind: "scene.direction.check", version: 1, input });
    const checkReport = check.output as SpatialDirectionCheckReport;
    expect(checkReport.counts.errors).toBe(0);
    expect(checkReport.directionSha256).toMatch(/^[a-f0-9]{64}$/u);
    const compile = await registry.execute(context, {
      kind: "scene.direction.compile", version: 1,
      input: { ...input, cameraId: "camera_hero" },
    });
    const compilation = compile.output as SpatialDirectionCompilation;
    expect(compilation.verified).toBe(false);
    expect(compilation.sceneSha256).toBe(spatialSceneSha256(scene));
    expect(compilation.proposals.shots.length).toBeGreaterThan(0);
    expect(compile.summary.fields.unresolved).toBe(compilation.unresolvedIntents.length);
  });

  test("plan a bounded gallery that never selects a candidate", async () => {
    const scene = createSpatialSceneStarter();
    const output = await registry.execute(context, {
      kind: "scene.direction.gallery", version: 1,
      input: { axis: "camera", direction: direction(spatialSceneSha256(scene)), scene },
    });
    const plan = output.output as SpatialGalleryPlan;
    expect(plan.axis).toBe("camera");
    expect(plan.candidates.length).toBeGreaterThan(0);
    expect(plan.candidates.length).toBeLessThanOrEqual(6);
    expect(plan.selection).toBeUndefined();
    expect(plan.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("plan an integrity-bound effects document and check it against the scene", async () => {
    const scene = createSpatialSceneStarter();
    const planned = await registry.execute(context, {
      kind: "scene.effects.plan", version: 1,
      input: { particleSystems: [], renderPlan, scene, simulationBakes: [] },
    });
    const binding = planned.output as SpatialRenderEffectsBinding;
    expect(binding.documentSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(binding.document.sceneSha256).toBe(spatialSceneSha256(scene));
    const checked = await registry.execute(context, {
      kind: "scene.effects.check", version: 1,
      input: { effects: binding, scene },
    });
    const report = checked.output as SpatialEffectsCheckReport;
    expect(report.counts.errors).toBe(0);
    expect(report.sceneSha256).toBe(spatialSceneSha256(scene));
  });

  test("audit sampled temporal evidence deterministically", async () => {
    const scene = createSpatialSceneStarter();
    const output = await registry.execute(context, {
      kind: "scene.temporal-audit", version: 1,
      input: { cameraId: "camera_hero", scene, timesUs: [0, 1_000_000, 2_000_000, 3_000_000] },
    });
    const report = output.output as SpatialTemporalAuditReport;
    expect(report.sampleCount).toBe(4);
    expect(report.sceneSha256).toBe(spatialSceneSha256(scene));
    expect(report.cameraId).toBe("camera_hero");
    const again = await registry.execute(context, {
      kind: "scene.temporal-audit", version: 1,
      input: { cameraId: "camera_hero", scene, timesUs: [0, 1_000_000, 2_000_000, 3_000_000] },
    });
    expect(again.output).toEqual(report);
  });

  test("reject malformed input before executing the pure kernel", async () => {
    const scene = createSpatialSceneStarter();
    await expect(registry.execute(context, {
      kind: "scene.direction.check", version: 1,
      input: { direction: { kind: "wrong" }, scene },
    })).rejects.toThrow();
    await expect(registry.execute(context, {
      kind: "scene.temporal-audit", version: 1,
      input: { cameraId: "camera_hero", scene, timesUs: [0] },
    })).rejects.toThrow();
    await expect(registry.execute(context, {
      kind: "scene.direction.gallery", version: 1,
      input: { axis: "unknown-axis", direction: direction(spatialSceneSha256(scene)), scene },
    })).rejects.toThrow();
  });
});

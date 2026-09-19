import { describe, expect, test } from "bun:test";

import { createSpatialSceneStarter } from "../../../../src/spatial-scene/authoring";
import { behaviorOrganismSha256, type SpatialBehaviorOrganism } from "../../../../src/spatial-scene/behavior";
import type { SpatialBehaviorBake, SpatialBehaviorCheckReport, SpatialBehaviorGalleryPlan } from "../../../../src/spatial-scene/index";
import { spatialSceneSha256 } from "../../../../src/spatial-scene/index";
import { createApplicationOperationRegistry } from "../default-registry";
import { operationApplicationContext } from "./test-support";

const registry = createApplicationOperationRegistry();
const context = { application: operationApplicationContext("/tmp/slopcamera-scene-behavior-unused"), abortSignal: new AbortController().signal };

const emitOrganism: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:emit-window",
  name: "Emit window",
  cells: [
    { id: "in", kind: "input", outputs: { win: { type: "json" } } },
    {
      id: "cfg", kind: "const",
      outputs: {
        channel: { type: "text", value: "alert" },
        value: { type: "json", value: "ping" },
      },
    },
    { id: "emit", kind: "fn", fn: "channel.emit.v1" },
  ],
  edges: [
    { from: { cell: "in", port: "win" }, to: { cell: "emit", port: "window" } },
    { from: { cell: "cfg", port: "channel" }, to: { cell: "emit", port: "channel" } },
    { from: { cell: "cfg", port: "value" }, to: { cell: "emit", port: "value" } },
  ],
  interface: {
    inputs: { win: { cell: "in", port: "win" } },
    outputs: { out: { cell: "emit", port: "emitted" } },
  },
};

const EMIT_DIGEST = behaviorOrganismSha256(emitOrganism);

const behavior = (sceneSha256: string) => ({
  kind: "slopcamera.spatial-behavior", schemaVersion: 1,
  behaviorId: "behavior_alert",
  entityId: "entity_product",
  sceneSha256,
  seed: 7,
  rangeUs: { startUs: 0, endUs: 1_000_000 },
  organisms: { [EMIT_DIGEST]: emitOrganism },
  entry: EMIT_DIGEST,
  channels: ["alert"],
  args: { win: { ticks: [{ tUs: 0 }, { tUs: 500_000 }] } },
});

describe("scene behavior operations", () => {
  test("register three pure operations with complete JSON schemas", () => {
    for (const kind of [
      "scene.behavior.check",
      "scene.behavior.bake",
      "scene.behavior.gallery",
    ] as const) {
      const description = registry.describe(kind, 1);
      expect(description.inputJsonSchema.type).toBe("object");
      expect(description.policy.effect).toBe("pure");
      expect(description.inputSchemaId).toBe(`slopcamera.operation.${kind}.input/v1`);
      expect(description.outputSchemaId).toBe(`slopcamera.operation.${kind}.output/v1`);
    }
  });

  test("check a behavior closure against the admitted scene", async () => {
    const scene = createSpatialSceneStarter();
    const check = await registry.execute(context, {
      kind: "scene.behavior.check", version: 1,
      input: { behavior: behavior(spatialSceneSha256(scene)), scene },
    });
    const report = check.output as SpatialBehaviorCheckReport;
    expect(report.counts.errors).toBe(0);
    expect(report.behaviorSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(report.sceneSha256).toBe(spatialSceneSha256(scene));
  });

  test("bake a behavior through the pinned algal runtime with a bound receipt", async () => {
    const scene = createSpatialSceneStarter();
    const bake = await registry.execute(context, {
      kind: "scene.behavior.bake", version: 1,
      input: { behavior: behavior(spatialSceneSha256(scene)), scene },
    });
    const artifact = bake.output as SpatialBehaviorBake;
    expect(artifact.emitted).toEqual([
      { tUs: 0, channel: "alert", value: "ping" },
      { tUs: 500_000, channel: "alert", value: "ping" },
    ]);
    expect(artifact.receipt.runDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(artifact.receipt.fnCatalogSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(bake.summary.fields.emitted).toBe(2);
    const again = await registry.execute(context, {
      kind: "scene.behavior.bake", version: 1,
      input: { behavior: behavior(spatialSceneSha256(scene)), scene },
    });
    expect(again.output).toEqual(artifact);
  });

  test("plan a bounded seeded gallery that never selects a candidate", async () => {
    const scene = createSpatialSceneStarter();
    const output = await registry.execute(context, {
      kind: "scene.behavior.gallery", version: 1,
      input: { behavior: behavior(spatialSceneSha256(scene)), scene },
    });
    const plan = output.output as SpatialBehaviorGalleryPlan;
    expect(plan.behaviorSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(plan.candidates.length).toBeGreaterThanOrEqual(1);
    expect(plan.candidates.length).toBeLessThanOrEqual(6);
    // The organism ignores the document seed — every variant emits the same
    // trace, so candidates honestly collapse to one.
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.documentKind).toBe("slopcamera.spatial-behavior-bake");
    expect(plan).not.toHaveProperty("selection");
  });

  test("reject malformed input before executing the pure kernel", async () => {
    const scene = createSpatialSceneStarter();
    await expect(registry.execute(context, {
      kind: "scene.behavior.check", version: 1,
      input: { behavior: { kind: "wrong" }, scene },
    })).rejects.toThrow();
    await expect(registry.execute(context, {
      kind: "scene.behavior.bake", version: 1,
      input: { behavior: behavior(spatialSceneSha256(scene)), channelMap: { bogus: 1 }, scene },
    })).rejects.toThrow();
  });
});

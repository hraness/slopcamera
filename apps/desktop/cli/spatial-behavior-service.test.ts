import { expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpatialSceneStarter } from "../../../src/spatial-scene/authoring";
import { checkSpatialBehavior } from "../../../src/spatial-scene/behavior";
import { auditSpatialBehaviorTrace } from "../../../src/spatial-scene/behavior-audit";
import { bakeSpatialBehavior } from "../../../src/spatial-scene/behavior-bake";
import { spatialBehaviorFnSignatures } from "../../../src/spatial-scene/behavior-fns";
import { planSpatialBehaviorGallery } from "../../../src/spatial-scene/behavior-gallery";
import { SPATIAL_BEHAVIOR_STDLIB_INTERACT } from "../../../src/spatial-scene/behavior-stdlib";
import { spatialSceneSha256 } from "../../../src/spatial-scene/identity";
import { operationApplicationContext } from "../application/operations/test-support";
import { executeSpatialSceneCommand } from "./spatial-scene-service";

test("behavior SDK and CLI agree for a saved scene with unsorted entities", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-behavior-identity-")));
  try {
    const starter = createSpatialSceneStarter();
    const scene = {
      ...starter,
      entities: ["entity_product", "entity_pedestal"].map(id => starter.entities.find(entity => entity.entityId === id)!),
    };
    const behavior = {
      kind: "slopcamera.spatial-behavior", schemaVersion: 1, behaviorId: "behavior_identity",
      entityId: "entity_product", sceneSha256: spatialSceneSha256(scene), seed: 42,
      rangeUs: { startUs: 0, endUs: 100_000 },
      organisms: SPATIAL_BEHAVIOR_STDLIB_INTERACT.organisms, entry: SPATIAL_BEHAVIOR_STDLIB_INTERACT.entry,
      channels: ["interact", "interact.phase"],
      args: {
        state: { phaseIndex: 0, enteredUs: 0 },
        spec: { channel: "interact", phases: [{ name: "notice", minUs: 100_000 }] },
        win: { ticks: [{ tUs: 0 }, { tUs: 100_000 }] },
      },
    };
    await writeFile(join(root, "scene.json"), JSON.stringify(scene));
    await writeFile(join(root, "behavior.json"), JSON.stringify(behavior));
    const application = operationApplicationContext(root);
    const common = { kind: "spatial-scene", behavior: "behavior.json", scene: "scene.json", json: true } as const;
    const check = checkSpatialBehavior({ behavior, scene }, spatialBehaviorFnSignatures());
    expect(check.counts.errors).toBe(0);
    expect(await executeSpatialSceneCommand(application, { ...common, action: "behavior-check" })).toEqual(check);
    const { bake } = await bakeSpatialBehavior({ behavior, scene });
    const published = await executeSpatialSceneCommand(application, { ...common, action: "behavior-bake", output: "bake.json" });
    expect(published).toMatchObject({ receipt: bake.receipt });
    expect(JSON.parse(await readFile(join(root, "bake.json"), "utf8"))).toEqual(bake);
    expect(await executeSpatialSceneCommand(application, { ...common, action: "behavior-gallery" }))
      .toEqual(await planSpatialBehaviorGallery({ behavior, scene }));
    const audit = auditSpatialBehaviorTrace({
      behaviorSha256: bake.behaviorSha256, emittedSha256: bake.receipt.emittedSha256,
      emitted: bake.emitted, rangeUs: bake.rangeUs,
    });
    const auditCommand = { kind: "spatial-scene", action: "behavior-audit", bake: "bake.json", json: true } as const;
    expect(await executeSpatialSceneCommand(application, auditCommand)).toEqual(audit);
    expect(await executeSpatialSceneCommand(application, { ...auditCommand, output: "audit.json" })).toMatchObject({
      findings: audit.findings.length, channels: audit.channelCount, emitted: audit.emittedCount,
    });
    expect(JSON.parse(await readFile(join(root, "audit.json"), "utf8"))).toEqual(audit);
    expect(JSON.parse(await readFile(join(root, "bake.json"), "utf8"))).toEqual(bake);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

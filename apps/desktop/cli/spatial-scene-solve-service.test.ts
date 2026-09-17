import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpatialSceneStarter, onTopOf, parseSpatialValue, SpatialScenePatchV1Schema } from "../../../src/spatial-scene";
import { SPATIAL_SOLVE_PENDING_SCENE_SHA256 } from "../../../src/spatial-scene/solve";
import type { ApplicationContext } from "../application/context";
import { operationApplicationContext } from "../application/operations/test-support";
import { executeSpatialSceneCommand } from "./spatial-scene-service";

/** A mutable JSON copy of the starter scene; tests mutate fixtures freely. */
const authored = JSON.parse(JSON.stringify(createSpatialSceneStarter())) as {
  entities: Array<Record<string, unknown>>;
  cameras: Array<Record<string, unknown>>;
  animations: unknown[];
  overrides: unknown[];
  [key: string]: unknown;
};
/** The starter animates entity_product's rotation; solver fixtures drop that channel. */
const scene = { ...authored, animations: [] };

const productBounds = { min: [-0.7, -0.7, -0.7], max: [0.7, 0.7, 0.7] } as const;
const pedestalBounds = { min: [-1.15, -0.175, -1.15], max: [1.15, 0.175, 1.15] } as const;

async function fixture(goals: unknown, run: (application: ApplicationContext, root: string) => Promise<void>, source: unknown = scene): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-solve-")));
  try {
    await writeFile(join(root, "scene.json"), JSON.stringify(source));
    await writeFile(join(root, "goals.json"), JSON.stringify(goals));
    await run(operationApplicationContext(root), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

const solve = { kind: "spatial-scene", action: "solve", path: "scene.json", goals: "goals.json", json: true } as const;
const stacked = { goals: [{ entityKey: "entity_product", relations: [{ kind: "onTopOf", target: "entity_pedestal" }] }] };

test("scene solve returns a contract-valid patch with solved set-transform operations", async () => await fixture(stacked, async application => {
  const patch = parseSpatialValue(SpatialScenePatchV1Schema, await executeSpatialSceneCommand(application, solve), "solve output");
  expect(patch.expectedSceneSha256).toBe(SPATIAL_SOLVE_PENDING_SCENE_SHA256);
  const expected = onTopOf(productBounds, { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    pedestalBounds, { position: [0, -0.9, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
  expect(patch.operations).toEqual([JSON.parse(JSON.stringify({
    kind: "set-transform", entityId: "entity_product", transform: expected,
  }))]);
}));

test("scene solve --output publishes the patch without replacing and reports the scene digest", async () => await fixture(stacked, async (application, root) => {
  const command = { ...solve, output: "patch.json" };
  const output = await executeSpatialSceneCommand(application, command);
  expect(output).toMatchObject({ path: join(root, "patch.json"), solvedEntities: ["entity_product"] });
  const published = parseSpatialValue(SpatialScenePatchV1Schema, JSON.parse(await readFile(join(root, "patch.json"), "utf8")), "solve patch");
  expect(published.operations[0]!.kind).toBe("set-transform");
  await expect(executeSpatialSceneCommand(application, command)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("exists") });
  expect((await readdir(root)).sort()).toEqual(["goals.json", "patch.json", "scene.json"]);
}));

test("scene solve faces a camera and caller bases cover entities without derivable bounds", async () => await fixture({
  goals: [{ entityKey: "entity_fill", relations: [{ kind: "at", position: [0, 0, -2] }, { kind: "facing", target: "camera_hero" }] }],
}, async application => {
  const patch = parseSpatialValue(SpatialScenePatchV1Schema, await executeSpatialSceneCommand(application, solve), "solve output");
  const transform = (patch.operations[0] as { transform: { position: number[]; rotation: number[] } }).transform;
  expect(transform.position).toEqual([0, 0, -2]);
  // Local -Z now looks from [0,0,-2] toward the hero camera at [0,0.3,5]: a yaw-pitch, never identity.
  expect(transform.rotation).not.toEqual([0, 0, 0, 1]);
}));

test("scene solve caller bases supply missing bounds for a light entity", async () => await fixture({
  goals: [{ entityKey: "entity_fill", relations: [{ kind: "onTopOf", target: "entity_pedestal" }] }],
  bases: { entity_fill: { bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } } },
}, async application => {
  const patch = parseSpatialValue(SpatialScenePatchV1Schema, await executeSpatialSceneCommand(application, solve), "solve output");
  const transform = (patch.operations[0] as { transform: { position: number[] } }).transform;
  expect(transform.position[1]).toBeCloseTo(-0.225, 6); // pedestal max.y -0.725 + half height 0.5
}));

test("scene solve rejects guarded goal entities and named solver failures", async () => {
  await fixture({ goals: [{ entityKey: "entity_missing", relations: [{ kind: "facing", target: "camera_hero" }] }] }, async application => {
    await expect(executeSpatialSceneCommand(application, solve)).rejects.toMatchObject({ code: "not-found" });
  });
  await fixture({ goals: [{ entityKey: "entity_fill", relations: [{ kind: "onTopOf", target: "entity_pedestal" }] }] }, async application => {
    await expect(executeSpatialSceneCommand(application, solve))
      .rejects.toMatchObject({ code: "invalid-data", message: expect.stringContaining("[bounds-unknown]") });
    await expect(executeSpatialSceneCommand(application, solve))
      .rejects.toMatchObject({ message: expect.stringContaining("entity_fill") });
  });
  await fixture({ goals: [{ entityKey: "entity_product", relations: [{ kind: "onTopOf", target: "entity_void" }] }] }, async application => {
    await expect(executeSpatialSceneCommand(application, solve))
      .rejects.toMatchObject({ code: "not-found", message: expect.stringContaining("[unknown-entity]") });
  });
  await fixture({ goals: [
    { entityKey: "entity_product", relations: [{ kind: "nextTo", target: "entity_pedestal" }] },
    { entityKey: "entity_pedestal", relations: [{ kind: "nextTo", target: "entity_product" }] },
  ] }, async application => {
    await expect(executeSpatialSceneCommand(application, solve))
      .rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("entity_product") });
  });
});

test("scene solve refuses transform-shadowed, animated, and parented goal entities", async () => {
  const overridden = { ...scene, overrides: [{ entityId: "entity_product", property: "transform", value: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } }] };
  await fixture(stacked, async application => {
    await expect(executeSpatialSceneCommand(application, solve))
      .rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("override") });
  }, overridden);
  const animated = { ...authored };
  await fixture(stacked, async application => {
    await expect(executeSpatialSceneCommand(application, solve))
      .rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("animated") });
  }, animated);
  const parented = JSON.parse(JSON.stringify(scene)) as typeof scene;
  parented.entities.find(entity => entity.entityId === "entity_product")!.parentId = "entity_pedestal";
  await fixture(stacked, async application => {
    await expect(executeSpatialSceneCommand(application, solve))
      .rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("parented") });
  }, parented);
});

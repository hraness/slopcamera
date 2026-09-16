import { expect, test } from "bun:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSpatialScene, createSpatialSceneStarter, type Bounds } from "../../../src/spatial-scene";
import { fixtureAsset } from "../../../src/spatial-scene/test-fixture";
import { parseCliArgs } from "./args";
import { operationApplicationContext } from "../application/operations/test-support";
import { executeSpatialSceneCommand } from "./spatial-scene-service";

async function fixture(run: (application: ReturnType<typeof operationApplicationContext>, root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-scene-audit-")));
  try {
    await run(operationApplicationContext(root), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("parses the audit subcommand like evaluate", () => {
  expect(parseCliArgs(["scene", "audit", "scene.json", "--camera", "camera_hero", "--times-us", "0,500000", "--asset-bounds", "bounds.json", "--json"]))
    .toEqual({ kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", timesUs: [0, 500_000], assetBounds: "bounds.json", json: true });
  expect(parseCliArgs(["scene", "audit", "scene.json", "--camera", "camera_hero"]))
    .toEqual({ kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", json: false });
  expect(() => parseCliArgs(["scene", "audit", "scene.json"])).toThrow("--camera");
  expect(() => parseCliArgs(["scene", "audit", "scene.json", "--camera", "camera_hero", "--times-us", "0,oops"])).toThrow("--times-us");
});

test("scene audit returns the deterministic report over the scene file", async () => await fixture(async (application, root) => {
  const scene = createSpatialSceneStarter();
  await writeFile(join(root, "scene.json"), JSON.stringify(scene));
  const output = await executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", json: true,
  });
  expect(output).toEqual(auditSpatialScene(scene, { cameraId: "camera_hero" }));
}));

test("scene audit honours --times-us and a bounded --asset-bounds file", async () => await fixture(async (application, root) => {
  const splat = {
    entityId: "entity_splat", kind: "splat" as const, name: "Splat", parentId: null,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    placement: { kind: "world" as const }, origin: { kind: "authored" as const }, visible: true,
    assetId: "asset_splat",
  };
  const scene = {
    ...createSpatialSceneStarter(),
    entities: [...createSpatialSceneStarter().entities, splat],
    assets: [{ ...fixtureAsset("asset_splat"), interpretation: { kind: "splat" as const, format: "spz" as const, metersPerUnit: 1, sourceUp: "y" as const } }],
  };
  const assetBounds: Readonly<Record<string, Bounds>> = { asset_splat: { min: [-1, -1, -1], max: [1, 1, 1] } };
  await writeFile(join(root, "scene.json"), JSON.stringify(scene));
  await writeFile(join(root, "bounds.json"), JSON.stringify(assetBounds));
  const output = await executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero",
    timesUs: [0, 2_000_000], assetBounds: "bounds.json", json: true,
  });
  expect(output).toEqual(auditSpatialScene(scene, { cameraId: "camera_hero", timesUs: [0, 2_000_000], assetBounds }));
  const report = output as ReturnType<typeof auditSpatialScene>;
  expect(report.timesUs).toEqual([0, 2_000_000]);
  expect(report.entities.find(entity => entity.entityId === "entity_splat")!.enclosure).toEqual({ status: "bounded" });
  await writeFile(join(root, "bad-bounds.json"), JSON.stringify({ asset_missing: { min: [0, 0, 0], max: [1, 1, 1] } }));
  await expect(executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", assetBounds: "bad-bounds.json", json: true,
  })).rejects.toThrow(/asset_missing/u);
}));

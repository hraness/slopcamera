import { expect, test } from "bun:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSpatialSceneStarter } from "../../../src/spatial-scene";
import { operationApplicationContext } from "../application/operations/test-support";
import { parseCliArgs } from "./args";
import { commandHostResourceClaims } from "./command-host-resources";
import { commandHelp } from "./help";
import { createCliTestHostResourceCoordinator } from "./run-cli-test-helper";
import { executeSpatialSceneCommand } from "./spatial-scene-service";

async function fixture(run: (application: ReturnType<typeof operationApplicationContext>, root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-render-audit-cli-")));
  try {
    await run(operationApplicationContext(root), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("parses the render-audit subcommand like audit", () => {
  expect(parseCliArgs(["scene", "render-audit", "scene.json", "--camera", "camera_hero", "--times-us", "0,500000", "--json"]))
    .toEqual({ kind: "spatial-scene", action: "render-audit", path: "scene.json", camera: "camera_hero", timesUs: [0, 500_000], json: true });
  expect(parseCliArgs(["scene", "render-audit", "scene.json", "--camera", "camera_hero"]))
    .toEqual({ kind: "spatial-scene", action: "render-audit", path: "scene.json", camera: "camera_hero", json: false });
  expect(() => parseCliArgs(["scene", "render-audit", "scene.json"])).toThrow("--camera");
  expect(() => parseCliArgs(["scene", "render-audit", "scene.json", "--camera", "camera_hero", "--times-us", "0,oops"])).toThrow("--times-us");
  expect(() => parseCliArgs(["scene", "render-audit", "scene.json", "--camera", "camera_hero",
    "--times-us", Array.from({ length: 65 }, (_, index) => index).join(",")])).toThrow("64");
});

test("help and resource policy admit the real browser boundary", () => {
  const help = commandHelp(["scene"]);
  expect(help).toContain("slopcamera scene render-audit <scene.json> --camera <camera-id> [--times-us <csv>] [--json]");
  expect(help).toContain("object-ID pass");
  const command = parseCliArgs(["scene", "render-audit", "scene.json", "--camera", "camera_hero"]);
  if (command.kind !== "spatial-scene") throw new Error("Wrong command");
  const coordinator = createCliTestHostResourceCoordinator(import.meta.url);
  expect(commandHostResourceClaims(command, coordinator).map(claim => `${claim.resource}:${String(claim.amount)}`))
    .toEqual(["browser:1", "cpu:6", "ffmpeg:2", "local-io:1"]);
});

test("scene render-audit dispatches to scene.render-audit@1 and requires the browser capability", async () => await fixture(async (application, root) => {
  await writeFile(join(root, "scene.json"), JSON.stringify(createSpatialSceneStarter()));
  // The test context has no browser capability: dispatch must reach the real
  // operation and fail at exact capability binding, never at argument routing.
  await expect(executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "render-audit", path: "scene.json", camera: "camera_hero", json: true,
  })).rejects.toThrow(/html-browser is unavailable/u);
  // The pure geometric audit keeps working from the same context unchanged.
  const audit = await executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", json: true,
  }) as { kind: string; cameraId: string };
  expect(audit).toMatchObject({ kind: "slopcamera.spatial-audit", cameraId: "camera_hero" });
}));

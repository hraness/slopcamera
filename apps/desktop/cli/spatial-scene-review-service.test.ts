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
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-review-cli-")));
  try {
    await run(operationApplicationContext(root), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("parses the review subcommand with its per-invocation consent flag", () => {
  expect(parseCliArgs(["scene", "review", "scene.json", "--camera", "camera_hero", "--allow-cloud-upload"]))
    .toEqual({ kind: "spatial-scene", action: "review", path: "scene.json", camera: "camera_hero", allowCloudUpload: true, json: false });
  expect(parseCliArgs(["scene", "review", "scene.json", "--camera", "camera_hero", "--times-us", "0,500000", "--allow-cloud-upload", "--json"]))
    .toEqual({ kind: "spatial-scene", action: "review", path: "scene.json", camera: "camera_hero", timesUs: [0, 500_000], allowCloudUpload: true, json: true });
  expect(() => parseCliArgs(["scene", "review", "scene.json", "--allow-cloud-upload"])).toThrow("--camera");
  expect(() => parseCliArgs(["scene", "review", "scene.json", "--camera", "camera_hero", "--times-us", "0,oops"])).toThrow("--times-us");
  expect(() => parseCliArgs(["scene", "review", "scene.json", "--camera", "camera_hero", "--times-us", "0,0"])).toThrow("unique");
  expect(() => parseCliArgs(["scene", "review", "scene.json", "--camera", "camera_hero", "--times-us", "0,1,2,3,4"])).toThrow("4");
  expect(() => parseCliArgs(["scene", "review", "scene.json", "--camera", "camera_hero", "--times-us", "99999999999999999999"])).toThrow("safe");
});

test("help and resource policy admit the browser render plus one paid dispatch", () => {
  const help = commandHelp(["scene"]);
  expect(help).toContain("slopcamera scene review <scene.json> --camera <camera-id> [--times-us <csv>] --allow-cloud-upload [--json]");
  expect(help).toContain("beauty frames");
  expect(help).toContain("model-generated and unverified");
  const command = parseCliArgs(["scene", "review", "scene.json", "--camera", "camera_hero", "--allow-cloud-upload"]);
  if (command.kind !== "spatial-scene") throw new Error("Wrong command");
  const coordinator = createCliTestHostResourceCoordinator(import.meta.url);
  expect(commandHostResourceClaims(command, coordinator).map(claim => `${claim.resource}:${String(claim.amount)}`))
    .toEqual(["browser:1", "cpu:6", "ffmpeg:2", "local-io:1", "network:1", "paid-call:1"]);
});

test("review refuses closed before touching the filesystem when consent is absent", async () => await fixture(async (application) => {
  // The scene path does not exist: any filesystem read would fail differently,
  // so authorization-required proves the gate ran first.
  await expect(executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "review", path: "missing.json", camera: "camera_hero", allowCloudUpload: false, json: true,
  })).rejects.toMatchObject({ code: "authorization-required" });
}));

test("consented review routes to scene.review@1 and reaches capability binding", async () => await fixture(async (application, root) => {
  await writeFile(join(root, "scene.json"), JSON.stringify(createSpatialSceneStarter()));
  // The test context grants a well-formed authorization envelope but has no
  // browser capability: dispatch must reach the real operation and fail at
  // exact capability binding, never at consent or argument routing.
  await expect(executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "review", path: "scene.json", camera: "camera_hero", allowCloudUpload: true, json: true,
  })).rejects.toThrow(/html-browser is unavailable/u);
}));

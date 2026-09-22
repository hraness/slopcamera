import { expect, test } from "bun:test";
import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createSpatialSceneStarter } from "../../../src/spatial-scene";
import { operationApplicationContext } from "../application/operations/test-support";
import { CliError } from "./errors";
import { executeSpatialSceneCommand } from "./spatial-scene-service";

async function waitUntil(ready: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  do { if (await ready()) return; await delay(10); } while (performance.now() < deadline);
  throw new Error("Timed out waiting for owned cancellation fixture");
}
const exists = async (path: string) => access(path).then(() => true, () => false);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  (process.platform === "win32" ? test.skip : test)(`scene render entrypoint drains owned command work after real ${signal}`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-scene-signal-")));
    const child = Bun.spawn([process.execPath, new URL("../qualification/test-support/main-signal.fixture.ts", import.meta.url).pathname], {
      cwd: root, env: { ...process.env, SLOPCAMERA_REPOSITORY_ROOT: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    });
    const stdout = new Response(child.stdout).text(), stderr = new Response(child.stderr).text();
    try {
      await waitUntil(() => exists(join(root, "ready.json")));
      expect(JSON.parse(await readFile(join(root, "ready.json"), "utf8"))).toEqual({ signal: true });
      expect(await exists(join(root, "active-command"))).toBe(true);
      child.kill(signal);
      await waitUntil(async () => child.exitCode !== null);
      expect(await child.exited).toBe(130);
      expect(await stdout).toBe(""); expect(await stderr).toBe("");
      expect(JSON.parse(await readFile(join(root, "cleanup.json"), "utf8"))).toEqual({ aborted: true, reason: "cancelled" });
      const result = JSON.parse(await readFile(join(root, "completed.json"), "utf8"));
      expect(result.code).toBe(130); expect(result.after).toEqual(result.before);
      expect(await exists(join(root, "active-command"))).toBe(false);
      expect(() => process.kill(child.pid, 0)).toThrow();
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await child.exited; await Promise.all([stdout, stderr]);
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("scene render forwards cancellation into the real operation while pure planning stays available", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-scene-abort-")));
  try {
    const scene = createSpatialSceneStarter(), application = operationApplicationContext(root);
    await writeFile(join(root, "scene.json"), JSON.stringify(scene));
    await writeFile(join(root, "request.json"), JSON.stringify({ cameraId: scene.cameras[0]!.cameraId,
      selection: { kind: "frame", timeUs: 0 }, mode: { kind: "beauty" } }));
    const signal = AbortSignal.abort(new CliError("cancelled", "Retained cancellation regression"));
    const command = { kind: "spatial-scene", action: "render", path: "scene.json", request: "request.json", json: true } as const;
    await expect(executeSpatialSceneCommand(application, command, signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(await exists(join(root, "artifacts", "slopcamera", "generated"))).toBe(false);
    const plan = await executeSpatialSceneCommand(application, { ...command, action: "plan" }, signal);
    expect(plan).toMatchObject({ samples: [{ index: 0, timeUs: 0 }] });
  } finally { await rm(root, { recursive: true, force: true }); }
});

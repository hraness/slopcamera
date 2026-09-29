import { lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import { parseCliArgs } from "./args";
import { activityLabel, ACTIVITY_STATUS_FILE, readActivityStatus, recordActivity, recordCredits } from "./activity-status";
import { runCli } from "./commands";
import type { CliIo } from "./io";

const roots: string[] = [];
function root(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "slopcamera-status-")));
  roots.push(dir);
  return dir;
}
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("activity status file", () => {
  test("labels only the commands that make media", () => {
    expect(activityLabel(parseCliArgs(["render", "run", "rec", "--output", "out.mp4"]))).toBe("Rendering a recording");
    expect(activityLabel(parseCliArgs(["render", "run", "rec", "--output", "out.mp4", "--dry-run"]))).toBeUndefined();
    expect(activityLabel(parseCliArgs(["doctor"]))).toBeUndefined();
    expect(activityLabel(parseCliArgs(["outputs"]))).toBeUndefined();
  });

  test("keeps activity and credits side by side in one owner-only file", () => {
    const dir = root();
    recordActivity(dir, { state: "running", label: "Rendering a recording", startedAt: 1 });
    recordCredits(dir, { usd: "4.20", low: false, checkedAt: 2 });
    recordActivity(dir, { state: "failed", label: "Rendering a recording", startedAt: 1, finishedAt: 3, error: "subprocess" });
    expect(readActivityStatus(dir)).toEqual({
      schemaVersion: 1,
      activity: { state: "failed", label: "Rendering a recording", startedAt: 1, finishedAt: 3, error: "subprocess" },
      credits: { usd: "4.20", low: false, checkedAt: 2 },
    });
    expect(lstatSync(join(dir, ACTIVITY_STATUS_FILE)).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual([ACTIVITY_STATUS_FILE]);
  });

  test("a held lock skips the write instead of racing it", () => {
    const dir = root();
    writeFileSync(join(dir, `.${ACTIVITY_STATUS_FILE}.lock`), "1\n", { mode: 0o600 });
    recordCredits(dir, { usd: "4.20", low: false, checkedAt: 2 });
    expect(readActivityStatus(dir)).toEqual({ schemaVersion: 1 });
  });

  test("a stale lock from a crashed writer is reclaimed", () => {
    const dir = root();
    const lock = join(dir, `.${ACTIVITY_STATUS_FILE}.lock`);
    writeFileSync(lock, "999999\n", { mode: 0o600 });
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    recordCredits(dir, { usd: "4.20", low: false, checkedAt: 2 });
    expect(readActivityStatus(dir).credits?.usd).toBe("4.20");
    expect(readdirSync(dir)).toEqual([ACTIVITY_STATUS_FILE]);
  });

  test("never throws and ignores files it didn't write", () => {
    const dir = root();
    writeFileSync(join(dir, ACTIVITY_STATUS_FILE), "not json");
    expect(readActivityStatus(dir)).toEqual({ schemaVersion: 1 });
    recordActivity(join(dir, "missing"), { state: "done", label: "Rendering a recording", startedAt: 1 });
    rmSync(join(dir, ACTIVITY_STATUS_FILE));
    symlinkSync("/etc/hosts", join(dir, ACTIVITY_STATUS_FILE));
    expect(readActivityStatus(dir)).toEqual({ schemaVersion: 1 });
  });

  test("a failed media command records its fixed error code", async () => {
    const dir = root();
    const io: CliIo = { cwd: () => dir, env: {}, now: () => new Date(5_000), platform: "darwin", stdout: () => undefined, stderr: () => undefined };
    const code = await runCli(["render", "run", "missing-recording", "--output", join(dir, "out.mp4")], { io, stateRoot: dir, clock: () => 4_000 });
    expect(code).not.toBe(0);
    const status = JSON.parse(readFileSync(join(dir, ACTIVITY_STATUS_FILE), "utf8"));
    expect(status.activity.state).toBe("failed");
    expect(status.activity.label).toBe("Rendering a recording");
    expect(typeof status.activity.error).toBe("string");
    expect(status.activity.startedAt).toBe(4_000);
  });
});

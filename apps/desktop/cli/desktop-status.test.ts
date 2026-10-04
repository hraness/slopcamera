import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import { renderSnapshot } from "@hraness/desktop-foundation/tui";

import { ago, listOutputs, STALE_RUNNING_MS, statusEnvelope, statusViews, type StatusInput } from "./desktop-status";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const now = NOW.getTime();
const empty = { root: "/o", total: 0, latest: [] };

function input(overrides: Partial<StatusInput>): StatusInput {
  return { version: "9.9.9", status: { schemaVersion: 1 }, outputs: empty, legacyLogin: { state: "none" }, now: NOW, ...overrides };
}

function snapshot(value: StatusInput, width = 60): string {
  const envelope = statusEnvelope(value);
  if (!envelope.ok) throw new Error("status envelope failed");
  return renderSnapshot(statusViews(() => NOW), envelope.data, width);
}

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("slopcamera status", () => {
  test("says how long ago in plain words", () => {
    expect(ago(now - 5_000, now)).toBe("just now");
    expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(ago(now - 90 * 60_000, now)).toBe("1 hour ago");
    expect(ago(now - 5 * 3_600_000, now)).toBe("5 hours ago");
    expect(ago(now - 30 * 3_600_000, now)).toBe("yesterday");
    expect(ago(now - 4 * 86_400_000, now)).toBe("4 days ago");
    expect(ago(now + 60_000, now)).toBe("just now");
  });

  test("idle, with nothing recorded", () => {
    const envelope = statusEnvelope(input({}));
    expect(envelope).toEqual({
      ok: true,
      schema: "slopcamera.status/1",
      generatedAt: NOW.toISOString(),
      data: {
        product: "slopcamera",
        version: "9.9.9",
        attention: false,
        activity: { state: "idle", headline: "Ready", detail: "Nothing rendered yet" },
        credits: null,
        outputs: empty,
        legacyLoginItem: { state: "none" },
      },
    });
    expect(snapshot(input({}))).toBe([
      "== SlopCamera ==",
      "┌ Now ─────────────────────────────────────────────────────┐",
      "│○ Ready · Nothing rendered yet                            │",
      "└──────────────────────────────────────────────────────────┘",
      "┌ Outputs ─────────────────────────────────────────────────┐",
      "│No outputs yet · Agents save finished files here          │",
      "│slopcamera outputs open                                   │",
      "└──────────────────────────────────────────────────────────┘",
      "┌ Login ───────────────────────────────────────────────────┐",
      "│✓ Nothing starts at login                                 │",
      "└──────────────────────────────────────────────────────────┘",
      "",
    ].join("\n"));
  });

  test("running, stale, failed and done", () => {
    const running = statusEnvelope(input({ status: { schemaVersion: 1, activity: { state: "running", label: "Rendering a project", startedAt: now - 120_000 } } }));
    expect(running.ok && running.data.activity).toEqual({
      state: "running", headline: "Rendering a project", detail: "Started 2 min ago", label: "Rendering a project",
      startedAt: new Date(now - 120_000).toISOString(),
    });
    const stale = statusEnvelope(input({ status: { schemaVersion: 1, activity: { state: "running", label: "Rendering a project", startedAt: now - STALE_RUNNING_MS } } }));
    expect(stale.ok && stale.data.activity.state).toBe("stale");
    expect(stale.ok && stale.next).toEqual([{ command: "slopcamera runs list --json", why: "See which run stopped and whether it can resume.", audience: "agent" }]);

    const failed = statusEnvelope(input({ status: { schemaVersion: 1, activity: { state: "failed", label: "Generating a video", startedAt: now - 60_000, finishedAt: now - 30_000, error: "subprocess" } } }));
    expect(failed.ok && failed.data.attention).toBe(true);
    expect(failed.ok && failed.data.activity.detail).toBe("Generating a video · A render tool stopped with an error");
    const weird = statusEnvelope(input({ status: { schemaVersion: 1, activity: { state: "failed", label: "Generating a video", startedAt: now, error: "\u001b[31mBAD" } } }));
    expect(weird.ok && weird.data.activity.error).toBe("internal");

    const done = statusEnvelope(input({ status: { schemaVersion: 1, activity: { state: "done", label: "Rendering a diagram", startedAt: now - 700_000, finishedAt: now - 600_000 } } }));
    expect(done.ok && done.data.activity.detail).toBe("Last job finished 10 min ago");
  });

  test("never shows a label that could carry a path or escape sequence", () => {
    for (const label of ["/Users/me/secret.mov", "\u001b]0;pwned\u0007", "", "x".repeat(41)]) {
      const envelope = statusEnvelope(input({ status: { schemaVersion: 1, activity: { state: "running", label, startedAt: now } } }));
      expect(envelope.ok && envelope.data.activity.state).toBe("idle");
    }
  });

  test("low credits and a found login item ask for attention with next steps", () => {
    const envelope = statusEnvelope(input({
      status: { schemaVersion: 1, credits: { usd: "0.40", low: true, checkedAt: now - 3_600_000 } },
      legacyLogin: { state: "found", label: "app.hraness.slopcamera" },
    }));
    expect(envelope.ok && envelope.data.attention).toBe(true);
    expect(envelope.ok && envelope.data.credits).toEqual({ usd: "0.40", low: true, checkedAt: new Date(now - 3_600_000).toISOString() });
    expect(envelope.ok && envelope.next?.map(step => step.command)).toEqual(["slopcamera credits topup", "slopcamera legacy retire --json"]);
    const text = snapshot(input({
      status: { schemaVersion: 1, credits: { usd: "0.40", low: true, checkedAt: now - 3_600_000 } },
      legacyLogin: { state: "found", label: "app.hraness.slopcamera" },
    }), 80);
    expect(text).toContain("⚠ Credits are low · $0.40 left · checked 1 hour ago");
    expect(text).toContain("⚠ The old menu bar still opens at login · run slopcamera legacy retire");
  });

  test("every line fits the requested width", () => {
    const outputs = { root: "/o", total: 5, latest: [{ name: `${"long-name-".repeat(12)}.mp4`, kind: "MP4", bytes: 12_345_678, modifiedAt: new Date(now - 86_400_000).toISOString() }] };
    for (const width of [20, 40, 80, 120]) {
      const text = snapshot(input({ outputs, legacyLogin: { state: "not-ours", label: "app.hraness.slopcamera" } }), width);
      for (const line of text.split("\n").filter(line => line !== "" && !line.startsWith("=="))) expect([...line].length).toBe(width);
    }
  });

  test("lists the newest regular files only", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "slopcamera-outputs-")));
    dirs.push(dir);
    writeFileSync(join(dir, "old.png"), "a");
    writeFileSync(join(dir, "new.mp4"), "bbb");
    writeFileSync(join(dir, ".hidden"), "c");
    mkdirSync(join(dir, "folder"));
    symlinkSync(join(dir, "old.png"), join(dir, "link.png"));
    utimesSync(join(dir, "old.png"), new Date(now - 60_000), new Date(now - 60_000));
    utimesSync(join(dir, "new.mp4"), NOW, NOW);
    const listed = listOutputs(dir, 3);
    expect(listed.total).toBe(2);
    expect(listed.latest.map(item => [item.name, item.kind, item.bytes])).toEqual([["new.mp4", "MP4", 3], ["old.png", "PNG", 1]]);
    expect(listOutputs(join(dir, "missing"), 3)).toEqual({ root: join(dir, "missing"), total: 0, latest: [] });
  });
});

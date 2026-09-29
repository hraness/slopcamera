import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { renderSnapshot } from "@hraness/desktop-foundation/tui";

import { statusEnvelope, statusViews, type StatusInput } from "./desktop-status";
import { CLI_VERBS } from "./verbs";

/**
 * One golden per state the retired menu bar had a fixture for, at the widths
 * agents and people use. `UPDATE_STATUS_GOLDENS=1 bun test` regenerates them;
 * review the diff like any other source change.
 */
const GOLDENS = join(import.meta.dir, "fixtures", "status");
const UPDATE = process.env.UPDATE_STATUS_GOLDENS === "1";
const NOW = new Date("2026-09-28T12:00:00.000Z");
const now = NOW.getTime();
const min = 60_000;
const hour = 60 * min;

function take(index: number, ageMs: number) {
  return { name: `take ${index}.mp4`, kind: "MP4", bytes: 4096, modifiedAt: new Date(now - ageMs).toISOString() };
}
const noOutputs = { root: "/o", total: 0, latest: [] };
const fiveOutputs = { root: "/o", total: 5, latest: [take(4, 10 * min), take(3, 20 * min), take(2, 30 * min)] };
const credits = { usd: "4.20", low: false, checkedAt: now - 2 * hour };

function state(overrides: Partial<StatusInput>): StatusInput {
  return { version: "9.9.9", status: { schemaVersion: 1 }, outputs: noOutputs, legacyLogin: { state: "none" }, now: NOW, ...overrides };
}

/** The former menu fixture states. `action-error` was a menu-only transient; a failing command now reports its own error. */
const STATES: Readonly<Record<string, StatusInput>> = {
  "first-run": state({}),
  empty: state({ outputs: { root: "/o", total: 0, latest: [] } }),
  ready: state({
    status: { schemaVersion: 1, activity: { state: "done", label: "Rendering a recording", startedAt: now - 12 * min, finishedAt: now - 9 * min }, credits },
    outputs: fiveOutputs,
  }),
  rendering: state({
    status: { schemaVersion: 1, activity: { state: "running", label: "Rendering a recording", startedAt: now - min }, credits },
    outputs: { root: "/o", total: 2, latest: [take(1, 5 * min), take(0, 15 * min)] },
  }),
  error: state({
    status: { schemaVersion: 1, activity: { state: "failed", label: "Rendering a recording", startedAt: now - 5 * min, finishedAt: now - 4 * min, error: "subprocess" } },
    outputs: { root: "/o", total: 1, latest: [take(0, 30 * min)] },
  }),
  "low-credits": state({
    status: { schemaVersion: 1, activity: { state: "done", label: "Rendering a recording", startedAt: now - 12 * min, finishedAt: now - 9 * min }, credits: { usd: "0.40", low: true, checkedAt: now - 2 * hour } },
    outputs: { root: "/o", total: 1, latest: [take(0, 30 * min)] },
  }),
  "stale-job": state({
    status: { schemaVersion: 1, activity: { state: "running", label: "Rendering a recording", startedAt: now - 8 * hour } },
  }),
  "login-not-ours": state({ legacyLogin: { state: "not-ours", label: "app.hraness.slopcamera" } }),
  "login-found": state({ legacyLogin: { state: "found", label: "com.hraness.slopcamera.menubar" } }),
};

function golden(name: string, actual: string): void {
  const path = join(GOLDENS, name);
  if (UPDATE) {
    mkdirSync(GOLDENS, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  expect({ name, actual }).toEqual({ name, actual: readFileSync(path, "utf8") });
}

describe("status goldens for every former menu state", () => {
  for (const [name, input] of Object.entries(STATES)) {
    test(name, () => {
      const envelope = statusEnvelope(input);
      if (!envelope.ok) throw new Error(`${name}: status envelope failed`);
      golden(`${name}.json`, `${JSON.stringify(envelope, null, 2)}\n`);
      for (const width of [40, 80, 120]) {
        const text = renderSnapshot(statusViews(() => NOW), envelope.data, width);
        for (const line of text.split("\n").filter(line => line !== "" && !line.startsWith("=="))) expect([...line].length).toBe(width);
        golden(`${name}.${width}.txt`, text);
      }
    });
  }
});

/** Every action the retired menu offered, and the one command that replaces it. */
const FORMER_MENU_ACTIONS: Readonly<Record<string, string>> = {
  "status row (activity)": "status",
  "status row (credits)": "status",
  "outputs.open.<file>": "outputs open",
  "outputs.reveal.<file>": "outputs reveal",
  "outputs.folder": "outputs open",
  login: "legacy retire",
  support: "support",
  "support.diagnostics": "doctor",
  quit: "tui",
};

describe("CLI parity with the retired menu", () => {
  const parity = readFileSync(join(import.meta.dir, "../../../docs/cli-parity.md"), "utf8");
  const verbs = new Set(CLI_VERBS.map(row => row.path.join(" ")));
  for (const [action, verb] of Object.entries(FORMER_MENU_ACTIONS)) {
    test(action, () => {
      expect({ action, verb, registered: verbs.has(verb) }).toEqual({ action, verb, registered: true });
      expect({ action, documented: parity.includes(`| \`${action}\` | \`slopcamera ${verb}`) }).toEqual({ action, documented: true });
    });
  }
});

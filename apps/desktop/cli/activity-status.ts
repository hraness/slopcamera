import { chmodSync, lstatSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeSync, constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { CliCommand } from "./args";

/**
 * The small status file `slopcamera status` and `slopcamera tui` read: what Slopcamera is doing now,
 * how the last render ended, and the last credits balance a command saw.
 * It holds plain labels, times and fixed error codes only — never paths,
 * prompts, tokens or account identifiers. Writes are best effort: a status
 * that can't be saved never fails the command.
 */
// The on-disk name predates the menu bar's retirement and stays frozen, so a
// rolled-back release and existing state keep reading the same file.
export const ACTIVITY_STATUS_FILE = "menubar-status.json";
const MAX_STATUS_BYTES = 16 * 1024;

export type ActivityState = "running" | "done" | "failed";

export interface RecordedActivity {
  readonly state: ActivityState;
  readonly label: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly error?: string;
}

export interface RecordedCredits {
  readonly usd: string;
  readonly low: boolean;
  readonly checkedAt: number;
}

export interface ActivityStatus {
  readonly schemaVersion: 1;
  readonly activity?: RecordedActivity;
  readonly credits?: RecordedCredits;
}

/** Plain labels for the commands that make media. Everything else leaves the status alone. */
export function activityLabel(command: CliCommand): string | undefined {
  switch (command.kind) {
    case "render-run": return command.dryRun ? undefined : "Rendering a recording";
    case "project-render": return command.action === "run" && !command.dryRun ? "Rendering a project" : undefined;
    case "project-cinema": return "Rendering a project";
    case "html-render": return "Rendering an HTML scene";
    case "html-film": return command.action === "deliver" ? "Encoding a film" : "Rendering film stills";
    case "diagram-render": return "Rendering a diagram";
    case "image-vectorize": return "Vectorizing an image";
    case "ai-image-generate": return "Generating an image";
    case "ai-video-generate": return "Generating a video";
    case "ai-speech-generate": return "Generating speech";
    case "directing": return "Directing a clip";
    case "studio": return "Running a studio job";
    case "spatial-scene": return command.action === "render" ? "Rendering a 3D scene" : undefined;
    case "workflows-run": return "Running a workflow";
    case "code-run": return "Running a workflow";
    default: return undefined;
  }
}

function parse(text: string): ActivityStatus {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || (value as { schemaVersion?: unknown }).schemaVersion !== 1) return { schemaVersion: 1 };
    const record = value as Record<string, unknown>;
    const activity = record.activity as RecordedActivity | undefined;
    const credits = record.credits as RecordedCredits | undefined;
    return {
      schemaVersion: 1,
      ...(activity !== undefined && typeof activity === "object" && typeof activity.label === "string" ? { activity } : {}),
      ...(credits !== undefined && typeof credits === "object" && typeof credits.usd === "string" ? { credits } : {}),
    };
  } catch {
    return { schemaVersion: 1 };
  }
}

export function readActivityStatus(stateRoot: string): ActivityStatus {
  const path = join(stateRoot, ACTIVITY_STATUS_FILE);
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.size > MAX_STATUS_BYTES) return { schemaVersion: 1 };
    return parse(readFileSync(path, "utf8"));
  } catch {
    return { schemaVersion: 1 };
  }
}

const LOCK_FILE = `.${ACTIVITY_STATUS_FILE}.lock`;
/** A held lock blocks a write for this long before it is skipped. */
const LOCK_BUDGET_MS = 250;
/** A lock older than this is a crashed writer's and is reclaimed. */
const LOCK_STALE_MS = 10_000;

function sleepSync(ms: number): void {
  Bun.sleepSync(ms);
}

/**
 * Runs `update` holding a small exclusive lock file, so a render finishing
 * while `credits status` runs cannot overwrite the other slot. Returns
 * undefined when the lock never comes free; the write is then skipped
 * rather than lost-halfway.
 */
function withStatusLock<T>(stateRoot: string, update: () => T): T | undefined {
  const lock = join(stateRoot, LOCK_FILE);
  const deadline = Date.now() + LOCK_BUDGET_MS;
  for (;;) {
    let fd: number;
    try {
      fd = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") return undefined;
      try {
        if (Date.now() - lstatSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { force: true });
      } catch { /* races with the lock holder */ }
      if (Date.now() >= deadline) return undefined;
      sleepSync(5);
      continue;
    }
    closeSync(fd);
    try {
      return update();
    } finally {
      try { rmSync(lock, { force: true }); } catch { /* best effort */ }
    }
  }
}

/** Replaces the status file atomically with an owner-only file. Never throws. */
export function writeActivityStatus(stateRoot: string, update: (current: ActivityStatus) => ActivityStatus): void {
  withStatusLock(stateRoot, () => {
    const path = join(stateRoot, ACTIVITY_STATUS_FILE);
    const staged = join(stateRoot, `.${ACTIVITY_STATUS_FILE}.${randomUUID()}.tmp`);
    try {
      const root = lstatSync(stateRoot);
      if (!root.isDirectory()) return;
      const text = `${JSON.stringify(update(readActivityStatus(stateRoot)))}\n`;
      if (Buffer.byteLength(text) > MAX_STATUS_BYTES) return;
      const fd = openSync(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { writeSync(fd, text); } finally { closeSync(fd); }
      chmodSync(staged, 0o600);
      renameSync(staged, path);
    } catch {
      try { rmSync(staged, { force: true }); } catch { /* best effort */ }
    }
  });
}

export function recordActivity(stateRoot: string, activity: RecordedActivity): void {
  writeActivityStatus(stateRoot, (current) => ({ ...current, activity }));
}

export function recordCredits(stateRoot: string, credits: RecordedCredits): void {
  writeActivityStatus(stateRoot, (current) => ({ ...current, credits }));
}

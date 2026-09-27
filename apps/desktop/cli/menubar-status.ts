import { chmodSync, lstatSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeSync, constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { CliCommand } from "./args";

/**
 * The small status file the menu bar reads: what Slopcamera is doing now,
 * how the last render ended, and the last credits balance a command saw.
 * It holds plain labels, times and fixed error codes only — never paths,
 * prompts, tokens or account identifiers. Writes are best effort: a status
 * that can't be saved never fails the command.
 */
export const MENUBAR_STATUS_FILE = "menubar-status.json";
const MAX_STATUS_BYTES = 16 * 1024;

export type ActivityState = "running" | "done" | "failed";

export interface MenubarActivity {
  readonly state: ActivityState;
  readonly label: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly error?: string;
}

export interface MenubarCredits {
  readonly usd: string;
  readonly low: boolean;
  readonly checkedAt: number;
}

export interface MenubarStatus {
  readonly schemaVersion: 1;
  readonly activity?: MenubarActivity;
  readonly credits?: MenubarCredits;
}

/** Plain labels for the commands that make media. Everything else leaves the status alone. */
export function activityLabel(command: CliCommand): string | undefined {
  switch (command.kind) {
    case "render-run": return command.dryRun ? undefined : "Rendering a recording";
    case "project-render": return command.action === "run" && !command.dryRun ? "Rendering a project" : undefined;
    case "project-cinema": return "Rendering a project";
    case "html-render": return "Rendering an HTML scene";
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

function parse(text: string): MenubarStatus {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || (value as { schemaVersion?: unknown }).schemaVersion !== 1) return { schemaVersion: 1 };
    const record = value as Record<string, unknown>;
    const activity = record.activity as MenubarActivity | undefined;
    const credits = record.credits as MenubarCredits | undefined;
    return {
      schemaVersion: 1,
      ...(activity !== undefined && typeof activity === "object" && typeof activity.label === "string" ? { activity } : {}),
      ...(credits !== undefined && typeof credits === "object" && typeof credits.usd === "string" ? { credits } : {}),
    };
  } catch {
    return { schemaVersion: 1 };
  }
}

export function readMenubarStatus(stateRoot: string): MenubarStatus {
  const path = join(stateRoot, MENUBAR_STATUS_FILE);
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.size > MAX_STATUS_BYTES) return { schemaVersion: 1 };
    return parse(readFileSync(path, "utf8"));
  } catch {
    return { schemaVersion: 1 };
  }
}

/** Replaces the status file atomically with an owner-only file. Never throws. */
export function writeMenubarStatus(stateRoot: string, update: (current: MenubarStatus) => MenubarStatus): void {
  const path = join(stateRoot, MENUBAR_STATUS_FILE);
  const staged = join(stateRoot, `.${MENUBAR_STATUS_FILE}.${randomUUID()}.tmp`);
  try {
    const root = lstatSync(stateRoot);
    if (!root.isDirectory()) return;
    const text = `${JSON.stringify(update(readMenubarStatus(stateRoot)))}\n`;
    if (Buffer.byteLength(text) > MAX_STATUS_BYTES) return;
    const fd = openSync(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeSync(fd, text); } finally { closeSync(fd); }
    chmodSync(staged, 0o600);
    renameSync(staged, path);
  } catch {
    try { rmSync(staged, { force: true }); } catch { /* best effort */ }
  }
}

export function recordActivity(stateRoot: string, activity: MenubarActivity): void {
  writeMenubarStatus(stateRoot, (current) => ({ ...current, activity }));
}

export function recordCredits(stateRoot: string, credits: MenubarCredits): void {
  writeMenubarStatus(stateRoot, (current) => ({ ...current, credits }));
}

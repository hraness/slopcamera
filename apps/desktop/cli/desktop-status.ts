import { lstatSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { okEnvelope, type Envelope, type NextStep } from "@hraness/desktop-foundation/registry";
import { box, clean, table, type View } from "@hraness/desktop-foundation/tui";

import type { LegacyLoginReport } from "./legacy-login";
import type { ActivityStatus } from "./activity-status";

/**
 * `slopcamera status` and `slopcamera tui`: what Slopcamera is doing, how
 * the last job ended, the last credits balance a command saw, the newest
 * outputs, and whether the retired menu bar still starts at login. Pure
 * except `listOutputs`, so every state has a golden.
 */
export const STATUS_SCHEMA = "slopcamera.status/1";
export const OUTPUTS_LIMIT = 3;
/** A job still marked running after this long crashed or was killed. */
export const STALE_RUNNING_MS = 6 * 60 * 60 * 1000;
const MAX_LABEL_CHARS = 40;

export type ActivityState = "idle" | "running" | "done" | "failed" | "stale";

export interface StatusActivity {
  readonly state: ActivityState;
  readonly headline: string;
  readonly detail: string;
  readonly label?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly error?: string;
}

export interface StatusCredits {
  readonly usd: string;
  readonly low: boolean;
  readonly checkedAt: string;
}

export interface StatusOutput {
  readonly name: string;
  readonly kind: string;
  readonly bytes: number;
  readonly modifiedAt: string;
}

export interface StatusOutputs {
  readonly root: string;
  readonly total: number;
  readonly latest: readonly StatusOutput[];
}

export interface StatusData {
  readonly product: "slopcamera";
  readonly version: string;
  readonly attention: boolean;
  readonly activity: StatusActivity;
  readonly credits: StatusCredits | null;
  readonly outputs: StatusOutputs;
  readonly legacyLoginItem: LegacyLoginReport;
}

export interface StatusInput {
  readonly version: string;
  readonly status: ActivityStatus;
  readonly outputs: StatusOutputs;
  readonly legacyLogin: LegacyLoginReport;
  readonly now: Date;
}

export function ago(thenMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 7_200) return "1 hour ago";
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} hours ago`;
  if (seconds < 172_800) return "yesterday";
  return `${Math.floor(seconds / 86_400)} days ago`;
}

export function dollars(usd: string): string {
  const bare = usd.replace(/^\$+/u, "");
  return bare !== "" && /^[0-9.,]+$/u.test(bare) ? `$${bare}` : usd;
}

export function explain(code: string): string {
  switch (code) {
    case "cancelled": return "It was stopped before it finished";
    case "not-found": return "A file it needed wasn't found";
    case "unavailable": return "A tool it needed isn't available on this computer";
    case "authorization-required": return "It needs more credits first";
    case "subprocess": return "A render tool stopped with an error";
    case "invalid-data":
    case "incompatible": return "Its input wasn't in a form SlopCamera can use";
    case "unsafe-path": return "It was asked to use a folder SlopCamera won't write to";
    case "usage": return "The command had a typo or a missing option";
    case "conflict": return "Something else was changing the same project";
    default: return "Something went wrong. Run the command again to see why";
  }
}

function plain(text: string, max: number): boolean {
  return text !== "" && [...text].length <= max && /^[\p{L}\p{N} .,'$-]+$/u.test(text);
}

function iso(ms: number): string | undefined {
  return Number.isFinite(ms) && ms >= 0 && ms <= 8.64e15 ? new Date(ms).toISOString() : undefined;
}

function activityOf(status: ActivityStatus, now: number): StatusActivity {
  const activity = status.activity;
  if (activity === undefined || !plain(activity.label, MAX_LABEL_CHARS) || !Number.isFinite(activity.startedAt)) {
    return { state: "idle", headline: "Ready", detail: "Nothing rendered yet" };
  }
  const startedAt = iso(activity.startedAt);
  const finishedMs = activity.finishedAt ?? activity.startedAt;
  const finishedAt = activity.finishedAt === undefined ? undefined : iso(activity.finishedAt);
  const times = { ...(startedAt === undefined ? {} : { startedAt }), ...(finishedAt === undefined ? {} : { finishedAt }) };
  if (activity.state === "running") {
    if (now - activity.startedAt < STALE_RUNNING_MS) {
      return { state: "running", headline: activity.label, detail: `Started ${ago(activity.startedAt, now)}`, label: activity.label, ...times };
    }
    return { state: "stale", headline: "Last job stopped early", detail: `${activity.label} · started ${ago(activity.startedAt, now)}`, label: activity.label, ...times };
  }
  if (activity.state === "failed") {
    const error = typeof activity.error === "string" && /^[a-z][a-z-]{0,40}$/u.test(activity.error) ? activity.error : "internal";
    return { state: "failed", headline: "Last job didn't finish", detail: `${activity.label} · ${explain(error)}`, label: activity.label, error, ...times };
  }
  return { state: "done", headline: "Ready", detail: `Last job finished ${ago(finishedMs, now)}`, label: activity.label, ...times };
}

function creditsOf(status: ActivityStatus): StatusCredits | null {
  const credits = status.credits;
  if (credits === undefined || !plain(credits.usd, 16) || typeof credits.low !== "boolean") return null;
  const checkedAt = iso(credits.checkedAt);
  return checkedAt === undefined ? null : { usd: credits.usd, low: credits.low, checkedAt };
}

export function statusData(input: StatusInput): StatusData {
  const now = input.now.getTime();
  const activity = activityOf(input.status, now);
  const credits = creditsOf(input.status);
  return {
    product: "slopcamera",
    version: input.version,
    attention: activity.state === "failed" || credits?.low === true || input.legacyLogin.state === "found",
    activity,
    credits,
    outputs: input.outputs,
    legacyLoginItem: input.legacyLogin,
  };
}

export function statusNext(data: StatusData): NextStep[] {
  const next: NextStep[] = [];
  if (data.activity.state === "failed" || data.activity.state === "stale") {
    next.push({ command: "slopcamera runs list --json", why: "See which run stopped and whether it can resume.", audience: "agent" });
  }
  if (data.credits?.low === true) {
    next.push({ command: "slopcamera credits topup", why: "Credits are low; adding more opens a checkout for a person.", audience: "human" });
  }
  if (data.legacyLoginItem.state === "found") {
    next.push({ command: "slopcamera legacy retire --json", why: "The retired menu bar still opens at login; this moves its login item aside.", audience: "agent" });
  }
  return next;
}

export function statusEnvelope(input: StatusInput): Envelope<StatusData> {
  const data = statusData(input);
  const next = statusNext(data);
  return okEnvelope(STATUS_SCHEMA, data, next.length === 0 ? undefined : next, input.now);
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} ${units[unit]}`;
}

function day(modifiedAt: string, now: number): string {
  const then = Date.parse(modifiedAt);
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function mark(state: ActivityState): string {
  switch (state) {
    case "idle": return "○";
    case "running": return "↻";
    case "done": return "✓";
    default: return "⚠";
  }
}

function loginLine(report: LegacyLoginReport): string {
  switch (report.state) {
    case "found": return "⚠ The old menu bar still opens at login · run slopcamera legacy retire";
    case "not-ours": return "– A menu bar login item changed outside SlopCamera is left alone";
    default: return "✓ Nothing starts at login";
  }
}

/** The one Status view, rendered by both `tui` and `tui --snapshot`. */
export function statusViews(now: () => Date): View<StatusData>[] {
  return [{
    id: "status",
    title: "SlopCamera",
    render(data, width) {
      const nowMs = now().getTime();
      const lines = [`${mark(data.activity.state)} ${clean(data.activity.headline)} · ${clean(data.activity.detail)}`];
      if (data.credits !== null) {
        const checked = ago(Date.parse(data.credits.checkedAt), nowMs);
        lines.push(data.credits.low
          ? `⚠ Credits are low · ${dollars(data.credits.usd)} left · checked ${checked}`
          : `✓ ${dollars(data.credits.usd)} in credits · Checked ${checked}`);
      }
      const outputs = data.outputs.latest.length === 0
        ? ["No outputs yet · Agents save finished files here"]
        : table(["Output", "Size", "Saved", "Type"], data.outputs.latest.map(item => [
          clean(item.name), size(item.bytes), day(item.modifiedAt, nowMs), item.kind,
        ]), width - 2);
      const more = data.outputs.total > data.outputs.latest.length
        ? [`${data.outputs.total} outputs · slopcamera outputs list --json`]
        : ["slopcamera outputs open"];
      return [
        ...box("Now", lines, width),
        ...box("Outputs", [...outputs, ...more], width),
        ...box("Login", [loginLine(data.legacyLoginItem)], width),
      ];
    },
  }];
}

function kindOf(name: string): string {
  const extension = extname(name).slice(1);
  return extension === "" || extension.length > 8 ? "File" : extension.toUpperCase();
}

/**
 * The newest regular files at the top of the outputs folder. Hidden files,
 * links and folders are skipped; a missing folder is an empty list.
 */
export function listOutputs(root: string, limit: number): StatusOutputs {
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return { root, total: 0, latest: [] };
  }
  const files: StatusOutput[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    try {
      const info = lstatSync(join(root, name));
      if (!info.isFile()) continue;
      files.push({ name, kind: kindOf(name), bytes: info.size, modifiedAt: new Date(info.mtimeMs).toISOString() });
    } catch {
      // Removed while listing.
    }
  }
  files.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt) || left.name.localeCompare(right.name));
  return { root, total: files.length, latest: files.slice(0, limit) };
}

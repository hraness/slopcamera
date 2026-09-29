import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  MAX_LOGIN_ITEM_BYTES,
  retireLegacyLoginItem,
  type LegacyLoginItem,
  type Retired,
} from "@hraness/desktop-foundation/retire";

import { CliError } from "./errors";

/**
 * Login items earlier Slopcamera releases wrote to start the retired menu
 * bar. Newest first: the desktop-foundation helper's item, the name that
 * helper used before, and the plist the CLI itself wrote before that.
 */
export const LEGACY_LOGIN_LABELS = [
  "app.hraness.slopcamera",
  "app.hraness.companion.slopcamera",
  "com.hraness.slopcamera.menubar",
] as const;

const OLD_CLI_LABEL = "com.hraness.slopcamera.menubar";
const MENU_BINARY = /\/slopcamera-menubar$/u;
const LOCAL_APP = /\/Slopcamera\.app\/Contents\/MacOS\/[^/]+$/u;

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function unxml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

/** The exact plist the old `slopcamera menubar install` wrote. */
export function oldCliPlist(binary: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${xml(OLD_CLI_LABEL)}</string><key>ProgramArguments</key><array><string>${xml(binary)}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>ProcessType</key><string>Interactive</string><key>LimitLoadToSessionType</key><string>Aqua</string></dict></plist>\n`;
}

function programArguments(text: string): string[] {
  const array = /<key>ProgramArguments<\/key><array>((?:<string>[^<]*<\/string>)*)<\/array>/u.exec(text);
  if (array === null) return [];
  return [...array[1]!.matchAll(/<string>([^<]*)<\/string>/gu)].map(match => unxml(match[1]!));
}

/**
 * True only for an item Slopcamera wrote for its menu bar. The helper's
 * items carry a header with the SHA-256 of the body, so an edited file is
 * not ours. The old CLI item must match what that CLI wrote byte for byte.
 */
export function isSlopcameraMenubarItem(item: LegacyLoginItem): boolean {
  if (item.label === OLD_CLI_LABEL) {
    const [program, ...rest] = programArguments(item.text);
    return program !== undefined && rest.length === 0 && MENU_BINARY.test(program) && item.text === oldCliPlist(program);
  }
  const newline = item.text.indexOf("\n");
  if (newline < 0) return false;
  const body = item.text.slice(newline + 1);
  const digest = createHash("sha256").update(body).digest("hex");
  if (item.text.slice(0, newline + 1) !== `<!-- hraness-companion autostart slopcamera sha256:${digest} -->\n`) return false;
  if (!body.includes(`<key>Label</key><string>${xml(item.label)}</string>`)) return false;
  const [program] = programArguments(body);
  return program !== undefined && (MENU_BINARY.test(program) || LOCAL_APP.test(program));
}

export type LegacyLoginState = "none" | "found" | "not-ours";

export interface LegacyLoginReport {
  readonly state: LegacyLoginState;
  /** The label of the item found, when there is one. */
  readonly label?: string;
}

function readSmallFile(path: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > MAX_LOGIN_ITEM_BYTES || info.uid !== process.getuid?.()) return undefined;
    const bytes = Buffer.alloc(info.size);
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(fd, bytes, count, bytes.length - count, count);
      if (read === 0) break;
      count += read;
    }
    return bytes.subarray(0, count).toString("utf8");
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function launchAgents(home: string | undefined): string | undefined {
  return home === undefined || home === "" || !isAbsolute(home) ? undefined : join(home, "Library", "LaunchAgents");
}

/** Reads the LaunchAgents folder and reports the old menu bar item. Changes nothing. */
export function inspectLegacyLogin(home: string | undefined): LegacyLoginReport {
  const directory = launchAgents(home);
  if (directory === undefined) return { state: "none" };
  let foreign: string | undefined;
  for (const label of LEGACY_LOGIN_LABELS) {
    const path = join(directory, `${label}.plist`);
    try {
      lstatSync(path);
    } catch {
      continue;
    }
    const text = readSmallFile(path);
    if (text !== undefined && isSlopcameraMenubarItem({ label, path, text })) return { state: "found", label };
    foreign ??= label;
  }
  return foreign === undefined ? { state: "none" } : { state: "not-ours", label: foreign };
}

export interface RetireDependencies {
  readonly bootout?: (label: string) => Promise<void>;
  readonly now?: () => Date;
}

/**
 * Stops the old menu bar starting at login: boots out its label and renames
 * the plist to `<name>.retired-<ms>`. Nothing is deleted, no process is
 * signalled by pid, and items Slopcamera did not write are left alone.
 */
export async function retireLegacyLogin(home: string | undefined, dependencies: RetireDependencies = {}): Promise<Retired[]> {
  if (launchAgents(home) === undefined) throw new CliError("unavailable", "HOME must be an absolute directory to look for the old menu bar login item.");
  const retired: Retired[] = [];
  // One call retires the first match; repeat so every old copy is moved aside.
  for (let attempt = 0; attempt < LEGACY_LOGIN_LABELS.length; attempt += 1) {
    const labels = LEGACY_LOGIN_LABELS.filter(label => !retired.some(item => item.label === label));
    const result = await retireLegacyLoginItem({
      home: home!,
      labels,
      accepts: isSlopcameraMenubarItem,
      ...(dependencies.bootout === undefined ? {} : { bootout: dependencies.bootout }),
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
    });
    if (result === null) break;
    retired.push(result);
  }
  return retired;
}

export interface RetiredLegacyLogin {
  readonly label: string;
  readonly path: string;
  /** Puts the item back and loads it, undoing `slopcamera legacy retire`. */
  readonly restore: string;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Login items `legacy retire` moved aside, with the command that restores each. Changes nothing. */
export function retiredLegacyLogins(home: string | undefined): RetiredLegacyLogin[] {
  const directory = launchAgents(home);
  if (directory === undefined) return [];
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  const found: RetiredLegacyLogin[] = [];
  for (const label of LEGACY_LOGIN_LABELS) {
    const prefix = `${label}.plist.retired-`;
    for (const name of names.filter(item => item.startsWith(prefix) && /^[0-9]{1,16}$/u.test(item.slice(prefix.length))).sort()) {
      const path = join(directory, name);
      const original = join(directory, `${label}.plist`);
      found.push({
        label,
        path,
        restore: `mv -n ${shellQuote(path)} ${shellQuote(original)} && launchctl bootstrap gui/$(id -u) ${shellQuote(original)}`,
      });
    }
  }
  return found;
}

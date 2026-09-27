import { closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { Stats } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CliError } from "./errors";
import type { CliIo } from "./io";
import { writeJson, writeLine } from "./io";
import { ensurePrivateDirectory } from "./paths";

const SETTLE_MS = 400;
/** The label earlier releases used; the menu bar now manages its own login item. */
const LABEL = "com.hraness.slopcamera.menubar";

function xml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function exists(path: string): boolean { try { const info = lstatSync(path); return isAbsolute(path) && realpathSync(path) === resolve(path) && (info.uid === process.getuid?.() || info.uid === 0) && info.isFile() && (info.mode & 0o111) !== 0 && (info.mode & 0o022) === 0; } catch { return false; } }

/** The directory agents write user-facing outputs into. */
export function outputsRoot(stateRoot: string): string {
  const productRoot = stateRoot.endsWith(`${sep}cli`) ? dirname(stateRoot) : stateRoot;
  return join(productRoot, "outputs");
}
export function resolveMenubarBinary(repositoryRoot: string, environment: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const explicit = environment.SLOPCAMERA_MENUBAR;
  if (explicit !== undefined) return explicit !== "" && exists(explicit) ? explicit : null;
  const candidates = [ resolve(dirname(process.execPath), "slopcamera-menubar"), ...(environment.HOME === undefined || environment.HOME === "" ? [] : [installedBinaryPath(environment)]), resolve(repositoryRoot, "desktop", "target", "release", "slopcamera-menubar")];
  for (const candidate of candidates) if (candidate !== undefined && candidate !== "" && exists(candidate)) return candidate;
  return null;
}
export function launchAgentPath(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const home = environment.HOME; if (home === undefined || home === "" || !isAbsolute(home)) throw new CliError("unavailable", "HOME is required for a per-user LaunchAgent.");
  return join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
}
export function installedBinaryPath(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const home = environment.HOME; if (home === undefined || home === "" || !isAbsolute(home)) throw new CliError("unavailable", "HOME is required for a per-user menu-bar install.");
  return join(home, "Library", "Application Support", "Slopcamera", "menubar", "slopcamera-menubar");
}
export function launchAgentPlist(binary: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${xml(LABEL)}</string><key>ProgramArguments</key><array><string>${xml(binary)}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>ProcessType</key><string>Interactive</string><key>LimitLoadToSessionType</key><string>Aqua</string></dict></plist>\n`;
}
type Environment = Readonly<Record<string, string | undefined>>;
const MAX_BINARY_BYTES = 128 * 1024 * 1024;

function infoAt(path: string): Stats | null {
  try { return lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Existing shared directories retain their permissions; links are never followed. */
function checkParents(path: string, environment: Environment, create = false): void {
  const home = environment.HOME;
  if (!home || !isAbsolute(home) || realpathSync(home) !== resolve(home)) {
    throw new CliError("unsafe-path", "HOME must be an absolute physical directory.");
  }
  const suffix = relative(home, dirname(path));
  if (suffix.startsWith(`..${sep}`) || suffix === ".." || isAbsolute(suffix)) {
    throw new CliError("unsafe-path", "The menu-bar install must remain under HOME.");
  }
  let cursor = home;
  for (const part of ["", ...suffix.split(sep)]) {
    if (part) cursor = join(cursor, part);
    let info = infoAt(cursor);
    if (info === null) {
      if (!create) return;
      mkdirSync(cursor, { mode: 0o700 });
      info = lstatSync(cursor);
    }
    if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o022) !== 0) {
      throw new CliError("unsafe-path", "Menu-bar install directories must be owned physical directories without shared write access.");
    }
  }
}

function assertOwnedFile(path: string): void {
  const info = infoAt(path);
  if (info !== null && (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o022) !== 0)) {
    throw new CliError("unsafe-path", "The menu-bar install contains an unsafe file.");
  }
}

function readRegular(path: string, maximum: number, executable = false): Buffer {
  if (!isAbsolute(path) || realpathSync(path) !== resolve(path) || Buffer.byteLength(path) > 4096 || /[\u0000-\u001f\u007f{}"\\]/u.test(path)) {
    throw new CliError("unsafe-path", "The menu-bar file must have a bounded physical absolute path.");
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || (info.uid !== process.getuid?.() && info.uid !== 0) || info.size > maximum || info.size === 0 || (info.mode & 0o022) !== 0 || (executable && (info.mode & 0o111) === 0)) {
      throw new CliError("unsafe-path", "The menu-bar file must be bounded, regular, and protected from shared writes.");
    }
    const bytes = Buffer.alloc(info.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(fd, bytes, count, bytes.length - count, count);
      if (read === 0) break;
      count += read;
    }
    const after = fstatSync(fd);
    if (count !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) {
      throw new CliError("conflict", "The menu-bar file changed while it was being read.");
    }
    return bytes.subarray(0, count);
  } finally { closeSync(fd); }
}

function readAgent(path: string, environment: Environment): string | null {
  checkParents(path, environment);
  if (infoAt(path) === null) return null;
  assertOwnedFile(path);
  return readRegular(path, 16 * 1024).toString("utf8");
}

/**
 * Copies the built menu bar into its installed location, replacing an
 * earlier copy. Existing shared directory permissions are preserved;
 * symbolic links and files other users can write are refused.
 */
export function installBinary(binary: string, environment: Environment = process.env): string {
  if (!isAbsolute(binary)) throw new CliError("unsafe-path", "The menu-bar build must be an absolute path.");
  const stable = installedBinaryPath(environment);
  checkParents(stable, environment);
  assertOwnedFile(stable);
  const bytes = readRegular(binary, MAX_BINARY_BYTES, true);
  checkParents(stable, environment, true);
  const stage = mkdtempSync(join(dirname(stable), ".install-"));
  try {
    const staged = join(stage, "binary");
    writeFileSync(staged, bytes, { mode: 0o700, flag: "wx" });
    assertOwnedFile(stable);
    renameSync(staged, stable);
    return stable;
  } finally {
    rmSync(stage, { recursive: true });
  }
}

/**
 * Removes the login item earlier releases wrote under the old label, but
 * only when it is exactly the file they wrote. It never calls launchctl: a
 * copy that is already running keeps running until you quit it or log out.
 */
export function removeLegacyAgent(environment: Environment = process.env): "absent" | "removed" | "foreign" {
  const path = launchAgentPath(environment);
  const current = readAgent(path, environment);
  if (current === null) return "absent";
  if (current !== launchAgentPlist(installedBinaryPath(environment))) return "foreign";
  rmSync(path);
  return "removed";
}

function assertMac(platform: NodeJS.Platform): void {
  if (platform !== "darwin") throw new CliError("unsupported-plan", "The Slopcamera menu bar runs only on macOS.");
}

export interface HelperResult { readonly code: number; readonly stdout: string; readonly stderr: string }
/** Runs the installed menu bar's own install, uninstall or status command. */
export type HelperRunner = (binary: string, args: readonly string[], env: Environment) => Promise<HelperResult>;

async function runHelper(binary: string, args: readonly string[], env: Environment): Promise<HelperResult> {
  const child = Bun.spawn([binary, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: { ...env } as Record<string, string> });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { code, stdout: stdout.slice(0, 64 * 1024), stderr: stderr.slice(0, 64 * 1024) };
}

const AGENT_MARKERS = ["AI_AGENT", "CLAUDECODE", "CODEX_SANDBOX", "CODEX_SANDBOX_NETWORK_DISABLED", "CURSOR_AGENT", "GEMINI_CLI"];

/**
 * The helper decides between human and agent output from its environment.
 * Its output is captured here, so a person's terminal is passed on as
 * `HRANESS_AUDIENCE=human`; agents and explicit settings pass through.
 */
export function helperEnvironment(env: Environment): Environment {
  const agent = AGENT_MARKERS.some((name) => (env[name] ?? "") !== "");
  return env.HRANESS_AUDIENCE !== undefined || agent ? env : { ...env, HRANESS_AUDIENCE: "human" };
}

function helperFailure(result: HelperResult): CliError {
  // The helper prints the login-item notice on stderr before the error;
  // the failure is the last ✗ line plus the → hint that follows it.
  const lines = result.stderr.split("\n");
  let start = -1;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("✗") || trimmed.startsWith("FAIL")) start = index;
  }
  const text = (start === -1 ? result.stderr : lines.slice(start).join("\n")).trim().replace(/^(✗|FAIL)\s+/u, "");
  return new CliError(result.code === 2 ? "usage" : "unavailable", text === "" ? "The Slopcamera menu bar couldn't change its login item." : text);
}

/** `slopcamera-menubar` exits with this code when another copy already holds the menu bar. */
export const ALREADY_RUNNING_EXIT = 3;
const NOT_BUILT = "The Slopcamera menu bar isn't in this release yet. Build it with cargo build --release --manifest-path desktop/Cargo.toml in a Slopcamera checkout; slopcamera finds it there, or set SLOPCAMERA_MENUBAR to the built file.";

export type Launched = "running" | "already-running" | "exited";
export type BinaryRunner = (binary: string, foreground: boolean) => Promise<number | null>;

/** Resolves the exit code, or null when a background copy is still running after startup. */
async function spawnBinary(binary: string, foreground: boolean): Promise<number | null> {
  let child: Bun.Subprocess;
  try { child = Bun.spawn([binary], foreground ? { stdin: "inherit", stdout: "inherit", stderr: "inherit" } : { stdin: "ignore", stdout: "ignore", stderr: "ignore" }); } catch { throw new CliError("unavailable", "The Slopcamera menu bar couldn't start."); }
  if (!foreground) { child.unref(); return await Promise.race([child.exited.then((code) => code as number | null), Bun.sleep(SETTLE_MS).then(() => null)]); }
  return await child.exited;
}

/** Interprets the companion's exit: another running copy is success, not a failure. */
export function launchOutcome(code: number | null, foreground: boolean): Launched {
  if (code === ALREADY_RUNNING_EXIT) return "already-running";
  if (code === null && !foreground) return "running";
  if (code === 0 && foreground) return "exited";
  throw new CliError("unavailable", "The Slopcamera menu bar stopped while starting. Run it in the foreground to see why: slopcamera menubar --foreground");
}

interface Marks { readonly ok: string; readonly warn: string; readonly note: string; readonly next: string }
/** ✓ ⚠ 🔐 → with ASCII fallbacks for dumb terminals and non-UTF-8 locales. */
export function marks(env: Readonly<Record<string, string | undefined>>): Marks {
  const utf8 = [env.LC_ALL, env.LC_CTYPE, env.LANG].some((value) => value !== undefined && /utf-?8/i.test(value));
  const ascii = env.TERM === "dumb" || !utf8 || env.HRANESS_ASCII === "1";
  return ascii ? { ok: "OK", warn: "WARN", note: "NOTE", next: "->" } : { ok: "✓", warn: "⚠", note: "🔐", next: "→" };
}

export function launchMessage(outcome: Launched, env: Readonly<Record<string, string | undefined>>): string {
  const mark = marks(env);
  if (outcome === "already-running") return `${mark.ok} Slopcamera is already in your menu bar. Look for 📷.`;
  if (outcome === "running") return `${mark.ok} Slopcamera is in your menu bar. Look for 📷.`;
  return "The Slopcamera menu bar closed.";
}

export async function launchMenubar(io: CliIo, repositoryRoot: string, asJson: boolean, mode: "foreground" | "background" = "foreground", runBinary: BinaryRunner = spawnBinary): Promise<void> {
  const binary = resolveMenubarBinary(repositoryRoot, io.env);
  if (binary === null) throw new CliError("unavailable", NOT_BUILT);
  const outcome = launchOutcome(await runBinary(binary, mode === "foreground"), mode === "foreground");
  if (asJson) writeJson(io, { running: outcome !== "exited", foreground: mode === "foreground", alreadyRunning: outcome === "already-running" });
  else writeLine(io, launchMessage(outcome, io.env));
}
export async function manageMenubar(io: CliIo, repositoryRoot: string, action: "install" | "uninstall" | "status", asJson: boolean, run: HelperRunner = runHelper): Promise<void> {
  assertMac(io.platform);
  const stable = installedBinaryPath(io.env);
  const args = asJson ? [action, "--json"] : [action];
  const env = helperEnvironment(io.env);
  const forward = (result: HelperResult): void => {
    if (result.stdout !== "") io.stdout(result.stdout);
    if (result.code !== 0) throw helperFailure(result);
    if (result.stderr !== "") io.stderr(result.stderr);
  };
  if (action === "install") {
    const binary = resolveMenubarBinary(repositoryRoot, io.env);
    if (binary === null) throw new CliError("unavailable", NOT_BUILT);
    const installed = binary === stable ? stable : installBinary(binary, io.env);
    forward(await run(installed, args, env));
    // The old login item goes only after the new one is in place, so a
    // failed install never leaves nothing to start at login.
    removeLegacyAgent(io.env);
    return;
  }
  if (action === "uninstall") removeLegacyAgent(io.env);
  if (!exists(stable)) {
    if (asJson) writeJson(io, { login: "off", running: false, installed: false });
    else if (action === "uninstall") writeLine(io, `${marks(io.env).ok} Slopcamera won't open at login.`);
    else writeLine(io, `Slopcamera's menu bar isn't installed.\n${marks(io.env).next} slopcamera menubar install`);
    return;
  }
  const result = await run(stable, args, env);
  forward(result);
  if (action === "uninstall") rmSync(stable);
}

export async function reportOutputsRoot(io: CliIo, stateRoot: string, asJson: boolean): Promise<void> {
  const directory = outputsRoot(stateRoot);
  await ensurePrivateDirectory(directory);
  if (asJson) writeJson(io, { outputs: directory });
  else writeLine(io, directory);
}

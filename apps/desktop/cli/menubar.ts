import { closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { Stats } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CliError } from "./errors";
import type { CliIo } from "./io";
import { writeJson, writeLine } from "./io";
import { ensurePrivateDirectory } from "./paths";

const SETTLE_MS = 400;
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

/** Configuration state only; it does not claim the launchd service is running. */
export type LaunchAgentState = "absent" | "installed" | "conflict";
export type LaunchctlRunner = (args: readonly string[], allowMissing?: boolean) => string | null;
function launchctl(args: readonly string[], allowMissing = false): string | null {
  const uid = process.getuid?.();
  if (uid === undefined) throw new CliError("unavailable", "The current user has no launchd GUI domain.");
  const result = Bun.spawnSync(["/bin/launchctl", ...args.map((arg) => arg.replaceAll("{uid}", String(uid)))], { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 10_000, maxBuffer: 64 * 1024 });
  return interpretLaunchctlResult(result, uid, allowMissing);
}
export function interpretLaunchctlResult(result: { success: boolean; exitCode: number; stdout: Uint8Array; stderr: Uint8Array }, uid: number, allowMissing: boolean): string | null {
  if (result.stdout.byteLength + result.stderr.byteLength > 64 * 1024) throw new CliError("unavailable", "launchctl exceeded the bounded response size.");
  if (result.success && result.exitCode === 0) return Buffer.from(result.stdout).toString();
  if (allowMissing && result.exitCode === 113 && result.stdout.length === 0 && Buffer.from(result.stderr).toString() === `Bad request.\nCould not find service "${LABEL}" in domain for user gui: ${uid}\n`) return null;
  throw new CliError("unavailable", "launchctl could not reconcile the Slopcamera menu-bar LaunchAgent. Run menubar install again to retry.");
}

function loadedOwned(path: string, binary: string, current: string | null, run: LaunchctlRunner): boolean {
  const output = run(["print", `gui/{uid}/${LABEL}`], true);
  if (output === null) return false;
  const uid = process.getuid?.();
  if (current === null || Buffer.byteLength(output) > 64 * 1024 || !output.startsWith(`gui/${uid}/${LABEL} = {\n`)) {
    throw new CliError("conflict", "The loaded menu-bar service has an unverified identity.");
  }
  const lines = output.split("\n").map(line => line.trim());
  const field = (key: string): string | null => {
    const values = lines.filter(line => line.startsWith(`${key} = `));
    return values.length === 1 ? values[0]!.slice(key.length + 3) : null;
  };
  const argumentsStart = lines.indexOf("arguments = {");
  const argumentsEnd = lines.indexOf("}", argumentsStart + 1);
  if (field("path") !== path || field("program") !== binary || argumentsStart < 0 || argumentsEnd !== argumentsStart + 2 || lines[argumentsStart + 1] !== binary) {
    throw new CliError("conflict", "The loaded menu-bar service does not match this install; it was left untouched.");
  }
  return true;
}
export function launchAgentState(binary: string, environment: Environment = process.env): LaunchAgentState {
  const content = readAgent(launchAgentPath(environment), environment);
  if (content === null) return "absent";
  checkParents(binary, environment);
  assertOwnedFile(binary);
  return content === launchAgentPlist(binary) && exists(binary) ? "installed" : "conflict";
}
function assertMac(platform: NodeJS.Platform): void {
  if (platform !== "darwin") throw new CliError("unsupported-plan", "Slopcamera menu-bar LaunchAgents are supported only on macOS.");
}
export function installLaunchAgent(binary: string, environment: Environment = process.env, platform: NodeJS.Platform = process.platform, runLaunchctl: LaunchctlRunner = launchctl): LaunchAgentState {
  assertMac(platform);
  if (!isAbsolute(binary)) throw new CliError("unsafe-path", "LaunchAgent binary must be an absolute path.");
  const stable = installedBinaryPath(environment);
  const path = launchAgentPath(environment);
  const current = readAgent(path, environment);
  const expected = launchAgentPlist(stable);
  checkParents(stable, environment);
  assertOwnedFile(stable);
  if (current !== null && current !== expected || current === null && infoAt(stable) !== null) {
    throw new CliError("conflict", "The existing Slopcamera menu-bar install is not owned by this command.");
  }
  const bytes = readRegular(binary, MAX_BINARY_BYTES, true);
  loadedOwned(path, stable, current, runLaunchctl);
  checkParents(path, environment, true);
  checkParents(stable, environment, true);
  // Unique private staging directories prevent predictable temporary-file clobbering.
  const binaryStage = mkdtempSync(join(dirname(stable), ".install-"));
  let agentStage: string | undefined;
  try {
    agentStage = mkdtempSync(join(dirname(path), ".slopcamera-install-"));
    const stagedBinary = join(binaryStage, "binary");
    const stagedAgent = join(agentStage, "agent.plist");
    writeFileSync(stagedBinary, bytes, { mode: 0o700, flag: "wx" });
    writeFileSync(stagedAgent, expected, { mode: 0o600, flag: "wx" });
    if (readAgent(path, environment) !== current) throw new CliError("conflict", "The menu-bar install changed concurrently.");
    assertOwnedFile(stable);
    // Retry bootstrap even when the plist matches: a previous bootstrap may have failed.
    if (loadedOwned(path, stable, current, runLaunchctl)) runLaunchctl(["bootout", `gui/{uid}/${LABEL}`], true);
    renameSync(stagedBinary, stable);
    renameSync(stagedAgent, path);
    runLaunchctl(["bootstrap", "gui/{uid}", path]);
    return "installed";
  } finally {
    rmSync(binaryStage, { recursive: true });
    if (agentStage !== undefined) rmSync(agentStage, { recursive: true });
  }
}
export function uninstallLaunchAgent(_binary: string, environment: Environment = process.env, platform: NodeJS.Platform = process.platform, runLaunchctl: LaunchctlRunner = launchctl): LaunchAgentState {
  assertMac(platform);
  const stable = installedBinaryPath(environment);
  const path = launchAgentPath(environment);
  const current = readAgent(path, environment);
  if (current === null) return "absent";
  if (current !== launchAgentPlist(stable)) throw new CliError("conflict", "The existing Slopcamera menu-bar LaunchAgent is not owned by this command.");
  checkParents(stable, environment);
  assertOwnedFile(stable);
  if (loadedOwned(path, stable, current, runLaunchctl)) runLaunchctl(["bootout", `gui/{uid}/${LABEL}`], true);
  if (readAgent(path, environment) !== current) throw new CliError("conflict", "The menu-bar install changed concurrently.");
  assertOwnedFile(stable);
  rmSync(path);
  if (infoAt(stable) !== null) rmSync(stable);
  return "absent";
}
/** `slopcamera-menubar` exits with this code when another copy already holds the menu bar. */
export const ALREADY_RUNNING_EXIT = 3;
const NOT_BUILT = "The Slopcamera menu bar isn't in this release yet. Build it with cargo build --release --manifest-path desktop/Cargo.toml in a Slopcamera checkout; slopcamera finds it there, or set SLOPCAMERA_MENUBAR to the built file.";
const LOGIN_ITEMS = "System Settings › General › Login Items & Extensions";

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

/** The LOGIN_ITEM notice (notifies, so there is no confirm line). The requester is the bare companion until Slopcamera ships as an app. */
export function loginItemNotice(env: Readonly<Record<string, string | undefined>>): string {
  return `${marks(env).note} macOS will show a notice that slopcamera-menubar can open at login. That's Slopcamera's menu bar.\n   It lists your outputs and opens when you log in. Nothing else runs in the background. Turn it off any time in ${LOGIN_ITEMS}.\n`;
}

export function launchMessage(outcome: Launched, env: Readonly<Record<string, string | undefined>>): string {
  const mark = marks(env);
  if (outcome === "already-running") return `${mark.ok} Slopcamera is already in your menu bar. Look for 📷.`;
  if (outcome === "running") return `${mark.ok} Slopcamera is in your menu bar. Look for 📷.`;
  return "The Slopcamera menu bar closed.";
}

export function stateMessage(action: "install" | "uninstall" | "status", state: LaunchAgentState, running: boolean, env: Readonly<Record<string, string | undefined>>): string {
  const mark = marks(env);
  if (state === "conflict") return `${mark.warn} Another menu-bar setup that this command didn't create is in the way. It was left untouched.\n  Remove ~/Library/LaunchAgents/${LABEL}.plist yourself if you don't need it.`;
  if (state === "absent") return action === "uninstall" ? `${mark.ok} Slopcamera no longer opens in your menu bar at login.` : `Slopcamera doesn't open at login.\n${mark.next} slopcamera menubar install`;
  if (action === "install") return `${mark.ok} Slopcamera opens in your menu bar now and at every login. Look for 📷.\n  Remove it any time: slopcamera menubar uninstall`;
  return running
    ? `${mark.ok} Slopcamera opens at login and is in your menu bar now.`
    : `${mark.warn} Slopcamera is set to open at login but isn't running. It may be turned off in ${LOGIN_ITEMS}.\n${mark.next} slopcamera menubar install`;
}

/** Whether launchd reports the loaded companion as running. Reads state only. */
export function serviceRunning(runLaunchctl: LaunchctlRunner): boolean {
  const output = runLaunchctl(["print", `gui/{uid}/${LABEL}`], true);
  return output !== null && output.split("\n").some((line) => line.trim() === "state = running");
}

export async function launchMenubar(io: CliIo, repositoryRoot: string, asJson: boolean, mode: "foreground" | "background" = "foreground", runBinary: BinaryRunner = spawnBinary): Promise<void> {
  const binary = resolveMenubarBinary(repositoryRoot, io.env);
  if (binary === null) throw new CliError("unavailable", NOT_BUILT);
  const outcome = launchOutcome(await runBinary(binary, mode === "foreground"), mode === "foreground");
  if (asJson) writeJson(io, { running: outcome !== "exited", foreground: mode === "foreground", alreadyRunning: outcome === "already-running" });
  else writeLine(io, launchMessage(outcome, io.env));
}
export async function manageMenubar(io: CliIo, repositoryRoot: string, action: "install" | "uninstall" | "status", asJson: boolean, runLaunchctl: LaunchctlRunner = launchctl): Promise<void> {
  assertMac(io.platform);
  const stable = installedBinaryPath(io.env);
  let state: LaunchAgentState;
  if (action === "install") {
    const binary = resolveMenubarBinary(repositoryRoot, io.env);
    if (binary === null) throw new CliError("unavailable", NOT_BUILT);
    if (!asJson) io.stderr(loginItemNotice(io.env));
    state = installLaunchAgent(binary, io.env, io.platform, runLaunchctl);
  } else {
    state = action === "uninstall" ? uninstallLaunchAgent(stable, io.env, io.platform, runLaunchctl) : launchAgentState(stable, io.env);
  }
  const running = state === "installed" && serviceRunning(runLaunchctl);
  if (asJson) writeJson(io, { launchAgent: state, running });
  else writeLine(io, stateMessage(action, state, running, io.env));
}
export async function reportOutputsRoot(io: CliIo, stateRoot: string, asJson: boolean): Promise<void> {
  const directory = outputsRoot(stateRoot);
  await ensurePrivateDirectory(directory);
  if (asJson) writeJson(io, { outputs: directory });
  else writeLine(io, directory);
}

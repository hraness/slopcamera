import { chmodSync, copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { CliError } from "./errors";
import type { CliIo } from "./io";
import { writeJson, writeLine } from "./io";
import { ensurePrivateDirectory } from "./paths";

const SETTLE_MS = 400;
const LABEL = "com.hraness.slopcamera.menubar";

function xml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function exists(path: string): boolean { try { return statSync(path).isFile(); } catch { return false; } }

/** The directory agents write user-facing outputs into. */
export function outputsRoot(stateRoot: string): string {
  const productRoot = stateRoot.endsWith(`${sep}cli`) ? dirname(stateRoot) : stateRoot;
  return join(productRoot, "outputs");
}
export function resolveMenubarBinary(repositoryRoot: string, environment: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const candidates = [environment.SLOPCAMERA_MENUBAR, resolve(dirname(process.execPath), "slopcamera-menubar"), ...(environment.HOME === undefined || environment.HOME === "" ? [] : [installedBinaryPath(environment)]), resolve(repositoryRoot, "desktop", "target", "release", "slopcamera-menubar")];
  for (const candidate of candidates) if (candidate !== undefined && candidate !== "" && exists(candidate)) return candidate;
  return null;
}
export function launchAgentPath(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const home = environment.HOME; if (home === undefined || home === "") throw new CliError("unavailable", "HOME is required for a per-user LaunchAgent.");
  return join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
}
export function installedBinaryPath(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const home = environment.HOME; if (home === undefined || home === "") throw new CliError("unavailable", "HOME is required for a per-user menu-bar install.");
  return join(home, "Library", "Application Support", "Slopcamera", "menubar", "slopcamera-menubar");
}
export function launchAgentPlist(binary: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${xml(LABEL)}</string><key>ProgramArguments</key><array><string>${xml(binary)}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>ProcessType</key><string>Interactive</string><key>LimitLoadToSessionType</key><string>Aqua</string></dict></plist>\n`;
}
function readAgent(path: string): string | null { try { return readFileSync(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
export type LaunchAgentState = "absent" | "installed" | "conflict";
export type LaunchctlRunner = (args: readonly string[], allowMissing?: boolean) => void;
function launchctl(args: readonly string[], allowMissing = false): void {
  const uid = process.getuid?.(); if (uid === undefined) throw new CliError("unavailable", "The current user has no launchd GUI domain.");
  const result = Bun.spawnSync(["/bin/launchctl", ...args.map((arg) => arg.replaceAll("{uid}", String(uid)))], { stdout: "ignore", stderr: "pipe" });
  if (result.exitCode !== 0 && !(allowMissing && result.stderr.toString().includes("Could not find service"))) throw new CliError("unavailable", "launchctl could not reconcile the Slopcamera menu-bar LaunchAgent.");
}
export function launchAgentState(binary: string, environment: Readonly<Record<string, string | undefined>> = process.env): LaunchAgentState { const content = readAgent(launchAgentPath(environment)); return content === null ? "absent" : content === launchAgentPlist(binary) ? "installed" : "conflict"; }
export function installLaunchAgent(binary: string, environment: Readonly<Record<string, string | undefined>> = process.env, platform: NodeJS.Platform = process.platform, runLaunchctl: LaunchctlRunner = launchctl): LaunchAgentState {
  if (platform !== "darwin") throw new CliError("unsupported-plan", "Slopcamera menu-bar LaunchAgents are supported only on macOS.");
  if (!binary.startsWith("/")) throw new CliError("unsafe-path", "LaunchAgent binary must be an absolute path.");
  if (!exists(binary)) throw new CliError("not-found", "The prebuilt Slopcamera menu-bar binary does not exist.");
  const stable = installedBinaryPath(environment); const path = launchAgentPath(environment); const current = readAgent(path); const expected = launchAgentPlist(stable);
  if (current !== null) { if (current !== expected) throw new CliError("conflict", "The existing Slopcamera menu-bar LaunchAgent is not owned by this command."); return "installed"; }
  const directory = dirname(path); mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700); mkdirSync(dirname(stable), { recursive: true, mode: 0o700 }); chmodSync(dirname(stable), 0o700);
  const copied = `${stable}.tmp-${process.pid}`; copyFileSync(binary, copied); chmodSync(copied, 0o700); renameSync(copied, stable);
  const temporary = `${path}.tmp-${process.pid}`; writeFileSync(temporary, expected, { encoding: "utf8", mode: 0o600, flag: "wx" }); chmodSync(temporary, 0o600); renameSync(temporary, path); runLaunchctl(["bootstrap", "gui/{uid}", path]); return "installed";
}
export function uninstallLaunchAgent(binary: string, environment: Readonly<Record<string, string | undefined>> = process.env, platform: NodeJS.Platform = process.platform, runLaunchctl: LaunchctlRunner = launchctl): LaunchAgentState {
  if (platform !== "darwin") throw new CliError("unsupported-plan", "Slopcamera menu-bar LaunchAgents are supported only on macOS.");
  const stable = installedBinaryPath(environment); const path = launchAgentPath(environment); const current = readAgent(path); if (current === null) return "absent";
  if (current !== launchAgentPlist(stable)) throw new CliError("conflict", "The existing Slopcamera menu-bar LaunchAgent is not owned by this command.");
  runLaunchctl(["bootout", `gui/{uid}/${LABEL}`], true); rmSync(path); if (exists(stable)) rmSync(stable); return "absent";
}
async function runBinary(binary: string, foreground: boolean): Promise<number> {
  let child: Bun.Subprocess;
  try { child = Bun.spawn([binary], foreground ? { stdin: "inherit", stdout: "inherit", stderr: "inherit" } : { stdin: "ignore", stdout: "ignore", stderr: "ignore" }); } catch { throw new CliError("unavailable", "The Slopcamera menu bar could not start."); }
  if (!foreground) { child.unref(); const settled = await Promise.race([child.exited.then((code) => code as number | null), Bun.sleep(SETTLE_MS).then(() => null)]); if (settled !== null && settled !== 0) throw new CliError("unavailable", "The Slopcamera menu bar exited during startup."); return 0; }
  return await child.exited;
}
export async function launchMenubar(io: CliIo, repositoryRoot: string, asJson: boolean, mode: "foreground" | "background" = "foreground"): Promise<void> {
  const binary = resolveMenubarBinary(repositoryRoot, io.env);
  if (binary === null) throw new CliError("unavailable", "The Slopcamera menu bar is not installed. Build it separately or set SLOPCAMERA_MENUBAR.");
  const code = await runBinary(binary, mode === "foreground");
  if (code !== 0) throw new CliError("unavailable", "The Slopcamera menu bar exited during startup.");
  if (asJson) writeJson(io, { running: true, foreground: mode === "foreground" });
  else writeLine(io, mode === "foreground" ? "Slopcamera menu bar exited." : "Slopcamera menu bar is running.");
}
export async function manageMenubar(io: CliIo, repositoryRoot: string, action: "install" | "uninstall" | "status", asJson: boolean): Promise<void> {
  const binary = resolveMenubarBinary(repositoryRoot, io.env);
  if (binary === null) throw new CliError("unavailable", "The Slopcamera menu bar is not installed. Build it separately or set SLOPCAMERA_MENUBAR.");
  const stable = installedBinaryPath(io.env);
  const state = action === "install" ? installLaunchAgent(binary, io.env) : action === "uninstall" ? uninstallLaunchAgent(stable, io.env) : launchAgentState(stable, io.env);
  if (asJson) writeJson(io, { launchAgent: state });
  else writeLine(io, `Slopcamera menu-bar LaunchAgent: ${state}.`);
}
export async function reportOutputsRoot(io: CliIo, stateRoot: string, asJson: boolean): Promise<void> {
  const directory = outputsRoot(stateRoot);
  await ensurePrivateDirectory(directory);
  if (asJson) writeJson(io, { outputs: directory });
  else writeLine(io, directory);
}

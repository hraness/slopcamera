import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { CliIo } from "./io";
import { ALREADY_RUNNING_EXIT, installedBinaryPath, installLaunchAgent, interpretLaunchctlResult, launchAgentPath, launchAgentPlist, launchAgentState, launchMenubar, launchMessage, launchOutcome, loginItemNotice, manageMenubar, outputsRoot, resolveMenubarBinary, serviceRunning, stateMessage, uninstallLaunchAgent } from "./menubar";
import { commandHelp } from "./help";

const fixtures: string[] = [];
function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "slopcamera-menubar-")));
  fixtures.push(home);
  const binary = join(home, "new-build");
  writeFileSync(binary, "prebuilt-v1", { mode: 0o700 });
  const env = { HOME: home, SLOPCAMERA_MENUBAR: binary };
  return { home, binary, env, stable: installedBinaryPath(env), plist: launchAgentPath(env) };
}
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("Slopcamera menu-bar launcher", () => {
  test("accepts Bun sync success without a signalCode field and refuses uncertain results", () => {
    const success = { success: true, exitCode: 0, stdout: Buffer.from("owned job"), stderr: Buffer.alloc(0) };
    expect(interpretLaunchctlResult(success, 501, false)).toBe("owned job");
    expect(() => interpretLaunchctlResult({ ...success, success: false }, 501, false)).toThrow();
    expect(() => interpretLaunchctlResult({ ...success, stdout: Buffer.alloc(65_537) }, 501, false)).toThrow();
    const missing = { success: false, exitCode: 113, stdout: Buffer.alloc(0), stderr: Buffer.from('Bad request.\nCould not find service "com.hraness.slopcamera.menubar" in domain for user gui: 501\n') };
    expect(interpretLaunchctlResult(missing, 501, true)).toBe(null);
    expect(() => interpretLaunchctlResult(missing, 502, true)).toThrow();
  });
  test("keeps outputs beside the product state root", () => {
    expect(outputsRoot("/tmp/Slopcamera/cli")).toBe("/tmp/Slopcamera/outputs");
    expect(outputsRoot("/tmp/Slopcamera")).toBe("/tmp/Slopcamera/outputs");
  });

  test("accepts a safe explicit companion and ignores retired desktop overrides", () => {
    const { home, binary, env } = fixture();
    expect(resolveMenubarBinary(home, env)).toBe(binary);
    expect(resolveMenubarBinary(home, { HOME: home, SLOPCAMERA_DESKTOP: binary })).not.toBe(binary);
    for (const mode of [0o600, 0o775]) {
      chmodSync(binary, mode);
      expect(resolveMenubarBinary(home, env)).not.toBe(binary);
    }
    chmodSync(binary, 0o700);
    const link = join(home, "linked-build");
    symlinkSync(binary, link);
    expect(resolveMenubarBinary(home, { ...env, SLOPCAMERA_MENUBAR: link })).not.toBe(link);
  });

  test("preserves shared directory modes and stages away from predictable temporary names", () => {
    const { binary, env, stable, plist } = fixture();
    mkdirSync(dirname(plist), { recursive: true, mode: 0o755 });
    chmodSync(dirname(plist), 0o755);
    mkdirSync(dirname(stable), { recursive: true, mode: 0o700 });
    const sentinel = `${stable}.tmp-${process.pid}`;
    writeFileSync(sentinel, "preserve", { mode: 0o600 });
    const calls: string[][] = [];
    expect(installLaunchAgent(binary, env, "darwin", args => { calls.push([...args]); return null; })).toBe("installed");
    expect(calls.map(args => args[0])).toEqual(["print", "print", "bootstrap"]);
    expect(readFileSync(stable, "utf8")).toBe("prebuilt-v1");
    expect(readFileSync(sentinel, "utf8")).toBe("preserve");
    expect(lstatSync(dirname(plist)).mode & 0o777).toBe(0o755);
    expect(lstatSync(stable).mode & 0o777).toBe(0o700);
    expect(readFileSync(plist, "utf8")).toBe(launchAgentPlist(stable));
  });

  test("retries a failed bootstrap and stops the owned service before an upgrade", () => {
    const { binary, env, stable, plist } = fixture();
    expect(() => installLaunchAgent(binary, env, "darwin", args => { if (args[0] === "bootstrap") throw new Error("bootstrap failed"); return null; })).toThrow("bootstrap failed");
    writeFileSync(binary, "prebuilt-v2");
    const calls: string[] = [];
    installLaunchAgent(binary, env, "darwin", (args, allowMissing) => {
      if (args[0] === "print") return `gui/${process.getuid?.()}/com.hraness.slopcamera.menubar = {\n\tpath = ${plist}\n\tprogram = ${stable}\n\targuments = {\n\t\t${stable}\n\t}\n}\n`;
      calls.push(args[0]!);
      if (args[0] === "bootout") {
        expect(allowMissing).toBe(true);
        expect(readFileSync(stable, "utf8")).toBe("prebuilt-v1");
      } else expect(readFileSync(stable, "utf8")).toBe("prebuilt-v2");
      return null;
    });
    expect(calls).toEqual(["bootout", "bootstrap"]);
    expect(resolveMenubarBinary(env.HOME, { ...env, SLOPCAMERA_MENUBAR: `${binary}-missing` })).toBe(null);
  });

  test("preserves loaded foreign services even beside a matching owned plist", () => {
    const { binary, env, stable, plist } = fixture();
    installLaunchAgent(binary, env, "darwin", () => null);
    const calls: string[] = [];
    const foreign = (args: readonly string[]) => {
      calls.push(args[0]!);
      return `gui/${process.getuid?.()}/com.hraness.slopcamera.menubar = {\n\tpath = ${plist}\n\tprogram = /foreign\n\targuments = {\n\t\t/foreign\n\t}\n}\n`;
    };
    expect(() => installLaunchAgent(binary, env, "darwin", foreign)).toThrow();
    expect(() => uninstallLaunchAgent(stable, env, "darwin", foreign)).toThrow();
    expect(calls).toEqual(["print", "print"]);
    expect(readFileSync(stable, "utf8")).toBe("prebuilt-v1");
    expect(readFileSync(plist, "utf8")).toBe(launchAgentPlist(stable));
  });

  test("refuses foreign plist and unsafe file types without launchctl or writes", () => {
    for (const kind of ["foreign", "symlink", "directory"] as const) {
      const { binary, env, plist, stable } = fixture();
      mkdirSync(dirname(plist), { recursive: true, mode: 0o700 });
      if (kind === "foreign") writeFileSync(plist, "foreign", { mode: 0o600 });
      else if (kind === "symlink") symlinkSync(binary, plist);
      else mkdirSync(plist);
      const run = () => { throw new Error("must not call launchctl"); };
      expect(() => installLaunchAgent(binary, env, "darwin", run)).toThrow();
      expect(() => uninstallLaunchAgent(stable, env, "darwin", run)).toThrow();
      expect(existsSync(stable)).toBe(false);
      if (kind === "foreign") expect(readFileSync(plist, "utf8")).toBe("foreign");
      expect(readFileSync(binary, "utf8")).toBe("prebuilt-v1");
    }
  });

  test("refuses symbolic-link install parents and unowned orphan binaries", () => {
    const { home, binary, env, stable } = fixture();
    const elsewhere = join(home, "elsewhere");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(home, "Library"));
    expect(() => installLaunchAgent(binary, env, "darwin", () => null)).toThrow();
    rmSync(join(home, "Library"));
    mkdirSync(dirname(stable), { recursive: true, mode: 0o700 });
    writeFileSync(stable, "unmanaged", { mode: 0o700 });
    expect(() => installLaunchAgent(binary, env, "darwin", () => null)).toThrow();
    expect(readFileSync(stable, "utf8")).toBe("unmanaged");
  });

  test("status and uninstall survive removal of the original build", async () => {
    const { home, binary, env, stable, plist } = fixture();
    installLaunchAgent(binary, env, "darwin", () => null);
    rmSync(binary);
    expect(launchAgentState(stable, env)).toBe("installed");
    const output: string[] = [];
    const io: CliIo = { cwd: () => home, env, now: () => new Date(), platform: "darwin", stdout: text => { output.push(text); }, stderr: () => null };
    await manageMenubar(io, home, "status", true, () => null);
    expect(JSON.parse(output.join(""))).toEqual({ launchAgent: "installed", running: false });
    expect(uninstallLaunchAgent(stable, env, "darwin", () => null)).toBe("absent");
    expect(existsSync(plist)).toBe(false);
    expect(existsSync(stable)).toBe(false);
    expect(launchAgentState(stable, env)).toBe("absent");
  });
});

const UTF8 = { LANG: "en_US.UTF-8" };

describe("Slopcamera menu-bar copy", () => {
  test("another running copy is success, not a startup failure", () => {
    expect(launchOutcome(ALREADY_RUNNING_EXIT, true)).toBe("already-running");
    expect(launchOutcome(ALREADY_RUNNING_EXIT, false)).toBe("already-running");
    expect(launchOutcome(null, false)).toBe("running");
    expect(launchOutcome(0, true)).toBe("exited");
    expect(() => launchOutcome(1, true)).toThrow("slopcamera menubar --foreground");
    expect(() => launchOutcome(0, false)).toThrow();
    expect(launchMessage("already-running", UTF8)).toBe("✓ Slopcamera is already in your menu bar. Look for 📷.");
    expect(launchMessage("running", { TERM: "dumb", LANG: "en_US.UTF-8" })).toBe("OK Slopcamera is in your menu bar. Look for 📷.");
  });

  test("launch reports an already-running menu bar in text and JSON", async () => {
    const { home, env } = fixture();
    for (const json of [false, true]) {
      const output: string[] = [];
      const io: CliIo = { cwd: () => home, env: { ...env, ...UTF8 }, now: () => new Date(), platform: "darwin", stdout: text => { output.push(text); }, stderr: () => null };
      await launchMenubar(io, home, json, "background", async () => ALREADY_RUNNING_EXIT);
      if (json) expect(JSON.parse(output.join(""))).toEqual({ running: true, foreground: false, alreadyRunning: true });
      else expect(output.join("")).toBe("✓ Slopcamera is already in your menu bar. Look for 📷.\n");
    }
  });

  test("install shows the login-item notice first and status checks liveness", async () => {
    const { home, env } = fixture();
    const output: string[] = [];
    const errors: string[] = [];
    const io: CliIo = { cwd: () => home, env: { ...env, ...UTF8 }, now: () => new Date(), platform: "darwin", stdout: text => { output.push(text); }, stderr: text => { errors.push(text); } };
    await manageMenubar(io, home, "install", false, () => null);
    expect(errors.join("")).toBe(loginItemNotice(UTF8));
    expect(errors.join("")).toContain("That's Slopcamera's menu bar.");
    expect(output.join("")).toBe("✓ Slopcamera opens in your menu bar now and at every login. Look for 📷.\n  Remove it any time: slopcamera menubar uninstall\n");
    output.length = 0;
    await manageMenubar(io, home, "status", false, () => "gui/501/com.hraness.slopcamera.menubar = {\n\tstate = running\n}\n");
    expect(output.join("")).toBe("✓ Slopcamera opens at login and is in your menu bar now.\n");
  });

  test("status explains a login item that isn't running", () => {
    expect(serviceRunning(() => null)).toBe(false);
    expect(serviceRunning(() => "x = {\n\tstate = not running\n}\n")).toBe(false);
    expect(stateMessage("status", "installed", false, UTF8)).toBe(
      "⚠ Slopcamera is set to open at login but isn't running. It may be turned off in System Settings › General › Login Items & Extensions.\n→ slopcamera menubar install",
    );
    expect(stateMessage("status", "absent", false, UTF8)).toBe("Slopcamera doesn't open at login.\n→ slopcamera menubar install");
    expect(stateMessage("uninstall", "absent", false, UTF8)).toBe("✓ Slopcamera no longer opens in your menu bar at login.");
  });

  test("help menubar has its own page and matches the usage error", () => {
    const page = commandHelp(["menubar"]);
    expect(page).not.toBe(commandHelp([]));
    expect(page.startsWith("Usage:\n  slopcamera menubar [--foreground|--background] [--json]\n")).toBe(true);
    expect(page).toContain("already in your menu bar");
    expect(commandHelp([])).toContain("menubar [--foreground|--background]");
    expect(commandHelp([])).not.toContain("Agents: after useful work");
    expect(commandHelp([])).not.toContain("host-owned typed");
  });
});

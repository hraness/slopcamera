import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { CliIo } from "./io";
import { ALREADY_RUNNING_EXIT, helperEnvironment, installBinary, installedBinaryPath, launchAgentPath, launchAgentPlist, launchMenubar, launchMessage, launchOutcome, manageMenubar, outputsRoot, removeLegacyAgent, resolveMenubarBinary, type HelperResult } from "./menubar";
import { commandHelp } from "./help";
import { parseCliArgs } from "./args";

const fixtures: string[] = [];
function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "slopcamera-menubar-")));
  fixtures.push(home);
  const binary = join(home, "new-build");
  writeFileSync(binary, "prebuilt-v1", { mode: 0o700 });
  const env = { HOME: home, SLOPCAMERA_MENUBAR: binary, LANG: "en_US.UTF-8" };
  return { home, binary, env, stable: installedBinaryPath(env), legacy: launchAgentPath(env) };
}
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

function recorder(result: HelperResult) {
  const calls: { binary: string; args: readonly string[]; audience: string | undefined }[] = [];
  const run = async (binary: string, args: readonly string[], env: Readonly<Record<string, string | undefined>>) => {
    calls.push({ binary, args, audience: env.HRANESS_AUDIENCE });
    return result;
  };
  return { calls, run };
}

function io(home: string, env: Readonly<Record<string, string | undefined>>) {
  const output: string[] = [];
  const errors: string[] = [];
  const value: CliIo = { cwd: () => home, env, now: () => new Date(), platform: "darwin", stdout: text => { output.push(text); }, stderr: text => { errors.push(text); } };
  return { io: value, output, errors };
}

describe("Slopcamera menu-bar launcher", () => {
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

  test("installs the build as an owner-only copy and replaces an earlier one", () => {
    const { binary, env, stable } = fixture();
    expect(installBinary(binary, env)).toBe(stable);
    expect(readFileSync(stable, "utf8")).toBe("prebuilt-v1");
    expect(statSync(stable).mode & 0o777).toBe(0o700);
    writeFileSync(binary, "prebuilt-v2", { mode: 0o700 });
    installBinary(binary, env);
    expect(readFileSync(stable, "utf8")).toBe("prebuilt-v2");
    chmodSync(stable, 0o722);
    expect(() => installBinary(binary, env)).toThrow();
  });

  test("refuses symbolic-link install parents", () => {
    const { home, binary, env } = fixture();
    mkdirSync(join(home, "elsewhere"));
    symlinkSync(join(home, "elsewhere"), join(home, "Library"));
    expect(() => installBinary(binary, env)).toThrow();
  });

  test("removes only the exact login item earlier releases wrote", () => {
    const { env, stable, legacy } = fixture();
    expect(removeLegacyAgent(env)).toBe("absent");
    mkdirSync(dirname(legacy), { recursive: true, mode: 0o700 });
    writeFileSync(legacy, "<plist>hand written</plist>\n", { mode: 0o600 });
    expect(removeLegacyAgent(env)).toBe("foreign");
    expect(existsSync(legacy)).toBe(true);
    writeFileSync(legacy, launchAgentPlist(stable), { mode: 0o600 });
    expect(removeLegacyAgent(env)).toBe("removed");
    expect(existsSync(legacy)).toBe(false);
  });

  test("install copies the build, retires the old login item and hands over to the menu bar", async () => {
    const { home, env, stable, legacy } = fixture();
    mkdirSync(dirname(legacy), { recursive: true, mode: 0o700 });
    writeFileSync(legacy, launchAgentPlist(stable), { mode: 0o600 });
    const { calls, run } = recorder({ code: 0, stdout: "✓ Slopcamera will open at login\n", stderr: "🔐 notice\n" });
    const terminal = io(home, env);
    await manageMenubar(terminal.io, home, "install", false, run);
    expect(calls).toEqual([{ binary: stable, args: ["install"], audience: "human" }]);
    expect(terminal.output.join("")).toBe("✓ Slopcamera will open at login\n");
    expect(terminal.errors.join("")).toBe("🔐 notice\n");
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(stable)).toBe(true);
  });

  test("a refused change surfaces the menu bar's own sentence once", async () => {
    const { home, env } = fixture();
    const { run } = recorder({ code: 1, stdout: "", stderr: "✗ Slopcamera's login item was changed outside slopcamera, so it was left alone.\n→ slopcamera menubar install\n" });
    const terminal = io(home, env);
    await expect(manageMenubar(terminal.io, home, "install", false, run)).rejects.toThrow(
      "Slopcamera's login item was changed outside slopcamera, so it was left alone.\n→ slopcamera menubar install",
    );
    expect(terminal.errors).toEqual([]);
  });

  test("status and uninstall work without the original build", async () => {
    const { home, binary, env, stable } = fixture();
    installBinary(binary, env);
    rmSync(binary);
    const { calls, run } = recorder({ code: 0, stdout: "{\"login\":\"on\"}\n", stderr: "" });
    const agent = io(home, { ...env, CLAUDECODE: "1" });
    await manageMenubar(agent.io, home, "status", true, run);
    expect(calls[0]).toEqual({ binary: stable, args: ["status", "--json"], audience: undefined });
    expect(agent.output.join("")).toBe("{\"login\":\"on\"}\n");
    await manageMenubar(agent.io, home, "uninstall", false, run);
    expect(calls[1]?.args).toEqual(["uninstall"]);
    expect(existsSync(stable)).toBe(false);
  });

  test("status says plainly when the menu bar isn't installed", async () => {
    const { home, env } = fixture();
    const { calls, run } = recorder({ code: 0, stdout: "", stderr: "" });
    const terminal = io(home, env);
    await manageMenubar(terminal.io, home, "status", false, run);
    expect(calls).toEqual([]);
    expect(terminal.output.join("")).toBe("Slopcamera's menu bar isn't installed.\n→ slopcamera menubar install\n");
    const json = io(home, env);
    await manageMenubar(json.io, home, "status", true, run);
    expect(JSON.parse(json.output.join(""))).toEqual({ login: "off", running: false, installed: false });
  });

  test("the helper sees a person as human and an agent as an agent", () => {
    expect(helperEnvironment({ HOME: "/x" }).HRANESS_AUDIENCE).toBe("human");
    expect(helperEnvironment({ HOME: "/x", CLAUDECODE: "1" }).HRANESS_AUDIENCE).toBeUndefined();
    expect(helperEnvironment({ HOME: "/x", HRANESS_AUDIENCE: "quiet" }).HRANESS_AUDIENCE).toBe("quiet");
  });

  test("start opens it now and returns", () => {
    expect(parseCliArgs(["menubar", "start"])).toEqual({ kind: "menubar", action: "run", mode: "background", json: false });
    expect(() => parseCliArgs(["menubar", "stop"])).toThrow("install|uninstall|status|start");
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

  test("help menubar has its own page and matches the usage error", () => {
    const page = commandHelp(["menubar"]);
    expect(page).not.toBe(commandHelp([]));
    expect(page.startsWith("Usage:\n  slopcamera menubar [--foreground|--background] [--json]\n")).toBe(true);
    expect(page).toContain("already in your menu bar");
    expect(page).toContain("isn't listed in");
    // Hidden until released packages include the menu bar.
    expect(commandHelp([])).not.toContain("menubar");
    expect(commandHelp([])).not.toContain("Agents: after useful work");
    expect(commandHelp([])).not.toContain("host-owned typed");
  });
});

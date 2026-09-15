import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { CliIo } from "./io";
import { installedBinaryPath, installLaunchAgent, interpretLaunchctlResult, launchAgentPath, launchAgentPlist, launchAgentState, manageMenubar, outputsRoot, resolveMenubarBinary, uninstallLaunchAgent } from "./menubar";

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
    await manageMenubar(io, home, "status", true);
    expect(JSON.parse(output.join(""))).toEqual({ launchAgent: "installed" });
    expect(uninstallLaunchAgent(stable, env, "darwin", () => null)).toBe("absent");
    expect(existsSync(plist)).toBe(false);
    expect(existsSync(stable)).toBe(false);
    expect(launchAgentState(stable, env)).toBe("absent");
  });
});

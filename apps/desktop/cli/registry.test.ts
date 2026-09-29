import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import { HranessError, type CliIO } from "@hraness/desktop-foundation/registry";

import { completions } from "./help";
import type { ProcessRunner, RunOptions } from "./io";
import { oldCliPlist } from "./legacy-login";
import { CliError } from "./errors";
import { asHranessError, isRegistryCommand, runRegistry, slopcameraRegistry, type RegistryDependencies } from "./registry";
import { CLI_VERBS } from "./verbs";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function sandbox(): { home: string; stateRoot: string; outputs: string } {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "slopcamera-registry-")));
  dirs.push(home);
  const stateRoot = join(home, "Library", "Application Support", "Slopcamera", "cli");
  mkdirSync(stateRoot, { recursive: true });
  mkdirSync(join(home, "Library", "LaunchAgents"), { recursive: true });
  return { home, stateRoot, outputs: join(home, "Library", "Application Support", "Slopcamera", "outputs") };
}

class RecordingRunner implements ProcessRunner {
  readonly calls: (readonly string[])[] = [];
  async run(argv: readonly string[], _options?: RunOptions) {
    this.calls.push(argv);
    return { exitCode: 0, stdout: "", stderr: "" };
  }
}

async function run(argv: readonly string[], deps: Partial<RegistryDependencies> & { home: string }) {
  let stdout = "";
  let stderr = "";
  const io: CliIO = {
    stdout: { write: (text: string) => { stdout += text; } },
    stderr: { write: (text: string) => { stderr += text; } },
    env: { HOME: deps.home, PATH: "" },
    audience: "agent",
  };
  const code = await runRegistry(argv, io, {
    env: { HOME: deps.home, PATH: "" },
    platform: "darwin",
    now: () => NOW,
    version: "9.9.9",
    stdoutIsTerminal: false,
    ...deps,
  });
  // Envelopes are read field by field in each test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
  } catch {
    json = undefined;
  }
  return { code, stdout, stderr, json };
}

/** Every command path the shell completion offers, down to its leaves. */
function completionLeaves(prefix: readonly string[] = []): string[][] {
  const children = completions([...prefix, ""]);
  const parent = prefix.length === 0 ? [] : completions([...prefix.slice(0, -1), ""]);
  if (prefix.length > 0 && (children.length === 0 || (prefix.length > 1 && children.join() === parent.join()))) return [[...prefix]];
  return children.flatMap(word => completionLeaves([...prefix, word]));
}

describe("slopcamera commands", () => {
  test("every completion path has a class, and every listed verb is a real command", () => {
    const listed = new Set([...CLI_VERBS.map(row => row.path.join(" ")), "commands"]);
    // `edit <recording> <operation>` is one verb; completion offers its operations.
    const missing = completionLeaves().map(path => path.join(" "))
      .filter(path => !path.startsWith("edit "))
      .filter(path => !listed.has(path));
    expect(missing).toEqual([]);
    const registryOwned = new Set(["status", "tui", "legacy retire", "outputs list", "outputs open", "outputs reveal"]);
    for (const row of CLI_VERBS) {
      const path = row.path.join(" ");
      if (registryOwned.has(path)) {
        expect(isRegistryCommand(row.path)).toBe(true);
        continue;
      }
      expect(isRegistryCommand(row.path)).toBe(false);
      // Every listed verb is one the shell completion also offers, word by word.
      for (let depth = 0; depth < row.path.length; depth += 1) {
        expect({ path, offered: completions([...row.path.slice(0, depth), ""]).includes(row.path[depth]!) }).toEqual({ path, offered: true });
      }
    }
  });

  test("commands --json lists every verb once with a class; runs approve stays decide-legacy", async () => {
    const { home } = sandbox();
    const result = await run(["commands", "--json"], { home });
    expect(result.code).toBe(0);
    expect(result.json.schema).toBe("hraness.commands/1");
    const verbs = result.json.data.verbs as { path: string[]; opClass: string; gate?: string }[];
    expect(new Set(verbs.map(verb => verb.path.join(" "))).size).toBe(verbs.length);
    expect(verbs.length).toBe(slopcameraRegistry({ env: {}, platform: "darwin", now: () => NOW }).verbs.length);
    expect(verbs.find(verb => verb.path.join(" ") === "runs approve")?.opClass).toBe("decide-legacy");
    // Nothing is a gated decide verb today, so nothing can ever prompt.
    expect(verbs.filter(verb => verb.opClass === "decide" || verb.gate !== undefined)).toEqual([]);
    for (const verb of ["status", "tui", "commands", "outputs list", "capabilities", "doctor"]) {
      if (verb === "commands") continue;
      expect(verbs.find(item => item.path.join(" ") === verb)?.opClass).toBe("read");
    }
  });

  test("status --json and tui --snapshot on a clean HOME, with no terminal and an empty PATH", async () => {
    const { home, stateRoot } = sandbox();
    const status = await run(["status", "--json"], { home, stateRoot });
    expect(status.code).toBe(0);
    expect(status.json.ok).toBe(true);
    expect(status.json.schema).toBe("slopcamera.status/1");
    expect(status.json.data.activity.state).toBe("idle");
    expect(status.json.data.legacyLoginItem).toEqual({ state: "none" });

    const snapshot = await run(["tui", "--snapshot", "--width", "40"], { home, stateRoot });
    expect(snapshot.code).toBe(0);
    expect(snapshot.stdout.startsWith("== Slopcamera ==\n")).toBe(true);
    expect(snapshot.stdout).not.toContain("\u001b");

    // Without a terminal, plain `tui` prints the snapshot instead of taking over the screen.
    const plain = await run(["tui"], { home, stateRoot });
    expect(plain.code).toBe(0);
    expect(plain.stdout.startsWith("== Slopcamera ==\n")).toBe(true);
    expect(plain.stdout).not.toContain("\u001b");

    const json = await run(["tui", "--json"], { home, stateRoot });
    expect(json.json.schema).toBe("slopcamera.status/1");

    for (const argv of [["tui", "--width", "5"], ["tui", "extra"], ["status", "--bogus"]]) {
      const bad = await run([...argv, "--json"], { home, stateRoot });
      expect(bad.code).toBe(2);
      expect(bad.json.error.code).toBe("usage");
    }
    // Reading status creates nothing.
    expect(readdirSync(stateRoot)).toEqual([]);
  });

  test("status flags a found login item and legacy retire moves it aside", async () => {
    const { home, stateRoot } = sandbox();
    const item = join(home, "Library", "LaunchAgents", "com.hraness.slopcamera.menubar.plist");
    writeFileSync(item, oldCliPlist("/Applications/x/slopcamera-menubar"));
    const before = await run(["status", "--json"], { home, stateRoot });
    expect(before.json.data.legacyLoginItem).toEqual({ state: "found", label: "com.hraness.slopcamera.menubar" });
    expect(before.json.next.map((step: { command: string }) => step.command)).toContain("slopcamera legacy retire --json");

    const booted: string[] = [];
    const retired = await run(["legacy", "retire", "--json"], { home, stateRoot, retire: { bootout: async (label) => { booted.push(label); }, now: () => NOW } });
    expect(retired.code).toBe(0);
    expect(retired.json.data.retired).toEqual([{ label: "com.hraness.slopcamera.menubar", from: item, to: `${item}.retired-${NOW.getTime()}` }]);
    expect(booted).toEqual(["com.hraness.slopcamera.menubar"]);
    expect(readdirSync(join(home, "Library", "LaunchAgents"))).toEqual([`com.hraness.slopcamera.menubar.plist.retired-${NOW.getTime()}`]);

    const again = await run(["legacy", "retire"], { home, stateRoot, retire: { bootout: async () => {} } });
    expect(again.stdout).toBe("Nothing to retire. The old menu bar doesn't open at login.\n");

    const linux = await run(["legacy", "retire", "--json"], { home, stateRoot, platform: "linux" });
    expect(linux.json.data).toEqual({ retired: [], loginItem: { state: "none" } });
  });

  test("application errors keep shared codes and prefix the rest with the product", () => {
    for (const [code, expected] of [["usage", "usage"], ["not-found", "not-found"], ["conflict", "conflict"], ["unavailable", "slopcamera.unavailable"], ["unsafe-path", "slopcamera.unsafe-path"]] as const) {
      const mapped = asHranessError(new CliError(code, "why"));
      expect(mapped).toBeInstanceOf(HranessError);
      expect((mapped as HranessError).code).toBe(expected);
    }
    const other = new Error("plain");
    expect(asHranessError(other)).toBe(other);
  });

  test("legacy retire without an absolute HOME answers slopcamera.unavailable, not an internal failure", async () => {
    const { home, stateRoot } = sandbox();
    for (const HOME of ["", "relative"]) {
      const result = await run(["legacy", "retire", "--json"], { home, stateRoot, env: { HOME, PATH: "" }, retire: { bootout: async () => { throw new Error("must not boot out"); } } });
      expect(result.json.ok).toBe(false);
      expect(result.json.error.code).toBe("slopcamera.unavailable");
      expect(result.json.error.message).toContain("HOME must be an absolute directory");
      expect(result.code).not.toBe(0);
    }
  });

  test("outputs list, open and reveal touch only files in the outputs folder", async () => {
    const { home, stateRoot, outputs } = sandbox();
    const runner = new RecordingRunner();
    const missing = await run(["outputs", "open", "--json"], { home, stateRoot, runner });
    expect(missing.json.error.code).toBe("not-found");
    expect(runner.calls).toEqual([]);

    mkdirSync(outputs);
    writeFileSync(join(outputs, "cut.mp4"), "video");
    mkdirSync(join(outputs, "folder"));
    const list = await run(["outputs", "list", "--json"], { home, stateRoot });
    expect(list.json.data.outputs.map((item: { name: string }) => item.name)).toEqual(["cut.mp4"]);

    await run(["outputs", "open", "--json"], { home, stateRoot, runner });
    await run(["outputs", "open", "cut.mp4", "--json"], { home, stateRoot, runner });
    await run(["outputs", "reveal", "cut.mp4", "--json"], { home, stateRoot, runner });
    expect(runner.calls).toEqual([
      ["/usr/bin/open", "--", outputs],
      ["/usr/bin/open", "--", join(outputs, "cut.mp4")],
      ["/usr/bin/open", "-R", "--", join(outputs, "cut.mp4")],
    ]);

    for (const name of ["../cli", "/etc/passwd", ".hidden", "folder", "nope.mp4", "a\\b"]) {
      const bad = await run(["outputs", "open", name, "--json"], { home, stateRoot, runner });
      expect(bad.json.ok).toBe(false);
      expect(["usage", "not-found"]).toContain(bad.json.error.code);
    }
    const reveal = await run(["outputs", "reveal", "--json"], { home, stateRoot, runner });
    expect(reveal.json.error.code).toBe("usage");
    expect(runner.calls.length).toBe(3);

    const linux = await run(["outputs", "open", "--json"], { home, stateRoot, runner, platform: "linux" });
    expect(linux.json.error.code).toBe("unsupported-platform");
    expect(runner.calls.length).toBe(3);
  });

  test("only the registry verbs route to the registry", () => {
    expect(isRegistryCommand(["status"])).toBe(true);
    expect(isRegistryCommand(["outputs"])).toBe(false);
    expect(isRegistryCommand(["outputs", "--json"])).toBe(false);
    expect(isRegistryCommand(["outputs", "list"])).toBe(true);
    expect(isRegistryCommand(["credits", "status"])).toBe(false);
    expect(isRegistryCommand([])).toBe(false);
  });
});

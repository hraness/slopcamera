import { describe, expect, test } from "bun:test";
import { missingToolsRecovery, personAtTerminal, preflightDeveloperTools, xcodeToolsNotice, type Environment, type PreflightDependencies } from "./developer-tools";

const UTF8: Environment = { LANG: "en_US.UTF-8" };

function harness(installed: boolean, env: Environment, interactive: boolean, answer = "") {
  const ran: string[][] = [];
  const written: string[] = [];
  const deps: PreflightDependencies = {
    env,
    interactive,
    run: async command => { ran.push([...command]); return command[1] === "-p" ? (installed ? 0 : 2) : 0; },
    ask: async () => answer,
    write: text => { written.push(text); },
  };
  return { deps, ran, written };
}

describe("developer tools preflight", () => {
  test("installed tools pass without output or any install window", async () => {
    const { deps, ran, written } = harness(true, UTF8, true);
    expect(await preflightDeveloperTools(deps)).toBe("ready");
    expect(ran).toEqual([["/usr/bin/xcode-select", "-p"]]);
    expect(written).toEqual([]);
  });

  test("scripts and agents get the recovery and nothing opens", async () => {
    for (const [env, interactive] of [[UTF8, false], [{ ...UTF8, CLAUDECODE: "1" }, true]] as const) {
      const { deps, ran, written } = harness(false, env, interactive);
      expect(await preflightDeveloperTools(deps)).toBe("missing");
      expect(ran).toEqual([["/usr/bin/xcode-select", "-p"]]);
      expect(written.join("")).toBe("✗ Slopcamera needs Apple's command line tools. Nothing was installed.\n→ xcode-select --install\n");
    }
  });

  test("a person sees the notice and can skip", async () => {
    const { deps, ran, written } = harness(false, UTF8, true, "s\n");
    expect(await preflightDeveloperTools(deps)).toBe("skipped");
    expect(ran).toEqual([["/usr/bin/xcode-select", "-p"]]);
    expect(written[0]).toBe(xcodeToolsNotice(UTF8, true));
    expect(written[1]).toBe("Skipped. Face analysis stays off until the tools are installed.\n");
  });

  test("Enter opens macOS's install window once and says what to do next", async () => {
    const { deps, ran, written } = harness(false, UTF8, true, "\n");
    expect(await preflightDeveloperTools(deps)).toBe("installing");
    expect(ran).toEqual([["/usr/bin/xcode-select", "-p"], ["/usr/bin/xcode-select", "--install"]]);
    expect(written.at(-1)).toBe("→ Finish the install in the macOS window, then run bun run build:desktop:analysis:macos again.\n");
  });

  test("the notice follows the XCODE_TOOLS template with ASCII fallbacks", () => {
    expect(xcodeToolsNotice(UTF8, true)).toBe(
      "🔐 Slopcamera needs Apple's command line tools to build a small helper. macOS will offer to install them (about 1 GB).\n"
      + "   Nothing is installed unless you agree in that window. Or skip: face analysis stays off.\n"
      + "   Press Enter to continue · s to skip\n",
    );
    expect(xcodeToolsNotice({ TERM: "dumb", LANG: "en_US.UTF-8" }, false).startsWith("NOTE Slopcamera needs")).toBe(true);
    expect(missingToolsRecovery({})).toBe("FAIL Slopcamera needs Apple's command line tools. Nothing was installed.\n-> xcode-select --install\n");
  });

  test("audience follows exact agent markers and HRANESS_AUDIENCE", () => {
    expect(personAtTerminal({}, true)).toBe(true);
    expect(personAtTerminal({}, false)).toBe(false);
    expect(personAtTerminal({ CODEX_HOME: "/x" }, true)).toBe(true);
    expect(personAtTerminal({ GEMINI_CLI: "1" }, true)).toBe(false);
    expect(personAtTerminal({ HRANESS_AUDIENCE: "human", CLAUDECODE: "1" }, false)).toBe(true);
    expect(personAtTerminal({ HRANESS_AUDIENCE: "agent" }, true)).toBe(false);
  });
});

/**
 * Preflight for Apple's command line tools before the face-analyzer build.
 *
 * Running `xcrun` without the tools opens macOS's install dialog, so the build
 * asks `xcode-select -p` first, which never opens a window. A person at a
 * terminal sees the shared XCODE_TOOLS notice and chooses; scripts and agents
 * get the recovery and nothing opens.
 * TODO(df-0.8): use permissionStatus('developer-tools') and the kit's notice.
 */

export const AGENT_MARKERS = ["AI_AGENT", "CLAUDECODE", "CODEX_SANDBOX", "CODEX_SANDBOX_NETWORK_DISABLED", "CURSOR_AGENT", "GEMINI_CLI"] as const;

export type Environment = Readonly<Record<string, string | undefined>>;
export type Runner = (command: readonly string[]) => Promise<number>;
export type Asker = () => Promise<string>;

export interface PreflightDependencies {
  readonly env: Environment;
  /** stdin and stderr are both terminals. */
  readonly interactive: boolean;
  readonly run: Runner;
  readonly ask: Asker;
  readonly write: (text: string) => void;
}

export type PreflightOutcome = "ready" | "installing" | "skipped" | "missing";

function marks(env: Environment): { readonly note: string; readonly fail: string; readonly next: string } {
  const utf8 = [env.LC_ALL, env.LC_CTYPE, env.LANG].some(value => value !== undefined && /utf-?8/i.test(value));
  return env.TERM === "dumb" || !utf8 || env.HRANESS_ASCII === "1"
    ? { note: "NOTE", fail: "FAIL", next: "->" }
    : { note: "🔐", fail: "✗", next: "→" };
}

/** Human unless an agent marker or HRANESS_AUDIENCE says otherwise, and only at a terminal. */
export function personAtTerminal(env: Environment, interactive: boolean): boolean {
  if (env.HRANESS_AUDIENCE === "human") return true;
  if (env.HRANESS_AUDIENCE !== undefined && env.HRANESS_AUDIENCE !== "") return false;
  if (AGENT_MARKERS.some(name => (env[name] ?? "") !== "")) return false;
  return interactive;
}

export function xcodeToolsNotice(env: Environment, confirm: boolean): string {
  const lines = [
    `${marks(env).note} Slopcamera needs Apple's command line tools to build a small helper. macOS will offer to install them (about 1 GB).`,
    "   Nothing is installed unless you agree in that window. Or skip: face analysis stays off.",
  ];
  if (confirm) lines.push("   Press Enter to continue · s to skip");
  return `${lines.join("\n")}\n`;
}

export function missingToolsRecovery(env: Environment): string {
  const mark = marks(env);
  return `${mark.fail} Slopcamera needs Apple's command line tools. Nothing was installed.\n${mark.next} xcode-select --install\n`;
}

export function installingMessage(env: Environment): string {
  return `${marks(env).next} Finish the install in the macOS window, then run bun run build:desktop:analysis:macos again.\n`;
}

/** Reads whether the tools are installed without opening any window. */
export async function developerToolsInstalled(run: Runner): Promise<boolean> {
  return (await run(["/usr/bin/xcode-select", "-p"])) === 0;
}

export async function preflightDeveloperTools(deps: PreflightDependencies): Promise<PreflightOutcome> {
  if (await developerToolsInstalled(deps.run)) return "ready";
  if (!personAtTerminal(deps.env, deps.interactive)) {
    deps.write(missingToolsRecovery(deps.env));
    return "missing";
  }
  deps.write(xcodeToolsNotice(deps.env, true));
  const answer = (await deps.ask()).trim().toLowerCase();
  if (answer === "s") {
    deps.write("Skipped. Face analysis stays off until the tools are installed.\n");
    return "skipped";
  }
  // Opens macOS's own install window and returns right away.
  await deps.run(["/usr/bin/xcode-select", "--install"]);
  deps.write(installingMessage(deps.env));
  return "installing";
}

export async function runQuietly(command: readonly string[]): Promise<number> {
  try {
    const child = Bun.spawn([...command], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    return await child.exited;
  } catch {
    return 127;
  }
}

export async function readAnswer(): Promise<string> {
  for await (const line of console) return line;
  return "";
}

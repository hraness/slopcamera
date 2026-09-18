import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { rootHelpIntro } from "./root-help-intro";

const terminal = { isTTY: true, term: "xterm-256color", columns: 80 } as const;

test("only interactive root help receives the small plain ASCII camera", () => {
  const expected = "   __\n _|__|_\n|  (o) |\n|______|\n\n";
  for (const argv of [[], ["help"], ["--help"], ["-h"]]) {
    expect(rootHelpIntro(argv, terminal)).toBe(expected);
    expect(rootHelpIntro(argv, { ...terminal, isTTY: false })).toBe("");
  }
  expect(expected).toMatch(/^[\x20-\x7e\n]+$/u);
  expect(expected.split("\n").every(line => line.length <= 8)).toBe(true);
  for (const argv of [["--version"], ["version"], ["complete"], ["--json"], ["--help", "--json"], ["--json", "--help"], ["help", "diagram"], ["diagram", "--help"]]) {
    expect(rootHelpIntro(argv, terminal)).toBe("");
  }
});

test("arbitrary extra arguments and non-TTY output never acquire decoration", () => {
  let seed = 0x251ca;
  for (let sample = 0; sample < 64; sample++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const extra = `--unknown-${seed.toString(16)}`;
    for (const root of ["help", "--help", "-h"]) {
      for (const argv of [[root, extra], [extra, root], [extra]]) {
        expect(rootHelpIntro(argv, terminal)).toBe("");
        expect(rootHelpIntro(argv, { ...terminal, isTTY: false })).toBe("");
      }
    }
  }
});

test("the entrypoint writes the intro only inside the repository-free discovery path", async () => {
  const source = await readFile(new URL("./main.ts", import.meta.url), "utf8");
  const early = source.indexOf('if (earlyCommand.kind === "help" || earlyCommand.kind === "version" || earlyCommand.kind === "complete" || earlyCommand.kind === "capabilities")');
  const intro = source.indexOf("rootHelpIntro(unifiedArgv, {");
  const existing = source.indexOf("return await runCli(unifiedArgv, { io: processIo });");
  const workspace = source.indexOf("const paths = await resolveRepositoryPaths(processIo.cwd()");
  expect(early).toBeGreaterThan(0);
  expect(intro).toBeGreaterThan(early);
  expect(existing).toBeGreaterThan(intro);
  expect(workspace).toBeGreaterThan(existing);
  expect(source).toContain('if (intro !== "") processIo.stdout(intro);');
});

test("dumb, narrow and unknown-width terminals retain undecorated output", () => {
  for (const argv of [[], ["help"], ["--help"], ["-h"]]) {
    expect(rootHelpIntro(argv, { ...terminal, columns: 48 })).not.toBe("");
    for (const columns of [undefined, 0, 1, 47, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rootHelpIntro(argv, { ...terminal, columns })).toBe("");
    }
    expect(rootHelpIntro(argv, { ...terminal, term: "dumb" })).toBe("");
  }
});

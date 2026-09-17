import { expect, test } from "bun:test";
import { z } from "zod";

import { assertAppleSiliconMacosCompiledCliHost } from "./build-compiled";
import {
  isEmbeddedVectorizeWorkerInvocation,
  main,
} from "./main";

test("accepts only the compiled bundle's exact internal vectorizer worker invocation", () => {
  expect(isEmbeddedVectorizeWorkerInvocation(
    ["/$bunfs/root/vectorize/worker.js"],
    "/$bunfs/root/cli/main.ts",
  )).toBe(true);
  expect(isEmbeddedVectorizeWorkerInvocation(
    ["/$bunfs/root/vectorize/worker.js", "extra"],
    "/$bunfs/root/cli/main.ts",
  )).toBe(false);
  expect(isEmbeddedVectorizeWorkerInvocation(
    ["/$bunfs/root/vectorize/worker.js"],
    "/repo/cli/main.ts",
  )).toBe(false);
});

test("lets the compiled bootstrap bind the bundled headless CLI", async () => {
  const delegated: string[][] = [];
  expect(await main(["diagram", "init", "smoke.diagram.json"], {
    runHeadless: argv => {
      delegated.push([...argv]);
      return Promise.resolve();
    },
  })).toBe(0);
  expect(delegated).toEqual([["diagram", "init", "smoke.diagram.json"]]);
});

test("keeps the copied native CLI behind its exact Apple Silicon macOS boundary", () => {
  expect(() => assertAppleSiliconMacosCompiledCliHost("darwin", "arm64"))
    .not.toThrow();
  expect(() => assertAppleSiliconMacosCompiledCliHost("linux", "x64"))
    .toThrow("Apple Silicon macOS artifact; received linux/x64");
  expect(() => assertAppleSiliconMacosCompiledCliHost("darwin", "x64"))
    .toThrow("Apple Silicon macOS artifact; received darwin/x64");
});

test("keeps portable and copied-native CLI builds as distinct manifest commands", async () => {
  const { scripts } = z.object({
    scripts: z.object({
      "build:desktop:cli": z.string(),
      "build:cli:macos": z.string(),
      "test:cli:compiled:macos": z.string(),
    }),
  }).parse(await Bun.file(new URL("../../../package.json", import.meta.url)).json());
  expect(scripts["build:desktop:cli"]).toBe(
    "bun -e 'await (await import(\"node:fs/promises\")).rm(\"./apps/desktop/dist/cli\", { recursive: true, force: true })' && bun build --target=bun --minify --sourcemap=none --packages external --external @hraness/slopcamera/cli apps/desktop/cli/main.ts --outdir apps/desktop/dist/cli",
  );
  expect(scripts["build:cli:macos"]).toBe("bun run ./apps/desktop/cli/build-compiled.ts");
  expect(scripts["test:cli:compiled:macos"]).toStartWith("bun run build:cli:macos &&");
});

test("routes credits to the shared protocol and maps credits-required to the existing authorization exit code", async () => {
  const { slopcameraCreditsRequiredExitCode } = await import("../../../src/credits");
  const { EXIT_CODE } = await import("./errors");
  expect(slopcameraCreditsRequiredExitCode).toBe(EXIT_CODE["authorization-required"]);
  const child = Bun.spawn([process.execPath, new URL("./main.ts", import.meta.url).pathname, "credits", "protocol", "--json"], {
    env: { ...process.env, HRANESS_SUPPORT_AUDIENCE: "off", HRANESS_SUPPORT_EMAIL: "off" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  expect(JSON.parse(stdout)).toMatchObject({
    schemaVersion: "hraness-credits-protocol-v1",
    product: { id: "slopcamera", name: "Slopcamera" },
    commands: { status: ["slopcamera", "credits", "status", "--json"] },
  });
});

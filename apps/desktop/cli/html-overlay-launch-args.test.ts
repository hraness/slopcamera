import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { htmlOverlayRendererContract } from "../application/html-overlay-integrity";
import type { HtmlOverlayLibrarySpecifier } from "../html-overlay";
import { createHtmlOverlayBrowserLaunchArgs } from "./html-overlay-renderer";

test("all current profiles bind clone prevention into Playwright's effective native argv", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-launch-argv-"));
  try {
    // A short-lived argv recorder, never a browser: exercise the installed Playwright boundary.
    const executablePath = join(root, "argv-recorder");
    const output = join(root, "argv.json");
    await writeFile(executablePath, `#!${process.execPath}\nawait Bun.write(${JSON.stringify(output)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o700 });
    for (const profile of [undefined, "three-webgl2-hardware-v1", "three-spark-webgl2-hardware-v1"] as const) {
      const libraries: HtmlOverlayLibrarySpecifier[] = profile === undefined ? [] : profile === "three-webgl2-hardware-v1"
        ? ["three"] : ["@sparkjsdev/spark", "three", "three/addons/postprocessing/Pass.js"];
      const args = createHtmlOverlayBrowserLaunchArgs(libraries, profile);
      const switches = args.filter(arg => arg.startsWith("--disable-features="));
      expect(switches).toEqual(["--disable-features=Translate,MediaRouter,OptimizationHints,PaintHolding,MacAppCodeSignClone"]);
      expect(args).toEqual([...htmlOverlayRendererContract(profile).launch.args]);
      await rm(output, { force: true });
      await expect(chromium.launch({ executablePath, args, headless: true, timeout: 5_000,
        env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root } })).rejects.toThrow();
      const actual = JSON.parse(await readFile(output, "utf8")) as string[];
      for (const argument of args) expect(actual).toContain(argument);
      // Chromium uses the last occurrence; Playwright places our bound args after its defaults.
      expect(actual.filter(arg => arg.startsWith("--disable-features=")).at(-1)).toBe(switches[0]);
    }
    expect(createHtmlOverlayBrowserLaunchArgs(["vgpu"]).filter(arg => arg.startsWith("--disable-features=")))
      .toEqual(htmlOverlayRendererContract().launch.args.filter(arg => arg.startsWith("--disable-features=")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

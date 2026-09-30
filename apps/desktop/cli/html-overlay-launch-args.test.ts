import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { chromium, type LaunchOptions } from "playwright-core";
import { htmlOverlayRendererContract } from "../application/html-overlay-integrity";
import type { HtmlOverlayLibrarySpecifier } from "../html-overlay";
import { createHtmlOverlayBrowserLaunchArgs, createHtmlOverlayBrowserLaunchOptions } from "./html-overlay-renderer";

test("all current profiles merge clone prevention into one switch and preserve Playwright defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-launch-argv-"));
  try {
    // A short-lived argv recorder, never a browser: exercise the installed Playwright boundary.
    const executablePath = join(root, "argv-recorder");
    const output = join(root, "argv.json");
    await writeFile(executablePath, `#!${process.execPath}\nawait Bun.write(${JSON.stringify(output)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o700 });
    const record = async (options: Pick<LaunchOptions, "args" | "ignoreDefaultArgs"> = {}): Promise<string[]> => {
      await rm(output, { force: true });
      await expect(chromium.launch({ executablePath, ...options, headless: true, timeout: 5_000,
        env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root } })).rejects.toThrow();
      return JSON.parse(await readFile(output, "utf8")) as string[];
    };
    const defaults = await record();
    const defaultSwitches = defaults.filter(arg => arg.startsWith("--disable-features="));
    expect(defaultSwitches).toHaveLength(1);
    const defaultFeatures = defaultSwitches[0]!.slice("--disable-features=".length).split(",");
    const expectedFeatures = [...new Set([...defaultFeatures, "MacAppCodeSignClone"])].sort();
    for (const profile of [undefined, "three-webgl2-hardware-v1", "three-spark-webgl2-hardware-v1"] as const) {
      const libraries: HtmlOverlayLibrarySpecifier[] = profile === undefined ? [] : profile === "three-webgl2-hardware-v1"
        ? ["three"] : ["@sparkjsdev/spark", "three", "three/addons/postprocessing/Pass.js"];
      const options = createHtmlOverlayBrowserLaunchOptions(libraries, profile);
      const args = options.args;
      const switches = args.filter(arg => arg.startsWith("--disable-features="));
      expect(switches).toHaveLength(1);
      expect(switches[0]!.slice("--disable-features=".length).split(",").sort()).toEqual(expectedFeatures);
      expect(args).toEqual([...htmlOverlayRendererContract(profile).launch.args]);
      expect(args).toEqual(createHtmlOverlayBrowserLaunchArgs(libraries, profile));
      expect(options.ignoreDefaultArgs).toEqual(defaultSwitches);
      const actual = await record(options);
      for (const argument of args) expect(actual).toContain(argument);
      expect(actual.filter(arg => arg.startsWith("--disable-features="))).toEqual(switches);
      for (const argument of defaults.filter(arg => !arg.startsWith("--disable-features=") && !arg.startsWith("--user-data-dir="))) {
        expect(actual).toContain(argument);
      }
      expect(actual).toContain("--mute-audio");
    }
    const vgpuOptions = createHtmlOverlayBrowserLaunchOptions(["vgpu"]);
    expect(vgpuOptions.args.filter(arg => arg.startsWith("--disable-features=")))
      .toEqual(htmlOverlayRendererContract().launch.args.filter(arg => arg.startsWith("--disable-features=")));
    expect(vgpuOptions.ignoreDefaultArgs).toEqual(defaultSwitches);
    expect((await record(vgpuOptions)).filter(arg => arg.startsWith("--disable-features=")))
      .toEqual(vgpuOptions.args.filter(arg => arg.startsWith("--disable-features=")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

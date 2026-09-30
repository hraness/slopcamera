import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";

const require = createRequire(import.meta.url);
const playwrightRoot = dirname(require.resolve("playwright-core/package.json"));
assert.equal(require(resolve(playwrightRoot, "package.json")).version, "1.62.0", "Review browser defaults when upgrading the pinned Playwright version");
// This pinned release bundles its server modules. Read the constant array as
// JSON after removing comments; never execute or patch the bundled source.
const bundle = readFileSync(resolve(playwrightRoot, "lib/coreBundle.js"), "utf8");
const declarations = [...bundle.matchAll(/disabledFeatures = \[([\s\S]*?)\]\.filter\(Boolean\);/gu)];
assert.equal(declarations.length, 1, "Expected one pinned Playwright feature declaration");
const source = declarations[0][1].replace(/\/\/[^\r\n]*/gu, "").replace(/,\s*$/u, "");
const pinnedFeatures = JSON.parse(`[${source}]`);
assert.ok(Array.isArray(pinnedFeatures) && pinnedFeatures.every(feature => typeof feature === "string" && /^[A-Za-z0-9]+$/u.test(feature)), "Expected constant pinned Playwright feature names");

/** Retain the pinned Playwright defaults and replace only its feature switch. */
export function ownedChromiumOptions(executablePath) {
  assert.ok(isAbsolute(executablePath), "Owned Chromium needs an absolute executable path");
  const executable = realpathSync(executablePath);
  assert.ok(!executable.includes("/Google Chrome.app/"), "The installed Google Chrome app is not an owned test browser");
  const existing = [`--disable-features=${pinnedFeatures.join(",")}`];
  const features = new Set([...existing[0].slice("--disable-features=".length).split(","), "PaintHolding", "MacAppCodeSignClone"]);
  return {
    executablePath: executable,
    ignoreDefaultArgs: existing,
    args: ["--mute-audio", `--disable-features=${[...features].join(",")}`],
  };
}

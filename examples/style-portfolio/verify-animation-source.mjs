/** Source checks only. This does not replace rendered-frame and motion review. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { getVisualStyleProfile } from "../../src/visual-style.ts";

const html = await readFile(new URL("./animation-studies.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script\s*>([\s\S]*?)<\/script\s*>/giu)];
assert.equal((html.match(/<script\b/giu) ?? []).length, 1, "The self-contained scene has one script element.");
assert.equal(scripts.length, 1, "The scene script is inline and has no attributes.");
const script = scripts[0]?.[1];
assert.ok(script, "The inline scene script is nonempty.");
new Function(script);
let digest = createHash("sha256");
const contexts = [];
const record = (name, values) => digest.update(JSON.stringify([name, values]));
function context(name) {
  let depth = 0;
  const methods = {
    save() { depth++; record(`${name}.save`, []); },
    restore() { assert.ok(depth > 0, "Canvas restore has an owned save."); depth--; record(`${name}.restore`, []); },
    createLinearGradient(...args) { return gradient("linear", args); },
    createRadialGradient(...args) { return gradient("radial", args); },
  };
  const gradient = (kind, args) => {
    args.forEach(value => assert.ok(Number.isFinite(value), "Gradient coordinates are finite."));
    const result = { kind, args, stops: [], addColorStop(position, color) {
      assert.ok(position >= 0 && position <= 1, "Gradient stop lies in [0, 1].");
      result.stops.push([position, color]);
    } };
    return result;
  };
  const proxy = new Proxy(methods, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args) => {
        for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${String(property)} receives finite coordinates.`);
        if (property === "arc") assert.ok(args[2] >= 0, "Arc radius is nonnegative.");
        if (property === "ellipse") assert.ok(args[2] >= 0 && args[3] >= 0, "Ellipse radii are nonnegative.");
        record(`${name}.${String(property)}`, args);
      };
    },
    set(target, property, value) { target[property] = value; record(`${name}.${String(property)}=`, [value]); return true; },
  });
  contexts.push(() => assert.equal(depth, 0, "Scene leaves a balanced Canvas save stack."));
  return proxy;
}
const main = { width: 1920, height: 1080, getContext: () => context("main") };
const pixel = { width: 320, height: 180, getContext: () => context("pixel") };
let frame;
const host = { parameters: { style: "theatrical-cel" }, onFrame(callback) { frame = callback; } };
const window = { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, SlopcameraOverlay: host };
runInNewContext(script, {
  window, SlopcameraOverlay: host,
  document: { getElementById: () => main, createElement: tag => { assert.equal(tag, "canvas"); return pixel; } },
  Path2D: class { constructor(data) { assert.equal(typeof data, "string"); assert.ok(!/NaN|Infinity/u.test(data), "Path coordinates are finite."); this.data = data; } },
}, { timeout: 10_000 });
const drawing = window.PortfolioDrawing;
assert.equal(drawing.styles.length, 12);
const fingerprint = (time, style, direction) => {
  digest = createHash("sha256");
  drawing.render(time, style, direction);
  contexts.forEach(check => check());
  return digest.digest("hex");
};
let samples = 0;
for (const style of drawing.styles) {
  const profile = getVisualStyleProfile(style);
  drawing.validateDirection(profile, style);
  for (const time of [0, .25, .84, 1.68, 2.65, 3, 5.999, 6]) {
    const first = fingerprint(time, style, profile);
    fingerprint((time + 1.3) % 6, "clean-motion", getVisualStyleProfile("clean-motion"));
    assert.equal(fingerprint(time, style, profile), first, `${style} at ${time}s is independent of seek order.`);
    samples++;
  }
}
assert.throws(() => drawing.render(1, "unknown"), /Unsupported style/u);
assert.throws(() => drawing.render(NaN, "theatrical-cel"), /finite number/u);
assert.throws(() => drawing.render(-1, "theatrical-cel"), /finite number/u);
assert.throws(() => drawing.render(6.1, "theatrical-cel"), /finite number/u);
assert.throws(() => drawing.validateDirection({}, "theatrical-cel"), /required/u);
assert.throws(() => drawing.validateDirection({ ...getVisualStyleProfile("theatrical-cel"), id: "pixel-art" }, "theatrical-cel"), /must match/u);
assert.throws(() => drawing.validateDirection({ ...getVisualStyleProfile("theatrical-cel"), unsupported: 1 }, "theatrical-cel"), /unsupported/u);
assert.throws(() => drawing.validateDirection({ ...getVisualStyleProfile("theatrical-cel"), cadence: { ...getVisualStyleProfile("theatrical-cel").cadence, fps: 0 } }, "theatrical-cel"), /integer/u);
window.innerWidth = Infinity;
assert.throws(() => drawing.render(0, "theatrical-cel"), /canvas CSS width/u);
window.innerWidth = 1920;
window.devicePixelRatio = 9;
assert.throws(() => drawing.render(0, "theatrical-cel"), /devicePixelRatio/u);
window.devicePixelRatio = 1;
assert.throws(() => frame({ timeMs: -1 }), /timeMs/u);
assert.throws(() => frame({ timeMs: 6001 }), /timeMs/u);
console.log(`Passed: 12 canonical profiles, ${samples} deterministic drawing-command samples, balanced Canvas stacks, finite geometry, and invalid-input checks. Pixel and motion quality still require real renders.`);

/** Numerical proof of the actual visual oscillator against Fourier orthogonality. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script, createContext } from "node:vm";
const html = await readFile(new URL("scene.html", import.meta.url), "utf8");
async function sceneScript(document: string): Promise<string> {
  const scripts: string[] = [];
  await new HTMLRewriter().on("script", {
    element(element) {
      assert.equal(element.getAttribute("src"), null, "Scene script must be inline");
      assert.equal(element.getAttribute("type"), null, "Scene script must use the default classic type");
      scripts.push("");
    },
    text(chunk) { scripts[scripts.length - 1]! += chunk.text; },
  }).transform(new Response(document)).text();
  assert.equal(scripts.length, 1, "One retained inline scene script required");
  assert.ok(scripts[0]!.trim(), "Scene script must not be empty");
  return scripts[0]!;
}
// Check HTML parsing independently of the authored scene and its mathematics.
assert.equal(await sceneScript("<!-- <script>ignored</script> --><SCRIPT>const value = '<b>&amp;</b>';</SCRIPT>"), "const value = '<b>&amp;</b>';");
await assert.rejects(sceneScript("<script>one</script><SCRIPT>two</SCRIPT>"), /One retained inline scene script required/u);
await assert.rejects(sceneScript('<SCRIPT SRC="remote.js"></SCRIPT>'), /Scene script must be inline/u);
await assert.rejects(sceneScript('<script type="module">one</script>'), /Scene script must use the default classic type/u);
await assert.rejects(sceneScript("<script> </script>"), /Scene script must not be empty/u);
await assert.rejects(sceneScript("<!-- <script>ignored</script> -->"), /One retained inline scene script required/u);
const script = await sceneScript(html);
const context: Record<string, unknown> = {
  document: { getElementById: () => ({ getContext: () => ({}) }), fonts: { add: () => {} } },
  FontFace: class { load() { return Promise.resolve(this); } },
  SlopcameraOverlay: { asset: (name: string) => `/declared/${name}`, parameters: {}, ready: () => {}, onFrame: () => {} },
};
context.window = context;
new Script(script).runInContext(createContext(context), { timeout: 1_000 });
const wave = context.JazzWave as { sum: (theta: number, time: number) => number; enter: (time: number, index: number) => number };
const samples = 8192, tau = 2 * Math.PI;
const states = [];
for (let count = 1; count <= 5; count++) {
  const time = (count-1)*2+.5;
  let peak = 0, mean = 0;
  const coefficients = Array.from({ length: 12 }, () => 0);
  for (let j = 0; j < samples; j++) {
    const theta = tau*j/samples, actual = wave.sum(theta, time);
    assert.ok(Number.isFinite(actual)); peak = Math.max(peak, actual); mean += actual/samples;
    assert.ok(Math.abs(wave.sum(theta + Math.PI, time) + actual) < 1e-12, "Odd symmetry is required");
    for (let harmonic = 1; harmonic <= coefficients.length; harmonic++) coefficients[harmonic-1]! += 2*actual*Math.sin(harmonic*theta)/samples;
  }
  assert.ok(Math.abs(mean) < 1e-12, "No DC offset");
  for (let harmonic = 1; harmonic <= coefficients.length; harmonic++) {
    const expected = harmonic%2 && harmonic <= 2*count-1 ? 4/(Math.PI*harmonic) : 0;
    assert.ok(Math.abs(coefficients[harmonic-1]!-expected) < 1e-11, `Unexpected Fourier coefficient: ${count}/${harmonic}`);
  }
  assert.ok(peak > 1.17 && peak < 1.274, "Do not peak-normalize or clip the sum");
  states.push({ count, peak, mean, coefficients });
}
for (let index = 1; index < 5; index++) {
  assert.equal(wave.enter(index*2, index), 0);
  assert.ok(Math.abs(wave.enter(index*2+.16, index)-.5) < 1e-12);
  assert.equal(wave.enter(index*2+.32, index), 1);
}
console.log(JSON.stringify({ verified: true, actualScene: "scene.html", samples, states }));

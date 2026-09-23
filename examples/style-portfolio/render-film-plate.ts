/** Retain one local photographic plate and render a bounded single-image transfer study. */
import { createHash } from "node:crypto";
import { mkdir, open, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import { HtmlSceneInputSchema } from "../../apps/desktop/html-overlay/scene";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const maxBytes = 32 * 1024 * 1024;
const maxPixels = 33_000_000;
const args = process.argv.slice(2);
const options = new Map<string, string>();
let dryRun = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index]!;
  if (arg === "--dry-run" && !dryRun) dryRun = true;
  else if (["--image", "--run", "--width", "--height"].includes(arg) && args[index + 1] !== undefined) {
    if (options.has(arg)) throw new Error(`Duplicate option ${arg}.`);
    options.set(arg, args[++index]!);
  } else throw new Error(`Unknown, duplicate, or incomplete option ${arg}.`);
}
const imageArg = options.get("--image");
const run = options.get("--run");
if (!imageArg || !run) throw new Error("Usage: bun examples/style-portfolio/render-film-plate.ts --image <local.png|local.jpg> --run <new-id> [--width <maximum>] [--height <maximum>] [--dry-run]");
if (imageArg.length > 4096 || /[\0\r\n]/u.test(imageArg) || /^[a-z][a-z0-9+.-]*:\/\//iu.test(imageArg)) throw new Error("--image must be an explicit bounded local path, not a URL.");
if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(run)) throw new Error("--run must be a new short lowercase filename token.");
function bound(name: string, fallback: number) {
  const value = options.get(name);
  if (value === undefined) return fallback;
  if (!/^[0-9]{1,4}$/u.test(value)) throw new Error(`${name} must be an integer in [16,8192].`);
  const parsed = Number(value);
  if (parsed < 16 || parsed > 8192) throw new Error(`${name} must be an integer in [16,8192].`);
  return parsed;
}
const hasSize = options.has("--width") || options.has("--height");
const maxWidth = bound("--width", hasSize ? 8192 : 1440);
const maxHeight = bound("--height", hasSize ? 8192 : 1080);
const input = await realpath(resolve(root, imageArg));
// Read from one handle with a fixed byte ceiling, then bind the retained copy.
const handle = await open(input, "r");
let bytes: Buffer;
try {
  const before = await handle.stat();
  if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size < 1 || before.size > maxBytes) throw new Error("Use a regular PNG/JPEG file no larger than 32 MiB.");
  bytes = Buffer.alloc(before.size);
  let position = 0;
  while (position < bytes.length) {
    const result = await handle.read(bytes, position, bytes.length - position, position);
    if (result.bytesRead === 0) throw new Error("The plate changed while it was read.");
    position += result.bytesRead;
  }
  const extra = await handle.read(Buffer.alloc(1), 0, 1, position);
  const after = await handle.stat();
  if (extra.bytesRead !== 0 || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino || after.dev !== before.dev) throw new Error("The plate changed while it was read.");
} finally { await handle.close(); }
const metadata = await sharp(bytes, { limitInputPixels: maxPixels, failOn: "error", animated: true }).metadata();
if (!["png", "jpeg"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Use one static PNG or JPEG photograph.");
const sourceWidth = metadata.autoOrient.width;
const sourceHeight = metadata.autoOrient.height;
if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth < 16 || sourceHeight < 16 || sourceWidth * sourceHeight > maxPixels) throw new Error("The decoded plate must be at least 16 pixels per side and at most 33 megapixels.");
const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
const width = Math.floor(sourceWidth * scale / 2) * 2;
const height = Math.floor(sourceHeight * scale / 2) * 2;
if (width < 2 || height < 2 || width * height > maxPixels) throw new Error("The requested aspect ratio does not fit a bounded even raster.");
const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
const extension = metadata.format === "png" ? "png" : "jpg";
const outputRoot = join(root, "artifacts/style-portfolio/film-plate");
await mkdir(outputRoot, { recursive: true });
if (await realpath(outputRoot) !== outputRoot) throw new Error("The output directory and its parents must not be symlinks.");
const output = join(outputRoot, run);
// The run directory is the exclusive claim. A previous or ambiguous run is
// never overwritten or automatically resumed, even when only planning failed.
try { await mkdir(output); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Run ${run} already exists. Inspect its intent, log, and host receipts; no overwrite or retry was made.`);
  throw error;
}
const retainedPlate = join(output, `plate.${extension}`);
await writeFile(retainedPlate, bytes, { flag: "wx", mode: 0o600 });
const retainedRelative = relative(root, retainedPlate).split(sep).join("/");
if (isAbsolute(retainedRelative) || retainedRelative.startsWith("../")) throw new Error("The retained plate must stay inside the repository artifacts directory.");
const source = HtmlSceneInputSchema.parse({
  kind: "slopcamera.html-scene", schemaVersion: 1,
  name: "Single-image film-transfer study",
  document: { path: "examples/style-portfolio/film-plate.html" },
  canvas: { width, height, deviceScaleFactor: 1 },
  timing: { durationUs: 6_000_000, fps: 16 },
  seed: 19060414, background: "#000000", libraries: [],
  parameters: { kind: "single-image-film-transfer", sourceWidth, sourceHeight, sourceSha256 },
  resources: [{ name: "plate", path: retainedRelative, urlPath: `assets/plate.${extension}`, mediaType: metadata.format === "png" ? "image/png" : "image/jpeg" }],
});
const requestPath = join(output, "scene.json");
const intentPath = join(output, "intent.json");
await writeFile(requestPath, JSON.stringify(source, null, 2) + "\n", { flag: "wx" });
const intent = {
  kind: "slopcamera.single-image-film-transfer-intent", schemaVersion: 1,
  mode: dryRun ? "plan" : "render", input, sourceSha256, sourceBytes: bytes.length,
  sourceDimensions: { width: sourceWidth, height: sourceHeight }, outputDimensions: { width, height },
  requestedMaximum: { width: maxWidth, height: maxHeight }, retainedPlate: retainedRelative,
  requestPath, timing: source.timing,
  limitations: ["One photographic image with optical movement; no subject animation.", "Delivery never exceeds input dimensions. A small optical crop is resampled within that raster.", "Grain and diffusion are a separate explicit finishing operation."],
};
await writeFile(intentPath, JSON.stringify(intent, null, 2) + "\n", { flag: "wx" });
const argv = [process.execPath, join(root, "apps/desktop/dist/cli/main.js"), "html", "render", "--input", requestPath, "--json"];
if (dryRun) argv.push("--dry-run");
const logPath = join(output, "render.log");
const log = await open(logPath, "wx", 0o600);
let code: number;
let stdout: string;
try {
  const child = Bun.spawn(argv, { cwd: root, env: process.env, stdout: "pipe", stderr: log.fd });
  const result = await Promise.all([child.exited, new Response(child.stdout).text()]);
  [code, stdout] = result;
} finally { await log.close(); }
if (code !== 0) {
  await writeFile(join(output, "failed.json"), JSON.stringify({ code, stdout }, null, 2) + "\n", { flag: "wx" });
  throw new Error(`Slopcamera ${dryRun ? "plan" : "render"} failed (${code}); inspect ${logPath} and retained host receipts. No retry was made.`);
}
const result: unknown = JSON.parse(stdout);
const resultPath = join(output, dryRun ? "plan.json" : "result.json");
await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
if (!dryRun) {
  const completion = z.object({ kind: z.literal("slopcamera.html-scene-export"), verification: z.object({ width: z.number(), height: z.number(), frameCount: z.number(), durationUs: z.number() }) }).parse(result);
  if (completion.verification.width !== width || completion.verification.height !== height || completion.verification.frameCount !== 96 || completion.verification.durationUs !== 6_000_000) throw new Error("Rendered dimensions or timing differ from the admitted request; retain this result for review.");
}
console.log(JSON.stringify({ state: dryRun ? "planned" : "rendered", interpretation: "single-image-film-transfer", sourceDimensions: intent.sourceDimensions, dimensions: { width, height }, fps: 16, durationSeconds: 6, sourceSha256, resultPath, intentPath }));

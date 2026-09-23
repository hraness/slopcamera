/** Original premiere-wall composite film. Local ffmpeg/diagram work only.
 * Mounts the reviewed Island Pulse film on a cinema-wall screen, the reviewed
 * Interference Field poster as a mounted print, and an authored .diagram.json
 * board inside one pushed camera move, finished with grain and vignette.
 * bun examples/showcase/workflows/render-premiere-wall.ts
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const out = resolve("artifacts/showcase/workflows/premiere-wall");
await mkdir(out, { recursive: true });

function run(name: string, argv: string[]) {
  const proc = spawnSync(argv[0]!, argv.slice(1), { stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
  if (proc.status !== 0) throw new Error(`${name} failed: ${proc.stderr?.toString().slice(-4000)}`);
  return proc.stdout?.toString() ?? "";
}

/* Inputs: published reviewed derivatives bound by exact sha256, plus authored
 * wall and diagram sources checked in beside this script. */
async function input(from: string, name: string, sha256?: string) {
  const bytes = new Uint8Array(await readFile(from));
  if (sha256 && hash(bytes) !== sha256) throw new Error(`${name} does not match its reviewed identity.`);
  await writeFile(join(out, name), bytes);
}
await input("apps/web/media/island-pulse-video-df235020e4b9.mp4", "island-pulse.mp4", "df235020e4b98d0d5330bca47a55d4319b6f1f2024a0f6bc31e60ce186364842");
await input("apps/web/media/interference-field-poster-869cf2dd72af.webp", "interference.webp", "869cf2dd72afd1960dad38262bdbc1aaaf8a27a038e785319ec36bfe9653729a");
await input("examples/showcase/workflows/premiere-wall.svg", "premiere-wall.svg");
await input("examples/showcase/workflows/premiere-diagram.diagram.json", "premiere-diagram.diagram.json");

/* The diagram board renders through the real .diagram.json pipeline. */
run("diagram", [process.execPath, "apps/desktop/cli/main.ts", "diagram", "render", join(out, "premiere-diagram.diagram.json"), "--output", out]);
run("wall", ["rsvg-convert", "-w", "1280", "-h", "720", "-o", join(out, "premiere-wall.png"), join(out, "premiere-wall.svg")]);

/* Composite: wall + live screen + mounted print + diagram board, then a
 * smootherstep camera push, film grain and vignette. 8s at 24fps. */
const filter = [
  "[1:v]scale=672:378,setsar=1[vid]",
  "[2:v]scale=290:163,setsar=1[print]",
  "[3:v]scale=268:315,setsar=1[diag]",
  "[0:v][vid]overlay=84:121[bg1]",
  "[bg1][print]overlay=826:124[bg2]",
  "[bg2][diag]overlay=843:333[comp]",
  "[comp]zoompan=z='1+0.20*(0.5-0.5*cos(3.14159265*on/191))':x='(iw-iw/zoom)*0.42':y='(ih-ih/zoom)*0.36':d=1:s=1280x720:fps=24[zoom]",
  "[zoom]noise=alls=6:allf=t,vignette=angle=PI/5[vout]",
].join(";");
run("composite", ["ffmpeg", "-y",
  "-loop", "1", "-framerate", "24", "-i", join(out, "premiere-wall.png"),
  "-i", join(out, "island-pulse.mp4"),
  "-i", join(out, "interference.webp"),
  "-loop", "1", "-framerate", "24", "-i", join(out, "premiere-assembly.dark.png"),
  "-filter_complex", filter, "-map", "[vout]", "-t", "8",
  "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-an",
  join(out, "premiere-wall.mp4")]);
run("poster", ["ffmpeg", "-y", "-ss", "4.2", "-i", join(out, "premiere-wall.mp4"),
  "-frames:v", "1", "-c:v", "libwebp", "-quality", "88", join(out, "premiere-wall-poster.webp")]);

const video = new Uint8Array(await readFile(join(out, "premiere-wall.mp4")));
const poster = new Uint8Array(await readFile(join(out, "premiere-wall-poster.webp")));
const lineage = {
  inputs: {
    "island-pulse.mp4": { sha256: "df235020e4b98d0d5330bca47a55d4319b6f1f2024a0f6bc31e60ce186364842", role: "live screen" },
    "interference.webp": { sha256: "869cf2dd72afd1960dad38262bdbc1aaaf8a27a038e785319ec36bfe9653729a", role: "mounted print" },
    "premiere-wall.svg": { sha256: hash(new Uint8Array(await readFile("examples/showcase/workflows/premiere-wall.svg"))), role: "authored wall" },
    "premiere-diagram.diagram.json": { sha256: hash(new Uint8Array(await readFile("examples/showcase/workflows/premiere-diagram.diagram.json"))), role: "authored editable diagram" },
  },
  outputs: { "premiere-wall.mp4": { sha256: hash(video), bytes: video.length }, "premiere-wall-poster.webp": { sha256: hash(poster), bytes: poster.length } },
  authorSourceSha256: hash(new Uint8Array(await readFile(import.meta.path))),
  filter,
};
await writeFile(join(out, "premiere-wall-lineage.json"), JSON.stringify(lineage, null, 2) + "\n");
console.log(JSON.stringify({ output: out, videoBytes: video.length, videoSha256: hash(video), posterBytes: poster.length }, null, 2));

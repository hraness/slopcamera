/** Three editorial cuts of one NASA time-lapse. Source checkout required.
 * Slopcamera owns color treatment and resource admission; this recipe owns
 * the explicit FFmpeg edit, typeset overlays and original synthesized score.
 * No provider call, download, recording or unsupported project bootstrap here.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { createDefaultHostResourceCoordinator } from "../../../../src/host-resources";

const [sourceArg, run, narrationArg] = process.argv.slice(2);
assert.ok(sourceArg && run && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(run), "Pass source.mp4 fresh-run [narration.wav]");
const source = resolve(sourceArg), out = resolve("artifacts/studio-relaunch/one-shoot", run);
const expectedSource = "472751c72c3f9fc93b7481435e7f3abbf33f381b85b424416738c404e512a66e";
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
assert.equal(hash(await readFile(source)), expectedSource, "Use the exact verified NASA large MP4; inspect a changed upstream asset.");
await mkdir(out, { recursive: true });
await writeFile(join(out, "intent.json"), JSON.stringify({ sourceSha256: expectedSource, run, narration: narrationArg ?? null }) + "\n", { flag: "wx" });
const coordinator = createDefaultHostResourceCoordinator({ waitTimeoutMilliseconds: 3_600_000 });
const commands: { label: string; argv: string[]; exitCode: number }[] = [];
async function execute(label: string, argv: string[], admission = true): Promise<string> {
  const launch = async (descriptor?: number) => {
    const child = Bun.spawn(argv, { stdio: descriptor === undefined ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe", descriptor] });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    await writeFile(join(out, `${label}.log`), stderr);
    await writeFile(join(out, `${label}.json`), stdout);
    commands.push({ label, argv, exitCode });
    await writeFile(join(out, "commands.json"), JSON.stringify(commands, null, 2) + "\n");
    assert.equal(exitCode, 0, `${label} failed; inspect retained log before a separately named recovery.`);
    return stdout;
  };
  if (!admission) return launch();
  return coordinator.withLease([{ resource: "cpu", amount: 2 }, { resource: "local-io", amount: 1 },
    { resource: "ffmpeg", amount: 1 }, { resource: "video-encode", amount: 1 }], async lease => {
    const result = await launch(lease.inheritedFileDescriptor); await lease.assertOwned(); return result;
  });
}
const ff = (label: string, args: string[]) => execute(label, ["ffmpeg", "-nostdin", "-v", "error", "-n", "-threads", "2", ...args]);
// Narration starts at 0.5s. Reject a long take instead of clipping words at 12s.
if (narrationArg) {
  const narrationProbe = JSON.parse(await execute("narration-probe", ["ffprobe", "-v", "error", "-show_entries",
    "stream=codec_type:format=duration", "-of", "json", resolve(narrationArg)], false));
  const duration = Number(narrationProbe.format?.duration);
  assert.ok(narrationProbe.streams?.some((stream: { codec_type?: string }) => stream.codec_type === "audio")
    && Number.isFinite(duration) && duration > 0 && duration <= 11.5,
    "Narration must contain audio and fit within 11.5 seconds after its 0.5-second entrance.");
}
const font = resolve("examples/showcase/studio-relaunch/rain-bottled/assets/instrument-serif.ttf");
function overlay(name: string, width: number, height: number, content: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="#f0ead9" font-family="Instrument Serif">${content}</g></svg>`;
  return writeFile(join(out, `${name}.png`), new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).render().asPng(), { flag: "wx" });
}
await overlay("cinema-type", 1920, 1080, `<text x="88" y="880" font-size="128">Totality.</text><text x="92" y="945" font-size="32" letter-spacing="2">MAZATLÁN · 8 APRIL 2024</text><text x="92" y="1020" font-size="24">NASA footage · independent edit</text>`);
await overlay("vertical-type", 720, 1280, `<text x="52" y="105" font-size="24" letter-spacing="3">FOR A FEW MINUTES,</text><text x="48" y="198" font-size="80">a different kind</text><text x="48" y="284" font-size="80">of daylight.</text><text x="52" y="1120" font-size="31">Mazatlán, Mexico</text><text x="52" y="1166" font-size="26">8 April 2024 · time-lapse</text><text x="52" y="1235" font-size="21">NASA footage · independent edit</text>`);
await overlay("explainer-type", 1920, 1080, `<text x="1165" y="238" font-size="27" letter-spacing="3">A TOTAL SOLAR ECLIPSE</text><text x="1158" y="382" font-size="106">The hidden</text><text x="1158" y="492" font-size="106">atmosphere.</text><text x="1165" y="620" font-size="37">The Moon covers the bright disk.</text><text x="1165" y="675" font-size="37">The Sun’s corona becomes visible.</text><path d="M850 452L1070 725H1450" fill="none" stroke="#d3ba79" stroke-width="2"/><circle cx="850" cy="452" r="6" fill="#d3ba79"/><text x="1165" y="775" font-size="32" fill="#d3ba79">CORONA · THE SUN’S OUTER ATMOSPHERE</text><text x="1165" y="982" font-size="24">NASA footage · independent edit</text>`);

// Twelve-second 48 kHz stereo composition, no samples. Taper every event.
function score(name: string, energetic: boolean) {
  const rate = 48_000, frames = rate * 12, data = Buffer.alloc(frames * 4 + 44);
  data.write("RIFF"); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28);
  data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / rate, fade = Math.min(1, t / .7) * Math.max(0, Math.min(1, (11.5 - t) / 2));
    let v = .10 * Math.sin(2 * Math.PI * 65.406 * t) + .06 * Math.sin(2 * Math.PI * 98 * t);
    for (const [start, frequency] of [[.7, 261.626], [3, 311.127], [5.3, 391.995], [7.6, 523.251]] as const) {
      const a = t - start;
      if (a >= 0) v += .15 * (1 - Math.exp(-a * 45)) * Math.exp(-a / 1.5)
        * (Math.sin(2 * Math.PI * frequency * a) + .14 * Math.sin(2 * Math.PI * frequency * 2.003 * a));
    }
    if (energetic) {
      const beat = t % .5;
      v += .15 * Math.sin(2 * Math.PI * (53 * beat + 7 * (1 - Math.exp(-beat * 26)))) * Math.exp(-beat * 14) * Math.min(1, beat * 1000);
    }
    const sample = Math.round(Math.max(-.9, Math.min(.9, v * fade)) * 32767);
    data.writeInt16LE(sample, 44 + i * 4); data.writeInt16LE(sample, 46 + i * 4);
  }
  return writeFile(join(out, `${name}.wav`), data, { flag: "wx" });
}
await score("cinema-score", false); await score("vertical-score", true);
const encoding = ["-c:v", "libx264", "-crf", "18", "-preset", "medium", "-threads", "2", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-r", "24", "-t", "12", "-movflags", "+faststart"];

// Source time-lapse from 15s to 75s, five times faster; no claim of real time.
await ff("cinema-base", ["-ss", "15", "-t", "60", "-i", source, "-vf", "setpts=(PTS-STARTPTS)/5,fps=24", "-an",
  "-c:v", "libx264", "-crf", "16", "-preset", "fast", "-threads", "2", "-filter_threads", "1", "-t", "12", join(out, "cinema-base.mp4")]);
const graded = JSON.parse(await execute("mono-grade", [process.execPath, "apps/desktop/cli/main.ts", "media", "color", join(out, "cinema-base.mp4"),
  "--preset", "mono", "--json"], false));
assert.ok(typeof graded.output?.path === "string", "Color treatment must return a retained output.");
await ff("cinematic", ["-i", resolve(graded.output.path), "-loop", "1", "-i", join(out, "cinema-type.png"), "-i", join(out, "cinema-score.wav"),
  "-filter_complex_threads", "1", "-filter_complex", "[0:v][1:v]overlay=0:0:enable='gte(t,1)'[v]", "-map", "[v]", "-map", "2:a", ...encoding, join(out, "cinematic.mp4")]);
await ff("vertical", ["-i", join(out, "cinema-base.mp4"), "-loop", "1", "-i", join(out, "vertical-type.png"), "-i", join(out, "vertical-score.wav"),
  "-filter_complex_threads", "1", "-filter_complex", "[0:v]crop=1080:1080:420:0,scale=720:720,pad=720:1280:0:310:black[b];[b][1:v]overlay=0:0[v]",
  "-map", "[v]", "-map", "2:a", ...encoding, join(out, "vertical.mp4")]);
if (narrationArg) {
  await ff("explainer", ["-ss", "33", "-t", "36", "-i", source, "-loop", "1", "-i", join(out, "explainer-type.png"),
    "-i", resolve(narrationArg), "-i", join(out, "cinema-score.wav"), "-filter_complex_threads", "1", "-filter_complex",
    "[0:v]setpts=(PTS-STARTPTS)/3,fps=24,scale=1080:608,setsar=1,pad=1920:1080:0:236:black[b];[b][1:v]overlay=0:0[v];[2:a]adelay=500|500,apad,atrim=duration=12[voice];[3:a]volume=0.15[bed];[voice][bed]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.89[a]",
    "-map", "[v]", "-map", "[a]", ...encoding, join(out, "explainer.mp4")]);
}
const outputs = [];
for (const name of ["cinematic", "vertical", ...(narrationArg ? ["explainer"] : [])]) {
  await ff(`${name}-poster`, ["-ss", "6", "-i", join(out, `${name}.mp4`), "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-c:v", "libwebp", "-quality", "85", "-threads", "2", join(out, `${name}.webp`)]);
  const bytes = await readFile(join(out, `${name}.mp4`));
  const probe = JSON.parse(await execute(`${name}-probe`, ["ffprobe", "-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,nb_read_frames,r_frame_rate,sample_rate,channels:format=duration", "-of", "json", join(out, `${name}.mp4`)], false));
  outputs.push({ name, path: join(out, `${name}.mp4`), sha256: hash(bytes), bytes: bytes.length, probe });
}
assert.equal(hash(await readFile(source)), expectedSource, "Original footage changed.");
await writeFile(join(out, "lineage.json"), JSON.stringify({ source: { path: source, sha256: expectedSource },
  recipeSha256: hash(await readFile(import.meta.filename)), fontSha256: hash(await readFile(font)), outputs,
  review: "Requires complete independent visual and sound review before publication." }, null, 2) + "\n");
console.log(JSON.stringify({ out, outputs: outputs.map(({ name, path }) => ({ name, path })) }));

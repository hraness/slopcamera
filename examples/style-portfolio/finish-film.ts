/** Bounded local finishing example using Slopcamera's typed video-look compiler. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createVisualStyleVideoLook } from "../../apps/desktop/core/visual-style-look";
import { compileVideoLookToFfmpeg } from "../../apps/desktop/core/video-effects";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const maxInputBytes = 512 * 1024 * 1024;
const ProbeSchema = z.strictObject({
  programs: z.array(z.strictObject({})).max(0).optional(),
  stream_groups: z.array(z.strictObject({})).max(0).optional(),
  streams: z.array(z.strictObject({
    index: z.number().int().min(0).max(31),
    codec_type: z.enum(["video", "audio"]),
    width: z.number().int().min(64).max(4096).multipleOf(2).optional(),
    height: z.number().int().min(64).max(4320).multipleOf(2).optional(),
    avg_frame_rate: z.string().regex(/^\d{1,9}\/\d{1,9}$/u).optional(),
    nb_read_frames: z.string().regex(/^\d{1,7}$/u).optional(),
  })).min(1).max(2),
  format: z.strictObject({ duration: z.string().max(32).regex(/^\d+(?:\.\d+)?$/u) }),
});

export function parseFilmProbe(value: unknown, requireFrameCount = false) {
  const probe = ProbeSchema.parse(value);
  const videos = probe.streams.filter(stream => stream.codec_type === "video");
  const video = videos[0];
  const duration = Number(probe.format.duration);
  if (videos.length !== 1 || video?.width === undefined || video.height === undefined
    || video.avg_frame_rate === undefined || !Number.isFinite(duration) || duration <= 0 || duration > 30) {
    throw new Error("Use one video stream and at most one audio stream, with at most 30 seconds and even 64–4096 × 64–4320 dimensions.");
  }
  const [numerator, denominator] = video.avg_frame_rate.split("/").map(Number);
  const frameRate = numerator! / denominator!;
  const frameCount = video.nb_read_frames === undefined ? undefined : Number(video.nb_read_frames);
  if (!Number.isFinite(frameRate) || frameRate <= 0 || frameRate > 120
    || (frameCount !== undefined && (frameCount < 1 || frameCount > 3600))
    || (requireFrameCount && frameCount === undefined)) {
    throw new Error("Use a finite video rate no higher than 120 fps and at most 3600 decoded frames.");
  }
  return { width: video.width, height: video.height, duration, frameRate, frameCount,
    absoluteVideoIndex: video.index, audioStreams: probe.streams.length - 1 };
}

/** FFprobe indices are absolute; the look compiler selects a video-relative stream. */
export function createFilmFinishPlan(style: unknown, probe: unknown) {
  const facts = parseFilmProbe(probe);
  const look = createVisualStyleVideoLook(style, { height: facts.height, seed: 19060414 });
  return { facts, look, compiled: compileVideoLookToFfmpeg(look, { videoStreamIndex: 0 }) };
}

async function sha256(path: string) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length;
    if (bytes > maxInputBytes) throw new Error("Media exceeds the 512 MiB byte limit.");
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function command(argv: string[], timeoutMs = 600_000) {
  const child = Bun.spawn(argv, { cwd: root, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
  async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 128 * 1024) {
          child.kill("SIGKILL");
          await reader.cancel();
          throw new Error(`${argv[0]} exceeded its 128 KiB output bound.`);
        }
        chunks.push(chunk.value);
      }
      return Buffer.concat(chunks).toString("utf8");
    } finally { reader.releaseLock(); }
  }
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, collect(child.stdout), collect(child.stderr)]);
    if (timedOut) throw new Error(`${argv[0]} exceeded its ${timeoutMs} ms deadline.`);
    if (code !== 0) throw new Error(`${argv[0]} failed (${code}): ${stderr.slice(-6000)}`);
    return stdout;
  } catch (error) {
    child.kill("SIGKILL");
    await child.exited;
    throw error;
  } finally { clearTimeout(timer); }
}

async function probe(path: string, countFrames = false): Promise<unknown> {
  return JSON.parse(await command(["ffprobe", "-v", "error", "-protocol_whitelist", "file",
    ...(countFrames ? ["-count_frames"] : []), "-show_entries",
    "stream=index,codec_type,width,height,avg_frame_rate,nb_read_frames:format=duration", "-of", "json", path], 30_000)) as unknown;
}

export async function finishFilm(args: readonly string[], workspaceRoot = root, log: (message: string) => void = console.log): Promise<void> {
  const [inputArg, style, outputArg, ...extra] = args;
  if (!inputArg || !style || !outputArg || extra.length) throw new Error("Usage: bun examples/style-portfolio/finish-film.ts <input-video> <style-id> <new-output.mp4>");
  const canonicalRoot = await realpath(workspaceRoot);
  const input = await realpath(resolve(canonicalRoot, inputArg));
  const output = resolve(canonicalRoot, outputArg);
  const outputRoot = resolve(canonicalRoot, "artifacts/style-portfolio");
  const outputRelative = relative(outputRoot, output);
  if (isAbsolute(outputRelative) || outputRelative.startsWith("..") || !output.endsWith(".mp4")) throw new Error("Output must be a new .mp4 within artifacts/style-portfolio.");
  const inputStat = await stat(input);
  if (input === output || !inputStat.isFile() || inputStat.size < 1 || inputStat.size > maxInputBytes) throw new Error("Input must be a distinct regular file no larger than 512 MiB.");
  const { facts, look, compiled } = createFilmFinishPlan(style, await probe(input));
  await mkdir(dirname(output), { recursive: true });
  if (await realpath(dirname(output)) !== dirname(output)) throw new Error("Output parents must not be symlinks.");
  const inputSha256 = await sha256(input);
  const intent = { kind: "slopcamera.style-finish-intent", input, inputSha256, output, style, look,
    source: facts, compiler: compiled.compiler, compilerVersion: compiled.compilerVersion, lookHash: compiled.lookHash };
  await writeFile(`${output}.intent.json`, JSON.stringify(intent, null, 2) + "\n", { flag: "wx" });
  const argv = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-n", "-protocol_whitelist", "file", "-i", input,
    "-filter_complex", compiled.filterGraph, "-map", `[${compiled.outputLabel}]`, "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", "-color_primaries", "bt709",
    "-color_trc", "bt709", "-colorspace", "bt709", "-threads", "4", output];
  await command(argv);
  if (await sha256(input) !== inputSha256) throw new Error("Source changed during finishing; retain this output as rejected and inspect the intent.");
  const delivered = parseFilmProbe(await probe(output, true), true);
  if (delivered.width !== facts.width || delivered.height !== facts.height || delivered.audioStreams !== facts.audioStreams
    || Math.abs(delivered.duration - facts.duration) > 0.15 || Math.abs(delivered.frameRate - facts.frameRate) > .05) {
    throw new Error("Finished dimensions, audio streams, duration, or frame rate do not match source.");
  }
  const receipt = { ...intent, kind: "slopcamera.style-finish-receipt", outputSha256: await sha256(output), bytes: (await stat(output)).size,
    dimensions: { width: delivered.width, height: delivered.height }, frameCount: delivered.frameCount, duration: delivered.duration,
    limitations: ["Display-referred artistic finish, not a spectral film-stock simulation.", "Diffusion approximates highlight glow; this adapter does not apply gate weave or alter capture cadence."] };
  await writeFile(`${output}.receipt.json`, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  log(JSON.stringify({ output, receipt: `${output}.receipt.json`, dimensions: receipt.dimensions, frameCount: receipt.frameCount }));
}

if (import.meta.main) await finishFilm(process.argv.slice(2));

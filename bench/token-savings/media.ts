// Small ffprobe/ffmpeg/file helpers shared by the validators and thumbnails.
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export const FFMPEG = "/opt/homebrew/bin/ffmpeg";
export const FFPROBE = "/opt/homebrew/bin/ffprobe";

export interface Probe {
  readonly formatName: string;
  readonly duration: number | null;
  readonly codec: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly fps: number | null;
  readonly frames: number | null;
}

async function run(argv: readonly string[]): Promise<{ code: number; stdout: Uint8Array; stderr: string }> {
  const proc = Bun.spawn([...argv], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout: new Uint8Array(stdout), stderr };
}

function rate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const [num, den] = value.split("/").map(Number);
  if (num === undefined || den === undefined || !Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function probe(path: string): Promise<Probe | null> {
  const result = await run([
    FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-count_packets", path,
  ]);
  if (result.code !== 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(result.stdout));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as { format?: Record<string, unknown>; streams?: Record<string, unknown>[] };
  const video = (record.streams ?? []).find((s) => s.codec_type === "video");
  return {
    formatName: typeof record.format?.format_name === "string" ? record.format.format_name : "",
    duration: num(record.format?.duration),
    codec: typeof video?.codec_name === "string" ? video.codec_name : null,
    width: num(video?.width),
    height: num(video?.height),
    fps: rate(video?.avg_frame_rate),
    frames: num(video?.nb_read_packets),
  };
}

/** Mean luma (0-255) of the whole image, or of the frame at `at` seconds. */
export async function meanLuma(path: string, at?: number): Promise<number | null> {
  const seek = at === undefined ? [] : ["-ss", String(at)];
  const result = await run([
    FFMPEG, "-v", "error", ...seek, "-i", path, "-frames:v", "1",
    "-vf", "scale=1:1:flags=area,format=gray", "-f", "rawvideo", "-",
  ]);
  return result.code === 0 && result.stdout.length >= 1 ? (result.stdout[0] ?? null) : null;
}

/** 16x16 grayscale thumbnail bytes of the frame at `at` seconds. */
export async function tinyFrame(path: string, at: number): Promise<Uint8Array | null> {
  const result = await run([
    FFMPEG, "-v", "error", "-ss", String(at), "-i", path, "-frames:v", "1",
    "-vf", "scale=16:16:flags=area,format=gray", "-f", "rawvideo", "-",
  ]);
  return result.code === 0 && result.stdout.length === 256 ? result.stdout : null;
}

export function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return total / a.length;
}

export async function sha256(path: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch {
    return null;
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function thumbnail(input: string, output: string, isVideo: boolean): Promise<boolean> {
  const seek = isVideo ? ["-ss", "2"] : [];
  const result = await run([
    FFMPEG, "-v", "error", "-y", ...seek, "-i", input, "-frames:v", "1",
    "-vf", "scale=320:320:force_original_aspect_ratio=decrease", "-q:v", "5", output,
  ]);
  return result.code === 0;
}

const SKIP_DIRS = new Set(["out", "inputs", ".claude", "node_modules", ".git", ".tmp", ".bench"]);
const MAX_SOURCE_BYTES = 1_000_000;

/** Text of every small, non-binary file the agent left in the sandbox, outside outputs and inputs. */
export async function sandboxSourceText(root: string): Promise<{ files: string[]; text: string }> {
  const files: string[] = [];
  const parts: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 6) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path, depth + 1);
      } else if (entry.isFile()) {
        const info = await stat(path);
        if (info.size > MAX_SOURCE_BYTES) continue;
        const bytes = await readFile(path);
        if (bytes.includes(0)) continue;
        files.push(relative(root, path));
        parts.push(bytes.toString("utf8"));
      }
    }
  }
  await walk(root, 0);
  return { files: files.sort(), text: parts.join("\n") };
}

export interface AudioProbe {
  readonly codec: string | null;
  readonly duration: number | null;
}

/** The first audio stream, or null when the file has none or cannot be read. */
export async function probeAudio(path: string): Promise<AudioProbe | null> {
  const result = await run([FFPROBE, "-v", "error", "-print_format", "json", "-show_streams", "-select_streams", "a", path]);
  if (result.code !== 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(result.stdout)) as { streams?: Record<string, unknown>[] };
    const audio = parsed.streams?.[0];
    if (audio === undefined) return null;
    return { codec: typeof audio.codec_name === "string" ? audio.codec_name : null, duration: num(audio.duration) };
  } catch {
    return null;
  }
}

/** Mean audio level in dB over [start, start + length) seconds, from ffmpeg volumedetect. */
export async function meanVolume(path: string, start: number, length: number): Promise<number | null> {
  const result = await run([
    FFMPEG, "-v", "info", "-ss", String(Math.max(0, start)), "-t", String(length), "-i", path,
    "-vn", "-af", "volumedetect", "-f", "null", "-",
  ]);
  const match = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(result.stderr);
  if (match === null) return null;
  return match[1] === "-inf" ? -120 : Number(match[1]);
}

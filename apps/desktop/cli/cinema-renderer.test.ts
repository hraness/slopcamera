import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CinemaRenderPlanV1Schema } from "../contracts";
import { buildCinemaFfmpegInvocation } from "./cinema-renderer";

const FFMPEG = Bun.which("ffmpeg");
const SIZE = 64;
const RATE = 24;
const FIRST = [200, 32, 32] as const;
const SECOND = [32, 64, 200] as const;
const DIP = [32, 192, 64] as const;
const KINDS = ["cut", "dissolve", "wipe", "dip-to-color", "whip-pan", "light-flash"] as const;
type Kind = typeof KINDS[number];
type Input = { path: string; sha256: string; bytes: number; streamIndex: number };
let root: string | undefined;
let first: Input;
let second: Input;

async function run(argv: readonly string[]): Promise<Uint8Array> {
  const child = Bun.spawn([...argv], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(), new Response(child.stderr).text(), child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`FFmpeg exited ${exitCode}: ${stderr}`);
  return new Uint8Array(stdout);
}

beforeAll(async () => {
  if (FFMPEG === null) return;
  root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-cinema-renderer-")));
  await mkdir(join(root, "renders"));
  const generate = async (path: string, color: string): Promise<Input> => {
    await run([FFMPEG, "-v", "error", "-nostdin", "-f", "lavfi", "-i",
      `color=c=${color}:s=${SIZE}x${SIZE}:r=${RATE}:d=2`, "-frames:v", "48",
      "-c:v", "libx264rgb", "-crf", "0", "-threads", "1", join(root!, path)]);
    const bytes = await readFile(join(root!, path));
    return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), streamIndex: 0 };
  };
  first = await generate("first.mp4", "0xc82020");
  second = await generate("second.mp4", "0x2040c8");
});

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

function fixture(kind: Kind, peakHoldUs: number) {
  const durationUs = kind === "cut" ? 0 : 500_000;
  const endUs = 1_000_000 + durationUs;
  const slice = (input: Input, fileStart: number, fileEnd: number, start: number, end: number) => ({
    ...input, fileRange: { startUs: fileStart, endUs: fileEnd }, outputRange: { startUs: start, endUs: end },
  });
  // Both bodies are one second. Real preroll/postroll media fills a separate
  // half-second transition window; none of the six cases uses placeholders.
  const transition = kind === "cut" ? { kind } : {
    kind, durationUs, beforeShotId: "cshot_renderer_a", afterShotId: "cshot_renderer_b",
    outputRange: { startUs: 1_000_000, endUs },
    ...(kind === "wipe" || kind === "whip-pan" ? { direction: "left" } : {}),
    ...(kind === "whip-pan" ? { blurSigma: 2 } : {}),
    ...(kind === "dip-to-color" ? { color: "#20c040" } : {}),
    ...(kind === "light-flash" ? { peakHoldUs } : {}),
  };
  return CinemaRenderPlanV1Schema.parse({
    kind: "slopcamera.cinema-render-plan", schemaVersion: 1,
    advisories: [], audioCues: [], looks: [],
    cinemaPlanSha256: "a".repeat(64), planSha256: "b".repeat(64),
    projectEditPlanSha256: "c".repeat(64), projectStructureSha256: "d".repeat(64), projectId: "project_renderer_test",
    output: { background: "#ff00ff", durationUs: endUs + 1_000_000, frameRate: RATE, pixelWidth: SIZE, pixelHeight: SIZE },
    shots: [{
      shotId: "cshot_renderer_a", durationUs: 1_000_000, fit: "cover",
      handles: { preRollUs: 0, postRollUs: durationUs },
      sourceFrame: { pixelWidth: SIZE, pixelHeight: SIZE }, outputRange: { startUs: 0, endUs: 1_000_000 },
      video: { body: [slice(first, 250_000, 1_250_000, 0, 1_000_000)], inHandle: [],
        outHandle: durationUs === 0 ? [] : [slice(first, 1_250_000, 1_750_000, 1_000_000, endUs)] },
    }, {
      shotId: "cshot_renderer_b", durationUs: 1_000_000, fit: "cover",
      handles: { preRollUs: durationUs, postRollUs: 0 },
      sourceFrame: { pixelWidth: SIZE, pixelHeight: SIZE }, outputRange: { startUs: endUs, endUs: endUs + 1_000_000 },
      video: { body: [slice(second, 750_000, 1_750_000, endUs, endUs + 1_000_000)], outHandle: [],
        inHandle: durationUs === 0 ? [] : [slice(second, 250_000, 750_000, 1_000_000, endUs)] },
    }],
    transitions: [transition],
  });
}

function distance(actual: readonly number[], expected: readonly number[]): number {
  return Math.max(...actual.map((value, channel) => Math.abs(value - expected[channel]!)));
}

for (const kind of KINDS) for (const peakHoldUs of kind === "light-flash" ? [0, 250_000] : [0]) {
  test.skipIf(FFMPEG === null)(`renders real ${kind} (${peakHoldUs}us peak) with complete frame coverage and bounded transition timing`, async () => {
    if (FFMPEG === null || root === undefined) return;
    const plan = fixture(kind, peakHoldUs);
    const output = join(root, "renders", `${kind}-${peakHoldUs}.mp4`);
    const built = await buildCinemaFfmpegInvocation(plan, {
      ffmpeg: FFMPEG, projectDirectory: root, repositoryRoot: root, outputPath: output,
    });
    await run(built.argv);
    const decoded = await run([FFMPEG, "-v", "error", "-nostdin", "-i", output, "-map", "0:v:0",
      "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]);
    const frameBytes = SIZE * SIZE * 3;
    const count = plan.output.durationUs * RATE / 1_000_000;
    expect(decoded.length).toBe(count * frameBytes);
    const means: number[][] = [];
    const secondStart = kind === "cut" ? 24 : 36;
    for (let frame = 0; frame < count; frame++) {
      const mean = [0, 0, 0];
      for (let pixel = 0; pixel < SIZE * SIZE; pixel++) {
        for (let channel = 0; channel < 3; channel++) mean[channel]! += decoded[frame * frameBytes + pixel * 3 + channel]! / (SIZE * SIZE);
      }
      means.push(mean);
      // Every intended source and transition color is bright. Magenta is an
      // intentionally distinctive canvas sentinel, never an intended frame.
      expect(mean.reduce((sum, value) => sum + value, 0), `${kind} blank frame ${frame}`).toBeGreaterThan(150);
      expect(mean[0]! > 210 && mean[1]! < 20 && mean[2]! > 210, `${kind} uncovered canvas at ${frame}`).toBe(false);
      const expected = frame < 24 ? FIRST : frame >= secondStart ? SECOND : undefined;
      if (expected !== undefined) {
        for (const [x, y] of [[8, 8], [55, 8], [32, 32], [8, 55], [55, 55]]) {
          const index = (frame * SIZE * SIZE + y! * SIZE + x!) * 3;
          expect(distance([...decoded.slice(index, index + 3)], expected), `${kind} source color at frame ${frame},${x},${y}`).toBeLessThanOrEqual(8);
        }
      }
    }
    if (kind !== "cut") {
      expect(means.slice(24, 36).some(mean => distance(mean, FIRST) > 20 && distance(mean, SECOND) > 20), `${kind} must have a visible transition`).toBe(true);
    }
    if (kind === "dissolve") expect(distance(means[30]!, FIRST.map((value, index) => (value + SECOND[index]!) / 2))).toBeLessThanOrEqual(12);
    if (kind === "dip-to-color" || kind === "light-flash") {
      const middle = kind === "dip-to-color" ? DIP : [255, 255, 255];
      const holdFrames = kind === "light-flash" ? peakHoldUs * RATE / 1_000_000 : 0;
      const rampFrames = (12 - holdFrames) / 2;
      const mix = (from: readonly number[], to: readonly number[], progress: number) =>
        from.map((value, channel) => value + (to[channel]! - value) * progress);
      // Check both ramps and every peak frame, not just a single midpoint.
      // This catches an overlong first segment hiding the incoming transition.
      for (let frame = 0; frame < 12; frame++) {
        const expected = frame < rampFrames ? mix(FIRST, middle, frame / rampFrames)
          : frame < rampFrames + holdFrames ? middle
          : mix(middle, SECOND, (frame - rampFrames - holdFrames) / rampFrames);
        expect(distance(means[24 + frame]!, expected), `${kind} ramp at transition frame ${frame}`).toBeLessThanOrEqual(12);
      }
    }
  }, 20_000);
}

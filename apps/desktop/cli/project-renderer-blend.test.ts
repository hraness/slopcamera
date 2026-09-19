import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import { OverlayOperationSchema, ProjectRenderPlanV1Schema } from "../contracts";
import type { ProcessRunner } from "./io";
import { buildProjectFfmpegInvocation } from "./project-renderer";

const FFMPEG = Bun.which("ffmpeg");
const FFPROBE = Bun.which("ffprobe");
const RSVG_CONVERT = Bun.which("rsvg-convert");
const MODES = ["screen", "multiply", "overlay", "darken", "lighten"] as const;
const BASE = [64, 128, 192] as const;
const LAYER = [200, 80, 40] as const;

// Independent channel arithmetic: blend the opaque colors, then composite the
// result with the layer's half alpha. Values allow final YUV420/H264 rounding.
function expectedChannel(mode: typeof MODES[number], base: number, layer: number): number {
  const blended = mode === "screen" ? 255 - (255 - base) * (255 - layer) / 255
    : mode === "multiply" ? base * layer / 255
    : mode === "darken" ? Math.min(base, layer)
    : mode === "lighten" ? Math.max(base, layer)
    : base < 128 ? 2 * base * layer / 255
    : 255 - 2 * (255 - base) * (255 - layer) / 255;
  return (base + blended) / 2;
}

const runner: ProcessRunner = {
  async run(argv) {
    const child = Bun.spawn([...argv], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    return { stdout, stderr, exitCode };
  },
};

for (const kind of ["image", "svg", "video"] as const) {
  for (const blendMode of MODES) {
    test.skipIf(FFMPEG === null || FFPROBE === null || (kind === "svg" && RSVG_CONVERT === null))(
      `composites ${kind} ${blendMode} in RGB with alpha and temporal bounds`,
      async () => {
        if (FFMPEG === null || FFPROBE === null) return;
        const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-project-blend-")));
        try {
          await mkdir(join(root, "renders"));
          const filename = kind === "svg" ? "layer.svg" : kind === "video" ? "layer.mp4" : "layer.png";
          const path = join(root, filename);
          if (kind === "svg") {
            await writeFile(path, '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#c85028" fill-opacity=".5" d="M0 0h16v32H0z"/></svg>');
          } else if (kind === "image") {
            const pixels = Buffer.alloc(32 * 32 * 4);
            for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
              pixels.set([...LAYER, 128], (y * 32 + x) * 4);
            }
            await sharp(pixels, { raw: { width: 32, height: 32, channels: 4 } }).png().toFile(path);
          } else {
            const source = join(root, "opaque.png");
            await sharp({ create: { width: 32, height: 32, channels: 3,
              background: { r: LAYER[0], g: LAYER[1], b: LAYER[2] } } }).png().toFile(source);
            const generated = await runner.run([FFMPEG, "-v", "error", "-nostdin", "-loop", "1",
              "-framerate", "24", "-i", source, "-t", "0.625", "-c:v", "libx264rgb", "-crf", "0", path]);
            if (generated.exitCode !== 0) throw new Error(generated.stderr);
          }
          const bytes = await readFile(path);
          const integrity = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
          const range = { startUs: 125_000, endUs: 750_000 };
          const overlay = kind === "video" ? null : OverlayOperationSchema.parse({
            anchor: "center", blendMode, coordinateSpace: "output-pixels",
            entrance: { kind: "none" }, exit: { kind: "none" },
            intrinsicSize: { width: 32, height: 32 }, opacity: 1,
            overlayId: "overlay_blend_pixels", position: { x: 0, y: 0 }, range,
            rotationDegrees: 0, scale: 1, size: { kind: "intrinsic" }, zIndex: 0,
            source: { kind, asset: { ...integrity, path: filename,
              mediaType: kind === "svg" ? "image/svg+xml" : "image/png",
              provenance: { kind: "imported", originalName: filename, sourceSha256: integrity.sha256 } } },
          });
          const plan = ProjectRenderPlanV1Schema.parse({
            audioSlices: [], cameraKeyframes: [], cameraSegments: [],
            effects: { clickCues: [], clicks: { enabled: false }, cursor: { enabled: false },
              cursorSamples: [], keystrokeCues: [], keystrokes: { enabled: false },
              typedText: { enabled: false }, typingSpans: [] },
            kind: "studio.project-render-plan", schemaVersion: 1,
            output: { background: "#4080c0ff", durationUs: 1_000_000, frameRate: 24, pixelWidth: 64, pixelHeight: 64 },
            planSha256: "1".repeat(64), projectEditPlanSha256: "1".repeat(64),
            projectStructureSha256: "1".repeat(64), projectId: "project_blend_pixels", warnings: [],
            overlays: overlay === null ? [] : [{ operation: overlay, outputRange: range, projectRange: range,
              playbackOffsetUs: 0, visibleDurationUs: 625_000 }],
            videoSlices: kind !== "video" ? [] : [{ ...integrity, assetId: "asset_blend_pixels",
              assetRange: { startUs: 0, endUs: 625_000 }, fileRange: { startUs: 0, endUs: 625_000 },
              codec: "h264", container: "mp4", kind: "video", outputRange: range, path: filename,
              placementId: "placement_blend_pixels", projectRange: range, projectSpeed: 1, role: "b-roll",
              streamId: "stream_blend_pixels", streamIndex: 0,
              presentation: { blendMode, crop: { kind: "none" }, enabled: true, fit: "fill", layer: 0,
                layout: { kind: "normalized", x: .25, y: .25, width: .5, height: .5 }, opacity: .5 } }],
          });
          const output = join(root, "renders", "result.mp4");
          const built = await buildProjectFfmpegInvocation(plan, {
            ffmpeg: FFMPEG, ffprobe: FFPROBE, outputPath: output, projectDirectory: root, repositoryRoot: root, runner,
            ...(RSVG_CONVERT === null ? {} : { rsvgConvert: RSVG_CONVERT, rsvgConvertVersion: "test runtime" }),
          });
          const rendered = await runner.run(built.argv);
          if (rendered.exitCode !== 0) throw new Error(rendered.stderr);
          const decoder = Bun.spawn([FFMPEG, "-v", "error", "-nostdin", "-i", output, "-map", "0:v:0",
            "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { stdout: "pipe", stderr: "pipe" });
          const [raw, stderr, exitCode] = await Promise.all([
            new Response(decoder.stdout).arrayBuffer(), new Response(decoder.stderr).text(), decoder.exited,
          ]);
          if (exitCode !== 0) throw new Error(stderr);
          const pixels = new Uint8Array(raw);
          expect(pixels.length / (64 * 64 * 3)).toBe(24);
          for (let frame = 0; frame < 24; frame++) {
            // Frame 3 enters; frame 17 is the last active frame; frame 18 exits.
            const active = frame >= 3 && frame < 18;
            for (const [x, y, opaque] of [[24, 32, true], [4, 4, false], [40, 32, kind === "video"]] as const) {
              for (let channel = 0; channel < 3; channel++) {
                const expected = active && opaque ? expectedChannel(blendMode, BASE[channel]!, LAYER[channel]!) : BASE[channel]!;
                const actual = pixels[(frame * 64 * 64 + y * 64 + x) * 3 + channel]!;
                expect(Math.abs(actual - expected), `frame ${frame}, pixel ${x},${y}, channel ${channel}: ${actual} vs ${expected}`).toBeLessThanOrEqual(7);
              }
            }
          }
        } finally { await rm(root, { recursive: true, force: true }); }
      }, 20_000,
    );
  }
}

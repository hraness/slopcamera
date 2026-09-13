import { rm } from "node:fs/promises";
import { join } from "node:path";

import { analyzeAudioReactivity, AUDIO_REACTIVITY_MAX_DURATION_US, AUDIO_REACTIVITY_SAMPLE_RATE_HZ } from "../core/audio-reactivity";
import { createNodeBundleFileSystem } from "../core/storage";
import { HtmlOverlayAudioReactivitySchema } from "../html-overlay/audio-reactivity";
import { CliError } from "./errors";
import { SELF_CONTAINED_MEDIA_INPUT_ARGUMENTS } from "./media-ingest";
import { readMonoFloat32PcmBounded } from "./music-analysis-service";
import { resolveVerifiedProjectMedia, type PhysicalProjectMediaFingerprint } from "./project-media-integrity";

const MAX_PCM_BYTES = AUDIO_REACTIVITY_MAX_DURATION_US / 1_000_000 * AUDIO_REACTIVITY_SAMPLE_RATE_HZ * 4;

/** Decode a verified retained soundtrack prefix. The parent owns tool identity, lease and cancellation. */
export async function analyzeRetainedAudioReactivity(options: {
  readonly repositoryRoot: string;
  readonly jobDirectory: string;
  readonly audio: PhysicalProjectMediaFingerprint;
  readonly durationUs: number;
  readonly streamIndex: number;
  readonly ffmpeg: string;
  readonly run: (argv: readonly [string, ...string[]]) => Promise<unknown>;
  readonly fence: () => Promise<void>;
}) {
  if (!Number.isSafeInteger(options.durationUs) || options.durationUs < 1
    || options.durationUs > AUDIO_REACTIVITY_MAX_DURATION_US
    || !Number.isSafeInteger(options.streamIndex) || options.streamIndex < 0) {
    throw new CliError("invalid-data", "Audio reactivity duration or stream index is outside its bound.");
  }
  const verify = async () => {
    await options.fence();
    return await resolveVerifiedProjectMedia({ repositoryRoot: options.repositoryRoot,
      path: options.audio.path, expected: options.audio, label: "Audio reactivity soundtrack" });
  };
  const source = await verify();
  const pcmPath = join(options.jobDirectory, "audio-reactivity.f32le");
  const fs = createNodeBundleFileSystem(options.jobDirectory);
  try {
    await options.run([options.ffmpeg, "-nostdin", "-v", "error", "-n", "-threads", "2",
      ...SELF_CONTAINED_MEDIA_INPUT_ARGUMENTS, "-i", source, "-map", `0:${options.streamIndex}`,
      "-vn", "-sn", "-dn", "-t", (options.durationUs / 1_000_000).toFixed(6),
      "-ac", "1", "-ar", String(AUDIO_REACTIVITY_SAMPLE_RATE_HZ), "-c:a", "pcm_f32le", "-f", "f32le",
      "-fs", String(MAX_PCM_BYTES + 4), pcmPath]);
    await verify();
    const before = await fs.inspectFile!("audio-reactivity.f32le", MAX_PCM_BYTES);
    const pcm = await readMonoFloat32PcmBounded(pcmPath, { maxBytes: MAX_PCM_BYTES, sampleRateHz: AUDIO_REACTIVITY_SAMPLE_RATE_HZ });
    const expectedSamples = Math.round(options.durationUs * AUDIO_REACTIVITY_SAMPLE_RATE_HZ / 1_000_000);
    if (Math.abs(pcm.samples.length - expectedSamples) > 2) {
      throw new CliError("invalid-data", "Audio reactivity decode did not cover the requested soundtrack prefix.");
    }
    const analysis = analyzeAudioReactivity(pcm);
    await options.fence();
    const after = await fs.inspectFile!("audio-reactivity.f32le", MAX_PCM_BYTES);
    if (before.bytes !== after.bytes || before.sha256 !== after.sha256) {
      throw new CliError("conflict", "Audio reactivity PCM changed during analysis.");
    }
    return HtmlOverlayAudioReactivitySchema.parse({ kind: "slopcamera.audio-reactivity", schemaVersion: 1,
      profile: "bands-v1", rateHz: 60, ...analysis,
      source: { bytes: options.audio.bytes, sha256: options.audio.sha256 },
      pcm: { sampleCount: pcm.samples.length, sha256: before.sha256 } });
  } finally {
    await rm(pcmPath, { force: true });
  }
}

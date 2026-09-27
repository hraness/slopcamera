import { z } from "zod";
import { getVisualStyleProfile } from "../../../src/visual-style";
import type { VideoEffectInput, VideoLookV1 } from "../contracts/video-effects";
import { createVideoLook } from "./video-effects";

export const VisualStyleVideoLookOptionsSchema = z.strictObject({
  height: z.number().int().min(64).max(4320).default(1080),
  seed: z.number().int().safe().min(0).max(2_147_483_647).default(20260923),
});

/**
 * Translate only supported finishing controls into the existing ordered look
 * graph. Scene construction, motion, gate weave, grain size, and true halation
 * remain authoring decisions; screen diffusion is not a film-stock simulation.
 */
export function createVisualStyleVideoLook(style: unknown, options: unknown = {}): VideoLookV1 {
  const profile = getVisualStyleProfile(style);
  const settings = VisualStyleVideoLookOptionsSchema.parse(options);
  const finish = profile.finishing;
  const effects: VideoEffectInput[] = [{
    kind: "color-grade", amount: 1,
    grade: { kind: "custom", controls: { saturation: finish.saturation, contrast: finish.contrast } },
  }];
  if (finish.halation > 0) effects.push({
    kind: "diffusion", amount: finish.halation,
    radiusPx: Math.max(0.25, 1.8 * settings.height / 1080), blendMode: "screen",
  });
  if (finish.grain > 0) effects.push({
    kind: "film-grain", amount: finish.grain, seed: settings.seed,
    cadence: "frame-varying", chroma: finish.saturation === 0 ? 0 : 0.12,
  });
  if (finish.vignette > 0) effects.push({ kind: "vignette", amount: finish.vignette });
  return createVideoLook(effects);
}

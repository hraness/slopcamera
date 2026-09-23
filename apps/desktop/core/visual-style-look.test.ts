import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { VISUAL_STYLE_IDS } from "../../../src/visual-style";
import { VideoLookV1Schema } from "../contracts/video-effects";
import { compileVideoLookToFfmpeg } from "./video-effects";
import { createVisualStyleVideoLook } from "./visual-style-look";

describe("visual style finishing", () => {
  test("silent film has monochrome frame-varying grain and preserves effect order", () => {
    const look = createVisualStyleVideoLook("silent-actuality", { height: 1440, seed: 1906 });
    expect(look.effects.map(effect => effect.kind)).toEqual(["color-grade", "diffusion", "film-grain", "vignette"]);
    expect(look.effects[0]).toMatchObject({ grade: { controls: { saturation: 0 } } });
    expect(look.effects[2]).toMatchObject({ cadence: "frame-varying", chroma: 0, seed: 1906 });
  });
  test("pixel work receives no diffusion or grain", () => {
    expect(createVisualStyleVideoLook("pixel-art").effects.map(effect => effect.kind)).toEqual(["color-grade"]);
  });
  test("every bounded style and seed compiles deterministically", () => {
    fc.assert(fc.property(fc.constantFrom(...VISUAL_STYLE_IDS), fc.integer({ min: 0, max: 2_147_483_647 }),
      fc.integer({ min: 64, max: 4320 }), (style, seed, height) => {
        const look = createVisualStyleVideoLook(style, { seed, height });
        expect(look).toEqual(VideoLookV1Schema.parse(look));
        const graph = compileVideoLookToFfmpeg(look);
        expect(graph).toEqual(compileVideoLookToFfmpeg(createVisualStyleVideoLook(style, { seed, height })));
        expect(graph.filterGraph).not.toMatch(/NaN|Infinity|undefined/u);
      }), { numRuns: 80 });
  });
  test("foreign controls cannot smuggle unbounded effects", () => {
    for (const options of [{ height: Infinity }, { seed: -1 }, { height: 4321 }, { filter: "movie=remote" }]) {
      expect(() => createVisualStyleVideoLook("silent-actuality", options)).toThrow();
    }
    expect(() => createVisualStyleVideoLook("unknown")).toThrow();
  });
});

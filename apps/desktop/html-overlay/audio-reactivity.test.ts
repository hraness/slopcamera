import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import {
  HTML_AUDIO_REACTIVITY_RESOURCE_NAME,
  HTML_AUDIO_REACTIVITY_RESOURCE_URL_PATH,
  createHtmlOverlayAudioReactivityRuntimeSource,
  prepareHtmlOverlayAudioReactivity,
  HtmlOverlayAudioReactivitySchema,
} from "./audio-reactivity";
import { createHtmlOverlayBrowserRuntimeSource } from "./runtime";
import { HtmlSceneInputSchema } from "./scene";

function fixture() {
  return {
    kind: "slopcamera.audio-reactivity", schemaVersion: 1, profile: "bands-v1",
    source: { bytes: 400, sha256: "a".repeat(64) }, pcm: { sampleCount: 800, sha256: "b".repeat(64) },
    durationUs: Math.round(800 * 1_000_000 / 24_000), rateHz: 60,
    bands: {
      bass: [0, 1, 0], mid: [0, 0.5, 0], treble: [0, 0.25, 0], energy: [0, 0.75, 0],
    },
  } as const;
}

describe("HTML overlay audio reactivity", () => {
  test("validates a bounded sidecar and interpolates by absolute time", () => {
    const data = HtmlOverlayAudioReactivitySchema.parse(fixture());
    const prepared = prepareHtmlOverlayAudioReactivity(data);
    expect(prepared.sample(0)).toEqual({ bass: 0, mid: 0, treble: 0, energy: 0 });
    const halfway = prepared.sample(8_333);
    expect(halfway.bass).toBeCloseTo(0.5, 3);
    expect(halfway.mid).toBeCloseTo(0.25, 3);
    expect(halfway.treble).toBeCloseTo(0.125, 3);
    expect(halfway.energy).toBeCloseTo(0.375, 3);
    expect(prepared.sample(prepared.durationUs)).toEqual({ bass: 0, mid: 0, treble: 0, energy: 0 });
    expect(prepared.sample(-1)).toEqual(prepared.sample(prepared.durationUs + 1));
    expect(() => prepareHtmlOverlayAudioReactivity({ ...fixture(), bands: { ...fixture().bands, bass: [0, 1] } })).toThrow();
  });

  test("SDK and generated browser samplers agree after backward seeks", () => {
    const browser = runInNewContext(createHtmlOverlayAudioReactivityRuntimeSource(), {}) as {
      prepareAudioReactivity: (value: unknown) => { sample: (timeUs: number) => unknown };
    };
    const sdk = prepareHtmlOverlayAudioReactivity(fixture());
    const page = browser.prepareAudioReactivity(fixture());
    for (const timeUs of [0, 1, 16_666, 24_999, sdk.durationUs - 1, sdk.durationUs, -1, 0]) {
      expect(page.sample(timeUs)).toEqual(sdk.sample(timeUs));
    }
  });

  test("the frozen authored runtime exposes the sampler", () => {
    const sandbox: Record<string, unknown> = { document: { getAnimations: () => [] }, addEventListener() {} };
    runInNewContext(createHtmlOverlayBrowserRuntimeSource({
      canvas: { width: 32, height: 18, deviceScaleFactor: 1 },
      timing: { durationUs: 1_000_000, fps: 2 }, parameters: {}, resources: [], seed: 7,
    }), sandbox);
    const overlay = sandbox.SlopcameraOverlay as { prepareAudioReactivity: (value: unknown) => unknown };
    expect(typeof overlay.prepareAudioReactivity).toBe("function");
    expect(Object.isFrozen(overlay)).toBe(true);
  });

  test("keeps the reserved resource identity stable", () => {
    expect(HTML_AUDIO_REACTIVITY_RESOURCE_NAME).toBe("audio-reactivity");
    expect(HTML_AUDIO_REACTIVITY_RESOURCE_URL_PATH).toBe("slopcamera/audio-reactivity.json");
    for (const invalid of [
      { ...fixture(), rateHz: 30 },
      { ...fixture(), source: { ...fixture().source, bytes: 0 } },
      { ...fixture(), bands: { ...fixture().bands, energy: [0, 0.75, 1] } },
    ]) expect(() => HtmlOverlayAudioReactivitySchema.parse(invalid)).toThrow();
  });

  test("checks generated resource capacity and retained declarations", () => {
    const base = {
      kind: "slopcamera.html-scene", schemaVersion: 1, name: "reactive", document: { html: "<canvas></canvas>" },
      canvas: { width: 32, height: 18, deviceScaleFactor: 1 }, timing: { durationUs: 1_000_000, fps: 2 },
      audio: { path: "/tmp/track.wav", reactivity: { profile: "bands-v1" } },
    } as const;
    expect(() => HtmlSceneInputSchema.parse({ ...base, resources: [{ name: "audio-reactivity", path: "track.json", urlPath: HTML_AUDIO_REACTIVITY_RESOURCE_URL_PATH, mediaType: "application/json", transport: "fetch" }] })).toThrow();
    expect(() => HtmlSceneInputSchema.parse({ ...base, audio: { ...base.audio, reactivity: { profile: "bands-v1", resource: "audio-reactivity" } } })).toThrow();
    expect(HtmlSceneInputSchema.parse({ ...base, resources: [{ name: "audio-reactivity", path: "track.json", urlPath: HTML_AUDIO_REACTIVITY_RESOURCE_URL_PATH, mediaType: "application/json", transport: "fetch" }], audio: { ...base.audio, reactivity: { profile: "bands-v1", resource: "audio-reactivity", sha256: "c".repeat(64) } } }).audio?.reactivity?.resource).toBe("audio-reactivity");
  });
});

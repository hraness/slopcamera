import { z } from "zod";

import type { AudioReactivityBands } from "../core/music-analysis";

export const HTML_AUDIO_REACTIVITY_RESOURCE_NAME = "audio-reactivity";
export const HTML_AUDIO_REACTIVITY_RESOURCE_URL_PATH = "slopcamera/audio-reactivity.json";
export const HTML_AUDIO_REACTIVITY_MAX_BYTES = 4 * 1024 * 1024;

export type HtmlOverlayAudioReactivity = Readonly<{
  kind: "slopcamera.audio-reactivity";
  schemaVersion: 1;
  profile: "bands-v1";
  source: Readonly<{ bytes: number; sha256: string }>;
  pcm: Readonly<{ sampleCount: number; sha256: string }>;
  durationUs: number;
  rateHz: 60;
  bands: AudioReactivityBands;
}>;

export type HtmlOverlayAudioSample = Readonly<{
  bass: number; mid: number; treble: number; energy: number;
}>;
export type PreparedHtmlOverlayAudioReactivity = Readonly<{
  durationUs: number;
  sample: (timeUs: number) => HtmlOverlayAudioSample;
}>;

const LIMITS = Object.freeze({ maxSamples: 14_400_000, maxSourceBytes: 512 * 1024 * 1024,
  sampleRateHz: 24_000, hopSize: 400, rateHz: 60, maxTimeUs: 3_600_000_000 });

/** One implementation validates the SDK and browser resource, before frame sampling. */
function createAudioReactivityRuntime(limits: typeof LIMITS) {
  const object = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("Audio reactivity requires a strict JSON object.");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).length !== keys.length
      || keys.some(key => descriptors[key] === undefined || !("value" in descriptors[key]!))) {
      throw new TypeError("Audio reactivity contains missing, unknown, or accessor fields.");
    }
    return value as Record<string, unknown>;
  };
  const integer = (value: unknown, minimum: number, maximum: number): number => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError("Audio reactivity integer is outside its bound.");
    }
    return value;
  };
  const digest = (value: unknown): string => {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
      throw new TypeError("Audio reactivity requires a SHA-256 digest.");
    }
    return value;
  };
  const parse = (value: unknown): HtmlOverlayAudioReactivity => {
    const input = object(value, ["kind", "schemaVersion", "profile", "source", "pcm", "durationUs", "rateHz", "bands"]);
    if (input.kind !== "slopcamera.audio-reactivity" || input.schemaVersion !== 1
      || input.profile !== "bands-v1" || input.rateHz !== limits.rateHz) {
      throw new TypeError("Unsupported audio reactivity profile or version.");
    }
    const source = object(input.source, ["bytes", "sha256"]);
    const pcm = object(input.pcm, ["sampleCount", "sha256"]);
    const sampleCount = integer(pcm.sampleCount, 1, limits.maxSamples);
    const durationUs = Math.round(sampleCount * 1_000_000 / limits.sampleRateHz);
    if (input.durationUs !== durationUs) throw new RangeError("Audio reactivity duration differs from its PCM sample count.");
    const length = Math.ceil(sampleCount / limits.hopSize) + 1;
    const bands = object(input.bands, ["bass", "mid", "treble", "energy"]);
    const channel = (value: unknown): readonly number[] => {
      const keys = value !== null && typeof value === "object" ? Reflect.ownKeys(value) : [];
      if (!Array.isArray(value) || value.length !== length || keys.length !== length + 1
        || keys.some(key => key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)))) {
        throw new RangeError("Audio reactivity bands must be dense arrays covering the declared duration.");
      }
      const copy: number[] = [];
      for (let index = 0; index < length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        const sample: unknown = descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
        if (typeof sample !== "number" || !Number.isFinite(sample) || sample < 0 || sample > 1) {
          throw new RangeError("Audio reactivity band values must be finite numbers in [0, 1].");
        }
        copy.push(sample === 0 ? 0 : sample);
      }
      if (copy.at(-1) !== 0) throw new RangeError("Audio reactivity requires a zero endpoint at the exact duration.");
      return Object.freeze(copy);
    };
    return Object.freeze({
      kind: "slopcamera.audio-reactivity", schemaVersion: 1, profile: "bands-v1", rateHz: 60, durationUs,
      source: Object.freeze({ bytes: integer(source.bytes, 1, limits.maxSourceBytes), sha256: digest(source.sha256) }),
      pcm: Object.freeze({ sampleCount, sha256: digest(pcm.sha256) }),
      bands: Object.freeze({ bass: channel(bands.bass), mid: channel(bands.mid), treble: channel(bands.treble), energy: channel(bands.energy) }),
    });
  };
  const prepareAudioReactivity = (input: unknown): PreparedHtmlOverlayAudioReactivity => {
    const data = parse(input);
    const zero = Object.freeze({ bass: 0, mid: 0, treble: 0, energy: 0 });
    return Object.freeze({ durationUs: data.durationUs, sample(timeUs: number): HtmlOverlayAudioSample {
      integer(timeUs, -limits.maxTimeUs, limits.maxTimeUs);
      if (timeUs < 0 || timeUs >= data.durationUs) return zero;
      const index = Math.min(data.bands.bass.length - 2, Math.floor(timeUs * limits.rateHz / 1_000_000));
      const startUs = index * 1_000_000 / limits.rateHz;
      const endUs = Math.min(data.durationUs, (index + 1) * 1_000_000 / limits.rateHz);
      const mix = Math.max(0, Math.min(1, (timeUs - startUs) / (endUs - startUs)));
      const interpolate = (band: readonly number[]) => band[index]! * (1 - mix) + band[index + 1]! * mix;
      return Object.freeze({ bass: interpolate(data.bands.bass), mid: interpolate(data.bands.mid),
        treble: interpolate(data.bands.treble), energy: interpolate(data.bands.energy) });
    } });
  };
  return { parse, prepareAudioReactivity };
}

const runtime = createAudioReactivityRuntime(LIMITS);
export const HtmlOverlayAudioReactivitySchema = z.unknown().transform((input, context): HtmlOverlayAudioReactivity => {
  try { return runtime.parse(input); } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid audio reactivity." });
    return z.NEVER;
  }
});

/** Validate and copy once. Samples depend only on absolute source time, in integer microseconds. */
export function prepareHtmlOverlayAudioReactivity(input: unknown): PreparedHtmlOverlayAudioReactivity {
  return runtime.prepareAudioReactivity(input);
}

export function createHtmlOverlayAudioReactivityRuntimeSource(): string {
  return `(() => { const runtime = (${createAudioReactivityRuntime.toString()})(${JSON.stringify(LIMITS)}); return { prepareAudioReactivity: runtime.prepareAudioReactivity }; })()`;
}

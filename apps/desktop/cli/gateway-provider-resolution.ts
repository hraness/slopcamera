/**
 * Alibaba Wan video models advertise normalized catalog resolutions such as
 * "720p", but the provider API accepts only explicit pixel sizes bound to
 * the requested aspect ratio ("1280x720"). This adapter translates the
 * catalog value through Wan's documented size table so local qualification
 * and duration pricing stay anchored to the catalog row while paid dispatch
 * sends the provider representation. The `1280x720` (16:9) cell and the
 * `480x832` enumeration hint are verified against the live provider; the
 * remaining cells mirror Wan's published size enum.
 */
const WAN_RESOLUTION_PIXEL_SIZES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "1080p": {
    "16:9": "1920x1080",
    "9:16": "1080x1920",
    "1:1": "1440x1440",
    "3:4": "1248x1632",
    "4:3": "1632x1248",
  },
  "480p": {
    "16:9": "832x480",
    "9:16": "480x832",
    "1:1": "624x624",
  },
  "720p": {
    "16:9": "1280x720",
    "9:16": "720x1280",
    "1:1": "960x960",
    "3:4": "832x1088",
    "4:3": "1088x832",
  },
};

/**
 * Resolve the resolution value a provider expects on the wire.
 * Returns `undefined` when the request carries no resolution, `null` when a
 * Wan catalog resolution cannot be mapped for the requested aspect ratio,
 * and the wire-ready value otherwise.
 */
export function providerVideoResolution(
  modelId: string,
  resolution: string | undefined,
  aspectRatio: string | undefined,
): string | null | undefined {
  if (
    resolution === undefined
    || !modelId.startsWith("alibaba/wan-")
    || !/^[1-9]\d{2,4}p$/iu.test(resolution)
  ) {
    return resolution;
  }
  // Wan produces 16:9 landscape output when a request omits the aspect ratio.
  return WAN_RESOLUTION_PIXEL_SIZES[resolution.toLocaleLowerCase("en-US")]
    ?.[aspectRatio ?? "16:9"] ?? null;
}

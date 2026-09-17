import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import type { Bounds } from "../../../src/spatial-scene/math";
import { SpatialSpzFactsSchema, SPATIAL_SPLAT_LIMITS, spatialSpzAllocationBounds, type SpatialSpzFacts } from "../contracts/spatial-world";

export interface SpatialSpzInspection {
  readonly facts: SpatialSpzFacts;
  /**
   * Model-space axis-aligned bounds decoded from the SPZ position section —
   * the signed int24 fixed-point XYZ each splat stores before any scene
   * normalization. This is the only honest splat enclosure available before a
   * renderer decodes gaussian extent, so object-ID proxies derive from it.
   */
  readonly modelBounds: Bounds;
}

/** Decodes one signed little-endian int24 fixed-point coordinate. */
function spzPositionComponent(data: Uint8Array, offset: number, fractionalBits: number): number {
  let raw = data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16);
  if (raw >= 0x80_00_00) raw -= 0x1_00_00_00;
  return raw / 2 ** fractionalBits;
}

/**
 * Inspect the complete gzip stream without allocating its advertised output.
 * No decoder/browser runs before admission. Besides structural facts, the
 * returned inspection carries model-space bounds decoded from the position
 * section — bytes [16, 16 + splats × 9) of the decompressed body — so object-ID
 * proxies and geometric audits share one trusted enclosure.
 */
export async function inspectSpatialSpz(input: Uint8Array, signal: AbortSignal): Promise<SpatialSpzInspection> {
  if (!(input instanceof Uint8Array) || input.byteLength < 18 || input.byteLength > SPATIAL_SPLAT_LIMITS.sourceBytes || input[0] !== 0x1f || input[1] !== 0x8b) throw new RangeError("The qualified splat profile requires bounded gzip SPZ v2/v3 bytes.");
  signal.throwIfAborted();
  const gunzip = createGunzip({ chunkSize: 16 * 1024 });
  const source = Readable.from([input]);
  const abort = () => gunzip.destroy(signal.reason instanceof Error ? signal.reason : new Error("SPZ admission cancelled."));
  signal.addEventListener("abort", abort, { once: true });
  source.pipe(gunzip);
  const header = new Uint8Array(16);
  let count = 0, facts: SpatialSpzFacts | undefined;
  let positions: Uint8Array | undefined;
  try {
    for await (const chunkInput of gunzip) {
      signal.throwIfAborted();
      const chunk = chunkInput as Buffer;
      const chunkStart = count;
      if (count < 16) header.set(chunk.subarray(0, Math.min(16 - count, chunk.byteLength)), count);
      count += chunk.byteLength;
      if (count > SPATIAL_SPLAT_LIMITS.decompressedBytes) throw new RangeError("SPZ decompression exceeds its byte budget.");
      if (facts === undefined && count >= 16) {
        const view = new DataView(header.buffer);
        const version = view.getUint32(4, true), splats = view.getUint32(8, true), shDegree = header[12]!, fractionalBits = header[13]!, flags = header[14]!;
        if (view.getUint32(0, true) !== 0x5053474e || (version !== 2 && version !== 3) || flags > 1 || header[15] !== 0) throw new RangeError("SPZ requires v2/v3 without LoD, extensions, or reserved flags.");
        if (flags === 1) throw new RangeError("Antialiased-training SPZ is not supported by the initial qualified Spark profile.");
        const decompressedBytes = 16 + splats * (9 + 1 + 3 + 3 + (version === 3 ? 4 : 3) + 3 * ((shDegree + 1) ** 2 - 1));
        facts = SpatialSpzFactsSchema.parse({ kind: "slopcamera.spz-admission", schemaVersion: 1, version, splats, shDegree, fractionalBits, antialiased: flags === 1, decompressedBytes, ...spatialSpzAllocationBounds(splats, input.byteLength, decompressedBytes) });
        positions = new Uint8Array(facts.splats * 9);
      }
      if (facts !== undefined && count > facts.decompressedBytes) throw new RangeError("SPZ body exceeds the exact admitted attribute layout.");
      if (positions !== undefined) {
        // SPZ lays out splat sections back-to-back: every position lands in
        // decompressed bytes [16, 16 + splats × 9) ahead of scales/rotations.
        const windowEnd = 16 + positions.byteLength;
        const copyStart = Math.max(chunkStart, 16), copyEnd = Math.min(count, windowEnd);
        if (copyEnd > copyStart) positions.set(chunk.subarray(copyStart - chunkStart, copyEnd - chunkStart), copyStart - 16);
      }
    }
    if (facts === undefined || count !== facts.decompressedBytes) throw new RangeError("SPZ attribute body is truncated or does not match its header.");
    signal.throwIfAborted();
    const positionBytes = positions ?? new Uint8Array(0);
    if (positionBytes.byteLength !== facts.splats * 9) throw new RangeError("SPZ position section is truncated or does not match its header.");
    const minimum = [Infinity, Infinity, Infinity] as [number, number, number], maximum = [-Infinity, -Infinity, -Infinity] as [number, number, number];
    for (let index = 0; index < facts.splats; index++) {
      for (const axis of [0, 1, 2] as const) {
        const value = spzPositionComponent(positionBytes, index * 9 + axis * 3, facts.fractionalBits);
        if (value < minimum[axis]) minimum[axis] = value;
        if (value > maximum[axis]) maximum[axis] = value;
      }
    }
    return Object.freeze({ facts: Object.freeze(facts), modelBounds: Object.freeze({ min: Object.freeze(minimum), max: Object.freeze(maximum) }) });
  } finally {
    signal.removeEventListener("abort", abort);
    const settled = [finished(source, { cleanup: true }), finished(gunzip, { cleanup: true })];
    source.destroy(); gunzip.destroy();
    await Promise.allSettled(settled);
  }
}

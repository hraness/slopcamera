import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import fc from "fast-check";

import { inspectSpatialSpz } from "./spatial-spz";
import { originalSpz } from "./spatial-world-fixture.testing";

function writePosition(raw: Uint8Array, index: number, x: number, y: number, z: number) {
  for (const [axis, value] of [x, y, z].entries()) {
    const offset = 16 + index * 9 + axis * 3;
    raw[offset] = value & 0xff; raw[offset + 1] = (value >> 8) & 0xff; raw[offset + 2] = (value >> 16) & 0xff;
  }
}
describe("bounded SPZ admission", () => {
  test("admits exact supported attribute layouts across counts and SH degrees", async () => {
    await fc.assert(fc.asyncProperty(fc.constantFrom(2 as const, 3 as const), fc.integer({ min: 1, max: 32 }), fc.integer({ min: 0, max: 3 }), async (version, count, sh) => {
      const input = originalSpz(version, count, sh), { facts, modelBounds } = await inspectSpatialSpz(input.compressed, new AbortController().signal);
      expect(facts).toMatchObject({ version, splats: count, shDegree: sh, decompressedBytes: input.raw.length });
      expect(facts.gpuBytesBound).toBeGreaterThan(count * 204);
      // Zero-filled fixture positions collapse to the origin at any fixed-point scale.
      expect(modelBounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
      expect(Object.isFrozen(modelBounds)).toBe(true);
    }), { numRuns: 32 });
  });
  test("decodes signed int24 positions into scaled model-space bounds", async () => {
    const fixture = originalSpz(3, 2, 0); // fractionalBits = 12 → scale 4096
    writePosition(fixture.raw, 0, 4096, -4096, 8192);   // (1, -1, 2)
    writePosition(fixture.raw, 1, -8192, 0, 4096);      // (-2, 0, 1)
    const { modelBounds } = await inspectSpatialSpz(gzipSync(fixture.raw), new AbortController().signal);
    expect(modelBounds).toEqual({ min: [-2, -1, 1], max: [1, 0, 2] });
  });
  test("honours the advertised fixed-point scale and the int24 extremes", async () => {
    const fixture = originalSpz(3, 2, 0); fixture.raw[13] = 0; // raw integers, scale 1
    writePosition(fixture.raw, 0, 0x7fffff, -0x800000, 1); // +max, -max, +1
    writePosition(fixture.raw, 1, -1, 2, 0x7fffff);
    const { modelBounds } = await inspectSpatialSpz(gzipSync(fixture.raw), new AbortController().signal);
    expect(modelBounds).toEqual({ min: [-1, -8_388_608, 1], max: [8_388_607, 2, 8_388_607] });
  });
  test("rejects unknown format, advertised count, extensions, and unsafe quantization before full inflate", async () => {
    for (const mutate of [(v: DataView) => v.setUint32(4, 4, true), (v: DataView) => v.setUint32(8, 500_001, true), (v: DataView) => v.setUint8(12, 4), (v: DataView) => v.setUint8(13, 25), (v: DataView) => v.setUint8(14, 128), (v: DataView) => v.setUint8(15, 1)]) {
      const fixture = originalSpz(); mutate(new DataView(fixture.raw.buffer));
      await expect(inspectSpatialSpz(gzipSync(fixture.raw), new AbortController().signal)).rejects.toThrow();
    }
  });
  test("rejects truncated, extended, CRC-corrupt and concatenated bodies", async () => {
    const { raw, compressed } = originalSpz(); const corrupt = compressed.slice(); corrupt[corrupt.length - 8] = corrupt[corrupt.length - 8]! ^ 1;
    for (const bytes of [gzipSync(raw.slice(0, -1)), gzipSync(new Uint8Array([...raw, 0])), corrupt, Buffer.concat([compressed, compressed])]) await expect(inspectSpatialSpz(bytes, new AbortController().signal)).rejects.toThrow();
  });
  test("rejects antialiased training until its appearance kernel is qualified", async () => {
    const fixture = originalSpz(); fixture.raw[14] = 1;
    await expect(inspectSpatialSpz(gzipSync(fixture.raw), new AbortController().signal)).rejects.toThrow("Antialiased-training SPZ");
  });
  test("cancelled admission rejects without leaving its decompressor running", async () => {
    const controller = new AbortController(); controller.abort(new Error("cancelled"));
    await expect(inspectSpatialSpz(originalSpz().compressed, controller.signal)).rejects.toThrow("cancelled");
    const live = new AbortController(); const pending = inspectSpatialSpz(originalSpz(3, 100_000, 3).compressed, live.signal); live.abort(new Error("mid-stream cancellation"));
    await expect(pending).rejects.toThrow("mid-stream cancellation");
  });
});

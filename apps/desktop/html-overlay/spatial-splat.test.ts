import { describe, expect, test } from "bun:test";

import { evaluateSpatialScene } from "../../../src/spatial-scene/evaluate";
import { parseSpatialScene, spatialAssetClosureDigests } from "../../../src/spatial-scene/identity";
import { fixtureEntity, fixtureScene } from "../../../src/spatial-scene/test-fixture";
import { spatialSpzAllocationBounds } from "../contracts/spatial-world";
import { createSpatialOverlayBatch } from "./spatial";

function fixture() {
  const source = fixtureScene(), base = fixtureEntity();
  const { geometry: _geometry, material: _material, ...identity } = base as Extract<typeof base, { kind: "mesh" }>;
  const scene = parseSpatialScene({ ...source, entities: [{ ...identity, kind: "splat", assetId: "asset_splat" }], assets: [{ assetId: "asset_splat", payload: { path: "world.spz", sha256: "a".repeat(64), bytes: 100 }, interpretation: { kind: "splat", format: "spz", sourceUp: "z", metersPerUnit: 2 }, dependencies: [], provenance: { source: "imported", description: "Original fixture" } }] });
  const snapshot = evaluateSpatialScene(scene, { timeUs: 0, cameraId: "camera_main" });
  const prepared = { kind: "splat", assetId: "asset_splat", entityId: "entity_box", assetManifestSha256: spatialAssetClosureDigests(scene.assets).asset_splat,
    resource: { name: "world", urlPath: "world.spz", sha256: "a".repeat(64), bytes: 100, mediaType: "application/octet-stream" },
    facts: { kind: "slopcamera.spz-admission", schemaVersion: 1, version: 3, splats: 2, shDegree: 0, fractionalBits: 12, antialiased: false, decompressedBytes: 56, ...spatialSpzAllocationBounds(2, 100, 56) },
    bounds: { min: [-1, -2, -3], max: [3, 4, 5] } };
  return { snapshots: [snapshot], preparedAssets: [prepared], frameRate: { numerator: 30, denominator: 1 }, mode: { kind: "beauty" }, executionProfile: "three-spark-webgl2-hardware-v1" };
}
describe("closed Three/Spark lowering", () => {
  test("requires explicit hardware capability for beauty; axial-depth stays unsupported", () => {
    const input = fixture();
    const { executionProfile: _profile, ...absentProfile } = input;
    for (const request of [absentProfile, { ...input, executionProfile: "three-webgl2-hardware-v1" }]) expect(() => createSpatialOverlayBatch(request)).toThrow("explicit Three/Spark");
    expect(() => createSpatialOverlayBatch({ ...input, mode: { kind: "axial-depth", coverage: { kind: "opaque" } } })).toThrow("axial-depth");
    expect(() => createSpatialOverlayBatch({ ...input, mode: { kind: "object-id", coverage: { kind: "opaque" } } })).toThrow("beauty only");
  });
  test("object-id lowers the splat as its bounding-box proxy under the normal selection code", () => {
    const input = fixture();
    const { executionProfile: _profile, ...absentProfile } = input;
    for (const request of [absentProfile, { ...absentProfile, executionProfile: "three-webgl2-hardware-v1" }]) {
      const result = createSpatialOverlayBatch({ ...request, mode: { kind: "object-id", coverage: { kind: "opaque" } } });
      const payload = JSON.parse(result.authoring.html.match(/const input=(.*);\nconst canvas/u)![1]!) as { splats?: unknown; frames: { objects: { kind: string; selectionId: number; geometry: { kind: string; size: number[] }; matrix: number[] }[] }[] };
      const object = payload.frames[0]!.objects[0]!;
      expect(payload.splats).toBeUndefined();
      expect(object.kind).toBe("mesh");
      expect(object.geometry).toEqual({ kind: "box", size: [4, 6, 8] });
      expect(object.selectionId).toBe(1);
      // bounds min [-1,-2,-3] max [3,4,5] → center [1,1,1]; the fixture entity
      // transform is identity, so the proxy matrix carries that translation.
      expect(object.matrix.slice(12)).toEqual([1, 1, 1, 1]);
      const evidence = result.metadata.frames[0]!.objects[0]!;
      expect(evidence).toMatchObject({ entityId: "entity_box", selectionId: 1, placement: "world",
        representation: "splat-bounding-box-proxy;spz-position-bounds;approximate-not-pixel-truth" });
      expect(result.metadata.splatProfile).toBeUndefined();
      expect(result.authoring.html).not.toContain("SparkRenderer");
    }
  });
  test("object-id never proxies an invisible or view-placed splat", () => {
    const input = fixture();
    const { executionProfile: _profile, ...absentProfile } = input;
    const snapshot = input.snapshots[0]!;
    const invisible = { ...snapshot, entities: [{ ...snapshot.entities[0]!, visible: false }] };
    const viewPlaced = { ...snapshot, entities: [{ ...snapshot.entities[0]!, entity: { ...snapshot.entities[0]!.entity, placement: { kind: "view", cameraId: "camera_main", units: "pixels", order: 0 } } }] };
    for (const frame of [invisible, viewPlaced]) {
      const result = createSpatialOverlayBatch({ ...absentProfile, snapshots: [frame], mode: { kind: "object-id", coverage: { kind: "opaque" } } });
      expect(result.metadata.frames[0]!.objects).toHaveLength(0);
    }
  });
  test("binds raw axes/units and exact nonmonotonic sample order without a collider surface", () => {
    const input = fixture(), snapshot = input.snapshots[0]!;
    const result = createSpatialOverlayBatch({ ...input, snapshots: [{ ...snapshot, timeUs: 500_000 }, snapshot, { ...snapshot, timeUs: 500_000 }] });
    const payload = JSON.parse(result.authoring.html.match(/const input=(.*);\nconst canvas/u)![1]!) as { frames: { timeUs: number; objects: { matrix: number[] }[] }[] };
    expect(payload.frames.map(frame => frame.timeUs)).toEqual([500_000, 0, 500_000]);
    expect(payload.frames[0]).toEqual(payload.frames[2]);
    const matrix = payload.frames[0]!.objects[0]!.matrix;
    expect(matrix[0]).toBe(2); expect(matrix[6]).toBeCloseTo(-2); expect(matrix[9]).toBeCloseTo(2);
    expect(result.authoring.html).toContain("enableLod:false"); expect(result.authoring.html).toContain("if(hasFrameSplats)await spark.update");
    expect(result.authoring.html).toContain("spark.lastSortTime=0");
    expect(result.metadata.splatProfile?.kernel).toEqual({ antialiased: false, preBlurAmount: 0.3, blurAmount: 0 });
    expect(result.authoring.html).not.toContain("requestAnimationFrame(");
  });
  test("guards signed SH radiance before gamma without clipping positive HDR", () => {
    const html = createSpatialOverlayBatch(fixture()).authoring.html;
    const guardSource = html.match(/const linearRgbAnchor=[\s\S]*?(?=\nspark.readPause)/u)?.[0];
    expect(guardSource).toBeDefined();
    const applyGuard = new Function("spark", guardSource!);
    const conversion = "rgba.rgb = srgbToLinear(rgba.rgb);";
    const material = { fragmentShader: `void main() {\n${conversion}\nrgba.a *= 0.5;\n}` };
    applyGuard({ material });
    expect(material.fragmentShader).toContain("rgba.a *= 0.5;");
    // Execute the emitted GLSL expression with component-wise GLSL helpers.
    // This checks the actual generated boundary, not a separately copied clamp.
    const expression = material.fragmentShader.match(/rgba\.rgb = (.+);/u)![1]!;
    const evaluate = new Function("rgba", "vec3", "max", "srgbToLinear", `return ${expression};`);
    const encode = (rgb: number[]) => evaluate({ rgb }, (n: number) => [n, n, n],
      (a: number[], b: number[]) => a.map((n, i) => Math.max(n, b[i]!)),
      (rgb: number[]) => rgb.map(n => Math.pow(n, 2.2)));
    expect(encode([-0.25, 0, 4])).toEqual([0, 0, Math.pow(4, 2.2)]);
    expect(encode([0.04045, 0.5, 2])).toEqual([0.04045, 0.5, 2].map(n => Math.pow(n, 2.2)));
    for (const fragmentShader of ["void main() {}", `${conversion}\n${conversion}`]) {
      expect(() => applyGuard({ material: { fragmentShader } })).toThrow("shader anchor changed");
    }
  });
  test("rejects stale payload, forged allocation and unsupported world transforms", () => {
    const input = fixture(), prepared = input.preparedAssets[0]!, snapshot = input.snapshots[0]!;
    expect(() => createSpatialOverlayBatch({ ...input, preparedAssets: [{ ...prepared, resource: { ...prepared.resource, sha256: "b".repeat(64) } }] })).toThrow("exact source payload");
    expect(() => createSpatialOverlayBatch({ ...input, preparedAssets: [{ ...prepared, facts: { ...prepared.facts, gpuBytesBound: 1 } }] })).toThrow("allocation");
    expect(() => createSpatialOverlayBatch({ ...input, preparedAssets: [{ ...prepared, facts: { ...prepared.facts, antialiased: true } }] })).toThrow();
    const entity = snapshot.entities[0]!;
    expect(() => createSpatialOverlayBatch({ ...input, snapshots: [{ ...snapshot, entities: [{ ...entity, worldMatrix: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }] }] })).toThrow("uniform");
  });
  test("includes full framebuffer allocation in the aggregate GPU bound", () => {
    const input = fixture(), prepared = input.preparedAssets[0]!, snapshot = input.snapshots[0]!;
    const count = 500_000, decompressedBytes = 16 + count * 20;
    // Splat storage + 16 B/pixel would pass, but the real beauty/depth/default
    // framebuffer attachments already exceed that accounting at this size.
    expect(() => createSpatialOverlayBatch({ ...input,
      preparedAssets: [{ ...prepared, facts: { ...prepared.facts, splats: count, decompressedBytes, ...spatialSpzAllocationBounds(count, prepared.resource.bytes, decompressedBytes) } }],
      snapshots: [{ ...snapshot, camera: { ...snapshot.camera, projection: { ...snapshot.camera.projection, width: 3000, height: 2000 } } }],
    })).toThrow("aggregate splat/GPU/host");
  });
  test("metadata is retained in asset closure but cannot become visible geometry", () => {
    const source = fixtureScene();
    const asset = { assetId: "asset_metadata", payload: { path: "world.json", sha256: "a".repeat(64), bytes: 100 }, interpretation: { kind: "metadata", format: "json", schema: "slopcamera.spatial-world-import" }, dependencies: [], provenance: { source: "imported", description: "Original metadata" } };
    expect(parseSpatialScene({ ...source, assets: [asset] }).assets).toHaveLength(1);
    const base = fixtureEntity();
    expect(() => parseSpatialScene({ ...source, assets: [asset], entities: [{ ...base, geometry: { kind: "asset", assetId: "asset_metadata" } }] })).toThrow("requires a gltf");
    expect(() => parseSpatialScene({ ...source, assets: [{ ...asset, payload: { ...asset.payload, bytes: 1_048_577 } }] })).toThrow("one MiB");
  });
});

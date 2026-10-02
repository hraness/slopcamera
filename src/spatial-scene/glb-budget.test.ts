import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import { deflateSync } from "node:zlib"
import { checkSpatialGlbBudget, checkSpatialGlbLodChain, measureSpatialGlbBudget, type SpatialGlbBudgetMeasurement } from "./glb-budget.js"
import { parseSpatialGlb } from "./gltf.js"

/** Original programmatic fixtures: one indexed triangle per mesh instance, no third-party geometry. */
function png(width: number, height: number): Uint8Array {
  const chunk = (type: string, payload: Uint8Array) => {
    const bytes = new Uint8Array(12 + payload.length), data = new DataView(bytes.buffer)
    data.setUint32(0, payload.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(payload, 8)
    let crc = 0xffffffff
    for (const byte of bytes.subarray(4, bytes.length - 4)) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    data.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0)
    return bytes
  }
  const ihdr = new Uint8Array(13), header = new DataView(ihdr.buffer)
  header.setUint32(0, width); header.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(new Uint8Array([0, 20, 40, 80, 128]))), chunk("IEND", new Uint8Array())]
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  return bytes
}

function glb(options: { readonly instances?: number; readonly images?: readonly (readonly [number, number])[] } = {}): Uint8Array {
  const geometry = new Uint8Array(104), data = new DataView(geometry.buffer)
  ;[0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1].forEach((value, index) => data.setFloat32(index * 4, value, true))
  ;[0, 0, 1, 0, 0, 1].forEach((value, index) => data.setFloat32(72 + index * 4, value, true))
  ;[0, 1, 2].forEach((value, index) => data.setUint16(96 + index * 2, value, true))
  const images = (options.images ?? []).map(([width, height]) => png(width, height))
  const imageViews: { buffer: number; byteOffset: number; byteLength: number }[] = []
  let length = geometry.length
  for (const image of images) { length = Math.ceil(length / 4) * 4; imageViews.push({ buffer: 0, byteOffset: length, byteLength: image.length }); length += image.length }
  const binary = new Uint8Array(length)
  binary.set(geometry)
  images.forEach((image, index) => binary.set(image, imageViews[index]!.byteOffset))
  const instances = options.instances ?? 1
  const materials = images.length === 0
    ? [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }]
    : [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, ...(images.length > 1 ? { metallicRoughnessTexture: { index: 1 } } : {}) } }]
  const document = {
    asset: { version: "2.0", generator: "SLOPCAMERA original budget fixture" },
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 24 }, { buffer: 0, byteOffset: 96, byteLength: 6 }, ...imageViews,
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    scene: 0, scenes: [{ nodes: Array.from({ length: instances }, (_, index) => index) }],
    nodes: Array.from({ length: instances }, (_, index) => ({ mesh: 0, translation: [index * 2, 0, 0] })),
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials,
    ...(images.length === 0 ? {} : {
      images: imageViews.map((_, index) => ({ bufferView: 4 + index, mimeType: "image/png" })),
      textures: images.map((_, index) => ({ source: index })),
    }),
  }
  const raw = new TextEncoder().encode(JSON.stringify(document))
  const json = new Uint8Array(Math.ceil(raw.length / 4) * 4).fill(32); json.set(raw)
  const bin = new Uint8Array(Math.ceil(binary.length / 4) * 4); bin.set(binary)
  const bytes = new Uint8Array(28 + json.length + bin.length), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
  view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20)
  view.setUint32(20 + json.length, bin.length, true); view.setUint32(24 + json.length, 0x004e4942, true); bytes.set(bin, 28 + json.length)
  return bytes
}

const measure = (options?: Parameters<typeof glb>[0]) => measureSpatialGlbBudget(parseSpatialGlb(glb(options)))

describe("GLB delivery budget", () => {
  test("counts instanced triangles and referenced texture cost", () => {
    const measurement = measure({ instances: 3, images: [[1024, 512], [300, 200]] })
    expect(measurement).toMatchObject({ triangles: 3, primitives: 3, textures: 2, texturePixels: 1024 * 512 + 300 * 200, maxTextureEdge: 1024, nonPowerOfTwoTextures: 1 })
    expect(measurement.textureBytes).toBeGreaterThan(0)
    expect(Object.isFrozen(measurement)).toBe(true)
  })

  test("an empty budget passes and each declared limit is checked independently", () => {
    const measurement = measure({ instances: 4, images: [[2048, 2048]] })
    expect(checkSpatialGlbBudget(measurement, {})).toEqual([])
    const findings = checkSpatialGlbBudget(measurement, { maxTriangles: 3, maxTextureEdge: 1024, maxTexturePixels: 2048 * 2048, requirePowerOfTwoTextures: true })
    expect(findings.map(finding => finding.code)).toEqual(["triangles-over-budget", "texture-edge-over-budget"])
    expect(findings[0]).toMatchObject({ actual: 4, limit: 3 })
  })

  test("rejects malformed or unbounded budgets before checking", () => {
    const measurement = measure()
    expect(() => checkSpatialGlbBudget(measurement, { maxTriangles: -1 })).toThrow()
    expect(() => checkSpatialGlbBudget(measurement, { maxTriangles: 100_001 })).toThrow()
    expect(() => checkSpatialGlbBudget(measurement, { maxTriangles: 1.5 })).toThrow()
    expect(() => checkSpatialGlbBudget(measurement, { maxTris: 10 })).toThrow()
    expect(() => measureSpatialGlbBudget({} as never)).toThrow("parsed GLB model")
  })

  test("an LOD chain must start at 0, stay contiguous and get cheaper", () => {
    const base = measure({ instances: 4, images: [[1024, 1024]] })
    const lod1 = measure({ instances: 2, images: [[512, 512]] })
    const lod2 = measure({ instances: 1 })
    expect(checkSpatialGlbLodChain([{ level: 2, measurement: lod2 }, { level: 0, measurement: base }, { level: 1, measurement: lod1 }])).toEqual([])
    expect(checkSpatialGlbLodChain([{ level: 0, measurement: base }, { level: 1, measurement: base }]).map(finding => finding.code)).toEqual(["lod-triangles-not-decreasing"])
    expect(checkSpatialGlbLodChain([{ level: 0, measurement: lod2 }, { level: 1, measurement: { ...lod2, triangles: 0, texturePixels: 1 } }]).map(finding => finding.code)).toEqual(["lod-texture-pixels-increased"])
    expect(checkSpatialGlbLodChain([{ level: 1, measurement: lod1 }]).map(finding => finding.code)).toEqual(["lod-missing-base"])
    expect(checkSpatialGlbLodChain([{ level: 0, measurement: base }, { level: 2, measurement: lod2 }]).map(finding => finding.code)).toEqual(["lod-level-gap"])
    expect(checkSpatialGlbLodChain([{ level: 0, measurement: base }, { level: 0, measurement: base }]).map(finding => finding.code)).toEqual(["lod-level-duplicate"])
    const budgeted = checkSpatialGlbLodChain([{ level: 0, measurement: base }, { level: 1, measurement: lod1, budget: { maxTriangles: 1 } }])
    expect(budgeted).toEqual([expect.objectContaining({ code: "triangles-over-budget", level: 1 })])
    expect(() => checkSpatialGlbLodChain([])).toThrow()
    expect(() => checkSpatialGlbLodChain([{ level: 8, measurement: base }])).toThrow()
    expect(() => checkSpatialGlbLodChain(Array.from({ length: 9 }, (_, level) => ({ level, measurement: base })))).toThrow()
    expect(() => checkSpatialGlbLodChain([{ level: 0, measurement: { ...base, triangles: -1 } }])).toThrow()
    expect(() => checkSpatialGlbLodChain([{ level: 0, measurement: base, budget: { maxTris: 1 } }])).toThrow()
    expect(() => checkSpatialGlbBudget({ ...base, extra: 1 }, {})).toThrow()
  })

  test("a strictly cheaper chain never reports order findings", () => {
    const empty: SpatialGlbBudgetMeasurement = { triangles: 0, primitives: 0, textures: 0, texturePixels: 0, textureBytes: 0, maxTextureEdge: 0, nonPowerOfTwoTextures: 0 }
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 1000 })), { minLength: 1, maxLength: 8 }), steps => {
      let triangles = 100_000, pixels = 1_000_000
      const chain = steps.map(([triangleStep, pixelStep], level) => {
        triangles -= triangleStep; pixels -= pixelStep
        return { level, measurement: { ...empty, triangles, texturePixels: pixels } }
      })
      expect(checkSpatialGlbLodChain(chain.reverse())).toEqual([])
    }))
  })
})

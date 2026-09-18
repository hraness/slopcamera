import { z } from "zod"
import { createBoundedJsonValueSnapshot, deepFreezeJson } from "../code/json-snapshot.js"
import { canonicalJson } from "../code/canonical-json.js"
import { createSha256HexHasher } from "../code/sha256.js"
import { SpatialDigestSchema } from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"
import { SPATIAL_GLB_LIMITS } from "./gltf.js"

/**
 * Retained-native adapter contracts for heavy geometry operations (mesh repair,
 * complex CSG beyond the portable hull bound, UV atlasing, decimation,
 * hull decomposition and GLB emission). The portable layer owns only the
 * typed request/receipt documents and their binding rules: every receipt must
 * name its request's content-derived identity and copy its operation, engine
 * and profile, and declared output digests are verified against real bytes
 * before any artifact may be published into a scene. No native execution lives
 * here — hosts run engines; this module also provides a deterministic fake
 * adapter so tests exercise the full contract without native dependencies.
 */
export const SPATIAL_GEOMETRY_NATIVE_LIMITS = Object.freeze({
  inputs: 8,
  inputBytes: SPATIAL_GLB_LIMITS.bytes,
  outputs: 16,
  outputBytes: 33_554_432,
  parametersBytes: 4_096,
  parametersDepth: 8,
  parametersValues: 256,
})

export const SPATIAL_GEOMETRY_NATIVE_OPERATIONS = [
  "mesh-repair", "complex-csg", "uv-atlas", "decimation", "hull-decomposition", "glb-emission",
] as const
export type SpatialGeometryNativeOperation = (typeof SPATIAL_GEOMETRY_NATIVE_OPERATIONS)[number]

const operation = z.enum(SPATIAL_GEOMETRY_NATIVE_OPERATIONS)
const engine = z.strictObject({
  engine: z.string().min(1).max(64),
  version: z.string().min(1).max(64),
  device: z.string().min(1).max(64).optional(),
})
const digestEntry = z.strictObject({ sha256: SpatialDigestSchema, bytes: z.number().int().safe().min(1).max(SPATIAL_GEOMETRY_NATIVE_LIMITS.outputBytes) })

export const SpatialGeometryNativeRequestSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-geometry-native-request"),
  schemaVersion: z.literal(1),
  operation,
  engine,
  /** Closed adapter profile for this operation, e.g. slopcamera.geometry-native-csg-v1. */
  profile: z.string().min(1).max(128),
  /** Sorted digests of the exact input payloads the engine consumed. */
  inputs: z.array(digestEntry).max(SPATIAL_GEOMETRY_NATIVE_LIMITS.inputs),
  /** Bounded plain-JSON operation parameters; captured canonically. */
  parameters: z.unknown().optional(),
})
export type SpatialGeometryNativeRequest = Readonly<z.infer<typeof SpatialGeometryNativeRequestSchema>>

export const SpatialGeometryNativeReceiptSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-geometry-native-receipt"),
  schemaVersion: z.literal(1),
  requestId: z.string().regex(/^native_[a-f0-9]{32}$/u),
  requestSha256: SpatialDigestSchema,
  operation,
  engine,
  profile: z.string().min(1).max(128),
  state: z.enum(["succeeded", "failed"]),
  /** Sorted declared output digests; publication verifies real bytes against them. */
  outputs: z.array(digestEntry).max(SPATIAL_GEOMETRY_NATIVE_LIMITS.outputs),
  failure: z.strictObject({ code: z.enum(["validation", "engine", "budget", "custody"]), message: z.string().min(1).max(2_048) }).optional(),
}).superRefine((receipt, context) => {
  if (receipt.state === "succeeded" && receipt.failure !== undefined) context.addIssue({ code: "custom", path: ["failure"], message: "Successful receipts carry no failure." })
  if (receipt.state === "failed" && receipt.failure === undefined) context.addIssue({ code: "custom", path: ["failure"], message: "Failed receipts require a failure reason." })
  if (receipt.outputs.reduce((sum, output) => sum + output.bytes, 0) > SPATIAL_GEOMETRY_NATIVE_LIMITS.outputBytes) context.addIssue({ code: "custom", path: ["outputs"], message: "Receipt exceeds the output byte bound." })
})
export type SpatialGeometryNativeReceipt = Readonly<z.infer<typeof SpatialGeometryNativeReceiptSchema>>

function nativeFail(message: string, path = "geometry-native"): never {
  throw new SpatialSceneError("invalid-data", `slopcamera.spatial-geometry-native-v1: ${message}`, path)
}

/** Parses a foreign request: strict schema plus canonical bounded parameter capture. */
export function parseSpatialGeometryNativeRequest(input: unknown): SpatialGeometryNativeRequest {
  const request = parseSpatialValue(SpatialGeometryNativeRequestSchema, input, "geometry-native request")
  if (request.inputs.length !== new Set(request.inputs.map(item => item.sha256)).size) nativeFail("Request inputs must carry distinct digests.", "request.inputs")
  const parameters = request.parameters === undefined ? undefined
    : createBoundedJsonValueSnapshot(request.parameters, SPATIAL_GEOMETRY_NATIVE_LIMITS.parametersBytes, "geometry-native parameters", {
      maximumDepth: SPATIAL_GEOMETRY_NATIVE_LIMITS.parametersDepth, maximumValues: SPATIAL_GEOMETRY_NATIVE_LIMITS.parametersValues,
    }).value
  return deepFreezeJson({ ...request, ...(parameters === undefined ? {} : { parameters }) })
}

/** Content-derived request identity and digest; identical requests reproduce both. */
export function spatialGeometryNativeRequestSha256(request: unknown): string {
  return spatialValueSha256({ domain: "slopcamera.spatial-geometry-native-request.v1", request: parseSpatialGeometryNativeRequest(request) })
}
export function spatialGeometryNativeRequestId(request: unknown): string {
  return `native_${spatialGeometryNativeRequestSha256(request).slice(0, 32)}`
}
export function spatialGeometryNativeReceiptSha256(receipt: unknown): string {
  return spatialValueSha256({ domain: "slopcamera.spatial-geometry-native-receipt.v1", receipt: parseSpatialValue(SpatialGeometryNativeReceiptSchema, receipt, "geometry-native receipt") })
}

/**
 * Validates that a receipt binds its exact request: operation, engine, profile,
 * requestId and requestSha256 must match, mirroring native-admission plan/receipt
 * reconciliation. Any mismatch is a typed rejection.
 */
export function validateSpatialGeometryNativeReceipt(input: { readonly request: unknown; readonly receipt: unknown }): SpatialGeometryNativeReceipt {
  const request = parseSpatialGeometryNativeRequest(input.request)
  const receipt = parseSpatialValue(SpatialGeometryNativeReceiptSchema, input.receipt, "geometry-native receipt")
  if (receipt.requestSha256 !== spatialGeometryNativeRequestSha256(request) || receipt.requestId !== spatialGeometryNativeRequestId(request)) {
    nativeFail("Receipt identity differs from the exact request it claims.", "receipt.requestSha256")
  }
  if (receipt.operation !== request.operation || receipt.profile !== request.profile || canonicalJson(receipt.engine) !== canonicalJson(request.engine)) {
    nativeFail("Receipt operation, profile, or engine differs from its request.", "receipt.operation")
  }
  return deepFreezeJson(receipt)
}

/**
 * Verifies declared output digests against real retained bytes BEFORE any
 * manifest or facts document may publish them. A mismatch is a typed error.
 */
export function verifySpatialGeometryNativeOutputs(receipt: unknown, outputs: readonly Uint8Array[]): readonly { sha256: string; bytes: number }[] {
  const parsed = parseSpatialValue(SpatialGeometryNativeReceiptSchema, receipt, "geometry-native receipt")
  if (parsed.state !== "succeeded") nativeFail("Only succeeded receipts publish retained outputs.", "receipt.state")
  const declared = parsed.outputs
  if (outputs.length !== declared.length) nativeFail("Retained output count differs from the receipt declaration.", "receipt.outputs")
  const verified = declared.map((output, index) => {
    const bytes = outputs[index]!
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== output.bytes) nativeFail(`Native output ${index} byte length differs from its receipt.`, `receipt.outputs.${index}`)
    const hasher = createSha256HexHasher(); hasher.update(bytes); const sha256 = hasher.digestHex()
    if (sha256 !== output.sha256) nativeFail(`Native output ${index} digest mismatch; refusing publication.`, `receipt.outputs.${index}`)
    return { sha256, bytes: output.bytes }
  })
  return deepFreezeJson(verified)
}

/**
 * Deterministic fake adapter for tests and hosts without a native engine: the
 * output stream derives entirely from the request digest, so identical inputs
 * always produce byte-identical artifacts and receipts.
 */
export function executeSpatialGeometryNativeFake(input: unknown): { readonly receipt: SpatialGeometryNativeReceipt; readonly outputs: readonly Uint8Array[] } {
  const request = parseSpatialGeometryNativeRequest(input)
  const requestSha256 = spatialGeometryNativeRequestSha256(request)
  const count = request.operation === "hull-decomposition" ? 4 : 1
  const outputs: Uint8Array[] = []
  const declared: { sha256: string; bytes: number }[] = []
  for (let index = 0; index < count; index++) {
    const seed = spatialValueSha256({ domain: "slopcamera.spatial-geometry-native-output.v1", requestSha256, index })
    const length = 256 + (Number.parseInt(seed.slice(0, 4), 16) % 256)
    const bytes = new Uint8Array(length)
    for (let offset = 0; offset < length; offset++) bytes[offset] = Number.parseInt(seed.slice((offset % 32) * 2, (offset % 32) * 2 + 2), 16)
    const hasher = createSha256HexHasher(); hasher.update(bytes); const sha256 = hasher.digestHex()
    outputs.push(bytes)
    declared.push({ sha256, bytes: length })
  }
  const receipt = parseSpatialValue(SpatialGeometryNativeReceiptSchema, {
    kind: "slopcamera.spatial-geometry-native-receipt", schemaVersion: 1,
    requestId: spatialGeometryNativeRequestId(request), requestSha256,
    operation: request.operation, engine: request.engine, profile: request.profile,
    state: "succeeded", outputs: declared,
  }, "geometry-native receipt")
  return deepFreezeJson({ receipt, outputs: Object.freeze(outputs) })
}

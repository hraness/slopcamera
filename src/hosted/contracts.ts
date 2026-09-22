import { z } from "zod"
import { createBoundedJsonValueSnapshot, deepFreezeJson } from "../code/json-snapshot.js"

/** Internal representation ceilings, not a hosted catalog, price, or activation. */
export const HOSTED_LIMITS = Object.freeze({
  jsonBytes: 131_072, jsonDepth: 12, jsonValues: 2_048, promptBytes: 32_768,
  references: 4, imageCount: 4, dimension: 4_096, pixels: 16_777_216,
  referenceBytes: 16_777_216, artifactBytes: 67_108_864,
  // Same nonnegative integer domain as credits-foundation 0.1.1.
  microUsd: 1_000_000_000_000_000, safetyBoundMs: 86_400_000,
})

export class HostedContractError extends Error {
  constructor(readonly code: "invalid-data" | "identity-conflict" | "stale-state" | "invalid-transition" | "expired-authorization", message: string) {
    super(message)
    this.name = "HostedContractError"
  }
}

const wellFormed = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false
  }
  return true
}

const boundedText = (maximumBytes: number) => z.string().min(1).max(maximumBytes)
  .refine(value => wellFormed(value) && new TextEncoder().encode(value).byteLength <= maximumBytes)
export const HostedDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u)
export const HostedTimeSchema = z.number().int().safe().nonnegative()
export const HostedMoneySchema = z.number().int().safe().min(0).max(HOSTED_LIMITS.microUsd)
const id = z.string().min(8).max(96).regex(/^[a-zA-Z0-9_-]+$/u)
export const HostedJobIdSchema = z.string().regex(/^job_[a-z0-9]{16,64}$/u)
export const HostedImageMimeSchema = z.enum(["image/png", "image/jpeg", "image/webp"])

export const HostedKeySchema = z.strictObject({
  environment: z.enum(["test", "live"]), subjectKey: HostedDigestSchema,
  clientRequestId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u),
})
export type HostedKey = z.infer<typeof HostedKeySchema>

const dimensions = {
  width: z.number().int().min(1).max(HOSTED_LIMITS.dimension),
  height: z.number().int().min(1).max(HOSTED_LIMITS.dimension),
}
const reference = z.strictObject({
  uploadId: id, sha256: HostedDigestSchema,
  bytes: z.number().int().min(1).max(HOSTED_LIMITS.referenceBytes),
  mediaType: HostedImageMimeSchema, role: z.enum(["image", "mask"]),
})
export const HostedImageRequestSchema = z.strictObject({
  kind: z.literal("slopcamera.hosted-image-request"), schemaVersion: z.literal(1),
  operation: z.literal("image.generate"),
  model: z.string().min(3).max(160).regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u),
  catalogRevision: HostedDigestSchema, prompt: boundedText(HOSTED_LIMITS.promptBytes),
  references: z.array(reference).max(HOSTED_LIMITS.references).default([]),
  ...dimensions, count: z.number().int().min(1).max(HOSTED_LIMITS.imageCount).default(1),
  seed: z.number().int().min(0).max(0xffff_ffff).nullable().default(null),
  outputMediaType: HostedImageMimeSchema.default("image/png"),
}).superRefine((value, context) => {
  if (value.width * value.height > HOSTED_LIMITS.pixels) context.addIssue({ code: "custom", message: "Image dimensions exceed the representation limit." })
  if (new Set(value.references.map(item => item.uploadId)).size !== value.references.length) context.addIssue({ code: "custom", message: "Reference identities must be unique." })
})
export type HostedImageRequest = z.infer<typeof HostedImageRequestSchema>

export const HostedQuoteSchema = z.strictObject({
  kind: z.literal("slopcamera.hosted-quote"), schemaVersion: z.literal(1), quoteId: id,
  effectSha256: HostedDigestSchema, catalogRevision: HostedDigestSchema, policyRevision: HostedDigestSchema,
  createdAtMs: HostedTimeSchema, expiresAtMs: HostedTimeSchema,
  maximumChargeMicroUsd: HostedMoneySchema, estimatedChargeMicroUsd: HostedMoneySchema.nullable(),
}).superRefine((value, context) => {
  if (value.expiresAtMs <= value.createdAtMs) context.addIssue({ code: "custom", message: "Quote expiry must follow creation." })
  if (value.estimatedChargeMicroUsd !== null && value.estimatedChargeMicroUsd > value.maximumChargeMicroUsd) context.addIssue({ code: "custom", message: "Estimate exceeds authorization." })
})
export type HostedQuote = z.infer<typeof HostedQuoteSchema>

export const HostedArtifactManifestSchema = z.strictObject({
  kind: z.literal("slopcamera.hosted-image-artifacts"), schemaVersion: z.literal(1), jobId: HostedJobIdSchema,
  effectSha256: HostedDigestSchema, verifiedAtMs: HostedTimeSchema, expiresAtMs: HostedTimeSchema,
  artifacts: z.array(z.strictObject({
    artifactId: id, sha256: HostedDigestSchema,
    bytes: z.number().int().min(1).max(HOSTED_LIMITS.artifactBytes), mediaType: HostedImageMimeSchema,
    ...dimensions,
  })).min(1).max(HOSTED_LIMITS.imageCount),
}).superRefine((value, context) => {
  if (value.expiresAtMs <= value.verifiedAtMs) context.addIssue({ code: "custom", message: "Artifact expiry must follow verification." })
  if (new Set(value.artifacts.map(item => item.artifactId)).size !== value.artifacts.length) context.addIssue({ code: "custom", message: "Artifact identities must be unique." })
})
export type HostedArtifactManifest = z.infer<typeof HostedArtifactManifestSchema>

export const HostedHoldSchema = z.strictObject({
  holdId: id, ceilingMicroUsd: HostedMoneySchema, expiresAtMs: HostedTimeSchema,
})
const intentKey = z.string().min(1).max(128).regex(/^[a-z0-9:_-]+$/u)
const billingIntent = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hold"), key: intentKey }),
  z.strictObject({ kind: z.literal("settle"), key: intentKey, amountMicroUsd: HostedMoneySchema }),
  z.strictObject({ kind: z.literal("release"), key: intentKey }),
])
const dispatch = z.strictObject({
  attempt: z.literal(1), providerRequestSha256: HostedDigestSchema,
  qualificationId: HostedDigestSchema, deadlineMs: HostedTimeSchema, externalRequestId: id.nullable(),
  admittedAtMs: HostedTimeSchema, latestStartAtMs: HostedTimeSchema,
  completionAndRecoveryBoundMs: z.number().int().min(1).max(HOSTED_LIMITS.safetyBoundMs * 4),
})
export const HostedBillingObservationSchema = z.strictObject({
  holdId: id, state: z.enum(["settled", "released", "expired"]), chargedMicroUsd: HostedMoneySchema,
}).refine(value => value.state === "settled" || value.chargedMicroUsd === 0)

export const HostedJobSchema = z.strictObject({
  kind: z.literal("slopcamera.hosted-job"), schemaVersion: z.literal(1), jobId: HostedJobIdSchema,
  key: HostedKeySchema, request: HostedImageRequestSchema, quote: HostedQuoteSchema,
  effectSha256: HostedDigestSchema, authorizationSha256: HostedDigestSchema,
  version: HostedTimeSchema, fence: HostedTimeSchema, updatedAtMs: HostedTimeSchema,
  generation: z.enum(["accepted", "awaiting_funds", "hold_pending", "ready", "dispatching", "running", "reconciling", "succeeded", "failed", "canceled"]),
  billing: z.enum(["none", "hold_pending", "held", "settle_pending", "release_pending", "settled", "released", "expired", "reconciliation_required"]),
  artifact: z.enum(["absent", "receiving", "verified", "available", "expired", "deleted"]),
  cancelRequested: z.boolean(), hold: HostedHoldSchema.nullable(), dispatch: dispatch.nullable(),
  billingIntent: billingIntent.nullable(), billingObservation: HostedBillingObservationSchema.nullable(),
  billingAttention: z.enum(["none", "unexpected-terminal", "amount-mismatch", "over-ceiling"]),
  artifactManifest: HostedArtifactManifestSchema.nullable(),
})
export type HostedJob = z.infer<typeof HostedJobSchema>

const safety = z.strictObject({
  effectSha256: HostedDigestSchema, qualificationId: HostedDigestSchema,
  providerCompletionBoundMs: z.number().int().min(1).max(HOSTED_LIMITS.safetyBoundMs),
  artifactAdmissionBoundMs: z.number().int().min(0).max(HOSTED_LIMITS.safetyBoundMs),
  settlementRecoveryMarginMs: z.number().int().min(0).max(HOSTED_LIMITS.safetyBoundMs),
  clockSkewMarginMs: z.number().int().min(0).max(HOSTED_LIMITS.safetyBoundMs),
})
export const HostedEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("request-hold") }),
  z.strictObject({ kind: z.literal("hold-observed"), hold: HostedHoldSchema }),
  z.strictObject({ kind: z.literal("hold-unavailable"), reason: z.enum(["insufficient-funds", "rejected"]) }),
  z.strictObject({ kind: z.literal("request-dispatch"), nextFence: HostedTimeSchema, providerRequestSha256: HostedDigestSchema, safety }),
  z.strictObject({ kind: z.literal("provider-started"), externalRequestId: id }),
  z.strictObject({ kind: z.literal("provider-terminal"), externalRequestId: id, outcome: z.enum(["succeeded", "failed", "canceled"]), proof: z.literal("provider-confirmed") }),
  z.strictObject({ kind: z.literal("uncertain"), phase: z.enum(["hold", "dispatch", "settle", "release"]) }),
  z.strictObject({ kind: z.literal("take-reconciliation-ownership"), nextFence: HostedTimeSchema }),
  z.strictObject({ kind: z.literal("request-cancel") }),
  z.strictObject({ kind: z.literal("request-settle"), amountMicroUsd: HostedMoneySchema, policyRevision: HostedDigestSchema }),
  z.strictObject({ kind: z.literal("request-release"), policyRevision: HostedDigestSchema }),
  z.strictObject({ kind: z.literal("billing-observed"), observation: HostedBillingObservationSchema }),
  z.strictObject({ kind: z.literal("receive-artifacts") }),
  z.strictObject({ kind: z.literal("artifacts-verified"), manifest: HostedArtifactManifestSchema }),
  z.strictObject({ kind: z.literal("artifacts-available") }),
  z.strictObject({ kind: z.literal("artifacts-expired") }),
  z.strictObject({ kind: z.literal("artifacts-deleted") }),
])
export type HostedEvent = z.infer<typeof HostedEventSchema>

function rejectHiddenProperties(input: unknown): void {
  const pending: unknown[] = [input]
  let values = 0
  while (pending.length > 0) {
    const value = pending.pop()
    if (++values > HOSTED_LIMITS.jsonValues) throw new Error("Too many values.")
    if (value === null || typeof value !== "object") continue
    const keys = Reflect.ownKeys(value)
    if (keys.length > HOSTED_LIMITS.jsonValues) throw new Error("Too many properties.")
    for (const key of keys) {
      if (Array.isArray(value) && key === "length") continue
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (typeof key !== "string" || descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error("Invalid data property.")
      pending.push(descriptor.value)
    }
  }
}

/** No getters, credentials or arbitrary unknown keys enter a retained value. */
export function parseHostedValue<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> {
  try {
    const captured = createBoundedJsonValueSnapshot(input, HOSTED_LIMITS.jsonBytes, "Hosted contract", {
      maximumDepth: HOSTED_LIMITS.jsonDepth, maximumValues: HOSTED_LIMITS.jsonValues,
    })
    rejectHiddenProperties(input)
    const result = schema.safeParse(captured.value)
    if (!result.success) throw new HostedContractError("invalid-data", "Invalid hosted contract data.")
    return deepFreezeJson(result.data)
  } catch {
    // Never copy untrusted input, parser paths or provider errors into diagnostics.
    throw new HostedContractError("invalid-data", "Invalid hosted contract data.")
  }
}

export const parseHostedImageRequest = (input: unknown): HostedImageRequest => parseHostedValue(HostedImageRequestSchema, input)
export const parseHostedQuote = (input: unknown): HostedQuote => parseHostedValue(HostedQuoteSchema, input)
export const parseHostedArtifactManifest = (input: unknown): HostedArtifactManifest => parseHostedValue(HostedArtifactManifestSchema, input)

export function parseHostedImageRequestJson(input: unknown): HostedImageRequest {
  if (typeof input !== "string" || input.length > HOSTED_LIMITS.jsonBytes || !wellFormed(input) || new TextEncoder().encode(input).byteLength > HOSTED_LIMITS.jsonBytes) {
    throw new HostedContractError("invalid-data", "Invalid hosted request JSON.")
  }
  try { return parseHostedImageRequest(JSON.parse(input) as unknown) }
  catch { throw new HostedContractError("invalid-data", "Invalid hosted request JSON.") }
}

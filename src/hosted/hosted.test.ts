import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import {
  HOSTED_LIMITS, HostedContractError, parseHostedImageRequest, parseHostedImageRequestJson,
  parseHostedQuote, parseHostedArtifactManifest, type HostedJob,
} from "./contracts.js"
import { bindHostedAuthorization, compareHostedReplay, hostedEffectSha256, hostedHoldKey, hostedRequestKeySha256 } from "./identity.js"
import { createHostedJob, parseHostedJob, reduceHostedJob } from "./state.js"

const DIGEST = "a".repeat(64)
const POLICY = "b".repeat(64)
const REQUEST = {
  kind: "slopcamera.hosted-image-request", schemaVersion: 1, operation: "image.generate",
  model: "example/image", catalogRevision: DIGEST, prompt: "An original brass camera", width: 1024, height: 1024,
}
const KEY = { environment: "test", subjectKey: "c".repeat(64), clientRequestId: "00000000-0000-4000-8000-000000000001" }
const JOB_ID = "job_0000000000000001"
function quote(request: unknown = REQUEST, changes = {}) {
  return { kind: "slopcamera.hosted-quote", schemaVersion: 1, quoteId: "quote_00000001",
    effectSha256: hostedEffectSha256(request), catalogRevision: DIGEST, policyRevision: POLICY,
    createdAtMs: 1000, expiresAtMs: 100_000, maximumChargeMicroUsd: 100_000,
    estimatedChargeMicroUsd: null, ...changes }
}
function job(): HostedJob { return createHostedJob({ jobId: JOB_ID, key: KEY, request: REQUEST, quote: quote(), nowMs: 2000 }) }
function step(state: HostedJob, event: unknown, nowMs = state.updatedAtMs) {
  return reduceHostedJob(state, { expectedVersion: state.version, expectedFence: state.fence, nowMs, event })
}
function held(): HostedJob {
  return step(step(job(), { kind: "request-hold" }).next,
    { kind: "hold-observed", hold: { holdId: "hold_00000001", ceilingMicroUsd: 90_000, expiresAtMs: 90_000 } }).next
}
const dispatch = (state: HostedJob) => ({ kind: "request-dispatch", nextFence: state.fence + 1,
  providerRequestSha256: "d".repeat(64), safety: { effectSha256: state.effectSha256,
    qualificationId: "e".repeat(64), providerCompletionBoundMs: 10_000,
    artifactAdmissionBoundMs: 1000, settlementRecoveryMarginMs: 1000, clockSkewMarginMs: 1000 } })
function sent(): HostedJob { const state = held(); return step(state, dispatch(state)).next }
function succeeded(): HostedJob {
  return step(sent(), { kind: "provider-terminal", externalRequestId: "provider_000001", outcome: "succeeded", proof: "provider-confirmed" }).next
}
function manifest(state: HostedJob) {
  return { kind: "slopcamera.hosted-image-artifacts", schemaVersion: 1, jobId: state.jobId,
    effectSha256: state.effectSha256, verifiedAtMs: 2000, expiresAtMs: 80_000,
    artifacts: [{ artifactId: "artifact_000001", sha256: "f".repeat(64), bytes: 4096,
      mediaType: "image/png", width: 1024, height: 1024 }] }
}

describe("inactive hosted identities", () => {
  test("normalizes only explicit defaults and object key order; retains the authored prompt", () => {
    const normalized = parseHostedImageRequest(REQUEST)
    expect(normalized).toMatchObject({ count: 1, references: [], seed: null, outputMediaType: "image/png" })
    expect(hostedEffectSha256(REQUEST)).toBe(hostedEffectSha256(normalized))
    expect(hostedEffectSha256(Object.fromEntries(Object.entries(REQUEST).reverse()))).toBe(hostedEffectSha256(REQUEST))
    expect(hostedEffectSha256({ ...REQUEST, prompt: REQUEST.prompt + " " })).not.toBe(hostedEffectSha256(REQUEST))
    expect(Object.isFrozen(normalized)).toBe(true)
    expect(Object.isFrozen(normalized.references)).toBe(true)
  })

  test("binds every effect field and ordered finalized references", () => {
    const reference = { uploadId: "upload_000001", sha256: DIGEST, bytes: 10, mediaType: "image/png", role: "image" }
    const changes = [
      { model: "example/other" }, { catalogRevision: POLICY }, { prompt: "A different camera" },
      { width: 512 }, { height: 512 }, { count: 2 }, { seed: 1 }, { outputMediaType: "image/webp" }, { references: [reference] },
    ]
    for (const change of changes) expect(hostedEffectSha256({ ...REQUEST, ...change })).not.toBe(hostedEffectSha256(REQUEST))
    const second = { ...reference, uploadId: "upload_000002", sha256: POLICY }
    const withRefs = { ...REQUEST, references: [reference, second] }
    expect(hostedEffectSha256(withRefs)).not.toBe(hostedEffectSha256({ ...REQUEST, references: [second, reference] }))
    for (const change of [{ sha256: POLICY }, { bytes: 11 }, { mediaType: "image/jpeg" }, { role: "mask" }]) {
      expect(hostedEffectSha256({ ...REQUEST, references: [{ ...reference, ...change }, second] })).not.toBe(hostedEffectSha256(withRefs))
    }
  })

  test("quote binding has no circular digest and changed authorization conflicts", () => {
    const original = bindHostedAuthorization(REQUEST, quote())
    const existing = { key: KEY, authorizationSha256: original.authorizationSha256 }
    expect(compareHostedReplay(existing, KEY, REQUEST, quote())).toBe("same-request")
    for (const change of [
      { quoteId: "quote_00000002" }, { policyRevision: DIGEST }, { maximumChargeMicroUsd: 99_999 },
      { expiresAtMs: 99_999 }, { createdAtMs: 1001 }, { estimatedChargeMicroUsd: 50_000 },
    ]) expect(() => compareHostedReplay(existing, KEY, REQUEST, quote(REQUEST, change))).toThrow(HostedContractError)
    expect(() => bindHostedAuthorization({ ...REQUEST, model: "example/other" }, quote())).toThrow(HostedContractError)
    expect(() => bindHostedAuthorization(REQUEST, quote(REQUEST, { catalogRevision: POLICY }))).toThrow(HostedContractError)
    // Comparison does not create another job or re-authorize an expired quote.
    expect(compareHostedReplay(existing, KEY, REQUEST, quote())).toBe("same-request")
    expect(() => createHostedJob({ jobId: JOB_ID, key: KEY, request: REQUEST, quote: quote(), nowMs: 100_000 })).toThrow(HostedContractError)
  })

  test("owner and environment keys separate jobs; holds use product-global job identity", () => {
    const existing = { key: KEY, authorizationSha256: bindHostedAuthorization(REQUEST, quote()).authorizationSha256 }
    for (const key of [{ ...KEY, environment: "live" }, { ...KEY, subjectKey: POLICY }, { ...KEY, clientRequestId: "00000000-0000-4000-8000-000000000002" }]) {
      expect(hostedRequestKeySha256(key)).not.toBe(hostedRequestKeySha256(KEY))
      expect(compareHostedReplay(existing, key, REQUEST, quote())).toBe("different-key")
    }
    expect(hostedHoldKey(KEY, JOB_ID)).not.toBe(hostedHoldKey({ ...KEY, environment: "live" }, JOB_ID))
    expect(hostedHoldKey(KEY, JOB_ID)).not.toBe(hostedHoldKey(KEY, "job_0000000000000002"))
    expect(hostedHoldKey(KEY, JOB_ID).length).toBeLessThanOrEqual(128)
  })

  test("rejects secrets, URLs, provider bags, unknown nested fields and hostile accessors", () => {
    for (const change of [{ token: "private-token-never-echo" }, { providerOptions: {} }, { url: "https://example.test" }, { outputPath: "/private/file" }]) {
      expect(() => parseHostedImageRequest({ ...REQUEST, ...change })).toThrow("Invalid hosted contract data.")
    }
    let getterCalls = 0
    expect(() => parseHostedImageRequest({ ...REQUEST, get prompt() { getterCalls++; return "secret" } })).toThrow(HostedContractError)
    expect(getterCalls).toBe(0)
    expect(() => parseHostedImageRequest({ ...REQUEST, references: [{ uploadId: "upload_000001", sha256: DIGEST, bytes: 1, mediaType: "image/png", role: "image", url: "https://example.test" }] })).toThrow(HostedContractError)
    expect(() => parseHostedImageRequest(Object.assign(Object.create({ inherited: true }), REQUEST))).toThrow(HostedContractError)
    expect(() => parseHostedImageRequest(Object.defineProperty({ ...REQUEST }, "secret", { value: "not-JSON", enumerable: false }))).toThrow(HostedContractError)
  })

  test("enforces UTF-8, surrogate, aggregate JSON and structural bounds", () => {
    expect(parseHostedImageRequest({ ...REQUEST, prompt: "é".repeat(HOSTED_LIMITS.promptBytes / 2) }).prompt.length).toBe(HOSTED_LIMITS.promptBytes / 2)
    for (const prompt of ["é".repeat(HOSTED_LIMITS.promptBytes / 2 + 1), "\ud800", "\udc00", "ok\ud800x", "😀".repeat(8193)]) {
      expect(() => parseHostedImageRequest({ ...REQUEST, prompt })).toThrow(HostedContractError)
      expect(() => parseHostedImageRequestJson(JSON.stringify({ ...REQUEST, prompt }))).toThrow(HostedContractError)
    }
    expect(() => parseHostedImageRequestJson(" ".repeat(HOSTED_LIMITS.jsonBytes + 1))).toThrow(HostedContractError)
    expect(() => parseHostedImageRequestJson("{" )).toThrow(HostedContractError)
    expect(parseHostedImageRequestJson(JSON.stringify(REQUEST))).toEqual(parseHostedImageRequest(REQUEST))
    let nested: unknown = {}; for (let index = 0; index < 20; index++) nested = { nested }
    expect(() => parseHostedImageRequest({ ...REQUEST, nested })).toThrow(HostedContractError)
    const cycle: Record<string, unknown> = { ...REQUEST }; cycle.self = cycle
    expect(() => parseHostedImageRequest(cycle)).toThrow(HostedContractError)
  })

  test("rejects unsafe money/time and impossible quote/artifact metadata", () => {
    for (const value of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, HOSTED_LIMITS.microUsd + 1]) {
      expect(() => parseHostedQuote(quote(REQUEST, { maximumChargeMicroUsd: value }))).toThrow(HostedContractError)
    }
    expect(() => parseHostedQuote(quote(REQUEST, { expiresAtMs: Number.MAX_SAFE_INTEGER + 1 }))).toThrow(HostedContractError)
    expect(() => parseHostedQuote(quote(REQUEST, { expiresAtMs: 1000 }))).toThrow(HostedContractError)
    expect(() => parseHostedQuote(quote(REQUEST, { estimatedChargeMicroUsd: 100_001 }))).toThrow(HostedContractError)
    const value = manifest(sent())
    expect(() => parseHostedArtifactManifest({ ...value, artifacts: [...value.artifacts, ...value.artifacts] })).toThrow(HostedContractError)
    expect(() => parseHostedArtifactManifest({ ...value, expiresAtMs: value.verifiedAtMs })).toThrow(HostedContractError)
  })
})

describe("inactive hosted state decisions", () => {
  test("requires a committed-intent-shaped hold and rejects over-ceiling before dispatch", () => {
    const initial = job(); const holding = step(initial, { kind: "request-hold" })
    expect(holding.intentRequirement).toBe("commit-before-hold")
    expect(initial.billing).toBe("none")
    for (const hold of [{ holdId: "hold_00000001", ceilingMicroUsd: 100_001, expiresAtMs: 90_000 }, { holdId: "hold_00000001", ceilingMicroUsd: 90_000, expiresAtMs: 2000 }]) {
      const blocked = step(holding.next, { kind: "hold-observed", hold })
      expect(blocked.next).toMatchObject({ generation: "failed", billing: "release_pending", dispatch: null })
      expect(blocked.intentRequirement).toBe("commit-before-release")
      expect(() => step(blocked.next, dispatch(blocked.next))).toThrow(HostedContractError)
    }
  })

  test("insufficient funds and hold uncertainty do not create generation attempts", () => {
    const holding = step(job(), { kind: "request-hold" }).next
    const waiting = step(holding, { kind: "hold-unavailable", reason: "insufficient-funds" }).next
    expect(waiting).toMatchObject({ generation: "awaiting_funds", dispatch: null, billing: "none" })
    expect(step(waiting, { kind: "request-hold" }).next.billingIntent).toEqual(holding.billingIntent)
    const uncertain = step(holding, { kind: "uncertain", phase: "hold" })
    expect(uncertain.next.billingIntent).toEqual(holding.billingIntent)
    expect(uncertain.intentRequirement).toBe("reconcile-only")
    expect(() => step(uncertain.next, { kind: "request-hold" })).toThrow(HostedContractError)
  })

  test("requires strict hold-deadline room including recovery margins", () => {
    const state = held(); const event = dispatch(state)
    expect(step(state, event).intentRequirement).toBe("commit-before-first-dispatch")
    expect(step(state, event).next.dispatch).toMatchObject({ admittedAtMs: 2000, completionAndRecoveryBoundMs: 13_000, latestStartAtMs: 76_999, deadlineMs: 15_000 })
    expect(() => step(state, event, 77_000)).toThrow(HostedContractError) // equality at 90,000 rejects
    expect(() => step(state, { ...event, safety: { ...event.safety, effectSha256: POLICY } })).toThrow(HostedContractError)
    const nearLimit = Number.MAX_SAFE_INTEGER - 1000
    let huge = createHostedJob({ jobId: JOB_ID, key: KEY, request: REQUEST, quote: quote(REQUEST, { createdAtMs: nearLimit, expiresAtMs: Number.MAX_SAFE_INTEGER }), nowMs: nearLimit })
    huge = step(huge, { kind: "request-hold" }).next
    huge = step(huge, { kind: "hold-observed", hold: { holdId: "hold_00000001", ceilingMicroUsd: 90_000, expiresAtMs: Number.MAX_SAFE_INTEGER } }).next
    expect(() => step(huge, dispatch(huge))).toThrow(HostedContractError)
  })

  test("lost dispatch never permits another attempt or release; stale workers fail", () => {
    const dispatched = sent(); const uncertain = step(dispatched, { kind: "uncertain", phase: "dispatch" })
    expect(uncertain.next).toMatchObject({ generation: "reconciling", billing: "held", dispatch: { attempt: 1 } })
    expect(uncertain.canRedispatch).toBe(false)
    expect(() => step(uncertain.next, dispatch(uncertain.next))).toThrow(HostedContractError)
    expect(() => step(uncertain.next, { kind: "request-release", policyRevision: POLICY })).toThrow(HostedContractError)
    expect(() => step(uncertain.next, { kind: "request-settle", policyRevision: POLICY, amountMicroUsd: 0 })).toThrow(HostedContractError)
    const recovered = step(uncertain.next, { kind: "take-reconciliation-ownership", nextFence: 2 }).next
    expect(() => reduceHostedJob(recovered, { expectedVersion: recovered.version, expectedFence: 1, nowMs: 2000, event: { kind: "provider-started", externalRequestId: "provider_000001" } })).toThrow(HostedContractError)
    expect(() => reduceHostedJob(recovered, { expectedVersion: recovered.version - 1, expectedFence: 2, nowMs: 2000, event: { kind: "request-cancel" } })).toThrow(HostedContractError)
    expect(() => step(recovered, { kind: "provider-terminal", externalRequestId: "provider_000001", outcome: "canceled" })).toThrow(HostedContractError)
    const result = step(recovered, { kind: "provider-terminal", externalRequestId: "provider_000001", outcome: "succeeded", proof: "provider-confirmed" }).next
    expect(result.generation).toBe("succeeded")
    expect(result.dispatch?.providerRequestSha256).toBe(dispatched.dispatch?.providerRequestSha256)
    expect(() => step(result, dispatch(result))).toThrow(HostedContractError)
  })

  test("cancellation after send needs provider confirmation and makes no charging choice", () => {
    const before = step(held(), { kind: "request-cancel" }).next
    expect(before).toMatchObject({ generation: "canceled", billing: "release_pending", dispatch: null })
    const canceled = step(sent(), { kind: "request-cancel" }).next
    expect(canceled).toMatchObject({ generation: "reconciling", billing: "held", cancelRequested: true })
    const terminal = step(canceled, { kind: "provider-terminal", externalRequestId: "provider_000001", outcome: "canceled", proof: "provider-confirmed" }).next
    expect(terminal).toMatchObject({ generation: "canceled", billing: "held", billingIntent: null })
    expect(() => step(terminal, { kind: "request-release", policyRevision: DIGEST })).toThrow(HostedContractError)
    expect(step(terminal, { kind: "request-release", policyRevision: POLICY }).intentRequirement).toBe("commit-before-release")
  })

  test("retains billing intent after uncertainty; settlement is bounded by both ceilings", () => {
    const state = succeeded()
    expect(() => step(state, { kind: "request-settle", amountMicroUsd: 90_001, policyRevision: POLICY })).toThrow(HostedContractError)
    const pending = step(state, { kind: "request-settle", amountMicroUsd: 50_000, policyRevision: POLICY }).next
    const ambiguous = step(pending, { kind: "uncertain", phase: "settle" }).next
    expect(ambiguous.billingIntent).toEqual(pending.billingIntent)
    expect(() => step(ambiguous, { kind: "request-release", policyRevision: POLICY })).toThrow(HostedContractError)
    const badAmount = step(ambiguous, { kind: "billing-observed", observation: { holdId: "hold_00000001", state: "settled", chargedMicroUsd: 100_001 } })
    expect(badAmount.next.billing).toBe("reconciliation_required")
    expect(badAmount.next.billingIntent).toEqual(pending.billingIntent)
    expect(badAmount.intentRequirement).toBe("operator-review")
    const expiredBeforeSettle = step(state, { kind: "request-settle", amountMicroUsd: 50_000, policyRevision: POLICY }, 90_000)
    expect(expiredBeforeSettle.intentRequirement).toBe("reconcile-only")
  })

  test("reconciles each actual billing terminal, accepts exact replay and rejects overwrite", () => {
    for (const terminal of ["settled", "released", "expired"] as const) {
      const state = step(succeeded(), { kind: "request-settle", amountMicroUsd: 50_000, policyRevision: POLICY }).next
      const observation = { holdId: "hold_00000001", state: terminal, chargedMicroUsd: terminal === "settled" ? 50_000 : 0 }
      const result = step(state, { kind: "billing-observed", observation })
      expect(result.next).toMatchObject({ generation: "succeeded", billing: terminal, billingIntent: null, artifact: "absent" })
      expect(result.intentRequirement).toBe(terminal === "settled" ? "none" : "operator-review")
      expect(step(result.next, { kind: "billing-observed", observation }).next.billingObservation).toEqual(observation)
      expect(() => step(result.next, { kind: "billing-observed", observation: { ...observation, state: terminal === "expired" ? "released" : "expired", chargedMicroUsd: 0 } })).toThrow(HostedContractError)
    }
  })

  test("over-ceiling authority evidence stays immutable and imported snapshots preserve its attention", () => {
    const pending = step(succeeded(), { kind: "request-settle", amountMicroUsd: 50_000, policyRevision: POLICY }).next
    const observation = { holdId: "hold_00000001", state: "settled", chargedMicroUsd: 100_001 }
    const excessive = step(pending, { kind: "billing-observed", observation }).next
    const replay = step(excessive, { kind: "billing-observed", observation }).next
    expect(replay.billing).toBe("reconciliation_required")
    expect(replay.billingAttention).toBe("over-ceiling")
    expect(replay.billingIntent).toEqual(pending.billingIntent)
    for (const changed of [{ ...observation, chargedMicroUsd: 50_000 }, { ...observation, state: "released", chargedMicroUsd: 0 }, { ...observation, state: "expired", chargedMicroUsd: 0 }]) {
      expect(() => step(excessive, { kind: "billing-observed", observation: changed })).toThrow(HostedContractError)
    }
    for (const changed of [
      { ...excessive, billing: "settled", billingIntent: null, billingAttention: "none" },
      { ...excessive, billing: "settled", billingIntent: null },
      { ...excessive, billingAttention: "none" },
      { ...excessive, billingObservation: { ...observation, chargedMicroUsd: 50_000 } },
    ]) expect(() => parseHostedJob(changed)).toThrow(HostedContractError)
  })

  test("billing expiry during uncertainty preserves dispatch and independently verified output", () => {
    let state = step(sent(), { kind: "uncertain", phase: "dispatch" }).next
    state = step(state, { kind: "receive-artifacts" }).next
    state = step(state, { kind: "artifacts-verified", manifest: manifest(state) }).next
    state = step(state, { kind: "artifacts-available" }).next
    const expired = step(state, { kind: "billing-observed", observation: { holdId: "hold_00000001", state: "expired", chargedMicroUsd: 0 } }, 90_000).next
    expect(expired).toMatchObject({ generation: "reconciling", billing: "expired", artifact: "available", dispatch: { attempt: 1 } })
    expect(() => step(expired, dispatch(expired))).toThrow(HostedContractError)
    const expiredMedia = step(expired, { kind: "artifacts-expired" }).next
    const deleted = step(expiredMedia, { kind: "artifacts-deleted" }).next
    expect(deleted.authorizationSha256).toBe(state.authorizationSha256)
    expect(deleted.artifactManifest).toEqual(state.artifactManifest)
    expect(() => step(deleted, { kind: "receive-artifacts" })).toThrow(HostedContractError)
  })

  test("artifact metadata never proves provider success; wrong owner/output and forged snapshots reject", () => {
    const state = step(sent(), { kind: "receive-artifacts" }).next
    for (const change of [{ jobId: "job_0000000000000002" }, { effectSha256: POLICY }, { artifacts: [{ ...manifest(state).artifacts[0], width: 512 }] }]) {
      expect(() => step(state, { kind: "artifacts-verified", manifest: { ...manifest(state), ...change } })).toThrow(HostedContractError)
    }
    const verified = step(state, { kind: "artifacts-verified", manifest: manifest(state) }).next
    expect(verified.generation).toBe("dispatching")
    expect(verified.billing).toBe("held")
    expect(() => step(verified, { kind: "artifacts-available" }, 80_000)).toThrow(HostedContractError)
    expect(() => parseHostedJob({ ...verified, authorizationSha256: DIGEST })).toThrow(HostedContractError)
    expect(() => parseHostedJob({ ...job(), generation: "succeeded" })).toThrow(HostedContractError)
    expect(() => parseHostedJob({ ...held(), billing: "settled" })).toThrow(HostedContractError)
  })

  test("arbitrary recovery event sequences cannot turn an uncertain attempt into fresh dispatch", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 1, maxLength: 20 }), choices => {
      let state = step(sent(), { kind: "uncertain", phase: "dispatch" }).next
      const retained = state.dispatch
      for (const choice of choices) {
        const events = [dispatch(state), { kind: "request-hold" }, { kind: "request-cancel" },
          { kind: "request-release", policyRevision: POLICY }, { kind: "request-settle", amountMicroUsd: 0, policyRevision: POLICY },
          { kind: "uncertain", phase: "dispatch" }, { kind: "take-reconciliation-ownership", nextFence: state.fence + 1 },
          { kind: "provider-terminal", externalRequestId: "provider_000001", outcome: "failed", proof: "provider-confirmed" }]
        try {
          const decision = step(state, events[choice])
          expect(decision.intentRequirement).not.toBe("commit-before-first-dispatch")
          expect(decision.canRedispatch).toBe(false)
          state = decision.next
        } catch (error) { expect(error).toBeInstanceOf(HostedContractError) }
        expect(state.dispatch?.attempt).toBe(1)
        expect(state.dispatch?.providerRequestSha256).toBe(retained?.providerRequestSha256)
        expect(state.authorizationSha256).toBe(bindHostedAuthorization(REQUEST, quote()).authorizationSha256)
      }
    }), { numRuns: 100, seed: 331 })
  })
})

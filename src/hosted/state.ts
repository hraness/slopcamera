import { z } from "zod"
import {
  HostedContractError, HostedEventSchema, HostedJobSchema, HostedJobIdSchema,
  HostedKeySchema, HostedTimeSchema, parseHostedValue,
  type HostedJob,
} from "./contracts.js"
import { bindHostedAuthorization, hostedHoldKey } from "./identity.js"

const terminalGeneration = (state: HostedJob): boolean => ["succeeded", "failed", "canceled"].includes(state.generation)
const activeGeneration = (state: HostedJob): boolean => ["dispatching", "running", "reconciling"].includes(state.generation)
const reject = (condition: boolean, message: string): void => {
  if (condition) throw new HostedContractError("invalid-transition", message)
}
const holdKey = (state: HostedJob): string => hostedHoldKey(state.key, state.jobId)
const releaseIntent = (state: HostedJob) => ({ kind: "release" as const, key: `${holdKey(state)}:release` })

/** Validate imported snapshots as well as reducer output. No store or auth is implied. */
export function parseHostedJob(input: unknown): HostedJob {
  const state = parseHostedValue(HostedJobSchema, input)
  const binding = bindHostedAuthorization(state.request, state.quote)
  reject(binding.effectSha256 !== state.effectSha256 || binding.authorizationSha256 !== state.authorizationSha256, "Job authorization identity changed.")
  reject(state.updatedAtMs < state.quote.createdAtMs, "Job time precedes its authorization.")
  const intent = state.billingIntent
  if (intent !== null) reject(intent.key !== `${holdKey(state)}${intent.kind === "hold" ? "" : `:${intent.kind}`}`, "Billing intent identity changed.")
  if (state.billing === "none") reject(state.hold !== null || intent !== null || state.billingObservation !== null, "An unheld job cannot retain billing effects.")
  if (state.billing === "hold_pending") reject(state.hold !== null || intent?.kind !== "hold", "Pending hold requires its original intent.")
  if (state.billing === "held") reject(state.hold === null || intent !== null || state.billingObservation !== null, "Held billing requires its confirmed hold.")
  if (state.billing === "settle_pending" || state.billing === "release_pending") {
    reject(state.hold === null || intent?.kind !== (state.billing === "settle_pending" ? "settle" : "release"), "Pending billing requires its original intent.")
  }
  if (["settled", "released", "expired"].includes(state.billing)) {
    reject(state.hold === null || intent !== null || state.billingObservation?.state !== state.billing, "Terminal billing requires matching authority evidence.")
  }
  if (state.billing === "reconciliation_required") reject(intent === null && state.billingObservation === null, "Reconciliation must retain unresolved evidence.")
  if (intent?.kind === "hold") reject(state.hold !== null, "A hold intent cannot replace an existing hold.")
  if (intent?.kind === "settle") reject(state.hold === null || intent.amountMicroUsd > state.hold.ceilingMicroUsd || intent.amountMicroUsd > state.quote.maximumChargeMicroUsd, "Settlement exceeds authorization.")
  if (intent?.kind === "release") reject(state.hold === null, "Release requires a known hold.")
  if (state.billingObservation !== null) {
    reject(state.hold === null || state.billingObservation.holdId !== state.hold.holdId, "Billing evidence names another hold.")
    const excessive = state.billingObservation.chargedMicroUsd > state.hold!.ceilingMicroUsd || state.billingObservation.chargedMicroUsd > state.quote.maximumChargeMicroUsd
    reject(excessive && (state.billing !== "reconciliation_required" || state.billingAttention !== "over-ceiling"), "Excessive observed charges must remain unresolved.")
    reject(!excessive && (state.billing !== state.billingObservation.state || state.billingAttention === "over-ceiling"), "Terminal billing evidence and attention disagree.")
    reject(state.billingAttention === "amount-mismatch" && state.billingObservation.state !== "settled", "Amount mismatch requires a settled observation.")
  }
  if (state.billingAttention !== "none") reject(state.billingObservation === null, "Billing attention requires retained evidence.")
  if (state.generation === "ready") reject(state.billing !== "held" || state.hold === null || state.dispatch !== null || state.cancelRequested, "Ready generation requires an undispatched authorized hold.")
  if (state.generation === "hold_pending") reject(state.dispatch !== null || intent?.kind !== "hold", "Generation awaiting a hold cannot be dispatched.")
  if (state.generation === "accepted" || state.generation === "awaiting_funds") reject(state.dispatch !== null || state.billing !== "none", "Unfunded generation cannot retain a dispatch.")
  if (activeGeneration(state) || state.generation === "succeeded") reject(state.dispatch === null, "Provider state requires the original dispatch intent.")
  if (state.dispatch !== null) {
    reject(state.fence < 1 || state.hold === null, "A dispatch requires its worker fence and hold.")
    reject(state.hold !== null && state.hold.ceilingMicroUsd > state.quote.maximumChargeMicroUsd, "A dispatch cannot use an excessive hold.")
    reject(state.dispatch.deadlineMs >= state.hold!.expiresAtMs, "Dispatch deadline must precede hold expiry.")
    const bound = BigInt(state.dispatch.completionAndRecoveryBoundMs)
    reject(BigInt(state.dispatch.admittedAtMs) + bound !== BigInt(state.dispatch.deadlineMs)
      || BigInt(state.dispatch.latestStartAtMs) + bound + 1n !== BigInt(state.hold!.expiresAtMs)
      || state.dispatch.admittedAtMs > state.dispatch.latestStartAtMs
      || state.dispatch.admittedAtMs > state.updatedAtMs, "Dispatch timing evidence changed.")
  }
  if (state.generation === "running" || state.generation === "succeeded" || (state.generation === "canceled" && state.dispatch !== null)) reject(state.dispatch?.externalRequestId == null, "Provider-confirmed state requires its external identity.")
  if (state.artifact === "absent" || state.artifact === "receiving") reject(state.artifactManifest !== null, "Unverified artifacts cannot carry a verified manifest.")
  else reject(state.artifactManifest === null, "Artifact state requires retained verification evidence.")
  if (state.artifact !== "absent") reject(state.dispatch === null, "Artifacts cannot precede dispatch.")
  if (state.artifactManifest !== null) {
    const manifest = state.artifactManifest
    reject(manifest.jobId !== state.jobId || manifest.effectSha256 !== state.effectSha256, "Artifact evidence names another request.")
    reject(manifest.artifacts.length !== state.request.count, "Artifact count does not fulfill the request.")
    reject(manifest.artifacts.some(item => item.width !== state.request.width || item.height !== state.request.height || item.mediaType !== state.request.outputMediaType), "Artifact metadata does not fulfill the request.")
    reject(manifest.verifiedAtMs > state.updatedAtMs, "Artifact verification is in the future.")
  }
  return state
}

/** The caller still owns authentication, model admission and atomic unique insertion. */
export function createHostedJob(input: unknown): HostedJob {
  const parsed = parseHostedValue(z.strictObject({
    jobId: HostedJobIdSchema, key: HostedKeySchema, request: z.unknown(), quote: z.unknown(), nowMs: HostedTimeSchema,
  }), input)
  const binding = bindHostedAuthorization(parsed.request, parsed.quote)
  if (parsed.nowMs < binding.quote.createdAtMs || parsed.nowMs >= binding.quote.expiresAtMs) {
    throw new HostedContractError("expired-authorization", "Quote is not valid for new job admission.")
  }
  return parseHostedJob({
    kind: "slopcamera.hosted-job", schemaVersion: 1, jobId: parsed.jobId, key: parsed.key,
    ...binding, version: 0, fence: 0, updatedAtMs: parsed.nowMs,
    generation: "accepted", billing: "none", artifact: "absent", cancelRequested: false,
    hold: null, dispatch: null, billingIntent: null, billingObservation: null,
    billingAttention: "none", artifactManifest: null,
  })
}

export type HostedIntentRequirement = "none" | "commit-before-hold" | "commit-before-first-dispatch"
  | "commit-before-settle" | "commit-before-release" | "reconcile-only" | "operator-review"
export interface HostedDecision {
  readonly next: HostedJob
  /** A requirement for a future adapter, never evidence that a write happened. */
  readonly intentRequirement: HostedIntentRequirement
  readonly canRedispatch: false
}

/** Pure decision. Persist next with compare-and-set before any external action. */
export function reduceHostedJob(stateInput: unknown, input: unknown): HostedDecision {
  const state = parseHostedJob(stateInput)
  const envelope = parseHostedValue(z.strictObject({
    expectedVersion: HostedTimeSchema, expectedFence: HostedTimeSchema,
    nowMs: HostedTimeSchema, event: HostedEventSchema,
  }), input)
  if (envelope.expectedVersion !== state.version || envelope.expectedFence !== state.fence || envelope.nowMs < state.updatedAtMs || state.version === Number.MAX_SAFE_INTEGER) {
    throw new HostedContractError("stale-state", "Job version, worker fence or clock is stale.")
  }
  const { event, nowMs } = envelope
  const next: HostedJob = { ...state, version: state.version + 1, updatedAtMs: nowMs }
  let intentRequirement: HostedIntentRequirement = "none"
  const requireCurrentQuote = () => {
    if (nowMs >= state.quote.expiresAtMs) throw new HostedContractError("expired-authorization", "Quote expired before the external action.")
  }
  switch (event.kind) {
    case "request-hold":
      reject(!["accepted", "awaiting_funds"].includes(state.generation) || state.billing !== "none" || state.dispatch !== null || state.cancelRequested, "Job cannot request another hold.")
      requireCurrentQuote()
      next.generation = "hold_pending"; next.billing = "hold_pending"
      next.billingIntent = { kind: "hold", key: holdKey(state) }
      intentRequirement = "commit-before-hold"
      break
    case "hold-observed":
      reject(state.billingIntent?.kind !== "hold" || state.hold !== null || state.generation !== "hold_pending", "Hold evidence does not match the pending intent.")
      next.hold = event.hold; next.billingIntent = null; next.billing = "held"
      if (event.hold.ceilingMicroUsd > state.quote.maximumChargeMicroUsd || event.hold.expiresAtMs <= nowMs || state.cancelRequested) {
        next.generation = state.cancelRequested ? "canceled" : "failed"
        next.billing = "release_pending"; next.billingIntent = releaseIntent(state)
        intentRequirement = "commit-before-release"
      } else next.generation = "ready"
      break
    case "hold-unavailable":
      reject(state.billingIntent?.kind !== "hold" || state.hold !== null || state.dispatch !== null, "No pending hold can be resolved.")
      next.billing = "none"; next.billingIntent = null
      next.generation = state.cancelRequested ? "canceled" : event.reason === "insufficient-funds" ? "awaiting_funds" : "failed"
      break
    case "request-dispatch": {
      reject(state.generation !== "ready" || state.billing !== "held" || state.hold === null || state.dispatch !== null || state.cancelRequested, "Generation cannot dispatch again or without a confirmed hold.")
      requireCurrentQuote()
      reject(event.nextFence <= state.fence || event.safety.effectSha256 !== state.effectSha256, "Dispatch qualification or worker fence does not match.")
      const bound = BigInt(event.safety.providerCompletionBoundMs) + BigInt(event.safety.artifactAdmissionBoundMs)
        + BigInt(event.safety.settlementRecoveryMarginMs) + BigInt(event.safety.clockSkewMarginMs)
      const deadline = BigInt(nowMs) + bound
      reject(deadline > BigInt(Number.MAX_SAFE_INTEGER) || deadline >= BigInt(state.hold!.expiresAtMs), "Confirmed hold cannot cover the qualified completion and recovery bounds.")
      next.fence = event.nextFence; next.generation = "dispatching"
      next.dispatch = { attempt: 1, providerRequestSha256: event.providerRequestSha256, qualificationId: event.safety.qualificationId,
        deadlineMs: Number(deadline), externalRequestId: null, admittedAtMs: nowMs,
        completionAndRecoveryBoundMs: Number(bound), latestStartAtMs: Number(BigInt(state.hold!.expiresAtMs) - bound - 1n) }
      intentRequirement = "commit-before-first-dispatch"
      break
    }
    case "provider-started":
    case "provider-terminal":
      if (event.kind === "provider-terminal" && terminalGeneration(state) && state.generation === event.outcome && state.dispatch?.externalRequestId === event.externalRequestId) break
      reject(!activeGeneration(state) || state.dispatch === null, "Provider evidence has no active dispatch to resolve.")
      reject(state.dispatch!.externalRequestId !== null && state.dispatch!.externalRequestId !== event.externalRequestId, "Provider evidence names another external request.")
      next.dispatch = { ...state.dispatch!, externalRequestId: event.externalRequestId }
      next.generation = event.kind === "provider-started" ? (state.cancelRequested ? "reconciling" : "running") : event.outcome
      break
    case "uncertain":
      if (event.phase === "dispatch") {
        reject(!activeGeneration(state) || state.dispatch === null, "No active dispatch can become uncertain.")
        next.generation = "reconciling"
      } else {
        reject(state.billingIntent?.kind !== event.phase, "Uncertainty does not match the billing intent.")
        next.billing = "reconciliation_required"
      }
      intentRequirement = "reconcile-only"
      break
    case "take-reconciliation-ownership":
      reject((state.generation !== "reconciling" && state.billing !== "reconciliation_required") || event.nextFence <= state.fence, "A replacement worker needs unresolved work and a newer fence.")
      next.fence = event.nextFence; intentRequirement = "reconcile-only"
      break
    case "request-cancel":
      reject(terminalGeneration(state), "Terminal generation cannot be canceled again.")
      next.cancelRequested = true
      if (state.dispatch !== null) { next.generation = "reconciling"; intentRequirement = "reconcile-only" }
      else if (state.hold !== null) {
        next.generation = "canceled"; next.billing = "release_pending"; next.billingIntent = releaseIntent(state)
        intentRequirement = "commit-before-release"
      } else if (state.billingIntent === null) next.generation = "canceled"
      else intentRequirement = "reconcile-only"
      break
    case "request-settle":
    case "request-release": {
      reject(state.billing !== "held" || state.hold === null || state.billingIntent !== null, "Billing already has an unresolved or terminal result.")
      reject(event.policyRevision !== state.quote.policyRevision, "Billing decision does not match the authorized policy.")
      reject(state.dispatch !== null && !terminalGeneration(state), "Uncertain provider work cannot be settled or released by assumption.")
      if (event.kind === "request-settle") {
        reject(!terminalGeneration(state) || state.dispatch === null, "Settlement requires a known provider outcome.")
        reject(event.amountMicroUsd > state.hold!.ceilingMicroUsd || event.amountMicroUsd > state.quote.maximumChargeMicroUsd, "Settlement exceeds the held or authorized ceiling.")
        next.billingIntent = { kind: "settle", key: `${holdKey(state)}:settle`, amountMicroUsd: event.amountMicroUsd }
        next.billing = nowMs >= state.hold!.expiresAtMs ? "reconciliation_required" : "settle_pending"
        intentRequirement = next.billing === "settle_pending" ? "commit-before-settle" : "reconcile-only"
      } else {
        if (state.dispatch === null) next.generation = "canceled"
        next.billingIntent = releaseIntent(state); next.billing = "release_pending"
        intentRequirement = "commit-before-release"
      }
      break
    }
    case "billing-observed": {
      const observation = event.observation
      reject(state.hold === null || observation.holdId !== state.hold.holdId, "Billing evidence names another hold.")
      if (state.billingObservation !== null) {
        reject(state.billingObservation.state !== observation.state || state.billingObservation.chargedMicroUsd !== observation.chargedMicroUsd, "Conflicting terminal billing evidence cannot overwrite the retained observation.")
        break
      }
      reject(!["held", "settle_pending", "release_pending", "reconciliation_required"].includes(state.billing), "Terminal billing cannot be overwritten.")
      next.billingObservation = observation
      if (observation.chargedMicroUsd > state.hold!.ceilingMicroUsd || observation.chargedMicroUsd > state.quote.maximumChargeMicroUsd) {
        next.billing = "reconciliation_required"; next.billingAttention = "over-ceiling"
        intentRequirement = "operator-review"
      } else {
        next.billing = observation.state; next.billingIntent = null
        const intendedState = state.billingIntent?.kind === "settle" ? "settled" : state.billingIntent?.kind === "release" ? "released" : "expired"
        next.billingAttention = observation.state !== intendedState ? "unexpected-terminal"
          : state.billingIntent?.kind === "settle" && observation.chargedMicroUsd !== state.billingIntent.amountMicroUsd ? "amount-mismatch" : "none"
        if (next.billingAttention !== "none") intentRequirement = "operator-review"
      }
      // A cron expiry can happen while generation is in flight. It cannot reset it.
      if (state.generation === "ready") next.generation = "failed"
      break
    }
    case "receive-artifacts":
      reject(state.dispatch === null || state.artifact !== "absent", "Artifact admission cannot restart or precede dispatch.")
      next.artifact = "receiving"
      break
    case "artifacts-verified":
      reject(state.artifact !== "receiving" || event.manifest.verifiedAtMs > nowMs, "Artifact evidence has no current admission.")
      next.artifactManifest = event.manifest; next.artifact = "verified"
      break
    case "artifacts-available":
      reject(state.artifact !== "verified" || state.artifactManifest === null || nowMs >= state.artifactManifest.expiresAtMs, "Artifact availability requires current verification.")
      next.artifact = "available"
      break
    case "artifacts-expired":
      reject(!["verified", "available"].includes(state.artifact) || state.artifactManifest === null || nowMs < state.artifactManifest.expiresAtMs, "Artifacts have not reached their retained expiry.")
      next.artifact = "expired"
      break
    case "artifacts-deleted":
      reject(state.artifactManifest === null || state.artifact === "deleted", "Deletion needs retained artifact identity.")
      next.artifact = "deleted"
      break
  }
  return Object.freeze({ next: parseHostedJob(next), intentRequirement, canRedispatch: false })
}

import { describe, expect, test } from "bun:test"

import { createSha256HexHasher } from "../code/sha256.js"
import { spatialSceneSha256 } from "./identity.js"
import {
  buildSpatialReviewReport,
  redactedSpatialReviewProviderError,
  SPATIAL_REVIEW_LIMITS,
  SPATIAL_REVIEW_PROMPT_SHA256,
  SPATIAL_REVIEW_PROMPT_VERSION,
  SPATIAL_REVIEW_UPLOAD_POLICY,
  SpatialReviewModelOutputSchema,
  SpatialReviewProviderError,
  spatialReviewDefaultTimesUs,
  SpatialReviewReportSchema,
  validateSpatialReviewProviderRequest,
  type SpatialReviewProviderRequest,
  type SpatialReviewReportInput,
} from "./review.js"
import { fixtureScene } from "./test-fixture.js"

const sha256 = (bytes: Uint8Array): string => {
  const hasher = createSha256HexHasher()
  hasher.update(bytes)
  return hasher.digestHex()
}
const ATTEMPT_ID = "11111111-2222-4333-8444-555555555555"
const ACKNOWLEDGED_AT = "2026-08-20T00:00:00.000Z"
const FRAME_A = Uint8Array.of(0x89, 0x50, 0x4e, 0x47)
const FRAME_B = Uint8Array.of(1, 2, 3, 4)

function providerRequest(overrides: Partial<SpatialReviewProviderRequest> = {}): SpatialReviewProviderRequest {
  return {
    attemptId: ATTEMPT_ID,
    cloudUpload: { acknowledgedAt: ACKNOWLEDGED_AT, policy: SPATIAL_REVIEW_UPLOAD_POLICY },
    prompt: { sha256: SPATIAL_REVIEW_PROMPT_SHA256, version: SPATIAL_REVIEW_PROMPT_VERSION },
    scene: {
      sceneId: "scene_fixture", sceneSha256: "a".repeat(64), cameraId: "camera_main",
      durationUs: 1_000_000, timesUs: [0, 500_000],
      entities: [{ entityId: "entity_box", kind: "mesh", name: "Box" }],
    },
    frames: [
      { index: 0, timeUs: 0, width: 8, height: 4, bytes: FRAME_A, sha256: sha256(FRAME_A) },
      { index: 1, timeUs: 500_000, width: 8, height: 4, bytes: FRAME_B, sha256: sha256(FRAME_B) },
    ],
    ...overrides,
  }
}

describe("review sample defaults", () => {
  test("cover the scene clock with four deterministic endpoint-inclusive samples", () => {
    expect(spatialReviewDefaultTimesUs(1_000_000)).toEqual([0, 333_333, 666_667, 1_000_000])
    expect(spatialReviewDefaultTimesUs(0)).toEqual([0])
    expect(spatialReviewDefaultTimesUs(1)).toEqual([0, 1])
    expect(Object.isFrozen(spatialReviewDefaultTimesUs(9))).toBe(true)
  })

  test("reject a duration outside the bounded scene clock", () => {
    expect(() => spatialReviewDefaultTimesUs(-1)).toThrow("sampling bound")
    expect(() => spatialReviewDefaultTimesUs(1.5)).toThrow("sampling bound")
    expect(() => spatialReviewDefaultTimesUs(Number.MAX_SAFE_INTEGER)).toThrow("sampling bound")
  })
})

describe("provider request validation", () => {
  test("accepts a well-formed request and reports the exact upload bytes", () => {
    const validated = validateSpatialReviewProviderRequest(providerRequest())
    expect(validated.uploadBytes).toBe(FRAME_A.byteLength + FRAME_B.byteLength)
  })

  test("rejects tampered frame bytes before any network work", () => {
    const request = providerRequest()
    const tampered = {
      ...request,
      frames: [{ ...request.frames[0]!, bytes: Uint8Array.of(9, 9, 9) }, request.frames[1]!],
    }
    expect(() => validateSpatialReviewProviderRequest(tampered)).toThrow(SpatialReviewProviderError)
    expect(() => validateSpatialReviewProviderRequest(tampered)).toThrow("provider request is invalid")
  })

  test("rejects wrong literals, timestamps, and frame scopes", () => {
    const request = providerRequest()
    expect(() => validateSpatialReviewProviderRequest({ ...request, attemptId: "not-a-uuid" })).toThrow(SpatialReviewProviderError)
    expect(() => validateSpatialReviewProviderRequest({
      ...request, cloudUpload: { acknowledgedAt: "not-a-timestamp", policy: SPATIAL_REVIEW_UPLOAD_POLICY },
    })).toThrow(SpatialReviewProviderError)
    expect(() => validateSpatialReviewProviderRequest({
      ...request, cloudUpload: { acknowledgedAt: ACKNOWLEDGED_AT, policy: "everything" as never },
    })).toThrow(SpatialReviewProviderError)
    expect(() => validateSpatialReviewProviderRequest({
      ...request, prompt: { sha256: "b".repeat(64) as never, version: SPATIAL_REVIEW_PROMPT_VERSION },
    })).toThrow(SpatialReviewProviderError)
    expect(() => validateSpatialReviewProviderRequest({
      ...request, frames: [request.frames[0]!, { ...request.frames[1]!, index: 0 }],
    })).toThrow(SpatialReviewProviderError)
    expect(() => validateSpatialReviewProviderRequest({
      ...request, frames: [request.frames[0]!, { ...request.frames[1]!, timeUs: 999_999 }],
    })).toThrow(SpatialReviewProviderError)
    expect(() => validateSpatialReviewProviderRequest({
      ...request, frames: Array.from({ length: SPATIAL_REVIEW_LIMITS.frames + 1 }, (_, index) => ({
        index, timeUs: 0, width: 8, height: 4, bytes: FRAME_A, sha256: sha256(FRAME_A),
      })),
    })).toThrow(SpatialReviewProviderError)
  })
})

describe("provider error redaction", () => {
  test("keeps typed provider errors and maps aborts by dispatch state", () => {
    const typed = new SpatialReviewProviderError("model-unavailable")
    expect(redactedSpatialReviewProviderError(typed, true)).toBe(typed)
    const abort = new Error("stop"); abort.name = "AbortError"
    expect(redactedSpatialReviewProviderError(abort, false)).toMatchObject({ code: "aborted", outcome: "definitive" })
    expect(redactedSpatialReviewProviderError(abort, true)).toMatchObject({ code: "aborted", outcome: "ambiguous" })
    expect(redactedSpatialReviewProviderError(new Error("socket died"), false))
      .toMatchObject({ code: "gateway-unavailable", outcome: "definitive" })
    expect(redactedSpatialReviewProviderError(new Error("socket died"), true))
      .toMatchObject({ code: "gateway-outcome-unknown", outcome: "ambiguous" })
    // Provider detail must never reach the caller surface.
    expect(redactedSpatialReviewProviderError(new Error("socket died"), true).message).not.toContain("socket died")
  })
})

describe("model output schema", () => {
  test("accepts bounded findings and rejects out-of-scope values", () => {
    const output = SpatialReviewModelOutputSchema.parse({
      scene: [{ severity: "warning", category: "composition", message: "Crowded." }],
      frames: [{ frameIndex: 1, findings: [{ severity: "info", category: "lighting", message: "Flat." }] }],
    })
    expect(output.frames[0]!.frameIndex).toBe(1)
    expect(() => SpatialReviewModelOutputSchema.parse({
      scene: [], frames: [{ frameIndex: SPATIAL_REVIEW_LIMITS.frames, findings: [] }],
    })).toThrow()
    expect(() => SpatialReviewModelOutputSchema.parse({
      scene: [{ severity: "fatal", category: "composition", message: "x" }], frames: [],
    })).toThrow()
  })
})

function reportInput(overrides: Partial<SpatialReviewReportInput> = {}): SpatialReviewReportInput {
  const scene = fixtureScene()
  return {
    acknowledgedAt: ACKNOWLEDGED_AT,
    attemptId: ATTEMPT_ID,
    provider: {
      output: {
        scene: [{ severity: "warning", category: "composition", message: "The subject crowds the left edge." }],
        frames: [{ frameIndex: 0, findings: [
          { severity: "info", category: "lighting", message: "Flat key light.", entityId: "entity_box" },
        ] }],
      },
      model: {
        requestedModel: "google/gemini-3-pro", resolvedModel: "google/gemini-3-pro",
        catalogSha256: "b".repeat(64), providerResponseId: "resp_test",
      },
      usage: { inputTokens: 120, outputTokens: 30 },
    },
    render: { excludedEntityIds: [], height: 4, width: 8, sourceHeight: 540, sourceWidth: 960 },
    scene,
    sceneSha256: spatialSceneSha256(scene),
    frames: [
      { index: 0, timeUs: 0, width: 8, height: 4, pngSha256: "c".repeat(64), pngBytes: 1234 },
      { index: 1, timeUs: 500_000, width: 8, height: 4, pngSha256: "d".repeat(64), pngBytes: 1234 },
    ],
    request: { cameraId: "camera_main", timesUs: [0, 500_000] },
    ...overrides,
  }
}

describe("report assembly", () => {
  test("builds a schema-valid advisory report with one entry per rendered frame", () => {
    const report = buildSpatialReviewReport(reportInput())
    const parsed = SpatialReviewReportSchema.parse(report)
    expect(parsed.kind).toBe("slopcamera.spatial-review")
    expect(parsed.status).toBe("model-generated-unverified")
    expect(parsed.cameraId).toBe("camera_main")
    expect(parsed.timesUs).toEqual([0, 500_000])
    expect(parsed.upload).toEqual({
      policy: SPATIAL_REVIEW_UPLOAD_POLICY, acknowledgedAt: ACKNOWLEDGED_AT, images: 2, bytes: 2468,
    })
    expect(parsed.model.maxRetries).toBe(0)
    expect(parsed.model.promptVersion).toBe(SPATIAL_REVIEW_PROMPT_VERSION)
    expect(parsed.model.promptSha256).toBe(SPATIAL_REVIEW_PROMPT_SHA256)
    expect(parsed.findings.frames).toHaveLength(2)
    expect(parsed.findings.frames[0]!.findings[0]!.entityId).toBe("entity_box")
    expect(parsed.findings.frames[1]!.findings).toEqual([])
    expect(parsed.sanitization).toEqual({ demotedEntityAttributions: 0, droppedFindings: 0 })
    expect(Object.isFrozen(report)).toBe(true)
  })

  test("demotes attributions to undeclared entities and counts them", () => {
    const input = reportInput()
    const report = buildSpatialReviewReport({
      ...input,
      provider: {
        ...input.provider,
        output: {
          scene: [{ severity: "info", category: "framing", message: "Invented subject.", entityId: "entity_ghost" }],
          frames: [{ frameIndex: 0, findings: [
            { severity: "critical", category: "clipping", message: "Ghost clips.", entityId: "entity_ghost" },
          ] }],
        },
      },
    })
    expect(report.sanitization.demotedEntityAttributions).toBe(2)
    // A demoted frame attribution leaves the frame scope and becomes scene-level evidence.
    expect(report.findings.scene.map(finding => finding.message))
      .toEqual(["Invented subject.", "Ghost clips."])
    expect(report.findings.scene.every(finding => finding.entityId === undefined)).toBe(true)
    expect(report.findings.frames[0]!.findings).toEqual([])
  })

  test("drops findings addressed to frames that were never rendered", () => {
    const input = reportInput()
    const report = buildSpatialReviewReport({
      ...input,
      provider: {
        ...input.provider,
        output: {
          scene: [],
          frames: [{ frameIndex: 3, findings: [
            { severity: "info", category: "framing", message: "Unrendered frame note." },
            { severity: "info", category: "framing", message: "Another unrendered note." },
          ] }],
        },
      },
    })
    expect(report.sanitization.droppedFindings).toBe(2)
    expect(report.findings.frames.every(frame => frame.findings.length === 0)).toBe(true)
  })

  test("rejects malformed provider output and unbound frame evidence", () => {
    const input = reportInput()
    expect(() => buildSpatialReviewReport({
      ...input,
      provider: { ...input.provider, output: { scene: "oops", frames: [] } as never },
    })).toThrow("bounded review schema")
    expect(() => buildSpatialReviewReport({
      ...input,
      frames: [{ index: 0, timeUs: 777_777, width: 8, height: 4, pngSha256: "c".repeat(64), pngBytes: 1 }],
    })).toThrow("unique sampled times")
    expect(() => buildSpatialReviewReport({ ...input, attemptId: "bogus" })).toThrow()
  })
})

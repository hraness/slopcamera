import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  EvaluatedSpatialSceneSchema,
  SpatialCameraIdSchema,
  SpatialDigestSchema,
  SpatialEntityIdSchema,
  SpatialTimeUsSchema,
  type EvaluatedSpatialScene,
} from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"

/**
 * Temporal evidence audit for Phase 12.
 *
 * Consumes an ordered run of evaluated snapshots (derived state only — never
 * renders) and reports exact sample/time evidence for flicker, transform
 * discontinuity, planted-contact sliding, camera acceleration/jerk and angular
 * velocity, exposure/focus jumps, and resource spikes. Findings reference the
 * snapshot index and integer microsecond time at which the violation was
 * measured so reviewers can re-evaluate the exact frame.
 */

export const SPATIAL_TEMPORAL_AUDIT_LIMITS = Object.freeze({
  samples: 256,
  contacts: 64,
  cutBoundaries: 64,
  findings: 512,
})

export const SpatialTemporalContactSchema = z.strictObject({
  entityId: SpatialEntityIdSchema,
  groundY: z.number().finite().min(-1_000_000).max(1_000_000),
  startUs: SpatialTimeUsSchema,
  endUs: SpatialTimeUsSchema,
}).superRefine((contact, context) => {
  if (contact.endUs <= contact.startUs) {
    context.addIssue({ code: "custom", path: ["endUs"], message: "Contact windows must have positive duration." })
  }
})
export type SpatialTemporalContact = Readonly<z.infer<typeof SpatialTemporalContactSchema>>

/** Companion file for ground-contact evidence supplied alongside a scene. */
export const SpatialTemporalContactsFileSchema = z.strictObject({
  contacts: z.array(SpatialTemporalContactSchema).max(SPATIAL_TEMPORAL_AUDIT_LIMITS.contacts),
})
export type SpatialTemporalContactsFile = Readonly<z.infer<typeof SpatialTemporalContactsFileSchema>>

export const SpatialTemporalAuditOptionsSchema = z.strictObject({
  contacts: z.array(SpatialTemporalContactSchema).max(SPATIAL_TEMPORAL_AUDIT_LIMITS.contacts).default([]),
  cutBeforeUs: z.array(SpatialTimeUsSchema).max(SPATIAL_TEMPORAL_AUDIT_LIMITS.cutBoundaries).default([]),
  maxPositionJumpM: z.number().finite().positive().max(1_000_000).default(5),
  maxFootSlideMps: z.number().finite().positive().max(1_000).default(0.05),
  maxCameraAccelerationMps2: z.number().finite().positive().max(1_000_000).default(50),
  maxCameraJerkMps3: z.number().finite().positive().max(1_000_000_000).default(400),
  maxAngularVelocityRadps: z.number().finite().positive().max(100_000).default(4),
  maxExposureJumpEv: z.number().finite().positive().max(64).default(1),
  maxFocusJumpM: z.number().finite().positive().max(1_000_000).default(0.5),
  maxNewAssetsPerSample: z.number().int().min(1).max(1_024).default(8),
  maxEntityCountDelta: z.number().int().min(1).max(1_024).default(16),
})
export type SpatialTemporalAuditOptions = Readonly<z.infer<typeof SpatialTemporalAuditOptionsSchema>>

export const SpatialTemporalFindingKindSchema = z.enum([
  "visibility-flicker",
  "transform-discontinuity",
  "foot-slide",
  "camera-acceleration",
  "camera-jerk",
  "camera-angular-velocity",
  "exposure-jump",
  "focus-jump",
  "resource-spike",
])
export type SpatialTemporalFindingKind = z.infer<typeof SpatialTemporalFindingKindSchema>

export const SpatialTemporalFindingSchema = z.strictObject({
  kind: SpatialTemporalFindingKindSchema,
  sampleIndex: z.number().int().min(0).max(SPATIAL_TEMPORAL_AUDIT_LIMITS.samples - 1),
  timeUs: SpatialTimeUsSchema,
  entityId: SpatialEntityIdSchema.optional(),
  cameraId: SpatialCameraIdSchema.optional(),
  measured: z.number().finite(),
  limit: z.number().finite(),
  detail: z.string().min(1).max(240),
})
export type SpatialTemporalFinding = Readonly<z.infer<typeof SpatialTemporalFindingSchema>>

export const SpatialTemporalAuditReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-temporal-audit-report"),
  schemaVersion: z.literal(1),
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  sampleCount: z.number().int().min(2).max(SPATIAL_TEMPORAL_AUDIT_LIMITS.samples),
  firstTimeUs: SpatialTimeUsSchema,
  lastTimeUs: SpatialTimeUsSchema,
  findings: z.array(SpatialTemporalFindingSchema).max(SPATIAL_TEMPORAL_AUDIT_LIMITS.findings),
  omittedFindings: z.number().int().min(0),
  thresholds: SpatialTemporalAuditOptionsSchema.omit({ contacts: true, cutBeforeUs: true }),
  contactCount: z.number().int().min(0).max(SPATIAL_TEMPORAL_AUDIT_LIMITS.contacts),
})
export type SpatialTemporalAuditReport = Readonly<z.infer<typeof SpatialTemporalAuditReportSchema>>

export function spatialTemporalAuditReportSha256(report: SpatialTemporalAuditReport): string {
  return spatialValueSha256(report)
}

const auditInputSchema = z.strictObject({
  snapshots: z.array(z.unknown()).min(2).max(SPATIAL_TEMPORAL_AUDIT_LIMITS.samples),
  options: z.unknown().optional(),
})

const KIND_ORDER: Readonly<Record<SpatialTemporalFindingKind, number>> = {
  "visibility-flicker": 0,
  "transform-discontinuity": 1,
  "foot-slide": 2,
  "camera-acceleration": 3,
  "camera-jerk": 4,
  "camera-angular-velocity": 5,
  "exposure-jump": 6,
  "focus-jump": 7,
  "resource-spike": 8,
}

const translation = (snapshot: EvaluatedSpatialScene, entityId: string): [number, number, number] | undefined => {
  const evaluated = snapshot.entities.find((item) => item.entity.entityId === entityId)
  if (evaluated === undefined) return undefined
  return [evaluated.worldMatrix[12]!, evaluated.worldMatrix[13]!, evaluated.worldMatrix[14]!]
}

const distance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)

const horizontalDistance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!)

const seconds = (later: EvaluatedSpatialScene, earlier: EvaluatedSpatialScene): number =>
  (later.timeUs - earlier.timeUs) / 1_000_000

function quaternionAngleRadians(a: readonly number[], b: readonly number[]): number {
  const dot = Math.min(1, Math.max(-1, Math.abs(a.reduce((sum, value, index) => sum + value * b[index]!, 0))))
  return 2 * Math.acos(dot)
}

/**
 * Audits one ordered run of snapshots. Snapshots must share one scene digest
 * and camera identity and be strictly increasing in time; callers derive them
 * with `evaluateSpatialScene` so evidence stays reproducible.
 */
export function auditSpatialTemporalEvidence(input: unknown): SpatialTemporalAuditReport {
  const value = parseSpatialValue(auditInputSchema, input, "temporal audit")
  const snapshots = value.snapshots.map((snapshot) => parseSpatialValue(EvaluatedSpatialSceneSchema, snapshot, "snapshot"))
  const options = parseSpatialValue(SpatialTemporalAuditOptionsSchema, value.options ?? {}, "temporal audit options")

  const sceneSha256 = snapshots[0]!.sceneSha256
  const cameraId = snapshots[0]!.camera.cameraId
  for (const [index, snapshot] of snapshots.entries()) {
    if (snapshot.sceneSha256 !== sceneSha256) {
      throw new SpatialSceneError("invalid-data", `Snapshot ${index} belongs to a different scene digest.`, "snapshots")
    }
    if (snapshot.camera.cameraId !== cameraId) {
      throw new SpatialSceneError("invalid-data", `Snapshot ${index} uses a different camera.`, "snapshots")
    }
    if (index > 0 && snapshot.timeUs <= snapshots[index - 1]!.timeUs) {
      throw new SpatialSceneError("invalid-data", "Snapshots must be strictly increasing in time.", "snapshots")
    }
  }

  const findings: SpatialTemporalFinding[] = []
  const cutTimes = new Set(options.cutBeforeUs)
  const isCutBoundary = (snapshot: EvaluatedSpatialScene): boolean => cutTimes.has(snapshot.timeUs)
  const add = (finding: SpatialTemporalFinding): void => {
    if (findings.length < SPATIAL_TEMPORAL_AUDIT_LIMITS.findings) findings.push(finding)
  }

  const entityIds = [...new Set(snapshots.flatMap((snapshot) => snapshot.entities.map((item) => item.entity.entityId)))].sort()

  // Visibility flicker: an entity toggling hidden↔visible more than once in the run.
  for (const entityId of entityIds) {
    const states = snapshots.map((snapshot) => snapshot.entities.find((item) => item.entity.entityId === entityId)?.visible)
    let flips = 0
    let firstFlipIndex = -1
    for (let index = 1; index < states.length; index += 1) {
      if (states[index] !== undefined && states[index - 1] !== undefined && states[index] !== states[index - 1]) {
        flips += 1
        if (firstFlipIndex === -1) firstFlipIndex = index
      }
    }
    if (flips >= 2) {
      add({
        kind: "visibility-flicker", sampleIndex: firstFlipIndex, timeUs: snapshots[firstFlipIndex]!.timeUs,
        entityId, measured: flips, limit: 1,
        detail: `Entity ${entityId} toggles visibility ${flips} times across the sampled run.`,
      })
    }
  }

  // Transform discontinuity and foot slide across consecutive samples.
  for (const entityId of entityIds) {
    for (let index = 1; index < snapshots.length; index += 1) {
      const previous = translation(snapshots[index - 1]!, entityId)
      const current = translation(snapshots[index]!, entityId)
      if (previous === undefined || current === undefined) continue
      if (!isCutBoundary(snapshots[index]!)) {
        const jump = distance(previous, current)
        if (jump > options.maxPositionJumpM) {
          add({
            kind: "transform-discontinuity", sampleIndex: index, timeUs: snapshots[index]!.timeUs,
            entityId, measured: jump, limit: options.maxPositionJumpM,
            detail: `Entity ${entityId} teleports ${jump.toFixed(3)}m between samples ${index - 1} and ${index} outside a declared cut.`,
          })
        }
      }
      const dt = seconds(snapshots[index]!, snapshots[index - 1]!)
      if (dt <= 0) continue
      for (const contact of options.contacts) {
        if (contact.entityId !== entityId) continue
        const inWindow = snapshots[index - 1]!.timeUs >= contact.startUs && snapshots[index]!.timeUs <= contact.endUs
        if (!inWindow) continue
        const slideMps = horizontalDistance(previous, current) / dt
        if (slideMps > options.maxFootSlideMps) {
          add({
            kind: "foot-slide", sampleIndex: index, timeUs: snapshots[index]!.timeUs,
            entityId, measured: slideMps, limit: options.maxFootSlideMps,
            detail: `Entity ${entityId} slides ${slideMps.toFixed(3)}m/s horizontally while planted near groundY ${contact.groundY} during [${contact.startUs}, ${contact.endUs}]us.`,
          })
        }
      }
    }
  }

  // Camera dynamics: position acceleration/jerk and angular velocity.
  for (let index = 1; index < snapshots.length; index += 1) {
    const current = snapshots[index]!
    const previous = snapshots[index - 1]!
    const dt = seconds(current, previous)
    if (dt > 0) {
      const angular = quaternionAngleRadians(current.camera.pose.rotation, previous.camera.pose.rotation) / dt
      if (angular > options.maxAngularVelocityRadps) {
        add({
          kind: "camera-angular-velocity", sampleIndex: index, timeUs: current.timeUs,
          cameraId, measured: angular, limit: options.maxAngularVelocityRadps,
          detail: `Camera rotates at ${angular.toFixed(3)}rad/s between samples ${index - 1} and ${index}.`,
        })
      }
      const focusNow = current.camera.lens?.focusDistanceM
      const focusBefore = previous.camera.lens?.focusDistanceM
      if (focusNow !== undefined && focusBefore !== undefined && Math.abs(focusNow - focusBefore) > options.maxFocusJumpM) {
        add({
          kind: "focus-jump", sampleIndex: index, timeUs: current.timeUs,
          cameraId, measured: Math.abs(focusNow - focusBefore), limit: options.maxFocusJumpM,
          detail: `Focus distance jumps ${Math.abs(focusNow - focusBefore).toFixed(3)}m between samples ${index - 1} and ${index}.`,
        })
      }
      const evNow = current.camera.lens?.exposureEv
      const evBefore = previous.camera.lens?.exposureEv
      if (evNow !== undefined && evBefore !== undefined && Math.abs(evNow - evBefore) > options.maxExposureJumpEv) {
        add({
          kind: "exposure-jump", sampleIndex: index, timeUs: current.timeUs,
          cameraId, measured: Math.abs(evNow - evBefore), limit: options.maxExposureJumpEv,
          detail: `Exposure jumps ${Math.abs(evNow - evBefore).toFixed(3)}EV between samples ${index - 1} and ${index}.`,
        })
      }
    }
    if (index >= 2) {
      const a = snapshots[index - 2]!, b = snapshots[index - 1]!
      const dt0 = seconds(b, a), dt1 = seconds(current, b)
      if (dt0 > 0 && dt1 > 0) {
        const acceleration = Math.hypot(...([0, 1, 2].map((axis) =>
          (current.camera.pose.position[axis]! - b.camera.pose.position[axis]!) / dt1
          - (b.camera.pose.position[axis]! - a.camera.pose.position[axis]!) / dt0,
        ) as [number, number, number])) / ((dt0 + dt1) / 2)
        if (acceleration > options.maxCameraAccelerationMps2) {
          add({
            kind: "camera-acceleration", sampleIndex: index, timeUs: current.timeUs,
            cameraId, measured: acceleration, limit: options.maxCameraAccelerationMps2,
            detail: `Camera accelerates at ${acceleration.toFixed(3)}m/s² at sample ${index}.`,
          })
        }
      }
    }
    if (index >= 3) {
      const a = snapshots[index - 3]!, b = snapshots[index - 2]!, c = snapshots[index - 1]!
      const dta = seconds(b, a), dtb = seconds(c, b), dtc = seconds(current, c)
      if (dta > 0 && dtb > 0 && dtc > 0) {
        // Window accelerations use the same centered-difference convention as
        // the camera-acceleration check; jerk is their time difference.
        const accel = (p1: EvaluatedSpatialScene, p0: EvaluatedSpatialScene, q1: EvaluatedSpatialScene, q0: EvaluatedSpatialScene, d1: number, d0: number): [number, number, number] =>
          [0, 1, 2].map((axis) => (
            (p1.camera.pose.position[axis]! - p0.camera.pose.position[axis]!) / d1
            - (q1.camera.pose.position[axis]! - q0.camera.pose.position[axis]!) / d0
          ) / ((d0 + d1) / 2)) as [number, number, number]
        const a0 = accel(c, b, b, a, dtb, dta)
        const a1 = accel(current, c, c, b, dtc, dtb)
        const jerk = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]) / ((dtb + dtc) / 2)
        if (jerk > options.maxCameraJerkMps3) {
          add({
            kind: "camera-jerk", sampleIndex: index, timeUs: current.timeUs,
            cameraId, measured: jerk, limit: options.maxCameraJerkMps3,
            detail: `Camera jerk reaches ${jerk.toFixed(3)}m/s³ at sample ${index}.`,
          })
        }
      }
    }
  }

  // Resource spikes: new asset digests appearing and entity-count swings per sample.
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1]!
    const current = snapshots[index]!
    const previousAssets = new Set(previous.assets.map((asset) => asset.assetId))
    const newAssets = current.assets.filter((asset) => !previousAssets.has(asset.assetId)).length
    if (newAssets > options.maxNewAssetsPerSample) {
      add({
        kind: "resource-spike", sampleIndex: index, timeUs: current.timeUs,
        measured: newAssets, limit: options.maxNewAssetsPerSample,
        detail: `${newAssets} assets enter the scene between samples ${index - 1} and ${index}.`,
      })
    }
    const entityDelta = Math.abs(current.entities.length - previous.entities.length)
    if (entityDelta > options.maxEntityCountDelta) {
      add({
        kind: "resource-spike", sampleIndex: index, timeUs: current.timeUs,
        measured: entityDelta, limit: options.maxEntityCountDelta,
        detail: `Entity count changes by ${entityDelta} between samples ${index - 1} and ${index}.`,
      })
    }
  }

  const all = findings.slice()
  all.sort((a, b) =>
    a.sampleIndex - b.sampleIndex
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (a.entityId ?? "").localeCompare(b.entityId ?? "")
    || (a.cameraId ?? "").localeCompare(b.cameraId ?? ""),
  )
  const returned = all.slice(0, SPATIAL_TEMPORAL_AUDIT_LIMITS.findings)
  const { contacts: _contacts, cutBeforeUs: _cutBeforeUs, ...thresholds } = options

  return deepFreezeJson(SpatialTemporalAuditReportSchema.parse({
    kind: "slopcamera.spatial-temporal-audit-report",
    schemaVersion: 1,
    sceneSha256,
    cameraId,
    sampleCount: snapshots.length,
    firstTimeUs: snapshots[0]!.timeUs,
    lastTimeUs: snapshots[snapshots.length - 1]!.timeUs,
    findings: returned,
    omittedFindings: all.length - returned.length,
    thresholds,
    contactCount: options.contacts.length,
  }))
}

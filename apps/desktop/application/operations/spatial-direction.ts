import { z } from "zod";
import { createBoundedJsonValueSnapshot } from "../../../../src/code/json-snapshot";
import {
  SpatialCameraIdSchema,
  SpatialSceneV1Schema,
  SpatialTimeUsSchema,
} from "../../../../src/spatial-scene/contracts";
import { SpatialDirectionSchema } from "../../../../src/spatial-scene/direction";
import {
  checkSpatialDirection,
  compileSpatialDirection,
  SpatialDirectionCheckReportSchema,
  SpatialDirectionCompilationSchema,
} from "../../../../src/spatial-scene/direction-compile";
import {
  createSpatialEvaluationContext,
  evaluateSpatialSceneInContext,
} from "../../../../src/spatial-scene/evaluate";
import {
  planSpatialDirectionGallery,
  SpatialGalleryAxisSchema,
  SpatialGalleryPlanSchema,
} from "../../../../src/spatial-scene/gallery";
import { SpatialParticleSystemSchema } from "../../../../src/spatial-scene/particle";
import { SpatialRenderPlanSchema } from "../../../../src/spatial-scene/effects";
import {
  checkSpatialRenderEffects,
  planSpatialRenderEffects,
  SPATIAL_RENDER_EFFECTS_LIMITS,
  SpatialEffectsCheckReportSchema,
  SpatialRenderEffectsBindingSchema,
  SpatialRenderEffectsDocumentSchema,
} from "../../../../src/spatial-scene/render-effects";
import { SpatialSimulationBakeReceiptSchema } from "../../../../src/spatial-scene/simulation";
import {
  auditSpatialTemporalEvidence,
  SpatialTemporalAuditOptionsSchema,
  SpatialTemporalAuditReportSchema,
} from "../../../../src/spatial-scene/temporal-audit";
import type { OperationDefinition, OperationPolicy } from "../operation";
import { throwIfAborted } from "./shared";

const capture = (value: unknown) => createBoundedJsonValueSnapshot(
  value,
  8 * 1024 * 1024,
  "scene planning operation",
  { maximumDepth: 36, maximumValues: 400_000 },
).value;

export const SpatialDirectionCheckInputSchema = z.preprocess(capture, z.strictObject({
  direction: SpatialDirectionSchema,
  scene: SpatialSceneV1Schema,
}));
export const SpatialDirectionCompileInputSchema = z.preprocess(capture, z.strictObject({
  cameraId: SpatialCameraIdSchema.optional(),
  direction: SpatialDirectionSchema,
  scene: SpatialSceneV1Schema,
}));
export const SpatialDirectionGalleryInputSchema = z.preprocess(capture, z.strictObject({
  axis: SpatialGalleryAxisSchema,
  cameraId: SpatialCameraIdSchema.optional(),
  direction: SpatialDirectionSchema,
  scene: SpatialSceneV1Schema,
}));
export const SpatialEffectsCheckInputSchema = z.preprocess(capture, z.strictObject({
  effects: z.union([SpatialRenderEffectsBindingSchema, SpatialRenderEffectsDocumentSchema]),
  scene: SpatialSceneV1Schema,
}));
export const SpatialEffectsPlanInputSchema = z.preprocess(capture, z.strictObject({
  particleSystems: z.array(SpatialParticleSystemSchema).max(SPATIAL_RENDER_EFFECTS_LIMITS.particleSystems).default([]),
  renderPlan: SpatialRenderPlanSchema,
  scene: SpatialSceneV1Schema,
  simulationBakes: z.array(SpatialSimulationBakeReceiptSchema).max(SPATIAL_RENDER_EFFECTS_LIMITS.simulationBakes).default([]),
}));
export const SpatialTemporalAuditInputSchema = z.preprocess(capture, z.strictObject({
  cameraId: SpatialCameraIdSchema,
  options: SpatialTemporalAuditOptionsSchema.optional(),
  scene: SpatialSceneV1Schema,
  timesUs: z.array(SpatialTimeUsSchema).min(2).max(64).optional(),
}));
export type SpatialDirectionCheckInput = z.infer<typeof SpatialDirectionCheckInputSchema>;
export type SpatialDirectionCompileInput = z.infer<typeof SpatialDirectionCompileInputSchema>;
export type SpatialDirectionGalleryInput = z.infer<typeof SpatialDirectionGalleryInputSchema>;
export type SpatialEffectsCheckInput = z.infer<typeof SpatialEffectsCheckInputSchema>;
export type SpatialEffectsPlanInput = z.infer<typeof SpatialEffectsPlanInputSchema>;
export type SpatialTemporalAuditInput = z.infer<typeof SpatialTemporalAuditInputSchema>;
export type SpatialDirectionCheckOutput = z.infer<typeof SpatialDirectionCheckReportSchema>;
export type SpatialDirectionCompileOutput = z.infer<typeof SpatialDirectionCompilationSchema>;
export type SpatialDirectionGalleryOutput = z.infer<typeof SpatialGalleryPlanSchema>;
export type SpatialEffectsCheckOutput = z.infer<typeof SpatialEffectsCheckReportSchema>;
export type SpatialEffectsPlanOutput = z.infer<typeof SpatialRenderEffectsBindingSchema>;
export type SpatialTemporalAuditOutput = z.infer<typeof SpatialTemporalAuditReportSchema>;

const purePolicy = Object.freeze({
  cache: "content-addressed", cancellable: true, effect: "pure", maxDurationMs: 10_000,
  maxFanOut: 0, maxInputBytes: 8 * 1024 * 1024, maxOutputBytes: 16 * 1024 * 1024,
  preparation: [], resources: [{ amount: 1, resource: "cpu" }], resume: "deterministic",
} as const) satisfies OperationPolicy;

const compileTimesUs = (input: SpatialTemporalAuditInput): readonly number[] => {
  if (input.timesUs !== undefined) return [...input.timesUs].sort((left, right) => left - right);
  const count = Math.min(17, Math.max(2, Math.ceil(input.scene.durationUs / 1_000_000) + 1));
  return Array.from({ length: count }, (_, index) => Math.floor((input.scene.durationUs * index) / (count - 1)));
};

export const spatialDirectionCheckOperationDefinition = {
  kind: "scene.direction.check", version: 1,
  inputSchema: SpatialDirectionCheckInputSchema,
  inputSchemaId: "slopcamera.operation.scene.direction.check.input/v1",
  outputSchema: SpatialDirectionCheckReportSchema,
  outputSchemaId: "slopcamera.operation.scene.direction.check.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: (context, input) => {
    throwIfAborted(context.abortSignal);
    return Promise.resolve(SpatialDirectionCheckReportSchema.parse(
      checkSpatialDirection({ direction: input.direction, scene: input.scene }),
    ));
  } },
  summarize: output => ({ kind: "scene.direction.check", fields: {
    directionSha256: output.directionSha256, errors: output.counts.errors, warnings: output.counts.warnings,
  } }),
} satisfies OperationDefinition<"scene.direction.check", SpatialDirectionCheckInput, SpatialDirectionCheckOutput>;

export const spatialDirectionCompileOperationDefinition = {
  kind: "scene.direction.compile", version: 1,
  inputSchema: SpatialDirectionCompileInputSchema,
  inputSchemaId: "slopcamera.operation.scene.direction.compile.input/v1",
  outputSchema: SpatialDirectionCompilationSchema,
  outputSchemaId: "slopcamera.operation.scene.direction.compile.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: (context, input) => {
    throwIfAborted(context.abortSignal);
    return Promise.resolve(SpatialDirectionCompilationSchema.parse(compileSpatialDirection({
      direction: input.direction, scene: input.scene,
      ...(input.cameraId === undefined ? {} : { cameraId: input.cameraId }),
    })));
  } },
  summarize: output => ({ kind: "scene.direction.compile", fields: {
    sceneSha256: output.sceneSha256, shots: output.proposals.shots.length,
    unresolved: output.unresolvedIntents.length, advisories: output.advisories.length,
  } }),
} satisfies OperationDefinition<"scene.direction.compile", SpatialDirectionCompileInput, SpatialDirectionCompileOutput>;

export const spatialDirectionGalleryOperationDefinition = {
  kind: "scene.direction.gallery", version: 1,
  inputSchema: SpatialDirectionGalleryInputSchema,
  inputSchemaId: "slopcamera.operation.scene.direction.gallery.input/v1",
  outputSchema: SpatialGalleryPlanSchema,
  outputSchemaId: "slopcamera.operation.scene.direction.gallery.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: (context, input) => {
    throwIfAborted(context.abortSignal);
    return Promise.resolve(SpatialGalleryPlanSchema.parse(planSpatialDirectionGallery({
      axis: input.axis, direction: input.direction, scene: input.scene,
      ...(input.cameraId === undefined ? {} : { cameraId: input.cameraId }),
    })));
  } },
  summarize: output => ({ kind: "scene.direction.gallery", fields: {
    axis: output.axis, candidates: output.candidates.length, sourceSha256: output.sourceSha256,
  } }),
} satisfies OperationDefinition<"scene.direction.gallery", SpatialDirectionGalleryInput, SpatialDirectionGalleryOutput>;

export const spatialEffectsCheckOperationDefinition = {
  kind: "scene.effects.check", version: 1,
  inputSchema: SpatialEffectsCheckInputSchema,
  inputSchemaId: "slopcamera.operation.scene.effects.check.input/v1",
  outputSchema: SpatialEffectsCheckReportSchema,
  outputSchemaId: "slopcamera.operation.scene.effects.check.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: (context, input) => {
    throwIfAborted(context.abortSignal);
    return Promise.resolve(SpatialEffectsCheckReportSchema.parse(
      checkSpatialRenderEffects({ effects: input.effects, scene: input.scene }),
    ));
  } },
  summarize: output => ({ kind: "scene.effects.check", fields: {
    errors: output.counts.errors, warnings: output.counts.warnings, sceneSha256: output.sceneSha256,
  } }),
} satisfies OperationDefinition<"scene.effects.check", SpatialEffectsCheckInput, SpatialEffectsCheckOutput>;

export const spatialEffectsPlanOperationDefinition = {
  kind: "scene.effects.plan", version: 1,
  inputSchema: SpatialEffectsPlanInputSchema,
  inputSchemaId: "slopcamera.operation.scene.effects.plan.input/v1",
  outputSchema: SpatialRenderEffectsBindingSchema,
  outputSchemaId: "slopcamera.operation.scene.effects.plan.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: (context, input) => {
    throwIfAborted(context.abortSignal);
    return Promise.resolve(SpatialRenderEffectsBindingSchema.parse(planSpatialRenderEffects({
      particleSystems: input.particleSystems, renderPlan: input.renderPlan, scene: input.scene,
      simulationBakes: input.simulationBakes,
    })));
  } },
  summarize: output => ({ kind: "scene.effects.plan", fields: {
    documentSha256: output.documentSha256, renderPlanSha256: output.document.renderPlanSha256,
  } }),
} satisfies OperationDefinition<"scene.effects.plan", SpatialEffectsPlanInput, SpatialEffectsPlanOutput>;

export const spatialTemporalAuditOperationDefinition = {
  kind: "scene.temporal-audit", version: 1,
  inputSchema: SpatialTemporalAuditInputSchema,
  inputSchemaId: "slopcamera.operation.scene.temporal-audit.input/v1",
  outputSchema: SpatialTemporalAuditReportSchema,
  outputSchemaId: "slopcamera.operation.scene.temporal-audit.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: (context, input) => {
    throwIfAborted(context.abortSignal);
    const evaluationContext = createSpatialEvaluationContext(input.scene);
    const snapshots = compileTimesUs(input).map(timeUs =>
      evaluateSpatialSceneInContext(evaluationContext, { cameraId: input.cameraId, timeUs }));
    return Promise.resolve(SpatialTemporalAuditReportSchema.parse(
      auditSpatialTemporalEvidence({
        snapshots,
        ...(input.options === undefined ? {} : { options: input.options }),
      }),
    ));
  } },
  summarize: output => ({ kind: "scene.temporal-audit", fields: {
    findings: output.findings.length, samples: output.sampleCount, sceneSha256: output.sceneSha256,
  } }),
} satisfies OperationDefinition<"scene.temporal-audit", SpatialTemporalAuditInput, SpatialTemporalAuditOutput>;

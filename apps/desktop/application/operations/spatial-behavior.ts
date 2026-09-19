import { z } from "zod";
import { createBoundedJsonValueSnapshot } from "../../../../src/code/json-snapshot";
import {
  SpatialDigestSchema,
  SpatialSceneV1Schema,
  SpatialTimeUsSchema,
} from "../../../../src/spatial-scene/contracts";
import {
  checkSpatialBehavior,
  SpatialBehaviorCheckReportSchema,
  SpatialBehaviorSchema,
} from "../../../../src/spatial-scene/behavior";
import {
  auditSpatialBehaviorTrace,
  SpatialBehaviorAuditOptionsSchema,
  SpatialBehaviorAuditReportSchema,
} from "../../../../src/spatial-scene/behavior-audit";
import { bakeSpatialBehavior } from "../../../../src/spatial-scene/behavior-bake";
import { spatialBehaviorFnSignatures } from "../../../../src/spatial-scene/behavior-fns";
import {
  planSpatialBehaviorGallery,
  SpatialBehaviorGalleryPlanSchema,
} from "../../../../src/spatial-scene/behavior-gallery";
import {
  SpatialBehaviorBakeSchema,
  SpatialBehaviorChannelMapSchema,
  SpatialBehaviorEmittedSchema,
} from "../../../../src/spatial-scene/behavior-trace";
import type { OperationDefinition, OperationPolicy } from "../operation";
import { throwIfAborted } from "./shared";

const capture = (value: unknown) => createBoundedJsonValueSnapshot(
  value,
  8 * 1024 * 1024,
  "behavior operation",
  { maximumDepth: 36, maximumValues: 400_000 },
).value;

export const SpatialBehaviorCheckInputSchema = z.preprocess(capture, z.strictObject({
  behavior: SpatialBehaviorSchema,
  scene: SpatialSceneV1Schema,
}));
export const SpatialBehaviorBakeInputSchema = z.preprocess(capture, z.strictObject({
  behavior: SpatialBehaviorSchema,
  channelMap: SpatialBehaviorChannelMapSchema.optional(),
  scene: SpatialSceneV1Schema,
}));
export const SpatialBehaviorGalleryInputSchema = z.preprocess(capture, z.strictObject({
  behavior: SpatialBehaviorSchema,
  channelMap: SpatialBehaviorChannelMapSchema.optional(),
  scene: SpatialSceneV1Schema,
}));

export const SpatialBehaviorAuditInputSchema = z.preprocess(capture, z.strictObject({
  emitted: z.array(SpatialBehaviorEmittedSchema).max(16_384),
  behaviorSha256: SpatialDigestSchema,
  emittedSha256: SpatialDigestSchema,
  rangeUs: z.strictObject({ startUs: SpatialTimeUsSchema, endUs: SpatialTimeUsSchema }),
  options: SpatialBehaviorAuditOptionsSchema.optional(),
}));

export type SpatialBehaviorCheckInput = z.infer<typeof SpatialBehaviorCheckInputSchema>;
export type SpatialBehaviorBakeInput = z.infer<typeof SpatialBehaviorBakeInputSchema>;
export type SpatialBehaviorGalleryInput = z.infer<typeof SpatialBehaviorGalleryInputSchema>;
export type SpatialBehaviorAuditInput = z.infer<typeof SpatialBehaviorAuditInputSchema>;
export type SpatialBehaviorCheckOutput = z.infer<typeof SpatialBehaviorCheckReportSchema>;
export type SpatialBehaviorBakeOutput = z.infer<typeof SpatialBehaviorBakeSchema>;
export type SpatialBehaviorGalleryOutput = z.infer<typeof SpatialBehaviorGalleryPlanSchema>;
export type SpatialBehaviorAuditOutput = z.infer<typeof SpatialBehaviorAuditReportSchema>;

const purePolicy = Object.freeze({
  cache: "content-addressed", cancellable: true, effect: "pure", maxDurationMs: 10_000,
  maxFanOut: 0, maxInputBytes: 8 * 1024 * 1024, maxOutputBytes: 16 * 1024 * 1024,
  preparation: [], resources: [{ amount: 1, resource: "cpu" }], resume: "deterministic",
} as const) satisfies OperationPolicy;

export const spatialBehaviorCheckOperationDefinition = {
  kind: "scene.behavior.check", version: 1,
  inputSchema: SpatialBehaviorCheckInputSchema,
  inputSchemaId: "slopcamera.operation.scene.behavior.check.input/v1",
  outputSchema: SpatialBehaviorCheckReportSchema,
  outputSchemaId: "slopcamera.operation.scene.behavior.check.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: (context, input) => {
    throwIfAborted(context.abortSignal);
    return Promise.resolve(SpatialBehaviorCheckReportSchema.parse(
      checkSpatialBehavior({ behavior: input.behavior, scene: input.scene }, spatialBehaviorFnSignatures()),
    ));
  } },
  summarize: output => ({ kind: "scene.behavior.check", fields: {
    behaviorSha256: output.behaviorSha256, errors: output.counts.errors, warnings: output.counts.warnings,
  } }),
} satisfies OperationDefinition<"scene.behavior.check", SpatialBehaviorCheckInput, SpatialBehaviorCheckOutput>;

export const spatialBehaviorBakeOperationDefinition = {
  kind: "scene.behavior.bake", version: 1,
  inputSchema: SpatialBehaviorBakeInputSchema,
  inputSchemaId: "slopcamera.operation.scene.behavior.bake.input/v1",
  outputSchema: SpatialBehaviorBakeSchema,
  outputSchemaId: "slopcamera.operation.scene.behavior.bake.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: async (context, input) => {
    throwIfAborted(context.abortSignal);
    const { bake } = await bakeSpatialBehavior({
      behavior: input.behavior, scene: input.scene,
      ...(input.channelMap === undefined ? {} : { channelMap: input.channelMap }),
    });
    return SpatialBehaviorBakeSchema.parse(bake);
  } },
  summarize: output => ({ kind: "scene.behavior.bake", fields: {
    behaviorSha256: output.behaviorSha256, emitted: output.emitted.length,
    directives: output.directives.length, unresolved: output.unresolvedIntents.length,
    runDigest: output.receipt.runDigest,
  } }),
} satisfies OperationDefinition<"scene.behavior.bake", SpatialBehaviorBakeInput, SpatialBehaviorBakeOutput>;

export const spatialBehaviorGalleryOperationDefinition = {
  kind: "scene.behavior.gallery", version: 1,
  inputSchema: SpatialBehaviorGalleryInputSchema,
  inputSchemaId: "slopcamera.operation.scene.behavior.gallery.input/v1",
  outputSchema: SpatialBehaviorGalleryPlanSchema,
  outputSchemaId: "slopcamera.operation.scene.behavior.gallery.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: async (context, input) => {
    throwIfAborted(context.abortSignal);
    return SpatialBehaviorGalleryPlanSchema.parse(await planSpatialBehaviorGallery({
      behavior: input.behavior, scene: input.scene,
      ...(input.channelMap === undefined ? {} : { channelMap: input.channelMap }),
    }));
  } },
  summarize: output => ({ kind: "scene.behavior.gallery", fields: {
    behaviorSha256: output.behaviorSha256, candidates: output.candidates.length,
  } }),
} satisfies OperationDefinition<"scene.behavior.gallery", SpatialBehaviorGalleryInput, SpatialBehaviorGalleryOutput>;

export const spatialBehaviorAuditOperationDefinition = {
  kind: "scene.behavior.audit", version: 1,
  inputSchema: SpatialBehaviorAuditInputSchema,
  inputSchemaId: "slopcamera.operation.scene.behavior.audit.input/v1",
  outputSchema: SpatialBehaviorAuditReportSchema,
  outputSchemaId: "slopcamera.operation.scene.behavior.audit.output/v1",
  policy: purePolicy,
  lifecycle: { kind: "pure", execute: (context, input) => {
    throwIfAborted(context.abortSignal);
    return Promise.resolve(SpatialBehaviorAuditReportSchema.parse(auditSpatialBehaviorTrace(input)));
  } },
  summarize: output => ({ kind: "scene.behavior.audit", fields: {
    behaviorSha256: output.behaviorSha256, findings: output.findings.length,
    channels: output.channelCount, emitted: output.emittedCount,
  } }),
} satisfies OperationDefinition<"scene.behavior.audit", SpatialBehaviorAuditInput, SpatialBehaviorAuditOutput>;

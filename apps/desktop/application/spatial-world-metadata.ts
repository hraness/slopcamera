import { z } from "zod";

import type { SpatialWorldSuggestedNormalization } from "../contracts/spatial-world";

// World Labs Marble `semantics_metadata` documents are not formally versioned.
// The documented fields are `metric_scale_factor` and `ground_plane_offset`
// (both number-or-null; the ground plane offset is defined on the Y axis of the
// metric-scaled frame). Recognized keys are validated strictly while unknown
// keys are ignored, so newer provider fields never break parsing. The
// provider's snake_case wire keys, the camelCase spellings retained inside
// slopcamera.world-labs-provenance receipts, and a wrapping object holding the
// document under `semantics_metadata`/`semanticsMetadata` are all read; within
// one scope the snake_case spelling wins, and a bare document wins over a
// wrapped one. Every extracted value is provider-declared, never verified.
const metricScaleFactor = z.number().finite().positive().max(1_000_000).nullable();
const groundPlaneOffset = z.number().finite().min(-1_000_000).max(1_000_000).nullable();
const axisLabel = z.string().min(1).max(16).nullable();
const recognizedScope = z.object({
  metric_scale_factor: metricScaleFactor.optional(), metricScaleFactor: metricScaleFactor.optional(),
  ground_plane_offset: groundPlaneOffset.optional(), groundPlaneOffset: groundPlaneOffset.optional(),
  ground_plane_axis: axisLabel.optional(), groundPlaneAxis: axisLabel.optional(),
  up_axis: axisLabel.optional(), upAxis: axisLabel.optional(),
});
const documentSchema = recognizedScope.extend({
  semantics_metadata: recognizedScope.nullable().optional(),
  semanticsMetadata: recognizedScope.nullable().optional(),
});
type RecognizedScope = z.infer<typeof recognizedScope>;
type Declared = SpatialWorldSuggestedNormalization["declared"];
type Suggested = SpatialWorldSuggestedNormalization["suggestion"];
export type WorldProviderMetadataSuggestion = Omit<SpatialWorldSuggestedNormalization, "artifactSha256">;

const positiveAxes = new Set(["x", "y", "z"]);
function positiveAxis(label: string | null | undefined): "x" | "y" | "z" | undefined {
  if (label === null || label === undefined) return undefined;
  const normalized = label.trim().toLowerCase().replace(/^\+/u, "");
  return positiveAxes.has(normalized) ? normalized as "x" | "y" | "z" : undefined;
}

/** Extract the recognized provider-declared fields into an advisory suggestion record. */
export function extractWorldProviderMetadata(document: unknown): WorldProviderMetadataSuggestion {
  const parsed = documentSchema.safeParse(document);
  if (!parsed.success) throw new RangeError("World provider metadata is not a recognized semantics_metadata document.");
  const scopes: RecognizedScope[] = [parsed.data];
  if (parsed.data.semantics_metadata !== null && parsed.data.semantics_metadata !== undefined) scopes.push(parsed.data.semantics_metadata);
  if (parsed.data.semanticsMetadata !== null && parsed.data.semanticsMetadata !== undefined) scopes.push(parsed.data.semanticsMetadata);
  const first = <T>(select: (scope: RecognizedScope) => T | undefined): T | undefined => {
    for (const scope of scopes) {
      const value = select(scope);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  const metricScaleFactorValue = first(scope => scope.metric_scale_factor !== undefined ? scope.metric_scale_factor : scope.metricScaleFactor);
  const groundPlaneOffsetValue = first(scope => scope.ground_plane_offset !== undefined ? scope.ground_plane_offset : scope.groundPlaneOffset);
  const groundPlaneAxisValue = first(scope => scope.ground_plane_axis !== undefined ? scope.ground_plane_axis : scope.groundPlaneAxis);
  const upAxisValue = first(scope => scope.up_axis !== undefined ? scope.up_axis : scope.upAxis);
  const declared: Declared = {};
  if (metricScaleFactorValue !== undefined) declared.metricScaleFactor = metricScaleFactorValue;
  if (groundPlaneOffsetValue !== undefined) declared.groundPlaneOffset = groundPlaneOffsetValue;
  if (groundPlaneAxisValue !== undefined) declared.groundPlaneAxis = groundPlaneAxisValue;
  if (upAxisValue !== undefined) declared.upAxis = upAxisValue;
  const suggestion: Suggested = {};
  if (typeof declared.metricScaleFactor === "number" && declared.metricScaleFactor >= 0.000001) suggestion.metersPerUnit = declared.metricScaleFactor;
  const sourceUp = positiveAxis(declared.upAxis);
  if (sourceUp !== undefined) suggestion.sourceUp = sourceUp;
  if (typeof declared.groundPlaneOffset === "number") {
    // Marble defines ground_plane_offset on the Y axis of the metric-scaled
    // frame; a declared axis only overrides that when it names a known axis.
    suggestion.groundPlane = { axis: positiveAxis(declared.groundPlaneAxis) ?? "y", offset: declared.groundPlaneOffset };
  }
  return { provider: "worldlabs-marble", schema: "semantics_metadata", status: "unverified-provider-declared", declared, suggestion };
}

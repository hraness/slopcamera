import { z } from "zod";

import type { SpatialWorldSuggestedNormalization } from "../contracts/spatial-world";

// World Labs Marble `semantics_metadata` documents are not formally versioned.
// The documented fields are `metric_scale_factor` and `ground_plane_offset`
// (both number-or-null; the ground plane offset is defined on the Y axis of the
// metric-scaled frame). The documented carrier chain is
// `world.assets.splats.semantics_metadata`: a world document nests it under
// `assets.splats`, `world`/`response` envelopes wrap one world document, and a
// saved `assets` object carries it under `splats` directly. A bare document and
// a wrapping `semantics_metadata`/`semanticsMetadata` object are also read —
// including the camelCase spelling retained inside slopcamera.world-labs-
// provenance receipts. Recognized keys are validated strictly while unknown
// keys are ignored, so newer provider fields never break parsing. Within one
// scope the snake_case spelling wins, and an outer carrier wins over a more
// deeply nested one. Every extracted value is provider-declared, never
// verified.
const metricScaleFactor = z.number().finite().positive().max(1_000_000).nullable();
const groundPlaneOffset = z.number().finite().min(-1_000_000).max(1_000_000).nullable();
const axisLabel = z.string().min(1).max(16).nullable();
const recognizedScope = z.object({
  metric_scale_factor: metricScaleFactor.optional(), metricScaleFactor: metricScaleFactor.optional(),
  ground_plane_offset: groundPlaneOffset.optional(), groundPlaneOffset: groundPlaneOffset.optional(),
  ground_plane_axis: axisLabel.optional(), groundPlaneAxis: axisLabel.optional(),
  up_axis: axisLabel.optional(), upAxis: axisLabel.optional(),
});
// Each carrier level may hold the document under either documented spelling.
const splatCarrier = z.object({
  semantics_metadata: recognizedScope.nullable().optional(),
  semanticsMetadata: recognizedScope.nullable().optional(),
});
const assetsCarrier = z.object({ splats: splatCarrier.nullable().optional() });
const worldCarrier = z.object({ assets: assetsCarrier.nullable().optional() });
const documentSchema = recognizedScope.extend({
  semantics_metadata: recognizedScope.nullable().optional(),
  semanticsMetadata: recognizedScope.nullable().optional(),
  splats: splatCarrier.nullable().optional(),
  assets: assetsCarrier.nullable().optional(),
  world: worldCarrier.nullable().optional(),
  response: worldCarrier.nullable().optional(),
});
type RecognizedScope = z.infer<typeof recognizedScope>;
type SplatCarrier = z.infer<typeof splatCarrier>;
type Declared = SpatialWorldSuggestedNormalization["declared"];
type Suggested = SpatialWorldSuggestedNormalization["suggestion"];
export type WorldProviderMetadataSuggestion = Omit<SpatialWorldSuggestedNormalization, "artifactSha256">;

const positiveAxes = new Set(["x", "y", "z"]);
function positiveAxis(label: string | null | undefined): "x" | "y" | "z" | undefined {
  if (label === null || label === undefined) return undefined;
  const normalized = label.trim().toLowerCase().replace(/^\+/u, "");
  return positiveAxes.has(normalized) ? normalized as "x" | "y" | "z" : undefined;
}

/** Scopes carried by one splat-level object: snake_case first, then camelCase. */
function carrierScopes(carrier: SplatCarrier | null | undefined): RecognizedScope[] {
  if (carrier === null || carrier === undefined) return [];
  return [
    ...(carrier.semantics_metadata === null || carrier.semantics_metadata === undefined ? [] : [carrier.semantics_metadata]),
    ...(carrier.semanticsMetadata === null || carrier.semanticsMetadata === undefined ? [] : [carrier.semanticsMetadata]),
  ];
}

/** Extract the recognized provider-declared fields into an advisory suggestion record. */
export function extractWorldProviderMetadata(document: unknown): WorldProviderMetadataSuggestion {
  const parsed = documentSchema.safeParse(document);
  if (!parsed.success) throw new RangeError("World provider metadata is not a recognized semantics_metadata document.");
  // Outer carriers win over deeper nesting; each carrier's snake_case spelling
  // precedes its camelCase spelling — matching the bare-before-wrapped rule.
  const scopes: RecognizedScope[] = [
    parsed.data,
    ...carrierScopes(parsed.data),
    ...carrierScopes(parsed.data.splats),
    ...carrierScopes(parsed.data.assets?.splats),
    ...carrierScopes(parsed.data.world?.assets?.splats),
    ...carrierScopes(parsed.data.response?.assets?.splats),
  ];
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

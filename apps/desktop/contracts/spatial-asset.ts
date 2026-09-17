/**
 * The asset admission document contracts are canonical in the portable layer
 * (`src/spatial-scene/asset-admission.ts`) so `scene audit` surfaces and MCP
 * tools share one strict schema. This module re-exports them under the
 * established desktop contract path.
 */
export {
  SpatialAssetAdmissionV1Schema,
  SpatialAssetFactsV1Schema,
  SpatialBoundsSchema,
  SpatialPublishedArtifactSchema,
  type SpatialAssetAdmissionV1,
  type SpatialAssetFactsV1,
  type SpatialBounds,
  type SpatialPublishedArtifact,
} from "../../../src/spatial-scene/asset-admission";

// @bun
import {
  SlopcameraCodeError,
  canonicalJson,
  createBoundedJsonSnapshot,
  createBoundedJsonValueSnapshot,
  deepFreezeJson,
  sha256Hex
} from "./index-8txs6fkn.js";

// src/spatial-scene/material-lighting.ts
import { z } from "zod";
var unit = z.number().finite().min(0).max(1);
var positiveFinite = z.number().finite().min(0).max(1e6);
var finiteCoordinate = z.number().finite().min(-1e6).max(1e6);
var color = z.string().regex(/^#[a-fA-F0-9]{6}$/u);
var SpatialMapChannelSchema = z.enum([
  "rgb",
  "rgba",
  "r",
  "g",
  "b",
  "a",
  "rg",
  "orm",
  "xy-normal"
]);
var SpatialMapColorSpaceSchema = z.enum([
  "srgb",
  "linear"
]);
var SpatialUvTransformSchema = z.strictObject({
  offset: z.tuple([finiteCoordinate, finiteCoordinate]),
  rotation: z.number().finite().min(-Math.PI).max(Math.PI),
  scale: z.tuple([positiveFinite, positiveFinite])
});
var assetId = z.string().min(7).max(128).regex(/^asset_[a-zA-Z0-9][a-zA-Z0-9_-]*$/u);
var SpatialPbrMapSchema = z.strictObject({
  assetId,
  channel: SpatialMapChannelSchema,
  colorSpace: SpatialMapColorSpaceSchema,
  uvTransform: SpatialUvTransformSchema.optional()
});
var SpatialPbrEmissiveSchema = z.strictObject({
  color,
  intensity: z.number().finite().min(0).max(1e5),
  map: SpatialPbrMapSchema.optional()
});
var SpatialPbrClearcoatSchema = z.strictObject({
  factor: unit,
  roughness: unit,
  map: SpatialPbrMapSchema.optional(),
  roughnessMap: SpatialPbrMapSchema.optional(),
  normalMap: SpatialPbrMapSchema.optional(),
  normalScale: z.number().finite().min(-16).max(16).optional()
});
var SpatialPbrTransmissionSchema = z.strictObject({
  factor: unit,
  map: SpatialPbrMapSchema.optional()
});
var SpatialPbrSheenSchema = z.strictObject({
  color,
  roughness: unit,
  colorMap: SpatialPbrMapSchema.optional(),
  roughnessMap: SpatialPbrMapSchema.optional()
});
var SpatialPbrAnisotropySchema = z.strictObject({
  strength: z.number().finite().min(-1).max(1),
  rotation: z.number().finite().min(0).max(2 * Math.PI),
  map: SpatialPbrMapSchema.optional()
});
var SpatialPbrMaterialSchema = z.strictObject({
  kind: z.literal("pbr"),
  color,
  opacity: unit,
  roughness: unit,
  metalness: unit,
  baseColorMap: SpatialPbrMapSchema.optional(),
  normalMap: SpatialPbrMapSchema.optional(),
  normalScale: z.number().finite().min(-16).max(16).optional(),
  ormMap: SpatialPbrMapSchema.optional(),
  roughnessMap: SpatialPbrMapSchema.optional(),
  metalnessMap: SpatialPbrMapSchema.optional(),
  aoMap: SpatialPbrMapSchema.optional(),
  aoMapIntensity: unit.optional(),
  emissive: SpatialPbrEmissiveSchema.optional(),
  heightMap: SpatialPbrMapSchema.optional(),
  heightScale: z.number().finite().min(-10).max(10).optional(),
  clearcoat: SpatialPbrClearcoatSchema.optional(),
  transmission: SpatialPbrTransmissionSchema.optional(),
  sheen: SpatialPbrSheenSchema.optional(),
  anisotropy: SpatialPbrAnisotropySchema.optional(),
  ior: z.number().finite().min(1).max(5).optional(),
  alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]).optional(),
  alphaCutoff: unit.optional(),
  doubleSided: z.boolean().optional()
}).superRefine((material, context) => {
  const hasOrm = material.ormMap !== undefined;
  const hasSeparate = material.roughnessMap !== undefined || material.metalnessMap !== undefined || material.aoMap !== undefined;
  if (hasOrm && hasSeparate) {
    context.addIssue({ code: "custom", message: "PBR materials must use either an ORM map or separate roughness/metalness/AO maps, never both." });
  }
  if (material.baseColorMap !== undefined && !["rgb", "rgba"].includes(material.baseColorMap.channel)) {
    context.addIssue({ code: "custom", path: ["baseColorMap", "channel"], message: "Base-color maps must use rgb or rgba channels." });
  }
  if (material.baseColorMap !== undefined && material.baseColorMap.colorSpace !== "srgb") {
    context.addIssue({ code: "custom", path: ["baseColorMap", "colorSpace"], message: "Base-color maps must be sRGB." });
  }
  if (material.normalMap !== undefined && material.normalMap.channel !== "xy-normal") {
    context.addIssue({ code: "custom", path: ["normalMap", "channel"], message: "Normal maps must use xy-normal channel semantics." });
  }
  if (material.normalMap !== undefined && material.normalMap.colorSpace !== "linear") {
    context.addIssue({ code: "custom", path: ["normalMap", "colorSpace"], message: "Normal maps must be linear." });
  }
  if (material.ormMap !== undefined && material.ormMap.channel !== "orm") {
    context.addIssue({ code: "custom", path: ["ormMap", "channel"], message: "ORM maps must use orm channel semantics." });
  }
  if (material.ormMap !== undefined && material.ormMap.colorSpace !== "linear") {
    context.addIssue({ code: "custom", path: ["ormMap", "colorSpace"], message: "ORM maps must be linear." });
  }
  if (material.heightMap !== undefined && material.heightMap.channel !== "r") {
    context.addIssue({ code: "custom", path: ["heightMap", "channel"], message: "Height maps must use single red channel." });
  }
  if (material.heightMap !== undefined && material.heightMap.colorSpace !== "linear") {
    context.addIssue({ code: "custom", path: ["heightMap", "colorSpace"], message: "Height maps must be linear." });
  }
  if (material.emissive?.map !== undefined && material.emissive.map.colorSpace !== "srgb") {
    context.addIssue({ code: "custom", path: ["emissive", "map", "colorSpace"], message: "Emissive maps must be sRGB." });
  }
  for (const [name, map, channels] of [
    ["roughnessMap", material.roughnessMap, ["g"]],
    ["metalnessMap", material.metalnessMap, ["b"]],
    ["aoMap", material.aoMap, ["r"]],
    ["clearcoat.map", material.clearcoat?.map, ["r"]],
    ["clearcoat.roughnessMap", material.clearcoat?.roughnessMap, ["g"]],
    ["transmission.map", material.transmission?.map, ["r"]],
    ["sheen.roughnessMap", material.sheen?.roughnessMap, ["a"]]
  ]) {
    if (map !== undefined && map.colorSpace !== "linear")
      context.addIssue({ code: "custom", path: name.split("."), message: `${name} must be linear.` });
    if (map !== undefined && !channels.includes(map.channel))
      context.addIssue({ code: "custom", path: [...name.split("."), "channel"], message: `${name} has unsupported channel semantics.` });
  }
  for (const [name, map] of [["clearcoat.normalMap", material.clearcoat?.normalMap], ["anisotropy.map", material.anisotropy?.map]]) {
    if (map !== undefined && map.colorSpace !== "linear")
      context.addIssue({ code: "custom", path: name.split("."), message: `${name} must be linear.` });
  }
  if (material.clearcoat?.normalMap !== undefined && material.clearcoat.normalMap.channel !== "xy-normal")
    context.addIssue({ code: "custom", path: ["clearcoat", "normalMap", "channel"], message: "Clearcoat normal maps must use xy-normal semantics." });
  if (material.emissive?.map !== undefined && !["rgb", "rgba"].includes(material.emissive.map.channel))
    context.addIssue({ code: "custom", path: ["emissive", "map", "channel"], message: "Emissive maps must use rgb or rgba channels." });
  if (material.sheen?.colorMap !== undefined && (material.sheen.colorMap.colorSpace !== "srgb" || !["rgb", "rgba"].includes(material.sheen.colorMap.channel)))
    context.addIssue({ code: "custom", path: ["sheen", "colorMap"], message: "Sheen color maps must use sRGB rgb or rgba semantics." });
  if (material.anisotropy?.map !== undefined && material.anisotropy.map.channel !== "rgb")
    context.addIssue({ code: "custom", path: ["anisotropy", "map", "channel"], message: "Anisotropy maps must use RGB direction-and-strength semantics." });
  if (material.normalScale !== undefined && material.normalMap === undefined)
    context.addIssue({ code: "custom", message: "normalScale requires a normalMap." });
  if (material.heightScale !== undefined !== (material.heightMap !== undefined))
    context.addIssue({ code: "custom", message: "heightScale and heightMap must be declared together." });
  if (material.clearcoat?.normalScale !== undefined && material.clearcoat.normalMap === undefined)
    context.addIssue({ code: "custom", message: "Clearcoat normalScale requires a clearcoat normalMap." });
  if (material.aoMapIntensity !== undefined && material.aoMap === undefined && material.ormMap === undefined)
    context.addIssue({ code: "custom", message: "aoMapIntensity requires an AO or ORM map." });
  if (material.alphaCutoff !== undefined && material.alphaMode !== "MASK") {
    context.addIssue({ code: "custom", message: "alphaCutoff is only applicable to MASK alpha mode." });
  }
});
function pbrMaterialMapAssetIds(material) {
  const ids = new Set;
  const collect = (map) => {
    if (map !== null && typeof map === "object" && map !== undefined && "assetId" in map && typeof map.assetId === "string")
      ids.add(map.assetId);
  };
  const m = material;
  collect(m.baseColorMap);
  collect(m.normalMap);
  collect(m.ormMap);
  collect(m.roughnessMap);
  collect(m.metalnessMap);
  collect(m.aoMap);
  collect(m.heightMap);
  collect(m.emissive?.map);
  collect(m.clearcoat?.map);
  collect(m.clearcoat?.roughnessMap);
  collect(m.clearcoat?.normalMap);
  collect(m.transmission?.map);
  collect(m.sheen?.colorMap);
  collect(m.sheen?.roughnessMap);
  collect(m.anisotropy?.map);
  return Object.freeze([...ids]);
}
var SpatialDerivationMethodSchema = z.enum([
  "sobel-normal-from-height",
  "average-luminance-roughness",
  "luminance-height"
]);
var SpatialDerivationCandidateSchema = z.strictObject({
  method: SpatialDerivationMethodSchema,
  sourceAssetId: assetId,
  outputChannel: SpatialMapChannelSchema,
  outputColorSpace: SpatialMapColorSpaceSchema,
  provenance: z.literal("derived-candidate"),
  description: z.string().min(1).max(1024)
});
function pbrDerivationCandidates(material) {
  const candidates = [];
  if (material.heightMap !== undefined && material.normalMap === undefined) {
    candidates.push({
      method: "sobel-normal-from-height",
      sourceAssetId: material.heightMap.assetId,
      outputChannel: "xy-normal",
      outputColorSpace: "linear",
      provenance: "derived-candidate",
      description: "Sobel-filter tangent-space normal derived from the authored height map. Does not equal a surface scan."
    });
  }
  if (material.baseColorMap !== undefined && material.roughnessMap === undefined && material.ormMap === undefined) {
    candidates.push({
      method: "average-luminance-roughness",
      sourceAssetId: material.baseColorMap.assetId,
      outputChannel: "r",
      outputColorSpace: "linear",
      provenance: "derived-candidate",
      description: "Inverted luminance roughness derived from the base-color map. A heuristic approximation, not a measured surface."
    });
  }
  if (material.baseColorMap !== undefined && material.heightMap === undefined) {
    candidates.push({
      method: "luminance-height",
      sourceAssetId: material.baseColorMap.assetId,
      outputChannel: "r",
      outputColorSpace: "linear",
      provenance: "derived-candidate",
      description: "Luminance-based height derived from the base-color map. A visual approximation, not a measured displacement."
    });
  }
  return deepFreezeJson(candidates);
}
var SpatialFogSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("linear"),
    color,
    near: positiveFinite,
    far: positiveFinite
  }).refine((fog) => fog.far > fog.near, "Fog far must exceed near."),
  z.strictObject({
    kind: z.literal("height"),
    color,
    density: z.number().finite().min(0).max(100),
    heightFalloff: z.number().finite().min(0).max(100),
    baseHeight: finiteCoordinate
  })
]);
var SpatialLightingRigTypeSchema = z.enum([
  "portrait",
  "product",
  "moonlight",
  "golden-hour",
  "neon-noir",
  "interior-window",
  "volumetric-stage"
]);
var IDENTITY_ROTATION = [0, 0, 0, 1];
function localMinusZTowardOrigin(position) {
  const length = Math.hypot(...position);
  if (length === 0)
    return IDENTITY_ROTATION;
  const to = [-position[0] / length, -position[1] / length, -position[2] / length];
  const dot = -to[2];
  if (dot < -0.999999)
    return [0, 1, 0, 0];
  const scale = Math.sqrt(2 * (1 + dot));
  return [to[1] / scale, -to[0] / scale, 0, scale / 2];
}
function rigEntity(light) {
  const rotation = light.light === "ambient" || light.light === "point" ? light.rotation : localMinusZTowardOrigin(light.position);
  return {
    entityId: light.entityId,
    kind: "light",
    name: light.name,
    parentId: null,
    transform: { position: light.position, rotation, scale: [1, 1, 1] },
    placement: { kind: "world" },
    origin: { kind: "authored" },
    visible: true,
    light: light.light,
    color: light.color,
    intensity: light.intensity,
    ...light.spot === undefined ? {} : { spot: light.spot },
    ...light.shadow === undefined ? {} : { shadow: light.shadow }
  };
}
var RIGS = {
  portrait: {
    description: "Classic three-point portrait: warm key at 45\xB0, cool fill opposite, rim backlight. Soft ambient fill.",
    lights: [
      { entityId: "entity_rig_key", name: "Key", light: "directional", color: "#fff5e6", intensity: 3.2, position: [3, 4, 3], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_fill", name: "Fill", light: "directional", color: "#ccd8ff", intensity: 1.2, position: [-3, 2, 3], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_rim", name: "Rim", light: "directional", color: "#ffffff", intensity: 2, position: [0, 3, -4], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#e8ecf0", intensity: 0.4, position: [0, 0, 0], rotation: IDENTITY_ROTATION }
    ]
  },
  product: {
    description: "Even product lighting: overhead softbox, two symmetric side fills, warm ambient. Minimal shadows for clean presentation.",
    lights: [
      { entityId: "entity_rig_top", name: "Top", light: "directional", color: "#ffffff", intensity: 3, position: [0, 5, 0], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_left", name: "Left fill", light: "directional", color: "#f5f5ff", intensity: 1.5, position: [-4, 2, 3], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_right", name: "Right fill", light: "directional", color: "#f5f5ff", intensity: 1.5, position: [4, 2, 3], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#f0ece8", intensity: 0.8, position: [0, 0, 0], rotation: IDENTITY_ROTATION }
    ]
  },
  moonlight: {
    description: "Cool blue directional moonlight with deep ambient. High contrast, strong shadows.",
    lights: [
      { entityId: "entity_rig_moon", name: "Moon", light: "directional", color: "#b4c8e8", intensity: 2, position: [-2, 8, -3], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#1a2040", intensity: 0.15, position: [0, 0, 0], rotation: IDENTITY_ROTATION }
    ]
  },
  "golden-hour": {
    description: "Warm low-angle sunlight with long shadows. Complementary cool sky ambient.",
    lights: [
      { entityId: "entity_rig_sun", name: "Sun", light: "directional", color: "#ffb347", intensity: 4, position: [6, 1.5, 3], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_sky", name: "Sky ambient", light: "ambient", color: "#8cb4d8", intensity: 0.5, position: [0, 0, 0], rotation: IDENTITY_ROTATION }
    ]
  },
  "neon-noir": {
    description: "High-contrast colored point lights simulating neon signage. Deep shadows, no ambient fill.",
    lights: [
      { entityId: "entity_rig_neon_pink", name: "Neon pink", light: "point", color: "#ff1493", intensity: 8, position: [-3, 2, 1], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_neon_cyan", name: "Neon cyan", light: "point", color: "#00e5ff", intensity: 6, position: [3, 1, -2], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_neon_accent", name: "Neon accent", light: "point", color: "#7b68ee", intensity: 4, position: [0, 4, 0], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#0a0a14", intensity: 0.05, position: [0, 0, 0], rotation: IDENTITY_ROTATION }
    ]
  },
  "interior-window": {
    description: "Daylight from a single window direction. Warm interior ambient fill, exterior-facing key.",
    lights: [
      { entityId: "entity_rig_window", name: "Window", light: "directional", color: "#e8f0ff", intensity: 3.5, position: [5, 3, 0], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_bounce", name: "Bounce", light: "directional", color: "#fff0e0", intensity: 0.8, position: [-3, 1, 2], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#f5e8d8", intensity: 0.35, position: [0, 0, 0], rotation: IDENTITY_ROTATION }
    ]
  },
  "volumetric-stage": {
    description: "Theatrical spot lights with tight cones and visible falloff. Low ambient for dramatic effect.",
    lights: [
      { entityId: "entity_rig_spot_center", name: "Center spot", light: "spot", color: "#ffffff", intensity: 12, position: [0, 6, 0], rotation: IDENTITY_ROTATION, spot: { angle: 0.5, penumbra: 0.6, distance: 20, decay: 2 }, shadow: true },
      { entityId: "entity_rig_spot_left", name: "Left spot", light: "spot", color: "#ffccaa", intensity: 8, position: [-4, 5, 2], rotation: IDENTITY_ROTATION, spot: { angle: 0.4, penumbra: 0.5, distance: 15, decay: 2 } },
      { entityId: "entity_rig_spot_right", name: "Right spot", light: "spot", color: "#aaccff", intensity: 8, position: [4, 5, 2], rotation: IDENTITY_ROTATION, spot: { angle: 0.4, penumbra: 0.5, distance: 15, decay: 2 } },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#1a1a2e", intensity: 0.08, position: [0, 0, 0], rotation: IDENTITY_ROTATION }
    ]
  }
};
function lightingRig(type) {
  const rig = RIGS[type];
  return deepFreezeJson({ description: rig.description, entities: rig.lights.map(rigEntity) });
}
function lightingRigDescription(type) {
  return RIGS[type].description;
}
var SpatialProbeGeometrySchema = z.enum(["plane", "sphere", "hero"]);
var DEFAULT_PROBE_GEOMETRIES = Object.freeze(["plane", "sphere", "hero"]);
var DEFAULT_PROBE_RIGS = Object.freeze(["product", "golden-hour", "moonlight"]);
var ORIGINAL_MATERIAL_HERO_FIXTURE = deepFreezeJson({ assetId: "asset_material_hero_original", manifestSha256: sha256Hex("slopcamera-original-material-hero-v1"), bounds: { min: [-0.8, -1, -0.55], max: [0.8, 1, 0.55] } });
var DEFAULT_CAMERA_DISTANCES = Object.freeze([3, 6]);
function planMaterialProbeGallery(input) {
  const material = SpatialPbrMaterialSchema.parse(input.material);
  const geometries = input.geometries ?? DEFAULT_PROBE_GEOMETRIES;
  const rigs = input.lightingRigs ?? DEFAULT_PROBE_RIGS;
  const distances = input.cameraDistances ?? DEFAULT_CAMERA_DISTANCES;
  const heroAsset = input.heroAsset ?? ORIGINAL_MATERIAL_HERO_FIXTURE;
  for (const geometry of geometries)
    SpatialProbeGeometrySchema.parse(geometry);
  for (const rig of rigs)
    SpatialLightingRigTypeSchema.parse(rig);
  for (const distance of distances) {
    if (!Number.isFinite(distance) || distance <= 0 || distance > 1e6) {
      throw new RangeError("Camera distances must be positive finite values.");
    }
  }
  if (geometries.length < 1 || rigs.length < 1 || distances.length < 1 || geometries.length * rigs.length * distances.length > 64)
    throw new RangeError("Material probe gallery requires 1\u201364 bounded cells.");
  if (geometries.includes("hero")) {
    if (!/^[a-f0-9]{64}$/u.test(heroAsset.manifestSha256))
      throw new RangeError("Hero probe geometry requires an exact hero asset manifest binding.");
    for (let axis = 0;axis < 3; axis++)
      if (!Number.isFinite(heroAsset.bounds.min[axis]) || !Number.isFinite(heroAsset.bounds.max[axis]) || heroAsset.bounds.min[axis] > heroAsset.bounds.max[axis])
        throw new RangeError("Hero probe geometry requires finite ordered bounds.");
  }
  const extensions = [];
  if (material.clearcoat !== undefined)
    extensions.push("clearcoat");
  if (material.transmission !== undefined)
    extensions.push("transmission");
  if (material.sheen !== undefined)
    extensions.push("sheen");
  if (material.anisotropy !== undefined)
    extensions.push("anisotropy");
  const extensionNote = extensions.length > 0 ? ` Extensions: ${extensions.join(", ")}.` : "";
  const mapCount = pbrMaterialMapAssetIds(material).length;
  const description = `Probe gallery: ${geometries.length} geometr${geometries.length === 1 ? "y" : "ies"} \xD7 ${rigs.length} rig${rigs.length === 1 ? "" : "s"} \xD7 ${distances.length} distance${distances.length === 1 ? "" : "s"} = ${geometries.length * rigs.length * distances.length} probe${geometries.length * rigs.length * distances.length === 1 ? "" : "s"}. ${mapCount} texture map${mapCount === 1 ? "" : "s"} bound.${extensionNote}`;
  const materialSha256 = sha256Hex(canonicalJson({ domain: "slopcamera.spatial-material/v1", material }));
  const cells = geometries.flatMap((geometry) => rigs.flatMap((lightingRig2) => distances.map((cameraDistance) => ({ cellId: sha256Hex(canonicalJson({ domain: "slopcamera.spatial-material-probe-cell/v1", materialSha256, geometry, lightingRig: lightingRig2, cameraDistance, ...geometry === "hero" ? { heroAsset } : {} })), geometry, lightingRig: lightingRig2, cameraDistance }))));
  const body = { kind: "slopcamera.spatial-material-probe-gallery", schemaVersion: 1, materialSha256, material, ...geometries.includes("hero") ? { heroAsset } : {}, geometries: [...geometries], lightingRigs: [...rigs], cameraDistances: [...distances], cells, description };
  return deepFreezeJson({ ...body, gallerySha256: sha256Hex(canonicalJson({ domain: "slopcamera.spatial-material-probe-gallery/v1", body })) });
}
function validatePbrMaterial(material, assetLookup, pixelBudget = 67108864) {
  const errors = [];
  let totalPixels = 0;
  let expectedDimensions;
  const countedAssets = new Set;
  const validateMap = (map, label) => {
    if (map === undefined)
      return;
    const asset = assetLookup.get(map.assetId);
    if (asset === undefined) {
      errors.push(`${label}: references missing asset ${map.assetId}.`);
      return;
    }
    if (asset.kind !== "image") {
      errors.push(`${label}: asset ${map.assetId} is ${asset.kind}, not an image.`);
      return;
    }
    if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < 1 || asset.height < 1) {
      errors.push(`${label}: asset ${map.assetId} has invalid decoded dimensions.`);
      return;
    }
    if (expectedDimensions !== undefined && (asset.width !== expectedDimensions[0] || asset.height !== expectedDimensions[1]))
      errors.push(`${label}: decoded dimensions do not match the other PBR maps.`);
    expectedDimensions ??= [asset.width, asset.height];
    if (!countedAssets.has(map.assetId)) {
      countedAssets.add(map.assetId);
      totalPixels += asset.width * asset.height;
      if (totalPixels > pixelBudget)
        errors.push(`${label}: total decoded pixels (${totalPixels}) exceed budget (${pixelBudget}).`);
    }
  };
  validateMap(material.baseColorMap, "baseColorMap");
  validateMap(material.normalMap, "normalMap");
  validateMap(material.ormMap, "ormMap");
  validateMap(material.roughnessMap, "roughnessMap");
  validateMap(material.metalnessMap, "metalnessMap");
  validateMap(material.aoMap, "aoMap");
  validateMap(material.heightMap, "heightMap");
  validateMap(material.emissive?.map, "emissive.map");
  validateMap(material.clearcoat?.map, "clearcoat.map");
  validateMap(material.clearcoat?.roughnessMap, "clearcoat.roughnessMap");
  validateMap(material.clearcoat?.normalMap, "clearcoat.normalMap");
  validateMap(material.transmission?.map, "transmission.map");
  validateMap(material.sheen?.colorMap, "sheen.colorMap");
  validateMap(material.sheen?.roughnessMap, "sheen.roughnessMap");
  validateMap(material.anisotropy?.map, "anisotropy.map");
  return deepFreezeJson({ valid: errors.length === 0, errors });
}

// src/spatial-scene/contracts.ts
import { z as z2 } from "zod";
var SPATIAL_SCENE_LIMITS = Object.freeze({
  sourceBytes: 2097152,
  sourceDepth: 32,
  sourceValues: 200000,
  entities: 4096,
  assets: 128,
  cameras: 64,
  channels: 4096,
  keysPerChannel: 4096,
  durationUs: 3600000000,
  patchOperations: 256
});
var SpatialDigestSchema = z2.string().regex(/^[a-f0-9]{64}$/u);
var stableId = (prefix) => z2.string().min(prefix.length + 1).max(128).regex(new RegExp(`^${prefix}[a-zA-Z0-9][a-zA-Z0-9_-]*$`, "u"));
var SpatialSceneIdSchema = stableId("scene_");
var SpatialEntityIdSchema = stableId("entity_");
var SpatialCameraIdSchema = stableId("camera_");
var SpatialAssetIdSchema = stableId("asset_");
var SpatialGeneratorIdSchema = stableId("generator_");
var SpatialChannelIdSchema = stableId("channel_");
var SpatialShotIdSchema = stableId("shot_");
var finiteCoordinate2 = z2.number().finite().min(-1e6).max(1e6);
var positiveDimension = z2.number().finite().min(0.000001).max(1e6);
var unit2 = z2.number().finite().min(0).max(1);
var SpatialTimeUsSchema = z2.number().int().safe().min(0).max(SPATIAL_SCENE_LIMITS.durationUs);
var SpatialVec3Schema = z2.tuple([finiteCoordinate2, finiteCoordinate2, finiteCoordinate2]);
var SpatialQuaternionSchema = z2.tuple([
  z2.number().finite().min(-1).max(1),
  z2.number().finite().min(-1).max(1),
  z2.number().finite().min(-1).max(1),
  z2.number().finite().min(-1).max(1)
]).refine((value) => Math.abs(value.reduce((sum, part) => sum + part * part, 0) - 1) <= 0.000001, "Rotation must be a unit quaternion in XYZW order.");
var SpatialTransformSchema = z2.strictObject({
  position: SpatialVec3Schema,
  rotation: SpatialQuaternionSchema,
  scale: z2.tuple([positiveDimension, positiveDimension, positiveDimension])
});
var SpatialPoseSchema = z2.strictObject({
  position: SpatialVec3Schema,
  rotation: SpatialQuaternionSchema
});
var SpatialFrameRateSchema = z2.strictObject({
  numerator: z2.number().int().safe().min(1).max(1e6),
  denominator: z2.number().int().safe().min(1).max(1e6)
}).refine((rate) => rate.numerator / rate.denominator <= 1000, "Frame rate exceeds 1,000 fps.");
var dimensions = {
  width: z2.number().int().min(1).max(16384),
  height: z2.number().int().min(1).max(16384)
};
var clipping = { near: positiveDimension, far: positiveDimension };
var SpatialProjectionSchema = z2.discriminatedUnion("kind", [
  z2.strictObject({
    kind: z2.literal("perspective"),
    ...dimensions,
    ...clipping,
    fx: positiveDimension,
    fy: positiveDimension,
    cx: finiteCoordinate2,
    cy: finiteCoordinate2
  }),
  z2.strictObject({
    kind: z2.literal("orthographic"),
    ...dimensions,
    ...clipping,
    left: finiteCoordinate2,
    right: finiteCoordinate2,
    top: finiteCoordinate2,
    bottom: finiteCoordinate2
  })
]).superRefine((projection, context) => {
  if (projection.far <= projection.near)
    context.addIssue({ code: "custom", message: "Far clipping must exceed near clipping." });
  if (projection.width * projection.height > 33554432)
    context.addIssue({ code: "custom", message: "Camera exceeds the 32-megapixel limit." });
  if (projection.kind === "orthographic" && (projection.right <= projection.left || projection.top <= projection.bottom)) {
    context.addIssue({ code: "custom", message: "Orthographic extents must have positive width and height." });
  }
});
var boundedPhysical = (minimum, maximum) => z2.number().finite().min(minimum).max(maximum);
var SpatialCameraLensSchema = z2.strictObject({
  focalLengthMm: boundedPhysical(1, 2000),
  sensorWidthMm: boundedPhysical(1, 200),
  apertureFStop: boundedPhysical(0.5, 128).optional(),
  focusDistanceM: boundedPhysical(0.001, 1e6).optional(),
  shutterAngleDeg: boundedPhysical(0, 360).optional(),
  exposureEv: boundedPhysical(-32, 32).optional(),
  colorTemperatureK: boundedPhysical(1000, 40000).optional()
});
var SpatialCameraSchema = z2.strictObject({
  cameraId: SpatialCameraIdSchema,
  name: z2.string().min(1).max(256),
  pose: SpatialPoseSchema,
  projection: SpatialProjectionSchema,
  lens: SpatialCameraLensSchema.optional()
});
var relativePath = z2.string().min(1).max(1024).refine((value) => !value.startsWith("/") && !/[\\\u0000-\u001f]/u.test(value) && !/^[a-zA-Z]:/u.test(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== ".."), "Asset paths must be contained root-relative paths.");
var SpatialPayloadSchema = z2.strictObject({
  path: relativePath,
  sha256: SpatialDigestSchema,
  bytes: z2.number().int().safe().min(1).max(134217728)
});
var imageInterpretation = {
  ...dimensions,
  colorSpace: z2.literal("srgb"),
  alpha: z2.enum(["straight", "opaque"])
};
var SpatialAssetInterpretationSchema = z2.discriminatedUnion("kind", [
  z2.strictObject({ kind: z2.literal("image"), ...imageInterpretation, mimeType: z2.enum(["image/png", "image/jpeg", "image/svg+xml"]) }),
  z2.strictObject({ kind: z2.literal("video"), ...imageInterpretation, durationUs: SpatialTimeUsSchema.refine((value) => value > 0), frameRate: SpatialFrameRateSchema }),
  z2.strictObject({ kind: z2.literal("diagram"), schemaVersion: z2.literal(1), theme: z2.enum(["light", "dark"]) }),
  z2.strictObject({ kind: z2.literal("gltf"), format: z2.enum(["glb", "gltf"]), metersPerUnit: positiveDimension, sourceUp: z2.enum(["x", "y", "z"]) }),
  z2.strictObject({ kind: z2.literal("font"), format: z2.enum(["otf", "woff2"]), family: z2.string().min(1).max(128) }),
  z2.strictObject({ kind: z2.literal("splat"), format: z2.enum(["spz", "ply"]), metersPerUnit: positiveDimension, sourceUp: z2.enum(["x", "y", "z"]) }),
  z2.strictObject({ kind: z2.literal("metadata"), format: z2.literal("json"), schema: z2.enum(["slopcamera.spatial-world-import", "slopcamera.world-labs-provenance", "slopcamera.spatial-asset-facts", "slopcamera.provider-metadata"]) })
]);
var SpatialAssetManifestSchema = z2.strictObject({
  assetId: SpatialAssetIdSchema,
  payload: SpatialPayloadSchema,
  interpretation: SpatialAssetInterpretationSchema,
  dependencies: z2.array(SpatialAssetIdSchema).max(SPATIAL_SCENE_LIMITS.assets),
  provenance: z2.strictObject({
    source: z2.enum(["authored", "imported", "generated", "derived"]),
    description: z2.string().min(1).max(2048),
    receiptSha256: SpatialDigestSchema.optional()
  })
});
var color2 = z2.string().regex(/^#[a-fA-F0-9]{6}$/u);
var SpatialEmissiveSchema = z2.strictObject({
  color: color2,
  intensity: z2.number().finite().min(0).max(1e5)
});
var SpatialMaterialSchema = z2.discriminatedUnion("kind", [
  z2.strictObject({ kind: z2.literal("unlit"), color: color2, opacity: unit2, map: SpatialAssetIdSchema.optional() }),
  z2.strictObject({ kind: z2.literal("standard"), color: color2, opacity: unit2, roughness: unit2, metalness: unit2, map: SpatialAssetIdSchema.optional(), emissive: SpatialEmissiveSchema.optional() }),
  SpatialPbrMaterialSchema
]);
var SpatialGeometrySchema = z2.discriminatedUnion("kind", [
  z2.strictObject({ kind: z2.literal("box"), size: z2.tuple([positiveDimension, positiveDimension, positiveDimension]) }),
  z2.strictObject({ kind: z2.literal("sphere"), radius: positiveDimension }),
  z2.strictObject({ kind: z2.literal("plane"), width: positiveDimension, height: positiveDimension }),
  z2.strictObject({ kind: z2.literal("cylinder"), radius: positiveDimension, height: positiveDimension }),
  z2.strictObject({
    kind: z2.literal("asset"),
    assetId: SpatialAssetIdSchema,
    nodeIndex: z2.number().int().min(0).max(65535).optional(),
    materialMode: z2.enum(["entity", "source"]).optional(),
    clip: z2.strictObject({ index: z2.number().int().min(0).max(255), offsetUs: SpatialTimeUsSchema, playback: z2.enum(["once", "loop", "freeze"]) }).optional(),
    morphWeights: z2.array(unit2).max(16).optional()
  })
]);
var SpatialSpotLightSchema = z2.strictObject({
  angle: z2.number().finite().min(0.000001).max(Math.PI / 2),
  penumbra: unit2,
  distance: z2.number().finite().min(0).max(1e6).optional(),
  decay: z2.number().finite().min(0).max(1000).optional()
});
var SpatialOriginSchema = z2.discriminatedUnion("kind", [
  z2.strictObject({ kind: z2.literal("authored") }),
  z2.strictObject({ kind: z2.literal("generated"), generatorId: SpatialGeneratorIdSchema, key: z2.string().min(1).max(256) })
]);
var SpatialPlacementSchema = z2.discriminatedUnion("kind", [
  z2.strictObject({ kind: z2.literal("world") }),
  z2.strictObject({ kind: z2.literal("view"), cameraId: SpatialCameraIdSchema, units: z2.enum(["pixels", "normalized"]), order: z2.number().int().min(-4096).max(4096) })
]);
var entityBase = {
  entityId: SpatialEntityIdSchema,
  name: z2.string().min(1).max(256),
  parentId: SpatialEntityIdSchema.nullable(),
  transform: SpatialTransformSchema,
  placement: SpatialPlacementSchema,
  origin: SpatialOriginSchema,
  visible: z2.boolean()
};
var surfaceBase = {
  assetId: SpatialAssetIdSchema,
  width: positiveDimension,
  height: positiveDimension,
  fit: z2.enum(["contain", "cover", "stretch"]),
  opacity: unit2
};
var SpatialEntitySchema = z2.discriminatedUnion("kind", [
  z2.strictObject({ ...entityBase, kind: z2.literal("group") }),
  z2.strictObject({
    ...entityBase,
    kind: z2.literal("mesh"),
    geometry: SpatialGeometrySchema,
    material: SpatialMaterialSchema,
    castShadow: z2.boolean().optional(),
    receiveShadow: z2.boolean().optional(),
    instances: z2.array(SpatialTransformSchema).min(1).max(SPATIAL_SCENE_LIMITS.entities).optional()
  }),
  z2.strictObject({ ...entityBase, ...surfaceBase, kind: z2.literal("image") }),
  z2.strictObject({ ...entityBase, ...surfaceBase, kind: z2.literal("diagram") }),
  z2.strictObject({ ...entityBase, ...surfaceBase, kind: z2.literal("video"), sourceOffsetUs: SpatialTimeUsSchema, playback: z2.enum(["once", "loop", "freeze"]) }),
  z2.strictObject({ ...entityBase, kind: z2.literal("text"), text: z2.string().max(16384), fontAssetId: SpatialAssetIdSchema, fontSize: positiveDimension, width: positiveDimension, color: color2, align: z2.enum(["left", "center", "right"]) }),
  z2.strictObject({
    ...entityBase,
    kind: z2.literal("light"),
    light: z2.enum(["ambient", "directional", "point", "spot"]),
    color: color2,
    intensity: z2.number().finite().min(0).max(1e5),
    spot: SpatialSpotLightSchema.optional(),
    shadow: z2.boolean().optional()
  }),
  z2.strictObject({ ...entityBase, kind: z2.literal("splat"), assetId: SpatialAssetIdSchema }),
  z2.strictObject({
    ...entityBase,
    kind: z2.literal("environment"),
    assetId: SpatialAssetIdSchema,
    role: z2.enum(["background", "environment", "both"]),
    intensity: z2.number().finite().min(0).max(16)
  })
]).superRefine((entity, context) => {
  if (entity.kind !== "light")
    return;
  if (entity.light === "spot" && entity.spot === undefined)
    context.addIssue({ code: "custom", path: ["spot"], message: "Spot lights require their spot cone parameters." });
  if (entity.light !== "spot" && entity.spot !== undefined)
    context.addIssue({ code: "custom", path: ["spot"], message: "Only spot lights may carry spot cone parameters." });
  if (entity.light === "ambient" && entity.shadow !== undefined)
    context.addIssue({ code: "custom", path: ["shadow"], message: "Ambient lights cannot cast shadows; only directional, point, and spot lights may declare shadow." });
});
var key = (value) => z2.strictObject({ timeUs: SpatialTimeUsSchema, value });
var channelBase = { channelId: SpatialChannelIdSchema, targetId: z2.union([SpatialEntityIdSchema, SpatialCameraIdSchema]) };
var SpatialAnimationSchema = z2.discriminatedUnion("property", [
  z2.strictObject({ ...channelBase, property: z2.literal("position"), interpolation: z2.enum(["step", "linear"]), keys: z2.array(key(SpatialVec3Schema)).min(1).max(SPATIAL_SCENE_LIMITS.keysPerChannel) }),
  z2.strictObject({ ...channelBase, property: z2.literal("rotation"), interpolation: z2.enum(["step", "slerp"]), keys: z2.array(key(SpatialQuaternionSchema)).min(1).max(SPATIAL_SCENE_LIMITS.keysPerChannel) }),
  z2.strictObject({ ...channelBase, property: z2.literal("scale"), interpolation: z2.enum(["step", "linear"]), keys: z2.array(key(z2.tuple([positiveDimension, positiveDimension, positiveDimension]))).min(1).max(SPATIAL_SCENE_LIMITS.keysPerChannel) }),
  z2.strictObject({ ...channelBase, property: z2.literal("opacity"), interpolation: z2.enum(["step", "linear"]), keys: z2.array(key(unit2)).min(1).max(SPATIAL_SCENE_LIMITS.keysPerChannel) })
]);
var SpatialOverrideSchema = z2.discriminatedUnion("property", [
  z2.strictObject({ entityId: SpatialEntityIdSchema, property: z2.literal("color"), value: color2 }),
  z2.strictObject({ entityId: SpatialEntityIdSchema, property: z2.literal("opacity"), value: unit2 }),
  z2.strictObject({ entityId: SpatialEntityIdSchema, property: z2.literal("transform"), value: SpatialTransformSchema })
]);
var SpatialGeneratorSchema = z2.strictObject({
  generatorId: SpatialGeneratorIdSchema,
  sourceSha256: SpatialDigestSchema,
  closureSha256: SpatialDigestSchema,
  parametersSha256: SpatialDigestSchema,
  seed: z2.number().int().safe().min(0).max(4294967295),
  outputSha256: SpatialDigestSchema,
  execution: z2.discriminatedUnion("kind", [
    z2.strictObject({ kind: z2.literal("qualified"), runtimeSha256: SpatialDigestSchema }),
    z2.strictObject({ kind: z2.literal("attempt"), attemptId: z2.string().min(1).max(128), runtimeSha256: SpatialDigestSchema })
  ]),
  editableKeys: z2.array(z2.strictObject({ key: z2.string().min(1).max(256), properties: z2.array(z2.enum(["color", "opacity", "transform"])).min(1).max(3) })).max(SPATIAL_SCENE_LIMITS.entities)
});
var SpatialSceneV1Schema = z2.strictObject({
  kind: z2.literal("slopcamera.spatial-scene"),
  schemaVersion: z2.literal(1),
  sceneId: SpatialSceneIdSchema,
  coordinates: z2.literal("right-handed-y-up-meters"),
  durationUs: SpatialTimeUsSchema.refine((value) => value > 0),
  entities: z2.array(SpatialEntitySchema).max(SPATIAL_SCENE_LIMITS.entities),
  cameras: z2.array(SpatialCameraSchema).min(1).max(SPATIAL_SCENE_LIMITS.cameras),
  assets: z2.array(SpatialAssetManifestSchema).max(SPATIAL_SCENE_LIMITS.assets),
  animations: z2.array(SpatialAnimationSchema).max(SPATIAL_SCENE_LIMITS.channels),
  generators: z2.array(SpatialGeneratorSchema).max(128),
  overrides: z2.array(SpatialOverrideSchema).max(SPATIAL_SCENE_LIMITS.entities),
  fog: SpatialFogSchema.optional()
});
var SpatialPatchOperationSchema = z2.discriminatedUnion("kind", [
  z2.strictObject({ kind: z2.literal("add-asset"), asset: SpatialAssetManifestSchema }),
  z2.strictObject({ kind: z2.literal("replace-asset"), asset: SpatialAssetManifestSchema }),
  z2.strictObject({ kind: z2.literal("set-mesh-geometry"), entityId: SpatialEntityIdSchema, geometry: SpatialGeometrySchema }),
  z2.strictObject({ kind: z2.literal("set-material"), entityId: SpatialEntityIdSchema, material: SpatialMaterialSchema }),
  z2.strictObject({ kind: z2.literal("rename-entity"), entityId: SpatialEntityIdSchema, name: z2.string().min(1).max(256) }),
  z2.strictObject({ kind: z2.literal("reparent-entity"), entityId: SpatialEntityIdSchema, parentId: SpatialEntityIdSchema.nullable() }),
  z2.strictObject({ kind: z2.literal("set-transform"), entityId: SpatialEntityIdSchema, transform: SpatialTransformSchema }),
  z2.strictObject({ kind: z2.literal("set-color"), entityId: SpatialEntityIdSchema, color: color2 }),
  z2.strictObject({ kind: z2.literal("set-opacity"), entityId: SpatialEntityIdSchema, opacity: unit2 }),
  z2.strictObject({ kind: z2.literal("set-emissive"), entityId: SpatialEntityIdSchema, emissive: SpatialEmissiveSchema.nullable() }),
  z2.strictObject({ kind: z2.literal("set-spot"), entityId: SpatialEntityIdSchema, spot: SpatialSpotLightSchema }),
  z2.strictObject({ kind: z2.literal("set-instances"), entityId: SpatialEntityIdSchema, instances: z2.array(SpatialTransformSchema).min(1).max(SPATIAL_SCENE_LIMITS.entities).nullable() }),
  z2.strictObject({ kind: z2.literal("set-mesh-shadow"), entityId: SpatialEntityIdSchema, castShadow: z2.boolean().nullable(), receiveShadow: z2.boolean().nullable() }),
  z2.strictObject({ kind: z2.literal("set-light-shadow"), entityId: SpatialEntityIdSchema, shadow: z2.boolean().nullable() }),
  z2.strictObject({ kind: z2.literal("set-camera"), camera: SpatialCameraSchema }),
  z2.strictObject({ kind: z2.literal("set-channel"), channel: SpatialAnimationSchema }),
  z2.strictObject({ kind: z2.literal("remove-channel"), channelId: SpatialChannelIdSchema }),
  z2.strictObject({ kind: z2.literal("add-entity"), entity: SpatialEntitySchema }),
  z2.strictObject({ kind: z2.literal("remove-entity"), entityId: SpatialEntityIdSchema }),
  z2.strictObject({ kind: z2.literal("set-override"), override: SpatialOverrideSchema }),
  z2.strictObject({ kind: z2.literal("remove-override"), entityId: SpatialEntityIdSchema, property: z2.enum(["color", "opacity", "transform"]) }),
  z2.strictObject({ kind: z2.literal("replace-generator-output"), generator: SpatialGeneratorSchema, entities: z2.array(SpatialEntitySchema).max(SPATIAL_SCENE_LIMITS.entities) })
]);
var SpatialScenePatchV1Schema = z2.strictObject({
  kind: z2.literal("slopcamera.spatial-scene-patch"),
  schemaVersion: z2.literal(1),
  expectedSceneSha256: SpatialDigestSchema,
  operations: z2.array(SpatialPatchOperationSchema).min(1).max(SPATIAL_SCENE_LIMITS.patchOperations)
});
var SpatialShotV1Schema = z2.strictObject({
  shotId: SpatialShotIdSchema,
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  range: z2.strictObject({ startUs: SpatialTimeUsSchema, endUs: SpatialTimeUsSchema }),
  sceneStartUs: SpatialTimeUsSchema,
  playback: z2.enum(["once", "loop", "freeze"]),
  overrides: z2.array(SpatialOverrideSchema).max(SPATIAL_SCENE_LIMITS.entities),
  cameraPoseOverride: SpatialPoseSchema.optional()
}).refine((shot) => shot.range.endUs > shot.range.startUs, "Shot range must be nonempty and half-open.");
var matrixNumber = z2.number().finite().min(-1000000000000).max(1000000000000);
var SpatialMatrixSchema = z2.tuple([
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber
]);
var EvaluatedSpatialSceneSchema = z2.strictObject({
  kind: z2.literal("slopcamera.spatial-snapshot"),
  schemaVersion: z2.literal(1),
  sceneSha256: SpatialDigestSchema,
  stateSha256: SpatialDigestSchema,
  viewSha256: SpatialDigestSchema,
  timeUs: SpatialTimeUsSchema,
  camera: SpatialCameraSchema,
  entities: z2.array(z2.strictObject({
    entity: SpatialEntitySchema,
    worldMatrix: SpatialMatrixSchema,
    visible: z2.boolean(),
    selectionId: z2.number().int().min(1).max(SPATIAL_SCENE_LIMITS.entities)
  })).max(SPATIAL_SCENE_LIMITS.entities),
  assets: z2.array(SpatialAssetManifestSchema).max(SPATIAL_SCENE_LIMITS.assets),
  fog: SpatialFogSchema.optional()
});

// src/spatial-scene/identity.ts
class SpatialSceneError extends SlopcameraCodeError {
  path;
  constructor(code, message, path = "scene") {
    super(code, message, { path });
    this.name = "SpatialSceneError";
    this.path = path;
  }
}
var limits = { maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth, maximumValues: SPATIAL_SCENE_LIMITS.sourceValues };
function parseSpatialValue(schema, input, name) {
  try {
    const captured = createBoundedJsonValueSnapshot(input, SPATIAL_SCENE_LIMITS.sourceBytes, name, limits);
    const parsed = schema.safeParse(captured.value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new SpatialSceneError("invalid-data", issue?.message ?? `Invalid ${name}.`, `${name}.${issue?.path.join(".") ?? ""}`);
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof SpatialSceneError)
      throw error;
    throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : `Invalid ${name}.`, name);
  }
}
function spatialValueSha256(input) {
  return createBoundedJsonSnapshot(input, SPATIAL_SCENE_LIMITS.sourceBytes, "spatial identity", limits).sha256;
}
function spatialStateValueSha256(input) {
  return createBoundedJsonSnapshot(input, SPATIAL_SCENE_LIMITS.sourceBytes * 4, "spatial state identity", {
    maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth + 4,
    maximumValues: SPATIAL_SCENE_LIMITS.sourceValues + SPATIAL_SCENE_LIMITS.entities * 24
  }).sha256;
}
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function sortSpatialBy(items, id) {
  return [...items].sort((a, b) => compare(id(a), id(b)));
}
function unique(items, id, path) {
  const result = new Map;
  for (const item of items) {
    const key2 = id(item);
    if (result.has(key2))
      throw new SpatialSceneError("invalid-data", `Duplicate identity ${key2}.`, path);
    result.set(key2, item);
  }
  return result;
}
function requireReference(map, id, path) {
  const result = map.get(id);
  if (result === undefined)
    throw new SpatialSceneError("invalid-data", `Missing reference ${id}.`, path);
  return result;
}
function spatialTopologicalIds(edges, name) {
  const done = new Set;
  const active = new Set;
  const result = [];
  for (const id of edges.keys()) {
    const pending = [{ id, exit: false }];
    while (pending.length) {
      const next = pending.pop();
      if (next.exit) {
        active.delete(next.id);
        done.add(next.id);
        result.push(next.id);
        continue;
      }
      if (done.has(next.id))
        continue;
      if (active.has(next.id))
        throw new SpatialSceneError("invalid-data", `Cycle at ${next.id}.`, name);
      const dependencies = requireReference(edges, next.id, name);
      active.add(next.id);
      pending.push({ id: next.id, exit: true });
      for (const dependency of dependencies)
        pending.push({ id: dependency, exit: false });
    }
  }
  return Object.freeze(result);
}
function generatedSpatialEntityId(generatorId, key2) {
  SpatialGeneratorIdSchema.parse(generatorId);
  if (typeof key2 !== "string" || key2.length < 1 || key2.length > 256)
    throw new SpatialSceneError("invalid-data", "Generator keys must contain 1\u2013256 characters.");
  return `entity_${spatialValueSha256({ domain: "slopcamera.generated-entity.v1", generatorId, key: key2 })}`;
}
function normalizeEntity(entity) {
  if (entity.kind === "mesh") {
    const material = entity.material;
    if (material.kind === "pbr") {
      const emissive2 = material.emissive !== undefined ? { ...material.emissive, color: material.emissive.color.toLowerCase() } : undefined;
      const sheen = material.sheen !== undefined ? { ...material.sheen, color: material.sheen.color.toLowerCase() } : undefined;
      return { ...entity, material: {
        ...material,
        color: material.color.toLowerCase(),
        ...emissive2 === undefined ? {} : { emissive: emissive2 },
        ...sheen === undefined ? {} : { sheen }
      } };
    }
    const emissive = material.kind === "standard" && material.emissive !== undefined ? { ...material.emissive, color: material.emissive.color.toLowerCase() } : undefined;
    return { ...entity, material: { ...material, color: material.color.toLowerCase(), ...emissive === undefined ? {} : { emissive } } };
  }
  if (entity.kind === "text" || entity.kind === "light")
    return { ...entity, color: entity.color.toLowerCase() };
  return entity;
}
function normalizeAsset(asset) {
  if (asset.interpretation.kind !== "video")
    return asset;
  const rate = asset.interpretation.frameRate;
  let { numerator: divisor, denominator: remainder } = rate;
  while (remainder !== 0) {
    const next = divisor % remainder;
    divisor = remainder;
    remainder = next;
  }
  return { ...asset, interpretation: { ...asset.interpretation, frameRate: { numerator: rate.numerator / divisor, denominator: rate.denominator / divisor } } };
}
function spatialGeneratorOutputSha256(input) {
  const entities = parseSpatialValue(SpatialEntitySchema.array().max(SPATIAL_SCENE_LIMITS.entities), input, "generator output");
  unique(entities, (item) => item.entityId, "generator output");
  return spatialValueSha256({ domain: "slopcamera.generator-output.v1", entities: sortSpatialBy(entities.map(normalizeEntity), (item) => item.entityId) });
}
function spatialAssetManifestSha256(input, dependencyDigests = {}) {
  const asset = normalizeAsset(parseSpatialValue(SpatialAssetManifestSchema, input, "asset manifest"));
  const captured = createBoundedJsonValueSnapshot(dependencyDigests, SPATIAL_SCENE_LIMITS.sourceBytes, "dependency identities", limits).value;
  if (captured === null || Array.isArray(captured) || typeof captured !== "object")
    throw new SpatialSceneError("invalid-data", "Dependency digests must be an object.");
  unique(asset.dependencies, (item) => item, "asset.dependencies");
  const dependencies = [...asset.dependencies].sort(compare).map((assetId2) => {
    const sha256 = captured[assetId2];
    if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(sha256))
      throw new SpatialSceneError("invalid-data", `Missing dependency digest for ${assetId2}.`);
    return { assetId: assetId2, sha256 };
  });
  return spatialValueSha256({ domain: "slopcamera.asset-manifest.v1", payload: { sha256: asset.payload.sha256, bytes: asset.payload.bytes }, interpretation: asset.interpretation, dependencies });
}
function spatialAssetClosureDigests(assets) {
  const map = unique(assets, (asset) => asset.assetId, "assets");
  const order = spatialTopologicalIds(new Map(assets.map((asset) => [asset.assetId, asset.dependencies])), "asset dependencies");
  const digests = Object.create(null);
  for (const id of order)
    digests[id] = spatialAssetManifestSha256(map.get(id), digests);
  return Object.freeze(digests);
}
function spatialPropertySupported(entity, property) {
  if ((property === "color" || property === "opacity") && entity.kind === "mesh" && entity.geometry.kind === "asset" && entity.geometry.materialMode === "source")
    return false;
  if (property === "opacity")
    return ["mesh", "image", "video", "diagram"].includes(entity.kind);
  if (property === "color")
    return ["mesh", "text", "light"].includes(entity.kind);
  return true;
}
function validateSpatialOverrides(scene, overrides) {
  const entities = new Map(scene.entities.map((entity) => [entity.entityId, entity]));
  const generators = new Map(scene.generators.map((generator) => [generator.generatorId, generator]));
  unique(overrides, (override) => `${override.entityId}:${override.property}`, "overrides");
  for (const override of overrides) {
    const entity = requireReference(entities, override.entityId, "overrides");
    if (!spatialPropertySupported(entity, override.property))
      throw new SpatialSceneError("conflict", `Entity ${entity.entityId} does not support ${override.property}.`, "overrides");
    if (entity.origin.kind === "generated") {
      const origin = entity.origin;
      const generator = requireReference(generators, origin.generatorId, "overrides");
      if (!generator.editableKeys.some((item) => item.key === origin.key && item.properties.includes(override.property))) {
        throw new SpatialSceneError("conflict", `Undeclared override ${origin.key}.${override.property}.`, "overrides");
      }
    }
    const properties = override.property === "transform" ? ["position", "rotation", "scale"] : [override.property];
    if (scene.animations.some((channel) => channel.targetId === entity.entityId && properties.includes(channel.property))) {
      throw new SpatialSceneError("conflict", `Animation and override both write ${entity.entityId}.${override.property}.`, "overrides");
    }
  }
}
function parseSpatialScene(input) {
  const parsed = parseSpatialValue(SpatialSceneV1Schema, input, "scene");
  const scene = {
    ...parsed,
    entities: sortSpatialBy(parsed.entities.map(normalizeEntity), (item) => item.entityId),
    cameras: sortSpatialBy(parsed.cameras, (item) => item.cameraId),
    assets: sortSpatialBy(parsed.assets.map(normalizeAsset).map((asset) => ({ ...asset, dependencies: [...asset.dependencies].sort(compare) })), (item) => item.assetId),
    animations: sortSpatialBy(parsed.animations, (item) => item.channelId),
    generators: sortSpatialBy(parsed.generators.map((generator) => ({ ...generator, editableKeys: sortSpatialBy(generator.editableKeys.map((item) => ({ ...item, properties: [...item.properties].sort(compare) })), (item) => item.key) })), (item) => item.generatorId),
    overrides: sortSpatialBy(parsed.overrides.map((item) => item.property === "color" ? { ...item, value: item.value.toLowerCase() } : item), (item) => `${item.entityId}:${item.property}`)
  };
  const entities = unique(scene.entities, (entity) => entity.entityId, "entities");
  const cameras = unique(scene.cameras, (camera) => camera.cameraId, "cameras");
  const assets = unique(scene.assets, (asset) => asset.assetId, "assets");
  const generators = unique(scene.generators, (generator) => generator.generatorId, "generators");
  unique(scene.animations, (channel) => channel.channelId, "animations");
  unique(scene.animations, (channel) => `${channel.targetId}:${channel.property}`, "animation writers");
  let payloadBytes = 0;
  for (const asset of scene.assets) {
    unique(asset.dependencies, (id) => id, "asset dependencies");
    payloadBytes += asset.payload.bytes;
    if (payloadBytes > 268435456)
      throw new SpatialSceneError("invalid-data", "Asset closure exceeds 256 MiB.", "assets");
    if ((asset.interpretation.kind === "image" || asset.interpretation.kind === "video") && asset.interpretation.width * asset.interpretation.height > 33554432)
      throw new SpatialSceneError("invalid-data", "Asset exceeds the 32-megapixel limit.", "assets");
    if (asset.interpretation.kind === "metadata" && asset.payload.bytes > 1048576)
      throw new SpatialSceneError("invalid-data", "Retained metadata exceeds one MiB.", "assets");
  }
  spatialTopologicalIds(new Map(scene.assets.map((asset) => [asset.assetId, asset.dependencies])), "asset dependencies");
  spatialTopologicalIds(new Map(scene.entities.map((entity) => [entity.entityId, entity.parentId === null ? [] : [entity.parentId]])), "entity hierarchy");
  const generatedKeys = new Set;
  for (const entity of scene.entities) {
    if (entity.placement.kind === "view")
      requireReference(cameras, entity.placement.cameraId, "placement");
    if (entity.parentId !== null) {
      const parent = requireReference(entities, entity.parentId, "parent");
      const a = parent.placement, b = entity.placement;
      if (a.kind !== b.kind || a.kind === "view" && b.kind === "view" && (a.cameraId !== b.cameraId || a.units !== b.units))
        throw new SpatialSceneError("invalid-data", "Parent and child must share their world or view coordinate domain.", "placement");
    }
    if (entity.origin.kind === "generated") {
      const { generatorId, key: key2 } = entity.origin;
      requireReference(generators, generatorId, "origin");
      if (entity.entityId !== generatedSpatialEntityId(generatorId, key2))
        throw new SpatialSceneError("invalid-data", "Generated entity identity must derive from its generator and stable key.", "origin");
      const identity = `${generatorId}:${key2}`;
      if (generatedKeys.has(identity))
        throw new SpatialSceneError("invalid-data", "Duplicate generator output key.", "origin");
      generatedKeys.add(identity);
    }
    if (entity.kind === "environment" && (entity.placement.kind !== "world" || entity.parentId !== null)) {
      throw new SpatialSceneError("invalid-data", "Environment entities must be unparented world entities.", "placement");
    }
    if (entity.kind === "mesh" && entity.material.kind !== "pbr" && entity.material.map !== undefined) {
      if (entity.geometry.kind === "asset")
        throw new SpatialSceneError("invalid-data", "Material maps apply to authored procedural geometry only.", "entities");
      const mapAsset = requireReference(assets, entity.material.map, "entity asset");
      if (mapAsset.interpretation.kind !== "image")
        throw new SpatialSceneError("invalid-data", `Entity ${entity.entityId} material map requires an image asset.`, "entity asset");
    }
    if (entity.kind === "mesh" && entity.material.kind === "pbr") {
      if (entity.geometry.kind === "asset")
        throw new SpatialSceneError("invalid-data", "PBR material maps apply to authored procedural geometry only.", "entities");
      for (const mapAssetId of pbrMaterialMapAssetIds(entity.material)) {
        const mapAsset = requireReference(assets, mapAssetId, "entity pbr map asset");
        if (mapAsset.interpretation.kind !== "image")
          throw new SpatialSceneError("invalid-data", `Entity ${entity.entityId} PBR map requires an image asset, got ${mapAsset.interpretation.kind}.`, "entity pbr map");
      }
    }
    const reference = entity.kind === "mesh" && entity.geometry.kind === "asset" ? { assetId: entity.geometry.assetId, kind: "gltf" } : entity.kind === "text" ? { assetId: entity.fontAssetId, kind: "font" } : entity.kind === "environment" ? { assetId: entity.assetId, kind: "image" } : ("assetId" in entity) ? { assetId: entity.assetId, kind: entity.kind } : undefined;
    if (reference) {
      const asset = requireReference(assets, reference.assetId, "entity asset");
      if (asset.interpretation.kind !== reference.kind)
        throw new SpatialSceneError("invalid-data", `Entity ${entity.entityId} requires a ${reference.kind} asset.`, "entity asset");
      if (entity.kind === "video" && asset.interpretation.kind === "video" && entity.sourceOffsetUs >= asset.interpretation.durationUs)
        throw new SpatialSceneError("invalid-data", "Video source offset must precede its duration.", "sourceOffsetUs");
    }
  }
  for (const generator of scene.generators) {
    unique(generator.editableKeys, (item) => item.key, "generator editable keys");
    for (const editable of generator.editableKeys) {
      unique(editable.properties, (item) => item, "generator editable properties");
      const entity = entities.get(generatedSpatialEntityId(generator.generatorId, editable.key));
      if (!entity)
        throw new SpatialSceneError("conflict", `Orphan editable key ${editable.key}.`, "generators");
      if (editable.properties.some((property) => !spatialPropertySupported(entity, property)))
        throw new SpatialSceneError("invalid-data", `Editable key ${editable.key} declares an unsupported property.`, "generators");
    }
    const retained = scene.entities.filter((entity) => entity.origin.kind === "generated" && entity.origin.generatorId === generator.generatorId);
    if (spatialGeneratorOutputSha256(retained) !== generator.outputSha256)
      throw new SpatialSceneError("conflict", "Retained generator output does not match its pinned digest.", "generators");
  }
  for (const channel of scene.animations) {
    const entity = entities.get(channel.targetId);
    if (entity === undefined) {
      requireReference(cameras, channel.targetId, "animation target");
      if (channel.property !== "position" && channel.property !== "rotation")
        throw new SpatialSceneError("invalid-data", "Camera animation supports only position and rotation.", "animations");
    } else {
      if (!spatialPropertySupported(entity, channel.property))
        throw new SpatialSceneError("invalid-data", `Unsupported ${channel.property} animation.`, "animations");
      if (entity.origin.kind === "generated") {
        const origin = entity.origin;
        const control = channel.property === "opacity" ? "opacity" : "transform";
        if (!generators.get(origin.generatorId).editableKeys.some((item) => item.key === origin.key && item.properties.includes(control)))
          throw new SpatialSceneError("conflict", `Generated animation requires declared ${control} control.`, "animations");
      }
    }
    let previous = -1;
    for (const key2 of channel.keys) {
      if (key2.timeUs <= previous || key2.timeUs > scene.durationUs)
        throw new SpatialSceneError("invalid-data", "Animation keys must be strictly ordered within scene duration.", "animations");
      previous = key2.timeUs;
    }
  }
  validateSpatialOverrides(scene, scene.overrides);
  return deepFreezeJson(scene);
}
function spatialSceneSha256(input) {
  return spatialValueSha256(parseSpatialScene(input));
}

// src/spatial-scene/math.ts
var MAX_ABS_COMPONENT = 1000000000000;
var MAX_IMAGE_DIMENSION = 1e6;
var AFFINE_TOLERANCE = 0.000000000001;
var RIGID_TOLERANCE = 0.00000001;
var MIN_RELATIVE_DETERMINANT = 0.000000000001;
function number(value, label) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_COMPONENT) {
    throw new RangeError(`${label} must be finite with magnitude <= ${MAX_ABS_COMPONENT}`);
  }
  return value;
}
function values(value, length, label) {
  if (!Array.isArray(value) || value.length !== length)
    throw new RangeError(`${label} must have ${length} components`);
  for (let index = 0;index < length; index++)
    number(value[index], `${label}[${index}]`);
}
function vec2(x, y) {
  return Object.freeze([number(x, "x"), number(y, "y")]);
}
function vec3(x, y, z3) {
  return Object.freeze([number(x, "x"), number(y, "y"), number(z3, "z")]);
}
function matrix(value) {
  values(value, 16, "matrix");
  return Object.freeze(value);
}
function affine(value) {
  values(value, 16, "transform");
  if (Math.abs(value[3]) > AFFINE_TOLERANCE || Math.abs(value[7]) > AFFINE_TOLERANCE || Math.abs(value[11]) > AFFINE_TOLERANCE || Math.abs(value[15] - 1) > AFFINE_TOLERANCE) {
    throw new RangeError("transform must be affine with bottom row [0,0,0,1]");
  }
}
var IDENTITY_MATRIX = matrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function normalizeQuaternion(q) {
  values(q, 4, "quaternion");
  const length = Math.hypot(...q);
  if (length === 0)
    throw new RangeError("quaternion must be nonzero");
  return Object.freeze([q[0] / length, q[1] / length, q[2] / length, q[3] / length]);
}
function composeTransform(transform) {
  values(transform.position, 3, "position");
  values(transform.scale, 3, "scale");
  const [x, y, z3, w] = normalizeQuaternion(transform.rotation);
  const [sx, sy, sz] = transform.scale;
  return matrix([
    (1 - 2 * (y * y + z3 * z3)) * sx,
    2 * (x * y + z3 * w) * sx,
    2 * (x * z3 - y * w) * sx,
    0,
    2 * (x * y - z3 * w) * sy,
    (1 - 2 * (x * x + z3 * z3)) * sy,
    2 * (y * z3 + x * w) * sy,
    0,
    2 * (x * z3 + y * w) * sz,
    2 * (y * z3 - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    ...transform.position,
    1
  ]);
}
function multiplyTransforms(parent, local) {
  affine(parent);
  affine(local);
  const output = new Array(16).fill(0);
  for (let col = 0;col < 4; col++) {
    for (let row = 0;row < 3; row++) {
      output[col * 4 + row] = parent[row] * local[col * 4] + parent[4 + row] * local[col * 4 + 1] + parent[8 + row] * local[col * 4 + 2] + (col === 3 ? parent[12 + row] : 0);
    }
  }
  output[15] = 1;
  return matrix(output);
}
function invertTransform(transform) {
  affine(transform);
  const scale = Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map((index) => Math.abs(transform[index])));
  if (scale === 0)
    throw new RangeError("transform is singular");
  const [a, b, c, d, e, f, g, h, i] = [0, 4, 8, 1, 5, 9, 2, 6, 10].map((index) => transform[index] / scale);
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) <= MIN_RELATIVE_DETERMINANT)
    throw new RangeError("transform is singular or ill-conditioned");
  const factor = 1 / det / scale;
  const r00 = (e * i - f * h) * factor, r01 = (c * h - b * i) * factor, r02 = (b * f - c * e) * factor;
  const r10 = (f * g - d * i) * factor, r11 = (a * i - c * g) * factor, r12 = (c * d - a * f) * factor;
  const r20 = (d * h - e * g) * factor, r21 = (b * g - a * h) * factor, r22 = (a * e - b * d) * factor;
  const [tx, ty, tz] = [transform[12], transform[13], transform[14]];
  return matrix([
    r00,
    r10,
    r20,
    0,
    r01,
    r11,
    r21,
    0,
    r02,
    r12,
    r22,
    0,
    -(r00 * tx + r01 * ty + r02 * tz),
    -(r10 * tx + r11 * ty + r12 * tz),
    -(r20 * tx + r21 * ty + r22 * tz),
    1
  ]);
}
function transformPoint(transform, point) {
  affine(transform);
  values(point, 3, "point");
  return apply(transform, point, true);
}
function transformDirection(transform, direction) {
  affine(transform);
  values(direction, 3, "direction");
  return apply(transform, direction, false);
}
function apply(m, v, translate) {
  return vec3(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + (translate ? m[12] : 0), m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + (translate ? m[13] : 0), m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + (translate ? m[14] : 0));
}
function slerpQuaternion(from, to, t) {
  number(t, "t");
  if (t < 0 || t > 1)
    throw new RangeError("t must be in [0,1]");
  const a = normalizeQuaternion(from);
  const normalizedTo = normalizeQuaternion(to);
  let dot = a.reduce((sum, value, index) => sum + value * normalizedTo[index], 0);
  const b = dot < 0 ? normalizedTo.map((value) => -value) : normalizedTo;
  dot = Math.min(1, Math.max(0, Math.abs(dot)));
  let left = 1 - t, right = t;
  if (dot < 0.9995) {
    const angle = Math.acos(dot), sine = Math.sin(angle);
    left = Math.sin((1 - t) * angle) / sine;
    right = Math.sin(t * angle) / sine;
  }
  return normalizeQuaternion([
    left * a[0] + right * b[0],
    left * a[1] + right * b[1],
    left * a[2] + right * b[2],
    left * a[3] + right * b[3]
  ]);
}
function projection(p) {
  for (const value of [p.width, p.height]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_IMAGE_DIMENSION)
      throw new RangeError("image dimensions must be positive bounded integers");
  }
  number(p.near, "near");
  number(p.far, "far");
  if (p.near <= 0 || p.far <= p.near)
    throw new RangeError("clipping requires 0 < near < far");
  if (p.kind === "perspective") {
    for (const key2 of ["fx", "fy", "cx", "cy"])
      number(p[key2], key2);
    if (p.fx <= 0 || p.fy <= 0)
      throw new RangeError("focal lengths in pixels must be positive");
  } else if (p.kind === "orthographic") {
    for (const key2 of ["left", "right", "bottom", "top"])
      number(p[key2], key2);
    if (p.left >= p.right || p.bottom >= p.top)
      throw new RangeError("orthographic extents must be ordered");
  } else {
    throw new RangeError("unsupported projection");
  }
}
function camera(camera2) {
  projection(camera2.projection);
  const m = camera2.cameraToWorld;
  affine(m);
  const columns = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  for (let i = 0;i < 3; i++) {
    for (let j = i;j < 3; j++) {
      const dot = columns[i].reduce((sum, value, index) => sum + value * columns[j][index], 0);
      if (Math.abs(dot - (i === j ? 1 : 0)) > RIGID_TOLERANCE)
        throw new RangeError("camera pose must be rigid without scale or shear");
    }
  }
  const determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  if (determinant <= 0)
    throw new RangeError("camera pose must preserve handedness");
}
function prepareCameraView(view) {
  camera(view);
  return Object.freeze({ ...view, worldToCamera: invertTransform(view.cameraToWorld) });
}
function projectPreparedPoint(prepared, worldPoint) {
  values(worldPoint, 3, "world point");
  const local = apply(prepared.worldToCamera, worldPoint, true);
  const depthMeters = -local[2];
  if (depthMeters <= 0)
    return null;
  const p = prepared.projection;
  const pixel = p.kind === "perspective" ? vec2(p.fx * local[0] / depthMeters + p.cx, p.cy - p.fy * local[1] / depthMeters) : vec2((local[0] - p.left) / (p.right - p.left) * p.width, (p.top - local[1]) / (p.top - p.bottom) * p.height);
  return Object.freeze({
    pixel,
    depthMeters,
    insideImage: pixel[0] >= 0 && pixel[0] < p.width && pixel[1] >= 0 && pixel[1] < p.height,
    insideClip: depthMeters >= p.near && depthMeters <= p.far
  });
}
function projectPoint(view, worldPoint) {
  return projectPreparedPoint(prepareCameraView(view), worldPoint);
}
function unprojectPixel(view, pixel, depthMeters) {
  camera(view);
  values(pixel, 2, "pixel");
  number(depthMeters, "depth");
  if (depthMeters <= 0)
    throw new RangeError("axial depth must be positive");
  const p = view.projection;
  const local = p.kind === "perspective" ? [(pixel[0] - p.cx) / p.fx * depthMeters, (p.cy - pixel[1]) / p.fy * depthMeters, -depthMeters] : [p.left + pixel[0] / p.width * (p.right - p.left), p.top - pixel[1] / p.height * (p.top - p.bottom), -depthMeters];
  values(local, 3, "unprojected local point");
  return apply(view.cameraToWorld, local, true);
}
function pixelRay(view, pixel) {
  camera(view);
  values(pixel, 2, "pixel");
  const p = view.projection;
  const x = p.kind === "perspective" ? (pixel[0] - p.cx) / p.fx : p.left + pixel[0] / p.width * (p.right - p.left);
  const y = p.kind === "perspective" ? (p.cy - pixel[1]) / p.fy : p.top - pixel[1] / p.height * (p.top - p.bottom);
  const length = p.kind === "perspective" ? Math.hypot(x, y, 1) : 1;
  const origin = apply(view.cameraToWorld, p.kind === "perspective" ? [0, 0, 0] : vec3(x, y, 0), true);
  const direction = apply(view.cameraToWorld, p.kind === "perspective" ? vec3(x / length, y / length, -1 / length) : [0, 0, -1], false);
  return Object.freeze({
    origin,
    direction,
    nearDistanceMeters: number(p.near * length, "near ray distance"),
    farDistanceMeters: number(p.far * length, "far ray distance")
  });
}
function transformBounds(transform, bounds) {
  affine(transform);
  values(bounds.min, 3, "bounds min");
  values(bounds.max, 3, "bounds max");
  if (bounds.min.some((value, index) => value > bounds.max[index]))
    throw new RangeError("bounds must have min <= max");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let mask = 0;mask < 8; mask++) {
    const point = apply(transform, [mask & 1 ? bounds.max[0] : bounds.min[0], mask & 2 ? bounds.max[1] : bounds.min[1], mask & 4 ? bounds.max[2] : bounds.min[2]], true);
    for (let index = 0;index < 3; index++) {
      min[index] = Math.min(min[index], point[index]);
      max[index] = Math.max(max[index], point[index]);
    }
  }
  return Object.freeze({ min: vec3(min[0], min[1], min[2]), max: vec3(max[0], max[1], max[2]) });
}
function cameraMathView(camera2) {
  return Object.freeze({ projection: camera2.projection, cameraToWorld: composeTransform({ ...camera2.pose, scale: [1, 1, 1] }) });
}

// src/spatial-scene/gltf.ts
import { z as z3 } from "zod";
var SPATIAL_GLB_PROFILE = "slopcamera.glb-triangles-trs-pbr-fullmaps-v1";
var SPATIAL_GLB_PROFILE_V1 = "slopcamera.glb-triangles-trs-pbr-basecolor-v1";
var SPATIAL_GLB_RIGGED_PROFILE = "slopcamera.glb-rigged-morph-skin-v1";
var SPATIAL_GLB_LIMITS = Object.freeze({
  bytes: 134217728,
  jsonBytes: 2097152,
  jsonValues: 200000,
  jsonDepth: 32,
  nodes: 4096,
  meshes: 256,
  primitives: 256,
  verticesPerPrimitive: 65536,
  triangles: 1e5,
  decodedAccessorValues: 2000000,
  accessors: 4096,
  bufferViews: 4096,
  materials: 256,
  images: 128,
  imageBytes: 16777216,
  imageTotalBytes: 33554432,
  imagePixels: 67108864,
  clips: 256,
  channels: 4096,
  animationKeys: 4096,
  durationSeconds: 3600,
  skins: 64,
  jointsPerSkin: 256,
  morphTargetsPerPrimitive: 16,
  morphTargetDeltas: 2000000
});
var finite = z3.number().finite().min(-1e6).max(1e6);
var index = z3.number().int().min(0).max(65535);
var unit3 = z3.number().finite().min(0).max(1);
var vec32 = z3.tuple([finite, finite, finite]);
var signedUnit = z3.number().finite().min(-1).max(1);
var quaternion = z3.tuple([signedUnit, signedUnit, signedUnit, signedUnit]);
var metadata = { name: z3.string().max(1024).optional(), extras: z3.unknown().optional(), extensions: z3.never().optional() };
var metadataWithoutExtensions = { name: z3.string().max(1024).optional(), extras: z3.unknown().optional() };
var byteOffset = z3.number().int().min(0).max(SPATIAL_GLB_LIMITS.bytes);
var textureTransform = z3.strictObject({ offset: z3.tuple([finite, finite]).default([0, 0]), rotation: z3.number().finite().min(-Math.PI).max(Math.PI).default(0), scale: z3.tuple([finite, finite]).default([1, 1]), texCoord: z3.literal(0).optional() });
var textureExtensions = z3.strictObject({ KHR_texture_transform: textureTransform.optional() });
var textureInfo = z3.strictObject({ ...metadataWithoutExtensions, index, texCoord: z3.literal(0).optional(), extensions: textureExtensions.optional() });
var normalTextureInfo = z3.strictObject({ ...metadataWithoutExtensions, index, texCoord: z3.literal(0).optional(), scale: finite.optional(), extensions: textureExtensions.optional() });
var occlusionTextureInfo = z3.strictObject({ ...metadataWithoutExtensions, index, texCoord: z3.literal(0).optional(), strength: unit3.optional(), extensions: textureExtensions.optional() });
var supportedExtension = z3.enum(["KHR_texture_transform", "KHR_materials_clearcoat", "KHR_materials_transmission", "KHR_materials_sheen", "KHR_materials_anisotropy", "KHR_materials_ior", "KHR_materials_emissive_strength"]);
var materialExtensions = z3.strictObject({
  KHR_materials_clearcoat: z3.strictObject({ clearcoatFactor: unit3.default(0), clearcoatTexture: textureInfo.optional(), clearcoatRoughnessFactor: unit3.default(0), clearcoatRoughnessTexture: textureInfo.optional(), clearcoatNormalTexture: normalTextureInfo.optional() }).optional(),
  KHR_materials_transmission: z3.strictObject({ transmissionFactor: unit3.default(0), transmissionTexture: textureInfo.optional() }).optional(),
  KHR_materials_sheen: z3.strictObject({ sheenColorFactor: z3.tuple([unit3, unit3, unit3]).default([0, 0, 0]), sheenColorTexture: textureInfo.optional(), sheenRoughnessFactor: unit3.default(0), sheenRoughnessTexture: textureInfo.optional() }).optional(),
  KHR_materials_anisotropy: z3.strictObject({ anisotropyStrength: unit3.default(0), anisotropyRotation: z3.number().finite().min(0).max(2 * Math.PI).default(0), anisotropyTexture: textureInfo.optional() }).optional(),
  KHR_materials_ior: z3.strictObject({ ior: z3.number().finite().min(1).max(5).default(1.5) }).optional(),
  KHR_materials_emissive_strength: z3.strictObject({ emissiveStrength: z3.number().finite().min(0).max(1e5).default(1) }).optional()
});
var samplerSchema = z3.strictObject({
  ...metadata,
  magFilter: z3.union([z3.literal(9728), z3.literal(9729)]).optional(),
  minFilter: z3.union([z3.literal(9728), z3.literal(9729), z3.literal(9984), z3.literal(9985), z3.literal(9986), z3.literal(9987)]).optional(),
  wrapS: z3.union([z3.literal(33071), z3.literal(33648), z3.literal(10497)]).default(10497),
  wrapT: z3.union([z3.literal(33071), z3.literal(33648), z3.literal(10497)]).default(10497)
});
var nodeSchema = z3.strictObject({
  ...metadata,
  children: z3.array(index).max(SPATIAL_GLB_LIMITS.nodes).default([]),
  mesh: index.optional(),
  skin: index.optional(),
  translation: vec32.optional(),
  rotation: quaternion.optional(),
  scale: vec32.optional(),
  matrix: z3.array(finite).length(16).optional()
});
var accessorSchema = z3.strictObject({
  ...metadata,
  bufferView: index,
  byteOffset: byteOffset.default(0),
  componentType: z3.union([z3.literal(5121), z3.literal(5123), z3.literal(5125), z3.literal(5126)]),
  normalized: z3.boolean().default(false),
  count: z3.number().int().min(1).max(SPATIAL_GLB_LIMITS.triangles * 3),
  type: z3.enum(["SCALAR", "VEC2", "VEC3", "VEC4", "MAT4"]),
  min: z3.array(finite).min(1).max(4).optional(),
  max: z3.array(finite).min(1).max(4).optional()
});
var gltfSchema = z3.strictObject({
  ...metadata,
  asset: z3.strictObject({ version: z3.literal("2.0"), minVersion: z3.literal("2.0").optional(), generator: z3.string().max(1024).optional(), copyright: z3.string().max(4096).optional(), extras: z3.unknown().optional(), extensions: z3.never().optional() }),
  extensionsUsed: z3.array(supportedExtension).max(7).optional(),
  extensionsRequired: z3.array(supportedExtension).max(7).optional(),
  buffers: z3.array(z3.strictObject({ ...metadata, byteLength: z3.number().int().min(1).max(SPATIAL_GLB_LIMITS.bytes) })).length(1),
  bufferViews: z3.array(z3.strictObject({ ...metadata, buffer: z3.literal(0), byteOffset: byteOffset.default(0), byteLength: z3.number().int().min(1).max(SPATIAL_GLB_LIMITS.bytes), byteStride: z3.number().int().min(4).max(252).optional(), target: z3.union([z3.literal(34962), z3.literal(34963)]).optional() })).max(SPATIAL_GLB_LIMITS.bufferViews),
  accessors: z3.array(accessorSchema).max(SPATIAL_GLB_LIMITS.accessors),
  scene: index.optional(),
  scenes: z3.array(z3.strictObject({ ...metadata, nodes: z3.array(index).min(1).max(SPATIAL_GLB_LIMITS.nodes) })).min(1).max(128),
  nodes: z3.array(nodeSchema).min(1).max(SPATIAL_GLB_LIMITS.nodes),
  meshes: z3.array(z3.strictObject({ ...metadata, primitives: z3.array(z3.strictObject({
    ...metadata,
    attributes: z3.strictObject({ POSITION: index, NORMAL: index.optional(), TEXCOORD_0: index.optional(), JOINTS_0: index.optional(), WEIGHTS_0: index.optional() }),
    indices: index.optional(),
    material: index.optional(),
    mode: z3.literal(4).default(4),
    targets: z3.array(z3.strictObject({ ...metadata, POSITION: index.optional(), NORMAL: index.optional() })).max(SPATIAL_GLB_LIMITS.morphTargetsPerPrimitive).optional()
  })).min(1).max(SPATIAL_GLB_LIMITS.primitives), weights: z3.array(unit3).max(SPATIAL_GLB_LIMITS.morphTargetsPerPrimitive).optional() })).min(1).max(SPATIAL_GLB_LIMITS.meshes),
  skins: z3.array(z3.strictObject({ ...metadata, inverseBindMatrices: index, joints: z3.array(index).min(1).max(SPATIAL_GLB_LIMITS.jointsPerSkin), skeleton: index.optional() })).max(SPATIAL_GLB_LIMITS.skins).optional(),
  materials: z3.array(z3.strictObject({
    ...metadataWithoutExtensions,
    extensions: materialExtensions.optional(),
    pbrMetallicRoughness: z3.strictObject({ ...metadata, baseColorFactor: z3.tuple([unit3, unit3, unit3, unit3]).default([1, 1, 1, 1]), metallicFactor: unit3.default(1), roughnessFactor: unit3.default(1), baseColorTexture: textureInfo.optional(), metallicRoughnessTexture: textureInfo.optional() }).optional(),
    normalTexture: normalTextureInfo.optional(),
    occlusionTexture: occlusionTextureInfo.optional(),
    emissiveTexture: textureInfo.optional(),
    alphaMode: z3.enum(["OPAQUE", "MASK", "BLEND"]).default("OPAQUE"),
    alphaCutoff: unit3.default(0.5),
    doubleSided: z3.boolean().default(false),
    emissiveFactor: z3.tuple([unit3, unit3, unit3]).optional()
  })).max(SPATIAL_GLB_LIMITS.materials).default([]),
  images: z3.array(z3.strictObject({ ...metadata, bufferView: index, mimeType: z3.enum(["image/png", "image/jpeg"]) })).max(SPATIAL_GLB_LIMITS.images).default([]),
  textures: z3.array(z3.strictObject({ ...metadata, source: index, sampler: index.optional() })).max(SPATIAL_GLB_LIMITS.images).default([]),
  samplers: z3.array(samplerSchema).max(SPATIAL_GLB_LIMITS.images).default([]),
  animations: z3.array(z3.strictObject({
    ...metadata,
    samplers: z3.array(z3.strictObject({ ...metadata, input: index, output: index, interpolation: z3.enum(["STEP", "LINEAR"]).default("LINEAR") })).min(1).max(SPATIAL_GLB_LIMITS.channels),
    channels: z3.array(z3.strictObject({ ...metadata, sampler: index, target: z3.strictObject({ ...metadata, node: index, path: z3.enum(["translation", "rotation", "scale", "weights"]) }) })).min(1).max(SPATIAL_GLB_LIMITS.channels)
  })).max(SPATIAL_GLB_LIMITS.clips).default([])
});
var optionsSchema = z3.strictObject({
  metersPerUnit: z3.number().finite().min(0.000001).max(1e6),
  sourceUp: z3.enum(["x", "y", "z"]),
  nodeIndex: index.optional(),
  materialMode: z3.enum(["source", "entity"]).default("entity"),
  timeUs: z3.number().int().min(0).max(3600000000),
  clip: z3.strictObject({ index, offsetUs: z3.number().int().min(0).max(3600000000), playback: z3.enum(["once", "loop", "freeze"]) }).optional(),
  morphWeights: z3.array(unit3).max(SPATIAL_GLB_LIMITS.morphTargetsPerPrimitive).optional()
});
function fail(message, path = "glb") {
  throw new SpatialSceneError("invalid-data", `${SPATIAL_GLB_PROFILE}: ${message}`, path);
}
function at(array, index2, path) {
  return array[index2] ?? fail(`Missing index ${index2}.`, path);
}
function schemaValue(schema, input, name) {
  const captured = createBoundedJsonValueSnapshot(input, SPATIAL_GLB_LIMITS.jsonBytes, name, { maximumDepth: SPATIAL_GLB_LIMITS.jsonDepth, maximumValues: SPATIAL_GLB_LIMITS.jsonValues });
  const result = schema.safeParse(captured.value);
  if (!result.success) {
    const issue = result.error.issues[0];
    return fail(`Unsupported or invalid field: ${issue?.message ?? "invalid data"}.`, `${name}.${issue?.path.join(".") ?? ""}`);
  }
  return result.data;
}
function normalizedRotation(value, path) {
  if (value.length !== 4 || Math.abs(Math.hypot(...value) - 1) > 0.00001)
    fail("Rotation must be a unit XYZW quaternion.", path);
  return normalizeQuaternion(value);
}
function safeMatrix(value, path) {
  try {
    invertTransform(value);
  } catch {
    fail("Node transform must be an invertible affine matrix.", path);
  }
  return value;
}
function nodeTransform(node, path) {
  if (node.matrix) {
    if (node.translation || node.rotation || node.scale)
      fail("Node matrix and TRS cannot be combined.", path);
    const matrix2 = safeMatrix(Object.freeze([...node.matrix]), path);
    const axes = [[matrix2[0], matrix2[1], matrix2[2]], [matrix2[4], matrix2[5], matrix2[6]], [matrix2[8], matrix2[9], matrix2[10]]];
    for (let a = 0;a < 3; a++)
      for (let b = a + 1;b < 3; b++) {
        const left = axes[a], right = axes[b];
        const dot = left.reduce((sum, value, i) => sum + value * right[i], 0);
        if (Math.abs(dot) > Math.hypot(...left) * Math.hypot(...right) * 0.000001)
          fail("Node matrix contains unsupported shear.", path);
      }
    return matrix2;
  }
  const rotation = normalizedRotation(node.rotation ?? [0, 0, 0, 1], path);
  return safeMatrix(composeTransform({ position: node.translation ?? [0, 0, 0], rotation, scale: node.scale ?? [1, 1, 1] }), path);
}
function imageHeader(bytes, mimeType) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (mimeType === "image/png") {
    if (bytes.length < 45 || [137, 80, 78, 71, 13, 10, 26, 10].some((value, i) => bytes[i] !== value))
      fail("Embedded image MIME does not match a PNG signature.");
    let cursor = 8, chunks = 0, hasData = false, ended = false;
    while (cursor < bytes.length) {
      if (++chunks > 65536 || cursor + 12 > bytes.length)
        fail("Malformed PNG chunk envelope.");
      const length = data.getUint32(cursor), type = data.getUint32(cursor + 4);
      if (length > bytes.length - cursor - 12)
        fail("PNG chunk exceeds its image view.");
      if (cursor === 8) {
        if (type !== 1229472850 || length !== 13)
          fail("PNG must begin with IHDR.");
        width = data.getUint32(cursor + 8);
        height = data.getUint32(cursor + 12);
      } else if (type === 1229472850)
        fail("Duplicate PNG IHDR.");
      if (type === 1633899596)
        fail("Animated PNG textures are unsupported.");
      if (type === 1229209940)
        hasData = true;
      cursor += 12 + length;
      if (type === 1229278788) {
        if (length !== 0 || cursor !== bytes.length)
          fail("PNG IEND must end its image view.");
        ended = true;
        break;
      }
    }
    if (!hasData || !ended)
      fail("PNG requires IDAT and IEND chunks.");
  } else {
    if (bytes.length < 10 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
      fail("Embedded image MIME does not match a complete JPEG envelope.");
    let cursor = 2, segments = 0;
    while (cursor + 4 <= bytes.length) {
      if (++segments > 65536 || bytes[cursor++] !== 255)
        fail("Malformed JPEG marker.");
      while (bytes[cursor] === 255)
        cursor++;
      const marker = bytes[cursor++];
      if (marker === 218 || marker === 217)
        break;
      if (marker === 0 || marker === 216 || marker >= 208 && marker <= 215)
        fail("Unexpected JPEG standalone marker.");
      if (cursor + 2 > bytes.length)
        fail("Truncated JPEG segment.");
      const length = data.getUint16(cursor);
      if (length < 2 || cursor + length > bytes.length)
        fail("JPEG segment exceeds its image view.");
      if ([192, 193, 194].includes(marker)) {
        if (width !== 0 || length < 8 || bytes[cursor + 2] !== 8 || ![1, 3].includes(bytes[cursor + 7]))
          fail("JPEG requires one 8-bit grayscale or RGB frame.");
        height = data.getUint16(cursor + 3);
        width = data.getUint16(cursor + 5);
      } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker))
        fail("JPEG frame encoding is unsupported.");
      cursor += length;
    }
  }
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > SPATIAL_GLB_LIMITS.imagePixels)
    fail("Embedded image dimensions exceed the decoded pixel profile.");
  return { width, height };
}
function readAccessors(document, binary) {
  let totalValues = 0;
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  for (const [index2, view] of document.bufferViews.entries()) {
    if (view.byteOffset + view.byteLength > document.buffers[0].byteLength)
      fail("Buffer view exceeds the declared BIN payload.", `bufferViews.${index2}`);
    if (view.byteStride !== undefined && view.byteStride % 4 !== 0)
      fail("Vertex stride must be a multiple of four.", `bufferViews.${index2}`);
  }
  return Object.freeze(document.accessors.map((accessor, index2) => {
    const path = `accessors.${index2}`;
    const view = at(document.bufferViews, accessor.bufferView, path);
    const bytes = accessor.componentType === 5121 ? 1 : accessor.componentType === 5123 ? 2 : 4;
    const components = accessor.type === "SCALAR" ? 1 : accessor.type === "MAT4" ? 16 : Number(accessor.type.slice(3));
    const stride = view.byteStride ?? components * bytes;
    if (accessor.byteOffset % bytes !== 0 || (view.byteOffset + accessor.byteOffset) % bytes !== 0 || stride < components * bytes || stride % bytes !== 0)
      fail("Accessor alignment or stride is invalid.", path);
    if (accessor.byteOffset + (accessor.count - 1) * stride + components * bytes > view.byteLength)
      fail("Accessor exceeds its buffer view.", path);
    if (accessor.normalized && (accessor.componentType === 5125 || accessor.componentType === 5126))
      fail("Only unsigned byte/short UVs support normalized storage in this profile.", path);
    totalValues += accessor.count * components;
    if (totalValues > SPATIAL_GLB_LIMITS.decodedAccessorValues)
      fail("Decoded accessor budget exceeded.", path);
    const values2 = [];
    const low = new Array(components).fill(Infinity), high = new Array(components).fill(-Infinity);
    for (let element = 0;element < accessor.count; element++)
      for (let component = 0;component < components; component++) {
        const offset = view.byteOffset + accessor.byteOffset + element * stride + component * bytes;
        const raw = accessor.componentType === 5121 ? data.getUint8(offset) : accessor.componentType === 5123 ? data.getUint16(offset, true) : accessor.componentType === 5125 ? data.getUint32(offset, true) : data.getFloat32(offset, true);
        if (!Number.isFinite(raw))
          fail("Accessor contains nonfinite data.", path);
        low[component] = Math.min(low[component], raw);
        high[component] = Math.max(high[component], raw);
        values2.push(accessor.normalized ? raw / (accessor.componentType === 5121 ? 255 : 65535) : raw);
      }
    for (const [declared, computed, label] of [[accessor.min, low, "min"], [accessor.max, high, "max"]]) {
      if (declared !== undefined && (declared.length !== components || declared.some((value, component) => Math.abs(value - computed[component]) > 0.000001 * Math.max(1, Math.abs(value)))))
        fail(`Accessor ${label} does not match decoded values.`, path);
    }
    return Object.freeze({ source: accessor, components, values: Object.freeze(values2) });
  }));
}
function validateViewRoles(document) {
  const roles = new Map, vertexAccessors = new Map;
  const assign = (viewIndex, role) => {
    const previous = roles.get(viewIndex);
    if (previous !== undefined && previous !== role)
      fail(`Buffer view mixes ${previous} and ${role} data.`, `bufferViews.${viewIndex}`);
    roles.set(viewIndex, role);
  };
  const accessor = (index2, role) => {
    const source = at(document.accessors, index2, "accessors");
    assign(source.bufferView, role);
    if (role === "vertex") {
      const ids = vertexAccessors.get(source.bufferView) ?? new Set;
      ids.add(index2);
      vertexAccessors.set(source.bufferView, ids);
    }
  };
  for (const mesh of document.meshes)
    for (const primitive of mesh.primitives) {
      for (const index2 of Object.values(primitive.attributes))
        if (index2 !== undefined)
          accessor(index2, "vertex");
      if (primitive.indices !== undefined)
        accessor(primitive.indices, "index");
      if (primitive.targets !== undefined)
        for (const target of primitive.targets) {
          if (target.POSITION !== undefined)
            accessor(target.POSITION, "vertex");
          if (target.NORMAL !== undefined)
            accessor(target.NORMAL, "vertex");
        }
    }
  if (document.skins !== undefined)
    for (const skin of document.skins)
      accessor(skin.inverseBindMatrices, "skin");
  for (const clip of document.animations)
    for (const sampler of clip.samplers) {
      accessor(sampler.input, "animation");
      accessor(sampler.output, "animation");
    }
  for (const image of document.images)
    assign(image.bufferView, "image");
  for (const [viewIndex, ids] of vertexAccessors)
    if (ids.size > 1 && at(document.bufferViews, viewIndex, "bufferViews").byteStride === undefined)
      fail("Shared vertex-attribute views require an explicit stride.", `bufferViews.${viewIndex}`);
}
function validateExtensions(document) {
  const used = document.extensionsUsed ?? [], required = document.extensionsRequired ?? [];
  if (new Set(used).size !== used.length || new Set(required).size !== required.length)
    fail("Extension declarations must be unique.", "extensionsUsed");
  for (const extension of required)
    if (!used.includes(extension))
      fail("Every required extension must also be listed in extensionsUsed.", "extensionsRequired");
  const present = new Set;
  const texture = (info) => {
    if (info?.extensions?.KHR_texture_transform !== undefined)
      present.add("KHR_texture_transform");
  };
  for (const material of document.materials) {
    for (const name of Object.keys(material.extensions ?? {}))
      present.add(name);
    texture(material.pbrMetallicRoughness?.baseColorTexture);
    texture(material.pbrMetallicRoughness?.metallicRoughnessTexture);
    texture(material.normalTexture);
    texture(material.occlusionTexture);
    texture(material.emissiveTexture);
    const extensions = material.extensions;
    texture(extensions?.KHR_materials_clearcoat?.clearcoatTexture);
    texture(extensions?.KHR_materials_clearcoat?.clearcoatRoughnessTexture);
    texture(extensions?.KHR_materials_clearcoat?.clearcoatNormalTexture);
    texture(extensions?.KHR_materials_transmission?.transmissionTexture);
    texture(extensions?.KHR_materials_sheen?.sheenColorTexture);
    texture(extensions?.KHR_materials_sheen?.sheenRoughnessTexture);
    texture(extensions?.KHR_materials_anisotropy?.anisotropyTexture);
  }
  for (const extension of present)
    if (!used.includes(extension))
      fail(`Used extension ${extension} is not declared.`, "extensionsUsed");
}
function cleanSampler(sampler) {
  return Object.freeze({
    wrapS: sampler?.wrapS ?? 10497,
    wrapT: sampler?.wrapT ?? 10497,
    ...sampler?.magFilter === undefined ? {} : { magFilter: sampler.magFilter },
    ...sampler?.minFilter === undefined ? {} : { minFilter: sampler.minFilter }
  });
}
function materials(document) {
  for (const texture of document.textures) {
    at(document.images, texture.source, "textures.source");
    if (texture.sampler !== undefined)
      at(document.samplers, texture.sampler, "textures.sampler");
  }
  const textureRef = (info, path) => {
    if (info === undefined)
      return;
    const texture = at(document.textures, info.index, path), transform = info.extensions?.KHR_texture_transform;
    return { imageIndex: texture.source, sampler: cleanSampler(texture.sampler === undefined ? undefined : document.samplers[texture.sampler]), ...transform === undefined ? {} : { transform: { offset: transform.offset, rotation: transform.rotation, scale: transform.scale } } };
  };
  return deepFreezeJson(document.materials.map((material) => {
    const { pbrMetallicRoughness: pbr, extensions } = material;
    const clearcoat = extensions?.KHR_materials_clearcoat, transmission = extensions?.KHR_materials_transmission;
    const sheen = extensions?.KHR_materials_sheen, anisotropy = extensions?.KHR_materials_anisotropy;
    const baseColor = textureRef(pbr?.baseColorTexture, "baseColorTexture"), metallicRoughness = textureRef(pbr?.metallicRoughnessTexture, "metallicRoughnessTexture");
    const normal = textureRef(material.normalTexture, "normalTexture"), occlusion = textureRef(material.occlusionTexture, "occlusionTexture"), emissive = textureRef(material.emissiveTexture, "emissiveTexture");
    const clearcoatTexture = textureRef(clearcoat?.clearcoatTexture, "clearcoatTexture"), clearcoatRoughnessTexture = textureRef(clearcoat?.clearcoatRoughnessTexture, "clearcoatRoughnessTexture"), clearcoatNormal = textureRef(clearcoat?.clearcoatNormalTexture, "clearcoatNormalTexture");
    const transmissionTexture = textureRef(transmission?.transmissionTexture, "transmissionTexture"), sheenColorTexture = textureRef(sheen?.sheenColorTexture, "sheenColorTexture"), sheenRoughnessTexture = textureRef(sheen?.sheenRoughnessTexture, "sheenRoughnessTexture"), anisotropyTexture = textureRef(anisotropy?.anisotropyTexture, "anisotropyTexture");
    return {
      baseColorLinear: pbr?.baseColorFactor ?? [1, 1, 1, 1],
      metalness: pbr?.metallicFactor ?? 1,
      roughness: pbr?.roughnessFactor ?? 1,
      alphaMode: material.alphaMode,
      alphaCutoff: material.alphaCutoff,
      doubleSided: material.doubleSided,
      ...baseColor === undefined ? {} : { baseColorTexture: baseColor },
      ...metallicRoughness === undefined ? {} : { metallicRoughnessTexture: metallicRoughness },
      ...normal === undefined ? {} : { normalTexture: { ...normal, ...material.normalTexture.scale === undefined ? {} : { scale: material.normalTexture.scale } } },
      ...occlusion === undefined ? {} : { occlusionTexture: { ...occlusion, ...material.occlusionTexture.strength === undefined ? {} : { strength: material.occlusionTexture.strength } } },
      ...emissive === undefined ? {} : { emissiveTexture: emissive },
      ...material.emissiveFactor === undefined ? {} : { emissiveLinear: material.emissiveFactor },
      ...extensions?.KHR_materials_emissive_strength === undefined ? {} : { emissiveStrength: extensions.KHR_materials_emissive_strength.emissiveStrength },
      ...clearcoat === undefined ? {} : { clearcoat: { factor: clearcoat.clearcoatFactor, roughness: clearcoat.clearcoatRoughnessFactor, ...clearcoatTexture === undefined ? {} : { texture: clearcoatTexture }, ...clearcoatRoughnessTexture === undefined ? {} : { roughnessTexture: clearcoatRoughnessTexture }, ...clearcoatNormal === undefined ? {} : { normalTexture: { ...clearcoatNormal, ...clearcoat.clearcoatNormalTexture?.scale === undefined ? {} : { scale: clearcoat.clearcoatNormalTexture.scale } } } } },
      ...transmission === undefined ? {} : { transmission: { factor: transmission.transmissionFactor, ...transmissionTexture === undefined ? {} : { texture: transmissionTexture } } },
      ...sheen === undefined ? {} : { sheen: { colorLinear: sheen.sheenColorFactor, roughness: sheen.sheenRoughnessFactor, ...sheenColorTexture === undefined ? {} : { colorTexture: sheenColorTexture }, ...sheenRoughnessTexture === undefined ? {} : { roughnessTexture: sheenRoughnessTexture } } },
      ...anisotropy === undefined ? {} : { anisotropy: { strength: anisotropy.anisotropyStrength, rotation: anisotropy.anisotropyRotation, ...anisotropyTexture === undefined ? {} : { texture: anisotropyTexture } } },
      ...extensions?.KHR_materials_ior === undefined ? {} : { ior: extensions.KHR_materials_ior.ior }
    };
  }));
}
function materialFacts(document, sources) {
  return deepFreezeJson(document.materials.map((material, index2) => {
    const resolved = sources[index2];
    const slots = [
      ["baseColor", resolved.baseColorTexture],
      ["metallicRoughness", resolved.metallicRoughnessTexture],
      ["normal", resolved.normalTexture],
      ["occlusion", resolved.occlusionTexture],
      ["emissive", resolved.emissiveTexture],
      ["clearcoat", resolved.clearcoat?.texture],
      ["clearcoatRoughness", resolved.clearcoat?.roughnessTexture],
      ["clearcoatNormal", resolved.clearcoat?.normalTexture],
      ["transmission", resolved.transmission?.texture],
      ["sheenColor", resolved.sheen?.colorTexture],
      ["sheenRoughness", resolved.sheen?.roughnessTexture],
      ["anisotropy", resolved.anisotropy?.texture]
    ];
    const maps = slots.filter((entry) => entry[1] !== undefined).map((entry) => entry[0]);
    const textureTransforms = slots.flatMap(([map, texture]) => texture?.transform === undefined ? [] : [{ map, ...texture.transform }]);
    return {
      ...material.name === undefined ? {} : { name: material.name },
      alphaMode: resolved.alphaMode,
      doubleSided: resolved.doubleSided,
      maps,
      textureTransforms,
      ...resolved.emissiveLinear === undefined ? {} : { emissiveLinear: resolved.emissiveLinear },
      ...resolved.emissiveStrength === undefined ? {} : { emissiveStrength: resolved.emissiveStrength },
      ...resolved.clearcoat === undefined ? {} : { clearcoat: { factor: resolved.clearcoat.factor, roughness: resolved.clearcoat.roughness } },
      ...resolved.transmission === undefined ? {} : { transmission: { factor: resolved.transmission.factor } },
      ...resolved.sheen === undefined ? {} : { sheen: { colorLinear: resolved.sheen.colorLinear, roughness: resolved.sheen.roughness } },
      ...resolved.anisotropy === undefined ? {} : { anisotropy: { strength: resolved.anisotropy.strength, rotation: resolved.anisotropy.rotation } },
      ...resolved.ior === undefined ? {} : { ior: resolved.ior }
    };
  }));
}
function allMaterialTextures(material) {
  return [
    material.baseColorTexture,
    material.metallicRoughnessTexture,
    material.normalTexture,
    material.occlusionTexture,
    material.emissiveTexture,
    material.clearcoat?.texture,
    material.clearcoat?.roughnessTexture,
    material.clearcoat?.normalTexture,
    material.transmission?.texture,
    material.sheen?.colorTexture,
    material.sheen?.roughnessTexture,
    material.anisotropy?.texture
  ];
}
function readMeshes(document, accessors, sources) {
  const defaultMaterial = { baseColorLinear: [1, 1, 1, 1], metalness: 1, roughness: 1, alphaMode: "OPAQUE", alphaCutoff: 0.5, doubleSided: false };
  let primitiveCount = 0, triangles = 0, morphTargetDeltaCount = 0;
  return deepFreezeJson(document.meshes.map((mesh, meshIndex) => {
    const targetCount = primitiveTargetCount(mesh, meshIndex);
    if (mesh.weights !== undefined && mesh.weights.length !== targetCount)
      fail("Mesh weights count must match its morph target count.", `meshes.${meshIndex}.weights`);
    const weights = mesh.weights ?? (targetCount > 0 ? Object.freeze(new Array(targetCount).fill(0)) : Object.freeze([]));
    return mesh.primitives.map((primitive, primitiveIndex) => {
      const path = `meshes.${meshIndex}.primitives.${primitiveIndex}`;
      if (++primitiveCount > SPATIAL_GLB_LIMITS.primitives)
        fail("Source primitive count exceeds this profile.", path);
      if (primitive.targets !== undefined && primitive.targets.length !== targetCount)
        fail("Every primitive in a mesh must declare the same number of morph targets.", path);
      const positions = at(accessors, primitive.attributes.POSITION, path);
      const normals = primitive.attributes.NORMAL === undefined ? undefined : at(accessors, primitive.attributes.NORMAL, path);
      const uvs = primitive.attributes.TEXCOORD_0 === undefined ? undefined : at(accessors, primitive.attributes.TEXCOORD_0, path);
      const jointsAttr = primitive.attributes.JOINTS_0 === undefined ? undefined : at(accessors, primitive.attributes.JOINTS_0, path);
      const weightsAttr = primitive.attributes.WEIGHTS_0 === undefined ? undefined : at(accessors, primitive.attributes.WEIGHTS_0, path);
      const indices = primitive.indices === undefined ? undefined : at(accessors, primitive.indices, path);
      if (positions.source.type !== "VEC3" || positions.source.componentType !== 5126 || positions.source.normalized || positions.source.min === undefined || positions.source.max === undefined || positions.source.count > SPATIAL_GLB_LIMITS.verticesPerPrimitive)
        fail("POSITION requires bounded float32 VEC3 with declared min/max.", path);
      for (const attribute of [positions, normals, uvs])
        if (attribute !== undefined) {
          const view = document.bufferViews[attribute.source.bufferView];
          if ((view.byteOffset + attribute.source.byteOffset) % 4 !== 0 || attribute.source.byteOffset % 4 !== 0 || view.target !== undefined && view.target !== 34962)
            fail("Vertex attributes require four-byte alignment and ARRAY_BUFFER target.", path);
          const componentBytes = attribute.source.componentType === 5121 ? 1 : attribute.source.componentType === 5123 ? 2 : 4;
          if ((view.byteStride ?? attribute.components * componentBytes) % 4 !== 0)
            fail("Every vertex attribute element must remain four-byte aligned.", path);
          if (attribute.source.count !== positions.source.count || attribute.values.some((value) => Math.abs(value) > 1e6))
            fail("Vertex attributes require matching counts and bounded coordinates.", path);
        }
      if (normals) {
        if (normals.source.type !== "VEC3" || normals.source.componentType !== 5126 || normals.source.normalized)
          fail("NORMAL requires float32 VEC3.", path);
        for (let i = 0;i < normals.values.length; i += 3)
          if (Math.abs(Math.hypot(...normals.values.slice(i, i + 3)) - 1) > 0.0001)
            fail("Normals must be unit vectors.", path);
      }
      if (uvs && (uvs.source.type !== "VEC2" || uvs.source.componentType !== 5126 && !([5121, 5123].includes(uvs.source.componentType) && uvs.source.normalized)))
        fail("TEXCOORD_0 requires float32 or normalized unsigned byte/short VEC2.", path);
      for (const attribute of [jointsAttr, weightsAttr]) {
        if (attribute === undefined)
          continue;
        const view = document.bufferViews[attribute.source.bufferView];
        if ((view.byteOffset + attribute.source.byteOffset) % 4 !== 0 || attribute.source.byteOffset % 4 !== 0 || view.target !== undefined && view.target !== 34962)
          fail("Skinning attributes require four-byte alignment and ARRAY_BUFFER target.", path);
        const componentBytes = attribute.source.componentType === 5121 ? 1 : attribute.source.componentType === 5123 ? 2 : 4;
        if ((view.byteStride ?? attribute.components * componentBytes) % 4 !== 0)
          fail("Skinning attribute elements must remain four-byte aligned.", path);
        if (attribute.source.count !== positions.source.count || attribute.values.some((value) => Math.abs(value) > 1e6))
          fail("Skinning attributes require matching counts and bounded values.", path);
      }
      let jointIndices;
      let jointWeights;
      if (jointsAttr !== undefined !== (weightsAttr !== undefined))
        fail("JOINTS_0 and WEIGHTS_0 must appear together.", path);
      if (jointsAttr !== undefined) {
        if (jointsAttr.source.type !== "VEC4" || ![5121, 5123].includes(jointsAttr.source.componentType) || jointsAttr.source.normalized || jointsAttr.source.count !== positions.source.count)
          fail("JOINTS_0 requires unsigned byte/short VEC4 matching POSITION count.", path);
        if (weightsAttr.source.type !== "VEC4" || weightsAttr.source.count !== positions.source.count)
          fail("WEIGHTS_0 requires VEC4 matching POSITION count.", path);
        const normalized = weightsAttr.source.normalized;
        const weightComponent = weightsAttr.source.componentType;
        if (!(weightComponent === 5126 || (weightComponent === 5121 || weightComponent === 5123) && normalized))
          fail("WEIGHTS_0 requires float32 or normalized unsigned byte/short.", path);
        jointIndices = Object.freeze(jointsAttr.values.map((value) => {
          const joint = Math.round(value);
          if (joint < 0 || joint >= SPATIAL_GLB_LIMITS.jointsPerSkin || !Number.isFinite(joint) || Math.abs(joint - value) > 0.000001)
            fail("JOINTS_0 index must be an integer in skin joint range.", path);
          return joint;
        }));
        const normalizedWeights = [];
        for (let vertex = 0;vertex < weightsAttr.source.count; vertex++) {
          const values2 = weightsAttr.values.slice(vertex * 4, vertex * 4 + 4);
          const sum = values2.reduce((total, value) => total + value, 0);
          if (values2.some((value) => value < 0 || value > 1) || Math.abs(sum - 1) > 0.0001)
            fail("Vertex skinning weights must be in [0,1] and sum to one.", path);
          normalizedWeights.push(...values2.map((value) => value / sum));
        }
        jointWeights = Object.freeze(normalizedWeights);
      }
      if (indices) {
        const view = document.bufferViews[indices.source.bufferView];
        if (indices.source.type !== "SCALAR" || ![5121, 5123, 5125].includes(indices.source.componentType) || indices.source.normalized || view.byteStride !== undefined || view.target !== undefined && view.target !== 34963)
          fail("Triangle indices require tightly packed unsigned scalar storage.", path);
        const restart = indices.source.componentType === 5121 ? 255 : indices.source.componentType === 5123 ? 65535 : 4294967295;
        if (indices.values.some((value) => value >= positions.source.count || value === restart))
          fail("Triangle index is out of range or reserved for primitive restart.", path);
      }
      const vertices = indices?.values.length ?? positions.source.count;
      if (vertices % 3 !== 0)
        fail("TRIANGLES require complete index or vertex triples.", path);
      triangles += vertices / 3;
      if (triangles > SPATIAL_GLB_LIMITS.triangles)
        fail("Source triangle budget exceeded.", path);
      const material = primitive.material === undefined ? defaultMaterial : at(sources, primitive.material, path);
      if (uvs === undefined && allMaterialTextures(material).some((texture) => texture !== undefined)) {
        fail("Material textures require TEXCOORD_0.", path);
      }
      const morphTargets = [];
      if (primitive.targets !== undefined)
        for (const [targetIndex, target] of primitive.targets.entries()) {
          const targetPath = `${path}.targets.${targetIndex}`;
          const positionDeltas = target.POSITION === undefined ? undefined : at(accessors, target.POSITION, targetPath);
          const normalDeltas = target.NORMAL === undefined ? undefined : at(accessors, target.NORMAL, targetPath);
          if (positionDeltas === undefined && normalDeltas === undefined)
            fail("Morph target must declare POSITION or NORMAL deltas.", targetPath);
          if (positionDeltas !== undefined) {
            if (positionDeltas.source.type !== "VEC3" || positionDeltas.source.componentType !== 5126 || positionDeltas.source.normalized || positionDeltas.source.count !== positions.source.count)
              fail("Morph POSITION deltas require float32 VEC3 matching POSITION count.", targetPath);
            morphTargetDeltaCount += positionDeltas.values.length;
          }
          if (normalDeltas !== undefined) {
            if (normalDeltas.source.type !== "VEC3" || normalDeltas.source.componentType !== 5126 || normalDeltas.source.normalized || normalDeltas.source.count !== positions.source.count)
              fail("Morph NORMAL deltas require float32 VEC3 matching POSITION count.", targetPath);
            morphTargetDeltaCount += normalDeltas.values.length;
          }
          for (const attribute of [positionDeltas, normalDeltas]) {
            if (attribute === undefined)
              continue;
            const view = document.bufferViews[attribute.source.bufferView];
            if ((view.byteOffset + attribute.source.byteOffset) % 4 !== 0 || attribute.source.byteOffset % 4 !== 0 || view.target !== undefined && view.target !== 34962)
              fail("Morph target attributes require four-byte alignment and ARRAY_BUFFER target.", targetPath);
            if ((view.byteStride ?? attribute.components * 4) % 4 !== 0)
              fail("Morph target attribute elements must remain four-byte aligned.", targetPath);
            if (attribute.values.some((value) => Math.abs(value) > 1e6))
              fail("Morph target deltas must be bounded finite values.", targetPath);
          }
          if (morphTargetDeltaCount > SPATIAL_GLB_LIMITS.morphTargetDeltas)
            fail("Morph target delta budget exceeded.", targetPath);
          morphTargets.push(Object.freeze({ ...positionDeltas === undefined ? {} : { positionDeltas: positionDeltas.values }, ...normalDeltas === undefined ? {} : { normalDeltas: normalDeltas.values } }));
        }
      return Object.freeze({
        positions: positions.values,
        ...normals === undefined ? {} : { normals: normals.values },
        ...uvs === undefined ? {} : { uvs: uvs.values },
        ...indices === undefined ? {} : { indices: indices.values },
        ...jointIndices === undefined ? {} : { jointIndices, jointWeights },
        material,
        morphTargets: Object.freeze(morphTargets),
        weights
      });
    });
  }));
}
function primitiveTargetCount(mesh, meshIndex) {
  const count = mesh.primitives[0]?.targets?.length ?? 0;
  for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
    if ((primitive.targets?.length ?? 0) !== count)
      fail("Every primitive in a mesh must declare the same number of morph targets.", `meshes.${meshIndex}.primitives.${primitiveIndex}`);
  }
  return count;
}
function readSkins(document, accessors) {
  if (document.skins === undefined)
    return Object.freeze([]);
  return Object.freeze(document.skins.map((skin, skinIndex) => {
    const path = `skins.${skinIndex}`;
    const inverseBindMatrices = at(accessors, skin.inverseBindMatrices, path);
    if (inverseBindMatrices.source.type !== "MAT4" || inverseBindMatrices.source.componentType !== 5126 || inverseBindMatrices.source.normalized || inverseBindMatrices.source.count !== skin.joints.length)
      fail("Inverse bind matrices require a float32 MAT4 accessor with one matrix per joint.", path);
    const view = document.bufferViews[inverseBindMatrices.source.bufferView];
    if (view.byteStride !== undefined || view.target !== undefined)
      fail("Skin inverse bind matrices must be tightly packed without a GPU buffer target.", path);
    for (let index2 = 0;index2 < skin.joints.length; index2++) {
      const matrix2 = inverseBindMatrices.values.slice(index2 * 16, (index2 + 1) * 16);
      safeMatrix(matrix2, `${path}.inverseBindMatrices[${index2}]`);
    }
    if (new Set(skin.joints).size !== skin.joints.length)
      fail("Skin joints must be unique.", `${path}.joints`);
    for (const joint of skin.joints)
      at(document.nodes, joint, `${path}.joints`);
    if (skin.skeleton !== undefined)
      at(document.nodes, skin.skeleton, `${path}.skeleton`);
    const matrixIndexByJointNode = new Map;
    for (const [matrixIndex, jointNode] of skin.joints.entries())
      matrixIndexByJointNode.set(jointNode, matrixIndex);
    return Object.freeze({ joints: Object.freeze([...skin.joints]), inverseBindMatrices: Object.freeze([...inverseBindMatrices.values]), sourceAccessorIndex: skin.inverseBindMatrices, matrixIndexByJointNode: Object.freeze(matrixIndexByJointNode) });
  }));
}
function rigFacts(document, skins, clipDurations) {
  const skinSources = document.skins;
  const morphTargets = [];
  for (const [meshIndex, mesh] of document.meshes.entries()) {
    const meshFacts = [];
    const targetNames = meshTargetNames(mesh, meshIndex);
    for (const primitive of mesh.primitives) {
      const primitiveFacts = [];
      if (primitive.targets !== undefined)
        for (const [targetIndex, target] of primitive.targets.entries()) {
          primitiveFacts.push({ name: targetNames[targetIndex] ?? `target${targetIndex}`, hasPosition: target.POSITION !== undefined, hasNormal: target.NORMAL !== undefined });
        }
      meshFacts.push(primitiveFacts);
    }
    morphTargets.push(meshFacts);
  }
  return deepFreezeJson({
    profile: SPATIAL_GLB_RIGGED_PROFILE,
    skins: skins.map((skin, index2) => ({ ...skinSources[index2].name === undefined ? {} : { name: skinSources[index2].name }, jointNodeIndices: skin.joints, inverseBindMatricesAccessor: skin.sourceAccessorIndex })),
    morphTargets,
    clips: document.animations.map((clip, index2) => ({ ...clip.name === undefined ? {} : { name: clip.name }, durationSeconds: clipDurations[index2], channels: clip.channels.map((channel) => ({ nodeIndex: channel.target.node, path: channel.target.path })) }))
  });
}
function meshTargetNames(mesh, _meshIndex) {
  const extras = mesh.extras;
  const list = extras !== null && typeof extras === "object" && "targetNames" in extras && Array.isArray(extras.targetNames) ? extras.targetNames : undefined;
  if (list === undefined)
    return [];
  return Object.freeze(list.map((value, index2) => typeof value === "string" && value.length > 0 ? value : `target${index2}`));
}
function detectRigProfile(document) {
  if (document.skins !== undefined && document.skins.length > 0)
    return true;
  if (document.nodes.some((node) => node.skin !== undefined))
    return true;
  if (document.meshes.some((mesh) => mesh.weights !== undefined || mesh.primitives.some((primitive) => primitive.targets !== undefined && primitive.targets.length > 0 || primitive.attributes.JOINTS_0 !== undefined || primitive.attributes.WEIGHTS_0 !== undefined)))
    return true;
  if (document.animations.some((clip) => clip.channels.some((channel) => channel.target.path === "weights")))
    return true;
  return false;
}
function rejectStaticRigFields(document, hasRig) {
  if (hasRig)
    return;
  if (document.skins !== undefined)
    fail("Static GLB profile does not support skins.", "skins");
  if (document.nodes.some((node) => node.skin !== undefined))
    fail("Static GLB profile does not support skinned nodes.", "nodes");
  if (document.meshes.some((mesh) => mesh.weights !== undefined || mesh.primitives.some((primitive) => primitive.targets !== undefined || primitive.attributes.JOINTS_0 !== undefined || primitive.attributes.WEIGHTS_0 !== undefined)))
    fail("Static GLB profile does not support morph targets or skinning attributes.", "meshes");
  if (document.animations.some((clip) => clip.channels.some((channel) => channel.target.path === "weights")))
    fail("Static GLB profile does not support weights animation.", "animations");
}
function hierarchy(document) {
  const parents = document.nodes.map(() => null);
  for (const [index2, node] of document.nodes.entries()) {
    nodeTransform(node, `nodes.${index2}`);
    if (node.mesh !== undefined)
      at(document.meshes, node.mesh, `nodes.${index2}.mesh`);
    if (node.skin !== undefined) {
      if (node.mesh === undefined)
        fail("Skin reference requires a mesh on the same node.", `nodes.${index2}.skin`);
      if (document.skins === undefined)
        fail("Skin reference requires a declared skins array.", `nodes.${index2}.skin`);
      const skin = at(document.skins, node.skin, `nodes.${index2}.skin`);
      for (const joint of skin.joints)
        at(document.nodes, joint, `skins.${node.skin}.joints`);
    }
    const seen2 = new Set;
    for (const child of node.children) {
      at(document.nodes, child, `nodes.${index2}.children`);
      if (seen2.has(child) || parents[child] !== null)
        fail("Nodes may have only one parent and unique child references.", `nodes.${index2}`);
      seen2.add(child);
      parents[child] = index2;
    }
  }
  const roots = document.nodes.map((_, index2) => index2).filter((index2) => parents[index2] === null);
  const order = [], seen = new Set, pending = [...roots];
  while (pending.length) {
    const index2 = pending.pop();
    if (seen.has(index2))
      fail("Node hierarchy contains a cycle.");
    seen.add(index2);
    order.push(index2);
    pending.push(...document.nodes[index2].children);
  }
  if (seen.size !== document.nodes.length)
    fail("Node hierarchy contains a cycle.");
  for (const scene2 of document.scenes) {
    const unique2 = new Set;
    for (const index2 of scene2.nodes) {
      at(document.nodes, index2, "scenes.nodes");
      if (parents[index2] !== null || unique2.has(index2))
        fail("Scene roots must be unique nodes without parents.");
      unique2.add(index2);
    }
  }
  if (document.scene === undefined && document.scenes.length !== 1)
    fail("Multiple scenes require an explicit glTF default scene.");
  const scene = at(document.scenes, document.scene ?? 0, "scene");
  const reachable = new Set, visit = [...scene.nodes];
  while (visit.length) {
    const index2 = visit.pop();
    reachable.add(index2);
    visit.push(...document.nodes[index2].children);
  }
  return { parents: Object.freeze(parents), order: Object.freeze(order), reachable };
}
function validateSkinHierarchy(document, parents, reachable) {
  for (const [skinIndex, skin] of (document.skins ?? []).entries()) {
    for (const joint of skin.joints) {
      if (!reachable.has(joint))
        fail("Every skin joint must belong to the selected default scene.", `skins.${skinIndex}.joints`);
      if (skin.skeleton === undefined)
        continue;
      let current = joint;
      while (current !== null && current !== skin.skeleton)
        current = parents[current];
      if (current === null)
        fail("The declared skeleton must be an ancestor of every skin joint.", `skins.${skinIndex}.skeleton`);
    }
  }
}
function validateSkinBindings(document, meshPrimitives, skins) {
  if (detectRigProfile(document) && skins.length === 0)
    fail("The rigged GLB profile requires at least one declared skin.", "skins");
  for (const [nodeIndex, node] of document.nodes.entries()) {
    if (node.mesh === undefined) {
      if (node.skin !== undefined)
        fail("A skinned node must reference a mesh.", `nodes.${nodeIndex}.skin`);
      continue;
    }
    const mesh = meshPrimitives[node.mesh];
    if (node.skin === undefined) {
      if (mesh.some((primitive) => primitive.jointIndices !== undefined))
        fail("Skinning attributes require an explicit skin on every mesh instance.", `nodes.${nodeIndex}.mesh`);
      continue;
    }
    const skin = skins[node.skin];
    if (skin === undefined)
      fail("Skinned node references a missing skin.", `nodes.${nodeIndex}.skin`);
    for (const [primitiveIndex, primitive] of mesh.entries()) {
      const path = `nodes.${nodeIndex}.mesh.primitives.${primitiveIndex}`;
      if (primitive.jointIndices === undefined || primitive.jointWeights === undefined)
        fail("Skinned mesh primitives must declare JOINTS_0 and WEIGHTS_0.", path);
      for (const joint of primitive.jointIndices)
        if (joint < 0 || joint >= skin.joints.length)
          fail("JOINTS_0 index exceeds the skin joint count.", path);
    }
  }
}
function animationDurations(document, accessors) {
  let totalChannels = 0;
  return Object.freeze(document.animations.map((clip, clipIndex) => {
    totalChannels += clip.channels.length;
    if (totalChannels > SPATIAL_GLB_LIMITS.channels)
      fail("Animation channel budget exceeded.");
    let duration = 0;
    for (const sampler of clip.samplers) {
      const input = at(accessors, sampler.input, "animation input"), output = at(accessors, sampler.output, "animation output");
      if (input.source.type !== "SCALAR" || input.source.componentType !== 5126 || input.source.normalized || input.source.count > SPATIAL_GLB_LIMITS.animationKeys || input.source.min === undefined || input.source.max === undefined)
        fail("Animation input requires bounded float32 scalar seconds with min/max.");
      if (output.source.componentType !== 5126 || output.source.normalized)
        fail("Animation output must be float32.");
      for (const accessor of [input, output]) {
        const view = document.bufferViews[accessor.source.bufferView];
        if (view.byteStride !== undefined || view.target !== undefined)
          fail("Animation data must be tightly packed without a GPU buffer target.");
      }
      let previous = -1;
      for (const time of input.values) {
        if (time < 0 || time <= previous || time > SPATIAL_GLB_LIMITS.durationSeconds)
          fail("Animation times must be strictly ordered nonnegative seconds within the duration profile.");
        previous = time;
      }
      duration = Math.max(duration, previous);
    }
    const writers = new Set;
    for (const channel of clip.channels) {
      const node = at(document.nodes, channel.target.node, "animation target");
      if (node.matrix)
        fail("Animated nodes must use TRS, never a matrix.");
      const key2 = `${channel.target.node}:${channel.target.path}`;
      if (writers.has(key2))
        fail("Animation has multiple writers for one node property.", `animations.${clipIndex}`);
      writers.add(key2);
      const sampler = at(clip.samplers, channel.sampler, "animation sampler");
      const input = accessors[sampler.input], output = accessors[sampler.output];
      if (channel.target.path === "weights") {
        const meshIndex = node.mesh ?? fail("Weights animation requires a mesh node target.", `animations.${clipIndex}.channels`);
        const targetCount = primitiveTargetCount(document.meshes[meshIndex], meshIndex);
        if (targetCount === 0)
          fail("Weights animation requires morph targets.", `animations.${clipIndex}.channels`);
        if (output.source.type !== "SCALAR" || output.source.count !== input.source.count * targetCount)
          fail("Weights animation output must be scalar with input.count * morphTargetCount values.", `animations.${clipIndex}.channels`);
        if (output.values.some((value) => value < 0 || value > 1 || !Number.isFinite(value)))
          fail("Morph weights must be unit values.", `animations.${clipIndex}.channels`);
      } else {
        if (output.source.type !== (channel.target.path === "rotation" ? "VEC4" : "VEC3") || output.source.count !== input.source.count)
          fail("Animation output arity does not match its target property.");
        if (channel.target.path === "rotation")
          for (let i = 0;i < output.values.length; i += 4)
            normalizedRotation(output.values.slice(i, i + 4), "animation rotation");
        else if (output.values.some((value) => Math.abs(value) > 1e6 || channel.target.path === "scale" && value === 0))
          fail("Animation transform values are unbounded or singular.");
        if (channel.target.path === "scale" && sampler.interpolation === "LINEAR") {
          for (let i = 3;i < output.values.length; i++)
            if (Math.sign(output.values[i]) !== Math.sign(output.values[i - 3]))
              fail("Linear scale animation crosses a singular transform.");
        }
      }
    }
    return duration;
  }));
}

class SpatialGlbModel {
  profile;
  nodeCount;
  clipDurationsSeconds;
  materialFacts;
  rigFacts;
  #state;
  constructor(state) {
    this.#state = state;
    this.profile = state.profile;
    this.nodeCount = state.document.nodes.length;
    this.clipDurationsSeconds = state.clipDurations;
    this.materialFacts = state.materialFacts;
    this.rigFacts = state.rigFacts;
    Object.freeze(this);
  }
  static parse(input) {
    if (!(input instanceof Uint8Array) || input.byteLength < 28 || input.byteLength > SPATIAL_GLB_LIMITS.bytes || input.buffer instanceof SharedArrayBuffer)
      fail("Expected bounded, non-shared GLB bytes.");
    const bytes = Uint8Array.from(input);
    const header = new DataView(bytes.buffer);
    if (header.getUint32(0, true) !== 1179937895 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.length)
      fail("Invalid GLB 2.0 header or total length.");
    const jsonLength = header.getUint32(12, true);
    if (header.getUint32(16, true) !== 1313821514 || jsonLength % 4 !== 0 || jsonLength < 4 || jsonLength > SPATIAL_GLB_LIMITS.jsonBytes || 20 + jsonLength + 8 > bytes.length)
      fail("Expected bounded first JSON chunk and following BIN chunk.");
    const binHeader = 20 + jsonLength, binLength = header.getUint32(binHeader, true);
    if (header.getUint32(binHeader + 4, true) !== 5130562 || binLength % 4 !== 0 || binHeader + 8 + binLength !== bytes.length)
      fail("Expected exactly one BIN chunk and no trailing chunks.");
    let json;
    try {
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, binHeader)));
    } catch {
      return fail("GLB JSON must be valid UTF-8 JSON.");
    }
    const document = schemaValue(gltfSchema, json, "gltf");
    validateExtensions(document);
    const payloadLength = document.buffers[0].byteLength;
    if (payloadLength > binLength || binLength - payloadLength > 3)
      fail("Declared BIN length does not match its padding.");
    const binary = bytes.subarray(binHeader + 8);
    if (binary.subarray(payloadLength).some((byte) => byte !== 0))
      fail("BIN padding must contain zero bytes.");
    const hasRig = detectRigProfile(document);
    rejectStaticRigFields(document, hasRig);
    validateViewRoles(document);
    const accessors = readAccessors(document, binary);
    const sources = materials(document);
    const meshPrimitives = readMeshes(document, accessors, sources);
    const skins = readSkins(document, accessors);
    validateSkinBindings(document, meshPrimitives, skins);
    const graph = hierarchy(document);
    validateSkinHierarchy(document, graph.parents, graph.reachable);
    const clipDurations = animationDurations(document, accessors);
    let totalImageBytes = 0, totalPixels = 0;
    const images = document.images.map((image, imageIndex) => {
      const view = at(document.bufferViews, image.bufferView, "images.bufferView");
      if (view.byteStride !== undefined || view.target !== undefined || view.byteLength > SPATIAL_GLB_LIMITS.imageBytes)
        fail("Embedded images require bounded untargeted byte views.");
      totalImageBytes += view.byteLength;
      if (totalImageBytes > SPATIAL_GLB_LIMITS.imageTotalBytes)
        fail("Embedded image byte budget exceeded.");
      const imageBytes = binary.slice(view.byteOffset, view.byteOffset + view.byteLength);
      const dimensions2 = imageHeader(imageBytes, image.mimeType);
      totalPixels += dimensions2.width * dimensions2.height;
      if (totalPixels > SPATIAL_GLB_LIMITS.imagePixels)
        fail("Embedded decoded image pixel budget exceeded.");
      return Object.freeze({ imageIndex, mimeType: image.mimeType, ...dimensions2, bytes: imageBytes });
    });
    const profile = hasRig ? SPATIAL_GLB_RIGGED_PROFILE : SPATIAL_GLB_PROFILE;
    const rigFactsValue = hasRig ? rigFacts(document, skins, clipDurations) : undefined;
    return new SpatialGlbModel({ document: deepFreezeJson(document), accessors, meshPrimitives, materialFacts: materialFacts(document, sources), images: Object.freeze(images), ...graph, clipDurations, profile, skins, rigFacts: rigFactsValue });
  }
  evaluate(input) {
    const options = schemaValue(optionsSchema, input, "glb evaluation");
    const state = this.#state, document = state.document;
    if (options.nodeIndex !== undefined && !state.reachable.has(options.nodeIndex))
      fail("Selected node is absent from the default scene.", "nodeIndex");
    let sourceTimeSeconds = null;
    const animated = new Map;
    const animatedWeights = new Map;
    if (options.clip !== undefined) {
      const clip = at(document.animations, options.clip.index, "clip.index");
      const duration = state.clipDurations[options.clip.index];
      const requested = (options.timeUs + options.clip.offsetUs) / 1e6;
      if (options.clip.offsetUs / 1e6 > duration)
        fail("Clip source offset exceeds its duration.");
      if (options.clip.playback === "once" && requested > duration)
        fail("Once clip playback exceeds its duration.");
      sourceTimeSeconds = options.clip.playback === "loop" ? duration === 0 ? 0 : requested % duration : Math.min(requested, duration);
      for (const channel of clip.channels) {
        const sampler = clip.samplers[channel.sampler], times = state.accessors[sampler.input].values, output = state.accessors[sampler.output];
        let lower = 0, upper = times.length - 1;
        if (sourceTimeSeconds <= times[0])
          upper = 0;
        else if (sourceTimeSeconds >= times[upper])
          lower = upper;
        else
          while (upper - lower > 1) {
            const middle = Math.floor((lower + upper) / 2);
            if (times[middle] <= sourceTimeSeconds)
              lower = middle;
            else
              upper = middle;
          }
        const left = output.values.slice(lower * output.components, (lower + 1) * output.components);
        let value = left;
        if (sampler.interpolation === "LINEAR" && upper !== lower) {
          const right = output.values.slice(upper * output.components, (upper + 1) * output.components);
          const t = (sourceTimeSeconds - times[lower]) / (times[upper] - times[lower]);
          value = channel.target.path === "rotation" ? slerpQuaternion(left, right, t) : left.map((part, index2) => part + (right[index2] - part) * t);
        }
        if (channel.target.path === "weights") {
          animatedWeights.set(channel.target.node, Object.freeze(value.map((value2) => Math.max(0, Math.min(1, value2)))));
        } else {
          const pose = animated.get(channel.target.node) ?? {};
          if (channel.target.path === "rotation")
            pose.rotation = normalizedRotation(value, "evaluated clip rotation");
          else
            pose[channel.target.path] = value;
          animated.set(channel.target.node, pose);
        }
      }
    }
    const rotation = options.sourceUp === "x" ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : options.sourceUp === "z" ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1];
    const conversion = composeTransform({ position: [0, 0, 0], rotation, scale: [options.metersPerUnit, options.metersPerUnit, options.metersPerUnit] });
    const matrices = new Map;
    for (const index2 of state.order) {
      const node = document.nodes[index2], overrides = animated.get(index2);
      const local = overrides ? nodeTransform({ ...node, ...overrides }, `nodes.${index2}`) : nodeTransform(node, `nodes.${index2}`);
      const parent = state.parents[index2];
      matrices.set(index2, multiplyTransforms(parent === null ? conversion : matrices.get(parent), local));
    }
    const selected = new Set;
    if (options.nodeIndex === undefined)
      for (const index2 of state.reachable)
        selected.add(index2);
    else {
      const pending = [options.nodeIndex];
      while (pending.length) {
        const index2 = pending.pop();
        selected.add(index2);
        pending.push(...document.nodes[index2].children);
      }
    }
    const primitives = [], imageIds = new Set;
    let triangles = 0;
    for (const sourceNodeIndex of [...selected].sort((a, b) => a - b)) {
      const node = document.nodes[sourceNodeIndex];
      if (node.mesh === undefined)
        continue;
      const nodeWorld = safeMatrix(matrices.get(sourceNodeIndex), `nodes.${sourceNodeIndex}`);
      for (const [sourcePrimitiveIndex, primitive] of state.meshPrimitives[node.mesh].entries()) {
        if (primitives.length >= SPATIAL_GLB_LIMITS.primitives)
          fail("Instanced primitive budget exceeded.");
        triangles += (primitive.indices?.length ?? primitive.positions.length / 3) / 3;
        if (triangles > SPATIAL_GLB_LIMITS.triangles)
          fail("Instanced triangle budget exceeded.");
        const morphWeights = options.morphWeights ?? animatedWeights.get(sourceNodeIndex) ?? primitive.weights;
        const skin = node.skin !== undefined ? state.skins[node.skin] : undefined;
        const deformed = deformPrimitive(primitive, morphWeights, skin, nodeWorld, matrices);
        const { material, positions: _positions, normals: _normals, morphTargets: _morphTargets, weights: _weights, jointIndices: _jointIndices, jointWeights: _jointWeights, ...geometry } = primitive;
        if (options.materialMode === "source") {
          for (const texture of allMaterialTextures(material)) {
            if (texture !== undefined)
              imageIds.add(texture.imageIndex);
          }
        }
        primitives.push(Object.freeze({ ...geometry, positions: deformed.positions, ...deformed.normals === undefined ? {} : { normals: deformed.normals }, matrix: nodeWorld, bounds: deformed.bounds, sourceNodeIndex, sourcePrimitiveIndex, ...options.materialMode === "source" ? { material } : {} }));
      }
    }
    if (primitives.length === 0)
      fail("Selected scene or subtree contains no triangle geometry.");
    const bounds = combineBounds(primitives.map((primitive) => primitive.bounds));
    const images = [...imageIds].sort((a, b) => a - b).map((index2) => {
      const image = state.images[index2];
      return Object.freeze({ ...image, bytes: image.bytes.slice() });
    });
    const profile = state.profile;
    return Object.freeze({ profile, primitives: deepFreezeJson(primitives), images: Object.freeze(images), bounds, sourceTimeSeconds });
  }
  jointWorldMatrix(input, jointNodeIndex) {
    const options = schemaValue(optionsSchema, input, "glb evaluation");
    if (jointNodeIndex < 0 || jointNodeIndex >= this.nodeCount)
      fail("Joint node index is out of range.", "jointNodeIndex");
    const state = this.#state, document = state.document;
    const animated = new Map;
    let sourceTimeSeconds = null;
    if (options.clip !== undefined) {
      const clip = at(document.animations, options.clip.index, "clip.index");
      const duration = state.clipDurations[options.clip.index];
      const requested = (options.timeUs + options.clip.offsetUs) / 1e6;
      if (options.clip.offsetUs / 1e6 > duration)
        fail("Clip source offset exceeds its duration.");
      if (options.clip.playback === "once" && requested > duration)
        fail("Once clip playback exceeds its duration.");
      sourceTimeSeconds = options.clip.playback === "loop" ? duration === 0 ? 0 : requested % duration : Math.min(requested, duration);
      for (const channel of clip.channels) {
        if (channel.target.path === "weights")
          continue;
        const sampler = clip.samplers[channel.sampler], times = state.accessors[sampler.input].values, output = state.accessors[sampler.output];
        let lower = 0, upper = times.length - 1;
        if (sourceTimeSeconds <= times[0])
          upper = 0;
        else if (sourceTimeSeconds >= times[upper])
          lower = upper;
        else
          while (upper - lower > 1) {
            const middle = Math.floor((lower + upper) / 2);
            if (times[middle] <= sourceTimeSeconds)
              lower = middle;
            else
              upper = middle;
          }
        const left = output.values.slice(lower * output.components, (lower + 1) * output.components);
        let value = left;
        if (sampler.interpolation === "LINEAR" && upper !== lower) {
          const right = output.values.slice(upper * output.components, (upper + 1) * output.components);
          const t = (sourceTimeSeconds - times[lower]) / (times[upper] - times[lower]);
          value = channel.target.path === "rotation" ? slerpQuaternion(left, right, t) : left.map((part, index2) => part + (right[index2] - part) * t);
        }
        const pose = animated.get(channel.target.node) ?? {};
        if (channel.target.path === "rotation")
          pose.rotation = normalizedRotation(value, "evaluated clip rotation");
        else
          pose[channel.target.path] = value;
        animated.set(channel.target.node, pose);
      }
    }
    const rotation = options.sourceUp === "x" ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : options.sourceUp === "z" ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1];
    const conversion = composeTransform({ position: [0, 0, 0], rotation, scale: [options.metersPerUnit, options.metersPerUnit, options.metersPerUnit] });
    const matrices = new Map;
    for (const index2 of state.order) {
      const node = document.nodes[index2], overrides = animated.get(index2);
      const local = overrides ? nodeTransform({ ...node, ...overrides }, `nodes.${index2}`) : nodeTransform(node, `nodes.${index2}`);
      const parent = state.parents[index2];
      matrices.set(index2, multiplyTransforms(parent === null ? conversion : matrices.get(parent), local));
    }
    return safeMatrix(matrices.get(jointNodeIndex), "jointWorldMatrix");
  }
}
function combineBounds(bounds) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const bound of bounds)
    for (let axis = 0;axis < 3; axis++) {
      min[axis] = Math.min(min[axis], bound.min[axis]);
      max[axis] = Math.max(max[axis], bound.max[axis]);
    }
  return deepFreezeJson({ min, max });
}
function deformPrimitive(primitive, morphWeights, skin, nodeWorld, nodeMatrices) {
  const positions = applyMorphWeights(primitive.positions, primitive.morphTargets.map((target) => target.positionDeltas), morphWeights);
  let normals;
  if (primitive.normals !== undefined) {
    const morphed = applyMorphWeights(primitive.normals, primitive.morphTargets.map((target) => target.normalDeltas), morphWeights);
    normals = normalizeVectors(morphed);
  }
  if (skin === undefined) {
    const bounds2 = transformVertexBounds(positions, primitive.indices, nodeWorld);
    return normals === undefined ? { positions, bounds: bounds2 } : { positions, normals, bounds: bounds2 };
  }
  const deformedPositions = [], deformedNormals = [];
  const hasNormals = normals !== undefined, meshInverse = invertTransform(nodeWorld);
  for (let vertex = 0;vertex < positions.length / 3; vertex++) {
    const skinMatrix = computeSkinMatrix(vertex, primitive, skin, nodeMatrices, meshInverse);
    const position = transformPoint(skinMatrix, [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]]);
    deformedPositions.push(position[0], position[1], position[2]);
    if (hasNormals) {
      const n = transformNormal(skinMatrix, [normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]]);
      const len = Math.hypot(n[0], n[1], n[2]);
      deformedNormals.push(len === 0 ? 0 : n[0] / len, len === 0 ? 0 : n[1] / len, len === 0 ? 0 : n[2] / len);
    }
  }
  const frozenPositions = Object.freeze(deformedPositions), bounds = transformVertexBounds(frozenPositions, primitive.indices, nodeWorld);
  return hasNormals ? { positions: frozenPositions, normals: Object.freeze(deformedNormals), bounds } : { positions: frozenPositions, bounds };
}
function applyMorphWeights(base, deltas, weights) {
  if (deltas.length === 0 || weights.length === 0)
    return base;
  const out = base.slice();
  for (let target = 0;target < deltas.length; target++) {
    const weight = weights[target] ?? 0;
    if (weight === 0 || deltas[target] === undefined)
      continue;
    const delta = deltas[target];
    for (let index2 = 0;index2 < out.length; index2++)
      out[index2] = out[index2] + weight * (delta[index2] ?? 0);
  }
  return Object.freeze(out);
}
function normalizeVectors(values2) {
  const out = [];
  for (let index2 = 0;index2 < values2.length; index2 += 3) {
    const len = Math.hypot(values2[index2], values2[index2 + 1], values2[index2 + 2]);
    out.push(len === 0 ? 0 : values2[index2] / len, len === 0 ? 0 : values2[index2 + 1] / len, len === 0 ? 0 : values2[index2 + 2] / len);
  }
  return Object.freeze(out);
}
function transformNormal(matrix2, normal) {
  const inverse = invertTransform(matrix2);
  return [
    inverse[0] * normal[0] + inverse[1] * normal[1] + inverse[2] * normal[2],
    inverse[4] * normal[0] + inverse[5] * normal[1] + inverse[6] * normal[2],
    inverse[8] * normal[0] + inverse[9] * normal[1] + inverse[10] * normal[2]
  ];
}
function transformVertexBounds(positions, indices, matrix2) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  const count = indices?.length ?? positions.length / 3;
  for (let index2 = 0;index2 < count; index2++) {
    const offset = (indices?.[index2] ?? index2) * 3;
    const point = transformPoint(matrix2, [positions[offset], positions[offset + 1], positions[offset + 2]]);
    for (let axis = 0;axis < 3; axis++) {
      low[axis] = Math.min(low[axis], point[axis]);
      high[axis] = Math.max(high[axis], point[axis]);
    }
  }
  return deepFreezeJson({ min: low, max: high });
}
function computeSkinMatrix(vertex, primitive, skin, nodeMatrices, meshInverse) {
  const jointIndices = primitive.jointIndices;
  const jointWeights = primitive.jointWeights;
  const entries = new Array(16).fill(0);
  for (let influence = 0;influence < 4; influence++) {
    const weight = jointWeights[vertex * 4 + influence];
    if (weight === 0)
      continue;
    const jointNode = skin.joints[jointIndices[vertex * 4 + influence]];
    const jointWorld = nodeMatrices.get(jointNode);
    if (jointWorld === undefined)
      fail(`Joint node ${jointNode} missing from hierarchy.`, "skin");
    const matrixIndex = skin.matrixIndexByJointNode.get(jointNode);
    if (matrixIndex === undefined)
      fail(`Joint node ${jointNode} is not in skin joints.`, "skin");
    const inverseBindMatrix = skin.inverseBindMatrices.slice(matrixIndex * 16, matrixIndex * 16 + 16);
    const jointMatrix = multiplyTransforms(meshInverse, multiplyTransforms(jointWorld, inverseBindMatrix));
    for (let entry = 0;entry < 16; entry++)
      entries[entry] = entries[entry] + weight * jointMatrix[entry];
  }
  entries[15] = 1;
  return Object.freeze(entries);
}
function parseSpatialGlb(bytes) {
  return SpatialGlbModel.parse(bytes);
}
function evaluateSpatialGlb(model, options) {
  if (!(model instanceof SpatialGlbModel))
    fail("Evaluation requires a parsed GLB model.");
  return model.evaluate(options);
}
function spatialGlbBounds(model) {
  return evaluateSpatialGlb(model, { metersPerUnit: 1, sourceUp: "y", timeUs: 0 }).bounds;
}

// src/spatial-scene/asset-admission.ts
import { z as z4 } from "zod";
var boundsComponent = z4.number().finite().min(-1000000000000000000).max(1000000000000000000);
var boundsVector = z4.tuple([boundsComponent, boundsComponent, boundsComponent]);
var SpatialBoundsSchema = z4.strictObject({ min: boundsVector, max: boundsVector }).refine((value) => value.min.every((component, index2) => component <= value.max[index2]), "Bounds min must not exceed max.");
var factsUnit = z4.number().finite().min(0).max(1);
var SpatialAssetMaterialFactSchema = z4.strictObject({
  name: z4.string().max(1024).optional(),
  alphaMode: z4.enum(["OPAQUE", "MASK", "BLEND"]),
  doubleSided: z4.boolean(),
  maps: z4.array(z4.enum(["baseColor", "metallicRoughness", "normal", "occlusion", "emissive", "clearcoat", "clearcoatRoughness", "clearcoatNormal", "transmission", "sheenColor", "sheenRoughness", "anisotropy"])).max(12),
  textureTransforms: z4.array(z4.strictObject({ map: z4.string().min(1).max(64), offset: z4.tuple([z4.number().finite(), z4.number().finite()]), rotation: z4.number().finite().min(-Math.PI).max(Math.PI), scale: z4.tuple([z4.number().finite(), z4.number().finite()]) })).max(12).default([]),
  emissiveLinear: z4.tuple([factsUnit, factsUnit, factsUnit]).optional(),
  emissiveStrength: z4.number().finite().min(0).max(1e5).optional(),
  clearcoat: z4.strictObject({ factor: factsUnit, roughness: factsUnit }).optional(),
  transmission: z4.strictObject({ factor: factsUnit }).optional(),
  sheen: z4.strictObject({ colorLinear: z4.tuple([factsUnit, factsUnit, factsUnit]), roughness: factsUnit }).optional(),
  anisotropy: z4.strictObject({ strength: z4.number().finite().min(-1).max(1), rotation: z4.number().finite().min(0).max(2 * Math.PI) }).optional(),
  ior: z4.number().finite().min(1).max(5).optional()
});
var SpatialAssetRigFactsSchema = z4.strictObject({
  profile: z4.literal(SPATIAL_GLB_RIGGED_PROFILE),
  skins: z4.array(z4.strictObject({
    name: z4.string().max(1024).optional(),
    jointNodeIndices: z4.array(z4.number().int().min(0).max(SPATIAL_GLB_LIMITS.nodes - 1)).min(1).max(SPATIAL_GLB_LIMITS.jointsPerSkin),
    inverseBindMatricesAccessor: z4.number().int().min(0).max(SPATIAL_GLB_LIMITS.accessors - 1)
  })).min(1).max(SPATIAL_GLB_LIMITS.skins),
  morphTargets: z4.array(z4.array(z4.array(z4.strictObject({
    name: z4.string().min(1).max(1024),
    hasPosition: z4.boolean(),
    hasNormal: z4.boolean()
  })).max(SPATIAL_GLB_LIMITS.morphTargetsPerPrimitive)).max(SPATIAL_GLB_LIMITS.primitives)).max(SPATIAL_GLB_LIMITS.meshes),
  clips: z4.array(z4.strictObject({
    name: z4.string().max(1024).optional(),
    durationSeconds: z4.number().finite().min(0).max(SPATIAL_GLB_LIMITS.durationSeconds),
    channels: z4.array(z4.strictObject({
      nodeIndex: z4.number().int().min(0).max(SPATIAL_GLB_LIMITS.nodes - 1),
      path: z4.enum(["translation", "rotation", "scale", "weights"])
    })).max(SPATIAL_GLB_LIMITS.channels)
  })).max(SPATIAL_GLB_LIMITS.clips)
});
var SpatialAssetFactsV1Schema = z4.strictObject({
  kind: z4.literal("slopcamera.spatial-asset-facts"),
  schemaVersion: z4.literal(1),
  subject: SpatialPayloadSchema,
  subjectManifestSha256: SpatialDigestSchema,
  profile: z4.enum([SPATIAL_GLB_PROFILE, SPATIAL_GLB_PROFILE_V1, SPATIAL_GLB_RIGGED_PROFILE]),
  nodeCount: z4.number().int().min(1).max(SPATIAL_GLB_LIMITS.nodes),
  clipDurationsSeconds: z4.array(z4.number().finite().min(0).max(SPATIAL_GLB_LIMITS.durationSeconds)).max(SPATIAL_GLB_LIMITS.clips),
  bounds: z4.strictObject({ modelSpace: SpatialBoundsSchema, sceneSpace: SpatialBoundsSchema }),
  materials: z4.array(SpatialAssetMaterialFactSchema).max(SPATIAL_GLB_LIMITS.materials).optional(),
  rig: SpatialAssetRigFactsSchema.optional()
}).superRefine((facts, context) => {
  if (facts.profile === SPATIAL_GLB_RIGGED_PROFILE !== (facts.rig !== undefined))
    context.addIssue({ code: "custom", path: ["rig"], message: "Rig facts must be present exactly for the rigged GLB profile." });
});
var SpatialPublishedArtifactSchema = z4.strictObject({
  path: z4.string().min(1).max(1024),
  sha256: SpatialDigestSchema,
  bytes: z4.number().int().safe().min(1).max(SPATIAL_GLB_LIMITS.bytes),
  disposition: z4.enum(["created", "exists"])
});
var SpatialAssetAdmissionV1Schema = z4.strictObject({
  kind: z4.literal("slopcamera.spatial-asset-admission"),
  schemaVersion: z4.literal(1),
  manifest: SpatialAssetManifestSchema,
  factsManifest: SpatialAssetManifestSchema,
  facts: SpatialAssetFactsV1Schema,
  bounds: z4.strictObject({ modelSpace: SpatialBoundsSchema, sceneSpace: SpatialBoundsSchema }),
  entity: SpatialEntitySchema,
  artifacts: z4.strictObject({ payload: SpatialPublishedArtifactSchema, facts: SpatialPublishedArtifactSchema }),
  operations: z4.array(SpatialPatchOperationSchema).min(2).max(SPATIAL_SCENE_LIMITS.patchOperations)
});

// src/spatial-scene/evaluate.ts
import { z as z5 } from "zod";
var EvaluatedOptionsSchema = z5.strictObject({
  timeUs: SpatialTimeUsSchema,
  cameraId: SpatialCameraIdSchema,
  overrides: z5.array(SpatialOverrideSchema).max(SPATIAL_SCENE_LIMITS.entities).optional(),
  cameraPoseOverride: SpatialPoseSchema.optional()
});
function mergeSpatialOverrides(sceneOverrides, shotOverrides) {
  const effective = new Map(sceneOverrides.map((override) => [`${override.entityId}:${override.property}`, override]));
  const seen = new Set;
  for (const override of shotOverrides) {
    const key2 = `${override.entityId}:${override.property}`;
    if (seen.has(key2))
      throw new SpatialSceneError("conflict", `Duplicate shot override ${key2}.`, "shot.overrides");
    seen.add(key2);
    effective.set(key2, override);
  }
  return deepFreezeJson(sortSpatialBy([...effective.values()], (item) => `${item.entityId}:${item.property}`));
}
function applySpatialEntityOverride(entity, override) {
  if (!spatialPropertySupported(entity, override.property))
    throw new SpatialSceneError("conflict", `Unsupported override ${entity.entityId}.${override.property}.`);
  if (override.property === "transform")
    return { ...entity, transform: override.value };
  if (override.property === "color") {
    const color3 = override.value.toLowerCase();
    if (entity.kind === "mesh")
      return { ...entity, material: { ...entity.material, color: color3 } };
    if (entity.kind === "text" || entity.kind === "light")
      return { ...entity, color: color3 };
  }
  if (override.property === "opacity") {
    if (entity.kind === "mesh")
      return { ...entity, material: { ...entity.material, opacity: override.value } };
    if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video")
      return { ...entity, opacity: override.value };
  }
  throw new SpatialSceneError("conflict", `Unsupported override ${entity.entityId}.${override.property}.`);
}
function sampleChannel(channel, timeUs) {
  const keys = channel.keys;
  if (timeUs <= keys[0].timeUs)
    return keys[0].value;
  if (timeUs >= keys[keys.length - 1].timeUs)
    return keys[keys.length - 1].value;
  let lower = 0, upper = keys.length - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (keys[middle].timeUs <= timeUs)
      lower = middle;
    else
      upper = middle;
  }
  const a = keys[lower], b = keys[upper];
  if (channel.interpolation === "step")
    return a.value;
  const t = (timeUs - a.timeUs) / (b.timeUs - a.timeUs);
  if (channel.property === "rotation") {
    return slerpQuaternion(channel.keys[lower].value, channel.keys[upper].value, t);
  }
  if (typeof a.value === "number" && typeof b.value === "number")
    return a.value + (b.value - a.value) * t;
  const av = a.value, bv = b.value;
  return av.map((value, index2) => value + (bv[index2] - value) * t);
}
function validateSpatialShot(sceneInput, shotInput) {
  const context = createSpatialEvaluationContext(sceneInput);
  const scene = context.scene;
  const shot = parseSpatialValue(SpatialShotV1Schema, shotInput, "shot");
  if (shot.sceneSha256 !== context.sceneSha256)
    throw new SpatialSceneError("conflict", "Shot pins another scene revision.", "shot.sceneSha256");
  if (!context.camerasById.has(shot.cameraId))
    throw new SpatialSceneError("invalid-data", "Shot camera is absent from its scene.", "shot.cameraId");
  if (shot.sceneStartUs >= scene.durationUs)
    throw new SpatialSceneError("invalid-data", "Shot scene start must precede scene duration.", "shot.sceneStartUs");
  if (shot.playback === "once" && shot.sceneStartUs + shot.range.endUs - shot.range.startUs > scene.durationUs)
    throw new SpatialSceneError("invalid-data", "Once playback exceeds scene duration.", "shot.range");
  validateSpatialOverrides(scene, mergeSpatialOverrides(scene.overrides, shot.overrides));
  if (shot.cameraPoseOverride && context.cameraChannelsById.has(shot.cameraId))
    throw new SpatialSceneError("conflict", "Camera animation and shot pose override both own camera pose.", "shot.cameraPoseOverride");
  return deepFreezeJson(shot);
}
function createSpatialEvaluationContext(sceneInput) {
  const scene = parseSpatialScene(sceneInput);
  const entitiesById = new Map(scene.entities.map((entity) => [entity.entityId, entity]));
  const camerasById = new Map(scene.cameras.map((camera2) => [camera2.cameraId, camera2]));
  const entityOrder = spatialTopologicalIds(new Map(scene.entities.map((entity) => [entity.entityId, entity.parentId === null ? [] : [entity.parentId]])), "entity hierarchy");
  const visibilityById = new Map;
  for (const id of entityOrder) {
    const entity = entitiesById.get(id);
    visibilityById.set(id, entity.visible && (entity.parentId === null || visibilityById.get(entity.parentId) === true));
  }
  const entityChannels = [];
  const cameraChannelsById = new Map;
  for (const channel of scene.animations) {
    if (entitiesById.has(channel.targetId))
      entityChannels.push(channel);
    else {
      const list = cameraChannelsById.get(channel.targetId) ?? [];
      list.push(channel);
      cameraChannelsById.set(channel.targetId, list);
    }
  }
  return Object.freeze({
    scene,
    sceneSha256: spatialValueSha256(scene),
    entitiesById,
    camerasById,
    entityOrder,
    visibilityById,
    entityChannels,
    cameraChannelsById,
    baseOverrides: mergeSpatialOverrides(scene.overrides, []),
    assetDigests: spatialAssetClosureDigests(scene.assets)
  });
}
function evaluateSpatialSceneInContext(context, options) {
  const scene = context.scene;
  const capturedOptions = parseSpatialValue(EvaluatedOptionsSchema, options, "evaluation options");
  const timeUs = capturedOptions.timeUs;
  if (timeUs > scene.durationUs)
    throw new SpatialSceneError("invalid-data", "Evaluation time exceeds scene duration.", "timeUs");
  let camera2 = context.camerasById.get(capturedOptions.cameraId);
  if (!camera2)
    throw new SpatialSceneError("not-found", `Unknown camera ${capturedOptions.cameraId}.`, "cameraId");
  const overrides = capturedOptions.overrides === undefined ? context.baseOverrides : mergeSpatialOverrides(scene.overrides, capturedOptions.overrides);
  if (capturedOptions.overrides !== undefined)
    validateSpatialOverrides(scene, overrides);
  if (capturedOptions.cameraPoseOverride && context.cameraChannelsById.has(camera2.cameraId))
    throw new SpatialSceneError("conflict", "Camera animation conflicts with camera pose override.", "cameraPoseOverride");
  const entities = new Map(context.entitiesById);
  for (const channel of context.entityChannels) {
    const value = sampleChannel(channel, timeUs);
    const entity = entities.get(channel.targetId);
    if (channel.property === "opacity")
      entities.set(entity.entityId, applySpatialEntityOverride(entity, { entityId: entity.entityId, property: "opacity", value }));
    else
      entities.set(entity.entityId, { ...entity, transform: { ...entity.transform, [channel.property]: value } });
  }
  for (const channel of context.cameraChannelsById.get(camera2.cameraId) ?? []) {
    const value = sampleChannel(channel, timeUs);
    camera2 = { ...camera2, pose: { ...camera2.pose, [channel.property]: value } };
  }
  for (const override of overrides)
    entities.set(override.entityId, applySpatialEntityOverride(entities.get(override.entityId), override));
  if (capturedOptions.cameraPoseOverride)
    camera2 = { ...camera2, pose: capturedOptions.cameraPoseOverride };
  const matrices = new Map;
  for (const id of context.entityOrder) {
    const entity = entities.get(id);
    try {
      const local = composeTransform(entity.transform);
      matrices.set(id, entity.parentId === null ? local : multiplyTransforms(matrices.get(entity.parentId), local));
    } catch (error) {
      throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : "Invalid evaluated transform.", `entities.${id}.transform`);
    }
  }
  const evaluated = scene.entities.map((source, index2) => ({
    entity: entities.get(source.entityId),
    worldMatrix: matrices.get(source.entityId),
    visible: context.visibilityById.get(source.entityId),
    selectionId: index2 + 1
  }));
  const stateSha256 = spatialStateValueSha256({ domain: "slopcamera.spatial-state.v1", timeUs, entities: evaluated, assetDigests: context.assetDigests });
  const viewSha256 = spatialValueSha256({ domain: "slopcamera.spatial-view.v1", stateSha256, camera: camera2 });
  const result = EvaluatedSpatialSceneSchema.parse({
    kind: "slopcamera.spatial-snapshot",
    schemaVersion: 1,
    sceneSha256: context.sceneSha256,
    stateSha256,
    viewSha256,
    timeUs,
    camera: camera2,
    entities: evaluated.map((item) => ({ ...item, visible: item.visible && (item.entity.placement.kind === "world" || item.entity.placement.cameraId === camera2.cameraId) })),
    assets: scene.assets,
    ...scene.fog === undefined ? {} : { fog: scene.fog }
  });
  return deepFreezeJson(result);
}
function evaluateSpatialScene(sceneInput, options) {
  return evaluateSpatialSceneInContext(createSpatialEvaluationContext(sceneInput), options);
}

// src/spatial-scene/audit.ts
import { z as z6 } from "zod";
var SPATIAL_AUDIT_LIMITS = Object.freeze({
  samples: 64,
  defaultSamples: 9,
  findings: 1024,
  entitySamples: 65536,
  instanceSamples: 1048576,
  reportBytes: 33554432
});
var ENTITY_KINDS = ["group", "mesh", "image", "diagram", "video", "text", "light", "splat", "environment"];
var BOUNDS_UNKNOWN_REASONS = ["requires-asset-decoding", "requires-text-layout", "no-surface"];
var CONTAINED = ["full", "partial", "outside", "behind-camera", "clipped"];
var FINDING_KINDS = ["never-visible", "off-camera", "empty-scene-region", "bounds-unknown", "behind-camera-all-samples", "shadows-disabled"];
var CONTAINED_HISTOGRAM_ORDER = ["full", "partial", "outside", "clipped", "behind-camera"];
var auditVector = z6.tuple([
  z6.number().finite().min(-1000000000000).max(1000000000000),
  z6.number().finite().min(-1000000000000).max(1000000000000),
  z6.number().finite().min(-1000000000000).max(1000000000000)
]);
var SpatialAuditBoundsSchema = z6.strictObject({ min: auditVector, max: auditVector }).refine((bounds) => bounds.min.every((value, index2) => value <= bounds.max[index2]), "Bounds min must not exceed max.");
var SpatialAuditOptionsSchema = z6.strictObject({
  cameraId: SpatialCameraIdSchema,
  timesUs: z6.array(SpatialTimeUsSchema).min(1).max(SPATIAL_AUDIT_LIMITS.samples).optional(),
  assetBounds: z6.record(SpatialAssetIdSchema, SpatialAuditBoundsSchema).optional()
});
var SpatialAuditFrustumSchema = z6.strictObject({
  contained: z6.enum(CONTAINED),
  pixelFootprint: z6.number().finite().min(0).max(1000000000000000)
});
var SpatialAuditSampleSchema = z6.strictObject({
  timeUs: SpatialTimeUsSchema,
  visible: z6.boolean(),
  bounds: SpatialAuditBoundsSchema.optional(),
  frustum: SpatialAuditFrustumSchema.optional(),
  note: z6.enum(["out-of-range", "other-camera"]).optional()
});
var SpatialAuditEntitySchema = z6.strictObject({
  entityId: SpatialEntityIdSchema,
  name: z6.string().min(1).max(256),
  kind: z6.enum(ENTITY_KINDS),
  placement: SpatialPlacementSchema,
  enclosure: z6.discriminatedUnion("status", [
    z6.strictObject({ status: z6.literal("bounded") }),
    z6.strictObject({ status: z6.literal("unknown"), reason: z6.enum(BOUNDS_UNKNOWN_REASONS) })
  ]),
  samples: z6.array(SpatialAuditSampleSchema).max(SPATIAL_AUDIT_LIMITS.samples),
  instances: z6.number().int().min(1).max(SPATIAL_SCENE_LIMITS.entities).optional()
});
var SpatialAuditFindingSchema = z6.strictObject({
  severity: z6.enum(["info", "warning"]),
  kind: z6.enum(FINDING_KINDS),
  entityId: SpatialEntityIdSchema.optional(),
  timeUs: SpatialTimeUsSchema.optional(),
  detail: z6.string().min(1).max(1024)
});
var entityKindCounts = z6.strictObject({
  group: z6.number().int().min(0),
  mesh: z6.number().int().min(0),
  image: z6.number().int().min(0),
  diagram: z6.number().int().min(0),
  video: z6.number().int().min(0),
  text: z6.number().int().min(0),
  light: z6.number().int().min(0),
  splat: z6.number().int().min(0),
  environment: z6.number().int().min(0)
});
var SpatialAuditReportSchema = z6.strictObject({
  kind: z6.literal("slopcamera.spatial-audit"),
  schemaVersion: z6.literal(1),
  sceneId: SpatialSceneIdSchema,
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  durationUs: SpatialTimeUsSchema,
  timesUs: z6.array(SpatialTimeUsSchema).min(1).max(SPATIAL_AUDIT_LIMITS.samples),
  summary: z6.strictObject({
    entities: z6.strictObject({
      total: z6.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      bounded: z6.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      unknownBounds: z6.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      byKind: entityKindCounts,
      instances: z6.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities * SPATIAL_SCENE_LIMITS.entities)
    }),
    animations: z6.strictObject({
      channels: z6.number().int().min(0).max(SPATIAL_SCENE_LIMITS.channels),
      targets: z6.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities + SPATIAL_SCENE_LIMITS.cameras),
      properties: z6.strictObject({
        position: z6.number().int().min(0),
        rotation: z6.number().int().min(0),
        scale: z6.number().int().min(0),
        opacity: z6.number().int().min(0)
      })
    }),
    cameras: z6.array(SpatialCameraIdSchema).max(SPATIAL_SCENE_LIMITS.cameras),
    entitiesNeverVisible: z6.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    entitiesNeverInFrustum: z6.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities)
  }),
  entities: z6.array(SpatialAuditEntitySchema).max(SPATIAL_SCENE_LIMITS.entities),
  findings: z6.array(SpatialAuditFindingSchema).max(SPATIAL_AUDIT_LIMITS.findings),
  omittedFindings: z6.number().int().min(0)
});
function spatialEntityLocalBounds(entity, assetBounds) {
  const supplied = (assetId2) => assetBounds[assetId2] === undefined ? { status: "unknown", reason: "requires-asset-decoding" } : { status: "bounded", bounds: assetBounds[assetId2] };
  let half;
  if (entity.kind === "mesh") {
    switch (entity.geometry.kind) {
      case "asset":
        return supplied(entity.geometry.assetId);
      case "box":
        half = entity.geometry.size.map((value) => value / 2);
        break;
      case "plane":
        half = [entity.geometry.width / 2, entity.geometry.height / 2, 0];
        break;
      case "sphere":
        half = [entity.geometry.radius, entity.geometry.radius, entity.geometry.radius];
        break;
      case "cylinder":
        half = [entity.geometry.radius, entity.geometry.height / 2, entity.geometry.radius];
        break;
    }
  } else if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video") {
    half = [entity.width / 2, entity.height / 2, 0];
  } else if (entity.kind === "splat")
    return supplied(entity.assetId);
  else
    return { status: "unknown", reason: entity.kind === "text" ? "requires-text-layout" : "no-surface" };
  return { status: "bounded", bounds: { min: [-half[0], -half[1], -half[2]], max: half } };
}
var round3 = (value) => Math.round(value * 1000) / 1000;
function boundsCorners(bounds) {
  const corners = [];
  for (let mask = 0;mask < 8; mask++) {
    corners.push([
      mask & 1 ? bounds.max[0] : bounds.min[0],
      mask & 2 ? bounds.max[1] : bounds.min[1],
      mask & 4 ? bounds.max[2] : bounds.min[2]
    ]);
  }
  return corners;
}
function classifyWorldFrustum(view, bounds) {
  const { width, height } = view.projection;
  let behind = 0, inside = 0, inClip = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const corner of boundsCorners(bounds)) {
    const projected = projectPreparedPoint(view, corner);
    if (projected === null) {
      behind++;
      continue;
    }
    minX = Math.min(minX, projected.pixel[0]);
    maxX = Math.max(maxX, projected.pixel[0]);
    minY = Math.min(minY, projected.pixel[1]);
    maxY = Math.max(maxY, projected.pixel[1]);
    if (projected.insideClip)
      inClip++;
    if (projected.insideImage && projected.insideClip)
      inside++;
  }
  const contained = behind === 8 ? "behind-camera" : inside === 8 ? "full" : inside > 0 || behind > 0 ? "partial" : inClip > 0 ? "outside" : "clipped";
  const pixelFootprint = behind === 8 ? 0 : round3(Math.max(0, Math.min(maxX, width) - Math.max(minX, 0)) * Math.max(0, Math.min(maxY, height) - Math.max(minY, 0)));
  return { contained, pixelFootprint };
}
function classifyViewOverlay(bounds, units, width, height) {
  const scaleX = units === "normalized" ? width : 1;
  const scaleY = units === "normalized" ? height : 1;
  const minX = bounds.min[0] * scaleX, maxX = bounds.max[0] * scaleX;
  const minY = bounds.min[1] * scaleY, maxY = bounds.max[1] * scaleY;
  const pixelFootprint = round3(Math.max(0, Math.min(maxX, width) - Math.max(minX, 0)) * Math.max(0, Math.min(maxY, height) - Math.max(minY, 0)));
  const contained = minX >= 0 && minY >= 0 && maxX <= width && maxY <= height ? "full" : pixelFootprint > 0 ? "partial" : "outside";
  return { contained, pixelFootprint };
}
function spatialAuditDefaultTimesUs(durationUs) {
  const count = SPATIAL_AUDIT_LIMITS.defaultSamples;
  return Array.from({ length: count }, (_, index2) => Math.round(index2 * durationUs / (count - 1)));
}
var findingOrder = (finding) => `${finding.kind}:${finding.entityId ?? ""}:${String(finding.timeUs ?? -1).padStart(12, "0")}`;
function unionBounds(items) {
  return items.reduce((union, next) => ({
    min: union.min.map((value, axis) => Math.min(value, next.min[axis])),
    max: union.max.map((value, axis) => Math.max(value, next.max[axis]))
  }));
}
function instanceDomain(worldMatrix, entity, local) {
  if (entity.kind !== "mesh" || entity.instances === undefined)
    return transformBounds(worldMatrix, local);
  return unionBounds(entity.instances.map((instance) => transformBounds(multiplyTransforms(worldMatrix, composeTransform(instance)), local)));
}
function auditSpatialScene(sceneInput, options) {
  return auditSpatialSceneInContext(createSpatialEvaluationContext(sceneInput), options);
}
function auditSpatialSceneInContext(context, options) {
  const scene = context.scene;
  const captured = parseSpatialValue(SpatialAuditOptionsSchema, options, "audit options");
  const cameraId = captured.cameraId;
  if (!context.camerasById.has(cameraId)) {
    throw new SpatialSceneError("not-found", `Unknown camera ${cameraId}.`, "cameraId");
  }
  const assetIds = new Set(scene.assets.map((asset) => asset.assetId));
  const assetBounds = Object.create(null);
  for (const [assetId2, bounds] of Object.entries(captured.assetBounds ?? {})) {
    if (!assetIds.has(assetId2))
      throw new SpatialSceneError("invalid-data", `Asset bounds reference unknown ${assetId2}.`, "assetBounds");
    assetBounds[assetId2] = Object.freeze({ min: Object.freeze([...bounds.min]), max: Object.freeze([...bounds.max]) });
  }
  const timesUs = [...new Set(captured.timesUs ?? spatialAuditDefaultTimesUs(scene.durationUs))].sort((a, b) => a - b);
  for (const timeUs of timesUs) {
    if (timeUs > scene.durationUs)
      throw new SpatialSceneError("invalid-data", "Audit sample time exceeds scene duration.", "timesUs");
  }
  if (scene.entities.length * timesUs.length > SPATIAL_AUDIT_LIMITS.entitySamples) {
    throw new SpatialSceneError("invalid-data", "Audit entity-sample budget exceeded; pass fewer timesUs samples.", "timesUs");
  }
  const instanceTotal = scene.entities.reduce((total, entity) => total + (entity.kind === "mesh" && entity.instances !== undefined ? entity.instances.length : 1), 0);
  if (instanceTotal * timesUs.length > SPATIAL_AUDIT_LIMITS.instanceSamples) {
    throw new SpatialSceneError("invalid-data", "Audit instance-sample budget exceeded; pass fewer timesUs samples.", "timesUs");
  }
  const enclosures = new Map(scene.entities.map((entity) => [entity.entityId, spatialEntityLocalBounds(entity, assetBounds)]));
  const samplesByEntity = new Map(scene.entities.map((entity) => [entity.entityId, []]));
  for (const timeUs of timesUs) {
    const snapshot = evaluateSpatialSceneInContext(context, { timeUs, cameraId });
    const view = prepareCameraView(cameraMathView(snapshot.camera));
    const { width, height } = snapshot.camera.projection;
    for (const entry of snapshot.entities) {
      const entity = entry.entity;
      const samples = samplesByEntity.get(entity.entityId);
      const placement = entity.placement;
      if (placement.kind === "view" && placement.cameraId !== cameraId) {
        samples.push({ timeUs, visible: entry.visible, note: "other-camera" });
        continue;
      }
      const enclosure = enclosures.get(entity.entityId);
      if (enclosure.status === "unknown") {
        samples.push({ timeUs, visible: entry.visible });
        continue;
      }
      try {
        const domain = instanceDomain(entry.worldMatrix, entity, enclosure.bounds);
        const frustum = placement.kind === "view" ? classifyViewOverlay(domain, placement.units, width, height) : classifyWorldFrustum(view, domain);
        samples.push({ timeUs, visible: entry.visible, bounds: domain, frustum });
      } catch (error) {
        if (!(error instanceof RangeError))
          throw error;
        samples.push({ timeUs, visible: entry.visible, note: "out-of-range" });
      }
    }
  }
  const findings = [];
  const neverVisible = [];
  const neverInFrustum = [];
  const auditedEntities = [];
  for (const entity of scene.entities) {
    const enclosure = enclosures.get(entity.entityId);
    const samples = samplesByEntity.get(entity.entityId);
    auditedEntities.push({
      entityId: entity.entityId,
      name: entity.name,
      kind: entity.kind,
      placement: entity.placement,
      enclosure: enclosure.status === "bounded" ? { status: "bounded" } : { status: "unknown", reason: enclosure.reason },
      samples,
      ...entity.kind === "mesh" && entity.instances !== undefined ? { instances: entity.instances.length } : {}
    });
    const applicable = samples.filter((sample) => sample.note !== "other-camera");
    const visible = applicable.filter((sample) => sample.visible);
    if (visible.length === 0) {
      neverVisible.push(entity.entityId);
      findings.push({
        severity: "info",
        kind: "never-visible",
        entityId: entity.entityId,
        detail: entity.placement.kind === "view" && entity.placement.cameraId !== cameraId ? `View-bound to ${entity.placement.cameraId}; not evaluated under ${cameraId}.` : "Effective visibility is false at every sampled time."
      });
      continue;
    }
    if (enclosure.status === "unknown") {
      if (enclosure.reason !== "no-surface") {
        findings.push({
          severity: "info",
          kind: "bounds-unknown",
          entityId: entity.entityId,
          detail: enclosure.reason === "requires-asset-decoding" ? "Bounds require decoded asset data; supply assetBounds to audit this entity." : "Text bounds require font layout; audited for visibility only."
        });
      }
      continue;
    }
    const outOfRange = visible.filter((sample) => sample.note === "out-of-range").length;
    if (outOfRange > 0) {
      findings.push({
        severity: "info",
        kind: "bounds-unknown",
        entityId: entity.entityId,
        detail: `World bounds exceed numeric limits at ${String(outOfRange)} visible sample${outOfRange === 1 ? "" : "s"}.`
      });
    }
    const statuses = visible.filter((sample) => sample.frustum !== undefined).map((sample) => sample.frustum.contained);
    if (statuses.length === 0)
      continue;
    if (!statuses.some((status) => status === "full" || status === "partial")) {
      neverInFrustum.push(entity.entityId);
      if (statuses.every((status) => status === "behind-camera")) {
        findings.push({
          severity: "warning",
          kind: "behind-camera-all-samples",
          entityId: entity.entityId,
          detail: `Every visible sample is behind the camera plane (${String(statuses.length)} sample${statuses.length === 1 ? "" : "s"}).`
        });
      } else {
        const histogram = CONTAINED_HISTOGRAM_ORDER.map((status) => [status, statuses.filter((value) => value === status).length]).filter(([, count]) => count > 0).map(([status, count]) => `${status} \xD7${String(count)}`).join(", ");
        findings.push({
          severity: "warning",
          kind: "off-camera",
          entityId: entity.entityId,
          detail: `Never inside the camera frustum: ${histogram} across ${String(statuses.length)} visible samples.`
        });
      }
    }
  }
  const visibleAtSomeSample = new Set(scene.entities.filter((entity) => samplesByEntity.get(entity.entityId).some((sample) => sample.visible && sample.note !== "other-camera")).map((entity) => entity.entityId));
  const shadowLights = scene.entities.filter((entity) => entity.kind === "light" && entity.shadow === true && visibleAtSomeSample.has(entity.entityId));
  const shadowMeshes = scene.entities.filter((entity) => entity.kind === "mesh" && (entity.castShadow === true || entity.receiveShadow === true));
  if (shadowLights.length === 0) {
    for (const entity of shadowMeshes) {
      findings.push({
        severity: "warning",
        kind: "shadows-disabled",
        entityId: entity.entityId,
        detail: "Declares shadow participation, but no evaluated light enables shadow casting; the renderer leaves shadow maps disabled."
      });
    }
  } else {
    const casters = shadowMeshes.filter((entity) => entity.castShadow === true);
    const receivers = shadowMeshes.filter((entity) => entity.receiveShadow === true);
    for (const light of shadowLights) {
      if (casters.length === 0 || receivers.length === 0) {
        findings.push({
          severity: "warning",
          kind: "shadows-disabled",
          entityId: light.entityId,
          detail: casters.length === 0 && receivers.length === 0 ? "Enables shadow casting, but no mesh declares castShadow or receiveShadow; the shadow map renders no geometry." : casters.length === 0 ? "Enables shadow casting, but no mesh declares castShadow; nothing writes into the shadow map." : "Enables shadow casting, but no mesh declares receiveShadow; shadows have no receiving surface."
        });
      }
    }
  }
  const boundedVisible = scene.entities.filter((entity) => enclosures.get(entity.entityId).status === "bounded" && samplesByEntity.get(entity.entityId).some((sample) => sample.visible && sample.note !== "other-camera")).length;
  const everInFrustum = scene.entities.some((entity) => samplesByEntity.get(entity.entityId).some((sample) => sample.visible && (sample.frustum?.contained === "full" || sample.frustum?.contained === "partial")));
  if (!everInFrustum) {
    const unknownCount = scene.entities.length - [...enclosures.values()].filter((item) => item.status === "bounded").length;
    findings.push({
      severity: "warning",
      kind: "empty-scene-region",
      detail: `No visible bounded entity intersects the camera frustum at any sampled time (${String(boundedVisible)} bounded visible, ${String(unknownCount)} with unknown bounds).`
    });
  }
  const sortedFindings = sortSpatialBy(findings, findingOrder);
  const retainedFindings = sortedFindings.slice(0, SPATIAL_AUDIT_LIMITS.findings);
  const byKind = Object.fromEntries(ENTITY_KINDS.map((kind) => [kind, 0]));
  for (const entity of scene.entities)
    byKind[entity.kind]++;
  const properties = { position: 0, rotation: 0, scale: 0, opacity: 0 };
  for (const channel of scene.animations)
    properties[channel.property]++;
  const report = {
    kind: "slopcamera.spatial-audit",
    schemaVersion: 1,
    sceneId: scene.sceneId,
    sceneSha256: context.sceneSha256,
    cameraId,
    durationUs: scene.durationUs,
    timesUs,
    summary: {
      entities: {
        total: scene.entities.length,
        bounded: [...enclosures.values()].filter((item) => item.status === "bounded").length,
        unknownBounds: [...enclosures.values()].filter((item) => item.status === "unknown").length,
        byKind,
        instances: scene.entities.reduce((total, entity) => total + (entity.kind === "mesh" && entity.instances !== undefined ? entity.instances.length : 0), 0)
      },
      animations: {
        channels: scene.animations.length,
        targets: new Set(scene.animations.map((channel) => channel.targetId)).size,
        properties
      },
      cameras: scene.cameras.map((camera2) => camera2.cameraId),
      entitiesNeverVisible: sortSpatialBy(neverVisible, (id) => id),
      entitiesNeverInFrustum: sortSpatialBy(neverInFrustum, (id) => id)
    },
    entities: auditedEntities,
    findings: retainedFindings,
    omittedFindings: sortedFindings.length - retainedFindings.length
  };
  const parsed = SpatialAuditReportSchema.parse(report);
  try {
    createBoundedJsonValueSnapshot(parsed, SPATIAL_AUDIT_LIMITS.reportBytes, "audit report", {
      maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth + 8,
      maximumValues: SPATIAL_SCENE_LIMITS.sourceValues + SPATIAL_AUDIT_LIMITS.entitySamples * 16
    });
  } catch (error) {
    throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : "Audit report exceeds its bounded size.", "audit");
  }
  return deepFreezeJson(parsed);
}
var SpatialAuditAssetBoundsMapSchema = z6.record(SpatialAssetIdSchema, SpatialAuditBoundsSchema);
var SpatialAuditAssetFactsPairSchema = z6.strictObject({ manifest: SpatialAssetManifestSchema, facts: SpatialAssetFactsV1Schema });
function auditSubjectBounds(manifest, facts) {
  if (facts.subject.sha256 !== manifest.payload.sha256 || facts.subject.bytes !== manifest.payload.bytes) {
    throw new SpatialSceneError("invalid-data", `Asset facts for ${manifest.assetId} do not describe the manifest payload.`, "assetBounds");
  }
  return { [manifest.assetId]: facts.bounds.sceneSpace };
}
function auditBoundsRecord(document) {
  if (typeof document === "object" && document !== null && !Array.isArray(document)) {
    const kind = document.kind;
    if (kind === "slopcamera.spatial-asset-admission") {
      const admission = parseSpatialValue(SpatialAssetAdmissionV1Schema, document, "asset admission");
      return auditSubjectBounds(admission.manifest, admission.facts);
    }
    if (kind === "slopcamera.spatial-asset-facts") {
      throw new SpatialSceneError("invalid-data", "A slopcamera.spatial-asset-facts payload carries no assetId; pass its slopcamera.spatial-asset-admission document or a {manifest, facts} pair.", "assetBounds");
    }
    const pair = SpatialAuditAssetFactsPairSchema.safeParse(document);
    if (pair.success)
      return auditSubjectBounds(pair.data.manifest, pair.data.facts);
    if (SpatialAuditAssetBoundsMapSchema.safeParse(document).success)
      return document;
  }
  throw new SpatialSceneError("invalid-data", "Asset bounds input accepts a Record<assetId, {min, max}> bounds map, a slopcamera.spatial-asset-admission document, a {manifest, facts} pair, or an array of those documents.", "assetBounds");
}
function normalizeSpatialAuditAssetBounds(input) {
  const merged = Object.create(null);
  for (const document of Array.isArray(input) ? input : [input]) {
    for (const [assetId2, bounds] of Object.entries(auditBoundsRecord(document))) {
      const existing = merged[assetId2];
      if (existing !== undefined && canonicalJson(existing) !== canonicalJson(bounds)) {
        throw new SpatialSceneError("conflict", `Asset bounds input supplies conflicting scene-space bounds for ${assetId2}.`, "assetBounds");
      }
      merged[assetId2] = bounds;
    }
  }
  return parseSpatialValue(SpatialAuditAssetBoundsMapSchema, merged, "asset bounds");
}

// src/spatial-scene/inspect.ts
function localBounds(entity) {
  let half;
  if (entity.kind === "mesh") {
    switch (entity.geometry.kind) {
      case "asset":
        return { status: "unknown", reason: "requires-asset-decoding" };
      case "box":
        half = entity.geometry.size.map((value) => value / 2);
        break;
      case "plane":
        half = [entity.geometry.width / 2, entity.geometry.height / 2, 0];
        break;
      case "sphere":
        half = [entity.geometry.radius, entity.geometry.radius, entity.geometry.radius];
        break;
      case "cylinder":
        half = [entity.geometry.radius, entity.geometry.height / 2, entity.geometry.radius];
        break;
    }
  } else if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video")
    half = [entity.width / 2, entity.height / 2, 0];
  else
    return { status: "unknown", reason: entity.kind === "text" ? "requires-text-layout" : entity.kind === "splat" ? "requires-asset-decoding" : "no-surface" };
  return { min: [-half[0], -half[1], -half[2]], max: half };
}
function inspectSpatialScene(input) {
  const scene = parseSpatialScene(input);
  const snapshot = evaluateSpatialScene(scene, { timeUs: 0, cameraId: scene.cameras[0].cameraId });
  const digests = spatialAssetClosureDigests(scene.assets);
  return deepFreezeJson({
    sceneId: scene.sceneId,
    sceneSha256: spatialValueSha256(scene),
    durationUs: scene.durationUs,
    entities: snapshot.entities.map(({ entity, worldMatrix }) => {
      const origin = entity.origin;
      const declared = origin.kind === "generated" ? scene.generators.find((generator) => generator.generatorId === origin.generatorId).editableKeys.find((item) => item.key === origin.key)?.properties ?? [] : [
        ...["color", "opacity", "transform"].filter((property) => spatialPropertySupported(entity, property)),
        ...entity.kind === "mesh" ? [
          ...(entity.material.kind === "standard" || entity.material.kind === "pbr") && spatialPropertySupported(entity, "color") ? ["emissive"] : [],
          "instances",
          "castShadow",
          "receiveShadow"
        ] : [],
        ...entity.kind === "light" ? [
          ...entity.light === "spot" ? ["spot"] : [],
          ...entity.light !== "ambient" ? ["shadow"] : []
        ] : []
      ];
      const animatedProperties = scene.animations.filter((channel) => channel.targetId === entity.entityId).map((channel) => channel.property);
      const editableControls = declared.filter((property) => !animatedProperties.some((animated) => animated === property || property === "transform" && ["position", "rotation", "scale"].includes(animated)));
      const local = localBounds(entity);
      const localDomains = "status" in local ? [] : entity.kind === "mesh" && entity.instances !== undefined ? entity.instances.map((instance) => transformBounds(multiplyTransforms(worldMatrix, composeTransform(instance)), local)) : [transformBounds(worldMatrix, local)];
      const bounds = "status" in local ? local : {
        status: "authored-enclosure",
        coordinateDomain: entity.placement,
        atTimeUs: 0,
        bounds: localDomains.reduce((union, next) => ({
          min: union.min.map((value, axis) => Math.min(value, next.min[axis])),
          max: union.max.map((value, axis) => Math.max(value, next.max[axis]))
        }))
      };
      const meshMapIds = entity.kind === "mesh" ? entity.material.kind === "pbr" ? pbrMaterialMapAssetIds(entity.material) : entity.material.map === undefined ? [] : [entity.material.map] : [];
      const assetIds = entity.kind === "mesh" ? [...entity.geometry.kind === "asset" ? [entity.geometry.assetId] : [], ...meshMapIds] : entity.kind === "text" ? [entity.fontAssetId] : ("assetId" in entity) ? [entity.assetId] : [];
      return { entityId: entity.entityId, name: entity.name, kind: entity.kind, origin, parentId: entity.parentId, placement: entity.placement, editableControls, animatedProperties, assetIds, bounds };
    }),
    cameras: scene.cameras,
    assets: scene.assets.map((manifest) => ({ assetId: manifest.assetId, manifestSha256: digests[manifest.assetId], manifest })),
    generators: scene.generators
  });
}

// src/spatial-scene/patch.ts
function diffCollection(collection, before, after, identify) {
  const old = new Map(before.map((item) => [identify(item), item]));
  const current = new Map(after.map((item) => [identify(item), item]));
  const result = [];
  for (const id of [...new Set([...old.keys(), ...current.keys()])].sort()) {
    const a = old.get(id), b = current.get(id);
    if (a === undefined || b === undefined) {
      result.push({ kind: a === undefined ? "added" : "removed", collection, id, properties: Object.keys(a ?? b).sort() });
    } else {
      const aRecord = a, bRecord = b;
      const properties = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter((key2) => spatialValueSha256(Object.hasOwn(a, key2) ? { value: aRecord[key2] } : {}) !== spatialValueSha256(Object.hasOwn(b, key2) ? { value: bRecord[key2] } : {}));
      if (properties.length)
        result.push({ kind: "changed", collection, id, properties });
    }
  }
  return result;
}
function diffSpatialScenes(beforeInput, afterInput) {
  const before = parseSpatialScene(beforeInput);
  const after = parseSpatialScene(afterInput);
  return deepFreezeJson([
    ...diffCollection("assets", before.assets, after.assets, (asset) => asset.assetId),
    ...diffCollection("entities", before.entities, after.entities, (entity) => entity.entityId),
    ...diffCollection("cameras", before.cameras, after.cameras, (camera2) => camera2.cameraId),
    ...diffCollection("animations", before.animations, after.animations, (channel) => channel.channelId),
    ...diffCollection("generators", before.generators, after.generators, (generator) => generator.generatorId),
    ...diffCollection("overrides", before.overrides, after.overrides, (override) => `${override.entityId}:${override.property}`)
  ]);
}
function applySpatialScenePatch(sceneInput, patchInput) {
  const original = parseSpatialScene(sceneInput);
  const patch = parseSpatialValue(SpatialScenePatchV1Schema, patchInput, "scene patch");
  if (patch.expectedSceneSha256 !== spatialValueSha256(original))
    throw new SpatialSceneError("conflict", "Scene revision changed; inspect and rebase the patch.", "expectedSceneSha256");
  const entities = new Map(original.entities.map((entity) => [entity.entityId, entity]));
  const assets = new Map(original.assets.map((asset) => [asset.assetId, asset]));
  const addressedGeometry = new Set, replacedGenerators = new Set;
  const cameras = new Map(original.cameras.map((camera2) => [camera2.cameraId, camera2]));
  const animations = new Map(original.animations.map((channel) => [channel.channelId, channel]));
  const generators = new Map(original.generators.map((generator) => [generator.generatorId, generator]));
  const overrides = new Map(original.overrides.map((override) => [`${override.entityId}:${override.property}`, override]));
  function authored(id) {
    const entity = entities.get(id);
    if (!entity)
      throw new SpatialSceneError("not-found", `Entity ${id} does not exist.`, "operations");
    if (entity.origin.kind !== "authored")
      throw new SpatialSceneError("conflict", "Generated entities can be edited only through declared overrides or retained output replacement.", "operations");
    return entity;
  }
  for (const operation of patch.operations) {
    switch (operation.kind) {
      case "add-asset":
        if (assets.has(operation.asset.assetId))
          throw new SpatialSceneError("conflict", `Asset ${operation.asset.assetId} already exists.`);
        assets.set(operation.asset.assetId, operation.asset);
        break;
      case "replace-asset":
        if (!assets.has(operation.asset.assetId))
          throw new SpatialSceneError("not-found", `Asset ${operation.asset.assetId} does not exist.`);
        assets.set(operation.asset.assetId, operation.asset);
        break;
      case "set-mesh-geometry": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "mesh")
          throw new SpatialSceneError("conflict", "Geometry replacement requires an authored mesh wrapper.");
        entities.set(operation.entityId, { ...entity, geometry: operation.geometry });
        addressedGeometry.add(operation.entityId);
        break;
      }
      case "set-material": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "mesh")
          throw new SpatialSceneError("conflict", "Material replacement requires an authored mesh entity.");
        if (entity.geometry.kind === "asset" && entity.geometry.materialMode === "source")
          throw new SpatialSceneError("conflict", "Source-material meshes consume source materials only; the entity material is inert.");
        entities.set(operation.entityId, { ...entity, material: operation.material });
        break;
      }
      case "rename-entity":
        entities.set(operation.entityId, { ...authored(operation.entityId), name: operation.name });
        break;
      case "reparent-entity":
        entities.set(operation.entityId, { ...authored(operation.entityId), parentId: operation.parentId });
        break;
      case "set-transform":
        entities.set(operation.entityId, { ...authored(operation.entityId), transform: operation.transform });
        break;
      case "set-color":
        entities.set(operation.entityId, applySpatialEntityOverride(authored(operation.entityId), { entityId: operation.entityId, property: "color", value: operation.color }));
        break;
      case "set-opacity":
        entities.set(operation.entityId, applySpatialEntityOverride(authored(operation.entityId), { entityId: operation.entityId, property: "opacity", value: operation.opacity }));
        break;
      case "set-emissive": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "mesh" || entity.material.kind !== "standard" && entity.material.kind !== "pbr")
          throw new SpatialSceneError("conflict", "Emissive edits require an authored mesh with a standard or pbr material.", "operations");
        if (!spatialPropertySupported(entity, "color"))
          throw new SpatialSceneError("conflict", "Source-material mode leaves emissive control to the retained GLB material.", "operations");
        if (entity.material.kind === "pbr") {
          const { emissive: _cleared, ...material } = entity.material;
          entities.set(operation.entityId, { ...entity, material: operation.emissive === null ? material : { ...material, emissive: { color: operation.emissive.color, intensity: operation.emissive.intensity } } });
        } else {
          const { emissive: _cleared, ...material } = entity.material;
          entities.set(operation.entityId, { ...entity, material: operation.emissive === null ? material : { ...material, emissive: operation.emissive } });
        }
        break;
      }
      case "set-spot": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "light" || entity.light !== "spot")
          throw new SpatialSceneError("conflict", "Spot cone edits require an authored spot light.", "operations");
        entities.set(operation.entityId, { ...entity, spot: operation.spot });
        break;
      }
      case "set-instances": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "mesh")
          throw new SpatialSceneError("conflict", "Instance edits apply to authored mesh entities.", "operations");
        const { instances: _cleared, ...rest } = entity;
        entities.set(operation.entityId, operation.instances === null ? rest : { ...rest, instances: operation.instances });
        break;
      }
      case "set-mesh-shadow": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "mesh")
          throw new SpatialSceneError("conflict", "Mesh shadow flags apply to authored mesh entities.", "operations");
        const { castShadow: _cast, receiveShadow: _receive, ...rest } = entity;
        entities.set(operation.entityId, {
          ...rest,
          ...operation.castShadow === null ? {} : { castShadow: operation.castShadow },
          ...operation.receiveShadow === null ? {} : { receiveShadow: operation.receiveShadow }
        });
        break;
      }
      case "set-light-shadow": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "light")
          throw new SpatialSceneError("conflict", "Light shadow flags apply to authored light entities.", "operations");
        if (entity.light === "ambient" && operation.shadow !== null)
          throw new SpatialSceneError("conflict", "Ambient lights cannot cast shadows.", "operations");
        const { shadow: _shadow, ...rest } = entity;
        entities.set(operation.entityId, operation.shadow === null ? rest : { ...rest, shadow: operation.shadow });
        break;
      }
      case "set-camera":
        cameras.set(operation.camera.cameraId, operation.camera);
        break;
      case "set-channel":
        animations.set(operation.channel.channelId, operation.channel);
        break;
      case "remove-channel":
        if (!animations.delete(operation.channelId))
          throw new SpatialSceneError("not-found", `Channel ${operation.channelId} does not exist.`);
        break;
      case "add-entity":
        if (entities.has(operation.entity.entityId))
          throw new SpatialSceneError("conflict", `Entity ${operation.entity.entityId} already exists.`);
        if (operation.entity.origin.kind !== "authored")
          throw new SpatialSceneError("conflict", "Add generated entities through retained generator output replacement.");
        entities.set(operation.entity.entityId, operation.entity);
        if (operation.entity.kind === "mesh")
          addressedGeometry.add(operation.entity.entityId);
        break;
      case "remove-entity":
        authored(operation.entityId);
        entities.delete(operation.entityId);
        break;
      case "set-override":
        overrides.set(`${operation.override.entityId}:${operation.override.property}`, operation.override);
        break;
      case "remove-override":
        if (!overrides.delete(`${operation.entityId}:${operation.property}`))
          throw new SpatialSceneError("not-found", "Override does not exist.");
        break;
      case "replace-generator-output": {
        const generatorId = operation.generator.generatorId;
        replacedGenerators.add(generatorId);
        for (const entity of entities.values())
          if (entity.origin.kind === "generated" && entity.origin.generatorId === generatorId)
            entities.delete(entity.entityId);
        for (const entity of operation.entities) {
          if (entity.origin.kind !== "generated" || entity.origin.generatorId !== generatorId)
            throw new SpatialSceneError("conflict", "Generator replacement must contain only its own retained output.");
          if (entities.has(entity.entityId))
            throw new SpatialSceneError("conflict", `Generator output collides with ${entity.entityId}.`);
          entities.set(entity.entityId, entity);
        }
        generators.set(generatorId, operation.generator);
        break;
      }
    }
  }
  const scene = parseSpatialScene({ ...original, assets: [...assets.values()], entities: [...entities.values()], cameras: [...cameras.values()], animations: [...animations.values()], generators: [...generators.values()], overrides: [...overrides.values()] });
  const beforeAssets = new Map(original.assets.map((asset) => [asset.assetId, asset]));
  const oldClosure = spatialAssetClosureDigests(original.assets), newClosure = spatialAssetClosureDigests(scene.assets);
  for (const entity of scene.entities) {
    const referenced = entity.kind === "mesh" && entity.geometry.kind === "asset" ? [entity.geometry.assetId] : entity.kind === "text" ? [entity.fontAssetId] : ("assetId" in entity) ? [entity.assetId] : [];
    if (entity.kind === "mesh") {
      if (entity.material.kind === "pbr")
        referenced.push(...pbrMaterialMapAssetIds(entity.material));
      else if (entity.material.map !== undefined)
        referenced.push(entity.material.map);
    }
    for (const assetId2 of referenced) {
      if (entity.origin.kind === "generated" && oldClosure[assetId2] !== undefined && oldClosure[assetId2] !== newClosure[assetId2] && !replacedGenerators.has(entity.origin.generatorId)) {
        throw new SpatialSceneError("conflict", "Changing a generated part's asset closure requires explicit retained generator output replacement.");
      }
    }
    if (entity.kind === "mesh" && entity.geometry.kind === "asset" && (entity.geometry.nodeIndex !== undefined || entity.geometry.clip !== undefined) && beforeAssets.has(entity.geometry.assetId) && beforeAssets.get(entity.geometry.assetId).payload.sha256 !== assets.get(entity.geometry.assetId).payload.sha256 && !addressedGeometry.has(entity.entityId) && !(entity.origin.kind === "generated" && replacedGenerators.has(entity.origin.generatorId))) {
      throw new SpatialSceneError("conflict", "Replacing addressed GLB bytes requires explicit set-mesh-geometry with the new local node/clip addresses; internal correspondence is not inferred.");
    }
  }
  const diff = diffSpatialScenes(original, scene);
  return deepFreezeJson({ scene, sceneSha256: spatialValueSha256(scene), diff });
}

export { SpatialMapChannelSchema, SpatialMapColorSpaceSchema, SpatialUvTransformSchema, SpatialPbrMapSchema, SpatialPbrEmissiveSchema, SpatialPbrClearcoatSchema, SpatialPbrTransmissionSchema, SpatialPbrSheenSchema, SpatialPbrAnisotropySchema, SpatialPbrMaterialSchema, pbrMaterialMapAssetIds, SpatialDerivationMethodSchema, SpatialDerivationCandidateSchema, pbrDerivationCandidates, SpatialFogSchema, SpatialLightingRigTypeSchema, lightingRig, lightingRigDescription, SpatialProbeGeometrySchema, ORIGINAL_MATERIAL_HERO_FIXTURE, planMaterialProbeGallery, validatePbrMaterial, SPATIAL_SCENE_LIMITS, SpatialDigestSchema, SpatialSceneIdSchema, SpatialEntityIdSchema, SpatialCameraIdSchema, SpatialAssetIdSchema, SpatialGeneratorIdSchema, SpatialChannelIdSchema, SpatialShotIdSchema, SpatialTimeUsSchema, SpatialVec3Schema, SpatialQuaternionSchema, SpatialTransformSchema, SpatialPoseSchema, SpatialFrameRateSchema, SpatialProjectionSchema, SpatialCameraLensSchema, SpatialCameraSchema, SpatialPayloadSchema, SpatialAssetInterpretationSchema, SpatialAssetManifestSchema, SpatialEmissiveSchema, SpatialMaterialSchema, SpatialGeometrySchema, SpatialSpotLightSchema, SpatialOriginSchema, SpatialPlacementSchema, SpatialEntitySchema, SpatialAnimationSchema, SpatialOverrideSchema, SpatialGeneratorSchema, SpatialSceneV1Schema, SpatialPatchOperationSchema, SpatialScenePatchV1Schema, SpatialShotV1Schema, SpatialMatrixSchema, EvaluatedSpatialSceneSchema, SpatialSceneError, parseSpatialValue, spatialValueSha256, spatialStateValueSha256, sortSpatialBy, spatialTopologicalIds, generatedSpatialEntityId, spatialGeneratorOutputSha256, spatialAssetManifestSha256, spatialAssetClosureDigests, spatialPropertySupported, validateSpatialOverrides, parseSpatialScene, spatialSceneSha256, MAX_ABS_COMPONENT, MAX_IMAGE_DIMENSION, IDENTITY_MATRIX, normalizeQuaternion, composeTransform, multiplyTransforms, invertTransform, transformPoint, transformDirection, slerpQuaternion, prepareCameraView, projectPreparedPoint, projectPoint, unprojectPixel, pixelRay, transformBounds, cameraMathView, SPATIAL_GLB_PROFILE, SPATIAL_GLB_PROFILE_V1, SPATIAL_GLB_RIGGED_PROFILE, SPATIAL_GLB_LIMITS, SpatialGlbModel, parseSpatialGlb, evaluateSpatialGlb, spatialGlbBounds, SpatialBoundsSchema, SpatialAssetMaterialFactSchema, SpatialAssetFactsV1Schema, SpatialPublishedArtifactSchema, SpatialAssetAdmissionV1Schema, mergeSpatialOverrides, applySpatialEntityOverride, validateSpatialShot, createSpatialEvaluationContext, evaluateSpatialSceneInContext, evaluateSpatialScene, SPATIAL_AUDIT_LIMITS, SpatialAuditBoundsSchema, SpatialAuditOptionsSchema, SpatialAuditFrustumSchema, SpatialAuditSampleSchema, SpatialAuditEntitySchema, SpatialAuditFindingSchema, SpatialAuditReportSchema, spatialEntityLocalBounds, spatialAuditDefaultTimesUs, auditSpatialScene, auditSpatialSceneInContext, normalizeSpatialAuditAssetBounds, inspectSpatialScene, diffSpatialScenes, applySpatialScenePatch };

import { z } from "zod"
import { canonicalJson } from "../code/canonical-json.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { sha256Hex } from "../code/sha256.js"

/**
 * Closed bounded PBR material extensions, atmosphere, and reusable lighting rigs.
 * Every type is portable, effect-free, and deterministic. No arbitrary shaders,
 * runtime downloads, or simulation. Color spaces and channel semantics are
 * explicit so downstream lowering never guesses.
 */

// ---------------------------------------------------------------------------
// Shared bounded scalars
// ---------------------------------------------------------------------------

const unit = z.number().finite().min(0).max(1)
const positiveFinite = z.number().finite().min(0).max(1_000_000)
const finiteCoordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/u)

// ---------------------------------------------------------------------------
// Map reference with explicit channel and color-space semantics
// ---------------------------------------------------------------------------

/** Which channels of the texture carry material data. */
export const SpatialMapChannelSchema = z.enum([
  "rgb",          // sRGB base-color, emissive
  "rgba",         // sRGB base-color with alpha
  "r",            // single-channel data (roughness, metalness, AO, height, etc.)
  "g",            // green channel (ORM layout: roughness in G)
  "b",            // blue channel (ORM layout: metalness in B)
  "a",            // alpha channel (Three sheen roughness)
  "rg",           // two-channel data (anisotropy direction, etc.)
  "orm",          // occlusion-roughness-metalness packed R/G/B per glTF 2.0
  "xy-normal",    // tangent-space normal in R/G, derived Z; per glTF 2.0
])
export type SpatialMapChannel = z.infer<typeof SpatialMapChannelSchema>

/** Declared color space of the texture data as stored. */
export const SpatialMapColorSpaceSchema = z.enum([
  "srgb",   // sRGB transfer function (base-color, emissive)
  "linear", // linear data (normal, ORM, height, clearcoat, transmission, sheen, anisotropy)
])
export type SpatialMapColorSpace = z.infer<typeof SpatialMapColorSpaceSchema>

/** UV transform applied to this map's texture coordinates. */
export const SpatialUvTransformSchema = z.strictObject({
  offset: z.tuple([finiteCoordinate, finiteCoordinate]),
  rotation: z.number().finite().min(-Math.PI).max(Math.PI),
  scale: z.tuple([positiveFinite, positiveFinite]),
})
export type SpatialUvTransform = z.infer<typeof SpatialUvTransformSchema>

/**
 * A bounded texture map reference with explicit semantics. The `assetId` must
 * resolve to an image asset in the scene. Dimensions are validated against the
 * referenced asset at parse time.
 */
const assetId = z.string().min(7).max(128).regex(/^asset_[a-zA-Z0-9][a-zA-Z0-9_-]*$/u)
export const SpatialPbrMapSchema = z.strictObject({
  assetId,
  channel: SpatialMapChannelSchema,
  colorSpace: SpatialMapColorSpaceSchema,
  uvTransform: SpatialUvTransformSchema.optional(),
})
export type SpatialPbrMap = z.infer<typeof SpatialPbrMapSchema>

// ---------------------------------------------------------------------------
// PBR material extensions — closed union of reviewed glTF core + KHR fields
// ---------------------------------------------------------------------------

/** Emissive: sRGB hex color times bounded scalar intensity, plus optional map. */
export const SpatialPbrEmissiveSchema = z.strictObject({
  color,
  intensity: z.number().finite().min(0).max(100_000),
  map: SpatialPbrMapSchema.optional(),
})

/** Clearcoat layer: isotropic clear lacquer over the base layer. */
export const SpatialPbrClearcoatSchema = z.strictObject({
  factor: unit,
  roughness: unit,
  map: SpatialPbrMapSchema.optional(),
  roughnessMap: SpatialPbrMapSchema.optional(),
  normalMap: SpatialPbrMapSchema.optional(),
  normalScale: z.number().finite().min(-16).max(16).optional(),
})

/** Transmission: thin-surface light transmission for glass, liquid, etc. */
export const SpatialPbrTransmissionSchema = z.strictObject({
  factor: unit,
  map: SpatialPbrMapSchema.optional(),
})

/** Sheen: fabric-like reflection at grazing angles. */
export const SpatialPbrSheenSchema = z.strictObject({
  color,
  roughness: unit,
  colorMap: SpatialPbrMapSchema.optional(),
  roughnessMap: SpatialPbrMapSchema.optional(),
})

/** Anisotropy: directional roughness for brushed metal, hair, etc. */
export const SpatialPbrAnisotropySchema = z.strictObject({
  strength: z.number().finite().min(-1).max(1),
  rotation: z.number().finite().min(0).max(2 * Math.PI),
  map: SpatialPbrMapSchema.optional(),
})

/**
 * The closed PBR material. Extends the existing `standard` material with every
 * reviewed glTF 2.0 core field and bounded KHR extension. Maps are explicit
 * asset references with channel/color-space semantics. No arbitrary shaders.
 *
 * Color-space convention:
 * - `baseColorMap`, `emissive.map`, `sheen.colorMap`: sRGB
 * - All other maps (normal, ORM, height, clearcoat, transmission, sheen roughness, anisotropy): linear
 *
 * ORM vs explicit: Exactly one of `ormMap` or the combination of individual
 * `roughnessMap`/`metalnessMap`/`aoMap` may be present, never both.
 */
export const SpatialPbrMaterialSchema = z.strictObject({
  kind: z.literal("pbr"),

  // Base layer
  color,
  opacity: unit,
  roughness: unit,
  metalness: unit,
  baseColorMap: SpatialPbrMapSchema.optional(),
  normalMap: SpatialPbrMapSchema.optional(),
  normalScale: z.number().finite().min(-16).max(16).optional(),

  // ORM (combined) or explicit separate maps — mutually exclusive
  ormMap: SpatialPbrMapSchema.optional(),
  roughnessMap: SpatialPbrMapSchema.optional(),
  metalnessMap: SpatialPbrMapSchema.optional(),
  aoMap: SpatialPbrMapSchema.optional(),
  aoMapIntensity: unit.optional(),

  // Emissive
  emissive: SpatialPbrEmissiveSchema.optional(),

  // Height/displacement
  heightMap: SpatialPbrMapSchema.optional(),
  heightScale: z.number().finite().min(-10).max(10).optional(),

  // Extensions
  clearcoat: SpatialPbrClearcoatSchema.optional(),
  transmission: SpatialPbrTransmissionSchema.optional(),
  sheen: SpatialPbrSheenSchema.optional(),
  anisotropy: SpatialPbrAnisotropySchema.optional(),
  ior: z.number().finite().min(1).max(5).optional(),

  // Alpha
  alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]).optional(),
  alphaCutoff: unit.optional(),
  doubleSided: z.boolean().optional(),
}).superRefine((material, context) => {
  // ORM and explicit separate maps are mutually exclusive
  const hasOrm = material.ormMap !== undefined
  const hasSeparate = material.roughnessMap !== undefined || material.metalnessMap !== undefined || material.aoMap !== undefined
  if (hasOrm && hasSeparate) {
    context.addIssue({ code: "custom", message: "PBR materials must use either an ORM map or separate roughness/metalness/AO maps, never both." })
  }
  // Validate channel semantics
  if (material.baseColorMap !== undefined && !["rgb", "rgba"].includes(material.baseColorMap.channel)) {
    context.addIssue({ code: "custom", path: ["baseColorMap", "channel"], message: "Base-color maps must use rgb or rgba channels." })
  }
  if (material.baseColorMap !== undefined && material.baseColorMap.colorSpace !== "srgb") {
    context.addIssue({ code: "custom", path: ["baseColorMap", "colorSpace"], message: "Base-color maps must be sRGB." })
  }
  if (material.normalMap !== undefined && material.normalMap.channel !== "xy-normal") {
    context.addIssue({ code: "custom", path: ["normalMap", "channel"], message: "Normal maps must use xy-normal channel semantics." })
  }
  if (material.normalMap !== undefined && material.normalMap.colorSpace !== "linear") {
    context.addIssue({ code: "custom", path: ["normalMap", "colorSpace"], message: "Normal maps must be linear." })
  }
  if (material.ormMap !== undefined && material.ormMap.channel !== "orm") {
    context.addIssue({ code: "custom", path: ["ormMap", "channel"], message: "ORM maps must use orm channel semantics." })
  }
  if (material.ormMap !== undefined && material.ormMap.colorSpace !== "linear") {
    context.addIssue({ code: "custom", path: ["ormMap", "colorSpace"], message: "ORM maps must be linear." })
  }
  if (material.heightMap !== undefined && material.heightMap.channel !== "r") {
    context.addIssue({ code: "custom", path: ["heightMap", "channel"], message: "Height maps must use single red channel." })
  }
  if (material.heightMap !== undefined && material.heightMap.colorSpace !== "linear") {
    context.addIssue({ code: "custom", path: ["heightMap", "colorSpace"], message: "Height maps must be linear." })
  }
  if (material.emissive?.map !== undefined && material.emissive.map.colorSpace !== "srgb") {
    context.addIssue({ code: "custom", path: ["emissive", "map", "colorSpace"], message: "Emissive maps must be sRGB." })
  }
  for (const [name, map, channels] of [
    ["roughnessMap", material.roughnessMap, ["g"]],
    ["metalnessMap", material.metalnessMap, ["b"]],
    ["aoMap", material.aoMap, ["r"]],
    ["clearcoat.map", material.clearcoat?.map, ["r"]],
    ["clearcoat.roughnessMap", material.clearcoat?.roughnessMap, ["g"]],
    ["transmission.map", material.transmission?.map, ["r"]],
    ["sheen.roughnessMap", material.sheen?.roughnessMap, ["a"]],
  ] as const) {
    if (map !== undefined && map.colorSpace !== "linear") context.addIssue({ code: "custom", path: name.split("."), message: `${name} must be linear.` })
    if (map !== undefined && !(channels as readonly string[]).includes(map.channel)) context.addIssue({ code: "custom", path: [...name.split("."), "channel"], message: `${name} has unsupported channel semantics.` })
  }
  for (const [name, map] of [["clearcoat.normalMap", material.clearcoat?.normalMap], ["anisotropy.map", material.anisotropy?.map]] as const) {
    if (map !== undefined && map.colorSpace !== "linear") context.addIssue({ code: "custom", path: name.split("."), message: `${name} must be linear.` })
  }
  if (material.clearcoat?.normalMap !== undefined && material.clearcoat.normalMap.channel !== "xy-normal") context.addIssue({ code: "custom", path: ["clearcoat", "normalMap", "channel"], message: "Clearcoat normal maps must use xy-normal semantics." })
  if (material.emissive?.map !== undefined && !["rgb", "rgba"].includes(material.emissive.map.channel)) context.addIssue({ code: "custom", path: ["emissive", "map", "channel"], message: "Emissive maps must use rgb or rgba channels." })
  if (material.sheen?.colorMap !== undefined && (material.sheen.colorMap.colorSpace !== "srgb" || !["rgb", "rgba"].includes(material.sheen.colorMap.channel))) context.addIssue({ code: "custom", path: ["sheen", "colorMap"], message: "Sheen color maps must use sRGB rgb or rgba semantics." })
  if (material.anisotropy?.map !== undefined && material.anisotropy.map.channel !== "rgb") context.addIssue({ code: "custom", path: ["anisotropy", "map", "channel"], message: "Anisotropy maps must use RGB direction-and-strength semantics." })
  if (material.normalScale !== undefined && material.normalMap === undefined) context.addIssue({ code: "custom", message: "normalScale requires a normalMap." })
  if ((material.heightScale !== undefined) !== (material.heightMap !== undefined)) context.addIssue({ code: "custom", message: "heightScale and heightMap must be declared together." })
  if (material.clearcoat?.normalScale !== undefined && material.clearcoat.normalMap === undefined) context.addIssue({ code: "custom", message: "Clearcoat normalScale requires a clearcoat normalMap." })
  if (material.aoMapIntensity !== undefined && material.aoMap === undefined && material.ormMap === undefined) context.addIssue({ code: "custom", message: "aoMapIntensity requires an AO or ORM map." })
  // alphaCutoff only meaningful for MASK mode
  if (material.alphaCutoff !== undefined && material.alphaMode !== "MASK") {
    context.addIssue({ code: "custom", message: "alphaCutoff is only applicable to MASK alpha mode." })
  }
})
export type SpatialPbrMaterial = z.infer<typeof SpatialPbrMaterialSchema>

// ---------------------------------------------------------------------------
// Collect all map asset references from a PBR material
// ---------------------------------------------------------------------------

/** Returns every distinct asset ID referenced by maps in a PBR material. */
export function pbrMaterialMapAssetIds(material: { readonly [K in keyof SpatialPbrMaterial]?: unknown } & { readonly kind: "pbr" }): readonly string[] {
  const ids = new Set<string>()
  const collect = (map: unknown) => { if (map !== null && typeof map === "object" && map !== undefined && "assetId" in map && typeof (map as { assetId: unknown }).assetId === "string") ids.add((map as { assetId: string }).assetId) }
  const m = material as SpatialPbrMaterial
  collect(m.baseColorMap)
  collect(m.normalMap)
  collect(m.ormMap)
  collect(m.roughnessMap)
  collect(m.metalnessMap)
  collect(m.aoMap)
  collect(m.heightMap)
  collect(m.emissive?.map)
  collect(m.clearcoat?.map)
  collect(m.clearcoat?.roughnessMap)
  collect(m.clearcoat?.normalMap)
  collect(m.transmission?.map)
  collect(m.sheen?.colorMap)
  collect(m.sheen?.roughnessMap)
  collect(m.anisotropy?.map)
  return Object.freeze([...ids])
}

// ---------------------------------------------------------------------------
// Deterministic local derivation candidates
// ---------------------------------------------------------------------------

export const SpatialDerivationMethodSchema = z.enum([
  "sobel-normal-from-height",
  "average-luminance-roughness",
  "luminance-height",
])
export type SpatialDerivationMethod = z.infer<typeof SpatialDerivationMethodSchema>

/**
 * A derivation candidate describes a deterministic local operation that can
 * produce a plausible approximation of a map from available authored data.
 * The provenance is always honest: `"derived-candidate"` never claims to
 * equal an authored scan. The host decides whether to accept the candidate.
 */
export const SpatialDerivationCandidateSchema = z.strictObject({
  method: SpatialDerivationMethodSchema,
  sourceAssetId: assetId,
  outputChannel: SpatialMapChannelSchema,
  outputColorSpace: SpatialMapColorSpaceSchema,
  provenance: z.literal("derived-candidate"),
  description: z.string().min(1).max(1024),
})
export type SpatialDerivationCandidate = z.infer<typeof SpatialDerivationCandidateSchema>

/** Returns applicable derivation candidates for a PBR material given its declared maps. */
export function pbrDerivationCandidates(material: SpatialPbrMaterial): readonly SpatialDerivationCandidate[] {
  const candidates: SpatialDerivationCandidate[] = []
  // Normal from height: if we have a height map but no normal map
  if (material.heightMap !== undefined && material.normalMap === undefined) {
    candidates.push({
      method: "sobel-normal-from-height",
      sourceAssetId: material.heightMap.assetId,
      outputChannel: "xy-normal",
      outputColorSpace: "linear",
      provenance: "derived-candidate",
      description: "Sobel-filter tangent-space normal derived from the authored height map. Does not equal a surface scan.",
    })
  }
  // Roughness from base-color: if we have a base-color map but no roughness/ORM
  if (material.baseColorMap !== undefined && material.roughnessMap === undefined && material.ormMap === undefined) {
    candidates.push({
      method: "average-luminance-roughness",
      sourceAssetId: material.baseColorMap.assetId,
      outputChannel: "r",
      outputColorSpace: "linear",
      provenance: "derived-candidate",
      description: "Inverted luminance roughness derived from the base-color map. A heuristic approximation, not a measured surface.",
    })
  }
  // Height from base-color: if we have a base-color map but no height map
  if (material.baseColorMap !== undefined && material.heightMap === undefined) {
    candidates.push({
      method: "luminance-height",
      sourceAssetId: material.baseColorMap.assetId,
      outputChannel: "r",
      outputColorSpace: "linear",
      provenance: "derived-candidate",
      description: "Luminance-based height derived from the base-color map. A visual approximation, not a measured displacement.",
    })
  }
  return deepFreezeJson(candidates)
}

// ---------------------------------------------------------------------------
// Linear and height fog
// ---------------------------------------------------------------------------

export const SpatialFogSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("linear"),
    color,
    near: positiveFinite,
    far: positiveFinite,
  }).refine(fog => fog.far > fog.near, "Fog far must exceed near."),
  z.strictObject({
    kind: z.literal("height"),
    color,
    density: z.number().finite().min(0).max(100),
    heightFalloff: z.number().finite().min(0).max(100),
    baseHeight: finiteCoordinate,
  }),
])
export type SpatialFog = z.infer<typeof SpatialFogSchema>

// ---------------------------------------------------------------------------
// Typed reusable lighting rigs
// ---------------------------------------------------------------------------

/** The closed set of named lighting rig presets. */
export const SpatialLightingRigTypeSchema = z.enum([
  "portrait",
  "product",
  "moonlight",
  "golden-hour",
  "neon-noir",
  "interior-window",
  "volumetric-stage",
])
export type SpatialLightingRigType = z.infer<typeof SpatialLightingRigTypeSchema>

interface RigLight {
  readonly entityId: string
  readonly name: string
  readonly light: "ambient" | "directional" | "point" | "spot"
  readonly color: string
  readonly intensity: number
  readonly position: readonly [number, number, number]
  readonly rotation: readonly [number, number, number, number]
  readonly spot?: { readonly angle: number; readonly penumbra: number; readonly distance?: number; readonly decay?: number }
  readonly shadow?: boolean
}

const IDENTITY_ROTATION = [0, 0, 0, 1] as const

function localMinusZTowardOrigin(position: readonly [number, number, number]): readonly [number, number, number, number] {
  const length = Math.hypot(...position)
  if (length === 0) return IDENTITY_ROTATION
  const to = [-position[0] / length, -position[1] / length, -position[2] / length] as const
  // Unit quaternion rotating local -Z onto the origin direction.
  const dot = -to[2]
  if (dot < -0.999999) return [0, 1, 0, 0]
  const scale = Math.sqrt(2 * (1 + dot))
  return [to[1] / scale, -to[0] / scale, 0, scale / 2]
}

function rigEntity(light: RigLight) {
  const rotation = light.light === "ambient" || light.light === "point" ? light.rotation : localMinusZTowardOrigin(light.position)
  return {
    entityId: light.entityId,
    kind: "light" as const,
    name: light.name,
    parentId: null,
    transform: { position: light.position, rotation, scale: [1, 1, 1] as const },
    placement: { kind: "world" as const },
    origin: { kind: "authored" as const },
    visible: true,
    light: light.light,
    color: light.color,
    intensity: light.intensity,
    ...(light.spot === undefined ? {} : { spot: light.spot }),
    ...(light.shadow === undefined ? {} : { shadow: light.shadow }),
  }
}

const RIGS: Record<SpatialLightingRigType, { readonly description: string; readonly lights: readonly RigLight[] }> = {
  portrait: {
    description: "Classic three-point portrait: warm key at 45\u00b0, cool fill opposite, rim backlight. Soft ambient fill.",
    lights: [
      { entityId: "entity_rig_key", name: "Key", light: "directional", color: "#fff5e6", intensity: 3.2, position: [3, 4, 3], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_fill", name: "Fill", light: "directional", color: "#ccd8ff", intensity: 1.2, position: [-3, 2, 3], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_rim", name: "Rim", light: "directional", color: "#ffffff", intensity: 2.0, position: [0, 3, -4], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#e8ecf0", intensity: 0.4, position: [0, 0, 0], rotation: IDENTITY_ROTATION },
    ],
  },
  product: {
    description: "Even product lighting: overhead softbox, two symmetric side fills, warm ambient. Minimal shadows for clean presentation.",
    lights: [
      { entityId: "entity_rig_top", name: "Top", light: "directional", color: "#ffffff", intensity: 3.0, position: [0, 5, 0], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_left", name: "Left fill", light: "directional", color: "#f5f5ff", intensity: 1.5, position: [-4, 2, 3], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_right", name: "Right fill", light: "directional", color: "#f5f5ff", intensity: 1.5, position: [4, 2, 3], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#f0ece8", intensity: 0.8, position: [0, 0, 0], rotation: IDENTITY_ROTATION },
    ],
  },
  moonlight: {
    description: "Cool blue directional moonlight with deep ambient. High contrast, strong shadows.",
    lights: [
      { entityId: "entity_rig_moon", name: "Moon", light: "directional", color: "#b4c8e8", intensity: 2.0, position: [-2, 8, -3], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#1a2040", intensity: 0.15, position: [0, 0, 0], rotation: IDENTITY_ROTATION },
    ],
  },
  "golden-hour": {
    description: "Warm low-angle sunlight with long shadows. Complementary cool sky ambient.",
    lights: [
      { entityId: "entity_rig_sun", name: "Sun", light: "directional", color: "#ffb347", intensity: 4.0, position: [6, 1.5, 3], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_sky", name: "Sky ambient", light: "ambient", color: "#8cb4d8", intensity: 0.5, position: [0, 0, 0], rotation: IDENTITY_ROTATION },
    ],
  },
  "neon-noir": {
    description: "High-contrast colored point lights simulating neon signage. Deep shadows, no ambient fill.",
    lights: [
      { entityId: "entity_rig_neon_pink", name: "Neon pink", light: "point", color: "#ff1493", intensity: 8.0, position: [-3, 2, 1], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_neon_cyan", name: "Neon cyan", light: "point", color: "#00e5ff", intensity: 6.0, position: [3, 1, -2], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_neon_accent", name: "Neon accent", light: "point", color: "#7b68ee", intensity: 4.0, position: [0, 4, 0], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#0a0a14", intensity: 0.05, position: [0, 0, 0], rotation: IDENTITY_ROTATION },
    ],
  },
  "interior-window": {
    description: "Daylight from a single window direction. Warm interior ambient fill, exterior-facing key.",
    lights: [
      { entityId: "entity_rig_window", name: "Window", light: "directional", color: "#e8f0ff", intensity: 3.5, position: [5, 3, 0], rotation: IDENTITY_ROTATION, shadow: true },
      { entityId: "entity_rig_bounce", name: "Bounce", light: "directional", color: "#fff0e0", intensity: 0.8, position: [-3, 1, 2], rotation: IDENTITY_ROTATION },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#f5e8d8", intensity: 0.35, position: [0, 0, 0], rotation: IDENTITY_ROTATION },
    ],
  },
  "volumetric-stage": {
    description: "Theatrical spot lights with tight cones and visible falloff. Low ambient for dramatic effect.",
    lights: [
      { entityId: "entity_rig_spot_center", name: "Center spot", light: "spot", color: "#ffffff", intensity: 12.0, position: [0, 6, 0], rotation: IDENTITY_ROTATION, spot: { angle: 0.5, penumbra: 0.6, distance: 20, decay: 2 }, shadow: true },
      { entityId: "entity_rig_spot_left", name: "Left spot", light: "spot", color: "#ffccaa", intensity: 8.0, position: [-4, 5, 2], rotation: IDENTITY_ROTATION, spot: { angle: 0.4, penumbra: 0.5, distance: 15, decay: 2 } },
      { entityId: "entity_rig_spot_right", name: "Right spot", light: "spot", color: "#aaccff", intensity: 8.0, position: [4, 5, 2], rotation: IDENTITY_ROTATION, spot: { angle: 0.4, penumbra: 0.5, distance: 15, decay: 2 } },
      { entityId: "entity_rig_ambient", name: "Ambient", light: "ambient", color: "#1a1a2e", intensity: 0.08, position: [0, 0, 0], rotation: IDENTITY_ROTATION },
    ],
  },
}

/** Returns the typed entity descriptors for a lighting rig preset. */
export function lightingRig(type: SpatialLightingRigType): { readonly description: string; readonly entities: readonly ReturnType<typeof rigEntity>[] } {
  const rig = RIGS[type]
  return deepFreezeJson({ description: rig.description, entities: rig.lights.map(rigEntity) })
}

/** Returns the description only, without allocating entity descriptors. */
export function lightingRigDescription(type: SpatialLightingRigType): string {
  return RIGS[type].description
}

// ---------------------------------------------------------------------------
// Material probe gallery planning
// ---------------------------------------------------------------------------

/** Geometry choices for material probe galleries. */
export const SpatialProbeGeometrySchema = z.enum(["plane", "sphere", "hero"])
export type SpatialProbeGeometry = z.infer<typeof SpatialProbeGeometrySchema>

/**
 * A material probe gallery plan: describes the set of geometry, lighting, and
 * camera configurations needed to evaluate a candidate material. The plan is
 * data only; the host builds actual scenes from it.
 */
export interface SpatialMaterialProbeGalleryPlan {
  readonly kind: "slopcamera.spatial-material-probe-gallery"
  readonly schemaVersion: 1
  readonly gallerySha256: string
  readonly materialSha256: string
  readonly material: SpatialPbrMaterial
  readonly heroAsset?: { readonly assetId: string; readonly manifestSha256: string; readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } }
  readonly geometries: readonly SpatialProbeGeometry[]
  readonly lightingRigs: readonly SpatialLightingRigType[]
  readonly cameraDistances: readonly number[]
  readonly cells: readonly { readonly cellId: string; readonly geometry: SpatialProbeGeometry; readonly lightingRig: SpatialLightingRigType; readonly cameraDistance: number }[]
  readonly description: string
}

const DEFAULT_PROBE_GEOMETRIES: readonly SpatialProbeGeometry[] = Object.freeze(["plane", "sphere", "hero"])
const DEFAULT_PROBE_RIGS: readonly SpatialLightingRigType[] = Object.freeze(["product", "golden-hour", "moonlight"])
export const ORIGINAL_MATERIAL_HERO_FIXTURE = deepFreezeJson({ assetId: "asset_material_hero_original", manifestSha256: sha256Hex("slopcamera-original-material-hero-v1"), bounds: { min: [-0.8, -1, -0.55] as [number, number, number], max: [0.8, 1, 0.55] as [number, number, number] } })
const DEFAULT_CAMERA_DISTANCES: readonly number[] = Object.freeze([3, 6])

/**
 * Plans a material probe gallery. Each combination of geometry and lighting rig
 * produces one probe scene; the host renders them all to compare the material
 * under controlled conditions.
 */
export function planMaterialProbeGallery(input: {
  readonly material: SpatialPbrMaterial
  readonly geometries?: readonly SpatialProbeGeometry[]
  readonly lightingRigs?: readonly SpatialLightingRigType[]
  readonly cameraDistances?: readonly number[]
  readonly heroAsset?: { readonly assetId: string; readonly manifestSha256: string; readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } }
}): SpatialMaterialProbeGalleryPlan {
  const material = SpatialPbrMaterialSchema.parse(input.material)
  const geometries = input.geometries ?? DEFAULT_PROBE_GEOMETRIES
  const rigs = input.lightingRigs ?? DEFAULT_PROBE_RIGS
  const distances = input.cameraDistances ?? DEFAULT_CAMERA_DISTANCES
  const heroAsset = input.heroAsset ?? ORIGINAL_MATERIAL_HERO_FIXTURE
  for (const geometry of geometries) SpatialProbeGeometrySchema.parse(geometry)
  for (const rig of rigs) SpatialLightingRigTypeSchema.parse(rig)
  for (const distance of distances) {
    if (!Number.isFinite(distance) || distance <= 0 || distance > 1_000_000) {
      throw new RangeError("Camera distances must be positive finite values.")
    }
  }
  if (geometries.length < 1 || rigs.length < 1 || distances.length < 1 || geometries.length * rigs.length * distances.length > 64) throw new RangeError("Material probe gallery requires 1–64 bounded cells.")
  if (geometries.includes("hero")) {
    if (!/^[a-f0-9]{64}$/u.test(heroAsset.manifestSha256)) throw new RangeError("Hero probe geometry requires an exact hero asset manifest binding.")
    for (let axis = 0; axis < 3; axis++) if (!Number.isFinite(heroAsset.bounds.min[axis]) || !Number.isFinite(heroAsset.bounds.max[axis]) || heroAsset.bounds.min[axis]! > heroAsset.bounds.max[axis]!) throw new RangeError("Hero probe geometry requires finite ordered bounds.")
  }
  const extensions: string[] = []
  if (material.clearcoat !== undefined) extensions.push("clearcoat")
  if (material.transmission !== undefined) extensions.push("transmission")
  if (material.sheen !== undefined) extensions.push("sheen")
  if (material.anisotropy !== undefined) extensions.push("anisotropy")
  const extensionNote = extensions.length > 0 ? ` Extensions: ${extensions.join(", ")}.` : ""
  const mapCount = pbrMaterialMapAssetIds(material).length
  const description = `Probe gallery: ${geometries.length} geometr${geometries.length === 1 ? "y" : "ies"} \u00d7 ${rigs.length} rig${rigs.length === 1 ? "" : "s"} \u00d7 ${distances.length} distance${distances.length === 1 ? "" : "s"} = ${geometries.length * rigs.length * distances.length} probe${geometries.length * rigs.length * distances.length === 1 ? "" : "s"}. ${mapCount} texture map${mapCount === 1 ? "" : "s"} bound.${extensionNote}`
  const materialSha256 = sha256Hex(canonicalJson({ domain: "slopcamera.spatial-material/v1", material }))
  const cells = geometries.flatMap(geometry => rigs.flatMap(lightingRig => distances.map(cameraDistance => ({ cellId: sha256Hex(canonicalJson({ domain: "slopcamera.spatial-material-probe-cell/v1", materialSha256, geometry, lightingRig, cameraDistance, ...(geometry === "hero" ? { heroAsset } : {}) })), geometry, lightingRig, cameraDistance }))))
  const body = { kind: "slopcamera.spatial-material-probe-gallery" as const, schemaVersion: 1 as const, materialSha256, material, ...(geometries.includes("hero") ? { heroAsset } : {}), geometries: [...geometries], lightingRigs: [...rigs], cameraDistances: [...distances], cells, description }
  return deepFreezeJson({ ...body, gallerySha256: sha256Hex(canonicalJson({ domain: "slopcamera.spatial-material-probe-gallery/v1", body })) })
}

// ---------------------------------------------------------------------------
// Strict pre-render validation
// ---------------------------------------------------------------------------

export interface SpatialPbrValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

/**
 * Validates a PBR material against available scene assets. Rejects missing
 * maps, mismatched dimensions, unsupported channels, and pixel overflow before
 * any rendering occurs.
 */
export function validatePbrMaterial(
  material: SpatialPbrMaterial,
  assetLookup: ReadonlyMap<string, { readonly width: number; readonly height: number; readonly kind: string }>,
  pixelBudget = 67_108_864,
): SpatialPbrValidationResult {
  const errors: string[] = []
  let totalPixels = 0
  let expectedDimensions: readonly [number, number] | undefined
  const countedAssets = new Set<string>()
  const validateMap = (map: SpatialPbrMap | undefined, label: string) => {
    if (map === undefined) return
    const asset = assetLookup.get(map.assetId)
    if (asset === undefined) {
      errors.push(`${label}: references missing asset ${map.assetId}.`)
      return
    }
    if (asset.kind !== "image") {
      errors.push(`${label}: asset ${map.assetId} is ${asset.kind}, not an image.`)
      return
    }
    if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < 1 || asset.height < 1) {
      errors.push(`${label}: asset ${map.assetId} has invalid decoded dimensions.`)
      return
    }
    if (expectedDimensions !== undefined && (asset.width !== expectedDimensions[0] || asset.height !== expectedDimensions[1])) errors.push(`${label}: decoded dimensions do not match the other PBR maps.`)
    expectedDimensions ??= [asset.width, asset.height]
    if (!countedAssets.has(map.assetId)) {
      countedAssets.add(map.assetId)
      totalPixels += asset.width * asset.height
      if (totalPixels > pixelBudget) errors.push(`${label}: total decoded pixels (${totalPixels}) exceed budget (${pixelBudget}).`)
    }
  }
  validateMap(material.baseColorMap, "baseColorMap")
  validateMap(material.normalMap, "normalMap")
  validateMap(material.ormMap, "ormMap")
  validateMap(material.roughnessMap, "roughnessMap")
  validateMap(material.metalnessMap, "metalnessMap")
  validateMap(material.aoMap, "aoMap")
  validateMap(material.heightMap, "heightMap")
  validateMap(material.emissive?.map, "emissive.map")
  validateMap(material.clearcoat?.map, "clearcoat.map")
  validateMap(material.clearcoat?.roughnessMap, "clearcoat.roughnessMap")
  validateMap(material.clearcoat?.normalMap, "clearcoat.normalMap")
  validateMap(material.transmission?.map, "transmission.map")
  validateMap(material.sheen?.colorMap, "sheen.colorMap")
  validateMap(material.sheen?.roughnessMap, "sheen.roughnessMap")
  validateMap(material.anisotropy?.map, "anisotropy.map")

  return deepFreezeJson({ valid: errors.length === 0, errors })
}

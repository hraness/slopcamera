import { z } from "zod"

/**
 * Art direction is independent of the renderer, its library locks, and model choice.
 * Public copy cites this count; `scripts/check-copy.ts` fails on drift.
 */
export const VISUAL_STYLE_IDS = Object.freeze([
  "silent-actuality", "noir-35mm", "documentary-16mm", "super8-color",
  "theatrical-cel", "watercolor-storybook", "ink-sketch", "rubber-hose",
  "midcentury-limited", "cut-paper", "stopmotion-clay", "pixel-art",
  "rotoscope", "engraving", "math-explainer", "isometric-design", "clean-motion",
] as const)

export const VisualStyleIdSchema = z.enum(VISUAL_STYLE_IDS)
export type VisualStyleId = z.infer<typeof VisualStyleIdSchema>

const DirectionTextSchema = z.string().trim().min(1).max(512)
const DirectionListSchema = z.array(DirectionTextSchema).min(1).max(12).readonly()
const ColorSchema = z.string().regex(/^#[0-9a-f]{6}$/u)
const UnitSchema = z.number().finite().min(0).max(1)

export const VisualStyleProfileSchema = z.strictObject({
  id: VisualStyleIdSchema,
  name: z.string().trim().min(1).max(80),
  family: z.enum(["historical-film", "drawn-animation", "tactile-animation", "digital-animation", "explanation"]),
  summary: DirectionTextSchema,
  palette: z.strictObject({
    background: ColorSchema,
    ink: ColorSchema,
    paper: ColorSchema,
    primary: ColorSchema,
    secondary: ColorSchema,
    accent: ColorSchema,
  }).readonly(),
  cadence: z.strictObject({
    fps: z.number().int().min(1).max(120),
    exposureFrames: z.number().int().min(1).max(12),
    cameraExposureFrames: z.number().int().min(1).max(12),
    shutterAngle: z.number().finite().min(0).max(360),
  }).readonly(),
  delivery: z.strictObject({
    width: z.number().int().min(1080).max(8192).multipleOf(2),
    height: z.number().int().min(1080).max(8192).multipleOf(2),
    sampling: z.enum(["smooth", "nearest"]),
    logicalGrid: z.strictObject({
      width: z.number().int().min(16).max(1024),
      height: z.number().int().min(16).max(1024),
    }).readonly().optional(),
  }).superRefine((delivery, context) => {
    const grid = delivery.logicalGrid
    if (delivery.sampling === "nearest") {
      if (grid === undefined || delivery.width % grid.width !== 0
        || delivery.height % grid.height !== 0
        || delivery.width / grid.width !== delivery.height / grid.height) {
        context.addIssue({ code: "custom", message: "Nearest sampling requires a logical grid with one exact integer scale on both axes." })
      }
    } else if (grid !== undefined) {
      context.addIssue({ code: "custom", message: "A logical pixel grid requires nearest sampling." })
    }
  }).readonly(),
  shape: DirectionListSchema,
  material: DirectionListSchema,
  camera: DirectionListSchema,
  finishing: z.strictObject({
    grain: UnitSchema,
    grainSizePxAt1080: z.number().finite().min(0).max(8),
    halation: UnitSchema,
    gateWeavePxAt1080: z.number().finite().min(0).max(4),
    vignette: UnitSchema,
    saturation: z.number().finite().min(0).max(2),
    contrast: z.number().finite().min(0.5).max(2),
  }).readonly(),
  avoid: DirectionListSchema,
  acceptance: DirectionListSchema,
}).readonly()

export type VisualStyleProfile = z.infer<typeof VisualStyleProfileSchema>

const cleanFinish: VisualStyleProfile["finishing"] = Object.freeze({
  grain: 0, grainSizePxAt1080: 0, halation: 0, gateWeavePxAt1080: 0,
  vignette: 0, saturation: 1, contrast: 1,
})
const cinema = Object.freeze({ fps: 24, exposureFrames: 1, cameraExposureFrames: 1, shutterAngle: 180 })
const onTwos = Object.freeze({ fps: 24, exposureFrames: 2, cameraExposureFrames: 1, shutterAngle: 0 })
const uhd = Object.freeze({ width: 3840, height: 2160, sampling: "smooth" as const })
const academy = Object.freeze({ width: 2880, height: 2160, sampling: "smooth" as const })

function profile(value: z.input<typeof VisualStyleProfileSchema>): VisualStyleProfile {
  return VisualStyleProfileSchema.parse(value)
}

/** Recommendations, not automatic effects or claims of historical authenticity. */
export const VISUAL_STYLE_PROFILES: readonly VisualStyleProfile[] = Object.freeze([
  profile({
    id: "silent-actuality", name: "Silent actuality", family: "historical-film",
    summary: "An observed street or everyday action reconstructed with early monochrome photography, a restrained camera, and a coherent period world.",
    palette: { background: "#171714", ink: "#080909", paper: "#e2dfce", primary: "#a7a797", secondary: "#666b63", accent: "#c6c3ad" },
    cadence: { fps: 24, exposureFrames: 1, cameraExposureFrames: 1, shutterAngle: 180 }, delivery: academy,
    shape: ["Stage a deep street with foreground, middle distance, and a readable vanishing point.", "Choose one place and decade; match silhouettes of buildings, signs, transport, and clothing to that brief."],
    material: ["Use rough masonry, imperfect glazing, worn painted timber, and matte clothing; build surface detail before aging the image.", "Separate sky, pale facades, dark coats, and street into readable monochrome values."],
    camera: ["Use an eye-level locked tripod or a very slow mechanically plausible pan; let the world supply movement.", "Keep the 4:3 gate visible through composition; introduce only low-amplitude frame-wise registration variation."],
    finishing: { grain: 0.16, grainSizePxAt1080: 1.4, halation: 0.04, gateWeavePxAt1080: 0.65, vignette: 0.18, saturation: 0, contrast: 1.08 },
    avoid: ["Do not equate historical film with sepia, a black border, or repeated scratch overlays.", "Avoid glossy CGI, contemporary props, drone paths, fake archive dates, and unqualified documentary claims."],
    acceptance: ["With texture disabled, the world and framing still read as the selected period.", "Moving subjects remain legible; grain changes per exposed frame, while scratches and weave do not overpower the action.", "Review full-resolution surfaces and motion; label the result as an authored reconstruction, not found footage."],
  }),
  profile({
    id: "noir-35mm", name: "35 mm noir", family: "historical-film",
    summary: "A dramatic monochrome city or interior organized by motivated pools of light, negative space, and strong depth.",
    palette: { background: "#101316", ink: "#040608", paper: "#f1efe5", primary: "#aeb5b7", secondary: "#475159", accent: "#d6d4c9" },
    cadence: cinema, delivery: academy,
    shape: ["Use one strong silhouette, diagonal blocking, and a deep foreground-to-background relationship.", "Let window mullions, stairs, awnings, and practical lights produce motivated graphic shapes."],
    material: ["Give masonry, wet pavement, wool, skin, and glass distinct tonal responses.", "Protect luminous highlights while holding enough shadow detail to read the principal action."],
    camera: ["Use a deliberate dolly, fixed composition, or motivated low angle; decide the point of attention before moving.", "Let occlusion and lighting reveal the subject instead of adding random camera shake."],
    finishing: { grain: 0.08, grainSizePxAt1080: 0.9, halation: 0.08, gateWeavePxAt1080: 0.15, vignette: 0.16, saturation: 0, contrast: 1.2 },
    avoid: ["Do not crush every shadow or turn wet streets into mirror-like plastic.", "Avoid neon cyberpunk color, arbitrary fog, or broad blur that erases the staged action."],
    acceptance: ["The eye finds the subject in a thumbnail and still sees the intended shadow detail at full size.", "Light sources explain the shadows and reflections; the complete motion preserves this logic."],
  }),
  profile({
    id: "documentary-16mm", name: "16 mm documentary", family: "historical-film",
    summary: "A patient observational view with plausible handheld weight, tactile surfaces, restrained color, and the texture of a small film gauge.",
    palette: { background: "#343731", ink: "#202824", paper: "#d8d2af", primary: "#a7996e", secondary: "#66807c", accent: "#b86644" },
    cadence: cinema, delivery: academy,
    shape: ["Stage a specific ordinary activity with incidental depth and asymmetry.", "Resolve period street furniture, signage, vehicles, and building details before styling."],
    material: ["Use natural light, restrained saturation, rough plaster, faded paint, and uneven reflectance.", "Keep highlight roll-off soft and retain believable material scale in close and distant surfaces."],
    camera: ["Use a human-height view, slow reframing, and very small smooth operator drift.", "Pick a plausible lens and viewpoint; foreground parallax must follow camera translation."],
    finishing: { grain: 0.13, grainSizePxAt1080: 1.3, halation: 0.07, gateWeavePxAt1080: 0.3, vignette: 0.12, saturation: 0.72, contrast: 0.96 },
    avoid: ["Avoid pristine game-engine materials, evenly spaced procedural city blocks, and modern billboard typography in a period scene.", "Do not simulate handheld photography with frantic random movement or apply grain that swims independently of frames."],
    acceptance: ["The untreated scene has convincing period objects, human scale, lighting, and material variation.", "Camera drift feels operated, the principal activity stays readable, and small highlights do not clip broadly."],
  }),
  profile({
    id: "super8-color", name: "Super 8 color memory", family: "historical-film",
    summary: "An intimate small-gauge color scene with warm highlights, gentle exposure breathing, and grounded everyday details.",
    palette: { background: "#302c28", ink: "#263333", paper: "#ead5a4", primary: "#c59a60", secondary: "#698c80", accent: "#bd6650" },
    cadence: { fps: 18, exposureFrames: 1, cameraExposureFrames: 1, shutterAngle: 180 }, delivery: academy,
    shape: ["Favor intimate framing, simple gestures, and irregular lived-in surroundings.", "Choose one dominant warm/cool relationship and reserve bright color for a small focal object."],
    material: ["Use fabric, foliage, skin, glass, and paint with visible but gentle surface detail.", "Keep a soft tonal shoulder and restrained shadow color; emulate a chosen look without claiming an exact film-stock match."],
    camera: ["Keep movement light and human, with short settled moments between reframes.", "Author a complete first and last composition; use exposure breathing sparingly and continuously."],
    finishing: { grain: 0.18, grainSizePxAt1080: 1.8, halation: 0.12, gateWeavePxAt1080: 0.55, vignette: 0.17, saturation: 0.84, contrast: 0.93 },
    avoid: ["Avoid looping light leaks, damaged-film overlays in every frame, and extreme orange skin.", "Do not confuse a 4K delivery raster with invented high-frequency detail inside the small-gauge image."],
    acceptance: ["The frame reads as an intimate photograph before grain is added.", "The 18 fps delivery has intentional motion cadence, retained subject detail, and no sudden exposure flashes."],
  }),
  profile({
    id: "theatrical-cel", name: "Theatrical cel animation", family: "drawn-animation",
    summary: "Late-1980s theatrical anime craft: dimensional layouts, intricate painted environments, decisive ink contours, and controlled cel shadows.",
    palette: { background: "#101e2c", ink: "#111626", paper: "#c1d3d0", primary: "#396275", secondary: "#9b745e", accent: "#ec593f" },
    cadence: onTwos, delivery: uhd,
    shape: ["Construct convincing perspective and a clear silhouette with designed mechanical and architectural details.", "Separate painted background planes from animated foreground cels; reserve high-detail edges for the focal region."],
    material: ["Use varied ink weight, two or three purposeful shadow shapes, and opaque painted color.", "Give background paintings richer texture and atmospheric depth while keeping moving cels clean."],
    camera: ["Use a composed layout, measured multiplane translation, and a clear action axis.", "Hold character drawings on twos by default; reserve ones, smears, or impact drawings for specifically authored actions."],
    finishing: { grain: 0.025, grainSizePxAt1080: 0.6, halation: 0.045, gateWeavePxAt1080: 0, vignette: 0.04, saturation: 0.95, contrast: 1.06 },
    avoid: ["Avoid generic glossy 3D with a black outline, arbitrary neon, and uniformly detailed noise.", "Do not copy a film's characters, logos, or specific shot; translate the production principles into an original scene."],
    acceptance: ["Silhouette, perspective, ink, cel-shadow grouping, and painted depth remain convincing without grain.", "Camera motion stays smooth while exposed character poses hold intentionally; motion does not slide joints or contours."],
  }),
  profile({
    id: "watercolor-storybook", name: "Watercolor storybook", family: "drawn-animation",
    summary: "A luminous painted illustration brought to life through selective movement, pigment pooling, and breathing paper space.",
    palette: { background: "#eee8d6", ink: "#575b57", paper: "#fff8e6", primary: "#709487", secondary: "#8ba9b6", accent: "#c67757" },
    cadence: onTwos, delivery: uhd,
    shape: ["Compose broad washed silhouettes, irregular contours, and generous unpainted paper.", "Design a limited set of focal edges; allow distant forms to dissolve into larger color masses."],
    material: ["Create translucent overlapping washes with edge pooling and subtle fixed paper tooth.", "Bind pigment texture to the painted object rather than regenerating all texture on every frame."],
    camera: ["Use a quiet tableau or shallow multiplane drift.", "Animate one narrative gesture at a time with soft anticipation and a settled pause."],
    finishing: { ...cleanFinish, grain: 0.025, grainSizePxAt1080: 0.6, saturation: 0.75 },
    avoid: ["Avoid wet-looking plastic, uniform Gaussian blur, and a noise filter that obscures the drawing.", "Do not let paper texture crawl or painted edges shimmer between held drawings."],
    acceptance: ["Paper, transparent wash, pooled pigment, and focal edge hierarchy are individually visible.", "Texture follows objects and motion leaves the composition calm and readable."],
  }),
  profile({
    id: "ink-sketch", name: "Living ink sketch", family: "drawn-animation",
    summary: "An expressive drawing with intentional line economy, selective hatching, and restrained redraw variation.",
    palette: { background: "#eee9dc", ink: "#282c2d", paper: "#fbf5e5", primary: "#566565", secondary: "#acaaa0", accent: "#b86742" },
    cadence: { ...onTwos, exposureFrames: 3 }, delivery: uhd,
    shape: ["Establish contour, gesture, and hierarchy before adding crosshatching.", "Let open contours and deliberate omissions carry light; vary line weight by depth and emphasis."],
    material: ["Use a small set of pressure-sensitive strokes with directionally consistent hatching.", "Register each redraw to the same underlying shape so line boil does not deform the subject."],
    camera: ["Keep a stable drawing surface or make one legible pan across the sheet.", "Use held poses, brief drawing reveals, and small secondary gestures."],
    finishing: { ...cleanFinish, saturation: 0.25 },
    avoid: ["Avoid vector-perfect uniform outlines, evenly applied scribble noise, and permanent jitter of every point.", "Do not add decorative hatching over labels or important negative space."],
    acceptance: ["The gesture reads at thumbnail size and line hierarchy remains clear at full resolution.", "Redraw variation is subtle and stable within each exposure; no unintended frame-to-frame crawling."],
  }),
  profile({
    id: "rubber-hose", name: "Rubber-hose cartoon", family: "drawn-animation",
    summary: "Elastic early-cartoon movement with clean silhouettes, rhythmic arcs, anticipation, and appealing graphic staging.",
    palette: { background: "#d5cdbb", ink: "#252523", paper: "#f4eddc", primary: "#5f655d", secondary: "#96998a", accent: "#b28355" },
    cadence: onTwos, delivery: academy,
    shape: ["Build readable bean-shaped torsos, curved hose limbs, and large simple hands and feet.", "Stage clear silhouettes with ample space for arcs, squash, stretch, and overlap."],
    material: ["Use opaque flat ink and warm paper-like backgrounds with sparse decorative detail.", "Keep line weight and facial registration stable as the body deforms."],
    camera: ["Favor a fixed theatrical view and whole-body acting.", "Author anticipation, action, overshoot, and settle; preserve foot contact during planted poses."],
    finishing: { grain: 0.04, grainSizePxAt1080: 0.8, halation: 0, gateWeavePxAt1080: 0.08, vignette: 0.06, saturation: 0.15, contrast: 1.05 },
    avoid: ["Avoid sliding feet, unexplained limb length changes, and constant sine-wave movement without acting beats.", "Use original characters and props rather than familiar cartoon mascots."],
    acceptance: ["Anticipation, elastic action, follow-through, and a settled pose can be identified in the complete clip.", "Feet and hands make intentional contact, and facial features remain readable through deformation."],
  }),
  profile({
    id: "midcentury-limited", name: "Mid-century limited animation", family: "drawn-animation",
    summary: "Modernist graphic staging with asymmetric shapes, flat color, spare backgrounds, and selective expressive movement.",
    palette: { background: "#e7dab6", ink: "#263739", paper: "#f6edd5", primary: "#467f82", secondary: "#c79744", accent: "#cf6049" },
    cadence: { ...onTwos, exposureFrames: 3 }, delivery: uhd,
    shape: ["Design large asymmetric color blocks and stylized angular silhouettes.", "Use negative space and economical drawn details to direct attention."],
    material: ["Favor matte gouache-like flat fields with slight fixed paper texture.", "Keep a few controlled overlaps and color relationships rather than realistic shading."],
    camera: ["Treat the frame as a designed poster; use purposeful pans or held compositions.", "Animate the expressive part while holding the body or background; time actions around clear pauses."],
    finishing: { ...cleanFinish, saturation: 0.88 },
    avoid: ["Avoid gradients on every shape, generic geometric confetti, and continual motion of every object.", "Limited animation still needs poses, timing, and staging; do not substitute random bobbing."],
    acceptance: ["The still frame reads as a coherent graphic design with a dominant focal shape.", "Selective motion clarifies the action and the held regions feel intentional."],
  }),
  profile({
    id: "cut-paper", name: "Layered cut paper", family: "tactile-animation",
    summary: "A handmade collage with meaningful overlaps, irregular cut edges, restrained paper relief, and mechanical articulation.",
    palette: { background: "#dad2b9", ink: "#374a43", paper: "#f6edce", primary: "#597d66", secondary: "#d2a45b", accent: "#bf5d45" },
    cadence: onTwos, delivery: uhd,
    shape: ["Build a small number of nested, readable paper silhouettes and visible articulation pivots.", "Let overlapping layers explain the spatial construction."],
    material: ["Use fixed fiber texture, small edge irregularities, and soft contact shadows proportional to paper thickness.", "Keep lighting direction consistent across every layer."],
    camera: ["Use a mostly frontal rostrum view with restrained depth changes.", "Move paper pieces around authored pivots and stepped poses; keep texture attached to each piece."],
    finishing: { ...cleanFinish, saturation: 0.84 },
    avoid: ["Avoid inflated bevels, thick plastic shadows, sliding textures, and smooth stretchy limbs.", "Do not make the whole scene look like a flat vector image with one global drop shadow."],
    acceptance: ["Separate paper layers, their contact shadows, and edge character are readable.", "Articulation, occlusion, and paper texture remain consistent throughout motion."],
  }),
  profile({
    id: "stopmotion-clay", name: "Clay stop motion", family: "tactile-animation",
    summary: "A miniature tactile set with shaped clay, practical lighting, intentional pose increments, and believable physical contact.",
    palette: { background: "#283f47", ink: "#22333a", paper: "#edd6a9", primary: "#719b92", secondary: "#d8a451", accent: "#c16b54" },
    cadence: { ...onTwos, cameraExposureFrames: 2 }, delivery: uhd,
    shape: ["Design a strong hand-shaped silhouette with slightly irregular proportions and tangible seams.", "Stage a small set whose miniature scale is supported by prop size and limited depth."],
    material: ["Use soft diffuse clay with sparse tool marks and local roughness variation.", "Create contact shadows and controlled depth of field; avoid uniformly shiny surfaces."],
    camera: ["Use a physically plausible fixed miniature camera or slow incremented move.", "Author weight shifts and stepped poses, preserving planted contacts and deliberate squash."],
    finishing: { ...cleanFinish, grain: 0.018, grainSizePxAt1080: 0.6, vignette: 0.05, saturation: 0.86 },
    avoid: ["Avoid frictionless interpolation, floating props, animated texture noise, and glossy toy materials.", "Do not call procedural wobble a physical simulation or claim a practical shoot."],
    acceptance: ["Clay surface, contact, miniature lighting, and stepped posing all contribute to the treatment.", "No planted foot slides, prop intersections, or focus changes conceal the principal action."],
  }),
  profile({
    id: "pixel-art", name: "Authored pixel art", family: "digital-animation",
    summary: "A deliberately drawn low-resolution world with a limited palette, designed pixel clusters, discrete poses, and exact integer enlargement.",
    palette: { background: "#182633", ink: "#111c2d", paper: "#e6dcc1", primary: "#5c9c83", secondary: "#d2aa63", accent: "#d96658" },
    cadence: { ...onTwos, cameraExposureFrames: 2 },
    delivery: { ...uhd, sampling: "nearest", logicalGrid: { width: 320, height: 180 } },
    shape: ["Draw on the declared 320 by 180 logical grid with readable clusters and deliberate stair-step diagonals.", "Separate foreground sprites, midground tiles, and distant parallax planes with value and palette."],
    material: ["Use a bounded palette with authored highlight and shadow ramps.", "Place dithering only where it explains a gradient or material; preserve crisp one-pixel accents."],
    camera: ["Quantize sprite positions and camera translation to logical pixels.", "Use authored pose changes and integer parallax offsets; export with a single nearest-neighbor integer scale."],
    finishing: cleanFinish,
    avoid: ["Avoid anti-aliasing, postprocess blur, noninteger scaling, smooth subpixel translation, and a pixelation filter over an unrelated image.", "Do not add film grain or screen simulation by default; those are separate authored treatments."],
    acceptance: ["Each logical pixel maps to an equal, crisp 12 by 12 output block in the recommended 3840 by 2160 delivery.", "Palette, sprite clusters, occlusion, and pose changes read clearly throughout the full clip."],
  }),
  profile({
    id: "rotoscope", name: "Painterly rotoscope", family: "drawn-animation",
    summary: "Naturalistic human movement translated into stable painted masses, expressive contour, and deliberately simplified light.",
    palette: { background: "#243747", ink: "#172934", paper: "#e7d8bc", primary: "#798b82", secondary: "#b08a69", accent: "#dc8561" },
    cadence: onTwos, delivery: uhd,
    shape: ["Preserve anatomical landmarks, weight, and the readable gesture from an authorized reference or deliberately authored motion.", "Simplify the figure into consistent large painted masses instead of tracing every visible texture."],
    material: ["Keep controlled contour variation and two or three light groups attached to the subject.", "Let brush texture follow body surfaces and maintain facial landmark identity."],
    camera: ["Use a stable action axis and clear full-body or close gesture framing.", "Retain natural timing and planted contact; author redraw variation per exposure rather than per display refresh."],
    finishing: { ...cleanFinish, grain: 0.012, grainSizePxAt1080: 0.5, saturation: 0.78 },
    avoid: ["Avoid edge-detection filters, flickering facial features, crawling paint, and rubbery anatomical drift.", "Do not describe a scene as reference-traced unless an actual authorized reference was used."],
    acceptance: ["Weight shifts and gestures remain plausible, with stable anatomy and consistent light grouping.", "Contours and texture hold coherently between exposures without accidental shimmer."],
  }),
  profile({
    id: "engraving", name: "Engraved illustration", family: "drawn-animation",
    summary: "A precise monochrome illustration whose curved hatching, contour hierarchy, and open paper explain form.",
    palette: { background: "#e8dfc8", ink: "#25322f", paper: "#f6ecd2", primary: "#52645b", secondary: "#a5ab92", accent: "#9b653d" },
    cadence: cinema, delivery: uhd,
    shape: ["Use a clear structural outline and reserve fine marks for material and curvature.", "Organize hatching into form-following bands with intentional light gaps."],
    material: ["Render crisp fine ink with sparse paper texture and deliberate crosshatch density.", "Keep line spacing wide enough to survive the actual delivery raster and video encoding."],
    camera: ["Use a slow explanatory reveal, rotation, or camera move with stable line registration.", "If the underlying form moves, move its hatch coordinates with it rather than sampling new screen-space noise."],
    finishing: { ...cleanFinish, saturation: 0.08 },
    avoid: ["Avoid uniform screen-space hatch overlays, moire, crushed dense line fields, and illegible decorative labels.", "Do not present an artistic mechanical drawing as dimensionally verified engineering."],
    acceptance: ["Hatch direction describes form and fine lines remain distinct in a full-resolution delivery frame.", "Motion does not create moire or crawl that overwhelms the subject."],
  }),
  profile({
    id: "math-explainer", name: "Mathematical explanation", family: "explanation",
    summary: "A lucid visual argument built from persistent objects, purposeful color, geometric construction, and time to understand each step.",
    palette: { background: "#101c2a", ink: "#e0e8ed", paper: "#f4f1de", primary: "#59b6d5", secondary: "#e4bf63", accent: "#df7e82" },
    cadence: { fps: 30, exposureFrames: 1, cameraExposureFrames: 1, shutterAngle: 0 }, delivery: uhd,
    shape: ["Choose one mathematical claim; construct the relevant objects before transforming or comparing them.", "Use persistent object identities, meaningful axes, clear labels, and whitespace around the argument."],
    material: ["Use clean vector strokes, restrained fills, and consistent notation with semantic colors.", "Keep line weight, label size, and contrast readable at the intended viewing size."],
    camera: ["Hold a stable coordinate system unless a move directly explains the mathematics.", "Sequence setup, construction, transformation, comparison, and conclusion with deliberate pauses."],
    finishing: cleanFinish,
    avoid: ["Avoid decorative equations, unsupported numeric claims, arbitrary camera spins, and simultaneous unrelated reveals.", "Do not substitute a familiar presenter's mascot or identity for the clarity of the explanation."],
    acceptance: ["The illustrated relationship can be checked from the authored geometry or data.", "Each color keeps its meaning, labels remain legible, and each logical step has a readable settled state."],
  }),
  profile({
    id: "isometric-design", name: "Isometric design study", family: "digital-animation",
    summary: "An orthographic object or system study with consistent construction, restrained materials, and diagram-like spatial clarity.",
    palette: { background: "#e6e5db", ink: "#2c4147", paper: "#f7f2df", primary: "#7b9c93", secondary: "#d1ad66", accent: "#c9674d" },
    cadence: cinema, delivery: uhd,
    shape: ["Use one consistent orthographic projection and a clear assembled silhouette.", "Make repeated parts and physical relationships coherent; reserve detail for the function being explained."],
    material: ["Assign a small palette of believable matte, metal, glass, and rubber responses where appropriate.", "Use soft contact shadows and explicit edges to separate adjacent parts."],
    camera: ["Hold the projection and composition during assembly or an exploded view.", "Move components along meaningful axes and include a settled assembled and separated state."],
    finishing: cleanFinish,
    avoid: ["Avoid inconsistent vanishing points, floating unconnected parts, excessive bevels, and candy-like materials on every surface.", "Do not imply fabrication readiness without dimensional and engineering validation."],
    acceptance: ["Part relationships remain legible during every movement, with no accidental intersection or cropped component.", "The final composition has coherent scale, contact, projection, and material distinction."],
  }),
  profile({
    id: "clean-motion", name: "Editorial motion graphics", family: "digital-animation",
    summary: "Precise typography, controlled hierarchy, and economical choreography organized around a clear editorial message.",
    palette: { background: "#15232e", ink: "#f2eee1", paper: "#f8f4e9", primary: "#7cafb1", secondary: "#d4b87b", accent: "#dc795b" },
    cadence: { fps: 30, exposureFrames: 1, cameraExposureFrames: 1, shutterAngle: 0 }, delivery: uhd,
    shape: ["Establish one typographic hierarchy, a consistent grid, and a small set of geometric devices.", "Use exact supplied copy and arrange it to read in the intended viewing order."],
    material: ["Use restrained flat color, carefully weighted rules, and crisp type at the final output size.", "Reserve texture and gradients for an authored editorial purpose."],
    camera: ["Treat the screen as a composition; use position, scale, and opacity only where they clarify hierarchy.", "Separate entrance, readable hold, transition, and exit; stagger related objects rather than animating everything at once."],
    finishing: cleanFinish,
    avoid: ["Avoid decorative dashboard cards, indiscriminate bounce, tiny type, and transitions that obscure supplied text.", "Do not introduce slogans, data, or claims absent from the brief."],
    acceptance: ["Exact copy reads comfortably in the delivery frame and remains visible long enough to understand.", "Every move has a purpose, spacing stays controlled, and the first and last frames are intentionally composed."],
  }),
])

const profilesById = new Map<VisualStyleId, VisualStyleProfile>(VISUAL_STYLE_PROFILES.map(item => [item.id, item]))

/** Returns immutable direction. It does not render, dispatch a model, or rewrite a source. */
export function getVisualStyleProfile(id: unknown): VisualStyleProfile {
  return profilesById.get(VisualStyleIdSchema.parse(id))!
}

/** Explicit direction for an author or a model prompt; applying it remains a caller decision. */
export function createVisualStyleDirection(id: unknown): string {
  const style = getVisualStyleProfile(id)
  const grid = style.delivery.logicalGrid
  return [
    `${style.name}: ${style.summary}`,
    `Palette: ${Object.entries(style.palette).map(([role, color]) => `${role} ${color}`).join(", ")}.`,
    `Shape and staging: ${style.shape.join(" ")}`,
    `Materials and light: ${style.material.join(" ")}`,
    `Camera and motion: ${style.camera.join(" ")}`,
    `Cadence: ${style.cadence.fps} fps; subject exposure ${style.cadence.exposureFrames} frame(s); camera exposure ${style.cadence.cameraExposureFrames} frame(s); shutter angle ${style.cadence.shutterAngle} degrees.`,
    `Finishing targets: ${Object.entries(style.finishing).map(([name, value]) => `${name}=${value}`).join(", ")}. These are authoring controls, not a film-stock calibration.`,
    `Recommended delivery: ${style.delivery.width} by ${style.delivery.height}, ${style.delivery.sampling} sampling.${grid === undefined ? "" : ` Author at ${grid.width} by ${grid.height} logical pixels and enlarge by exactly ${style.delivery.width / grid.width}.`}`,
    `Avoid: ${style.avoid.join(" ")}`,
    `Review actual frames and motion: ${style.acceptance.join(" ")}`,
  ].join("\n")
}

const MAX_STYLE_TIME_US = 3_600_000_000

function checkInteger(value: number, name: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer from 0 through ${maximum}.`)
  }
}

export type VisualStyleExposure = Readonly<{
  frame: number
  exposureIndex: number
  exposureTimeUs: number
  cameraTimeUs: number
}>

/** Independent subject and camera holds on an absolute microsecond clock. No state is accumulated. */
export function sampleVisualStyleExposure(timeUs: number, id: unknown): VisualStyleExposure {
  checkInteger(timeUs, "timeUs", MAX_STYLE_TIME_US)
  const { fps, exposureFrames, cameraExposureFrames } = getVisualStyleProfile(id).cadence
  const frame = Math.floor(timeUs * fps / 1_000_000) || 0
  const exposureIndex = Math.floor(frame / exposureFrames)
  const cameraFrame = Math.floor(frame / cameraExposureFrames) * cameraExposureFrames
  return Object.freeze({
    frame,
    exposureIndex,
    // Ceil selects the first integer microsecond inside the held frame. Flooring
    // a nonintegral frame boundary would seek back into the previous exposure.
    exposureTimeUs: Math.ceil(exposureIndex * exposureFrames * 1_000_000 / fps),
    cameraTimeUs: Math.ceil(cameraFrame * 1_000_000 / fps),
  })
}

/** Versioned keyed variation; use an exposure index for redraws, or a frame index for film grain. */
export const VISUAL_STYLE_VARIATION_ALGORITHM = "slopcamera.visual-style.fnv1a-avalanche-v1" as const

export function visualStyleFrameVariation(seed: number, frame: number, channel: string): number {
  checkInteger(seed, "seed", 0xffff_ffff)
  checkInteger(frame, "frame", 432_000)
  if (typeof channel !== "string" || channel.length < 1 || channel.length > 128
    || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u.test(channel)) {
    throw new TypeError("channel must be 1–128 ASCII letters, digits, dots, underscores, colons, slashes, or hyphens, beginning with a letter or digit.")
  }
  let value = (2166136261 ^ seed) >>> 0
  for (let index = 0; index < 4; index += 1) {
    value = Math.imul(value ^ ((frame >>> (index * 8)) & 255), 16777619) >>> 0
  }
  for (let index = 0; index < channel.length; index += 1) {
    value = Math.imul(value ^ channel.charCodeAt(index), 16777619) >>> 0
  }
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000
}

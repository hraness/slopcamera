# Direct a visual style

Use this reference when a scene needs a recognizable film or animation language,
or when producing a portfolio of distinct styles. The current-source `style`
catalog records reusable production decisions:

```sh
slopcamera style list --json
slopcamera style show silent-actuality --json
slopcamera style show theatrical-cel --json
```

These profiles are art direction. They do not automatically transform an image,
replace a scene's materials, synthesize character animation, or certify historical
accuracy. Apply them through an appropriate renderer. The seven `html catalog`
profiles describe rendering tools; visual styles are a separate choice.

## Establish the picture before the finish

Write a short direction for the specific subject: setting and period, dominant
silhouette, foreground and distance planes, light source, camera position, one
readable action, and intended emotional rhythm. Keep the user's literal facts and
selected identity. Where invention is authorized, give the subject a concrete
setting and action instead of filling the prompt with quality adjectives.

Select the renderer that can produce the needed evidence:

| Picture requirement | Useful route |
| --- | --- |
| Volumetric light, physical material, contact, perspective, architecture | Blender studio or Three scene |
| Drawn contours, held drawings, flat shadow shapes, graphic composition | Canvas/p5/Two HTML scene |
| Correct mathematical construction with deliberate teaching beats | Manim or checked deterministic Canvas geometry |
| Photographic or painted source assets that procedural geometry cannot supply | Authorized Gateway image generation, then reviewed composition |
| Photochemical finishing of an already convincing source | Existing ordered video-look effects, with restrained diffusion, grain, and vignette |

A photo-textured background does not make moving geometry photorealistic. A
Canvas material study does not demonstrate a physical clay simulation. Name the
actual method in a portfolio caption.

For creative delivery without specified dimensions, start at 1920×1080 or an
equivalent frame in the intended aspect ratio. Use 3840×2160 for a still or short
master when the renderer and content benefit. Render previews smaller only for
iteration, and label them as previews. Do not upscale a draft and call it native
high-resolution detail. A 4:3 silent-film composition and a low-resolution pixel
grid are deliberate exceptions to widescreen layout, not lower quality targets.

## Historical film

Choose a period and acquisition process before choosing damage. Early silent
actuality, a 1940s studio negative, postwar 16mm documentary, and a 1970s home movie
have different framing, motion, lighting, tonal latitude, and surface texture.
Use a dated primary reference for specific history and label uncertain geometry
or staging as interpretation. A source link beside an invented measurement does
not verify that measurement.

For an early street actuality:

- Research street furniture, transport, overhead utilities, paving, clothing,
  signage, and the sightline. Keep source-supported facts separate from estimated
  dimensions and compressed geography. Inspect generated images for contradictions
  even when the prompt explicitly forbids them. Do not add a familiar landmark or lamp
  merely because it exists there today.
- Stage a useful street depth: irregular storefront bays, window recesses,
  cornices, varied reflectance, believable kerbs, contact shadows, and atmospheric
  distance. Keep buildings from reading as identical extruded blocks.
- Put the camera on the actual support, such as a cable car at a plausible human
  height and speed. Keep distant geography coherent as it moves. Avoid a drone
  orbit, wide modern lens, skyline reveal, or floating gimbal unless the reference
  supports it.
- Set capture cadence and playback cadence separately. A selected 16 fps
  reconstruction is an artistic timing choice, not proof of the source camera's
  exact crank speed. Hold drawings or photographed exposures deliberately; do
  not interpolate every style to 60 fps.
- Plan the monochrome values in the source. Early film spectral response cannot
  be recovered by desaturating arbitrary modern colors. Make roofs, skin,
  clothing, sky, and street separate in luminance; tune this against the reference.
- Apply gentle highlight compression, optical softness, and restrained vignette
  after the source works. Keep frame-varying grain fine enough to preserve facade
  detail. Inspect wet surfaces, grain and stroke widths at final pixel size. Separate
  visible sky brightness from ambient fill when a bright sky washes out contact
  shadows; inspect material mapping on every visible face orientation.
  Gate weave belongs to the entire image, not separate jittering objects.
  Dirt and scratches are optional print wear, not the definition of old film.

Distinguish capture, print, restoration, and scan. A clean high-resolution scan
can retain fine texture and stable framing. Do not add heavy dust, crushed blacks,
sepia, random flicker, letterbox bars, or a fake timecode by habit. Keep invented
archival-looking footage labeled as an authored interpretation. A photographic
plate with optical movement is a still-image study, not evidence of independently
animated people, vehicles, or a historical event.

The Market Street example includes a source manifest and an explicitly compressed
street plan. Consult the Library of Congress film and SFMTA history linked in the
example before changing its dates or street equipment.

## Animation families

An influence such as *Akira* or 3Blue1Brown is useful reference language. Translate
it into mechanisms and create original subjects and compositions. The catalog
uses generic technique names so the direction is reusable beyond one reference.

| Family | Construct the image and movement | Reject at review |
| --- | --- | --- |
| Theatrical cel | Painted depth planes; precise perspective; selective contour weight; solid shadow shapes; articulated motion; held poses and short accents; camera motion sampled independently | Glossy toy materials, uniform outline filters, idle motion everywhere |
| Watercolor storybook | Broad pigment washes, warm paper, lost edges, a focal patch of crisp ink, gentle overlapping action | A blur over vector art, evenly noisy outlines, identical texture on every object |
| Ink sketch | Confident primary contours, sparse searching lines, directional hatching, selected line boil tied to held drawings | Unstable silhouettes, crosshatching through highlights, whole-scene wobble |
| Rubber hose | Strong readable silhouette, curved limbs, arcs, anticipation, squash and stretch with volume awareness, clear contact | Random sine waves on every joint, sliding feet, impossible eye direction |
| Midcentury limited | Asymmetric geometry, restrained spot palette, texture fields, selective held animation, strong negative space | Full constant motion, muddy colors, ornamental texture obscuring the subject |
| Cut paper | Distinct cut contours, shallow layer separation, directional edge shadows, articulated pivots and reveal order | Universal blur, deep plastic bevels, disconnected shadows |
| Stop-motion clay | Fingerprint-scale surface, soft contact, slightly imperfect construction, intentionally stepped poses and weighted settling | A smooth wobbling sphere described as physical stop motion, glossy uniform skin |
| Pixel art | Explicit logical grid, limited palette, clustered shading, authored sprite poses, integer-aligned travel, nearest-neighbor integer scale | Blurred scaling, subpixel edges, unrestricted gradients, every object at a different pixel size |
| Rotoscope | Gesture and weight from coherent anatomy, restrained contour drift, distinct held silhouettes, consistent volume | Unmotivated jitter, bendy joints, inconsistent limb lengths |
| Engraving | Hatching follows form; line density describes value; leave highlights open; compose large black and white masses | Uniform screen-space stripe overlays or crushed unreadable detail |
| Mathematical explanation | State one claim, assign stable colors, construct the relation, pause at its implication, keep notation readable | Decorative formulas, mismatched axes, moving labels, false equality, a waveform inconsistent with its generators |
| Isometric design | Stable projection, consistent edge families, hierarchy through material and spacing, staged exploded movement | Conflicting vanishing points, changing scale, unrelated decorative labels |
| Clean motion | A small set of shapes, optical alignment, purposeful easing, pauses, consistent transformation rules | Continuous bouncing, gratuitous overshoot, generic orbiting particles |

Build the action from anticipation, main movement, follow-through, and a readable
hold when those suit the style. Offset secondary action; avoid identical phase on
every leaf or limb. Derive state from absolute frame time, with seeded variation
keyed to the object and exposure index. Keep stable construction randomness
separate from intentionally changing drawing or grain randomness. Seeking frames
in a different order must reproduce the same image.

## Review and retain

Review representative frames before a full render: establishing view, strongest
action, transition, and ending. Then inspect the encoded movie for timing,
flicker, texture shimmer, crop, strobing, text, and compression. Pixel-level
sharpness does not establish coherent art direction. A large output dimension
does not establish source detail.

For a portfolio, select different subjects and compositions that reveal each
technique. Include the editable sources, profile IDs, actual output dimensions,
render receipts, and honest renderer labels. Separate reusable direction from
scene-specific drawing code. A contact sheet supports visual comparison; it does
not replace checking motion. Preserve an old result when it explains a change.

Keep bounded render jobs and their original sources. Dense grain can make a
lossless intermediate exceed the existing media bound, especially at 4K. Shorten
the shot or split it into retained takes without weakening that boundary. Do not
retry an ambiguous native or paid generation before inspecting its retained state.

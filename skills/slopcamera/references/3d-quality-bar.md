# Apply the 3D quality bar

Apply this bar to every 3D brief: Three/Spark scenes, Blender, CadQuery or
Manim studio jobs, and web assets. A brief can ask for it in four words,
"accurate physics, AAA graphics, VFX", but it applies when the brief is silent
too. Follow the user's explicit settings when they conflict with it, such as a
flat-shaded style, a pixel grid, a stylized cartoon fall or a draft preview, and
name what you relaxed in the handoff.

## Accurate physics

- Model in real-world scale. Author meters, declare the source units and up axis
  on every model output, and check measured bounds against the object's real size.
- Give objects plausible mass, gravity and contact. Things rest on surfaces,
  touch where they join, and fall, bounce or slide at believable rates.
- Simulate in Blender only where the native host supports it: rigid bodies,
  cloth, fluid and particle systems inside a trusted studio job, baked to a
  retained cache before the render stage. Start from `blender-cloth` or
  `blender-fluid` for cloth and liquid.
- In Three/Spark scenes, `slopcamera scene effects bake` runs a deterministic
  rigid-body bake: gravity, springs and fixed constraints, plus free rotation.
  It has no contact or collision response and rejects hinge constraints, so
  stage resting contact and impacts by hand or simulate them in Blender.
- Never fake motion that breaks plausibility, such as objects passing through
  each other, floating contacts, or keyframed falls that ignore gravity.

The Three/Spark scene renderer has no live physics engine. Motion there is
authored or baked ahead of the render; nothing collides at render time, and the
HTML `three` profile has no physics at all beyond what your page computes. Simulator
settings alone are not evidence: inspect the cache, contacts and evaluated
geometry.

## AAA graphics

- Use physically based materials: base color, metallic, roughness and normal
  maps with values in their real ranges, and glTF PBR materials for GLB delivery.
- Manage color. In a Blender job set `viewTransform` to `AgX` for a finished
  look; `Standard` is for data, diagrams and exact brand colors. The job contract
  offers only `AgX` and `Standard`. In the HTML `three` profile the scaffold
  already sets sRGB output with ACES filmic tone mapping. In the spatial scene
  renderer, add the `tone-map` post-process step, an extended Reinhard curve with
  exposure and white point; it has no ACES or AgX option.
- Ground objects with soft shadows and ambient occlusion: area lights and
  Cycles or EEVEE shadows in Blender, baked AO for web assets, and the spatial
  renderer's soft shadow maps in beauty mode.
- Render with enough samples and denoise. Raise Cycles `samples` and set
  `denoise: true` for finals; keep low counts for previews only.
- Anti-alias every final. In Blender, render samples resolve edges, so check
  edges at 100 % before lowering samples. The HTML `three` scaffold creates its
  WebGL renderer with `antialias: true` (MSAA). The spatial scene renderer
  samples each pixel once at its center and has no MSAA, FXAA, SMAA or TAA, so
  its stills have aliased edges. When edges matter, render the shot in a Blender
  studio job or the HTML `three` profile.

## VFX

Use particles, volumetrics, motion blur, depth of field and bloom when they help
the shot read: dust that shows scale, haze that shows depth, blur that sells
speed, a focus pull that directs the eye. Leave them out when they only decorate.

- In Blender, author them in the scene source: particle systems, volume
  materials, camera depth of field and render motion blur.
- In spatial scenes, declare them in the render plan: `bloom`,
  `depth-of-field`, `motion-blur`, `grain`, `flare`, `lut-grade`, `vignette`
  and `chromatic-aberration` post-process steps, plus
  `slopcamera.spatial-particle-system` documents. Check them with
  `slopcamera scene effects check` before rendering.

## Review before handing back

Inspect the rendered frames at full size, not the source or a receipt, and
check each part:

1. Physics: scale reads true next to known objects; every contact touches;
   nothing floats, interpenetrates or moves against gravity; simulated motion
   comes from a retained bake.
2. Graphics: materials respond to light like their real counterparts; the
   intended view transform or tone map is applied once; shadows and AO ground
   each object; there is no sample noise or denoiser smear; edges are
   anti-aliased at 100 %.
3. VFX: each effect has a reason in the shot; bloom does not clip highlights;
   motion blur matches the motion; focus lands on the subject.

Report each failed check you could not fix, and each limit above that applied,
with the delivered artifact paths.

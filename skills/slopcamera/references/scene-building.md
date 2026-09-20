# Build and refine authored scenes

For an existing composition, go to [Refine an existing scene](#refine-an-existing-scene)
for staging, interaction, contact, and final delivery review.

Prefer helpers over hand-written scene JSON. The `@hraness/slopcamera/code` export ships pure builders in `spatial-scene/build` that return validated v1 scene data; feed their output into entities, transforms, and animation channels, then parse the whole scene before writing it. Helpers never read files, execute source, or touch a renderer, and every result already satisfies the contract schemas. Use [directed scenes](directed-scenes.md) for rendering, patching, and project commands.

## Camera and animation helpers

- `perspectiveFromFov({fovDeg, width, height, near, far})` → calibrated projection. `fovDeg` is the horizontal field of view.
- `lookAtPose(position, target)` → camera pose facing local −Z at the target.
- `frameFitPose(bounds, projection, margin)` → pose framing authored or admitted bounds.
- `easeKeys({from, to, durationUs, easing})` → dense keys for `linear`, `ease-in`, `ease-out`, or `ease-in-out`; `easeChannel({channelId, targetId, property, ...})` wraps them into a ready animation channel. Baked keys stay small: about 25 per 4-second span.
- `orbitKeys({center, radius, durationUs, ...})` → paired position and look-at rotation keys for a turntable.

## Layout and placement helpers

- `align(items, axis, edge)`, `distribute(items, axis, {gap}|{span})`, `row`, `column`, `stack` order existing entities by their transforms and optional bounds.
- `grid({rows, columns, cellSize, origin?})` → ground-plane cell positions; `scatter({seed, count, region, minSpacing?})` → deterministic seeded XZ positions.
- `groundSnap(transform, halfHeight, floorY)`, `onTopOf(moverBounds, moverTransform, targetBounds, targetTransform)`, `nextTo(...)`, `facing(transform, target)` resolve relations to concrete transforms immediately. They need bounds — primitives have them; GLB and splat bounds come from `scene asset admit` output or an explicit `--asset-bounds` map.

## The create → audit → patch loop

1. Build or generate the scene JSON.
2. `slopcamera scene audit scene.json --camera camera_hero --json` samples evaluated geometry across the duration and reports per-entity frustum state, projected pixel footprint, and findings such as off-camera or never-visible entities. `--times-us` picks explicit samples; `--asset-bounds bounds.json` supplies decoded asset enclosures as a bounds map, an admission document, a `{manifest, facts}` pair, or an array of those.
3. Fix with a typed `scene patch` carrying `expectedSceneSha256`, or regenerate. `slopcamera scene diff before.json after.json --json` shows the exact structural difference a patch produced.
4. Re-audit, then verify pixels with `slopcamera scene render-audit scene.json --camera camera_hero --json` — it renders the real object-ID pass in the bound browser runtime at each sampled time and counts attributed pixels per entity, catching occlusion and never-rendered cases geometric audit cannot see. Splats and camera-bound view surfaces report honestly as unsupported or non-attributable rather than estimated. Neither audit tier inspects beauty output — materials, textures, text layout, and splat internals still need rendered-frame inspection.

## Generate procedural scenes

`slopcamera scene generate --module <file.ts> --generator-id <id> --output scene.json --json` runs a trusted TypeScript module at authoring time — the same trust class as an explicitly imported workflow module, with no sandbox. See `examples/scene-generators/grid-city.ts` for the shape: the module exports `generate(ctx)` returning `{entities, editableKeys?}`; entities carry a caller `key` and never `entityId` or `origin`, which the host stamps from the generator identity. Draw randomness only from `ctx.seed`; an identical run must reproduce identical output, and the retained record pins source, parameters, seed, and output digests. Use `ctx.lib.entityId(key)` to parent entities inside one output. `--parameters` accepts a bounded JSON object; `--into scene.json` regenerates one generator's output while preserving authored entities, other generators, and declared overrides. Transitive relative `.ts`/`.js`/`.json` imports inside the module's own directory are allowed and hashed into the retained closure digest; absolute or escaping specifiers, symlinks, `require()`, and dynamic `import()` are rejected. Asset references are rejected in this version.

## Admit a local glTF asset

`slopcamera scene asset admit model.glb --source-root <dir> --output manifest.json --json` validates a local GLB 2.0 against the closed profile, stores it content-addressed, derives model-space and scene-space bounds into a sibling facts manifest, and emits the mesh entity plus ready `add-asset`/`add-entity` patch operations. The source path must stay inside `--source-root`; unsupported GLB features reject rather than degrade. Apply the returned operations through `scene patch`, then feed the admission document itself to `scene audit --asset-bounds`.

## Refine an existing scene

Use this pass when an existing HTML, Three.js, or native scene needs better
staging, character interaction, materials, and motion. Start with its retained
source and a playable baseline. Finish with reviewed frames from the new encoded
movie, the source that produced it, and specific remaining limitations.

### Establish the version and shot list

Check `slopcamera --version` and the relevant command help against the executable
you will use. A source checkout, installed CLI, and installed skill can differ.
Inspect the matching package or release before concluding that a feature is
missing. Native ALGAL behavior authoring uses `scene behavior check|bake|audit`;
read [directed scenes](directed-scenes.md#author-character-behaviors) for its
contracts.

Record each shot's time range, intended action, camera, principal objects, and
visible defects. Preserve deliberate stylistic choices and identity constraints.
Capture comparable baseline and revised frames at the same scene times. When
adding a shot, update duration, cuts, captions, end fades, frame count, and review
sample lists together.

Assign independent scene or object groups to separate workers when useful. Keep
one owner for shared rigs, camera conventions, render settings, generated source,
and the final browser session. Join the changes before the aggregate review.

### Repair what the camera reveals

Review the whole shot before adding detail. Use this order to make each pass
address the remaining visible problem:

| Area | Review and repair |
| --- | --- |
| Staging | Make the principal action readable at delivery size. Check silhouettes, feet, faces, sight lines, and foreground occlusion throughout the camera move. Extend sets far enough to cover every intended view. |
| Contact | Check soles against the floor, fingers against handles, carried objects against hands, and tools against their target surfaces. An object origin is rarely its contact point. |
| Construction | Give prominent objects plausible thickness, supports, seams, and connections. Inspect stairs, railings, glazing, roofs, furniture, and machine housings for floating or intersecting parts. |
| Materials | Distinguish metal, glass, painted surfaces, fabric, and foliage through their response to light. Keep roughness and small variations consistent with scale; uniform gloss and repeated bright windows can flatten a scene. |
| Lighting | Establish a readable key light, restrained fill, and motivated practical lights. Check contact shadows, highlight clipping, bloom, depth-of-field focus, and dark detail in the encoded result. |
| Motion | Give actions a cause, preparation, contact, follow-through, and rest. Review full motion when a pose depends on a preceding event. |

Fix a contact or camera defect before covering it with bloom, grain, motion, or
extra props. Concentrate detail where the camera can resolve it. Numerical
geometry checks can catch penetration; they cannot establish that a face is
visible, a gesture reads well, or a material looks convincing.

### Make behavior serve an observable action

Choose a few useful reactions: a commuter notices a sign, a listener looks toward
the speaker, or two characters pass an object. Define the event sequence before
varying timing. A handoff might use notice, pause, reach, contact, shared grip,
release, and acknowledgment. Assign explicit prop ownership intervals and
document which actor controls the shared phase.

Use the native ALGAL interaction organism for phase sequencing, then bind its
emitted channels to clips, attach/release events, or trajectory waypoints through
a channel map. Retain the behavior document, scene binding, channel map, bake,
and audit. Repeat the bake with identical inputs to check determinism. Change
the seed deliberately when reviewing variants. Inspect advisory findings in the
context of the channel's meaning; repeated event payloads can be intentional.

The behavior trace establishes event timing. Its mapped performance still needs
the right rig, clip sources, transforms, and contact solution. Measure gaze toward
the actual target in the character's coordinate frame. Preserve a resting arm
when only the other arm participates. Use small delays and bounded pose changes
to separate reactions without giving every object continuous motion.

Direct within the visible asset's limits. A mathematically exact gaze can turn a
photographic face map into an unreadable profile. Review face visibility during
the gesture and use a restrained glance or nod when that better communicates the
intended acknowledgment.

When adapting a procedural rig, document any proxy skeleton and the conversion
between local and world transforms. Test the visible rig separately. An audit of
a proxy does not establish the visible character's foot placement, grip, or
whole-body physical validity.

### Verify contact and time before the full render

Evaluate each frame from its absolute timestamp. Reset transforms and state that
can otherwise survive a seek. Keep behavior baking outside the frame callback;
sample the retained result during playback. Test a timestamp, a later timestamp,
and the original timestamp again, including ownership and pose endpoints.

For each important contact, declare the measured surfaces or anchors and a
tolerance in scene units. Sample the actual loaded rig through the interaction,
including frames immediately before and after attach, release, impact, and
planting events. Check finite transforms, grip error, floor clearance, ownership,
and prop orientation. For moving crowds or vehicles, check geometry extents and
intermediate times as well as center distances. Report sampling density and
tolerances; sampled clearance is not continuous collision proof.

Require finite measurements and actual samples for every required contact state.
Missing contact data must fail validation rather than default to zero error.
Ensure each reported contact and replay check contributes to the final pass/fail
result.

Render a short preview containing the entire difficult action. For an HTML scene,
author a bounded preview request and map its local clock to the intended source
time in the authored scene; preserve the full-scene request. For a directed scene,
use the supported explicit render range. Do not assume a project-specific capture
flag is a Slopcamera CLI option.

Review every shot at its start, middle, and end, then inspect event boundaries,
cuts, and changed camera coverage. A contact sheet reveals composition and
continuity; a motion preview reveals timing, sliding, snapping, and occlusion.
Use both when the change affects interaction. Record defects by shot, object,
time, and visible consequence so another pass can reproduce them.

### Verify the encoded movie

Run the supported [HTML music-video](music-video.md), [directed-scene](directed-scenes.md),
or [native studio](native-studio.md) render workflow from the converged source.
Retain its source and runtime receipts. A completed frame loop does not establish
successful encoding or browser cleanup; resolve any reported lifecycle failure
before calling the render successful.

Probe the delivery for dimensions, rational frame rate, decoded frame count,
duration, color metadata, and expected audio streams. Derive expected frames from
the selected workflow's timing rules. Decode review frames from this movie,
including cuts, the final frame, and the contact phases. If an authored event
falls between frame times, record the selected frame index and its actual time.
Review color against the source frames; metadata alone does not prove the correct
RGB-to-YUV conversion. Distinguish intentional fades from missing or black frames.

Keep the previous delivery and hash both files when verifying replacement. A
different hash proves different bytes, so also compare the intended visible
changes. Deliver the new movie with a compact scene review, retained evidence,
and the limitations that remain visible. Avoid a quality or physics claim that
the review did not establish.

For a custom capture optimization, compare decoded pixels against the supported
capture path at representative lit frames, including transparent edges and
post-processing. An opening black frame is insufficient evidence. Keep the
ordinary capture path when equality is required and the comparison differs.
Never bypass browser signature checks, disable its sandbox, or signal unrelated
processes to make a render finish.

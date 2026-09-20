# Refine an authored scene and verify its delivery

Use this pass when an existing HTML, Three.js, or native scene needs better
staging, character interaction, materials, and motion. Start with its retained
source and a playable baseline. Finish with reviewed frames from the new encoded
movie, the source that produced it, and specific remaining limitations.

## Establish the version and shot list

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

## Repair what the camera reveals

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

## Make behavior serve an observable action

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

When adapting a procedural rig, document any proxy skeleton and the conversion
between local and world transforms. Test the visible rig separately. An audit of
a proxy does not establish the visible character's foot placement, grip, or
whole-body physical validity.

## Verify contact and time before the full render

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

## Verify the encoded movie

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

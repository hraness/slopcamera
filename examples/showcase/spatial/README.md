# A showroom made of media

The original display stage puts a real rendered film and an editable process
diagram on world-space planes. A coral foreground fin creates visible occlusion;
the screen bezel, plinth, support, diagram board and calibration cube remain named
scene entities. The warm-finish patch changes three finishes without regenerating
the scene or its media.

Use a Slopcamera source checkout with its locked dependencies to run these
TypeScript authoring helpers. Their camera-rig, effects, scene-rendering and
camera-track APIs also ship in v3.3.1; the checkout supplies the later example
sources and their repository imports.

First render the [HTML editorial example](../html/README.md), retaining its exact
JSON result. Then prepare this scene:

```sh
bun examples/showcase/spatial/author-stage.ts artifacts/showcase/html/editorial.render.json
bun apps/desktop/cli/main.ts scene check artifacts/showcase/spatial/source/orbit.scene.json --json
bun apps/desktop/cli/main.ts scene render artifacts/showcase/spatial/source/orbit.scene.json --request artifacts/showcase/spatial/source/poster.request.json --json
```

The authoring command copies the exact receipt-bound RGB film, a repository OFL
font with its license, and the original diagram into an ignored source directory.
It verifies the result, receipt, retained request, HTML document and authoring
identities against this editorial example, including its 1280×720, 24fps,
eight-second shape. A different film requires an explicit source adaptation.
Keep that directory together: asset paths resolve relative to the scene JSON.
It also retains the input film's provenance and generates eight camera variants:

| Rig | Direction |
| --- | --- |
| Orbit | Reveal the display's depth with a restrained arc |
| Dolly | Move closer to the media without changing the target |
| Crane | Raise the view to reveal the continuous plinth |
| Rail | Traverse a straight track with an eased clock |
| Tripod | Hold a repeatable reference composition |
| Handheld | Add small seeded camera motion |
| Chase | Follow an explicitly authored moving target |
| Target tracking | Translate the camera while changing its aim |

Each rig is compiled through `compileSpatialCameraRig` into 192 calibrated camera
samples, then materialized as ordinary position/rotation channels in its scene.
The camera audit checks declared subject framing and motion limits; it does not
replace inspecting the resulting image. These are camera programs, not simulated
camera hardware or inferred tracking from a recording.

Render a full eight-second variant with its matching `<rig>.request.json`.
Render `warm-finish.scene.json` with `orbit.request.json` to compare the named
material patch. `cinematic.request.json` binds restrained grain, vignette and a
small deterministic dust system to the original orbit scene. It cannot be reused
against a changed scene digest without rebuilding its effects binding.

The retained scene video is silent. The world-space film is a visual surface;
its presence does not add audio to the spatial composition.

`bun examples/showcase/spatial/render-orbit.ts` runs the complete local
editorial-render, scene-authoring and orbit-render sequence, preserving each
command's result in a fresh reproduction directory. It needs at least 4 GiB
free before rendering and stops on the first failure without an automatic retry.

`bun examples/showcase/spatial/author-direction.ts` adds a checked two-beat camera
direction and a gallery of camera proposals. It also executes an ALGAL bake-safe
state machine for establish, reveal, and hold cues and saves the actual trace,
bake receipt, and audit. These planning documents remain `verified: false` and
the cues remain unmapped: this example does not pretend that a state trace has
animated a rigged character. A real character performance additionally needs an
admitted rig, clips, and explicit channel bindings.

## A saved Gaussian capture

`prepare-world.py` downloads the MIT-licensed Niantic horned-lizard sample at
commit `affd0ecea7fbb4c265ee119475af7ee5b2997482`. It verifies the immutable Git
blob, retains the license and official codec source, and selects every even splat
index across **all** position, opacity, color, scale, rotation and spherical
harmonic sections. The explicitly named derivative contains 393,117 original
splats. It does not invent geometry, recolor points or change their scales.

```sh
python3 examples/showcase/spatial/prepare-world.py
bun examples/showcase/spatial/author-world.ts
bun apps/desktop/cli/main.ts scene world import \
  --input artifacts/showcase/spatial/world-source/import.request.json \
  --source-root artifacts/showcase/spatial/world-source \
  --output-root artifacts/slopcamera/generated/showcase-hornedlizard \
  --json > artifacts/showcase/spatial/world-import.result.json
bun examples/showcase/spatial/author-world.ts artifacts/showcase/spatial/world-import.result.json
bun apps/desktop/cli/main.ts scene render \
  artifacts/slopcamera/generated/showcase-hornedlizard/scene.json \
  --request artifacts/slopcamera/generated/showcase-hornedlizard/poster.request.json \
  --json
```

The conversion and Slopcamera decoder are separate checks. The source exceeds
the admitted 500,000-splat budget; the smaller derivative uses the same supported
v2, non-antialiased representation and stays within the existing limits.

Inspect a poster before rendering `render.request.json`. This camera frames the
central capture; distant background splats make the full bounding box much larger.
Source units have no verified physical calibration. Displaying one source unit
as one scene unit is a presentation convention, not a claim about the animal's
size. There is no collider, physics, editable internal mesh, or inferred object
semantics. Preserve the import manifest, conversion receipt, original-source
identity and Niantic license with redistributed source assets.


## A native character, retained as a portable asset

The [portable character reproducer](../native/portable-character/README.md)
exports the original native character with nine real joints and a six-second
wave baked from its IK motion. Its separate, checked adapter expands sparse
accessors into dense arrays without changing any accessor's effective values.
The unchanged Slopcamera importer then admits the resulting GLB.

Pass that actual admission result to the scene author:

```sh
bun examples/showcase/spatial/author-character.ts <asset.manifest.json>
bun apps/desktop/cli/main.ts scene render \
  artifacts/showcase/spatial/character-source/wave.scene.json \
  --request artifacts/showcase/spatial/character-source/poster.request.json \
  --json
```

After inspecting the poster, use `wave.request.json` for the full phrase. The
script checks the retained payload hash and exact baked-wave clip before creating
a portrait scene. It binds the adapted payload to its successful native job,
checks the original GLB hash against that job's output, and retains the admission,
native receipt, adaptation proof and sidecar hashes beside the scene. Clip playback uses the asset's
original materials and actual skinning. Separate facial clips are retained but
are not blended into this wave. The export has no live IK solver, complete
canonical humanoid mapping, or applied ALGAL performance mapping.

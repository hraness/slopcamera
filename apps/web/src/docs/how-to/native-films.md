A native film keeps the engine's own source, a Blender scene, a CadQuery program, or a Manim scene, as the editable artifact. The `slopcamera studio` commands retain that source as an immutable bundle, run it through a closed host adapter against an engine you installed yourself, verify every declared output, and hand the result to an ordinary video project.

Install a supported engine before running a job; Slopcamera does not silently install or upgrade native tools. The qualified versions are Blender 5.2.1 LTS, CadQuery 2.8.0, and Manim Community 0.21.0, measured on an Apple M4 Max. The `studio` commands ship in the verified release and run under Bun; a durable workflow that contains a native job additionally needs the [source build](/docs/how-to/install-from-source). For a bounded end-to-end pass, start with [Render your first native film](/docs/tutorials/first-native-film).

## Know the trust boundary

`studio run` executes retained Python as your current user through a closed Blender, Manim, or CadQuery adapter. There is no OS sandbox and no hermetic dependency closure. Private roots, a clean child environment, content hashes, and process-group supervision provide operational control and provenance; they do not confine arbitrary Python, installed plugins, or native libraries. Provider credentials are not inherited by the child environment.

Every execution requires an explicit `--allow-trusted-code` on that invocation, and the job document records `trust: "trusted-current-user"` with `isolation: "none"`. Runtime selection alone authorizes nothing, a missing trust envelope pauses a workflow node before dispatch, and a generic stored write approval cannot grant native code permission. Keep unreviewed downloaded source inert until you authorize it.

## Scaffold a production

```sh
slopcamera studio init product --template blender-product --json
```

The scaffold writes `scene.py`, any explicit helpers, `source.json`, and `job.json` without executing anything. Seven starters ship with the CLI:

- `blender-product`: a moving camera over beveled, textured product geometry with depth of field.
- `blender-character`: an original deforming rig with blended weights, an IK target, and facial shape keys.
- `blender-shaded-street`: a city, a detailed native character, and a calibrated three-second camera approach in 360×640 portrait.
- `blender-cloth` and `blender-fluid`: separate bake and render stages with explicit caches.
- `cadquery-bracket`: parametric solids and STEP output.
- `manim-lesson`: a 10-second portrait lesson with a presenter, vector geometry, Typst mathematics, and a caption rail.

## Bundle, plan, and probe

```sh
slopcamera studio bundle product/source.json --json
slopcamera studio plan product/job.json --json
slopcamera studio probe product/job.json --blender-bin /Applications/Blender.app/Contents/MacOS/Blender --json
```

`source.json` lists exactly the files to retain; its paths resolve relative to the manifest's directory or an explicit `--source-root`, and imports do not recursively discover siblings, follow file symlinks, or run Python. `bundle` stores content-addressed immutable copies under `artifacts/slopcamera/private/studio/bundles/`. `plan` parses and hashes the request without loading a native engine. `probe` loads the selected installed engine and the fixed driver without executing your scene.

After a source edit, run `bundle` again, copy the returned `bundleSha256` into the job, and choose a new `jobId`; reusing an old job ID with changed inputs is a conflict. Select the exact Blender executable with `--blender-bin`, or a Python virtual environment with `--python /absolute/path/to/venv/bin/python`. Preserve that virtual-environment path: resolving its interpreter symlink to a system Python can select the wrong package environment.

Inside the source, `SLOPCAMERA_CONTEXT` supplies detached parameters, the stage, the render clock, and the private source, output, and working roots. Blender and CadQuery sources may run at module scope or define `build(context)`; an explicit bake job may call `bake(context)`. Manim selects a named scene class. The host rejects undeclared files, links, empty outputs, missing frames, and exceeded limits.

## Run, inspect, and encode

```sh
slopcamera studio run product/job.json --blender-bin /Applications/Blender.app/Contents/MacOS/Blender --allow-trusted-code --json
slopcamera studio inspect <studio-id> --json
slopcamera studio encode <studio-id> --output-id beauty --json
slopcamera studio assemble <studio-id> --output-id beauty --name "The first shot" --json
```

The default Blender product job requests Cycles GPU rendering; an unavailable GPU fails clearly, so set `device: "cpu"` in a new job when CPU rendering is intended. There is no implicit fallback. Successful receipts include the exact source, job, plan, and runtime identities plus every physical output hash and length. Runtime identity records executable and driver hashes with observed package and version evidence; it is not a hash of every system library, font, installed plugin, or external read.

`studio inspect` rechecks source and physical output hashes. `studio encode` turns a successfully receipted PNG color sequence into a separately retained derivative: RGB becomes lossless H.264 RGB MP4, and straight RGBA becomes lossless QTRLE MOV. The encoder checks every decoded frame against its source pixels and checks the exact clock; a 16-bit PNG sequence produces an explicitly recorded 8-bit derivative without dithering, while the original masters stay intact.

`studio assemble` reuses the verified encode and creates an ordinary video project with exact native and encode lineage. Its initial clip profile accepts opaque sRGB sequences up to 4,096 pixels per side, 4,000 frames, and 60 seconds. Use `slopcamera project add` for subsequent clips, narration, and sound, and `slopcamera project render run` for delivery; keep transparent MOV or linear EXR masters for compositing because this command does not silently convert them.

## Keep caches and simulations revisable

Cloth and fluid starters separate bake and render stages. Retain the resulting `.blend` and explicit caches, then create a source bundle with the native scene and its dependencies for the render job. A `.blend` entrypoint renders with embedded-script execution disabled; rebuilding, rebaking, Python-dependent rig drivers, and add-on initialization require an explicit authored Python setup. Preserve the relative cache layout when moving a bundle, and keep cache identity tied to the source and settings that produced it. Physics settings are not proof of a bake: review evaluated geometry, contact, and cache evidence, then load the result in a fresh process.

## Acquire and admit external assets

The supported Poly Haven adapter searches and imports free HDRIs, selected PBR maps, and glTF model dependencies:

```sh
slopcamera studio assets search query.json --json
slopcamera studio assets describe dirty_football --json
slopcamera studio assets plan selection.json --json
slopcamera studio assets import asset-plan.json --json
```

A search input names `provider: "poly-haven"`, a query, a type, and a limit; a selection chooses one asset, resolution, and file format. The plan retains author, license, API credit, catalog bytes, and the complete dependency list, and imports verify those bytes and retain SHA-256 identities under a default 50 MiB total download bound. Acquisition never executes an asset or inserts it into a native scene; include the returned source files explicitly in a studio bundle. Blender's native importers accept supplied GLB, glTF, OBJ, FBX, and other supported formats with all required textures, buffers, and animation files retained in the bundle.

## Share assets and calibrated cameras

Keep each native source alongside its portable representations. Rendered derivatives are what cross renderer boundaries:

| Representation | Useful transfer | Boundary |
| --- | --- | --- |
| Native `.blend`, STEP, and caches | Edit or rerender in the originating tool | Rigs, solids, solvers, and procedural materials remain engine-specific |
| Portable GLB | Share measured geometry, supported base-color materials, and node TRS clips with Three | Admission rejects skins, morph targets, and unsupported texture or material features |
| sRGB PNG or retained RGB(A) video | Mount a diagram, avatar, generated shot, or GPU graphic on a world-space surface | Preserve pixel size, alpha, color interpretation, and the exact source clock |
| Splats | Film a captured appearance through the qualified Three and Spark profile | Capture does not establish collision geometry, relighting, or native mesh editability |

Admit an existing native output into a spatial scene with an explicit asset identity:

```sh
slopcamera studio asset studio_city --output-id city --asset-id asset_city --representation native --json
slopcamera studio asset studio_shot --output-id beauty --asset-id asset_reference --representation native --frame 1 --json
```

The result contains an `asset`, a `binding`, and a retained admission receipt. Add the asset to the spatial scene and supply the bindings array through `slopcamera scene render --assets bindings.json`; the binding selects the exact retained physical bytes. A sequence needs an exact `--frame` for image admission, and encoded-video admission requires one unambiguous completed `studio encode` derivative. See [Render and edit spatial scenes](/docs/how-to/direct-scenes) for the scene side.

Export a calibrated camera for a native scene with `slopcamera scene camera-track`:

```json
{"cameraId":"camera_hero","startUs":0,"frameRate":{"numerator":24,"denominator":1},"frameCount":480}
```

```sh
slopcamera scene camera-track scene.json --request sampling.json --output camera-track.json --json
```

The inert `slopcamera.spatial-camera-track` document pins the scene revision and carries ordered samples with `frameIndex`, integer `timeUs`, exact rational `exactTimeUs`, and the camera value; export at most 2,048 frames per chunk. Retain the JSON in the native source bundle and apply each sample explicitly at its associated native frame through `SLOPCAMERA_APPLY_SPATIAL_CAMERA(camera, camera_object=None)` in the fixed Blender driver, which converts canonical `(x, y, z)` to Blender `(x, -z, y)` and preserves the camera's local negative-Z direction. A supplied camera must have no parent, constraints, or animation owners, and the helper does not exchange depth of field, distortion, shutter, lighting, or color transforms. A matching projection does not imply identical materials or lighting between renderers.

## Run a native job inside a workflow

The closed local operation is `slopcamera.studio.run`, exposed to declarative graphs as `.studio.run()` through `@hraness/slopcamera/local/code`. Inputs refer to the retained bundle manifest and a parsed studio job; outputs are hash-bound media references plus a studio receipt.

```sh
slopcamera code run film.ts --input input.json --studio-python /absolute/venv/bin/python --allow-trusted-code --json
slopcamera runs resume <run-id> --studio-python /absolute/venv/bin/python --allow-trusted-code --json
```

The same runtime and authorization flags are available on `workflows run`. Changing a runtime, source, or job after binding requires a compatible new plan. These durable workflow commands bind a build identity over the checked-out source tree, so they require the source-backed distribution described in [Build Slopcamera from source](/docs/how-to/install-from-source); [Run or recover a workflow](/docs/how-to/run-workflows) covers resume semantics.

## Inspect and recover

```sh
slopcamera studio inspect <studio-id> --json
slopcamera studio reconcile <studio-id> --json
```

Reconciliation restores a missing receipt only when a closed successful process completion and an unchanged output-validation checkpoint exist; earlier interrupted execution stays ambiguous and is never automatically resubmitted. The supervisor bounds combined logs, the job deadline, and termination grace, retains failure evidence, and tracks native process groups. A machine-wide durable activity marker survives CLI death, and unresolved custody blocks later native dispatch: inspect and resolve the actual process ownership rather than deleting the marker. Choose a new job ID for an explicitly revised attempt after custody settles.

For a Manim-led lesson with narration and captions, see [Make an educational video](/docs/how-to/educational-video).

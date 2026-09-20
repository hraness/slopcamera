# Directed scenes

Slopcamera keeps a visual composition as editable scene data and renders it through named cameras. A scene can combine geometry, images, video, diagrams, text, and animation. Agents inspect stable entity IDs and apply typed changes to retained source; frames and videos carry receipts identifying the source that produced them.

The Three.js renderer supports bounded offline rendering, explicit hardware acceleration, and retained Gaussian-splat environments. Importing and directing a saved world works locally without a provider account. Interactive world editing, simulation, and automatic video-model refinement remain future adapters. Existing HTML authoring and media-editing commands remain available.

For architecture and furniture that must regenerate from dimensions, use [parametric designs](how-to/parametric-design.md). Designs compile into this same scene and asset contract.

## Render an editable scene

Basic scene rendering, calibrated camera tracks, and native studio bridges ship in v3.2.8. This guide also uses newer scene audits, character, direction, and effects APIs: install [current Slopcamera source](how-to/use-current-source.md) for those additions and check [capability support](reference/capabilities.md). Check `slopcamera scene --help` and `slopcamera doctor` first. Source inspection and edits need Bun; rendering also needs the admitted local Chrome runtime, and video decoding or encoding needs FFmpeg and FFprobe.

```sh
slopcamera scene init product.scene.json --json
slopcamera scene inspect product.scene.json --json
slopcamera scene evaluate product.scene.json --camera camera_hero --time-us 1000000 --json
slopcamera scene audit product.scene.json --camera camera_hero --json
slopcamera scene render-audit product.scene.json --camera camera_hero --json
```

The starter contains a turning product, a pedestal, lights, and a calibrated 960 × 540 camera. `audit` samples bounded geometry against one camera across the scene duration and reports deterministic frustum findings without a renderer; `--times-us` selects explicit samples and `--asset-bounds` supplies decoded glTF/splat enclosures as a JSON bounds map or asset admission documents. `render-audit` is the rendered tier of that audit: it opens the bound browser runtime, renders the real object-ID pass at each sampled time, and counts attributed pixels per entity, reporting splats and camera-bound view surfaces honestly instead of estimating them. Save this request as `frame.json`:

```json
{
  "cameraId": "camera_hero",
  "selection": { "kind": "frame", "timeUs": 1000000 },
  "mode": { "kind": "beauty" }
}
```

```sh
slopcamera scene plan product.scene.json --request frame.json --json
slopcamera scene render product.scene.json --request frame.json --json
```

`plan` validates the source and estimates bounded rendering work without opening a browser. `render` writes a PNG, retained source and assets, and a receipt beneath the ignored artifact root. It checks asset bytes and native runtime identity before using them. Unsupported asset features fail explicitly.

For grounded geometry, enable `castShadow` on the model, `receiveShadow` on the ground, and `shadow` on a directional, point or spot light. Beauty rendering fits directional shadow coverage to the casting geometry and applies a small offset to prevent self-shadow striping. Large receiving floors do not reduce model shadow detail. Shadow participation remains explicit; object-ID and other data passes preserve their unlit output.

To inspect animation, replace `selection` with:

```json
{
  "kind": "contact-sheet",
  "timesUs": [0, 1000000, 2000000],
  "columns": 3,
  "cellWidth": 320,
  "cellHeight": 180,
  "fit": "contain"
}
```

Each sample renders at the camera's calibrated resolution, then resizes into its contact-sheet cell. To encode a transparent MOV, use:

```json
{
  "kind": "video",
  "range": { "startUs": 0, "endUs": 4000000 },
  "frameRate": { "numerator": 30000, "denominator": 1001 }
}
```

The video profile uses lossless qtrle with straight alpha. Final project delivery converts scene footage through the ordinary project compositor.

## Orbit around live media

The [playable orbit example](https://slopcamera.com/docs/how-to/direct-scenes#orbit-around-live-media) combines an animated editorial film and a vector process diagram on separate planes. Foreground fins reveal depth through occlusion as the camera moves. Both media and camera motion follow the scene clock.

Run the [retained recipe](../examples/showcase/spatial/render-orbit.ts) from a source checkout:

```sh
bun examples/showcase/spatial/render-orbit.ts
```

The helper renders the original HTML film, authors and checks the stage, then renders eight seconds through the explicit macOS WebGL2 hardware profile. It retains command results, source, assets and a render receipt, and requires at least 4 GiB of free space before rendering. The public silent MP4 is a delivery encode of the lossless MOV. Other camera tracks in the source are separate recipes and are not established by this orbit result.

## Select hardware acceleration

```sh
slopcamera scene render product.scene.json --request frame.json --profile three-webgl2-hardware-v1 --json
```

The initial hardware profile requires macOS, WebGL2 through ANGLE Metal, and matching observations from the active graphics context and browser. It rejects software or unknown fallback. The receipt records the actual device, operating system, browser and graphics capabilities. This uses hardware for scene rasterization; it does not select a hardware video encoder or promise identical regenerated pixels across graphics drivers. Three WebGPU/TSL, shared live GPU resources between Three and vgpu, and stateful GPU effects remain deferred. Explicit rendered-image/video derivatives can already cross those authoring boundaries; see [native and spatial asset interchange](studio.md#share-assets-across-renderers).

The same profile works on `scene plan` and `scene project prepare-render`. Alternatively put `executionProfile` in the render request, or inside a project preparation request's `profile`. A CLI selection must agree with an existing request field. When the field and option are both absent, the historical software contract is preserved.

Use `three-spark-webgl2-hardware-v1` for scenes containing splats. Its pinned Spark and Three dependency closure has a separate bounded worker/WASM runtime. Ordinary overlays and the mesh-only hardware profile retain their existing network and worker isolation. Both hardware profiles retain the same explicit scene clock, linear color compositing and output conversion. Frame publication fails on context loss or unsettled work.

## Import a saved world

`scene world import` accepts exact local payload references and a declared normalization. The input contains:

- `splat`: a root-relative `path`, `bytes`, and SHA-256. Optional `collider` and `providerMetadata` use the same payload reference.
- `identities`: stable `assetId`, `entityId`, and `name`; supply `colliderAssetId` exactly when a collider is present.
- `normalization`: `metersPerUnit`, `sourceUp`, `sourceHandedness: "right"`, and a complete `transform` with position, XYZW rotation and uniform scale.
- `provenance`: `kind: "saved"` or `"worldlabs-marble"` and a description. World Labs provenance requires `worldId`, the exact retained collider, and the provider `receipt`, whose world and payload identities must match the import.

Existing `slopcamera.world-labs-provenance` receipts remain readable for imported worlds. Their exact metadata and payload hashes are validated locally; source files and historical provider attempt records remain unchanged. The paid World Labs generation commands have been removed.

A `providerMetadata` reference names a provider metadata export such as a Marble `semantics_metadata` JSON document. Its recognized scale, ground-plane and up-axis fields surface in the output manifest under `suggestedNormalization` with `status: "unverified-provider-declared"` and the artifact's SHA-256. Unknown provider fields are tolerated; malformed, oversized or unreadable artifacts fail the import. The suggestion is advisory only: `normalization` remains caller-declared and is the only applied normalization. Missing or unrecognized metadata is unknown; explicitly calibrate rather than labeling an assumed scale as measured, and verify the imported orientation and camera framing.

```sh
slopcamera scene world import --input import.json --source-root . --output-root artifacts/slopcamera/generated/courtyard --json
```

The output contains an import manifest, retained asset manifests and one splat entity. Add all returned assets and that entity to a scene, and save the scene JSON inside the import output directory, for example `artifacts/slopcamera/generated/courtyard/scene.json`. Returned payload paths resolve relative to that scene file; preserve them when assembling the scene. Metadata and any supplied collider are explicit dependencies, so scene rendering retains them with the splat even after the original import directory disappears. A supplied collider is retained as approximate geometry; it is not automatically visible and has no validated physics semantics. Worlds without a collider remain renderable and explicitly report physics as unavailable.

Direct a splat wrapper with a perspective camera, world placement and uniform, unsheared world scale. The initial Spark profile admits opaque 3D meshes, alpha-tested surfaces and camera-view overlays alongside splats; it rejects interleaved transparent 3D surfaces. Captured appearance is not relightable and has no independently editable material or object structure. The Spark profile always renders beauty only, including scenes that happen to contain no splat. It provides no simulation reset, stepping, actions, rewards or validated physics.

## Make a semantic edit

Read `sceneSha256` and `editableControls` from inspection. Save a patch using that exact digest:

```json
{
  "kind": "slopcamera.spatial-scene-patch",
  "schemaVersion": 1,
  "expectedSceneSha256": "<digest from inspection>",
  "operations": [
    { "kind": "set-color", "entityId": "entity_product", "color": "#f97316" }
  ]
}
```

```sh
slopcamera scene patch product.scene.json --patch patch.json --output product-orange.scene.json --json
```

A stale digest rejects the edit. The command requires a new output path, so both sources remain available. Patches also support transforms, cameras, animation channels, hierarchy changes, and explicitly declared generated-part overrides. Generated entities retain their generator/key correspondence; inspecting, seeking, and patching never rerun generator source. Replacing generator output is an explicit operation carrying new provenance.

`slopcamera scene diff before.scene.json after.scene.json --json` reports the same structural difference a patch produces — added, removed, and changed entities, assets, cameras, and channels with the changed property names — without touching either file.

## Admit a local glTF asset

`scene asset admit` validates one local GLB 2.0 file against the closed profile and turns it into a scene-ready manifest:

```sh
slopcamera scene asset admit model.glb --source-root assets --output model.manifest.json --json
```

The source must resolve inside `--source-root`; admission refuses symlink escapes, bounds the payload, and hashes the captured bytes. The returned document carries the asset manifest, a sibling facts manifest with model-space and scene-space bounds, a mesh entity, and ready `add-asset`/`add-entity` patch operations. Apply them through `scene patch` to place the model in a scene. The admission document feeds `scene audit --asset-bounds` directly, which cannot decode assets on its own. Out-of-profile GLBs and tampered bytes reject with typed errors; admission never downloads or executes source.

The `@hraness/slopcamera/code` SDK also exports pure scene builders — camera poses from FOV and look-at, baked easing channels, grid/scatter layout, and placement relations — that return validated scene data for programmatic authoring. They are documented in the Slopcamera Agent Skill under scene building.

## Generate procedural output at authoring time

`scene generate` executes a TypeScript generator module — trusted current-user code, like an explicitly imported workflow module — and retains its output inside a scene source:

```sh
slopcamera scene generate --module examples/scene-generators/grid-city.ts \
  --generator-id generator_grid_city --output city.scene.json --json
slopcamera scene generate --module examples/scene-generators/grid-city.ts \
  --generator-id generator_grid_city --parameters params.json --seed 42 \
  --into city.scene.json --output city-v2.scene.json --json
```

A module exports `generate(ctx)` returning `{ entities, editableKeys? }`. Each entity carries a stable `key` instead of `entityId`/`origin`; the host stamps `entityId` derived from the generator and key, so generated parts cannot forge authored provenance. `ctx.seed` (from `--seed`, or derived from the source digest), bounded `ctx.parameters` (≤64 KiB JSON), and `ctx.lib.entityId(key)` for parent links inside one output are the only inputs. Generated entities emit mesh primitives, lights, and groups; asset references are not supported in this version. Transitive relative `.ts`/`.js`/`.json` imports are allowed while they stay inside the module's own directory — a real, non-symlink file tree bounded to 64 files and 1 MiB total — and the retained `closureSha256` is the canonical digest of that file set (`sourceSha256` remains the entry-file digest, and the two are equal for a single-file module). Absolute, escaping, `require()`, and dynamic `import()` specifiers are rejected; bare package specifiers still resolve ambient dependencies the closure digest does not cover. The retained generator record pins source, parameters, seed, runtime, and output digests, so an identical run reproduces the identical scene. `--into` replaces this generator's prior output wholesale while preserving authored entities and other generators' output; regeneration that would orphan a declared override or animation is rejected. Generation is authoring-time only and is never rerun by inspect, evaluate, or render.

Camera changes affect view identity without changing the evaluated world state. Shot overrides affect only that shot. An animated property cannot receive a conflicting constant override. Imported GLB source-material mode exposes transform edits; color and opacity edits require entity-material mode and are rejected when they would have no effect.

Use `add-asset` or `replace-asset` to declare asset manifests and `set-mesh-geometry` to replace an authored mesh's representation while retaining its entity ID, name, pose, and animation. `set-material` replaces an authored mesh's whole material, including an optional `map` referencing a declared PNG/JPEG image asset; maps apply to procedural geometry only, and source-material GLB meshes consume source materials only. An `environment` entity references an image asset — an equirectangular panorama — and drives the world background, image-based lighting, or both through `role` with a bounded `intensity`. Environment entities are unparented world entities and a frame renders at most one visible; gate alternates through authored `visible` flags. GLB node and clip indices are local to that exact payload. Replacing addressed GLB bytes requires explicitly setting the new geometry addresses in the same patch; Slopcamera does not infer internal-node correspondence after reimport. Generated-part asset changes require explicit retained generator output replacement. Inspect controls after a representation change, because source-material mode can remove color/opacity editability.

For generated texture or skybox material, review candidates with `slopcamera ai image gallery` first — `--preview probe` shows each candidate rendered on probe geometry or as the scene environment — then admit the selected candidate as an image asset with `provenance.source: "generated"` and apply it through the ops above. See [generate media](how-to/generate-media.md#review-alternatives-as-a-gallery) for the gallery workflow; a gallery never applies a candidate implicitly.

To review bounded whole-scene variants — material swaps, lighting or palette alternates, environment changes expressed as typed patch operations — `slopcamera ai scene gallery <scene.json> --variants <file.json> --output-dir <directory>` renders each derived scene into one labelled contact sheet. The variants file is `{"kind": "slopcamera.scene-variants", "schemaVersion": 1, "variants": [{"id", "label"?, "patch"}]}` where each `patch` is a `slopcamera.spatial-scene-patch` document whose `expectedSceneSha256` defaults to the base digest. Every variant publishes `variants/<id>/scene.json` with its asset payloads staged beside it so the derived scene re-renders standalone; the receipt records the base digest, each patch and derived scene digest, and the rendered still per row. The authored scene is never modified.

## Direct a project through shots

A shot identifies a retained scene digest, a camera, its project range, its scene start time, and explicit `once`, `loop`, or `freeze` playback. Shot ranges use the project's source clock. The compositor applies existing global cuts and speed once, preserves existing audio, and places scene video above legacy footage and below overlays.

Create or edit the ordinary media project before migration. Snapshot its exact basis:

```sh
slopcamera scene project snapshot <project-id> --json
slopcamera operations show spatial.project.migrate --json
```

The migration request contains `expected` from that snapshot, a fresh `transactionId` (`transaction_` plus 32 hexadecimal characters), `scenes` containing `{sceneSha256, document}`, and `shots`. A shot has this shape:

```json
{
  "shotId": "shot_hero",
  "sceneSha256": "<scene digest>",
  "cameraId": "camera_hero",
  "range": { "startUs": 0, "endUs": 4000000 },
  "sceneStartUs": 0,
  "playback": "once",
  "overrides": []
}
```

Keep shot ranges within the existing project duration. Install declared asset payloads at their manifest paths inside the project directory before migration. Their sizes and digests must match; migration does not search arbitrary source directories or download assets. Inspect the operation schema for the complete bounded request.

```sh
slopcamera scene project migrate <project-id> --input migrate.json --json
slopcamera scene project snapshot <project-id> --json
```

Migration publishes one V2 project head pointing to an immutable aggregate. It retains the original media project and edit plan within that aggregate. Legacy project writers reject V2 heads; they cannot modify frozen audio or timeline state after migration. The initial V2 commands edit scenes, shots, and candidates. Plan ordinary media edits before migration until a V2 media-edit adapter is added.

`scene project patch` takes the whole current project basis, a scene patch, a fresh transaction ID, and `retarget: {"kind":"all"}` or `{"kind":"shots","shotIds":[...]}`. An all-shot edit and an edit to one shot are explicit choices. Old sources remain retained. Candidate records bind their derivation to exact scene and shot digests; selections become stale when those inputs change. The initial compositor renders authored shots; selecting a candidate does not yet substitute generated footage into delivery.

To undo a scene change, use `scene project restore` with `expected`, a fresh `transactionId`, `expectedSceneSha256`, a retained `restoreSceneSha256` from the same scene, and explicit `retarget`. Restore publishes a new revision that preserves current media and unrelated shots. It revalidates camera, override, and clock compatibility and recalculates candidate staleness; it does not rewind the project head or overwrite a later edit.

## Prepare and deliver a frozen composition

Save `prepare.json` using the current V2 basis:

```json
{
  "expected": { "version": 2, "sha256": "<project basis digest>" },
  "profile": {
    "pixelWidth": 960,
    "pixelHeight": 540,
    "frameRate": { "numerator": 30000, "denominator": 1001 },
    "background": "#101820ff",
    "colorSpace": "srgb"
  },
  "policy": {
    "kind": "full-frame-above-legacy-video-below-overlays",
    "alpha": "straight"
  },
  "delivery": {
    "output": { "path": "renders/directed-scene.mp4", "maximumBytes": 268435456 },
    "syncPolicy": "require-verified",
    "tier": "final"
  }
}
```

```sh
slopcamera scene project prepare-render <project-id> --input prepare.json --output prepared-render.json --json
slopcamera workflows plan directed-scene --input prepared-render.json --json
slopcamera workflows run directed-scene --input prepared-render.json --json
```

Preparation holds the project's lease, validates every shot before starting native work, materializes source-clock footage, and retains its exact receipts. Cameras must match the requested dimensions; preparation does not silently resize them. The full-frame profile rejects overlapping shots. Animate two video surfaces within one scene for a visual crossfade, and arrange its audio in the media project.

The prepared file freezes the projection, render plan, native toolchain, cadence, and output request. The workflow receives a real durable run identity and verifies encoded dimensions, pixel format, frame timestamps, and audio duration before publishing output. Recovery repeats those checks. Later changes to the project head do not invalidate an already prepared historical composition. A changed source artifact or toolchain rejects the render.

The initial preparation path rejects legacy `zooms` and enabled click, cursor, keystroke, or typed-text effects before rendering. These effects require recording metadata that is not yet frozen in the spatial projection. Ordinary overlays, manual camera moves, cuts, speed changes, and audio remain in the derived composition.

`require-verified` rejects unverified placement synchronization. Use `allow-unverified` only when that existing timing uncertainty is acceptable for the intended delivery. Project output paths are project-relative and never overwrite another render.

## Asset and rendering profile

| Input | Initial support |
| --- | --- |
| Geometry | Boxes, planes, spheres, cylinders, and a closed GLB 2 triangle subset with TRS hierarchy and STEP/LINEAR transform clips |
| GLB appearance | Base-color PBR material and embedded PNG/JPEG textures; explicit entity-material or source-material mode |
| Mesh materials | Unlit or standard PBR with an optional image map on authored procedural geometry |
| Environment entities | One visible equirectangular image per frame driving the background, image-based lighting, or both |
| AI environments | Bounded retained SPZ with the explicit Spark hardware profile; approximate collider and provenance dependencies |
| Images | PNG/JPEG with the admitted color profile, and inert shape-only SVG |
| Video | Bounded MOV/MP4, exact source PTS selection, alpha where supported, explicit once/loop/freeze and source offset |
| Diagrams | Existing version-one diagram source rasterized with declared fonts |
| Text | Declared OTF font and verified glyph coverage; missing glyphs reject instead of using a system fallback |
| Placement | World coordinates or camera-view pixel/normalized layers; splat entities use world placement and uniform scale |
| Cameras | Calibrated perspective and orthographic projection; the Spark profile requires perspective |
| Outputs | Beauty PNG/MOV and contact sheet; mesh profiles also support stable object IDs and encoded axial depth |

Use right-handed Y-up coordinates in meters, camera-local negative Z, and XYZW quaternions. Author time in integer microseconds. Frame sampling uses the rational frame rate before one microsecond quantization; ranges are half-open.

The renderer rejects external GLB resources, unsupported extensions, sparse accessors, compressed meshes, cubic animation, WOFF2 fonts, undeclared text fallback, untagged YUV, and unsupported HDR/color profiles. The static GLB profile additionally rejects skins, morph targets and skinning attributes; the explicit additive rigged profile `slopcamera.glb-rigged-morph-skin-v1` admits them within its own declared bounds. The initial saved-world parser admits non-AA gzip SPZ v2/v3 (`flags=0`) without LoD, with an aggregate rendered-world limit of 500,000 splats. Each SPZ source is at most 128 MiB compressed and 64 MiB decompressed. SPZ GPU allocation estimates plus the framebuffer allowance stay within 256 MiB; SPZ host-buffer estimates stay within 768 MiB. Mesh, texture and media allocations follow their separate scene limits; these estimates are neither a complete mixed-scene memory cap nor a bound on browser or driver RSS. Other containers, versions and filtering modes require separate qualification. Object-ID and depth passes have explicit alpha and no-hit rules in their receipts; they are picking and camera-depth products, not physics labels.

## Bounds and recovery

One source is at most 2 MiB, with up to 4,096 entities, 128 assets, and 64 cameras. A native scene render admits at most 1,800 frames, 1.1 billion rendered pixels, 256 MiB of source payloads, and 256 MiB of final output. Contact sheets admit 64 samples. Preparation uses windows of at most 32 frames. Explicit hardware profiles subdivide a window before browser execution when its serialized scene exceeds the per-document limit; the software profile retains its historical batching. One frame that exceeds a hard limit still rejects. The staged asset/frame budget is 8 GiB; this excludes the separately managed browser runtime, caches, and process memory. Output compression is not guaranteed, so a video that exceeds its hard byte limit fails qualification.

Project preparation additionally limits the program to 64 shots and shares the 1,800-frame, 1.1-billion-pixel, and 8-GiB staging budgets across them. It retains at most 1 GiB of distinct shot video inputs. These are first-release admission bounds, not claims about unlimited scene or world scale.

Receipts retain source, asset, request, view, runtime, and output identities. A failed or interrupted publication can return completed artifacts and an uncertain publication address. Preserve that evidence. For a project transaction, `scene project reconcile` accepts the exact retained attempt reference. For workflow execution, inspect and resume the original run through `slopcamera runs`; do not relabel an ambiguous attempt as a new completed render. Reconciliation verifies immutable evidence before allowing recovery.

Run `bun run qualify:spatial-scenes` from a development checkout for the native mixed-scene qualification. It writes ignored media and a machine-readable report. Fast unit and property tests run under the ordinary repository check. Native rendering latency and scene complexity depend on the qualified host; the initial implementation does not promise an interactive editing latency.

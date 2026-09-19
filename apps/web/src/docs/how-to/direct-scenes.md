A spatial scene is an editable JSON document: named entities, calibrated cameras, asset manifests, and animation channels rendered through the local Three.js renderer. You inspect stable entity IDs, apply typed patches to retained source, and read receipts that name the exact source, request, runtime, and output behind every frame.

The `slopcamera scene` commands ship in the verified release. Source inspection and patching run under Bun; rendering also needs the admitted local Chrome runtime, and video encoding needs FFmpeg and FFprobe. Check `slopcamera help scene` and `{{DOCTOR_COMMAND}}` for this machine's contract.

## Create and inspect a scene

```sh
slopcamera scene init product.scene.json --json
slopcamera scene inspect product.scene.json --json
slopcamera scene evaluate product.scene.json --camera camera_hero --time-us 1000000 --json
```

The starter contains a turning product on a pedestal, ambient and directional lights, and a calibrated 960 × 540 perspective camera. `inspect` reports entity IDs, cameras, assets, and known bounds without decoding asset bytes. `evaluate` samples the world state at an absolute microsecond without launching a renderer. `slopcamera scene check product.scene.json` validates the source on its own.

## Render frames, contact sheets, and video

Save a render request as `frame.json`:

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

`plan` validates the source and estimates bounded work without opening a browser. `render` writes the output, the retained source and assets, and a receipt under the ignored `artifacts/slopcamera/generated` root, verifying asset bytes and native runtime identity first. Unsupported asset features fail explicitly rather than rendering a degraded frame.

| Selection | Request fields | Result |
| --- | --- | --- |
| `frame` | `timeUs` | One PNG at the camera's calibrated resolution |
| `contact-sheet` | `timesUs`, `columns`, `cellWidth`, `cellHeight`, `fit` | A sampled grid; each cell renders at camera resolution, then resizes |
| `video` | `range` (`startUs`, `endUs`), `frameRate` | Lossless qtrle MOV with straight alpha |

Frame sampling uses the rational frame rate before one-microsecond quantization, and ranges are half-open. Final delivery converts scene footage through the ordinary project compositor described in [Edit and deliver video](/docs/how-to/edit-video).

## Render on the GPU

```sh
slopcamera scene render product.scene.json --request frame.json --profile three-webgl2-hardware-v1 --json
```

`three-webgl2-hardware-v1` requires macOS and WebGL2 through ANGLE Metal, with matching observations from the active graphics context and browser. It rejects software or unknown fallback, and the receipt records the actual device, operating system, browser, and graphics capabilities. This profile accelerates scene rasterization only: it does not select a hardware video encoder or promise identical pixels across graphics drivers.

The same profile works on `scene plan` and `scene project prepare-render`. Alternatively set `executionProfile` inside the render request or `profile` inside a preparation request; a `--profile` flag must agree with an existing request field. When both are absent, the historical software contract is preserved.

Use `three-spark-webgl2-hardware-v1` when the scene contains splats. Its pinned Spark and Three dependency closure runs in a separate bounded worker and WASM runtime, renders beauty output only, and keeps the same explicit scene clock and linear compositing as the other profiles. Frame publication fails on context loss or unsettled work.

## Patch named entities

Read `sceneSha256` from `scene inspect` and pin it in the patch document:

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

A stale digest rejects the edit, and the command requires a new output path, so both revisions stay available. The operation vocabulary covers transforms (`set-transform`), hierarchy (`reparent-entity`), names (`rename-entity`), materials (`set-color`, `set-opacity`), cameras (`set-camera`), animation channels (`set-channel`, `remove-channel`), membership (`add-entity`, `remove-entity`), declared per-shot overrides (`set-override`, `remove-override`), asset manifests (`add-asset`, `replace-asset`), mesh representations (`set-mesh-geometry`), and generated output (`replace-generator-output`).

Camera changes alter view identity without touching evaluated world state, and an animated property cannot receive a conflicting constant override. Imported GLB entities in source-material mode accept transform edits; color and opacity edits require entity-material mode and are rejected when they would have no effect. Inspecting, seeking, and patching never rerun generator source; replacing generated output is an explicit operation that carries new provenance. After `set-mesh-geometry` or an asset replacement, inspect controls again because the new representation can remove editability, and set the new GLB node and clip addresses in the same patch.

## Import a saved world

`scene world import` takes exact local payload references plus a declared normalization, and it works without a provider account:

```sh
slopcamera scene world import --input import.json --source-root . --output-root artifacts/slopcamera/generated/courtyard --json
```

The import input declares:

- `splat`: a root-relative `path`, byte length, and SHA-256; an optional `collider` uses the same payload reference shape.
- `identities`: stable `assetId`, `entityId`, and `name`, plus `colliderAssetId` exactly when a collider is present.
- `normalization`: `metersPerUnit`, `sourceUp`, `sourceHandedness: "right"`, and a complete transform with position, XYZW rotation, and uniform scale.
- `provenance`: `kind: "saved"` or `"worldlabs-marble"`. World Labs provenance additionally requires `worldId`, the exact retained collider, and the provider receipt whose world and payload identities must match the import.

The output is an import manifest, retained asset manifests, and one splat entity. Add every returned asset and that entity to a scene, and save the scene JSON inside the import output directory so the returned payload paths resolve. Scene rendering retains the metadata and any collider with the splat even after the original import directory disappears. A collider is retained as approximate geometry: it is not automatically visible, and it has no validated physics semantics.

Splat entities use world placement and a uniform, unsheared world scale, and the Spark profile requires a perspective camera. The profile admits opaque 3D meshes, alpha-tested surfaces, and camera-view overlays alongside splats; it rejects interleaved transparent 3D surfaces. Captured appearance is not relightable and has no independently editable material or object structure.

Historical `slopcamera.world-labs-provenance` receipts remain readable and are validated locally for imported worlds; the paid World Labs generation commands have been removed. Use the provider's returned scale and ground metadata when available. Missing metadata is unknown, so calibrate the import explicitly rather than labeling an assumed scale as measured.

## Direct a project through shots

A shot binds a retained scene digest, a camera, a project range, a scene start time, and `once`, `loop`, or `freeze` playback; shot ranges use the project's source clock. Snapshot the existing project basis and inspect the migration schema before writing the request:

```sh
slopcamera scene project snapshot <project-id> --json
slopcamera operations show spatial.project.migrate --json
slopcamera scene project migrate <project-id> --input migrate.json --json
```

The migration request carries `expected` from that snapshot, a fresh `transactionId` (`transaction_` plus 32 hexadecimal characters), `scenes` containing `{sceneSha256, document}`, and `shots`. Install declared asset payloads at their manifest paths inside the project directory first: sizes and digests must match, and migration does not search arbitrary source directories or download assets. Keep shot ranges within the existing project duration.

Migration publishes one V2 project head over an immutable aggregate that retains the original media project and edit plan. Legacy project writers reject V2 heads, so plan ordinary media edits before migration. `scene project patch` applies a scene patch across all shots or an explicit `shotIds` list through `retarget`, and `scene project restore` publishes a revision that returns to a retained scene digest without rewinding the project head. After an ambiguous publication, `scene project reconcile` verifies immutable evidence for the exact retained attempt before allowing recovery.

## Deliver a frozen composition

`scene project prepare-render` freezes the projection, render plan, native toolchain, cadence, and output request into one prepared file:

```sh
slopcamera scene project prepare-render <project-id> --input prepare.json --output prepared-render.json --json
```

Preparation holds the project's lease and validates every shot before native work starts. Cameras must match the requested dimensions; preparation does not silently resize them. The full-frame policy (`full-frame-above-legacy-video-below-overlays`) rejects overlapping shots, and the initial path rejects legacy `zooms` and enabled click, cursor, keystroke, or typed-text effects. `syncPolicy: "require-verified"` rejects unverified placement synchronization; `allow-unverified` is an explicit choice for deliveries that accept the existing timing uncertainty.

The prepared file feeds the durable `directed-scene` workflow:

```sh
slopcamera workflows plan directed-scene --input prepared-render.json --json
slopcamera workflows run directed-scene --input prepared-render.json --json
```

Workflow planning and execution bind a build identity over the installed host source tree, so these commands require the installed Bun package or a checkout rather than a copied standalone executable; [Run or recover a workflow](/docs/how-to/run-workflows) covers the run model. The run verifies encoded dimensions, pixel format, frame timestamps, and audio duration before publishing, and a later project edit does not invalidate an already prepared composition. A changed source artifact or toolchain rejects the render. Output paths are project-relative and never overwrite another render.

## Know the bounds

| Bound | Limit |
| --- | --- |
| Scene source | 2 MiB with up to 4,096 entities, 128 assets, and 64 cameras |
| One render | 1,800 frames, 1.1 billion rendered pixels, 256 MiB of source payloads, 256 MiB of output |
| Contact sheet | 64 samples |
| Preparation window | 32 frames |
| Staged asset and frame budget | 8 GiB, excluding the browser runtime, caches, and process memory |
| Project program | 64 shots sharing the frame, pixel, and staging budgets, plus 1 GiB of distinct shot video |
| Saved worlds | gzip SPZ v2/v3 with `flags=0` and no antialiasing, 500,000 aggregate splats, 128 MiB compressed and 64 MiB decompressed per source |

These are first-release admission bounds, not claims about unlimited scene or world scale. Scenes use right-handed Y-up coordinates in meters, camera-local negative Z, and XYZW quaternions; author time in integer microseconds. The renderer rejects external GLB resources, unsupported extensions, sparse accessors, compressed meshes, cubic animation, WOFF2 fonts, and unsupported HDR or color profiles. The static GLB profile additionally rejects skins, morph targets, and skinning attributes; the explicit additive rigged profile `slopcamera.glb-rigged-morph-skin-v1` admits them within its own declared bounds. For what each renderer contributes and where its limits sit, see [the engine stack](/docs/reference/engines) and [the capability reference](/docs/reference/capabilities).

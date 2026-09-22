The `slopcamera studio` commands run retained Blender, CadQuery, or Manim source through a closed host adapter while keeping the engine's own program as the editable artifact. Slopcamera never installs or upgrades native tools: you install a supported engine and select the exact executable or Python environment per invocation.

## Qualified engines

Native qualification used Blender 5.2.1 LTS, CadQuery 2.8.0, and Manim Community 0.21.0 on macOS arm64. These observations do not certify every plugin, solver, device, or imported asset; each source recipe records its own qualified runtime.

| Engine | Source form | Output path |
| --- | --- | --- |
| Blender | `scene.py` at module scope or `build(context)`; explicit `bake(context)` for caches | PNG color sequences, then `studio encode` |
| CadQuery | Parametric solids through the same Python contract | STEP and render outputs |
| Manim Community | A named scene class, run through the qualified Cairo profile | Silent visuals for composited lessons |

Inside the source, `SLOPCAMERA_CONTEXT` supplies detached parameters, the stage, the render clock, and the private source, output, and working roots.

## The trust envelope

`studio run` executes retained Python as your current user. There is no operating-system sandbox and no hermetic dependency closure: private roots, a scrubbed child environment, content hashes, and process-group supervision provide control and provenance, not confinement. Every run requires an explicit `--allow-trusted-code` on that invocation, and the job document records `trust: "trusted-current-user"` with `isolation: "none"`. A stored write approval cannot grant it, and a missing envelope pauses a workflow node before dispatch. Keep unreviewed downloaded source inert until you authorize it.

Provider credentials are not inherited by the child environment.

## The job lifecycle

```sh
slopcamera studio init product --template blender-product --json
slopcamera studio bundle product/source.json --json
slopcamera studio plan product/job.json --json
slopcamera studio probe product/job.json --blender-bin /Applications/Blender.app/Contents/MacOS/Blender --json
slopcamera studio run product/job.json --blender-bin /Applications/Blender.app/Contents/MacOS/Blender --allow-trusted-code --json
slopcamera studio inspect <studio-id> --json
slopcamera studio encode <studio-id> --output-id beauty --json
slopcamera studio assemble <studio-id> --output-id beauty --name "The first shot" --json
```

- `init` scaffolds without executing anything. Seven starters ship with the CLI: `blender-product`, `blender-character`, `blender-shaded-street`, `blender-cloth`, `blender-fluid`, `cadquery-bracket`, and `manim-lesson`.
- `bundle` stores the declared source files as content-addressed immutable copies; it does not recursively discover siblings, follow file symlinks, or run Python. After a source edit, bundle again, copy the returned `bundleSha256` into the job, and choose a new `jobId`.
- `plan` parses and hashes the request without loading an engine. `probe` loads the selected installed engine and the fixed driver without executing your scene.
- `run` verifies the bundle, supervises the process group, and checks every declared output. A GPU request fails clearly rather than falling back to CPU; the default Blender product job requests Cycles on GPU, so set `device: "cpu"` when CPU rendering is intended.
- `inspect` rechecks source and physical output hashes. `encode` turns a receipted PNG sequence into a verified derivative: RGB becomes lossless H.264 RGB MP4 and straight RGBA becomes lossless QTRLE MOV, with every decoded frame checked against its source pixels. A 16-bit sequence produces an explicitly recorded 8-bit derivative without dithering.
- `assemble` reuses the verified encode and creates an ordinary [video project](/docs/reference/video-pipeline) with exact native and encode lineage. Its initial clip profile accepts opaque sRGB sequences up to 4,096 pixels per side, 4,000 frames, and 60 seconds.

`studio assets` acquires Poly Haven material through explicit `search`, `describe`, `plan`, and `import` steps. `studio reconcile` recovers uncertain custody after interruption.

## Limits

Native jobs inside a durable workflow need the installed Bun package or a source checkout; a copied standalone executable has no host source tree. `slopcamera.studio.run` is the single operation allowed to execute authored code. The separate vgpu 0.4.1 example runtime is provisioned through Node and Dawn and is not a registered studio engine.

For the end-to-end task, see [Author a native film](/docs/how-to/native-films) or the [first native film tutorial](/docs/tutorials/first-native-film).

# Import a textured packaging mockup

**Authored source only. Native import, six-frame comparison and packed-scene
inspection have not run.** This original FIELD / 01 carton demonstrates the
intended task of importing a textured GLB, staging it, and retaining its artwork
when the Blender scene is saved and reopened.

The model is a 70×45×120 mm rectangular sample with 24 face-local vertices and
12 triangles. It is an authored packaging mockup, not a manufacturer's model or
production dieline. One original 2048×2048 RGB PNG provides every printed face.
Its front wordmark, side stripe, asymmetric top mark and distinct back panel make
orientation visible. The artwork uses original SVG paths without external fonts,
images or scripts. The example and artwork use the repository's MIT license.

`author-assets.ts` independently constructs the GLB and its artwork. `scene.py`
imports that file rather than rebuilding its geometry. The GLB embeds the exact
retained PNG and has no external URI, animation, skin or material extension.
`asset-facts.json` records its source hashes, geometry, face UVs and source pixel
hash. Lighting uses the imported opaque matte material; these images are not a
colorimetric print proof.

From a source checkout with its existing Bun and Sharp dependencies:

```sh
bun examples/showcase/native/imported-model-study/author-assets.ts --check
bun examples/showcase/native/imported-model-study/prepare.ts --check
```

The authoring check regenerates bytes in memory and compares them with the
retained assets. It starts no native engine. `author-assets.ts --write` explicitly
replaces its four authored outputs; use it only after reviewing an intentional
source edit, then rebind the source bundle and job templates. All authored source
and assets together are limited to 4 MiB.

`prepare.ts --check` verifies the closed source, exact embedded PNG, decoded RGB
pixels, PNG chunk profile and three parsed single-frame job templates. It does
not prove Blender import or visible quality. Create fresh inert job documents:

```sh
bun examples/showcase/native/imported-model-study/prepare.ts --write-jobs
slopcamera studio bundle examples/showcase/native/imported-model-study/source.json --json
slopcamera studio plan <prepared-job.json> --json
slopcamera studio probe <prepared-job.json> --blender-bin <absolute-runtime> --json
slopcamera studio run <prepared-job.json> --allow-trusted-code --blender-bin <absolute-runtime> --json
slopcamera studio inspect <successful-job-id> --json
```

Match the returned bundle hash before execution. On managed hosts, use the
existing native scheduler. Native Python runs as the current user; source import
and job preparation do not grant execution permission. Keep the shared storage
hold until it is explicitly cleared, and require at least 2 GiB free before any
selected native job. No film job is included.

The three views are frames 0 (front/right/top), 1 (right panel) and 2
(back/left/top). Each template renders one 960×540 RGB PNG with Cycles CPU,
16 samples, denoising disabled, AgX and seed 0; it also saves a `.blend`. The
half-open interval uses the chosen frame and 24/1 fps, but these are separate
stills, not a three-frame animation. Each job has a 240-second deadline, a
192 MiB output cap and a 32-file cap. Track the whole study's retained bytes
against a separate 192 MiB budget before subsequent work.

The importer compares oriented triangle corners, bounds, normals and UVs to the
original GLB. It verifies the image bytes immediately after import and after
packing, preserves material/mesh/shading data, and saves all three discrete
poses in the native scene. The source enforces checks; observed native success
and appearance still require actual execution.

After all three original views pass, bind the successful hero scene to fresh
replay recipes:

```sh
bun examples/showcase/native/imported-model-study/prepare-replay.ts <successful-prepared-hero-job-id>
slopcamera studio bundle <replay.source.json> --json
slopcamera studio plan <replay-0.job.json> --json
slopcamera studio probe <replay-0.job.json> --blender-bin <same-runtime> --json
slopcamera studio run <replay-0.job.json> --allow-trusted-code --blender-bin <same-runtime> --json
```

Repeat the last three commands for replay frames 1 and 2. The replay descriptor
contains only the exact native scene. Blender opens it with embedded scripts
disabled; the fixed host rejects unpacked FILE images outside the declared
bundle. The packed PNG must therefore remain present without a texture file in
the replay source.

Bundle and run the separately prepared `inspection.source.json` and
`inspection.job.json` through the same plan/probe/run sequence. `inspect.py` is
an explicit trusted inspection script; it opens the scene with embedded scripts
disabled and checks packed bytes, geometry, UVs, normals, materials, dependency
closure and the three transforms. Its bounded `SLOPCAMERA_TEXTURE_FACTS=` stdout
record must be retained alongside the actual inspection receipt. The native
output schema does not have a generic JSON-output format.

Before admission, compare the decoded RGB pixels of all three original/replay
pairs with identical settings: mean absolute channel difference no more than
0.5 code values, and no more than 0.1% of channels differing by over 8 values.
Review all six full frames and the three unique views at docs phone scale.
FIELD / 01 must read, the side band must cross the intended seam, the top mark
and back bars must face correctly, and no missing/mirrored/stretched texture,
clipped model or unexplained scale change may pass. This sampled same-runtime
proof cannot establish universal interchange or exact rendering on other hosts.

Preserve native masters, original PNGs, receipts and failed attempts. Public
image derivatives require the existing metadata-removal and publication gate;
original Blender metadata stays private. Gallery admission is separate from
this authored source and remains pending native and independent visual review.

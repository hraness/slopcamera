# Native films you can edit

A machined optical instrument, a waving character, two simulation studies, a dimensioned bracket, and a portrait geometry lesson. Each example retains its authoring source. Slopcamera binds that source to a request, probes the selected runtime, retains outputs and a receipt, and checks process custody before reporting success.

| Example | What changes on screen | Editable source |
| --- | --- | --- |
| `product` | A six-second camera move around brass, rubber and optical glass | Blender geometry, materials, lighting, camera and focus keys |
| `character` | A six-second wave, blink and smile | Weighted armature, IK target, skin weights and facial shape keys |
| `cloth` | Fabric falls over a collision pedestal | Cloth settings, mesh, collider and completed native/Alembic cache |
| `fluid` | A liquid volume drops into a basin | Mantaflow domain, collision objects and completed data/mesh caches |
| `cad` | The same mount built at two widths and heights | CadQuery solids, four counterbores, aperture, STEP and GLB exports |
| `education` | A 3–4–5 triangle becomes 9 + 16 = 25 square tiles | Manim lesson, typeset equation, presenter, gestures and caption timings |

The geometry lesson is silent. Its mouth shapes and captions follow authored timings; they are not speech alignment or measured lip sync. It illustrates one integer triangle, rather than a general proof of the Pythagorean theorem. The cloth and liquid previews preserve 40 and 32 frames of actual simulated time; a short preview is not physical validation.

## Requirements

Use the built Slopcamera CLI in this repository and Bun. The observed native runtime is Blender 5.2.1 LTS on macOS ARM64, with Cycles Metal for finished frames, plus Python 3.12.14, CadQuery 2.8.0 and Manim 0.21.0 with Typst. [Runtime provenance](runtime-provenance.json) records the official Blender archive and checksum. [The Python lock](runtime-requirements.txt) pins the exact dependency versions and hashes. Other platforms and renderer backends need their own qualification.

For an isolated Python environment:

```sh
uv venv --python python3.12 artifacts/showcase/native-python
uv pip install --python artifacts/showcase/native-python/bin/python \
  --default-index https://pypi.org/simple --require-hashes \
  -r examples/showcase/native/runtime-requirements.txt
```

Manim may need the system Cairo/Pango development libraries when installing the locked Pycairo source package. Install Blender from its official distribution and verify its checksum and platform signature. These examples do not download or install a native runtime automatically.

Native Python source runs as your current user. Read the source before using the explicit trusted-code option. These runs are not hermetic or sandboxed.

## Render a film

From the repository root, substitute an absolute path to your verified Blender binary:

```sh
bun examples/showcase/native/render.ts product --blender-bin /absolute/path/to/Blender
bun examples/showcase/native/render.ts character --blender-bin /absolute/path/to/Blender
```

The helper executes `studio bundle`, binds the returned digest into a new job ID, then runs `studio plan`, `studio probe` and `studio run --allow-trusted-code`. Requests, exact command arguments, logs and receipts stay under `artifacts/showcase/native/<example>/`. Native outputs remain in Slopcamera's retained private studio store. A successful receipt must report both `state: succeeded` and `custody: closed`.

Product and character jobs request 144 frames at 24 fps, 1280×720 and 32 Cycles samples with denoising. Frame 144 is an authored virtual endpoint matching frame 0; the output interval is `[0, 144)`. The camera remains editable, and the character's continuous arm mesh bends through its weighted skeleton. A mesh export does not preserve every Blender control.

## Bake, retain and replay a simulation

```sh
bun examples/showcase/native/render.ts cloth --blender-bin /absolute/path/to/Blender
bun examples/showcase/native/replay.ts cloth --blender-bin /absolute/path/to/Blender
bun examples/showcase/native/render.ts fluid --blender-bin /absolute/path/to/Blender
bun examples/showcase/native/replay.ts fluid --blender-bin /absolute/path/to/Blender
```

The first command performs the actual bake. The second declares every exact `.blend` and cache output in a new source bundle, then renders that bundle in a fresh process with embedded-script execution disabled. It preserves the cache's relative directory layout. The cloth replay is 1280×800 and the liquid replay is 1280×960, leaving room for the complete simulated shape. Cloth keeps a completed point cache and an Alembic deformation cache; liquid keeps both volume data and surface meshes. Inspect the retained `bake-evidence.json`, the fresh replay's frames and its receipt together.

For a useful variation, set `pinBackCorners: true` in the cloth job's `parameters`; the source checks that both fully weighted pin vertices remain fixed through every baked frame. Set fluid `resolution` between 16 and 48 to trade detail against compute and cache size. Changing these parameters requires a new completed bake; an earlier cache does not prove the variation.

## Build a CAD variation and round-trip the solid

```sh
bun examples/showcase/native/render.ts cad --python /absolute/path/to/python
bun examples/showcase/native/cad-variations.ts --python /absolute/path/to/python
```

The baseline is 100 mm wide and 56 mm high; the variation is 132 mm wide and 68 mm high. Both preserve the holes, aperture and isolation pad. The helper reimports the baseline STEP through an explicit declared source bundle and checks solid validity, solid count and relative volume error below `0.00001`. It retains the measured bounds and volumes in `cad-observations.json`.

The helper also binds a Blender presentation containing the exact two generated GLBs. Render its request with:

```sh
bun apps/desktop/dist/cli/main.js studio probe artifacts/showcase/native/cad/preview.job.json \
  --blender-bin /absolute/path/to/Blender --json
bun apps/desktop/dist/cli/main.js studio run artifacts/showcase/native/cad/preview.job.json \
  --blender-bin /absolute/path/to/Blender --allow-trusted-code --json
```

STEP remains an editable solid representation in millimeters. The GLB is a tessellated presentation derivative in meters with its declared axis convention. Its appearance is not evidence that a later mesh edit changed the original solid.

## Render the lesson

```sh
bun examples/showcase/native/render.ts education --python /absolute/path/to/python
```

This requests ten seconds at 24 fps and 720×1280, with both PNG frames and a lossless master movie. The lesson supplies the exact triangle, tile identities, authored timings and caption words. Edit `lesson.json` and its validation helpers together when changing the mathematics or duration. For speech, retain a real authorized audio track and its timing evidence before claiming narrated or aligned output.

## Encode or assemble

For a completed image-sequence job, use its returned job ID:

```sh
bun apps/desktop/dist/cli/main.js studio encode <job-id> --output-id beauty --json
bun apps/desktop/dist/cli/main.js studio assemble <job-id> --output-id beauty --json
```

Encoding retains a media derivative; assembly returns an ordinary editable Slopcamera project. Public preview MP4s and posters are small derivatives of these completed frames. They are published separately from native binaries, private receipts, caches and master files.

# Make web-ready 3D assets

Use this workflow when a Blender model must ship as a GLB for a Three.js scene,
a web page or a WebGPU runtime: block it out, bake detail from a dense mesh onto
a light one, budget its textures, build LODs, export, check and promote it.
Apply the [3D quality bar](3d-quality-bar.md) to its review renders.

The stages adapt the Blender asset workflow from Vercel Labs' MIT-licensed
[vgpu Agent Skill](https://github.com/vercel-labs/vgpu/tree/38188e694a20ad355a00faf29aa0bb0ffab0c954/skills/vgpu)
to Slopcamera's retained studio jobs and GLB checks. Install that skill with
`npx skills add vercel-labs/vgpu` when the target runtime is vgpu itself.

Slopcamera has no modelling, baking, decimation or compression command. Each of
those steps is Blender Python in a trusted studio job, as in
[native studio](native-studio.md): bundle the source, run it with
`--allow-trusted-code`, and keep every output beside its receipt.

## Know what each target accepts

| Target | Accepts | Check with |
| --- | --- | --- |
| Slopcamera scenes (`scene render`) | Self-contained GLB 2.0, metallic-roughness PBR, embedded PNG or JPEG, one UV set (`TEXCOORD_0`), float32 positions and normals | `slopcamera scene asset admit` |
| HTML `three` profile | Whatever the page's Three.js loader decodes; the scaffold stops at 64 draw calls or 200,000 triangles | Rendered frames |
| Your own web app, or vgpu | Whatever its loader decodes, such as Draco, meshopt or KTX2 | That runtime's loader and frames |

The Slopcamera scene importer rejects Draco and meshopt compression, KTX2 and
other unlisted extensions, tangents, vertex colors, a second UV set and external
files. It allows up to 100,000 triangles, 256 primitives, 65,536 vertices per primitive, 128 images, 16 MiB per image and 32 MiB of images in total. Keep an
uncompressed GLB as the master and make compressed copies only for a runtime
that decodes them.

## Run a small stage first

Before a long job, run the cheapest stage that exercises the real path: one
object, one bake at low resolution, one export, one admit. `studio probe` checks
the installed Blender and devices but renders nothing, so a first real run is
the only proof that the shaders compile and the export imports.

Make each stage its own job with its own outputs: block-out `.blend`, high-poly
source, low-poly mesh and UVs, baked maps, exported GLB. A failed bake then
reruns from the retained low-poly mesh instead of from scratch. A failed job is
never rerun automatically; inspect it first.

## Block out shape and assembly

- Model in meters, Y-up, and declare `units`, `upAxis` and `handedness` on each
  model output. Compare measured bounds from `scene asset admit` with the real
  object's size.
- Settle the silhouette and proportions in a block-out before adding detail.
  Review it from the shot's actual cameras, front, side and three-quarter.
- Make parts attach. A handle meets its body, a roof sits on its walls, a
  wheel touches the ground. Check contacts in close renders; floating gaps and
  interpenetration read as fake.
- Spend triangles where they change the outline. Flat interiors and hidden
  faces get few; curved edges that face the camera get more.

## Bake a dense mesh onto a light one

1. Keep the dense source as the reference. Do not edit it to hide a bake
   problem.
2. Freeze the low-poly mesh first: final topology, smoothing, hard edges on UV
   seams, and one non-overlapping UV map with padding. Rebaking after a UV
   change is mandatory.
3. Bake tangent-space normals with Blender's OpenGL (Y+) convention, which
   glTF uses. Use a cage, or a uniform extrusion, plus a maximum ray distance
   just larger than the gap between the meshes. Too short leaves holes; too
   long catches the wrong surface.
4. Bake ambient occlusion from the final assembled object so contact shadows
   between parts appear, and give the bake enough margin to cover mip levels.
5. Prove one representative part before baking the whole asset.

## Diagnose a bad bake

Look at the maps and at a flat-lit render before changing settings, and change
one thing at a time.

| Symptom | Usual cause |
| --- | --- |
| Black or noisy patches | Rays miss: ray distance or cage too small |
| Detail from the wrong surface | Ray distance too large, or overlapping parts baked together |
| Visible UV seams | Too little margin, or smoothing that differs across the seam |
| Lighting looks inverted on bumps | Normal map green channel flipped (DirectX convention) |
| Banding in AO or gradients | Too few samples, or 8-bit output for a smooth gradient |
| Wavy shading on flat faces | Low-poly normals bent by smoothing; add support edges or split |

## Set texel density and texture budgets

- Pick one texel density for the asset from its closest camera distance, and
  size each map to it. A larger map on a part that is never close wastes memory.
- Store base color and emission in sRGB; store normal, roughness, metallic and
  AO as linear data. glTF reads roughness from the green channel and metallic
  from the blue channel of one map, so pack AO into its red channel to save a
  texture.
- Use power-of-two sizes so mipmaps filter cleanly.
- Count GPU memory, not file size. A 2048 × 2048 RGBA8 texture with mipmaps
  takes about 21.3 MiB on the GPU whether it ships as PNG or JPEG. Only a GPU
  block format, such as KTX2 transcoded to BC7 or ASTC, lowers that, and only
  in a runtime that supports it.

## Build an LOD chain

Make level 0 the full asset and each further level strictly lighter: fewer
triangles and no more texture pixels. Preserve the silhouette, openings and
contact points at each level, and review every level at the distance where it
will show. Record the levels, triangle counts and switch distances in a
manifest beside the GLBs.

## Export, check and promote

1. Export from Blender with the glTF 2.0 exporter as GLB, with +Y up, applied
   transforms, one UV map, no tangents and no vertex colors. Skip Draco for the
   master.
2. Write each export to a new path. Do not replace a GLB that a scene already
   uses.
3. Turn a studio model output into a scene asset with
   `slopcamera studio asset <studio-id> --output-id <id> --asset-id <asset-id> --representation native --json`,
   or admit a local file with
   `slopcamera scene asset admit model.glb --source-root assets --output model.manifest.json --json`.
   Both reject a GLB the renderer cannot draw.
4. Check budgets and the LOD chain with the SDK (a source build until the
   helpers ship in a release), then render the asset in a
   scene before promoting it. Promote by pointing the scene at the new asset
   with `scene patch`; the old asset and manifest stay as the recovery path.

```ts
import { readFile } from "node:fs/promises"
import {
  checkSpatialGlbBudget,
  checkSpatialGlbLodChain,
  measureSpatialGlbBudget,
  parseSpatialGlb,
} from "@hraness/slopcamera/code"

const measure = async (path: string) =>
  measureSpatialGlbBudget(parseSpatialGlb(new Uint8Array(await readFile(path))))

const budget = { maxTriangles: 20_000, maxTextureEdge: 2048, requirePowerOfTwoTextures: true }
const lod0 = await measure("chair.lod0.glb")
const findings = [
  ...checkSpatialGlbBudget(lod0, budget),
  ...checkSpatialGlbLodChain([
    { level: 0, measurement: lod0 },
    { level: 1, measurement: await measure("chair.lod1.glb"), budget: { maxTriangles: 5_000 } },
  ]),
]
if (findings.length > 0) throw new Error(findings.map(finding => finding.message).join("\n"))
```

`measureSpatialGlbBudget` counts the static pose's triangles, including each
instance, and the referenced embedded images' count, pixels, encoded bytes and
longest edge. It does not decode pixels or measure GPU memory, load time or
draw cost.

## Check the result at runtime

Render the asset where it will ship and compare it with a Blender review frame
from the same camera. When they differ, find which stage introduced the
difference before fixing it: the source, the bake, the export or the runtime.

- Missing detail or flipped lighting usually comes from the bake or the normal
  convention.
- Wrong colors usually come from a map stored in the wrong color space, or tone
  mapping applied twice.
- Missing parts or materials usually come from the export; check the admit
  findings.
- Shimmering edges and texture swimming in motion come from the runtime:
  missing mipmaps, or a renderer without anti-aliasing. The spatial scene
  renderer samples each pixel once; see the [quality bar](3d-quality-bar.md).

For a WebGPU target, the optional `examples/studio/vgpu` example in the source
checkout renders through vgpu 0.4.1 in a separate Node runtime. It is an
example, not a studio engine; qualify your own vgpu version and loader there.

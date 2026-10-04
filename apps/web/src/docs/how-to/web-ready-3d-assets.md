Build a model in Blender, bake its detail onto a light mesh, export it as GLB
with level-of-detail copies, and check it before a Three.js scene or web page
uses it. Each stage is a Blender Python program in a retained
[studio job](/docs/how-to/native-films), so a failed bake reruns from the saved low-poly mesh
instead of from scratch.

SlopCamera has no modelling, baking, decimation, or compression command. It runs
your Blender source, records what it wrote, and checks the GLB. The stages
adapt the Blender asset workflow in Vercel Labs'
[vgpu Agent Skill](https://github.com/vercel-labs/vgpu/tree/38188e694a20ad355a00faf29aa0bb0ffab0c954/skills/vgpu).

You need Blender 5.2.1 LTS and SlopCamera with the `studio` and `scene`
commands. The budget and LOD checks in step 5 need a
[source build](/docs/how-to/install-from-source) until they ship in a release.

## Ask for it in a brief

A brief can name the result and the quality bar in one line:

```text
Model a café chair for the product page as a web-ready GLB with two LODs: accurate physics, AAA graphics, VFX.
```

The agent applies the SlopCamera Agent Skill's 3D quality bar to every 3D brief
even when the brief does not name it: real-world scale and contact, physically
based materials with managed color and anti-aliased edges, and effects only
where they help the shot. Say so in the brief when you want a flat or stylized
look instead.

## Steps

### 1. Check what the target accepts

| Target | Accepts |
| --- | --- |
| SlopCamera scenes (`scene render`) | Self-contained GLB 2.0, metallic-roughness materials, embedded PNG or JPEG, one UV set. No Draco, meshopt, or KTX2. |
| The HTML `three` profile | What the page's Three.js loader decodes. The scaffold stops above 64 draw calls or 200,000 triangles. |
| Your own web app, or vgpu | What that runtime's loader decodes, such as Draco, meshopt, or KTX2. |

For a SlopCamera scene, the importer allows up to 100,000 triangles, 256 primitives, 65,536 vertices per primitive, 128 images, 16 MiB per image, and 32 MiB of images in total. Keep an uncompressed GLB as the master and make
compressed copies only for a runtime that decodes them.

### 2. Block out the shape

Start a Blender job and model in meters with +Y up:

```sh
slopcamera studio init chair --template blender-product --json
```

Settle the silhouette and proportions before adding detail, and review them from
the shot's cameras. Make parts touch where they join: legs meet the seat, the
chair stands on the floor.

### 3. Bake detail onto the light mesh

Keep the dense mesh as the reference. Finish the light mesh's topology and its
one UV map, then bake a tangent-space normal map in the OpenGL (Y+) convention
that glTF uses, with a cage or extrusion and a ray distance just larger than the
gap between the meshes. Bake ambient occlusion from the assembled chair. Bake
one part first and look at it before baking the rest.

Run each stage as its own job so its outputs are kept. After editing the source,
bundle it, copy the returned `bundleSha256` into the job with a new `jobId`, and
run it:

```sh
slopcamera studio bundle chair/source.json --json
slopcamera studio run chair/job.json --allow-trusted-code --json
```

If a bake shows black patches, the rays are too short. If it shows detail from
the wrong surface, they are too long or parts overlap. If lighting looks
inverted on bumps, the normal map's green channel is flipped.

### 4. Size textures and build LODs

Choose one texel density from the closest camera distance and size each map to
it, in power-of-two sizes. Store base color in sRGB, and normal, roughness,
metallic, and occlusion maps as linear data. A 2048 × 2048 texture takes about
21.3 MiB of GPU memory with mipmaps whether it ships as PNG or JPEG.

Make each LOD lighter than the one before, with fewer triangles and no more
texture pixels, and keep the outline and contact points. Export each level from
Blender as GLB with transforms applied, one UV map, and no tangents or vertex
colors.

### 5. Check and admit the GLB

Admit each export into a scene-ready manifest. The command rejects a GLB the
scene renderer cannot draw and reports its measured bounds:

```sh
slopcamera scene asset admit chair.lod0.glb --source-root assets --output chair.lod0.manifest.json --json
```

For a model written by a studio job, use
`slopcamera studio asset <studio-id> --output-id <id> --asset-id <asset-id> --representation native --json`
instead.

From a source build, check the project budget and the LOD chain:

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

const lod0 = await measure("assets/chair.lod0.glb")
const findings = [
  ...checkSpatialGlbBudget(lod0, { maxTriangles: 20_000, maxTextureEdge: 2048, requirePowerOfTwoTextures: true }),
  ...checkSpatialGlbLodChain([
    { level: 0, measurement: lod0 },
    { level: 1, measurement: await measure("assets/chair.lod1.glb"), budget: { maxTriangles: 5_000 } },
  ]),
]
console.log(findings)
```

An empty list means every limit you set holds and each level is lighter than
the one before.

### 6. Render it and compare

Point the scene at the new asset with `slopcamera scene patch`, render it, and
compare the frame with a Blender render from the same camera. Keep the previous
asset and manifest; switching back is the recovery path.

## Limits

- The checks count triangles, primitives, and embedded images. They do not
  decode pixels or measure GPU memory, load time, or draw cost.
- The SlopCamera scene renderer samples each pixel once and has no
  anti-aliasing, so its stills show stair-stepped edges. Render a final where
  edges matter in a Blender job or the HTML `three` profile.
- The scene renderer has no live physics. Simulate contact in Blender, or stage
  it by hand.
- WebGPU is not a SlopCamera renderer. The optional `examples/studio/vgpu`
  example in the source checkout renders through vgpu 0.4.1 in a separate
  runtime; qualify your own version there.

## Related

- [Render Blender, CadQuery, and Manim films from source](/docs/how-to/native-films)
- [Render and edit Three.js 3D scenes](/docs/how-to/direct-scenes)
- [Plan camera moves, lighting, and effects for a 3D scene](/docs/how-to/cinematic-worlds)

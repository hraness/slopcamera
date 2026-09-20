# Build and revise a parametric design

Create an architectural study, change its dimensions, and render its generated model while retaining the rules that built it. Install the [verified Slopcamera v3.3.2 release](../../README.md#install-slopcamera) or use a [source build](use-current-source.md), then check `slopcamera doctor --json` for the browser required by spatial rendering. Design inspection and compilation run locally with the Slopcamera CLI.

## Create a study

1. List the available starters.

   ```sh
   slopcamera scene design catalog --json
   ```

   The original studies are `crescent-pavilion`, `spiral-stair`, `ribbed-tower` and `modular-bookshelf`. They include coupled dimensional controls, separate geometry stages, materials, studio lights and hero, detail and plan cameras.

2. Create a timber pavilion source.

   ```sh
   slopcamera scene design init artifacts/slopcamera/generated/pavilion-source \
     --template crescent-pavilion --json
   ```

3. Inspect its controls and dependency relationships.

   ```sh
   slopcamera scene design inspect \
     artifacts/slopcamera/generated/pavilion-source/design.json --json
   ```

   The report lists each stage's dependencies and geometry estimate. Resolve a failed dimensional constraint in the design or its parameter values before compiling.

4. Compile the design with its supplied staging scene.

   ```sh
   slopcamera scene design compile \
     artifacts/slopcamera/generated/pavilion-source/design.json \
     --scene artifacts/slopcamera/generated/pavilion-source/base.scene.json \
     --output-dir artifacts/slopcamera/generated/pavilion-v1 --json
   ```

5. Render its hero frame.

   ```sh
   slopcamera scene render \
     artifacts/slopcamera/generated/pavilion-v1/scene.json \
     --request artifacts/slopcamera/generated/pavilion-v1/render.json --json
   ```

   Open the returned PNG. Check the entire silhouette, clear openings, repeated members and contact shadows. Use `camera_detail` or `camera_plan` in a new render request to inspect connections and arrangement. The [spatial-scene guide](../spatial-scenes.md) covers rendering profiles and camera requests.

## Change a dimension

Save this object as `pavilion-values.json`:

```json
{ "span": 7 }
```

Apply the values to a new source revision:

```sh
slopcamera scene design set \
  artifacts/slopcamera/generated/pavilion-source/design.json \
  --parameters pavilion-values.json \
  --output artifacts/slopcamera/generated/pavilion-source/wider.design.json --json
```

Compile the new source into `pavilion-v2`, using the same base scene. The dependent ribs and details regenerate. The earlier source and bundle remain available. For edits that must preserve generated-part overrides, pass the prior compiled `scene.json` as the base and keep the design and stage identities stable.

## Compare alternatives

Save an explicit variants document as `pavilion-variants.json`:

```json
{
  "kind": "slopcamera.spatial-design-variants",
  "schemaVersion": 1,
  "variants": [
    { "id": "compact", "label": "Compact span", "parameters": { "span": 5 } },
    { "id": "generous", "label": "Generous span", "parameters": { "span": 7 } }
  ]
}
```

Compile both candidates:

```sh
slopcamera scene design gallery \
  artifacts/slopcamera/generated/pavilion-source/design.json \
  --variants pavilion-variants.json \
  --scene artifacts/slopcamera/generated/pavilion-source/base.scene.json \
  --output-dir artifacts/slopcamera/generated/pavilion-options --json
```

Each candidate directory has its own `scene.json`, `render.json` and receipt. Render those candidates through the same camera before selecting one. This gallery compiles models; it does not claim an unrendered model is a reviewed image. Keep the chosen source for later revisions.

## Develop the result

The [design reference](../parametric-design.md) describes expressions, constraints, geometry stages and the SDK. Author dimensions and meaningful part names before increasing detail. Use bevels, coherent member proportions and deliberate joints where they affect the final view. Lighting, materials, camera position and the surrounding scene remain explicit design decisions.

Use [native studio](../studio.md) for Blender/Cycles production shading, native CAD operations, or engine-specific geometry. Retain the original design and units when exchanging generated GLB models with another tool. To add downloaded models, use the [local GLB import workflow](../spatial-scenes.md#admit-a-local-gltf-asset).

## Integrate a design into an existing film

Compile the architecture before playback. Keep the film's cameras, character rigs and interaction timing in the host scene, and give generated parts semantic stage names so that materials and placement remain understandable. Retain the design, compiled scene, GLB bytes and receipt together; record the compiler version and the hashes of the assets used by the film.

For a custom renderer, decode the retained bytes with the public SDK's `parseSpatialGlb` and `evaluateSpatialGlb`. Generated designs use meters in a right-handed, Y-up coordinate system. Preserve each evaluated primitive's matrix and the generated entity transform, applying each once. `material.baseColorLinear` is already linear RGB; converting it as an sRGB hex color changes the finish. Verify a translated, rotated and nonuniformly scaled fixture against the emitted vertices before trusting a new import bridge.

Decode and cache geometry once, then create independent object groups and materials for each instance. If the host adds UVs or other geometry attributes, clone shared geometry first. Keep such surface treatments separate from the retained compiled asset. Project texture coordinates in meters so plaster, timber and stone have consistent scale across differently sized members.

Review construction from the actual camera path, including entrances and transitions. Check opening depth and jambs, glass placement, floor-to-wall joints, roof equipment supports, and gaps beneath props. Separate finish surfaces from structural slabs to prevent coplanar flicker. A mullion that looks correct in a hero image can obstruct a moving camera; inspect nearby frames before moving the camera or changing choreography.

After the revision, repeat earlier and later seeks and compare their rendered pixels. Seed unrelated procedural sets independently so changing one building does not rearrange another scene. Finally inspect frames decoded from the encoded movie, including interaction contacts and chapter transitions. A successful compilation or a still-image review alone does not establish that the delivered film plays correctly.

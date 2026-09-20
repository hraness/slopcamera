# Build and revise a parametric design

Create an architectural study, change its dimensions, and render its generated model while retaining the rules that built it. Install the [verified Slopcamera v3.3.1 release](../../README.md#install-slopcamera) or use a [source build](use-current-source.md), then check `slopcamera doctor --json` for the browser required by spatial rendering. Design inspection and compilation work without a browser, Rhino, a cloud account or paid generation.

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

Use [native studio](../studio.md) for Blender/Cycles production shading, native CAD operations or engine-specific geometry. A GLB model can also be opened in a compatible DCC tool; retain its original design and units. From Rhino, export a compatible GLB and use `scene asset admit` to retain it in Slopcamera. Slopcamera does not execute `.gh` definitions or import `.3dm` directly. Rhino's proprietary application and plugin requirements remain separate from these local design commands.

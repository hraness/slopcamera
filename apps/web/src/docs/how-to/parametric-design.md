Create an architectural or furniture study, change its dimensions, and render the generated model while retaining the rules that built it. A design connects named parameters to geometry stages; compilation writes an ordinary spatial scene, generated GLB geometry, asset facts, and a receipt.

Install [Slopcamera v3.3.2](/docs/reference/capabilities#install-the-release) or use a [source build](/docs/how-to/install-from-source) for `slopcamera scene design`. Obtain the retained study inputs from the linked repository sources; they are separate from the release archive. Inspect the available commands with `slopcamera help scene` and the local rendering requirements with `{{DOCTOR_COMMAND}}`. Design inspection and compilation need no browser, Rhino, cloud account, or paid generation. Rendering the finished scene needs the local browser runtime described in [Render and edit spatial scenes](/docs/how-to/direct-scenes).

## Compile and render a study

The [retained study sources](https://github.com/hraness/slopcamera/tree/main/examples/showcase/parametric) pair each `design.json` with its `base.scene.json`. Work from the repository root and keep both files: the design owns the dimensions and geometry rules; the base scene owns the staging, lights, and cameras.

Inspect the pavilion's controls, dependencies, constraints, and estimated geometry:

```sh
slopcamera scene design inspect examples/showcase/parametric/crescent-pavilion/design.json --json
```

Resolve any failed constraint before compiling. Choose a fresh output directory, then compile the model and render its supplied hero request:

```sh
slopcamera scene design compile examples/showcase/parametric/crescent-pavilion/design.json \
  --scene examples/showcase/parametric/crescent-pavilion/base.scene.json \
  --output-dir artifacts/slopcamera/generated/pavilion-v1 --json

slopcamera scene render artifacts/slopcamera/generated/pavilion-v1/scene.json \
  --request artifacts/slopcamera/generated/pavilion-v1/render.json --json
```

Open the returned PNG and inspect the silhouette, repeated members, clear openings, and contact shadows. Retain the whole compiled bundle, including `design.json`, `scene.json`, geometry and facts payloads, and `receipt.json`. If compilation stops before writing its completion receipt, keep that directory for inspection and choose a fresh path for the next attempt.

To start a separate design from the installed catalog, run `slopcamera scene design catalog --json`, then `slopcamera scene design init pavilion-source --template crescent-pavilion --json`. The retained inputs below reproduce these particular studies; installed starters can change with the source version.

## Crescent pavilion

Curved timber ribs sit above a continuous stone walk, with separate bronze longitudinal ties. The retained source uses a 6.2 m span, 4.1 m crown height, 11.5 m walk length, and 1.1 rad plan curvature. Inspect the daylight between adjacent ribs and the open inner edge before increasing the bend or member width.

::example[crescent-pavilion]

## Crescent pavilion wide

The second pavilion keeps the same design identity, geometry stages, and base scene. It changes span to 8 m, crown height to 3.3 m, and plan curvature to 1.6 rad. Compare the lower, wider opening and tighter curve with the first study through the same camera.

::example[crescent-pavilion-wide]

Save these values as `pavilion-values.json`:

```json
{ "span": 8, "rise": 3.3, "bend": 1.6 }
```

Create a new design revision:

```sh
slopcamera scene design set examples/showcase/parametric/crescent-pavilion/design.json \
  --parameters pavilion-values.json \
  --output artifacts/slopcamera/generated/pavilion-wide.design.json --json
```

Compile that revision into a new directory using the original `base.scene.json`, then render its `render.json`. The dependent plinth, ribs, and ties regenerate together. Keep the earlier source and compiled bundle for comparison. If you need to preserve overrides on generated parts, compile against the previous `scene.json` and retain the design and stage identities; the [design reference](https://github.com/hraness/slopcamera/blob/63a0e3eed460fa80f1ae76983e9152c75a124392/docs/parametric-design.md) describes those merge rules.

## Spiral stair

The stair combines stone treads, slender bronze balusters, continuous handrails, and a central support. Its controls include 6 m height, 2.25 m outer radius, 0.55 m inner radius, and 1.25 turns. Check the tread rhythm and the relation between the rails and landings when changing height or turns.

::example[spiral-stair]

Use the files in `examples/showcase/parametric/spiral-stair/` with the same inspect, compile, and render sequence. Choose a fresh output directory such as `artifacts/slopcamera/generated/stair-v1`.

## Ribbed tower

Forty bronze ribs surround 13 recessed floor plates and an opaque central core. The retained source is 16 m high, with a 3.25 m radius and a 1.35 rad twist. Height, radius, taper, belly, and rib radius alter the generated envelope. Check the full silhouette and the gaps between ribs through the hero and detail cameras.

::example[ribbed-tower]

The source pair is in `examples/showcase/parametric/ribbed-tower/`. Keep the camera and lighting fixed when comparing a dimensional edit so the changed silhouette remains easy to judge.

## Modular bookshelf

Walnut shelves and uprights form five bays and four rows, with alternating terracotta backs, books, and a separate ceramic piece. The retained dimensions are 4.8 m wide, 2.7 m high, and 0.42 m deep, with 0.042 m board thickness. Inspect the bay spacing and board proportions when changing the width or bay count.

::example[modular-bookshelf]

The source pair is in `examples/showcase/parametric/modular-bookshelf/`. Its named geometry stages keep the shelves, dividers, backs, plinth, books, and ceramic distinct.

## Compare candidates before selecting

For a bounded comparison, save `pavilion-variants.json`:

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

```sh
slopcamera scene design gallery examples/showcase/parametric/crescent-pavilion/design.json \
  --variants pavilion-variants.json \
  --scene examples/showcase/parametric/crescent-pavilion/base.scene.json \
  --output-dir artifacts/slopcamera/generated/pavilion-options --json
```

The gallery compiles separate source and geometry bundles for up to six candidates. Render each candidate's `scene.json` and `render.json` through the same camera before selecting a result. A compilation receipt binds inputs and outputs; it does not replace inspection of the rendered image.

The [original study sources](https://github.com/hraness/slopcamera/tree/6d53343b13fbc507bc3b25eb7453008e38ff93e9/examples/design) are MIT-licensed Slopcamera examples. These are visual design studies; their dimensional constraints do not certify structural strength, code compliance, or fabrication tolerances. Use [native film tools](/docs/how-to/native-films) when you need Blender shading or native CadQuery operations. The design compiler does not execute Grasshopper `.gh` definitions or import Rhino `.3dm` files directly.

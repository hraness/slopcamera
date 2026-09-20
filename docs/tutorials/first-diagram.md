# Create and revise your first diagram

Make a two-node flow, inspect its light and dark exports, then change a label by editing its source. This lesson uses the released Slopcamera CLI and needs no account, paid model, browser, or tldraw installation.

Before starting, [install Slopcamera](../../README.md#install-slopcamera) so the `slopcamera` command is available. Use a new empty working directory so the lesson cannot replace existing artwork.

## Create the source

```sh
mkdir slopcamera-first-diagram
cd slopcamera-first-diagram
slopcamera diagram init first.diagram.json
```

Open `first.diagram.json`. Its two shapes are named `source` and `result`, labeled **Source** and **Result**, with one directed edge. Their horizontal stack supplies the spacing; the file remains the editable source.

## Check and render it

```sh
slopcamera diagram check first.diagram.json --strict
slopcamera diagram render first.diagram.json
```

The strict check should report no findings. Rendering uses the document's `name`, `example-flow`, for its export filenames. It creates these five files beside the JSON:

- `example-flow.tldr`
- `example-flow.light.svg` and `example-flow.dark.svg`
- `example-flow.light.png` and `example-flow.dark.png`

Open both PNG files. You should see the same two boxes and connecting arrow on backgrounds suited to light and dark presentation. The `.tldr` file is editable interchange; you do not need to open it to complete the lesson.

## Change one label

In `first.diagram.json`, find the shape whose `id` is `result`. Change only its `label` from `"Result"` to `"Reviewed"`, then save the file.

```sh
slopcamera diagram check first.diagram.json --strict
slopcamera diagram render first.diagram.json
```

Open the PNG again. The right-hand box now reads **Reviewed**. The render command replaced the five exports while keeping your JSON source. Editing a PNG directly would not have preserved that relationship.

You now have one editable source and five derived outputs. For your own diagram, change the labels, shapes and relationships in that source. Use [visual communication guidance](../../skills/slopcamera/references/visual-communication.md) when the relationships become more complex, or [SDK surfaces](../reference/sdk.md) when a script should check and render it.

## Try a larger diagram

The [source-to-film example](../../examples/showcase/diagram/README.md) shows three media inputs converging in a project, then branching into preview and delivery. Its second source changes “Delivery” to “Social delivery” while preserving layout and connectors. The [online lesson](https://slopcamera.com/docs/tutorials/first-diagram#try-a-larger-diagram) includes both rendered examples and all five native exports. This is a separate positioned diagram; the two-node lesson above uses a coordinate-free stack.

## Stack layout

For an ordered pipeline, let a stack position equal cards. This source lists five
steps and four explicit arrows without giving the cards `x` or `y` coordinates.
Array order controls placement; the edges still state the relationships.

[View the stack pipeline](https://slopcamera.com/docs/tutorials/first-diagram#stack-layout).

The diagram describes a working sequence. Its check and review cards do not run
an automatic scheduler. Download either theme or the editable canvas, or use the
[source recipe](https://github.com/hraness/slopcamera/tree/main/examples/showcase/diagram/production-pipeline)
to render both versions from a checkout with locked dependencies.

## Custom fonts and icons

Keep the graph and change its presentation. The second source retains all five
labels, the four arrows and every card dimension. Its configuration supplies
warm light and ink dark palettes, local Nebula Sans Bold files and five original
line icons. The first version uses Book labels without icons.

[View the styled pipeline](https://slopcamera.com/docs/tutorials/first-diagram#custom-fonts-and-icons).

SVG and PNG preserve the chosen font and palette. The editable canvas preserves
the cards, labels, bound arrows and movable icons, but uses tldraw's own named
font and color styles. The recipe records font and icon provenance; no external
font service or paid model is required.

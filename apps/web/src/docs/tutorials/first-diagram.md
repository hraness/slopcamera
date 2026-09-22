This lesson needs no account, paid model, or browser: a diagram renders entirely on your machine. Before starting, install Slopcamera so the `slopcamera` command is available. Use a new empty working directory so the lesson cannot replace existing artwork.

```sh
mkdir slopcamera-first-diagram
cd slopcamera-first-diagram
```

## Create the source

```sh
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

## Try a larger diagram

This separate example applies the same source-and-revision pattern to a branching flow. Three kinds of media enter a project, then leave as a preview or delivery. Its positions and colors distinguish inputs, the project, and outputs; labels and arrows preserve the meaning without color.

::example[source-to-film]

Download the diagram source above and save it as `source-to-film.diagram.json`, then check and render it with the installed CLI:

```sh
slopcamera diagram check source-to-film.diagram.json --strict
slopcamera diagram render source-to-film.diagram.json
```

The revised source changes “Delivery” to “Social delivery” while preserving the positions, connectors, and other labels. Compare both light outputs and check the dark exports for contrast.

::example[source-to-film-revised]

The diagram illustrates media relationships. Importing arbitrary source files does not create a new Slopcamera project; [editing and delivery](/docs/how-to/edit-video) explains the supported entry paths.

## Stack layout

For an ordered pipeline, let a stack position equal cards. This source lists five
steps and four explicit arrows without giving the cards `x` or `y` coordinates.
Array order controls placement; the edges still state the relationships.

::example[production-pipeline]

The diagram describes a working sequence. Its check and review cards do not run
an automatic scheduler. Download either theme or the editable canvas, or use the
[source recipe](https://github.com/hraness/slopcamera/tree/main/examples/showcase/diagram/production-pipeline)
to render both versions from a checkout with locked dependencies.

## Custom fonts and icons

Keep the graph and change its presentation. The second source retains all five
labels, the four arrows and every card dimension. Its configuration supplies
warm light and ink dark palettes, local Nebula Sans Bold files and five original
line icons. The first version uses Book labels without icons.

::example[production-pipeline-themed]

SVG and PNG preserve the chosen font and palette. The editable canvas preserves
the cards, labels, bound arrows and movable icons, but uses tldraw's own named
font and color styles. The recipe records font and icon provenance; no external
font service or paid model is required.

## What you learned

You now have one editable source and five derived outputs. This is the pattern behind every Slopcamera workflow: keep the source, re-render the derivatives, and let your agent inspect or revise either.

- For your own diagram, change the labels, shapes, and relationships in that source.
- To give an agent this workflow, install the Agent Skill with `{{SKILL_INSTALL_COMMAND}}`.
- When a script should check and render diagrams, use the [SDK surfaces](/docs/reference/sdk).
- To see what else the installed host can do, run `{{DOCTOR_COMMAND}}` and read the [capability reference](/docs/reference/capabilities).

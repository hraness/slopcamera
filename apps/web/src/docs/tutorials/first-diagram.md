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

## What you learned

You now have one editable source and five derived outputs. This is the pattern behind every Slopcamera workflow: keep the source, re-render the derivatives, and let your agent inspect or revise either.

- For your own diagram, change the labels, shapes, and relationships in that source.
- To give an agent this workflow, install the Agent Skill with `{{SKILL_INSTALL_COMMAND}}`.
- When a script should check and render diagrams, use the [SDK surfaces](/docs/reference/sdk).
- To see what else the installed host can do, run `{{DOCTOR_COMMAND}}` and read the [capability reference](/docs/reference/capabilities).

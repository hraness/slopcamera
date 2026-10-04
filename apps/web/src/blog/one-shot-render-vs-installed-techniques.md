An eight-second title animation can start with an HTML page, a browser capture script and an FFmpeg command. A coding agent can assemble that pipeline when the required tools are available. The next request tests how well it was put together: change the title, make a dark version, or fit the same film into a vertical frame.

A reusable renderer lets those requests change the creative source while keeping capture and export code in one place. SlopCamera provides that renderer through installed commands. The examples below show the source edits behind specific gallery revisions and the files those commands produce.

## Keep the rendering pipeline reusable

A custom script and an installed framework can both be saved, tested and used again. The choice is who maintains the renderer. With a custom pipeline, your project owns capture, export and validation alongside the scene. With SlopCamera, those steps live in the CLI; the project keeps the scene and its assets.

For a title revision, the agent can edit a parameter and run the same command. It still needs to read the file format and inspect the result, but it does not have to rewrite the encoder or frame-capture loop.

[Remotion](https://www.remotion.dev/docs/ai/skills) and [HyperFrames](https://hyperframes.heygen.com/guides/skills) also supply agent skills for code-based video work. The useful comparison is whether a framework's source formats and checks fit the work you need to repeat. These examples use SlopCamera's source formats.

## Revisions and variants from the same source

The [gallery recipes](https://github.com/hraness/slopcamera/tree/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase) keep the editable source alongside each result. Use them to trace a revision from its changed fields to the formats it produces.

| Example | Editable source | What changes | Output |
| --- | --- | --- | --- |
| Diagram label | Diagram JSON | Label and diagram name | tldraw, light/dark SVG and PNG |
| Title animation | HTML page and scene request | Title variant and accent color | MP4 and an editable project |
| Pavilion dimensions | Parametric design and values | Span, rise and bend | Scene geometry and a rendered PNG |
| Aspect ratios | Edit and title-frame layouts | Canvas, framing and title positions | One MP4 per format |

### Rename one box in a diagram

The [source-to-film diagram](https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/diagram/README.md) shows media entering a project and leaving as a preview or a delivery. Its JSON source names each shape, label and arrow. The revision changes the label "Delivery" to "Social delivery" and the diagram's name.

```sh
slopcamera diagram check \
  examples/showcase/diagram/source-to-film-revised.diagram.json --strict
slopcamera diagram render \
  examples/showcase/diagram/source-to-film-revised.diagram.json \
  --out-dir artifacts/showcase/diagram
```

The render writes an editable tldraw file, light and dark SVG, and light and dark PNG. Both themes come from the same edit. The post on [editable diagrams with coding agents](/blog/editable-diagrams-with-coding-agents) walks through this loop in detail.

### Change the copy and color of a title animation

The [editorial title](https://github.com/hraness/slopcamera/tree/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/html) is an HTML page with an animated field of SVG ellipses. Start with `slopcamera html scaffold plain --output editorial.html`, then build the title in that page. A scene request names the page, canvas, timing and parameters.

The page reads two parameters: `accent`, which colors the title and the ellipses, and `variant`, which swaps the title text. The revision is a second scene file with a new name and those two values set. The HTML page does not change.

```sh
slopcamera html render \
  --input examples/showcase/html/editorial-revised.json --dry-run --json
slopcamera html render \
  --input examples/showcase/html/editorial-revised.json --json
```

The dry run checks the source and its size limits without opening a browser. The render returns a 1280 × 720 H.264 MP4 and an editable project that holds it. It then verifies the frame count, size, and duration: 192 frames over 8 seconds at 24 frames per second.

### Widen a pavilion without redrawing it

The [crescent pavilion](https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/parametric/crescent-pavilion-wide/README.md) is a timber structure built from rules: a span, a crown height, a plan curvature, and rib sizes. The agent does not write its geometry. One command writes the design from a template:

```sh
slopcamera scene design init pavilion --template crescent-pavilion --json
```

To make the wider version, the agent writes a values file, `{ "span": 8, "rise": 3.3, "bend": 1.6 }`, and runs:

```sh
slopcamera scene design set pavilion/design.json \
  --parameters pavilion-values.json --output pavilion-wide.design.json \
  --json
```

Those three values change the structure without requiring the agent to edit generated geometry. Two more commands turn the design into a picture:

```sh
slopcamera scene design compile pavilion-wide.design.json \
  --scene pavilion/base.scene.json \
  --output-dir artifacts/showcase/pavilion-wide --json
slopcamera scene render artifacts/showcase/pavilion-wide/scene.json \
  --request artifacts/showcase/pavilion-wide/render.json --json
```

Compilation produces the scene, geometry and render request. Rendering produces the PNG. The gallery compares the original and wider pavilion from the same camera, so the change in proportions is easy to inspect. The linked recipe shows how the parameters connect to the design.

### Cut one film into four formats

The [four-ratio edit](https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/edit/README.md) turns one product film into landscape, portrait, square and 4:5 versions. Each format has its own canvas, camera zoom and title layout. The input film comes from the repository's Blender recipe.

This example uses an authored script because each crop has a different composition. Adding a format means adding its dimensions and zoom to the edit, laying out its title frame, and reviewing the result. The linked recipe lists the scripts and runtime requirements. For a simpler crop, the `social-variants` workflow renders landscape, square and vertical versions of one project without an authored script.

## What the commands check

SlopCamera checks the source before rendering and verifies supported output properties afterward. These checks give the agent concrete errors it can repair:

- `slopcamera diagram check` stops with exit code 1 and a message when the file is invalid, such as a stack wider than its canvas. With `--strict`, a layout finding, such as a label likely to overflow its box, sets exit code 2.
- `scene design set` enforces the template's limits. Asking for a 9-meter span stops with `Parameter span must be between 4 and 8.` and writes nothing.
- `html render --dry-run` checks the scene and its size limits before a browser starts, and a full render verifies the frame count, size, and duration of the MP4 it wrote.

None of these checks say whether the result looks good. Someone still has to watch the video and open the PNG.

## When a custom pipeline fits better

- **The existing tool already does the job.** A chat tool with built-in image generation or a renderer already available in your project may be enough for a one-off result.
- **You need a format or renderer outside SlopCamera's scope.** Keep the custom pipeline where its extra control matters. The [techniques reference](/docs/reference/techniques) lists supported work and examples.
- **You cannot add local dependencies.** Use a tool available in that environment. Local SlopCamera commands require their documented runtimes; a hosted chat service supplies its own execution environment.

## What installing costs

An agent skill adds instructions to the agent's context. [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) exposes a name and description for discovery, then loads the skill instructions when needed. SlopCamera's skill points to separate references for individual techniques. The agent runs the CLI and reads what it prints; it does not need to read or write the renderer's code.

Your agent also has to learn a file format. The diagram file, the HTML scene file, and the design values are small, but they are SlopCamera's formats, and the agent reads examples or references before writing them.

## Make a first revision

Start with the [installation guide](/docs), then open a linked gallery recipe and make one small change. Keep the source and exported files together so the next revision starts from the same project. Compare the result at its intended size and check that the parts you meant to preserve stayed consistent.

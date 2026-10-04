A service gets renamed, and its architecture diagram needs a new label in the light theme, dark theme and exported images. Keeping one editable source lets the agent make that change once and regenerate each format. It also gives the checker a place to catch a label that no longer fits.

SlopCamera uses a small JSON file as the diagram's source. The agent writes and edits that file. The `slopcamera` command checks it and renders the exports: a tldraw file, light and dark SVG, and light and dark PNG. A later change is a one-line JSON edit and a new render.

## Write the diagram as source

A SlopCamera diagram is a `.diagram.json` file. It names the shapes, their labels and sizes, the arrows between them, and a layout. This source describes a four-step checkout path:

```json
{
  "version": 1,
  "name": "checkout-architecture",
  "canvas": { "width": 1400, "height": 360, "padding": 64 },
  "layout": { "type": "stack", "direction": "horizontal", "gap": 140, "align": "center" },
  "shapes": [
    { "id": "web", "type": "rect", "width": 200, "height": 140, "label": "Web app" },
    { "id": "api", "type": "rect", "width": 200, "height": 140, "label": "Checkout API" },
    { "id": "queue", "type": "rect", "width": 200, "height": 140, "label": "Order queue" },
    { "id": "db", "type": "rect", "width": 200, "height": 140, "label": "Orders DB" }
  ],
  "edges": [
    { "id": "web-api", "from": "web", "to": "api" },
    { "id": "api-queue", "from": "api", "to": "queue" },
    { "id": "queue-db", "from": "queue", "to": "db" }
  ]
}
```

The `stack` layout places the boxes in array order with a fixed gap, so the file has no `x` or `y` coordinates to drift. Each shape has a stable `id`, which the edges refer to. A diagram with branches can use explicit positions instead; the [diagram format reference](/docs/reference/diagram-format) covers both forms.

Keep this file in the repository, next to the page that uses it or in a `diagrams/` directory. The SlopCamera skill follows the repository's existing layout and otherwise puts new sources at `diagrams/<slug>.diagram.json`. Treat everything rendered from the source as generated output.

## Check before you render

```sh
slopcamera diagram check checkout.diagram.json --strict
```

The check does two things. First it validates the file. A shape `tone` outside the seven supported names (neutral, blue, orange, green, red, purple, yellow), or a stack wider than the canvas, stops with exit code 1 and a message that names the problem. For example, a 1280px canvas with a 120px gap is too narrow for these boxes:

```text
slopcamera: Invalid stack layout:
- horizontal stack needs 1160px but only 1152px remain inside 64px padding
```

Then it lints the layout for problems a reader would notice. The lint checks cover labels longer than 32 characters, arrow labels longer than 24 characters, boxes smaller than 120 by 64 pixels, text that likely overflows its box, boxes that sit outside the canvas, arrows shorter than 96px, two arrows sharing one connector point, and more than nine primary shapes. The overflow check estimates text width from label length and font size; it does not measure the rendered text. With `--strict`, any finding sets exit code 2. Without `--strict`, the check prints its findings and still exits 0. Changing the second label to "Checkout API and payment session handler" produces:

```text
[long-label] api has a 40-character label; prefer a short noun phrase
```

That exit code is what makes the loop work for an agent. It can edit the JSON, run the check, read the finding, and edit again until the check is clean, without anyone opening an image. The same exit codes let you run the check in continuous integration. If CI runs it with `--strict` on each diagram source, a pull request that fails the check, including an estimated label overflow, fails the build.

## Render the exports

```sh
slopcamera diagram render checkout.diagram.json
```

The render uses the document's `name` for its filenames and writes five files beside the source:

- `checkout-architecture.tldr`
- `checkout-architecture.light.svg` and `checkout-architecture.dark.svg`
- `checkout-architecture.light.png` and `checkout-architecture.dark.png`

The light and dark versions come from the same source, so a docs site that switches themes shows the same diagram in both. The `.tldr` file opens in [tldraw](https://tldraw.dev) if someone wants to sketch on top of it. SlopCamera writes that file but does not read it back, so changes made in tldraw do not reach the JSON. Make lasting changes in the source.

To keep several diagrams consistent, put a `slopcamera.config.*` file beside the sources, or pass one with `--config`. It sets the font, named icons, and light and dark theme colors the diagrams render with. A JSON config is only read as data. A TypeScript or JavaScript config runs as code with your user's access.

## Change one label

When the orders database moves to Postgres, the whole revision is one line:

```diff
-    { "id": "db", "type": "rect", "width": 200, "height": 140, "label": "Orders DB" }
+    { "id": "db", "type": "rect", "width": 200, "height": 140, "label": "Postgres" }
```

Run the check and render again. All five exports are replaced, and the other three boxes, the arrows, and the spacing stay where they were because nothing in the source moved them. Keep the font and rendering environment fixed when byte-identical output matters. Different fonts or rendering libraries can change the exported bytes.

For each revision, the agent reads the JSON, changes a field and runs the check and render commands. The layout rules, the lint checks, and the light and dark variants are handled by the CLI instead of being redone in each reply.

## Use Mermaid for diagrams read on GitHub

[Mermaid](https://mermaid.js.org/) diagrams are text inside a Markdown code block, and [GitHub renders them](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) in issues, pull requests, discussions, wikis, and Markdown files. For a sequence diagram in a pull request description, or a flowchart in a README that should update whenever someone edits the Markdown, Mermaid is simpler. There is nothing to install, nothing to render, and the diff a reviewer sees is the diagram's source. Many documentation site generators render Mermaid blocks too.

SlopCamera adds four things. Shape sizes, gaps, and order come from the source file. The light and dark PNG and SVG files are built ahead of time, so they work where no Mermaid renderer runs, such as slides, social images, and email. One config file sets the font, icons, and theme for many diagrams, and each render also writes a tldraw file.

Generated files add storage and review work. The default SVGs embed their fonts, which can account for much of their size. Review the JSON diff for the intended change, then inspect the rendered image at its final display size.

## Use it from an agent

Install SlopCamera and its agent skill:

```sh
{{ARCHIVE_INSTALL_COMMAND}}
{{SKILL_INSTALL_COMMAND}}
```

For Claude Code, install the skill with `{{SKILL_INSTALL_COMMAND_CLAUDE}}` instead; the [Claude Code tutorial](/docs/tutorials/claude-code) covers that setup.

The skill tells the agent to look for an existing `.diagram.json` on the same subject before creating a new one, to update that source rather than edit a generated image, and to keep labels to a few words. Agents that use MCP instead of a shell can run the same two steps with the `check_diagram` and `render_diagram` tools. Those tools use the built-in icons and themes and do not read a `slopcamera.config.*` file, and the check returns its findings instead of an exit code. The [first diagram tutorial](/docs/tutorials/first-diagram) walks through the same loop with the starter file from `slopcamera diagram init`. The [techniques reference](/docs/reference/techniques#diagrams-and-drawings) lists the other diagram techniques, and [Why SlopCamera](/docs/explanation/why-slopcamera) explains why the agent writes source instead of drawing.

## What the checker does not catch

The linter checks geometry, not meaning. It cannot tell whether an arrow points the right way or whether a box should exist. Someone still needs to look at the rendered PNG before it ships. The diagram format covers rectangles, ellipses, text, lines, and labeled arrows, with optional icons; it is not a general drawing tool, and a diagram with more than nine primary shapes draws a lint finding that suggests a higher-level view.

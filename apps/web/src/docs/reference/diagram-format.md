A `.diagram.json` file is Slopcamera's editable diagram source: a version-one JSON document that checks, renders, and stays authoritative while its rendered exports remain replaceable. The public schema lives at `schema/diagram.schema.json` in the repository, and the format needs no tldraw installation, account, or network.

## Two source forms

The schema accepts two document shapes and resolves both to the same positioned form before rendering:

- A positioned diagram gives each shape an `x` and `y`, a `width` and `height`, a `type` of `rect` or `ellipse`, a `tone`, optional `opacity`, `radius`, and label rows with explicit size, family, and weight. Edges carry their own direction and labels.
- A stack diagram omits coordinates entirely. Array order positions equal cards, and explicit edges still state the relationships, which suits ordered pipelines and processes a reader edits by list, not by canvas.

`slopcamera diagram init <name>.diagram.json` writes a minimal valid source and never overwrites an existing file. The document's `name` field supplies the export stem.

## The five exports

```sh
slopcamera diagram check first.diagram.json --strict
slopcamera diagram render first.diagram.json
```

One render writes five same-stem outputs beside the source:

- `<name>.tldr`, an editable interchange file for tldraw-compatible tooling
- `<name>.light.svg` and `<name>.dark.svg`
- `<name>.light.png` and `<name>.dark.png`

Rendering again replaces the five derived files while the JSON source survives untouched. Editing a label means editing the source and re-rendering, which keeps the diagram and its exports connected instead of producing an orphan image. [Create and revise your first diagram](/docs/tutorials/first-diagram) walks that loop.

## Check findings

`slopcamera diagram check` lists layout problems as findings. Each finding has a code, a message and the shape IDs it concerns. Without `--strict` the command reports them and succeeds; with `--strict` any finding fails the check.

| Code | Reported when |
| --- | --- |
| `tall-aspect` | The canvas is more than 1.5 times taller than wide. Lay the flow out horizontally, about two to three times wider than tall, or fold a longer sequence into two rows instead of a vertical tower. Introduced in v3.11.0. |
| `outside-canvas` | A box extends past the canvas edge. |
| `long-label` | A box label or label row is longer than 32 characters. |
| `label-overflow` | A box's label rows and icon do not fit inside it. |
| `small-target` | A box is narrower than 120 px or shorter than 64 px. |
| `too-many-elements` | The diagram has more than nine boxes. |
| `short-arrow` | A connector is shorter than 96 px. |
| `long-edge-label` | A connector label is longer than 24 characters. |
| `shared-edge-port` | Two connectors start or end at the same point on one box. Give them distinct `startPosition` or `endPosition` values. |

## Configuration

A `slopcamera.config.*` file beside the source extends what the renderer draws: a configured font with local files, named icon bodies as sanitized SVG geometry, and light and dark theme overrides. A JSON config is inert data; a TypeScript or JavaScript config is imported as trusted workspace code and evaluates as your current user.

Since v3.3.5, `diagram sheets` compiles a source into patent-style monochrome drawing sheets with physical margins and a PDF.

## Bounds

The CLI renders a checked source deterministically. The MCP tools add bounded envelopes: `check_diagram` and `render_diagram` accept a `.diagram.json` up to 1 MiB with at most 64 shapes and 128 edges, return at most 40 findings, and cap `render_diagram` at scale 4 and a scaled canvas of 16,777,216 pixels. [The MCP toolset](/docs/reference/mcp-tools) lists the rest of that surface.

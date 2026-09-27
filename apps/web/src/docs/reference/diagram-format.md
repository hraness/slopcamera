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

## Configuration

A `slopcamera.config.*` file beside the source extends what the renderer draws: a configured font with local files, named icon bodies as sanitized SVG geometry, and light and dark theme overrides. A JSON config is inert data; a TypeScript or JavaScript config is imported as trusted workspace code and evaluates as your current user.

Since v3.3.5, `diagram sheets` compiles a source into patent-style monochrome drawing sheets with physical margins and a PDF.

## Bounds

The CLI renders a checked source deterministically. The MCP tools add bounded envelopes: `check_diagram` and `render_diagram` accept a `.diagram.json` up to 1 MiB with at most 64 shapes and 128 edges, return at most 40 findings, and cap `render_diagram` at scale 4 and a scaled canvas of 16,777,216 pixels. [The MCP toolset](/docs/reference/mcp-tools) lists the rest of that surface.

# Compose and render vector icon scenes

Use this workflow when the user wants a deterministic vector icon, a small
composed scene of icons, or a drawn construction program, without a model or a
network request. Slopcamera bundles the icon.place library at one exact version
for this. For a generated product mark or topic icon from a text brief, use
[brand illustrations](brand-illustrations.md) instead.

## Pick a source

Both commands read one local JSON file of at most 1 MiB. The kind is detected
from its content:

- A **scene**: up to eight placed icons with a canvas and a background.
- A **collection**: up to six layered icons that compose into one scene.
- A **construction program**: parts, operations and a drawing recipe that
  compile to one drawing.
- A **recipe** that an earlier render wrote. A recipe records the source, the
  render settings and the output digests.

Keep the source in the workspace as the authoritative file. The SVG is a
replaceable derivative.

## Compose

`compose` parses and solves the source and reports its digests, element count
and diagnostics. It writes nothing unless `--output` names a `.json` file for the
canonical solved document:

```sh
slopcamera image icon compose icons/window.json --json
slopcamera image icon compose icons/window.json --output icons/window.solved.json
```

Composing a solved document again gives the same digests. Report any
diagnostics; they are the library's own layout findings.

## Render

`render` draws the source to an inert SVG. `--recipe` also writes a replayable
recipe:

```sh
slopcamera image icon render icons/window.json --output icons/window.svg \
  --recipe icons/window.recipe.json --size 256 --palette ink
```

- `--size` sets the output edge from 16 to 1024 pixels.
- `--palette` (`original`, `ink`, `earth` or `night`) applies to scenes and
  collections. `--background` paints the paper behind any source.
- `--language` selects one of the drawing languages for a construction program,
  such as `outline`, `woodcut` or `stipple`. `slopcamera help image` lists them.

To reproduce an icon, render its recipe. A recipe fixes its own settings, so do
not pass `--size`, `--palette`, `--background` or `--language` with it. Replay
fails if the recipe was edited after it was written or if the drawing no longer
matches the recorded digests; report that instead of re-rendering from scratch.

The same renders are available as the `compose_icon` and `render_icon` MCP
tools with root-relative paths, and as the `slopcamera.icon.compose` and
`slopcamera.icon.render` operations.

## Checks

- The output is a path-only SVG. Scripts, styles, images, event handlers,
  external references and foreign content are rejected before anything is
  written.
- Source, output and recipe must be three different files. Existing outputs are
  replaced atomically.
- Receipts record the source digest, the solved and SVG digests, and the
  library version. Keep the receipt when provenance matters.
- Inspect the SVG at its intended size. A clean render is not evidence that
  the icon communicates the intended idea.

For diagram icons from a third-party icon package, keep using a local adapter as
described in [customization](customization.md).

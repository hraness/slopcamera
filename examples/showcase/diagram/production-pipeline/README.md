# A production pipeline, with and without a house style

These two original diagrams explain a simple working sequence: **Author →
Check → Render → Review → Deliver**. Review is a human inspection of the
exports. The arrows describe a useful order of work; they do not invoke an
automatic scheduler or claim that a successful check guarantees good artwork.

Both sources use a vertical `stack` on a 720×1232 canvas. Their five equal cards have no authored
`x` or `y` coordinates. Array order determines placement; the four explicit
edges determine relationships. The 96 px gap leaves each arrow visible at the intended display size.
Only the delivery card uses a second color role, which is also named in text.

| Source | Treatment |
| --- | --- |
| `production-pipeline.diagram.json` | Default light/dark palette; Book labels; no icons. |
| `production-pipeline-themed.diagram.json` | Warm light and ink dark palettes; Bold labels; five original line icons. |

The two sources preserve the same labels, edges, card dimensions and semantic
color roles. The custom config retains Nebula Sans rather than introducing a
different font family. Explicit local font files demonstrate the font adapter,
and the Book-to-Bold change provides a visible typography comparison.

## Reproduce the exports

Use a [source installation](../../../../docs/how-to/use-current-source.md)
with its locked dependencies and Bun 1.3.14. From the repository root:

```sh
bun examples/showcase/diagram/production-pipeline/render.ts
```

The recipe checks both sources for zero lint findings, verifies their geometry
and relationships match, and renders five exports for each: light/dark SVG,
light/dark PNG, and editable tldraw. It writes to a fresh directory beneath
`artifacts/showcase/diagram/production-pipeline-*`, then records every source
and export hash in `receipt.json`. Existing exports are preserved. No account,
browser, Blender, FFmpeg, or model call is needed.

For the equivalent individual CLI commands, run from this directory:

```sh
slopcamera diagram check production-pipeline.diagram.json --config baseline.config.json --strict
slopcamera diagram render production-pipeline.diagram.json --config baseline.config.json --scale 1
slopcamera diagram check production-pipeline-themed.diagram.json --config themed.config.json --strict
slopcamera diagram render production-pipeline-themed.diagram.json --config themed.config.json --scale 1
```

The individual CLI commands write beside the source and replace that source's
named derivatives. Keep the configs beside the JSON and preserve their relative
font paths. Inspect both themes at full size and at the intended display size.
The SVG and PNG retain the custom palette and font treatment. Editable tldraw
uses its own named color/font styles and separate movable icon assets; it is
semantic interchange, not a pixel-identical copy of the SVG.

## Font and icon provenance

All five `pipeline-*` icon paths in `themed.config.json` were authored for this
example. They share a 24-unit view box, 1.5-unit stroke, round caps and joins,
and `currentColor`. They use no external icon package. The source, icon paths,
and derivative artwork are covered by the repository's MIT license.

The unmodified Nebula Sans 1.010 Book and Bold faces come from the repository's
[font directory](../../../../src/assets/fonts/nebula-sans/PROVENANCE.md) under
the [SIL Open Font License 1.1](../../../../src/assets/fonts/nebula-sans/LICENSE.txt).
The config embeds WOFF2 in SVG and supplies OTF to the PNG renderer. The recipe
records all four font file hashes and the license/provenance file hashes. No
commercial or system-discovered font is required for the authored labels.

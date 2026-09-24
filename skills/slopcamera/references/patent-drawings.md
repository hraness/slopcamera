# Prepare patent-style drawing sheets

Use `diagram sheets` for local monochrome vector drawing sheets with physical
page dimensions. The commands ship in Slopcamera v3.3.5 and later. Confirm
`slopcamera help diagram` lists them. If they are absent, the installed CLI is
older: follow [installation](install.md) to update it rather than inventing a
flag on ordinary diagram rendering.

## Preserve the authored content

Find the existing `.drawing.json` first. It is the authority for labels,
reference numerals, geometry, relationships, and sheet order. Never infer an
invention, assign a component's reference numeral, or expand a claim while
changing its presentation. Keep private drawings and terminology out of public
examples and remote services.

The version-one drawing document contains `name`, `paper: "a4" | "us-letter"`,
an optional metadata-only `title`, and `sheets`. Each sheet has a consecutive
`figure` number beginning at one and an ordinary version-one `diagram` object.
There is one figure per sheet.

```sh
slopcamera diagram sheets init sensor-control.drawing.json --json
slopcamera diagram sheets check sensor-control.drawing.json --json
slopcamera diagram sheets render sensor-control.drawing.json --out-dir drawings --json
```

Run `init` only for new source; it refuses an existing destination. Rendering
returns artifact paths for the document-name PDF, per-sheet SVGs, and drawing
receipt. Retain the JSON and receipt. Make revisions in the source and rerender.

## Fit and review the sheets

Coordinates and font sizes use points. The profile does not scale artwork to
fit. It uses one bundled outlined font, black strokes, a white page, and explicit
physical bounds. Uppercase ASCII letters and digits must have at least 3.2 mm of
visible height. Custom fonts, monospace roles, icons, color, and transparency are
outside this profile. Authored text is limited to 18 pt; sheet and figure numbers
use 20 pt. Preserve authored meaning when shortening labels or repositioning
elements.

Inspect every SVG and PDF sheet at full size and two-thirds size. Check labels,
connectors, reference-numeral consistency with the specification, and reading
order. Outlined text will not be selectable; inspect pixels and preserve the
source instead of treating text extraction as a visual check.

The profile follows physical constraints drawn from
[37 CFR 1.84](https://www.uspto.gov/web/offices/pac/mpep/consolidated_rules.pdf).
It uses US-style figure numbering, including omission of `FIG.` for a single
view. [PCT Rule 11](https://www.wipo.int/en/web/pct-system/texts/rules/r11) has its
own formatting requirements; A4 paper alone does not establish PCT compliance.
Report checked geometry and provenance separately from technical disclosure or
filing approval. A receipt does not establish patentability or legal compliance.

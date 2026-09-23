# Prepare patent-style drawing sheets

Render a retained drawing source as monochrome vector sheets and a multipage
PDF. This guide applies to block diagrams and flowcharts whose content you have
already chosen. Slopcamera checks its drawing profile; the result still needs
technical and filing review.

Install [Slopcamera v3.4.0](../../README.md#install-slopcamera) or use a
[source build](use-current-source.md) for the `diagram sheets` commands.
Check `slopcamera help diagram` before continuing. Rendering runs locally
without a browser, model, account, or network request.

## Create or open the drawing source

Work in a project directory outside the Slopcamera checkout. Preserve an existing
same-subject `.drawing.json` rather than recreating its content.

For a new drawing, create a starter:

```sh
slopcamera diagram sheets init sensor-control.drawing.json --json
```

The command refuses to overwrite an existing file. Open the JSON. The starter
uses `name: "sensor-control"` and two fictional sensor-and-controller views. Keep
that name for the commands below; replace its content with the labels and
relationships you intend to depict.

The version-one document contains `name`, `paper`, and `sheets`. Each sheet
contains one `figure` number and one ordinary version-one `diagram` object.
Figures run consecutively from one. Choose `"a4"` or `"us-letter"` once for the
whole document. An optional document `title` becomes metadata rather than a
visible page heading.

The separate drawing manifest preserves `.diagram.json` version one. Ordinary
`diagram render` still produces its five existing light/dark and editable-canvas
exports; use `diagram sheets render` for physical drawing sheets.

Keep a reference numeral attached to the same component in every view. Write
numerals and labels explicitly in the source. Slopcamera does not assign their
meaning or compare them with your specification.

## Fit the authored content

The drawing profile interprets diagram coordinates and font sizes in PDF points
(72 points per inch). It does not shrink content to fit a page. Existing
`.diagram.json` artwork may need explicit changes to its canvas, spacing, and
label sizes when moved into a drawing sheet.

Use short uppercase ASCII labels and ordinary punctuation. The fixed bundled
font is converted to vector outlines. Each letter and digit must have at least
3.2 mm of visible height; a nominal font size alone does not establish that.
Authored text is limited to 18 pt so the 20 pt sheet and figure numbers remain
larger. Increase the authored font size within that limit or shorten the supplied
label when a check reports undersized or overflowing text. Preserve its meaning
when editing.

Keep the artwork within the reported content area. The profile reserves top and
bottom bands inside the margins for sheet and figure numbers. It uses black
strokes on white, and rejects custom fonts, monospace roles, icons, color, and
transparency. General diagram theme settings do not customize this profile.

## Check and render

```sh
slopcamera diagram sheets check sensor-control.drawing.json --json
slopcamera diagram sheets render sensor-control.drawing.json --out-dir drawings --json
```

Repair findings in the JSON and repeat the check. Rendering uses the document's
`name`, so this source produces:

- `drawings/sensor-control.pdf`, containing all sheets.
- `drawings/sensor-control.sheet-001.svg`, followed by one SVG for each later sheet.
- `drawings/sensor-control.drawing-receipt.json`, identifying the source, renderer,
  profile, physical measurements, and output hashes.

Rendering again replaces the derived files. Retain the JSON beside the output
directory. Text outlines preserve the rendered
glyphs without installed fonts, but they are not selectable PDF text. Make later
edits in the JSON and rerender; editing the PDF or SVG breaks the source-to-output
relationship recorded by the receipt.

## Inspect every sheet

Open the PDF and each SVG. Inspect the full-size page and a reproduction reduced
to two-thirds of its dimensions. Check that every label remains readable, every
connector reaches the intended component, and no text or leader line overlaps
another element. Compare every reference numeral and figure description with
the technical description. The receipt records identities and measured checks;
it does not establish those semantic relationships.

The physical defaults follow the drawing-sheet dimensions in
[37 CFR 1.84](https://www.uspto.gov/web/offices/pac/mpep/consolidated_rules.pdf):
A4 or US Letter, with minimum margins of 25 mm at the top and left, 15 mm at the
right, and 10 mm at the bottom. Sheet counters appear inside the usable area.
Multiple views use `FIG. 1`, `FIG. 2`, and so on; a document with one view omits
the figure label, following the US single-view rule.

For an international application, check
[PCT Rule 11](https://www.wipo.int/en/web/pct-system/texts/rules/r11) with the
receiving office's requirements. A4, sparse indispensable diagram text, blank
margins, and readability after two-thirds reduction are relevant constraints.
This renderer uses one numbering convention and does not select a jurisdiction
or implement every PCT formality.

A passing check covers the supported mechanical profile. It does not determine
whether the drawings adequately disclose an invention, introduce new matter,
meet a particular office's electronic-filing rules, or are ready to file. Keep
the source and reviewed sheets together for that final review.

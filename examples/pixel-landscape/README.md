# Make a scrolling media atelier

This example generates a tall background drawing for SlopCamera, then turns it
into square pixels with one ink color and varying opacity. The drawing follows
the product's work: images and diagrams become staged animation, 3D scenes,
and film. It is conceptual artwork for a marketing page.

Use a CLI built from this checkout. Follow the
[source installation guide](../../docs/how-to/use-current-source.md) to define
`slopcamera` against that build; these commands use development source.

## Start with a continuous landscape

[landscape-world.json](landscape-world.json) compares two native `1:4`
landscapes with studios carved into connected terrain. It uses Google's
Gemini API, two image requests and two judges. Set `GEMINI_API_KEY` or
`GOOGLE_API_KEY` in the invoking environment, then run:

```sh
slopcamera image landscape plan examples/pixel-landscape/landscape-world.json --json
mkdir -p artifacts/landscapes
slopcamera image landscape run examples/pixel-landscape/landscape-world.json \
  --output-dir artifacts/landscapes/continuous-study --allow-cloud-upload --json
```

[phone-world.json](phone-world.json) uses `1:8` with one image and one judge,
so the artwork can cover a longer narrow-screen page without stretching.
The successful studio-valley study is the strongest visually reviewed
landscape so far; it has no paid judge score and remains a draft.
[visual-review.md](visual-review.md) records the experiments and limits.

Prepaid Hraness Credits also offer prompt-only hosted images. This landscape
workflow uses Vertex or Google for generated-image continuity and judging;
see the [generation guide](../../docs/how-to/generate-media.md).

## Earlier panel and detail experiments

The following panel recipe is retained to study stitching. Its live trial
left structural gaps at the joins; start with the continuous recipe above
when large structures must span the whole page.

[slopcamera.json](slopcamera.json) compares three directions for the same world:

- **Orbital engraving:** curved observatories, suspended scene chambers, and a
  garden of faceted forms, drawn with architectural contours and sparse hatching.
- **Folded world:** layered sheets become optical instruments, hanging stages,
  and planted geometry. Fold lines and repeated shapes connect the descent.
- **Terraced atelier:** stepped towers and open theaters descend into a sculpted
  underground garden. Isometric platforms make the media-making activity visible.

Each direction uses three portrait panels: a sky observatory, suspended scene
workshops, and a subterranean render garden. A spiral rail on the left and a
faceted spine on the right continue through the joins. The middle 45% stays
open for page content. Large silhouettes and organized interior details must
remain readable after conversion to six-pixel squares.

## Plan and generate

Set `VERTEX_API_KEY` or `GOOGLE_CLOUD_API_KEY` in the invoking process. Keep the
key out of the drawing file and command arguments. Inspect the plan before
starting the paid generation:

```sh
slopcamera image landscape plan examples/pixel-landscape/slopcamera.json --json
```

The example plans nine images across three directions, followed by up to three
images refining the leading direction. It plans four judging calls and runs
up to three directions at once. Each direction builds its panels in order,
using the preceding panel's bottom strip to continue the scene.

```sh
mkdir -p artifacts
slopcamera image landscape run examples/pixel-landscape/slopcamera.json \
  --output-dir artifacts/pixel-landscape-study-01 --allow-cloud-upload --json
```

The upload flag permits sending this run's generated continuation strips and
review images to the provider. Use a fresh output directory for every run.
Failed or interrupted provider attempts remain recorded and receive no
automatic retry.

## Inspect the result

Open `gallery.png` to compare the directions and `preview.html` to inspect a
scrolling layout. The preview offers controls for direction and strength,
using the palette-checked ink. Review the image at the intended page width and inspect both joins;
a contact sheet alone can hide lost details.

Each candidate directory contains the original panels, `raster.png` for the
stitched drawing, transparent `pixels.png`, white alpha `mask.png`, and
`preview.png` flattened on the site background. `receipt.json` records the
selected candidate, file hashes, measurements, and model scores.

The judge scores product relevance, continuity, composition, and surviving
detail from zero to ten. Model acceptance requires every score to reach eight,
the mean to reach 8.5, and no blocking defect. Inspect the selected image before
using it on a page. A run marked `needs-review` keeps its outputs for further
direction.

## Process panels locally

To use drawings you already have, copy the example JSON beside the source
images and add `panels` with paths in section order:

```json
"panels": ["sky.png", "workshops.png", "garden.png"]
```

Paths resolve beside that JSON file. Processing performs no model calls:

```sh
mkdir -p artifacts
slopcamera image landscape process study.json \
  --output-dir artifacts/pixel-landscape-local-01 --json
```

The default result is 1536 × 7440 pixels: three 2736-pixel panels with two
384-pixel overlaps. `upscale` can enlarge the raster before conversion using
Lanczos interpolation; it adds no generated detail. The opacity grid expands
with hard square edges. Use `pixelSize`, `gamma`, and `alphaMax` to tune the
result, then inspect the preview again.

## Use the target site's colors

The light example takes its colors from SlopCamera's pinned Catppuccin theme.
The site selects that palette in
[index.html](../../apps/web/src/index.html), and the palette bridge provides
the computed semantic colors. The local page study also checks the dark
palette listed here. Resolve the actual tokens when applying it to a site.

| Role | Light example | Dark page study |
| --- | --- | --- |
| Background | `#eff1f5` | `#1e1e2e` |
| Primary | `#1750bf` | `#89b4fa` |
| Secondary | `#dce0e8` | `#313244` |

For another site or appearance, put its resolved colors in `theme` and run
`plan` again. Processing chooses a darker ink from the background hue and
checks separation from primary and secondary colors. The transparent mask
lets a page apply its own ink and strength; changing that ink requires another
palette check. Intermediate opacity can pass near a neutral secondary that is
close to the background; the result reports that overlap while checking
separation of the full ink. The example does not modify the live marketing site.

## Compare richer continuous drawings

[detail-study.json](detail-study.json) plans three complete native `1:4`
compositions at `4K`, using Google's `gemini-3.1-flash-image`. It compares
detailed pen engraving, shaded paper architecture, and a sculptural miniature
studio. Each direction gives the workshops distinct media-making activity
while keeping the central passage open. The page copy comes from SlopCamera's
current marketing page.

Set `GEMINI_API_KEY`, or its `GOOGLE_API_KEY` alias, in the process that invokes
the CLI. This provider reads those environment variables; it does not load a
credential file from the source checkout. Keep keys out of manifests, saved
prompts and command arguments.

```sh
slopcamera image landscape plan examples/pixel-landscape/detail-study.json --json
mkdir -p artifacts
slopcamera image landscape run examples/pixel-landscape/detail-study.json \
  --output-dir artifacts/pixel-landscape-detail-01 --allow-cloud-upload --json
```

The plan makes three image requests and three judging requests in one round.
Its per-run hard caps are six images and three judgments. It does not
automatically spend the remaining three image requests. Review the results
before planning reference-based refinements, and account for any earlier
requests in the task's remaining budget. Model usage is billed by the provider.
Use a fresh output directory and keep the retained attempt records.

This study converts the drawing to four-pixel cells with `gamma: 0.8`,
`inkContrast: 1.5`, and a quiet central width of 40%. Compare the final result
at page size. Useful detail and readable content matter more than the source
resolution or the number of drawn lines.

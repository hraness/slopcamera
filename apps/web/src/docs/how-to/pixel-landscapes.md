Use a landscape manifest to make a continuous illustrated background for a marketing page. Slopcamera compares art directions, generates a native tall composition or links portrait panels with overlap references, and converts the resulting brightness to a crisp alpha grid. The result includes detailed source art, a single-ink transparent PNG, a recolorable mask, a comparison sheet, and a local review page.

Start from `examples/pixel-landscape/landscape-world.json` in the source checkout. Set the product, scene progression, theme colors and art directions. Use the site's resolved background, primary and secondary colors, including any contrast adjustments.

```sh
slopcamera image landscape plan examples/pixel-landscape/landscape-world.json --json
mkdir -p artifacts/landscapes
slopcamera image landscape run examples/pixel-landscape/landscape-world.json \
  --output-dir artifacts/landscapes/first-pass --allow-cloud-upload --json
```

`plan` is local and read-only. It validates the palette, dimensions and request budget before generation. `run` requires a fresh output directory whose parent already exists. Every image request has a retained request record before dispatch. A failed or interrupted attempt never retries automatically; reconcile the retained attempt before authorizing another paid run.

The recommended example compares two continuous landscapes in parallel, with hard limits of two image requests and two judging requests. These count requests, not dollars; your provider bills them. Use `examples/pixel-landscape/phone-world.json` for a native `1:8` phone composition. The earlier `slopcamera.json` example explores linked panels and one planned refinement, with limits of twelve images and six judges; its live study exposed structural gaps at the joins. A second round is a new planned attempt guided by review, never a retry of a failed generation.

## Select a provider

The landscape workflow uses Vertex or Google's Gemini API because continuity references and vision judging need image inputs. Keys belong only in the process environment.

| Provider | Environment key | Native model IDs |
| --- | --- | --- |
| `vertex` | `VERTEX_API_KEY`, falling back to `GOOGLE_CLOUD_API_KEY` | Gemini IDs such as `gemini-3-pro-image` |
| `google` | `GEMINI_API_KEY`, falling back to `GOOGLE_API_KEY` | Gemini IDs |
| `openai` | `OPENAI_API_KEY` | Image IDs such as `gpt-image-1.5` |
| `gateway` | `AI_GATEWAY_API_KEY`, falling back to `VERCEL_OIDC_TOKEN` | Gateway `provider/model` IDs |

Direct Vertex uses the express-mode API-key endpoint. A project-scoped OAuth/ADC configuration is a different authentication method. The single-file command also supports explicit direct providers; Gateway remains its default:

```sh
slopcamera image generate 'An intricate orbital workshop on white' \
  --provider vertex --model gemini-3-pro-image --resolution 2K \
  --output artifacts/workshop.png --json
```

Direct OpenAI generation accepts a prompt; it does not accept the continuity references in this workflow. Direct provider credentials, response error bodies and authentication headers never enter receipts. Provider calls use fixed HTTPS endpoints and zero retries. The direct-provider selector does not change `ai` catalog commands or hosted Credits generation.

Prepaid Hraness Credits also support prompt-only hosted images through `slopcamera ai image generate --hosted`; see [Generate media](/docs/how-to/generate-media) for setup. Hosted generation accepts a model and prompt only. Use Vertex or Google for this landscape workflow's continuity references and judging.

## Review the result

Open `gallery.png` and `preview.html` from the run directory. The review page lets you compare directions and adjust display strength. It displays the fixed palette-checked ink used in the PNG. It is a local layout study with sample content, not a deployed marketing page. Check the full detailed `raster.png`, the `pixels.png` alpha output, and seams at actual page size.

The judge scores relevance, continuity, composition and retained detail. A model-qualified candidate needs every score at least eight, a mean at least 8.5 and no blocking defects. Otherwise the receipt says `needs-review`. The highest qualified candidate wins; an unqualified higher mean cannot displace it. Model scores help compare candidates but do not establish visual quality. Inspect the result before using it on a site.

## Apply a site's tint

The pixel PNG uses one darker hue related to the background. Bright source pixels become transparent; dark pixels become opaque according to `alphaMax` and `gamma`. `quietCenter` reserves a width fraction for page content, and the ends fade. All panels share one pixel grid, so seams do not reset the cells.

Slopcamera checks the opaque ink and its alpha blends against chromatic accents in OKLab. A near-background neutral secondary surface inevitably overlaps a continuous opacity ramp; the receipt reports that exception and the actual minimum distance. This keeps decorative tones from borrowing an accent's identity without promising impossible separation from every neutral surface.

Render `pixels.png` in a decorative `<img alt="" aria-hidden="true">` with `image-rendering: pixelated` and `pointer-events: none`, placed behind content. Start with opacity around 0.18 and hide the artwork under forced colors. Preserve the image's aspect ratio or use a section-aware layout; stretching changes its composition.

For runtime theme changes, draw the neutral `mask.png` into a canvas with `imageSmoothingEnabled = false`. Set `globalCompositeOperation = "source-in"` and fill the canvas with a newly palette-checked ink, then reset the operation to `"source-over"` before the next redraw. Keep the canvas decorative and apply `image-rendering: pixelated` when displaying it. Rerun palette selection for each theme: a darker variant has less available contrast when the page background is already dark.

`upscale` uses Lanczos interpolation before the pixel grid. It increases delivery dimensions, not generated detail. Nearest-neighbor expansion of the alpha grid keeps cell edges sharp.

## Process existing panels locally

Add a `panels` array to the manifest with one path per section, in order. Paths resolve beside the manifest. This command does no provider I/O:

```sh
slopcamera image landscape process local-panels.json \
  --output-dir artifacts/landscapes/local-pass --json
```

Keep the manifest and source panels beside the derived artwork. Receipts retain source and output hashes, dimensions, ink, seam measurements and warnings. Originals are never overwritten.

The optional `generation.aspectRatio` defaults to `9:16`. Processing dimensions
must match it. For a continuous tall master, use one visual section, zero overlap,
and a model that supports the requested ratio. The
`examples/pixel-landscape/continuous.json` starter uses Gemini 3.1 Flash Image,
`1:4`, and `4K`, producing a 1536 × 6144 treatment. Its optional `content` array
supplies three marketing blocks independently of the single generated image.
Section `heading` and `body` fields can also provide review-page copy.

The first live comparison found that independently generated panels can leave
large structural gaps even with continuity references. A continuous master is
useful for compositions whose major structures must span the whole page. Keep
stitched panels for sections with compatible overlap anchors.

For a small local seam defect in an existing correctly sized stitched raster:

```sh
slopcamera image landscape repair landscape.json --source raster.png \
  --output-dir artifacts/landscapes/seam-study --max-images 2 --max-judges 1 \
  --allow-cloud-upload --json
```

This adds up to two image requests and one judging request. Include them in your
exploration budget. It retains the original and bridge crops, blends only the
central repair bands with premultiplied feathering, and preserves surrounding
source pixels. Large composition gaps outside its crop anchors require a new
composition. Repair failures stop without automatic retry.

`processing.inkContrast` optionally increases extracted darkness before the
`gamma` curve; it defaults to `1` and accepts `0.1` through `8`. Increasing it
can give dark source details fully opaque pixels while retaining transparent
source areas and the original opacity ceiling. Compare it with grid size and
review-page strength locally before spending more on image generation.

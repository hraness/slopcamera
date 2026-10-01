# Make a scrolling pixel landscape

Use `slopcamera image landscape plan|run|process|repair` with a version-one
`slopcamera.pixel-landscape` manifest. See `docs/how-to/pixel-landscapes.md`
and `examples/pixel-landscape/landscape-world.json` in the source checkout for the
complete grammar and starter. Retain the manifest, source panels and receipts.

Before generation, run `plan` and inspect its image/judge request counts,
dimensions, ink and upload scope. The manifest caps requests and rounds;
price depends on the selected provider. Vertex express uses `VERTEX_API_KEY`
or `GOOGLE_CLOUD_API_KEY`; Gemini uses `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
Use native model IDs. Keys belong only in the invocation environment.

```sh
slopcamera image landscape plan landscape.json --json
slopcamera image landscape run landscape.json \
  --output-dir artifacts/landscapes/new-pass --allow-cloud-upload --json
```

The output directory must be fresh and its parent must exist. The run compares
native tall compositions or linked portrait sequences in parallel, applies
one global pixel grid, judges the results, and can refine one finalist. Inspect the full
source, comparison sheet, seams, alpha PNG and local review page before choosing.
`accepted-by-model` records a model score; it does not replace visual inspection.
A failed paid attempt never retries automatically. Read its retained request
and failure evidence before authorizing a new run.

`pixels.png` is one darker background hue with variable opacity. `mask.png`
is a neutral recolorable alpha field. Check every site's actual palette before
tinting it. A near-background neutral secondary surface can overlap the opacity
ramp; receipts report that limitation while chromatic accents remain guarded.
Place decorative artwork behind content, with no pointer events and hidden
from assistive technology. Preserve its aspect ratio.

For local inputs, put one path per section in the manifest's `panels` array.
Paths resolve beside the manifest. `process` makes the derived PNGs without
provider calls. Upscaling is Lanczos interpolation, not generated detail;
the alpha cells expand with nearest-neighbor edges.

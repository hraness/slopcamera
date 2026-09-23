# A photographic plate in a film-transfer study

`film-plate.html` holds one local PNG or JPEG on screen for six seconds at 16 fps. The source image remains a single photograph. No people, vehicles, or other subjects move independently.

The optical treatment adds a 1.2% push after 0.4% initial overscan, registration movement bounded to 0.45 pixels per axis at 1080-pixel height, and continuous brightness variation bounded to 0.6% from the input level. The overscan conceals the moving image boundary. There are no scratches, light leaks, fabricated archive markings, or subject animation. `finish-film.ts` can add a separately retained grain and diffusion treatment after this render.

Run the local workflow with an explicit image and a new run identifier:

```sh
bun examples/style-portfolio/render-film-plate.ts \
  --image artifacts/style-portfolio/city/photographic-interpretation.png \
  --run photographic-transfer-v1
```

Use `--dry-run` with a different new run identifier to obtain the canonical Slopcamera plan without launching a browser. `--width` and `--height` set maximum output bounds. With neither option, the bounds are 1440 × 1080; with only one option, the other bound is 8192. The workflow derives even dimensions that preserve the input aspect ratio and never exceed its dimensions. A 1448 × 1086 source therefore delivers 1440 × 1080 by default. The optical crop resamples that image within its declared output raster; it does not create new photographic detail or justify a 4K claim.

The wrapper reads at most 32 MiB, checks PNG/JPEG metadata with Sharp, rejects animated or multipage files and sources above 33 megapixels, respects EXIF-oriented dimensions, and retains the exact input bytes under `artifacts/style-portfolio/film-plate/<run>/`. The HTML obtains that copy only through `SlopcameraOverlay.asset('plate')` and waits for image decoding before frame rendering. No network resources or uploads are used.

Each run records source identity, dimensions, timing, intent, canonical scene input, and the host result. An existing run directory is a hard stop, including after a failed or ambiguous attempt. Inspect its log and retained host state before making a separate new attempt. The input and existing outputs are never overwritten.

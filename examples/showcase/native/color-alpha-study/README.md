# One render, two color and alpha representations

**Native CPU render and pixel qualification passed; the example is admitted for publication.** The original
chart uses known linear emission colors, two half-transparent patches, a clear
patch and a transparent background. The top-right tile contains a linear red
value of 2, beyond the SDR display range. Labels use Blender's bundled Bfont.

The one-frame 512×288 job saves the same Render Result as a 16-bit sRGB PNG with
straight alpha and a half-float linear Rec.709 EXR with premultiplied alpha. It
also retains the native scene. The fixed Studio driver owns these encodings;
the scene does not secretly export another image or run a compositor transform.
`Standard`, neutral look, exposure 0 and gamma 1 avoid an AgX creative look, while
the PNG still receives the declared sRGB display conversion and clips HDR values.

```sh
bun examples/showcase/native/prepare-study.ts color-alpha-study --check
bun examples/showcase/native/prepare-study.ts color-alpha-study --write-jobs
bun apps/desktop/cli/main.ts studio bundle examples/showcase/native/color-alpha-study/source.json --json
```

The helper returns a fresh job path without executing Blender. Confirm the bundle
command returns the same hash, then use that returned `chart.json` path:

```sh
bun apps/desktop/cli/main.ts studio plan <prepared-chart.json> --json
bun apps/desktop/cli/main.ts studio probe <prepared-chart.json> --blender-bin /absolute/path/to/Blender --json
bun apps/desktop/cli/main.ts studio run <prepared-chart.json> --allow-trusted-code --blender-bin /absolute/path/to/Blender --json
```

Use the managed native scheduler where installed; require at least 2GiB free.
The job uses Cycles/CPU, 128 samples, seed 719, no denoising, one frame, a 128MiB
output cap and a 180-second deadline. These settings are bounded intentions, not
runtime or storage measurements. No provider account is needed.

Qualification must read the actual saved files with a decoder whose alpha behavior
is known. In particular, Blender image buffers may expose straight values after
decoding a premultiplied EXR; do not mistake decoder unpremultiplication for stored
channel values. Record the decoding method and conversion, and compare raw stored
samples or independently verified decoder semantics before making a premultiplication
claim. Do not infer an EXR's semantics from its filename or the declared job alone.

Use the retained camera to locate a 9×9 center ROI for each target in `patches.json`.
Verify orientation, channel order, background/clear alpha 0, opaque alpha 1 and
the mean coverage of the two alpha .5 patches. The half-alpha shader is sampled:
report observed variance and reject noisy/biased coverage rather than weakening
the target. A suggested initial mean-alpha tolerance is .03; confirm whether the
128-sample render meets it. Ignore invisible RGB under alpha 0 and never divide by
zero. At nonzero alpha, compare linear straight RGB to the declared color and
stored premultiplied RGB to color×alpha, retaining the actual precision tolerance.

Show that the opaque HDR tile retains red above 1 in EXR, while the corresponding
SDR PNG is clipped/display-converted. Derive an explicit SDR preview, then composite
the straight-alpha PNG over both a dark and light background. Inspect full-size
patches and enlarged edges for halos, mixed alpha conventions or channel errors.
Keep both masters and exact derivative commands. Neither a webpage preview nor
an opaque H.264 movie proves alpha or HDR preservation.

The retained Blender 5.2.1 CPU execution passed 26 numeric checks with FFmpeg 7.1.5:

- The HDR center retained EXR RGBA `[2, 0.5, 0.125, 1]`; its PNG red clipped to 1.
- Both partial-alpha centers measured EXR alpha `0.5`, with zero center-ROI variance
  in this execution. PNG alpha was `0.50000763` after 16-bit quantization.
- EXR stored RGB agreed with linear color × observed alpha within `0.00010742`.
  PNG stored straight sRGB agreed within `0.00000808` in the center-ROI means.
- Clear and background samples had alpha 0. Opaque targets had alpha 1.

The independent EXR display derivative and dark/light PNG composites were reviewed,
including enlarged partial-alpha edges. Use the dark composite for presentation:
the neutral text has weak contrast on the light diagnostic background. These are
observations for this retained specimen, not claims about every color pipeline.

Run the retained qualifier from the source checkout with the **actual successful
job outputs** and a fresh output directory. It uses Python's standard library and
FFmpeg/ffprobe, checks all center ROIs, and retains hashes, commands and derivatives:

```sh
mkdir -p artifacts
python3 examples/showcase/native/color-alpha-study/qualify.py \
  /absolute/path/to/premultiplied-linear.exr \
  /absolute/path/to/straight-srgb.png \
  artifacts/color-alpha-qualification
```

Use the ordinary compute scheduler on managed hosts. The script rejects failed
numeric checks; independently inspect the resulting images before publication.

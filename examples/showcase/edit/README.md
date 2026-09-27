# One film, four compositions

`ratio-variants.ts` turns the native optical study into four separately composed
projects. Each keeps the same trim, cut and speed change, then uses a centered
camera push and an SVG frame sized for its delivery ratio.

| Delivery | Canvas | Camera zoom |
| --- | --- | --- |
| Landscape | 1280 × 720 | 1 → 1.04 |
| Portrait | 720 × 1280 | 1.6 → 1.664 |
| Square | 960 × 960 | 1.25 → 1.3 |
| Feed portrait | 864 × 1080 | 1.3 → 1.352 |

The video retains `contain` geometry. The camera enlarges the central instrument;
the SVG provides type and fades around it. Review the full lens, body, controls,
title and intended plinth crop in every ratio. These are four authored projects.
The separate `render.ts` recipe demonstrates the automatic `social-variants`
workflow, which exports one project's composition at four ratios.

Use Bun 1.3.14, FFmpeg/FFprobe and `rsvg-convert`. Start with a successful `beauty`
output from the [native product recipe](../native/product/job.json). If needed,
render that retained source first with the supported Blender runtime:

```sh
bun examples/showcase/native/render.ts product --blender-bin /absolute/path/to/blender
```

Pass the actual successful job ID printed by that command. Run from the
repository root:

```sh
bun examples/showcase/edit/ratio-variants.ts <studio-job-id> prepare
bun examples/showcase/edit/review-ratios.ts <printed-artifact-directory>
bun examples/showcase/edit/ratio-variants.ts <studio-job-id> render <reviewed-git-revision>
```

The review helper renders only frames 0, 59 and 117 from the actual compiled
composition. Its retained graph and frame-selection receipt are feasibility
evidence; the render phase creates the ordinary project-render receipt.

The render phase requires the supplied revision to equal `HEAD` and the renderer
to match that commit. It uses the static-overlay timing correction introduced in
`81217777f193718e20351a886516ecae445590a9`. Inspect selected frames before final
rendering and all final frames before publishing. Each output directory records
the CLI requests, results, project identities, source hashes and engine revision.
Existing successful requests can be reused; failed requests require inspection.
A changed SVG or composition produces a new recipe and project identity.

The edit keeps source time 0.25–5.75 seconds, removes 2.5–2.75 seconds, and plays
4–5.75 seconds at 1.25× speed. This gives 4.9 seconds on the project clock and
118 frames at 24 fps (4.916667 seconds in the encoded video). Each input uses the
same completed native render; no additional Blender render is needed for a new
ratio.

The checked SVGs contain paths and gradients only. `create-ratio-frames.py`
regenerates their lettering with fontTools and the repository's
[OFL-licensed Nebula Sans](../../../src/assets/fonts/nebula-sans/LICENSE.txt).
Python and font installation are unnecessary when rendering the checked SVGs.
Font and SVG hashes are retained in `ratio-frames/provenance.json`.

The native film is silent. The ordinary project renderer produces a silent AAC
track. Publication derivatives may omit it after checking every decoded audio
sample and verifying that stream-copy remuxing preserves every video frame.
Keep the original project output and receipt alongside that derivative proof.

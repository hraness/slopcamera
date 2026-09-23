# Visual style portfolio

These examples turn reusable art direction into original short films, retain their editable sources, and assemble selected results into an offline gallery. The collection can combine Canvas animation, native Blender scenes, and generated image plates with camera motion. Each work names its actual method and limitations.

The twelve Canvas studies demonstrate drawn and graphic techniques. The [Market Street scene](market-street/README.md) is a procedural Blender interpretation of an early street film. A generated photographic plate can demonstrate image direction and film finishing, but camera motion over one image does not establish independently animated people, vehicles, or a reconstructed 3D world.

The supplied Canvas and Blender animation sources are silent. Sound design or a soundtrack is a separate authored production step.

## Render a study

Run these commands from a Slopcamera source checkout or installed source package with Bun and the required local rendering capabilities available. `render.ts` calls the package's built CLI, so build the CLI first when working from edited source.

```sh
slopcamera style list --json
slopcamera style show theatrical-cel --json
bun examples/style-portfolio/render.ts --style theatrical-cel --width 1920 --run train-preview --dry-run
bun examples/style-portfolio/render.ts --style theatrical-cel --width 1920 --run train-preview
bun examples/style-portfolio/render.ts --style theatrical-cel --run train-master
bun examples/style-portfolio/render.ts --all --width 1920 --run collection-previews
bun examples/style-portfolio/render.ts --all --still --width 3840 --offset 3 --run selected-stills
```

`--all` selects the twelve implemented Canvas studies. Choose either `--all` or `--style`. Films run for six seconds at 24 fps. Movies and stills default to native 3840×2160; pass `--width 1920` for a smaller preview. `--still` renders one exposure at the requested `--offset` in seconds. The supported widths are 1280, 1920, 2560, and 3840; height follows the study's 16:9 canvas. These are native render sizes, not enlargement claims.

Dry runs keep separate `.plan.*` attempts and never replace render evidence.
Every run retains its scene request, operation result, log, and intent under `artifacts/style-portfolio/<run>`. An existing intent makes the runner report `already-attempted`. Inspect that attempt's host receipts before selecting a new run name; do not use a new name to hide an uncertain native operation.

Use the [Market Street source contract](market-street/README.md#source-contract) for native Blender jobs. It uses a 4:3 frame and a separate capture cadence.

## Apply a film finish

```sh
bun examples/style-portfolio/finish-film.ts \
  artifacts/style-portfolio/city-master.mp4 \
  silent-actuality \
  artifacts/style-portfolio/city-finished.mp4
```

The finisher probes the input, compiles the style's ordered video look, and retains an intent and receipt beside the new output. It accepts one video stream and at most one audio stream, at most 30 seconds and 120 fps, even dimensions from 64×64 through 4096×4320, and an input no larger than 512 MiB. Existing outputs are not overwritten. The receipt records the actual output dimensions, frame count, bytes, hashes, and limitations.

This is a display-referred artistic finish. It does not model a spectral film stock, add independently moving subjects, or repair scene geometry. Preserve the clean master and inspect the encoded result at its delivery size.

## Assemble the offline gallery

Select final videos, posters, receipts, and source files explicitly in a JSON manifest. Paths resolve relative to the manifest file; absolute paths are accepted only inside the current Slopcamera checkout or package root. The assembly does not search artifact directories, follow receipt paths, or include reference material automatically.

```sh
bun examples/style-portfolio/build-gallery.ts \
  artifacts/style-portfolio/selection.json \
  artifacts/style-portfolio/gallery
```

The output directory must be new and lie strictly inside this repository's `artifacts/` directory. The default is `artifacts/style-portfolio/gallery`. Open its `index.html` directly or serve the directory using a local static server. The complete directory is portable: films, posters, captions, source files, receipts, metadata, and the licensed display font use relative local paths. No external fonts, scripts, libraries, or network requests are required by the gallery.

Assembly uses `ffprobe` to compare each selected video's width, height, duration, and optional frame rate with the manifest. It hashes copied files and writes the page last. `--trust-manifest` explicitly skips probing when the input facts have already been checked elsewhere; the resulting records say `supplied-manifest` and do not claim a fresh media check. Neither mode certifies visual quality or historical accuracy.

The selection is bounded to 64 studies, 512 unique files, and 3 GiB total. Individual films are limited to 512 MiB, posters to 32 MiB, receipts to 4 MiB, and source files to 8 MiB. Every copied input must be a regular file with an admitted extension. Hidden paths and `artifacts/style-portfolio/reference/` are rejected. A failed assembly retains its intent and any partial copies; inspect it and choose a new output directory for a corrected selection.

### Manifest reference

The exported `GalleryManifest` and `GalleryStudy` interfaces in [build-gallery.ts](build-gallery.ts) define the input. The example below shows the shape; replace its paths and media facts with measured values from your selected outputs.

```json
{
  "schemaVersion": 1,
  "title": "Studies in motion",
  "intro": "Original scenes exploring drawn animation, material, light, and film.",
  "hero": "market-street-blender",
  "studies": [
    {
      "id": "market-street-blender",
      "title": "A street before the earthquake",
      "style": "silent-actuality",
      "description": "A short cable-car journey toward a Ferry Building interpretation.",
      "method": "Procedural Blender scene with a monochrome film finish",
      "video": "selected/city.mp4",
      "poster": "selected/city-poster.png",
      "width": 1920,
      "height": 1440,
      "durationSeconds": 6,
      "frameRate": 16,
      "receipt": "selected/city.receipt.json",
      "sourceFiles": [
        { "path": "../../examples/style-portfolio/market-street/scene.py", "label": "Blender scene" },
        { "path": "../../examples/style-portfolio/market-street/mesh.py", "label": "Geometry helpers" },
        { "path": "../../examples/style-portfolio/market-street/street_data.py", "label": "Historical evidence and estimates" }
      ],
      "limitations": [
        "Authored historical interpretation, not archival footage or a surveyed reconstruction."
      ]
    }
  ]
}
```

`hero` names one study to lead the page; the first study is used when it is omitted. Optional `reel` has the same fields as a study and appears after the collection. Its ID must be distinct. `sourceFiles` is an explicit list of files, with optional human-readable labels. Include every required helper, scene request, and source asset needed to reproduce a result. Receipts are copied intact; their embedded original paths remain evidence, and are not automatically made portable.

Optional `brief` supplies an original reusable direction under “Make a variation.”
`reviewPoints` accepts up to six `{ "label": "Main action", "timeSeconds": 2.65 }`
objects within the clip duration. These controls seek and pause the selected
film; they do not change its source or autoplay it. Use them to name the exact
moment for a revision and state which geometry, timing, or material should stay
unchanged. “Download still” retains the selected poster at its supplied resolution.

Optional `captions` names a WebVTT file, and `captionLanguage` defaults to `en`. Include captions when speech or meaningful audio needs a text equivalent. The gallery starts with posters, uses native accessible video controls, never autoplays, and pauses other films when one starts. It honors reduced-motion scrolling and preserves the full native aspect ratio.

Each study gets a metadata JSON file listing its copied paths, byte counts, SHA-256 hashes, production method, and media facts. `manifest.json` contains the portable selection. `gallery-receipt.json` records assembly evidence. The original manifest's absolute paths are not copied into those new records; selected execution receipts remain byte-for-byte originals.

Use precise method labels. Suitable examples include “Canvas 2D clay material study,” “Rotoscope-inspired procedural Canvas animation,” and “Generated photographic plate with camera motion and film finishing.” A style name describes an influence; it does not establish that a physical medium or archival process was used.

## Direct the next scene

Read the [visual style direction guide](../../skills/slopcamera/references/visual-style-direction.md), select a profile, and specify a subject, a visible action, a camera, and a temporal decision. These short briefs are starting points for new compositions:

| Profile | Production brief |
| --- | --- |
| `silent-actuality` | Film a damp street from a fixed cable-car support. Keep a bright sky, dark shop recesses, irregular street traffic, and a coherent destination. Label estimated history. |
| `theatrical-cel` | An original courier pauses above a dense night city. Hold the figure, let rain and a sign move, then give the coat one decisive wind accent. |
| `watercolor-storybook` | A small boat crosses a quiet wash of river. Preserve paper in highlights, soften distant edges, and keep one crisp focal gesture. |
| `pixel-art` | A traveler arrives at an original station at dusk. Choose one logical grid, a limited palette, readable sprite poses, and integer movement. |
| `math-explainer` | Construct two simple waves, align their phases, and show their sum. Keep the equation true and pause when the relationship becomes visible. |
| `midcentury-limited` | Let an original bird inspect a seed through three held poses. Use asymmetric shapes, sparse texture, and one accent color. |
| `rubber-hose` | An original character anticipates, jumps, and settles. Design clean silhouettes, arcs, grounded feet, and a readable final hold. |
| `cut-paper` | Unfold a landscape from distinct paper layers. Keep pivots, overlap, edge shadows, and shallow depth consistent. |
| `stopmotion-clay` | Build a clay-like figure with uneven construction and deliberate pose steps. Name a 2D interpretation honestly when no physical simulation exists. |
| `engraving` | Reveal a form through directional hatching. Let line density describe light and preserve open highlights. |
| `ink-sketch` | Follow one gesture with confident contours and sparse searching lines. Hold the main silhouette while selected strokes change. |
| `rotoscope` | Invent a coherent human gesture with consistent limb lengths and weight. Label procedural motion as rotoscope-inspired unless tracing a real source. |
| `clean-motion` | Transform a small set of original shapes through one clear rule. Use optical alignment, deliberate pauses, and restrained easing. |

Expand by changing the composition, material system, action, and timing together. Recoloring the same scene does not demonstrate another animation language. Compare representative frames before a full render, then inspect the encoded motion for contact, pacing, flicker, texture shimmer, crop, and text. The gallery is a selected portfolio of these examples, not a claim to cover every Slopcamera capability.

## Gallery design and review

The gallery uses Experience mode: a selected film occupies the first viewport, typography supports its caption, and the remaining works form an open image sequence. It inherits the site's warm paper and dark ink, with the existing Instrument Serif font copied into the example under its OFL license. There are no decorative cards, fake archival labels, or playback that starts without the visitor.

Review the assembled page once at desktop and mobile sizes, then repair observed issues in one batch. Check long titles, playback, local source links, keyboard focus, aspect ratios, and metadata disclosure. A static contact sheet does not verify motion. The assembly script does not run a browser or make a visual approval claim.

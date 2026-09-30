# An AI mythology

Nine original short films that tell invented myths about machine intelligence in the grammar of the old cycles: creation, the settling of the world, oracle, flood, council, trickster, underworld descent, the many-headed guardian, and apotheosis. Every film was made with a rendering technique the [visual style portfolio](../style-portfolio/README.md) did not use, and each one retains its editable source, its submitted request, and the host receipt that describes what was actually rendered.

The catalog is `films.json`. Each entry names the myth, the direction, what to watch for, the style profile, the HTML profile or native scene path, the resolution, the duration, the seed, the exposure cadence, the boiled channels, the master-still offset, and the techniques the film demonstrates.

| Film | Beat | Style profile | Rendering | Techniques |
| --- | --- | --- | --- | --- |
| The First Token | Creation | `super8-color` | `paper-shaders` HTML profile, 3840×2160 | neuroNoise shader, super8 cadence, per-exposure glyph boil, super8 finish |
| The Weights Descend | The settling of the world | `documentary-16mm` | `three` HTML profile on hardware WebGL2, 1920×1080 | instanced numeral tiles, 16 mm finish |
| The Oracle of the Latent Temple | Oracle | `noir-35mm` | `vgpu` HTML profile, 3840×2160 | authored WGSL raymarch, noir finish |
| The Gradient Flood | Flood | `ink-sketch` | `p5` HTML profile, 1920×1080 | cadence on threes, per-exposure line boil |
| The Council of Optimizers | Pantheon council | `isometric-design` | native spatial scene, orthographic camera, 1920×1080 | temporal audit, render audit |
| The Trickster Prompt | Trickster | `midcentury-limited` | `two` HTML profile, 1920×1080, 7 s | held poses on threes, outline boil |
| Descent into the Context Window | Underworld descent | `clean-motion` | `motion` HTML profile, 1920×1080 | seeked Motion timelines |
| Attention Turns Its Many Heads | The many-headed guardian | `stopmotion-clay` | `three` HTML profile on hardware WebGL2, 3840×2160 | original soundtrack, declared music clock, bands-v1 audio reactivity, cadence on twos, clay boil |
| The Apotheosis of the Model | Apotheosis | `engraving` | `paper-shaders` HTML profile, 1920×1080 | godRays shader, SVG hatch figure |

Films run eight seconds at 24 fps unless the table says otherwise. Four of the nine style profiles, `super8-color`, `documentary-16mm`, `noir-35mm`, and `isometric-design`, had not been used by the first portfolio.

## What is new here

- **Exposure cadence and boil from the SDK.** `render.ts` computes the style's held exposure times with `sampleVisualStyleExposure` and a keyed per-exposure variation with `visualStyleFrameVariation`, then passes both lists to the page as parameters. A page never calls `Math.random`; the same frame renders identically twice, and a boiled stroke only changes when the cadence advances.
- **Five HTML profiles the first portfolio did not use.** `paper-shaders`, `three`, `vgpu`, `two`, and `motion`; the flood keeps `p5`.
- **A native spatial scene with audits.** The council is authored as a `slopcamera.spatial-scene` document with an orthographic camera, checked, audited for temporal continuity and for render coverage, then rendered by the host and transcoded.
- **An original soundtrack.** `synth-many-heads.py` writes an eight-second, 90 BPM WAV from sine and noise primitives; the film declares that music clock and reads the `bands-v1` audio reactivity so the gate light and eye glints follow the drum.
- **Film finishing on three masters.** `super8-color`, `documentary-16mm`, and `noir-35mm` are applied with the style portfolio's finisher, which retains an intent beside each finished output.

## Render the films

Run from a Slopcamera source checkout with Bun 1.3.14, a built CLI (`bun run build:desktop`), ffmpeg, and hardware WebGL2 for the `three-webgl2-hardware-v1` execution profile.

```sh
bun examples/mythology-portfolio/render.ts --film first-token --width 1280 --run first-preview
bun examples/mythology-portfolio/render.ts --film first-token --run first-master
bun examples/mythology-portfolio/render.ts --all --run films
bun examples/mythology-portfolio/render.ts --all --still --width 3840 --run stills
```

`--all` selects the eight HTML films. Choose either `--all` or `--film`. Movies default to the catalog width; `--still` renders one exposure at the film's `stillOffset`, or at `--offset` seconds, and defaults to 3840×2160. The supported widths are 1280, 1920, 2560, and 3840. Every run keeps its intent, scene request, result, and log under `artifacts/mythology-portfolio/<run>`; an existing intent makes the runner report `already-attempted`, so choose a new run name per attempt and inspect the previous attempt's receipts before doing so. `--dry-run` keeps separate `.plan.*` attempts.

The council does not go through the HTML host:

```sh
bun examples/mythology-portfolio/render-council.ts --run council
```

This authors the scene, runs `scene check`, `scene temporal-audit` and `scene render-audit`, renders the film and the master still through the host, and writes every stage's JSON under `artifacts/mythology-portfolio/<run>`.

The soundtrack for the many-headed guardian is written once with `python3 examples/mythology-portfolio/synth-many-heads.py`, which produces `artifacts/mythology-portfolio/audio/many-heads.wav`; the render reads it from that path.

## Finish, select, and assemble

```sh
bun examples/style-portfolio/finish-film.ts <first-token master.mp4> super8-color artifacts/style-portfolio/mythology/first-token.super8-color.mp4
bun examples/style-portfolio/finish-film.ts <weights-descend master.mp4> documentary-16mm artifacts/style-portfolio/mythology/weights-descend.documentary-16mm.mp4
bun examples/style-portfolio/finish-film.ts <latent-oracle master.mp4> noir-35mm artifacts/style-portfolio/mythology/latent-oracle.noir-35mm.mp4
```

The master paths are the `output.path` values in each film's `result.json`. Posters are one frame from each master still render:

```sh
ffmpeg -v error -i <still video.mp4> -frames:v 1 artifacts/mythology-portfolio/posters/<film>.png
```

`build-selection.ts` assembles the gallery manifest from completed runs. It re-hashes every film against its result, checks that each film and master still was rendered from the scene document it links and that each finish was made from the selected master, refuses a missing or changed input, and writes paths relative to the manifest so the gallery builder can re-probe them. A film re-rendered after review comes from its own run through `--film-run`, and a re-rendered master still through `--still-run`; both may repeat:

```sh
bun examples/mythology-portfolio/build-selection.ts --films films --stills stills --posters posters \
  --finished mythology --council council \
  --film-run apotheosis=apotheosis-2 --still-run apotheosis=apotheosis-2 \
  --out artifacts/mythology-portfolio/selection.json
bun examples/style-portfolio/build-gallery.ts artifacts/mythology-portfolio/selection.json artifacts/mythology-portfolio/gallery
```

The gallery builder's [manifest reference](../style-portfolio/README.md#manifest-reference) applies unchanged. Each study links its scene document, the submitted request, the render command, the master-still receipt, and, where one exists, the finish intent, the soundtrack synthesis, and the audits.

## Review log, 2026-09-24

Every film was reviewed from extracted frames at the start, the midpoint, and near the end, plus its master still, before selection.

- **The First Token.** Glyphs condense out of the neuroNoise field on the super8 cadence and settle into a lowercase line; the question mark lands last. The first super8 finish encoded but failed its verification probe under a load average above 40, because the finisher gave the whole-film frame count the same 30 s deadline as a header read; that probe now has a deadline sized for the admitted bound, the unverified output was set aside, and the finish was rerun. The rerun verified 192 frames at 3840 × 2160, and its frames keep the line and the question mark clear under the grain. Passed.
- **The Weights Descend.** The numeral peaks slide into a basin and the marble follows the true slope to the bottom; the caption stays legible, including under the 16 mm finish's grain and vignette. Passed.
- **The Oracle of the Latent Temple.** Frames at 0.5 s, 4.0 s and 7.5 s of the 4K master: the colonnade, the overhead shaft and the smoke lattice all read, but the light pool reaches the caption in the last second and washes it out. Fixed by giving the caption a dark text shadow; the re-render was reviewed at 0.5 s, 7.5 s and a crop of the caption at 7.6 s, where it stays legible inside the pool. The noir finish raises the contrast, so the caption was checked again in the finished film at 7.6 s and 7.9 s: it stays legible inside the pool, at lower contrast than in the clean master. Passed.
- **The Gradient Flood.** A first preview left the sky empty; the rain and cloud were moved into the frame. The delivered render shows the flood rising over the contour lines with the ark riding the crest. Passed.
- **The Council of Optimizers.** The first render and its master still cut the tallest head at the back against the top edge in every frame, so the orthographic window widened by an eighth and the camera rose with its target to keep the dais centred. The re-render's temporal audit found nothing across six samples; its render audit repeats two warnings, `entity_eye_momentum` and `entity_eye_sgd` never rendered, because those two eyes face away from the isometric camera. The frames and the master still hold every head and the whole dais in frame while each pillar bows. Passed with the warnings recorded as limitations.
- **The Trickster Prompt.** The fox hops bubble to bubble on threes, each guard's eyes close after it passes, and it bows to the empty room at the end. Passed.
- **Descent into the Context Window.** Six renders. The first put each level's token band across the title in the opening second, so the bands moved down within their frames. The second showed older bands scrolling up through the dimmed title, so the title now fades out completely between 0.8 s and 1.6 s. The third showed, at the final hold and in the master still, the outermost frame's border through the counter and the previous level's band cropped at the left edge, so the frames now share a centre below the title and counter and each band fades during its own zoom. The fourth showed each nested frame's top edge crossing its parent's band, so each band now sits between its frame's top edge and the next frame's. The fifth showed that one Motion easing warped the whole zoom timeline away from the level schedule, leaving the last band cropped over the final zoom, so each zoom segment now eases separately, as the still curve already did. The sixth render was reviewed at every hold, through each zoom, at the final hold, and in its master still: nothing crosses the title, the counter, or a band, and the first line is legible and lit. Passed.
- **Attention Turns Its Many Heads.** Frames at the start, the downbeat at 3.4 s, the midpoint and the end of the 4K render: the eight heads hold their two-frame poses, swing toward the glowing token on the beat, and the gate arch lights gold as it opens at the end. The AAC track is present for the full eight seconds. The orbiting words pass in front of the heads as they circle, which is the orbit, not a defect. Passed.
- **The Apotheosis of the Model.** The first still offset put the rising figure across the title, so the catalog moved the master still to four seconds; the first film render then showed the rings crossing the title in the last two seconds, so the title now fades out between 4.6 s and 5.6 s. The re-render was reviewed at the start, the midpoint, and the end. Passed.

## Limitations

- The HTML films render through the local host's browser; the council uses the host's native scene renderer. Neither is a claim about a model or a training run; the myths are fiction.
- The finished films carry a style look applied by ffmpeg; the host's render receipt describes the clean master, and the finish intent and finish receipt name that master by sha256.
- The council film in the gallery is an H.264 transcode of the host's ProRes render.
- The First Token's super8 finish is a 4K H.264 file of about 326 MiB, roughly 340 Mbit/s, because its frame-varying grain barely compresses. That rate is above the 300 Mbit/s that H.264 High profile allows at the level the file declares, 5.1, so a player that enforces the level may stutter or refuse it.
- The soundtrack is procedural and deterministic; no samples or music model were used.
- No paid generation was used anywhere in this set.

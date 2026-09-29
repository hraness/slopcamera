# Make a product launch film

Use this workflow for a short film that walks through a product: kinetic type,
the product's own UI in a browser frame with a moving camera, a cursor and a
drawn highlight, a proof act with real numbers, a limits card and an end card.
The film is plain HTML, CSS and JavaScript rendered by `slopcamera html render`.
React is used only to turn the site's mockup components into static markup.

The same source gives a web MP4 and WebM, a poster, a social still, square and
vertical cuts, one short clip per act, and WebVTT captions. Each act's caption
doubles as the source text for a social thread post.

On Hraness product sites the film is one step of the `product-launch` agent
skill, which also covers the mockups, the launch post and the social kit. Use
that skill for the whole launch and this page for the film.

## Check the command

```sh
slopcamera help html
slopcamera doctor --json
```

The installed CLI must list `html init`, `html still` and `html deliver`.
Rendering needs the admitted local Chrome runtime and FFmpeg/FFprobe. Follow
[installation and readiness](install.md) if the command is missing.

## Start a film

```sh
slopcamera html init video --template launch-film --aspect 16:9
cd video
bun install
bun run build
```

`--aspect` takes `16:9`, `1:1` or `9:16` and only sets the default in
`film.json`; `bun build.ts --aspect 9:16` re-lays the same film at another size.
The project pins the SlopCamera version that wrote it in `package.json`, so the
CLI version is recorded next to the source.

| File | Edit it to |
| --- | --- |
| `film.json` | Change copy, steps, proof items, colors, fonts and product CSS. |
| `mockups.tsx` | Replace the placeholder product with the site's real mockup components. |
| `timeline.ts` | Change act order and length. Captions and clips follow it. |
| `film.css` | Restyle the stage, masks, grain and browser frame. |
| `film.js` | Change the choreography. Keep every value a function of `t`. |

`bun run build` writes `out/film.html`, `out/scene.json`, `out/captions.vtt`
and `out/beats.json`. It inlines `@hraness/design-kit` `mockups.css` when the
project can resolve it, then any `productCss` files and fonts, and validates the
scene before writing it. The document limit is 1 MiB; the build prints its size.

## Keep every frame a function of time

A renderer can ask for any frame in any order, once or twice. Build each frame
from `t` alone:

- Read time from `SlopcameraOverlay.onFrame(({ timeMs }) => ...)`. Never use
  `Date.now`, `requestAnimationFrame`, CSS transitions, CSS animations or a
  counter carried between frames.
- Hide finished scenes with `show(element, on)`. It sets both `visibility` and
  `display`, so a hidden scene cannot leak a stale layer into a later frame.
- Measure layout once, before the first frame, and store the rectangles. Do not
  measure inside a scaled or transformed scene.
- Load fonts and images through `SlopcameraOverlay.ready(...)` before frames.

The helpers in `@hraness/slopcamera/local/html-film` follow these rules.
`build.ts` bundles them into `out/film.html`.

| Need | Helpers |
| --- | --- |
| Numbers and easing | `clamp`, `lerp`, `prog(t, start, end)`, `easings`, `spring` |
| Kinetic type | `split(element, "word" \| "char")`, then `kin(element, t, inAt, outAt)` |
| Acts and state | `defineTimeline`, `crossfade`, `stepValue`, `show` |
| Product walk | `camera`, `cameraBetween`, `cameraTransform`, `cursor`, `placeCursor`, `drawMark` |
| Captions | `captionsFromTimeline(timeline)` writes WebVTT from act captions |

## Direct each act

- **Cold open.** Two short lines over a collage of the problem. Stagger words
  by 60 to 90 ms and hold each line long enough to read twice.
- **Title.** The product name and the same one-line promise the product's site
  uses. One idea, one hold.
- **Product walk.** One step per entry in `film.json`. Each step names a
  `data-film` surface for the camera `focus`, a `target` for the cursor click,
  an optional `highlight` outline and an optional `after` state set on the target
  once clicked. Let the camera settle before the cursor moves, click, then draw
  the highlight. Keep steps near 4 seconds.
- **Proof.** Count numbers up from a facts file or release record. Never type a
  number into `film.json` by hand.
- **Limits.** Say plainly what the product does not do.
- **End card.** Name, address and one line.

Keep public copy in plain words and sentence case, with no exclamation marks and
no hype. Keep the placeholder illustration note until the surfaces show the real
product.

## Review stills before rendering

```sh
slopcamera html still --input out/scene.json --at 3,12.5,20 --output out/stills
slopcamera html preview --input out/scene.json --every 2 --output out/preview
```

Both render with the same injected runtime as `html render`, so a still matches
the rendered frame at that time. `preview` also writes `contact-sheet.png`. Look
at each act's hold, each click and each highlight before a full render. For a
quick draft render, `bun build.ts --scale 0.5 --fps 15 --until 3` keeps the
layout and shrinks the canvas, frame rate and length.

## Render and deliver

```sh
slopcamera html render --input out/scene.json --json > out/export.json
slopcamera html deliver out/export.json --basename launch --poster-at 9 --social-at 9 \
  --cuts 1:1,9:16 --per-beat-clips
```

`deliver` reads `output.path` from the export and checks its hash, then writes
into `out/deliver/`:

- `launch.mp4`, H.264 with faststart for the web, and `launch.webm`, VP9
- `launch-poster.jpg` and a 1200x630 `launch-social.jpg`
- `launch-1x1.mp4` and `launch-9x16.mp4`, the whole frame over a blurred fill
- one 6 to 10 second clip per act from `beats.json` beside the export, or the file `--beats` names
- `launch-receipt.json` with each file's size, hash and budget

Budgets are 12 MB per MP4, 10 MB for the WebM and 250 KB per JPEG. `deliver`
exits non-zero when a file is over budget; shorten the film, simplify the grain
or lower the frame rate rather than raising the budget.

## Turn beats into a thread

`out/beats.json` lists each act's id, start, end and caption. Use one post per
act, in order, with that act's clip or still attached. The captions are already
short and in plain words; edit them in `film.json` so the film and the posts stay
the same. The WebVTT file carries the same lines for the web player.

## Coming from HyperFrames or Remotion

There is no importer. The ideas map directly:

| HyperFrames or Remotion | Launch film |
| --- | --- |
| A composition's HTML, CSS and JS | `film.html`, `film.css` and `film.js` in a `plain` scene |
| `useCurrentFrame()` | `timeMs` from `SlopcameraOverlay.onFrame`, as `t` in seconds |
| `interpolate(frame, [a, b], [x, y])` | `lerp(x, y, prog(t, a, b))` |
| `spring({ frame, fps })` | `spring(seconds)` |
| `<Sequence from durationInFrames>` | an act in `defineTimeline`, read with `timeline.local(t, id)` |
| `<Series>` with overlaps | acts with `overlap`, blended by `crossfade` |
| `staticFile()` | a declared resource read with `SlopcameraOverlay.asset(name)` |
| `delayRender()` | `SlopcameraOverlay.ready(promise)` |
| Rendering with the CLI | `slopcamera html render`, then `html deliver` |

Keep React components as mockups rendered to static markup. Do not run React
inside the film: every frame must come from `t`, not from component state.

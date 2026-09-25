# Brand illustrations

Read this before you generate, trace, retouch, recolor, resize or ship any
product illustration or topic icon for a marketing page, docs landing, project
card or social card. A trace that "looks fine" at 448 px is not evidence. The
gate below is.

Scope: the **illustration** class of Slopcamera's two-class product artwork
(`slopcamera image icon --purpose illustration`), meaning marketing and topic
art shown at 24 to 160 px on Hraness sites. Marks (`--purpose mark`) keep their
own contract. Interface icons (nav, buttons, labels) stay on the stroke sprite
algal.computer uses (hugeicons, 24 viewBox, stroke 1.5, currentColor).

### The icon language

Every illustration in the portfolio is one family. Product identity comes from
the subject and the palette primary the site applies. It does not come from
per-product line weight, per-product ink or a different drawing style.

| Property | Rule |
| --- | --- |
| Frame | `viewBox="0 0 64 64"`, square. The subject's long side is 48 to 54 units, optically centered. The 5-unit margin is empty. |
| Line | Monoline centerline strokes: `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`. |
| Weights | Four tones and nothing else: **line** 2 u (the body of the drawing); **detail** 1.5 u (interior detail only, at most 25% of total line length); **accent** 3 u (at most one element, the focal point); **tint plane** `fill="currentColor" fill-opacity=".16"` (at most 2 paths, on the primary face only). No hairlines under 1.5 u. No solid fills except a tint plane. |
| Projection | Simple 30-degree isometric, or front orthographic for flat subjects such as a page, card or screen. Use one projection per site set. |
| Subject | One main object and at most one small secondary prop. At most 8 connected parts. No text, digits, letters, logos, hatching, texture, shading, gradients, shadows, ground planes, badges, frames or container tiles. |
| Spacing | Parallel strokes are at least 3 u apart (1.5 times the line). Closed counters are at least 6 u across. No stroke ends closer than 2 u to another stroke unless they join. |
| Color | `currentColor` only. No hex, rgb, named color, `<style>`, media query or `class` paint in the file. The site sets `color` (normally `var(--primary)`). |
| Markup | Only `<svg>`, `<g>`, `<path>`, `<circle>`, `<ellipse>`, `<rect>`, `<line>`, `<polyline>`. At most 24 elements and 400 path commands, 0.1-unit precision, 6 KB or less. No `mask`, `clipPath`, `filter`, `transform`, `vector-effect`, `use`, `image`, `style`, `script`, `href` or `url()`. No `data-slopcamera-line-weight`. |

#### Optical sizes

Stroke weight is fixed in frame units, so rendered weight scales with display
size. Three optical sizes keep the rendered line between about 1.2 and 3 CSS px,
roughly the square root of the size ratio to algal's 1.2 to 1.3 rem accent icons
(1.5/24 stroke gives 1.2 px at 19.2 px):

| Optical size | Display | Stroke | Detail length | Parts | Tint plane | File |
| --- | --- | --- | --- | --- | --- | --- |
| `s` | 24 to 40 px | 3 u (1.1 to 1.9 px) | 100 to 280 u | 4 or fewer | none | `<id>.s.svg` |
| `m` (default) | 44 to 120 px | 2 u (1.4 to 3.75 px) | 160 to 460 u | 8 or fewer | 1 or fewer | `<id>.svg` |
| `l` | 128 px and up | 1.5 u (3 px and up) | 200 to 640 u | 10 or fewer | 2 or fewer | `<id>.l.svg` |

Below 24 px, use the product **mark**, never an illustration. Derive `s` from
`m` by pruning, never by scaling: drop detail strokes, merge near-parallel
lines, then re-stroke at 3 u.

#### Delivery

Sites render illustrations so the palette reaches them. Never ship them through
a bare `<img>` with a baked color.

1. **Preferred:** a generated per-site sprite, `/illustrations.svg`, with one
   `<symbol id="<id>" viewBox="0 0 64 64">` per illustration, rendered as
   `<svg class="hraness-illustration" data-size="m" aria-hidden="true"><use href="/illustrations.svg#<id>"/></svg>`.
   `currentColor` inherits through `<use>`, the tint plane keeps its opacity,
   and forced-colors mode works natively. This is the same sprite pattern
   algal.computer uses for interface icons (`/icons.svg`).
2. **Fallback** where only an image URL is possible, such as Markdown or a CMS:
   the design-kit mask utility (`.hraness-illustration` with a painted
   mask layer) paints `var(--hraness-illustration-ink, var(--primary))`
   through the SVG's alpha.
   It follows the same structure as `.hraness-foil-mark`.
3. Size and color come from design-kit classes (`.hraness-illustration[data-size="s|m|l"]`).
   Sites must not own a `.x-topic-icon { width: 88px … }` rule, an `opacity`,
   a `filter: hue-rotate()` or an `invert()`.
4. Contrast: `--primary` against the surface the illustration sits on must
   reach at least 3:1 (WCAG 1.4.11, non-text) in both schemes. Where a card
   surface is tinted, set `--hraness-illustration-ink` to the palette's
   strong-primary token instead of lowering opacity.

### Generate

```sh
slopcamera image icon '<subject>' --purpose illustration \
  --concept '<one-sentence metaphor>' --size m --rounds 2 --output icons/<id>.svg --json
slopcamera image icon normalize icons/<id>.svg --size s --output icons/<id>.s.svg --json
slopcamera image icon check icons/ --json      # gate every file; non-zero exit on any failure
slopcamera image icon sheet icons/ --palette <family> --output review.png   # 32/64/88 px, light+dark
```

(`--concept`, `--size`, `normalize`, `check` and `sheet` are the proposed
additions. Today only `image icon` exists.)

1. **Concept first.** Turn the product verb into one physical object metaphor,
   in one sentence. Write three candidates. Generate a gallery
   (`slopcamera image gallery`) of the best two before spending icon rounds.
   Reject metaphors another portfolio product already owns (see the shared
   pool in the registry) unless you deliberately reuse the pooled file.
2. **Raster.** The prompt template below fixes ink, weight ratio, projection
   and element budget. The model draws black on white. Color is never a
   generation parameter.
3. **Normalize** (deterministic, local, no network): centerline re-trace to
   2 u strokes, strip color to `currentColor`, reframe to 64, emit, then
   re-measure. See "Normalization" below.
4. **Gate.** Hard numeric gate (below). A failure feeds a concrete correction
   into the next round ("remove the 6 shelf slats; keep 2"), not a restyle.
5. **Critique.** The vision reviewer sees the **sheet**: 32, 64 and 88 px on
   the target palette's light and dark surfaces, beside the site's other
   illustrations, with the gate metrics printed underneath. A pass at 448 px
   alone does not count.
6. **Register.** Record the file in the artwork registry with subject,
   concept, sha256, gate version and metrics. Sites consume registry output.
   They do not keep hand-copied SVGs.

#### Prompt template

```text
A single product-brand line illustration of {subject}, shown as {concept}.

Drawing rules:
- Pure black (#000000) lines on a plain white (#FFFFFF) background. No other color, no gray.
- Every line has the same thickness, about 3% of the image width (about 32 px on a 1024 px image).
  No thin detail lines. No filled or solid areas{accent_clause}.
- Simple 30-degree isometric view of one main object{prop_clause}. At most {max_parts} separate parts.
  Draw as few lines as you can. Every line must still be clearly visible when the image is 64 px wide.
- Closed shapes are outlines, not filled. Leave at least one line-width of white between parallel lines.
- Round line ends and rounded corners.
- No text, numbers, letters, logos, hatching, texture, shading, gradients, shadows, floor, frame,
  badge, tile or background shape.
- The object fills about 80% of the image and is centered.
{feedback_clause}
```

- `accent_clause`: empty by default. For a deliberate focal accent, use
  `, except one small solid {part} no larger than a tenth of the drawing`.
  The normalizer converts it to the tint plane.
- `prop_clause`: empty, or `, with one small {prop} beside it`.
- `max_parts`: 8 for `m`, 4 for `s`, 10 for `l`.
- `feedback_clause`: `The previous attempt was rejected. Change only this: {gate reason codes rendered as concrete edits}`.

Do not ask for brand color, "medium weight", "clean", "minimal" or "premium".
Those words do not constrain the raster. The numbers do.

#### Normalization

`slopcamera image icon normalize` makes weight and color properties of the
normalizer, not the image model:

1. Parse the SVG and reject forbidden content (list in "The icon language").
2. Rasterize its alpha on a **transparent** background, with the art's bounding
   box fitted into 54 u inside a 64 u frame at 8 px/unit (512 by 512, pinned
   librsvg/sharp).
3. Binarize at alpha 128 or more. Compute the Euclidean distance transform and a
   Zhang–Suen skeleton.
4. Separate **masses** (ink more than 2 u from any background pixel, meaning a
   region wider than 4 u). Keep at most 2 masses: trace their outer contours
   with marching squares and emit them as tint planes
   (`fill="currentColor" fill-opacity=".16"`). If masses exceed 12% of ink,
   stop with `mass.excess`: the art is mark-weight and must be regenerated.
5. Turn the skeleton into a graph (junction and end pixels are nodes). Prune
   spurs shorter than 2 u. Merge parallel chains closer than 3 u. Remove
   components smaller than 1.5 u².
6. Trace each edge chain into a polyline, simplify it (Ramer–Douglas–Peucker
   with epsilon 0.3 u), fit centripetal Catmull–Rom curves to cubic Béziers
   with corner detection above 35 degrees, and join chains that meet at a node
   of degree 2.
7. Emit at most 24 paths on `viewBox="0 0 64 64"` with the root attributes
   `fill="none" stroke="currentColor" stroke-width="{2|3|1.5}" stroke-linecap="round" stroke-linejoin="round"`,
   rounded to 0.1 u. Chains whose source width was under 1.8 u become detail
   strokes (1.5 u, `m` and `l` only). One chain marked by the concept as the
   accent becomes 3 u.
8. Re-render the emitted SVG and run the gate. Normalization never loosens a
   threshold to pass.
9. Write a receipt: source sha256, output sha256, gate version, every metric
   and the pruning counts.

Sketch (TypeScript, Bun; reuses Slopcamera's pinned sharp and has no new
native dependency):

```ts
export async function normalizeIllustration(svg: string, size: "s" | "m" | "l"): Promise<NormalizedIllustration> {
  assertAllowedMarkup(svg)                                   // forbidden tags/attrs/url()
  const alpha = await renderAlphaFramed(svg, { frame: 64, art: 54, pxPerUnit: 8, background: "transparent" })
  const ink = binarize(alpha, 128)
  const dist = euclideanDistance(ink)                        // Felzenszwalb–Huttenlocher
  const masses = regions(ink, (i) => dist[i] > 2 * 8)
  if (share(masses, ink) > 0.12) throw gateError("mass.excess")
  const graph = skeletonGraph(zhangSuen(ink))
  prune(graph, { spurUnits: 2, mergeParallelUnits: 3, minComponentUnits2: 1.5 })
  const chains = graph.chains().map((c) => fitCubic(rdp(c.points, 0.3 * 8), { cornerDeg: 35 }))
  const out = emitSvg({
    viewBox: "0 0 64 64",
    stroke: { s: 3, m: 2, l: 1.5 }[size],
    chains: classify(chains, dist),                          // line | detail | accent
    tints: masses.slice(0, size === "s" ? 0 : size === "m" ? 1 : 2).map(marchingSquares),
    precision: 0.1,
  })
  const metrics = await measureIllustration(out)             // same code path as `icon check`
  const problems = illustrationGate(metrics, size)
  if (problems.length) throw gateError(problems)
  return { svg: out, metrics, receipt: receiptFor(svg, out, metrics) }
}
```

Re-stroking rescues drawings whose composition is sound but whose weight was
set by the image model. It cannot rescue mass art or over-detailed art; those
need regeneration from the prompt template with a smaller element budget.

#### Gate (version 1)

All metrics come from the framed render in normalization step 2, identical in
`image icon`, `icon check`, the jungle registry and CI.

| Code | Metric | Pass band (`m`) | `s` | `l` |
| --- | --- | --- | --- | --- |
| `weight.faint` / `weight.heavy` | median stroke width at skeleton points, (2·EDT − 1)/8 | 1.7 to 2.4 u | 2.6 to 3.4 u | 1.3 to 1.9 u |
| `weight.hairline` | share of skeleton under 1.0 u wide | 5% or less | 3% or less | 8% or less |
| `weight.mixed` | p90 stroke width while mass is above 2% | 3.0 u or less | 3.8 u or less | 3.0 u or less |
| `mass.excess` | ink more than 2 u from background, as share of ink | 12% or less | 0% | 12% or less |
| `coverage.sparse` / `coverage.dense` | Σα / frame area (transparent letterbox) | 0.09 to 0.22 | 0.08 to 0.20 | 0.07 to 0.22 |
| `detail.thin` / `detail.crowded` | skeleton length | 160 to 460 u | 100 to 280 u | 200 to 640 u |
| `parts.fragmented` | 8-connected components of 1 u² or more | 8 or fewer | 4 or fewer | 10 or fewer |
| `parts.specks` | components under 1.5 u² | 0 | 0 | 0 |
| `frame.aspect` | art bounding-box aspect | 1.6 or less | 1.4 or less | 1.8 or less |
| `svg.frame` | viewBox | `0 0 64 64` | same | same |
| `svg.color` | literal paint present, or `currentColor` absent | none / present | same | same |
| `svg.markup` | forbidden element or attribute | none | same | same |
| `svg.paths` / `svg.bytes` | element count / file size | 24 or fewer / 6 KB or less | 12 or fewer / 3 KB or less | 32 or fewer / 9 KB or less |

The bands hang together. At a 2 u line, 160 to 460 u of drawn length is 320 to
920 u² of ink, which is 0.08 to 0.22 of the 4096 u² frame. Coverage and detail
length therefore agree unless the art contains masses or hairlines, and those
have their own codes.

#### Review checklist

Run on the sheet, not on a single large render:

- [ ] Recognizable at 32 px without its label, on both light and dark surfaces.
- [ ] Line weight matches its neighbors on the site sheet. No drawing reads fainter or bolder than the rest.
- [ ] No stroke, gap or counter is narrower than the line.
- [ ] At most one accent and one tint plane, both on the focal element.
- [ ] Renders in the site's `--primary` through the sprite or mask, not in `#2474d4`. Contrast is 3:1 or better on the actual card surface.
- [ ] The concept matches the copy of the section it heads, and differs from other products' concepts unless it is pooled.
- [ ] `s` exists wherever the site shows the illustration at 40 px or less.
- [ ] `icon check` passes and the registry receipt is updated. There is no hand-edited copy in any site.

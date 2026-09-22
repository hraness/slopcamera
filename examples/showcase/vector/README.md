# Raster to editable SVG

`render.ts` authors an original six-petal raster fixture, then runs Slopcamera's
local VTracer adapter twice. The first trace preserves its colors and alpha;
the second deliberately requests a two-color adaptation. This is a synthetic
benchmark with known shapes, not a claim to recover an illustrator's paths.

From the repository root:

```sh
bun examples/showcase/vector/render.ts
```

The script requires the locked repository dependencies and a qualified VTracer
0.6.4. Slopcamera provisions and verifies that tool on supported macOS/Linux
hosts when needed. No model credential or Vercel CLI is involved. The script
refuses to replace the original input; move aside an earlier output directory
before intentionally regenerating it.

Inspect `orbit-input.png` next to `orbit-traced.svg` at the intended size. Check
the transparent exterior, the small center ring, each lobe and the boundaries
between colors. `orbit-duotone.svg` is a separate authored color decision.
The SVGs contain paths rather than an embedded bitmap; edit the raster source
and retrace when changing the underlying design.

All artwork is original and distributed under the repository's MIT license.
Generated media and raw local receipts stay in ignored `artifacts/showcase/vector`.

Convert a raster illustration into SVG locally with `slopcamera image vectorize`. The command traces color regions, sanitizes the SVG, measures the result against the raster, and records the tools and input identity. It needs no model account and uploads no artwork.

Install [Slopcamera](/docs) on macOS or Linux. Windows deliberately rejects this vectorization profile. First use may download a checksum-pinned VTracer archive; subsequent tracing uses the prepared local tool. Begin with an image you have permission to use and an output path you intend to write.

## Trace the image

```sh
slopcamera doctor --json
slopcamera image vectorize input.png --output traced.svg --json
```

Replace `input.png` with your raster. Inspect the SVG at the same size as the input, then at its intended display size. Look for missing regions, merged gaps, rough curves, small text, and excess detail. Vectorization recovers traced shapes; it does not recover the original objects, typography, or semantic diagram relationships.

Use a separate output for a two-color treatment:

```sh
slopcamera image vectorize input.png --output duotone.svg --duotone '#1c3557,#f28e67' --json
```

The quotes preserve the two color literals as one argument. Duotone changes the output palette; evaluate its silhouette and boundaries separately from the original colors.

## Inspect a reproducible example

::example[orbit-vector]

The [original vectorization fixture](https://github.com/hraness/slopcamera/blob/main/examples/showcase/vector/render.ts) rasterizes six overlapping ellipses and two circles, then traces the resulting transparent 1024 × 1024 PNG in color and duotone. It is a synthetic illustration made to expose edge and palette differences. It is not a photograph, a third-party logo, or evidence that arbitrary detailed artwork will trace well.

To reproduce the pair, use a [source checkout](/docs/how-to/install-from-source) with dependencies installed and run from its root:

```sh
bun examples/showcase/vector/render.ts
```

The script retains `orbit-input.png`, `orbit-traced.svg`, `orbit-duotone.svg`, rasterized inspection copies, and JSON receipts under `artifacts/showcase/vector/`. It refuses to overwrite the input fixture; preserve an existing run before choosing a fresh checkout for another reproduction.

The reviewed color trace produced 201 paths with support recall `0.99983744` and color RMSE `0.03785405` on macOS arm64. These are measurements for this fixture and toolchain, not an accuracy guarantee for other images. Compare the visible output as well as the numbers; the receipt records the actual VTracer, image-library, and source identities.

## Decide whether the SVG is useful

Keep the raster, selected SVG, and its receipt together. Crisp silhouettes and a few intentional color regions usually make the result easier to inspect than photographs, gradients, or tiny lettering. Preserve text or diagram source when you have it; [render a diagram directly](/docs/tutorials/first-diagram) when objects and relationships need to remain editable.

If tracing rejects the input or fails its quality limits, read the reported reason. Simplify the source at its intended use size or choose another representation. Slopcamera does not silently embed the raster inside an SVG or use an upscaling model to disguise a failed trace. The [engine reference](/docs/reference/engines) records the local runtime and admission boundaries.

The retained [detail-limit fixture](https://github.com/hraness/slopcamera/blob/main/examples/showcase/vector/detail-limit.ts) draws 16,384 separated four-pixel squares. Its actual balanced-profile run rejected the trace with “No adaptive vector candidate passed the fidelity and output gates.” It produced no accepted SVG. This is a reproducible limit example, not an invitation to disable the quality checks.

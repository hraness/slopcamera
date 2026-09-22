`slopcamera image vectorize` traces a raster image into a measured, sanitized SVG on your own machine. The operation is authentication-free and network-silent at run time: it supervises checksum-pinned VTracer processes, rebuilds the SVG as inert markup, measures the result against the input, and records full provenance. No account, credential, or model is involved.

## The contract

```sh
slopcamera image vectorize input.png --output traced.svg --json
slopcamera image vectorize input.png --output duotone.svg --duotone '#1c3557,#f28e67' --json
```

- macOS and Linux only; Windows deliberately rejects this profile. First use may download a verified VTracer archive; after that the prepared local tool runs without a network.
- The emitted SVG is inert rebuilt geometry. Slopcamera never embeds the raster inside the SVG and never applies an upscaling model to disguise a failed trace.
- Every run writes a provenance receipt naming the actual VTracer and image-library identities, the input identity, and the measured fidelity: support recall and color RMSE for the run.
- Tracing fails closed. A source that cannot meet the fidelity and output gates reports the rejection reason and produces no accepted SVG rather than emitting a bad vector.
- `--duotone` takes exactly two `#rrggbb` colors and repalettes the traced output; evaluate its silhouette and boundaries separately from the original colors.

The portable SDK exposes the same operation as `vectorizeImage` from `@hraness/slopcamera`, and the [icon recipe](/docs/reference/gateway-generation) uses the same tracing stage inside a larger pipeline. On MCP, `slopcamera.image.vectorize` bounds the raster to 16 MiB inside the workspace root.

## What traces well

Crisp silhouettes and a few intentional color regions trace measurably well. Photographs, gradients, and small lettering usually do not, and tracing never recovers the original objects, typography, or semantic relationships: it produces traced shapes. When objects and relationships must stay editable, author a [diagram](/docs/reference/diagram-format) instead.

[Convert raster images to SVG](/docs/how-to/vectorize-images) walks a reproducible fixture, including a retained detail-limit case whose balanced run rejected the trace. The [engine stack](/docs/reference/engines) records how the profile sits beside the other engines.

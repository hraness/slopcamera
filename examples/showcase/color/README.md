# Compare local color treatments

Render the [product film](../native/README.md), then pass its retained opaque RGB
video to this helper from the repository root:

```sh
bun examples/showcase/color/render.ts /absolute/path/to/product.mp4
```

The helper runs the real `media color` command with `warm`, `cool` and `mono`
presets. Each command produces a separate derivative and transform receipt;
the source SHA-256 is checked again after all three runs. The source remains
unchanged. Use a fresh source checkout for a new run: the helper uses fixed
`artifacts/showcase/color/` output names and refuses an existing source receipt.
Keep earlier results in their original workspace.

Inspect the glass, brass, dark housing and highlight detail across the full
shot. A creative grade changes product color; it is not a measured color
calibration or a claim that the source and delivery preserve the same color
values. Presets can be combined with the bounded controls documented by
`slopcamera help media`.

Use each command's returned `output.path` to find the movie. Relative output requests resolve beneath Slopcamera's generated-media root; the helper's `artifacts/showcase/color/` directory retains the request/result evidence.

# Deterministic oil paint

Use the local oil-paint surface when a study needs visible bristle marks, wet
paint handling, a primed ground, and revisable pigments rather than a generated
raster.

```sh
slopcamera image oil-paint source.json --output study.ppm --log study.replay.json --json
slopcamera image oil-paint --replay study.replay.json --output study-again.ppm --json
```

The JSON source must declare named `tubes`, named `piles` made from tube
`ingredients`, and `layers` of strokes. A stroke names a pile and supplies
points; it cannot inject an arbitrary color. `waitSteps` advances curing and
leveling between layers. Keep dimensions, bristles, strokes, and waits within
the command's reported bounds. The result is a deterministic PPM and an
optional canonical replay document.

The implementation uses spectral K/S pigment mixtures and Kubelka–Munk layer
optics, not RGB averaging. Review the PPM and retain the source and replay log;
they are evidence of the local simulation, not a conservation-grade material
measurement.

See [the oil-paint guide](/docs/how-to/oil-paint) and the checked
[`examples/oil-paint`](../../../examples/oil-paint) source.

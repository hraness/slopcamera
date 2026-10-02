`slopcamera image oil-paint` makes a small, editable oil-paint study without a
model, browser, or network request. The source names pigment tubes, knifes those
tubes into named piles, and records strokes in layers. A simulated brush carries
its own load of wet paint; pickup, ploughing, relief, leveling, and drying are
replayed from the same seed.

The renderer uses twelve broad wavelength bands. Tube colors become absorption
and scattering values, piles mix their K/S values, and each film is layered with
Kubelka–Munk reflectance before the final PPM conversion. It does not average
RGB channel values to make paint.

## Write a bounded source

Start from `examples/oil-paint/valley.json` in the source checkout. A source has
this shape:

```json
{
  "version": 1,
  "width": 160,
  "height": 120,
  "seed": 23,
  "ground": { "color": "#e8dcc8", "tooth": 0.55, "relief": 0.8 },
  "tubes": [
    { "name": "titanium white", "color": "#f5f0e5" },
    { "name": "ultramarine", "color": "#1e3f9a" }
  ],
  "piles": [
    { "name": "sky", "knifePasses": 4,
      "ingredients": [
        { "tube": "ultramarine", "amount": 2 },
        { "tube": "titanium white", "amount": 1 }
      ] }
  ],
  "layers": [{ "name": "sky", "waitSteps": 12,
    "strokes": [{ "pile": "sky", "points": [[8, 40], [150, 38]] }] }]
}
```

A stroke may choose `round`, `hog`, `filbert`, or `fan` and bound its bristle
count, width, pressure, pickup, push, and load. A stroke can reference only a
pile; there is no direct tube or arbitrary color escape hatch. `waitSteps` moves
the local clock: paint cures and its ridges level, and sufficiently cured films
become the substrate for a later layer.

The default limits are deliberately modest: a 512×512 canvas, 16 tubes and
piles, eight layers, 128 strokes, 48 bristles per brush, and 120,000 simulated
steps. PPM output and replay logs are byte-bounded. Invalid foreign values are
rejected before the simulation starts.

## Render and replay

```sh
slopcamera image oil-paint examples/oil-paint/valley.json \
  --output valley.ppm --log valley.replay.json --json
slopcamera image oil-paint --replay valley.replay.json \
  --output valley-again.ppm --json
```

The replay document includes the normalized source and canonical stroke log.
Both renders have the same SHA-256 image digest. PPM is intentionally plain and
portable; open it in an image viewer that supports PPM or convert it in a later,
explicit step. The receipt reports dimensions, bytes, wet pixels, clock steps,
and the replay-log digest.

The TypeScript API is also local and deterministic:

```ts
import {
  serializeSlopcameraOilPaintReplay,
  simulateSlopcameraOilPaint,
} from "@hraness/slopcamera"

const result = simulateSlopcameraOilPaint(source)
console.log(result.imageSha256)
console.log(serializeSlopcameraOilPaintReplay(result))
```

This is a bounded study renderer, not a conservation or physical-materials
measurement. The PPM conversion and simplified relief lighting are presentation
steps; the pigment mix and layer decisions remain spectral.

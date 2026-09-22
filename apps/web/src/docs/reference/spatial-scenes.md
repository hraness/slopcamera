A `.scene.json` file is a spatial scene kept as editable data: named entities with stable IDs, calibrated cameras, declared assets, and animation channels, rendered through the local Three.js-based renderer. Agents change a scene through typed semantic patches checked against an expected digest, so a revision edits source rather than re-describing an image.

## Inspect and render

```sh
slopcamera scene init product.scene.json --json
slopcamera scene inspect product.scene.json --json
slopcamera scene evaluate product.scene.json --camera camera_hero --time-us 1000000 --json
slopcamera scene plan product.scene.json --request frame.json --json
slopcamera scene render product.scene.json --request frame.json --json
```

`inspect` reports entity IDs, cameras, assets, and bounds without decoding asset bytes. `evaluate` samples world state at an absolute microsecond without launching a renderer. `plan` validates and estimates bounded work; `render` verifies asset bytes and runtime identity, then writes output, retained source and assets, and a receipt under `artifacts/slopcamera/generated/`.

A render request names a `cameraId`, a `selection`, and a `mode`:

| Selection | Request fields | Result |
| --- | --- | --- |
| `frame` | `timeUs` | One PNG at the camera's calibrated resolution |
| `contact-sheet` | `timesUs`, `columns`, `cellWidth`, `cellHeight`, `fit` | A sampled grid rendered at camera resolution, then resized |
| `video` | `range` (`startUs`, `endUs`), `frameRate` | Lossless qtrle MOV with straight alpha |

Frame sampling uses the rational frame rate before one-microsecond quantization, and ranges are half-open. Final delivery converts scene footage through the [project compositor](/docs/reference/video-pipeline).

## Render profiles

Scene rendering defaults to a software profile and offers two explicitly selected hardware profiles:

- `three-webgl2-hardware-v1` requires macOS with a WebGL2 context through ANGLE Metal. It rejects software or unknown fallback rather than silently degrading, and its receipts record observed hardware. Cross-driver regeneration need not be pixel-identical.
- `three-spark-webgl2-hardware-v1` adds a separately qualified Spark dependency closure for bounded saved splat worlds, with an aggregate rendered-world limit of 500,000 splats. Splats capture appearance, not collision geometry.

Both keep the same explicit scene clock and linear compositing; frame publication fails on context loss or unsettled work. Scene sources may also mount images and video as world-space media, and `scene camera-track` exports calibrated camera samples. GLB assets import through a supported geometry and material subset; they do not turn a native rig into an editable scene.

## Direction, design, and the cinematic workflow

Above the base contract sit typed companion documents: direction (semantic camera and shot intent), effects, behavior, performance, and galleries that compile bounded single-axis variants as content-addressed candidates without selecting one. `scene design` authors parametric architectural studies from named dimensions and constraints, compiling them into retained geometry and ordinary scenes; four starters ship with materials, lights, and cameras. The `cinematic-world` workflow packs one admitted scene, one direction document, gallery axes, preview requests, declared effects, and a temporal audit into an inert, content-addressed recipe pack for review before selection.

The same sources are reachable read-only through [the MCP scene tools](/docs/reference/mcp-tools). For the task walkthrough, see [Render and edit spatial scenes](/docs/how-to/direct-scenes), [Build and revise a parametric design](/docs/how-to/parametric-design), and [Direct a cinematic world](/docs/how-to/cinematic-worlds).

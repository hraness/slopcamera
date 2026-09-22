The `cinematic-world` built-in workflow runs the complete planning-and-review loop for one admitted spatial scene: inspect the world, check and compile authored direction, plan a bounded gallery per axis, bind declared effects into each preview render, and audit sampled temporal evidence. Its input is one inert `slopcamera.spatial-recipe-pack` document — bounded JSON data, never code.

This guide is the durable-graph counterpart of the scene, direction, and effects commands covered in [Render and edit spatial scenes](/docs/how-to/direct-scenes). The commands ship in v3.3.1; install the [verified release](/docs/reference/capabilities#install-the-release) or build from source. Check `slopcamera help scene` and `slopcamera workflows show cinematic-world --json` for the installed contract.

## Author and check the direction

A `slopcamera.spatial-direction` document describes beats, actions, camera coverage, and look intents semantically. Its `projectDigest` must equal the scene's canonical SHA-256:

```sh
slopcamera scene inspect world.json --json    # read sceneSha256
slopcamera scene direction check direction.json --scene world.json --json
```

The same direction compiles deterministically into proposed performance, camera, cinema, material-lighting, and shot documents through `slopcamera scene direction plan`, and `slopcamera scene direction gallery` plans bounded variants along one axis — `performance`, `camera`, `lighting`, `materials`, `effects`, or `sequence`. Declared effects bind to a render through `scene effects plan` and `scene effects check`, and `scene temporal-audit` reports sampled evidence without launching a renderer. The workflow below composes exactly these operations.

## Author the recipe pack

A recipe pack names the scene by digest, one direction document, the gallery axes to explore, named preview render requests, an optional effects block, and optional temporal-audit inputs:

```json
{
  "kind": "slopcamera.spatial-recipe-pack",
  "schemaVersion": 1,
  "packId": "recipe_reveal",
  "sceneSha256": "<scene canonical sha-256>",
  "direction": { "kind": "slopcamera.spatial-direction", "schemaVersion": 1 },
  "cameraId": "camera_main",
  "axes": ["camera", "lighting"],
  "previews": [{
    "name": "reel",
    "request": {
      "cameraId": "camera_main",
      "mode": { "kind": "beauty" },
      "selection": { "kind": "frame", "timeUs": 0 }
    }
  }],
  "effects": {
    "renderPlan": {
      "kind": "slopcamera.spatial-render-plan",
      "schemaVersion": 1,
      "quality": {
        "outputBytes": 8000000, "particleCount": 0, "pixelBudget": 2073600,
        "simulationSteps": 0, "texturePixelBudget": 2073600, "tier": "preview"
      }
    },
    "particleSystems": [],
    "simulationBakes": []
  },
  "temporalAudit": { "timesUs": [0, 2000000, 4000000] }
}
```

The pack's own rules: `axes` takes 1–6 unique values from the six axis names; `previews` admits at most 4 named render requests; `temporalAudit` requires `cameraId` and bounds `timesUs` to 64 samples; `packId` carries a `recipe_` prefix. Omit `effects` or `temporalAudit` entirely to skip those branches — the workflow does not guess defaults for them.

## Plan the workflow

The workflow input wraps the pack with the admitted scene and the repository path of the same scene:

```json
{
  "pack": { "...the recipe pack above..." },
  "scene": { "...the slopcamera.spatial-scene document..." },
  "source": { "path": "scenes/world.json" }
}
```

`pack.sceneSha256` must equal the canonical digest of the embedded `scene`, and every preview `request` is revalidated against the render-request schema at admission. Planning compiles the graph and reports its requirements without executing any operation:

```sh
slopcamera workflows plan cinematic-world --input input.json --json
```

## Run and review

```sh
slopcamera workflows run cinematic-world --input input.json --json
```

The run produces inspect output, a direction check report, a `verified: false` direction compilation, one bounded gallery plan per axis, an integrity-bound effects document per preview, each preview render receipt, and a temporal-audit report. Durable runs resume through `slopcamera runs show` and `runs resume` with the same receipts and recovery rules as every other workflow — see [Run or recover a workflow](/docs/how-to/run-workflows).

## What the workflow never does

- It never selects or promotes a candidate. `slopcamera scene project select-candidate` and the creative-selection workflow are separate explicit operations after review.
- Compiled direction stays `verified: false`; it is a proposal document, not applied state.
- Planning and graph compilation execute no operations, read no credentials, contact no providers, and mutate no project state.
- A recipe pack cannot register operations, executors, source paths beyond the declared render source, permissions, secrets, or remote URLs. It is inert data validated before graph construction — see [Extend Slopcamera](/docs/explanation/extending) for the full trust model.

## Iterate

Change the direction, axes, previews, or effects block and repack — the pack digest changes, and planning produces a new deterministic plan identity. Equivalent inputs always yield the same plan, so a diff in `graphPlanSha256` is a diff in declared intent.

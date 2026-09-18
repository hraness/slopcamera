---
name: cinematic-pack-authoring
description: Author a Slopcamera spatial recipe pack — a bounded, inert, content-addressed JSON document that names an admitted scene, one direction document, gallery axes, preview render requests, declared effects, and a temporal audit — then plan or run the built-in cinematic-world workflow. Use when a user asks an agent to direct a 3D scene, iterate camera/look/sequence variants, or review compiled direction before explicit selection.
metadata:
  internal: true
---

# Author a cinematic recipe pack

Slopcamera's extension surface is declarative: coding agents extend behavior by
authoring bounded JSON documents, never by registering code. The operation
registry is closed, and the `cinematic-world` workflow composes only registered
operations. A recipe pack is the complete input contract for that loop.

## Documents an agent authors

1. **Scene** (`slopcamera.spatial-scene`, schemaVersion 1) — the admitted world.
   Usually already admitted through `slopcamera scene` commands; the pack binds
   it by digest, it is never embedded twice.
2. **Direction** (`slopcamera.spatial-direction`, schemaVersion 1) — semantic
   beats, actions, camera coverage, and look intents. `projectDigest` must equal
   the scene's canonical SHA-256. Character and subject references are semantic
   ids (`hero`), which compile against `entity_hero`-style scene entities.
3. **Recipe pack** (`slopcamera.spatial-recipe-pack`, schemaVersion 1) — the
   inert plan document:

```json
{
  "kind": "slopcamera.spatial-recipe-pack",
  "schemaVersion": 1,
  "packId": "recipe_<slug>",
  "sceneSha256": "<canonical scene sha-256>",
  "direction": { "<the direction document>" },
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

## Boundaries the pack enforces

- `axes` — 1 to 6 unique values from `performance | camera | lighting | materials | effects | sequence`.
- `previews` — at most 4 named render requests; each `request` is revalidated
  against the spatial render-request schema at workflow admission.
- `effects` — optional; when present it requires `renderPlan` (a declarative
  `slopcamera.spatial-render-plan` document with a quality tier and optional
  post-process stack) plus bounded `particleSystems`/`simulationBakes`. Each
  preview render first plans an integrity-bound effects document
  (`scene.effects.plan`) and renders with it.
- `temporalAudit` — optional; requires `cameraId`; `timesUs` bounds to 64 samples.
- `packId` — `recipe_` prefix, at most 64 slug characters.

## Invoking the workflow

The workflow input is `{ "pack": <pack>, "scene": <scene>, "source": { "path": "<repo-relative scene path>" } }`.
`pack.sceneSha256` must equal the canonical scene digest, so compute it first:

```sh
slopcamera scene inspect <scene.json> --json   # read sceneSha256
```

Plan is effect-free — it compiles the graph and reports requirements only:

```sh
slopcamera workflows plan cinematic-world --input input.json --json
```

Run executes the graph: inspection, direction check, compilation, one gallery
plan per axis, per-preview effects binding and render, and the temporal audit.

```sh
slopcamera workflows run cinematic-world --input input.json --json
```

## What the workflow never does

- It never selects or promotes a candidate. `spatial.project.select-candidate`
  and `iteration.select` are separate explicit operations a caller invokes
  after reviewing the plan outputs.
- Compiled direction stays `verified: false`; it is a proposal document, not
  applied state.
- Planning and graph compilation execute no operations, read no credentials,
  contact no providers, and mutate no project state.

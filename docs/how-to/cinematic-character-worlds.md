# Build a directed cinematic character world

Use the spatial-scene contracts to describe a bounded 3D world, a rigged character, a performance, camera coverage, and a finished sequence. Everything is content-addressed, deterministic, and local-first; paid or native work only runs through explicit host operations.

## What is in scope

The merged phases give you these portable contracts:

- Rigged GLB profile: `src/spatial-scene/character.ts`
- Performance compiler: `src/spatial-scene/performance.ts`
- Camera rigs: `src/spatial-scene/camera-rig.ts`
- PBR materials and lighting: `src/spatial-scene/material-lighting.ts`
- Cinema plans: `apps/desktop/contracts/cinema.ts`
- Parametric geometry: `src/spatial-scene/geometry.ts`
- Particles, post-processing, simulation bakes: `src/spatial-scene/effects.ts`, `src/spatial-scene/particle.ts`, `src/spatial-scene/simulation.ts`
- Agent direction and compilation: `src/spatial-scene/direction.ts`, `src/spatial-scene/direction-compile.ts`
- Galleries, temporal audits, recipe packs: `src/spatial-scene/gallery.ts`, `src/spatial-scene/temporal-audit.ts`, `src/spatial-scene/recipe-pack.ts`

Each contract parses from `unknown`, enforces byte and collection budgets, and produces a canonical SHA-256.

## Construct a world and a take

1. Define a `slopcamera.spatial-scene` with a `world` entity.
2. Add a rigged GLB asset and a `slopcamera.spatial-character`.
3. Write a `slopcamera.spatial-performance` with directives, clips, and baked IK.
4. Design `slopcamera.spatial-camera-rig` coverage.
5. Compose a `slopcamera.project-cinema-plan` sidecar inside a spatial project with shots and transitions.
6. Optionally add `slopcamera.spatial-particle-system`, `slopcamera.spatial-simulation-plan`, and `slopcamera.spatial-render-plan` effects.
7. Parse and compile each document locally to verify budgets and digests before any browser, native, or paid work.

```sh
slopcamera scene check world.json --json
slopcamera project cinema check <project> --json
```

## Direct semantically

A `slopcamera.spatial-direction` document describes beats, actions, camera coverage, and look intents in semantic terms. Its `projectDigest` must equal the scene's canonical SHA-256, so compute it first:

```sh
slopcamera scene inspect world.json --json
```

Check the direction against the admitted scene, then compile it into proposed performance, camera, cinema, material-lighting, and shot documents:

```sh
slopcamera scene direction check direction.json --scene world.json --json
slopcamera scene direction plan direction.json --scene world.json --camera camera_main --output direction-plan.json --json
```

Compilation is a proposal: the output keeps `verified: false`, lists unresolved intents and advisories, and never applies itself to a project. Explore one axis at a time with a bounded gallery:

```sh
slopcamera scene direction gallery direction.json --scene world.json --axis camera --output camera-gallery.json --json
```

Axes are `performance | camera | lighting | materials | effects | sequence`; each plan returns at most six reviewed variants and never selects one.

## Plan and check effects

A `slopcamera.spatial-render-plan` is a small declarative document (quality tier plus an optional post-process stack). Bind it to the scene, particle systems, and bake receipts in one integrity-checked document:

```sh
slopcamera scene effects plan draft.json --scene world.json --output effects.json --json
slopcamera scene effects check effects.json --scene world.json --json
```

The check rejects stale scene digests, unresolved particle entities, and missing assets before any render. Deterministic rigid-body simulation bakes go through `slopcamera scene effects bake <plan.json> --scene world.json --output <bake.json>`; unsupported constraint kinds reject fail-closed.

## Render, audit, and review

Render through the spatial render surface (`slopcamera scene render`), then sample temporal evidence — flicker, foot sliding, camera jerk, cut discontinuities — over explicit times or evenly spaced samples:

```sh
slopcamera scene temporal-audit world.json --camera camera_main --times-us 0,1000000,2000000 --json
slopcamera scene render-audit world.json --camera camera_main --times-us 0,1000000 --json
```

The cinema sidecar drives sequence review inside a spatial project:

```sh
slopcamera project cinema audit <project> --json
slopcamera project cinema gallery <project> --axis pacing --output cinema/pacing-gallery.json --json
```

## Promote a take

Selection is explicit. Every candidate has a digest, rendered evidence, and audit receipts. Register candidates in a spatial project, then select one — the original remains recoverable:

```sh
slopcamera scene project add-candidate <project-id> --input <candidate-request.json> --json
slopcamera scene project select-candidate <project-id> --input <selection-request.json> --json
```

For the complete planning loop in one durable graph, the `cinematic-world` built-in workflow composes inspection, direction check and compile, per-axis galleries, effect-bound previews, and a temporal audit — still without selecting or promoting anything. See [direct a cinematic world](direct-cinematic-worlds.md).

## Boundaries

- No arbitrary runtime code. Native execution only through the fixed, hash-bound native authoring operation.
- No caller-authored GLSL or network shader catalogs. Post-processing is locked to in-repo modules.
- No hidden paid calls. Provider work is explicit, byte-bound, and opt-in.

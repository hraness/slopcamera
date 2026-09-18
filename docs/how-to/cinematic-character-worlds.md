# Build a directed cinematic character world

Use the new spatial-scene contracts to describe a bounded 3D world, a rigged character, a performance, camera coverage, and a finished sequence. Everything is content-addressed, deterministic, and local-first; paid or native work only runs through explicit host operations.

## What is in scope

The merged phases give you these portable contracts:

- Rigged GLB profile: `src/spatial-scene/character.ts`
- Performance compiler: `src/spatial-scene/performance.ts`
- Camera rigs: `src/spatial-scene/camera-rig.ts`
- PBR materials and lighting: `src/spatial-scene/material-lighting.ts`
- Cinema plans: `apps/desktop/contracts/cinema.ts`
- Parametric geometry: `src/spatial-scene/geometry.ts`
- Particles, post-processing, simulation bakes: `src/spatial-scene/effects.ts`, `src/spatial-scene/particle.ts`, `src/spatial-scene/simulation.ts`
- Agent direction: `src/spatial-scene/direction.ts`

Each contract parses from `unknown`, enforces byte and collection budgets, and produces a canonical SHA-256.

## Construct a world and a take

1. Define a `slopcamera.spatial-scene` with a `world` entity.
2. Add a rigged GLB asset and a `slopcamera.spatial-character`.
3. Write a `slopcamera.spatial-performance` with directives, clips, and baked IK.
4. Design `slopcamera.spatial-camera-rig` coverage.
5. Compose a `slopcamera.project-cinema-plan` sidecar with shots and transitions.
6. Optionally add `slopcamera.spatial-particle-system`, `slopcamera.spatial-simulation-plan`, and `slopcamera.spatial-render-plan` effects.
7. Parse and compile each document locally to verify budgets and digests before any browser, native, or paid work.

```sh
slopcamera scene check world.json --json
slopcamera cinema check film.json --json
```

## Render and audit

The desktop renderer lowers the closed contracts to Three.js, FFmpeg, and a retained native bake adapter. Diagnostic object-ID, depth, and motion outputs are produced before any beauty post-processing.

After rendering, run the continuity and temporal audits:

```sh
slopcamera cinema audit film.json --output-audits ./audits --json
slopcamera rendered review ./renders --compare-to ./audits --json
```

## Promote a take

Selection is explicit. Every candidate has a digest, rendered evidence, and audit receipts. Promote one by writing a new project revision that references the selected take; the original remains recoverable.

```sh
slopcamera project promote --from <candidate-digest> --reason "best continuity" --json
```

## Boundaries

- No arbitrary runtime code. Native execution only through the fixed, hash-bound native authoring operation.
- No caller-authored GLSL or network shader catalogs. Post-processing is locked to in-repo modules.
- No hidden paid calls. Provider work is explicit, byte-bound, and opt-in.

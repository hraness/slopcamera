# Build scenes from code

Prefer helpers over hand-written scene JSON. The `@hraness/slopcamera/code` export ships pure builders in `spatial-scene/build` that return validated v1 scene data; feed their output into entities, transforms, and animation channels, then parse the whole scene before writing it. Helpers never read files, execute source, or touch a renderer, and every result already satisfies the contract schemas. Use [directed scenes](directed-scenes.md) for rendering, patching, and project commands.

## Camera and animation helpers

- `perspectiveFromFov({fovDeg, width, height, near, far})` → calibrated projection. `fovDeg` is the horizontal field of view.
- `lookAtPose(position, target)` → camera pose facing local −Z at the target.
- `frameFitPose(bounds, projection, margin)` → pose framing authored or admitted bounds.
- `easeKeys({from, to, durationUs, easing})` → dense keys for `linear`, `ease-in`, `ease-out`, or `ease-in-out`; `easeChannel({channelId, targetId, property, ...})` wraps them into a ready animation channel. Baked keys stay small: about 25 per 4-second span.
- `orbitKeys({center, radius, durationUs, ...})` → paired position and look-at rotation keys for a turntable.

## Layout and placement helpers

- `align(items, axis, edge)`, `distribute(items, axis, {gap}|{span})`, `row`, `column`, `stack` order existing entities by their transforms and optional bounds.
- `grid({rows, columns, cellSize, origin?})` → ground-plane cell positions; `scatter({seed, count, region, minSpacing?})` → deterministic seeded XZ positions.
- `groundSnap(transform, halfHeight, floorY)`, `onTopOf(moverBounds, moverTransform, targetBounds, targetTransform)`, `nextTo(...)`, `facing(transform, target)` resolve relations to concrete transforms immediately. They need bounds — primitives have them; GLB and splat bounds come from `scene asset admit` output or an explicit `--asset-bounds` map.

## The create → audit → patch loop

1. Build or generate the scene JSON.
2. `slopcamera scene audit scene.json --camera camera_hero --json` samples evaluated geometry across the duration and reports per-entity frustum state, projected pixel footprint, and findings such as off-camera or never-visible entities. `--times-us` picks explicit samples; `--asset-bounds bounds.json` supplies decoded asset enclosures as a bounds map, an admission document, a `{manifest, facts}` pair, or an array of those.
3. Fix with a typed `scene patch` carrying `expectedSceneSha256`, or regenerate. `slopcamera scene diff before.json after.json --json` shows the exact structural difference a patch produced.
4. Re-audit, then render. Audit is geometric only: it cannot see occlusion, transparency, material or texture failure, text layout, or splat internals, and it reports bounds as unknown until you supply them. It is not a substitute for inspecting the rendered output.

## Generate procedural scenes

`slopcamera scene generate --module <file.ts> --generator-id <id> --output scene.json --json` runs a trusted single-file TypeScript module at authoring time — the same trust class as an explicitly imported workflow module, with no sandbox. See `examples/scene-generators/grid-city.ts` for the shape: the module exports `generate(ctx)` returning `{entities, editableKeys?}`; entities carry a caller `key` and never `entityId` or `origin`, which the host stamps from the generator identity. Draw randomness only from `ctx.seed`; an identical run must reproduce identical output, and the retained record pins source, parameters, seed, and output digests. Use `ctx.lib.entityId(key)` to parent entities inside one output. `--parameters` accepts a bounded JSON object; `--into scene.json` regenerates one generator's output while preserving authored entities, other generators, and declared overrides. Asset references and non-type imports are rejected in this version.

## Admit a local glTF asset

`slopcamera scene asset admit model.glb --source-root <dir> --output manifest.json --json` validates a local GLB 2.0 against the closed profile, stores it content-addressed, derives model-space and scene-space bounds into a sibling facts manifest, and emits the mesh entity plus ready `add-asset`/`add-entity` patch operations. The source path must stay inside `--source-root`; unsupported GLB features reject rather than degrade. Apply the returned operations through `scene patch`, then feed the admission document itself to `scene audit --asset-bounds`.

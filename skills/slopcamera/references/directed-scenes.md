# Author and direct editable scenes

Use `slopcamera scene --help` to check that the installed CLI includes the directed-scene foundation. The initial renderer uses Three.js and supports explicit scene JSON, semantic edits, calibrated cameras, native media surfaces, contact sheets, and transparent video.

To author a scene from code — builder helpers, procedural generator modules, glTF admission, or geometric audit — read [scene building](scene-building.md) first. Start interactive work with `slopcamera scene init scene.json --json`, then `slopcamera scene inspect scene.json --json`. Retain the original source. Use its stable entity IDs and exact `sceneSha256` in typed patches; save each edit with `--output` to a new file. Inspect `editableControls` before changing generated parts or imported materials. Do not replace named scene parts with opaque regenerated source merely to change one color or camera.

Use `slopcamera scene plan scene.json --request request.json --json` before rendering. A frame request is:

```json
{
  "cameraId": "camera_hero",
  "selection": { "kind": "frame", "timeUs": 1000000 },
  "mode": { "kind": "beauty" }
}
```

Render with `slopcamera scene render scene.json --request request.json --json`. Inspect the actual output before delivery. A contact sheet uses explicit `timesUs`, `columns`, `cellWidth`, and `cellHeight`; a video uses a half-open microsecond range and rational `{numerator, denominator}` frame rate. Keep images, text, and diagrams in camera-view layers when their flat layout matters. A different aspect requires an explicit camera/layout decision.

Keep asset payloads local, declared, and digest-bound. Never invent provenance, units, font coverage, or color metadata to force admission. Unsupported GLB features, fonts, and color profiles need an explicit asset conversion or a different authoring workflow. The scene parser never executes source or downloads resources. Existing reviewed HTML workflows remain suitable for effects outside the closed scene profile.

For a media project, finish ordinary timeline/audio edits before V2 migration. Read `slopcamera operations show spatial.project.migrate --json` and snapshot the exact project basis. Migration retains the old media state in one immutable aggregate; old editing commands then reject the V2 head. Scene patches require both the project basis and scene digest, plus explicit all-shot or selected-shot retargeting.

Use `scene project restore` to select an earlier retained scene for explicit shots in a new project revision. Use `add-asset`/`replace-asset` and `set-mesh-geometry` for authored representation changes. Preserve the entity ID and explicitly readdress GLB node/clip indices after a payload replacement; inspect available controls again afterward.

Generated raster assets enter the scene the same way: declare the image as an `add-asset` payload with `provenance.source: "generated"`, then apply it explicitly — `set-material` with `material.map` on an authored procedural mesh for a texture, or `add-entity` a `kind: "environment"` entity (`role` plus bounded `intensity`) for a skybox. When alternatives matter, review them through [an image gallery](image-galleries.md) first and promote only the selected candidate; a frame renders at most one visible environment entity.

Prepare a camera program with `slopcamera scene project prepare-render <project-id> --input prepare.json --output prepared-render.json --json`. The input declares the exact basis, calibrated output profile, straight-alpha full-frame scene policy, and delivery output/sync policy/tier. Then run `slopcamera workflows plan directed-scene --input prepared-render.json --json` and `slopcamera workflows run directed-scene --input prepared-render.json --json`. Use `slopcamera workflows show directed-scene --json` for the complete prepared-input schema.

Use `--profile three-webgl2-hardware-v1` on scene rendering or project preparation to require the qualified macOS Metal backend. Missing or software GPU evidence rejects; no silent fallback occurs. A profile already in the request must agree with the CLI. Omit both fields for the historical software renderer. GPU identity and retained artifact hashes serve different purposes: cross-driver regeneration need not be pixel-identical.

Import saved SPZ and an optional approximate collider with `scene world import --input import.json --source-root <directory> --output-root artifacts/slopcamera/generated/<name> --json`. Declare exact payload hashes, stable IDs, scale, source up axis and uniform transform. An optional `providerMetadata` payload reference (for example a Marble `semantics_metadata` JSON export) surfaces recognized scale/ground/up-axis fields as an advisory `suggestedNormalization` in the output manifest; normalization still comes only from the explicit input fields. Historical World Labs provenance remains supported for offline replay and requires the matching world ID, approximate collider and retained provider receipt. Import needs no provider credential; paid world-generation commands were removed from current source (they remain in the historical Atet v3.2.3 release). Keep all returned assets and the splat entity, and save the consuming scene JSON inside that import output directory so its asset paths resolve relative to the scene file. Metadata dependencies preserve provenance through source-gone replay. Do not invent scale or relabel a collider as verified physics. Use `three-spark-webgl2-hardware-v1` for non-AA SPZ v2/v3, perspective cameras and at most 500,000 splats across the rendered world. This profile renders beauty only; splat depth/ID products and interleaved transparent world surfaces are unsupported. Materials and internal objects inside a splat are not ordinary editable mesh parts.

Keep receipts and the original run ID after interruption. Inspect `slopcamera runs` and reconcile the exact attempt instead of blindly repeating a possibly published operation. Candidate records preserve derivation and staleness; candidate selection does not yet replace authored footage in the V2 scene compositor. Interactive scene editing and portable simulation remain deferred; native Blender jobs retain their own simulation caches. Use the separate [directing workflow](directing-video.md) to generate and review short clips before assembling an ordinary media project.


## Direct cinematic worlds

A `slopcamera.spatial-direction` document describes beats, actions, camera coverage, and look intents semantically; its `projectDigest` must equal the scene's `sceneSha256` from `scene inspect`. Check it with `slopcamera scene direction check direction.json --scene scene.json --json`, compile proposals with `scene direction plan ... --camera <camera-id> --output plan.json`, and plan bounded variants with `scene direction gallery ... --axis performance|camera|lighting|materials|effects|sequence`. Compiled direction stays `verified: false` — it is review evidence, not applied state.

Bind declared effects through `scene effects plan` and `scene effects check` against the same scene, and bake planned simulation through `scene effects bake` when the plan calls for it. `scene temporal-audit` and `scene render-audit` report sampled evidence over explicit `--times-us` without inventing quality claims.

The `cinematic-world` built-in workflow composes exactly these operations for one admitted scene. Its input is an inert `slopcamera.spatial-recipe-pack` — one scene digest, one direction document, bounded gallery axes, up to 4 named preview render requests, optional declared effects, and optional temporal-audit inputs — wrapped with the scene document and its repository path. Plan it with `slopcamera workflows plan cinematic-world --input input.json --json`; run it with `workflows run`. The workflow never selects or promotes a candidate: registration uses `scene project add-candidate <project-id> --input <request.json>`, and selection uses `scene project select-candidate <project-id> --input <request.json>`, both after review. A recipe pack is data — it cannot register executors, source paths beyond the declared render source, permissions, secrets, or URLs.

## Direct short generated clips

Use [short-video directing](directing-video.md) for retained paid takes and accepted-shot assembly. Use the matching Slopcamera source build for those commands.

## Share native assets and camera samples

On current source, `studio asset <studio-id> --output-id <id> --asset-id <asset-id> --representation native|encoded-video [--frame <index>] --json` admits one exact successful native output or existing encode. Preserve the returned asset, binding and receipt together. Admission never executes source or silently transcodes an incompatible GLB. Use named frame indices; do not select an implicit latest derivative.

`scene camera-track <scene.json> --request <request.json> --output <track.json> --json` evaluates explicit calibrated samples without a browser. Use `slopcamera help scene` for the request contract. The native helper transfers camera intrinsics, pose, world scale and clock; it does not guarantee equal lighting or shader output between renderers. Keep native rigs in the native bundle and use a compatible static model when the portable representation cannot preserve them.

# Generate and review candidate galleries

Use an image gallery when a request leaves visual alternatives open: texture
maps, skyboxes and environment plates, backdrops, sprites, or competing design
directions. One command produces several bounded candidates in parallel,
composes a labelled contact sheet, and keeps every candidate independently
addressable with its exact prompt, digest, and provenance. Review the sheet
once, then promote the chosen candidate through an explicit authored step.
Generation never edits authored source or an existing project implicitly.

## Pick the gallery lane

Two commands share one planner and compositor:

```sh
# Portable: bounded file output, default utility model, still paid per candidate.
slopcamera image gallery 'weathered copper panel' \
  --kind texture --output-dir review/copper --json

# Durable: one tracked Gateway job per candidate, catalog model required.
slopcamera ai image gallery 'weathered copper panel' \
  --model <image-model-id> --kind texture --output-dir review/copper --json
```

The portable lane writes candidate files, `gallery.png`, and `receipt.json`
into `--output-dir`. The durable lane additionally publishes each candidate
through the generated-artifact store beneath `artifacts/slopcamera/generated/`
with a retained job record per attempt, so interrupted or ambiguous paid work
stays reconcilable. Prefer the durable lane when provenance must survive the
invocation; both lanes are paid calls per candidate with zero client retries.

## Choose the kind

`--kind` selects the prompt contract and default aspect:

| Kind | Contract | Aspect |
| --- | --- | --- |
| `image` | Plain subject, clean composition | 1:1 |
| `texture` | Seamless tileable flat-lit surface | 1:1 |
| `skybox` | Equirectangular 360 panorama, centered horizon | 2:1 |
| `backdrop` | Scenic plate for compositing | 16:9 |
| `sprite` | One isolated subject on neutral background | 1:1 |

## Control the candidate set

- `--count <n>` renders the same kind contract `n` times (up to 16).
- `--vary 'axis[=v1,v2][;axis2...]'` takes the cartesian product of
  `style`, `palette`, `material`, `lighting`, `mood`, and `detail` values.
  Omit `=values` to use the kind-aware defaults, for example
  `--vary 'style;lighting=golden hour,night'`.
- `--candidates <file.json>` supplies an explicit bounded list of
  `{id, prompt|variant}` entries. `prompt` replaces the kind template
  verbatim; `variant` appends one direction inside it.
- `--cell <n>` sets the square cell edge in pixels (64–1024, default 512).

`--candidates` is mutually exclusive with `--vary` and `--count`.

## See seams and applied renders, not flat pixels

`--kind texture` composites each cell as a 2×2 tiled repeat so tiling seams
are visible in the sheet itself; `--no-tile` keeps a flat cell, and `--tile`
opts other kinds in. `--tile` and `--no-tile` are mutually exclusive, and
receipt rows carry `tiled: true`.

On the durable lane, `--preview probe` renders each settled candidate inside a
fixed checked-in probe scene — a texture becomes the material map on lit
geometry plus four adjacent wall tiles that expose seams, a skybox becomes the
scene environment lighting a reflective sphere, a backdrop becomes a surface
behind a lit subject — and the cell shows the rendered still:

```sh
slopcamera ai image gallery 'weathered copper panel' \
  --model <image-model-id> --kind texture --preview probe \
  --output-dir review/copper --json
```

`--preview probe` is valid only for `texture`, `skybox`, and `backdrop`. The
receipt row keeps the generated candidate `path`/`sha256` and the rendered
`cellImage` `path`/`sha256` as separate fields — promotion always targets the
candidate, never the still. A failed render leaves the flat candidate in the
sheet with a warning.

## Review whole-scene variants

`slopcamera ai scene gallery` renders a base scene's bounded typed variants —
environment swaps, material changes, palette or transform axes expressed as
`slopcamera.spatial-scene-patch` operations — into the same kind of labelled
contact sheet, with no paid calls:

```sh
slopcamera ai scene gallery scene.json \
  --variants gallery.variants.json --output-dir review/world --json
```

```json
{ "kind": "slopcamera.scene-variants", "schemaVersion": 1,
  "variants": [
    { "id": "dusk", "label": "Dusk",
      "patch": { "kind": "slopcamera.spatial-scene-patch", "schemaVersion": 1,
        "operations": [{ "kind": "set-color", "entityId": "entity_sky_dome", "color": "#2a1e4f" }] } }
  ] }
```

Each variant's `expectedSceneSha256` is optional and defaults to the base
digest; a mismatched value fails before any render. Every derived scene is
published at `variants/<id>/scene.json` under the output directory with its
asset payloads staged alongside — inherited payload paths resolve beside the
authored scene, variant-authored `add-asset`/`replace-asset` payload paths
resolve beside the variants file — so the derived scene re-renders
standalone. The receipt keeps the base digest, per-variant patch and derived
scene digests, the rendered still digest, and the render receipt path per row;
a failed render stays in the sheet as a failed row. `--camera` selects a scene
camera, `--time-us` picks the frame, `--cell` sizes cells.

## Review the sheet

Inspect `gallery.png` directly. Each cell carries a `#<index> <id>` label; a
failed candidate stays in the sheet as a dark cell marked `failed` so the
review covers the whole requested set. `receipt.json` rows map every index to
its path, SHA-256, media type, request ID, cell geometry, and — on the durable
lane — its job record path.

## Promote a selected candidate explicitly

A gallery never applies itself. After selecting a cell, use that candidate's
own path and digest. For a scene material or environment, declare the image
as an asset and apply it through one `scene patch` carrying the current
`expectedSceneSha256`:

```json
{ "kind": "add-asset", "asset": {
    "assetId": "asset_copper",
    "payload": { "path": "<candidate path relative to the scene file>", "sha256": "<receipt sha256>", "bytes": <n> },
    "interpretation": { "kind": "image", "width": <w>, "height": <h>, "colorSpace": "srgb", "alpha": "opaque", "mimeType": "image/png" },
    "dependencies": [],
    "provenance": { "source": "generated", "description": "Gallery candidate copper-weathered", "receiptSha256": "<receipt.json sha256>" } } },
{ "kind": "set-material", "entityId": "entity_pedestal",
  "material": { "kind": "standard", "color": "#ffffff", "opacity": 1, "roughness": 0.7, "metalness": 0.8, "map": "asset_copper" } }
```

`material.map` applies to authored procedural geometry only, and scene image
assets admit PNG/JPEG/SVG payloads. For a selected skybox, `add-entity` a
`kind: "environment"` entity referencing the image asset with
`role: "background" | "environment" | "both"` and a bounded `intensity`; at
most one visible environment entity may appear in a frame, so gate alternates
through authored `visible` flags. Keep the scene file where its asset paths
resolve, the same rule as world imports.

Outside scenes, promote by pointing the consuming step at the exact retained
path — a video `project add`, a design slot, or an `image vectorize` input —
never by copying bytes into an authored path implicitly.

For a scene-variant gallery, promotion is adopting the variant: apply the
selected patch from the variants file through `scene patch` (the receipt row
keeps its digest), or move the derived `variants/<id>/scene.json` — with its
staged payloads — to its permanent home. The authored base scene is never
edited by the gallery.

## Preserve failures and outputs

Gallery publication is no-replace: an existing `gallery.png` or
`receipt.json` in the output directory fails the command before any paid
dispatch. A failed candidate never retries inside the run; reconcile its
retained job record or receipt row before deciding a new paid command is
authorized. If every candidate fails, the labelled sheet and receipt are
still retained and the command reports `GENERATION_FAILED`.

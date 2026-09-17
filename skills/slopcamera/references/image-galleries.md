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

## Preserve failures and outputs

Gallery publication is no-replace: an existing `gallery.png` or
`receipt.json` in the output directory fails the command before any paid
dispatch. A failed candidate never retries inside the run; reconcile its
retained job record or receipt row before deciding a new paid command is
authorized. If every candidate fails, the labelled sheet and receipt are
still retained and the command reports `GENERATION_FAILED`.

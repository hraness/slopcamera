# Compose a social collage banner

Use this workflow for an editorial or social banner built from several generated visual roles, local labels, annotations, and optional diagram material. Generate the parts independently, inspect them, then assemble the selected files with the packaged local compositor. Do not ask one model call to render the final banner or important text.

## Fix the delivery frame first

Record the exact output geometry before prompting. For an X profile header, use `1500×500` unless the user or current platform tooling supplies another target. Keep important faces and title copy away from the lower-left profile-photo overlap and the outer crop margins.

Split the brief into visual roles rather than requesting several complete banners:

- one opaque background plate that establishes place, lighting, and atmosphere;
- one or more isolated subjects on transparent backgrounds;
- one motif cluster for secondary concepts;
- optional editable diagrams for literal values and relationships;
- local title, labels, circles, arrows, tape, grain, and vignette.

A role prompt should describe only that asset. Tell an isolated-asset model that the output needs a fully transparent background and no words, letters, or logos. Tell a background model to omit people when a separate character layer will cover it. This reduces accidental text, duplicate subjects, and baked-in composition decisions.

## Discover the model and controls

Inspect the current image catalog and selected model instead of naming a remembered “latest” model:

```sh
slopcamera ai models list --type image --json
slopcamera ai models show <image-model-id> --json
```

Check that the model reports image output, the intended size or aspect control, and provider options for transparent PNG output before relying on them. Keep provider options in a private physical file because the same surface may contain sensitive values:

```sh
cat > transparent-provider-options.json <<'JSON'
{
  "openai": {
    "background": "transparent",
    "outputFormat": "png",
    "quality": "high"
  }
}
JSON
chmod 600 transparent-provider-options.json
```

That object is an example for a compatible OpenAI image model, not a portable option set. Use only namespaces and fields reported for the selected model. An opaque background plate normally needs a separate options file without `background: "transparent"`.

## Generate independent roles in parallel

Write one prompt file per role and retain it beside the collage manifest. Start independent text-only generations concurrently when the agent host supports parallel tool calls. Each command remains one durable paid job with its own output and receipt:

```sh
vercel env run -- bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js" ai image generate \
  --model <image-model-id> \
  --prompt-file prompts/background.txt \
  --size 1536x1024 \
  --provider-options opaque-provider-options.json \
  --json

vercel env run -- bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js" ai image generate \
  --model <image-model-id> \
  --prompt-file prompts/character-sticker.txt \
  --size 1024x1024 \
  --provider-options transparent-provider-options.json \
  --json
```

Do not hide several semantic roles in `--count`; they need separate prompts and retained requests. Use an [image gallery](image-galleries.md) when a role needs competing visual alternatives. Text-only generation does not authorize uploading local media. If a role needs a local reference, name that exact file and add `--allow-cloud-upload` only when the task already authorizes its upload.

Inspect every candidate before composition. Check background alpha for isolated layers, accidental writing, duplicated limbs or objects, clipped silhouettes, and whether the visual metaphor still reads at banner size. A successful receipt does not establish those facts.

## Render literal facts as an editable diagram

Use a Slopcamera diagram when the banner needs a pipeline, architecture, values, or named relationships. Keep its `.diagram.json` source and render the PNG locally:

```sh
slopcamera diagram check work/token-flow.diagram.json --strict
slopcamera diagram render work/token-flow.diagram.json
```

Place that PNG as a `paper` image layer. The diagram remains editable and factual while the surrounding composition can stay loose and expressive.

## Author the collage manifest

The packaged compositor accepts local PNG, JPEG, and WebP inputs. Paths are relative to the manifest unless absolute. Every `x` and `y` identifies the layer center. Array order is back-to-front.

```json
{
  "schemaVersion": 1,
  "canvas": {
    "width": 1500,
    "height": 500,
    "color": "#100a1c",
    "background": {
      "path": "../generated/background.png",
      "position": "centre"
    }
  },
  "layers": [
    {
      "kind": "image",
      "path": "../generated/character.png",
      "x": 255,
      "y": 258,
      "width": 330,
      "rotation": -4,
      "treatment": {
        "kind": "sticker",
        "border": 12,
        "borderColor": "#ffffff",
        "shadow": { "dx": 10, "dy": 14, "blur": 14, "opacity": 0.5 }
      }
    },
    {
      "kind": "image",
      "path": "token-flow.light.png",
      "x": 760,
      "y": 430,
      "width": 850,
      "rotation": -1.5,
      "treatment": {
        "kind": "paper",
        "padding": 26,
        "color": "#faf5e8"
      }
    },
    {
      "kind": "tape",
      "x": 430,
      "y": 325,
      "width": 120,
      "height": 38,
      "rotation": -38,
      "color": "#f8ebaa",
      "opacity": 0.82
    },
    {
      "kind": "text",
      "text": "275B TOKENS",
      "x": 760,
      "y": 64,
      "fontSize": 58,
      "fontFamily": "sans",
      "fontWeight": 900,
      "fill": "#ffe05a",
      "stroke": "#3c1450",
      "strokeWidth": 4,
      "rotation": 1
    },
    {
      "kind": "ellipse",
      "x": 1210,
      "y": 250,
      "width": 350,
      "height": 330,
      "rotation": -5,
      "color": "#ff5048",
      "strokeWidth": 8
    },
    {
      "kind": "arrow",
      "from": { "x": 1080, "y": 130 },
      "to": { "x": 1150, "y": 180 },
      "bend": 0.25,
      "color": "#ff5048",
      "width": 8
    }
  ],
  "effects": {
    "grain": 0.18,
    "grainSeed": 7,
    "vignette": 0.35,
    "chromaticShift": 2
  }
}
```

Image treatments are `plain`, `sticker`, and `paper`. Text supports `sans`, `serif`, and `mono`, newline-separated rows, fill, stroke, weight, alignment, and rotation. Annotation layers are `arrow`, `ellipse`, and `tape`. The compositor bounds canvas size, input bytes, decoded pixels, layer count, text, geometry, and effects; it rejects remote URLs and never replaces an existing output.

Render through the version-matched packaged skill:

```sh
skill_root="$(slopcamera skill path)"
bun "$skill_root/scripts/compose-social-collage-banner.ts" \
  --manifest /absolute/banner.manifest.json \
  --output /absolute/banner-v1.png
```

The command writes the PNG and a same-stem `.receipt.json` containing the manifest digest, exact input paths and digests, output digest, canvas, and layer count. Save a new manifest or output name for each material revision.

## Inspect the delivered pixels

Open the final PNG and inspect it at full size. Also inspect crops around the title, faces, high-contrast annotations, paper edges, and each platform exclusion zone. Confirm:

- the file has the exact requested dimensions;
- text is local, legible, and free of missing-glyph boxes;
- transparent assets have no opaque square or dark fringe;
- paper clippings and tape stay behind labels that must remain readable;
- chromatic shift and grain do not damage small text;
- factual diagram labels remain accurate;
- the composition still reads when scaled down.

Keep the prompt files, provider-option digests, generated receipts, diagram source, collage manifest, compositor receipt, and rejected attempts that explain a selection or recovery.

## Recover paid failures deliberately

Run each paid command with zero client retries. If a generation fails or is interrupted, inspect its retained job path and reconciliation state before doing anything else. Do not automatically resubmit an ambiguous attempt. A deliberate replacement call is appropriate only after reconciliation and within the task's existing spending authority. The local compositor is deterministic and unpaid, so layout revisions should happen there rather than through more model calls.

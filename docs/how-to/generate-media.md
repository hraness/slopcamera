# Generate images, video, or narration

Use Vercel AI Gateway when a project needs generated media or a cloud transcript. Keep the intended subject, reference files, duration and delivery role explicit. Model discovery is live; the examples below require real IDs returned by your current catalog.

## Discover a compatible model

```sh
slopcamera ai models list --type image --json
slopcamera ai models list --type video --json
slopcamera ai models list --type speech --json
slopcamera ai models list --type transcription --json
slopcamera ai models show <model-id> --json
```

Check the model's actual input types and settings. A video model may not accept first/last frames or a requested duration; a streaming-only transcription entry is not a batch transcription model. For a long prompt, use a file so shell quoting cannot alter it.

## Supply credentials for this invocation

Slopcamera reads `AI_GATEWAY_API_KEY`, falling back to `VERCEL_OIDC_TOKEN`. Make your Gateway key available through your local secret manager or process environment, then run the `slopcamera` commands directly. This path needs no Vercel CLI, linked project, or deployment.

If you already use a linked Vercel project, environment injection is an optional alternative:

```sh
vercel env run -- slopcamera ai models list --type image --json
```

Do not put credentials on argv, in source, in a project, or in a provider-options file. The [Vercel runbook](../vercel.md) covers that integration. Generation can incur provider charges; discovery does not authorize spending beyond the task's scope.

## Or use hosted image generation

Without a Gateway credential, prepaid Hraness Credits run prompt-only image generation through the hosted API at `api.slopcamera.com`:

```sh
slopcamera credits topup        # prints a hosted checkout URL
slopcamera credits wait         # installs the returned device token
slopcamera credits status       # reports balance and pending claims
```

```sh
slopcamera ai image generate --hosted --model openai/gpt-image-1 --prompt 'a brass astrolabe on a map' --json
```

The hosted operation accepts a model and a prompt only; Gateway-only flags such as `--image`, `--aspect-ratio`, and `--count` are rejected. The admitted model ids are listed at `https://api.slopcamera.com/v1/models`. With a stored device token and no Gateway credential, `ai image generate` uses the hosted API automatically; `--hosted` forces it when both are configured. `SLOPCAMERA_CREDITS_TOKEN` overrides the stored token for ephemeral environments, and `slopcamera credits forget` removes local state. The token is stored owner-only under the CLI state root and never appears in argv, receipts, or output.

## Generate the selected media

Run the command that matches the required output:

```sh
slopcamera ai image generate --model <image-model-id> --prompt-file image-brief.txt --aspect-ratio 16:9 --json
slopcamera ai video generate --model <video-model-id> --prompt-file shot-brief.txt --image product.png --duration 6 --aspect-ratio 16:9 --allow-cloud-upload --json
slopcamera ai speech generate --model <speech-model-id> --text-file script.txt --format wav --json
slopcamera ai transcribe interview.wav --model <transcription-model-id> --format all --allow-cloud-audio-upload --json
```

For optional Vercel injection, prefix each command with `vercel env run --`. If `slopcamera` is a shell function from [source installation](use-current-source.md), use `vercel env run -- bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js"` instead: a child process cannot launch a shell function. Environment injection applies only to that invocation.

A local reference requires acknowledgement of uploading those exact files. Transcription has its separate audio-upload flag. Ordinary user-supplied URLs must meet the public-reference rules; do not put a signed or credential-bearing URL into shell history.

Use `slopcamera help ai` for masks, references, counts and other common flags. When a provider exposes an additional control, retain a private bounded JSON options file, inspect it with `slopcamera ai provider-options inspect`, and pass `--provider-options`. Provider fallback models and duplicate provider sample-count controls are rejected. Raw options are invocation-scoped; a resumed workflow may require the same file again.

## Review alternatives as a gallery

Image galleries ship in v3.3.1. When the request leaves visual alternatives open — texture maps, skyboxes, backdrops, sprites, or competing design directions — generate a labelled candidate gallery instead of a single output:

```sh
slopcamera ai image gallery 'weathered copper panel' \
  --model <image-model-id> --kind texture --output-dir review/copper --json
```

Each candidate runs as its own tracked paid job (bounded parallelism, zero client retries) and keeps its durable artifact path, prompt, digest, and job record. The output directory gains a `gallery.png` contact sheet with `#<index> <id>` labels and a `receipt.json` mapping every candidate to its evidence; failed cells stay in the sheet marked `failed` with their job records retained.

Choose candidates with `--count` (repeated generations of the same contract), `--vary 'style;lighting=golden hour,night'` (a cartesian product over `style`, `palette`, `material`, `lighting`, `mood`, `detail`), or `--candidates <file.json>` (an explicit `[{id, prompt|variant}]` list). `--kind` selects the prompt contract — `texture` tiles, `skybox` is a 2:1 equirectangular panorama, `backdrop` is a 16:9 plate, `sprite` isolates one subject.

Texture cells composite as a 2×2 tiled repeat so seams are visible in the sheet (`--no-tile` keeps a flat cell; `--tile` opts other kinds in). On the durable lane, `--preview probe` renders each settled `texture`, `skybox`, or `backdrop` candidate inside a fixed probe scene — on lit geometry, as the environment, or behind a lit subject — so the sheet shows applied evidence rather than flat pixels:

```sh
slopcamera ai image gallery 'weathered copper panel' \
  --model <image-model-id> --kind texture --preview probe --output-dir review/copper --json
```

The receipt keeps the generated candidate `path`/`sha256` and the rendered `cellImage` `path`/`sha256` as separate fields; a failed render keeps the flat candidate with a warning. Promotion always targets the candidate artifact, never the review still.

Inspect the sheet, then promote the chosen candidate explicitly: point the consuming command at its retained path, or declare it as a scene image asset and apply it with a `scene patch` (`set-material` `map` for textures, an `environment` entity for a skybox). Gallery output never overwrites existing files and never edits authored source implicitly.

To compare bounded whole-scene variants rather than loose images, `slopcamera ai scene gallery <scene.json> --variants <file.json> --output-dir <directory>` applies typed scene patches (materials, transforms, colors, assets, cameras) to an authored scene, renders each derived scene through the qualified renderer, and composites the beauty stills into the same labelled sheet — with no paid calls. The receipt records the base scene digest, per-variant patch and derived scene digests, and the render receipt per row; see [spatial scenes](../spatial-scenes.md).

The portable `slopcamera image gallery '<subject>' --output-dir <directory>` lane composes the same sheet without the durable job records; it defaults to the utility image model like `image generate`.

## Inspect and retain the result

Generation returns content-addressed media and receipts beneath `artifacts/slopcamera/generated/`. Check actual picture or sound, identity fidelity, duration and fulfillment count before selecting a result. A provider response can succeed while local media admission fails; preserve the returned paid bytes and failure evidence.

When an ordinary project should consume a result, use the exact suggested `project add` command. It binds the selected output without guessing its path or role.

Do not automatically repeat an ambiguous paid call. Zero client retries do not prove the provider performed only one internal attempt. Inspect the receipt, reconcile supported retained state, and make any new paid request an explicit decision within the existing authorization.

For several shots, accepted takes, endpoint continuity and one retained budget, use [short-video directing](../directing-video.md). Its private reference-hosting adapter is separate from ordinary URL inputs; Blob charges remain outside the model estimate.

For one explicitly named output file, the portable lane is `slopcamera image generate '<prompt>' --output image.webp`. That lane has its own bounded model contract and does not expose the full content-addressed `ai` grammar. Vectorization is a separate local operation and requires no Gateway credential.

In v3.3.1, use `slopcamera image icon '<subject>' --purpose mark --output mark.svg` for a compact product mark. Marks use bold masses and negative space, are reviewed for recognition at 16 and 32 pixels, and reject sparse, elongated, or overly complex vectors. Use `--purpose illustration` for the related marketing illustration. Illustrations permit simple isometric structure but reject hairlines, dense fills, and detail that disappears at 64 pixels. `illustration` remains the compatibility default.

Both purposes normalize one style-locked Gateway raster to canonical ink-on-transparent pixels, trace it with the local vectorizer, run deterministic geometry gates, and, unless `--rounds 1`, use a purpose-specific vision critique whose correction drives the next attempt. `--ink` selects the single ink color and `--keep-raster` retains the normalized intermediate PNG.

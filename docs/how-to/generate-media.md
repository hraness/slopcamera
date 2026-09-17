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

Slopcamera reads `AI_GATEWAY_API_KEY`, falling back to `VERCEL_OIDC_TOKEN`. Set an existing credential in the process environment or use an already linked Vercel project:

```sh
vercel env run -- bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js" ai models list --type image --json
```

Do not put credentials on argv, in source, in a project, or in a provider-options file. The [Vercel runbook](../vercel.md) covers that integration. Generation can incur provider charges; discovery does not authorize spending beyond the task's scope.

## Generate the selected media

Run the command that matches the required output:

```sh
slopcamera ai image generate --model <image-model-id> --prompt-file image-brief.txt --aspect-ratio 16:9 --json
slopcamera ai video generate --model <video-model-id> --prompt-file shot-brief.txt --image product.png --duration 6 --aspect-ratio 16:9 --allow-cloud-upload --json
slopcamera ai speech generate --model <speech-model-id> --text-file script.txt --format wav --json
slopcamera ai transcribe interview.wav --model <transcription-model-id> --format all --allow-cloud-audio-upload --json
```

If credentials come from Vercel, replace the leading `slopcamera` in each command above with `vercel env run -- bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js"`. The [source installation](use-current-source.md) defines that exported root; its shell function cannot be launched by Vercel. Environment injection applies only to the invoked child, not subsequent commands.

A local reference requires acknowledgement of uploading those exact files. Transcription has its separate audio-upload flag. Ordinary user-supplied URLs must meet the public-reference rules; do not put a signed or credential-bearing URL into shell history.

Use `slopcamera help ai` for masks, references, counts and other common flags. When a provider exposes an additional control, retain a private bounded JSON options file, inspect it with `slopcamera ai provider-options inspect`, and pass `--provider-options`. Provider fallback models and duplicate provider sample-count controls are rejected. Raw options are invocation-scoped; a resumed workflow may require the same file again.

## Review alternatives as a gallery

When the request leaves visual alternatives open — texture maps, skyboxes, backdrops, sprites, or competing design directions — generate a labelled candidate gallery instead of a single output:

```sh
slopcamera ai image gallery 'weathered copper panel' \
  --model <image-model-id> --kind texture --output-dir review/copper --json
```

Each candidate runs as its own tracked paid job (bounded parallelism, zero client retries) and keeps its durable artifact path, prompt, digest, and job record. The output directory gains a `gallery.png` contact sheet with `#<index> <id>` labels and a `receipt.json` mapping every candidate to its evidence; failed cells stay in the sheet marked `failed` with their job records retained.

Choose candidates with `--count` (repeated generations of the same contract), `--vary 'style;lighting=golden hour,night'` (a cartesian product over `style`, `palette`, `material`, `lighting`, `mood`, `detail`), or `--candidates <file.json>` (an explicit `[{id, prompt|variant}]` list). `--kind` selects the prompt contract — `texture` tiles, `skybox` is a 2:1 equirectangular panorama, `backdrop` is a 16:9 plate, `sprite` isolates one subject.

Inspect the sheet, then promote the chosen candidate explicitly: point the consuming command at its retained path, or declare it as a scene image asset and apply it with a `scene patch` (`set-material` `map` for textures, an `environment` entity for a skybox). Gallery output never overwrites existing files and never edits authored source implicitly.

The portable `slopcamera image gallery '<subject>' --output-dir <directory>` lane composes the same sheet without the durable job records; it defaults to the utility image model like `image generate`.

## Inspect and retain the result

Generation returns content-addressed media and receipts beneath `artifacts/slopcamera/generated/`. Check actual picture or sound, identity fidelity, duration and fulfillment count before selecting a result. A provider response can succeed while local media admission fails; preserve the returned paid bytes and failure evidence.

When an ordinary project should consume a result, use the exact suggested `project add` command. It binds the selected output without guessing its path or role.

Do not automatically repeat an ambiguous paid call. Zero client retries do not prove the provider performed only one internal attempt. Inspect the receipt, reconcile supported retained state, and make any new paid request an explicit decision within the existing authorization.

For several shots, accepted takes, endpoint continuity and one retained budget, use [short-video directing](../directing-video.md) on a compatible current-source CLI. Its private reference-hosting adapter is separate from ordinary URL inputs; Blob charges remain outside the model estimate.

For one explicitly named output file, the portable lane is `slopcamera image generate '<prompt>' --output image.webp`. That lane has its own bounded model contract and does not expose the full content-addressed `ai` grammar. Vectorization is a separate local operation and requires no Gateway credential.

Without a Gateway credential, add `--hosted` to that portable lane to generate through a gateway Hraness operates and pay with prepaid credits held by this device; `slopcamera credits topup` creates the payment link and `slopcamera credits wait` stores the device token after payment. The [credits reference](../reference/credits.md) covers the commands, the exit code, and the handoff an agent follows.

For a scalable isometric line-art icon, `slopcamera image icon '<subject>' --output icon.svg` chains the two: one style-locked Gateway raster is normalized to canonical ink-on-transparent pixels, traced by the local vectorizer, and — unless `--rounds 1` — scored by a vision model whose prompt fix drives the next attempt. The SVG is ink-only with a transparent background; `--ink` recolors the strokes and `--keep-raster` retains the intermediate line-art PNG.

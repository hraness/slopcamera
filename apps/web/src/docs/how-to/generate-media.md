The `slopcamera ai` commands produce images, video, speech, and transcripts through the caller's own Vercel AI Gateway access: you supply a credential for one invocation, acknowledge each upload explicitly, and keep every output and receipt on your machine. Keep the intended subject, reference files, duration, and delivery role explicit before you spend anything. Model discovery is live, so the examples below use placeholder IDs that your current catalog must return.

Generation runs on macOS, Linux, and Windows wherever the CLI and a credential are available. Local rendering has separate runtime requirements; see [capabilities](/docs/reference/capabilities).

## Discover a compatible model

```sh
slopcamera ai models list --type image --json
slopcamera ai models list --type video --json
slopcamera ai models list --type speech --json
slopcamera ai models list --type transcription --json
slopcamera ai models show <model-id> --json
```

Check the model's actual input types and settings before paying for a call: a video model may not accept first and last frames or a requested duration, and a streaming-only transcription entry cannot serve the batch `ai transcribe` command. For a long prompt, use a file so shell quoting cannot alter it.

## Supply credentials for one invocation

Slopcamera reads `AI_GATEWAY_API_KEY` first, falling back to `VERCEL_OIDC_TOKEN`. Make your Gateway key available through your local secret manager or process environment, then run the commands directly. A direct key needs no Vercel CLI, linked project, or deployment.

If you already use a linked Vercel project, environment injection is an optional alternative:

```sh
vercel env run -- slopcamera ai models list --type image --json
```

If `slopcamera` is a shell function from a [source build](/docs/how-to/install-from-source), Vercel cannot launch it; invoke the built entrypoint instead:

```sh
vercel env run -- bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js" ai models list --type image --json
```

Environment injection applies only to that child invocation, so repeat the same launcher for each generation command. Never put a credential on argv, in a source file, in a project, or in a provider-options file: Slopcamera sends it only to the fixed Gateway origin and never persists it. Generation can incur provider charges, and discovery does not authorize spending beyond the task's scope.

## Or pay for hosted images with Hraness Credits

Prompt-only image generation can also run on the hosted API at `api.slopcamera.com`, paid with prepaid Hraness Credits instead of your own Gateway account:

```sh
slopcamera credits topup    # prints a checkout URL
slopcamera credits wait     # stores the device token after payment
slopcamera credits status   # shows the balance
slopcamera ai image generate --hosted --model <image-model-id> --prompt-file image-brief.txt --json
```

The hosted route takes one model and one prompt per call and rejects Gateway-only flags such as `--image`, `--aspect-ratio`, and `--count`. `https://api.slopcamera.com/v1/models` lists the models it accepts. With a stored device token and no Gateway credential, `ai image generate` uses the hosted API automatically; `--hosted` selects it when both are set. `SLOPCAMERA_CREDITS_TOKEN` supplies the token from the environment instead, and `slopcamera credits forget` removes the stored token. The token is stored with owner-only permissions and never appears in argv, receipts, or logs.

## Generate the selected media

Run the command that matches the required output:

```sh
slopcamera ai image generate --model <image-model-id> --prompt-file image-brief.txt --aspect-ratio 16:9 --json
slopcamera ai video generate --model <video-model-id> --prompt-file shot-brief.txt --image product.png --duration 6 --aspect-ratio 16:9 --allow-cloud-upload --json
slopcamera ai speech generate --model <speech-model-id> --text-file script.txt --format wav --json
slopcamera ai transcribe interview.wav --model <transcription-model-id> --format all --allow-cloud-audio-upload --json
```

Each local file you name for upload needs its acknowledgement: `--allow-cloud-upload` for image and video references, `--allow-cloud-audio-upload` for transcription audio. Ordinary URL inputs must be public, credential-free HTTPS links; never put a signed or credential-bearing URL into shell history.

Use `slopcamera help ai` for masks, references, counts, and other common flags. When a provider exposes an additional control, keep it in a private bounded JSON file, inspect it with `slopcamera ai provider-options inspect options.json`, and pass `--provider-options`. Fallback models and duplicate sample-count controls are rejected, and raw options are invocation-scoped: a resumed workflow may need the same file again.

## Inspect and retain the result

Generation returns content-addressed media and receipts beneath `artifacts/slopcamera/generated/`. Check the actual picture or sound, identity fidelity, duration, and fulfillment count before selecting a result. A provider response can succeed while local media admission fails; preserve the returned paid bytes and the failure evidence.

When an ordinary project should consume a result, run the exact `project add` command the receipt suggests: it binds the selected output without guessing a path or role. To cut a result into a delivery, see [edit and deliver video](/docs/how-to/edit-video).

Do not automatically repeat an ambiguous paid call. Zero client retries do not prove the provider made only one internal attempt. Inspect the receipt, reconcile the retained state, and treat any new paid request as an explicit decision inside the existing authorization.

## Related surfaces

- For several shots, accepted takes, endpoint continuity, and one retained budget, use [direct short generated clips](/docs/how-to/direct-takes); its private reference-hosting adapter is separate from ordinary URL inputs.
- For one explicitly named output file, `slopcamera image generate '<prompt>' --output image.webp` is the portable lane: its bounded model contract does not expose the full `ai` grammar.
- `slopcamera image vectorize` is a separate local operation and needs no Gateway credential.
- The [capability reference](/docs/reference/capabilities) lists which other commands can cross the network boundary.

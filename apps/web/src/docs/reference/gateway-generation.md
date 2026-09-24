Slopcamera generates images, video, speech, and batch transcripts through the caller's own Vercel AI Gateway access. The `slopcamera ai` commands discover support from the live catalog rather than a checked-in model list, so the set of available models is whatever your Gateway account exposes at invocation time. Generation can incur provider charges on your account.

Prompt-only images can instead run on the hosted API at `api.slopcamera.com` and bill prepaid Hraness Credits rather than your Gateway account. [Generate images, video, and narration](/docs/how-to/generate-media) covers the `slopcamera credits` commands and the `--hosted` flag.

## Credentials

A request reads `AI_GATEWAY_API_KEY` first, falling back to `VERCEL_OIDC_TOKEN`, from the local process environment. The credential is sent only to the fixed Gateway origin over HTTPS and is never persisted, printed, placed on argv, or written into projects or receipts. A direct key needs no Vercel CLI; with a linked Vercel project, `vercel env run -- <command>` injects it for one invocation.

```sh
slopcamera ai models list --type image --json
slopcamera ai models list --type video --json
slopcamera ai models list --type speech --json
slopcamera ai models list --type transcription --json
slopcamera ai models show <model-id> --json
```

Check a model's actual input types and settings before paying: a video model may not accept first and last frames or a requested duration, and a streaming-only transcription entry cannot serve the batch `ai transcribe` command.

## Commands

```sh
slopcamera ai image generate --model <image-model-id> --prompt-file brief.txt --aspect-ratio 16:9 --json
slopcamera ai video generate --model <video-model-id> --prompt-file shot.txt --image product.png --duration 6 --aspect-ratio 16:9 --allow-cloud-upload --json
slopcamera ai speech generate --model <speech-model-id> --text-file script.txt --format wav --json
slopcamera ai transcribe interview.wav --model <transcription-model-id> --format all --allow-cloud-audio-upload --json
```

Each named local file needs its acknowledgement: `--allow-cloud-upload` for image and video references, `--allow-cloud-audio-upload` for transcription audio. Public credential-free HTTPS URLs are an alternative when the live catalog permits URL input; private or credential-bearing targets reject, and receipts keep only the URL digest. Provider extras go through a bounded private JSON file inspected with `slopcamera ai provider-options inspect options.json` and passed as `--provider-options`; fallback models and duplicate sample-count fields reject.

Two bounded recipes sit beside the `ai` grammar. `slopcamera image icon <subject> --output <file.svg>` combines a style-locked Gateway raster, local ink extraction, and VTracer tracing into a canonical isometric line-art SVG, with optional vision-model critique rounds. `slopcamera image gallery` and `slopcamera ai image gallery` fan one subject out to bounded parallel candidates, keep every candidate with its provenance, and compose a labelled contact sheet for review; nothing is promoted into authored source without an explicit selection.

## Paid-call behavior

The client sets `maxRetries: 0`, and Slopcamera never resubmits an ambiguous paid call. AI Gateway can still route or fail over one request across multiple providers, so one command may carry several provider attempts and a provider timeout can still incur charges. Reconcile the retained receipt before deciding to spend again.

Outputs and immutable receipts land under `artifacts/slopcamera/generated/`, recording catalog and model revision, settings, input digests, warnings, fulfillment counts, and the suggested next command. Generated media is fully decoded locally before an import command is emitted; invalid paid bytes stay quarantined with no import path. Headerless PCM, L16, A-law, and mu-law speech output is saved and hashed but receives no project-add command until converted with explicit sample metadata.

For the task walkthrough, see [Generate images, video, and narration](/docs/how-to/generate-media). For budgeted multi-shot work, [Direct short generated clips](/docs/how-to/direct-takes) uses a separate acknowledged reference-hosting adapter. [Capabilities](/docs/reference/capabilities) lists every surface that can cross the network boundary.

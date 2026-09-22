Turn a shot recipe into reviewed, retained video takes and an editable project. Each shot names its prompt, model, duration, and output settings, and a later shot can open on the accepted predecessor's final decoded frame. Slopcamera retains the requests, media, review decisions, dependency identities, and estimated spending across revisions.

The `slopcamera direct` commands ship in v{{PUBLISHED_VERSION}}. Generation uses a caller-owned Vercel AI Gateway credential, and endpoint extraction and assembly use local FFmpeg and FFprobe. Check `slopcamera help direct` and `{{DOCTOR_COMMAND}}` first. For one generated artifact without takes or continuity, use [Generate images, video, and narration](/docs/how-to/generate-media).

Continuity comes from images and explicit prompts. An endpoint image does not preserve a model's neural checkpoint, motion history, hidden surfaces, or complete world state, so inspect every join before accepting a continuation.

## Prepare a recipe

```sh
slopcamera ai models list --type video --json
slopcamera direct init film.recipe.json --json
```

Edit the starter to describe the shots you want. This example uses two five-second shots, with the second opening on the first shot's accepted endpoint:

```json
{
  "kind": "slopcamera.directing-recipe",
  "schemaVersion": 1,
  "id": "direct_atrium",
  "title": "Atrium study",
  "shots": [
    {
      "id": "opening",
      "prompt": "A silver sculpture stands on a stone pedestal in a sunlit atrium. A slow camera push approaches the sculpture. Keep the object rigid and the lighting steady.",
      "model": "minimax/minimax-h3-max",
      "durationSeconds": 5,
      "resolution": "480p",
      "aspectRatio": "16:9",
      "fps": 24
    },
    {
      "id": "orbit",
      "prompt": "Continue from the supplied opening image. The camera moves slowly clockwise around the same silver sculpture and stone pedestal. Preserve their proportions and the atrium's daylight.",
      "model": "minimax/minimax-h3-max",
      "durationSeconds": 5,
      "resolution": "480p",
      "aspectRatio": "16:9",
      "fps": 24,
      "firstFrame": { "kind": "shot-end", "shotId": "opening" }
    }
  ]
}
```

Run `slopcamera direct plan film.recipe.json --json` after editing. It checks every shot against the live Gateway model catalog and returns per-shot estimates, image transport requirements, and a first-pass total without generating media.

A recipe holds one to 64 ordered shots with unique IDs, and a `shot-end` reference must name an earlier shot. Each shot needs a nonempty prompt, a model, an integer duration of one to 60 seconds, a resolution, and an aspect ratio; `fps`, `seed`, `firstFrame`, and `lastFrame` are optional. A `lastFrame` requires a `firstFrame` and a model that supports first-and-last-frame conditioning. Recipes accept no raw provider options, per-take sample counts, video references, or audio settings. One directing ID retains up to 128 recipe versions and 1024 attempts within a 32 MiB state bound. The preflight currently admits batch video models with unambiguous per-second catalog pricing for the selected resolution.

## Anchor a shot to a retained image

Render a calibrated frame through the [spatial scene workflow](/docs/how-to/direct-scenes), then import the exact image path the renderer returned:

```sh
slopcamera scene render product.scene.json --request frame.json --json
slopcamera direct anchor --input path/to/rendered-frame.png --json
```

`anchor` copies only the named image into retained local storage and returns its path, byte count, SHA-256, media type, and dimensions. Set a shot's `firstFrame` to an object with `kind` of `image` and `source` equal to that complete returned reference, and use another returned reference for `lastFrame` when you want to constrain the ending composition. Preserve the returned fields and never invent or hand-edit hashes.

Supported anchors are single unrotated PNG, JPEG, or WebP images of at most 30 MiB and 4096 pixels per side. Importing an anchor is local and does not upload it; each generation call separately acknowledges uploading its exact retained image references.

## Budget and generate each take

Start once with the total USD amount authorized for this directing ID. The `5.00` below is an example budget, not a model price:

```sh
slopcamera direct start film.recipe.json --budget-usd 5.00 --json
```

Starting retains the recipe and budget without generating video, and reusing the ID cannot reset its spending. Budgets accept positive values with at most six decimal places and are stored as integer microdollars. The retained amounts are catalog estimates rather than settled invoices or a provider-enforced cap, and completed, rejected, and ambiguous calls all keep their reservations against the budget.

Make `AI_GATEWAY_API_KEY` available in the local process environment, then generate the first take. Slopcamera falls back to `VERCEL_OIDC_TOKEN` when the key is absent. The Vercel CLI is optional; a linked workspace can prefix an installed CLI command with `vercel env run --`. [Credential setup](/docs/how-to/generate-media) also covers the source-build shell function. Keep credentials out of recipes, prompts, command arguments, and retained output.

```sh
slopcamera direct generate direct_atrium --shot opening --attempt take_opening_v1 \
  --allow-paid-generation --json
```

Each new `take_<id>` permits at most one new Gateway dispatch. The command rechecks the live catalog, retains its reservation before dispatch, and saves the video and Gateway receipt before extracting the endpoint.

Check each shot's `inputTransport` in the plan. `none` means the shot has no image references, and `inline` sends the exact retained image bytes with the Gateway request. `url` means the model accepts image URLs only, so the take needs temporary private hosting on an existing Vercel Blob store: make `VERCEL_OIDC_TOKEN` with `BLOB_STORE_ID`, or `BLOB_READ_WRITE_TOKEN`, available to the CLI process, and if you set `BLOB_STORE_ID` beside a read-write token, both must name the same store. A `url` shot adds both `--allow-cloud-upload` and `--allow-reference-hosting` to the invocation, and Slopcamera hosts private copies of only that take's exact first and last images, at most two images of 30 MiB each. It verifies the copied bytes and private access before issuing signed GET URLs that expire 15 minutes after issue; credentials and signed URLs never enter retained receipts. Allow for Blob storage, operations, and transfer charges separately from the model budget, and note that URL expiry ends access without deleting the stored object.

## Review and continue

Inspect the returned video and its final frame, then record an explicit decision:

```sh
slopcamera direct inspect direct_atrium --json
slopcamera direct review direct_atrium --attempt take_opening_v1 \
  --decision accepted --note "The sculpture stays rigid and the endpoint supports the orbit." --json
```

Look for the requested subject, useful camera movement, stable geometry, and an ending composition the next shot can open on. Generate a continuation only after its predecessor is currently accepted, acknowledging the upload and the private hosting the plan requires:

```sh
slopcamera direct generate direct_atrium --shot orbit --attempt take_orbit_v1 \
  --allow-paid-generation --allow-cloud-upload --allow-reference-hosting --json
```

Reject a take with `--decision rejected` and a review note. Rejection retains the media and its spending reservation. Regeneration is a deliberate new attempt ID such as `take_orbit_v2` with another `--allow-paid-generation` invocation; Slopcamera never retries rejected output automatically.

## Revise or recover work

Save edited shot instructions under the same directing ID and activate the revision:

```sh
slopcamera direct revise direct_atrium --recipe revised.recipe.json --json
```

Changing a shot invalidates its selected take and affected descendants, and choosing a different predecessor take invalidates continuations bound to the previous one even when the prompt is unchanged. Independent shots keep valid acceptance, and `inspect` distinguishes accepted, stale, and unselected shots. Assembly requires current acceptance for every shot.

After an interruption, reconcile the exact retained attempt:

```sh
slopcamera direct resume direct_atrium --attempt take_orbit_v1 --json
```

`resume` reads authoritative local Gateway receipts and can finish missing endpoint extraction; it never starts another provider request or resumes a provider session. Repeating `generate` with an existing matching attempt ID reconciles that attempt instead of dispatching again. A `reserved` or `ambiguous` attempt can still represent a charged call: a missing local journal cannot release it, and `resume` keeps the reservation held. Choose a fresh take ID only after deliberately accepting that the earlier call may also have been charged. Check provider billing when an exact settled total matters, because one Gateway request can contain several provider attempts.

Hosted references need the same follow-through. Inspect `referenceHosting` in the generation result or error details: `cleanupRequired: true` or a cleanup state other than `deleted` means an object may remain in the private store. The per-take hosting receipt lives under `artifacts/slopcamera/private/directing-blob/<direct-id>/<take-id>/receipt.json` and contains no usable signed URL. Let a potentially active generation finish before deleting references it still needs, then run cleanup for the exact take:

```sh
slopcamera direct cleanup direct_atrium --attempt take_orbit_v1 --json
```

Cleanup verifies the exact object, conditionally deletes it, and checks its absence; it neither generates video nor releases a model spending reservation. Repeating it skips confirmed deletions and can resolve earlier uncertainty, so preserve an `uncertain` result for follow-up rather than treating a successful response as proof that every object was deleted.

## Assemble the accepted clips

```sh
slopcamera direct assemble direct_atrium --json
```

Assembly requires a current accepted take for every recipe shot. It returns an ordinary version-one `projectId` whose clips appear in recipe order with direct cuts on their measured video spans. Audio plays at unity gain inside each span and is trimmed at the cut rather than extending a clip into a black interval; the assembler does not synthesize narration or crossfade sound. For admitted YUV sources, assembly first creates a retained lossless RGB derivative and checks the decoded result, and each conversion must finish within 120 seconds and the 512 MiB media bound.

Generated media still passes local admission: self-contained MP4 or QuickTime with exactly one playable video stream, at most 60 seconds, 512 MiB, 4096 pixels per side, and 4000 decoded frames. Supported opaque 8-bit YUV video with missing color tags is recorded as `untagged-8bit-yuv-assume-bt709-v1` in the endpoint and assembly receipts; conflicting tags, HDR metadata, 10-bit formats, and alpha need separate qualification or explicit conversion.

Inspect and render the returned project like any other:

```sh
slopcamera project inspect <returned-project-id> --json
slopcamera project render plan <returned-project-id> --width 848 --height 480 --fps 24 --json
slopcamera project render run <returned-project-id> --width 848 --height 480 --fps 24 --json
```

Review the rendered join and delivery before presenting the result. Review, revision, inspection, `resume`, and assembly work without cloud credentials; hosting and `cleanup` need Blob credentials. Use [Edit and deliver video](/docs/how-to/edit-video) for trims, music, overlays, captions, and delivery dimensions.

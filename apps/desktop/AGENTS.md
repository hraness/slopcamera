<!-- kb:context scopes/apps-desktop--a98dfc0ab16f -->
# Contents

- `contracts/`, `core/`, `application/`, `code/`, `workflows/`, `html-overlay/`, and `cli/` – recording/project contracts, local edit and renderer planning, the full host operation projection and durable workflow runtime, deterministic browser-overlay authoring, and agent command surface.
- `analysis/` – the signed local Vision face-analysis helper for existing recording media.
- `assets/` – generated identity assets.
- `qualification/` – opt-in native scene, composition, and timing fixtures with retained measurements.
- `../../desktop/` – the Rust menu-bar workspace (`slopcamera-menubar`) built on `desktop-foundation`; it renders the agent outputs directory as a live menu.

# Guidelines

- Treat recording bundles, multi-asset projects, and immutable analysis sidecars as the primary API. Recordings arrive as finished bundles; this host does not capture new media.
- Consume graph contracts, references, canonical identity, generic authoring, and compilation from `@hraness/slopcamera/code`. Keep only host projection, durable scheduling, and project authority here; never fork the portable workflow core.
- Store recordings, projects, generated artifacts, and private metadata under `artifacts/slopcamera/{recordings,projects,generated,private}/`. Mutation leases and other secret-free state belong in the machine-global per-user CLI state root. Read Gateway credentials directly from `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`; never persist, log, or pass them in argv.
- Keep raw media and events immutable. Edits create plans and derivatives. Keep displays distinct and system audio, microphone, and webcam independently addressable.
- Map every source into one checked project clock using integer microseconds while retaining native timestamps. Reject overlapping/inverted foreign ranges and apply edits once in project time.
- Treat recorded media, titles, focus, cursor, and typing evidence as sensitive.
- Keep face detection offline in the signed Vision helper. Persist geometry and continuity IDs only, never identity, embeddings, names, crops, thumbnails, or cloud requests. Face camera moves bind immutable analysis, selected tracks, placement/geometry, and output aspect; stale evidence rejects.
- Keep planning, extraction, music analysis, transcription, and editing local. Gateway scene analysis uploads only selected bounded derived frames after `--allow-cloud-upload`. Gateway media commands upload only exact caller-named bounded media after modality acknowledgement, never a bundle, recording metadata, siblings, or reused consent.
- Discover Gateway support from the live public catalog rather than a checked adapter allowlist. Expose every matching live image, image-language, video, speech, and batch-transcription model; keep streaming-only transcription discoverable but reject it from batch commands. Validate model kind, inputs, and settings locally, reject fallback-model and duplicate sample-count fields, set client retries to zero, and never resubmit an ambiguous paid call; one Gateway request may still contain several provider attempts.
- Apply effects only through typed bounded non-destructive transforms. Use argv arrays, owned kernels, and fresh repository-local outputs; never interpolate caller text into filters or overwrite sources. Parse manifests, JSONL, native messages, tool results, and CLI edits from `unknown`.
- Keep HTML overlays deterministic and transparent: exact approved library locks, local bound assets, integer-microsecond frame time, seeded randomness, fixed browser settings, and denied ambient browser networking. Render them to verified alpha media before the ordinary overlay compositor sees them.
- Keep ordinary build, lint, typecheck, and TypeScript tests portable. Exercise the Vision analysis helper only through explicit `*:macos` commands.
- The menu-bar companion is a disposable client: it reads the agent outputs directory, renders filename descriptions with image previews, and opens or reveals files. Product authority stays in the CLI.

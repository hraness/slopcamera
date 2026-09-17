# Contents

- Canonical root modules – Slopcamera CLI, imperative workflow, diagram, canvas, artifact, direct Gateway generation, operation, MCP, and desktop-integration contracts.
- `credits.ts` and `hosted-generate.ts` – the `slopcamera credits` protocol over `@hraness/credits-foundation`, the `hraness-credits-required-v1` handoff, and the opt-in hosted generation client for the Hraness gateway.
- `icon.ts` – the isometric line-art icon pipeline: style-locked Gateway raster, local ink extraction, VTracer trace, and bounded vision-model critique rounds.
- `code/` – canonical portable declarative graph authoring, closed public capability projection, compiler, plan, and execution contracts.
- `vectorize/` – bounded local raster decoding, VTracer supervision, SVG sanitization, measurement, provenance, and worker isolation.
- `*.test.ts` and `*.property.test.ts` – deterministic examples, parser laws, and standalone consumer evidence.

# Guidelines

- Keep canonical implementation in this source root and expose new behavior only through `slopcamera` commands, `slopcamera.*` operations, the additive `./code` graph SDK, and the compatible `./workflow` SDK.
- Preserve the root module and `./workflow` v0.8 imperative APIs. Keep declarative authoring in `./code`, lower-level compiler contracts in `./code/advanced`, and testing or built-in workflow helpers outside the public export map.
- Keep the declarative SDK and portable core canonical. The complete local host consumes that graph model and owns durable media execution. The Desktop shell supplies only native capture, permissions, and UI.
- Treat explicitly imported workflow modules as trusted current-user Bun code. Compile each graph against one closed host projection and reject unsupported capabilities before executor or resource admission. Never add an open operation-registration hook.
- Keep portable source independent of repository-only packages and state, caller-selected executable code, arbitrary network URLs, and ambient credentials.
- Keep the `./workflow` compatibility surface dependency-free. It may compose only the typed public operation registry, must parse foreign input, bound step dispatch, drain dispatched operations before returning, retain completed-step receipts on failure, and must not dynamically import authored code.
- Parse every foreign value from `unknown`; bound source bytes, collections, dimensions, subprocess work, responses, and outputs before expensive or privileged work begins.
- Treat diagram and authored composition inputs as authoritative; make rendered SVG, PNG, tldraw, and vector derivatives reproducible and replaceable.
- Keep local vectorization authentication-free and network-silent. Send generation directly to the fixed Vercel AI Gateway origin using environment-only credentials, bounded responses, and `maxRetries: 0`.
- Keep the hosted route opt-in: `hosted-generate.ts` runs only for `--hosted` or `SLOPCAMERA_GENERATION_MODE=hosted`, sends the direct lane's request shape to the pinned gateway origin with the stored credits device token in `x-hraness-credits-subject`, reads no Gateway credential, bounds the response, admits only the direct lane's model allowlist, and turns a `402` into the credits-required handoff without writing a file.
- Do not add a product account, OAuth flow, credential persistence, or legacy Graphics runtime surface. The only hosted surface is the credits-metered gateway in `apps/gateway`; the device credits token lives in the shared `hraness/credits` state owned by `@hraness/credits-foundation`, never in this package, and never in output.
- Pair parsing and compatibility changes with examples and property laws, then run the package `check` gate and clean standalone export.

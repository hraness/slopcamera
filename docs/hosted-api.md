# Hosted API runbook

`apps/api/` is the Slopcamera tool surface for agent platforms that cannot run a local CLI — Muse connectors, Grok-style bots, Instinct-class clients, and direct HTTP integrations. It serves the checked MCP tool registry over REST and a stateless MCP endpoint, executes each call inside a per-request ephemeral workspace, and returns binary outputs as ticketed artifact URLs backed by Cloudflare R2.

The canonical tool semantics live in `src/mcp/tools.ts`. This app owns transport, admission, billing, and storage only; it adds no operation semantics of its own.

## Surfaces

| Route | Purpose |
| --- | --- |
| `GET /v1/health` | Configured capabilities (`storage`, `billing`, `models`). |
| `GET /v1/models` | Sorted paid-model allowlist (`provider/model` ids). Provider costs never leave the service. |
| `GET /v1/tools` | Hosted tool registry with tiers and input schemas. |
| `POST /v1/tools/{name}/call` | Invoke one tool. Body: `{arguments, files?, idempotencyKey?}`. |
| `POST /v1/uploads` | Mint a 15-minute presigned R2 PUT for one inbound file. |
| `GET /v1/artifacts/{id}` | Artifact ticket metadata. |
| `GET /v1/artifacts/{id}/content` | 302 to a one-hour presigned download. |
| `POST /v1/mcp` | Stateless JSON-RPC MCP endpoint (protocol `2025-11-25`). |
| `GET /v1/openapi.json` | The OpenAPI contract connector submissions reference. |

## Tiers

- **free** – anonymous, rate-limited validation, inspection, planning, and audit tools.
- **render** – anonymous with a tighter limit; `render_diagram` is the only member.
- **paid** – `execute_slopcamera` narrowed to `slopcamera.image.generate`. Requires a Hraness Credits device token (`Authorization: Bearer cr_dev_…`). The service prices a ceiling from its model allowlist, holds credits before any provider call, then settles the reported contractual cost on success or releases on failure. Margin lives inside the Credits pricing revision; this service never sees or quotes it.

Callers without a token get `401` with a `signup` block describing the Credits claim flow. Insufficient balance returns `402` with a `topup.url` the caller's human can pay.

## Files and artifacts

Inputs travel as a `files` map on the call: `{ "name": { "text": … } | { "base64": … } | { "upload": "<id>" } }`. Names are root-relative paths; traversal, absolute paths, and control bytes are rejected, and each call admits at most 24 files. Inline payloads are capped at 4 MiB by default; larger inputs go through `POST /v1/uploads` and a presigned PUT.

Outputs are harvested by diffing the workspace after the call. Each new file becomes an R2 object at `a/<id>/<name>` plus a `t/<id>.json` ticket record, both expiring under the bucket lifecycle rule — currently seven days. Tickets carry `sha256`, byte count, content type, and a `contentUrl` that redirects to a presigned GET. Artifact URLs are unauthenticated but unguessable; treat them as bearer references.

## Environment

| Variable | Purpose |
| --- | --- |
| `SLOPCAMERA_API_BASE_URL` | Public base URL used in ticket and OpenAPI URLs. |
| `R2_PROXY_URL`, `R2_PROXY_SECRET` | Signed object-proxy worker (`apps/objects/`) and its shared HMAC secret — the preferred storage path. Without a working storage group, upload and artifact routes answer `503`. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Direct R2 S3 credentials, used only when no proxy pair is configured. |
| `R2_BUCKET` | Bucket name for the S3 path; default `slopcamera-api-artifacts`. |
| `R2_ENDPOINT` | Optional custom S3 endpoint for the bucket. |
| `SLOPCAMERA_API_CREDITS_PRODUCT_KEY` | Credits product key (`cr_prod_…`). Without it, paid tools answer `503`. |
| `CREDITS_BASE_URL` | Credits origin; default `https://credits.hraness.com`. |
| `SLOPCAMERA_API_MODEL_COSTS_JSON` | JSON map of admitted `provider/model` ids to provider cost in micro-USD. The allowlist is the spend bound; unlisted models are rejected before any hold. |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway credential used by `slopcamera.image.generate`. |
| `SLOPCAMERA_API_ARTIFACT_TTL_DAYS` | Reported artifact lifetime (1–30, default 7); the bucket lifecycle enforces it. |
| `SLOPCAMERA_API_FREE_CALLS_PER_HOUR` | Anonymous free-tool limit (default 120). |
| `SLOPCAMERA_API_RENDER_CALLS_PER_HOUR` | Anonymous render limit (default 30). |
| `SLOPCAMERA_API_UPLOADS_PER_HOUR` | Upload-ticket limit (default 60). |
| `SLOPCAMERA_API_MAX_INLINE_BYTES` | Inline file ceiling (default 4 MiB). |
| `SLOPCAMERA_API_MAX_UPLOAD_BYTES` | Presigned-upload ceiling (default 32 MiB). |
| `PORT`, `HOST` | Listen address; default `0.0.0.0:8787`. |

Rate limiting is in-memory per process. Paid calls are bounded by Credits holds, not the limiter.

## Calling from the CLI

The Slopcamera CLI can drive the paid operation directly: `slopcamera credits topup` prints a Credits checkout URL, `slopcamera credits wait` polls the claim and stores the returned `cr_dev_…` device token under the CLI state root in owner-only files, and `slopcamera ai image generate --hosted` calls `execute_slopcamera` with `{model, prompt, outputPath}` and writes the verified artifact below `artifacts/slopcamera/generated/`. When no Gateway credential is configured, a stored token routes `ai image generate` here automatically; `SLOPCAMERA_CREDITS_TOKEN` overrides the stored token for ephemeral environments.

## Credits setup

Register the product once against the Credits admin CLI with a `cost-plus` operation named `image_generate`, then set `SLOPCAMERA_API_CREDITS_PRODUCT_KEY` to the issued `cr_prod_…` key. Populate `SLOPCAMERA_API_MODEL_COSTS_JSON` from the gateway's published per-image prices so ceilings reflect contractual cost. Callers top up through the `topup.url` returned in `402` responses; the service never touches payment pages.

## R2 setup

One bucket with two lifecycle rules: `a/` and `t/` expire after seven days, `u/` expires after one day.

The preferred storage path needs no Cloudflare-issued S3 credential: `apps/objects/` deploys as the `slopcamera-objects` worker with an R2 binding to the bucket. The API mints HMAC-signed bearer URLs (`{method, key, expiry, maxBytes}`); the worker verifies the signature, enforces the declared cap and the `a/`/`t/`/`u/` prefix allowlist, and performs the bucket op. Provision it with:

```sh
cd apps/objects
bunx wrangler deploy
bunx wrangler secret put OBJECT_PROXY_SECRET   # shared with the API
```

Set `R2_PROXY_URL` to the worker's `workers.dev` URL and `R2_PROXY_SECRET` to the same secret on the API project. As a fallback, direct S3 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) scoped to object read/write/head on that bucket also work. Presigned PUTs are capped by the declared byte count and expire in 15 minutes either way.

## Local development

```sh
bun install
bun run --cwd apps/api dev
```

Run the focused gate before handoff:

```sh
bun run check:api
```

## Security posture

- No accounts, OAuth, sessions, or stored credentials. The only credential is the caller's Credits device token, used once per hold and never persisted or logged.
- `execute_slopcamera` admits only `slopcamera.image.generate`; no caller-selected operations, source code, or subprocess execution reaches the runtime.
- Every call runs in a fresh temporary directory that is deleted afterward. Nothing crosses requests except TTL'd R2 objects.
- Request bodies are capped at 16 MiB; file names, counts, and bytes are bounded before any provider I/O.
- Paid-call retries are safe: the hold is idempotent on the caller's `idempotencyKey`, and a failed tool run releases the hold before responding.

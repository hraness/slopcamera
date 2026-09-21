---
type: plan
area: hosted-api
status: in-progress
---

# Hosted Slopcamera agent API

Status: in implementation. Decision record for the hosted tool surface that
lets cloud agent platforms (Muse connectors, Grok, Instinct-class clients)
use Slopcamera without a local shell.

## Decision

Host the intelligence, not the media. The API transports JSON specs, findings,
and claim tickets; artifact bytes move on a separate dumb byte channel
(Cloudflare R2 presigned URLs). Nothing large ever travels inside a tool
response.

### Surfaces

- `POST /v1/tools/{name}` — call a hosted tool. Inputs arrive as an inline
  `files` map (root-relative path → UTF-8 or base64 content) materialized into
  a per-request temporary workspace, or as `upload:` references to presigned
  R2 uploads for larger inputs.
- `POST /v1/uploads` — issue a presigned R2 PUT for an inbound raster or
  source bundle. Bounded bytes, content-type allowlist.
- `GET /v1/artifacts/{id}` and `GET /v1/artifacts/{id}/content` — ticket meta
  and a 302 to a presigned R2 GET. Artifacts are SHA-256 addressed records
  carrying tool, model, and cost metadata.
- `POST /v1/mcp` — stateless streamable-HTTP MCP endpoint (`initialize`,
  `tools/list`, `tools/call`) over the identical registry, for platforms that
  accept an MCP URL instead of a raw API.
- `GET /v1/openapi.json` — machine contract for raw-API onboarding.

### Tool tiers

- Free, anonymous, rate-limited: `check_diagram`, `search_slopcamera`, all
  read-only scene tools (`check/inspect/audit/diff/evaluate/plan_*`),
  `render_diagram` (bounded CPU, tighter limit).
- Paid, `Authorization: Bearer cr_dev_…`: `execute_slopcamera` restricted to
  `slopcamera.image.generate`, run with the service's AI Gateway credential.
- Never hosted: `image.vectorize` (checksum-pinned native subprocess),
  `image.icon` (depends on the vectorizer), `image.gallery` (follows once
  multi-unit holds are exercised), and every local-only CLI surface
  (recording, studio, canvas, durable projects).

### Billing

Hraness Credits, cost-plus operations. The API holds `ceilingMicroUsd` per
request (per-model configured ceiling), settles with the reported upstream
provider cost, and releases on failure. Margin lives inside Credits'
pricing revision (take rate + fixed offset); the API only reports provider
cost with basis `contractual` from a reviewed per-model price table. The
allowlist of admitted models is itself a spend bound. On `402` the response
carries Credits' `topup.url` verbatim so the calling agent can hand a human
a pay link. Device tokens are never stored: a hold attempt is the
authentication check.

### Storage

One R2 bucket, `slopcamera-api-artifacts`, with two lifecycle rules: `a/` and
`t/` expire after 7 days, `u/` after 1 day. Keys: `a/{uuid}/{safe-name}` for
output bytes, `t/{uuid}.json` for the resolvable ticket record, `u/{uuid}`
for pending uploads. The ticket record carries sha256, byte count, content
type, tool, model, and timestamps — no database.

## Cost and abuse controls

- Per-IP token buckets for anonymous calls; per-token call counters for paid.
- Request bodies bounded; inline `files` maps capped in count and bytes.
- Paid ops always hold before any provider call; settlement is capped by the
  hold ceiling under the stored pricing revision.
- Presigned URLs are short-lived (minutes for PUT, hours for GET); artifact
  bytes expire at 7 days by bucket lifecycle.

## Deployment

Portable `fetch` handler plus a `Bun.serve` entry (`bun run apps/api` for
local). Production target is a Vercel project (`api.slopcamera.com`) running
the Node runtime; no database or Accounts dependency.

## Execution state

`apps/api/` landed: config, R2 SigV4 client, artifact store, ephemeral
workspace, token-bucket limiter, Credits client, tool registry, REST + MCP
handlers, OpenAPI document, and Bun server entry. 24 focused tests pass;
`check:api` (typecheck + lint + test) is wired into the repository gate;
the new surfaces are registered in `costs.json`; operator runbook is
`docs/hosted-api.md`. The `src/` rule was amended so the canonical modules
stay transport-free while `apps/api/` owns HTTP, billing, and storage.

## Open items

- R2 bucket + API token provisioning (Cloudflare account + token needed).
- Credits product registration for `slopcamera` (admin `product:config`,
  rate card, Stripe catalog sync) — operator step in the credits repo.
- Funded `AI_GATEWAY_API_KEY` for the service.
- Vercel project + `api.slopcamera.com` deploy.
- `image.gallery` and inbound-media tools once holds cover multi-unit work.

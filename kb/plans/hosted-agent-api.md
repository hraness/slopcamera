---
type: plan
area: hosted-api
status: completed
---

# Hosted Slopcamera agent API

Status: completed. Decision record for the hosted tool surface that
lets cloud agent platforms (Muse connectors, Grok, Instinct-class clients)
use Slopcamera without a local shell.

## Decision

Host the intelligence, not the media. The API transports JSON specs, findings,
and claim tickets; artifact bytes move on a separate dumb byte channel
(Cloudflare R2 presigned URLs). Nothing large ever travels inside a tool
response.

### Surfaces

- `POST /v1/tools/{name}/call` — call a hosted tool. Inputs arrive as an inline
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

Hraness Credits, cost-plus operations. The API holds a bounded ceiling
(`providerCostMicroUsd * 2 + 100_000`, covering take rates up to 200% plus
buffer), settles with the reported upstream provider cost, and releases on
failure. The ceiling and the reported cost are decoupled: reporting the
ceiling as cost would flat-rate every call under cost-plus pricing. Margin
lives inside Credits'
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

The deployed storage path is `slopcamera-objects`, a Cloudflare Worker bound
to the bucket that serves HMAC-signed PUT/GET/HEAD with per-request size and
expiry bounds (`apps/objects/`). The API signs requests with a shared secret
(`R2_PROXY_URL`/`R2_PROXY_SECRET`); direct S3 credentials (`R2_ACCESS_KEY_ID`
et al.) remain a fallback when no proxy pair is configured.

## Cost and abuse controls

- Per-IP token buckets for anonymous calls; per-token call counters for paid.
- Request bodies bounded; inline `files` maps capped in count and bytes.
- Paid ops always hold before any provider call; settlement is capped by the
  hold ceiling under the stored pricing revision.
- Presigned URLs are short-lived (minutes for PUT, hours for GET); artifact
  bytes expire at 7 days by bucket lifecycle.

## Deployment

Portable `fetch` handler plus a `Bun.serve` entry (`bun run apps/api` for
local). Production runs on Vercel functions under the auto-detected Bun
runtime at `api.slopcamera.com`; no database or Accounts dependency.

Two deployment lessons landed in the merged shape. First, Vercel transpiles
the function graph to `.js` without rewriting specifier strings, so every
internal import in `apps/api` uses `.js` specifiers (matching `src/`
convention). Second, the detected Vite framework preset degenerates optional
catch-all functions into single-segment routes, so the deployable surface is
one thin file per endpoint under `api/` that pins its canonical path —
dynamic segments arrive via `req.query`, which each wrapper substitutes.
Tool calls inject a process-local host-resource coordinator because
machine-global admission needs flock state that does not exist in a function
sandbox.

## Result

`apps/api/` shipped in PRs #187 and #188: config, object stores (proxy worker
+ S3 fallback), artifact store, ephemeral workspace, token-bucket limiter,
Credits client, tool registry, REST + MCP handlers, OpenAPI document, Bun
server entry, and the Vercel function adapter. 27 focused tests pass;
`check:api` is wired into the repository gate; the surfaces are registered in
`costs.json`; the operator runbook is `docs/hosted-api.md`. The `src/` rule
was amended so canonical modules stay transport-free while `apps/api/` owns
HTTP, billing, and storage.

Production evidence is live at `https://api.slopcamera.com` and recorded in
`docs/platform-submission.md`: health, tool registry, OpenAPI, MCP
`initialize`/`tools/list`, a real `check_diagram` call, `render_diagram`
producing five ticketed artifacts, a presigned upload round trip through the
worker, and artifact download whose bytes match the ticket sha256.

Infrastructure as deployed: R2 bucket `slopcamera-api-artifacts` with
lifecycle rules, the `slopcamera-objects` proxy worker with a shared HMAC
secret, the Vercel project `slopcamera-api` aliased to `api.slopcamera.com`,
the Credits product `slopcamera` with `image_generate` cost-plus operation,
and a `slopcamera-api-vercel` product key stored in Convex, Vercel, and
Keychain. The paid path settles under the decoupled ceiling model; the
allowlist carries seven models.

## Durable memory

- The reusable onboarding model lives in
  [[notes/agent-platform-onboarding|agent platform onboarding]]: two wire
  formats over one registry, tiered tools, claim-ticket byte plane, Credits
  billing without accounts, ephemeral execution.
- Submission-ready facts and the per-platform readiness table live in
  `docs/platform-submission.md`; refresh its verified calls before each
  filing.
- Never hold the settlement amount as the ceiling: cost-plus pricing must
  fit inside the hold, so ceiling and reported provider cost are separate
  numbers.
- Serverless hosts break machine-global host-resource admission and
  catch-all function routing; process-local admission plus per-endpoint
  function files are the pattern that survived contact with Vercel.

Remaining work, deliberately deferred: `image.gallery` and inbound-media
tools once holds cover multi-unit work, a funded-token settled paid call for
the evidence pack, and platform-specific submission intake for Grok and
Instinct-class clients.

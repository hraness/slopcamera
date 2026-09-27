# Platform submission evidence

Submission material for listing the hosted Slopcamera API on agent platforms (Muse connectors, Grok-style bots, Instinct-class clients, or any host that takes a raw API or an MCP URL). Everything under "Verified surface" was exercised against production on 2026-09-21; re-run the commands to refresh.

## Verified surface

Base URL: `https://api.slopcamera.com`

| Call | Evidence |
| --- | --- |
| `GET /v1/health` | `200` → `{"ok":true,"storage":true,"billing":true,"models":7}` |
| `GET /v1/tools` | `200` → 17 tools with tiers and input schemas |
| `GET /v1/openapi.json` | `200` → OpenAPI 3.1.0, all 8 paths (re-verified 2026-09-24) |
| `POST /v1/mcp` `initialize` | `200` → protocol `2025-11-25`, serverInfo `hraness-slopcamera-api` |
| `POST /v1/mcp` `tools/list` | `200` → same registry as REST |
| `POST /v1/tools/check_diagram/call` | `200` → findings JSON for an inline source file |
| `POST /v1/tools/render_diagram/call` | `200` → five ticketed artifacts (SVG, PNG, tldraw) |
| `POST /v1/uploads` + `PUT <url>` | `201` ticket → `200` presigned write to object storage |
| `GET /v1/artifacts/{id}` | `200` → ticket meta with `sha256`, `expiresAt` |
| `GET /v1/artifacts/{id}/content` | `302` → presigned GET; downloaded bytes match the ticket `sha256` |
| `POST /v1/tools/execute_slopcamera/call` (no token) | `401` → `signup` block describing the self-serve Credits claim flow |
| `POST /v1/tools/execute_slopcamera/call` (funded `cr_dev_`, 2026-09-21) | `200` in 31s → `slopcamera.image.generate` via `vercel-ai-gateway` (`openai/gpt-image-1`), 1,324,221-byte PNG artifact `c71e8a07-…` served byte-identical under its pinned `sha256`; wallet settled 1200 → 1170 credits |
| `POST /v1/tools/execute_slopcamera/call` (funded, provider credential absent) | `200` → `isError` result, hold **released** not settled — wallet balance unchanged; verified release-on-failure live |
| `POST /v1/uploads` → PUT → `files.<name>.upload` in a tool call (2026-09-21) | `201` ticket → `200` presigned PUT → `check_diagram` `200` parsed the uploaded diagram (3 shapes, 2 edges) |

### Reproducing the evidence

```sh
# health, registry, contract
curl https://api.slopcamera.com/v1/health
curl https://api.slopcamera.com/v1/tools
curl https://api.slopcamera.com/v1/openapi.json

# stateless MCP
curl -X POST https://api.slopcamera.com/v1/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# a free tool call over an inline file
curl -X POST https://api.slopcamera.com/v1/tools/check_diagram/call \
  -H 'content-type: application/json' \
  -d '{"arguments":{"path":"s.diagram.json"},
       "files":{"s.diagram.json":{"text":"<diagram source>"}}}'
```

Artifact URLs are bearer references: unauthenticated but unguessable, expiring after seven days under the bucket lifecycle. Upload tickets expire in fifteen minutes; pending uploads after one day.

## Submission facts

Fields most connector and bot submission flows ask for:

- **API base / MCP URL**: `https://api.slopcamera.com` (REST + OpenAPI) or `https://api.slopcamera.com/v1/mcp` (stateless streamable-HTTP MCP, protocol `2025-11-25`).
- **OpenAPI document**: `https://api.slopcamera.com/v1/openapi.json`.
- **Authentication**: anonymous for free and render tiers; `Authorization: Bearer cr_dev_…` (Hraness Credits device token) for paid generation. `401` responses carry machine-readable `signup` instructions; `402` carries a `topup.url` a human can pay. No OAuth, no accounts, no stored tokens.
- **What it does**: validates, inspects, audits, plans, and renders Slopcamera diagrams and scenes; generates images through Vercel AI Gateway under per-model pricing. Outputs arrive as expiring artifact tickets, never inline bytes.
- **Rate limits**: anonymous per-IP token buckets (120/hr free, 30/hr render, 60/hr uploads); paid calls bounded by Credits holds.
- **Privacy posture**: per-request ephemeral workspaces; the only retained state is TTL'd objects (7-day artifacts, 1-day uploads); caller tokens are never stored — a hold attempt is the auth check; content bytes stay in the object store and control-plane responses carry digests only.
- **Support / privacy links**: point at the repository and [the hosted-API runbook](hosted-api.md), which documents behavior that matches the live service.

## Per-platform readiness

| Platform | Submission shape | Status |
| --- | --- | --- |
| Muse connector | OpenAPI URL or MCP URL + terms acceptance | **Ready pending external blockers** — endpoint, contract, and live evidence exist; submission waits on connector regional availability and Connector Terms, which are not ours to resolve. |
| Grok bot | MCP URL or function-calling API | **Surface ready, submission path unverified** — the MCP endpoint answers the current protocol revision; the platform's actual submission intake needs confirming when we file. |
| Instinct-class clients | MCP URL | **Surface ready** — same endpoint; no platform-specific work identified. |
| Direct HTTP integration | OpenAPI document | **Ready** — contract is public at `/v1/openapi.json`. |

## Example prompts for evaluators

Prompts that exercise the hosted surface end to end without credentials:

1. "Check this diagram for problems" — attach or inline a `*.diagram.json` source; `check_diagram` returns structured findings.
2. "Render this diagram to PNG" — `render_diagram` returns artifact tickets whose `contentUrl` streams the rendered bytes.
3. "Compare these two scene sources" — `diff_scenes` on two inline files.
4. "Generate a product shot of …" — `execute_slopcamera` with `slopcamera.image.generate`; an evaluator without a Credits token sees the `401` signup flow, which is itself part of the demo.

## Not yet evidenced

- Platform-specific submission intake for Grok and Instinct-class clients remains to be filed and observed.

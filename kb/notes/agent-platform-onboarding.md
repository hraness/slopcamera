---
title: Agent platform onboarding
type: concept
tags:
  - hosted-api
  - connectors
  - billing
---

# Agent platform onboarding

Cloud agent platforms (Muse connectors, Grok-style bots, Instinct-class clients) cannot run a local CLI, so a product that wants agent reach needs a hosted surface. The pattern that works, proven by [[plans/hosted-agent-api|the Slopcamera hosted API]]:

- **Two wire formats, one registry.** A REST call route plus a stateless MCP endpoint over the same typed tool registry, with an OpenAPI document for raw-API onboarding. The registry is the product's existing capability list — the hosted layer adapts transport, it does not fork semantics.
- **Tier the tools.** Read-only and planning tools run free and anonymous behind per-client rate limits; expensive compute gets a tighter anonymous tier; provider-spending tools require a paid credential. `execute`-style catch-alls get narrowed to an explicit operation allowlist rather than exposing the full local registry.
- **Host the intelligence, not the media.** Tool results carry JSON and claim tickets; bytes move on presigned object-storage URLs with lifecycle expiry. Media never travels inline through the tool protocol, which keeps protocol costs flat and makes egress per-download instead of per-message.
- **Bill through Credits, not accounts.** A `cr_dev_` device token authorizes paid calls; the service holds a model-priced ceiling before any provider call, settles the contractual upstream cost, and releases on failure. Margin lives in the Credits pricing revision. `401` responses carry a self-serve signup block and `402` carries a `topup.url`, so an agent can hand its human a pay link without any account system on the product side.
- **Ephemeral execution.** Every call runs in a fresh workspace deleted afterward; the only cross-call state is TTL'd objects. This keeps the honest contract "authoring hosted, heavy execution local" for products whose real runtime belongs on the user's machine.

The reusable checklist per product: pick the portable capability subset, add the transport adapter (REST + MCP + OpenAPI), register every new storage/provider surface in `costs.json`, and produce the platform evidence pack — example prompts, privacy and support links that match actual behavior, and terms — before submitting anywhere.

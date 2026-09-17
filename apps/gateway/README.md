# Slopcamera hosted gateway

This app is the Hraness-operated gateway behind `slopcamera image generate --hosted`. It exposes one route, `POST /v1/generate`, that meters an image generation through prepaid Hraness credits and forwards the request to Vercel AI Gateway with the operator's key. It deploys as its own Vercel project, `slopcamera-gateway`, separate from the static site in `apps/web`, which keeps no account, balance, checkout, or token surface.

## Request

```http
POST /v1/generate
content-type: application/json; charset=utf-8
x-hraness-credits-subject: cr_dev_…

{ "model": "recraft/recraft-v4.1-utility", "prompt": "one literal illustration" }
```

The body must contain exactly `model` and `prompt`; `model` must be one of the CLI's image models (`openai/gpt-image-1.5`, `recraft/recraft-v4.1-utility`) and `prompt` is bounded to 32 KiB of UTF-8 without control characters. Bodies above 36 KiB, non-JSON content types, and methods other than `POST` are rejected before any credits call. The subject header carries the device's credits token; the gateway never sees a Gateway credential from the caller.

## Response

A `200` carries the same shape the CLI's direct lane consumes, plus the charge:

```json
{
  "image": { "base64": "…", "mediaType": "image/webp" },
  "model": "recraft/recraft-v4.1-utility",
  "provider": "vercel-ai-gateway",
  "requestId": "sha256:…",
  "warnings": [],
  "credits": {
    "holdId": "hold_…",
    "chargedMicroUsd": 120000,
    "charged": { "microUsd": 120000, "credits": 12, "usd": "0.12" },
    "balance": { "microUsd": 7980000, "availableMicroUsd": 7980000 },
    "lowBalance": false,
    "settled": true
  }
}
```

A `402` is `{ "error": "credits_required", "message", "operation": "image_generate", "reason" }` with the credits service's `required`, `balance`, and `topup` fields when the wallet is short (`reason: "insufficient_credits"`), or guidance only when the device sent no token (`subject_missing`) or one the service does not recognise (`subject_rejected`). A `502 generation_failed` means the hold was released and nothing was charged. A `503 credits_unavailable` or `service_unconfigured` means the request stopped before any charge.

## Lifecycle

1. Validate the body and the subject token.
2. Place a credits hold for `image_generate` with a per-model ceiling from `src/pricing.ts` (the model's maximum list price uplifted by a quarter, capped at one dollar) and a fresh idempotency key.
3. Generate through the SDK's direct path (`src/generate.ts` at the repository root) using `AI_GATEWAY_API_KEY`, with zero retries.
4. Settle the hold from the cost the Gateway reported (`basis: "reported"`) or, when none was reported, the model's list price (`basis: "estimated"`). A failed generation releases the hold instead.
5. Return the image. If settlement cannot be confirmed, the image is still returned with `settled: false` and the hold expires on its own without a charge.

Prompts are never logged; the only operational log lines name a hold that could not be settled or released.

## Environment

Copy `.env.example` and set:

| Variable | Meaning |
| --- | --- |
| `SLOPCAMERA_CREDITS_SERVICE_ORIGIN` | The credits service origin, `https://credits.hraness.com`. |
| `SLOPCAMERA_CREDITS_PRODUCT_KEY` | The `cr_prod_…` product key the credits service issued for the `slopcamera` product. |
| `AI_GATEWAY_API_KEY` | The operator's Vercel AI Gateway key that pays the provider. |

The handler answers `503 service_unconfigured` until all three are present and well formed. `public/` is the only static output (a `robots.txt` that disallows crawling); source files are never served. Keep them in the Vercel project's Production environment only; see the [Vercel runbook](../../docs/vercel.md#hosted-generation-gateway) for the project settings.

## Verify

From the repository root, `bun run check:gateway` typechecks, lints, and runs the handler tests against in-process credits and generation stubs. No test reaches the credits service, the Gateway, or the network.

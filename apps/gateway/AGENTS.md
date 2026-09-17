# Contents

- `api/v1/generate.ts` – the one deployed route, `POST /v1/generate`, as a Vercel Function.
- `src/handler.ts` – the pure request handler: bounded body parsing, the model allowlist, subject-token reading, credits hold, generation, settle or release, and the response shapes.
- `src/pricing.ts` – the in-repo per-model list-price table, the hold ceiling formula, and the estimated settlement cost.
- `src/*.test.ts` – handler tests over in-process credits and generation stubs.
- `vercel.json`, `.env.example`, and `README.md` – deployment configuration, the exact environment variables, and the route contract.

# Guidelines

- Keep this app a separate Vercel project (`slopcamera-gateway`, Root Directory `apps/gateway`) with one route. Never fold it into `apps/web`; the static site carries no account, balance, checkout, or token surface.
- Authenticate every generation by placing a credits hold for the device token in `x-hraness-credits-subject`; never accept a caller's Gateway credential, never read `AI_GATEWAY_API_KEY` from a request, and answer a missing or rejected token with `402 credits_required` before any paid work.
- Generate only through the root SDK's direct path in `src/generate.ts` with the same request shape and `maxRetries: 0`, and admit only the CLI's model allowlist. Return the direct lane's response shape plus a `credits` block; do not add fields the CLI cannot parse.
- Settle from the reported cost with `basis: "reported"`, otherwise from the list-price table with `basis: "estimated"`; release on any generation failure. Keep the hold ceiling at most one dollar per image and review `src/pricing.ts` whenever the allowlist or a provider price list changes.
- Bound the request body, prompt bytes, and every response before provider or credits I/O. Log no prompt, token, key, or image; log only a hold ID that could not be settled or released.
- Keep product-facing wording to credits and dollars where one credit is one cent. Never expose take rates, margins, or provider costs in responses, logs, or documentation; the credits service decides prices.
- Keep `SLOPCAMERA_CREDITS_SERVICE_ORIGIN`, `SLOPCAMERA_CREDITS_PRODUCT_KEY`, and `AI_GATEWAY_API_KEY` in the Vercel Production environment only; `.env` files stay ignored. Register a new route or meter in the root `costs.json`.
- Tests inject the credits transport and generation; they never reach the credits service, the Gateway, or the network. Run `bun run check:gateway` from the repository root after a change here.

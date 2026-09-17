# Hosted generation and credits

`slopcamera image generate --hosted` sends an image request to a gateway that Hraness operates instead of your own Vercel AI Gateway credential, and pays for it with prepaid credits held by this device. Without `--hosted`, image generation is unchanged: it uses `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` from your process environment and nothing else. This page is the reference for the hosted route and the `slopcamera credits` commands.

## Choose the route

| Route | Command | Pays with | Reads |
| --- | --- | --- | --- |
| Direct (default) | `slopcamera image generate '<prompt>' --output image.webp` | Your Vercel AI Gateway account | `AI_GATEWAY_API_KEY`, then `VERCEL_OIDC_TOKEN` |
| Hosted | `slopcamera image generate '<prompt>' --output image.webp --hosted` | Prepaid Hraness credits held by this device | The stored credits device token; no Gateway credential |

`SLOPCAMERA_GENERATION_MODE=hosted` selects the hosted route for every `image generate` in that environment; `direct` or an unset variable keeps the default, and any other value is a usage error. The hosted route accepts the same prompt, `--model`, `--output`, and `--json` options, and admits only the models the direct lane already lists (`openai/gpt-image-1.5` and `recraft/recraft-v4.1-utility`). The `ai image generate` project lane, icons, galleries, video, speech, and transcription stay on the direct route.

The gateway forwards your prompt to Vercel AI Gateway with the same request shape the direct lane uses and returns the image bytes and metadata in the same shape, so the local receipt has the same fields plus a `credits` block: the hold ID, what was charged in micro-USD, credits, and dollars, the remaining balance, and whether settlement was confirmed. Local vectorization stays authentication-free and network-silent on both routes.

## Credits

Credits are prepaid dollars. One credit is one cent; balances are kept as integer micro-dollars that never round, people see dollars, and agents read both forms. A wallet belongs to the device that paid for it: the first paid purchase from a device issues that device a credits token, which the CLI stores locally and forwards with every hosted request. The token never appears in command output.

The hosted pay page lists the available packs, shows the credits each pack adds including any bonus credits that apply to the purchase, and completes payment through Stripe Checkout in your browser. Slopcamera never handles card details.

Hosted image generation is priced from actual usage at settlement, so `slopcamera credits estimate image_generate` reports `known: false` and quotes no number. The gateway reserves at most one dollar per image before generating and charges the settled price, which is never above the reservation.

## Commands

| Command | Effect | stdout |
| --- | --- | --- |
| `slopcamera credits protocol --json` | Describe commands, exit codes, schemas, and lifecycle. Pure and local. | `hraness-credits-protocol-v1` |
| `slopcamera credits status [--json]` | Read the balance for the stored device token; without a token, report `signedOut: true` and the topup command. | `hraness-credits-status-v1` |
| `slopcamera credits topup [--usd N \| --pack ID] [--email ADDR] [--json]` | Create a payment link, bound to the stored token when one exists, and print it. | `hraness-credits-claim-v1` |
| `slopcamera credits email --to ADDR [--claim ID]` | Ask the service to email the pending link. At most two sends per link. | `{ "sentTo": ADDR }` |
| `slopcamera credits wait [--claim ID] [--timeout 15m] [--json]` | Poll the pending link every five seconds until paid, expired, or the timeout; store the device token when one is issued. | `hraness-credits-claim-status-v1` |
| `slopcamera credits estimate <operation> [--units N] [--json]` | Show the public unit price when the operation has one. | `hraness-credits-estimate-v1` |
| `slopcamera credits signout` | Forget the stored token for this device. | `{ "signedOut": true }` |

Exit codes for `credits` commands: `0` success; `1` state unavailable, busy, or service unreachable; `2` usage error, invalid ID, or expired link; `3` payment still required after `wait` timed out.

Credits state lives in `$XDG_STATE_HOME/hraness/credits/slopcamera.json` (by default `~/.local/state/hraness/credits/slopcamera.json`), created with mode `0700`, shared with no other product. `SLOPCAMERA_CREDITS_SERVICE_ORIGIN` overrides the credits service origin for local testing; `SLOPCAMERA_HOSTED_GATEWAY_ORIGIN` overrides the gateway origin, and both accept only `https` origins or a loopback `http` origin.

## When credits are needed

A hosted generation that cannot proceed prints one `hraness-credits-required-v1` JSON line on stderr under `--json` (or three to five plain lines otherwise), prints `{ "error": "credits_required", … }` on stdout under `--json`, and exits with code `10`, the local host's existing `authorization-required` code. Nothing is charged and no file is written.

```json
{"schemaVersion":"hraness-credits-required-v1","product":{"id":"slopcamera","name":"Slopcamera"},
 "operation":"image_generate","required":{"microUsd":312500,"credits":31,"usd":"0.31"},
 "balance":{"microUsd":0,"credits":0,"usd":"0.00"},
 "topup":{"url":"https://credits.hraness.com/t/clm_8f3k2q","expiresAt":"2026-09-17T22:00:00Z",
   "packs":[{"id":"p10","usd":10,"credits":1000,"bonusCredits":0},{"id":"p25","usd":25,"credits":2500,"bonusCredits":150}],
   "suggestedPackId":"p25"},
 "commands":{"status":["slopcamera","credits","status","--json"],"wait":["slopcamera","credits","wait","--json"],"email":["slopcamera","credits","email","--to","{address}"]},
 "resume":{"argv":["slopcamera","image","generate","one literal illustration","--output","illustration.webp","--hosted","--json"],"automatic":true},
 "instructions":"Show the person the link and the price in plain words. Offer to email the link with the email command if they are not at this terminal. After payment, run the wait command or rerun the original command; the work resumes. Do not retry before payment, never enter card details, and never open the link yourself."}
```

`resume.argv` is the original invocation. After payment, `slopcamera credits wait` stores the device token that a first purchase issues, and rerunning the command continues the work. The [agent skill reference](../../skills/slopcamera/references/credits.md) gives the steps an agent follows.

## The gateway

The gateway is the separate `apps/gateway` app in this repository, deployed as its own Vercel project (`slopcamera-gateway`); the static site in `apps/web` carries no account, balance, checkout, or token surface. Its one route, `POST /v1/generate`, reads the device token from `x-hraness-credits-subject`, places a credits hold for `image_generate`, generates through Vercel AI Gateway with the operator's `AI_GATEWAY_API_KEY`, settles the hold from the reported cost (or the model's list price when none is reported), and releases the hold when generation fails. Requests are bounded to a 32 KiB prompt, only the model allowlist above is accepted, and prompts are not logged. A shortfall answers `402` with `error: "credits_required"` and the service's payment payload. The [Vercel runbook](../vercel.md#hosted-generation-gateway) names the project settings and environment variables.

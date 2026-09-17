# Vercel provider runbook

Slopcamera's public site deploys from `apps/web` in one existing Hraness Vercel
project. Production is its only durable remote environment. Vercel's built-in
Preview target may build pull requests at disposable generated URLs, but it
does not own a persistent branch, custom environment, domain, alias, database,
or production-only variable.

## Provider identity

- GitHub source: `hraness/slopcamera`.
- Vercel project: `slopcamera`, ID `prj_RvNXCVvEYKYhW71OA1442SAILmAS`.
- Root directory: `apps/web`.
- Production branch: `main`.
- Canonical Production domain: `slopcamera.com`.
- Reviewed predecessor redirects: `atet.sh`, `hraness.graphics`,
  `hraness.studio`, `transmute.rocks`, and `www.transmute.rocks` permanently
  redirect the same path and query to `slopcamera.com`.
- Production Vercel alias: `slopcamera-hraness.vercel.app`.

Do not create a custom Vercel environment, a provider-authoritative Preview
branch, or a persistent Preview domain. A branch Preview is disposable
application evidence. It must not become a release channel or another durable
backend.

## Production analytics

Set `NEXT_PUBLIC_POSTHOG_KEY` only in Vercel's Production environment. It is
the public client token for shared PostHog project `543691`, not a personal API
key. `NEXT_PUBLIC_POSTHOG_HOST` may be omitted; when present it must equal
`https://us.i.posthog.com`.

The build emits no analytics asset when the token is missing or `VERCEL_ENV`
is not `production`. The bundled client also checks for the exact
`https://slopcamera.com/` page before it initializes or sends an event. Built-in
Preview deployments, predecessor hosts, and `404.html` remain inert. Keep
PostHog's cookieless server hash mode enabled.

## Private reference hosting

The CLI can use a private Vercel Blob store for image references required by
URL-only Gateway video models. This optional store serves the directing CLI;
the static site has no upload or credential surface. The production connection
is `slopcamera-directing-references`, ID `store_tOZJ7VAuRPpX7FNe`, in `iad1`.
Keep its access private and its environment connection Production-only.

Prefer `BLOB_STORE_ID` with short-lived `VERCEL_OIDC_TOKEN`. The existing
connection supplies `BLOB_READ_WRITE_TOKEN`, which the CLI also supports.
Neither credential is public configuration. With the [source installation](how-to/use-current-source.md), use `vercel env run -e production -- bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js" <arguments>` to inject credentials into a local invocation. Vercel cannot launch the shell function, and its injected credentials last only for this child. Never copy credentials into a recipe, project, log, or command argument. Follow the
[directing guide](directing-video.md) for per-request upload and hosting consent.
Temporary signed GET access expires after 15 minutes. Slopcamera deletes exact
reference objects after confirmed completion or a proven undispatched failure;
ambiguous requests retain their objects and cleanup receipt for recovery.

## Hosted generation gateway

`apps/gateway` deploys as its own Vercel project, separate from the site:

- Vercel project: `slopcamera-gateway`.
- Root directory: `apps/gateway`, with source files outside the root
  directory included (the route imports `src/generate.ts` from the repository
  root).
- Framework preset: Other. Install command
  `cd ../.. && bun install --frozen-lockfile --ignore-scripts`; no build
  command, and `public` (holding only a crawl-disallowing `robots.txt`) as
  the output directory so no source file is served. The one function is
  `api/v1/generate.ts`, `POST /v1/generate`, on the default Node.js runtime
  with `maxDuration` 300.
- Production branch: `main`. The gateway keeps no durable Preview
  environment; a pull request Preview must not receive Production variables.
- Production environment variables, all required:
  `SLOPCAMERA_CREDITS_SERVICE_ORIGIN` (`https://credits.hraness.com`),
  `SLOPCAMERA_CREDITS_PRODUCT_KEY` (the `cr_prod_…` key the credits service
  issued for the `slopcamera` product), and `AI_GATEWAY_API_KEY` (the
  operator's Vercel AI Gateway key). Until all three are set the route
  answers `503 service_unconfigured` and charges nothing.
- Domain: the CLI pins `https://gateway.slopcamera.com`; bind that Production
  domain to this project before the hosted route is advertised.

The gateway keeps no store, table, or blob; `costs.json` registers the route
as a served, ephemeral surface. Audit it with the same reads as the site
project, and never print variable values.

## Provider audit

Audit before changing the project, domains, Git connection, or environment
variables. These reads must not print variable values.

1. Inspect the project and require the immutable ID, `apps/web` root, `main`
   production branch, and an empty `customEnvironments` list.

   ```sh
   vercel project inspect slopcamera --scope hraness
   vercel api /v9/projects/prj_RvNXCVvEYKYhW71OA1442SAILmAS --scope hraness --raw
   ```

2. Inspect every project-domain binding. Require only reviewed Production
   domains and no `customEnvironmentId`.

   ```sh
   vercel api /v9/projects/prj_RvNXCVvEYKYhW71OA1442SAILmAS/domains --scope hraness --raw
   ```

3. Inspect environment-variable metadata without reading values. Production
   may own the public PostHog key and the private Blob connection. No record may target a custom environment,
   and built-in Preview must not receive production-only configuration.

4. Resolve each Production alias to a Ready deployment from `main`, then read
   that deployment's exact Git commit. A deployment's historical alias list is
   not proof of current ownership.

5. Confirm that GitHub has `main` and no durable `preview` branch.

   ```sh
   git ls-remote --heads origin main preview
   ```

Provider cleanup must address exact immutable IDs. Remove an obsolete custom
environment's domains, variables, and deployments explicitly before deleting
the environment; Vercel does not document those resources as cascading. Read
the project, domains, aliases, deployments, environment metadata, and remote
branches back afterward. Never infer cleanup from a successful DELETE alone.

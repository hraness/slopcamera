---
title: Repository seams
type: concept
tags:
  - architecture
  - dependencies
  - parallel-work
---

# Repository seams

Slopcamera is a standalone public SDK, CLI, desktop host, and static site. Its portable graph and scene contracts may be shared inside this repository, while media-host behavior, native capture, and product presentation remain Slopcamera-owned. External Hraness code is consumed only from immutable reviewed commits or releases; Slopcamera does not acquire Accounts or suite-auth authority. The `apps/api/` hosted adapter is the one billing seam: it spends Hraness Credits on behalf of callers through the Credits product-backend routes and holds no ledger authority of its own.

Shared interfaces are frozen before parallel implementation lanes begin. One integration owner changes manifests, lockfiles, generated registries, or other convergence files. Consumers upgrade immutable releases independently, so no repository requires coordinated `main` branches or a sibling checkout.

The static site pins [UI v0.5.25](https://github.com/hraness/ui/releases/tag/v0.5.25) to capture React DOM 19.2.3 server graphs when Bun omits resolution metadata for a known package self-import. The upstream collector preserves the public package root and its production-child edge, and still rejects imports outside its finite reviewed profiles. Four fixed Ask AI provider accents use literal compiled StyleX recipes so the site retains its strict no-inline-styling boundary. Design-kit v0.32.0 and site-footer v0.20.1 retain the same compiler profile. This upgrade keeps the package pin, both lockfiles, builder assertions, and publication-contract fixtures aligned. An isolated frozen site installation and the complete site check with pinned Chromium verify the consumer independently of the UI repository.

The design-kit foundation already includes the status-page stylesheet, byte-identical to the retained v0.21.0 snapshot and producer alias. The site uses that captured foundation copy once. Its finite UA reset preserves the shared code, action, and next-route margins and agent-link wrapping. An installed-byte contract and paired native 404 style and geometry evidence cover the cascade change. The snapshot remains a captured source input; the strict combined-CSS budget stays unchanged.

All committed knowledge is public-safe and excludes credentials, private media, imported projects, provider payloads, and unpublished operating context.

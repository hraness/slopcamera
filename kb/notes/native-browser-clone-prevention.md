---
title: Native browser clone prevention
type: concept
tags:
  - html-overlay
  - rendering
  - integrity
repository_scopes:
  - apps/desktop/application
  - apps/desktop/cli
---

# Native browser clone prevention

The native renderer admits a complete Google-signed Chrome runtime, copies it into an immutable private snapshot, and binds that runtime and the launch contract into execution evidence. Chrome's separate app-clone feature exists to survive updates to the original application; the immutable snapshot does not need that second copy. The current contract disables `MacAppCodeSignClone` and retains `PaintHolding` in the existing disabled-features switch.

The launch-contract change preserves the renderer's browser trust requirements. Ad-hoc Chrome for Testing builds cannot pass its existing signature and Google team checks. Complete runtime manifests, recursive immutable flags, bounded process custody, and graceful shutdown remain enforced.

Execution-integrity version 2 selects the new contract. Historical version-1 receipt reconstruction uses its recorded version and preserves the earlier software, hardware, Spark, and fetch-opt-in contract bytes. New render-response checks require current evidence; they never accept old evidence by trying both contracts.

The authority is `apps/desktop/application/html-overlay-integrity.ts`; `apps/desktop/cli/html-overlay-renderer.ts` consumes its arguments. Focused integrity, native-argv, renderer-security, and spatial-recovery tests cover this boundary. Live qualification must separately observe a completed owned renderer launch and cleanup without new code-sign clone directories; a unit test does not establish that host observation.

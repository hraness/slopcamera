---
title: Neumorphic site polish and a flagship multi-technique example
description: Apply the Lantern material system to the marketing surface and publish a rendered example that visibly blends several Slopcamera techniques in one directed take.
type: plan
area: site-presentation
status: completed
repository_scopes:
  - apps/web/src/styles.css
  - apps/web/src/example-gallery.css
  - apps/web/media/examples.json
  - examples/showcase/workflows
tags:
  - marketing
  - examples
  - design
---

# Neumorphic site polish and a flagship multi-technique example

## Outcome

Cards, chips, code wells, and interface panes stop reading as hairline boxes:
the Lantern material tokens give them raised and inset neumorphic surfaces in
both themes. The homepage gallery leads with `premiere-wall`, an eight-second
composite that mounts the reviewed Island Pulse film on a cinema-wall screen,
the reviewed Interference Field poster as a print, and an editable
`.diagram.json` board inside one smootherstep camera push finished with grain
and vignette — one take that demonstrates authoring, mounting, editing and
direction together.

## Context

[[plans/homepage-positioning-copy|Homepage positioning copy]] delivered the
plain-language rewrite. The follow-up feedback asked for a prettier site with
fewer noisy borders, and for examples that blend multiple techniques instead of
showing isolated primitives.

## Decisions

- Apply material treatment in the site-owned stylesheet layer only
  (`styles.css`, `example-gallery.css`); the vendored preset stays untouched,
  so the reviewed-baseline contract is unaffected.
- Featured set stays at six. `kinetic-title` steps out; `premiere-wall` enters
  second in the order behind the `native-product` hero.
- The flagship is a checked-in reproducible composite
  (`examples/showcase/workflows/render-premiere-wall.ts`), not an unverifiable
  scene render: it binds the two published derivatives by exact sha256, renders
  the diagram through the real `.diagram.json` pipeline, and records a
  source-lineage receipt under `artifacts/`.

## Findings

- The spatial `scene render` lane was unusable on this host during execution:
  every attempt, including the checked-in crescent-pavilion scene, died at
  "HTML overlay browser frame 0 presentation settle exceeded 60000ms" under
  heavy shared load. The authored `examples/showcase/spatial/author-premiere.ts`
  scene (18 entities, 192 camera frames, 0 audit findings) remains in the
  worktree uncommitted; publish it only after a successful retained render.
- Overlay preparation decodes video frames per 32-frame batch; two live 720p
  screens cannot coexist inside the 64-resource / 256 MiB bounds. The
  one-live-screen-plus-print shape is the bounded composition.

## Verification

- `bun scripts/verify-example-sources.ts` — 128 retained sources, 45 examples.
- `bun run check` in `apps/web` — 606 tests, 0 failures; paper theme, preview
  layout, and the 39,500-byte authored-shell budget all pass.
- Reviewed contact sheets of the rendered take and the final poster.

## Result

Merged and live on slopcamera.com ([PR #220](https://github.com/hraness/slopcamera/pull/220),
squash `a5e1300`). Production serves the premiere-wall card and its
fingerprinted video (exact 3,236,247-byte registry match) plus the Lantern
material rules in the foundation CSS. All 22 CI lanes green, `Required` pass.

## Durable memory

- The gallery's hero is always one of the featured set; `#examples` renders
  the remaining five. New featured entries therefore shift markup in both the
  hero island and the gallery island.
- "Presentation settle" timeouts in the browser render lanes were
  environmental (shared-host GPU/CPU contention), not scene defects — the
  checked-in pavilion scene failed identically. Verified by retrying a proven
  checked-in scene and by the `html render` lane failing the same way.
- ffmpeg overlay composites over checked-in authored assets are a viable
  fallback showcase shape when the spatial renderer cannot run; the pattern
  keeps provenance by binding every input by sha256 and emitting a
  source-lineage receipt.

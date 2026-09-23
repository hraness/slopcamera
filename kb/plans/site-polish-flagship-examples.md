---
title: Neumorphic site polish and a flagship multi-technique example
description: Apply the Lantern material system to the marketing surface and publish a rendered example that visibly blends several Slopcamera techniques in one directed take.
type: plan
area: site-presentation
status: in-progress
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

To be filled on merge.

## Durable memory

To be filled on merge.

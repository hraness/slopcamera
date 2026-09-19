# Contents

- `contracts.ts` – bounded authored spatial scene, asset, camera, animation and patch data.
- `behavior.ts` – the `slopcamera.spatial-behavior` document: a content-addressed ALGAL organism closure under the bake-safe profile (input/const/fn/repeat/each/organism cells only), with the ALGAL `manifestToJson` digest mirror and closure/wiring checker.
- `behavior-fns.ts` – the closed pure fn catalog organisms compose: seeded rng, fsm, expression, interact, channel emit, scene sample, combine, and the emitted/window plumbing kernels.
- `behavior-trace.ts` – emitted-channel records, host channel maps, the emitted→performance-directive proposal mapper, and the `slopcamera.spatial-behavior-bake` artifact plus receipt.
- `behavior-bake.ts` – the deterministic bake: runs an admitted closure through the pinned ALGAL runtime over a memory store and the pure fn registry, extracts interface emissions, and binds the run receipt.
- `behavior-gallery.ts` – seeded behavior galleries: deterministic seed variants of one admitted behavior bake into content-addressed candidates; seed-agnostic organisms collapse honestly and selection stays explicit.
- `behavior-stdlib.ts` – standard-library organisms composing the fn catalog into reusable patterns: locomotion FSM, expression layer, interaction sequence, and the combined top-level organism that chains pairwise append across all three.
- `behavior-audit.ts` – behavior-trace audit: state-thrash, exact-periodicity, dead-channel, and unreachable-state findings on baked emitted traces; advisory for gallery review.
- `behavior-authoring.test.ts` – end-to-end authoring proof: assembles a behavior doc from stdlib organisms, runs check→bake→audit→gallery, verifies incremental composition and deterministic replay.
- Pure identity, evaluation, inspection and audit modules – scene source and derived state without host effects.
- Colocated deterministic and property tests – reference, transformation, time and edit laws.

# Guidelines

- Keep this boundary portable and effect-free. Parsing, inspection and compilation never read files, execute authored source, decode media, launch a renderer or contact a provider.
- Parse foreign input from `unknown` through the bounded canonical JSON snapshot and strict schemas before expensive work. Keep entity, camera, asset and generator references explicit and validate their closure.
- Preserve authored identity and retained generator output. Typed edits update authored data or declared overrides; they never patch a renderer instance or silently rerun source.
- Use the declared right-handed, Y-up meter coordinates, camera-local negative Z, XYZW quaternions and integer-microsecond authoring clock. Preserve exact rational frame sampling at the render boundary.
- Treat an evaluated snapshot as immutable derived state. Include effective view and shot overrides in render identity; rendering cannot advance shared state.
- Keep `packages/scene` and the existing `./scene` export dedicated to scene analysis. Shared graph identity and host capability authority remain owned by the existing code core.

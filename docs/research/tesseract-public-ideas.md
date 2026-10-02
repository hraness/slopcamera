# Public Tesseract ideas for Slopcamera

Reviewed 2026-09-23. This note compares public first-party documentation with
Slopcamera source in the style-portfolio worktree. It recommends ways to make
finished studies easier to understand, review, and revise. It does not assess
Tesseract render quality, performance, or compatibility: no runtime was installed
or executed, and no private service was inspected.

## What the public material establishes

The current [Tesseract page](https://mirage.app/tesseract) has a ChatGPT plugin
link and describes an agent working on an editable project containing footage,
layers, timing, and sound. The live [first-project guide](https://mirage.app/tesseract/docs/first-project)
and [local setup guide](https://mirage.app/tesseract/docs/local-setup) contain
substantive instructions. They are available public documentation, despite older
search results that described them as forthcoming. These observations are from
2026-09-23.

The [current raw official README](https://raw.githubusercontent.com/mirage-hq/Tesseract/main/README.md)
lists macOS, Windows, Linux x86_64, compatible cloud-agent environments, and a
ChatGPT/Codex plugin. Some guide footers retain older Mac/Windows wording. Treat
the matching release instructions as authoritative for an actual installation;
this review verifies the published statements, not the supported environments.

The [runtime page](https://mirage.app/tesseract/developers/runtime) describes
native compositions, keyframes, effects, time remapping, and audio, with an
editable project retained after rendering. Exact interfaces belong to the
versioned release documentation. Mirage distributes a binary and does not claim
to publish the engine source. The useful architectural idea is a shared saved
project that both the agent and a small editing interface can change.

The [editor example](https://mirage.app/tesseract/developers/build-an-editor)
exposes headline, type-size, and accent-color controls, but explicitly identifies
the browser preview as an illustration rather than a shipping Tesseract editor.
Its proposed interface writes changes back to the same project and requests a
preview. We should preserve that distinction when describing any Slopcamera
controls: a brief composer is a brief composer until it updates retained source
and produces a new render.

## Slopcamera already has the underlying pieces

The current source supports several parts of this workflow:

- [Native studio receipts](../../src/studio/plan.ts) bind the planned source
  bundle, job, runtime, and declared outputs. The [studio guide](../studio.md)
  documents native frames becoming an ordinary project clip.
- [Spatial patches](../../src/spatial-scene/patch.ts) require the expected scene
  hash, address stable entities and channels, and return a structural diff.
  [Behavior validation](../../src/spatial-scene/behavior.ts) already checks
  declared graph wiring and composition cycles.
- [Spatial review evidence](../../src/spatial-scene/review.ts) records selected
  frame times, image hashes, and scene identity. Model findings remain advisory;
  they are not proof of artistic quality or automatic edits.
- [Style profiles](../../src/visual-style.ts) now separate shape, material,
  camera, cadence, finish, and acceptance criteria. The
  [study renderer](../../examples/style-portfolio/render.ts) retains requests
  and attempts; the [gallery builder](../../examples/style-portfolio/build-gallery.ts)
  copies explicitly selected movies, source files, metadata, and receipts.

The opportunity is to connect these pieces in the portfolio's review experience.
These are source-inspection findings, not a claim of feature parity.

## Five adaptations

### 1. Explain the mechanism beside each study

**Within portfolio scope.** Tesseract's [feature library](https://mirage.app/tesseract/features)
pairs named techniques with demonstrations and starting prompts. Use an original
Slopcamera description of what a viewer can inspect, followed by a short brief
they can adapt. Examples: held character drawings with a smoothly moving camera;
an integer pixel grid; wash texture attached to painted forms; physically staged
geometry followed by film finishing. Name the production method and limitations
alongside the mechanism. A style name alone does not demonstrate the mechanism.

### 2. Make revision requests precise and reusable

**Within portfolio scope.** The [preview guide](https://mirage.app/tesseract/docs/preview-and-refine)
recommends feedback tied to a time, an intended change, and what should remain
fixed. Add a copyable original revision brief containing the study ID, timestamp,
target, and invariants. Keep it visibly separate from rendering controls.

For example: “Revise study `theatrical-cel` between 2 and 3 seconds. Delay the
main action by 0.25 seconds. Preserve the camera, palette, background artwork,
total duration, and final composition. Save a new run and show the revised motion
before selecting it.” The executor should resolve the retained source identity
and record the resulting change, rather than silently replacing an earlier run.

### 3. Review motion with selected frames

**Small follow-up.** The same [preview guide](https://mirage.app/tesseract/docs/preview-and-refine)
uses frames near cuts and graphic entrances to diagnose timing and overlap.
Offer an explicitly selected strip for each study: opening, anticipation, peak
action, settle, and ending. Label time and frame number, and distinguish delivery
rate from held drawing cadence. Derive the images from the selected movie and
retain their hashes. A strip supplements full playback; it cannot establish
smoothness, sound quality, or the absence of texture shimmer.

### 4. Make the editable handoff as clear as the movie

**Within portfolio scope.** The [first-project guide](https://mirage.app/tesseract/docs/first-project)
keeps project and media together for later edits. Slopcamera's gallery already
retains explicitly selected source files. Add a small reproduction description
that identifies the entry file, required relative asset paths, parameters, and
exact render command. If a future download bundles sources, preserve their
directory relationships and include a file manifest. A set of renamed individual
downloads is evidence retention; it is not automatically a runnable project.

### 5. Build focused controls over retained parameters

**Future engineering work.** The [linked-properties example](https://mirage.app/tesseract/features/linked-properties)
describes a follower driven by a declared dependency on another element, rather
than separately authored matching motion. The [keyframe page](https://mirage.app/tesseract/features/keyframe-animation)
describes editable pose times, values, easing, and holds. Combine these ideas with
Slopcamera's existing patch and behavior contracts: expose a few typed controls
such as action time, palette role, or camera framing, backed by the same source
the agent edits. Validate IDs, units, timebase, and dependency cycles; show the
diff before creating a new retained render. Do not add disconnected browser
sliders or another general animation graph solely for the gallery.

## Recommended immediate change

Ship mechanism descriptions and original revision briefs with the selected
portfolio. Keep native geometry, procedural 2D, and generated-image motion
distinct. A moving photographic plate must state that its subjects do not move
independently. Historical treatments need dated source notes and reconstruction
labels. Public feature descriptions can guide presentation; the selected
Slopcamera artifacts and their review determine what this portfolio demonstrates.

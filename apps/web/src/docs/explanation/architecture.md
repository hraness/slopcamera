Slopcamera keeps authored source available while turning it into inspectable visual artifacts. A diagram, a Blender scene, a generated clip, and a screen recording can all contribute to one film, but they retain different editing capabilities and provenance. Understanding that difference explains most of the design: a finished image or video is a useful common boundary between renderers, and it does not preserve every property of the source that produced it.

## Authoritative sources and replaceable derivatives

Every workflow starts from an authored source that stays editable: a version-one diagram JSON file, a spatial scene document with named entities, a retained native bundle of Blender, CadQuery, or Manim source, an authored HTML document, or a lesson script. Rendering produces derivatives that are reproducible and replaceable: the five same-stem diagram exports, scene PNG and MOV output, encoded delivery video, a vectorized SVG, or generated footage.

The direction matters. Editing a diagram's JSON and re-rendering replaces its exports while keeping the relationship intact; editing the PNG directly would not. Some derivatives deliberately cross a boundary in one direction only. A splat capture is observed appearance with no independently editable objects or relightable materials. A rendered diagram mounted on a world-space surface preserves its pixels, not its shape graph. A native control rig is not automatically editable through portable spatial patches. When later edits may be needed, retain the source beside its derivatives.

## One host, several representations

The portable SDK owns the canonical contracts: diagram schemas, declarative graphs, spatial-scene documents, and native-job definitions. The complete local host consumes those contracts through its own closed projection and adds durable jobs, media import, rendering, project storage, and resource admission. The `slopcamera` CLI and the desktop shell use that host; the shell adds native capture, operating-system permissions, and UI. `slopcamera mcp` exposes a deliberately smaller boundary to other clients: compatibility diagram tools and the bounded portable registry.

Each representation gives agents a different editing contract. Spatial scenes expose stable entity IDs, calibrated cameras, and typed patches guarded by an expected source digest. Native bundles preserve detailed engine features such as rigs, bakes, mathematical animation, and solid geometry instead of reimplementing those tools as a large JSON scene language; executing them is explicitly trusted current-user code. The [SDK reference](/docs/reference/sdk) maps these boundaries to import paths, and [the engine stack](/docs/reference/engines) maps them to runtimes.

## One project, explicit state

A project is one immutable source basis plus explicit revisions, candidates, selections, and delivery variants. A frozen basis lets creative candidates and delivery variants refer to the same inputs; a subsequent edit produces a different basis rather than silently merging unrelated changes. This is more specific than treating every project as a universally reproducible commit.

The V2 spatial project aggregate adds explicit scene revisions, shot bindings, and candidate lineage. Migration snapshots the ordinary media basis and then rejects ordinary editing commands on the V2 head, so timeline and audio edits finish before migration. Short-clip directing retains recipes, takes, accepted selections, and reference lineage, then assembles current selections into an ordinary project. Changing an upstream accepted take invalidates dependent selections while preserving older attempts; first-frame and last-frame conditioning supports continuity but is not a neural checkpoint or a recovered editable world.

## What a receipt proves

Receipts bind exact identities: the source, job, plan, and runtime identities plus the hash and length of every physical output. A native runtime identity records executable and driver hashes and observed package and version evidence. It is not a hash of every system library, font, or plugin, and it is not proof of a hermetic operating system. A GPU receipt identifies observed hardware; regenerating on another driver need not be pixel-identical.

Plans bind declared inputs before effects run. The local scheduler admits physical work under resource claims, retains custody until processes settle, and reuses completed work only when input, tool, and receipt identities still match. A failed or interrupted attempt can leave useful outputs and uncertain effects: recovery inspects that exact attempt rather than assuming a timeout means nothing happened. Native reconciliation does not rerun source, directing resume does not resubmit a provider call, and a paid reservation remains when dispatch cannot be disproved. [Running and recovering workflows](/docs/how-to/run-workflows) covers the operational side.

A preview exercises the complete authored timeline at lower cost and helps assess pacing, cuts, overlays, and framing. A successful process or schema check is evidence about the pipeline, not creative acceptance: final dimensions, frame count, color, sound, and first and last frames still need inspection.

## Time, color, and renderer boundaries

Every offline frame has an explicit clock. Spatial scenes use integer-microsecond selections and rational frame rates; native jobs use half-open frame intervals; the renderer evaluates requested time rather than relying on a second live animation loop.

A derivative states its color and alpha interpretation. Native linear or data passes stay distinct from display-ready sRGB imagery, and encoding records any 16-to-8-bit conversion while retaining the original masters. Shared camera samples transfer calibrated poses and intrinsics between renderers; they do not make different lighting engines pixel-identical. When a cut must preserve finished pixels, share a raster surface rather than a scene.

## Local and cloud work

Project state lives locally. Slopcamera has no product account and no hosted project database; the desktop host, the portable SDK, and the MCP boundary all operate on files and receipts on your machine. Local rendering consumes admitted assets, while explicit acquisition and provider operations cross separate network boundaries: Gateway sends authorized prompts and named references to models, private Blob hosting grants temporary reference access, Poly Haven imports selected assets, and first-use provisioning may download verified tool dependencies.

Credentials belong to the invocation environment and are never project data. A model request's local estimate is not a provider-enforced spending cap, and downloading a public asset, uploading private references, and rendering retained bytes are distinct operations with distinct receipts. The [capability reference](/docs/reference/capabilities) records the current platform and trust limits, and [Why Slopcamera](/docs/explanation/why-slopcamera) explains what this retained-source model gives an agent that a loose toolchain does not.

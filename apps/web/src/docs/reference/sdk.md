Installing `@hraness/slopcamera` does not enable every operation in every host. Each public import path selects a capability boundary: the portable surfaces run anywhere Bun runs, while the `local` subpaths need the source-backed Slopcamera distribution — the installed Bun package or a checkout — and its admitted tools. Check [release and platform support](/docs/reference/capabilities) before relying on a current-source addition.

## Public entrypoints

| Import | Contract |
| --- | --- |
| `@hraness/slopcamera` | Diagram schemas and rendering, vectorization, portable spatial-scene and native-studio contracts, and pure planning helpers. Named exports and the frozen `slopcameraApi` object carry the same surface. |
| `@hraness/slopcamera/code` | Declarative graph authoring and compilation against the portable four-operation projection. |
| `@hraness/slopcamera/code/advanced` | Lower-level portable graph, compiler, canonical-JSON, and planning contracts. |
| `@hraness/slopcamera/operations` | The fixed portable semantic operation registry and its executor. |
| `@hraness/slopcamera/workflow` | The preserved imperative v0.8 API for explicitly imported trusted Bun workflows. |
| `@hraness/slopcamera/host-resources` | Host resource admission contracts and coordinators. |
| `@hraness/slopcamera/generate` | Direct Vercel AI Gateway image generation and credential-status contracts. |
| `@hraness/slopcamera/scene` | The provider-neutral local scene-analysis contract. |
| `@hraness/slopcamera/cli` | The `slopcamera` command's entrypoint module and injectable dependency surface. |
| `@hraness/slopcamera/local/code` | Local declarative authoring, schemas, and the complete media capability projection. |
| `@hraness/slopcamera/local/code/advanced` | Local graph planning, execution, and host integration. |
| `@hraness/slopcamera/local/code/workflows` | Checked built-in local workflow definitions. |
| `@hraness/slopcamera/local/html-overlay` | Local HTML scene authoring, request schemas, music-clock and audio-reactivity helpers, rigged GLB preparation, and rendering profiles. |

There is no `@hraness/slopcamera/code/testing` or portable `@hraness/slopcamera/code/workflows` entrypoint, and no open operation-registration hook on any surface. The `local` subpaths are not browser SDKs; they ship with the source-backed Bun package or a checkout.

## The portable projection

The portable projection contains exactly four operations: `slopcamera.diagram.check`, `slopcamera.diagram.render`, `slopcamera.image.vectorize`, and `slopcamera.image.generate`. Portable spatial and studio schemas can parse, hash, and plan values without making their local executors available.

Compilation binds one closed projection. A graph containing an unsupported operation fails before executor or resource admission. An operation input is typed data, never a caller-selected executable, shell command, dynamic loader, or registration hook.

## The local projection

The local builder adds the `analysis`, `edits`, `gateway`, `iteration`, `studio`, `scene`, `spatialProject`, `media`, `project`, `render`, and `recording` operation families. Inspect the installed registry and built-in schemas rather than inventing names:

```sh
slopcamera operations list --json
slopcamera operations show slopcamera.studio.run --json
slopcamera workflows list --json
slopcamera workflows show directed-scene --json
```

Local `media.ingest` imports files into an existing project. There is no public SDK operation that creates a project from arbitrary standalone files: creation starts from a stopped recording, a successful studio or directing assembly, or an authored scene rendered with `html render`. Access to TypeScript types does not authorize calling private storage constructors.

## Author a declarative graph

`@hraness/slopcamera/code` supplies `defineWorkflow`, `buildWorkflow`, and `compileWorkflowGraph`. Its `compileWorkflowGraph` compiles only against the closed public projection; reach for `@hraness/slopcamera/code/advanced` when you need the compiler's lower-level contracts. This example is the checked `examples/declarative-workflow.ts` reduced to its imports and build step:

```ts
import {
  buildWorkflow,
  compileWorkflowGraph,
  createSlopcameraCodeHost,
  defineWorkflow,
  runBuiltWorkflow,
} from "@hraness/slopcamera/code"
import { executeSlopcameraOperation } from "@hraness/slopcamera/operations"
import { z } from "zod"

const InputSchema = z.strictObject({
  path: z.string().min(1),
})

export const checkedRender = defineWorkflow({
  id: "checked-render",
  inputSchema: InputSchema,
  inputSchemaId: "example.checked-render.input/v1",
  version: 1,
  build(builder, input) {
    const checked = builder.diagram.check("check-source", { path: input.path })
    const rendered = builder.diagram.render(
      "render-assets",
      { path: input.path },
      { after: checked },
    )
    return { checked, rendered }
  },
})
```

Run a built workflow by compiling its graph and giving it a host that executes operations. `createSlopcameraCodeHost` wraps any executor; `executeSlopcameraOperation` from `@hraness/slopcamera/operations` is the portable one.

```ts
const built = buildWorkflow(checkedRender, { path: "first.diagram.json" })
const planned = compileWorkflowGraph({ graph: built.graph })
const host = createSlopcameraCodeHost({
  execute: async request =>
    await executeSlopcameraOperation(request.kind, request.input),
})
const result = await runBuiltWorkflow(built, { host })
```

The checked examples in the package show the full surfaces: `examples/declarative-workflow.ts` for portable graph authoring, `examples/render-workflow.ts` for the imperative API, `examples/studio/native-workflow.ts` for a durable local native job, and `examples/studio/hybrid-scene.ts` for pure scene construction from admitted assets.

## The imperative v0.8 surface

`@hraness/slopcamera/workflow` keeps the imperative API: `defineSlopcameraWorkflow` declares a workflow that parses its runtime input, and `runSlopcameraWorkflow` dispatches bounded steps over the same fixed operation registry. Workflow modules are explicitly imported trusted Bun code running as the current user; the API never dynamically imports authored source, and it drains dispatched work before returning.

## Music timing for HTML scenes

`@hraness/slopcamera/local/html-overlay` exports `HtmlSceneInputSchema`, which parses the `slopcamera.html-scene` version-one request accepted by `slopcamera html render`, plus `HtmlOverlayMusicTimingSchema`, `sampleHtmlOverlayMusicClock(timeUs, timing)`, and `htmlOverlayMusicPulse(beatPhase, widthBeats)`. Authored browser documents call the equivalent `SlopcameraOverlay.musicClock(...)` and `SlopcameraOverlay.musicPulse(...)`.

| Value | Contract |
| --- | --- |
| `timeUs` | Absolute integer microseconds within ±3,600,000,000. Convert an `onFrame` callback's `timeMs` with `Math.round(timeMs * 1000)`. |
| `timing` | `{ bpm, beatOffsetUs, beatsPerBar }`: a constant tempo from 20 to 400 BPM, the absolute integer-microsecond time of beat zero within the same bound, and one to 32 beats per bar. |
| Clock result | `{ beatPosition, beatIndex, beatPhase, barIndex, barPhase }`. Positions and indices can be negative before beat zero; indices round down and phases lie in `[0, 1)`. |
| `widthBeats` | Full nonzero pulse width in `(0, 1]`, default `0.5`, with equal anticipation and decay around the beat. |
| Pulse result | A value in `[0, 1]` with zero slope at the beat seam and support edges. |

These helpers sample declared musical timing. They do not detect tempo, inspect the soundtrack, or analyze rendered flashes; the scene author still owns the amplitude, area, color, and timing of visible effects. See [the music-video guide](/docs/how-to/music-video) for a complete scene request.

## Audio-reactive envelopes for HTML scenes

Set `audio.reactivity` to `{ "profile": "bands-v1" }` in an `html-scene` request to derive a local envelope from the verified soundtrack. The fixed profile analyzes 24 kHz mono PCM into bass (35–180 Hz), midrange (180–2,000 Hz), treble (2,000–12,000 Hz), and overall-energy channels. It applies a quiet-input floor, useful-range normalization, and attack/release smoothing, then retains a hash-bound JSON resource named `audio-reactivity` at `slopcamera/audio-reactivity.json`. Analysis is limited to ten minutes per scene.

The local HTML entrypoint exports `HtmlOverlayAudioReactivitySchema` and `prepareHtmlOverlayAudioReactivity(value)`. Browser documents use the equivalent `SlopcameraOverlay.prepareAudioReactivity(value)` method. Load the declared resource once during readiness and sample it from the absolute frame clock:

```ts
let envelope;
SlopcameraOverlay.ready((async () => {
  const response = await fetch(SlopcameraOverlay.asset("audio-reactivity"));
  envelope = SlopcameraOverlay.prepareAudioReactivity(await response.json());
})());
SlopcameraOverlay.onFrame(({ timeMs }) => {
  const sample = envelope.sample(Math.round(timeMs * 1000));
  light.intensity = 0.3 + sample.bass + 0.5 * sample.treble;
  renderer.render(scene, camera);
});
```

`sample(timeUs)` accepts safe integer microseconds, interpolates in constant time, and returns zero outside the analyzed duration. The generated `source.json` retains the resource declaration and reuses it only when its recorded soundtrack digest still matches. Envelopes help drive animation; they are not a flash-safety certification.

## Prepare rigged GLB assets

`prepareThreeRiggedGlb(bytes, options)` prepares a self-contained, uncompressed skinned GLB for an authored Three scene. Preparation is pure: it reads no files, starts no browser, and fetches no decoders. It returns the source's byte length and SHA-256, bone inspection with evaluated rest bounds, a generated local module that uses the scene's approved `three` library, and detached declaration-plus-bytes texture resources to write beside it.

The `options` value takes a unique lowercase-hyphenated `name` of up to 32 characters and a `provenance` record whose `source` is `"authored"` or `"imported"` with a required `description`. The profile supports triangle geometry, four skin influences per vertex, TRS or TRS-decomposable node matrices, and bounded base-color PBR materials with embedded PNG or JPEG textures. It admits at most 1,024 nodes, 64 skins, 256 joints per skin, 32 extracted images, and a 32 MiB generated module. Draco and other extensions, morph targets, sparse accessors, external dependencies, and embedded animation clips reject. This helper does not change the portable spatial-scene GLB profile, which continues to reject skins.

## Execution and trust

Pure schema parsing and portable planning never execute authored native source. Loading a custom TypeScript workflow for `code check` or `code plan` does execute the module's top-level code; withholding registered effects is not an OS sandbox.

The local scheduler binds exact artifacts, operation plans, and observed runtime identities. It admits physical work under resource claims, retains progress and receipts on every failure path, and rejects incompatible inputs on resume. Runtime identity is evidence about the selected tools and observed environment, not proof of a hermetic operating system.

Effect approval and native source authorization have different scopes. `runs approve` records an exact preparation or node plan, while native execution through `slopcamera.studio.run` additionally needs an invocation-scoped `--allow-trusted-code` envelope. [Running workflows](/docs/how-to/run-workflows) covers the plan, approval, and resume commands.

`slopcamera mcp` exposes compatibility diagram tools and the bounded portable registry to other clients. Its paths are root-relative, its configuration is inert, and its diagram tools admit at most 64 shapes and 128 edges with at most 40 reported findings. Generated `.tldr` output is editable interchange for browser-based canvas tooling; the diagram JSON remains the authored source. See [the MCP setup page](/docs/tutorials/mcp) and [the engine stack reference](/docs/reference/engines) for the surrounding contracts.

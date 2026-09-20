# SDK and workflow surfaces

Slopcamera exposes a portable Bun SDK and a complete local media host. Imports select their capability boundary; installing a package does not enable every operation in every host. See [version and capability support](capabilities.md) before using current-source additions.

## Public entrypoints

| Import | Contract |
| --- | --- |
| `@hraness/slopcamera` | Diagram schemas/rendering, vectorization and portable scene/studio contracts and pure planning helpers. |
| `@hraness/slopcamera/code` | Declarative authoring and compilation against the fixed portable projection. |
| `@hraness/slopcamera/code/advanced` | Lower-level portable graph, compiler and planning contracts. |
| `@hraness/slopcamera/operations` | The fixed portable semantic operation registry. |
| `@hraness/slopcamera/workflow` | Preserved imperative v0.8 API for explicitly imported trusted Bun workflows. |
| `@hraness/slopcamera/host-resources` | Host resource admission contracts. |
| `@hraness/slopcamera/local/code` | Local declarative authoring, schemas and complete media capability projection. |
| `@hraness/slopcamera/local/code/advanced` | Local graph planning, execution and host integration. |
| `@hraness/slopcamera/local/code/workflows` | Checked built-in local workflow definitions. |
| `@hraness/slopcamera/local/html-overlay` | Local HTML authoring, scene-input schemas, music-clock and audio-reactivity helpers, rigged GLB preparation, profiles and contracts. |

There is no public `@hraness/slopcamera/code/testing` or portable `@hraness/slopcamera/code/workflows` entrypoint. The local subpaths need the source-backed Bun distribution — the installed package or a checkout, never a copied standalone executable; they are not browser SDKs.

## Parametric designs

`@hraness/slopcamera/code` exports `parseSpatialDesign`, `inspectSpatialDesign`, `editSpatialDesignParameters`, `compileSpatialDesign`, `listSpatialDesignTemplates` and `createSpatialDesignStarter`. These effect-free helpers retain scalar dependencies, dimensional constraints and generated geometry. Use the [design reference](../parametric-design.md) for schemas, limits and compilation receipts, and the CLI for asset publication and rendering.

## Portable and local operations

The v3.2.8 portable projection contains four operations: diagram check/render and image generate/vectorize. Current source adds image icon/gallery, for six operations. Portable spatial and studio schemas can parse, hash and plan values without making their local executors available. A graph containing an unsupported operation fails before executor or resource admission.

The local builder adds `analysis`, `edits`, `gateway`, `iteration`, `studio`, `scene`, `spatialProject`, `media`, `project`, `render` and `recording` operations. Inspect the current registry and built-in schemas through the host:

```sh
slopcamera operations list --json
slopcamera operations show slopcamera.studio.run --json
slopcamera workflows list --json
slopcamera workflows show directed-scene --json
```

The registries are closed. An operation input is typed data, not a caller-selected executable, shell command, dynamic loader or registration hook.

Local `media.ingest` imports into an existing project. The public CLI creates ordinary projects from an existing finished recording bundle, a successful studio/directing assembly, or `html render` with an authored scene and optional local soundtrack. There is no public SDK project-create operation for arbitrary independent files. Access to TypeScript types does not authorize calling private storage constructors.

## Music timing for HTML scenes

`HtmlSceneInputSchema` parses the `slopcamera.html-scene` version-one request used by `slopcamera html render`. It accepts a document, canvas, explicit timing, seed, library selection, parameters, declared resources, and optional local audio. The command performs the render and ordinary-project creation. See [the music-video guide](../how-to/music-video.md) for a complete request.

The local HTML entrypoint exports `HtmlOverlayMusicTimingSchema`, `sampleHtmlOverlayMusicClock(timeUs, timing)`, and `htmlOverlayMusicPulse(beatPhase, widthBeats)`. Authored browser documents use the equivalent `SlopcameraOverlay.musicClock(...)` and `SlopcameraOverlay.musicPulse(...)` methods.

| Value | Contract |
| --- | --- |
| `timeUs` | Absolute integer microseconds within ±3,600,000,000. Convert an `onFrame` callback's `timeMs` with `Math.round(timeMs * 1000)`. |
| `timing` | `{ bpm, beatOffsetUs, beatsPerBar }`: constant tempo from 20 to 400 BPM, the absolute integer-microsecond time of beat zero within ±3,600,000,000, and one to 32 beats per bar. |
| Clock result | `{ beatPosition, beatIndex, beatPhase, barIndex, barPhase }`. Positions and indices can be negative before beat zero; indices round down and phases lie in `[0, 1)`. |
| `widthBeats` | Full nonzero pulse width in `(0, 1]`, default `0.5`, with equal anticipation and decay around the beat. |
| Pulse result | A value in `[0, 1]` with zero slope at the beat seam and support edges. |

These helpers sample declared musical timing. They do not detect tempo, inspect the soundtrack, or analyze rendered flashes. Scene authors still own the amplitude, area, color, and timing of visible effects.

## Audio-reactive envelopes for HTML scenes

Set `audio.reactivity` to `{ profile: "bands-v1" }` in an `html-scene` request to derive a local envelope from the verified soundtrack. The fixed profile analyzes 24 kHz mono PCM into bass (35–180 Hz), midrange (180–2,000 Hz), treble (2,000–12,000 Hz), and overall-energy channels. It applies a quiet-input floor, useful-range normalization, and attack/release smoothing, then retains a hash-bound JSON resource named `audio-reactivity` at `slopcamera/audio-reactivity.json`. Analysis is limited to ten minutes per scene.

The local HTML entrypoint exports `HtmlOverlayAudioReactivitySchema` and `prepareHtmlOverlayAudioReactivity(value)`. Browser documents use the equivalent `SlopcameraOverlay.prepareAudioReactivity(value)` method. Load the declared resource once during readiness and sample it from the absolute frame clock:

```js
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

`prepareThreeRiggedGlb(bytes, options)` prepares a self-contained, uncompressed skinned GLB for an authored HTML Three scene. It returns source identity and bone inspection, a local JavaScript module, and extracted texture resources. Preparation is pure: it reads no files, starts no browser, and fetches no decoders. The generated module uses the scene's approved core `three` library.

| Value | Contract |
| --- | --- |
| `options` | `{ name, provenance }`. Use a unique lowercase hyphenated resource name, up to 32 characters. Provenance requires `source: "authored" \| "imported"` and `description`; `sourceUrl`, `license`, and `attribution` are optional recorded facts. |
| `prepared.inspection` | Original GLB byte length and SHA-256, provenance, evaluated rest bounds, geometry counts, bones with source node indices and names, and extracted image declarations. Bounds use glTF's Y-up coordinates and source transforms. |
| `prepared.resources` | Detached `{ declaration, bytes }` entries for the module and textures. Write the bytes and preserve each declaration's name, URL path, and media type. |
| `prepared.moduleResource` | The declaration whose name identifies the module. `createThreeRiggedGlbModule(prepared)` returns that same module's source text. |

Run preparation in a trusted Bun script from the workspace root. Use a fresh output directory, retain the original GLB and inspection beside the generated resources, and copy the resulting `resources` array into the scene request:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { prepareThreeRiggedGlb } from "@hraness/slopcamera/local/html-overlay";

const original = await readFile("assets/mascot.glb");
const prepared = prepareThreeRiggedGlb(original, {
  name: "mascot",
  provenance: { source: "imported", description: "Selected character for this scene" },
});
const directory = "artifacts/slopcamera/generated/mascot-rig";
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/source.glb`, original, { flag: "wx" });
await writeFile(`${directory}/inspection.json`, JSON.stringify(prepared.inspection), { flag: "wx" });
const resources = [];
for (const { declaration, bytes } of prepared.resources) {
  const path = `${directory}/${declaration.name}`;
  await writeFile(path, bytes, { flag: "wx" });
  const { bytes: _bytes, sha256: _sha256, ...resource } = declaration;
  resources.push({ ...resource, path });
}
await writeFile(`${directory}/resources.json`, JSON.stringify(resources), { flag: "wx" });
```

The scene command binds the exact resource bytes when it loads these paths. No GLTFLoader addon or additional library selection is needed. Inside your existing Three scene module, call `ready` and `onFrame` synchronously when the module starts. Put asynchronous module and texture loading inside the promise passed to `ready`, then restore the rest pose before each absolute-time pose:

```js
let rig;
SlopcameraOverlay.ready((async () => {
  const { createRig } = await import(SlopcameraOverlay.asset("mascot-module"));
  rig = await createRig(THREE);
  scene.add(rig.root);
  renderer.compile(scene, camera);
})());
SlopcameraOverlay.onFrame(({ timeMs }) => {
  rig.resetPose();
  const beat = SlopcameraOverlay.musicClock(Math.round(timeMs * 1000), {
    bpm: 88.88, beatOffsetUs: 0, beatsPerBar: 4,
  });
  rig.bones[0].rotateZ(0.15 * Math.sin(2 * Math.PI * beat.beatPosition));
  renderer.render(scene, camera);
});
```

Here `THREE`, `scene`, `renderer`, and `camera` come from your authored scene. Select specific joints with `rig.boneByName(name)` using the inspection; duplicate names require `rig.nodes[sourceNodeIndex]`. Stage the character through `rig.root`; `resetPose()` preserves that outer position, rotation, and scale. Call `rig.dispose()` when removing the rig. The module awaits declared textures and never uses network model loading or blob URLs.

The profile supports triangle geometry, four skin influences per vertex, TRS or TRS-decomposable node matrices, and bounded base-color PBR materials with embedded PNG/JPEG textures. It admits at most 1,024 nodes, 64 skins, 256 joints per skin, 32 extracted images, and a 32 MiB generated module, within the existing GLB geometry and byte budgets. Draco and other extensions, morph targets, sparse accessors, external dependencies, and embedded animation clips reject. Preserve a decoded derivative's original source and attribution. This helper prepares Three-scene modules; portable spatial-scene GLB admission keeps its own profiles — the static profile rejects skins while the current-source `slopcamera.glb-rigged-morph-skin-v1` profile admits them within declared bounds.

## Checked examples

| Example | Host and purpose |
| --- | --- |
| [declarative-workflow.ts](../../examples/declarative-workflow.ts) | Portable diagram workflow and graph authoring. |
| [render-workflow.ts](../../examples/render-workflow.ts) | Preserved imperative Bun workflow. |
| [native-workflow.ts](../../examples/studio/native-workflow.ts) | Local native job through the durable scheduler. |
| [hybrid-scene.ts](../../examples/studio/hybrid-scene.ts) | Pure shared-city and world-media scene construction from admitted assets. |
| [music-video.html](../../examples/html/music-video.html) and [music-video.json](../../examples/html/music-video.json) | Original articulated Three.js mascot, procedural island scenery, and a scene-export request with explicit music timing. |

The native example exports this workflow definition:

```ts
import { defineWorkflow, StudioRunInputSchema } from "@hraness/slopcamera/local/code";

export default defineWorkflow({
  id: "native-studio-shot",
  version: 1,
  inputSchemaId: "native-studio-shot-input-v1",
  inputSchema: StudioRunInputSchema,
  build(workflow, input) {
    return { shot: workflow.studio.run("produce-shot", input) };
  },
});
```

Its input binds the retained bundle manifest and exact job. The host invocation supplies runtime paths and the separate `--allow-trusted-code` authorization; those permissions are not stored in the graph. The result contains generic output file references and a native receipt, not a new project type. Follow [running workflows](../how-to/run-workflows.md) for plan, approval and resume commands.

## Execution and trust

Pure schema parsing and portable planning do not execute authored native source. Loading a custom TypeScript workflow for `code check` or `code plan` does execute the trusted Bun module's top-level code; withholding registered effects is not an OS sandbox.

The local scheduler binds exact artifacts, operation plans and observed runtime identities. It admits physical work under resource claims, retains progress and receipts, and rejects incompatible inputs on resume. Runtime identity is evidence about the selected tools and observed environment, not proof of a hermetic operating system.

Effect approval and native source authorization have different scopes. `runs approve` records an exact preparation or node plan. Native execution also needs an invocation-scoped trusted-current-user envelope. An ambiguous external or native attempt must be reconciled; a missing journal is not proof that nothing ran. Cancellation cannot roll back a completed provider request or published artifact.

## MCP and canvas interchange

The v3.2.8 MCP server exposes four tools: `check_diagram`, `render_diagram`, `search_slopcamera`, and `execute_slopcamera`. Current source adds thirteen scene tools, for seventeen named tools; these include scene inspection and evaluation, direction and gallery planning, effects planning, temporal audit, and behavior check/audit. The portable operation projection also expands from four to six. Paths are root-relative, configuration is inert, and diagram tools admit at most 64 shapes and 128 edges with at most 40 reported findings. Scene tools cap returned entities, samples, and diff entries. No tool mutates project state. The CLI supports larger checked diagrams and trusted workspace configuration.

Generated `.tldr` is editable interchange for browser-based canvas tooling. Slopcamera does not install or launch a diagram editor or application bundle, and the diagram JSON remains the authored source. See the [diagram tutorial](../tutorials/first-diagram.md) for source and export behavior.

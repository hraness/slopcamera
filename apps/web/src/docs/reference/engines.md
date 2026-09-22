Slopcamera divides media work among engine families with different trust and runtime requirements. Some are bundled and deterministic, some are separately installed native tools, and one crosses the network boundary to paid models. Run `{{DOCTOR_COMMAND}}` to see which engines the installed host can use on this machine, and check [release and platform support](/docs/reference/capabilities) for released commands and any later source corrections.

## Engine families

| Engine | Job | Needs | Limits |
| --- | --- | --- | --- |
| Diagram renderer | Checks a version-one `.diagram.json` source and renders five same-stem outputs: `.tldr`, light and dark SVG, and light and dark PNG | The Bun package and its bundled rendering dependencies; no tldraw app, no network | Deterministic layout only; the MCP surface bounds inputs to 64 shapes and 128 edges |
| Local vectorizer | Converts a raster image into a measured, sanitized SVG through checksum-pinned VTracer | macOS or Linux; first use may download a verified VTracer archive | Windows deliberately rejects the profile; authentication-free and network-silent at run time; no embedded-raster fallback or upscaling model |
| Gateway generation | Image, video, speech, and batch transcription through the live Vercel AI Gateway catalog | A caller-owned `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` in the invocation environment, plus explicit acknowledgement before named uploads | Credentials are never persisted or passed in argv; responses are bounded and retries are disabled; local estimates are not provider-enforced spending caps |
| HTML and Three.js overlay | Renders an authored browser document or spatial scene on one absolute clock with declared assets | An admitted local Chrome runtime and exact versioned library locks verified before each render | Seven pinned profiles; ambient network is denied during a render; no caller-selected remote URLs or dynamic evaluation |
| Hardware scene profiles | GPU rasterization for spatial scenes, including bounded saved splats | macOS WebGL2 through ANGLE Metal; the Spark profile adds a separate qualified worker and WASM closure | Software or unknown fallback rejects; receipts record observed hardware; cross-driver regeneration need not be pixel-identical |
| Native studio adapter | Runs a retained, hash-bound Blender, CadQuery, or Manim bundle as trusted current-user code | An explicitly selected engine executable or Python environment and an invocation-scoped `--allow-trusted-code` envelope | Explicitly nonhermetic with no OS sandbox; a GPU request never falls back to CPU; native jobs are production assets, not a third timeline system |
| Video assembly | Imports media, applies bounded non-destructive edits, and encodes deliveries through the project compositor | FFmpeg and FFprobe; an existing project or a supported project-creation path | Assembly uses verified video spans; a successful preview exercises the timeline but is not creative acceptance |

## Deterministic local engines

The diagram renderer and the vectorizer are the portable core. A diagram source stays authoritative: re-rendering replaces the five exports while keeping the JSON, and the `.tldr` file is editable interchange rather than a second source. The vectorizer fails closed: it runs supervised VTracer processes with bounded inputs, measures fidelity, and records full provenance receipts.

The HTML overlay host owns the invariants for every browser document: one absolute microsecond clock, seeded entropy, declared assets, a content security policy, network isolation, transparent capture, resource bounds, timeouts, and receipts. Each of the seven profiles pairs one primary authoring job with one exact tested dependency: `plain` uses the browser platform alone, `motion` locks Motion 12.42.2 for seekable DOM and SVG choreography, `p5` locks p5.js 2.3.2 for immediate-mode Canvas sketching, `two` locks Two.js 0.8.24 for retained vector scenes, `paper-shaders` locks Paper Shaders 0.0.77 for declarative shader treatments, `three` locks Three.js 0.185.1 for retained 3D scenes, and `vgpu` locks vgpu 0.3.1 for explicit WebGPU work. [Choosing an HTML authoring surface](/docs/explanation/html-authoring) explains when each profile fits.

## Hardware scene profiles

Spatial scenes render through named cameras with a software default. The `three-webgl2-hardware-v1` profile requires macOS and a WebGL2 context through ANGLE Metal, and it rejects software or unknown fallback rather than silently degrading. The `three-spark-webgl2-hardware-v1` profile adds a separately qualified Spark dependency closure for bounded saved splat environments, with an aggregate rendered-world limit of 500,000 splats. Both profiles keep the same explicit scene clock and linear color compositing; frame publication fails on context loss or unsettled work. See [the spatial scenes guide](/docs/how-to/direct-scenes) for the command surface.

## Gateway generation

Generation commands discover support from the live Gateway catalog rather than a checked-in model list. A request reads `AI_GATEWAY_API_KEY` before `VERCEL_OIDC_TOKEN`, pins the fixed Gateway origin, bounds the response, and sets `maxRetries` to zero so an ambiguous paid call is never resubmitted. Uploads cross the boundary only for exact caller-named media after a modality acknowledgement; credentials stay in the invocation environment and never enter projects, receipts, argv, or logs. [Generating media](/docs/how-to/generate-media) covers discovery, acknowledgement, and retention.

## Native studio adapter

The `studio` commands drive separately installed engines through retained, hash-bound source bundles. Native qualification used Blender 5.2.1 LTS, CadQuery 2.8.0, and Manim Community 0.21.0; these observations do not certify every plugin, solver, device, or imported asset. You select the exact Blender executable or Python virtual environment per invocation, and a GPU request fails clearly rather than falling back to CPU. Manim runs through its qualified Cairo profile.

Execution requires a separate `--allow-trusted-code` envelope per invocation: importing or bundling native source stays inert, while running it is trusted current-user code with runtime paths owned by the host. A distinct optional vgpu 0.4.1 example runtime exists for programmable WebGPU passes; it is provisioned separately through Node and Dawn and is not a registered studio engine or an upgrade to the browser overlay's `vgpu` lock. [Authoring native films](/docs/how-to/native-films) walks through the job contract.

## Video assembly and capture

The project compositor turns imported footage, rendered scenes, native output, and generated media into deliveries through FFmpeg. Edits are typed, bounded, non-destructive transforms; media assembly uses verified video spans so container audio padding cannot introduce a black frame at a cut. The released and current CLIs do not capture new recordings. Existing recording bundles may retain the cursor and input metadata needed for screen-action effects; generic imported video does not acquire that metadata.

Ready work is bounded by resource claims, and expensive encodes serialize by default. A preview exercises the complete authored timeline at lower cost, but final dimensions, frame count, color, sound, and first and last frames still need inspection before delivery.

## What a receipt proves

Every engine family emits receipts that bind exact identities: source, request, plan, runtime, and the hash and length of each output. A GPU receipt identifies observed hardware, and a native receipt records executable and driver evidence. These are observations about what ran, not proof of a hermetic environment; the [SDK reference](/docs/reference/sdk) describes how the durable scheduler retains and reuses them.

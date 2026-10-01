# SlopCamera documentation

SlopCamera is a media studio for coding agents. Your agent works with editable source and a media project. The CLI checks and renders them, and a revision keeps those inputs available for the next version. Choose a guide for the work you want to do.

Install the [current SlopCamera release](../README.md#install-slopcamera) for the CLI, SDK and matching Agent Skill. Each guide lists the tools it needs and explains when an example requires a source checkout. The [capability reference](reference/capabilities.md) covers formats, interfaces and local runtime requirements.

## Learn by making something

- [Create and revise your first animation](tutorials/first-animation.md): send a midnight tram toward the moon, enlarge the moon, and keep both films.
- [Create and revise your first diagram](tutorials/first-diagram.md): make a two-node diagram, inspect its five exports, then change its source.
- [Render your first native film](tutorials/first-native-film.md): retain a Blender source, render a small shot, and export an ordinary SlopCamera project.

## Complete a task

- [Remix the showcase](how-to/remix-the-showcase.md): open the finished films, study the creative decisions, and make your own version.
- [Direct a film](how-to/direct-a-film.md): write a useful brief, test the hardest shot, and refine composition, movement, and sound.
- [Run current-source commands](how-to/use-current-source.md): build an exact checkout of SlopCamera.
- [Prepare patent-style drawing sheets](how-to/patent-drawings.md): retain diagram source, check physical bounds, and render monochrome SVG sheets and a PDF.

- [Render motion graphics from HTML](how-to/render-motion-graphics.md): choose among seven authoring profiles, render a graphic, and retain its source.
- [Direct a film or animation style](how-to/direct-visual-styles.md): use reusable art direction and render the original style studies; requires current source.
- [Edit and deliver video](how-to/edit-video.md): import footage, align related tracks, place overlays, and check a delivery.
- [Make a music video from an HTML scene](how-to/music-video.md): render authored visuals with a local track and retain separate sources in an editable project.
- [Convert raster images to SVG](how-to/vectorize-images.md): trace artwork locally, compare a duotone treatment, and inspect fidelity.
- [Generate images, video, or narration](how-to/generate-media.md): discover Gateway capabilities, acknowledge selected uploads, and retain the result.
- [Make a scrolling pixel landscape](how-to/pixel-landscapes.md): compare continuous backgrounds and turn them into palette-checked alpha pixels.
- [Direct short generated clips](directing-video.md): budget, review takes, preserve endpoint continuity, and recover uncertain work.
- [Render Blender, CadQuery, and Manim films from source](studio.md): use Blender, CadQuery, or Manim; retain caches; share assets and calibrated cameras.
- [Build and revise a parametric design](how-to/parametric-design.md): generate architectural models from retained parameters, inspect dependencies and render alternatives.
- [Render and edit Three.js 3D scenes](spatial-scenes.md): patch named entities, use hardware rendering, import a saved world, or prepare a V2 shot composition.
- [Build a directed cinematic character world](how-to/cinematic-character-worlds.md): admit a rigged world, direct it semantically, plan effects and galleries, and audit temporal evidence.
- [Plan camera moves, lighting, and effects for a 3D scene](how-to/direct-cinematic-worlds.md): author an inert recipe pack and run the `cinematic-world` planning-and-review workflow.
- [Make a math explainer video with Manim](how-to/educational-video.md): keep mathematical visuals, narration, and timing evidence revisable.
- [Run or recover a workflow](how-to/run-workflows.md): use a built-in recipe or trusted Bun module and inspect its durable run.
- [Configure Vercel](vercel.md), [publish SlopCamera](publishing.md), [operate the hosted API](hosted-api.md), or [file a platform submission](platform-submission.md): provider and maintainer procedures.

## Look up a contract

- [Capabilities, versions, and platforms](reference/capabilities.md): formats, commands, platforms and runtime requirements.
- [SDK surfaces](reference/sdk.md): portable and local imports, operation projections, and execution contracts.
- [Techniques catalog](https://slopcamera.com/docs/reference/techniques): every packaged technique by job, with its first command, guide, and a rendered example where one exists.
- [CLI help](reference/capabilities.md#discover-the-installed-contract): exact grammar and JSON schemas from the installed host.

## Understand the design

- [Source, representations, and projects](architecture.md): what stays editable, what a receipt proves, and how local and cloud work fit together.
- [Extension architecture](extension-architecture.md): the closed registry, inert recipe packs, trusted workflows, and where authored code can and cannot go.
- [Why SlopCamera](https://slopcamera.com/docs/explanation/why-slopcamera): why the agent keeps a source file and reuses installed techniques, with comparisons to [Remotion](https://slopcamera.com/docs/explanation/slopcamera-vs-remotion), [HyperFrames](https://slopcamera.com/docs/explanation/slopcamera-vs-hyperframes), and [other tools](https://slopcamera.com/docs/explanation/remotion-alternatives-for-coding-agents).
- [Agent cost study](https://slopcamera.com/docs/explanation/token-benchmark): methods and reports for first-render and revision costs, with the harness and raw results in [`bench/token-savings`](../bench/token-savings).
- [Choose an HTML authoring surface](html-overlay-creative-toolkit.md): why DOM, vector, Three.js, and explicit GPU profiles serve different jobs. Its ecosystem research is dated separately from its supported locks.

## Work with an agent

The [SlopCamera Agent Skill](../skills/slopcamera/SKILL.md) routes an agent to the relevant task reference. Install the skill from the same release or source build as your CLI; installing a skill alone does not install the CLI or native tools. See the [installation instructions](../README.md#install-slopcamera).

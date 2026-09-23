# Slopcamera documentation

Slopcamera retains editable source, renders local or generated media, and assembles it into inspectable video projects. Choose a guide for the work you want to do.

Install the [current Slopcamera release](../README.md#install-slopcamera) for the CLI, SDK, and matching Agent Skill. Each guide names its local runtimes and any correction that needs [current source](how-to/use-current-source.md). Some examples import TypeScript from the repository and need a checkout to run. Historical Atet archives retain their original package and commands. The CLI also has an optional unbundled macOS menu-bar companion; the [menu-bar release contract](menubar-release.md) covers its prebuilt binary and LaunchAgent. The [capability reference](reference/capabilities.md) distinguishes them and lists local runtime requirements.

## Learn by making something

- [Create and revise your first diagram](tutorials/first-diagram.md): make a two-node diagram, inspect its five exports, then change its source.
- [Create and revise your first animation](tutorials/first-animation.md): render an eight-second title, change its copy and color, and keep both sources.
- [Render your first native film](tutorials/first-native-film.md): retain a Blender source, render a small shot, and export an ordinary Slopcamera project.

## Complete a task

- [Run current-source commands](how-to/use-current-source.md): build an exact checkout of Slopcamera.
- [Prepare patent-style drawing sheets](how-to/patent-drawings.md): retain diagram source, check physical bounds, and render monochrome SVG sheets and a PDF.

- [Render motion graphics from HTML](how-to/render-motion-graphics.md): choose among seven authoring profiles, render a graphic, and retain its source.
- [Edit and deliver video](how-to/edit-video.md): import footage, align related tracks, place overlays, and check a delivery.
- [Make a music video from an HTML scene](how-to/music-video.md): render authored visuals with a local track and retain separate sources in an editable project.
- [Convert raster images to SVG](how-to/vectorize-images.md): trace artwork locally, compare a duotone treatment, and inspect fidelity.
- [Generate images, video, or narration](how-to/generate-media.md): discover Gateway capabilities, acknowledge selected uploads, and retain the result.
- [Direct short generated clips](directing-video.md): budget, review takes, preserve endpoint continuity, and recover uncertain work.
- [Author a native film](studio.md): use Blender, CadQuery, or Manim; retain caches; share assets and calibrated cameras.
- [Build and revise a parametric design](how-to/parametric-design.md): generate architectural models from retained parameters, inspect dependencies and render alternatives.
- [Render and edit spatial scenes](spatial-scenes.md): patch named entities, use hardware rendering, import a saved world, or prepare a V2 shot composition.
- [Build a directed cinematic character world](how-to/cinematic-character-worlds.md): admit a rigged world, direct it semantically, plan effects and galleries, and audit temporal evidence.
- [Direct a cinematic world end to end](how-to/direct-cinematic-worlds.md): author an inert recipe pack and run the `cinematic-world` planning-and-review workflow.
- [Make an educational video](how-to/educational-video.md): keep mathematical visuals, narration, and timing evidence revisable.
- [Run or recover a workflow](how-to/run-workflows.md): use a built-in recipe or trusted Bun module and inspect its durable run.
- [Configure Vercel](vercel.md), [publish Slopcamera](publishing.md), [operate the hosted API](hosted-api.md), or [file a platform submission](platform-submission.md): provider and maintainer procedures.

## Look up a contract

- [Capabilities, versions, and platforms](reference/capabilities.md): current Slopcamera capabilities, historical Atet versions, and supported runtime boundaries.
- [SDK surfaces](reference/sdk.md): portable and local imports, operation projections, and execution contracts.
- [CLI help](reference/capabilities.md#discover-the-installed-contract): exact grammar and JSON schemas from the installed host.

## Understand the design

- [Source, representations, and projects](architecture.md): what stays editable, what a receipt proves, and how local and cloud work fit together.
- [Extension architecture](extension-architecture.md): the closed registry, inert recipe packs, trusted workflows, and where authored code can and cannot go.
- [Choose an HTML authoring surface](html-overlay-creative-toolkit.md): why DOM, vector, Three.js, and explicit GPU profiles serve different jobs. Its ecosystem research is dated separately from its supported locks.

## Work with an agent

The [Slopcamera Agent Skill](../skills/slopcamera/SKILL.md) routes an agent to the relevant task reference. Install the skill from the same release or source build as your CLI; installing a skill alone does not install the CLI or native tools. See the [installation instructions](../README.md#install-slopcamera).

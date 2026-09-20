# Explain how two CAD parts fit

**Authored source only. Native smoke and film review have not run.** This separate
study uses the exact baseline instrument-mount GLB from the qualified CadQuery
example. The retained parts are `MachinedBracket` and `IsolationPad`. The source
keeps their original mesh positions, topology, imported normals and shading flags,
then moves only the pad for an exploded explanation. Materials are assigned for
the presentation. Source checks bind geometry and shading separately before and
after scene construction; native confirmation remains pending.

The body is a nominal 100mm wide. The pad is 68×36×2mm. `parts.json` binds exact
source bytes, the native receipt, original STEP identity, two part names and their
expected dimensions. Import must reproduce those bounds and all 5,624 triangles
before scene construction continues. The original parametric source lives beside
this study in `../cad/scene.py`; the animation does not solve another CAD model.

The four-second shot uses a fixed orthographic camera and no depth of field. It
holds the assembled position for frames 0–11, separates the pad during 12–35,
holds it apart during 36–59, returns during 60–83 and holds assembled during
84–95. The pad moves 80mm upward and 18mm forward. Labels and a width reference
explain the part boundary; this authored movement is not a mechanical simulation.

Prepare source-bound job documents from a source checkout:

```sh
bun examples/showcase/native/cad-exploded/prepare.ts --check
bun examples/showcase/native/cad-exploded/prepare.ts --write-jobs
bun apps/desktop/cli/main.ts studio bundle examples/showcase/native/cad-exploded/source.json --json
```

The first two commands are inert. They do not start Blender or call a provider.
The bundle command retains the exact declared source; confirm its bundle hash
matches the preparation result. Then select one fresh smoke-job path:

```sh
bun apps/desktop/cli/main.ts studio plan <prepared-smoke-job.json> --json
bun apps/desktop/cli/main.ts studio probe <prepared-smoke-job.json> --blender-bin /absolute/path/to/Blender --json
bun apps/desktop/cli/main.ts studio run <prepared-smoke-job.json> --allow-trusted-code --blender-bin /absolute/path/to/Blender --json
```

Use the native scheduler on managed hosts. Native Python executes as the current
user. Each smoke job uses Blender 5.2.1/Cycles CPU, 16 samples, 960×540 and one
selected frame (0, 24 or 47), with a 128MiB cap and 180-second deadline. Require
at least 2GiB free before a smoke run. Inspect all three views and reopen a saved
scene with scripts disabled to verify part geometry and transforms.

The film template requests 96 frames, 32 samples, 960×540 at 24fps, with a 512MiB
cap and 3600-second deadline. Require 4GiB free and successful smoke review first.
Use measured smoke-frame time to decide whether the full sequence fits that
deadline; do not dispatch merely because a template exists. No film runtime or
output-quality claim has been established for this authored source.

Preserve all native outputs, receipts and unsuccessful attempts. Public image
derivatives must remove private Blender text/Exif metadata without changing color
interpretation. Review every delivered frame, part-label placement and the return
to the assembled pose before publishing a gallery example.

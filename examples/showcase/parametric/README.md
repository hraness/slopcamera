# Parametric design studies

These five retained inputs demonstrate local rule-based geometry: four original
architectural and furniture studies and a wider revision of the pavilion. Each
directory pairs `design.json`, which owns the parameters and geometry stages,
with `base.scene.json`, which owns the lights, staging, and calibrated cameras.
The [web guide](https://slopcamera.com/docs/how-to/parametric-design) presents the
rendered studies and the complete revision workflow.

| Study | Controls to inspect | Source |
| --- | --- | --- |
| Crescent pavilion | Span, crown height, plan curvature, rib dimensions | [Read the study](crescent-pavilion/README.md) |
| Wider pavilion | Same design with three changed dimensions | [Read the revision](crescent-pavilion-wide/README.md) |
| Spiral stair | Height, inner/outer radius, turns, rails and treads | [Read the study](spiral-stair/README.md) |
| Ribbed tower | Height, radius, taper, belly and twist | [Read the study](ribbed-tower/README.md) |
| Modular bookshelf | Width, height, depth, bays, rows and board thickness | [Read the study](modular-bookshelf/README.md) |

## Requirements

Install [Slopcamera v3.3.1](../../../README.md#install-slopcamera) or use a
[source build](../../../docs/how-to/use-current-source.md). Obtain these later
study inputs from a repository checkout; they are separate from the release archive. Check `slopcamera help scene` and
`slopcamera doctor --json` in that installation. Inspection and compilation use
local Bun geometry code; they require no Rhino, Python modeling engine, cloud
account, or paid generation. Rendering the resulting spatial scene also needs
the admitted local browser runtime. These examples do not require a GPU-only
rendering profile.

## Reproduce a retained study

Run these commands from the repository root. Set `study` to one directory name
from the table and choose an output directory that does not already exist:

```sh
study=crescent-pavilion
slopcamera scene design inspect "examples/showcase/parametric/$study/design.json" --json
slopcamera scene design compile "examples/showcase/parametric/$study/design.json" \
  --scene "examples/showcase/parametric/$study/base.scene.json" \
  --output-dir "artifacts/slopcamera/generated/showcase-$study" --json
slopcamera scene render "artifacts/slopcamera/generated/showcase-$study/scene.json" \
  --request "artifacts/slopcamera/generated/showcase-$study/render.json" --json
```

Keep the whole output bundle, including its exact GLB geometry, asset facts and
completion receipt. Inspect the returned PNG separately. A completed compiler
receipt proves source/output identity, not visual quality. The supplied hero,
detail, and plan cameras support different inspections; change a render request
explicitly to use another camera.

For an edit, use `scene design set` to write a new source and compile into a fresh
directory. The [wider pavilion](crescent-pavilion-wide/README.md) gives an exact
three-parameter change. `scene design gallery` compiles candidate bundles;
rendering and selecting a candidate remain separate steps.

## Provenance and limits

The four original `design.json` files and all five `base.scene.json` files match
the original Slopcamera examples at
[`63a0e3eed460fa80f1ae76983e9152c75a124392`](https://github.com/hraness/slopcamera/tree/63a0e3eed460fa80f1ae76983e9152c75a124392/examples/design)
byte for byte. The wider pavilion changes only `span`, `rise`, and `bend` in the
original design, retaining its design/stage identities and exact base scene.
The studies and this source are provided under the repository's
[MIT license](../../../LICENSE).

These are visual design studies. Their constraints do not establish structural
strength, code compliance, or fabrication tolerances. The local design compiler
does not execute Grasshopper definitions or import Rhino files directly; the
[design reference](https://github.com/hraness/slopcamera/blob/63a0e3eed460fa80f1ae76983e9152c75a124392/docs/parametric-design.md) describes its finite mesh
and expression contracts.

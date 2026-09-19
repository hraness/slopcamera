# Build a revisable parametric design

Use current source and `slopcamera scene design` for dimensions, repeated architectural parts, furniture, pavilions and façades that must regenerate from retained rules. This is a local mesh-design workflow; Rhino, Grasshopper and native engine execution are separate tools.

1. Discover original studies with `slopcamera scene design catalog --json`. Start with `scene design init <new-directory> --template crescent-pavilion|spiral-stair|ribbed-tower|modular-bookshelf`.
2. Read the emitted `design.json` and inspect it with `scene design inspect`. Describe the user's intended shape in named parameters, derived scalar values, constraints and semantic geometry stages. Keep references to engineering knowledge separate from visual references. Do not infer structural validation from appearance.
3. Save an explicit numeric values object and use `scene design set <design.json> --parameters <values.json> --output <new-design.json>` to preserve revisions. A dimensional change should update dependent members and details together.
4. Compile with `scene design compile <design.json> --scene <base.scene.json> --output-dir <new-bundle> --json`. Pass the starter's staging scene for cameras and lights, or a previous compiled scene to preserve supported generated-part overrides. Retain design, scene, exact asset bytes and receipt together.
5. Render `scene render <bundle/scene.json> --request <bundle/render.json> --json`. Review hero pixels, then use `camera_detail` and `camera_plan` to inspect repeated members, joints, silhouette and framing. Geometry compilation does not prove visual quality.
6. For alternatives, use `scene design gallery` with a bounded `slopcamera.spatial-design-variants` document. It emits up to six complete models; render the candidates through the same camera before selecting one. It makes no paid calls and does not upload source.

Place generated bundles below `artifacts/slopcamera/generated/`. Existing files conflict. An interrupted bundle without its final receipt is incomplete; inspect it and choose a fresh destination. The design compiler never executes source text. For native CAD operations or Blender/Cycles production shading, retain a native-studio source and use the explicit trusted-code workflow in [native studio](native-studio.md).

Detailed contracts and checked commands: [design reference](https://github.com/hraness/slopcamera/blob/main/docs/parametric-design.md) and [design guide](https://github.com/hraness/slopcamera/blob/main/docs/how-to/parametric-design.md). The portable SDK exports the design compiler and starter catalog from `@hraness/slopcamera/code`; file publication and rendering belong to the CLI.

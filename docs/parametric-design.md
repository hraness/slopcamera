# Parametric design reference

A Slopcamera design retains the rules that generate a model. Named parameters feed derived values and geometry stages; changing a parameter updates every stage that depends on it. The compiler produces ordinary editable spatial scenes with retained GLB geometry, asset facts and receipts. Use the [design guide](how-to/parametric-design.md) to create and render a first study.

This interface is available from current source through `slopcamera scene design` and the portable `@hraness/slopcamera/code` SDK. Compilation uses local geometry code and requires neither Rhino nor a native modeling engine. It does not execute authored JavaScript or Python.

## Commands

| Command | Input and result |
| --- | --- |
| `scene design catalog` | Lists original starters and their named controls. |
| `scene design init <directory> --template <id>` | Creates `design.json` and `base.scene.json` in a fresh directory. |
| `scene design inspect <design.json>` | Resolves scalar dependencies, checks constraints and geometry budgets, and reports stages without evaluating meshes. `check` is an alias. |
| `scene design set <design.json> --parameters <values.json> --output <new-design.json>` | Applies a numeric parameter object as an atomic validated source revision. |
| `scene design compile <design.json> [--scene <base.scene.json>] --output-dir <directory>` | Emits a new self-contained geometry bundle. An omitted base scene uses the minimal scene shell. |
| `scene design gallery <design.json> --variants <variants.json> [--scene <base.scene.json>] --output-dir <directory>` | Compiles up to six labelled candidates as separate source and geometry bundles. Rendering is a separate step. |

Every command accepts `--json`. Source reads accept bounded regular JSON files. Output paths must stay inside the workspace, use physical directories and preserve existing files. Put generated bundles under the ignored `artifacts/slopcamera/generated/` directory.

A complete bundle contains `design.json`, `scene.json`, exact generated GLB and facts payloads, and `receipt.json`. When a camera exists, it also contains a beauty-frame `render.json`; `camera_hero` is preferred. The receipt is written after all declared artifacts. An interrupted directory can contain partial files without a completion receipt. Retain it for inspection and choose a fresh output directory for a new compilation.

## Design document

The kind is `slopcamera.spatial-design` with `schemaVersion: 1`. A design has a stable `designId`, optional `name`, `parameters`, optional `values` and `constraints`, and one or more `stages`. Names are bounded ASCII identifiers beginning with a letter.

A numeric parameter declares `name`, `value`, `min` and `max`, with optional `label`, `step` and `unit`. Units are `m`, `rad`, `count` and `ratio`. Counts are integers. Steps are measured from the declared minimum. Units label controls; they do not implement dimensional analysis or unit conversion.

```json
{
  "name": "span",
  "label": "Clear span",
  "value": 6,
  "min": 3,
  "max": 10,
  "step": 0.5,
  "unit": "m"
}
```

A named derived value has `name` and `expression`. An expression is a number, `{"$param":"span"}`, `{"$value":"halfSpan"}`, or an operation with `op` and `args`. Supported operations are `add`, `sub`, `mul`, `div`, `min`, `max`, `neg`, `abs`, `sin`, `cos`, `floor` and `ceil`. Trigonometry uses radians. Named values form an acyclic dependency graph; declaration order does not change evaluation. References, operators and arity are checked, and division by zero or non-finite results fail.

```json
{
  "name": "halfSpan",
  "expression": { "op": "div", "args": [{ "$param": "span" }, 2] }
}
```

A constraint has `name`, `left`, `operator` and `right`, with an optional failure `message`. Both sides are scalar expressions. Operators are `lt`, `lte`, `eq`, `gte` and `gt`. Constraints describe authored dimensional relationships, such as keeping a board thinner than its clear opening. They do not certify structural strength, building-code compliance or fabrication tolerances.

## Geometry stages

Each stage has a stable `stageId`, optional semantic `name`, and optional deterministic `seed`. Give stages useful part names such as “Outer handrail” or “Roof ribs.” Every resolved stage records its transitive parameter and value dependencies.

A `parametric` stage provides a `spec` template for the existing wall, floor, stairs, arch, column, window, roof, pipe, trim or scatter generators. A `geometry` stage provides a bounded geometry `graph` template and `materials`, with optional `transform`, `editable`, `castShadow` and `receiveShadow`.

Generated GLB stages currently accept unmapped `unlit` and `standard` materials. Texture maps and extended PBR materials are rejected before mesh work; use a supported native source or explicitly admitted asset for those features.

Templates are JSON data. Insert a parameter or named-value reference at a numeric leaf, or use `{"$expr": <expression>}` for a local calculation. Strings are literal data; no source text is evaluated. After substitution, the complete existing geometry or parametric schema must validate.

The geometry graph provides profiles, inset and bevel, primitives, extrusion, revolution, sweep, loft, transform, mirror, array, merge, material slots and UV projection, plus its existing bounded boolean subset. See `SpatialGeometryNodeSchema` in the [portable geometry implementation](../src/spatial-scene/geometry.ts) for the exact supported contract. These are mesh operations; they do not provide Rhino's full NURBS or Grasshopper component ecosystem.

Generated entity IDs derive from the design and stage identities. Recompiling into a retained scene replaces the corresponding generated output and preserves declared overrides through the existing generator merge rules. Receipts report changed stages. Unrelated authored entities, other generators and their assets remain present. Removing a retained stage requires explicit scene cleanup; the compiler rejects an obsolete stage instead of leaving unexplained geometry behind.

## Limits and identity

The design compiler admits at most 128 parameters, 256 named values, 128 constraints and 32 stages. Source JSON is bounded to 1 MiB, scalar-expression depth to 16 and expression work to 8,192 nodes. Each existing geometry graph retains its own limits. Across stages, compilation checks estimates against 64 parts, 128 assets, 262,144 vertices, 400,000 triangles and 64 MiB before mesh emission. The CLI also bounds retained base assets and gallery output; galleries allow at most six candidates and 128 MiB.

Compilation receipts bind the normalized effective design, parameter values, input and output scene identities, stage specifications and emission receipts. Same-source compilation is deterministic within the declared compiler profile. A receipt establishes source and output identity; inspect actual geometry and render pixels separately.

## SDK

Import `parseSpatialDesign`, `inspectSpatialDesign`, `editSpatialDesignParameters`, `compileSpatialDesign`, `listSpatialDesignTemplates` and `createSpatialDesignStarter` from `@hraness/slopcamera/code`.

```ts
import {
  createSpatialDesignStarter,
  editSpatialDesignParameters,
  compileSpatialDesign,
} from '@hraness/slopcamera/code'

const starter = createSpatialDesignStarter('crescent-pavilion')
const design = editSpatialDesignParameters(starter.design, { span: 7 })
const result = compileSpatialDesign(design, { scene: starter.scene })
// Retain result.design, result.scene, result.outputs and result.receipt together.
```

The SDK is effect-free. Artifact `bytes` are owned `Uint8Array` values; treat them as read-only and verify their retained hashes before publication. File storage and rendering belong to the local host.

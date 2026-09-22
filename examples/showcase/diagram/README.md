# One source, two delivery decisions

This diagram shows three kinds of media entering a Slopcamera project, then
leaving as a preview or delivery. It is an authored explanation of the media
workflow. Import rendered images and clips into an existing project; the
diagram does not imply arbitrary source files create a new project.

Use the repository's [source installation](../../../docs/how-to/use-current-source.md).
Run from the repository root with Bun 1.3.14:

```sh
bun examples/showcase/diagram/render.ts
```

The script strictly checks each source, then writes the five native diagram
outputs beneath `artifacts/showcase/diagram/`: editable tldraw, light and dark
SVG, and light and dark PNG. No model account is required. Rendering again
replaces those named derivatives and keeps the source unchanged.

Compare `source-to-film.diagram.json` with
`source-to-film-revised.diagram.json`. The second source changes “Delivery” to
“Social delivery.” All placement, connectors, and other labels remain the
same. Open both light outputs to inspect the change; inspect dark outputs to
check contrast. The source's `name` determines the exported filenames.

The three input boxes share one visual role. The project uses a distinct
color and position, while the two output boxes share a delivery role. Labels
and arrows carry the meaning independently of color. This is a positioned
branching diagram; use the first-diagram tutorial for a coordinate-free stack.

Source and derivative artwork are original Slopcamera examples under MIT.

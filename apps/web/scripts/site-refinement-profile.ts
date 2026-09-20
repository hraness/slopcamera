/** A new current-design acceptance identity. Historical native receipts keep
 * their original revisions, profile names and comparison contracts. */
export const refinementBaselineRevision = "0ba8ba1a44cbee73d6af3dee09c714f0470d886b"
export const refinementBaselineTree = "e04baeee52e3f3fc92c9dadc8ae4d5a36f2c2a31"
export const refinementIntegratedRevision = "634443cef38ba2aea4b239f8fc829d195521a539"
export const refinementBaselineProfile = "before-material-refinement-0ba8ba1-v1"
export const refinementScope = "marketing-refinement-v1"
export const refinementCopyScope = "refinement-copy-v1"
export const refinementMaterialRevision = "0e089bc18f9a0409f0e74b1fb7192f468956e386"
export const refinementCopyProfile = "archive-refinement-v1"

/** Independent expected text, not imported from the producer being checked. */
export const refinementInstallCommand = "bun add --global https://github.com/hraness/slopcamera/releases/download/v3.3.1/hraness-slopcamera-3.3.1.tgz\nslopcamera skill install --target agents"
export const refinementAlternateCommand = "slopcamera skill install --target claude"
export const refinementDiagramSession = `#    __
#  _|__|_
# |  (o) |  slopcamera
# |______|

$ slopcamera diagram init first.diagram.json
# An editable starter, ready for your labels.
$ slopcamera diagram check first.diagram.json --strict
Valid diagram.
$ slopcamera diagram render first.diagram.json
# example-flow.tldr
# example-flow.light.svg + example-flow.dark.svg
# example-flow.light.png + example-flow.dark.png`
export const refinementInterfaceExamples = [
  "slopcamera skill install --target agents",
  "slopcamera workflows list --json",
  'import { vectorizeImage } from "@hraness/slopcamera"',
  "slopcamera mcp --root /absolute/path/to/workspace",
] as const

/** The new install retains one real copy control and its status/fallback
 * state machine; the source-build walkthrough is now a native disclosure. */
export const refinementCopySelectors = [
  "#install", ".install-note", ".hraness-marketing-install__heading-group", ".panel-label",
  ".hraness-marketing-install__commands", ".source-install", ".source-install > summary",
  ".source-install .hraness-marketing-question__answer", ".panel-note", ".panel-note a",
  "[data-copy-command]", "[data-copy-command-value]", "[data-copy-command-button]",
  ".copy-command__note", ".copy-command__note > code", "[data-copy-command-status]",
] as const
export const refinementCopyCounts = [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1] as const
export const refinementCopyElementKeys = refinementCopySelectors.flatMap((selector, at) =>
  Array.from({ length: refinementCopyCounts[at]! }, (_, index) => `${selector}[${index}]`))

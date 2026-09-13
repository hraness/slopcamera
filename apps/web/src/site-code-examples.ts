/** Illustrative local session. Commands use the released diagram surface;
 * comments describe its real outputs without inventing console receipts. */
export const diagramSession = `#    __
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

export const interfaceExamples = {
  skill: "slopcamera skill install --target agents",
  cli: "slopcamera workflows list --json",
  sdk: 'import { vectorizeImage } from "@hraness/slopcamera"',
  mcp: "slopcamera mcp --root /absolute/path/to/workspace",
} as const

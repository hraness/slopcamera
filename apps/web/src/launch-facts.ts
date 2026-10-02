/**
 * Launch facts: every number the launch post, the social kit and the launch
 * film use. Each value is derived from a record the site already ships (the
 * published release file, the reviewed workflow example registry and the
 * committed diagram fixtures), so copy never carries a hand-typed number.
 */
import sourceDiagram from "../media/source-to-film-source-ad4ec8806384.json"
import revisedDiagram from "../media/source-to-film-revised-source-822a690049ca.json"
import { workflowExamples, type WorkflowExample } from "./example-registry"
import { publishedRelease } from "./published-release"

type DiagramShape = Readonly<{ id: string; label: string }>
type DiagramFixture = Readonly<{ name: string; shapes: readonly DiagramShape[] }>

function example(id: string): WorkflowExample {
  const found = workflowExamples.find(item => item.id === id)
  if (found === undefined) throw new Error(`Launch facts need the reviewed example ${id}`)
  return found
}

/** The one label the revised diagram changes, read from the two fixtures. */
function changedLabel(before: DiagramFixture, after: DiagramFixture): Readonly<{ id: string; from: string; to: string }> {
  const changes = before.shapes.flatMap(shape => {
    const next = after.shapes.find(item => item.id === shape.id)
    return next !== undefined && next.label !== shape.label ? [{ id: shape.id, from: shape.label, to: next.label }] : []
  })
  if (changes.length !== 1) throw new Error("The revised diagram must change exactly one label")
  return changes[0]!
}

const diagram = example("source-to-film")
/** Rendered files a diagram render writes: every download except the JSON source itself. */
const diagramOutputs = diagram.downloads.filter(item => !item.file.endsWith(".json"))
const deliveryCuts = workflowExamples.filter(item => item.family === "video-editing" && item.id.startsWith("edit-directed-"))

export const launchFacts = Object.freeze({
  product: "Slopcamera",
  url: "slopcamera.com",
  /** Release status comes from the published release record, never from copy. */
  release: Object.freeze({ version: publishedRelease.version, url: publishedRelease.releaseUrl }),
  /** Reviewed, rendered examples on the site, each with its source and command. */
  exampleCount: workflowExamples.length,
  exampleFamilyCount: new Set(workflowExamples.map(item => item.family)).size,
  /** Files one `diagram render` writes from one JSON source. */
  diagramOutputCount: diagramOutputs.length,
  diagramNodeCount: (sourceDiagram as DiagramFixture).shapes.length,
  /** Commands in the first task; none of them needs a model or a key. */
  firstTaskCommandCount: 3,
  revision: changedLabel(sourceDiagram as DiagramFixture, revisedDiagram as DiagramFixture),
  /** Aspect ratios cut from the same edit timeline. */
  deliveryCutCount: deliveryCuts.length,
  deliveryCuts: Object.freeze(deliveryCuts.map(item => item.id)),
})

export type LaunchFacts = typeof launchFacts

/** Blog tokens the launch post may use; unknown tokens still fail closed. */
export const launchTokens: Readonly<Record<string, string>> = Object.freeze({
  LAUNCH_EXAMPLE_COUNT: String(launchFacts.exampleCount),
  LAUNCH_EXAMPLE_FAMILY_COUNT: String(launchFacts.exampleFamilyCount),
  LAUNCH_DIAGRAM_OUTPUT_COUNT: String(launchFacts.diagramOutputCount),
  LAUNCH_FIRST_TASK_COMMAND_COUNT: String(launchFacts.firstTaskCommandCount),
  LAUNCH_DELIVERY_CUT_COUNT: String(launchFacts.deliveryCutCount),
  LAUNCH_REVISION_FROM: launchFacts.revision.from,
  LAUNCH_REVISION_TO: launchFacts.revision.to,
})

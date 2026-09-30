import { exampleMarkdown, exampleMediaRecord } from "./example-content"
import { renderExampleMedia } from "./example-media"
import { exampleUrl, workflowExamples, type WorkflowExample } from "./example-registry"

/** The screening order is editorial. Every slot resolves to admitted media,
 * including while the next production is being prepared in this source tree. */
const screening = [
  { id: "rain-bottled", previous: "native-product" },
  { id: "paper-ocean", previous: "compute-temple" },
  { id: "laundromat-after-midnight", previous: "native-fluid" },
  { id: "square-wave-jazz", previous: "interference-field" },
  { id: "one-shoot-cinematic", previous: "premiere-wall" },
] as const
const revision = [
  { id: "last-tram", previous: "source-to-film" },
  { id: "last-tram-revised", previous: "source-to-film-revised" },
] as const

function registered(slot: Readonly<{ id: string; previous: string }>, examples: readonly WorkflowExample[]): WorkflowExample {
  const example = examples.find(item => item.id === slot.id) ?? examples.find(item => item.id === slot.previous)
  if (!example) throw new Error(`Homepage needs a registered example: ${slot.id}`)
  return example
}

function revisionExamples(examples: readonly WorkflowExample[]): readonly [WorkflowExample, WorkflowExample] {
  // Never compare a new production with an unrelated earlier demonstration.
  const complete = revision.every(slot => examples.some(item => item.id === slot.id))
  const pair = revision.map(slot => registered(complete ? slot : { ...slot, id: slot.previous }, examples))
  return [pair[0]!, pair[1]!]
}

/** All visible homepage examples, exactly once and in document order. */
export function homepageExamples(examples: readonly WorkflowExample[] = workflowExamples): readonly WorkflowExample[] {
  const selected = [...screening.map(slot => registered(slot, examples)), ...revisionExamples(examples)]
  if (new Set(selected.map(example => example.id)).size !== selected.length) throw new Error("Homepage examples must be distinct")
  return selected
}

export function homepageExampleName(id: string): string {
  const example = homepageExamples().find(item => item.id === id)
  if (!example) throw new Error(`Not a homepage example: ${id}`)
  return example.title
}

function escapeText(value: string): string {
  return value.replace(/[&<>"]/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!)
}

function renderFilm(example: WorkflowExample, preview = false): string {
  const darkPoster = example.video === undefined ? example.downloads.find(file => file.label === "Dark PNG") : undefined
  return renderExampleMedia(exampleMediaRecord(example, true), {
    compact: true,
    autoplayPreview: preview && example.video !== undefined && example.video.durationSeconds <= 15,
    eagerPoster: preview,
    ...(darkPoster ? { darkPosterUrl: exampleUrl(darkPoster) } : {}),
  })
}

/** A single large film leads; playback enhancement still respects preferences. */
export function renderExampleHero(examples: readonly WorkflowExample[] = workflowExamples): string {
  return renderFilm(registered(screening[0], examples), true)
}

/** Vary scale through the screening; titles and requirements come from records. */
export function renderExampleGallery(examples: readonly WorkflowExample[] = workflowExamples): string {
  return screening.slice(1).map((slot, index) => {
    const example = registered(slot, examples)
    return `<div class="slopcamera-screening-item" data-screening-size="${index === 0 || index === 3 ? "wide" : "paired"}">${renderFilm(example)}</div>`
  }).join("\n")
}

/** Both real versions stay usable without JavaScript. There is no generated
 * playback or decorative simulation of the requested source change. */
export function renderExampleRevision(examples: readonly WorkflowExample[] = workflowExamples): string {
  const [original, revised] = revisionExamples(examples)
  const tram = original.id === "last-tram"
  const request = tram ? "Make the moon larger." : "Change Delivery to Social delivery."
  const description = tram
    ? "The same miniature world, with a larger moon. Ask for a specific change; your agent edits the retained source and renders another version."
    : "The same diagram, with one label changed. Ask for a specific change; your agent edits the retained source and renders another version."
  return `<header class="slopcamera-section-heading"><h2 id="revision-title">The next version starts with a sentence.</h2><p>${description}</p></header><blockquote class="slopcamera-direction"><p>“${request}”</p></blockquote><div class="slopcamera-revision-pair"><div><h3>Original</h3>${renderFilm(original)}</div><div><h3>Revised</h3>${renderFilm(revised)}</div></div><p class="slopcamera-revision-note">Both renders keep their own source. <a href="/docs/how-to/direct-a-film">Learn to direct a film</a>.</p>`
}

export function homepageHeroMarkdown(examples: readonly WorkflowExample[] = workflowExamples): string {
  return exampleMarkdown(registered(screening[0], examples))
}

export function homepageExampleMarkdown(examples: readonly WorkflowExample[] = workflowExamples): string {
  return screening.slice(1).map(slot => {
    const example = registered(slot, examples)
    return `### ${escapeText(example.title)}\n\n${exampleMarkdown(example)}`
  }).join("\n\n")
}

export function homepageRevisionMarkdown(examples: readonly WorkflowExample[] = workflowExamples): string {
  const [original, revised] = revisionExamples(examples)
  const request = original.id === "last-tram" ? "Make the moon larger." : "Change Delivery to Social delivery."
  return [
    "## The next version starts with a sentence",
    `> ${request}`,
    "Ask for a specific change; your agent edits the retained source and renders another version.",
    "### Original", exampleMarkdown(original), "### Revised", exampleMarkdown(revised),
    "[Learn to direct a film](https://slopcamera.com/docs/how-to/direct-a-film.md).",
  ].join("\n\n")
}

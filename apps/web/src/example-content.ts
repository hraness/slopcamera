import { renderExampleMedia, type ExampleMediaRecord } from "./example-media"
import { exampleGuideUrl, exampleSourceUrl, exampleUrl, workflowExamples, type WorkflowExample } from "./example-registry"

/** A deliberately closed Markdown extension: IDs select admitted local media,
 * never an arbitrary URL, HTML fragment or provider response. */
export function exampleDirective(line: string): string | null {
  if (!line.trimStart().startsWith("::example")) return null
  const match = /^::example\[([a-z0-9]+(?:-[a-z0-9]+)*)\]$/u.exec(line.trim())
  if (!match) throw new Error("Malformed workflow example directive")
  return match[1]!
}

export function registeredExample(id: string, examples: readonly WorkflowExample[] = workflowExamples): WorkflowExample {
  const record = examples.find(example => example.id === id)
  if (!record) throw new Error(`Unknown workflow example: ${id}`)
  return record
}

/** One public label per admitted technique id. A new registry technique must
 * pick its label here before any page can render the example, so the visible
 * vocabulary stays closed and deliberate rather than derived from ids. */
const techniqueLabels: Readonly<Record<string, string>> = {
  "cad.parametric-build": "Parametric CAD",
  "camera.crane": "Camera crane",
  "camera.dolly": "Camera dolly",
  "camera.handheld": "Handheld camera",
  "camera.orbit": "Camera orbit",
  "camera.rail": "Rail camera",
  "camera.tripod": "Tripod lock-off",
  "color.grade": "Color grade",
  "delivery.1-1": "1:1 delivery",
  "delivery.16-9": "16:9 delivery",
  "delivery.4-5": "4:5 delivery",
  "delivery.9-16": "9:16 delivery",
  "design.crescent-pavilion": "Parametric pavilion",
  "design.modular-bookshelf": "Parametric shelf",
  "design.parameter-revision": "Parameter revision",
  "design.ribbed-tower": "Parametric tower",
  "design.spiral-stair": "Parametric stair",
  "diagram.positioned": "Positioned diagram",
  "diagram.revision": "Diagram revision",
  "diagram.stack": "Stack layout",
  "diagram.theming": "Diagram theme",
  "edit.bootstrap": "Timeline bootstrap",
  "edit.cuts-speed": "Cut pacing",
  "edit.manual-camera": "Manual camera move",
  "edit.overlays": "Overlay composition",
  "education.manim-lesson": "Manim lesson",
  "html.motion": "Motion timeline",
  "html.p5": "p5 canvas",
  "html.paper-shaders": "Paper shaders",
  "html.plain": "HTML timeline",
  "html.three": "Three.js scene",
  "html.transparent-overlay": "Transparent overlay",
  "html.two": "Two.js vectors",
  "html.vgpu": "WGSL shader",
  "native.character": "Character rig",
  "native.cloth": "Cloth simulation",
  "native.cloth-pins": "Pinned cloth",
  "native.color-alpha": "Color-accurate render",
  "native.fluid": "Fluid simulation",
  "native.import-model": "GLB import",
  "native.product": "Blender scene",
  "scene.emissive-lighting": "Emissive lighting",
  "scene.world-media": "World media surface",
  "vector.simple-mark": "Vector trace",
}

export function exampleTechniques(example: WorkflowExample): readonly string[] {
  return example.techniques.map(id => {
    const label = techniqueLabels[id]
    if (label === undefined) throw new Error(`Workflow example ${example.id} uses an unlabeled technique: ${id}`)
    return label
  })
}

/** The packaged-technique breadth, computed from the registry so marketing
 * counts never drift from what the release actually contains. */
export function exampleTechniqueSummary(examples: readonly WorkflowExample[] = workflowExamples): string {
  return `${examples.length} published examples span ${new Set(examples.flatMap(example => example.techniques)).size} packaged techniques`
}

export function exampleMediaRecord(example: WorkflowExample, includeDownloads = false): ExampleMediaRecord {
  return {
    id: example.id, title: example.title, description: example.description, techniques: exampleTechniques(example),
    poster: { url: exampleUrl(example.poster), width: example.poster.width, height: example.poster.height, alt: example.poster.alt },
    ...(example.video ? { video: {
      url: exampleUrl(example.video), mime: "video/mp4" as const,
      width: example.video.width, height: example.video.height,
      durationSeconds: example.video.durationSeconds, hasAudio: example.video.hasAudio,
      ...(example.video.captions ? { captionsUrl: exampleUrl(example.video.captions) } : {}),
    } } : {}),
    sourceUrl: exampleSourceUrl(example), guideUrl: exampleGuideUrl(example),
    ...(includeDownloads ? { requirements: example.requirements, downloads: example.downloads.map(file => ({ url: exampleUrl(file), label: file.label })) } : {}),
  }
}

/** Documentation stills follow the page theme when the example ships a dark render. */
export function renderRegisteredExample(id: string, examples: readonly WorkflowExample[] = workflowExamples): string {
  const example = registeredExample(id, examples)
  const darkPoster = example.video ? undefined : example.downloads.find(file => file.label === "Dark PNG")
  return renderExampleMedia(exampleMediaRecord(example, true), darkPoster ? { darkPosterUrl: exampleUrl(darkPoster) } : {})
}

function markdownText(value: string): string {
  return value.replace(/[\\\[\]*_<>`]/gu, character => `\\${character}`)
}

export function exampleMarkdown(example: WorkflowExample, includeDownloads = true): string {
  return [
    `![${markdownText(example.poster.alt)}](${exampleUrl(example.poster)})`,
    `_${markdownText(exampleTechniques(example).join(" · "))}_`,
    `**${markdownText(example.title)}${/[.!?]$/u.test(example.title) ? "" : "."}** ${markdownText(example.description)}`,
    ...(example.video ? [`[Watch the ${Number(example.video.durationSeconds.toFixed(1))}-second ${example.video.hasAudio ? "video" : "silent video"}](${exampleUrl(example.video)}).`] : []),
    `[Follow the guide](${exampleGuideUrl(example)}) · [View source](${exampleSourceUrl(example)}).`,
    ...(includeDownloads ? [`Requires: ${markdownText(example.requirements)}`] : []),
    ...(includeDownloads && example.downloads.length ? [example.downloads.map(file => `[${markdownText(file.label)}](${exampleUrl(file)})`).join(" · ")] : []),
  ].join("\n\n")
}

/** Preserve literal examples inside fenced code in the text mirror. */
export function examplesInMarkdown(source: string, examples: readonly WorkflowExample[] = workflowExamples): string {
  let fenced = false
  const seen = new Set<string>()
  const result = source.split("\n").map(line => {
    if (fenced) {
      if (line.trim() === "```") fenced = false
      return line
    }
    if (/^```([^`]*)$/u.test(line.trim())) { fenced = true; return line }
    const id = exampleDirective(line)
    if (id === null) return line
    if (seen.has(id)) throw new Error(`Duplicate workflow example: ${id}`)
    seen.add(id)
    return exampleMarkdown(registeredExample(id, examples))
  }).join("\n")
  if (fenced) throw new Error("Unclosed documentation code fence")
  return result
}

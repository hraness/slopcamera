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

export function exampleMediaRecord(example: WorkflowExample, includeDownloads = false): ExampleMediaRecord {
  return {
    id: example.id, title: example.title, description: example.description,
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

export function renderRegisteredExample(id: string, examples: readonly WorkflowExample[] = workflowExamples): string {
  return renderExampleMedia(exampleMediaRecord(registeredExample(id, examples), true))
}

function markdownText(value: string): string {
  return value.replace(/[\\\[\]*_<>`]/gu, character => `\\${character}`)
}

export function exampleMarkdown(example: WorkflowExample, includeDownloads = true): string {
  return [
    `![${markdownText(example.poster.alt)}](${exampleUrl(example.poster)})`,
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

/**
 * Launch post figures. A beat in a post may stand on a line of its own as
 * `{{LAUNCH_FIGURE_<NAME>}}`; the name picks one reviewed workflow example, so
 * every picture in the post is a real Slopcamera render with its source and
 * command already published on the site. Nothing here accepts a caller URL.
 */
import { exampleUrl, workflowExamples, type WorkflowExample } from "./example-registry"
import { resolvedLaunchBeats } from "./launch-beats"
import { launchMediaFile, launchMediaUrl } from "./launch-media"

type LaunchFigure = Readonly<{ example: string; caption: string }>

/** Closed set of figures the launch post may use: one per beat, keyed by beat id. */
export const launchFigures: Readonly<Record<string, LaunchFigure>> = Object.freeze(Object.fromEntries(
  resolvedLaunchBeats.map(beat => [beat.id.toUpperCase(), { example: beat.visual.scene, caption: beat.caption }]),
))

/** The launch film is the one figure that is not a workflow example. */
const filmCaption = "The original launch film, rendered from Slopcamera's launch-film template. Its example count records the collection at the time of filming. Captions are included."
const filmAlt = "The original Slopcamera launch film, showing an earlier diagram-led introduction and its historical example count."

/**
 * Expand `{{LAUNCH_BEATS}}` into one section per beat: headline, post, figure
 * and an optional link. The beats module is the single source; the post
 * and the generated social kit read the same text. The original launch film
 * is retained separately as a historical example.
 */
export function expandLaunchBeats(markdown: string): string {
  return markdown.replace(/^\{\{LAUNCH_BEATS\}\}$/mu, () => resolvedLaunchBeats.map(beat => [
    `## ${beat.headline}`,
    beat.post,
    `{{LAUNCH_FIGURE_${beat.id.toUpperCase()}}}`,
    ...(beat.detailHref === undefined ? [] : [`[Read more](${beat.detailHref})`]),
  ].join("\n\n")).join("\n\n"))
}

const figureLine = /^\{\{LAUNCH_FIGURE_([A-Z]+)\}\}$/gmu

function figureExample(name: string): Readonly<{ figure: LaunchFigure; example: WorkflowExample }> {
  const figure = launchFigures[name]
  if (figure === undefined) throw new Error(`Unknown launch figure: {{LAUNCH_FIGURE_${name}}}`)
  const example = workflowExamples.find(item => item.id === figure.example)
  if (example === undefined) throw new Error(`Launch figure ${name} names a missing example: ${figure.example}`)
  return { figure, example }
}

const escape = (value: string): string => value
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;")

/** Markdown form, for the public `.md` mirror: an image line and its caption. */
export function launchFiguresInMarkdown(markdown: string): string {
  return expandLaunchBeats(markdown).replace(figureLine, (_line, name: string) => {
    if (name === "FILM") return `[![${filmAlt}](${launchMediaUrl(launchMediaFile("poster"))})](${launchMediaUrl(launchMediaFile("film"))})\n\n*${filmCaption}*`
    const { figure, example } = figureExample(name)
    return `![${example.poster.alt}](${exampleUrl(example.poster)})\n\n*${figure.caption}*`
  })
}

/** Swap each figure line for a sentinel paragraph the Markdown renderer keeps verbatim. */
export function launchFigureSentinels(markdown: string): { markdown: string; names: readonly string[] } {
  const names: string[] = []
  const replaced = expandLaunchBeats(markdown).replace(figureLine, (_line, name: string) => {
    if (name !== "FILM") figureExample(name)
    names.push(name)
    return `LAUNCHFIGURESENTINEL${String(names.length - 1)}`
  })
  return { markdown: replaced, names }
}

/** Figure markup. `classes` false gives plain semantic HTML for feeds. */
export function launchFigureHtml(name: string, classes: boolean): string {
  const cls = (token: string) => classes ? ` class="{{${token}}}"` : ""
  if (name === "FILM") return launchFilmHtml(cls)
  const { figure, example } = figureExample(name)
  const poster = exampleUrl(example.poster)
  const alt = escape(example.poster.alt)
  const captions = example.video?.captions
  const track = captions === undefined
    ? ""
    : `<track kind="captions" src="${exampleUrl(captions)}" srclang="en" label="English">`
  const media = example.video === undefined
    ? `<img${cls("BLOG_FIGURE_MEDIA_CLASS")} src="${poster}" width="${String(example.poster.width)}" height="${String(example.poster.height)}" alt="${alt}" loading="lazy" decoding="async">`
    : `<video${cls("BLOG_FIGURE_MEDIA_CLASS")} controls muted playsinline preload="none" poster="${poster}" width="${String(example.video.width)}" height="${String(example.video.height)}" aria-label="${alt}"><source src="${exampleUrl(example.video)}" type="${example.video.mime}">${track}<a href="${exampleUrl(example.video)}">Open the video</a></video>`
  return `<figure${cls("BLOG_FIGURE_CLASS")}>${media}<figcaption${cls("BLOG_FIGCAPTION_CLASS")}>${escape(figure.caption)}</figcaption></figure>`
}

/** Replace the rendered sentinel paragraphs with figures, exactly once each. */
export function replaceLaunchFigureSentinels(html: string, names: readonly string[], classes: boolean): string {
  let result = html
  names.forEach((name, index) => {
    const sentinel = new RegExp(`<p(?: class="[^"]*")?>LAUNCHFIGURESENTINEL${String(index)}</p>`, "gu")
    const found = result.match(sentinel)?.length ?? 0
    if (found !== 1) throw new Error(`Launch figure ${name} must render exactly once, found ${String(found)}`)
    result = result.replace(sentinel, launchFigureHtml(name, classes))
  })
  if (result.includes("LAUNCHFIGURESENTINEL")) throw new Error("A launch figure sentinel was left in the page")
  return result
}

function launchFilmHtml(cls: (token: string) => string): string {
  const film = launchMediaFile("film")
  const poster = launchMediaFile("poster")
  const captions = launchMediaFile("captions")
  return `<figure${cls("BLOG_FIGURE_CLASS")}><video${cls("BLOG_FIGURE_MEDIA_CLASS")} controls muted playsinline preload="none" poster="${launchMediaUrl(poster)}" width="${String(film.width)}" height="${String(film.height)}" aria-label="${escape(filmAlt)}"><source src="${launchMediaUrl(film)}" type="video/mp4"><track kind="captions" srclang="en" label="English" src="${launchMediaUrl(captions)}" default><a href="${launchMediaUrl(film)}">Open the original launch film</a></video><figcaption${cls("BLOG_FIGCAPTION_CLASS")}>${escape(filmCaption)} <a href="${launchMediaUrl(launchMediaFile("square"))}">Square cut</a> · <a href="${launchMediaUrl(launchMediaFile("portrait"))}">Portrait cut</a></figcaption></figure>`
}

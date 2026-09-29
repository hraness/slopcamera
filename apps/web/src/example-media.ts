export type ExampleMediaRecord = Readonly<{
  id: string
  title: string
  description: string
  /** Public labels for the packaged techniques the example demonstrates. */
  techniques: readonly string[]
  poster: Readonly<{ url: string; width: number; height: number; alt?: string }>
  video?: Readonly<{
    url: string
    mime: "video/mp4" | "video/webm"
    width: number
    height: number
    durationSeconds: number
    hasAudio: boolean
    captionsUrl?: string
  }>
  sourceUrl: string
  guideUrl: string
  requirements?: string
  downloads?: readonly Readonly<{ url: string; label: string }>[]
}>

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)
}

function safeUrl(value: string, local = false): string {
  if (/[\u0000-\u0020\\]/u.test(value)) throw new Error("Example URLs must be clean public URLs")
  if (value.startsWith("/") && !value.startsWith("//")) return escapeHtml(value)
  if (!local) {
    const url = new URL(value)
    if (url.protocol === "https:" && !url.username && !url.password) return escapeHtml(value)
  }
  throw new Error("Example media must be local; source links must use HTTPS or a local path")
}

function dimension(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 8192) throw new Error("Invalid example dimensions")
  return value
}

/** Pure server rendering. Publication admission, rights and byte limits belong to the registry. */
export type ExampleMediaOptions = Readonly<{
  autoplayPreview?: boolean
  eagerPoster?: boolean
  /** Homepage cards: a job label above the title, replacing the technique tags. */
  kicker?: string
  /** Homepage cards: the first command for this technique. */
  command?: string
  /** Homepage cards: short quiet links (Guide, Source, Video) and no duration line. */
  compact?: boolean
  /** Still examples: a dark render of the same image, shown in the dark theme. */
  darkPosterUrl?: string
}>

export function renderExampleMedia(record: ExampleMediaRecord, options: ExampleMediaOptions = {}): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.id)) throw new Error("Invalid example ID")
  const techniques = record.techniques.map(label => {
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .:/()+-]{0,47}$/u.test(label)) throw new Error("Invalid example technique label")
    return escapeHtml(label)
  })
  const techniqueLine = options.kicker !== undefined
    ? `<p class="slopcamera-example__techniques">${escapeHtml(options.kicker)}</p>`
    : techniques.length ? `<p class="slopcamera-example__techniques">${techniques.join(" · ")}</p>` : ""
  const command = options.command !== undefined
    ? `<pre class="slopcamera-example__command"><code>${escapeHtml(options.command)}</code></pre>` : ""
  const labels = options.compact ? ["Guide", "Source", "Video"] : ["Follow the guide", "View source", "Open video"]
  const id = `slopcamera-example-${record.id}`
  const title = escapeHtml(record.title)
  const description = escapeHtml(record.description)
  const poster = safeUrl(record.poster.url, true)
  const source = safeUrl(record.sourceUrl)
  const guide = safeUrl(record.guideUrl)
  const posterWidth = dimension(record.poster.width)
  const posterHeight = dimension(record.poster.height)
  const video = record.video
  if (record.downloads && record.downloads.length > 12) throw new Error("Too many example downloads")
  const requirementText = record.requirements ? `<p>Requires: ${escapeHtml(record.requirements)}</p>` : ""
  const downloadList = record.downloads?.length
    ? `<ul>${record.downloads.map(file => `<li><a href="${safeUrl(file.url, true)}" download>${escapeHtml(file.label)}</a></li>`).join("")}</ul>` : ""
  const downloads = requirementText || downloadList
    ? `<details class="slopcamera-example__downloads"><summary>${downloadList ? "Download this example" : "Requirements"}</summary>${requirementText}${downloadList}</details>` : ""
  let media: string
  let videoLink = ""
  let details = ""
  if (video) {
    if (!(video.durationSeconds > 0 && Number.isFinite(video.durationSeconds)) || video.durationSeconds > 3600) throw new Error("Invalid example duration")
    if (video.mime !== "video/mp4" && video.mime !== "video/webm") throw new Error("Unsupported example video type")
    if (options.autoplayPreview && video.durationSeconds > 15) throw new Error("Long examples require manual playback")
    const url = safeUrl(video.url, true)
    const track = video.captionsUrl
      ? `<track kind="captions" src="${safeUrl(video.captionsUrl, true)}" srclang="en" label="English">`
      : ""
    // No autoplay attribute: JavaScript may opt in only after observing visibility and preferences.
    media = `<video class="slopcamera-example__media" data-example-player${options.autoplayPreview ? ' data-example-preview="true" muted' : ""} controls playsinline preload="none" poster="${poster}" width="${dimension(video.width)}" height="${dimension(video.height)}" aria-labelledby="${id}-title" aria-describedby="${id}-description"><source src="${url}" type="${video.mime}">${track}<a href="${url}">Open ${title} video</a></video>`
    videoLink = `<a href="${url}">${labels[2]}</a>`
    if (!options.compact) details = `<p class="slopcamera-example__details">${Number(video.durationSeconds.toFixed(1))}s · ${video.hasAudio ? "Sound available in video controls" : "Silent"}</p>`
  } else {
    const alt = escapeHtml(record.poster.alt ?? record.title)
    const image = (url: string, variant: string) => `<img class="slopcamera-example__media${variant}" src="${url}" width="${posterWidth}" height="${posterHeight}" alt="${alt}" loading="${options.eagerPoster ? "eager" : "lazy"}"${options.eagerPoster ? ' fetchpriority="high"' : ""} decoding="async">`
    const images = options.darkPosterUrl === undefined
      ? image(poster, "")
      : `${image(poster, " slopcamera-example__media--light")}${image(safeUrl(options.darkPosterUrl, true), " slopcamera-example__media--dark")}`
    media = `<a class="slopcamera-example__image-link" href="${poster}" aria-label="Open ${title} image">${images}</a>`
  }
  return `<figure class="slopcamera-example" data-example-id="${record.id}">${media}<figcaption class="slopcamera-example__caption">${techniqueLine}<strong class="slopcamera-example__title" id="${id}-title">${title}</strong><p id="${id}-description">${description}</p>${command}${details}<p class="slopcamera-example__links"><a href="${guide}">${labels[0]}</a><a href="${source}">${labels[1]}</a>${videoLink}</p>${downloads}${video ? '<p class="slopcamera-example__status" data-example-status role="status" hidden></p>' : ""}</figcaption></figure>`
}

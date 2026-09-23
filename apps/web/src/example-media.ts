export type ExampleMediaRecord = Readonly<{
  id: string
  title: string
  description: string
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
export function renderExampleMedia(record: ExampleMediaRecord, options: Readonly<{ autoplayPreview?: boolean; eagerPoster?: boolean }> = {}): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.id)) throw new Error("Invalid example ID")
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
    videoLink = `<a href="${url}">Open video</a>`
    details = `<p class="slopcamera-example__details">${Number(video.durationSeconds.toFixed(1))}s · ${video.hasAudio ? "Sound available in video controls" : "Silent"}</p>`
  } else {
    const alt = escapeHtml(record.poster.alt ?? record.title)
    media = `<a class="slopcamera-example__image-link" href="${poster}" aria-label="Open ${title} image"><img class="slopcamera-example__media" src="${poster}" width="${posterWidth}" height="${posterHeight}" alt="${alt}" loading="${options.eagerPoster ? "eager" : "lazy"}"${options.eagerPoster ? ' fetchpriority="high"' : ""} decoding="async"></a>`
  }
  return `<figure class="slopcamera-example" data-example-id="${record.id}">${media}<figcaption class="slopcamera-example__caption"><strong class="slopcamera-example__title" id="${id}-title">${title}</strong><p id="${id}-description">${description}</p>${details}<p class="slopcamera-example__links"><a href="${guide}">Follow the guide</a><a href="${source}">View source</a>${videoLink}</p>${downloads}${video ? '<p class="slopcamera-example__status" data-example-status role="status" hidden></p>' : ""}</figcaption></figure>`
}

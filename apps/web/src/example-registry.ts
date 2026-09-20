import records from "../media/examples.json"

export type ExampleAsset = Readonly<{
  file: string
  sha256: string
  bytes: number
  mime: "image/webp" | "image/png" | "image/svg+xml" | "video/mp4" | "text/vtt" | "application/json"
}>

export type WorkflowExample = Readonly<{
  id: string
  title: string
  description: string
  family: string
  techniques: readonly string[]
  guideSlug: string
  guideAnchor: string
  featured: boolean
  requirements: string
  source: Readonly<{
    engineRevision: string
    files: readonly Readonly<{ path: string; sha256: string }>[]
    command: string
    toolVersion: string
    runtimes: readonly string[]
    license: string
  }>
  poster: ExampleAsset & Readonly<{ width: number; height: number; alt: string }>
  video?: ExampleAsset & Readonly<{
    width: number
    height: number
    durationSeconds: number
    fps: number
    frames: number
    hasAudio: boolean
    captions?: ExampleAsset
  }>
  downloads: readonly (ExampleAsset & Readonly<{ label: string }>)[]
  review: Readonly<{
    agent: string
    date: string
    still: "passed"
    motion: "passed" | "not-applicable"
    sound: "listened" | "silent"
    captions: "passed" | "not-applicable"
  }>
}>

export const exampleAssetPrefix = "/assets/examples/"
export const exampleCollectionMaxBytes = 64 * 1024 * 1024
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const techniqueId = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u
const digest = /^[a-f0-9]{64}$/u
const assetName = /^[a-z0-9][a-z0-9-]*-[a-f0-9]{12}\.(?:webp|png|svg|mp4|vtt|json|tldr)$/u

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid workflow example: ${message}`)
}
function object(value: unknown): Record<string, unknown> {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), "expected object")
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  assert(Object.keys(value).every(key => allowed.includes(key)), "unrecognized publication field")
}
function text(value: unknown, max: number): asserts value is string {
  assert(typeof value === "string" && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f]/u.test(value), "invalid text")
}
function integer(value: unknown, max: number): asserts value is number {
  assert(typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max, "invalid integer")
}
function asset(value: unknown, maxBytes: number): ExampleAsset {
  const item = object(value)
  text(item.file, 160)
  assert(assetName.test(item.file), "asset must use a flat content-addressed name")
  text(item.sha256, 64)
  assert(digest.test(item.sha256) && item.file.includes(`-${item.sha256.slice(0, 12)}.`), "asset digest and filename disagree")
  integer(item.bytes, maxBytes)
  const mimeByExtension: Record<string, string> = {
    webp: "image/webp", png: "image/png", svg: "image/svg+xml", mp4: "video/mp4", vtt: "text/vtt", json: "application/json", tldr: "application/json",
  }
  assert(item.mime === mimeByExtension[item.file.split(".").at(-1)!], "asset MIME and extension disagree")
  return item as ExampleAsset
}

/** Only reviewed first-party artifacts enter the public collection. Raw receipts
 * and arbitrary URLs are intentionally absent from the publication contract. */
export function parseWorkflowExamples(value: unknown): readonly WorkflowExample[] {
  assert(Array.isArray(value) && value.length <= 128, "collection exceeds its record bound")
  const ids = new Set<string>()
  let featured = 0
  for (const raw of value) {
    const item = object(raw)
    keys(item, ["id", "title", "description", "family", "techniques", "guideSlug", "guideAnchor", "featured", "requirements", "source", "poster", "video", "downloads", "review"])
    text(item.id, 80)
    assert(slug.test(item.id) && !ids.has(item.id), "duplicate or unsafe ID")
    ids.add(item.id)
    text(item.title, 100); text(item.description, 600); text(item.requirements, 400)
    text(item.family, 80); assert(slug.test(item.family), "unsafe family")
    text(item.guideSlug, 120)
    assert(/^(?:tutorials|how-to|reference|explanation)\/[a-z0-9-]+$/u.test(item.guideSlug), "unsafe guide")
    assert(typeof item.guideAnchor === "string" && (item.guideAnchor === "" || slug.test(item.guideAnchor)), "unsafe anchor")
    assert(typeof item.featured === "boolean", "missing curation decision")
    if (item.featured) featured++
    assert(Array.isArray(item.techniques) && item.techniques.length > 0 && item.techniques.length <= 40
      && item.techniques.every(id => typeof id === "string" && techniqueId.test(id)), "invalid technique IDs")
    const source = object(item.source)
    keys(source, ["engineRevision", "files", "command", "toolVersion", "runtimes", "license"])
    text(source.engineRevision, 40); assert(/^[a-f0-9]{40}$/u.test(source.engineRevision), "source requires an exact engine commit")
    text(source.command, 2000); text(source.toolVersion, 40); text(source.license, 200)
    assert(Array.isArray(source.runtimes) && source.runtimes.length > 0 && source.runtimes.length <= 12, "runtime inventory missing")
    source.runtimes.forEach(runtime => text(runtime, 160))
    assert(Array.isArray(source.files) && source.files.length > 0 && source.files.length <= 64, "source closure missing")
    for (const rawFile of source.files) {
      const file = object(rawFile)
      keys(file, ["path", "sha256"])
      text(file.path, 240); text(file.sha256, 64)
      assert(/^examples\/showcase\/[a-z0-9-]+\/[a-zA-Z0-9/_.-]+$/u.test(file.path)
        && !file.path.split("/").some(part => part === ".." || part === ".") && digest.test(file.sha256), "unsafe source closure")
    }
    const poster = object(item.poster)
    keys(poster, ["file", "sha256", "bytes", "mime", "width", "height", "alt"])
    asset(poster, 200 * 1024)
    assert(poster.mime === "image/webp" || poster.mime === "image/png", "poster must be browser raster")
    integer(poster.width, 2560); integer(poster.height, 2560); text(poster.alt, 300)
    const review = object(item.review)
    keys(review, ["agent", "date", "still", "motion", "sound", "captions"])
    text(review.agent, 100); text(review.date, 10)
    assert(/^\d{4}-\d{2}-\d{2}$/u.test(review.date) && review.still === "passed", "still review missing")
    if (item.video !== undefined) {
      const video = object(item.video)
      keys(video, ["file", "sha256", "bytes", "mime", "width", "height", "durationSeconds", "fps", "frames", "hasAudio", "captions"])
      asset(video, 12 * 1024 * 1024)
      assert(video.mime === "video/mp4", "delivery must be MP4")
      integer(video.width, 1920); integer(video.height, 1920); integer(video.frames, 3600)
      assert(typeof video.durationSeconds === "number" && video.durationSeconds > 0 && video.durationSeconds <= 120, "duration exceeds delivery bound")
      assert(typeof video.fps === "number" && video.fps > 0 && video.fps <= 30, "invalid frame rate")
      assert(Math.abs(video.frames / video.fps - video.durationSeconds) < 0.05, "duration/frame identity differs")
      assert(typeof video.hasAudio === "boolean" && review.motion === "passed", "motion review missing")
      assert(review.sound === (video.hasAudio ? "listened" : "silent"), "sound review does not match stream")
      if (item.featured) assert(video.durationSeconds <= 15 && Number(video.bytes) <= 4 * 1024 * 1024, "preview exceeds loop budget")
      if (video.captions !== undefined) {
        keys(object(video.captions), ["file", "sha256", "bytes", "mime"])
        const captions = asset(video.captions, 64 * 1024)
        assert(captions.mime === "text/vtt" && review.captions === "passed", "captions lack review")
      } else assert(review.captions === "not-applicable", "caption review has no track")
    } else assert(review.motion === "not-applicable" && review.sound === "silent"
      && review.captions === "not-applicable", "still-only review mismatch")
    assert(Array.isArray(item.downloads) && item.downloads.length <= 12, "download bound")
    for (const rawDownload of item.downloads) {
      keys(object(rawDownload), ["file", "sha256", "bytes", "mime", "label"])
      asset(rawDownload, 4 * 1024 * 1024)
      text(object(rawDownload).label, 100)
    }
  }
  assert(featured <= 6, "homepage curation exceeds six examples")
  const examples = value as WorkflowExample[]
  const assets = workflowExampleAssets(examples)
  assert(assets.reduce((sum, file) => sum + file.bytes, 0) <= exampleCollectionMaxBytes, "collection exceeds 64 MiB")
  return examples
}

export function workflowExampleAssets(examples: readonly WorkflowExample[]): readonly ExampleAsset[] {
  const files = new Map<string, ExampleAsset>()
  for (const example of examples) {
    for (const file of [example.poster, ...(example.video ? [example.video] : []),
      ...(example.video?.captions ? [example.video.captions] : []), ...example.downloads]) {
      const previous = files.get(file.file)
      assert(previous === undefined || (previous.sha256 === file.sha256 && previous.bytes === file.bytes
        && previous.mime === file.mime), "conflicting shared asset")
      files.set(file.file, file)
    }
  }
  return [...files.values()]
}

export const workflowExamples = parseWorkflowExamples(records)
export const exampleUrl = (asset: ExampleAsset): string => `${exampleAssetPrefix}${asset.file}`
export const exampleGuideUrl = (example: WorkflowExample): string => `/docs/${example.guideSlug}${example.guideAnchor ? `#${example.guideAnchor}` : ""}`
export const exampleSourceUrl = (example: WorkflowExample): string => `https://github.com/hraness/slopcamera/tree/main/${example.source.files[0]!.path.split("/").slice(0, -1).join("/")}`

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { launchCopyProblems } from "@hraness/design-kit/launch"
import { renderBlogBodyHtml, resolveBlogContent } from "./blog-content"
import { workflowExamples } from "./example-registry"
import { launchFacts } from "./launch-facts"
import { launchBeatFacts, launchSocialKit, launchStatus, resolvedLaunchBeats } from "./launch-beats"
import { launchMedia, launchMediaFile } from "./launch-media"
import { renderSocialKitMarkdown } from "./launch-social-kit-markdown"
import published from "../published-release.json"
import examples from "../media/examples.json"

const appDirectory = join(import.meta.dir, "..")
const post = readFileSync(join(appDirectory, "src/blog/introducing-slopcamera.md"), "utf8")

describe("launch facts", () => {
  test("come from the release record and the example inventory", () => {
    expect(launchFacts.release.version).toBe(published.version)
    expect(launchStatus).toBe(`Latest release: v${published.version}`)
    expect(launchFacts.exampleCount).toBe(workflowExamples.length)
    expect(launchFacts.exampleCount).toBe((examples as { examples: unknown[] }).examples.length)
    expect(launchFacts.deliveryCuts.every(id => workflowExamples.some(example => example.id === id))).toBe(true)
    expect(launchBeatFacts.deliveryCutCount?.value).toBe(String(launchFacts.deliveryCuts.length))
  })
})

describe("launch beats", () => {
  test("each beat shows one registered example", () => {
    for (const beat of resolvedLaunchBeats) {
      expect(workflowExamples.some(example => example.id === beat.visual.scene)).toBe(true)
      expect(launchCopyProblems(beat.caption, beat.id)).toEqual([])
    }
    expect(new Set(resolvedLaunchBeats.map(beat => beat.visual.scene)).size).toBe(resolvedLaunchBeats.length)
  })

  test("no beat types a number by hand", () => {
    for (const beat of resolvedLaunchBeats) {
      const source = `${beat.headline} ${beat.post}`
      for (const digits of source.match(/\d+/gu) ?? []) {
        const known = Object.values(launchBeatFacts).some(fact => fact.value.includes(digits))
        expect(known).toBe(true)
      }
    }
  })
})

describe("launch post", () => {
  test("renders every beat once, with its figure and the film", () => {
    const html = renderBlogBodyHtml(post)
    for (const beat of resolvedLaunchBeats) {
      expect(html).toContain(beat.headline.replaceAll("\"", "&quot;"))
    }
    expect((html.match(/<figure>/gu) ?? []).length).toBe(resolvedLaunchBeats.length + 1)
    expect(html).toContain(`src="/assets/launch/${launchMediaFile("film").file}"`)
    expect(html).toContain(`src="/assets/launch/${launchMediaFile("captions").file}"`)
    expect(html).not.toMatch(/\{\{|LAUNCHFIGURESENTINEL/u)
  })

  test("the Markdown mirror carries the beats and links the film", () => {
    const markdown = resolveBlogContent(post)
    for (const beat of resolvedLaunchBeats) expect(markdown).toContain(`## ${beat.headline}`)
    expect(markdown).toContain(`/assets/launch/${launchMediaFile("film").file}`)
  })
})

describe("launch media", () => {
  test("declares the film, its cuts, poster and captions", () => {
    expect(launchMedia.map(item => item.role).sort()).toEqual(["captions", "film", "portrait", "portrait-poster", "poster", "square"])
    expect(launchMediaFile("film")).toMatchObject({ width: 1920, height: 1080 })
    expect(launchMediaFile("square")).toMatchObject({ width: 1080, height: 1080 })
    expect(launchMediaFile("portrait")).toMatchObject({ width: 1080, height: 1920 })
  })
})

describe("social kit", () => {
  test("is cut from the beats and matches the committed file", () => {
    expect(launchSocialKit.x.length).toBe(resolvedLaunchBeats.length)
    expect(launchSocialKit.linkedin.startsWith(resolvedLaunchBeats[0]?.post ?? "missing")).toBe(true)
    const committed = readFileSync(join(appDirectory, "../../kb/launch/social-kit.md"), "utf8")
    expect(committed).toBe(renderSocialKitMarkdown())
  })
})

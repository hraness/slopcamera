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
    expect(launchFacts.exampleCount).toBe((examples as unknown[]).length)
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
  test("renders every beat once with its registered example", () => {
    const html = renderBlogBodyHtml(post)
    for (const beat of resolvedLaunchBeats) {
      expect(html).toContain(beat.headline.replaceAll("\"", "&quot;"))
    }
    expect((html.match(/<figure>/gu) ?? []).length).toBe(resolvedLaunchBeats.length)
    for (const beat of resolvedLaunchBeats) {
      const example = workflowExamples.find(item => item.id === beat.visual.scene)!
      expect(html).toContain(`/assets/examples/${example.video?.file ?? example.poster.file}`)
    }
    const explainerCaptions = workflowExamples.find(example => example.id === "one-shoot-explainer")?.video?.captions
    expect(explainerCaptions).toBeDefined()
    expect(html).toContain(`<track kind="captions" src="/assets/examples/${explainerCaptions?.file}" srclang="en" label="English">`)
    expect(html).not.toMatch(/\{\{|LAUNCHFIGURESENTINEL/u)
  })

  test("the Markdown mirror carries the beats and their examples", () => {
    const markdown = resolveBlogContent(post)
    for (const beat of resolvedLaunchBeats) expect(markdown).toContain(`## ${beat.headline}`)
    expect(markdown).toContain("/assets/examples/")
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
    const socialBeats = resolvedLaunchBeats.filter(beat => beat.part !== "limits")
    expect(launchSocialKit.x.length).toBe(socialBeats.length)
    expect(launchSocialKit.linkedin.startsWith(resolvedLaunchBeats[0]?.post ?? "missing")).toBe(true)
    const committed = readFileSync(join(appDirectory, "../../kb/launch/social-kit.md"), "utf8")
    expect(committed).toBe(renderSocialKitMarkdown())
  })

  test("carries claims only: no limits beat and no who-beat caveat", () => {
    const all = [...launchSocialKit.x, ...launchSocialKit.bluesky, ...launchSocialKit.threads, launchSocialKit.linkedin, ...launchSocialKit.showHnFacts].join("\n")
    const limits = resolvedLaunchBeats.find(beat => beat.part === "limits")
    expect(limits).toBeDefined()
    expect(all).not.toContain(limits?.post ?? "missing")
    expect(all).not.toContain("hosted image app")
  })
})

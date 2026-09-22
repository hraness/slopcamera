import { describe, expect, test } from "bun:test"
import { createExamplePlaybackController, installExamplePlayers, type ExamplePlaybackPolicy, type ExamplePlaybackPort } from "./example-player"
import { renderExampleMedia, type ExampleMediaRecord } from "./example-media"

const ordinary: ExamplePlaybackPolicy = { hidden: false, reducedMotion: false, saveData: false }

// Finite media ports exercise arbitration and asynchronous settlement, not DOM
// paint or browser autoplay policy. Native acceptance belongs to the web gate.
function playback(previews: readonly boolean[] = [true, true, false]) {
  const states = previews.map(() => ({ paused: true, plays: 0, pauses: 0, automatic: false, message: "", play: () => Promise.resolve() }))
  const ports: ExamplePlaybackPort[] = states.map((state, index) => ({
    preview: previews[index]!,
    paused: () => state.paused,
    play: () => { state.plays++; state.paused = false; return state.play() },
    pause: () => { state.pauses++; state.paused = true },
    prepare: automatic => { state.automatic = automatic },
    message: value => { state.message = value },
  }))
  const controller = createExamplePlaybackController(ports, ordinary)
  return {
    states, controller,
    manualPlay(index: number) { controller.interact(index); states[index]!.paused = false; controller.play(index) },
    nativePause(index: number) { states[index]!.paused = true; controller.pause(index) },
  }
}

describe("example playback arbitration", () => {
  test("never plays before visibility, defaults docs to manual, and permits one automatic preview", () => {
    const f = playback()
    expect(f.states.map(state => state.plays)).toEqual([0, 0, 0])
    f.controller.visibility(2, true)
    expect(f.states[2]!.plays).toBe(0)
    f.controller.visibility(0, true)
    f.controller.play(0)
    f.controller.visibility(1, true)
    expect(f.states.map(state => state.plays)).toEqual([1, 0, 0])
    expect(f.states[0]!.automatic).toBe(true)
    f.controller.visibility(0, false)
    f.controller.pause(0)
    expect(f.states[0]!.paused).toBe(true)
    expect(f.states[1]!.plays).toBe(1)
  })

  test("manual playback preempts automatic work, including while manually paused", () => {
    const f = playback()
    f.controller.visibility(0, true)
    f.controller.visibility(1, true)
    f.manualPlay(2)
    f.controller.pause(0) // queued event from the controller's pause
    expect(f.states[0]!.paused).toBe(true)
    expect(f.states[1]!.plays).toBe(0)
    f.nativePause(2)
    for (const policy of [{ ...ordinary, hidden: true }, ordinary, { ...ordinary, reducedMotion: true }, ordinary]) f.controller.policy(policy)
    f.controller.visibility(0, false)
    f.controller.visibility(0, true)
    expect(f.states.map(state => state.plays)).toEqual([1, 0, 0])
    expect(f.states[2]!.paused).toBe(true)
  })

  test("one intersection batch never starts another player also leaving the viewport", () => {
    const f = playback()
    f.controller.visibilityBatch([[0, true], [1, true]])
    expect(f.states.map(state => state.plays)).toEqual([1, 0, 0])
    f.controller.visibilityBatch([[0, false], [1, false]])
    expect(f.states.map(state => state.plays)).toEqual([1, 0, 0])
    expect(f.states[0]!.paused).toBe(true)
  })

  test("a user's native pause persists through visibility and preference changes", () => {
    const f = playback([true])
    f.controller.visibility(0, true)
    f.nativePause(0)
    f.controller.visibility(0, false)
    f.controller.policy({ ...ordinary, hidden: true })
    f.controller.policy({ ...ordinary, reducedMotion: true, saveData: true })
    f.controller.policy(ordinary)
    f.controller.visibility(0, true)
    expect(f.states[0]!.plays).toBe(1)
    expect(f.states[0]!.paused).toBe(true)
    f.manualPlay(0)
    expect(f.states[0]!.paused).toBe(false)
    expect(f.states[0]!.automatic).toBe(false)
  })

  for (const restriction of ["hidden", "reducedMotion", "saveData"] as const) {
    test(`${restriction} prevents downloads through play and suspends only automatic playback`, () => {
      const f = playback([true, false])
      f.controller.policy({ ...ordinary, [restriction]: true })
      f.controller.visibility(0, true)
      expect(f.states[0]!.plays).toBe(0)
      f.controller.policy(ordinary)
      expect(f.states[0]!.plays).toBe(1)
      f.controller.policy({ ...ordinary, [restriction]: true })
      f.controller.pause(0)
      expect(f.states[0]!.paused).toBe(true)
      f.manualPlay(1)
      f.controller.policy({ ...ordinary, [restriction]: true })
      expect(f.states[1]!.paused).toBe(false)
    })
  }

  test("offscreen/hidden suspension does not turn into a user pause", () => {
    const f = playback([true])
    f.controller.visibility(0, true)
    f.controller.policy({ ...ordinary, hidden: true })
    f.controller.pause(0)
    f.controller.policy(ordinary)
    expect(f.states[0]!.plays).toBe(2)
    f.controller.visibility(0, false)
    f.controller.pause(0)
    f.controller.visibility(0, true)
    expect(f.states[0]!.plays).toBe(3)
  })

  test("a rejected preview keeps manual playback available and is not retried on every intersection", async () => {
    const f = playback([true])
    f.states[0]!.play = () => Promise.reject(new Error("Autoplay denied"))
    f.controller.visibility(0, true)
    await Promise.resolve()
    f.controller.pause(0)
    expect(f.states[0]!.message).toContain("video controls")
    f.controller.visibility(0, false)
    f.controller.visibility(0, true)
    f.controller.policy(ordinary)
    expect(f.states[0]!.plays).toBe(1)
    f.manualPlay(0)
    expect(f.states[0]!.message).toBe("")
  })

  test("an old automatic rejection cannot stop or relabel a later manual session", async () => {
    const f = playback([true])
    let reject: ((reason: Error) => void) | undefined
    f.states[0]!.play = () => new Promise<void>((_, fail) => { reject = fail })
    f.controller.visibility(0, true)
    f.manualPlay(0)
    reject!(new Error("Old request"))
    await Promise.resolve()
    expect(f.states[0]!.paused).toBe(false)
    expect(f.states[0]!.message).toBe("")
  })

  test("failed media yields the automatic slot and presents a direct-file recovery", () => {
    const f = playback()
    f.controller.visibility(0, true)
    f.controller.visibility(1, true)
    f.controller.error(0)
    expect(f.states[0]!.message).toContain("Open the video file")
    expect(f.states[1]!.plays).toBe(1)
  })

  test("a failed manual load stops its pending playback and retains manual ownership", () => {
    const f = playback([false, true])
    f.manualPlay(0)
    f.controller.visibility(1, true)
    f.controller.error(0)
    f.controller.pause(0)
    expect(f.states[0]!.paused).toBe(true)
    expect(f.states[0]!.pauses).toBe(1)
    expect(f.states[0]!.message).toContain("Open the video file")
    f.controller.policy({ ...ordinary, hidden: true })
    f.controller.policy(ordinary)
    expect(f.states[1]!.plays).toBe(0)
    f.controller.error(0)
    expect(f.states[0]!.pauses).toBe(1)
  })

  test("manual completion releases other previews without automatically replaying the finished clip", () => {
    const f = playback()
    f.controller.visibility(0, true)
    f.manualPlay(2)
    f.controller.pause(0)
    f.nativePause(2)
    f.controller.ended(2)
    expect(f.states[0]!.plays).toBe(2)
    expect(f.states[2]!.plays).toBe(0)
  })

  test("dispose cancels automatic work and ignores late settlements and events", async () => {
    const f = playback([true])
    let reject: ((reason: Error) => void) | undefined
    f.states[0]!.play = () => new Promise<void>((_, fail) => { reject = fail })
    f.controller.visibility(0, true)
    f.controller.dispose()
    f.controller.visibility(0, true)
    f.controller.policy(ordinary)
    reject!(new Error("Disposed"))
    await Promise.resolve()
    expect(f.states[0]!.paused).toBe(true)
    expect(f.states[0]!.plays).toBe(1)
    expect(f.states[0]!.message).toBe("")
  })

  test("dispose leaves a native manual session under the user's control", () => {
    const f = playback()
    f.manualPlay(2)
    f.controller.dispose()
    expect(f.states[2]!.paused).toBe(false)
    expect(f.states[2]!.pauses).toBe(0)
  })
})

test("a non-bubbling child-source failure presents recovery and its listener is disposed", () => {
  const source = new EventTarget()
  const track = new EventTarget()
  const status = { textContent: "", hidden: true }
  const video = Object.assign(new EventTarget(), {
    dataset: { examplePreview: "false" }, paused: true, muted: true, volume: 1, loop: false,
    play: () => Promise.resolve(), pause: () => {},
    closest: () => ({ querySelector: () => status }),
    querySelectorAll: (selector: string) => {
      if (selector !== ":scope > source") throw new Error(`Unexpected media child selector: ${selector}`)
      return [source]
    },
  })
  const motion = Object.assign(new EventTarget(), { matches: false })
  const root = Object.assign(new EventTarget(), {
    hidden: false,
    defaultView: { matchMedia: () => motion, navigator: {} },
    querySelectorAll: () => [video],
  }) as unknown as Document
  const dispose = installExamplePlayers(root)
  expect(installExamplePlayers(root)).toBe(dispose)
  track.dispatchEvent(new Event("error"))
  expect(status.hidden).toBe(true)
  source.dispatchEvent(new Event("error"))
  expect(status.hidden).toBe(false)
  expect(status.textContent).toContain("Open the video file")
  dispose()
  status.textContent = "disposed"
  source.dispatchEvent(new Event("error"))
  video.dispatchEvent(new Event("error"))
  expect(status.textContent).toBe("disposed")
})

const record: ExampleMediaRecord = {
  id: "title-study", title: 'A title & "motion"', description: "Change <one> timing cue.",
  poster: { url: "/assets/examples/poster.webp", width: 1280, height: 720 },
  video: { url: "/assets/examples/movie.mp4", mime: "video/mp4", width: 1280, height: 720, durationSeconds: 12, hasAudio: false },
  sourceUrl: "https://github.com/hraness/slopcamera/blob/main/examples/title.ts",
  guideUrl: "/docs/how-to/render-motion-graphics",
}

describe("example server rendering", () => {
  test("native controls and stable source URLs exist before JavaScript without automatic playback or prefetch", () => {
    const html = renderExampleMedia(record)
    expect(html).toContain('controls playsinline preload="none"')
    expect(html).toContain('<source src="/assets/examples/movie.mp4" type="video/mp4">')
    expect(html).not.toContain("autoplay")
    expect(html).not.toContain("data-example-preview")
    expect(html).not.toContain("style=")
    expect(html).toContain('width="1280" height="720"')
    expect(html).toContain('href="/assets/examples/movie.mp4">Open video</a>')
    expect(html).toContain("A title &amp; &quot;motion&quot;")
    expect(html).toContain("Change &lt;one&gt; timing cue.")
  })

  test("only short previews opt into muted controller-managed playback", () => {
    const html = renderExampleMedia(record, { autoplayPreview: true })
    expect(html).toContain('data-example-preview="true" muted')
    expect(html).not.toContain("autoplay")
    expect(() => renderExampleMedia({ ...record, video: { ...record.video!, durationSeconds: 16 } }, { autoplayPreview: true })).toThrow("manual playback")
    expect(renderExampleMedia({ ...record, video: { ...record.video!, durationSeconds: 90 } })).not.toContain("data-example-preview")
  })

  test("a caption track and sound availability are present in semantic HTML", () => {
    const html = renderExampleMedia({ ...record, video: { ...record.video!, hasAudio: true, captionsUrl: "/assets/examples/captions.vtt" } })
    expect(html).toContain('<track kind="captions" src="/assets/examples/captions.vtt" srclang="en" label="English">')
    expect(html).toContain("Sound available in video controls")
    expect(html).toContain('aria-describedby="slopcamera-example-title-study-description"')
  })

  test("still media has an accessible full-size image link and no player", () => {
    const { video: _, ...still } = record
    const html = renderExampleMedia(still)
    expect(html).toContain('href="/assets/examples/poster.webp"')
    expect(html).toContain('alt="A title &amp; &quot;motion&quot;"')
    expect(html).not.toContain("<video")
    expect(html).not.toContain("data-example-status")
  })

  test("a selected still hero uses its meaningful alt text and eager high-priority loading", () => {
    const { video: _, ...still } = record
    const html = renderExampleMedia({ ...still, poster: { ...still.poster, alt: 'Two labeled stages joined by an arrow: "Source" to "Film".' } }, { eagerPoster: true })
    expect(html).toContain('alt="Two labeled stages joined by an arrow: &quot;Source&quot; to &quot;Film&quot;."')
    expect(html).toContain('loading="eager" fetchpriority="high"')
    expect(renderExampleMedia(still)).toContain('loading="lazy"')
    expect(renderExampleMedia(still)).not.toContain("fetchpriority")
  })

  test("the eager poster option never turns into video prefetch or unconditional autoplay", () => {
    const html = renderExampleMedia(record, { eagerPoster: true, autoplayPreview: true })
    expect(html).toContain('preload="none"')
    expect(html).not.toContain("fetchpriority")
    expect(html).not.toContain("autoplay")
  })

  test("rejects active/foreign media URLs and malformed dimensions instead of escaping unsafe schemes", () => {
    for (const url of ["javascript:alert(1)", "//example.org/clip.mp4", "https://example.org/clip.mp4", "/\\example.org/clip.mp4", "/assets/\nclip.mp4"]) {
      expect(() => renderExampleMedia({ ...record, video: { ...record.video!, url } })).toThrow()
    }
    expect(() => renderExampleMedia({ ...record, sourceUrl: "javascript:alert(1)" })).toThrow()
    expect(() => renderExampleMedia({ ...record, poster: { ...record.poster, width: NaN } })).toThrow()
    expect(() => renderExampleMedia({ ...record, video: { ...record.video!, durationSeconds: Infinity } })).toThrow()
    expect(() => renderExampleMedia({ ...record, id: 'x" onclick="alert(1)' })).toThrow()
  })
})

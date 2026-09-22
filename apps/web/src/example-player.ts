export type ExamplePlaybackPort = Readonly<{
  preview: boolean
  paused(): boolean
  play(): Promise<void>
  pause(): void
  prepare(automatic: boolean): void
  message(value: string): void
}>

export type ExamplePlaybackPolicy = Readonly<{ hidden: boolean; reducedMotion: boolean; saveData: boolean }>

/** Browser-independent arbitration. Native controls own manual playback and transport. */
export function createExamplePlaybackController(ports: readonly ExamplePlaybackPort[], initialPolicy: ExamplePlaybackPolicy) {
  const entries = ports.map(port => ({ port, visible: false, mode: "idle" as "idle" | "automatic" | "manual", userPaused: false, blocked: false, generation: 0, controlledPauses: 0 }))
  let policy = initialPolicy
  let manualOwner: number | undefined
  let disposed = false

  function pauseAutomatic(index: number): void {
    const entry = entries[index]!
    if (entry.mode !== "automatic") return
    entry.mode = "idle"
    entry.generation++
    if (!entry.port.paused()) {
      entry.controlledPauses++
    }
    entry.port.pause() // Also cancel a play request that is still pending.
    entry.port.prepare(false)
  }

  function allowed(index: number): boolean {
    const entry = entries[index]!
    return !disposed && manualOwner === undefined && !policy.hidden && !policy.reducedMotion && !policy.saveData
      && entry.port.preview && entry.visible && !entry.userPaused && !entry.blocked
  }

  function reconcile(): void {
    if (disposed) return
    let chosen = entries.findIndex((entry, index) => entry.mode === "automatic" && allowed(index))
    if (chosen === -1) chosen = entries.findIndex((_, index) => allowed(index))
    entries.forEach((_, index) => { if (index !== chosen) pauseAutomatic(index) })
    if (chosen === -1) return
    const entry = entries[chosen]!
    if (entry.mode === "automatic") return
    entry.mode = "automatic"
    const generation = ++entry.generation
    entry.port.prepare(true)
    const rejected = () => {
      if (disposed || entry.generation !== generation || entry.mode !== "automatic") return
      entry.blocked = true
      pauseAutomatic(chosen)
      entry.port.message("Preview did not start. Use the video controls to play.")
      reconcile()
    }
    try {
      // A rejection is remembered. Visibility/preferences never trigger an automatic retry storm.
      void entry.port.play().catch(rejected)
    } catch {
      rejected()
    }
  }

  function interact(index: number): void {
    if (disposed) return
    const entry = entries[index]
    if (!entry) return
    manualOwner = index
    entry.mode = "manual"
    entry.generation++
    entry.port.prepare(false)
    entries.forEach((_, other) => { if (other !== index) pauseAutomatic(other) })
  }

  return {
    visibility(index: number, visible: boolean): void {
      if (disposed || !entries[index]) return
      entries[index]!.visible = visible
      reconcile()
    },
    visibilityBatch(changes: readonly (readonly [number, boolean])[]): void {
      if (disposed) return
      for (const [index, visible] of changes) if (entries[index]) entries[index]!.visible = visible
      reconcile()
    },
    policy(value: ExamplePlaybackPolicy): void { policy = value; reconcile() },
    interact,
    play(index: number): void {
      if (disposed) return
      const entry = entries[index]
      if (!entry || entry.port.paused()) return
      if (entry.mode !== "automatic") {
        interact(index)
        entry.userPaused = false
      }
      entry.port.message("")
    },
    pause(index: number): void {
      if (disposed) return
      const entry = entries[index]
      if (!entry) return
      if (entry.controlledPauses > 0) { entry.controlledPauses--; return }
      if (!entry.port.paused()) return // Ignore a queued pause event after a later play.
      entry.userPaused = true
      interact(index)
      // Keep manual ownership through a pause so another moving preview cannot replace it.
    },
    ended(index: number): void {
      if (disposed) return
      const entry = entries[index]
      if (!entry) return
      entry.userPaused = true
      entry.mode = "idle"
      entry.generation++
      if (manualOwner === index) manualOwner = undefined
      reconcile()
    },
    error(index: number): void {
      if (disposed) return
      const entry = entries[index]
      if (!entry) return
      entry.blocked = true
      pauseAutomatic(index)
      if (!entry.port.paused()) {
        entry.controlledPauses++
        entry.port.pause()
      }
      entry.port.message("Video could not load. Open the video file or try the video controls again.")
      reconcile()
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      entries.forEach((_, index) => pauseAutomatic(index))
    },
  }
}

type DataConnection = EventTarget & { readonly saveData?: boolean }
const installations = new WeakMap<Document, () => void>()

/** Enhance server-rendered videos without taking over native controls or issuing fetches. */
export function installExamplePlayers(root: Document = document): () => void {
  const installed = installations.get(root)
  if (installed) return installed
  const view = root.defaultView
  const videos = [...root.querySelectorAll<HTMLVideoElement>("video[data-example-player]")]
  if (!view || videos.length === 0) return () => {}
  const motion = view.matchMedia("(prefers-reduced-motion: reduce)")
  const connection = (view.navigator as Navigator & { connection?: DataConnection }).connection
  const currentPolicy = (): ExamplePlaybackPolicy => ({ hidden: root.hidden, reducedMotion: motion.matches, saveData: connection?.saveData === true })
  const controller = createExamplePlaybackController(videos.map(video => ({
    preview: video.dataset.examplePreview === "true",
    paused: () => video.paused,
    play: () => video.play(),
    pause: () => video.pause(),
    prepare: automatic => { video.loop = automatic; if (automatic) video.muted = true },
    message: value => {
      const status = video.closest(".slopcamera-example")?.querySelector<HTMLElement>("[data-example-status]")
      if (status) { status.textContent = value; status.hidden = value === "" }
    },
  })), currentPolicy())
  const cleanups: Array<() => void> = []
  function listen(target: EventTarget, type: string, callback: EventListener): void {
    target.addEventListener(type, callback)
    cleanups.push(() => target.removeEventListener(type, callback))
  }
  videos.forEach((video, index) => {
    listen(video, "play", () => controller.play(index))
    listen(video, "pause", () => controller.pause(index))
    listen(video, "ended", () => controller.ended(index))
    listen(video, "error", () => controller.error(index))
    // With child sources, resource-selection failures are reported on the
    // source itself and need not set video.error or settle play(). Track errors
    // are separate and must not mark an otherwise playable video as failed.
    for (const source of video.querySelectorAll(":scope > source")) {
      listen(source, "error", () => controller.error(index))
    }
    // Native control events are retargeted to the video. Seeking, unmuting or
    // using fullscreen expresses ownership too; passive keyboard focus does not.
    listen(video, "pointerdown", () => controller.interact(index))
    listen(video, "keydown", event => { if ((event as KeyboardEvent).key !== "Tab") controller.interact(index) })
    listen(video, "volumechange", () => { if (!video.muted && video.volume > 0) controller.interact(index) })
    if (!video.paused) controller.play(index)
  })
  const refreshPolicy = () => controller.policy(currentPolicy())
  listen(root, "visibilitychange", refreshPolicy)
  listen(motion, "change", refreshPolicy)
  if (connection) listen(connection, "change", refreshPolicy)
  // Without IntersectionObserver the truthful fallback is manual playback.
  const observer = typeof view.IntersectionObserver === "function"
    ? new view.IntersectionObserver(entries => {
      // Apply a frame's observations together, avoiding a request for an old
      // visible player that this same batch is about to mark offscreen.
      controller.visibilityBatch(entries.map(entry => [
        videos.indexOf(entry.target as HTMLVideoElement),
        entry.isIntersecting && entry.intersectionRatio >= 0.5,
      ] as const))
    }, { threshold: [0, 0.5] })
    : undefined
  videos.forEach(video => observer?.observe(video))
  const dispose = () => {
    observer?.disconnect()
    controller.dispose()
    for (const cleanup of cleanups) cleanup()
    installations.delete(root)
  }
  installations.set(root, dispose)
  return dispose
}

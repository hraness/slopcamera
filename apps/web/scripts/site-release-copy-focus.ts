/** Serialized into the owned page. Keep every dependency inside this function.
 * Keys describe document-level authored targets, not native media shadow nodes.
 * Release-copy alone may seek past unnamed targets without a paint observation. */
export function installReleaseCopyFocusGuard() {
  const selectors = ['.topbar a', '[data-hraness-appearance-menu] button', '.hraness-site-footer__brand',
    '.hraness-site-footer__social-link', '.slopcamera-ask-ai a', '.route-state a']
  type Stop = { node: Element; key: string | null; controlledVideo: boolean }
  let phase: "idle" | "prepared" | "dispatched" | "video-exit" | "video-released" | "settling" | "closed" = "idle"
  let preparedControlledVideo = false
  let failure: string | undefined
  const gains: Stop[] = []
  function fail(message: string): never {
    failure ??= `Release-copy focus guard: ${message}`
    throw new Error(failure)
  }
  const healthy = () => {
    if (failure !== undefined) throw new Error(failure)
    if (phase === "closed") fail("guard already disposed")
  }
  const snapshot = (node: EventTarget | null): Stop => {
    if (!(node instanceof Element) || node.ownerDocument !== document || !node.isConnected) fail("invalid focus owner")
    let key: string | null = null
    if (node instanceof HTMLElement) {
      if (node.matches(".skip-link")) key = "skip"
      else for (const selector of selectors) if (node.matches(selector)) {
        const index = [...document.querySelectorAll(selector)].indexOf(node)
        if (index < 0) fail("named owner missing from inventory")
        key = `${selector}|${index}`
        break
      }
    }
    return { node, key, controlledVideo: node instanceof HTMLVideoElement && node.controls }
  }
  const same = (left: Stop, right: Stop) => left.node === right.node && left.key === right.key
  let checkpoint = snapshot(document.activeElement)
  const quiet = () => {
    healthy()
    const active = snapshot(document.activeElement)
    if (gains.length !== 0 || !same(active, checkpoint)) fail("focus changed outside native Tab dispatch")
    return active
  }
  const capture = (operation: () => void) => {
    try { operation() } catch (error) { failure ??= `Release-copy focus guard: ${String(error).slice(0, 256)}` }
  }
  const videoExit = () => {
    healthy()
    const source = snapshot(checkpoint.node), active = snapshot(document.activeElement)
    if (checkpoint.key !== null || !checkpoint.controlledVideo || !preparedControlledVideo || !source.controlledVideo || !same(source, checkpoint))
      fail("video exit source changed")
    if (gains.length !== 1 || !(gains[0]!.node instanceof HTMLAnchorElement) || !same(gains[0]!, active))
      fail("video exit anchor changed")
    return active
  }
  // Capture event.target before any nested redirect can replace activeElement.
  const focusin = (event: FocusEvent) => capture(() => {
    const gain = snapshot(event.target)
    if (gains.length >= 8) fail("focus gain queue overflow")
    gains.push(gain)
    if (phase === "prepared" && checkpoint.key === null && checkpoint.controlledVideo && preparedControlledVideo) {
      // A native video may consume keydown while its authored anchor exit
      // still exposes focusin and keyup. The gain alone never admits an exit.
      if (!event.isTrusted || !event.composed || event.relatedTarget !== checkpoint.node)
        fail("unproved video exit gain")
      videoExit()
      phase = "video-exit"
      return
    }
    if (phase !== "dispatched") fail("focus gain outside native Tab dispatch")
  })
  // A prepare/read round trip leaves a real asynchronous gap before keydown.
  // Validate that gap in this capture listener, before opening the next epoch.
  const keydown = (event: KeyboardEvent) => capture(() => {
    if (!event.isTrusted || event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
      fail("unexpected native key during traversal")
    if (phase !== "prepared") fail("unprepared native Tab")
    quiet()
    phase = "dispatched"
  })
  const keyup = (event: KeyboardEvent) => capture(() => {
    if (phase === "dispatched") return // The ordinary path retains its keydown proof.
    if (phase !== "video-exit" || !event.isTrusted || !event.composed || event.key !== "Tab" ||
      event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing)
      fail("unproved video exit keyup")
    const active = videoExit()
    if (!same(snapshot(event.target), active)) fail("video exit keyup owner changed")
    phase = "video-released"
  })
  const dispose = () => {
    window.removeEventListener("focusin", focusin, true)
    window.removeEventListener("keydown", keydown, true)
    window.removeEventListener("keyup", keyup, true)
    phase = "closed"
  }
  window.addEventListener("focusin", focusin, { capture: true, passive: true })
  try {
    window.addEventListener("keydown", keydown, { capture: true, passive: true })
    window.addEventListener("keyup", keyup, { capture: true, passive: true })
  } catch (error) { dispose(); throw error }
  return {
    prepare() {
      const active = quiet()
      if (phase !== "idle") fail("previous focus observation incomplete")
      preparedControlledVideo = active.controlledVideo
      phase = "prepared"
    },
    read() {
      healthy()
      if (phase === "video-released") {
        const active = videoExit()
        checkpoint = active
        gains.length = 0
        phase = active.key === null ? "idle" : "settling"
        return active.key
      }
      if (phase === "video-exit") fail("video exit keyup missing")
      if (phase === "prepared") {
        // Chromium can consume Tab inside native video controls without a
        // document keydown. The host still awaited that real native Tab. Admit
        // only the unchanged unnamed controlled video, never an unproved exit.
        const active = quiet()
        if (checkpoint.key !== null || !checkpoint.controlledVideo || !preparedControlledVideo || !active.controlledVideo)
          fail("native Tab dispatch missing")
        phase = "idle"
        return null
      }
      if (phase !== "dispatched") fail("native Tab dispatch missing")
      const active = snapshot(document.activeElement)
      if (gains.length > 1) fail("multiple focus gains in one Tab epoch")
      if (gains.length === 1 && !same(gains[0]!, active)) fail("focus gain and active owner disagree")
      // Leaving the document for browser chrome can expose body without a
      // focusin event. A named stop, however, needs its captured gain or the
      // exact unchanged document owner (including a retargeted media host).
      if (gains.length === 0 && active.key !== null && !same(active, checkpoint)) fail("uncaptured named focus gain")
      checkpoint = active
      gains.length = 0
      phase = active.key === null ? "idle" : "settling"
      return active.key
    },
    settled() {
      quiet()
      if (phase !== "settling" || checkpoint.key === null) fail("named settlement missing")
      phase = "idle"
      return checkpoint.key
    },
    finish() {
      try {
        quiet()
        if (phase !== "idle") fail("traversal ended before observation completed")
      } finally { dispose() }
    },
    dispose,
  }
}

import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import type { Browser, BrowserContext, Page, Request } from "playwright-core"
import { releaseCopyScope, releaseCopyBaselineProfile, releaseCopyBaselineRevision, releaseCopyBaselineTree } from "./site-release-copy-profile"

export const navigationDiagnosticFile = "site-release-copy-navigation-diagnostic.json"
export const navigationDiagnosticLimit = 128 * 1024
const timingKeys = ["startTime", "domainLookupStart", "domainLookupEnd", "connectStart", "secureConnectionStart",
  "connectEnd", "requestStart", "responseStart", "responseEnd"] as const
type Side = "current" | "baseline"
type Binding = { token: string; scope: string; baselineProfile: string; baselineRevision?: string; baselineTree?: string }
type Row = Record<string, unknown>
interface RequestRow extends Row { id: number; context: number; side: Side; path: string; type: string;
  main: boolean; navigation: boolean; times: Record<string, number> }
interface ContextRow extends Row { id: number; side: Side | null; goto: number; reload: number }
interface Trace { scenario: string; epochMs: number; monotonicMs: number; contexts: ContextRow[]; requests: RequestRow[]; events: Row[];
  observerError: string | null; snapshots: number }
const short = (value: unknown) => String(value).slice(0, 512)
const record = (value: unknown): Row => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value))
  return value as Row
}
const keys = (value: Row, required: readonly string[], optional: readonly string[] = []) => {
  assert.ok(required.every(key => Object.hasOwn(value, key)))
  assert.ok(Object.keys(value).every(key => required.includes(key) || optional.includes(key)))
}

/** Passive diagnostics only. Observer errors are retained, never substituted
 * for an original browser result. Return the original Promise to its caller. */
export function observeNavigationPromise<T>(promise: Promise<T>, success: (value: T) => void,
  failure: (error: unknown) => void, observerError: (error: unknown) => void): Promise<T> {
  const safe = (callback: () => void) => { try { callback() } catch (error) { try { observerError(error) } catch {} } }
  void promise.then(value => safe(() => success(value)), error => safe(() => failure(error)))
  return promise
}

/** Installed only for release-copy ordinary cases. It observes the existing
 * calls, events and cached Request.timing() values; it issues no browser call.
 * Each pair owns fresh maps. Successful pairs are retired without a sidecar. */
export function createNavigationDiagnostic(browser: Browser, origins: { current: string; baseline: string }) {
  let active: Trace | undefined
  const originalNewContext = browser.newContext
  const instrument = (context: BrowserContext, trace: Trace) => {
    const fail = (error: unknown) => { trace.observerError ??= short(error) }
    const safe = (operation: () => void) => { try { operation() } catch (error) { fail(error) } }
    const stamp = () => Math.round(performance.now() * 1000) / 1000
    const observe = <T>(promise: Promise<T>, success: (value: T) => void, failure: (error: unknown) => void) =>
      observeNavigationPromise(promise, success, failure, fail)
    assert.ok(trace.contexts.length < 2, "Navigation diagnostic context bound")
    const row: ContextRow = { id: trace.contexts.length + 1, side: null, goto: 0, reload: 0, created: stamp() }
    trace.contexts.push(row)
    const requests = new WeakMap<Request, RequestRow>(), live = new Map<Request, RequestRow>()
    let ownedPage: Page | undefined
    const event = (type: string, details: Row = {}) => {
      assert.ok(trace.events.length < 128, "Navigation diagnostic event bound")
      trace.events.push({ n: trace.events.length + 1, t: stamp(), context: row.id, type, ...details })
    }
    const timing = (incoming: Request, item: RequestRow) => {
      if (!(item.type === "font" || item.type === "document" && item.main && item.navigation)) return undefined
      // Pinned Playwright returns a mutable cached object. Copy values now.
      const cached = incoming.timing()
      return timingKeys.map(key => { const value = cached[key]; assert.ok(Number.isFinite(value)); return value })
    }
    const pending = () => {
      assert.ok(trace.snapshots < 4, "Navigation diagnostic snapshot bound"); trace.snapshots++
      return [...live].map(([incoming, item]) => ({ id: item.id, timing: timing(incoming, item) ?? null }))
    }
    const identity = (incoming: Request): RequestRow => {
      const prior = requests.get(incoming); if (prior) return prior
      assert.ok(trace.requests.length < 512, "Navigation diagnostic request bound")
      const url = new URL(incoming.url())
      assert.ok(url.origin === origins.current || url.origin === origins.baseline)
      assert.ok(url.pathname.length <= 256 && url.search === "" && url.hash === "")
      const side = url.origin === origins.current ? "current" : "baseline"
      assert.ok(row.side === null || row.side === side); row.side = side
      const item: RequestRow = { id: trace.requests.length + 1, context: row.id, side, path: url.pathname,
        method: short(incoming.method()), type: short(incoming.resourceType()), main: incoming.frame() === ownedPage?.mainFrame(),
        navigation: incoming.isNavigationRequest(), goto: row.goto, reload: row.reload, times: {} }
      requests.set(incoming, item); live.set(incoming, item); trace.requests.push(item); return item
    }
    const close = context.close.bind(context)
    context.close = (...args) => {
      let fresh = false
      safe(() => { assert.equal(row.closeBegin, undefined); row.closeBegin = stamp(); row.pending = pending(); fresh = true })
      const promise = close(...args)
      return fresh ? observe(promise, () => { row.closed = stamp() }, error => { row.closeError = short(error) }) : promise
    }
    const route = context.route.bind(context)
    context.route = (...args) => {
      const handler = args[1]
      args[1] = (...values) => {
        const intercepted = values[0], proceed = intercepted.continue.bind(intercepted)
        safe(() => { const item = identity(intercepted.request()); assert.equal(item.times.route, undefined); item.times.route = stamp() })
        intercepted.continue = (...options) => {
          let item: RequestRow | undefined, fresh = false
          safe(() => { item = identity(intercepted.request()); assert.equal(item.times.continue, undefined); item.times.continue = stamp(); fresh = true })
          const promise = proceed(...options)
          return fresh ? observe(promise, () => { if (item) item.times.continued = stamp() },
            error => { if (item) { item.times.continueError = stamp(); item.continueError = short(error) } }) : promise
        }
        return handler(...values)
      }
      return route(...args)
    }
    const newPage = context.newPage.bind(context)
    context.newPage = (...args) => observe(newPage(...args), page => {
      assert.equal(ownedPage, undefined); ownedPage = page
      page.on("request", incoming => safe(() => { const item = identity(incoming); assert.equal(item.times.request, undefined); item.times.request = stamp() }))
      page.on("requestfinished", incoming => safe(() => {
        const item = identity(incoming); assert.ok(item.times.finished === undefined && item.times.failed === undefined)
        item.times.finished = stamp(); item.terminalTiming = timing(incoming, item); live.delete(incoming)
      }))
      page.on("requestfailed", incoming => safe(() => {
        const item = identity(incoming); assert.ok(item.times.finished === undefined && item.times.failed === undefined)
        item.times.failed = stamp(); item.failure = short(incoming.failure()?.errorText)
        item.terminalTiming = timing(incoming, item); live.delete(incoming)
      }))
      page.on("response", response => safe(() => {
        const item = identity(response.request()), headers = response.headers()
        assert.equal(item.times.response, undefined)
        item.times.response = stamp(); item.status = response.status(); item.contentType = short(headers["content-type"])
        item.contentLength = headers["content-length"] === undefined ? null : short(headers["content-length"])
        item.responseTiming = timing(response.request(), item)
        const finished = response.finished.bind(response)
        response.finished = (...args) => {
          let fresh = false
          safe(() => { assert.equal(item.times.finishedCall, undefined); item.times.finishedCall = stamp(); fresh = true })
          const promise = finished(...args)
          return fresh ? observe(promise, value => { item.times.finishedSettled = stamp(); item.finishedValue = value === null ? null : short(value) },
            error => { item.times.finishedRejected = stamp(); item.finishedError = short(error) }) : promise
        }
      }))
      page.on("domcontentloaded", () => safe(() => event("domcontentloaded")))
      page.on("load", () => safe(() => event("load")))
      page.on("framenavigated", frame => safe(() => { if (frame === page.mainFrame()) event("main-frame-navigated") }))
      const goto = page.goto.bind(page), reload = page.reload.bind(page)
      page.goto = (...args) => {
        let ordinal = 0
        safe(() => { assert.ok(row.goto < 4); ordinal = ++row.goto; event("goto-start", { ordinal, url: short(args[0]) }) })
        return observe(goto(...args), () => event("goto-end", { ordinal }),
          error => event("goto-error", { ordinal, error: short(error), pending: pending() }))
      }
      page.reload = (...args) => {
        let ordinal = 0
        safe(() => { assert.ok(row.reload < 1); ordinal = ++row.reload; event("reload-start", { ordinal }) })
        return observe(reload(...args), () => event("reload-end", { ordinal }),
          error => event("reload-error", { ordinal, error: short(error), pending: pending() }))
      }
    }, error => event("new-page-error", { error: short(error) }))
  }
  browser.newContext = (...args) => {
    const trace = active, promise = originalNewContext.apply(browser, args)
    return trace === undefined ? promise : observeNavigationPromise(promise, context => instrument(context, trace),
      error => { trace.observerError ??= short(error) }, error => { trace.observerError ??= short(error) })
  }
  return {
    begin(scenario: string) {
      assert.equal(active, undefined)
      active = { scenario, epochMs: Date.now(), monotonicMs: performance.now(), contexts: [], requests: [], events: [], observerError: null, snapshots: 0 }
    },
    retire() { active = undefined },
    encodeFailure(binding: Binding) {
      return active === undefined ? undefined : encodeNavigationDiagnostic(binding, active)
    },
    restore() { browser.newContext = originalNewContext },
  }
}

export function encodeNavigationDiagnostic(binding: Binding, trace: Trace): string {
  const common = { schemaVersion: 1, kind: "release-copy-navigation-diagnostic", diagnosticOnly: true, accepted: false,
    token: binding.token, scope: binding.scope, baselineProfile: binding.baselineProfile,
    baselineRevision: binding.baselineRevision, baselineTree: binding.baselineTree, scenario: trace.scenario }
  const text = JSON.stringify({ ...common, overflow: false, trace }) + "\n"
  if (Buffer.byteLength(text) <= navigationDiagnosticLimit) return text
  return JSON.stringify({ ...common, overflow: true, encodedBytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
    counts: { contexts: trace.contexts.length, requests: trace.requests.length, events: trace.events.length } }) + "\n"
}

/** This validates diagnostic structure and identity, not network success. */
export function parseNavigationDiagnostic(bytes: Uint8Array, binding: Binding, scenario: string): Row {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= navigationDiagnosticLimit)
  const value = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
  keys(value, ["schemaVersion", "kind", "diagnosticOnly", "accepted", "token", "scope", "baselineProfile", "baselineRevision", "baselineTree", "scenario", "overflow"],
    value.overflow === true ? ["encodedBytes", "sha256", "counts"] : ["trace"])
  assert.equal(value.schemaVersion, 1); assert.equal(value.kind, "release-copy-navigation-diagnostic")
  assert.equal(value.diagnosticOnly, true); assert.equal(value.accepted, false); assert.equal(value.scenario, scenario)
  for (const key of ["token", "scope", "baselineProfile", "baselineRevision", "baselineTree"] as const) assert.equal(value[key], binding[key])
  assert.equal(value.scope, releaseCopyScope); assert.equal(value.baselineProfile, releaseCopyBaselineProfile)
  assert.equal(value.baselineRevision, releaseCopyBaselineRevision); assert.equal(value.baselineTree, releaseCopyBaselineTree)
  const list = (input: unknown, maximum: number): unknown[] => { assert.ok(Array.isArray(input) && input.length <= maximum); return input }
  const finite = (input: unknown) => { assert.ok(typeof input === "number" && Number.isFinite(input)) }
  const integer = (input: unknown, minimum: number, maximum: number) => { assert.ok(Number.isSafeInteger(input) && Number(input) >= minimum && Number(input) <= maximum) }
  const timing = (input: unknown) => { if (input !== undefined) { assert.equal(list(input, 9).length, 9); for (const item of input as unknown[]) finite(item) } }
  let snapshots = 0
  const pending = (input: unknown, context: unknown) => {
    if (input === undefined) return
    snapshots++; const seen = new Set<unknown>()
    for (const item of list(input, 512)) {
      const row = record(item); keys(row, ["id", "timing"]); integer(row.id, 1, requests.length)
      assert.ok(!seen.has(row.id)); seen.add(row.id)
      const request = record(requests[Number(row.id) - 1]); assert.equal(request.id, row.id); assert.equal(request.context, context)
      if (row.timing !== null) timing(row.timing)
    }
  }
  if (value.overflow === true) {
    integer(value.encodedBytes, navigationDiagnosticLimit + 1, 16 * 1024 * 1024)
    assert.ok(typeof value.sha256 === "string" && /^[a-f0-9]{64}$/u.test(value.sha256))
    const counts = record(value.counts); keys(counts, ["contexts", "requests", "events"])
    integer(counts.contexts, 0, 2); integer(counts.requests, 0, 512); integer(counts.events, 0, 128)
    return value
  }
  assert.equal(value.overflow, false)
  const trace = record(value.trace); keys(trace, ["scenario", "epochMs", "monotonicMs", "contexts", "requests", "events", "observerError", "snapshots"])
  assert.equal(trace.scenario, scenario); finite(trace.epochMs); finite(trace.monotonicMs); integer(trace.snapshots, 0, 4)
  assert.ok(trace.observerError === null || typeof trace.observerError === "string" && trace.observerError.length <= 512)
  const contexts = list(trace.contexts, 2), requests = list(trace.requests, 512), events = list(trace.events, 128)
  for (const [i, item] of contexts.entries()) {
    const row = record(item); keys(row, ["id", "side", "goto", "reload", "created"], ["closeBegin", "pending", "closed", "closeError"])
    assert.equal(row.id, i + 1); assert.ok(row.side === null || row.side === "current" || row.side === "baseline")
    integer(row.goto, 0, 4); integer(row.reload, 0, 1); finite(row.created)
    for (const key of ["closeBegin", "closed"]) if (row[key] !== undefined) finite(row[key])
    if (row.closeError !== undefined) assert.ok(typeof row.closeError === "string" && row.closeError.length <= 512)
    pending(row.pending, row.id)
  }
  for (const [i, item] of requests.entries()) {
    const row = record(item); keys(row, ["id", "context", "side", "path", "method", "type", "main", "navigation", "goto", "reload", "times"],
      ["status", "contentType", "contentLength", "responseTiming", "terminalTiming", "failure", "continueError", "finishedValue", "finishedError"])
    assert.equal(row.id, i + 1); integer(row.context, 1, contexts.length)
    assert.ok(row.side === "current" || row.side === "baseline")
    assert.equal(row.side, record(contexts[Number(row.context) - 1]).side)
    assert.ok(typeof row.path === "string" && row.path.startsWith("/") && row.path.length <= 256)
    for (const key of ["method", "type"]) assert.ok(typeof row[key] === "string" && row[key].length > 0 && row[key].length <= 512)
    for (const key of ["contentType", "failure", "continueError", "finishedError"])
      if (row[key] !== undefined) assert.ok(typeof row[key] === "string" && row[key].length <= 512)
    for (const key of ["contentLength", "finishedValue"])
      if (row[key] !== undefined && row[key] !== null) assert.ok(typeof row[key] === "string" && row[key].length <= 512)
    assert.equal(typeof row.main, "boolean"); assert.equal(typeof row.navigation, "boolean")
    integer(row.goto, 0, 4); integer(row.reload, 0, 1)
    if (row.status !== undefined) integer(row.status, 100, 599)
    const times = record(row.times); keys(times, [], ["request", "route", "continue", "continued", "continueError", "response", "finished", "failed", "finishedCall", "finishedSettled", "finishedRejected"])
    for (const time of Object.values(times)) finite(time)
    timing(row.responseTiming); timing(row.terminalTiming)
  }
  for (const [i, item] of events.entries()) {
    const row = record(item); keys(row, ["n", "t", "context", "type"], ["ordinal", "url", "error", "pending"])
    assert.equal(row.n, i + 1); finite(row.t); integer(row.context, 1, contexts.length)
    assert.ok(["domcontentloaded", "load", "main-frame-navigated", "goto-start", "goto-end", "goto-error", "reload-start", "reload-end", "reload-error", "new-page-error"].includes(String(row.type)))
    if (row.ordinal !== undefined) integer(row.ordinal, 0, 4)
    for (const key of ["url", "error"]) if (row[key] !== undefined) assert.ok(typeof row[key] === "string" && row[key].length <= 512)
    pending(row.pending, row.context)
  }
  assert.equal(snapshots, trace.snapshots)
  return value
}

/** Parent-only recent tail. It has no per-pair ownership and does not prove
 * socket delivery. Both operations are synchronous observers of the server. */
export function createNavigationHttpTail() {
  const events: Row[] = []; let seen = 0, observerError: string | null = null
  const epochMs = Date.now(), monotonicMs = performance.now()
  return {
    add(side: Side, phase: "fetch" | "response", path: string, status: number | null, bytes: number | null) {
      if (!(path === "/" || path === "/404.html" || path.endsWith(".woff2"))) return
      try {
        assert.ok(path.length <= 256)
        events.push({ n: ++seen, t: performance.now(), side, phase, path, status, bytes })
        if (events.length > 256) events.shift()
      } catch (error) { observerError ??= short(error) }
    },
    snapshot() { return { kind: "recent-parent-http-tail", perPair: false, socketDeliveryProven: false,
      epochMs, monotonicMs, seen, dropped: seen - events.length, observerError, events: [...events] } },
  }
}

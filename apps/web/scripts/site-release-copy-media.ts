import assert from "node:assert/strict"

export interface ReleaseCopyMediaBinding {
  readonly id: string; readonly path: string; readonly sha256: string; readonly bytes: number
}
export interface ReleaseCopyPlaybackProof {
  readonly id: string; readonly currentSrc: string; readonly ownedConnected: boolean
  readonly time: number; readonly readyState: number; readonly error: number | null
}
interface RequestMetadata {
  readonly url: string; readonly method: string; readonly range: string | null
  readonly resourceType: string; readonly ownedFrame: boolean
}
interface ResponseMetadata {
  readonly status: number; readonly contentType: string; readonly contentRange: string | null; readonly contentLength: string | null
}
interface RangeReceipt {
  readonly requestId: number; readonly requestOrder: number; readonly responseOrder: number; readonly terminalOrder: number
  readonly completedOrder: number | null; readonly range: string; readonly status: number
  readonly start: number; readonly end: number; readonly contentRange: string; readonly contentLength: number
  readonly terminal: "aborted" | "finished"; readonly failure: string | null
}
export interface ReleaseCopyRangeRecovery {
  readonly id: string; readonly path: string; readonly sha256: string; readonly bytes: number
  readonly initial: RangeReceipt; readonly tail: RangeReceipt; readonly resume: RangeReceipt
  readonly playback: ReleaseCopyPlaybackProof & { readonly order: number }
}
const requestLimit = 64, eventLimit = 512
const record = (value: unknown): Record<string, unknown> => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value)); return value as Record<string, unknown>
}
const keys = (value: Record<string, unknown>, expected: readonly string[]) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
function integer(value: unknown, minimum: number, maximum: number): asserts value is number {
  assert.ok(Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum)
}
function bindings(media: readonly ReleaseCopyMediaBinding[]) {
  assert.ok(media.length > 0 && media.length <= 64)
  const paths = new Map<string, ReleaseCopyMediaBinding>(), ids = new Set<string>()
  for (const item of media) {
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u); assert.ok(!ids.has(item.id)); ids.add(item.id)
    assert.match(item.path, /^\/assets\/examples\/[a-z0-9-]+\.mp4$/u); assert.ok(!paths.has(item.path))
    assert.match(item.sha256, /^[a-f0-9]{64}$/u); integer(item.bytes, 1, 64 * 1024 * 1024)
    paths.set(item.path, Object.freeze({ id: item.id, path: item.path, sha256: item.sha256, bytes: item.bytes }))
  }
  return paths
}
function byteRange(range: string | null, bytes: number): { start: number; end: number } {
  if (range === null) return { start: 0, end: bytes - 1 }
  assert.ok(range.length <= 64)
  const match = /^bytes=(\d*)-(\d*)$/u.exec(range); assert.ok(match && (match[1] || match[2]))
  const first = match[1] ? Number(match[1]) : undefined, last = match[2] ? Number(match[2]) : undefined
  if (first !== undefined) { integer(first, 0, bytes - 1); assert.equal(match[1], String(first)) }
  if (last !== undefined) { integer(last, 0, Number.MAX_SAFE_INTEGER); assert.equal(match[2], String(last)) }
  if (first === undefined) { assert.ok(last && last > 0); return { start: Math.max(0, bytes - last), end: bytes - 1 } }
  assert.ok(last === undefined || last >= first)
  return { start: first, end: Math.min(last ?? bytes - 1, bytes - 1) }
}

/** Strict wire receipt validation is independent of the live event ledger. */
export function assertReleaseCopyRangeRecoveries(value: unknown, media: readonly ReleaseCopyMediaBinding[], origin: string,
  samples: readonly ReleaseCopyPlaybackProof[]): asserts value is readonly ReleaseCopyRangeRecovery[] {
  const assets = bindings(media), recovered = new Set<string>(), requestIds = new Map<number, number>(), orders = new Set<number>()
  assert.ok(Array.isArray(value) && value.length <= Math.floor(requestLimit / 3))
  const order = (value: unknown) => { integer(value, 1, eventLimit); assert.ok(!orders.has(value)); orders.add(value); return value }
  for (const candidate of value) {
    const item = record(candidate); keys(item, ["id", "path", "sha256", "bytes", "initial", "tail", "resume", "playback"])
    assert.equal(typeof item.path, "string")
    const asset = assets.get(item.path as string); assert.ok(asset && asset.id === item.id && !recovered.has(asset.id)); recovered.add(asset.id)
    assert.equal(item.sha256, asset.sha256); assert.equal(item.bytes, asset.bytes)
    const ranges = [item.initial, item.tail, item.resume].map((value, index) => {
      const range = record(value)
      keys(range, ["requestId", "requestOrder", "responseOrder", "terminalOrder", "completedOrder", "range", "status", "start", "end", "contentRange", "contentLength", "terminal", "failure"])
      integer(range.requestId, 1, requestLimit); assert.ok(!requestIds.has(range.requestId))
      integer(range.start, 0, asset.bytes - 1); assert.equal(range.end, asset.bytes - 1)
      assert.equal(range.range, `bytes=${range.start}-`); assert.equal(range.status, 206)
      assert.equal(range.contentRange, `bytes ${range.start}-${asset.bytes - 1}/${asset.bytes}`)
      assert.equal(range.contentLength, asset.bytes - range.start)
      const requestOrder = order(range.requestOrder), responseOrder = order(range.responseOrder), terminalOrder = order(range.terminalOrder)
      requestIds.set(range.requestId, requestOrder)
      assert.ok(requestOrder < responseOrder && responseOrder < terminalOrder)
      if (index === 0) {
        assert.equal(range.start, 0); assert.equal(range.terminal, "aborted"); assert.equal(range.failure, "net::ERR_ABORTED"); assert.equal(range.completedOrder, null)
      } else {
        assert.equal(range.terminal, "finished"); assert.equal(range.failure, null); assert.ok(order(range.completedOrder) > terminalOrder)
      }
      return range
    })
    const [initial, tail, resume] = ranges as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>]
    assert.ok(Number(initial.terminalOrder) < Number(tail.requestOrder) && Number(tail.completedOrder) < Number(resume.requestOrder))
    assert.ok(Number(resume.start) > 0 && Number(resume.start) < Number(tail.start) && Number(tail.start) < asset.bytes)
    const playback = record(item.playback); keys(playback, ["id", "currentSrc", "ownedConnected", "time", "readyState", "error", "order"])
    assert.equal(playback.id, asset.id); assert.equal(playback.currentSrc, `${origin}${asset.path}`); assert.equal(playback.ownedConnected, true)
    assert.ok(typeof playback.time === "number" && Number.isFinite(playback.time) && playback.time > .04)
    integer(playback.readyState, 2, 4); assert.equal(playback.error, null); assert.ok(order(playback.order) > Number(resume.completedOrder))
    const matching = samples.filter(sample => sample.id === asset.id); assert.equal(matching.length, 1)
    const { order: _, ...proof } = playback; assert.deepEqual(proof, matching[0])
  }
  const chronology = [...requestIds.entries()].sort((a, b) => a[1] - b[1])
  for (let index = 1; index < chronology.length; index++) assert.ok(chronology[index - 1]![0] < chronology[index]![0], "Request IDs must preserve admission order")
}

interface Entry {
  readonly key: object; readonly asset: ReleaseCopyMediaBinding; readonly requestId: number; readonly requestOrder: number
  readonly range: string | null; readonly done: Promise<void>; readonly resolve: () => void
  response?: ResponseMetadata & { start: number; end: number; length: number; order: number }
  terminal?: { kind: "finished" | "aborted"; failure: string | null; order: number }
  completedOrder?: number
  provisional?: boolean
}

/** Only a measured, fully recovered three-request MP4 sequence is admissible. */
export function createReleaseCopyMediaLedger(media: readonly ReleaseCopyMediaBinding[], origin: string) {
  const assets = bindings(media), entries = new Map<object, Entry>(), playback = new Map<string, ReleaseCopyPlaybackProof & { order: number }>()
  const admittedMedia = [...assets.values()]
  let phase: "open" | "sealed" | "closing" = "open", sequence = 0, failure: Error | undefined
  const fail = (message: string): never => { failure ??= new Error(`Release-copy media lifecycle: ${message}`); throw failure }
  const healthy = () => { if (failure) throw failure; if (phase !== "open") fail(`event during ${phase}`) }
  const next = () => { if (++sequence > eventLimit) fail("event bound"); return sequence }
  const guarded = <T>(operation: () => T): T => { try { return operation() } catch (error) { failure ??= error instanceof Error ? error : new Error(String(error)); throw failure } }
  const entry = (key: object) => { const value = entries.get(key); if (!value) fail("unknown Request identity"); return value! }
  const terminal = (key: object, kind: "finished" | "aborted", reason: string | null): boolean => guarded(() => {
    const value = entry(key)
    if (value.terminal) fail("duplicate Request terminal")
    value.terminal = { kind, failure: reason, order: next() }; value.resolve()
    healthy(); assert.ok(value.response, "Request terminal without response")
    if (kind === "finished") return false
    assert.equal(reason, "net::ERR_ABORTED")
    assert.equal(value.range, "bytes=0-"); assert.equal(value.response.status, 206)
    assert.equal(value.response.start, 0); assert.equal(value.response.end, value.asset.bytes - 1)
    value.provisional = true
    return true
  })
  return {
    handles: (key: object) => entries.has(key),
    request(key: object, metadata: RequestMetadata): boolean {
      return guarded(() => {
        healthy()
        const url = new URL(metadata.url)
        if (!url.pathname.endsWith(".mp4")) return false
        assert.equal(metadata.url, `${origin}${url.pathname}`)
        const asset = assets.get(url.pathname); assert.ok(asset, "Unadmitted media URL")
        assert.equal(metadata.method, "GET"); assert.equal(metadata.resourceType, "media"); assert.equal(metadata.ownedFrame, true)
        assert.ok(!entries.has(key), "Duplicate Request identity"); assert.ok(entries.size < requestLimit, "Request identity bound")
        byteRange(metadata.range, asset.bytes)
        let resolve!: () => void; const done = new Promise<void>(settle => { resolve = settle })
        entries.set(key, { key, asset, requestId: entries.size + 1, requestOrder: next(), range: metadata.range, done, resolve })
        return true
      })
    },
    async response(key: object, metadata: ResponseMetadata, finished: () => Promise<unknown>): Promise<void> {
      const value = guarded(() => {
        healthy(); const value = entry(key); assert.equal(value.response, undefined, "Duplicate response")
        const range = byteRange(value.range, value.asset.bytes)
        assert.equal(metadata.status, value.range === null ? 200 : 206); assert.equal(metadata.contentType, "video/mp4")
        assert.equal(metadata.contentRange, value.range === null ? null : `bytes ${range.start}-${range.end}/${value.asset.bytes}`)
        assert.equal(metadata.contentLength, String(range.end - range.start + 1))
        value.response = { ...metadata, ...range, length: range.end - range.start + 1, order: next() }; return value
      })
      await value.done
      guarded(() => { healthy(); assert.ok(value.terminal) })
      if (value.terminal!.kind === "aborted") { guarded(() => assert.equal(value.provisional, true)); return }
      try { assert.equal(await finished(), null); guarded(() => { healthy(); value.completedOrder = next() }) }
      catch (error) { guarded(() => { throw error }) }
    },
    finished: (key: object) => terminal(key, "finished", null),
    failed: (key: object, reason: string | null) => terminal(key, "aborted", reason),
    playback(sample: ReleaseCopyPlaybackProof): void {
      guarded(() => {
        healthy(); assert.ok(!playback.has(sample.id), "Duplicate original playback sample")
        assert.ok(admittedMedia.some(asset => asset.id === sample.id)); assert.ok(playback.size < 32)
        assert.equal(typeof sample.currentSrc, "string"); assert.ok(sample.currentSrc.length <= 1024)
        assert.equal(typeof sample.ownedConnected, "boolean"); assert.ok(Number.isFinite(sample.time)); integer(sample.readyState, 0, 4)
        playback.set(sample.id, { ...sample, order: next() })
      })
    },
    seal(): readonly ReleaseCopyRangeRecovery[] {
      return guarded(() => {
        healthy()
        const recoveries: ReleaseCopyRangeRecovery[] = []
        for (const value of entries.values()) {
          assert.ok(value.response && value.terminal, "Unsettled media Request")
          if (value.terminal.kind === "finished") { assert.ok(value.completedOrder, "Unsettled response.finished"); continue }
          assert.equal(value.provisional, true)
          const group = [...entries.values()].filter(item => item.asset.id === value.asset.id)
          assert.equal(group.length, 3, "Recovery requires exactly three Requests without extras or retries"); assert.equal(group[0], value)
          const encode = (item: Entry): RangeReceipt => {
            assert.ok(item.response && item.terminal)
            return { requestId: item.requestId, requestOrder: item.requestOrder, responseOrder: item.response.order, terminalOrder: item.terminal.order,
              completedOrder: item.completedOrder ?? null, range: item.range!, status: item.response.status, start: item.response.start, end: item.response.end,
              contentRange: item.response.contentRange!, contentLength: item.response.length, terminal: item.terminal.kind, failure: item.terminal.failure }
          }
          const proof = playback.get(value.asset.id); assert.ok(proof, "Missing original playback recovery proof")
          recoveries.push({ ...value.asset, initial: encode(group[0]!), tail: encode(group[1]!), resume: encode(group[2]!), playback: proof })
        }
        const samples = [...playback.values()].map(({ order: _, ...sample }) => sample)
        assertReleaseCopyRangeRecoveries(recoveries, admittedMedia, origin, samples)
        phase = "sealed"; return recoveries
      })
    },
    beginClose(): void { phase = "closing" },
    assertHealthy(): void { if (failure) throw failure },
  }
}
export type ReleaseCopyMediaLedger = ReturnType<typeof createReleaseCopyMediaLedger>

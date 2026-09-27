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
interface TransferRequestReceipt {
  readonly requestId: number; readonly requestOrder: number; readonly responseOrder: number; readonly terminalOrder: number
  readonly completedOrder: number | null; readonly range: string | null; readonly status: number; readonly contentType: string
  readonly start: number; readonly end: number; readonly contentRange: string | null; readonly contentLength: number
  readonly terminal: "aborted" | "finished"; readonly failure: string | null
}
export interface ReleaseCopyMediaCancellation {
  readonly id: string; readonly path: string; readonly sha256: string; readonly bytes: number
  readonly requests: readonly TransferRequestReceipt[]
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
  assert.ok(typeof range === "string" && range.length <= 64)
  const match = /^bytes=(\d*)-(\d*)$/u.exec(range); assert.ok(match && (match[1] || match[2]))
  const first = match[1] ? Number(match[1]) : undefined, last = match[2] ? Number(match[2]) : undefined
  if (first !== undefined) { integer(first, 0, bytes - 1); assert.equal(match[1], String(first)) }
  if (last !== undefined) { integer(last, 0, Number.MAX_SAFE_INTEGER); assert.equal(match[2], String(last)) }
  if (first === undefined) { assert.ok(last && last > 0); return { start: Math.max(0, bytes - last), end: bytes - 1 } }
  assert.ok(last === undefined || last >= first)
  return { start: first, end: Math.min(last ?? bytes - 1, bytes - 1) }
}

/** Validate the described transfer history. Completeness against actual browser
 * traffic belongs to the live ledger, not to self-reported wire fields. */
export function assertReleaseCopyMediaCancellations(value: unknown, media: readonly ReleaseCopyMediaBinding[], origin: string,
  samples: readonly ReleaseCopyPlaybackProof[]): asserts value is readonly ReleaseCopyMediaCancellation[] {
  const assets = bindings(media), reported = new Set<string>(), requestIds = new Map<number, number>(), orders = new Set<number>()
  assert.ok(Array.isArray(value) && value.length <= Math.min(requestLimit, assets.size))
  const order = (value: unknown) => { integer(value, 1, eventLimit); assert.ok(!orders.has(value)); orders.add(value); return value }
  let previousGroupRequestId = 0
  for (const candidate of value) {
    const item = record(candidate); keys(item, ["id", "path", "sha256", "bytes", "requests", "playback"])
    assert.equal(typeof item.path, "string")
    const asset = assets.get(item.path as string); assert.ok(asset && asset.id === item.id && !reported.has(asset.id)); reported.add(asset.id)
    assert.equal(item.sha256, asset.sha256); assert.equal(item.bytes, asset.bytes)
    assert.ok(Array.isArray(item.requests) && item.requests.length > 0 && item.requests.length <= requestLimit)
    let previousRequestId = 0, latestTransferOrder = 0, cancellations = 0
    for (const [index, value] of item.requests.entries()) {
      const transfer = record(value)
      keys(transfer, ["requestId", "requestOrder", "responseOrder", "terminalOrder", "completedOrder", "range", "status", "contentType", "start", "end", "contentRange", "contentLength", "terminal", "failure"])
      integer(transfer.requestId, 1, requestLimit); assert.ok(!requestIds.has(transfer.requestId))
      assert.ok(transfer.requestId > previousRequestId); previousRequestId = transfer.requestId
      if (index === 0) { assert.ok(transfer.requestId > previousGroupRequestId); previousGroupRequestId = transfer.requestId }
      assert.ok(transfer.range === null || typeof transfer.range === "string")
      const range = byteRange(transfer.range, asset.bytes)
      assert.equal(transfer.start, range.start); assert.equal(transfer.end, range.end)
      assert.equal(transfer.status, transfer.range === null ? 200 : 206); assert.equal(transfer.contentType, "video/mp4")
      assert.equal(transfer.contentRange, transfer.range === null ? null : `bytes ${range.start}-${range.end}/${asset.bytes}`)
      assert.equal(transfer.contentLength, range.end - range.start + 1)
      const requestOrder = order(transfer.requestOrder), responseOrder = order(transfer.responseOrder), terminalOrder = order(transfer.terminalOrder)
      requestIds.set(transfer.requestId, requestOrder)
      assert.ok(requestOrder < responseOrder && responseOrder < terminalOrder)
      latestTransferOrder = Math.max(latestTransferOrder, terminalOrder)
      if (transfer.terminal === "aborted") {
        assert.equal(transfer.failure, "net::ERR_ABORTED"); assert.equal(transfer.completedOrder, null); cancellations++
      } else {
        assert.equal(transfer.terminal, "finished"); assert.equal(transfer.failure, null)
        const completedOrder = order(transfer.completedOrder); assert.ok(completedOrder > terminalOrder)
        latestTransferOrder = Math.max(latestTransferOrder, completedOrder)
      }
    }
    assert.ok(cancellations > 0, "Cancellation inventory requires an aborted Request")
    const playback = record(item.playback); keys(playback, ["id", "currentSrc", "ownedConnected", "time", "readyState", "error", "order"])
    assert.equal(playback.id, asset.id); assert.equal(playback.currentSrc, `${origin}${asset.path}`); assert.equal(playback.ownedConnected, true)
    assert.ok(typeof playback.time === "number" && Number.isFinite(playback.time) && playback.time > .04)
    integer(playback.readyState, 2, 4); assert.equal(playback.error, null); assert.ok(order(playback.order) > latestTransferOrder)
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

/** A cancellation stays provisional until the original later owned sample
 * proves decoded readiness and accumulated playback for that immutable asset. */
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
    seal(): readonly ReleaseCopyMediaCancellation[] {
      return guarded(() => {
        healthy()
        const groups = new Map<string, Entry[]>(), cancelled = new Set<number>(), consumed = new Set<number>()
        for (const value of entries.values()) {
          assert.ok(value.response && value.terminal, "Unsettled media Request")
          if (value.terminal.kind === "finished") assert.ok(value.completedOrder, "Unsettled response.finished")
          else { assert.equal(value.provisional, true); cancelled.add(value.requestId) }
          const group = groups.get(value.asset.id) ?? []; group.push(value); groups.set(value.asset.id, group)
        }
        const cancellations: ReleaseCopyMediaCancellation[] = []
        for (const group of groups.values()) {
          if (!group.some(item => cancelled.has(item.requestId))) continue
          const encode = (item: Entry): TransferRequestReceipt => {
            assert.ok(item.response && item.terminal)
            if (cancelled.has(item.requestId)) { assert.ok(!consumed.has(item.requestId)); consumed.add(item.requestId) }
            return { requestId: item.requestId, requestOrder: item.requestOrder, responseOrder: item.response.order, terminalOrder: item.terminal.order,
              completedOrder: item.completedOrder ?? null, range: item.range, status: item.response.status, contentType: item.response.contentType,
              start: item.response.start, end: item.response.end, contentRange: item.response.contentRange, contentLength: item.response.length,
              terminal: item.terminal.kind, failure: item.terminal.failure }
          }
          const asset = group[0]!.asset, proof = playback.get(asset.id); assert.ok(proof, "Missing original playback cancellation proof")
          cancellations.push({ ...asset, requests: group.map(encode), playback: proof })
        }
        assert.deepEqual([...consumed].sort((a, b) => a - b), [...cancelled].sort((a, b) => a - b))
        const samples = [...playback.values()].map(({ order: _, ...sample }) => sample)
        assertReleaseCopyMediaCancellations(cancellations, admittedMedia, origin, samples)
        phase = "sealed"; return cancellations
      })
    },
    beginClose(): void { phase = "closing" },
    assertHealthy(): void { if (failure) throw failure },
  }
}
export type ReleaseCopyMediaLedger = ReturnType<typeof createReleaseCopyMediaLedger>

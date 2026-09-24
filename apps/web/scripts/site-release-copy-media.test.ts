import { describe, expect, test } from "bun:test"
import { assertReleaseCopyRangeRecoveries, createReleaseCopyMediaLedger, type ReleaseCopyPlaybackProof } from "./site-release-copy-media"

const origin = "http://127.0.0.1:43123"
const asset = { id: "premiere-wall", path: "/assets/examples/premiere-wall-0123456789ab.mp4", sha256: "a".repeat(64), bytes: 1000 }
const proof: ReleaseCopyPlaybackProof = { id: asset.id, currentSrc: `${origin}${asset.path}`, ownedConnected: true, time: .2, readyState: 4, error: null }
function fixture() {
  const ledger = createReleaseCopyMediaLedger([asset], origin)
  const start = (range = "bytes=0-", metadata: Record<string, unknown> = {}, response: Record<string, unknown> = {}) => {
    const key = {}, first = Number(/^bytes=(\d+)-$/u.exec(range)?.[1] ?? 0)
    ledger.request(key, { url: `${origin}${asset.path}`, method: "GET", range, resourceType: "media", ownedFrame: true, ...metadata })
    let finishedCalls = 0
    const done = ledger.response(key, { status: 206, contentType: "video/mp4", contentRange: `bytes ${first}-999/1000`, contentLength: String(1000 - first), ...response }, async () => { finishedCalls++; return null })
    return { key, done, finishedCalls: () => finishedCalls }
  }
  const recover = async () => {
    const initial = start(); expect(ledger.failed(initial.key, "net::ERR_ABORTED")).toBe(true); await initial.done; expect(initial.finishedCalls()).toBe(0)
    const tail = start("bytes=900-"); ledger.finished(tail.key); await tail.done
    const resume = start("bytes=100-"); ledger.finished(resume.key); await resume.done
    return { initial, tail, resume }
  }
  return { ledger, start, recover }
}
async function validReceipt() {
  const f = fixture(); await f.recover(); f.ledger.playback(proof); return { ...f, receipt: f.ledger.seal() }
}

describe("release-copy exact native MP4 range recovery", () => {
  test("only the exact successful Request terminal releases its original finished callback", async () => {
    const f = fixture(), value = f.start()
    await Promise.resolve(); expect(value.finishedCalls()).toBe(0)
    f.ledger.finished(value.key); await value.done; expect(value.finishedCalls()).toBe(1)
    expect(f.ledger.seal()).toEqual([])
  })
  test("the observed initial abort, completed tail and completed resume produce one bound receipt", async () => {
    const { receipt } = await validReceipt()
    expect(receipt).toHaveLength(1)
    expect(receipt[0]!.initial.completedOrder).toBeNull()
    expect(receipt[0]!.tail.start).toBe(900); expect(receipt[0]!.resume.start).toBe(100)
    expect(() => assertReleaseCopyRangeRecoveries(receipt, [asset], origin, [proof])).not.toThrow()
  })
  test("completed whole, bounded and suffix requests retain exact immutable byte accounting", async () => {
    for (const [range, start, end] of [[null, 0, 999], ["bytes=10-19", 10, 19], ["bytes=-100", 900, 999]] as const) {
      const ledger = createReleaseCopyMediaLedger([asset], origin), key = {}
      ledger.request(key, { url: `${origin}${asset.path}`, method: "GET", range, resourceType: "media", ownedFrame: true })
      let calls = 0
      const done = ledger.response(key, { status: range === null ? 200 : 206, contentType: "video/mp4",
        contentRange: range === null ? null : `bytes ${start}-${end}/1000`, contentLength: String(end - start + 1) }, async () => { calls++; return null })
      expect(calls).toBe(0); ledger.finished(key); await done; expect(calls).toBe(1); expect(ledger.seal()).toEqual([])
    }
  })
  test("immutable media bindings reject missing, unsafe and unbounded lengths", () => {
    for (const bytes of [undefined, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, 64 * 1024 * 1024 + 1]) {
      expect(() => createReleaseCopyMediaLedger([{ ...asset, bytes: bytes as number }], origin)).toThrow()
    }
    expect(() => createReleaseCopyMediaLedger([asset, asset], origin)).toThrow()
  })
  test("a sole aborted initial request can settle its observer but cannot pass admission", async () => {
    const f = fixture(), initial = f.start(); f.ledger.failed(initial.key, "net::ERR_ABORTED"); await initial.done
    expect(initial.finishedCalls()).toBe(0); expect(() => f.ledger.seal()).toThrow("exactly three")
    expect(() => f.ledger.playback(proof)).toThrow()
  })
  test("request identities are object identities and duplicate terminals cannot be repaired", async () => {
    const f = fixture(), first = f.start(); f.ledger.finished(first.key); await first.done
    expect(() => f.ledger.finished({})).toThrow("unknown Request")
    expect(() => f.ledger.seal()).toThrow()
    const g = fixture(), second = g.start(); g.ledger.finished(second.key); await second.done
    expect(() => g.ledger.finished(second.key)).toThrow("duplicate")
    expect(() => g.ledger.seal()).toThrow()
  })
  test("only admitted same-frame GET media with an exact owned URL enter the ledger", () => {
    for (const mutation of [
      { url: `http://127.0.0.1:43210${asset.path}` }, { url: `${origin}${asset.path}?x=1` },
      { url: `${origin}/assets/examples/other.mp4` }, { method: "POST" }, { resourceType: "fetch" }, { ownedFrame: false },
      { range: "bytes=1000-" }, { range: "bytes=1-0" }, { range: "bytes=9007199254740992-" },
      { range: "bytes=00-" }, { range: "bytes=01-99" }, { range: "bytes=0-0999" }, { range: "bytes=-010" },
    ]) {
      const ledger = createReleaseCopyMediaLedger([asset], origin)
      expect(() => ledger.request({}, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true, ...mutation })).toThrow()
      expect(() => ledger.seal()).toThrow()
    }
  })
  test("header totals and lengths derive from the immutable admitted size", async () => {
    for (const response of [
      { status: 200 }, { contentType: "application/octet-stream" }, { contentRange: "bytes 0-1000/1001" },
      { contentRange: "bytes 1-999/1000" }, { contentLength: "999" }, { contentLength: null },
    ]) {
      const f = fixture(), value = f.start("bytes=0-", {}, response)
      await expect(value.done).rejects.toThrow(); expect(value.finishedCalls()).toBe(0); expect(() => f.ledger.seal()).toThrow()
    }
  })
  test("non-abort failures and aborts without validated initial responses are fatal", async () => {
    for (const reason of [null, "net::ERR_FAILED", "net::ERR_CONNECTION_RESET"]) {
      const f = fixture(), value = f.start()
      expect(() => f.ledger.failed(value.key, reason)).toThrow(); await expect(value.done).rejects.toThrow()
    }
    const f = fixture(), key = {}
    f.ledger.request(key, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true })
    expect(() => f.ledger.failed(key, "net::ERR_ABORTED")).toThrow("without response")
  })
  test("unknown and duplicate responses cannot become valid completion evidence", async () => {
    const metadata = { status: 206, contentType: "video/mp4", contentRange: "bytes 0-999/1000", contentLength: "1000" }
    const unknown = fixture()
    await expect(unknown.ledger.response({}, metadata, async () => null)).rejects.toThrow("unknown Request")
    expect(() => unknown.ledger.seal()).toThrow()
    const duplicate = fixture(), initial = duplicate.start()
    await expect(duplicate.ledger.response(initial.key, metadata, async () => null)).rejects.toThrow("Duplicate response")
    expect(() => duplicate.ledger.finished(initial.key)).toThrow()
    await expect(initial.done).rejects.toThrow(); expect(initial.finishedCalls()).toBe(0)
  })
  test("response.finished errors remain fatal after a successful Request terminal", async () => {
    for (const result of [new Error("finished failure"), undefined]) {
      const ledger = createReleaseCopyMediaLedger([asset], origin), key = {}
      ledger.request(key, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true })
      const done = ledger.response(key, { status: 206, contentType: "video/mp4", contentRange: "bytes 0-999/1000", contentLength: "1000" }, async () => result)
      ledger.finished(key); await expect(done).rejects.toThrow(); expect(() => ledger.seal()).toThrow()
    }
    const ledger = createReleaseCopyMediaLedger([asset], origin), key = {}, failure = new Error("transport rejected")
    ledger.request(key, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true })
    const done = ledger.response(key, { status: 206, contentType: "video/mp4", contentRange: "bytes 0-999/1000", contentLength: "1000" }, async () => { throw failure })
    ledger.finished(key); await expect(done).rejects.toBe(failure); expect(() => ledger.assertHealthy()).toThrow("transport rejected")
  })
  test("a tail abort never becomes a second provisional initial request", async () => {
    const f = fixture(), value = f.start("bytes=900-")
    expect(() => f.ledger.failed(value.key, "net::ERR_ABORTED")).toThrow(); await expect(value.done).rejects.toThrow()
  })
  test("resume cannot start before the distinct tail has completed", async () => {
    const f = fixture(), initial = f.start(); f.ledger.failed(initial.key, "net::ERR_ABORTED"); await initial.done
    const tail = f.start("bytes=900-"), resume = f.start("bytes=100-")
    f.ledger.finished(tail.key); await tail.done; f.ledger.finished(resume.key); await resume.done
    f.ledger.playback(proof); expect(() => f.ledger.seal()).toThrow()
  })
  test("a successful extra request is still an unreviewed retry for a recovered asset", async () => {
    const f = fixture(); await f.recover(); const extra = f.start("bytes=100-"); f.ledger.finished(extra.key); await extra.done
    f.ledger.playback(proof); expect(() => f.ledger.seal()).toThrow("exactly three")
  })
  test("one successor cannot recover an abort even with a plausible playback sample", async () => {
    const f = fixture(), initial = f.start(); f.ledger.failed(initial.key, "net::ERR_ABORTED"); await initial.done
    const tail = f.start("bytes=900-"); f.ledger.finished(tail.key); await tail.done
    f.ledger.playback(proof); expect(() => f.ledger.seal()).toThrow("exactly three")
  })
  test("original playback must follow completed resume and prove actual decoded currentSrc", async () => {
    for (const mutation of [
      { currentSrc: "" }, { currentSrc: `${origin}/assets/examples/other.mp4` }, { ownedConnected: false },
      { time: 0 }, { time: .04 }, { readyState: 1 }, { error: 3 },
    ]) {
      const f = fixture(); await f.recover(); f.ledger.playback({ ...proof, ...mutation }); expect(() => f.ledger.seal()).toThrow()
    }
    const early = fixture(); early.ledger.playback(proof); await early.recover(); expect(() => early.ledger.seal()).toThrow()
    const missing = fixture(); await missing.recover(); expect(() => missing.ledger.seal()).toThrow("playback")
  })
  test("unknown, repeated or stale original playback cannot replace the bound proof", async () => {
    const f = fixture(); await f.recover(); f.ledger.playback(proof)
    expect(() => f.ledger.playback(proof)).toThrow("Duplicate"); expect(() => f.ledger.seal()).toThrow()
    expect(() => fixture().ledger.playback({ ...proof, id: "foreign" })).toThrow()
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => fixture().ledger.playback({ ...proof, time })).toThrow()
    }
  })
  test("closing and sealed phases reject later terminals and requests", async () => {
    const f = fixture(), value = f.start(); f.ledger.beginClose()
    expect(() => f.ledger.failed(value.key, "net::ERR_ABORTED")).toThrow("closing"); await expect(value.done).rejects.toThrow()
    const g = await validReceipt()
    expect(() => g.start()).toThrow("sealed"); expect(() => g.ledger.assertHealthy()).toThrow()
  })
  test("nonmedia requests remain owned by the original tracker", () => {
    const ledger = createReleaseCopyMediaLedger([asset], origin)
    expect(ledger.request({}, { url: `${origin}/site.css`, method: "GET", range: null, resourceType: "stylesheet", ownedFrame: true })).toBe(false)
    expect(ledger.seal()).toEqual([])
  })
  test("the explicit request bound is fatal and cannot discard earlier identity evidence", () => {
    const f = fixture()
    for (let index = 0; index < 64; index++) f.ledger.request({}, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true })
    expect(() => f.ledger.request({}, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true })).toThrow("bound")
    expect(() => f.ledger.seal()).toThrow()
  })
  test("wire receipts reject false identities, chronology, range totals, missing proof and extras", async () => {
    const { receipt } = await validReceipt()
    const mutations: ((value: any) => void)[] = [
      value => { value[0].bytes++ }, value => { value[0].sha256 = "b".repeat(64) }, value => { value[0].extra = true },
      value => { value[0].path = [value[0].path] },
      value => { value[0].resume.requestId = value[0].tail.requestId }, value => { value[0].resume.start = 950 },
      value => { [value[0].initial.requestId, value[0].tail.requestId] = [value[0].tail.requestId, value[0].initial.requestId] },
      value => { value[0].resume.requestOrder = value[0].tail.terminalOrder }, value => { value[0].tail.contentLength-- },
      value => { value[0].initial.failure = "net::ERR_FAILED" }, value => { value[0].initial.completedOrder = 2 },
      value => { value[0].playback.currentSrc = "" }, value => { value[0].playback.order = value[0].resume.completedOrder },
      value => { delete value[0].tail }, value => { value.push(structuredClone(value[0])) },
    ]
    for (const mutate of mutations) {
      const value = structuredClone(receipt); mutate(value)
      expect(() => assertReleaseCopyRangeRecoveries(value, [asset], origin, [proof])).toThrow()
    }
    expect(() => assertReleaseCopyRangeRecoveries(receipt, [asset], origin, [{ ...proof, time: .3 }])).toThrow()
    expect(() => assertReleaseCopyRangeRecoveries(receipt, [asset], origin, [])).toThrow()
  })
})

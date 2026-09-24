import { describe, expect, test } from "bun:test"
import { assertReleaseCopyMediaCancellations, createReleaseCopyMediaLedger, type ReleaseCopyMediaBinding,
  type ReleaseCopyPlaybackProof } from "./site-release-copy-media"

const origin = "http://127.0.0.1:43123"
const asset = { id: "premiere-wall", path: "/assets/examples/premiere-wall-0123456789ab.mp4", sha256: "a".repeat(64), bytes: 1000 }
const other = { id: "editorial", path: "/assets/examples/editorial-0123456789ab.mp4", sha256: "b".repeat(64), bytes: 500 }
const sample = (media = asset): ReleaseCopyPlaybackProof => ({ id: media.id, currentSrc: `${origin}${media.path}`,
  ownedConnected: true, time: .2, readyState: 4, error: null })
const proof = sample()
function fixture(media: readonly ReleaseCopyMediaBinding[] = [asset]) {
  const ledger = createReleaseCopyMediaLedger(media, origin)
  const start = (range: string | null = "bytes=0-", options: { target?: ReleaseCopyMediaBinding; first?: number; last?: number;
    metadata?: Record<string, unknown>; response?: Record<string, unknown>; finished?: () => Promise<unknown> } = {}) => {
    const target = options.target ?? media[0]!, key = {}, first = options.first ?? 0, last = options.last ?? target.bytes - 1
    ledger.request(key, { url: `${origin}${target.path}`, method: "GET", range, resourceType: "media", ownedFrame: true, ...options.metadata })
    let finishedCalls = 0
    const done = ledger.response(key, { status: range === null ? 200 : 206, contentType: "video/mp4",
      contentRange: range === null ? null : `bytes ${first}-${last}/${target.bytes}`, contentLength: String(last - first + 1), ...options.response },
    async () => { finishedCalls++; return options.finished ? options.finished() : null })
    return { key, done, finishedCalls: () => finishedCalls }
  }
  const recover = async (cancelResume = false) => {
    const initial = start(); expect(ledger.failed(initial.key, "net::ERR_ABORTED")).toBe(true); await initial.done; expect(initial.finishedCalls()).toBe(0)
    const tail = start("bytes=900-", { first: 900 }); ledger.finished(tail.key); await tail.done
    const resume = start("bytes=100-", { first: 100 })
    if (cancelResume) ledger.failed(resume.key, "net::ERR_ABORTED"); else ledger.finished(resume.key)
    await resume.done
    return { initial, tail, resume }
  }
  return { ledger, start, recover }
}
async function validReceipt() {
  const f = fixture(); await f.recover(); f.ledger.playback(proof); return { ...f, receipt: f.ledger.seal() }
}

describe("release-copy bounded media cancellation and original playback", () => {
  test("only the exact successful Request terminal releases its original finished callback", async () => {
    const f = fixture(), value = f.start()
    await Promise.resolve(); expect(value.finishedCalls()).toBe(0)
    f.ledger.finished(value.key); await value.done; expect(value.finishedCalls()).toBe(1)
    expect(f.ledger.seal()).toEqual([])
  })
  test.each([false, true])("3187728-byte regression shapes retain every transfer with cancelled resume=%s", async cancelResume => {
    const regressionAsset = { ...asset, bytes: 3187728 }, f = fixture([regressionAsset])
    const initial = f.start(); f.ledger.failed(initial.key, "net::ERR_ABORTED"); await initial.done
    const tail = f.start("bytes=3178496-", { first: 3178496 }); f.ledger.finished(tail.key); await tail.done
    const resume = f.start("bytes=1048576-", { first: 1048576 })
    if (cancelResume) f.ledger.failed(resume.key, "net::ERR_ABORTED"); else f.ledger.finished(resume.key)
    await resume.done; f.ledger.playback(sample(regressionAsset)); const receipt = f.ledger.seal()
    expect(receipt).toHaveLength(1); expect(receipt[0]!.requests.map(row => row.range)).toEqual(["bytes=0-", "bytes=3178496-", "bytes=1048576-"])
    expect(receipt[0]!.requests.map(row => row.terminal)).toEqual(["aborted", "finished", cancelResume ? "aborted" : "finished"])
    expect([initial.finishedCalls(), tail.finishedCalls(), resume.finishedCalls()]).toEqual([0, 1, cancelResume ? 0 : 1])
    expect(() => assertReleaseCopyMediaCancellations(receipt, [regressionAsset], origin, [sample(regressionAsset)])).not.toThrow()
  })
  test("completed whole, bounded and suffix requests retain exact immutable byte accounting", async () => {
    for (const [range, first, last] of [[null, 0, 999], ["bytes=10-19", 10, 19], ["bytes=-100", 900, 999]] as const) {
      const f = fixture(), value = f.start(range, { first, last })
      expect(value.finishedCalls()).toBe(0); f.ledger.finished(value.key); await value.done
      expect(value.finishedCalls()).toBe(1); expect(f.ledger.seal()).toEqual([])
    }
  })
  test("a valid partial or non-Range cancellation needs later original decoded playback, not a completed full transfer", async () => {
    for (const [range, first, last] of [[null, 0, 999], ["bytes=10-19", 10, 19], ["bytes=-100", 900, 999], ["bytes=500-", 500, 999]] as const) {
      const f = fixture(), value = f.start(range, { first, last }); f.ledger.failed(value.key, "net::ERR_ABORTED"); await value.done
      f.ledger.playback(proof); const receipt = f.ledger.seal()
      expect(receipt[0]!.requests).toHaveLength(1); expect(receipt[0]!.requests[0]!.range).toBe(range)
      expect(receipt[0]!.requests[0]!.completedOrder).toBeNull(); expect(value.finishedCalls()).toBe(0)
    }
    const missing = fixture(), value = missing.start(); missing.ledger.failed(value.key, "net::ERR_ABORTED"); await value.done
    expect(() => missing.ledger.seal()).toThrow("original playback"); expect(() => missing.ledger.playback(proof)).toThrow()
  })
  test("interleaved same-asset transfers do not require offset or completion ordering", async () => {
    const f = fixture(), first = f.start("bytes=400-499", { first: 400, last: 499 }), second = f.start("bytes=-100", { first: 900 })
    const third = f.start("bytes=10-19", { first: 10, last: 19 })
    f.ledger.failed(second.key, "net::ERR_ABORTED"); await second.done
    f.ledger.finished(third.key); await third.done; f.ledger.finished(first.key); await first.done
    f.ledger.playback(proof); const requests = f.ledger.seal()[0]!.requests
    expect(requests.map(row => row.requestId)).toEqual([1, 2, 3]); expect(requests.map(row => row.start)).toEqual([400, 900, 10])
    expect(requests[0]!.completedOrder!).toBeGreaterThan(requests[2]!.completedOrder!)
  })
  test.each([1, 2, 4, 7, 64])("all%i distinct repeated-range requests remain visible without coalescing", async count => {
    const f = fixture()
    for (let index = 0; index < count; index++) {
      const value = f.start("bytes=100-199", { first: 100, last: 199 })
      if (index % 2 === 0) f.ledger.failed(value.key, "net::ERR_ABORTED"); else f.ledger.finished(value.key)
      await value.done
    }
    f.ledger.playback(proof); const receipt = f.ledger.seal()
    expect(receipt[0]!.requests).toHaveLength(count)
    expect(receipt[0]!.requests.map(row => row.requestId)).toEqual(Array.from({ length: count }, (_, i) => i + 1))
    expect(receipt[0]!.requests.filter(row => row.terminal === "aborted")).toHaveLength(Math.ceil(count / 2))
  })
  test("generated legal transfers round-trip every attempt and cancellation through strict wire parsing", async () => {
    // Match the app's dependency-free seeded law tests. Retain seed and complete
    // case input on failure; this bounded generator does not perform shrinking.
    const initialSeed = 20260924
    let seed = initialSeed
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x1_0000_0000 }
    const integer = (minimum: number, maximum: number) => minimum + Math.floor(random() * (maximum - minimum + 1))
    for (let iteration = 0; iteration < 100; iteration++) {
      const caseSeed = seed, bytes = iteration === 0 ? 1 : iteration === 1 ? 64 * 1024 * 1024 : integer(1, 64 * 1024 * 1024)
      const attempts = Array.from({ length: integer(1, 12) }, (_, index) => {
        const kind = integer(0, 3), first = integer(0, bytes - 1), last = integer(first, bytes - 1), length = integer(1, bytes)
        const range = kind === 0 ? { range: null, first: 0, last: bytes - 1 }
          : kind === 1 ? { range: `bytes=${first}-`, first, last: bytes - 1 }
          : kind === 2 ? { range: `bytes=${first}-${last}`, first, last }
          : { range: `bytes=-${length}`, first: bytes - length, last: bytes - 1 }
        return { range, index, cancel: index === 0 || random() < .5, priority: integer(0, 15) }
      })
      try {
        const generated = { ...asset, bytes }, f = fixture([generated])
        // Start all transfers before terminals, then vary terminal order. Each
        // generated range has independent explicit expected byte endpoints.
        const pending = attempts.map(({ range }) => f.start(range.range, { first: range.first, last: range.last }))
        for (const attempt of [...attempts].sort((a, b) => a.priority - b.priority || a.index - b.index)) {
          const value = pending[attempt.index]!
          if (attempt.cancel) f.ledger.failed(value.key, "net::ERR_ABORTED"); else f.ledger.finished(value.key)
          await value.done
        }
        f.ledger.playback(sample(generated)); const receipt = f.ledger.seal()
        expect(() => assertReleaseCopyMediaCancellations(structuredClone(receipt), [generated], origin, [sample(generated)])).not.toThrow()
        expect(receipt).toHaveLength(1)
        expect(receipt[0]!.requests.map(row => row.requestId)).toEqual(attempts.map(row => row.index + 1))
        expect(receipt[0]!.requests.map(row => [row.range, row.start, row.end])).toEqual(attempts.map(({ range }) => [range.range, range.first, range.last]))
        expect(receipt[0]!.requests.filter(row => row.terminal === "aborted").map(row => row.requestId))
          .toEqual(attempts.filter(row => row.cancel).map(row => row.index + 1))
        expect(pending.map(value => value.finishedCalls())).toEqual(attempts.map(row => row.cancel ? 0 : 1))
      } catch (cause) {
        throw new Error(`Transfer property failed: ${JSON.stringify({ initialSeed, iteration, caseSeed, bytes, attempts })}`, { cause })
      }
    }
  })
  test("multiple cancelled assets retain all their own interleaved attempts and consume each cancellation once", async () => {
    const f = fixture([asset, other]), first = f.start(), second = f.start("bytes=0-", { target: other })
    const third = f.start("bytes=100-", { first: 100 }), fourth = f.start("bytes=100-", { target: other, first: 100 })
    f.ledger.failed(second.key, "net::ERR_ABORTED"); await second.done; f.ledger.finished(fourth.key); await fourth.done
    f.ledger.playback(sample(other)); f.ledger.failed(first.key, "net::ERR_ABORTED"); await first.done
    f.ledger.finished(third.key); await third.done; f.ledger.playback(proof)
    const receipt = f.ledger.seal()
    expect(receipt.map(row => [row.id, row.requests.map(request => request.requestId)])).toEqual([[asset.id, [1, 3]], [other.id, [2, 4]]])
    expect(() => assertReleaseCopyMediaCancellations(receipt, [asset, other], origin, [proof, sample(other)])).not.toThrow()
    const swapped = structuredClone(receipt) as any; [swapped[0].playback, swapped[1].playback] = [swapped[1].playback, swapped[0].playback]
    expect(() => assertReleaseCopyMediaCancellations(swapped, [asset, other], origin, [proof, sample(other)])).toThrow()
  })
  test("immutable media bindings reject missing, unsafe and unbounded lengths", () => {
    for (const bytes of [undefined, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, 64 * 1024 * 1024 + 1]) {
      expect(() => createReleaseCopyMediaLedger([{ ...asset, bytes: bytes as number }], origin)).toThrow()
    }
    expect(() => createReleaseCopyMediaLedger([asset, asset], origin)).toThrow()
  })
  test("request identities are object identities and duplicate requests or terminals cannot be repaired", async () => {
    const f = fixture(), first = f.start(); f.ledger.finished(first.key); await first.done
    expect(() => f.ledger.finished({})).toThrow("unknown Request"); expect(() => f.ledger.seal()).toThrow()
    const g = fixture(), second = g.start(); g.ledger.finished(second.key); await second.done
    expect(() => g.ledger.finished(second.key)).toThrow("duplicate"); expect(() => g.ledger.seal()).toThrow()
    const h = fixture(), third = h.start(); h.ledger.finished(third.key); await third.done
    expect(() => h.ledger.request(third.key, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true })).toThrow("Duplicate Request")
    expect(() => h.ledger.seal()).toThrow()
  })
  test("only admitted same-frame GET media with an exact owned URL enter the ledger", () => {
    for (const metadata of [
      { url: `http://127.0.0.1:43210${asset.path}` }, { url: `${origin}${asset.path}?x=1` }, { url: `${origin}${asset.path}#x` },
      { url: `${origin}/assets/examples/other.mp4` }, { method: "POST" }, { resourceType: "fetch" }, { ownedFrame: false },
      { range: "bytes=1000-" }, { range: "bytes=1-0" }, { range: "bytes=9007199254740992-" },
      { range: "bytes=00-" }, { range: "bytes=01-99" }, { range: "bytes=0-0999" }, { range: "bytes=-010" }, { range: "bytes=-0" },
      { range: "bytes=1-2,4-5" }, { range: ["bytes=0-"] }, { range: "x".repeat(65) },
    ]) {
      const ledger = createReleaseCopyMediaLedger([asset], origin)
      expect(() => ledger.request({}, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true, ...metadata } as any)).toThrow()
      expect(() => ledger.seal()).toThrow()
    }
  })
  test("header totals and lengths derive from the immutable admitted size", async () => {
    for (const response of [
      { status: 200 }, { contentType: "application/octet-stream" }, { contentRange: "bytes 0-1000/1001" },
      { contentRange: "bytes 1-999/1000" }, { contentRange: null }, { contentLength: "999" }, { contentLength: null }, { contentLength: "01000" },
    ]) {
      const f = fixture(), value = f.start("bytes=0-", { response })
      await expect(value.done).rejects.toThrow(); expect(value.finishedCalls()).toBe(0); expect(() => f.ledger.seal()).toThrow()
    }
    const f = fixture(), value = f.start(null, { response: { status: 206 } }); await expect(value.done).rejects.toThrow()
  })
  test("non-abort failures and terminal events without validated responses are fatal", async () => {
    for (const reason of [null, "net::ERR_FAILED", "net::ERR_CONNECTION_RESET"]) {
      const f = fixture(), value = f.start()
      expect(() => f.ledger.failed(value.key, reason)).toThrow(); await expect(value.done).rejects.toThrow()
    }
    for (const terminal of ["finished", "failed"] as const) {
      const ledger = createReleaseCopyMediaLedger([asset], origin), key = {}
      ledger.request(key, { url: `${origin}${asset.path}`, method: "GET", range: "bytes=0-", resourceType: "media", ownedFrame: true })
      expect(() => terminal === "finished" ? ledger.finished(key) : ledger.failed(key, "net::ERR_ABORTED")).toThrow("without response")
    }
  })
  test("unknown and duplicate responses cannot become valid completion evidence", async () => {
    const metadata = { status: 206, contentType: "video/mp4", contentRange: "bytes 0-999/1000", contentLength: "1000" }
    const unknown = fixture(); await expect(unknown.ledger.response({}, metadata, async () => null)).rejects.toThrow("unknown Request")
    expect(() => unknown.ledger.seal()).toThrow()
    const duplicate = fixture(), initial = duplicate.start()
    await expect(duplicate.ledger.response(initial.key, metadata, async () => null)).rejects.toThrow("Duplicate response")
    expect(() => duplicate.ledger.finished(initial.key)).toThrow(); await expect(initial.done).rejects.toThrow(); expect(initial.finishedCalls()).toBe(0)
  })
  test("response.finished errors remain fatal after a successful Request terminal", async () => {
    for (const result of [new Error("finished failure"), undefined]) {
      const f = fixture(), value = f.start("bytes=0-", { finished: async () => result })
      f.ledger.finished(value.key); await expect(value.done).rejects.toThrow(); expect(() => f.ledger.seal()).toThrow()
    }
    const f = fixture(), failure = new Error("transport rejected"), value = f.start("bytes=0-", { finished: async () => { throw failure } })
    f.ledger.finished(value.key); await expect(value.done).rejects.toBe(failure); expect(() => f.ledger.assertHealthy()).toThrow("transport rejected")
  })
  test("unsettled requests and response.finished promises cannot pass seal or be repaired afterward", async () => {
    const f = fixture(), unfinished = f.start(); expect(() => f.ledger.seal()).toThrow("Unsettled media Request")
    expect(() => f.ledger.finished(unfinished.key)).toThrow(); await expect(unfinished.done).rejects.toThrow()
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve }), g = fixture(), pending = g.start("bytes=0-", { finished: async () => { await gate; return null } })
    g.ledger.finished(pending.key); await Promise.resolve(); expect(pending.finishedCalls()).toBe(1)
    expect(() => g.ledger.seal()).toThrow("Unsettled response.finished")
    finish(); await expect(pending.done).rejects.toThrow(); expect(() => g.ledger.assertHealthy()).toThrow()
  })
  test("original playback must follow every same-asset terminal and completion", async () => {
    const f = fixture(), first = f.start(); f.ledger.failed(first.key, "net::ERR_ABORTED"); await first.done
    const resume = f.start("bytes=100-", { first: 100 }); f.ledger.playback(proof)
    f.ledger.failed(resume.key, "net::ERR_ABORTED"); await resume.done; expect(() => f.ledger.seal()).toThrow()
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve }), g = fixture(); await g.recover(true)
    const late = g.start("bytes=200-", { first: 200, finished: async () => { await gate; return null } })
    g.ledger.finished(late.key); await Promise.resolve(); g.ledger.playback(proof)
    finish(); await late.done; expect(() => g.ledger.seal()).toThrow()
  })
  test("original sample proves decoded owned currentSrc and accumulated playback, not metadata or a different asset", async () => {
    for (const mutation of [{ currentSrc: "" }, { currentSrc: `${origin}${other.path}` }, { ownedConnected: false },
      { time: 0 }, { time: .04 }, { readyState: 1 }, { error: 3 }]) {
      const f = fixture(); await f.recover(true); f.ledger.playback({ ...proof, ...mutation }); expect(() => f.ledger.seal()).toThrow()
    }
    const early = fixture(); early.ledger.playback(proof); await early.recover(true); expect(() => early.ledger.seal()).toThrow()
    const wrong = fixture([asset, other]); await wrong.recover(true); wrong.ledger.playback(sample(other)); expect(() => wrong.ledger.seal()).toThrow("original playback")
  })
  test("unknown, repeated or nonfinite samples cannot replace the original proof", async () => {
    const f = fixture(); await f.recover(); f.ledger.playback(proof)
    expect(() => f.ledger.playback(proof)).toThrow("Duplicate"); expect(() => f.ledger.seal()).toThrow()
    expect(() => fixture().ledger.playback({ ...proof, id: "foreign" })).toThrow()
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(() => fixture().ledger.playback({ ...proof, time })).toThrow()
  })
  test("closing and sealed phases reject later requests, responses, samples and cleanup-induced terminals", async () => {
    const f = fixture(), value = f.start(); f.ledger.beginClose()
    expect(() => f.ledger.failed(value.key, "net::ERR_ABORTED")).toThrow("closing"); await expect(value.done).rejects.toThrow()
    for (const close of [false, true]) {
      const request = await validReceipt(); if (close) request.ledger.beginClose()
      expect(() => request.start()).toThrow(); expect(() => request.ledger.assertHealthy()).toThrow()
      const playback = await validReceipt(); if (close) playback.ledger.beginClose()
      expect(() => playback.ledger.playback(proof)).toThrow(); expect(() => playback.ledger.assertHealthy()).toThrow()
      const response = await validReceipt(); if (close) response.ledger.beginClose()
      await expect(response.ledger.response({}, { status: 206, contentType: "video/mp4", contentRange: "bytes 0-999/1000", contentLength: "1000" }, async () => null)).rejects.toThrow()
      const terminal = await validReceipt(); if (close) terminal.ledger.beginClose()
      expect(() => terminal.ledger.finished({})).toThrow(); expect(() => terminal.ledger.assertHealthy()).toThrow()
    }
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
  test("wire inventories reject false identity, malformed ranges, replayed chronology, stale proof and structural omissions", async () => {
    const { receipt } = await validReceipt()
    const mutations: ((value: any) => void)[] = [
      value => { value[0].bytes++ }, value => { value[0].sha256 = "b".repeat(64) }, value => { value[0].extra = true }, value => { value[0].path = [value[0].path] },
      value => { value[0].requests[2].requestId = value[0].requests[1].requestId }, value => { value[0].requests[2].start = 950 },
      value => { [value[0].requests[0].requestId, value[0].requests[1].requestId] = [value[0].requests[1].requestId, value[0].requests[0].requestId] },
      value => { value[0].requests[2].requestOrder = value[0].requests[1].terminalOrder }, value => { value[0].requests[1].contentLength-- },
      value => { value[0].requests[0].failure = "net::ERR_FAILED" }, value => { value[0].requests[0].completedOrder = 2 },
      value => { value[0].requests[1].completedOrder = null }, value => { value[0].requests[1].contentType = "video/webm" },
      value => { value[0].requests[1].range = [value[0].requests[1].range] }, value => { value[0].requests[1].range = "bytes=0900-" },
      value => { value[0].requests[1].status = 200 }, value => { value[0].requests[1].contentRange = "bytes 900-999/1001" },
      value => { value[0].requests[1].requestId = 65 }, value => { value[0].requests[1].terminalOrder = 513 },
      value => { value[0].playback.currentSrc = "" }, value => { value[0].playback.order = value[0].requests[2].completedOrder },
      value => { value[0].requests.reverse() }, value => { value[0].requests.shift() }, value => { value[0].requests = [] },
      value => { delete value[0].requests[1].terminalOrder }, value => { value[0].requests.push(structuredClone(value[0].requests[0])) },
      value => { value.push(structuredClone(value[0])) }, value => { value[0].requests = Array(65).fill(value[0].requests[0]) },
    ]
    for (const mutate of mutations) {
      const value = structuredClone(receipt); mutate(value)
      expect(() => assertReleaseCopyMediaCancellations(value, [asset], origin, [proof])).toThrow()
    }
    expect(() => assertReleaseCopyMediaCancellations(receipt, [asset], origin, [{ ...proof, time: .3 }])).toThrow()
    expect(() => assertReleaseCopyMediaCancellations(receipt, [asset], origin, [])).toThrow()
    expect(() => assertReleaseCopyMediaCancellations(receipt, [asset], origin, [proof, proof])).toThrow()
    // The receiver did not observe traffic: it cannot authenticate deletion of
    // a completed row if all corresponding wire fields are forged coherently.
    // Full traffic inventory is guaranteed and tested at live ledger seal.
  })
})

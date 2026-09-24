import { expect, test } from "bun:test"
import { packPortfolioRender } from "./site-portfolio-reference-codec"
import { parsePortfolioRequest, portfolioProbeRequest, parsePortfolioPhase, parsePortfolioCaseFailure, portfolioCaseFailure,
  parsePortfolioRenderReference, assertPortfolioReference, portfolioReferenceDigest, portfolioHeadingSize, normalizePortfolioRender,
  portfolioScope, portfolioBaselineProfile, portfolioBaselineRevision, portfolioBaselineTree, portfolioPalette,
  portfolioDeadlineMs, portfolioOrdinaryDeadlineMs, portfolioCaseNames, portfolioNegativeControls,
  type PortfolioRequest, type PortfolioRenderReference } from "./site-portfolio-browser-contract"
import { examplesScope, examplesBaselineProfile, examplesCaseNames, examplesNegativeControls, examplesDocsCases,
  examplesDocsExtraCases, parseExamplesRequest, parseExamplesPhase } from "./site-examples-browser-contract"
import { siteShellCases } from "./site-shell-browser-contract"
import { siteCopyCases } from "./site-copy-browser-contract"
import { refinementInstallCommand } from "./site-refinement-profile"
import * as historicalPortfolio from "./site-portfolio-profile-v1"

const hash = "a".repeat(64)
const media = [
  { id: "editorial", path: "/assets/examples/editorial-aaaaaaaaaaaa.mp4", sha256: hash,
    poster: "/assets/examples/editorial-aaaaaaaaaaaa.webp", guide: "/docs/tutorials/first-animation",
    width: 1280, height: 720, durationSeconds: 8, hasAudio: false },
  { id: "native-product", path: "/assets/examples/native-product-bbbbbbbbbbbb.mp4", sha256: "b".repeat(64),
    poster: "/assets/examples/native-product-bbbbbbbbbbbb.webp", guide: "/docs/how-to/native-films",
    width: 1280, height: 720, durationSeconds: 8, hasAudio: false },
]
const resources = [...new Set(["/", "/404.html", "/docs", "/docs/tutorials/first-diagram", "/docs/tutorials/first-animation",
  "/docs/how-to/render-motion-graphics", "/docs/how-to/vectorize-images", "/docs/reference/capabilities",
  "/docs/how-to/native-films", "/docs/how-to/parametric-design", "/docs/how-to/edit-video",
  "/graphs/site-foundation/style.css", `/assets/site-${hash}.css`, ...media.flatMap(item => [item.path, item.poster]),
  ...Array.from({ length: 10 }, (_, index) => `/fonts/font-${index}.woff2`)])].sort()
const payload = (port: number) => ({ origin: `http://127.0.0.1:${port}`, resources,
  stylesheets: ["/graphs/site-foundation/style.css", `/assets/site-${hash}.css`], finalCss: `/assets/site-${hash}.css` })
function request(): PortfolioRequest {
  return parsePortfolioRequest({ schemaVersion: 1, token: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", scope: portfolioScope,
    baselineProfile: portfolioBaselineProfile, appDirectory: "/tmp/app", chromeExecutable: "/tmp/chrome",
    endpoint: "ws://127.0.0.1:3211/devtools/browser/aaaaaaaa", current: payload(3212), baseline: payload(3213), media })
}
const ports = () => ({ write: "success", fallback: "throw", writes: Array.from({ length: 5 }, () => refinementInstallCommand),
  fallbacks: Array.from({ length: 3 }, () => ({ value: refinementInstallCommand, readonly: true, start: 0,
    end: refinementInstallCommand.length, focused: true, offscreen: true })),
  timers: [{ delay: 2500, started: 1, fired: 2501, cancelled: false }, { delay: 2500, started: 1, fired: null, cancelled: true },
    { delay: 2500, started: 1, fired: null, cancelled: false }] })
function terminal(input = request()) {
  const observations = portfolioCaseNames.map((name, index) => {
    if (index < siteShellCases.length) return { name, passed: true, currentObstructions: [], baselineObstructions: [] }
    if (index < siteShellCases.length + siteCopyCases.length)
      return { name, passed: true, command: refinementInstallCommand, current: ports(), baseline: ports() }
    if (!name.startsWith("player-")) {
      const scenario = [...examplesDocsCases, ...examplesDocsExtraCases].find(item => item.name === name)!
      return { name, passed: true, figures: name.includes("parametric-design") ? 5 : name.includes("/edit-video-") ? 7 : 2,
        videos: name.includes("first-animation") ? 2 : name.includes("/edit-video-") ? 7 : 0, shellPaired: true,
        navigation: { mode: scenario.width <= 768 ? "disclosure" : "sidebar", javascript: !("javascript" in scenario && scenario.javascript === false),
          currentHref: scenario.route, defaultClosed: true, keyboardToggle: scenario.width <= 768 ? "enter-open-space-close" : "not-applicable",
          closedLinksHidden: true, articleBeforeFold: true } }
    }
    if (name === "player-captions") return { name, passed: true, captions: "not-present", media: [], initialMediaRequests: 0 }
    return { name, passed: true, media: [{ id: "editorial", paused: !["player-visible-auto", "player-offscreen-hidden"].includes(name),
      time: name === "player-failed-media" ? 0 : 1, controls: true, readyState: 3, muted: true, error: null,
      source: `${input.current.origin}${media[0]!.path}` }],
      ...(name === "player-save-data" ? { policyInput: "emulated-navigator-save-data" } : {}),
      ...(["player-offscreen-hidden", "player-manual-pause"].includes(name) ? { hiddenObserved: true } : {}),
      ...(["player-no-js", "player-docs-manual", "player-reduced-motion", "player-save-data", "player-failed-media"].includes(name) ? { initialMediaRequests: 0 } : {}),
      ...(name === "player-failed-media" ? { failedRequests: 1, sourceError: { id: "editorial", source: `${input.current.origin}${media[0]!.path}`, count: 1, owned: true } } : {}) }
  })
  return { schemaVersion: 1, token: input.token, scope: portfolioScope, baselineProfile: portfolioBaselineProfile,
    sequence: 2, kind: "result", node: "24.18.1", playwright: "1.62.0", browser: "151.0.0.0", closed: true,
    cases: [...portfolioCaseNames], negativeControls: [...portfolioNegativeControls], observations }
}
function reference(): PortfolioRenderReference {
  return { schemaVersion: 1, scope: portfolioScope, baselineRevision: portfolioBaselineRevision,
    designKitRevision: "b".repeat(40), reviewedBy: "Independent design review",
    cases: Object.fromEntries(portfolioCaseNames.map(name => [name, name.startsWith("player-") ? null : packPortfolioRender({ sample: name })])) }
}

test("portfolio has an independent immutable profile and retains the complete existing case inventory", () => {
  expect(portfolioScope).toBe("portfolio-surfaces-v2")
  expect(portfolioBaselineProfile).toBe("before-portfolio-surfaces-a742b29-v2")
  expect(portfolioBaselineRevision).toBe("a742b29bb9414382843614a82cdb8c8e7c218aff")
  expect(portfolioBaselineTree).toBe("11e1eac14c63e947cd52c2f121a60fa458dcc1e5")
  expect(portfolioDeadlineMs).toBe(1_200_000); expect(portfolioOrdinaryDeadlineMs).toBe(720_000)
  expect(siteShellCases).toHaveLength(76)
  expect(portfolioCaseNames).toEqual(examplesCaseNames)
  expect(new Set(portfolioCaseNames).size).toBe(portfolioCaseNames.length)
  expect(portfolioNegativeControls).toEqual(examplesNegativeControls.map(name => name === "/-examples-css" ? "/-foundation-css" : name))
})

test("the earlier portfolio identity is retained and cannot qualify the current content", () => {
  expect(historicalPortfolio.portfolioScope).toBe("portfolio-surfaces-v1")
  expect(historicalPortfolio.portfolioBaselineProfile).toBe("before-portfolio-surfaces-72a0f21-v1")
  expect(historicalPortfolio.portfolioBaselineRevision).toBe("72a0f217412d675528a1544ec6c8daf21e32d9be")
  expect(historicalPortfolio.portfolioBaselineTree).toBe("9acaea0e9822665955565d1588fe5197de28e8d0")
  expect(portfolioCaseNames).toHaveLength(133)
  expect(() => parsePortfolioRequest({ ...request(), scope: historicalPortfolio.portfolioScope })).toThrow()
  expect(() => parsePortfolioRequest({ ...request(), baselineProfile: historicalPortfolio.portfolioBaselineProfile })).toThrow()
  expect(() => parsePortfolioRenderReference({ ...reference(), baselineRevision: historicalPortfolio.portfolioBaselineRevision })).toThrow()
  expect(() => parsePortfolioRenderReference({ ...reference(), scope: historicalPortfolio.portfolioScope })).toThrow()
})

test("portfolio request preserves closed transport validation and cannot impersonate historical examples", () => {
  const input = request(), before = structuredClone(input), probe = portfolioProbeRequest(input)
  expect(parseExamplesRequest(probe)).toEqual({ ...input, scope: examplesScope, baselineProfile: examplesBaselineProfile })
  expect(input).toEqual(before); expect(probe).not.toBe(input)
  expect(() => parseExamplesRequest(input)).toThrow()
  for (const patch of [{ scope: examplesScope }, { baselineProfile: examplesBaselineProfile }, { schemaVersion: 2 },
    { baseline: input.current }, { accepted: true }, { reference: "/tmp/unchecked.json" },
    { endpoint: "ws://example.com/devtools/browser/a" }, { media: [] },
    { current: { ...input.current, resources: [...input.current.resources, "https://remote.example/a.css"] } }])
    expect(() => parsePortfolioRequest({ ...input, ...patch })).toThrow()
})

test("portfolio phases require new identity, complete observations and the foundation restoration control", () => {
  const input = request(), result = terminal(input), before = structuredClone(result)
  expect(parsePortfolioPhase(result, 2, input)).toEqual(result); expect(result).toEqual(before)
  expect(() => parseExamplesPhase(result, 2, portfolioProbeRequest(input))).toThrow()
  for (const sequence of [0, 1] as const) {
    const value = { schemaVersion: 1, token: input.token, scope: portfolioScope, baselineProfile: portfolioBaselineProfile,
      sequence, kind: sequence === 0 ? "started" : "connected", ...(sequence === 0 ? { node: "24.18.1", playwright: "1.62.0" } : {}) }
    expect(parsePortfolioPhase(value, sequence, input)).toEqual(value)
    expect(() => parsePortfolioPhase({ ...value, token: "wrong" }, sequence, input)).toThrow()
  }
  for (const patch of [{ scope: examplesScope }, { baselineProfile: examplesBaselineProfile }, { closed: false },
    { cases: result.cases.slice(1) }, { cases: [...result.cases].reverse() }, { observations: [] },
    { negativeControls: examplesNegativeControls }, { negativeControls: result.negativeControls.filter(name => name !== "/-foundation-css") },
    { accepted: true }, { token: "wrong" }, { playwright: "1.61.0" },
    { observations: result.observations.map((item, index) => index === 0 ? { ...item, passed: false } : item) }])
    expect(() => parsePortfolioPhase({ ...result, ...patch }, 2, input)).toThrow()
})

test("portfolio failures retain new identity and exactly the completed case prefix", () => {
  const input = request(), prefix = portfolioCaseNames.slice(0, 3)
  const failure = portfolioCaseFailure(input, portfolioCaseNames[3]!, "comparison", prefix, new Error("Unreviewed paint"))
  expect(parsePortfolioCaseFailure(failure, input)).toEqual(failure)
  expect(failure.scope).toBe(portfolioScope); expect(failure.accepted).toBe(false)
  for (const patch of [{ scope: examplesScope }, { accepted: true }, { completed: true }, { token: "wrong" },
    { comparedCases: [...prefix].reverse() }, { scenario: portfolioCaseNames[4] }])
    expect(() => parsePortfolioCaseFailure({ ...failure, ...patch }, input)).toThrow()
  expect(() => parsePortfolioPhase(failure, 2, input)).toThrow()
})

test("reviewed reference requires its closed schema, exact predecessor and a real review marker", () => {
  const value = reference()
  expect(parsePortfolioRenderReference(value)).toEqual(value)
  for (const patch of [{ schemaVersion: 2 }, { scope: examplesScope }, { baselineRevision: "c".repeat(40) },
    { designKitRevision: "b".repeat(39) }, { designKitRevision: "B".repeat(40) }, { captured: true },
    { reviewedBy: "" }, { reviewedBy: "  " }, { reviewedBy: "ab" }, { reviewedBy: "x".repeat(161) },
    { reviewedBy: null }, { reviewedBy: "UNREVIEWED" }, { reviewedBy: "unreviewed" },
    { reviewedBy: "pending" }, { reviewedBy: "CAPTURE" }])
    expect(() => parsePortfolioRenderReference({ ...value, ...patch })).toThrow()
})

test("render reference rejects missing/extra cases and distinguishes visual samples from player sentinels", () => {
  const value = reference(), first = portfolioCaseNames[0]!, player = portfolioCaseNames.find(name => name.startsWith("player-"))!
  const missing = { ...value.cases }; delete missing[first]
  for (const cases of [missing, { ...value.cases, unreviewed: {} }, [], null])
    expect(() => parsePortfolioRenderReference({ ...value, cases })).toThrow()
  for (const sample of [null, undefined, [], "sample", 42])
    expect(() => parsePortfolioRenderReference({ ...value, cases: { ...value.cases, [first]: sample } })).toThrow()
  for (const sample of [{}, undefined, [], false])
    expect(() => parsePortfolioRenderReference({ ...value, cases: { ...value.cases, [player]: sample } })).toThrow()
})

test("exact reference comparison and digest bind visual data and review identity", () => {
  const value = parsePortfolioRenderReference(reference()), first = portfolioCaseNames[0]!
  expect(() => assertPortfolioReference({ sample: first }, value, first)).not.toThrow()
  expect(() => assertPortfolioReference({ sample: first, changed: true }, value, first)).toThrow()
  expect(() => assertPortfolioReference({ sample: first }, value, "unknown-case")).toThrow()
  const digest = portfolioReferenceDigest(value)
  expect(digest).toMatch(/^[a-f0-9]{64}$/u)
  expect(portfolioReferenceDigest(structuredClone(value))).toBe(digest)
  expect(portfolioReferenceDigest({ ...value, reviewedBy: "Another reviewer" })).not.toBe(digest)
  expect(portfolioReferenceDigest({ ...value, cases: { ...value.cases, [first]: packPortfolioRender({ sample: "changed" }) } })).not.toBe(digest)
})

test("Catppuccin roles remain literal independent expectations with responsive heading bounds", () => {
  expect(portfolioPalette.light).toEqual({ background: "#eff1f5", foreground: "#3a3c50", muted: "#545768", primary: "#1750bf",
    primaryForeground: "#eff1f5", info: "#0f6065", surface: "#e6e9ef" })
  expect(portfolioPalette.dark).toEqual({ background: "#1e1e2e", foreground: "#dbe1f7", muted: "#b2b8cf", primary: "#92bafa",
    primaryForeground: "#1e1e2e", info: "#89dceb", surface: "#181825" })
  for (const [width, h1, h2] of [[320, 48, 34], [390, 49.98, 34], [768, 65.856, 43.168], [1440, 88, 56], [2560, 88, 56]]) {
    expect(portfolioHeadingSize(width!, 1)).toBeCloseTo(h1!, 5)
    expect(portfolioHeadingSize(width!, 2)).toBeCloseTo(h2!, 5)
  }
})

test("render normalization admits only exact bound local resources and keeps all values and source objects intact", () => {
  const input = request(), path = media[0]!.poster
  const value = { rect: [1, 2.125, 300, 90], visible: true, empty: null,
    samples: [{ image: `url("${input.current.origin}${path}"), linear-gradient(red, blue)` },
      { image: `url('${input.baseline.origin}${path}')` }], source: `${input.current.origin}${media[0]!.path}` }
  const before = structuredClone(value)
  expect(normalizePortfolioRender(value, [input.current, input.baseline])).toEqual({
    rect: value.rect, visible: true, empty: null,
    samples: [{ image: `url("https://portfolio-reference.invalid${path}"), linear-gradient(red, blue)` },
      { image: `url("https://portfolio-reference.invalid${path}")` }],
    source: `https://portfolio-reference.invalid${media[0]!.path}`,
  })
  expect(value).toEqual(before)
})

test("render normalization projects only the two admitted stylesheet identities", () => {
  const input = request()
  expect(normalizePortfolioRender({ foundation: `${input.current.origin}${input.current.stylesheets[0]}`,
    compiled: `${input.baseline.origin}${input.baseline.finalCss}` }, [input.current, input.baseline])).toEqual({
    foundation: "https://portfolio-reference.invalid/__foundation.css", compiled: "https://portfolio-reference.invalid/__compiled.css",
  })
  const differentPort = { ...input.current, origin: "http://127.0.0.1:4321" }
  expect(normalizePortfolioRender(`url(${differentPort.origin}${media[0]!.poster})`, [differentPort]))
    .toBe(normalizePortfolioRender(`url(${input.current.origin}${media[0]!.poster})`, [input.current]))
})

test("render normalization rejects foreign CSS origins, unbound paths, queries and fragments", () => {
  const input = request(), path = media[0]!.poster
  for (const url of [`https://foreign.example${path}`, `http://127.0.0.1:65530${path}`,
    `${input.current.origin}/assets/not-admitted.svg`, `${input.current.origin}${path}?cache=1`, `${input.current.origin}${path}#fragment`])
    expect(() => normalizePortfolioRender({ image: `url("${url}")` }, [input.current, input.baseline])).toThrow("Unadmitted resource")
  for (const url of [`http://127.0.0.1:65530${path}`, `${input.current.origin}/unbound`,
    `${input.current.origin}${path}?cache=1`, `${input.current.origin}${path}#fragment`])
    expect(() => normalizePortfolioRender({ source: url }, [input.current, input.baseline])).toThrow("Unadmitted resource")
})

test("render normalization preserves ordinary external semantic destinations and literal copy", () => {
  const input = request()
  const value = { semantics: { href: "https://github.com/hraness/slopcamera?tab=readme#install", target: "_blank",
    support: "https://account.hraness.com/support?product=slopcamera&source=web#support", mail: "mailto:team@example.com" },
    dom: '<a href="https://github.com/hraness/slopcamera">Source</a>', text: "Keep local creative work portable.",
    links: ["/docs/how-to/edit-video", "#install"] }
  expect(normalizePortfolioRender(value, [input.current, input.baseline])).toEqual(value)
})

test("render normalization preserves exact numbers and refuses silently discarded values", () => {
  expect(Object.is((normalizePortfolioRender({ coordinate: -0 }, []) as { coordinate: number }).coordinate, -0)).toBe(true)
  expect(() => normalizePortfolioRender({ missing: undefined }, [])).toThrow()
})

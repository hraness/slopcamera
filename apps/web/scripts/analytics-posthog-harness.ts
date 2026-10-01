// Child-process harness for the observability standard's test contract: loads
// the pinned posthog-js bundle under a minimal browser shape, initializes it
// with the production options and before_send, emits every allowed event
// (provider and custom) from several page locations, and reports what
// before_send received and returned plus the decoded request bodies. It runs
// in its own process so the browser globals never leak into other tests.
export {}

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
const listeners = { addEventListener() {}, removeEventListener() {} }
const pageDocument = {
  ...listeners,
  body: null,
  cookie: "",
  // posthog-js parses URLs through an anchor element.
  createElement: (tag: string) => tag === "a" ? anchor() : ({ ...listeners, setAttribute() {}, style: {} }),
  documentElement: { dataset: {} as Record<string, string> },
  getElementsByTagName: () => [],
  location: new URL("https://slopcamera.com/"),
  querySelector: () => null,
  querySelectorAll: () => [],
  readyState: "complete",
  referrer: "",
  title: "Slopcamera",
  visibilityState: "visible",
}
function anchor(): { href: string } {
  let parsed = new URL("https://slopcamera.com/")
  return new Proxy({} as { href: string }, {
    get: (_target, key) => key === "href" ? parsed.href : (parsed as unknown as Record<string | symbol, unknown>)[key],
    set: (_target, key, value) => {
      if (key === "href") parsed = new URL(String(value), pageDocument.location.href)
      return true
    },
  })
}
const sent: unknown[] = [] // request bodies handed to fetch
Object.assign(globalThis, {
  document: pageDocument,
  location: pageDocument.location,
  navigator: { doNotTrack: null, language: "en-US", languages: ["en-US"], onLine: true, userAgent, webdriver: false },
  screen: { height: 900, width: 1440 },
  window: globalThis,
  fetch: async (_url: string, init: { body?: unknown }) => {
    sent.push(init.body)
    return new Response('{"status":1}', { status: 200 })
  },
})
Object.assign(globalThis, { innerHeight: 900, innerWidth: 1440, ...listeners })

const { default: posthog } = await import("posthog-js/dist/module.slim.no-external")
const { ErrorTrackingExtensions } = await import("posthog-js/dist/extension-bundles")
const contract = await import("../src/analytics-contract")
const { posthogBrowserOptions } = await import("../src/analytics-options")

type Scenario = Readonly<{ name: string; url: string; referrer: string; notFound?: boolean; errorText?: string }>
const scenarios: readonly Scenario[] = [
  ...[
    "+@a.aa",
    "%2B%2540a.aa",
    "privacycanary%2540example.com",
    "privacycanary%40%E4%BE%8B%E5%AD%90.com",
    "Bearer%20credentialcanary",
    "api_key%3Dcredentialcanary",
    "https%3A%2F%2Fusercanary%3Acredentialcanary%40example.com",
    "%70%72%69%76%61%63%79%63%61%6e%61%72%79%40example.com",
    `${"x".repeat(500)}privacycanary%2540example.com`,
  ].map((canary, index) => ({
    name: `encoded-private-${index}`, url: `https://slopcamera.com/docs/${canary}`,
    referrer: "", notFound: true, errorText: `Failure ${canary} at https://slopcamera.com/docs/${canary}`,
  })),
  {
    name: "attributed",
    url: "https://www.slopcamera.com/docs/how-to/music-video?utm_source=newsletter&gclid=abc123&email=someone%40example.com&code=oauth-secret&ref=partner&other=1#section",
    referrer: "https://news.ycombinator.com/item?id=42&token=secret",
  },
  { name: "sensitive", url: "https://slopcamera.com/login?utm_source=newsletter&gclid=abc123&code=oauth-secret", referrer: "" },
  { name: "sensitive-encoded", url: "https://slopcamera.com/%61ccount/private-person?utm_source=newsletter&gclid=abc123", referrer: "" },
  { name: "sensitive-multiply-encoded", url: "https://slopcamera.com/%2574oken/private-person?utm_source=newsletter&gclid=abc123", referrer: "" },
  { name: "sensitive-history", url: "https://slopcamera.com/docs?utm_source=newsletter", referrer: "" },
  { name: "not-found", url: "https://slopcamera.com/missing/page?utm_source=x&secret=1", referrer: "https://slopcamera.com/docs", notFound: true },
  { name: "preview", url: "https://preview.slopcamera.com/?utm_source=x", referrer: "" },
  { name: "vercel", url: "https://slopcamera-git-branch-hraness.vercel.app/?utm_source=x", referrer: "" },
  { name: "localhost", url: "http://localhost:3000/?utm_source=x", referrer: "" },
]

const token = "phc_harnesstoken"
const results: Record<string, { received: unknown[]; returned: unknown[]; bodies: unknown[] }> = {}
const decoder = new TextDecoder()
const decode = (body: unknown): unknown => {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body as ArrayBuffer)
  return JSON.parse(decoder.decode(bytes[0] === 0x1f && bytes[1] === 0x8b ? Bun.gunzipSync(bytes) : bytes)) as unknown
}

for (const scenario of scenarios) {
  // posthog-js keeps the module-load location object, so navigate it in place.
  pageDocument.location.href = scenario.url
  const url = pageDocument.location
  pageDocument.referrer = scenario.referrer
  pageDocument.documentElement.dataset = scenario.notFound === true ? { pageKind: "not_found" } : {}
  const received: unknown[] = []
  const returned: unknown[] = []
  const beforeSend = contract.createBeforeSend(token, () => url, () => scenario.notFound === true)
  const start = sent.length
  const instance = posthog.init(token, {
    ...posthogBrowserOptions("https://us.i.posthog.com"),
    // The harness has no PerformanceObserver or page lifecycle, so it emits
    // $pageview, $pageleave and $web_vitals itself (posthog-js still builds
    // their provider properties) and sends each request immediately.
    capture_pageview: false,
    capture_pageleave: false,
    capture_performance: false,
    request_batching: false,
    __extensionClasses: { exceptions: ErrorTrackingExtensions.exceptions },
    before_send: event => {
      received.push(structuredClone(event))
      const result = beforeSend(event)
      returned.push(structuredClone(result))
      return result
    },
  }, `harness-${scenario.name}`)
  if (instance === undefined) throw new Error("posthog-js did not initialize")

  instance.capture("$pageview", { title: "Slopcamera", $email: "personal-marker", $diagnostic: { token: "personal-marker", email: "personal-marker" },
    ...(scenario.name === "sensitive-history" ? { $initial_current_url: "https://slopcamera.com/%61ccount/private-person?utm_source=private-campaign" } : {}),
  })
  instance.capture("$web_vitals", {
    $web_vitals_LCP_value: 1234.5,
    $web_vitals_LCP_event: { name: "LCP", value: 1234.5, $current_url: scenario.url, timestamp: 1 },
  })
  instance.capture(contract.ctaClickedEvent, { cta: "install", placement: "hero" })
  instance.capture(contract.outboundLinkOpenedEvent, { target_host: "github.com", placement: "nav", link_kind: "github" })
  instance.capture(contract.installCommandCopiedEvent, { install_method: "bun", placement: "inline", command: "bun add --global secret" })
  if (scenario.notFound === true) {
    instance.capture(contract.pageNotFoundEvent, { requested_path: contract.requestedPath(url.pathname), referrer_host: "slopcamera.com" })
  }
  const error = contract.sanitizeError(new Error(scenario.errorText ?? `Failed for someone@example.com at ${scenario.url}`))
  instance.captureException(error, { error_surface: "client", error_origin: "window_error", error_fingerprint: contract.errorFingerprint(error) })
  instance.capture("$autocapture", { $event_type: "click" })
  instance.capture("checkout started", { placement: "hero" })
  instance.capture("$pageleave", {})

  const expected = returned.filter(item => item !== null).length
  for (const deadline = Date.now() + 5_000; sent.length - start < expected && Date.now() < deadline;) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  await new Promise(resolve => setTimeout(resolve, 20))
  results[scenario.name] = { received, returned, bodies: sent.slice(start).map(decode) }
}

await new Promise<void>((resolve, reject) => {
  process.stdout.write(JSON.stringify(results), error => error ? reject(error) : resolve())
})
process.exit(0)

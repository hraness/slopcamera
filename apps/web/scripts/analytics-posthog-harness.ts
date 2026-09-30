// Child-process harness: loads the pinned posthog-js bundle under a minimal
// browser shape and reports what before_send receives and returns. It runs in
// its own process so the browser globals never leak into other tests.
export {}

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
const pageLocation = new URL("https://slopcamera.com/")
const listeners = { addEventListener() {}, removeEventListener() {} }
const pageDocument = {
  ...listeners,
  body: null,
  cookie: "",
  createElement: () => ({ ...listeners, setAttribute() {}, style: {} }),
  documentElement: {},
  getElementsByTagName: () => [],
  location: pageLocation,
  querySelector: () => null,
  querySelectorAll: () => [],
  readyState: "complete",
  referrer: "",
  title: "Slopcamera",
  visibilityState: "visible",
}
const sent: unknown[] = []  // request bodies handed to fetch
Object.assign(globalThis, {
  document: pageDocument,
  location: pageLocation,
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
const { sanitizeEvent } = await import("../src/analytics-contract")
const token = "phc_harnesstoken"
const received: unknown[] = []
const returned: unknown[] = []
posthog.init(token, {
  advanced_disable_flags: true,
  autocapture: false,
  before_send: event => {
    received.push(structuredClone(event))
    const result = sanitizeEvent(event, token)
    returned.push(structuredClone(result))
    return result
  },
  capture_pageview: false,
  cookieless_mode: "always",
  disable_external_dependency_loading: true,
  disable_persistence: true,
  persistence: "memory",
  person_profiles: "never",
  request_batching: false,
  respect_dnt: true,
  api_host: "https://us.i.posthog.com",
})
posthog.capture("$pageview", { analytics_schema_version: 1, site_id: "slopcamera" }, { send_instantly: true, transport: "fetch" })
for (const deadline = Date.now() + 5_000; sent.length === 0 && Date.now() < deadline;) {
  await new Promise(resolve => setTimeout(resolve, 10))
}
await new Promise(resolve => setTimeout(resolve, 20))
const decoder = new TextDecoder()
const bodies = sent.map(body => {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body as ArrayBuffer)
  return JSON.parse(decoder.decode(bytes[0] === 0x1f && bytes[1] === 0x8b ? Bun.gunzipSync(bytes) : bytes)) as unknown
})
process.stdout.write(JSON.stringify({ bodies, received, returned }))
process.exit(0)

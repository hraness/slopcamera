// Exercise the actual site entry in an isolated process, with the real shared
// consent controller and an inert provider. No provider request can escape.
import { mock } from "bun:test"

const mode = process.argv[2]
let choice: string | null = null
const listeners = new Map<string, (() => void)[]>()
let resolveRegion!: (value: Record<string, unknown>) => void
const region = new Promise<Record<string, unknown>>((resolve) => { resolveRegion = resolve })
let initialized = 0
let captured = 0
let beforeSend: ((event: unknown) => unknown) | undefined
let requests = 0
let requestSignal: AbortSignal | undefined
const provider = {
    version: "1.422.5",
    config: {} as Record<string, unknown>,
    _send_request: (options: { data: object; fetchOptions?: { signal?: AbortSignal } }) => {
      requests++
      requestSignal = options.fetchOptions?.signal
    },
    init: (_key: string, options: { before_send: (event: unknown) => unknown; capture_pageview?: boolean }) => {
      provider.config = options
      initialized++
      if (options.capture_pageview) captured++
      beforeSend = options.before_send
    },
    capture: () => { captured++ },
}
mock.module("posthog-js/dist/module.slim.no-external", () => ({ default: provider }))
mock.module("posthog-js/dist/extension-bundles", () => ({
  AnalyticsExtensions: { webVitalsAutocapture: class {} },
  ErrorTrackingExtensions: { exceptions: class {} },
}))
mock.module("posthog-js/dist/web-vitals", () => ({}))
Object.assign(globalThis, {
  window: {
    location: new URL("https://slopcamera.com/"),
    localStorage: { getItem: () => choice },
    addEventListener: (name: string, listener: () => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener])
    },
    removeEventListener() {},
  },
  document: { addEventListener() {}, querySelectorAll: () => [], body: {}, documentElement: { dataset: {} } },
  MutationObserver: class { observe() {} },
  fetch: () => region.then(body => Response.json(body, { status: mode === "unavailable" ? 503 : 200 })),
  __SLOPCAMERA_POSTHOG_KEY__: "phc_harnesstoken",
  __SLOPCAMERA_POSTHOG_HOST__: "https://us.i.posthog.com",
})
await import("../src/analytics")
const before = { initialized, captured }
resolveRegion(mode === "malformed" ? {} : { required: mode === "required" })
await region
await new Promise((resolve) => setTimeout(resolve, 0))
const afterRegion = { initialized, captured }
for (const listener of listeners.get("hraness-consent-accepted") ?? []) listener()
for (const listener of listeners.get("hraness-consent-accepted") ?? []) listener()
const afterAccepted = { initialized, captured }
const event = {
  event: "$pageview", uuid: "0198c6a7-7c00-7000-8000-000000000000",
  properties: { token: "phc_harnesstoken", distinct_id: "$posthog_cookieless",
    $current_url: "https://slopcamera.com/", $cookieless_mode: true, $raw_user_agent: "test browser" },
}
const allowedBeforeRefusal = beforeSend?.(event) != null
const pendingRequest = { data: {} }
provider._send_request(pendingRequest)
const pendingSignal = requestSignal
choice = "declined"
for (const listener of listeners.get("storage") ?? []) {
  ;(listener as (event: { key: string }) => void)({ key: "hraness-consent-cookies-v1" })
}
const blockedAfterRefusal = beforeSend?.(event) === null
provider._send_request(pendingRequest)
choice = "accepted"
for (const listener of listeners.get("hraness-consent-accepted") ?? []) listener()
provider._send_request(pendingRequest)
const requestsAfterStaleRetry = requests
provider._send_request({ data: {} })
process.stdout.write(JSON.stringify({ before, afterRegion, afterAccepted, allowedBeforeRefusal, blockedAfterRefusal,
  pendingAborted: pendingSignal?.aborted, requestsAfterStaleRetry, requestsAfterFreshCapture: requests }))

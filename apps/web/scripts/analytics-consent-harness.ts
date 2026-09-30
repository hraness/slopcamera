// Exercise the actual site entry in an isolated process, with the real shared
// consent controller and an inert provider. No provider request can escape.
import { mock } from "bun:test"

const mode = process.argv[2]
let choice: string | null = null
const listeners = new Map<string, (() => void)[]>()
let resolveRegion!: (value: Response) => void
const region = new Promise<Response>((resolve) => { resolveRegion = resolve })
let initialized = 0
let captured = 0
let beforeSend: ((event: unknown) => unknown) | undefined
mock.module("posthog-js/dist/module.slim.no-external", () => ({
  default: {
    init: (_key: string, options: { before_send: (event: unknown) => unknown }) => {
      initialized++
      beforeSend = options.before_send
    },
    capture: () => { captured++ },
  },
}))
Object.assign(globalThis, {
  window: {
    location: new URL("https://slopcamera.com/"),
    localStorage: { getItem: () => choice },
    addEventListener: (name: string, listener: () => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener])
    },
    removeEventListener() {},
  },
  document: { addEventListener() {}, body: {}, documentElement: {} },
  MutationObserver: class { observe() {} },
  fetch: () => region,
  __SLOPCAMERA_POSTHOG_KEY__: "phc_harnesstoken",
  __SLOPCAMERA_POSTHOG_HOST__: "https://us.i.posthog.com",
})
await import("../src/analytics")
const before = { initialized, captured }
resolveRegion(new Response(JSON.stringify(mode === "malformed" ? {} : { required: mode === "required" }), { status: mode === "unavailable" ? 503 : 200 }))
await region
await new Promise((resolve) => setTimeout(resolve, 0))
const afterRegion = { initialized, captured }
for (const listener of listeners.get("hraness-consent-accepted") ?? []) listener()
for (const listener of listeners.get("hraness-consent-accepted") ?? []) listener()
const afterAccepted = { initialized, captured }
choice = "declined"
for (const listener of listeners.get("storage") ?? []) {
  ;(listener as (event: { key: string }) => void)({ key: "hraness-consent-cookies-v1" })
}
const blockedAfterRefusal = beforeSend?.({}) === null
process.stdout.write(JSON.stringify({ before, afterRegion, afterAccepted, blockedAfterRefusal }))

import { getBrowserConsent } from "@hraness/posthog/consent"
import { initHranessCookieConsent } from "@hraness/site-footer/consent"
import posthog from "posthog-js/dist/module.slim.no-external"
import { AnalyticsExtensions, ErrorTrackingExtensions } from "posthog-js/dist/extension-bundles"
// Bundles the web-vitals callbacks locally, so posthog-js never loads them
// from its assets host (the CSP allows only https://us.i.posthog.com).
import "posthog-js/dist/web-vitals"

import {
  ExceptionBudget, ctaClickedEvent, ctaProperties, errorFingerprint, installCommandCopiedEvent,
  installMethodFor, outboundLinkOpenedEvent, outboundProperties, pageNotFoundEvent, publicHostname,
  requestedPath, sanitizeError, shouldInitializeAnalytics, createBeforeSend, type CtaPlacement,
} from "./analytics-contract"
import { posthogBrowserOptions } from "./analytics-options"

declare const __SLOPCAMERA_POSTHOG_HOST__: string
declare const __SLOPCAMERA_POSTHOG_KEY__: string

const token = __SLOPCAMERA_POSTHOG_KEY__
const isNotFound = (): boolean => document.documentElement.dataset.pageKind === "not_found"

initHranessCookieConsent()
const consent = getBrowserConsent()
let initialized = false

function initializeAnalytics() {
  if (initialized || !consent?.allowed() || !shouldInitializeAnalytics(window.location, token)) return
  initialized = true
  const sanitize = createBeforeSend(token, () => window.location, isNotFound)
  posthog.init(token, {
    ...posthogBrowserOptions(__SLOPCAMERA_POSTHOG_HOST__),
    __extensionClasses: {
      exceptions: ErrorTrackingExtensions.exceptions,
      webVitalsAutocapture: AnalyticsExtensions.webVitalsAutocapture,
    },
    before_send: event => consent.allowed() ? sanitize(event) : null,
  })

  if (isNotFound()) {
    let referrerHost = ""
    try {
      referrerHost = document.referrer === "" ? "" : publicHostname(new URL(document.referrer).hostname)
    } catch {
      referrerHost = ""
    }
    posthog.capture(pageNotFoundEvent, {
      requested_path: requestedPath(window.location.pathname),
      ...(referrerHost === "" ? {} : { referrer_host: referrerHost }),
    })
  }

  const placementOf = (element: Element): CtaPlacement =>
    isNotFound() ? "not_found"
      : element.closest(".topbar") !== null ? "nav"
        : element.closest(".hraness-marketing-hero") !== null ? "hero"
          : element.closest("footer") !== null ? "footer"
            : window.location.pathname.startsWith("/docs") ? "docs"
              : "inline"

  document.addEventListener("click", event => {
    if (!consent.allowed()) return
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (link === null) return
    const href = link.getAttribute("href")
    const placement = placementOf(link)
    const cta = ctaProperties(href, placement)
    if (cta !== null) posthog.capture(ctaClickedEvent, cta)
    const outbound = outboundProperties(href, placement)
    if (outbound !== null) posthog.capture(outboundLinkOpenedEvent, outbound, { transport: "sendBeacon" })
  }, { capture: true })

  // copy-command.ts and platform-install.ts mark a successful copy with
  // data-copy-state="copied"; only copies of install commands count. The
  // command text only selects install_method and is never sent.
  new MutationObserver(records => {
    if (!consent.allowed()) return
    for (const record of records) {
      const target = record.target
      if (!(target instanceof HTMLButtonElement) || target.dataset.copyState !== "copied" || record.oldValue === "copied") continue
      if (target.closest("#install") === null) continue
      const block = target.closest("[data-copy-command], div[data-copy-state]")
      const command = block?.querySelector("[data-copy-command-value], pre")?.textContent ?? ""
      posthog.capture(installCommandCopiedEvent, { install_method: installMethodFor(command), placement: placementOf(target) })
    }
  }).observe(document.body ?? document.documentElement, {
    attributeFilter: ["data-copy-state"], attributeOldValue: true, subtree: true,
  })

  // Budgeted exception reporting (capture_exceptions stays off so the
  // provider's own autocapture never bypasses the budget).
  const budget = new ExceptionBudget()
  const report = (value: unknown, origin: "window_error" | "unhandled_rejection"): void => {
    try {
      if (!consent.allowed()) return
      const error = sanitizeError(value)
      const fingerprint = errorFingerprint(error)
      if (!budget.allow(fingerprint)) return
      posthog.captureException(error, { error_surface: "client", error_origin: origin, error_fingerprint: fingerprint })
    } catch {
      // Error reporting must never raise.
    }
  }
  window.addEventListener("error", event => report(event.error ?? new Error(event.message || "Script error"), "window_error"))
  window.addEventListener("unhandledrejection", event => report(event.reason, "unhandled_rejection"))
}

if (shouldInitializeAnalytics(window.location, token)) consent?.subscribe(initializeAnalytics)

import posthog from "posthog-js/dist/module.slim.no-external"

import {
  ctaClickedEvent, ctaProperties, installCommandCopiedEvent, isCanonicalAnalyticsPage, sanitizeEvent,
  type CtaPlacement,
} from "./analytics-contract"

declare const __SLOPCAMERA_POSTHOG_HOST__: string
declare const __SLOPCAMERA_POSTHOG_KEY__: string

if (isCanonicalAnalyticsPage(window.location)) {
  posthog.init(__SLOPCAMERA_POSTHOG_KEY__, {
    advanced_disable_flags: true,
    advanced_disable_toolbar_metrics: true,
    autocapture: false,
    before_send: event => (
      isCanonicalAnalyticsPage(window.location)
        ? sanitizeEvent(event, __SLOPCAMERA_POSTHOG_KEY__)
        : null
    ),
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_pageleave: false,
    capture_pageview: false,
    capture_performance: false,
    cookieless_mode: "always",
    disableDeviceModel: true,
    disable_conversations: true,
    disable_external_dependency_loading: true,
    disable_persistence: true,
    disable_product_tours: true,
    disable_scroll_properties: true,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    enable_recording_console_log: false,
    mask_all_element_attributes: true,
    mask_all_text: true,
    persistence: "memory",
    person_profiles: "never",
    request_batching: false,
    respect_dnt: true,
    save_campaign_params: false,
    save_referrer: false,
    api_host: __SLOPCAMERA_POSTHOG_HOST__,
  })
  const send = { send_instantly: true, transport: "fetch" } as const
  posthog.capture("$pageview", {
    analytics_schema_version: 1,
    site_id: "slopcamera",
  }, send)

  const placementOf = (link: Element): CtaPlacement | null =>
    link.closest(".topbar") !== null ? "nav"
      : link.closest(".hraness-marketing-hero") !== null ? "hero"
        : link.closest("#closing") !== null ? "closing"
          : null

  document.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null
    const properties = link === null ? null : ctaProperties(link.getAttribute("href"), placementOf(link))
    if (properties !== null) {
      posthog.capture(ctaClickedEvent, properties, send)
    }
  })

  // copy-command.ts marks a successful copy with data-copy-state="copied";
  // only the copy buttons inside the install section count as install copies.
  new MutationObserver(records => {
    for (const record of records) {
      if (
        record.target instanceof HTMLElement
        && record.target.closest("#install") !== null
        && record.target.dataset.copyState === "copied"
        && record.oldValue !== "copied"
      ) {
        posthog.capture(installCommandCopiedEvent, {}, send)
      }
    }
  }).observe(document.body ?? document.documentElement, {
    attributeFilter: ["data-copy-state"], attributeOldValue: true, subtree: true,
  })
}

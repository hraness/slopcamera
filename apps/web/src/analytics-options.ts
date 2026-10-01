import type { PostHogConfig } from "posthog-js/dist/module.slim.no-external"

/**
 * The production posthog-js options, mirroring @hraness/posthog v0.2.0's
 * browser baseline. Shared by src/analytics.ts and the test-contract harness
 * so the test exercises the configuration that ships. before_send and the
 * bundled extensions are added by the caller.
 */
export function posthogBrowserOptions(apiHost: string): Partial<PostHogConfig> {
  return {
    api_host: apiHost,
    defaults: "2026-05-30",
    advanced_disable_flags: true,
    advanced_disable_toolbar_metrics: true,
    autocapture: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    // Every static page is a full document load, so each load is one $pageview.
    capture_pageview: true,
    capture_pageleave: true,
    capture_performance: {
      network_timing: false,
      web_vitals: true,
      web_vitals_allowed_metrics: ["LCP", "CLS", "FCP", "INP"],
      web_vitals_attribution: false,
    },
    cookieless_mode: "always",
    disableDeviceModel: true,
    disable_capture_url_hashes: true,
    disable_conversations: true,
    disable_external_dependency_loading: true,
    disable_product_tours: true,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    enable_recording_console_log: false,
    mask_all_element_attributes: true,
    mask_all_text: true,
    mask_personal_data_properties: false,
    persistence: "memory",
    person_profiles: "never",
    properties_string_max_length: 2_048,
    rageclick: false,
    rate_limiting: { events_per_second: 2, events_burst_limit: 12 },
    respect_dnt: true,
    request_batching: false,
  }
}

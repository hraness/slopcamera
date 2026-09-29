import type { CaptureResult } from "posthog-js/dist/module.slim.no-external"

export const analyticsSchemaVersion = 1
export const canonicalAnalyticsOrigin = "https://slopcamera.com"
export const posthogCookielessDistinctId = "$posthog_cookieless"
export const siteId = "slopcamera"

const rawUserAgentLimit = 2_048

export function isCanonicalAnalyticsPage(location: Readonly<Pick<Location, "origin" | "pathname">>): boolean {
  return location.origin === canonicalAnalyticsOrigin && location.pathname === "/"
}

export const ctaClickedEvent = "cta clicked"
export const installCommandCopiedEvent = "install command copied"

/** Home-page calls to action that may be counted, keyed by exact link target. */
export const ctaTargets: Readonly<Record<string, string>> = {
  "#install": "install",
  "#examples": "examples",
  "/docs": "docs",
  "https://github.com/hraness/slopcamera": "github",
}
export const ctaPlacements = ["nav", "hero", "closing"] as const
export type CtaPlacement = typeof ctaPlacements[number]

const ctaNames = new Set(Object.values(ctaTargets))
const placementNames = new Set<string>(ctaPlacements)

/** Maps a clicked link target and page region to its allowlisted CTA properties. */
export function ctaProperties(href: string | null, placement: CtaPlacement | null): { cta: string, placement: CtaPlacement } | null {
  const cta = href === null ? undefined : ctaTargets[href]
  return cta === undefined || placement === null ? null : { cta, placement }
}

/** Keeps only the allowlisted home-page events and rebuilds their properties from fixed fields. */
export function sanitizeEvent(event: CaptureResult | null, publicKey: string): CaptureResult | null {
  if (event?.event === ctaClickedEvent) {
    const { cta, placement } = event.properties
    if (typeof cta !== "string" || !ctaNames.has(cta) || typeof placement !== "string" || !placementNames.has(placement)) {
      return null
    }
    return rebuild(event, publicKey, { cta, placement })
  }
  if (event?.event === installCommandCopiedEvent) {
    return rebuild(event, publicKey, {})
  }
  return sanitizePageview(event, publicKey)
}

export function sanitizePageview(event: CaptureResult | null, publicKey: string): CaptureResult | null {
  if (event?.event !== "$pageview") {
    return null
  }
  return rebuild(event, publicKey, {})
}

function rebuild(event: CaptureResult, publicKey: string, extra: Readonly<Record<string, string>>): CaptureResult | null {
  const rawUserAgent = event.properties.$raw_user_agent
  if (
    event.properties.token !== publicKey
    || event.properties.distinct_id !== posthogCookielessDistinctId
    || event.properties.$cookieless_mode !== true
    || typeof rawUserAgent !== "string"
    || rawUserAgent.trim().length === 0
  ) {
    return null
  }

  return {
    event: event.event,
    properties: {
      ...extra,
      $process_person_profile: false,
      $cookieless_mode: true,
      $raw_user_agent: rawUserAgent.slice(0, rawUserAgentLimit),
      analytics_schema_version: analyticsSchemaVersion,
      distinct_id: posthogCookielessDistinctId,
      site_id: siteId,
      token: publicKey,
    },
    ...(event.timestamp === undefined ? {} : { timestamp: event.timestamp }),
    uuid: event.uuid,
  }
}

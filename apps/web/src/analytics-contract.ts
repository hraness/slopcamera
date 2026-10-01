import type { CaptureResult } from "posthog-js/dist/module.slim.no-external"
import { redactSensitiveText as redactSharedAnalyticsText } from "@hraness/posthog/event"

// This static site intentionally mirrors the framework-neutral PostHog
// options and before_send contract (version 2 of the portfolio observability
// standard). Keep this file in step with the
// package; the test contract in site.test.ts runs the pinned posthog-js through
// sanitizeEvent and asserts on the outgoing request body.

/** Mirrors `POSTHOG_SCHEMA_VERSION` from @hraness/posthog v0.2.0. */
export const POSTHOG_SCHEMA_VERSION = 2
export const analyticsSchemaVersion = POSTHOG_SCHEMA_VERSION
export const siteId = "slopcamera"
export const canonicalDomain = "slopcamera.com"
export const canonicalAnalyticsOrigin = `https://${canonicalDomain}`
/** Hosts that may send events. Preview, localhost, and *.vercel.app never do. */
export const allowedAnalyticsHosts: readonly string[] = [canonicalDomain, `www.${canonicalDomain}`]
export const posthogCookielessDistinctId = "$posthog_cookieless"

export const ctaClickedEvent = "cta clicked"
export const installCommandCopiedEvent = "install command copied"
export const outboundLinkOpenedEvent = "outbound link opened"
export const pageNotFoundEvent = "page not found"
export const builtInEvents: readonly string[] = ["$pageview", "$pageleave", "$web_vitals", "$exception"]
export const customEvents: readonly string[] = [
  ctaClickedEvent, installCommandCopiedEvent, outboundLinkOpenedEvent, pageNotFoundEvent,
]

/** utm_* and ad click IDs kept by the standard; every other query parameter is dropped. */
export const attributionParameters: readonly string[] = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "gbraid", "wbraid", "gad_source", "fbclid", "msclkid", "ttclid", "twclid",
  "li_fat_id", "igshid", "dclid", "epik", "rdt_cid", "sccid", "irclid", "mc_cid",
]
/** Query-derived campaign properties posthog-js can emit that the standard excludes. */
const droppedCampaignProperties = new Set(["_kx", "ref", "gclsrc", "qclid", "campaign_params"])
const attributionSet = new Set(attributionParameters)

/**
 * Routes whose whole query, attribution included, never leaves the browser.
 * Slopcamera has no account, auth, or checkout pages; the shared list still
 * guards any such route should one appear.
 */
const sensitivePathPattern = /^\/(?:api\/)?(?:auth|oauth|callback|login|logout|log-in|signin|sign-in|signup|sign-up|register|account|accounts|billing|checkout|invite|invites|reset-password|verify|token)(?:\/|$)/iu

export const ctaPlacements = ["hero", "nav", "footer", "inline", "pricing", "docs", "modal", "sticky", "not_found"] as const
export type CtaPlacement = typeof ctaPlacements[number]
export const installMethods = ["brew", "curl", "npm", "bun", "pip", "go", "cargo", "other"] as const
export type InstallMethod = typeof installMethods[number]
export const linkKinds = ["github", "docs", "social", "portfolio", "other"] as const
export type LinkKind = typeof linkKinds[number]

/** Calls to action that may be counted, keyed by exact link target; values are stable IDs. */
export const ctaTargets: Readonly<Record<string, string>> = {
  "#install": "install",
  "/#install": "install",
  "#examples": "examples",
  "/docs": "docs",
  "https://github.com/hraness/slopcamera": "github",
}

const placementSet = new Set<string>(ctaPlacements)
const installMethodSet = new Set<string>(installMethods)
const linkKindSet = new Set<string>(linkKinds)
const ctaNames = new Set(Object.values(ctaTargets))

const maxPathLength = 512
const maxAttributionLength = 256
const maxRequestedPathLength = 256
const maxProviderStringLength = 2_048
export const maxAnalyticsEventBytes = 16_384

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/u, "").replace(/:\d+$/u, "")
}

/** The served hostname, lowercased with `www.` removed, as the standard's `$host`. */
export function publicHostname(hostname: string): string {
  return normalizeHostname(hostname).replace(/^www\./u, "")
}

export function isAllowedAnalyticsHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  return allowedAnalyticsHosts.includes(normalized)
}

/** Cookieless PostHog ignores respect_dnt, so the bootstrap must honor it first. */
export function doNotTrackEnabled(
  navigatorValue: Readonly<{ doNotTrack?: string | null | undefined; msDoNotTrack?: string | null | undefined }>,
  windowValue: Readonly<{ doNotTrack?: string | null | undefined }>,
): boolean {
  return [navigatorValue.doNotTrack, navigatorValue.msDoNotTrack, windowValue.doNotTrack].some(
    value => typeof value === "string" && ["1", "yes", "true"].includes(value.trim().toLowerCase()),
  )
}

/** Initialize only over HTTPS on an allowed production host with a public project token. */
export function shouldInitializeAnalytics(location: Readonly<Pick<Location, "protocol" | "hostname">>, token: string): boolean {
  return location.protocol === "https:" && isAllowedAnalyticsHost(location.hostname) && /^phc_[A-Za-z0-9_-]+$/u.test(token)
}

export function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/u, 1)[0] ?? "/"
  const redacted = isSensitivePath(withoutQuery) ? "/private" : redactSensitiveText(withoutQuery)
  const withSlash = redacted.startsWith("/") ? redacted : `/${redacted}`
  const collapsed = withSlash.replace(/\/{2,}/gu, "/").replace(/\.html$/u, "").replace(/\/index$/u, "/")
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/+$/u, "") : collapsed
  return isSensitivePath(trimmed) ? "/private" : trimmed.slice(0, maxPathLength) || "/"
}

export function isSensitivePath(pathname: string): boolean {
  try {
    let decoded = pathname
    for (let depth = 0; depth < 8; depth += 1) {
      const normalized = decoded.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/")
      if (sensitivePathPattern.test(new URL(normalized, canonicalAnalyticsOrigin).pathname)) return true
      const next = decodeURIComponent(decoded)
      if (next === decoded) return false
      decoded = next
    }
    return true
  } catch {
    return true
  }
}

export type RouteContext = Readonly<{ canonical_path: string; page_kind: string; content_group?: string; content_slug?: string }>

/** Route class for a public path; a 404 render collapses to `/404` so unknown URLs stay bounded. */
export function classifyRoute(pathname: string, notFound: boolean): RouteContext {
  const path = normalizePathname(pathname)
  if (notFound) return { canonical_path: "/404", page_kind: "not_found" }
  if (path === "/") return { canonical_path: path, page_kind: "home" }
  if (path === "/docs" || path.startsWith("/docs/")) {
    const slug = path.slice("/docs/".length)
    return { canonical_path: path, page_kind: "docs", content_group: "docs", ...(slug === "" ? {} : { content_slug: slug.slice(0, 160) }) }
  }
  if (path === "/blog") return { canonical_path: path, page_kind: "blog", content_group: "blog" }
  if (path.startsWith("/blog/")) {
    return { canonical_path: path, page_kind: "article", content_group: "blog", content_slug: path.slice("/blog/".length).slice(0, 160) }
  }
  return { canonical_path: path, page_kind: "other" }
}

// --- Traffic classification (copied from @hraness/posthog src/traffic.ts) ---

export type TrafficChannel = "direct" | "internal" | "organic_search" | "ai_referral" | "social" | "referral"
export type TrafficContext = Readonly<{ traffic_channel: TrafficChannel; traffic_source: string; referrer_host?: string }>
type SourceList = readonly (readonly [string, readonly string[]])[]

const aiSources: SourceList = [
  ["chatgpt", ["chatgpt.com", "chat.openai.com"]],
  ["perplexity", ["perplexity.ai"]],
  ["claude", ["claude.ai"]],
  ["gemini", ["gemini.google.com"]],
  ["copilot", ["copilot.microsoft.com"]],
  ["poe", ["poe.com"]],
  ["you.com", ["you.com"]],
  ["meta_ai", ["meta.ai"]],
]
const searchSources: SourceList = [
  ["google", ["google.com", "google.co.uk", "google.ca", "google.com.au"]],
  ["bing", ["bing.com"]],
  ["duckduckgo", ["duckduckgo.com"]],
  ["yahoo", ["search.yahoo.com", "yahoo.com"]],
  ["brave", ["search.brave.com"]],
  ["ecosia", ["ecosia.org"]],
  ["baidu", ["baidu.com"]],
  ["yandex", ["yandex.com", "yandex.ru"]],
]
const socialSources: SourceList = [
  ["reddit", ["reddit.com"]],
  ["x", ["x.com", "twitter.com", "t.co"]],
  ["linkedin", ["linkedin.com"]],
  ["facebook", ["facebook.com", "fb.com"]],
  ["instagram", ["instagram.com"]],
  ["youtube", ["youtube.com", "youtu.be"]],
  ["mastodon", ["mastodon.social"]],
  ["threads", ["threads.net"]],
]

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function sourceFor(value: string, sources: SourceList, allowName: boolean): string | null {
  for (const [source, domains] of sources) {
    if ((allowName && value === source) || domains.some(domain => hostnameMatches(value, domain))) return source
  }
  return null
}

export function classifyTraffic(referrer: string | null | undefined, currentUrl?: string | null): TrafficContext {
  let utmSource: string | null = null
  try {
    utmSource = currentUrl ? new URL(currentUrl, canonicalAnalyticsOrigin).searchParams.get("utm_source") : null
  } catch {
    utmSource = null
  }
  const attributed = utmSource?.trim().toLowerCase().replace(/^www\./u, "") ?? ""
  if (attributed !== "") {
    for (const [channel, sources] of [["ai_referral", aiSources], ["organic_search", searchSources], ["social", socialSources]] as const) {
      const source = sourceFor(attributed, sources, true)
      if (source !== null) return { traffic_channel: channel, traffic_source: source }
    }
  }
  if (!referrer || referrer === "$direct") return { traffic_channel: "direct", traffic_source: "direct" }
  let hostname: string
  try {
    hostname = normalizeHostname(new URL(referrer).hostname)
  } catch {
    return { traffic_channel: "referral", traffic_source: "unknown" }
  }
  if (hostname === "") return { traffic_channel: "referral", traffic_source: "unknown" }
  if (isAllowedAnalyticsHost(hostname)) return { traffic_channel: "internal", traffic_source: "internal", referrer_host: hostname }
  const host = hostname.replace(/^www\./u, "")
  for (const [channel, sources] of [["ai_referral", aiSources], ["organic_search", searchSources], ["social", socialSources]] as const) {
    const source = sourceFor(host, sources, false)
    if (source !== null) return { traffic_channel: channel, traffic_source: source, referrer_host: host }
  }
  return { traffic_channel: "referral", traffic_source: host, referrer_host: host }
}

// --- Property scrubbing ---

export function redactSensitiveText(value: string): string {
  return redactSharedAnalyticsText(value)
}

/** Owned URL: canonical origin, normalized path, and only attribution parameters; third-party URL: origin only. */
export function sanitizeUrl(value: string, stripAttribution = false): string {
  let parsed: URL
  try {
    parsed = new URL(value, canonicalAnalyticsOrigin)
  } catch {
    return ""
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return ""
  if (!isAllowedAnalyticsHost(parsed.hostname)) return parsed.origin
  const path = normalizePathname(parsed.pathname)
  const query = new URLSearchParams()
  if (!stripAttribution && !isSensitivePath(parsed.pathname)) {
    for (const [key, raw] of parsed.searchParams) {
      if (attributionSet.has(key) && !query.has(key)) {
        const kept = redactSensitiveText(raw).slice(0, maxAttributionLength)
        if (kept !== "") query.append(key, kept)
      }
    }
  }
  const search = query.toString()
  return `${canonicalAnalyticsOrigin}${path}${search === "" ? "" : `?${search}`}`
}

/** Empty is `$direct`; own host keeps origin plus path; a third party keeps only its origin. */
export function sanitizeReferrer(value: string): string {
  if (value.trim() === "" || value === "$direct") return "$direct"
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "$direct"
    return isAllowedAnalyticsHost(parsed.hostname)
      ? `${canonicalAnalyticsOrigin}${normalizePathname(parsed.pathname)}`
      : parsed.origin
  } catch {
    return "$direct"
  }
}

function baseName(key: string): string {
  return key.replace(/^\$/u, "").replace(/^(?:initial|session_entry)_/u, "")
}

const urlKey = /^\$(?:(?:initial|session_entry)_)?(?:current_url|url)$|^\$prev_pageview_url$/u
const referrerKey = /^\$(?:(?:initial|session_entry)_)?referrer$/u
const referringDomainKey = /^\$(?:(?:initial|session_entry)_)?referring_domain$/u
const pathnameKey = /^\$(?:(?:initial|session_entry|prev_pageview)_)?pathname$/u
const personalProperties = new Set([
  "code", "email", "key", "password", "secret", "token", "state", "access_token",
  "refresh_token", "id_token", "session_token", "api_key", "authorization",
])

function hasSensitiveLocation(value: unknown, depth = 0, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== "object" || depth > 6 || seen.has(value)) return false
  seen.add(value)
  return Object.entries(value).some(([key, nested]) => {
    if (typeof nested === "string" && (urlKey.test(key) || pathnameKey.test(key))) {
      try { return isSensitivePath(new URL(nested, canonicalAnalyticsOrigin).pathname) } catch { return true }
    }
    return hasSensitiveLocation(nested, depth + 1, seen)
  })
}

function sanitizeValue(key: string, value: unknown, sensitive: boolean, depth: number, seen: WeakSet<object>): unknown {
  // The SDK derives search-engine query text from the original referrer URL.
  if (/^\$?(?:(?:initial|session_entry|prev_pageview)_)?ph_keyword$/iu.test(key)) return undefined
  const name = baseName(key)
  if (depth === 0 && ["token", "distinct_id", "$raw_user_agent", "$cookieless_mode"].includes(key)) return value
  if (personalProperties.has(name.toLowerCase())) return undefined
  if (droppedCampaignProperties.has(name)) return undefined
  if (attributionSet.has(name)) {
    if (sensitive || typeof value !== "string") return undefined
    const kept = redactSensitiveText(value).slice(0, maxAttributionLength)
    return kept === "" ? undefined : kept
  }
  if (typeof value === "string") {
    if (urlKey.test(key)) return sanitizeUrl(value, sensitive)
    if (referrerKey.test(key)) return sanitizeReferrer(value)
    if (referringDomainKey.test(key)) return value === "$direct" || value === "" ? "$direct" : redactSensitiveText(normalizeHostname(value))
    if (pathnameKey.test(key)) return normalizePathname(value)
    return redactSensitiveText(value).slice(0, maxProviderStringLength)
  }
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (depth >= 6 || typeof value !== "object" || seen.has(value)) return undefined
  seen.add(value)
  if (Array.isArray(value)) return value.slice(0, 64).map(item => sanitizeValue(key, item, sensitive, depth + 1, seen))
  const result: Record<string, unknown> = {}
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    const safe = sanitizeValue(nestedKey, nestedValue, sensitive, depth + 1, seen)
    if (safe !== undefined) result[nestedKey] = safe
  }
  return result
}

// --- Custom event properties ---

/** Maps a clicked link target and page region to its allowlisted CTA properties. */
export function ctaProperties(href: string | null, placement: CtaPlacement | null): { cta: string; placement: CtaPlacement; target_host?: string } | null {
  const cta = href === null ? undefined : ctaTargets[href]
  if (cta === undefined || placement === null) return null
  const target = externalHost(href)
  return target === null ? { cta, placement } : { cta, placement, target_host: target }
}

function externalHost(href: string | null): string | null {
  if (href === null) return null
  try {
    const url = new URL(href, canonicalAnalyticsOrigin)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    const host = publicHostname(url.hostname)
    return isAllowedAnalyticsHost(url.hostname) ? null : host
  } catch {
    return null
  }
}

const portfolioHosts = /(?:^|\.)(?:hraness\.com|sys1\.io|alt\.dog|sound\.fish|ghostget\.com|algal\.computer|vhalla\.com|clankdar\.com|gobstopper\.(?:sh|dev)|botfilter\.(?:io|dev)|icon\.place|iconplace\.com|textbutler\.(?:app|com)|peopleblade\.com|sponge\.computer|swft\.io|lifecharts\.io|rough\.day|act60\.me|sleepy\.land|wordcell\.io|aicharts\.io)$/u
const socialHosts = /(?:^|\.)(?:x\.com|twitter\.com|linkedin\.com|reddit\.com|youtube\.com|youtu\.be|bsky\.app|mastodon\.social|threads\.net|instagram\.com|facebook\.com)$/u

export function linkKindFor(host: string): LinkKind {
  if (host === "github.com" || host.endsWith(".github.com") || host.endsWith(".github.io")) return "github"
  if (host.startsWith("docs.")) return "docs"
  if (socialHosts.test(host)) return "social"
  if (portfolioHosts.test(host)) return "portfolio"
  return "other"
}

/** `outbound link opened` properties for a link to another host, or null for an own-host link. */
export function outboundProperties(href: string | null, placement: CtaPlacement): { target_host: string; placement: CtaPlacement; link_kind: LinkKind } | null {
  const host = externalHost(href)
  return host === null ? null : { target_host: host, placement, link_kind: linkKindFor(host) }
}

/** Classifies an install command by its runner; the command text itself is never sent. */
export function installMethodFor(command: string): InstallMethod {
  const first = command.trim().split(/\s+/u, 1)[0]?.toLowerCase() ?? ""
  if (first === "brew") return "brew"
  if (first === "curl" || first === "wget") return "curl"
  if (first === "npm" || first === "npx" || first === "pnpm" || first === "yarn") return "npm"
  if (first === "bun" || first === "bunx") return "bun"
  if (first === "pip" || first === "pip3" || first === "pipx" || first === "uv") return "pip"
  if (first === "go") return "go"
  if (first === "cargo") return "cargo"
  return "other"
}

/** The 404 request path: normalized, no query, at most 256 characters. */
export function requestedPath(pathname: string): string {
  return normalizePathname(pathname).slice(0, maxRequestedPathLength)
}

function customProperties(event: string, properties: Readonly<Record<string, unknown>>): Record<string, string> | null {
  const text = (key: string): string | null => typeof properties[key] === "string" ? properties[key] : null
  const placement = text("placement")
  switch (event) {
    case ctaClickedEvent: {
      const cta = text("cta")
      const target = text("target_host")
      if (cta === null || !ctaNames.has(cta) || placement === null || !placementSet.has(placement)) return null
      return { cta, placement, ...(target === null ? {} : { target_host: publicHostname(target) }) }
    }
    case outboundLinkOpenedEvent: {
      const target = text("target_host")
      const kind = text("link_kind")
      if (target === null || placement === null || !placementSet.has(placement)) return null
      const host = publicHostname(target)
      if (host === "" || isAllowedAnalyticsHost(host)) return null
      return { target_host: host, placement, ...(kind !== null && linkKindSet.has(kind) ? { link_kind: kind } : {}) }
    }
    case installCommandCopiedEvent: {
      const method = text("install_method")
      if (method === null || !installMethodSet.has(method) || placement === null || !placementSet.has(placement)) return null
      return { install_method: method, placement }
    }
    case pageNotFoundEvent: {
      const path = text("requested_path")
      if (path === null) return null
      const referrerHost = text("referrer_host")
      return { requested_path: requestedPath(path), ...(referrerHost === null || referrerHost === "" ? {} : { referrer_host: publicHostname(referrerHost) }) }
    }
    case "$exception": {
      const surface = text("error_surface")
      const origin = text("error_origin")
      const fingerprint = text("error_fingerprint")
      return {
        error_surface: surface === "client" ? surface : "client",
        ...(origin === "window_error" || origin === "unhandled_rejection" ? { error_origin: origin } : {}),
        ...(fingerprint !== null && /^e_[0-9a-f]{8}$/u.test(fingerprint) ? { error_fingerprint: fingerprint } : {}),
      }
    }
    default:
      return {}
  }
}

/** Unprefixed keys posthog-js itself sets; any other unprefixed key must be a declared event property. */
const providerPlainKeys = new Set(["token", "distinct_id", "title"])

export type BeforeSendContext = Readonly<{
  /** True while the current document is the 404 page. */
  notFound: () => boolean
  /** Current browser path, which may differ from a queued event's URL. */
  currentPathname?: string
}>

/**
 * The site's production before_send: allowlists event names, keeps the
 * provider's properties, and scrubs their values per the standard. Returns
 * null for any other event, a non-public token, or a host outside the allowlist.
 */
export function sanitizeEvent(event: CaptureResult | null, publicKey: string, context: BeforeSendContext = { notFound: () => false }): CaptureResult | null {
  if (event === null || (!builtInEvents.includes(event.event) && !customEvents.includes(event.event))) return null
  const properties = event.properties
  const token = properties.token
  if (typeof token !== "string" || token !== publicKey || !/^phc_[A-Za-z0-9_-]+$/u.test(token)) return null
  const rawUrl = typeof properties.$current_url === "string" ? properties.$current_url : null
  let current: URL
  try {
    if (rawUrl === null) return null
    current = new URL(rawUrl)
  } catch {
    return null
  }
  const hostProperty = typeof properties.$host === "string" ? properties.$host : current.hostname
  if (current.protocol !== "https:" || !isAllowedAnalyticsHost(current.hostname) || !isAllowedAnalyticsHost(hostProperty)) return null
  if (properties.$cookieless_mode !== true || properties.distinct_id !== posthogCookielessDistinctId) return null

  const custom = customProperties(event.event, properties)
  if (custom === null) return null

  const sensitive = isSensitivePath(current.pathname) || hasSensitiveLocation(properties)
    || (context.currentPathname !== undefined && isSensitivePath(context.currentPathname))
  const seen = new WeakSet<object>()
  const scrubbed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    // Provider ($-prefixed) properties and attribution are kept and scrubbed;
    // an undeclared unprefixed property (a caller's stray field) is dropped.
    if (!key.startsWith("$") && !providerPlainKeys.has(key) && !attributionSet.has(key)) continue
    const safe = sanitizeValue(key, value, sensitive, 0, seen)
    if (safe !== undefined) scrubbed[key] = safe
  }
  // posthog-js keeps campaign parameters only in person and initial
  // properties, so lift them from the page URL as separate event properties.
  const attribution: Record<string, string> = {}
  if (!sensitive) {
    for (const [key, raw] of current.searchParams) {
      if (!attributionSet.has(key) || Object.hasOwn(attribution, key) || Object.hasOwn(scrubbed, key)) continue
      const kept = redactSensitiveText(raw).slice(0, maxAttributionLength)
      if (kept !== "") attribution[key] = kept
    }
  }
  const rawReferrer = typeof properties.$referrer === "string" ? properties.$referrer : ""
  const route = classifyRoute(current.pathname, context.notFound())
  const traffic = classifyTraffic(rawReferrer, sensitive ? null : rawUrl)

  const sanitized: CaptureResult = {
    ...event,
    properties: {
      ...scrubbed,
      ...attribution,
      ...custom,
      ...route,
      ...traffic,
      $host: publicHostname(current.hostname),
      $current_url: sanitizeUrl(rawUrl, sensitive),
      $cookieless_mode: true,
      $process_person_profile: false,
      analytics_schema_version: analyticsSchemaVersion,
      canonical_domain: canonicalDomain,
      distinct_id: posthogCookielessDistinctId,
      site_id: siteId,
      token,
    },
  }
  return new TextEncoder().encode(JSON.stringify(sanitized)).byteLength <= maxAnalyticsEventBytes ? sanitized : null
}

/**
 * The before_send the site ships: nothing leaves a non-production host, and
 * every event passes sanitizeEvent. The harness uses this same function.
 */
export function createBeforeSend(
  token: string,
  currentLocation: () => Readonly<Pick<Location, "protocol" | "hostname" | "pathname">>,
  notFound: () => boolean,
  isDoNotTrackEnabled: () => boolean = () => false,
): (event: CaptureResult | null) => CaptureResult | null {
  return event => {
    const location = currentLocation()
    return !isDoNotTrackEnabled() && shouldInitializeAnalytics(location, token)
      ? sanitizeEvent(event, token, { notFound, currentPathname: location.pathname })
      : null
  }
}

// --- Budgeted exception reporting (mirrors @hraness/posthog ExceptionBudget) ---

export function sanitizeError(value: unknown): Error {
  try {
    if (!(value instanceof Error)) return new Error("Non-Error rejection")
    const sanitized = new Error(redactSensitiveText(value.message || "Unknown error").slice(0, 512))
    sanitized.name = redactSensitiveText(value.name || "Error").slice(0, 80) || "Error"
    if (value.stack) sanitized.stack = redactSensitiveText(value.stack).slice(0, 6_000)
    return sanitized
  } catch {
    return new Error("Uninspectable rejection")
  }
}

export function errorFingerprint(error: Error): string {
  const frames = error.stack?.split("\n").slice(1, 3).join("\n") ?? ""
  const input = `${error.name}\n${error.message}\n${frames}`
  let hash = 2_166_136_261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `e_${(hash >>> 0).toString(16).padStart(8, "0")}`
}

/** Browser budget from the standard: 20 exceptions a minute, 2 per fingerprint. */
export class ExceptionBudget {
  readonly #total: number
  readonly #perFingerprint: number
  readonly #windowMs: number
  #all: number[] = []
  #byFingerprint = new Map<string, number[]>()

  constructor(total = 20, perFingerprint = 2, windowMs = 60_000) {
    this.#total = total
    this.#perFingerprint = perFingerprint
    this.#windowMs = windowMs
  }

  allow(fingerprint: string, now = Date.now()): boolean {
    const threshold = now - this.#windowMs
    this.#all = this.#all.filter(time => time > threshold)
    for (const [key, times] of this.#byFingerprint) {
      const active = times.filter(time => time > threshold)
      if (active.length === 0) this.#byFingerprint.delete(key)
      else this.#byFingerprint.set(key, active)
    }
    const matching = this.#byFingerprint.get(fingerprint) ?? []
    if (this.#all.length >= this.#total || matching.length >= this.#perFingerprint) return false
    this.#all.push(now)
    matching.push(now)
    this.#byFingerprint.set(fingerprint, matching)
    return true
  }
}

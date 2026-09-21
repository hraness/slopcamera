import type { ObjectProxyConfig } from "./object-proxy.ts"
import type { R2Config } from "./r2.ts"

/**
 * Runtime configuration for the hosted API. Every field comes from the
 * process environment; missing optional groups disable the dependent
 * capability rather than the whole service.
 */
export interface ApiConfig {
  /** Public base URL used in ticket and documentation URLs. */
  readonly publicBaseUrl: string
  /** Signed object-proxy worker credentials; preferred over direct S3. */
  readonly r2Proxy: ObjectProxyConfig | undefined
  readonly r2: R2Config | undefined
  readonly credits:
    | { readonly baseUrl: string; readonly productKey: string }
    | undefined
  /**
   * Per-model provider cost in micro-USD, keyed by exact
   * `provider/model` id. Only listed models may run paid generation;
   * the allowlist is itself the spend bound.
   */
  readonly modelCostsMicroUsd: Readonly<Record<string, number>>
  /** Reported artifact lifetime; the bucket lifecycle enforces it. */
  readonly artifactTtlDays: number
  readonly freeCallsPerHour: number
  readonly renderCallsPerHour: number
  readonly uploadsPerHour: number
  readonly maximumInlineBytes: number
  readonly maximumUploadBytes: number
}

function readInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    return fallback
  }
  return parsed
}

function readModelCosts(raw: string | undefined): Record<string, number> {
  if (raw === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    const costs: Record<string, number> = {}
    for (const [model, microUsd] of Object.entries(parsed)) {
      if (
        /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/iu.test(model) &&
        typeof microUsd === "number" &&
        Number.isInteger(microUsd) &&
        microUsd > 0 &&
        microUsd <= 100_000_000
      ) {
        costs[model] = microUsd
      }
    }
    return costs
  } catch {
    return {}
  }
}

export function readApiConfig(
  env: Record<string, string | undefined>,
): ApiConfig {
  const proxyUrl = env.R2_PROXY_URL
  const proxySecret = env.R2_PROXY_SECRET
  const r2Proxy =
    proxyUrl !== undefined && proxySecret !== undefined
      ? { url: proxyUrl, secret: proxySecret }
      : undefined

  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const r2 =
    accountId !== undefined &&
    accessKeyId !== undefined &&
    secretAccessKey !== undefined
      ? {
          accountId,
          accessKeyId,
          secretAccessKey,
          bucket: env.R2_BUCKET ?? "slopcamera-api-artifacts",
          ...(env.R2_ENDPOINT === undefined
            ? {}
            : { endpoint: env.R2_ENDPOINT }),
        }
      : undefined

  const productKey = env.SLOPCAMERA_API_CREDITS_PRODUCT_KEY
  const credits =
    productKey !== undefined
      ? {
          baseUrl: env.CREDITS_BASE_URL ?? "https://credits.hraness.com",
          productKey,
        }
      : undefined

  return {
    publicBaseUrl:
      env.SLOPCAMERA_API_BASE_URL?.replace(/\/+$/, "") ??
      "http://localhost:8787",
    r2Proxy,
    r2,
    credits,
    modelCostsMicroUsd: readModelCosts(env.SLOPCAMERA_API_MODEL_COSTS_JSON),
    artifactTtlDays: readInteger(env.SLOPCAMERA_API_ARTIFACT_TTL_DAYS, 7, 1, 30),
    freeCallsPerHour: readInteger(env.SLOPCAMERA_API_FREE_CALLS_PER_HOUR, 120, 1, 10_000),
    renderCallsPerHour: readInteger(env.SLOPCAMERA_API_RENDER_CALLS_PER_HOUR, 30, 1, 1_000),
    uploadsPerHour: readInteger(env.SLOPCAMERA_API_UPLOADS_PER_HOUR, 60, 1, 1_000),
    maximumInlineBytes: readInteger(env.SLOPCAMERA_API_MAX_INLINE_BYTES, 4 * 1024 * 1024, 1024, 16 * 1024 * 1024),
    maximumUploadBytes: readInteger(env.SLOPCAMERA_API_MAX_UPLOAD_BYTES, 32 * 1024 * 1024, 1024, 256 * 1024 * 1024),
  }
}

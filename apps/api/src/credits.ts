import { ApiError, isRecord } from "./errors.js"

/**
 * Narrow client for the Hraness Credits product-backend routes.
 *
 * The API holds a ceiling before any provider call, settles with the
 * reported upstream cost after success, and releases on failure. Margin
 * lives inside Credits' pricing revision; this client never sees it.
 *
 * Device tokens (`cr_dev_…`) are used once per hold and never stored or
 * logged.
 */

export interface CreditsHold {
  readonly holdId: string
  readonly ceilingMicroUsd: number
}

export interface CreditsTopup {
  readonly claimId: string
  readonly url: string
  readonly expiresAt?: string
}

export class CreditsShortfall extends Error {
  constructor(
    readonly required: Record<string, unknown> | undefined,
    readonly balance: Record<string, unknown> | undefined,
    readonly topup: CreditsTopup | undefined,
  ) {
    super("The caller's credit balance cannot cover this operation.")
  }
}

export interface CreditsClientOptions {
  readonly baseUrl: string
  readonly productKey: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}

interface HoldSuccess {
  readonly holdId: string
  readonly ceilingMicroUsd: number
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

export class CreditsClient {
  private readonly baseUrl: string
  private readonly productKey: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: CreditsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.productKey = options.productKey
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.productKey}`,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      })
      return { status: response.status, json: await parseJson(response) }
    } catch (error) {
      if (error instanceof ApiError || error instanceof CreditsShortfall) {
        throw error
      }
      throw new ApiError(
        503,
        "billing_unavailable",
        "The billing service could not be reached.",
      )
    } finally {
      clearTimeout(timer)
    }
  }

  async hold(options: {
    subjectToken: string
    operation: string
    ceilingMicroUsd: number
    idempotencyKey: string
    context?: Record<string, string>
  }): Promise<HoldSuccess> {
    const { status, json } = await this.request("POST", "/v1/holds", {
      subjectToken: options.subjectToken,
      operation: options.operation,
      ceilingMicroUsd: options.ceilingMicroUsd,
      idempotencyKey: options.idempotencyKey,
      ...(options.context === undefined ? {} : { context: options.context }),
    })
    if (status === 201 && isRecord(json) && typeof json.holdId === "string") {
      return {
        holdId: json.holdId,
        ceilingMicroUsd:
          typeof json.ceilingMicroUsd === "number"
            ? json.ceilingMicroUsd
            : options.ceilingMicroUsd,
      }
    }
    if (status === 402 && isRecord(json)) {
      throw new CreditsShortfall(
        isRecord(json.required) ? json.required : undefined,
        isRecord(json.balance) ? json.balance : undefined,
        isRecord(json.topup)
          ? {
              claimId: String(json.topup.claimId ?? ""),
              url: String(json.topup.url ?? ""),
              ...(typeof json.topup.expiresAt === "string"
                ? { expiresAt: json.topup.expiresAt }
                : {}),
            }
          : undefined,
      )
    }
    if (status === 401 || status === 403) {
      throw new ApiError(
        401,
        "unauthorized",
        "The credential was rejected by the billing service.",
      )
    }
    throw new ApiError(
      503,
      "billing_unavailable",
      "The billing service could not authorize this operation.",
    )
  }

  async settle(
    holdId: string,
    costs: ReadonlyArray<{
      provider: string
      operation: string
      microUsd: number
      basis: "reported" | "contractual" | "estimated" | "unknown"
    }>,
  ): Promise<void> {
    const { status } = await this.request(
      "POST",
      `/v1/holds/${encodeURIComponent(holdId)}/settle`,
      { costs: [...costs] },
    )
    if (status !== 200) {
      throw new ApiError(
        503,
        "billing_unavailable",
        "The billing service could not settle this operation.",
      )
    }
  }

  async release(holdId: string): Promise<void> {
    const { status } = await this.request(
      "POST",
      `/v1/holds/${encodeURIComponent(holdId)}/release`,
      {},
    )
    if (status !== 200) {
      throw new ApiError(
        503,
        "billing_unavailable",
        "The billing service could not release this operation's hold.",
      )
    }
  }
}

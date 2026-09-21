/**
 * In-memory token buckets keyed by client identity. Per-process and
 * best-effort: serverless replicas each carry their own bucket, which is
 * acceptable admission control for anonymous traffic; paid calls are
 * bounded by Credits holds, not by this limiter.
 */

interface Bucket {
  tokens: number
  updatedAt: number
}

const MAX_KEYS = 10_000

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  /**
   * Returns the seconds until retry, or 0 when the call is admitted.
   * `perHour` is the refill rate; the burst equals `burst`.
   */
  check(key: string, perHour: number, burst: number, now = Date.now()): number {
    if (this.buckets.size > MAX_KEYS && !this.buckets.has(key)) {
      this.evict(now)
    }
    const existing = this.buckets.get(key)
    const bucket: Bucket =
      existing === undefined
        ? { tokens: burst, updatedAt: now }
        : {
            tokens: Math.min(
              burst,
              existing.tokens + ((now - existing.updatedAt) / 3_600_000) * perHour,
            ),
            updatedAt: now,
          }
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket)
      const deficitMs = ((1 - bucket.tokens) / perHour) * 3_600_000
      return Math.ceil(deficitMs / 1000)
    }
    bucket.tokens -= 1
    this.buckets.set(key, bucket)
    return 0
  }

  private evict(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > 3_600_000) this.buckets.delete(key)
      if (this.buckets.size <= MAX_KEYS) break
    }
  }
}

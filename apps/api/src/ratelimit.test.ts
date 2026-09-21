import { describe, expect, test } from "bun:test"
import { RateLimiter } from "./ratelimit.ts"

describe("RateLimiter", () => {
  test("admits a burst then throttles with a retry hint", () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < 4; i += 1) {
      expect(limiter.check("ip:1", 60, 4, 1_000)).toBe(0)
    }
    expect(limiter.check("ip:1", 60, 4, 1_000)).toBeGreaterThan(0)
  })

  test("refills over time", () => {
    const limiter = new RateLimiter()
    expect(limiter.check("ip:2", 3_600, 1, 0)).toBe(0)
    expect(limiter.check("ip:2", 3_600, 1, 0)).toBeGreaterThan(0)
    // 3_600/hour = one token per second.
    expect(limiter.check("ip:2", 3_600, 1, 2_000)).toBe(0)
  })

  test("isolates keys", () => {
    const limiter = new RateLimiter()
    expect(limiter.check("a", 10, 1, 0)).toBe(0)
    expect(limiter.check("b", 10, 1, 0)).toBe(0)
  })
})

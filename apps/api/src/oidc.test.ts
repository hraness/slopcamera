import { describe, expect, test } from "bun:test"
import { toolEnvironmentWithOidc } from "./oidc.js"

describe("vercel adapter", () => {
  test("forwards x-vercel-oidc-token into the tool environment", () => {
    const env = toolEnvironmentWithOidc(
      { AI_GATEWAY_API_KEY: undefined, OTHER: "kept" },
      "  oidc-token-value  ",
    )
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: undefined,
      OTHER: "kept",
      VERCEL_OIDC_TOKEN: "oidc-token-value",
    })
  })

  test("leaves the environment untouched without a usable header", () => {
    const base = { VERCEL_OIDC_TOKEN: "from-env" }
    expect(toolEnvironmentWithOidc(base, undefined)).toBeUndefined()
    expect(toolEnvironmentWithOidc(base, "   ")).toBeUndefined()
    expect(toolEnvironmentWithOidc(base, [])).toBeUndefined()
    expect(
      toolEnvironmentWithOidc(base, "x".repeat(16_385)),
    ).toBeUndefined()
  })

  test("prefers the request token over an environment value", () => {
    const env = toolEnvironmentWithOidc(
      { VERCEL_OIDC_TOKEN: "stale-env-token" },
      ["fresh-request-token"],
    )
    expect(env?.VERCEL_OIDC_TOKEN).toBe("fresh-request-token")
  })
})

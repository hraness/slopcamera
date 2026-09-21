import { createHash, createHmac } from "node:crypto"
import { describe, expect, test } from "bun:test"
import { R2Store } from "./r2.ts"

const config = {
  accountId: "testaccount123",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "slopcamera-api-artifacts",
}

const store = new R2Store(config)

describe("R2Store presigning", () => {
  test("produces a SigV4 presigned PUT with required headers", () => {
    const first = store.presignPut("u/abc", {
      contentType: "image/png",
      maxBytes: 100,
      expiresSeconds: 900,
    })
    const url = new URL(first.url)
    expect(url.host).toBe(
      "slopcamera-api-artifacts.testaccount123.r2.cloudflarestorage.com",
    )
    expect(url.pathname).toBe("/u/abc")
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256")
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(
      /^test-access-key\/\d{8}\/auto\/s3\/aws4_request$/u,
    )
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-type;host",
    )
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900")
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/u)
    expect(first.headers["content-type"]).toBe("image/png")
  })

  test("signature recomputes over the canonical request", () => {
    const { url } = { url: store.presignGet("a/id/file.png", 3600) }
    const parsed = new URL(url)
    const credential = parsed.searchParams.get("X-Amz-Credential") ?? ""
    const [accessKeyId, dateStamp, region, service] = credential.split("/")
    expect(accessKeyId).toBe(config.accessKeyId)
    expect(region).toBe("auto")
    expect(service).toBe("s3")

    const signedHeaders = parsed.searchParams.get("X-Amz-SignedHeaders") ?? ""
    const canonicalHeaders = `host:${parsed.host}\n`
    const canonicalQuery = [
      "X-Amz-Algorithm=AWS4-HMAC-SHA256",
      `X-Amz-Credential=${encodeURIComponent(credential)}`,
      `X-Amz-Date=${parsed.searchParams.get("X-Amz-Date")}`,
      "X-Amz-Expires=3600",
      `X-Amz-SignedHeaders=${encodeURIComponent(signedHeaders)}`,
    ].join("&")
    const canonicalRequest = [
      "GET",
      "/a/id/file.png",
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      "UNSIGNED-PAYLOAD",
    ].join("\n")

    const scope = `${dateStamp}/${region}/${service}/aws4_request`
    const keyDate = createHmac("sha256", `AWS4${config.secretAccessKey}`)
      .update(dateStamp ?? "")
      .digest()
    const keyRegion = createHmac("sha256", keyDate).update("auto").digest()
    const keyService = createHmac("sha256", keyRegion).update("s3").digest()
    const keySigning = createHmac("sha256", keyService)
      .update("aws4_request")
      .digest()
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      parsed.searchParams.get("X-Amz-Date"),
      scope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n")
    const expected = createHmac("sha256", keySigning)
      .update(stringToSign)
      .digest("hex")
    expect(parsed.searchParams.get("X-Amz-Signature")).toBe(expected)
  })

  test("URL-encodes path segments", () => {
    const url = store.presignGet("a/some id/file name.png", 60)
    expect(new URL(url).pathname).toBe("/a/some%20id/file%20name.png")
  })
})

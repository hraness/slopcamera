import { z } from "zod"
import { boundedCanonicalJsonSha256 } from "../code/canonical-json.js"
import {
  HOSTED_LIMITS, HostedContractError, HostedKeySchema, HostedJobIdSchema, HostedDigestSchema,
  parseHostedImageRequest, parseHostedQuote, parseHostedValue,
  type HostedImageRequest, type HostedQuote,
} from "./contracts.js"

function digest(domain: string, value: unknown): string {
  return boundedCanonicalJsonSha256(value, {
    maximumBytes: HOSTED_LIMITS.jsonBytes,
    maximumDepth: HOSTED_LIMITS.jsonDepth, maximumValues: HOSTED_LIMITS.jsonValues,
    name: "Hosted identity",
  }, `${domain}\n`)
}

export function hostedEffectSha256(input: unknown): string {
  return digest("slopcamera.hosted-effect.v1", parseHostedImageRequest(input))
}

export function bindHostedAuthorization(requestInput: unknown, quoteInput: unknown): {
  readonly request: HostedImageRequest; readonly quote: HostedQuote
  readonly effectSha256: string; readonly authorizationSha256: string
} {
  const request = parseHostedImageRequest(requestInput)
  const quote = parseHostedQuote(quoteInput)
  const effectSha256 = hostedEffectSha256(request)
  if (quote.effectSha256 !== effectSha256 || quote.catalogRevision !== request.catalogRevision) {
    throw new HostedContractError("identity-conflict", "Quote does not authorize this media request.")
  }
  return Object.freeze({ request, quote, effectSha256,
    authorizationSha256: digest("slopcamera.hosted-authorization.v1", { effectSha256, quote }),
  })
}

/** Authentication supplies subjectKey; this module does not derive it from a token. */
export function hostedRequestKeySha256(input: unknown): string {
  return digest("slopcamera.hosted-request-key.v1", parseHostedValue(HostedKeySchema, input))
}

export function hostedHoldKey(keyInput: unknown, jobIdInput: unknown): string {
  const key = parseHostedValue(HostedKeySchema, keyInput)
  const jobId = parseHostedValue(HostedJobIdSchema, jobIdInput)
  return `slopcamera:${key.environment}:job:${jobId}`
}

/** Pure comparison only. The job store must enforce the tuple's unique index. */
export function compareHostedReplay(
  existingInput: unknown,
  keyInput: unknown, requestInput: unknown, quoteInput: unknown,
): "same-request" | "different-key" {
  const existing = parseHostedValue(z.strictObject({ key: HostedKeySchema, authorizationSha256: HostedDigestSchema }), existingInput)
  const key = parseHostedValue(HostedKeySchema, keyInput)
  if (hostedRequestKeySha256(existing.key) !== hostedRequestKeySha256(key)) return "different-key"
  const authorization = bindHostedAuthorization(requestInput, quoteInput)
  if (existing.authorizationSha256 !== authorization.authorizationSha256) {
    throw new HostedContractError("identity-conflict", "Request identity already names a different authorization.")
  }
  return "same-request"
}

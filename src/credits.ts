import {
  buildCreditsRequiredEnvelope,
  isCreditsClaimId,
  isCreditsOperation,
  isCreditsPackId,
  isCreditsTimestamp,
  isCreditsUrl,
  isMicroUsd,
  parseCreditsPack,
  type CreditsPack,
  type CreditsProductProfile,
  type CreditsRequiredEnvelope,
} from "@hraness/credits-foundation"
import {
  emitCreditsRequired,
  runCreditsCommand,
  type CreditsAudience,
  type CreditsCommandIo,
  type CreditsOutput,
} from "@hraness/credits-foundation/node"

/** Hosted requests forward the stored credits device token in this header. */
export const SLOPCAMERA_CREDITS_SUBJECT_HEADER = "x-hraness-credits-subject"
/** Product ID registered with the Hraness credits service. */
export const SLOPCAMERA_CREDITS_PRODUCT_ID = "slopcamera"
/** The one metered operation the hosted gateway holds and settles. */
export const SLOPCAMERA_IMAGE_GENERATE_OPERATION = "image_generate"
/**
 * `slopcamera image generate --hosted` exits with the local host's existing
 * `authorization-required` code when the person must add credits first: the
 * paid-call grant is missing, and no new row was added to the exit-code table.
 */
export const slopcameraCreditsRequiredExitCode = 10

const MAX_RESUME_ARGV = 32
const MAX_RESUME_ARGUMENT = 256
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u
const CREDITS_REQUIRED_REASONS = ["insufficient_credits", "subject_missing", "subject_rejected"] as const

export type SlopcameraCreditsRequiredReason = (typeof CREDITS_REQUIRED_REASONS)[number]
export type SlopcameraCreditsMoney = Readonly<{ microUsd: number; credits: number; usd: string }>
export type SlopcameraCreditsTopup = Readonly<{
  claimId: string
  url: string
  expiresAt: string
  packs: readonly CreditsPack[]
  suggestedPackId: string
}>
/** The gateway's `402 credits_required` body: the service's payment payload when it has one, otherwise guidance only. */
export type SlopcameraCreditsRequiredPayload = Readonly<{
  error: "credits_required"
  message: string
  operation: string
  reason: SlopcameraCreditsRequiredReason
  required?: SlopcameraCreditsMoney
  balance?: SlopcameraCreditsMoney & Readonly<{ availableMicroUsd: number }>
  topup?: SlopcameraCreditsTopup
}>

/** Hosted generation cannot proceed until the person adds credits; the payload feeds the handoff envelope. */
export class SlopcameraCreditsRequiredError extends Error {
  readonly payload: SlopcameraCreditsRequiredPayload

  constructor(payload: SlopcameraCreditsRequiredPayload) {
    super(payload.message)
    this.name = "SlopcameraCreditsRequiredError"
    this.payload = payload
  }
}

/**
 * Slopcamera's product profile for the Hraness credits service. `command` is
 * argv, never shell text; every command array the credits protocol prints
 * starts with it. The service origin can be overridden for local testing.
 */
export function creditsProfile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CreditsProductProfile {
  const serviceOrigin = env.SLOPCAMERA_CREDITS_SERVICE_ORIGIN
  return {
    id: SLOPCAMERA_CREDITS_PRODUCT_ID,
    name: "Slopcamera",
    command: ["slopcamera"],
    ...(serviceOrigin === undefined || serviceOrigin === "" ? {} : { serviceOrigin }),
  }
}

/** `slopcamera credits …`: the shared credits protocol with Slopcamera's product profile. Returns the exit code. */
export async function runProductCreditsCommand(
  args: readonly string[],
  options: CreditsCommandIo = {},
): Promise<number> {
  const io: CreditsCommandIo = {
    stdout: process.stdout,
    stderr: process.stderr,
    ...options,
  }
  const result = await runCreditsCommand(creditsProfile(options.env ?? process.env), args, io)
  return result.exitCode
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value)
  return required.every(key => keys.includes(key))
    && keys.every(key => required.includes(key) || optional.includes(key))
}

function isUsdString(value: unknown): value is string {
  return typeof value === "string" && /^-?\d{1,10}\.\d{2}$/u.test(value)
}

function parseMoney(value: unknown): SlopcameraCreditsMoney | null {
  if (!isRecord(value) || !exactKeys(value, ["microUsd", "credits", "usd"])
    || !isMicroUsd(value.microUsd) || !Number.isSafeInteger(value.credits) || !isUsdString(value.usd)) return null
  return Object.freeze({ microUsd: value.microUsd, credits: value.credits as number, usd: value.usd })
}

function parseTopup(value: unknown): SlopcameraCreditsTopup | null {
  if (!isRecord(value) || !exactKeys(value, ["claimId", "url", "expiresAt", "packs", "suggestedPackId"])
    || !isCreditsClaimId(value.claimId) || !isCreditsUrl(value.url) || !isCreditsTimestamp(value.expiresAt)
    || !isCreditsPackId(value.suggestedPackId) || !Array.isArray(value.packs)
    || value.packs.length < 1 || value.packs.length > 16) return null
  const packs: CreditsPack[] = []
  for (const item of value.packs) {
    const pack = parseCreditsPack(item)
    if (pack === null) return null
    packs.push(pack)
  }
  return Object.freeze({
    claimId: value.claimId,
    url: value.url,
    expiresAt: value.expiresAt,
    packs: Object.freeze(packs),
    suggestedPackId: value.suggestedPackId,
  })
}

/** Parse a foreign `402` body; `null` when it is not a credits-required envelope this version can read. */
export function parseSlopcameraCreditsRequiredPayload(value: unknown): SlopcameraCreditsRequiredPayload | null {
  if (!isRecord(value) || !exactKeys(value, ["error", "message", "operation", "reason"], ["required", "balance", "topup"])
    || value.error !== "credits_required" || typeof value.message !== "string" || value.message.length > 2_000
    || UNSAFE_TEXT.test(value.message.replaceAll("\n", " ")) || !isCreditsOperation(value.operation)
    || !CREDITS_REQUIRED_REASONS.includes(value.reason as SlopcameraCreditsRequiredReason)) return null
  const required = value.required === undefined ? undefined : parseMoney(value.required)
  const topup = value.topup === undefined ? undefined : parseTopup(value.topup)
  let balance: (SlopcameraCreditsMoney & { availableMicroUsd: number }) | null | undefined
  if (value.balance !== undefined) {
    if (!isRecord(value.balance) || !isMicroUsd(value.balance.availableMicroUsd)) return null
    const { availableMicroUsd, ...rest } = value.balance
    const money = parseMoney(rest)
    balance = money === null ? null : { ...money, availableMicroUsd }
  }
  if (required === null || topup === null || balance === null) return null
  return Object.freeze({
    error: "credits_required",
    message: value.message,
    operation: value.operation,
    reason: value.reason as SlopcameraCreditsRequiredReason,
    ...(required === undefined ? {} : { required }),
    ...(balance === undefined ? {} : { balance: Object.freeze(balance) }),
    ...(topup === undefined ? {} : { topup }),
  })
}

/**
 * The command to rerun after payment. The envelope bounds argv to 32 plain
 * items, so an unrepresentable invocation falls back to a manual resume of the
 * command family rather than a truncated, misleading argv.
 */
function resumeCommand(argv: readonly string[]): Readonly<{ argv: readonly string[]; automatic: boolean }> {
  const full = ["slopcamera", ...argv]
  const representable = full.length <= MAX_RESUME_ARGV && full.every(argument => (
    argument.length > 0 && argument.length <= MAX_RESUME_ARGUMENT
    && argument.trim() === argument && !UNSAFE_TEXT.test(argument)
  ))
  return representable
    ? { argv: full, automatic: true }
    : { argv: ["slopcamera", "image", "generate"], automatic: false }
}

/**
 * Print the `hraness-credits-required-v1` handoff for a hosted generation that
 * cannot proceed: one JSON line for agents, a few plain lines for people.
 * Returns false when the gateway's answer carried no payment payload, so the
 * caller falls back to its ordinary error message. Never throws; output
 * failures cannot change the exit code.
 */
export async function emitProductCreditsRequired(
  error: SlopcameraCreditsRequiredError,
  options: Readonly<{
    argv: readonly string[]
    audience: CreditsAudience
    env?: Readonly<Record<string, string | undefined>>
    stderr?: CreditsOutput
  }>,
): Promise<boolean> {
  const payload = error.payload
  if (payload.required === undefined || payload.balance === undefined || payload.topup === undefined) return false
  const profile = creditsProfile(options.env ?? process.env)
  let envelope: CreditsRequiredEnvelope
  try {
    envelope = buildCreditsRequiredEnvelope({
      product: { id: profile.id, name: profile.name },
      command: profile.command,
      operation: payload.operation,
      requiredMicroUsd: payload.required.microUsd,
      balanceMicroUsd: payload.balance.microUsd,
      topup: {
        url: payload.topup.url,
        expiresAt: payload.topup.expiresAt,
        packs: payload.topup.packs.map(pack => ({
          id: pack.id, usd: pack.usd, credits: pack.credits, bonusCredits: pack.bonusCredits,
        })),
        suggestedPackId: payload.topup.suggestedPackId,
      },
      resume: resumeCommand(options.argv),
    })
  } catch {
    return false
  }
  return emitCreditsRequired(envelope, options.stderr === undefined ? {} : { stderr: options.stderr }, options.audience)
}

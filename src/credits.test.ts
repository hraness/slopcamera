import { describe, expect, test } from "bun:test"
import type { CreditsOutput } from "@hraness/credits-foundation/node"
import {
  SlopcameraCreditsRequiredError,
  creditsProfile,
  emitProductCreditsRequired,
  parseSlopcameraCreditsRequiredPayload,
  runProductCreditsCommand,
  slopcameraCreditsRequiredExitCode,
} from "./credits.ts"

const shortfall = {
  error: "credits_required",
  message: "Slopcamera needs $0.31 in credits for hosted image generation; this device has $0.00 available.",
  operation: "image_generate",
  reason: "insufficient_credits",
  required: { microUsd: 312500, credits: 31, usd: "0.31" },
  balance: { microUsd: 0, credits: 0, usd: "0.00", availableMicroUsd: 0 },
  topup: {
    claimId: "clm_8f3k2q",
    url: "https://credits.hraness.com/t/clm_8f3k2q",
    expiresAt: "2026-09-17T22:00:00Z",
    packs: [{ id: "p10", usd: 10, credits: 1000, bonusCredits: 0 }, { id: "p25", usd: 25, credits: 2500, bonusCredits: 150, label: "$25 pack" }],
    suggestedPackId: "p25",
  },
} as const

function sink(): CreditsOutput & { text: string } {
  const output = {
    text: "",
    write(text: string, callback?: (error?: Error | null) => void) {
      output.text += text
      callback?.(null)
      return true
    },
  }
  return output
}

describe("Slopcamera credits", () => {
  test("uses the Slopcamera product profile with an optional service origin override", () => {
    expect(creditsProfile({})).toEqual({ id: "slopcamera", name: "Slopcamera", command: ["slopcamera"] })
    expect(creditsProfile({ SLOPCAMERA_CREDITS_SERVICE_ORIGIN: "http://127.0.0.1:4300" })).toEqual({
      id: "slopcamera", name: "Slopcamera", command: ["slopcamera"], serviceOrigin: "http://127.0.0.1:4300",
    })
    expect(slopcameraCreditsRequiredExitCode).toBe(10)
  })

  test("describes the protocol locally without state or network", async () => {
    const stdout = sink()
    const stderr = sink()
    const exitCode = await runProductCreditsCommand(["protocol", "--json"], { stdout, stderr, env: {} })
    expect(exitCode).toBe(0)
    expect(stderr.text).toBe("")
    const protocol = JSON.parse(stdout.text)
    expect(protocol).toMatchObject({
      schemaVersion: "hraness-credits-protocol-v1",
      product: { id: "slopcamera", name: "Slopcamera" },
      serviceOrigin: "https://credits.hraness.com",
      commands: {
        status: ["slopcamera", "credits", "status", "--json"],
        wait: ["slopcamera", "credits", "wait", "--json"],
        email: ["slopcamera", "credits", "email", "--to", "{address}"],
      },
    })
  })

  test("prints exactly one hraness-credits-required-v1 line for agents with the original argv as resume", async () => {
    const stderr = sink()
    const argv = ["image", "generate", "one literal illustration", "--output", "illustration.webp", "--hosted", "--json"]
    const printed = await emitProductCreditsRequired(new SlopcameraCreditsRequiredError(shortfall), {
      argv, audience: "agent", env: {}, stderr,
    })
    expect(printed).toBe(true)
    const lines = stderr.text.split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe("")
    const envelope = JSON.parse(lines[0]!)
    expect(envelope).toEqual({
      schemaVersion: "hraness-credits-required-v1",
      product: { id: "slopcamera", name: "Slopcamera" },
      operation: "image_generate",
      required: { microUsd: 312500, credits: 31, usd: "0.31" },
      balance: { microUsd: 0, credits: 0, usd: "0.00" },
      topup: {
        url: "https://credits.hraness.com/t/clm_8f3k2q",
        expiresAt: "2026-09-17T22:00:00Z",
        packs: [{ id: "p10", usd: 10, credits: 1000, bonusCredits: 0 }, { id: "p25", usd: 25, credits: 2500, bonusCredits: 150 }],
        suggestedPackId: "p25",
      },
      commands: {
        status: ["slopcamera", "credits", "status", "--json"],
        wait: ["slopcamera", "credits", "wait", "--json"],
        email: ["slopcamera", "credits", "email", "--to", "{address}"],
      },
      resume: { argv: ["slopcamera", ...argv], automatic: true },
      instructions: "Show the person the link and the price in plain words. Offer to email the link with the email command if they are not at this terminal. After payment, run the wait command or rerun the original command; the work resumes. Do not retry before payment, never enter card details, and never open the link yourself.",
    })
  })

  test("renders plain lines for people and falls back to a manual resume for unrepresentable argv", async () => {
    const stderr = sink()
    const printed = await emitProductCreditsRequired(new SlopcameraCreditsRequiredError(shortfall), {
      argv: ["image", "generate", "line\nbreak", "--output", "x.webp", "--hosted"], audience: "human", env: {}, stderr,
    })
    expect(printed).toBe(true)
    expect(stderr.text).toContain("Slopcamera needs $0.31 in credits for image_generate; this device has $0.00.")
    expect(stderr.text).toContain("After payment, run slopcamera credits wait, then rerun slopcamera image generate.")
    const guidanceOnly = sink()
    expect(await emitProductCreditsRequired(new SlopcameraCreditsRequiredError({
      error: "credits_required", message: "Set up credits first.", operation: "image_generate", reason: "subject_missing",
    }), { argv: [], audience: "agent", env: {}, stderr: guidanceOnly })).toBe(false)
    expect(guidanceOnly.text).toBe("")
  })

  test("parses only exact credits-required payloads", () => {
    expect(parseSlopcameraCreditsRequiredPayload(shortfall)).toEqual(shortfall)
    expect(parseSlopcameraCreditsRequiredPayload({ ...shortfall, extra: 1 })).toBeNull()
    expect(parseSlopcameraCreditsRequiredPayload({ ...shortfall, reason: "later" })).toBeNull()
    expect(parseSlopcameraCreditsRequiredPayload({ ...shortfall, required: { microUsd: 1.5, credits: 0, usd: "0.00" } })).toBeNull()
    expect(parseSlopcameraCreditsRequiredPayload({ ...shortfall, topup: { ...shortfall.topup, url: "http://credits.example/t/x" } })).toBeNull()
    expect(parseSlopcameraCreditsRequiredPayload({ error: "insufficient_credits", message: "", operation: "image_generate", reason: "insufficient_credits" })).toBeNull()
  })
})

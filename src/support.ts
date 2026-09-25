import {
  maybeShowSupportInvitation,
  runSupportCommand,
  type SupportCommandOptions,
} from "@hraness/support-foundation/node"

export const supportProfile = {
  id: "slopcamera",
  name: "Slopcamera",
  valueProposition: "Support ongoing development of local media tools for agents.",
  updates: false,
} as const

/** Called only by the real process entrypoint; imported CLI and SDK calls stay inert. */
export function standaloneSupportEnvironment(): Readonly<Record<string, string | undefined>> {
  const env = { ...process.env }
  process.env.HRANESS_SUPPORT_AUDIENCE = "off"
  process.env.HRANESS_SUPPORT_EMAIL = "off"
  return env
}

export async function runProductSupportCommand(
  args: readonly string[],
  options: SupportCommandOptions = {},
): Promise<number> {
  const result = await runSupportCommand(supportProfile, args, {
    command: ["slopcamera"], ...options, gitEmail: false,
  })
  if (result.stdout !== "") process.stdout.write(result.stdout)
  if (result.stderr !== "") process.stderr.write(result.stderr)
  return result.exitCode
}

export async function showProductSupportInvitation(options: SupportCommandOptions = {}): Promise<void> {
  try {
    await maybeShowSupportInvitation(supportProfile, {
      usefulResult: true, command: ["slopcamera"], ...options, gitEmail: false,
    })
  } catch {
    // Optional support must not alter the completed task or its stdout.
  }
}

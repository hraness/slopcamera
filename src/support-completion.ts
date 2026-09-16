/** Content-free notification after useful output and owned cleanup complete. */
export type UsefulResultObserver = () => void | Promise<void>

export function reportUsefulResult(observer: UsefulResultObserver | undefined): void {
  try {
    if (observer !== undefined) void Promise.resolve(observer()).catch(() => undefined)
  } catch {
    // Optional presentation cannot change a completed operation's outcome.
  }
}

export function quietSupportChildEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return { ...env, HRANESS_SUPPORT_AUDIENCE: "off", HRANESS_SUPPORT_EMAIL: "off" }
}

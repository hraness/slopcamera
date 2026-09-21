/**
 * Vercel delivers the project OIDC token on the function Request as the
 * `x-vercel-oidc-token` header, never through `process.env` at runtime.
 * Forward it into the per-call tool environment as `VERCEL_OIDC_TOKEN` so the
 * Gateway credential chain resolves it exactly as local `vercel env pull`
 * does. Returns undefined when no usable token arrived.
 */
export function toolEnvironmentWithOidc(
  base: Record<string, string | undefined>,
  header: string | string[] | undefined,
): Record<string, string | undefined> | undefined {
  const raw = Array.isArray(header) ? header[0] : header
  const token = raw?.trim()
  if (token === undefined || token.length === 0 || token.length > 16_384) {
    return undefined
  }
  return { ...base, VERCEL_OIDC_TOKEN: token }
}

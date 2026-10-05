import { spawnSync } from "node:child_process"

/**
 * Only site content/implementation directories, never workspace manifests.
 * apps/api/src/api-deploy-selection.test.ts guards local module/static-asset
 * imports. Future API filesystem reads from these directories must remove
 * those paths from skip eligibility; import analysis cannot prove such reads.
 */
export function apiUnaffectedByPaths(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every((path) =>
    /^(?:apps\/web\/(?:src|public|media|scripts)\/)/u.test(path)
    && !path.split("/").some((part) => part === ".." || part === "." || part === "")
    && !/(?:^|\/)(?:package\.json|bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bunfig\.toml|\.[^/]+)$/u.test(path))
}

export function canSkipApiBuild(root: string, previous: string | undefined, current: string | undefined): boolean {
  if (!previous || !current || !/^[a-f0-9]{40}$/u.test(previous) || !/^[a-f0-9]{40}$/u.test(current)) return false
  const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" })
  if (git("rev-parse", "--verify", "HEAD").stdout?.trim() !== current) return false
  if (git("cat-file", "-e", `${previous}^{commit}`).status !== 0) return false
  if (git("merge-base", "--is-ancestor", previous, current).status !== 0) return false
  const diff = git("diff", "--no-renames", "--name-only", "-z", previous, current, "--")
  if (diff.status !== 0 || diff.error) return false
  return apiUnaffectedByPaths(diff.stdout.split("\0").filter(Boolean))
}

if (import.meta.main) {
  // Vercel runs this before install: unavailable history or uncertain input
  // always builds. Empty diffs also build, preserving explicit redeploys.
  let skip = false
  try {
    skip = canSkipApiBuild(process.cwd(), process.env.VERCEL_GIT_PREVIOUS_SHA, process.env.VERCEL_GIT_COMMIT_SHA)
  } catch {
    // An optimization must never prevent a deployment on an unknown input.
  }
  console.log(skip ? "API unchanged: website-only changes; skipping API build." : "Building API: shared, API, or unverified inputs.")
  process.exitCode = skip ? 0 : 1
}

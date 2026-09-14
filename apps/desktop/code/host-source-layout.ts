import { basename, dirname, join, resolve } from "node:path";

export interface HostSourceRoots {
  /**
   * True when the running module is inside the committed bundle at
   * apps/desktop/dist/cli. A bundled host still spawns the checked TypeScript
   * sources below apps/desktop and src/.
   */
  readonly bundled: boolean;
  /** The installed apps/desktop source directory. */
  readonly desktopRoot: string;
  /** The checkout or package root containing src/, packages/, and package.json. */
  readonly repositoryRoot: string;
}

/**
 * Walks to the apps/desktop anchor instead of assuming a fixed module depth.
 * From a checkout, caller modules sit below apps/desktop/<area>/; inside the
 * committed bundle they all share apps/desktop/dist/cli.
 */
export function hostSourceRoots(moduleDirectory: string): HostSourceRoots {
  const requested = resolve(moduleDirectory);
  let candidate = requested;
  while (true) {
    if (basename(candidate) === "desktop" && basename(dirname(candidate)) === "apps") {
      return {
        bundled: requested === join(candidate, "dist", "cli"),
        desktopRoot: candidate,
        repositoryRoot: dirname(dirname(candidate)),
      };
    }
    const parent = dirname(candidate);
    if (parent === candidate) {
      // Embedded compiled-binary modules and foreign callers keep the
      // historical assumption that the module sits one level below
      // apps/desktop.
      const desktopRoot = resolve(requested, "..");
      return {
        bundled: false,
        desktopRoot,
        repositoryRoot: resolve(desktopRoot, "../.."),
      };
    }
    candidate = parent;
  }
}

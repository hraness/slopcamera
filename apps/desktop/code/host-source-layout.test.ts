import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { hostSourceRoots } from "./host-source-layout";

describe("host source layout", () => {
  test("maps a checked-out apps/desktop source module", () => {
    const roots = hostSourceRoots(join("/", "work", "repo", "apps", "desktop", "code"));
    expect(roots).toEqual({
      bundled: false,
      desktopRoot: join("/", "work", "repo", "apps", "desktop"),
      repositoryRoot: join("/", "work", "repo"),
    });
  });

  test("maps nested checked-out source modules to the same roots", () => {
    const roots = hostSourceRoots(
      join("/", "work", "repo", "apps", "desktop", "application", "operations", "analysis"),
    );
    expect(roots.bundled).toBe(false);
    expect(roots.desktopRoot).toBe(join("/", "work", "repo", "apps", "desktop"));
    expect(roots.repositoryRoot).toBe(join("/", "work", "repo"));
  });

  test("maps the committed bundle inside an installed package", () => {
    const packageRoot = join(
      "/",
      "consumer",
      "node_modules",
      "@hraness",
      "slopcamera",
    );
    const roots = hostSourceRoots(join(packageRoot, "apps", "desktop", "dist", "cli"));
    expect(roots).toEqual({
      bundled: true,
      desktopRoot: join(packageRoot, "apps", "desktop"),
      repositoryRoot: packageRoot,
    });
  });

  test("keeps the historical fallback for foreign module locations", () => {
    const roots = hostSourceRoots(join("/", "elsewhere", "module"));
    expect(roots).toEqual({
      bundled: false,
      desktopRoot: join("/", "elsewhere"),
      repositoryRoot: join("/", ".."),
    });
  });
});

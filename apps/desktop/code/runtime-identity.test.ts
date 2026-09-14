import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ApplicationContext } from "../application/context";
import {
  createApplicationBuildIdentity,
  createHostApplicationBuildIdentity,
  createWorkflowRuntimeIdentity,
} from "./runtime-identity";
import { bundleWorkflowSource } from "./source-bundle";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async directory => {
    await rm(directory, { force: true, recursive: true });
  }));
});

describe("workflow runtime identity", () => {
  test("binds the Bun configuration with the allowlisted dependency closure bundled", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-runtime-identity-"));
    temporaryDirectories.push(root);
    await writeFile(
      join(root, "workflow.ts"),
      "import { seconds } from '@hraness/slopcamera/local/code'; export default seconds(1);\n",
    );
    const bundle = await bundleWorkflowSource({ allowedRoot: root, entryPath: "workflow.ts" });
    const first = await createWorkflowRuntimeIdentity({ bundle });
    const second = await createWorkflowRuntimeIdentity({ bundle });

    expect(first).toEqual(second);
    expect(first.applicationBuild).toMatch(/^slopcamera\/[a-f0-9]{64}$/u);
    expect(first.externals).toMatchObject({
      kind: "deny-all",
      modules: [],
    });
    expect(first.bundlerConfigurationSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.externals.policySha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("changes when a selected native capability is replaced", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-host-runtime-identity-"));
    temporaryDirectories.push(root);
    const executable = join(root, "face-analyzer");
    await writeFile(executable, "native helper v1\n", { mode: 0o700 });
    const application = {
      capabilities: () => Promise.resolve([{
        available: true,
        command: executable,
        name: "face-analyzer",
        version: "face-analyzer 1",
      }]),
      capability: name => Promise.resolve(name === "face-analyzer"
        ? {
            available: true,
            command: executable,
            name,
            version: "face-analyzer 1",
          }
        : { available: false, name }),
      clock: {
        now: () => new Date(0),
        timestampMilliseconds: () => 0,
      },
      paths: {
        artifactRoot: root,
        desktopRoot: root,
        privateRoot: root,
        projectRoot: root,
        repositoryRoot: root,
      },
      runner: {
        run: () => Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: "",
        }),
      },
    } satisfies ApplicationContext;
    const first = await createHostApplicationBuildIdentity(application);
    expect(first).toMatch(/^slopcamera\/[a-f0-9]{64}$/u);
    await writeFile(executable, "native helper v2\n", { mode: 0o700 });
    const second = await createHostApplicationBuildIdentity(application);
    expect(first).not.toBe(second);
  });
});

describe("application build identity", () => {
  async function createPackedInstallTree(root: string): Promise<void> {
    for (const directory of [
      "analysis",
      "application",
      "capture",
      "cli",
      "code",
      "contracts",
      "core",
      "studio",
      "workflows",
    ]) {
      const path = join(root, "apps", "desktop", directory);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "module.ts"), `export const ${directory.replaceAll("-", "_")} = 1;\n`);
    }
    await mkdir(join(root, "apps", "desktop", "dist", "cli"), { recursive: true });
    await writeFile(join(root, "apps", "desktop", "dist", "cli", "main.js"), "bundle v1\n");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "host.ts"), "export const host = 1;\n");
    await mkdir(join(root, "packages", "scene", "src"), { recursive: true });
    await writeFile(join(root, "packages", "scene", "src", "scene.ts"), "export const scene = 1;\n");
    await writeFile(join(root, "package.json"), "{\"name\":\"@hraness/slopcamera\"}\n");
  }

  test("computes identity over a packed install without runtime sources or a lockfile", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-packed-build-"));
    temporaryDirectories.push(root);
    await createPackedInstallTree(root);
    const identity = await createApplicationBuildIdentity({
      desktopRoot: join(root, "apps", "desktop"),
      repositoryRoot: root,
    });
    expect(identity).toMatch(/^slopcamera\/[a-f0-9]{64}$/u);
  });

  test("binds the shipped CLI bundle bytes when they change", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-packed-build-"));
    temporaryDirectories.push(root);
    await createPackedInstallTree(root);
    const first = await createApplicationBuildIdentity({
      desktopRoot: join(root, "apps", "desktop"),
      repositoryRoot: root,
    });
    await writeFile(join(root, "apps", "desktop", "dist", "cli", "main.js"), "bundle v2\n");
    const second = await createApplicationBuildIdentity({
      desktopRoot: join(root, "apps", "desktop"),
      repositoryRoot: root,
    });
    expect(first).not.toBe(second);
  });

  test("still rejects a packed tree missing a required source area", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-packed-build-"));
    temporaryDirectories.push(root);
    await createPackedInstallTree(root);
    await rm(join(root, "apps", "desktop", "code"), { force: true, recursive: true });
    await expect(createApplicationBuildIdentity({
      desktopRoot: join(root, "apps", "desktop"),
      repositoryRoot: root,
    })).rejects.toThrow("apps/desktop/code");
  });
});

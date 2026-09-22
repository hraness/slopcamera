import { resolve } from "node:path";

// Run from the repository root. Original authored inputs remain unchanged.
for (const name of ["source-to-film", "source-to-film-revised"]) {
  const source = `examples/showcase/diagram/${name}.diagram.json`;
  for (const args of [
    ["diagram", "check", source, "--strict"],
    ["diagram", "render", source, "--out-dir", "artifacts/showcase/diagram"],
  ]) {
    const result = Bun.spawnSync([process.execPath, resolve("apps/desktop/cli/main.ts"), ...args], {
      stdout: "inherit", stderr: "inherit",
    });
    if (result.exitCode !== 0) process.exit(result.exitCode);
  }
}

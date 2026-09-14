import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { outputsRoot, resolveMenubarBinary } from "./menubar";

describe("Slopcamera menu-bar launcher", () => {
  test("keeps outputs beside the product state root", () => {
    expect(outputsRoot("/tmp/Slopcamera/cli")).toBe("/tmp/Slopcamera/outputs");
    expect(outputsRoot("/tmp/Slopcamera")).toBe("/tmp/Slopcamera/outputs");
  });

  test("skips unsafe binary overrides", () => {
    const directory = mkdtempSync(join(tmpdir(), "slopcamera-menubar-"));
    const binary = join(directory, "slopcamera-menubar");
    writeFileSync(binary, "prebuilt", { mode: 0o600 });
    expect(resolveMenubarBinary(directory, { SLOPCAMERA_DESKTOP: binary })).not.toBe(binary);
    chmodSync(binary, 0o755);
    expect(resolveMenubarBinary(directory, { SLOPCAMERA_DESKTOP: binary })).toBe(binary);
    chmodSync(binary, 0o775);
    expect(resolveMenubarBinary(directory, { SLOPCAMERA_DESKTOP: binary })).not.toBe(binary);
  });
});

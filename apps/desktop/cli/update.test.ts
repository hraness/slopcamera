import { expect, test } from "bun:test";
import { runSlopcameraEntrypoint } from "./entry";

test("the executable holds its update lease until product work completes", async () => {
  const order: string[] = [];
  await runSlopcameraEntrypoint(["diagram", "render", "version"], {

    update: async options => {
      expect(options.effectFree).toBe(false);
      expect(options.packageName).toBe("@hraness/slopcamera");
      order.push("update");
      return { handled: false, exitCode: 0, release: async () => { order.push("release"); } };
    },
    main: async () => { order.push("main"); await Promise.resolve(); order.push("completed"); },
  });
  expect(order).toEqual(["update", "main", "completed", "release"]);
});

test("a handled update never enters product work", async () => {
  const prior = process.exitCode;
  try {
    await runSlopcameraEntrypoint(["update", "status"], {

      update: async () => ({ handled: true, exitCode: 1, release: async () => { throw new Error("already handled"); } }),
      main: async () => { throw new Error("product work must not start"); },
    });
    expect(process.exitCode).toBe(1);
  } finally { process.exitCode = prior ?? 0; }
});

test("a product failure still releases its installation", async () => {
  let released = false;
  await expect(runSlopcameraEntrypoint(["diagram", "render", "version"], {

    update: async () => ({ handled: false, exitCode: 0, release: async () => { released = true; } }),
    main: async () => { throw new Error("product failed"); },
  })).rejects.toThrow("product failed");
  expect(released).toBe(true);
});

import { slopcameraUpdatePolicy } from "./update-policy";

test("Slopcamera keeps local media offline and does not infer help for portable work", () => {
  for (const argv of [[], ["--help"], ["help", "render"], ["render", "--help"], ["--version"], ["__complete", "render"], ["diagram", "--help"]]) {
    expect(slopcameraUpdatePolicy(argv).effectFree).toBe(true);
  }
  expect(slopcameraUpdatePolicy(["diagram", "render", "version"])).toEqual({ effectFree: false, offline: true });
  expect(slopcameraUpdatePolicy(["diagram", "render", "--help"])).toEqual({ effectFree: false, offline: true });
  expect(slopcameraUpdatePolicy(["image", "vectorize", "version"])).toEqual({ effectFree: false, offline: true });
  for (const argv of [["image", "icon", "compose"], ["image", "icon", "render"], ["media", "soundtrack", "compose"], ["media", "soundtrack", "grid"], ["diagram", "sheets", "render"]]) {
    expect(slopcameraUpdatePolicy(argv)).toEqual({ effectFree: false, offline: true });
  }
});

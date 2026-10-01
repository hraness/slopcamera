import { expect, test } from "bun:test";
import { chmodSync, closeSync, fstatSync, openSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBrowserRuntimeKqueue, type BrowserWatchIdentity } from "./html-overlay-kqueue";

const nativeTest = process.platform === "darwin" ? test : test.skip;
function identity(absolute: string, path: string): BrowserWatchIdentity {
  const info = lstatSync(absolute, { bigint: true });
  return { path, dev: info.dev.toString(), ino: info.ino.toString(), mode: Number(info.mode & 0o177777n), size: info.size.toString(), ctimeNs: info.ctimeNs.toString() };
}
function fixture() {
  const anchor = mkdtempSync(join(tmpdir(), "slopcamera-kqueue-test-"));
  const container = join(anchor, "snapshot");
  const runtimeRoot = join(container, "app");
  mkdirSync(runtimeRoot, { recursive: true });
  writeFileSync(join(runtimeRoot, "payload"), "original");
  symlinkSync("payload", join(runtimeRoot, "link"));
  const anchorInfo = identity(anchor, ".");
  return { anchor, container, runtimeRoot, anchorIdentity: { path: ".", dev: anchorInfo.dev, ino: anchorInfo.ino, mode: anchorInfo.mode }, containerIdentity: identity(container, "."), identities: [identity(runtimeRoot, "."), identity(join(runtimeRoot, "payload"), "payload"), identity(join(runtimeRoot, "link"), "link")] };
}

nativeTest("vnode registration excludes historical preparation and preserves a clean baseline", async () => {
  const item = fixture();
  const guard = await createBrowserRuntimeKqueue(item);
  try { const mutations = new Set<string>(); guard.poll(mutations); expect([...mutations]).toEqual([]); }
  finally { guard.close(); guard.close(); rmSync(item.anchor, { recursive: true, force: true }); }
});

for (const [name, mutate, expected] of [
  ["restored file writes", (root: string) => { writeFileSync(join(root, "payload"), "modified"); writeFileSync(join(root, "payload"), "original"); }, "payload"],
  ["restored file renames", (root: string) => { renameSync(join(root, "payload"), join(root, "moved")); renameSync(join(root, "moved"), join(root, "payload")); }, "payload"],
  ["restored permissions", (root: string) => { chmodSync(join(root, "payload"), 0o600); chmodSync(join(root, "payload"), 0o644); }, "payload"],
  ["symlink replacement", (root: string) => { unlinkSync(join(root, "link")); symlinkSync("other", join(root, "link")); }, "link"],
  ["restored runtime root rename", (root: string) => { renameSync(root, `${root}-moved`); renameSync(`${root}-moved`, root); }, "<snapshot-container>"],
] as const) {
  nativeTest(`vnode notes reject ${name} and stay sticky after another read`, async () => {
    const item = fixture(); const guard = await createBrowserRuntimeKqueue(item);
    try {
      const mutations = new Set<string>(); guard.poll(mutations); expect(mutations.size).toBe(0);
      mutate(item.runtimeRoot); guard.poll(mutations);
      expect([...mutations].some(value => value.endsWith(`:${expected}`))).toBe(true);
      const retained = [...mutations]; guard.poll(mutations); expect([...mutations]).toEqual(retained);
    } finally { guard.close(); rmSync(item.anchor, { recursive: true, force: true }); }
  });
}

nativeTest("only pure app-root attributes use the existing identity-gated metadata label", async () => {
  const item = fixture(); const guard = await createBrowserRuntimeKqueue(item);
  try {
    const mutations = new Set<string>(); chmodSync(item.runtimeRoot, 0o700); guard.poll(mutations);
    expect([...mutations]).toEqual(["change:app"]);
    writeFileSync(join(item.runtimeRoot, "new"), "bad"); guard.poll(mutations);
    expect([...mutations].some(value => value.startsWith("vnode-") && value.endsWith(":" + "."))).toBe(true);
  } finally { guard.close(); rmSync(item.anchor, { recursive: true, force: true }); }
});

nativeTest("an identity mismatch fails closed and collects partial registrations", async () => {
  const item = fixture(); const before = readdirSync("/dev/fd").length;
  try {
    await expect(createBrowserRuntimeKqueue({ ...item, containerIdentity: { ...item.containerIdentity, ino: "0" } })).rejects.toThrow("identity changed");
    expect(readdirSync("/dev/fd").length).toBe(before);
  } finally { rmSync(item.anchor, { recursive: true, force: true }); }
});

nativeTest("descriptor capacity is bounded before opening payload handles", async () => {
  const item = fixture();
  try { await expect(createBrowserRuntimeKqueue({ ...item, identities: Array.from({ length: 8193 }, () => item.identities[0]!) })).rejects.toThrow("bounded descriptor capacity"); }
  finally { rmSync(item.anchor, { recursive: true, force: true }); }
});

nativeTest("unrelated anchor siblings cannot invalidate the owned snapshot", async () => {
  const item = fixture(); const guard = await createBrowserRuntimeKqueue(item);
  try {
    const mutations = new Set<string>();
    mkdirSync(join(item.anchor, "unrelated")); writeFileSync(join(item.anchor, "unrelated", "file"), "ok");
    rmSync(join(item.anchor, "unrelated"), { recursive: true });
    guard.poll(mutations); expect([...mutations]).toEqual([]);
  } finally { guard.close(); rmSync(item.anchor, { recursive: true, force: true }); }
});

nativeTest("queue read errors stay fatal and uncertain close is never retried on reused descriptors", async () => {
  const item = fixture();
  const liveDescriptors = () => readdirSync("/dev/fd").map(Number).filter(descriptor => { try { fstatSync(descriptor); return true; } catch { return false; } });
  const before = new Set(liveDescriptors());
  const guard = await createBrowserRuntimeKqueue(item);
  const opened = liveDescriptors().filter(descriptor => !before.has(descriptor)).sort((left, right) => left - right);
  const queue = opened[0]!;
  try {
    expect(opened.length).toBe(item.identities.length + 3);
    closeSync(queue);
    const mutations = new Set<string>();
    expect(() => guard.poll(mutations)).toThrow("could not be read");
    expect(() => guard.poll(mutations)).toThrow("could not be read");
    expect(() => guard.close()).toThrow("collection is unproven");
    const replacement = openSync(join(item.runtimeRoot, "payload"), "r");
    try {
      expect(replacement).toBe(queue);
      expect(() => guard.close()).toThrow("collection is unproven");
      expect(fstatSync(replacement).isFile()).toBe(true);
    } finally { closeSync(replacement); }
  } finally { rmSync(item.anchor, { recursive: true, force: true }); }
});

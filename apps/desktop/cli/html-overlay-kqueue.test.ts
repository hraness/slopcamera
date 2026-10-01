import { expect, test } from "bun:test";
import { chmodSync, closeSync, fstatSync, openSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBrowserRuntimeKqueue, type BrowserWatchIdentity } from "./html-overlay-kqueue";

const nativeTest = process.platform === "darwin" ? test : test.skip;
function identity(absolute: string, path: string): BrowserWatchIdentity {
  const info = lstatSync(absolute, { bigint: true });
  return { path, dev: info.dev.toString(), ino: info.ino.toString(), mode: Number(info.mode & 0o177777n), size: info.size.toString(), ctimeNs: info.ctimeNs.toString(), mtimeNs: info.mtimeNs.toString(), uid: info.uid.toString(), gid: info.gid.toString(), nlink: info.nlink.toString() };
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

function refresh(item: ReturnType<typeof fixture>) {
  item.identities = item.identities.map(entry => identity(entry.path === "." ? item.runtimeRoot : join(item.runtimeRoot, entry.path), entry.path));
}
function flags(path: string, value: "uchg" | "nouchg") {
  execFileSync("/usr/bin/chflags", [value, path], { timeout: 5000 });
}
function mmapRead(path: string) {
  execFileSync("/usr/bin/python3", ["-c", "import mmap,sys; f=open(sys.argv[1],'rb'); m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ); assert m[:]==b'original'; m.close(); f.close()", path], { timeout: 5000 });
}
function immutableFixture() {
  const item = fixture(), payload = join(item.runtimeRoot, "payload");
  utimesSync(payload, 0, 1); flags(payload, "uchg"); refresh(item);
  return item;
}

nativeTest("immutable payload reads and mmap access preserve original status identity", async () => {
  const item = immutableFixture(), payload = join(item.runtimeRoot, "payload");
  const original = identity(payload, "payload");
  const guard = await createBrowserRuntimeKqueue(item);
  try {
    const mutations = new Set<string>(); readFileSync(payload); guard.poll(mutations); expect([...mutations]).toEqual([]);
    mmapRead(payload); guard.poll(mutations); expect([...mutations]).toEqual([]);
    expect(identity(payload, "payload")).toEqual(original);
    mmapRead(payload); guard.poll(mutations); expect([...mutations]).toEqual([]);
    expect(identity(payload, "payload")).toEqual(original);
  } finally { guard.close(); flags(payload, "nouchg"); rmSync(item.anchor, { recursive: true, force: true }); }
});

nativeTest("restored immutable flags remain fatal after a previously accepted access event", async () => {
  const item = immutableFixture(), payload = join(item.runtimeRoot, "payload");
  const before = lstatSync(payload, { bigint: true }), guard = await createBrowserRuntimeKqueue(item);
  try {
    const mutations = new Set<string>(); mmapRead(payload); guard.poll(mutations); expect(mutations.size).toBe(0);
    flags(payload, "nouchg"); flags(payload, "uchg"); mmapRead(payload); guard.poll(mutations);
    expect(lstatSync(payload, { bigint: true }).ctimeNs).not.toBe(before.ctimeNs);
    expect([...mutations]).toContain("vnode-8:payload");
    guard.poll(mutations); expect([...mutations]).toContain("vnode-8:payload");
  } finally { guard.close(); flags(payload, "nouchg"); rmSync(item.anchor, { recursive: true, force: true }); }
});

for (const missing of ["ctimeNs", "mtimeNs", "uid", "gid", "nlink", "size"] as const) {
  nativeTest(`mmap cannot classify access with missing original ${missing}`, async () => {
    const item = immutableFixture(), payload = join(item.runtimeRoot, "payload");
    item.identities = item.identities.map(entry => { if (entry.path !== "payload") return entry; const incomplete = { ...entry }; delete incomplete[missing]; return incomplete; });
    const guard = await createBrowserRuntimeKqueue(item);
    try { const mutations = new Set<string>(); mmapRead(payload); guard.poll(mutations); expect([...mutations]).toContain("vnode-8:payload"); }
    finally { guard.close(); flags(payload, "nouchg"); rmSync(item.anchor, { recursive: true, force: true }); }
  });
}

nativeTest("mutable payload mmap remains fatal without immutable flag readback", async () => {
  const item = fixture(), payload = join(item.runtimeRoot, "payload");
  utimesSync(payload, 0, 1); refresh(item); const guard = await createBrowserRuntimeKqueue(item);
  try { const mutations = new Set<string>(); mmapRead(payload); guard.poll(mutations); expect([...mutations]).toContain("vnode-8:payload"); }
  finally { guard.close(); rmSync(item.anchor, { recursive: true, force: true }); }
});

for (const [name, mutate] of [
  ["permissions", (path: string) => { chmodSync(path, 0o600); chmodSync(path, 0o644); }],
  ["times", (path: string) => { utimesSync(path, 2, 2); utimesSync(path, 0, 1); }],
  ["extended attributes", (path: string) => { execFileSync("/usr/bin/xattr", ["-w", "com.slopcamera.kqueue-fixture", "changed", path]); execFileSync("/usr/bin/xattr", ["-w", "com.slopcamera.kqueue-fixture", "original", path]); }],
] as const) {
  nativeTest(`restored ${name} change original ctime and remain fatal`, async () => {
    const item = fixture(), payload = join(item.runtimeRoot, "payload");
    utimesSync(payload, 0, 1); execFileSync("/usr/bin/xattr", ["-w", "com.slopcamera.kqueue-fixture", "original", payload]); refresh(item);
    const before = identity(payload, "payload"), guard = await createBrowserRuntimeKqueue(item);
    try {
      mutate(payload); const after = identity(payload, "payload"); expect(after.ctimeNs).not.toBe(before.ctimeNs);
      expect(after).toEqual({ ...before, ctimeNs: after.ctimeNs! });
      const mutations = new Set<string>(); guard.poll(mutations); expect([...mutations]).toContain("vnode-8:payload");
    } finally { guard.close(); rmSync(item.anchor, { recursive: true, force: true }); }
  });
}

nativeTest("mixed write and attribute notes stay fatal despite subsequent mmap", async () => {
  const item = immutableFixture(), payload = join(item.runtimeRoot, "payload"), guard = await createBrowserRuntimeKqueue(item);
  try {
    flags(payload, "nouchg"); writeFileSync(payload, "modified"); writeFileSync(payload, "original"); flags(payload, "uchg"); mmapRead(payload);
    const mutations = new Set<string>(); guard.poll(mutations);
    expect([...mutations].some(value => value.endsWith(":payload") && value !== "vnode-8:payload")).toBe(true);
  } finally { guard.close(); flags(payload, "nouchg"); rmSync(item.anchor, { recursive: true, force: true }); }
});

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

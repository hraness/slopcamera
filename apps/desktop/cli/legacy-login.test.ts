import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import {
  inspectLegacyLogin,
  isSlopcameraMenubarItem,
  LEGACY_LOGIN_LABELS,
  oldCliPlist,
  retiredLegacyLogins,
  retireLegacyLogin,
} from "./legacy-login";

const homes: string[] = [];
function home(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "slopcamera-login-")));
  mkdirSync(join(dir, "Library", "LaunchAgents"), { recursive: true });
  homes.push(dir);
  return dir;
}
afterEach(() => { for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function agents(dir: string): string {
  return join(dir, "Library", "LaunchAgents");
}

/** The item the desktop-foundation helper wrote: a sha256 header over the plist body. */
function helperItem(label: string, program: string): string {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${program}</string></array><key>RunAtLoad</key><true/></dict></plist>\n`;
  const digest = createHash("sha256").update(body).digest("hex");
  return `<!-- hraness-companion autostart slopcamera sha256:${digest} -->\n${body}`;
}

const MENU = "/Users/someone/Library/Application Support/Slopcamera/menubar/slopcamera-menubar";
const noBootout = async () => {};
const at = () => new Date(1_700_000_000_000);

describe("legacy menu bar login items", () => {
  test("recognizes only items Slopcamera wrote", () => {
    const old = { label: "com.hraness.slopcamera.menubar", path: "/x", text: oldCliPlist(MENU) };
    expect(isSlopcameraMenubarItem(old)).toBe(true);
    expect(isSlopcameraMenubarItem({ ...old, text: old.text.replace("<true/>", "<false/>") })).toBe(false);
    expect(isSlopcameraMenubarItem({ ...old, text: oldCliPlist("/usr/bin/other") })).toBe(false);

    const helper = { label: "app.hraness.slopcamera", path: "/x", text: helperItem("app.hraness.slopcamera", MENU) };
    expect(isSlopcameraMenubarItem(helper)).toBe(true);
    expect(isSlopcameraMenubarItem({ ...helper, text: helper.text.replace("RunAtLoad", "RunAtLoaD") })).toBe(false);
    expect(isSlopcameraMenubarItem({ ...helper, text: helperItem("app.hraness.slopcamera", "/bin/sh") })).toBe(false);
    expect(isSlopcameraMenubarItem({ label: "app.hraness.companion.slopcamera", path: "/x", text: helperItem("app.hraness.slopcamera", MENU) })).toBe(false);
  });

  test("an empty HOME reports nothing", () => {
    const dir = home();
    expect(inspectLegacyLogin(dir)).toEqual({ state: "none" });
    expect(inspectLegacyLogin(undefined)).toEqual({ state: "none" });
    expect(inspectLegacyLogin("relative")).toEqual({ state: "none" });
    expect(retiredLegacyLogins(dir)).toEqual([]);
  });

  test("retires the correct item and leaves foreign, symlinked and edited items alone", async () => {
    const dir = home();
    const ours = join(agents(dir), "app.hraness.slopcamera.plist");
    const foreign = join(agents(dir), "app.hraness.companion.slopcamera.plist");
    const linked = join(agents(dir), "com.hraness.slopcamera.menubar.plist");
    const target = join(dir, "elsewhere.plist");
    writeFileSync(ours, helperItem("app.hraness.slopcamera", MENU));
    writeFileSync(foreign, "<plist>someone else's</plist>\n");
    writeFileSync(target, oldCliPlist(MENU));
    symlinkSync(target, linked);
    expect(inspectLegacyLogin(dir)).toEqual({ state: "found", label: "app.hraness.slopcamera" });

    const booted: string[] = [];
    const retired = await retireLegacyLogin(dir, { bootout: async (label) => { booted.push(label); }, now: at });
    expect(retired).toEqual([{ label: "app.hraness.slopcamera", from: ours, to: `${ours}.retired-1700000000000` }]);
    expect(booted).toEqual(["app.hraness.slopcamera"]);
    expect(readFileSync(`${ours}.retired-1700000000000`, "utf8")).toBe(helperItem("app.hraness.slopcamera", MENU));
    expect(readFileSync(foreign, "utf8")).toBe("<plist>someone else's</plist>\n");
    expect(lstatSync(linked).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(oldCliPlist(MENU));
    expect(inspectLegacyLogin(dir)).toEqual({ state: "not-ours", label: "app.hraness.companion.slopcamera" });

    const listed = retiredLegacyLogins(dir);
    expect(listed.map(item => item.path)).toEqual([`${ours}.retired-1700000000000`]);
    expect(listed[0]!.restore).toBe(`mv -n '${ours}.retired-1700000000000' '${ours}' && launchctl bootstrap gui/$(id -u) '${ours}'`);
  });

  test("retires every old copy, deletes nothing, and is idempotent", async () => {
    const dir = home();
    writeFileSync(join(agents(dir), "app.hraness.slopcamera.plist"), helperItem("app.hraness.slopcamera", MENU));
    writeFileSync(join(agents(dir), "app.hraness.companion.slopcamera.plist"), helperItem("app.hraness.companion.slopcamera", MENU));
    writeFileSync(join(agents(dir), "com.hraness.slopcamera.menubar.plist"), oldCliPlist(MENU));
    const before = readdirSync(agents(dir)).length;
    const retired = await retireLegacyLogin(dir, { bootout: noBootout, now: at });
    expect(retired.map(item => item.label)).toEqual([...LEGACY_LOGIN_LABELS]);
    expect(readdirSync(agents(dir)).length).toBe(before);
    expect(readdirSync(agents(dir)).every(name => name.includes(".retired-"))).toBe(true);
    expect(inspectLegacyLogin(dir)).toEqual({ state: "none" });
    expect(await retireLegacyLogin(dir, { bootout: noBootout, now: at })).toEqual([]);
  });

  test("leaves an item that is not the user's own file", async () => {
    const dir = home();
    const path = join(agents(dir), "com.hraness.slopcamera.menubar.plist");
    writeFileSync(path, oldCliPlist(MENU));
    chmodSync(path, 0o000);
    try {
      // An unreadable file is not proof of ownership; nothing moves.
      const retired = await retireLegacyLogin(dir, { bootout: noBootout, now: at });
      if (process.getuid?.() !== 0) expect(retired).toEqual([]);
    } finally {
      chmodSync(path, 0o600);
    }
  });

  test("a relative HOME is refused before anything is read", async () => {
    await expect(retireLegacyLogin("relative", { bootout: noBootout })).rejects.toThrow("HOME must be an absolute directory");
  });
});

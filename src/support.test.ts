import { expect, test, spyOn } from "bun:test"
import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { main } from "./cli"
import { reportUsefulResult } from "./support-completion"

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-support-")))
  const env = {
    HOME: root, XDG_DATA_HOME: root, PATH: process.env.PATH ?? "/usr/bin:/bin",
    HRANESS_SUPPORT_AUDIENCE: "agent", HRANESS_SUPPORT_EMAIL: "off", BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
  }
  return { root, env, close: () => rm(root, { recursive: true, force: true }) }
}

async function run(root: string, env: Record<string, string>, args: string[], local = false) {
  const entry = resolve(import.meta.dir, local ? "../apps/desktop/cli/main.ts" : "cli.ts")
  const child = Bun.spawn([process.execPath, entry, ...args], { cwd: root, env, stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => child.kill(), 10_000)
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ])
    return { code, stdout, stderr }
  } finally { clearTimeout(timer) }
}

test("portable and complete standalone support protocols are read-only before product setup", async () => {
  const f = await fixture()
  try {
    for (const local of [false, true]) {
      const result = await run(f.root, f.env, ["support", "protocol", "--json"], local)
      expect(result.code).toBe(0)
      expect(result.stderr).toBe("")
      expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: "hraness-support-protocol-v1" })
      expect(result.stdout).toContain("slopcamera")
      expect(await readdir(f.root)).toEqual([])
    }
  } finally { await f.close() }
})

test("successful piped work exposes discovery without consuming an offer, and explicit off wins", async () => {
  const f = await fixture()
  try {
    const first = await run(f.root, f.env, ["diagram", "init", "first.diagram.json"])
    expect(first.code).toBe(0)
    expect(first.stdout).toBe(`Created ${join(f.root, "first.diagram.json")}\n`)
    expect(JSON.parse(first.stderr)).toMatchObject({
      schemaVersion: "hraness-support-discovery-v1", protocol: ["slopcamera", "support", "protocol", "--json"],
    })
    const offer = await run(f.root, f.env, ["support", "offer", "--json"])
    expect(offer.stderr).toBe("")
    const parsed = JSON.parse(offer.stdout)
    expect(parsed.kind).toBe("offer")
    expect(parsed.invitation.emailSuggestion).toBeUndefined()
    expect(parsed.invitation.actions.map((action: { kind: string }) => action.kind)).toEqual(["support"])
    const quiet = await run(f.root, f.env, ["support", "offer", "--json"])
    expect(JSON.parse(quiet.stdout).kind).toBe("quiet")
    const off = { ...f.env, HRANESS_SUPPORT_AUDIENCE: "off" }
    expect((await run(f.root, off, ["diagram", "init", "off.diagram.json"])).stderr).toBe("")
    expect(JSON.parse((await run(f.root, off, ["support", "offer", "--json"])).stdout).kind).toBe("quiet")
    expect((await run(f.root, f.env, ["--help"])).stderr).toBe("")
    const failure = await run(f.root, f.env, ["diagram", "init", "first.diagram.json"])
    expect(failure.code).not.toBe(0)
    expect(failure.stderr).not.toContain("hraness-support-discovery-v1")
  } finally { await f.close() }
})

test("imported CLI work stays inert and observers follow output without affecting completed effects", async () => {
  const f = await fixture()
  const output: unknown[][] = []
  const log = spyOn(console, "log").mockImplementation((...args: unknown[]) => { output.push(args) })
  try {
    await main(["diagram", "init", join(f.root, "sdk.diagram.json")])
    expect(await readdir(f.root)).toEqual(["sdk.diagram.json"])
    let completed = 0
    await main(["diagram", "init", join(f.root, "observed.diagram.json")], {
      onUsefulResult: () => {
        expect(output.at(-1)).toEqual([`Created ${join(f.root, "observed.diagram.json")}`])
        completed++
      },
    })
    expect(completed).toBe(1)
    for (const [index, observer] of [() => { throw new Error("observer only") }, async () => { throw new Error("observer only") }].entries()) {
      const path = join(f.root, `inert-${index}.diagram.json`)
      await main(["diagram", "init", path], { onUsefulResult: observer })
      expect(JSON.parse(await readFile(path, "utf8"))).toHaveProperty("shapes")
    }
    reportUsefulResult(undefined)
    await Promise.resolve()
    expect((await readdir(f.root)).every(name => name.endsWith(".diagram.json"))).toBe(true)
  } finally { log.mockRestore(); await f.close() }
})

test.skipIf(process.platform === "win32")("an unknown PTY caller receives agent discovery rather than a human invitation", async () => {
  const f = await fixture()
  try {
    const argv = [process.execPath, resolve(import.meta.dir, "cli.ts"), "diagram", "init", "pty.diagram.json"]
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
    const command = process.platform === "darwin"
      ? ["/usr/bin/script", "-q", "/dev/null", ...argv]
      : ["/usr/bin/script", "-qec", argv.map(quote).join(" "), "/dev/null"]
    const child = Bun.spawn(command, {
      cwd: f.root, env: { ...f.env, HRANESS_SUPPORT_AUDIENCE: undefined },
      stdin: "ignore", stdout: "pipe", stderr: "pipe",
    })
    const timer = setTimeout(() => child.kill(), 10_000)
    try {
      const [code, stdout, stderr] = await Promise.all([
        child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
      ])
      expect(code).toBe(0)
      expect(stderr).toBe("")
      const discovery = stdout.split(/\r?\n/u).find(line => line.startsWith('{"schemaVersion":"hraness-support-discovery-v1"'))
      expect(discovery).toBeDefined()
      expect(JSON.parse(discovery!)).toHaveProperty("protocol", ["slopcamera", "support", "protocol", "--json"])
      expect(stdout).not.toContain("hraness-support-offer-v1")
    } finally { clearTimeout(timer) }
  } finally { await f.close() }
})

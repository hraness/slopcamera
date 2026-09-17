import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { main as runSlopcameraCliInProcess } from "./cli.ts"
import { slopcameraImageModels } from "./generate.ts"
import type {
  HostResourceClaim,
  HostResourceCoordinator,
} from "./host-resources.ts"

function recordingCoordinator(record: {
  assertions: number
  claims: HostResourceClaim[][]
}, inheritedFileDescriptor = 83): HostResourceCoordinator {
  const profile = {
    id: "slopcamera.cli-test-host/v1",
    capacities: [],
  } as const
  return {
    profile,
    scope: "process",
    async withLease(claims, callback) {
      record.claims.push([...claims])
      return await callback({
        claims,
        inheritedFileDescriptor,
        profile,
        ticket: String(record.claims.length),
        assertOwned: () => {
          record.assertions += 1
          return Promise.resolve()
        },
      })
    },
  }
}

async function runCli(
  args: readonly string[],
  cwd: string,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const subprocess = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), ...args], {
    cwd,
    env: { ...process.env, HRANESS_SUPPORT_AUDIENCE: "off", HRANESS_SUPPORT_EMAIL: "off" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

describe("Slopcamera CLI", () => {
  test("reports v3.2.8 and documents namespaced media surfaces", async () => {
    const version = await runCli(["--version"], process.cwd())
    expect(version).toEqual({
      exitCode: 0,
      stdout: "3.2.8\n",
      stderr: "",
    })
    const help = await runCli(["--help"], process.cwd())
    expect(help.exitCode).toBe(0)
    for (const command of [
      "slopcamera diagram init",
      "slopcamera diagram check",
      "slopcamera diagram render",
      "slopcamera image vectorize",
      "slopcamera image generate",
      "slopcamera image gallery",
      "slopcamera image icon",
      "slopcamera doctor",
      "slopcamera credits",
      "--hosted",
      "slopcamera code search",
      "slopcamera code execute",
      "search_slopcamera/execute_slopcamera",
    ]) {
      expect(help.stdout).toContain(command)
    }
    expect(help.stdout).not.toContain("slopcamera auth")
  })

  test("initializes diagrams against the version-one schema in the v3 release", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-cli-init-"))
    try {
      const result = await runCli(["diagram", "init", "system.diagram.json"], root)
      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe("")
      const diagram = JSON.parse(await readFile(join(root, "system.diagram.json"), "utf8"))
      expect(diagram.$schema).toBe(
        "https://raw.githubusercontent.com/hraness/slopcamera/main/schema/diagram.schema.json",
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("searches the canonical registry as bounded JSON", async () => {
    const result = await runCli(
      ["code", "search", "diagram", "--limit", "2"],
      process.cwd(),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout)
    expect(parsed.operations.map(({ code }: { code: string }) => code)).toEqual([
      "slopcamera.diagram.check",
      "slopcamera.diagram.render",
    ])
  })

  test("defaults direct generation to the Recraft utility model", async () => {
    const output: string[] = []
    const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
    await runSlopcameraCliInProcess(
      [
        "image",
        "generate",
        "one literal illustration",
        "--output",
        "illustration.webp",
        "--json",
      ],
      {
        generate: async (input) => {
          expect(input).toEqual({
            model: slopcameraImageModels[1],
            prompt: "one literal illustration",
            outputPath: "illustration.webp",
          })
          return {
            bytes: 128,
            mediaType: "image/webp",
            model: slopcameraImageModels[1],
            outputPath: "/workspace/illustration.webp",
            provider: "vercel-ai-gateway",
            requestId: "request_default_model",
            sha256: "a".repeat(64),
            warnings: [],
          }
        },
        hostResourceCoordinator: recordingCoordinator(admission),
        log: (line) => output.push(line),
      },
    )
    expect(JSON.parse(output.join("\n"))).toMatchObject({
      model: slopcameraImageModels[1],
      mediaType: "image/webp",
    })
    expect(admission.claims).toEqual([[
      { resource: "local-io", amount: 1 },
      { resource: "network", amount: 1 },
      { resource: "paid-call", amount: 1 },
    ]])
  })

  test("routes --hosted and SLOPCAMERA_GENERATION_MODE=hosted to the hosted gateway lane with the same request", async () => {
    for (const [argv, environment] of [
      [["image", "generate", "one literal illustration", "--output", "illustration.webp", "--hosted", "--json"], {}],
      [["image", "generate", "one literal illustration", "--output", "illustration.webp", "--json"], { SLOPCAMERA_GENERATION_MODE: "hosted" }],
    ] as const) {
      const output: string[] = []
      const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
      let direct = 0
      await runSlopcameraCliInProcess(argv, {
        environment,
        generate: async () => {
          direct += 1
          throw new Error("direct lane must stay untouched")
        },
        generateHosted: async (input, dependencies) => {
          expect(input).toEqual({
            model: slopcameraImageModels[1],
            prompt: "one literal illustration",
            outputPath: "illustration.webp",
          })
          expect(dependencies?.environment).toBe(environment)
          return {
            bytes: 128,
            mediaType: "image/webp",
            model: slopcameraImageModels[1],
            outputPath: "/workspace/illustration.webp",
            provider: "vercel-ai-gateway",
            requestId: "request_hosted",
            sha256: "a".repeat(64),
            warnings: [],
            route: "hosted",
            credits: {
              holdId: "hold_1",
              chargedMicroUsd: 120_000,
              charged: { microUsd: 120_000, credits: 12, usd: "0.12" },
              balance: { microUsd: 7_980_000, availableMicroUsd: 7_980_000 },
              lowBalance: false,
              settled: true,
            },
          }
        },
        hostResourceCoordinator: recordingCoordinator(admission),
        log: (line) => output.push(line),
      })
      expect(direct).toBe(0)
      expect(JSON.parse(output.join("\n"))).toMatchObject({ route: "hosted", credits: { charged: { usd: "0.12" } } })
      expect(admission.claims).toEqual([[
        { resource: "local-io", amount: 1 },
        { resource: "network", amount: 1 },
        { resource: "paid-call", amount: 1 },
      ]])
    }
  })

  test("keeps the direct lane unchanged without --hosted and rejects foreign models before a hosted call", async () => {
    let hosted = 0
    let direct = 0
    await runSlopcameraCliInProcess(
      ["image", "generate", "one literal illustration", "--output", "illustration.webp"],
      {
        environment: { SLOPCAMERA_GENERATION_MODE: "direct" },
        generate: async (input) => {
          direct += 1
          expect(input).toEqual({
            model: slopcameraImageModels[1],
            prompt: "one literal illustration",
            outputPath: "illustration.webp",
          })
          return {
            bytes: 128, mediaType: "image/webp", model: slopcameraImageModels[1], outputPath: "/workspace/illustration.webp",
            provider: "vercel-ai-gateway", requestId: "request_direct", sha256: "a".repeat(64), warnings: [],
          }
        },
        generateHosted: async () => {
          hosted += 1
          throw new Error("hosted lane must not run")
        },
        hostResourceCoordinator: recordingCoordinator({ assertions: 0, claims: [] }),
        log: () => undefined,
      },
    )
    expect({ direct, hosted }).toEqual({ direct: 1, hosted: 0 })
    await expect(runSlopcameraCliInProcess(
      ["image", "generate", "prompt", "--output", "x.webp", "--model", "openai/dall-e-3", "--hosted"],
      { environment: {}, generateHosted: async () => { throw new Error("must not be called") } },
    )).rejects.toThrow("--hosted supports only:")
    await expect(runSlopcameraCliInProcess(
      ["image", "generate", "prompt", "--output", "x.webp"],
      { environment: { SLOPCAMERA_GENERATION_MODE: "cloud" } },
    )).rejects.toThrow("SLOPCAMERA_GENERATION_MODE must be one of")
    expect(hosted).toBe(0)
  })

  test("prints one credits-required envelope line on stderr and exits 10 when the gateway needs payment", async () => {
    const { SlopcameraCreditsRequiredError, slopcameraCreditsRequiredExitCode } = await import("./credits.ts")
    const payload = {
      error: "credits_required" as const,
      message: "Slopcamera needs $0.31 in credits for hosted image generation; this device has $0.00 available.",
      operation: "image_generate",
      reason: "insufficient_credits" as const,
      required: { microUsd: 312500, credits: 31, usd: "0.31" },
      balance: { microUsd: 0, credits: 0, usd: "0.00", availableMicroUsd: 0 },
      topup: {
        claimId: "clm_8f3k2q",
        url: "https://credits.hraness.com/t/clm_8f3k2q",
        expiresAt: "2026-09-17T22:00:00Z",
        packs: [{ id: "p10", usd: 10, credits: 1000, bonusCredits: 0 }, { id: "p25", usd: 25, credits: 2500, bonusCredits: 150 }],
        suggestedPackId: "p25",
      },
    }
    const argv = ["image", "generate", "one literal illustration", "--output", "illustration.webp", "--hosted", "--json"]
    // Bun ignores an assignment of undefined to process.exitCode, so this test
    // starts from and restores an explicit zero.
    const exitCodeOf = () => (process as { exitCode?: number | string | undefined }).exitCode
    const previousExitCode = Number(exitCodeOf() ?? 0)
    const stderr = { text: "", write(text: string, callback?: (error?: Error | null) => void) { stderr.text += text; callback?.(null); return true } }
    const output: string[] = []
    try {
      process.exitCode = 0
      await runSlopcameraCliInProcess(argv, {
        environment: {},
        generateHosted: async () => { throw new SlopcameraCreditsRequiredError(payload) },
        hostResourceCoordinator: recordingCoordinator({ assertions: 0, claims: [] }),
        log: (line) => output.push(line),
        stderr,
      })
      expect(exitCodeOf()).toBe(slopcameraCreditsRequiredExitCode)
      expect(exitCodeOf()).toBe(10)
    } finally {
      process.exitCode = previousExitCode
    }
    const lines = stderr.text.split("\n")
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!)).toMatchObject({
      schemaVersion: "hraness-credits-required-v1",
      product: { id: "slopcamera", name: "Slopcamera" },
      operation: "image_generate",
      required: { usd: "0.31" },
      resume: { argv: ["slopcamera", ...argv], automatic: true },
    })
    expect(JSON.parse(output.join("\n"))).toEqual({
      error: "credits_required",
      message: payload.message,
      operation: "image_generate",
      reason: "insufficient_credits",
    })
  })

  test("keeps canonical vectorization local and rejects the old flat grammar", async () => {
    const output: string[] = []
    let calls = 0
    const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
    await runSlopcameraCliInProcess(
      ["image", "vectorize", "source.png", "--output", "source.svg", "--json"],
      {
        hostResourceCoordinator: recordingCoordinator(admission, 89),
        log: (line) => output.push(line),
        vectorize: async (input, options) => {
          calls += 1
          expect(input).toBe("source.png")
          expect(options?.outputPath).toBe("source.svg")
          expect(options?.inheritedFileDescriptors).toEqual([89])
          return {
            outputPath: "/workspace/source.svg",
            svg: "<svg/>",
            receipt: {
              alphaCutoff: 8,
              bytes: 6,
              candidatesEvaluated: 1,
              format: "png",
              height: 16,
              inputBytes: 32,
              outputMode: "color",
              pathCount: 1,
              profile: "balanced",
              provenance: {
                arch: process.arch,
                platform: process.platform,
                sharp: "test",
                sharpVersions: {},
                vips: "test",
                vtracerSha256: "0".repeat(64),
                vtracerSource: "override",
                vtracerVersion: "test",
              },
              quality: {
                alphaRmse: 0,
                colorRmse: 0,
                outsideAlphaRatio: 0,
                sampleHeight: 16,
                sampleWidth: 16,
                supportRecall: 1,
              },
              receiptVersion: 1,
              representation: "color-paths",
              sourceSha256: "1".repeat(64),
              svgSha256: "2".repeat(64),
              width: 16,
            },
          }
        },
      },
    )
    expect(calls).toBe(1)
    expect(admission.claims).toEqual([[
      { resource: "cpu", amount: 1 },
      { resource: "local-io", amount: 1 },
    ]])
    expect(JSON.parse(output.join("\n"))).toMatchObject({
      outputPath: "/workspace/source.svg",
      width: 16,
    })
    await expect(
      runSlopcameraCliInProcess(["vectorize", "source.png", "--output", "source.svg"]),
    ).rejects.toThrow("flat `vectorize` command moved")
  })

  test("routes isometric icon generation through the registered operation", async () => {
    const output: string[] = []
    const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
    await runSlopcameraCliInProcess(
      [
        "image",
        "icon",
        "a paper airplane",
        "--output",
        "plane.svg",
        "--ink",
        "#2474d4",
        "--rounds",
        "2",
        "--json",
      ],
      {
        hostResourceCoordinator: recordingCoordinator(admission, 91),
        icon: async (input) => {
          expect(input).toMatchObject({
            ink: "#2474d4",
            outputPath: "plane.svg",
            rounds: 2,
            subject: "a paper airplane",
            inheritedFileDescriptors: [91],
          })
          return {
            attempts: [
              {
                pass: true,
                requestId: "req_one",
                round: 1,
                score: 91,
                status: "selected",
                warnings: [],
              },
            ],
            ink: "#2474d4",
            model: "recraft/recraft-v4.1-utility",
            outputPath: "/workspace/plane.svg",
            receiptVersion: 1,
            rounds: 2,
            selectedRound: 1,
            subject: "a paper airplane",
            svgSha256: "3".repeat(64),
          }
        },
        log: (line) => output.push(line),
      },
    )
    expect(admission.claims).toEqual([[
      { resource: "cpu", amount: 1 },
      { resource: "local-io", amount: 1 },
      { resource: "network", amount: 1 },
      { resource: "paid-call", amount: 1 },
    ]])
    expect(JSON.parse(output.join("\n"))).toMatchObject({
      outputPath: "/workspace/plane.svg",
      selectedRound: 1,
    })
  })

  test("executes exact typed JSON without loading workspace code", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-cli-code-"))
    const marker = join(root, "config-executed")
    try {
      await writeFile(
        join(root, "flow.diagram.json"),
        JSON.stringify({
          version: 1,
          name: "flow",
          canvas: { width: 400, height: 200 },
          shapes: [
            {
              id: "one",
              type: "rect",
              x: 40,
              y: 40,
              width: 120,
              height: 80,
            },
          ],
        }),
      )
      await writeFile(
        join(root, "slopcamera.config.ts"),
        `await Bun.write(${JSON.stringify(marker)}, "executed"); export default {}\n`,
      )
      const result = await runCli(
        [
          "code",
          "execute",
          "slopcamera.diagram.check",
          "--input",
          JSON.stringify({ path: "flow.diagram.json" }),
        ],
        root,
      )
      expect(result.exitCode).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({
        operation: "slopcamera.diagram.check",
        result: { configPath: null },
      })
      expect(await Bun.file(marker).exists()).toBe(false)

      const rejected = await runCli(
        [
          "code",
          "execute",
          "slopcamera.diagram.check",
          "--input",
          JSON.stringify({
            path: "flow.diagram.json",
            source: `await Bun.write(${JSON.stringify(marker)}, "executed")`,
          }),
        ],
        root,
      )
      expect(rejected.exitCode).toBe(1)
      expect(rejected.stderr).toContain("[INVALID_OPERATION_INPUT]")
      expect(await Bun.file(marker).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("admits in-process code execution through the operation registry", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-cli-admission-"))
    try {
      const path = join(root, "flow.diagram.json")
      await writeFile(path, JSON.stringify({
        version: 1,
        name: "flow",
        canvas: { width: 400, height: 200 },
        shapes: [],
      }))
      const output: string[] = []
      const admission = { assertions: 0, claims: [] as HostResourceClaim[][] }
      await runSlopcameraCliInProcess([
        "code",
        "execute",
        "slopcamera.diagram.check",
        "--input",
        JSON.stringify({ path }),
      ], {
        hostResourceCoordinator: recordingCoordinator(admission),
        log: line => output.push(line),
      })
      expect(JSON.parse(output.join("\n"))).toMatchObject({
        operation: "slopcamera.diagram.check",
        result: { configPath: null },
      })
      expect(admission.claims).toEqual([[
        { resource: "cpu", amount: 1 },
        { resource: "local-io", amount: 1 },
      ]])
      expect(admission.assertions).toBe(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

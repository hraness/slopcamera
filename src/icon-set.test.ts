import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  parseSlopcameraIconSetSpec,
  generateSlopcameraIconSet,
  type IconSetCritique,
  type SlopcameraIconSetSpec,
} from "./icon-set.ts"
import type {
  CollectSlopcameraIconCandidatesResult,
  IconCandidateRecord,
  IconMeasuredMetrics,
} from "./icon.ts"

function fakeExtraction(): IconCandidateRecord["extraction"] {
  return {
    background: "#fcfcfc",
    coverageRatio: 0.2,
    height: 64,
    measuredInk: "#2474d4",
    pixels: new Uint8Array(64 * 64 * 4),
    removedComponents: 0,
    sourceHeight: 64,
    sourceWidth: 64,
    width: 64,
  }
}

function record(
  metrics: Readonly<Partial<IconMeasuredMetrics>> & { coverageRatio: number },
  options: Readonly<{ round?: number; score?: number; slug?: string }> = {},
): IconCandidateRecord {
  const slug = options.slug ?? "member"
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect x="8" y="8" width="48" height="48" fill="#2474d4"/></svg>`
  return {
    candidate: {
      png: Uint8Array.from([1]),
      requestId: `req_${slug}_${options.round ?? 1}`,
      svg,
      vectorize: { pathCount: metrics.pathCount ?? 8 } as never,
      warnings: [],
    },
    critique:
      options.score === undefined
        ? null
        : {
            pass: true,
            problems: [],
            promptFix: "",
            resolvedModel: "test/critique",
            score: options.score,
          },
    extraction: fakeExtraction(),
    metrics: {
      aspectRatio: 1.2,
      bytes: svg.length,
      pathCount: 8,
      strokePx: 10,
      ...metrics,
    },
    round: options.round ?? 1,
  }
}

function collected(
  candidates: readonly IconCandidateRecord[],
): CollectSlopcameraIconCandidatesResult {
  return {
    attempts: [],
    candidates,
    eligible: candidates,
    resolved: {
      context: undefined,
      critiqueModel: "test/critique",
      ink: "#2474d4",
      model: "test/model",
      purpose: "illustration",
      rounds: 2,
      subject: "subject",
    },
  }
}

interface ScriptedCollect {
  readonly calls: readonly {
    readonly initialFeedback?: string
    readonly subject: string
  }[]
  readonly collect: NonNullable<
    import("./icon-set.ts").SlopcameraIconSetDependencies["collectCandidates"]
  >
}

/** Queue candidate batches per subject; later calls pop the next batch. */
function scriptedCollect(
  batches: Readonly<Record<string, readonly IconCandidateRecord[][]>>,
): ScriptedCollect {
  const calls: { initialFeedback?: string; subject: string }[] = []
  return {
    calls,
    collect: async input => {
      calls.push({
        ...(input.initialFeedback === undefined
          ? {}
          : { initialFeedback: input.initialFeedback }),
        subject: input.subject,
      })
      const queue = batches[input.subject]
      const batch = queue?.shift()
      if (batch === undefined || batch.length === 0) {
        throw new Error(`no scripted candidates for ${input.subject}`)
      }
      return collected(batch)
    },
  }
}

const passingSetCritique: IconSetCritique = {
  familyProblems: [],
  members: [],
  pass: true,
  resolvedModel: "test/set-critique",
}

function spec(members: SlopcameraIconSetSpec["members"]): SlopcameraIconSetSpec {
  return { context: "card", members, name: "test-set" }
}

describe("icon set manifest", () => {
  test("parses a bounded manifest and rejects bad shapes", () => {
    const parsed = parseSlopcameraIconSetSpec({
      context: "card",
      ink: "#112233",
      members: [
        { slug: "library", subject: "a bookshelf" },
        { slug: "docs", purpose: "illustration", subject: "stacked documents" },
      ],
      name: "home",
    })
    expect(parsed.members.map(member => member.slug)).toEqual([
      "library",
      "docs",
    ])
    expect(parsed.ink).toBe("#112233")
    expect(() =>
      parseSlopcameraIconSetSpec({
        members: [
          { slug: "a", subject: "x" },
          { slug: "a", subject: "y" },
        ],
      }),
    ).toThrow("duplicated")
    expect(() =>
      parseSlopcameraIconSetSpec({
        members: [{ slug: "Bad Slug", subject: "x" }],
      }),
    ).toThrow()
    expect(() => parseSlopcameraIconSetSpec({ members: [] })).toThrow()
    expect(() =>
      parseSlopcameraIconSetSpec({
        members: [{ context: "poster", slug: "a", subject: "x" }],
      }),
    ).toThrow()
  })
})

describe("icon set generation", () => {
  test("selects the candidate closest to the family, not the highest score", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-set-"))
    try {
      const collect = scriptedCollect({
        alpha: [
          [
            record({ coverageRatio: 0.3, strokePx: 10 }, { round: 1, score: 95 }),
            record({ coverageRatio: 0.15, strokePx: 10 }, { round: 2, score: 70 }),
          ],
        ],
        beta: [[record({ coverageRatio: 0.16, strokePx: 10 }, { score: 80 })]],
        gamma: [[record({ coverageRatio: 0.14, strokePx: 10 }, { score: 78 })]],
      })
      const receipt = await generateSlopcameraIconSet(
        {
          outputDir: root,
          setRounds: 1,
          spec: spec([
            { slug: "alpha", subject: "alpha" },
            { slug: "beta", subject: "beta" },
            { slug: "gamma", subject: "gamma" },
          ]),
        },
        {
          collectCandidates: collect.collect,
          composeSheet: async () => Uint8Array.from([1]),
          setCritique: async () => passingSetCritique,
        },
      )
      const alpha = receipt.members.find(member => member.slug === "alpha")!
      expect(alpha.metrics.coverageRatio).toBeCloseTo(0.15)
      const selected = alpha.candidates.find(candidate => candidate.selected)!
      expect(selected.round).toBe(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("regenerates members outside the family band with directional feedback", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-set-"))
    try {
      const collect = scriptedCollect({
        alpha: [
          [record({ coverageRatio: 0.05, strokePx: 10 }, { score: 90 })],
          [record({ coverageRatio: 0.2, strokePx: 10 }, { round: 1, score: 60 })],
        ],
        beta: [[record({ coverageRatio: 0.2, strokePx: 10 })]],
      })
      let critiques = 0
      const receipt = await generateSlopcameraIconSet(
        {
          outputDir: root,
          setRounds: 3,
          spec: spec([
            { slug: "alpha", subject: "alpha" },
            { slug: "beta", subject: "beta" },
          ]),
        },
        {
          collectCandidates: collect.collect,
          composeSheet: async () => Uint8Array.from([1]),
          setCritique: async () => {
            critiques += 1
            return passingSetCritique
          },
        },
      )
      const regenCall = collect.calls.find(
        call => call.subject === "alpha" && call.initialFeedback !== undefined,
      )
      expect(regenCall?.initialFeedback).toContain("density")
      const alpha = receipt.members.find(member => member.slug === "alpha")!
      expect(alpha.metrics.coverageRatio).toBeCloseTo(0.2)
      expect(alpha.regenerated).toBe(1)
      expect(critiques).toBe(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("feeds contact-sheet member verdicts back into that member's prompt", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-set-"))
    try {
      const collect = scriptedCollect({
        alpha: [[record({ coverageRatio: 0.2 })]],
        beta: [
          [record({ coverageRatio: 0.2 })],
          [record({ coverageRatio: 0.21, strokePx: 10 }, { score: 66 })],
        ],
      })
      const verdicts = [
        {
          familyProblems: [],
          members: [
            {
              pass: false,
              problems: ["thinner outline than the family"],
              promptFix: "match the family's medium stroke",
              slug: "beta",
            },
          ],
          pass: false,
          resolvedModel: "test/set-critique",
        },
        passingSetCritique,
      ] satisfies readonly IconSetCritique[]
      const receipt = await generateSlopcameraIconSet(
        {
          outputDir: root,
          setRounds: 3,
          spec: spec([
            { slug: "alpha", subject: "alpha" },
            { slug: "beta", subject: "beta" },
          ]),
        },
        {
          collectCandidates: collect.collect,
          composeSheet: async () => Uint8Array.from([1]),
          setCritique: async () => verdicts.shift() ?? passingSetCritique,
        },
      )
      const regenCall = collect.calls.find(
        call => call.subject === "beta" && call.initialFeedback !== undefined,
      )
      expect(regenCall?.initialFeedback).toContain("medium stroke")
      expect(receipt.setCritiques).toHaveLength(2)
      const svg = await readFile(join(root, "beta.svg"), "utf8")
      expect(svg).toContain("<svg")
      expect(
        await Bun.file(join(root, "test-set.receipt.json")).exists(),
      ).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("fails closed when the set cannot converge inside its bounded rounds", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-set-"))
    try {
      const collect = scriptedCollect({
        alpha: [
          [record({ coverageRatio: 0.05 })],
          [record({ coverageRatio: 0.05 })],
          [record({ coverageRatio: 0.05 })],
        ],
        beta: [[record({ coverageRatio: 0.3 })]],
      })
      await expect(
        generateSlopcameraIconSet(
          {
            outputDir: root,
            setRounds: 2,
            spec: spec([
              { slug: "alpha", subject: "alpha" },
              { slug: "beta", subject: "beta" },
            ]),
          },
          {
            collectCandidates: collect.collect,
            composeSheet: async () => Uint8Array.from([1]),
            setCritique: async () => passingSetCritique,
          },
        ),
      ).rejects.toThrow("did not converge")
      expect(await Bun.file(join(root, "alpha.svg")).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("keeps working without a critique model when rounds is 1", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-set-"))
    try {
      const collect = scriptedCollect({
        alpha: [[record({ coverageRatio: 0.2 })]],
        beta: [[record({ coverageRatio: 0.22 })]],
      })
      let critiques = 0
      const receipt = await generateSlopcameraIconSet(
        {
          outputDir: root,
          rounds: 1,
          spec: spec([
            { slug: "alpha", subject: "alpha" },
            { slug: "beta", subject: "beta" },
          ]),
        },
        {
          collectCandidates: collect.collect,
          composeSheet: async () => Uint8Array.from([1]),
          setCritique: async () => {
            critiques += 1
            return passingSetCritique
          },
        },
      )
      expect(critiques).toBe(0)
      expect(receipt.members).toHaveLength(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

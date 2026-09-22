import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RepositoryPaths } from "./paths";
import {
  CreditsStore,
  loadCreditsToken,
  parseBalance,
  parseClaimResponse,
  parseClaimStatus,
  parseHostedCallResult,
} from "./credits";
import type { CliIo } from "./io";
import { createCliTestRunner } from "./run-cli-test-helper";

const runCli = createCliTestRunner(import.meta.url);

const CLAIM_ID = "clm_test_abcdef123456";
const CLAIM_SECRET = "cr_clm_testsecret_0123456789abcdef";
const DEVICE_TOKEN = "cr_dev_testtoken_0123456789abcdef";
const CLAIM_URL = `https://credits.hraness.com/t/${CLAIM_ID}`;

const PACKS = [
  { id: "p25", usd: 25, credits: 2500, bonusCredits: 150, label: "$25: 2,500 credits + 150 bonus" },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function claimResponse(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "hraness-credits-claim-v1",
    claimId: CLAIM_ID,
    claimSecret: CLAIM_SECRET,
    url: CLAIM_URL,
    expiresAt: "2027-01-01T00:00:00.000Z",
    packs: PACKS,
    suggestedPackId: "p25",
    ...overrides,
  };
}

function balanceResponse(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "hraness-credits-status-v1",
    product: { id: "slopcamera", name: "Slopcamera" },
    balance: { microUsd: 25_000_000, credits: 2500, usd: "25.00" },
    held: { microUsd: 0 },
    lowBalance: false,
    topup: { url: CLAIM_URL, packs: PACKS, suggestedPackId: "p25" },
    ...overrides,
  };
}

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-credits-test-")));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()!;
    await rm(root, { force: true, recursive: true });
  }
});

interface CapturedIo {
  readonly io: CliIo;
  stdout(): string;
  stderr(): string;
}

function capturedIo(env: Record<string, string | undefined>, cwd: string): CapturedIo {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      cwd: () => cwd,
      env,
      now: () => new Date("2026-09-22T00:00:00.000Z"),
      platform: "darwin",
      stderr: value => {
        stderr += value;
      },
      stdout: value => {
        stdout += value;
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

function testPaths(root: string): RepositoryPaths {
  return {
    artifactRoot: join(root, "artifacts", "slopcamera", "recordings"),
    desktopRoot: join(root, "apps", "desktop"),
    privateRoot: join(root, "artifacts", "slopcamera", "private"),
    projectRoot: join(root, "artifacts", "slopcamera", "projects"),
    repositoryRoot: root,
  };
}

describe("credits response parsing", () => {
  test("parses a claim response", () => {
    const claim = parseClaimResponse(claimResponse());
    expect(claim.claimId).toBe(CLAIM_ID);
    expect(claim.claimSecret).toBe(CLAIM_SECRET);
    expect(claim.url).toBe(CLAIM_URL);
    expect(claim.packs[0]?.id).toBe("p25");
  });

  test("rejects a claim without a secret or a foreign URL shape", () => {
    expect(() => parseClaimResponse(claimResponse({ claimSecret: undefined }))).toThrow();
    expect(() => parseClaimResponse(claimResponse({ url: "javascript:alert(1)" }))).toThrow();
    expect(() => parseClaimResponse("nope")).toThrow();
  });

  test("parses paid status with a one-time device token", () => {
    const status = parseClaimStatus({
      schemaVersion: "hraness-credits-claim-status-v1",
      claimId: CLAIM_ID,
      state: "paid",
      expiresAt: "2027-01-01T00:00:00.000Z",
      token: DEVICE_TOKEN,
    });
    expect(status.state).toBe("paid");
    expect(status.deviceToken).toBe(DEVICE_TOKEN);
  });

  test("rejects a malformed device token in claim status", () => {
    expect(() => parseClaimStatus({
      schemaVersion: "hraness-credits-claim-status-v1",
      claimId: CLAIM_ID,
      state: "paid",
      expiresAt: "2027-01-01T00:00:00.000Z",
      token: "not-a-token",
    })).toThrow();
  });

  test("parses a balance with a wallet-bound topup", () => {
    const balance = parseBalance(balanceResponse());
    expect(balance.balance.usd).toBe("25.00");
    expect(balance.topup?.url).toBe(CLAIM_URL);
    expect(balance.lowBalance).toBeFalse();
  });

  test("parses a hosted call result with artifacts", () => {
    const result = parseHostedCallResult({
      ok: true,
      artifacts: [{
        id: "9b5f1d4e-0000-4000-8000-000000000000",
        name: "output.png",
        bytes: 3,
        sha256: "abc",
        contentType: "image/png",
        url: "https://api.slopcamera.com/v1/artifacts/9b5f1d4e-0000-4000-8000-000000000000",
        contentUrl: "https://api.slopcamera.com/v1/artifacts/9b5f1d4e-0000-4000-8000-000000000000/content",
        expiresAt: "2027-01-01T00:00:00.000Z",
      }],
    });
    expect(result.ok).toBeTrue();
    expect(result.artifacts[0]?.contentUrl).toContain("/content");
  });
});

describe("credits store", () => {
  test("round-trips the device token with owner-only permissions", async () => {
    const root = await tempRoot();
    const store = new CreditsStore(join(root, "state"));
    await store.writeDeviceToken(DEVICE_TOKEN);
    expect(await store.readDeviceToken()).toBe(DEVICE_TOKEN);
    const mode = (await stat(store.tokenPath)).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(await store.clearDeviceToken()).toBeTrue();
    expect(await store.readDeviceToken()).toBeUndefined();
  });

  test("round-trips a pending claim and device identity", async () => {
    const root = await tempRoot();
    const store = new CreditsStore(join(root, "state"));
    const identity = await store.deviceIdentity();
    const again = await store.deviceIdentity();
    expect(again.deviceId).toBe(identity.deviceId);
    await store.writePendingClaim({
      claimId: CLAIM_ID,
      claimSecret: CLAIM_SECRET,
      url: CLAIM_URL,
      expiresAt: "2027-01-01T00:00:00.000Z",
      packs: PACKS,
      suggestedPackId: "p25",
      createdAt: "2026-09-22T00:00:00.000Z",
    });
    const pending = await store.readPendingClaim();
    expect(pending?.claimId).toBe(CLAIM_ID);
    expect(pending?.claimSecret).toBe(CLAIM_SECRET);
    expect(await store.clearPendingClaim()).toBeTrue();
  });

  test("rejects a malformed stored token", async () => {
    const root = await tempRoot();
    const store = new CreditsStore(join(root, "state"));
    await store.writeDeviceToken(DEVICE_TOKEN);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(store.tokenPath, "tampered\n");
    await expect(store.readDeviceToken()).rejects.toThrow(/malformed/u);
  });

  test("env token wins over stored state", async () => {
    const root = await tempRoot();
    const store = new CreditsStore(join(root, "state"));
    await store.writeDeviceToken(DEVICE_TOKEN);
    const envToken = "cr_dev_envtoken_0123456789abcdef";
    const loaded = await loadCreditsToken({ SLOPCAMERA_CREDITS_TOKEN: envToken }, store);
    expect(loaded).toEqual({ token: envToken, source: "env" });
    const fromState = await loadCreditsToken({}, store);
    expect(fromState).toEqual({ token: DEVICE_TOKEN, source: "state" });
    await expect(loadCreditsToken({ SLOPCAMERA_CREDITS_TOKEN: "bogus" }, store)).rejects.toThrow();
  });
});

describe("credits commands", () => {
  test("status reports not-configured with the topup next step", async () => {
    const root = await tempRoot();
    const io = capturedIo({}, root);
    const exitCode = await runCli(["credits", "status", "--json"], {
      io: io.io,
      stateRoot: join(root, "state"),
      paths: testPaths(root),
      fetch: () => Promise.reject(new Error("unexpected network")),
    });
    expect(exitCode).toBe(0);
    const view = JSON.parse(io.stdout()) as { configured: boolean; next: string[] };
    expect(view.configured).toBeFalse();
    expect(view.next[0]).toContain("topup");
  });

  test("topup creates a claim, persists it, and prints the pay URL", async () => {
    const root = await tempRoot();
    const io = capturedIo({}, root);
    const calls: { url: string; body: unknown }[] = [];
    const exitCode = await runCli(
      ["credits", "topup", "--pack", "p25", "--json"],
      {
        io: io.io,
        stateRoot: join(root, "state"),
        paths: testPaths(root),
        fetch: async (input, init) => {
          calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
          return jsonResponse(claimResponse(), 201);
        },
      },
    );
    expect(exitCode).toBe(0);
    const view = JSON.parse(io.stdout()) as { claimId: string; url: string };
    expect(view.claimId).toBe(CLAIM_ID);
    expect(view.url).toBe(CLAIM_URL);
    expect(calls).toHaveLength(1);
    const body = calls[0]!.body as { product: string; packId: string; device: { id: string } };
    expect(body.product).toBe("slopcamera");
    expect(body.packId).toBe("p25");
    expect(body.device.id).toMatch(/^[0-9a-f-]{36}$/u);

    const store = new CreditsStore(join(root, "state"));
    const pending = await store.readPendingClaim();
    expect(pending?.claimId).toBe(CLAIM_ID);
    expect(pending?.claimSecret).toBe(CLAIM_SECRET);
    const pendingMode = (await stat(store.pendingClaimPath)).mode & 0o777;
    expect(pendingMode).toBe(0o600);

    // A second topup reuses the live pending claim without a new request.
    io.stdout();
    const secondIo = capturedIo({}, root);
    const second = await runCli(["credits", "topup", "--json"], {
      io: secondIo.io,
      stateRoot: join(root, "state"),
      paths: testPaths(root),
      fetch: () => Promise.reject(new Error("no request expected")),
    });
    expect(second).toBe(0);
    const reused = JSON.parse(secondIo.stdout()) as { reused: boolean; url: string };
    expect(reused.reused).toBeTrue();
    expect(reused.url).toBe(CLAIM_URL);
  });

  test("wait polls the claim, stores the one-time token, then reports", async () => {
    const root = await tempRoot();
    const stateRoot = join(root, "state");
    const store = new CreditsStore(stateRoot);
    await store.writePendingClaim({
      claimId: CLAIM_ID,
      claimSecret: CLAIM_SECRET,
      url: CLAIM_URL,
      expiresAt: "2027-01-01T00:00:00.000Z",
      packs: PACKS,
      suggestedPackId: "p25",
      createdAt: "2026-09-22T00:00:00.000Z",
    });
    const io = capturedIo({}, root);
    const auths: string[] = [];
    let polls = 0;
    const exitCode = await runCli(["credits", "wait", "--timeout", "5s", "--json"], {
      io: io.io,
      stateRoot,
      paths: testPaths(root),
      sleep: () => Promise.resolve(),
      fetch: async (_input, init) => {
        auths.push(String((init?.headers as Record<string, string> | undefined)?.authorization));
        polls += 1;
        if (polls === 1) {
          return jsonResponse({
            schemaVersion: "hraness-credits-claim-status-v1",
            claimId: CLAIM_ID,
            state: "pending",
            expiresAt: "2027-01-01T00:00:00.000Z",
          });
        }
        // The service reports "consumed" (not "paid") on the poll that issues
        // the one-time token; the token must still be persisted.
        return jsonResponse({
          schemaVersion: "hraness-credits-claim-status-v1",
          claimId: CLAIM_ID,
          state: "consumed",
          expiresAt: "2027-01-01T00:00:00.000Z",
          token: DEVICE_TOKEN,
        });
      },
    });
    expect(exitCode).toBe(0);
    expect(polls).toBe(2);
    expect(auths.every(header => header === `Bearer ${CLAIM_SECRET}`)).toBeTrue();
    expect(await store.readDeviceToken()).toBe(DEVICE_TOKEN);
    expect(await store.readPendingClaim()).toBeUndefined();
    const view = JSON.parse(io.stdout()) as { configured: boolean; state: string };
    expect(view).toMatchObject({ configured: true, state: "paid" });
    // The token must never appear in output.
    expect(io.stdout()).not.toContain(DEVICE_TOKEN);
  });

  test("wait without a pending claim is a usage error", async () => {
    const root = await tempRoot();
    const io = capturedIo({}, root);
    const exitCode = await runCli(["credits", "wait", "--json"], {
      io: io.io,
      stateRoot: join(root, "state"),
      paths: testPaths(root),
      fetch: () => Promise.reject(new Error("unexpected network")),
    });
    expect(exitCode).toBe(2);
    expect(io.stderr() + io.stdout()).toContain("topup");
  });

  test("status reads the wallet through the stored token", async () => {
    const root = await tempRoot();
    const stateRoot = join(root, "state");
    await new CreditsStore(stateRoot).writeDeviceToken(DEVICE_TOKEN);
    const io = capturedIo({}, root);
    const auths: string[] = [];
    const exitCode = await runCli(["credits", "status", "--json"], {
      io: io.io,
      stateRoot,
      paths: testPaths(root),
      fetch: async (_input, init) => {
        auths.push(String((init?.headers as Record<string, string> | undefined)?.authorization));
        return jsonResponse(balanceResponse());
      },
    });
    expect(exitCode).toBe(0);
    expect(auths).toEqual([`Bearer ${DEVICE_TOKEN}`]);
    const view = JSON.parse(io.stdout()) as { configured: boolean; balance: { usd: string } };
    expect(view.configured).toBeTrue();
    expect(view.balance.usd).toBe("25.00");
    expect(io.stdout()).not.toContain(DEVICE_TOKEN);
  });

  test("a configured wallet's topup returns the bound claim URL", async () => {
    const root = await tempRoot();
    const stateRoot = join(root, "state");
    await new CreditsStore(stateRoot).writeDeviceToken(DEVICE_TOKEN);
    const io = capturedIo({}, root);
    const exitCode = await runCli(["credits", "topup", "--json"], {
      io: io.io,
      stateRoot,
      paths: testPaths(root),
      fetch: async () => jsonResponse(balanceResponse()),
    });
    expect(exitCode).toBe(0);
    const view = JSON.parse(io.stdout()) as { walletBound: boolean; url: string };
    expect(view.walletBound).toBeTrue();
    expect(view.url).toBe(CLAIM_URL);
  });

  test("forget removes the token and pending claim", async () => {
    const root = await tempRoot();
    const stateRoot = join(root, "state");
    const store = new CreditsStore(stateRoot);
    await store.writeDeviceToken(DEVICE_TOKEN);
    await store.writePendingClaim({
      claimId: CLAIM_ID,
      claimSecret: CLAIM_SECRET,
      url: CLAIM_URL,
      expiresAt: "2027-01-01T00:00:00.000Z",
      packs: PACKS,
      suggestedPackId: "p25",
      createdAt: "2026-09-22T00:00:00.000Z",
    });
    const io = capturedIo({}, root);
    const exitCode = await runCli(["credits", "forget", "--json"], {
      io: io.io,
      stateRoot,
      paths: testPaths(root),
      fetch: () => Promise.reject(new Error("unexpected network")),
    });
    expect(exitCode).toBe(0);
    expect(await store.readDeviceToken()).toBeUndefined();
    expect(await store.readPendingClaim()).toBeUndefined();
    const view = JSON.parse(io.stdout()) as { tokenRemoved: boolean; claimRemoved: boolean; configured: boolean };
    expect(view).toEqual({ claimRemoved: true, configured: false, tokenRemoved: true });
  });
});

describe("hosted image generation", () => {
  const ARTIFACT_ID = "9b5f1d4e-0000-4000-8000-000000000000";
  const PIXEL = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  function hostedFetch(artifactBytes: Uint8Array<ArrayBuffer> = PIXEL) {
    const calls: { url: string; auth?: string | undefined; body?: unknown }[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({
        url,
        auth: (init?.headers as Record<string, string> | undefined)?.authorization,
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      if (url === "https://api.slopcamera.com/v1/tools/execute_slopcamera/call") {
        const { createHash } = await import("node:crypto");
        const sha256 = createHash("sha256").update(artifactBytes).digest("hex");
        return jsonResponse({
          ok: true,
          result: { outputPath: "output.png" },
          artifacts: [{
            id: ARTIFACT_ID,
            name: "output.png",
            bytes: artifactBytes.byteLength,
            sha256,
            contentType: "image/png",
            url: `https://api.slopcamera.com/v1/artifacts/${ARTIFACT_ID}`,
            contentUrl: `https://api.slopcamera.com/v1/artifacts/${ARTIFACT_ID}/content`,
            expiresAt: "2027-01-01T00:00:00.000Z",
          }],
        });
      }
      if (url === `https://api.slopcamera.com/v1/artifacts/${ARTIFACT_ID}/content`) {
        return new Response(new Blob([artifactBytes]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return jsonResponse({ error: "not_found" }, 404);
    };
    return { calls, fetch };
  }

  test("--hosted generates through the hosted API and publishes the artifact", async () => {
    const root = await tempRoot();
    const stateRoot = join(root, "state");
    await new CreditsStore(stateRoot).writeDeviceToken(DEVICE_TOKEN);
    const { calls, fetch } = hostedFetch();
    const io = capturedIo({}, root);
    const exitCode = await runCli(
      ["ai", "image", "generate", "--hosted", "--model", "openai/gpt-image-1", "--prompt", "a red cube", "--json"],
      { io: io.io, stateRoot, paths: testPaths(root), fetch },
    );
    expect(exitCode).toBe(0);
    expect(calls[0]?.url).toBe("https://api.slopcamera.com/v1/tools/execute_slopcamera/call");
    expect(calls[0]?.auth).toBe(`Bearer ${DEVICE_TOKEN}`);
    const body = calls[0]?.body as { arguments: { operation: string; input: { model: string; outputPath: string } }; idempotencyKey: string };
    expect(body.arguments.operation).toBe("slopcamera.image.generate");
    expect(body.arguments.input.model).toBe("openai/gpt-image-1");
    expect(body.arguments.input.outputPath).toMatch(/\.png$/u);
    expect(body.idempotencyKey.length).toBeGreaterThan(8);

    const view = JSON.parse(io.stdout()) as { provider: string; output: string; receipt: string; sha256: string };
    expect(view.provider).toBe("hosted");
    const written = new Uint8Array(await readFile(join(root, view.output)));
    expect(written).toEqual(PIXEL);
    const receipt = JSON.parse(
      await readFile(join(root, view.receipt), "utf8"),
    ) as { provider: string; model: string };
    expect(receipt.provider).toBe("hosted");
    expect(receipt.model).toBe("openai/gpt-image-1");
    expect(io.stdout()).not.toContain(DEVICE_TOKEN);
  });

  test("--hosted rejects gateway-only flags with a usage error", async () => {
    const root = await tempRoot();
    const io = capturedIo({}, root);
    const exitCode = await runCli(
      ["ai", "image", "generate", "--hosted", "--model", "openai/gpt-image-1", "--prompt", "x", "--count", "2"],
      {
        io: io.io,
        stateRoot: join(root, "state"),
        paths: testPaths(root),
        fetch: () => Promise.reject(new Error("unexpected network")),
      },
    );
    expect(exitCode).toBe(2);
    expect(io.stderr()).toContain("--count");
  });

  test("--hosted without a token points at credits topup", async () => {
    const root = await tempRoot();
    const io = capturedIo({}, root);
    const exitCode = await runCli(
      ["ai", "image", "generate", "--hosted", "--model", "openai/gpt-image-1", "--prompt", "x"],
      {
        io: io.io,
        stateRoot: join(root, "state"),
        paths: testPaths(root),
        fetch: () => Promise.reject(new Error("unexpected network")),
      },
    );
    expect(exitCode).toBe(10);
    expect(io.stderr()).toContain("credits topup");
  });

  test("a stored token routes an unflagged call to hosted when no gateway credential exists", async () => {
    const root = await tempRoot();
    const stateRoot = join(root, "state");
    await new CreditsStore(stateRoot).writeDeviceToken(DEVICE_TOKEN);
    const { calls, fetch } = hostedFetch();
    const io = capturedIo({}, root);
    const exitCode = await runCli(
      ["ai", "image", "generate", "--model", "openai/gpt-image-1", "--prompt", "a red cube", "--json"],
      { io: io.io, stateRoot, paths: testPaths(root), fetch },
    );
    expect(exitCode).toBe(0);
    expect(calls[0]?.url).toContain("api.slopcamera.com");
  });

  test("a 402 shortfall surfaces the topup URL", async () => {
    const root = await tempRoot();
    const stateRoot = join(root, "state");
    await new CreditsStore(stateRoot).writeDeviceToken(DEVICE_TOKEN);
    const io = capturedIo({}, root);
    const exitCode = await runCli(
      ["ai", "image", "generate", "--hosted", "--model", "openai/gpt-image-1", "--prompt", "x", "--json"],
      {
        io: io.io,
        stateRoot,
        paths: testPaths(root),
        fetch: async () => jsonResponse({
          error: "insufficient_credits",
          message: "Not enough credits.",
          required: { microUsd: 400_000, usd: "0.40" },
          balance: { microUsd: 10_000, usd: "0.01", availableMicroUsd: 10_000 },
          topup: { url: CLAIM_URL },
        }, 402),
      },
    );
    expect(exitCode).toBe(5);
    const error = JSON.parse(io.stderr()) as { error: { code: string; details?: { topup?: { url: string } } } };
    expect(error.error.details?.topup?.url).toBe(CLAIM_URL);
  });
});

import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { verifySlopcameraUpdate } from "./update-verification";

function fixture(change: { lightweight?: boolean; mutable?: boolean; badDigest?: boolean; rejectedAttestation?: boolean } = {}) {
  const source = "a".repeat(40);
  const tagObject = "b".repeat(40);
  const bundle = Buffer.from('{"verified-by":"gh"}\n');
  const calls: string[][] = [];
  const gh = async (args: readonly string[]): Promise<Buffer> => {
    calls.push([...args]);
    const path = args[1];
    if (args[0] === "api" && path?.includes("/git/ref/")) return Buffer.from(JSON.stringify({ object: { type: change.lightweight ? "commit" : "tag", sha: tagObject } }));
    if (args[0] === "api" && path?.includes("/git/tags/")) return Buffer.from(JSON.stringify({ tag: "v3.10.0", object: { type: "commit", sha: source } }));
    if (args[0] === "api" && path?.includes("/releases/tags/")) return Buffer.from(JSON.stringify({
      tag_name: "v3.10.0", immutable: !change.mutable,
      assets: [{ name: "provenance.jsonl", id: 123, size: bundle.length, state: "uploaded",
        digest: `sha256:${change.badDigest ? "0".repeat(64) : createHash("sha256").update(bundle).digest("hex")}` }],
    }));
    if (args[0] === "api" && path?.includes("/releases/assets/")) return bundle;
    if (args[0] === "attestation") {
      expect(readFileSync(args.at(-1)!)).toEqual(bundle);
      if (change.rejectedAttestation) throw new Error("wrong signer or source");
    }
    return Buffer.alloc(0);
  };
  return { calls, gh, source };
}

const artifact = { path: "/isolated/hraness-slopcamera-3.10.0.tgz", version: "3.10.0", sha256: "c".repeat(64) };

test("automatic updates keep immutable release, asset, tag, source, and hosted signer checks", async () => {
  const f = fixture();
  await verifySlopcameraUpdate(artifact, f.gh);
  expect(f.calls[0]).toEqual(["release", "verify", "v3.10.0", "--repo", "hraness/slopcamera"]);
  expect(f.calls[1]).toEqual(["release", "verify-asset", "v3.10.0", artifact.path, "--repo", "hraness/slopcamera"]);
  const verify = f.calls.at(-1)!;
  expect(verify.slice(0, -1)).toEqual([
    "attestation", "verify", artifact.path, "--repo", "hraness/slopcamera",
    "--signer-workflow", "hraness/slopcamera/.github/workflows/release.yml",
    "--signer-digest", f.source, "--source-digest", f.source,
    "--source-ref", "refs/tags/v3.10.0", "--deny-self-hosted-runners", "--bundle",
  ]);
  expect(existsSync(verify.at(-1)!)).toBe(false);
});

for (const change of [{ lightweight: true }, { mutable: true }, { badDigest: true }, { rejectedAttestation: true }]) {
  test(`verification refuses ${Object.keys(change)[0]}`, async () => {
    const f = fixture(change);
    await expect(verifySlopcameraUpdate(artifact, f.gh)).rejects.toThrow();
    const verify = f.calls.find(args => args[0] === "attestation");
    if (verify !== undefined) expect(existsSync(verify.at(-1)!)).toBe(false);
  });
}

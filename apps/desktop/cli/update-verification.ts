import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repository = "hraness/slopcamera";
const maximumMetadataBytes = 2 * 1024 * 1024;
type Gh = (args: readonly string[]) => Promise<Buffer>;

const runGh: Gh = args => new Promise((resolve, reject) => {
  execFile("gh", [...args], {
    encoding: "buffer", timeout: 30_000, maxBuffer: maximumMetadataBytes,
    env: { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
  }, (error, stdout) => {
    // gh's error can include authenticated response bodies. Keep diagnostics fixed.
    if (error !== null) reject(new Error("Slopcamera release verification failed. Check GitHub CLI access and retry slopcamera update."));
    else resolve(stdout);
  });
});

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid Slopcamera release metadata.");
  return value as Record<string, unknown>;
}

/** Keep the install guide's immutable-release and source-bound attestation checks. */
export async function verifySlopcameraUpdate(
  artifact: { path: string; version: string; sha256: string },
  gh: Gh = runGh,
): Promise<void> {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(artifact.version)
    || artifact.version.length > 50 || !/^[a-f0-9]{64}$/u.test(artifact.sha256)) throw new Error("Invalid Slopcamera update identity.");
  const tag = `v${artifact.version}`;
  const json = async (path: string) => {
    const bytes = await gh(["api", path]);
    if (bytes.length > maximumMetadataBytes) throw new Error("Slopcamera release metadata is too large.");
    return record(JSON.parse(bytes.toString("utf8")) as unknown);
  };
  await gh(["release", "verify", tag, "--repo", repository]);
  await gh(["release", "verify-asset", tag, artifact.path, "--repo", repository]);
  const reference = record((await json(`repos/${repository}/git/ref/tags/${tag}`)).object);
  if (reference.type !== "tag" || typeof reference.sha !== "string" || !/^[a-f0-9]{40}$/u.test(reference.sha)) {
    throw new Error("Slopcamera updates require an annotated release tag.");
  }
  const annotated = await json(`repos/${repository}/git/tags/${reference.sha}`);
  const source = record(annotated.object);
  if (annotated.tag !== tag || source.type !== "commit" || typeof source.sha !== "string" || !/^[a-f0-9]{40}$/u.test(source.sha)) {
    throw new Error("Slopcamera release tag does not identify its source commit.");
  }
  const release = await json(`repos/${repository}/releases/tags/${tag}`);
  if (release.tag_name !== tag || release.immutable !== true || !Array.isArray(release.assets)) {
    throw new Error("Slopcamera release is not immutable.");
  }
  const bundles = release.assets.map(record).filter(asset => asset.name === "provenance.jsonl");
  const bundle = bundles[0];
  if (bundles.length !== 1 || bundle === undefined || bundle.state !== "uploaded"
    || typeof bundle.id !== "number" || !Number.isSafeInteger(bundle.id) || bundle.id <= 0
    || typeof bundle.size !== "number" || !Number.isSafeInteger(bundle.size) || bundle.size < 1 || bundle.size > maximumMetadataBytes
    || typeof bundle.digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(bundle.digest)) {
    throw new Error("Slopcamera release lacks a checked provenance bundle.");
  }
  const bytes = await gh(["api", `repos/${repository}/releases/assets/${bundle.id}`, "--header", "Accept: application/octet-stream"]);
  if (bytes.length !== bundle.size || `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== bundle.digest) {
    throw new Error("Slopcamera provenance bundle differs from the immutable release.");
  }
  const directory = await mkdtemp(join(tmpdir(), "slopcamera-update-verification-"));
  try {
    const path = join(directory, "provenance.jsonl");
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    await gh(["attestation", "verify", artifact.path, "--repo", repository,
      "--signer-workflow", `${repository}/.github/workflows/release.yml`,
      "--signer-digest", source.sha, "--source-digest", source.sha,
      "--source-ref", `refs/tags/${tag}`, "--deny-self-hosted-runners", "--bundle", path]);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

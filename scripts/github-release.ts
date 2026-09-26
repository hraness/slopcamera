/** Standalone Node 24 release authority. Only built-ins belong in this closure. */
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const repository = "hraness/slopcamera";
export const repositoryId = 1310516748;
export const packageName = "@hraness/slopcamera";
export const workflow = ".github/workflows/release.yml";
export const authorityPaths = [workflow, "scripts/github-release.ts", "scripts/prepare-github-release.ts", "scripts/package-smoke.ts",
  "scripts/npm-package-identity.ts", "scripts/npm-publish-policy.ts", "package.json", "bun.lock"] as const;
const workflowId = 320001524;
const actorId = 894119;
const authorId = 41898282;
const sha = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;
const maximumFileBytes = 8_000_000;
type Json = Record<string, unknown>;

export function record(value: unknown, label: string): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Json;
}
function exactKeys(value: Json, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} has unexpected or missing fields.`);
}
function positive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}
export function stableVersion(value: unknown): string {
  if (typeof value !== "string" || value.length > 50 || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(value)
    || !value.split(".").every(part => Number.isSafeInteger(Number(part)))) throw new Error("Expected one bounded stable version.");
  return value;
}
export function compareVersions(left: string, right: string): number {
  const a = stableVersion(left).split(".").map(BigInt);
  const b = stableVersion(right).split(".").map(BigInt);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index]! > b[index]! ? 1 : -1;
  }
  return 0;
}
export function hash(bytes: Uint8Array, algorithm = "sha256"): string {
  return createHash(algorithm).update(bytes).digest("hex");
}
export interface ReleaseManifest {
  schema: "hraness-github-release-v1";
  repository: typeof repository;
  repositoryId: typeof repositoryId;
  package: typeof packageName;
  version: string;
  tag: string;
  sourceSha: string;
  workflow: typeof workflow;
  workflowSha: string;
  runId: number;
  runAttempt: number;
  archive: { name: string; bytes: number; sha256: string; sha512: string };
}
export function parseManifest(value: unknown): ReleaseManifest {
  const item = record(value, "Release manifest");
  exactKeys(item, ["schema", "repository", "repositoryId", "package", "version", "tag", "sourceSha", "workflow", "workflowSha", "runId", "runAttempt", "archive"], "Release manifest");
  const version = stableVersion(item.version);
  const archive = record(item.archive, "Release archive");
  exactKeys(archive, ["name", "bytes", "sha256", "sha512"], "Release archive");
  if (item.schema !== "hraness-github-release-v1" || item.repository !== repository || item.repositoryId !== repositoryId
    || item.package !== packageName || item.tag !== `v${version}` || item.workflow !== workflow
    || typeof item.sourceSha !== "string" || !sha.test(item.sourceSha) || typeof item.workflowSha !== "string" || !sha.test(item.workflowSha)
    || archive.name !== `hraness-slopcamera-${version}.tgz` || positive(archive.bytes, "Archive size") > 5_200_000
    || typeof archive.sha256 !== "string" || !digest.test(archive.sha256)
    || typeof archive.sha512 !== "string" || !/^[a-f0-9]{128}$/u.test(archive.sha512)) throw new Error("Release manifest identity is invalid.");
  positive(item.runId, "Run ID");
  positive(item.runAttempt, "Run attempt");
  return item as unknown as ReleaseManifest;
}
async function file(path: string, maximum = maximumFileBytes): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size <= 0 || before.size > maximum) throw new Error(`Not a bounded private regular release file: ${basename(path)}`);
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || after.nlink !== 1 || bytes.length !== before.size) throw new Error("Release file changed during admission.");
  return bytes;
}
export function checksums(files: ReadonlyMap<string, Uint8Array>): string {
  return [...files].sort(([a], [b]) => a.localeCompare(b, "en")).map(([name, bytes]) => `${hash(bytes)}  ${name}\n`).join("");
}
export interface Handoff { manifest: ReleaseManifest; files: Map<string, Buffer> }
export async function verifyHandoff(directory: string, signed: boolean): Promise<Handoff> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Release handoff must be a physical directory.");
  const manifestBytes = await file(join(directory, "release-manifest.json"), 8192);
  const manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")) as unknown);
  const names = [manifest.archive.name, "npm-pack.json", "release-manifest.json", "SHA256SUMS", ...(signed ? ["provenance.jsonl"] : [])];
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(names.sort())) throw new Error("Release handoff contains unexpected or missing files.");
  const files = new Map<string, Buffer>();
  for (const name of names) files.set(name, name === "release-manifest.json" ? manifestBytes : await file(join(directory, name)));
  const archive = files.get(manifest.archive.name)!;
  if (archive.length !== manifest.archive.bytes || hash(archive) !== manifest.archive.sha256 || hash(archive, "sha512") !== manifest.archive.sha512) throw new Error("Release archive differs from its manifest.");
  const pack: unknown = JSON.parse(files.get("npm-pack.json")!.toString("utf8"));
  if (!Array.isArray(pack) || pack.length !== 1) throw new Error("Packing receipt must contain exactly one archive.");
  const metadata = record(pack[0], "Packing receipt");
  if (metadata.name !== packageName || metadata.version !== manifest.version || metadata.filename !== manifest.archive.name
    || metadata.size !== archive.length || metadata.integrity !== `sha512-${createHash("sha512").update(archive).digest("base64")}`
    || metadata.shasum !== hash(archive, "sha1")) throw new Error("Packing receipt does not bind the canonical archive.");
  const subjects = new Map([...files].filter(([name]) => name !== "SHA256SUMS" && name !== "provenance.jsonl"));
  if (files.get("SHA256SUMS")!.toString("utf8") !== checksums(subjects)) throw new Error("Release checksums differ from the exact handoff.");
  return { manifest, files };
}
export function admitExpectedHandoff(handoff: Handoff, expected: NodeJS.ProcessEnv): void {
  const m = handoff.manifest;
  if (m.sourceSha !== expected.GITHUB_SHA || m.tag !== expected.GITHUB_REF_NAME
    || m.runId !== Number(expected.GITHUB_RUN_ID) || m.runAttempt !== Number(expected.GITHUB_RUN_ATTEMPT)) throw new Error("Release handoff is not from this exact run and source.");
  admitExpectedHandoffDigests(handoff, expected);
}
export function admitExpectedHandoffDigests(handoff: Handoff, expected: NodeJS.ProcessEnv): void {
  const m = handoff.manifest;
  for (const [name, variable] of [[m.archive.name, "EXPECTED_ARCHIVE_SHA256"], ["npm-pack.json", "EXPECTED_PACK_SHA256"], ["release-manifest.json", "EXPECTED_MANIFEST_SHA256"], ["SHA256SUMS", "EXPECTED_SUMS_SHA256"]] as const) {
    if (!expected[variable] || hash(handoff.files.get(name)!) !== expected[variable]) throw new Error(`Release handoff differs from trusted ${variable}.`);
  }
}
export function admitAttempt(value: unknown, expected: { sourceSha: string; tag: string; runId: number; runAttempt: number }, completed = false): void {
  const run = record(value, "Release run");
  const actor = record(run.actor, "Release actor");
  const triggering = record(run.triggering_actor, "Release triggering actor");
  const repo = record(run.repository, "Release repository");
  if (run.id !== expected.runId || run.run_attempt !== expected.runAttempt || run.head_sha !== expected.sourceSha
    || run.head_branch !== expected.tag || run.workflow_id !== workflowId || run.name !== "Release" || run.path !== workflow || run.event !== "push"
    || actor.id !== actorId || actor.type !== "User" || triggering.id !== actorId || triggering.type !== "User"
    || repo.id !== repositoryId || repo.full_name !== repository || repo.private !== false
    || (completed ? run.status !== "completed" || run.conclusion !== "success" : run.status !== "in_progress" || run.conclusion !== null)) throw new Error("Release attempt is not the exact authorized owner/source/workflow.");
}
async function request(path: string, method = "GET", body?: unknown, missing = false): Promise<unknown> {
  if ((path !== `/repos/${repository}` && !path.startsWith(`/repos/${repository}/`)) || path.split("/").some(part => part === ".." || part === ".")) throw new Error("Unexpected release API route.");
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error("Release API requires the scoped workflow token.");
  const response = await fetch(`https://api.github.com${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${method} ${path} returned ${response.status}; reconcile state before retrying.`);
  const bytes = await boundedResponse(response);
  return JSON.parse(bytes.toString("utf8")) as unknown;
}
async function boundedResponse(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error("Missing release API response body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximumFileBytes) throw new Error("Release API response exceeds its bound.");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
async function content(path: string, ref: string): Promise<Buffer> {
  const result = record(await request(`/repos/${repository}/contents/${path}?ref=${ref}`), "Authority source");
  if (result.type !== "file" || result.encoding !== "base64" || typeof result.content !== "string" || result.content.length > 300_000) throw new Error(`${path} is not a bounded file.`);
  return Buffer.from(result.content, "base64");
}
export async function authorizeRelease(environment = process.env): Promise<string> {
  const sourceSha = environment.GITHUB_SHA ?? "";
  const tag = environment.GITHUB_REF_NAME ?? "";
  const runId = positive(Number(environment.GITHUB_RUN_ID), "Run ID");
  const runAttempt = positive(Number(environment.GITHUB_RUN_ATTEMPT), "Run attempt");
  if (!sha.test(sourceSha) || tag !== `v${stableVersion(tag.slice(1))}` || environment.GITHUB_REF !== `refs/tags/${tag}`
    || environment.GITHUB_EVENT_NAME !== "push" || environment.GITHUB_ACTOR_ID !== String(actorId)
    || environment.GITHUB_REPOSITORY !== repository || environment.GITHUB_REPOSITORY_ID !== String(repositoryId)
    || environment.GITHUB_WORKFLOW_REF !== `${repository}/${workflow}@refs/tags/${tag}`) throw new Error("Release environment is not the exact protected tag request.");
  const root = record(await request(`/repos/${repository}`), "Repository");
  if (root.id !== repositoryId || root.full_name !== repository || root.private !== false || root.visibility !== "public" || root.default_branch !== "main") throw new Error("Release repository identity changed.");
  const active = record(await request(`/repos/${repository}/actions/workflows/${workflowId}`), "Release workflow");
  if (active.id !== workflowId || active.path !== workflow || active.name !== "Release" || active.state !== "active") throw new Error("Release workflow authority changed.");
  admitAttempt(await request(`/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}`), { sourceSha, tag, runId, runAttempt });
  const ref = record(record(await request(`/repos/${repository}/git/ref/heads/main`), "Current main").object, "Main object");
  if (ref.type !== "commit" || typeof ref.sha !== "string" || !sha.test(ref.sha)) throw new Error("Current main identity is invalid.");
  const main = ref.sha;
  const branch = record(await request(`/repos/${repository}/branches/main`), "Protected main");
  if (branch.protected !== true || record(branch.commit, "Main commit").sha !== main) throw new Error("Protected main changed during admission.");
  const comparison = record(await request(`/repos/${repository}/compare/${sourceSha}...${main}`), "Source ancestry");
  if (comparison.status !== "ahead" && comparison.status !== "identical") throw new Error("Release source is not reachable from current main.");
  for (const path of authorityPaths) {
    const [tagged, current] = await Promise.all([content(path, sourceSha), content(path, main)]);
    if (!tagged.equals(current)) throw new Error(`Current release authority changed at ${path}.`);
  }
  const tagRef = record(record(await request(`/repos/${repository}/git/ref/tags/${tag}`), "Version ref").object, "Version object");
  if (tagRef.type !== "tag" || typeof tagRef.sha !== "string" || !sha.test(tagRef.sha)) throw new Error("Release requires an annotated tag.");
  const target = record(record(await request(`/repos/${repository}/git/tags/${tagRef.sha}`), "Annotated tag").object, "Tag target");
  if (target.type !== "commit" || target.sha !== sourceSha) throw new Error("Annotated release tag moved.");
  return main;
}
export function admitVerifiedProvenance(value: unknown, manifest: ReleaseManifest, expectedSubjects: ReadonlyMap<string, string>): void {
  if (!Array.isArray(value) || value.length !== 1) throw new Error("Expected exactly one verified attestation result.");
  const result = record(value[0], "Verified attestation");
  const verification = record(result.verificationResult, "Verification result");
  const certificate = record(record(verification.signature, "Verified signature").certificate, "Verified certificate");
  const sourceUrl = `https://github.com/${repository}`;
  const workflowUrl = `${sourceUrl}/${workflow}@refs/tags/${manifest.tag}`;
  if (certificate.issuer !== "https://token.actions.githubusercontent.com" || certificate.runnerEnvironment !== "github-hosted"
    || certificate.sourceRepositoryURI !== sourceUrl || certificate.sourceRepositoryIdentifier !== String(repositoryId)
    || certificate.sourceRepositoryDigest !== manifest.sourceSha || certificate.sourceRepositoryRef !== `refs/tags/${manifest.tag}`
    || certificate.buildSignerDigest !== manifest.sourceSha || certificate.buildConfigDigest !== manifest.sourceSha
    || certificate.buildConfigURI !== workflowUrl || certificate.buildSignerURI !== workflowUrl || certificate.buildTrigger !== "push"
    || certificate.runInvocationURI !== `${sourceUrl}/actions/runs/${manifest.runId}/attempts/${manifest.runAttempt}`) {
    throw new Error("Verified certificate does not bind this exact hosted source and run attempt.");
  }
  const statement = record(verification.statement, "Verified statement");
  const subjects = statement.subject;
  if (!Array.isArray(subjects) || subjects.length !== 4 || expectedSubjects.size !== 4) throw new Error("Verified attestation must bind exactly four expected subjects.");
  const seen = new Set<string>();
  for (const item of subjects) {
    const subject = record(item, "Attestation subject");
    const subjectDigest = record(subject.digest, "Subject digest");
    if (typeof subject.name !== "string" || seen.has(subject.name) || !expectedSubjects.has(subject.name)
      || Object.keys(subjectDigest).length !== 1 || subjectDigest.sha256 !== expectedSubjects.get(subject.name)) throw new Error("Verified attestation subject differs from the exact handoff.");
    seen.add(subject.name);
  }
  const predicate = record(statement.predicate, "Verified predicate");
  const definition = record(predicate.buildDefinition, "Build definition");
  const sourceWorkflow = record(record(definition.externalParameters, "External parameters").workflow, "Source workflow");
  const github = record(record(definition.internalParameters, "Internal parameters").github, "GitHub identity");
  const details = record(predicate.runDetails, "Run details");
  if (statement._type !== "https://in-toto.io/Statement/v1" || statement.predicateType !== "https://slsa.dev/provenance/v1"
    || definition.buildType !== "https://actions.github.io/buildtypes/workflow/v1"
    || sourceWorkflow.repository !== `https://github.com/${repository}` || sourceWorkflow.path !== workflow || sourceWorkflow.ref !== `refs/tags/${manifest.tag}`
    || String(github.repository_id) !== String(repositoryId) || String(github.repository_owner_id) !== "307125679" || github.event_name !== "push"
    || github.runner_environment !== "github-hosted"
    || record(details.builder, "Builder").id !== `https://github.com/${repository}/${workflow}@refs/tags/${manifest.tag}`
    || record(details.metadata, "Invocation").invocationId !== `https://github.com/${repository}/actions/runs/${manifest.runId}/attempts/${manifest.runAttempt}`) throw new Error("Verified provenance does not bind the exact hosted release attempt.");
  const dependencies = definition.resolvedDependencies;
  if (!Array.isArray(dependencies) || dependencies.length !== 1) throw new Error("Verified provenance must bind one source dependency.");
  const dependency = record(dependencies[0], "Source dependency");
  if (dependency.uri !== `git+https://github.com/${repository}@refs/tags/${manifest.tag}`
    || record(dependency.digest, "Source digest").gitCommit !== manifest.sourceSha) throw new Error("Verified provenance source differs from the manifest.");
}
function verifyAttestations(directory: string, handoff: Handoff): void {
  const m = handoff.manifest;
  const subjects = new Map([...handoff.files].filter(([name]) => name !== "provenance.jsonl").map(([name, bytes]) => [name, hash(bytes)]));
  for (const name of subjects.keys()) {
    const result = spawnSync("gh", ["attestation", "verify", join(directory, name), "--repo", repository,
      "--signer-workflow", `${repository}/${workflow}`, "--signer-digest", m.sourceSha, "--source-digest", m.sourceSha,
      "--source-ref", `refs/tags/${m.tag}`, "--deny-self-hosted-runners", "--bundle", join(directory, "provenance.jsonl"), "--format", "json"],
    { encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL", maxBuffer: maximumFileBytes, stdio: ["ignore", "pipe", "pipe"] });
    if (result.error || result.status !== 0) throw new Error(`Cryptographic release verification failed for ${name}: ${result.error?.message ?? result.stderr}`);
    admitVerifiedProvenance(JSON.parse(result.stdout) as unknown, m, subjects);
  }
}
const identityMarker = "<!-- hraness-github-release-v1\n";
const identityKeys = ["repository", "tag", "source-sha", "workflow", "workflow-sha", "run-id", "run-attempt", "archive-sha256"] as const;
const maximumChangelogBytes = 200_000;
const maximumSectionBytes = 20_000;
export interface ChangelogSection { summary: string; changes: string }
/** Reads one version's summary paragraph and change bullets from CHANGELOG.md. */
export function changelogSection(changelog: string, version: string): ChangelogSection {
  stableVersion(version);
  if (typeof changelog !== "string" || Buffer.byteLength(changelog, "utf8") > maximumChangelogBytes || changelog.includes("\r")) throw new Error("CHANGELOG.md must be bounded LF text.");
  const lines = changelog.split("\n");
  const heading = /^## v?((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?: - [0-9]{4}-[0-9]{2}-[0-9]{2})?$/u;
  let start = -1;
  for (const [index, line] of lines.entries()) {
    if (heading.exec(line)?.[1] !== version) continue;
    if (start !== -1) throw new Error(`CHANGELOG.md has more than one section for ${version}.`);
    start = index;
  }
  if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}.`);
  let end = lines.findIndex((line, index) => index > start && /^#{1,2} /u.test(line));
  if (end === -1) end = lines.length;
  const body = lines.slice(start + 1, end).join("\n").trim();
  if (body === "") throw new Error(`CHANGELOG.md section ${version} is empty.`);
  if (/unreleased/iu.test(body)) throw new Error(`CHANGELOG.md section ${version} still says Unreleased.`);
  if (Buffer.byteLength(body, "utf8") > maximumSectionBytes) throw new Error(`CHANGELOG.md section ${version} exceeds its bound.`);
  if (body.includes("<!--") || body.includes("-->") || /^#/mu.test(body)) throw new Error(`CHANGELOG.md section ${version} may not contain headings or HTML comments.`);
  const bullets = body.search(/^- /mu);
  const summary = bullets === -1 ? body : body.slice(0, bullets).trim();
  const changes = bullets === -1 ? "" : body.slice(bullets).trim();
  if (summary === "" || changes === "") throw new Error(`CHANGELOG.md section ${version} needs a summary paragraph followed by change bullets.`);
  return { summary, changes };
}
export function releaseTitle(manifest: ReleaseManifest): string {
  return `Slopcamera ${manifest.tag}`;
}
/** The visible page: changelog summary and changes, then install and verify generated from the manifest. */
export function releaseNotes(manifest: ReleaseManifest, section: ChangelogSection): string {
  const m = manifest;
  const fence = "```";
  return `${section.summary}\n\n## Changes\n\n${section.changes}\n\n## Install\n\nInstall this version from its GitHub Release asset with Bun:\n\n${fence}sh\nbun add --global https://github.com/${repository}/releases/download/${m.tag}/${m.archive.name}\n${fence}\n\nThe same bytes are mirrored on npm:\n\n${fence}sh\nbun add --global ${packageName}@${m.version}\n${fence}\n\n## Verify\n\nThe \`SHA256SUMS\` asset lists the SHA-256 of the archive, \`npm-pack.json\` and \`release-manifest.json\`. \`provenance.jsonl\` holds their signed build provenance.\n\n- Source commit: [\`${m.sourceSha}\`](https://github.com/${repository}/commit/${m.sourceSha})\n- Archive SHA-256: \`${m.archive.sha256}\`\n- How to check the files and their provenance: [publishing guide at ${m.tag}](https://github.com/${repository}/blob/${m.tag}/docs/publishing.md#publish-a-canonical-github-release)\n`;
}
export function identityRecord(manifest: ReleaseManifest): string {
  return `${identityMarker}repository=${repository}\ntag=${manifest.tag}\nsource-sha=${manifest.sourceSha}\nworkflow=${workflow}\nworkflow-sha=${manifest.workflowSha}\nrun-id=${manifest.runId}\nrun-attempt=${manifest.runAttempt}\narchive-sha256=${manifest.archive.sha256}\n-->`;
}
export function releaseBody(manifest: ReleaseManifest, section: ChangelogSection): string {
  return `${releaseNotes(manifest, section)}\n${identityRecord(manifest)}`;
}
/** Splits a body at the last identity marker; the identity comment must be the final bytes. */
export function parseReleaseBody(body: unknown): { notes: string; identity: Record<(typeof identityKeys)[number], string> } {
  if (typeof body !== "string" || body.length > maximumSectionBytes * 2 || !body.endsWith("-->")) throw new Error("Release body must end with its identity record.");
  const index = body.lastIndexOf(identityMarker);
  if (index === -1) throw new Error("Release body has no identity record.");
  const comment = body.slice(index);
  if (comment.slice(0, -3).includes("-->")) throw new Error("Release identity record must be the final bytes of the body.");
  const lines = comment.slice(identityMarker.length, -3).split("\n");
  if (lines.pop() !== "" || lines.length !== identityKeys.length) throw new Error("Release identity record has unexpected fields.");
  const identity = {} as Record<(typeof identityKeys)[number], string>;
  for (const [position, line] of lines.entries()) {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    if (separator <= 0 || key !== identityKeys[position]) throw new Error("Release identity record has unexpected fields.");
    identity[identityKeys[position]!] = line.slice(separator + 1);
  }
  return { notes: body.slice(0, index), identity };
}
export function admitReleaseBody(body: unknown, manifest: ReleaseManifest, section: ChangelogSection): void {
  const { notes, identity } = parseReleaseBody(body);
  if (JSON.stringify(identity) !== JSON.stringify(parseReleaseBody(identityRecord(manifest)).identity)) throw new Error("Release identity record differs from the exact manifest.");
  if (notes !== `${releaseNotes(manifest, section)}\n`) throw new Error("Release notes differ from the rendered changelog section and generated install and verify sections.");
}
async function taggedChangelog(manifest: ReleaseManifest): Promise<ChangelogSection> {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(await content("CHANGELOG.md", manifest.sourceSha));
  return changelogSection(text, manifest.version);
}
export function admitRelease(value: unknown, manifest: ReleaseManifest, files: ReadonlyMap<string, Buffer>, allowMissing: boolean, section: ChangelogSection): { id: number; draft: boolean; present: Set<string> } {
  const release = record(value, "GitHub release");
  const author = record(release.author, "Release author");
  if (release.tag_name !== manifest.tag || release.name !== releaseTitle(manifest) || release.target_commitish !== manifest.sourceSha
    || release.prerelease !== false || typeof release.draft !== "boolean" || author.id !== authorId || author.login !== "github-actions[bot]" || author.type !== "Bot"
    || (!release.draft && release.immutable !== true)) throw new Error("Existing release is not the exact Actions-authored immutable artifact.");
  admitReleaseBody(release.body, manifest, section);
  if (!Array.isArray(release.assets) || release.assets.length > files.size) throw new Error("Release asset inventory is invalid.");
  const present = new Set<string>();
  const ids = new Set<number>();
  for (const value of release.assets) {
    const asset = record(value, "Release asset");
    const id = positive(asset.id, "Release asset ID");
    if (ids.has(id)) throw new Error("Release asset ID is duplicated.");
    ids.add(id);
    if (typeof asset.name !== "string" || present.has(asset.name)) throw new Error("Release asset identity is duplicated.");
    const bytes = files.get(asset.name);
    if (!bytes || asset.state !== "uploaded" || asset.size !== bytes.length || asset.digest !== `sha256:${hash(bytes)}`) throw new Error("Existing release asset differs from the attested bytes.");
    present.add(asset.name);
  }
  if ((!allowMissing || !release.draft) && present.size !== files.size) throw new Error("Release is missing a required asset.");
  return { id: positive(release.id, "Release ID"), draft: release.draft, present };
}
export function admitRemoteAssetBytes(value: unknown, files: ReadonlyMap<string, Buffer>, downloaded: ReadonlyMap<number, Buffer>): void {
  const release = record(value, "Release byte inventory");
  if (!Array.isArray(release.assets) || release.assets.length > 5 || downloaded.size !== release.assets.length) throw new Error("Remote byte inventory is incomplete.");
  const seen = new Set<number>();
  for (const value of release.assets) {
    const asset = record(value, "Remote byte asset");
    const id = positive(asset.id, "Remote asset ID");
    if (seen.has(id) || typeof asset.name !== "string" || !files.has(asset.name)
      || !downloaded.get(id)?.equals(files.get(asset.name)!)) throw new Error("Remote asset bytes differ from the exact attested handoff.");
    seen.add(id);
  }
}
function verifyRemoteBytes(value: unknown, files: ReadonlyMap<string, Buffer>): void {
  const release = record(value, "Release byte inventory");
  if (!Array.isArray(release.assets) || release.assets.length > 5) throw new Error("Unexpected remote asset inventory.");
  const downloaded = new Map<number, Buffer>();
  for (const value of release.assets) {
    const asset = record(value, "Remote byte asset");
    const id = positive(asset.id, "Remote asset ID");
    const result = spawnSync("gh", ["api", "--method", "GET", `/repos/${repository}/releases/assets/${id}`, "-H", "Accept: application/octet-stream"],
      { timeout: 30_000, killSignal: "SIGKILL", maxBuffer: maximumFileBytes, stdio: ["ignore", "pipe", "pipe"] });
    if (result.error || result.status !== 0 || !result.stdout) throw new Error(`Remote asset read failed for ${id}; preserve and reconcile the release state.`);
    downloaded.set(id, result.stdout);
  }
  admitRemoteAssetBytes(value, files, downloaded);
}
async function requireMonotonic(version: string): Promise<void> {
  for (let page = 1; page <= 10; page += 1) {
    const values = await request(`/repos/${repository}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(values) || values.length > 100) throw new Error("Release inventory is invalid.");
    for (const value of values) {
      const release = record(value, "Published release");
      if (release.draft !== false || release.prerelease !== false) continue;
      if (typeof release.tag_name !== "string" || !release.tag_name.startsWith("v")) throw new Error("Published release has unsupported identity.");
      if (compareVersions(version, release.tag_name.slice(1)) < 0) throw new Error("A newer immutable GitHub release already exists.");
    }
    if (values.length < 100) return;
  }
  throw new Error("Release inventory exceeds its reviewed pagination bound.");
}
export async function findReleaseForTag(tag: string): Promise<Json | null> {
  if (tag !== `v${stableVersion(tag.slice(1))}`) throw new Error("Release lookup requires an exact stable tag.");
  let selected: Json | undefined;
  const ids = new Set<number>();
  for (let page = 1; page <= 10; page += 1) {
    const values = await request(`/repos/${repository}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(values) || values.length > 100) throw new Error("Release discovery inventory is invalid.");
    for (const value of values) {
      const release = record(value, "Release discovery record");
      const id = positive(release.id, "Discovered release ID");
      if (ids.has(id)) throw new Error("Release discovery repeated an ID; reconcile the changing inventory.");
      ids.add(id);
      if (release.tag_name !== tag) continue;
      if (selected) throw new Error("Multiple releases claim the exact version tag; preserve all records and reconcile.");
      selected = release;
    }
    if (values.length < 100) {
      if (!selected) return null;
      // GitHub's tag endpoint can return 404 for an existing draft. Its list and
      // positive ID are the admission path for both drafts and published records.
      const current = record(await request(`/repos/${repository}/releases/${String(selected.id)}`), "Discovered release readback");
      if (current.id !== selected.id || current.tag_name !== tag) throw new Error("Discovered release identity changed during readback.");
      return current;
    }
  }
  throw new Error("Release discovery exceeds its reviewed pagination bound.");
}
async function publish(directory: string): Promise<void> {
  await authorizeRelease();
  const handoff = await verifyHandoff(directory, true);
  admitExpectedHandoff(handoff, process.env);
  verifyAttestations(directory, handoff);
  const m = handoff.manifest;
  // The notes come only from the tagged CHANGELOG.md; a missing, empty or Unreleased section stops before any write.
  const section = await taggedChangelog(m);
  await requireMonotonic(m.version);
  let existing: unknown = await findReleaseForTag(m.tag);
  if (existing === null) {
    await authorizeRelease();
    // A failed response may represent a successful write. A rerun reads it first.
    existing = await request(`/repos/${repository}/releases`, "POST", { tag_name: m.tag, target_commitish: m.sourceSha,
      name: releaseTitle(m), body: releaseBody(m, section), draft: true, prerelease: false, make_latest: "false" });
  }
  let state = admitRelease(existing, m, handoff.files, true, section);
  verifyRemoteBytes(existing, handoff.files);
  if (state.draft) {
    for (const [name, bytes] of handoff.files) {
      if (state.present.has(name)) continue;
      await authorizeRelease();
      const response = await fetch(`https://uploads.github.com/repos/${repository}/releases/${state.id}/assets?name=${encodeURIComponent(name)}`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${process.env.GH_TOKEN ?? ""}`, "Content-Type": "application/octet-stream" }, body: new Uint8Array(bytes),
      });
      if (!response.ok) throw new Error(`Asset upload returned ${response.status}; reconcile this exact draft before retrying.`);
      await boundedResponse(response);
    }
    existing = await request(`/repos/${repository}/releases/${state.id}`);
    state = admitRelease(existing, m, handoff.files, false, section);
    verifyRemoteBytes(existing, handoff.files);
    await authorizeRelease();
    await requireMonotonic(m.version);
    existing = await request(`/repos/${repository}/releases/${state.id}`, "PATCH", { draft: false, make_latest: "true" });
  }
  admitRelease(existing, m, handoff.files, false, section);
  const readback = await request(`/repos/${repository}/releases/${state.id}`);
  const final = admitRelease(readback, m, handoff.files, false, section);
  verifyRemoteBytes(readback, handoff.files);
  const latest = record(await request(`/repos/${repository}/releases/latest`), "Latest release");
  if (final.draft || final.id !== state.id || latest.id !== final.id || latest.tag_name !== m.tag) throw new Error("Published release is not immutable Latest.");
  console.log(`Verified immutable Latest ${m.tag}, exact archive ${m.archive.sha256}.`);
}
export function admitNpmHandoffRun(manifest: ReleaseManifest, environment: NodeJS.ProcessEnv): void {
  // An npm rerun of only the failed publication job keeps the attested artifact
  // from an earlier attempt of the same run; a different run or source rejects.
  const attempt = positive(Number(environment.GITHUB_RUN_ATTEMPT), "Run attempt");
  if (manifest.sourceSha !== environment.GITHUB_SHA || manifest.tag !== environment.GITHUB_REF_NAME
    || environment.GITHUB_REF !== `refs/tags/${manifest.tag}` || manifest.runId !== Number(environment.GITHUB_RUN_ID)
    || manifest.runAttempt > attempt) throw new Error("npm handoff is not from this exact run and source.");
}
export function admitPublishedRelease(value: unknown, manifest: ReleaseManifest, files: ReadonlyMap<string, Buffer>, section: ChangelogSection): number {
  const state = admitRelease(value, manifest, files, false, section);
  if (state.draft) throw new Error("npm may publish only an already published immutable release.");
  return state.id;
}
async function npmAdmit(directory: string): Promise<void> {
  await authorizeRelease();
  const handoff = await verifyHandoff(directory, true);
  admitNpmHandoffRun(handoff.manifest, process.env);
  admitExpectedHandoffDigests(handoff, process.env);
  verifyAttestations(directory, handoff);
  const m = handoff.manifest;
  const section = await taggedChangelog(m);
  const release = await request(`/repos/${repository}/releases/tags/${m.tag}`);
  const id = admitPublishedRelease(release, m, handoff.files, section);
  verifyRemoteBytes(release, handoff.files);
  const latest = record(await request(`/repos/${repository}/releases/latest`), "Latest release");
  if (latest.id !== id || latest.tag_name !== m.tag) throw new Error("Canonical release is not immutable Latest before npm publication.");
  await authorizeRelease();
  const archive = handoff.files.get(m.archive.name)!;
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT,
    `package_version=${m.version}\narchive_name=${m.archive.name}\narchive_sha256=${m.archive.sha256}\narchive_integrity=sha512-${createHash("sha512").update(archive).digest("base64")}\nrelease_id=${id}\n`, { flag: "a" });
  console.log(`Admitted immutable Latest ${m.tag} release ${id} for npm publication of ${m.archive.sha256}.`);
}
async function main(): Promise<void> {
  const [mode, directory, ...extra] = process.argv.slice(2);
  if (!directory || extra.length !== 0) throw new Error("Usage: node scripts/github-release.ts authorize|verify|publish|npm-admit <directory>");
  if (mode === "authorize") {
    const authority = await authorizeRelease();
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `authority_sha=${authority}\n`, { flag: "a" });
    return;
  }
  if (mode === "verify") {
    await authorizeRelease();
    const handoff = await verifyHandoff(resolve(directory), process.env.EXPECT_SIGNED === "true");
    admitExpectedHandoff(handoff, process.env);
    if (process.env.EXPECT_SIGNED === "true") verifyAttestations(resolve(directory), handoff);
    return;
  }
  if (mode === "publish") { await publish(resolve(directory)); return; }
  if (mode === "npm-admit") { await npmAdmit(resolve(directory)); return; }
  throw new Error("Unsupported release authority operation.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

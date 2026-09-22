import { constants } from "node:fs";
import {
  chmod,
  lstat,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { CliError } from "./errors";
import { ensurePrivateDirectory } from "./paths";

/**
 * Hraness Credits public contract (v1) plus the hosted Slopcamera tool call.
 * Both endpoints are fixed; no credential travels in argv, receipts, or logs.
 * The claim secret and device token are persisted only below the private CLI
 * state root, and the device token is also accepted from the
 * SLOPCAMERA_CREDITS_TOKEN environment variable for agent environments.
 */
export const CREDITS_BASE_URL = "https://credits.hraness.com";
export const SLOPCAMERA_API_BASE_URL = "https://api.slopcamera.com";
export const CREDITS_PRODUCT_ID = "slopcamera";
export const CREDITS_TOKEN_ENV = "SLOPCAMERA_CREDITS_TOKEN";

const CREDITS_RESPONSE_MAX_BYTES = 64 * 1024;
const HOSTED_RESPONSE_MAX_BYTES = 64 * 1024;
export const HOSTED_ARTIFACT_MAX_BYTES = 32 * 1024 * 1024;
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CLAIM_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;
const DEVICE_TOKEN_PATTERN = /^cr_dev_[A-Za-z0-9_-]{8,256}$/u;
const CLAIM_SECRET_PATTERN = /^cr_clm_[A-Za-z0-9_-]{8,256}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/u;

export interface CreditsPack {
  readonly id: string;
  readonly usd: number;
  readonly credits: number;
  readonly bonusCredits: number;
  readonly label: string;
}

export interface CreditsMoney {
  readonly microUsd: number;
  readonly credits: number;
  readonly usd: string;
}

export interface CreditsTopup {
  readonly url: string;
  readonly expiresAt?: string;
  readonly packs: readonly CreditsPack[];
  readonly suggestedPackId: string | null;
}

export interface CreditsClaim {
  readonly claimId: string;
  readonly claimSecret: string;
  readonly url: string;
  readonly expiresAt: string;
  readonly packs: readonly CreditsPack[];
  readonly suggestedPackId: string | null;
}

export interface CreditsClaimStatus {
  readonly claimId: string;
  readonly state: "pending" | "paid" | "consumed" | "expired";
  readonly expiresAt: string;
  readonly paidAt?: string;
  /** Present exactly once: the first `paid` read carrying the claim secret. */
  readonly deviceToken?: string;
}

export interface CreditsBalance {
  readonly product: { readonly id: string; readonly name: string };
  readonly balance: CreditsMoney;
  readonly heldMicroUsd: number;
  readonly lowBalance: boolean;
  readonly topup: CreditsTopup | null;
}

export interface HostedArtifact {
  readonly id: string;
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly contentType: string;
  readonly contentUrl: string;
  readonly url: string;
  readonly expiresAt: string;
}

export interface HostedCallResult {
  readonly ok: boolean;
  readonly artifacts: readonly HostedArtifact[];
}

export interface CreditsShortfall {
  readonly required?: { readonly microUsd: number; readonly usd: string };
  readonly balance?: { readonly microUsd: number; readonly usd: string };
  readonly topup?: { readonly url: string };
}

export class CreditsRequestError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly shortfall: CreditsShortfall | undefined;

  constructor(status: number, errorCode: string, message: string, shortfall?: CreditsShortfall) {
    super(message);
    this.name = "CreditsRequestError";
    this.status = status;
    this.errorCode = errorCode;
    this.shortfall = shortfall;
  }
}

export type CreditsFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function readTimestamp(value: unknown): string | undefined {
  const text = readString(value);
  return text !== undefined && ISO_TIMESTAMP_PATTERN.test(text) ? text : undefined;
}

function parsePack(value: unknown): CreditsPack | undefined {
  if (!isRecord(value)) return undefined;
  const id = readString(value.id);
  const usd = readInteger(value.usd);
  const credits = readInteger(value.credits);
  const bonusCredits = readInteger(value.bonusCredits);
  const label = readString(value.label);
  if (
    id === undefined || usd === undefined || credits === undefined
    || bonusCredits === undefined || label === undefined
  ) {
    return undefined;
  }
  return { id, usd, credits, bonusCredits, label };
}

function parsePacks(value: unknown): readonly CreditsPack[] {
  if (!Array.isArray(value) || value.length > 32) return [];
  const packs: CreditsPack[] = [];
  for (const entry of value) {
    const pack = parsePack(entry);
    if (pack === undefined) return [];
    packs.push(pack);
  }
  return packs;
}

function parseMoney(value: unknown): CreditsMoney | undefined {
  if (!isRecord(value)) return undefined;
  const microUsd = readInteger(value.microUsd);
  const credits = readInteger(value.credits);
  const usd = readString(value.usd);
  if (microUsd === undefined || credits === undefined || usd === undefined) {
    return undefined;
  }
  return { microUsd, credits, usd };
}

function parseTopup(value: unknown): CreditsTopup | undefined {
  if (!isRecord(value)) return undefined;
  const url = readString(value.url);
  if (url === undefined || !url.startsWith("https://")) return undefined;
  const expiresAt = readTimestamp(value.expiresAt);
  return {
    url,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    packs: parsePacks(value.packs),
    suggestedPackId: readString(value.suggestedPackId) ?? null,
  };
}

export function parseClaimResponse(value: unknown): CreditsClaim {
  if (!isRecord(value)) throw new CliError("invalid-data", "Credits claim response was not an object.");
  const claimId = readString(value.claimId);
  const claimSecret = readString(value.claimSecret);
  const url = readString(value.url);
  const expiresAt = readTimestamp(value.expiresAt);
  if (
    claimId === undefined || !CLAIM_ID_PATTERN.test(claimId)
    || claimSecret === undefined || !CLAIM_SECRET_PATTERN.test(claimSecret)
    || url === undefined || !url.startsWith("https://")
    || expiresAt === undefined
  ) {
    throw new CliError("invalid-data", "Credits claim response was malformed.");
  }
  return {
    claimId,
    claimSecret,
    url,
    expiresAt,
    packs: parsePacks(value.packs),
    suggestedPackId: readString(value.suggestedPackId) ?? null,
  };
}

export function parseClaimStatus(value: unknown): CreditsClaimStatus {
  if (!isRecord(value)) throw new CliError("invalid-data", "Credits claim status was not an object.");
  const claimId = readString(value.claimId);
  const expiresAt = readTimestamp(value.expiresAt);
  const state = value.state;
  if (
    claimId === undefined
    || expiresAt === undefined
    || (state !== "pending" && state !== "paid" && state !== "consumed" && state !== "expired")
  ) {
    throw new CliError("invalid-data", "Credits claim status was malformed.");
  }
  const token = value.token;
  if (token !== undefined && (typeof token !== "string" || !DEVICE_TOKEN_PATTERN.test(token))) {
    throw new CliError("invalid-data", "Credits claim returned a malformed device token.");
  }
  const deviceToken = typeof token === "string" ? token : undefined;
  const paidAt = readTimestamp(value.paidAt);
  return {
    claimId,
    state,
    expiresAt,
    ...(paidAt === undefined ? {} : { paidAt }),
    ...(deviceToken === undefined ? {} : { deviceToken }),
  };
}

export function parseBalance(value: unknown): CreditsBalance {
  if (!isRecord(value)) throw new CliError("invalid-data", "Credits balance response was not an object.");
  const product = isRecord(value.product) ? value.product : undefined;
  const productId = product === undefined ? undefined : readString(product.id);
  const productName = product === undefined ? undefined : readString(product.name);
  const balance = parseMoney(value.balance);
  const held = isRecord(value.held) ? readInteger(value.held.microUsd) : undefined;
  if (productId === undefined || productName === undefined || balance === undefined || held === undefined) {
    throw new CliError("invalid-data", "Credits balance response was malformed.");
  }
  return {
    product: { id: productId, name: productName },
    balance,
    heldMicroUsd: held,
    lowBalance: value.lowBalance === true,
    topup: parseTopup(value.topup) ?? null,
  };
}

export function parseHostedCallResult(value: unknown): HostedCallResult {
  if (!isRecord(value)) throw new CliError("invalid-data", "Hosted call response was not an object.");
  const artifactsValue = value.artifacts;
  const artifacts: HostedArtifact[] = [];
  if (artifactsValue !== undefined) {
    if (!Array.isArray(artifactsValue) || artifactsValue.length > 16) {
      throw new CliError("invalid-data", "Hosted call artifacts were malformed.");
    }
    for (const entry of artifactsValue) {
      if (!isRecord(entry)) throw new CliError("invalid-data", "Hosted call artifact was not an object.");
      const id = readString(entry.id);
      const name = readString(entry.name);
      const bytes = readInteger(entry.bytes);
      const sha256 = readString(entry.sha256);
      const contentType = readString(entry.contentType);
      const contentUrl = readString(entry.contentUrl);
      const url = readString(entry.url);
      const expiresAt = readTimestamp(entry.expiresAt);
      if (
        id === undefined || name === undefined || bytes === undefined
        || sha256 === undefined || contentType === undefined
        || contentUrl === undefined || !contentUrl.startsWith("https://")
        || url === undefined || !url.startsWith("https://")
        || expiresAt === undefined
      ) {
        throw new CliError("invalid-data", "Hosted call artifact was malformed.");
      }
      artifacts.push({ id, name, bytes, sha256, contentType, contentUrl, url, expiresAt });
    }
  }
  const ok = value.ok === true;
  if (!ok && value.ok !== false) {
    throw new CliError("invalid-data", "Hosted call response was malformed.");
  }
  return { ok, artifacts };
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const bytes = Number(declared);
    if (Number.isFinite(bytes) && bytes > maximumBytes) {
      throw new CliError("invalid-data", "Credits response exceeded the byte bound.");
    }
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new CliError("invalid-data", "Credits response exceeded the byte bound.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliError("invalid-data", "Credits response was not JSON.");
  }
}

function shortfallFrom(value: unknown): CreditsShortfall | undefined {
  if (!isRecord(value)) return undefined;
  const shortfall: {
    required?: { microUsd: number; usd: string };
    balance?: { microUsd: number; usd: string };
    topup?: { url: string };
  } = {};
  if (isRecord(value.required)) {
    const microUsd = readInteger(value.required.microUsd);
    const usd = readString(value.required.usd);
    if (microUsd !== undefined && usd !== undefined) {
      shortfall.required = { microUsd, usd };
    }
  }
  if (isRecord(value.balance)) {
    const microUsd = readInteger(value.balance.microUsd);
    const usd = readString(value.balance.usd);
    if (microUsd !== undefined && usd !== undefined) {
      shortfall.balance = { microUsd, usd };
    }
  }
  if (isRecord(value.topup)) {
    const url = readString(value.topup.url);
    if (url !== undefined && url.startsWith("https://")) shortfall.topup = { url };
  }
  return Object.keys(shortfall).length === 0 ? undefined : shortfall;
}

export class CreditsClient {
  readonly #fetch: CreditsFetch;
  readonly #creditsBaseUrl: string;
  readonly #apiBaseUrl: string;

  constructor(options: Readonly<{
    fetch: CreditsFetch;
    creditsBaseUrl?: string;
    apiBaseUrl?: string;
  }>) {
    this.#fetch = options.fetch;
    this.#creditsBaseUrl = options.creditsBaseUrl ?? CREDITS_BASE_URL;
    this.#apiBaseUrl = options.apiBaseUrl ?? SLOPCAMERA_API_BASE_URL;
  }

  async #request(
    baseUrl: string,
    path: string,
    init: RequestInit,
    maximumBytes: number,
    bearerToken?: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          ...(init.method === "POST" ? { "content-type": "application/json" } : {}),
          ...(bearerToken === undefined
            ? {}
            : { authorization: `Bearer ${bearerToken}` }),
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      throw new CliError(
        "unavailable",
        `The hosted credits service is unreachable: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
    const body = await readBoundedJson(response, maximumBytes);
    if (!response.ok) {
      const record = isRecord(body) ? body : {};
      const code = readString(record.error) ?? "unavailable";
      const message = readString(record.message)
        ?? `The request failed with status ${response.status}.`;
      throw new CreditsRequestError(
        response.status,
        code,
        message,
        shortfallFrom(record),
      );
    }
    return body;
  }

  createClaim(input: Readonly<{
    deviceId: string;
    deviceLabel: string;
    email?: string;
    packId?: string;
    resumeArgv?: readonly string[];
  }>): Promise<CreditsClaim> {
    return this.#request(
      this.#creditsBaseUrl,
      "/v1/claims",
      {
        method: "POST",
        body: JSON.stringify({
          product: CREDITS_PRODUCT_ID,
          device: { id: input.deviceId, label: input.deviceLabel },
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.packId === undefined ? {} : { packId: input.packId }),
          ...(input.resumeArgv === undefined
            ? {}
            : { resume: { argv: [...input.resumeArgv] } }),
        }),
      },
      CREDITS_RESPONSE_MAX_BYTES,
    ).then(parseClaimResponse);
  }

  claimStatus(claimId: string, claimSecret: string): Promise<CreditsClaimStatus> {
    return this.#request(
      this.#creditsBaseUrl,
      `/v1/claims/${encodeURIComponent(claimId)}`,
      { method: "GET" },
      CREDITS_RESPONSE_MAX_BYTES,
      claimSecret,
    ).then(parseClaimStatus);
  }

  balance(deviceToken: string): Promise<CreditsBalance> {
    return this.#request(
      this.#creditsBaseUrl,
      "/v1/balance",
      { method: "GET" },
      CREDITS_RESPONSE_MAX_BYTES,
      deviceToken,
    ).then(parseBalance);
  }

  executeHostedImage(input: Readonly<{
    deviceToken: string;
    idempotencyKey: string;
    model: string;
    prompt: string;
    outputName: string;
  }>): Promise<HostedCallResult> {
    return this.#request(
      this.#apiBaseUrl,
      "/v1/tools/execute_slopcamera/call",
      {
        method: "POST",
        body: JSON.stringify({
          arguments: {
            operation: "slopcamera.image.generate",
            input: {
              model: input.model,
              prompt: input.prompt,
              outputPath: input.outputName,
            },
          },
          idempotencyKey: input.idempotencyKey,
        }),
      },
      HOSTED_RESPONSE_MAX_BYTES,
      input.deviceToken,
    ).then(parseHostedCallResult);
  }

  async downloadArtifact(artifact: HostedArtifact): Promise<Uint8Array> {
    if (artifact.bytes > HOSTED_ARTIFACT_MAX_BYTES) {
      throw new CliError(
        "invalid-data",
        `Hosted artifact ${artifact.name} exceeds the ${HOSTED_ARTIFACT_MAX_BYTES}-byte bound.`,
      );
    }
    let response: Response;
    try {
      response = await this.#fetch(artifact.contentUrl, {
        headers: { accept: artifact.contentType },
      });
    } catch (error) {
      throw new CliError(
        "unavailable",
        `The hosted artifact download failed: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
    if (!response.ok) {
      throw new CliError(
        "unavailable",
        `The hosted artifact download failed with status ${response.status}.`,
      );
    }
    const declared = response.headers.get("content-length");
    if (declared !== null) {
      const bytes = Number(declared);
      if (Number.isFinite(bytes) && bytes > HOSTED_ARTIFACT_MAX_BYTES) {
        throw new CliError("invalid-data", "Hosted artifact download exceeded the byte bound.");
      }
    }
    if (response.body === null) {
      throw new CliError("invalid-data", "Hosted artifact download had no body.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > HOSTED_ARTIFACT_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new CliError("invalid-data", "Hosted artifact download exceeded the byte bound.");
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
}

export interface CreditsDeviceIdentity {
  readonly deviceId: string;
  readonly label: string;
}

export interface PendingCreditsClaim {
  readonly claimId: string;
  readonly claimSecret: string;
  readonly url: string;
  readonly expiresAt: string;
  readonly packs: readonly CreditsPack[];
  readonly suggestedPackId: string | null;
  readonly createdAt: string;
}

/**
 * Private state below the machine-local CLI state root. The claim secret lets
 * a later `credits wait` resume polling; the device token is written 0600 and
 * never copied into receipts, logs, or argv.
 */
export class CreditsStore {
  readonly #root: string;

  constructor(stateRoot: string) {
    this.#root = join(stateRoot, "credits");
  }

  get directory(): string {
    return this.#root;
  }

  get tokenPath(): string {
    return join(this.#root, "device-token");
  }

  get pendingClaimPath(): string {
    return join(this.#root, "pending-claim.json");
  }

  get devicePath(): string {
    return join(this.#root, "device.json");
  }

  async #ensureRoot(): Promise<void> {
    await ensurePrivateDirectory(this.#root);
  }

  async #writePrivateFile(path: string, contents: string): Promise<void> {
    await this.#ensureRoot();
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    const handle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
    await chmod(path, 0o600).catch(() => undefined);
  }

  async #readFile(path: string): Promise<string | undefined> {
    try {
      const details = await lstat(path);
      if (details.isSymbolicLink() || !details.isFile()) {
        throw new CliError("unsafe-path", `Refusing to read non-file credits state: ${path}`);
      }
      const contents = await readFile(path, "utf8");
      return contents.length > 64 * 1024
        ? (() => {
            throw new CliError("invalid-data", `Credits state file is too large: ${path}`);
          })()
        : contents;
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async deviceIdentity(): Promise<CreditsDeviceIdentity> {
    const existing = await this.#readFile(this.devicePath);
    if (existing !== undefined) {
      try {
        const parsed: unknown = JSON.parse(existing);
        if (isRecord(parsed) && typeof parsed.deviceId === "string"
          && DEVICE_ID_PATTERN.test(parsed.deviceId)) {
          return {
            deviceId: parsed.deviceId,
            label: typeof parsed.label === "string" && parsed.label.length <= 64
              ? parsed.label
              : "slopcamera-cli",
          };
        }
      } catch (error) {
        if (error instanceof CliError) throw error;
      }
    }
    const identity: CreditsDeviceIdentity = {
      deviceId: randomUUID(),
      label: `slopcamera-cli (${hostname()})`.slice(0, 64),
    };
    await this.#writePrivateFile(this.devicePath, `${JSON.stringify(identity)}\n`);
    return identity;
  }

  async readDeviceToken(): Promise<string | undefined> {
    const contents = await this.#readFile(this.tokenPath);
    if (contents === undefined) return undefined;
    const token = contents.trim();
    if (!DEVICE_TOKEN_PATTERN.test(token)) {
      throw new CliError("invalid-data", `Stored credits device token is malformed: ${this.tokenPath}`);
    }
    return token;
  }

  async writeDeviceToken(token: string): Promise<void> {
    if (!DEVICE_TOKEN_PATTERN.test(token)) {
      throw new CliError("invalid-data", "Refusing to store a malformed device token.");
    }
    await this.#writePrivateFile(this.tokenPath, `${token}\n`);
  }

  async readPendingClaim(): Promise<PendingCreditsClaim | undefined> {
    const contents = await this.#readFile(this.pendingClaimPath);
    if (contents === undefined) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      throw new CliError("invalid-data", `Pending credits claim is not JSON: ${this.pendingClaimPath}`);
    }
    if (!isRecord(parsed)) {
      throw new CliError("invalid-data", `Pending credits claim is malformed: ${this.pendingClaimPath}`);
    }
    const claimId = readString(parsed.claimId);
    const claimSecret = readString(parsed.claimSecret);
    const url = readString(parsed.url);
    const expiresAt = readTimestamp(parsed.expiresAt);
    const createdAt = readTimestamp(parsed.createdAt);
    if (
      claimId === undefined || !CLAIM_ID_PATTERN.test(claimId)
      || claimSecret === undefined || !CLAIM_SECRET_PATTERN.test(claimSecret)
      || url === undefined || !url.startsWith("https://")
      || expiresAt === undefined || createdAt === undefined
    ) {
      throw new CliError("invalid-data", `Pending credits claim is malformed: ${this.pendingClaimPath}`);
    }
    return {
      claimId,
      claimSecret,
      url,
      expiresAt,
      packs: parsePacks(parsed.packs),
      suggestedPackId: readString(parsed.suggestedPackId) ?? null,
      createdAt,
    };
  }

  async writePendingClaim(claim: PendingCreditsClaim): Promise<void> {
    await this.#writePrivateFile(
      this.pendingClaimPath,
      `${JSON.stringify(claim)}\n`,
    );
  }

  async clearPendingClaim(): Promise<boolean> {
    try {
      const details = await lstat(this.pendingClaimPath);
      if (details.isSymbolicLink() || !details.isFile()) return false;
      await rm(this.pendingClaimPath, { force: true });
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async clearDeviceToken(): Promise<boolean> {
    try {
      const details = await lstat(this.tokenPath);
      if (details.isSymbolicLink() || !details.isFile()) return false;
      await rm(this.tokenPath, { force: true });
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }
}

/**
 * Resolve the credits device credential without ever reading argv: the
 * environment wins (agent environments), then the private state file.
 */
export async function loadCreditsToken(
  env: Readonly<Record<string, string | undefined>>,
  store: CreditsStore,
): Promise<Readonly<{ token: string; source: "env" | "state" }> | undefined> {
  const envToken = env[CREDITS_TOKEN_ENV];
  if (envToken !== undefined) {
    const token = envToken.trim();
    if (!DEVICE_TOKEN_PATTERN.test(token)) {
      throw new CliError(
        "invalid-data",
        `${CREDITS_TOKEN_ENV} is set but is not a valid cr_dev_ token.`,
      );
    }
    return { token, source: "env" };
  }
  const stored = await store.readDeviceToken();
  return stored === undefined ? undefined : { token: stored, source: "state" };
}

export function creditsErrorToCli(error: unknown): CliError {
  if (error instanceof CreditsRequestError) {
    const details: Record<string, unknown> = {};
    if (error.shortfall?.required !== undefined) details.required = error.shortfall.required;
    if (error.shortfall?.balance !== undefined) details.balance = error.shortfall.balance;
    if (error.shortfall?.topup !== undefined) details.topup = error.shortfall.topup;
    const topupHint = error.shortfall?.topup === undefined
      ? ""
      : ` Top up at ${error.shortfall.topup.url} or run \`slopcamera credits topup\`.`;
    switch (error.status) {
      case 401:
      case 403:
        return new CliError(
          "authorization-required",
          `The hosted credits credential was rejected. Run \`slopcamera credits status\` to inspect the configured wallet.${topupHint}`,
          Object.keys(details).length === 0 ? undefined : details,
        );
      case 402:
        return new CliError(
          "unavailable",
          `Insufficient hosted credits.${topupHint || " Run `slopcamera credits topup`."}`,
          Object.keys(details).length === 0 ? undefined : details,
        );
      case 404:
        return new CliError("not-found", error.message);
      case 409:
        return new CliError("conflict", error.message);
      case 410:
        return new CliError(
          "cancelled",
          `${error.message} Start a new checkout with \`slopcamera credits topup\`.`,
        );
      case 429:
        return new CliError("unavailable", `Rate limited by the credits service. ${error.message}`);
      default:
        return new CliError(
          "unavailable",
          `Credits request failed (${error.status}): ${error.message}`,
          Object.keys(details).length === 0 ? undefined : details,
        );
    }
  }
  if (error instanceof CliError) return error;
  return new CliError(
    "unavailable",
    `Credits request failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
}

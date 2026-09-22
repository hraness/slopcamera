import type { DirectingQuote, DirectingShot } from "../application/directing-contract";
import type { GatewayMediaCatalogView, GatewayJsonValue } from "./gateway-media-catalog";
import { providerVideoResolution } from "./gateway-provider-resolution";
import { CliError } from "./errors";

/** Integer microdollars avoid floating point drift across small paid attempts. */
export function parseDirectingUsd(value: string): number {
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/u.test(value)) {
    throw new CliError("usage", "Budget must be positive USD with at most six decimal places.");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const result = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  if (!Number.isSafeInteger(result) || result <= 0) throw new CliError("usage", "Budget must be positive USD.");
  return result;
}

function record(value: GatewayJsonValue | undefined): Readonly<Record<string, GatewayJsonValue>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, GatewayJsonValue>> : undefined;
}

function unsupported(message: string): never {
  throw new CliError("unavailable", `Directing preflight: ${message}`);
}

/** Only transparent duration pricing can admit a budgeted directing request. */
export function quoteDirectingShot(
  catalog: GatewayMediaCatalogView,
  shot: DirectingShot,
  now: Date,
): DirectingQuote {
  if ((shot.fps ?? 24) * shot.durationSeconds > 4000) unsupported("this request exceeds the local 4,000 decoded-frame bound.");
  const dimensions = /^(\d+)x(\d+)$/u.exec(shot.resolution);
  if (dimensions && (Number(dimensions[1]) > 4096 || Number(dimensions[2]) > 4096)) unsupported("this request exceeds the local 4,096-pixel dimension bound.");
  const vertical = /^(\d+)p$/iu.exec(shot.resolution);
  if (vertical) {
    const [width = 1, height = 1] = shot.aspectRatio.split(":").map(Number);
    const shortSide = Number(vertical[1]);
    if (Math.max(shortSide, shortSide * width / height) > 4096) unsupported("this request exceeds the local 4,096-pixel dimension bound.");
  }
  const age = now.getTime() - Date.parse(catalog.snapshot.validatedAt);
  if (catalog.status !== "fresh" || !Number.isFinite(age) || age < 0 || age > 5 * 60_000) unsupported("a fresh live catalog is required.");
  const model = catalog.snapshot.models.find(value => value.id === shot.model);
  if (model?.kind !== "video" || model.executionMode !== "video-model") unsupported("the selected model is not a batch video model.");
  const capability = model.capabilities;
  const hasVideoReference = (shot.references ?? []).some(reference => reference.mediaType.startsWith("video/"));
  const operations = (shot.references?.length ?? 0) > 0
    ? ["reference-to-video", ...(hasVideoReference ? ["video-editing", "motion-control", "extend-video"] : [])]
    : [shot.lastFrame !== undefined ? "first-last-frame" : shot.firstFrame !== undefined ? "image-to-video" : "text-to-video"];
  const supportedOperations = capability?.["supported_operations"];
  if (!Array.isArray(supportedOperations) || !operations.some(operation => supportedOperations.includes(operation))) unsupported(`the catalog does not confirm any of the shot's operations (${operations.join(", ")}).`);
  for (const [key, value] of [
    ["supported_resolutions", shot.resolution],
    ["supported_aspect_ratios", shot.aspectRatio],
    ["supported_durations_seconds", shot.durationSeconds],
    ...(shot.fps === undefined ? [] : [["supported_fps", shot.fps]]),
  ] as const) {
    const supported = capability?.[key];
    if (!Array.isArray(supported) || !supported.includes(value)) unsupported(`the catalog does not confirm ${key}=${value}.`);
  }
  if (providerVideoResolution(model.id, shot.resolution, shot.aspectRatio) === null) {
    unsupported(`the provider cannot express resolution ${shot.resolution} at aspect ${shot.aspectRatio}.`);
  }
  if (model.pricing.varies_by_provider === true) unsupported("provider-dependent pricing cannot establish a bounded reservation.");
  const rows = model.pricing.video_duration_pricing;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 128) unsupported("duration pricing is unavailable.");
  const parsed = rows.map(record);
  if (parsed.some(row => row === undefined || Object.keys(row).some(key => !["resolution", "cost_per_second"].includes(key)))) {
    unsupported("the model has unsupported pricing conditions; use the ordinary Gateway command with a separately reviewed quote.");
  }
  const exact = parsed.filter(row => row?.resolution === shot.resolution);
  const matching = exact.length > 0 ? exact : parsed.filter(row => row?.resolution === undefined);
  if (matching.length !== 1 || typeof matching[0]?.cost_per_second !== "string") unsupported("pricing is missing or ambiguous for this resolution.");
  const rate = parseDirectingUsd(matching[0].cost_per_second);
  const cost = rate * shot.durationSeconds;
  if (!Number.isSafeInteger(cost)) unsupported("the quote exceeds the integer budget bound.");
  return {
    catalogSha256: catalog.snapshot.snapshotId.slice(7),
    validatedAt: catalog.snapshot.validatedAt,
    costMicroUsd: cost,
    rateMicroUsdPerSecond: rate,
  };
}

/** Determine transport from the same catalog used to price the shot. */
export function directingInputTransport(catalog: GatewayMediaCatalogView, shot: DirectingShot): "none" | "inline" | "url" {
  const kinds = new Set((shot.references ?? []).map(reference => reference.mediaType.split("/")[0]!));
  if (shot.firstFrame !== undefined || shot.lastFrame !== undefined) kinds.add("image");
  if (kinds.size === 0) return "none";
  const model = catalog.snapshot.models.find(value => value.id === shot.model);
  const inputLimits = record(model?.capabilities?.input_limits);
  let needsUrl = false;
  for (const kind of kinds) {
    const sources = record(inputLimits?.[kind])?.supported_sources;
    if (sources === undefined || sources === null) continue;
    if (!Array.isArray(sources) || sources.some(value => typeof value !== "string")) unsupported("invalid input transport capabilities.");
    if (sources.includes("base64") || sources.includes("buffer")) continue;
    if (sources.includes("url")) { needsUrl = true; continue; }
    unsupported(`the model has no supported ${kind} input transport.`);
  }
  if (needsUrl) {
    for (const kind of kinds) {
      const sources = record(inputLimits?.[kind])?.supported_sources;
      if (Array.isArray(sources) && !sources.includes("url")) unsupported(`the model cannot receive hosted ${kind} references.`);
    }
  }
  return needsUrl ? "url" : "inline";
}

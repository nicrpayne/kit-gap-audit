import { createHash } from "node:crypto";
import type { DecisionBriefV1 } from "./decisionBrief";
import type { BriefRecipeV1 } from "./composer";
import {
  buildInteractiveBriefBundleDraft,
  type InteractiveBriefBundleV1,
  type PublicationExclusion,
  type UnsealedInteractiveBriefBundleV1,
} from "./publicationContract";

export function stableJson(value: unknown): string {
  const stable = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(stable);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stable(child)]));
  };
  return JSON.stringify(stable(value));
}

export function sealInteractiveBriefBundle(draft: UnsealedInteractiveBriefBundleV1): InteractiveBriefBundleV1 {
  const bundleHash = createHash("sha256").update(stableJson(draft)).digest("hex");
  return { ...draft, integrity: { ...draft.integrity, bundleHash } };
}

export function createInteractiveBriefBundle(reportId: string, brief: DecisionBriefV1, recipe: BriefRecipeV1): InteractiveBriefBundleV1 {
  return sealInteractiveBriefBundle(buildInteractiveBriefBundleDraft(reportId, brief, recipe));
}

export interface PublicationReadinessResult {
  ready: boolean;
  errors: string[];
  warnings: string[];
  exclusions: PublicationExclusion[];
  checkedClaims: number;
}

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\b(?:authorization|bearer|app_password|api[_-]?key|access[_-]?token|refresh[_-]?token)\b\s*[:=]/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const LOCAL_PATH_PATTERN = /(?:file:\/\/|\/(?:Users|home|private|Volumes)\/|[A-Za-z]:\\Users\\)/;
const RAW_PAYLOAD_PATTERN = /(?:<!doctype\s+html|<html[\s>]|<body[\s>]|\b(?:502 Bad Gateway|Internal Server Error)\b)/i;

function allStrings(value: unknown, path = "$", out: { path: string; value: string }[] = []) {
  if (typeof value === "string") out.push({ path, value });
  else if (Array.isArray(value)) value.forEach((item, index) => allStrings(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, child]) => allStrings(child, `${path}.${key}`, out));
  return out;
}

export function validatePublicationReadiness(bundle: InteractiveBriefBundleV1): PublicationReadinessResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!bundle.identity.reportId) errors.push("Immutable report id is missing.");
  if (!bundle.identity.projectId || !bundle.identity.projectName) errors.push("Project identity is missing.");
  if (!bundle.identity.audience || !bundle.identity.purpose) errors.push("Audience or purpose is missing.");
  if (!bundle.integrity.snapshotFingerprint || !/^[a-f0-9]{64}$/.test(bundle.integrity.bundleHash)) errors.push("Bundle integrity seal is invalid.");
  if (!bundle.provenance.length) errors.push("No material-claim provenance was included.");
  for (const claim of bundle.provenance) {
    if (!claim.owner || !claim.asOf || !claim.currentness || !claim.temporalRole) errors.push(`Material claim ${claim.field} lacks owner/currentness metadata.`);
  }
  for (const entry of allStrings(bundle)) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(entry.value))) errors.push(`Secret-like content detected at ${entry.path}.`);
    if (LOCAL_PATH_PATTERN.test(entry.value)) errors.push(`Local filesystem path detected at ${entry.path}.`);
    if (RAW_PAYLOAD_PATTERN.test(entry.value)) errors.push(`Raw HTML or error payload detected at ${entry.path}.`);
  }
  if (bundle.permissions.liveSignalAccess || bundle.permissions.liveQueryAuthority || bundle.permissions.mutationCapability) errors.push("Bundle contains unsupported live or mutation capability.");
  if (bundle.permissions.credentialsIncluded || bundle.permissions.publishAuthorized || bundle.permissions.silentRefreshAllowed) errors.push("Bundle attempts to carry credentials, publication authority, or silent refresh authority.");
  if (bundle.references.some((reference) => reference.href !== null)) errors.push("Publication references contain a live or inaccessible link.");
  if (bundle.content.delivery.status === "unavailable") warnings.push(bundle.content.delivery.unavailableReason ?? "Forecast unavailable.");
  if (bundle.content.delivery.commitment.status === "missing") warnings.push("No canonical delivery commitment.");
  if (bundle.content.capacity?.availability !== "available") warnings.push(bundle.content.capacity?.absenceLabel ?? "Named staffing not configured.");
  for (const item of bundle.provenance.filter((claim) => claim.currentness !== "current")) warnings.push(`${item.owner} is ${item.currentness} as of ${item.asOf}.`);
  return { ready: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)], exclusions: bundle.exclusions, checkedClaims: bundle.provenance.length };
}

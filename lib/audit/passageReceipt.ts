import { validateProjectContextPackage } from "@/lib/context/validate";
import { evidenceAnchor, evidenceSourceDate } from "./evidenceMetadata";
import type { JsonValue } from "@/lib/context/package";

export interface AuditPassageReceipt {
  nodeId: string;
  scopeId: string;
  snapshotId: string;
  evidenceId: string;
  passage: null | {
    quote: string;
    surroundingContext: string | null;
    sourceRef: string;
    externalRef: string | null;
    sourceDate: string | null;
    snapshotRecordedAt: string;
    locator: Record<string, JsonValue>;
  };
}

export function passageIdentity(nodeId?: string) {
  const match = /^passage:([^:]+):(.+)$/.exec(nodeId ?? "");
  return match ? { snapshotId: match[1], evidenceId: match[2] } : null;
}

/** Resolve only the requested immutable snapshot; never today's replacement. */
export function projectPassageReceipt(scopeId: string, nodeId: string, snapshot: null | {
  id: string; scopeId: string; createdAt: string; package: unknown;
}): AuditPassageReceipt | null {
  const identity = passageIdentity(nodeId);
  if (!identity) return null;
  const receipt: AuditPassageReceipt = { ...identity, nodeId, scopeId, passage: null };
  if (!snapshot || snapshot.id !== identity.snapshotId || snapshot.scopeId !== scopeId) return receipt;
  let pkg;
  try { pkg = validateProjectContextPackage(snapshot.package); } catch { return receipt; }
  if (pkg.scopeId !== scopeId) return receipt;
  const item = pkg.evidence.find(candidate => candidate.id === identity.evidenceId);
  if (!item) return receipt;
  return { ...receipt, passage: {
    quote: item.excerpt,
    surroundingContext: typeof item.data?.surroundingContext === "string" ? item.data.surroundingContext : null,
    sourceRef: item.sourceRef,
    externalRef: item.externalRef ?? null,
    sourceDate: evidenceSourceDate(item),
    snapshotRecordedAt: snapshot.createdAt,
    locator: evidenceAnchor(item),
  } };
}

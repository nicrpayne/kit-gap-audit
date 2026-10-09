import type { EvidenceItem, JsonValue } from "@/lib/context/package";
import { validateProjectContextPackage } from "@/lib/context/validate";
import { evidenceAnchor, evidenceIndependence, evidenceSourceDate } from "@/lib/audit/evidenceMetadata";

export interface CapabilityEvidenceOriginSnapshot {
  id: string;
  scopeId: string;
  createdAt: string;
  package: unknown;
}

export interface CapabilityAuditEvidenceOrigin {
  proposalId: string;
  scopeId: string;
  capabilityId: string;
  auditRunId: string | null;
  status: string;
  acceptedAt: string;
  evidence: unknown;
  snapshot: CapabilityEvidenceOriginSnapshot;
}

export interface CapturedCapabilityEvidence {
  contextSnapshotId: string;
  acceptedAt: string;
  excerpt: string;
  sourceRef: string;
  externalRef: string | null;
  sourceUrl: string | null;
  sourceDate: string | null;
  locator: Record<string, JsonValue>;
  kind: string;
  independence: string | null;
}

/** A canonical capability's accepted evidence receipt. `reference` is always
 * retained, even when its immutable origin cannot be resolved. A capture is
 * added only when a bootstrap reference is proven inside that Scope's exact
 * activation snapshot; current knowledge is never consulted as a fallback. */
export interface CapabilityEvidenceReference {
  reference: unknown;
  evidenceId: string | null;
  state: "captured_at_acceptance" | "reference_only";
  capture: CapturedCapabilityEvidence | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayOrValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function nestedEvidenceReferences(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return value == null ? [] : [value];
  const wrapper = value as Record<string, unknown>;
  if (Array.isArray(wrapper.contextRefs)) return wrapper.contextRefs;
  if (Array.isArray(wrapper.evidenceRefs)) return wrapper.evidenceRefs;
  return [value];
}

function evidenceId(value: unknown): string | null {
  if (typeof value === "string") return nonEmptyString(value);
  const item = record(value);
  return nonEmptyString(item.evidenceId) ?? nonEmptyString(item.id) ?? nonEmptyString(item.ref);
}

function referenceKey(value: unknown): string | null {
  const id = evidenceId(value);
  return id ? `id:${id}` : null;
}

/** Both historical shapes are accepted: operator evidence is nested under
 * `evidence`, while bootstrap evidence ids live at the provenance top level.
 * Context references predate both and remain visible as reference-only rows. */
export function capabilityEvidenceReferences(provenance: unknown): unknown[] {
  const source = record(provenance);
  const references = [
    ...nestedEvidenceReferences(source.evidence),
    ...arrayOrValue(source.contextRefs),
    ...arrayOrValue(source.evidenceRefs),
    ...arrayOrValue(source.operatorEvidence),
  ];
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = referenceKey(reference);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function sourceUrl(item: { sourceRef: string; externalRef?: string; data?: Record<string, JsonValue> }): string | null {
  const data = item.data ?? {};
  for (const candidate of [item.externalRef, data.sourceUrl, data.externalUrl, data.url, item.sourceRef]) {
    const url = safeHttpUrl(candidate);
    if (url) return url;
  }
  return null;
}

function referenceOnly(reference: unknown): CapabilityEvidenceReference {
  return { reference, evidenceId: evidenceId(reference), state: "reference_only", capture: null };
}

interface PreparedCapabilityEvidenceOrigin {
  snapshot: CapabilityEvidenceOriginSnapshot;
  evidenceById: Map<string, EvidenceItem>;
  acceptedEvidenceIdsByCandidate: Map<string, Set<string>>;
}

function prepareCapabilityEvidenceOrigin(input: {
  scopeId: string;
  activationSnapshot?: CapabilityEvidenceOriginSnapshot | null;
}): PreparedCapabilityEvidenceOrigin | null {
  const snapshot = input.activationSnapshot;
  if (!snapshot || snapshot.scopeId !== input.scopeId) return null;

  let pkg;
  try {
    pkg = validateProjectContextPackage(snapshot.package);
  } catch {
    return null;
  }
  if (pkg.scopeId !== input.scopeId) return null;

  const acceptedEvidenceIdsByCandidate = new Map<string, Set<string>>();
  for (const claim of pkg.derivedClaims ?? []) {
    const prefix = "bootstrap-accepted:";
    if (!claim.id.startsWith(prefix)) continue;
    const candidateId = claim.id.slice(prefix.length);
    if (candidateId) acceptedEvidenceIdsByCandidate.set(candidateId, new Set(claim.evidenceRefs));
  }
  return {
    snapshot,
    evidenceById: new Map(pkg.evidence.map((item) => [item.id, item])),
    acceptedEvidenceIdsByCandidate,
  };
}

function projectWithOrigin(provenanceValue: unknown, origin: PreparedCapabilityEvidenceOrigin | null): CapabilityEvidenceReference[] {
  const references = capabilityEvidenceReferences(provenanceValue);
  const provenance = record(provenanceValue);
  const originalReferences = new Set(capabilityEvidenceReferences({ ...provenance, operatorEvidence: undefined }));
  if (provenance.boundary !== "human_accepted_bootstrap") return references.map(referenceOnly);

  const candidateId = nonEmptyString(provenance.sourceCandidateId);
  if (!candidateId || !origin) return references.map(referenceOnly);

  const acceptedEvidenceIds = origin.acceptedEvidenceIdsByCandidate.get(candidateId);
  if (!acceptedEvidenceIds) return references.map(referenceOnly);

  return references.map((reference) => {
    const id = evidenceId(reference);
    if (!originalReferences.has(reference) || !id || !acceptedEvidenceIds.has(id)) return referenceOnly(reference);
    const item = origin.evidenceById.get(id);
    if (!item) return referenceOnly(reference);
    return {
      reference,
      evidenceId: id,
      state: "captured_at_acceptance",
      capture: {
        contextSnapshotId: origin.snapshot.id,
        acceptedAt: origin.snapshot.createdAt,
        excerpt: item.excerpt,
        sourceRef: item.sourceRef,
        externalRef: nonEmptyString(item.externalRef),
        sourceUrl: sourceUrl(item),
        sourceDate: evidenceSourceDate(item),
        locator: evidenceAnchor(item),
        kind: item.kind,
        independence: evidenceIndependence(item),
      },
    };
  });
}

function prepareAuditOrigins(scopeId: string, origins: CapabilityAuditEvidenceOrigin[]) {
  const prepared = new Map<string, { origin: CapabilityAuditEvidenceOrigin; items: Map<string, EvidenceItem>; evidence: Map<string, Record<string, unknown>> }>();
  for (const origin of origins) {
    if (origin.status !== "accepted" || origin.scopeId !== scopeId || origin.snapshot.scopeId !== scopeId || !Number.isFinite(Date.parse(origin.acceptedAt))) continue;
    try {
      const pkg = validateProjectContextPackage(origin.snapshot.package);
      if (pkg.scopeId !== scopeId) continue;
      const evidence = new Map(arrayOrValue(origin.evidence).flatMap(value => {
        const id = evidenceId(value);
        return id ? [[id, record(value)] as const] : [];
      }));
      prepared.set(origin.proposalId, { origin, evidence, items: new Map(pkg.evidence.map(item => [item.id,item])) });
    } catch { /* Keep unresolved references; never borrow a newer package. */ }
  }
  return prepared;
}

function projectAuditEvidence(provenanceValue: unknown, capabilityId: string | undefined, origins: ReturnType<typeof prepareAuditOrigins>): CapabilityEvidenceReference[] {
  const provenance = record(provenanceValue);
  const prepared = origins.get(String(provenance.auditChangeProposalId ?? ""));
  const references = capabilityEvidenceReferences(provenance);
  const originalReferences = new Set(nestedEvidenceReferences(provenance.evidence));
  if (!prepared || !capabilityId || prepared.origin.capabilityId !== capabilityId ||
    prepared.origin.snapshot.id !== provenance.contextSnapshotId || prepared.origin.auditRunId !== (provenance.auditRunId ?? null)) return references.map(referenceOnly);
  return references.map(reference => {
    const id = evidenceId(reference);
    const accepted = id ? prepared.evidence.get(id) : undefined;
    const item = id ? prepared.items.get(id) : undefined;
    // The saved acceptance and its exact snapshot must agree on the words.
    // An operator reference sharing an id cannot become source authority.
    if (!originalReferences.has(reference) || !item || !accepted || record(reference).sourceRef !== item.sourceRef || record(reference).excerpt !== item.excerpt || accepted.excerpt !== item.excerpt || accepted.sourceRef !== item.sourceRef) return referenceOnly(reference);
    return {
      reference, evidenceId: id, state: "captured_at_acceptance" as const,
      capture: { contextSnapshotId: prepared.origin.snapshot.id, acceptedAt: prepared.origin.acceptedAt,
        excerpt: item.excerpt, sourceRef: item.sourceRef, externalRef: nonEmptyString(item.externalRef),
        sourceUrl: sourceUrl(item), sourceDate: evidenceSourceDate(item), locator: evidenceAnchor(item),
        kind: item.kind, independence: evidenceIndependence(item) },
    };
  });
}

/** Prepare and validate one Scope's immutable activation origin once, then
 * project every capability in that Scope without reparsing the package. The
 * returned closure is request-local; no cross-request cache is retained. */
export function createCapabilityEvidenceProjector(input: {
  scopeId: string;
  activationSnapshot?: CapabilityEvidenceOriginSnapshot | null;
  auditOrigins?: CapabilityAuditEvidenceOrigin[];
}): (provenance: unknown, capabilityId?: string) => CapabilityEvidenceReference[] {
  const origin = prepareCapabilityEvidenceOrigin(input);
  const auditOrigins = prepareAuditOrigins(input.scopeId, input.auditOrigins ?? []);
  return (provenance, capabilityId) => record(provenance).auditChangeProposalId
    ? projectAuditEvidence(provenance, capabilityId, auditOrigins)
    : projectWithOrigin(provenance, origin);
}

export function projectCapabilityEvidence(input: {
  scopeId: string;
  provenance: unknown;
  activationSnapshot?: CapabilityEvidenceOriginSnapshot | null;
  auditOrigins?: CapabilityAuditEvidenceOrigin[];
  capabilityId?: string;
}): CapabilityEvidenceReference[] {
  return createCapabilityEvidenceProjector(input)(input.provenance, input.capabilityId);
}

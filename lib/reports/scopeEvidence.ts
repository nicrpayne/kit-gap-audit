import { capturedEvidenceAuditHref, createCapabilityEvidenceProjector, type CapabilityAuditEvidenceOrigin, type CapabilityEvidenceOriginSnapshot, type CapabilityEvidenceReference } from "@/lib/scope/capabilityEvidence";

/** Accepted Scope receipts are not estimate authority or a current-source read. */
export interface ReportScopeEvidenceV1 {
  version: "report-scope-evidence.v1";
  scopeId: string;
  capturedAt: string;
  capabilities: {
    id: string;
    name: string;
    revision: number;
    excludedFromScenario: boolean;
    references: (CapabilityEvidenceReference & { auditHref: string | null })[];
  }[];
}

export function freezeScopeEvidence(input: {
  scopeId: string;
  capturedAt: string;
  capabilities: { id: string; scopeId: string; name: string; revision: number; status: string; provenance: unknown }[];
  activationSnapshot: CapabilityEvidenceOriginSnapshot | null;
  auditOrigins?: CapabilityAuditEvidenceOrigin[];
}): ReportScopeEvidenceV1 {
  const project = createCapabilityEvidenceProjector(input);
  // Clone nested raw references and locators as well as the resolved quote.
  return structuredClone({
    version: "report-scope-evidence.v1",
    scopeId: input.scopeId,
    capturedAt: input.capturedAt,
    capabilities: input.capabilities
      .filter(capability => capability.scopeId === input.scopeId && capability.status === "accepted")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(capability => ({
        id: capability.id, name: capability.name, revision: capability.revision, excludedFromScenario: false,
        references: project(capability.provenance, capability.id).map(reference => ({
          ...reference,
          auditHref: capturedEvidenceAuditHref(input.scopeId, reference),
        })),
      })),
  });
}

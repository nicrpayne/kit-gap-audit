import type { BootstrapProposal, ProjectBootstrapPackageV1 } from "./contracts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** A title names a record, not necessarily a thing the product must deliver. */
export function explicitCapabilityName(value: unknown): string | null {
  const fields = record(value);
  for (const key of ["capability", "capability_name", "capabilityName", "product_capability", "productCapability", "feature", "feature_name", "featureName"]) {
    if (typeof fields[key] === "string" && fields[key].trim()) return fields[key].trim();
  }
  return null;
}

function admissionReason(candidateKey: string, refs: string[], heads: unknown[]): string | null {
  const linked = heads.map(record).filter(head => {
    const id = head.intelligenceId ?? head.id;
    return typeof id === "string" && (refs.includes(id) || candidateKey === `hermes:capability:${id}`);
  });
  for (const head of linked) {
    const type = String(head.type ?? head.intelligenceType ?? "").toLowerCase();
    if (type !== "opportunity") continue;
    const status = String(head.status ?? record(head.fields).status ?? "").toLowerCase();
    if (head.isCurrent === false || ["rejected", "dismissed", "closed", "superseded", "archived", "withdrawn"].includes(status)) {
      return "This opportunity is no longer active in its source. Its evidence stays in Audit; it is not a new Scope requirement.";
    }
    if (!explicitCapabilityName(head.fields)) {
      return "This opportunity does not explicitly name a product capability or feature. Its title or suggestion alone is not Scope; the evidence stays in Audit as information.";
    }
  }
  return null;
}

export function bootstrapCapabilityAdmissionReason(proposal: BootstrapProposal, pkg: Pick<ProjectBootstrapPackageV1, "intelligenceHeads">): string | null {
  return proposal.kind === "capability"
    ? admissionReason(proposal.candidateKey, proposal.intelligenceRefs, pkg.intelligenceHeads)
    : null;
}

/** Read legacy immutable snapshots too: the companion's exact candidate key
 * carries its intelligence identity. Never match arbitrary titles or excerpts. */
export function contextCapabilityAdmissionReason(sourceKey: string | null, value: unknown): string | null {
  const pkg = record(value);
  const candidateKey = (sourceKey ?? "").replace(/^refresh:/, "");
  const claims = Array.isArray(pkg.derivedClaims) ? pkg.derivedClaims.map(record) : [];
  const claim = claims.find(item => record(item.extra).candidateKey === candidateKey);
  const refs = record(claim?.extra).intelligenceRefs;
  return admissionReason(candidateKey, Array.isArray(refs) ? refs.filter((v): v is string => typeof v === "string") : [], Array.isArray(pkg.intelligenceObjects) ? pkg.intelligenceObjects : []);
}

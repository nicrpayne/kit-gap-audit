import type { CandidateDisposition } from "./contracts";

export interface PriorDisposition {
  sourceFingerprint: string;
  status: string;
  dispositionReason: string | null;
  reviewedProposal: unknown | null;
}

export interface RefreshDisposition {
  status: CandidateDisposition;
  dispositionReason: string | null;
  reviewedProposal: unknown | null;
  changedSincePrior: boolean;
}

// The rescan law in one pure decision. An unchanged typed payload + raw
// lineage fingerprint remembers the human. A material change reopens the
// proposal, but keeps the old row and ancestry for review/diff.
export function resolveRefreshDisposition(prior: PriorDisposition | undefined, nextFingerprint: string): RefreshDisposition {
  if (!prior) return { status: "pending", dispositionReason: null, reviewedProposal: null, changedSincePrior: false };
  if (prior.sourceFingerprint === nextFingerprint) {
    const allowed: CandidateDisposition[] = ["pending", "accepted", "deferred", "rejected", "information-only", "superseded"];
    return {
      status: allowed.includes(prior.status as CandidateDisposition) ? prior.status as CandidateDisposition : "pending",
      dispositionReason: prior.dispositionReason,
      reviewedProposal: prior.reviewedProposal,
      changedSincePrior: false,
    };
  }
  return { status: "pending", dispositionReason: null, reviewedProposal: null, changedSincePrior: true };
}


import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { acceptAuditChange, dispositionAuditChange, editAuditChange } from "../lib/audit/acceptChange";
import {
  AUDIT_PROPOSAL_SUPERSEDED_REASON,
  auditProposalReviewFields,
  shouldReviveAutoSupersededProposal,
} from "../lib/audit/changeInbox";

const old = {
  id: "proposal-old",
  scopeId: "scope-proof",
  sourceKind: "refresh",
  sourceKey: "refresh:stable-change",
  contextSnapshotId: "snapshot-old",
  status: "information_only",
  dispositionReason: AUDIT_PROPOSAL_SUPERSEDED_REASON,
};
const latest = {
  ...old,
  id: "proposal-latest",
  contextSnapshotId: "snapshot-current",
  status: "pending",
  dispositionReason: null,
};

const historical = auditProposalReviewFields(old, "snapshot-current", latest);
assert.deepEqual(historical, {
  canReview: false,
  supersededByProposalId: latest.id,
  latestProposalId: latest.id,
  latestProposalStatus: "pending",
  reviewReason: `${AUDIT_PROPOSAL_SUPERSEDED_REASON} Review the latest proposal instead; this historical proposal was not applied.`,
});
assert.equal(auditProposalReviewFields(latest, "snapshot-current", latest).canReview, true);
assert.equal(auditProposalReviewFields({ ...old, status: "pending" }, "snapshot-old", { ...old, status: "pending" }).canReview, true, "restored source can make its immutable proposal current again");
assert.equal(auditProposalReviewFields({ ...latest, sourceKind: "baseline", status: "rejected", dispositionReason: "Owner rejected it." }, "snapshot-current", null).canReview, false, "ordinary rejected rows remain processed, not directly Accept/Edit actionable");
assert.match(auditProposalReviewFields({ ...old, status: "accepted" }, "snapshot-current", latest).reviewReason ?? "", /was accepted into Reality/, "accepted history is never mislabeled as unapplied");
console.log("PASS additive read model points historical rows to the current proposal and exposes one fail-closed canReview field");

assert.equal(shouldReviveAutoSupersededProposal({ inputSnapshotId: "old", currentSnapshotId: "new", newerSameSnapshotProposalId: null }), false, "a stale snapshot retry cannot revive its old proposal");
assert.equal(shouldReviveAutoSupersededProposal({ inputSnapshotId: "same", currentSnapshotId: "same", newerSameSnapshotProposalId: "newer" }), false, "an older fingerprint cannot revive beneath a newer version in the same snapshot");
assert.equal(shouldReviveAutoSupersededProposal({ inputSnapshotId: "restored", currentSnapshotId: "restored", newerSameSnapshotProposalId: null }), true, "a deliberately restored current package can reopen its automatically superseded proposal");
console.log("PASS revival is gated by the current source and same-snapshot head while source restoration remains supported");

type MockRow = {
  id: string;
  scopeId: string;
  sourceKind: string;
  sourceKey: string | null;
  contextSnapshotId: string | null;
  status: string;
  dispositionReason: string | null;
  proposedState: Record<string, unknown>;
  completionRequirements: unknown[];
  owner: string;
};

const rows: Record<string, MockRow> = {
  [old.id]: { ...old, proposedState: { action: "upsert_capability", name: "Old proposal" }, completionRequirements: [], owner: "scope" },
  [latest.id]: { ...latest, proposedState: { action: "upsert_capability", name: "Latest proposal" }, completionRequirements: [], owner: "scope" },
  accepted: {
    ...old,
    id: "accepted",
    status: "accepted",
    proposedState: { action: "upsert_capability", name: "Accepted proposal" },
    completionRequirements: [],
    owner: "scope",
  },
};

type MutablePrisma = {
  $transaction: (callback: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>;
  projectDerivedState: { findUnique: () => Promise<unknown> };
};

async function main() {
  const mutablePrisma = prisma as unknown as MutablePrisma;
  const originalTransaction = mutablePrisma.$transaction;
  const originalDerivedFind = mutablePrisma.projectDerivedState.findUnique;
  let idempotentProposalId: string | null = null;
  let mutationCalls = 0;
  let currentSourceReads = 0;
  const tx = {
    auditChangeEvent: {
      findUnique: async () => idempotentProposalId ? { proposalId: idempotentProposalId } : null,
      create: async () => { mutationCalls += 1; throw new Error("unexpected event write"); },
    },
    auditChangeProposal: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => rows[where.id],
      findFirst: async () => ({ id: latest.id }),
      update: async () => { mutationCalls += 1; throw new Error("unexpected proposal write"); },
    },
    projectActivation: {
      findUnique: async () => {
        currentSourceReads += 1;
        return { bootstrap: { activePackageId: "package-current" } };
      },
    },
    bootstrapPackage: {
      findUnique: async () => ({ package: { producer: "proof", packageId: "current" } }),
    },
    contextSnapshot: {
      findFirst: async () => ({ id: "snapshot-current" }),
      findUnique: async () => null,
    },
  };
  mutablePrisma.$transaction = async (callback) => callback(tx);
  mutablePrisma.projectDerivedState.findUnique = async () => null;
  try {
    await assert.rejects(
      () => acceptAuditChange(old.id, { idempotencyKey: "proof-accept-stale" }),
      new RegExp(AUDIT_PROPOSAL_SUPERSEDED_REASON),
    );
    await assert.rejects(
      () => editAuditChange(old.id, { proposedState: { action: "upsert_capability", name: "Edited old proposal" }, idempotencyKey: "proof-edit-stale" }),
      new RegExp(AUDIT_PROPOSAL_SUPERSEDED_REASON),
    );
    await assert.rejects(
      () => dispositionAuditChange(old.id, { action: "reopen", idempotencyKey: "proof-reopen-stale" }),
      new RegExp(AUDIT_PROPOSAL_SUPERSEDED_REASON),
    );
    assert.equal(mutationCalls, 0);
    assert.equal(currentSourceReads, 3);
    console.log("PASS stale superseded Accept, Edit and Reopen fail before any proposal, event or Reality write");

    currentSourceReads = 0;
    idempotentProposalId = "accepted";
    const retry = await acceptAuditChange("accepted", { idempotencyKey: "proof-accepted-retry" });
    assert.equal(retry.created, false);
    assert.equal(retry.proposal.id, "accepted");
    assert.equal(currentSourceReads, 0, "the recorded idempotent result wins before current-source review");

    idempotentProposalId = null;
    const acceptedAgain = await acceptAuditChange("accepted", { idempotencyKey: "proof-accepted-second-click" });
    assert.equal(acceptedAgain.created, false);
    assert.equal(currentSourceReads, 0, "accepted Reality remains an idempotent no-op even after later source changes");
    assert.equal(mutationCalls, 0);
    console.log("PASS accepted Reality and idempotent retries are preserved without reapplying owner state");
  } finally {
    mutablePrisma.$transaction = originalTransaction;
    mutablePrisma.projectDerivedState.findUnique = originalDerivedFind;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

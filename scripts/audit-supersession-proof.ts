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
const currentRow = (id: string, status: string) => ({
  ...latest,
  id,
  sourceKey: `refresh:${id}`,
  status,
  dispositionReason: status === "rejected" ? "Owner rejected it." : null,
});

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
  category: string;
};

const rows: Record<string, MockRow> = {
  [old.id]: { ...old, proposedState: { action: "upsert_capability", name: "Old proposal" }, completionRequirements: [], owner: "scope", category: "scope" },
  [latest.id]: { ...latest, proposedState: { action: "upsert_capability", name: "Latest proposal" }, completionRequirements: [], owner: "scope", category: "scope" },
  accepted: {
    ...old,
    id: "accepted",
    status: "accepted",
    proposedState: { action: "upsert_capability", name: "Accepted proposal" },
    completionRequirements: [],
    owner: "scope",
    category: "scope",
  },
  pending: { ...currentRow("pending", "pending"), proposedState: { action: "upsert_capability", name: "Pending proposal" }, completionRequirements: [], owner: "scope", category: "scope" },
  needs: { ...currentRow("needs", "needs_completion"), proposedState: { action: "upsert_capability", name: "Needs completion" }, completionRequirements: [], owner: "scope", category: "scope" },
  deferred: { ...currentRow("deferred", "deferred"), proposedState: { action: "upsert_capability", name: "Deferred proposal" }, completionRequirements: [], owner: "scope", category: "scope" },
  information: { ...currentRow("information", "information_only"), proposedState: { action: "upsert_capability", name: "Already represented" }, completionRequirements: [], owner: "scope", category: "scope" },
  rejected: { ...currentRow("rejected", "rejected"), proposedState: { action: "upsert_capability", name: "Rejected proposal" }, completionRequirements: [], owner: "scope", category: "scope" },
  "policy-closed": { ...currentRow("policy-closed", "pending"), proposedState: { action: "upsert_capability", name: "Opportunity title only" }, completionRequirements: [], owner: "scope", category: "scope" },
  "policy-closed-changed-action": { ...currentRow("policy-closed-changed-action", "pending"), proposedState: { action: "information_only" }, completionRequirements: [], owner: "scope", category: "scope" },
  "policy-closed-nonscope": { ...currentRow("policy-closed-nonscope", "pending"), proposedState: { action: "upsert_capability", name: "Opportunity title only" }, completionRequirements: [], owner: "findings", category: "finding" },
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
      create: async () => { mutationCalls += 1; return {}; },
    },
    auditChangeProposal: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => rows[where.id],
      findFirst: async ({ where }: { where: { sourceKey?: string } }) => {
        const head = Object.values(rows).find((row) => row.sourceKey === where.sourceKey && row.contextSnapshotId === "snapshot-current");
        return head ? { id: head.id } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MockRow> }) => {
        mutationCalls += 1;
        rows[where.id] = { ...rows[where.id], ...data };
        return rows[where.id];
      },
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
      findFirst: async () => ({
        id: "snapshot-current",
        package: {
          derivedClaims: ["policy-closed", "policy-closed-changed-action", "policy-closed-nonscope"].map((candidateKey) => ({ extra: { candidateKey, intelligenceRefs: ["opportunity-policy"] } })),
          intelligenceObjects: [{ id: "opportunity-policy", type: "opportunity", status: "open", fields: { summary: "Suggestion only" } }],
        },
      }),
      findUnique: async () => null,
    },
  };
  mutablePrisma.$transaction = async (callback) => callback(tx);
  mutablePrisma.projectDerivedState.findUnique = async () => null;
  try {
    let keySequence = 0;
    const mutationAttempts = (proposalId: string) => [
      ["Accept", () => acceptAuditChange(proposalId, { idempotencyKey: `proof-${proposalId}-accept-${keySequence++}` })],
      ["Edit", () => editAuditChange(proposalId, { proposedState: { action: "upsert_capability", name: "Edited proposal" }, idempotencyKey: `proof-${proposalId}-edit-${keySequence++}` })],
      ...(["defer", "reject", "information_only", "reopen"] as const).map((action) => [
        action,
        () => dispositionAuditChange(proposalId, { action, idempotencyKey: `proof-${proposalId}-${action}-${keySequence++}` }),
      ] as const),
    ] as const;

    for (const [action, mutate] of mutationAttempts(old.id)) {
      await assert.rejects(mutate, new RegExp(AUDIT_PROPOSAL_SUPERSEDED_REASON), `${action} must reject a stale source head`);
    }
    assert.equal(mutationCalls, 0);
    assert.equal(currentSourceReads, mutationAttempts(old.id).length);
    console.log("PASS every stale-head mutation action fails before any proposal, event or Reality write");

    currentSourceReads = 0;
    for (const proposalId of ["information", "rejected"]) {
      for (const [action, mutate] of mutationAttempts(proposalId)) {
        await assert.rejects(mutate, /closed history/, `${action} must not revive or alter ${proposalId} history`);
      }
    }
    assert.equal(mutationCalls, 0);
    assert.equal(currentSourceReads, 12);
    console.log("PASS information-only and rejected current heads cannot be accepted, edited, reopened or re-dispositioned");

    currentSourceReads = 0;
    for (const proposalId of ["policy-closed", "policy-closed-changed-action", "policy-closed-nonscope"]) {
      for (const [action, mutate] of mutationAttempts(proposalId)) {
        await assert.rejects(mutate, /not Scope|not a new Scope requirement/, `${action} must honor the same admission policy as the Inbox`);
      }
    }
    assert.equal(mutationCalls, 0);
    assert.equal(currentSourceReads, 18);
    console.log("PASS legacy stored-pending opportunities closed by category or action stay closed on every server mutation path");

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

    for (const proposalId of ["pending", "needs", "deferred"]) {
      const originalStatus = proposalId === "needs" ? "needs_completion" : proposalId;
      rows[proposalId].status = originalStatus;
      mutationCalls = 0;
      const edited = await editAuditChange(proposalId, {
        proposedState: { action: "upsert_capability", name: `Edited ${proposalId}` },
        idempotencyKey: `proof-edit-current-${proposalId}`,
      });
      assert.equal(edited.status, "pending");
      assert.equal(mutationCalls, 2, `current ${originalStatus} edit writes one proposal and one event`);
    }

    for (const proposalId of ["pending", "needs"]) {
      rows[proposalId].status = proposalId === "needs" ? "needs_completion" : "pending";
      mutationCalls = 0;
      await assert.rejects(
        () => dispositionAuditChange(proposalId, { action: "reopen", idempotencyKey: `proof-invalid-reopen-${proposalId}` }),
        /current deferred proposal/,
      );
      assert.equal(mutationCalls, 0);
    }

    rows.deferred.status = "deferred";
    mutationCalls = 0;
    const reopened = await dispositionAuditChange("deferred", { action: "reopen", idempotencyKey: "proof-reopen-current-deferred" });
    assert.equal(reopened.status, "pending");
    assert.equal(mutationCalls, 2);
    console.log("PASS current pending/needs-completion/deferred heads remain editable, while Reopen is limited to current deferred work");
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

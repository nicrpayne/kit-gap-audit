-- Persisted Scope intelligence remains outside canonical Reality until a
-- governed, human-reviewed commit. Existing production rows are untouched.
CREATE TABLE "ScopeProposal" (
  "id" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "contextSnapshotId" TEXT,
  "contractVersion" TEXT NOT NULL DEFAULT '1.0',
  "compilerVersion" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "sourceWatermark" JSONB NOT NULL,
  "summary" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededAt" TIMESTAMP(3),
  CONSTRAINT "ScopeProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScopeProposalItem" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "candidateKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "origins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reconciliationState" TEXT NOT NULL,
  "conflicts" JSONB NOT NULL,
  "releaseSignal" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "confidenceScore" INTEGER NOT NULL,
  "matchState" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetCapabilityId" TEXT,
  "targetRevision" INTEGER,
  "workItemIds" TEXT[],
  "alreadyLinkedItemIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rationale" JSONB NOT NULL,
  "provenance" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'suggested',
  "committedCapabilityId" TEXT,
  "committedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScopeProposalItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScopeProposalEvent" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "selectedItemIds" TEXT[],
  "result" JSONB NOT NULL,
  "actor" TEXT NOT NULL DEFAULT 'operator',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScopeProposalEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScopeProposal_scopeId_fingerprint_key" ON "ScopeProposal"("scopeId", "fingerprint");
CREATE UNIQUE INDEX "ScopeProposal_one_active_per_scope_key" ON "ScopeProposal"("scopeId") WHERE "status" = 'active';
CREATE INDEX "ScopeProposal_scopeId_status_generatedAt_idx" ON "ScopeProposal"("scopeId", "status", "generatedAt");
CREATE UNIQUE INDEX "ScopeProposalItem_proposalId_candidateKey_key" ON "ScopeProposalItem"("proposalId", "candidateKey");
CREATE INDEX "ScopeProposalItem_proposalId_status_idx" ON "ScopeProposalItem"("proposalId", "status");
CREATE INDEX "ScopeProposalItem_targetCapabilityId_idx" ON "ScopeProposalItem"("targetCapabilityId");
CREATE UNIQUE INDEX "ScopeProposalEvent_idempotencyKey_key" ON "ScopeProposalEvent"("idempotencyKey");
CREATE INDEX "ScopeProposalEvent_proposalId_createdAt_idx" ON "ScopeProposalEvent"("proposalId", "createdAt");

ALTER TABLE "ScopeProposal" ADD CONSTRAINT "ScopeProposal_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScopeProposal" ADD CONSTRAINT "ScopeProposal_contextSnapshotId_fkey"
  FOREIGN KEY ("contextSnapshotId") REFERENCES "ContextSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScopeProposalItem" ADD CONSTRAINT "ScopeProposalItem_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "ScopeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScopeProposalItem" ADD CONSTRAINT "ScopeProposalItem_targetCapabilityId_fkey"
  FOREIGN KEY ("targetCapabilityId") REFERENCES "Capability"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScopeProposalItem" ADD CONSTRAINT "ScopeProposalItem_committedCapabilityId_fkey"
  FOREIGN KEY ("committedCapabilityId") REFERENCES "Capability"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScopeProposalEvent" ADD CONSTRAINT "ScopeProposalEvent_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "ScopeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

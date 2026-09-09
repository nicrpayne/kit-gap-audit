-- Audit Daily Refresh + Governed Change Inbox V1
-- Proposal/disposition rows are not canonical project Reality.

ALTER TABLE "BootstrapCompanion"
  ADD COLUMN "knowledgeState" JSONB,
  ADD COLUMN "lastKnowledgeAt" TIMESTAMP(3);

CREATE TABLE "AuditChangeProposal" (
  "id" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "auditRunId" TEXT,
  "contextSnapshotId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "sourceKey" TEXT,
  "supersedesProposalId" TEXT,
  "category" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "changeType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "whyProposed" TEXT NOT NULL,
  "currentState" JSONB NOT NULL,
  "proposedState" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "currentness" TEXT NOT NULL DEFAULT 'unknown',
  "retrievalBasis" TEXT NOT NULL,
  "retrievalConfidence" TEXT NOT NULL DEFAULT 'unknown',
  "forecastEffect" JSONB,
  "relevanceClass" TEXT NOT NULL DEFAULT 'project_local',
  "relevanceReason" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL DEFAULT 'refresh',
  "recommendedAction" TEXT NOT NULL DEFAULT 'review',
  "targetHref" TEXT,
  "completionRequirements" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "dispositionReason" TEXT,
  "canonicalObjectType" TEXT,
  "canonicalObjectId" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuditChangeProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditChangeEvent" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "detail" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditChangeEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectDerivedState" (
  "scopeId" TEXT NOT NULL,
  "realityRevision" INTEGER NOT NULL DEFAULT 0,
  "computedRevision" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'current',
  "consumers" JSONB NOT NULL,
  "readiness" JSONB NOT NULL,
  "invalidatedAt" TIMESTAMP(3),
  "recomputedAt" TIMESTAMP(3),
  "error" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectDerivedState_pkey" PRIMARY KEY ("scopeId")
);

CREATE UNIQUE INDEX "AuditChangeProposal_fingerprint_key" ON "AuditChangeProposal"("fingerprint");
CREATE INDEX "AuditChangeProposal_scopeId_status_category_idx" ON "AuditChangeProposal"("scopeId", "status", "category");
CREATE INDEX "AuditChangeProposal_scopeId_sourceKind_sourceKey_idx" ON "AuditChangeProposal"("scopeId", "sourceKind", "sourceKey");
CREATE INDEX "AuditChangeProposal_contextSnapshotId_createdAt_idx" ON "AuditChangeProposal"("contextSnapshotId", "createdAt");
CREATE INDEX "AuditChangeProposal_auditRunId_idx" ON "AuditChangeProposal"("auditRunId");
CREATE UNIQUE INDEX "AuditChangeEvent_idempotencyKey_key" ON "AuditChangeEvent"("idempotencyKey");
CREATE INDEX "AuditChangeEvent_proposalId_createdAt_idx" ON "AuditChangeEvent"("proposalId", "createdAt");

ALTER TABLE "AuditChangeProposal" ADD CONSTRAINT "AuditChangeProposal_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditChangeProposal" ADD CONSTRAINT "AuditChangeProposal_auditRunId_fkey"
  FOREIGN KEY ("auditRunId") REFERENCES "AuditRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditChangeProposal" ADD CONSTRAINT "AuditChangeProposal_contextSnapshotId_fkey"
  FOREIGN KEY ("contextSnapshotId") REFERENCES "ContextSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditChangeEvent" ADD CONSTRAINT "AuditChangeEvent_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "AuditChangeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectDerivedState" ADD CONSTRAINT "ProjectDerivedState_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

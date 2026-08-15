-- DECISIONS BECOME FIRST-CLASS.
--
-- A Finding is something the audit NOTICED; a Decision is something the
-- project has to DECIDE. They were the same row (Finding.type="decision"),
-- and that overload is what let "this is a decision" silently mean "this
-- delays delivery".
--
-- Purely ADDITIVE. No Finding row is altered or deleted -- legacy decision
-- Findings survive intact for history and rollback. What changes is which
-- table the FORECAST reads gates from, and that switch happens in
-- lib/forecast/build.ts, not here.
--
-- scripts/migrate-decisions.ts performs the data backfill and proves the
-- three live gates survive with identical timing and identical dates.

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "owner" TEXT,
    "rationale" TEXT,
    "neededBy" TIMESTAMP(3),
    "options" JSONB NOT NULL DEFAULT '[]',
    "chosenOption" TEXT,
    "resolution" TEXT,
    "decidedAt" TIMESTAMP(3),
    "dismissReason" TEXT,
    "relatedIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceFindingId" TEXT,
    "sourceClaimKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionGate" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "targetScopeId" TEXT NOT NULL,
    "dependency" TEXT NOT NULL,
    "evidenceForGate" TEXT NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "likely" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "serial" BOOLEAN NOT NULL DEFAULT true,
    "provenance" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionEvidence" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "contextSnapshotId" TEXT,
    "evidenceItemId" TEXT,
    "externalRef" TEXT,
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionCandidate" (
    "id" TEXT NOT NULL,
    "claimKey" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT,
    "sourceLabel" TEXT NOT NULL,
    "contextSnapshotId" TEXT,
    "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excerpts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Decision_sourceFindingId_key" ON "Decision"("sourceFindingId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_sourceClaimKey_key" ON "Decision"("sourceClaimKey");

-- CreateIndex
CREATE INDEX "Decision_scopeId_status_idx" ON "Decision"("scopeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionGate_decisionId_key" ON "DecisionGate"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionGate_targetScopeId_idx" ON "DecisionGate"("targetScopeId");

-- CreateIndex
CREATE INDEX "DecisionEvidence_decisionId_idx" ON "DecisionEvidence"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionCandidate_claimKey_key" ON "DecisionCandidate"("claimKey");

-- CreateIndex
CREATE INDEX "DecisionCandidate_scopeId_status_idx" ON "DecisionCandidate"("scopeId", "status");

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionGate" ADD CONSTRAINT "DecisionGate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionGate" ADD CONSTRAINT "DecisionGate_targetScopeId_fkey" FOREIGN KEY ("targetScopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvidence" ADD CONSTRAINT "DecisionEvidence_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionCandidate" ADD CONSTRAINT "DecisionCandidate_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Project Activation Phase 1 is additive and pre-Reality only.
-- It creates no Scope, ContextSnapshot, Forecast, Decision, dependency,
-- TimelineEvent, Person, Allocation, SourceRegistration, or Report rows.

CREATE TABLE "ProjectBootstrap" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerHint" TEXT,
    "sourceHints" JSONB NOT NULL,
    "searchExistingKnowledge" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "activePackageId" TEXT,
    "reviewRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectBootstrap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BootstrapScanRun" (
    "id" TEXT NOT NULL,
    "bootstrapId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "providerCoverage" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "error" TEXT,
    "resultPackageId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BootstrapScanRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BootstrapPackage" (
    "id" TEXT NOT NULL,
    "bootstrapId" TEXT NOT NULL,
    "scanRunId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "packageVersion" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "compilerVersion" TEXT NOT NULL,
    "packageHash" TEXT NOT NULL,
    "package" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "supersedesPackageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BootstrapPackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BootstrapCandidate" (
    "id" TEXT NOT NULL,
    "bootstrapId" TEXT NOT NULL,
    "packageId" TEXT,
    "candidateKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyProposed" TEXT NOT NULL,
    "matchBasis" TEXT NOT NULL,
    "currentness" TEXT NOT NULL DEFAULT 'unknown',
    "relevance" TEXT NOT NULL DEFAULT 'medium',
    "sourceFingerprint" TEXT NOT NULL,
    "originalProposal" JSONB NOT NULL,
    "reviewedProposal" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dispositionReason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "changedSincePrior" BOOLEAN NOT NULL DEFAULT false,
    "carriedFromCandidateId" TEXT,
    "operatorAssertion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BootstrapCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BootstrapEvidenceLink" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "linkState" TEXT NOT NULL DEFAULT 'attached',
    "attachedBy" TEXT NOT NULL DEFAULT 'compiler',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BootstrapEvidenceLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BootstrapReviewEvent" (
    "id" TEXT NOT NULL,
    "bootstrapId" TEXT NOT NULL,
    "candidateId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BootstrapReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectBootstrap_normalizedName_idx" ON "ProjectBootstrap"("normalizedName");
CREATE INDEX "ProjectBootstrap_status_updatedAt_idx" ON "ProjectBootstrap"("status", "updatedAt");
CREATE UNIQUE INDEX "BootstrapScanRun_bootstrapId_sequence_key" ON "BootstrapScanRun"("bootstrapId", "sequence");
CREATE INDEX "BootstrapScanRun_bootstrapId_createdAt_idx" ON "BootstrapScanRun"("bootstrapId", "createdAt");
CREATE UNIQUE INDEX "BootstrapPackage_scanRunId_key" ON "BootstrapPackage"("scanRunId");
CREATE UNIQUE INDEX "BootstrapPackage_producer_packageId_key" ON "BootstrapPackage"("producer", "packageId");
CREATE INDEX "BootstrapPackage_bootstrapId_createdAt_idx" ON "BootstrapPackage"("bootstrapId", "createdAt");
CREATE UNIQUE INDEX "BootstrapCandidate_packageId_candidateKey_key" ON "BootstrapCandidate"("packageId", "candidateKey");
CREATE INDEX "BootstrapCandidate_bootstrapId_active_kind_status_idx" ON "BootstrapCandidate"("bootstrapId", "active", "kind", "status");
CREATE INDEX "BootstrapCandidate_bootstrapId_candidateKey_createdAt_idx" ON "BootstrapCandidate"("bootstrapId", "candidateKey", "createdAt");
CREATE UNIQUE INDEX "BootstrapEvidenceLink_candidateId_evidenceId_key" ON "BootstrapEvidenceLink"("candidateId", "evidenceId");
CREATE INDEX "BootstrapReviewEvent_bootstrapId_createdAt_idx" ON "BootstrapReviewEvent"("bootstrapId", "createdAt");
CREATE INDEX "BootstrapReviewEvent_candidateId_createdAt_idx" ON "BootstrapReviewEvent"("candidateId", "createdAt");

ALTER TABLE "BootstrapScanRun" ADD CONSTRAINT "BootstrapScanRun_bootstrapId_fkey" FOREIGN KEY ("bootstrapId") REFERENCES "ProjectBootstrap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootstrapPackage" ADD CONSTRAINT "BootstrapPackage_bootstrapId_fkey" FOREIGN KEY ("bootstrapId") REFERENCES "ProjectBootstrap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootstrapPackage" ADD CONSTRAINT "BootstrapPackage_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "BootstrapScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootstrapCandidate" ADD CONSTRAINT "BootstrapCandidate_bootstrapId_fkey" FOREIGN KEY ("bootstrapId") REFERENCES "ProjectBootstrap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootstrapCandidate" ADD CONSTRAINT "BootstrapCandidate_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "BootstrapPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootstrapCandidate" ADD CONSTRAINT "BootstrapCandidate_carriedFromCandidateId_fkey" FOREIGN KEY ("carriedFromCandidateId") REFERENCES "BootstrapCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BootstrapEvidenceLink" ADD CONSTRAINT "BootstrapEvidenceLink_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "BootstrapCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootstrapReviewEvent" ADD CONSTRAINT "BootstrapReviewEvent_bootstrapId_fkey" FOREIGN KEY ("bootstrapId") REFERENCES "ProjectBootstrap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootstrapReviewEvent" ADD CONSTRAINT "BootstrapReviewEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "BootstrapCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

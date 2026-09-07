-- Project Activation Phase 2: the governed boundary from ProjectBootstrap
-- review state into canonical Scope Reality.

ALTER TABLE "Scope"
  ADD COLUMN "executionState" TEXT NOT NULL DEFAULT 'configured',
  ADD COLUMN "executionDetail" TEXT;

ALTER TABLE "Finding" ADD COLUMN "auditRunId" TEXT;
ALTER TABLE "TimelineEvent" ADD COLUMN "semanticState" TEXT NOT NULL DEFAULT 'event';
ALTER TABLE "SourceRegistration"
  ADD COLUMN "sourceCandidateId" TEXT,
  ADD COLUMN "provenance" JSONB;

CREATE TABLE "ScopeAlias" (
  "id" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "provenance" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScopeAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Capability" (
  "id" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "provenance" JSONB NOT NULL,
  "sourceCandidateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CapabilityWorkLink" (
  "id" TEXT NOT NULL,
  "capabilityId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "externalUrl" TEXT,
  "state" TEXT NOT NULL DEFAULT 'configured',
  "provenance" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapabilityWorkLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScopeDependency" (
  "id" TEXT NOT NULL,
  "upstreamScopeId" TEXT NOT NULL,
  "downstreamScopeId" TEXT NOT NULL,
  "basis" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "sourceCandidateId" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" TEXT NOT NULL DEFAULT 'active',
  CONSTRAINT "ScopeDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectActivation" (
  "id" TEXT NOT NULL,
  "bootstrapId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "reviewRevision" INTEGER NOT NULL,
  "manifestVersion" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "contextSnapshotId" TEXT NOT NULL,
  "firstAuditRunId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScopeAlias_scopeId_normalizedAlias_key" ON "ScopeAlias"("scopeId", "normalizedAlias");
CREATE INDEX "ScopeAlias_normalizedAlias_idx" ON "ScopeAlias"("normalizedAlias");
CREATE UNIQUE INDEX "Capability_sourceCandidateId_key" ON "Capability"("sourceCandidateId");
CREATE INDEX "Capability_scopeId_status_idx" ON "Capability"("scopeId", "status");
CREATE UNIQUE INDEX "CapabilityWorkLink_capabilityId_provider_externalId_key" ON "CapabilityWorkLink"("capabilityId", "provider", "externalId");
CREATE INDEX "CapabilityWorkLink_provider_externalId_idx" ON "CapabilityWorkLink"("provider", "externalId");
CREATE UNIQUE INDEX "ScopeDependency_sourceCandidateId_key" ON "ScopeDependency"("sourceCandidateId");
CREATE UNIQUE INDEX "ScopeDependency_upstreamScopeId_downstreamScopeId_key" ON "ScopeDependency"("upstreamScopeId", "downstreamScopeId");
CREATE INDEX "ScopeDependency_downstreamScopeId_state_idx" ON "ScopeDependency"("downstreamScopeId", "state");
CREATE INDEX "Finding_auditRunId_idx" ON "Finding"("auditRunId");
CREATE UNIQUE INDEX "SourceRegistration_sourceCandidateId_key" ON "SourceRegistration"("sourceCandidateId");
CREATE UNIQUE INDEX "ProjectActivation_bootstrapId_key" ON "ProjectActivation"("bootstrapId");
CREATE UNIQUE INDEX "ProjectActivation_scopeId_key" ON "ProjectActivation"("scopeId");
CREATE UNIQUE INDEX "ProjectActivation_contextSnapshotId_key" ON "ProjectActivation"("contextSnapshotId");
CREATE UNIQUE INDEX "ProjectActivation_firstAuditRunId_key" ON "ProjectActivation"("firstAuditRunId");

ALTER TABLE "ScopeAlias" ADD CONSTRAINT "ScopeAlias_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapabilityWorkLink" ADD CONSTRAINT "CapabilityWorkLink_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScopeDependency" ADD CONSTRAINT "ScopeDependency_upstreamScopeId_fkey" FOREIGN KEY ("upstreamScopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScopeDependency" ADD CONSTRAINT "ScopeDependency_downstreamScopeId_fkey" FOREIGN KEY ("downstreamScopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectActivation" ADD CONSTRAINT "ProjectActivation_bootstrapId_fkey" FOREIGN KEY ("bootstrapId") REFERENCES "ProjectBootstrap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectActivation" ADD CONSTRAINT "ProjectActivation_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectActivation" ADD CONSTRAINT "ProjectActivation_contextSnapshotId_fkey" FOREIGN KEY ("contextSnapshotId") REFERENCES "ContextSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectActivation" ADD CONSTRAINT "ProjectActivation_firstAuditRunId_fkey" FOREIGN KEY ("firstAuditRunId") REFERENCES "AuditRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

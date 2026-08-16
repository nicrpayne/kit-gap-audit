-- TIMELINE. Purely additive: two new tables, no column on any existing
-- table is altered, dropped or re-typed. Code that predates this migration
-- never queries either table, so applying it is invisible to a running app.

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "temporalState" TEXT NOT NULL DEFAULT 'occurred',
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceLabel" TEXT,
    "contextSnapshotId" TEXT,
    "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "externalRef" TEXT,
    "sourceClaimKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEventCandidate" (
    "id" TEXT NOT NULL,
    "claimKey" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "kind" TEXT NOT NULL DEFAULT 'event',
    "sourceLabel" TEXT NOT NULL,
    "contextSnapshotId" TEXT,
    "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excerpts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEventCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimelineEvent_sourceClaimKey_key" ON "TimelineEvent"("sourceClaimKey");
CREATE INDEX "TimelineEvent_scopeId_date_idx" ON "TimelineEvent"("scopeId", "date");
CREATE UNIQUE INDEX "TimelineEventCandidate_claimKey_key" ON "TimelineEventCandidate"("claimKey");
CREATE INDEX "TimelineEventCandidate_scopeId_status_idx" ON "TimelineEventCandidate"("scopeId", "status");

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_contextSnapshotId_fkey" FOREIGN KEY ("contextSnapshotId") REFERENCES "ContextSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimelineEventCandidate" ADD CONSTRAINT "TimelineEventCandidate_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

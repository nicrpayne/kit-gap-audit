-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "contextSnapshotId" TEXT,
ADD COLUMN     "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "contextSnapshotId" TEXT;

-- CreateTable
CREATE TABLE "SourceRegistration" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "scopeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "rationale" TEXT,
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "supersededByRegistrationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextSnapshot" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "packageVersion" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "package" JSONB NOT NULL,
    "contextHash" TEXT NOT NULL,
    "completenessSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContextSnapshot_producer_packageId_key" ON "ContextSnapshot"("producer", "packageId");

-- AddForeignKey
ALTER TABLE "SourceRegistration" ADD CONSTRAINT "SourceRegistration_supersededByRegistrationId_fkey" FOREIGN KEY ("supersededByRegistrationId") REFERENCES "SourceRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextSnapshot" ADD CONSTRAINT "ContextSnapshot_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_contextSnapshotId_fkey" FOREIGN KEY ("contextSnapshotId") REFERENCES "ContextSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_contextSnapshotId_fkey" FOREIGN KEY ("contextSnapshotId") REFERENCES "ContextSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

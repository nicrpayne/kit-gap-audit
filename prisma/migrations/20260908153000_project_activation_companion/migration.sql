-- Project Activation operationalization: outbound-only local companion jobs.
-- Additive only. No canonical Scope/Forecast/Decision/Report rows are touched.

CREATE TABLE "BootstrapScanJob" (
    "id" TEXT NOT NULL,
    "bootstrapId" TEXT NOT NULL,
    "scanRunId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stage" TEXT NOT NULL DEFAULT 'waiting_for_companion',
    "expectedPackageVersion" TEXT NOT NULL DEFAULT '1.1',
    "idempotencyKey" TEXT NOT NULL,
    "claimTokenHash" TEXT,
    "claimedBy" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "progress" JSONB NOT NULL,
    "error" TEXT,
    "packageId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BootstrapScanJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BootstrapCompanion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'online',
    "capabilities" JSONB NOT NULL,
    "lastJobId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BootstrapCompanion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BootstrapScanJob_scanRunId_key" ON "BootstrapScanJob"("scanRunId");
CREATE UNIQUE INDEX "BootstrapScanJob_idempotencyKey_key" ON "BootstrapScanJob"("idempotencyKey");
CREATE INDEX "BootstrapScanJob_status_createdAt_idx" ON "BootstrapScanJob"("status", "createdAt");
CREATE INDEX "BootstrapScanJob_bootstrapId_createdAt_idx" ON "BootstrapScanJob"("bootstrapId", "createdAt");
CREATE INDEX "BootstrapScanJob_claimedBy_status_idx" ON "BootstrapScanJob"("claimedBy", "status");
CREATE INDEX "BootstrapCompanion_lastSeenAt_idx" ON "BootstrapCompanion"("lastSeenAt");

ALTER TABLE "BootstrapScanJob" ADD CONSTRAINT "BootstrapScanJob_bootstrapId_fkey" FOREIGN KEY ("bootstrapId") REFERENCES "ProjectBootstrap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BootstrapScanJob" ADD CONSTRAINT "BootstrapScanJob_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "BootstrapScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Immutable, auditable handoffs from frozen Reports snapshots to ChatGPT Sites.
CREATE TABLE "ReportPublication" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "briefSnapshotHash" TEXT NOT NULL,
    "bundleVersion" TEXT NOT NULL,
    "bundleHash" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "destinationType" TEXT NOT NULL DEFAULT 'chatgpt_sites',
    "status" TEXT NOT NULL DEFAULT 'bundle_ready',
    "operator" TEXT NOT NULL DEFAULT 'authenticated_operator',
    "bundleSnapshot" JSONB NOT NULL,
    "excludedMaterial" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handoffOpenedAt" TIMESTAMP(3),
    "draftGeneratedAt" TIMESTAMP(3),
    "previewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "externalArtifactId" TEXT,
    "externalUrl" TEXT,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedState" TEXT NOT NULL DEFAULT 'signal_verified_bundle',

    CONSTRAINT "ReportPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportPublication_bundleHash_key" ON "ReportPublication"("bundleHash");
CREATE INDEX "ReportPublication_reportId_createdAt_idx" ON "ReportPublication"("reportId", "createdAt");

ALTER TABLE "ReportPublication" ADD CONSTRAINT "ReportPublication_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

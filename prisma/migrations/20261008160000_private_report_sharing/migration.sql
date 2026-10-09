-- Additive only: existing reports, source evidence and accepted planning rows
-- are not rewritten. Dropping these tables would revoke reader access, not
-- recover or modify the source reports.
CREATE TABLE "ReportShare" (
  "id" TEXT NOT NULL, "reportId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3), CONSTRAINT "ReportShare_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReportShareRecipient" (
  "id" TEXT NOT NULL, "shareId" TEXT NOT NULL, "email" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportShareRecipient_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReportAccessChallenge" (
  "id" TEXT NOT NULL, "recipientId" TEXT NOT NULL, "generation" INTEGER NOT NULL,
  "codeHash" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3), "consumedAt" TIMESTAMP(3),
  CONSTRAINT "ReportAccessChallenge_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReportReaderSession" (
  "tokenHash" TEXT NOT NULL, "recipientId" TEXT NOT NULL, "generation" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportReaderSession_pkey" PRIMARY KEY ("tokenHash")
);
CREATE TABLE "ReportShareRateLimit" (
  "key" TEXT NOT NULL, "count" INTEGER NOT NULL, "resetsAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportShareRateLimit_pkey" PRIMARY KEY ("key")
);
CREATE TABLE "ReportShareEvent" (
  "id" TEXT NOT NULL, "shareId" TEXT NOT NULL, "action" TEXT NOT NULL, "detail" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportShareEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReportShare_requestId_key" ON "ReportShare"("requestId");
CREATE INDEX "ReportShare_reportId_createdAt_idx" ON "ReportShare"("reportId", "createdAt");
CREATE UNIQUE INDEX "ReportShareRecipient_shareId_email_key" ON "ReportShareRecipient"("shareId", "email");
CREATE INDEX "ReportAccessChallenge_expiresAt_idx" ON "ReportAccessChallenge"("expiresAt");
CREATE INDEX "ReportReaderSession_expiresAt_idx" ON "ReportReaderSession"("expiresAt");
CREATE INDEX "ReportShareEvent_shareId_createdAt_idx" ON "ReportShareEvent"("shareId", "createdAt");
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportShareRecipient" ADD CONSTRAINT "ReportShareRecipient_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "ReportShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportAccessChallenge" ADD CONSTRAINT "ReportAccessChallenge_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ReportShareRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportReaderSession" ADD CONSTRAINT "ReportReaderSession_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ReportShareRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportShareEvent" ADD CONSTRAINT "ReportShareEvent_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "ReportShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetDate" TIMESTAMP(3),
    "likelyDate" TIMESTAMP(3) NOT NULL,
    "earliestDate" TIMESTAMP(3) NOT NULL,
    "latestDate" TIMESTAMP(3) NOT NULL,
    "confidenceAtTarget" INTEGER,
    "likelyDateDeltaDays" INTEGER,
    "shippedCount" INTEGER NOT NULL,
    "blockingCount" INTEGER NOT NULL,
    "resolvedSinceLastCount" INTEGER NOT NULL,
    "summaryMarkdown" TEXT NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

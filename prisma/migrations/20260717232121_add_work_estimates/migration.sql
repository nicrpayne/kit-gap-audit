-- AlterTable
ALTER TABLE "Scope" ADD COLUMN     "estimationContext" TEXT;

-- CreateTable
CREATE TABLE "WorkEstimate" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'linear',
    "externalId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "lowDays" DOUBLE PRECISION NOT NULL,
    "likelyDays" DOUBLE PRECISION NOT NULL,
    "highDays" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "relevance" TEXT NOT NULL DEFAULT 'core',
    "flags" TEXT[],
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkEstimate_scopeId_source_externalId_key" ON "WorkEstimate"("scopeId", "source", "externalId");

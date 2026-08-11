-- DropForeignKey
ALTER TABLE "Finding" DROP CONSTRAINT "Finding_sourceId_fkey";

-- AlterTable
ALTER TABLE "AuditRun" ALTER COLUMN "sourceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Finding" ALTER COLUMN "sourceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

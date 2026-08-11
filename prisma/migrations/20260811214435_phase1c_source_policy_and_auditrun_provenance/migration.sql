-- AlterTable
ALTER TABLE "AuditRun" ADD COLUMN     "contextSnapshotId" TEXT;

-- AddForeignKey
ALTER TABLE "AuditRun" ADD CONSTRAINT "AuditRun_contextSnapshotId_fkey" FOREIGN KEY ("contextSnapshotId") REFERENCES "ContextSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Scope" ADD COLUMN     "dependsOnScopeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

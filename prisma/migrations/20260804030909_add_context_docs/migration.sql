-- CreateTable
CREATE TABLE "ContextDoc" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextDoc_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContextDoc" ADD CONSTRAINT "ContextDoc_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

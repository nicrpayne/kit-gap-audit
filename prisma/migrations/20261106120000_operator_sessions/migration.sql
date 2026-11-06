-- Additive authentication storage. No existing project/report rows change.
CREATE TABLE "OperatorSession" (
    "tokenHash" TEXT NOT NULL,
    "credentialVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "OperatorSession_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "OperatorSession_expiresAt_idx" ON "OperatorSession"("expiresAt");

CREATE TABLE "OperatorLoginRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetsAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperatorLoginRateLimit_pkey" PRIMARY KEY ("key")
);

-- Canonical Scope composition needs an optimistic revision and an append-only
-- owner ledger so multiple browser sessions cannot silently overwrite Reality.
ALTER TABLE "Capability"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CapabilityEvent" (
  "id" TEXT NOT NULL,
  "capabilityId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "beforeState" JSONB,
  "afterState" JSONB NOT NULL,
  "actor" TEXT NOT NULL DEFAULT 'operator',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapabilityEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CapabilityEvent_idempotencyKey_key" ON "CapabilityEvent"("idempotencyKey");
CREATE INDEX "CapabilityEvent_capabilityId_createdAt_idx" ON "CapabilityEvent"("capabilityId", "createdAt");
CREATE INDEX "CapabilityEvent_scopeId_createdAt_idx" ON "CapabilityEvent"("scopeId", "createdAt");

ALTER TABLE "CapabilityEvent"
  ADD CONSTRAINT "CapabilityEvent_capabilityId_fkey"
  FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

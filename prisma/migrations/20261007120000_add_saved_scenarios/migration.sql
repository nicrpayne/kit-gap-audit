-- Named Scenarios are durable hypotheticals, not accepted Scope/Capacity
-- Reality. The fixed app/workspace namespace prevents cross-app collisions;
-- the mutation ledger makes create/update retries safe.
CREATE TABLE "SavedScenario" (
    "id" TEXT NOT NULL,
    "appNamespace" TEXT NOT NULL,
    "workspaceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "baseline" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedScenario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedScenarioMutation" (
    "id" TEXT NOT NULL,
    "appNamespace" TEXT NOT NULL,
    "workspaceKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "resultingRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedScenarioMutation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedScenario_appNamespace_workspaceKey_normalizedName_key"
ON "SavedScenario"("appNamespace", "workspaceKey", "normalizedName");

CREATE INDEX "SavedScenario_appNamespace_workspaceKey_status_updatedAt_idx"
ON "SavedScenario"("appNamespace", "workspaceKey", "status", "updatedAt");

CREATE UNIQUE INDEX "SavedScenarioMutation_appNamespace_workspaceKey_idempotencyKey_key"
ON "SavedScenarioMutation"("appNamespace", "workspaceKey", "idempotencyKey");

CREATE INDEX "SavedScenarioMutation_scenarioId_createdAt_idx"
ON "SavedScenarioMutation"("scenarioId", "createdAt");

ALTER TABLE "SavedScenarioMutation"
ADD CONSTRAINT "SavedScenarioMutation_scenarioId_fkey"
FOREIGN KEY ("scenarioId") REFERENCES "SavedScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

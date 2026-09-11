-- Named capacity is authoritative only after an operator confirms that the
-- roster is complete. The legacy Scope.teamCapacity value is retained in
-- place and copied into this immutable conversion history boundary.
CREATE TABLE "CapacityReconciliation" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aggregate_unreconciled',
    "legacyAggregateFte" DOUBLE PRECISION,
    "legacyForecastFte" DOUBLE PRECISION,
    "legacySource" TEXT NOT NULL,
    "namedRawFte" DOUBLE PRECISION,
    "namedEffectiveFte" DOUBLE PRECISION,
    "completenessConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "provenance" JSONB NOT NULL,
    "history" JSONB NOT NULL,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapacityReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CapacityReconciliation_scopeId_key" ON "CapacityReconciliation"("scopeId");
CREATE INDEX "CapacityReconciliation_status_idx" ON "CapacityReconciliation"("status");

ALTER TABLE "CapacityReconciliation" ADD CONSTRAINT "CapacityReconciliation_scopeId_fkey"
FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing named, non-synthetic allocations retain their prior canonical
-- meaning. Aggregate and synthetic-only scopes remain explicitly unreconciled.
INSERT INTO "CapacityReconciliation" (
  "id", "scopeId", "status", "legacyAggregateFte", "legacyForecastFte",
  "legacySource", "namedRawFte", "namedEffectiveFte",
  "completenessConfirmed", "provenance", "history", "reconciledAt"
)
SELECT
  'capacity-reconciliation-' || s."id",
  s."id",
  CASE WHEN COALESCE(named."rawFte", 0) > 0 THEN 'named_exact' ELSE 'aggregate_unreconciled' END,
  s."teamCapacity",
  s."teamCapacity",
  CASE WHEN s."teamCapacity" IS NULL THEN 'inferred' ELSE 'explicit' END,
  NULLIF(named."rawFte", 0),
  NULL,
  COALESCE(named."rawFte", 0) > 0,
  jsonb_build_object('actor', 'forward_migration', 'reason', 'Existing canonical behavior preserved'),
  jsonb_build_array(jsonb_build_object(
    'at', CURRENT_TIMESTAMP,
    'event', 'reconciliation_initialized',
    'legacyAggregateFte', s."teamCapacity",
    'existingNamedRawFte', COALESCE(named."rawFte", 0)
  )),
  CASE WHEN COALESCE(named."rawFte", 0) > 0 THEN CURRENT_TIMESTAMP ELSE NULL END
FROM "Scope" s
LEFT JOIN (
  SELECT a."scopeId", SUM(p."fte" * a."fraction") AS "rawFte"
  FROM "Allocation" a
  JOIN "Person" p ON p."id" = a."personId"
  WHERE p."active" = true AND p."synthetic" = false AND a."fraction" > 0
  GROUP BY a."scopeId"
) named ON named."scopeId" = s."id";

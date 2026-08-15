-- Scope.capacityResolution: declare how precisely a Scope's team is known,
-- rather than deriving it from "does this Scope have any Allocation row".
--
-- There is one portfolio capacity pool. "team" and "named" are two
-- resolutions of the same fact and are never summed; declaring which one
-- is authoritative is what makes changing it an explicit Reality
-- operation, and what stops removing the last person from silently
-- reinstating a stale aggregate number.
ALTER TABLE "Scope" ADD COLUMN "capacityResolution" TEXT NOT NULL DEFAULT 'team';

-- Backfill to exactly what the old derived rule computed, so no forecast
-- moves on deploy: a Scope was allocations-sourced iff it had at least one
-- Allocation row with a positive fraction held by an ACTIVE person --
-- the same predicate lib/capacity/resolve.ts has always applied.
UPDATE "Scope" s
SET "capacityResolution" = 'named'
WHERE EXISTS (
  SELECT 1
  FROM "Allocation" a
  JOIN "Person" p ON p.id = a."personId"
  WHERE a."scopeId" = s.id
    AND a.fraction > 0
    AND p.active = true
);

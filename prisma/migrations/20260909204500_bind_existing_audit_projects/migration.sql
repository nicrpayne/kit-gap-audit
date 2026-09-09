-- Forward-only operational binding for the two existing production projects
-- that already had accepted Hermes ContextSnapshots before ProjectActivation
-- existed. This creates no Scope, Capability, Decision, DecisionGate,
-- Dependency, Timeline, capacity, target, Report, or Finding row.

WITH eligible AS (
  SELECT
    s.id AS scope_id,
    s.name AS scope_name,
    CASE s.id
      WHEN 'cmrpatpkv0000ov1ylif2k088' THEN 'audit-refresh-jsa-bootstrap-v1'
      WHEN 'cmsnchj1g0001pl1y7odyjqsc' THEN 'audit-refresh-itrack-bootstrap-v1'
    END AS bootstrap_id
  FROM "Scope" s
  WHERE s.id IN ('cmrpatpkv0000ov1ylif2k088', 'cmsnchj1g0001pl1y7odyjqsc')
    AND NOT EXISTS (SELECT 1 FROM "ProjectActivation" a WHERE a."scopeId" = s.id)
    AND EXISTS (
      SELECT 1
      FROM "ContextSnapshot" cs
      JOIN "AuditRun" ar ON ar."contextSnapshotId" = cs.id
      WHERE cs."scopeId" = s.id
    )
)
INSERT INTO "ProjectBootstrap" (
  id, "canonicalName", "normalizedName", aliases, "sourceHints",
  "searchExistingKnowledge", status, "reviewRevision", "createdAt", "updatedAt"
)
SELECT
  bootstrap_id, scope_name, lower(scope_name), ARRAY[scope_name]::text[],
  '["Hermes current state"]'::jsonb, true, 'activated', 1, now(), now()
FROM eligible
ON CONFLICT (id) DO NOTHING;

WITH eligible AS (
  SELECT
    s.id AS scope_id,
    CASE s.id
      WHEN 'cmrpatpkv0000ov1ylif2k088' THEN 'audit-refresh-jsa-bootstrap-v1'
      WHEN 'cmsnchj1g0001pl1y7odyjqsc' THEN 'audit-refresh-itrack-bootstrap-v1'
    END AS bootstrap_id,
    CASE s.id
      WHEN 'cmrpatpkv0000ov1ylif2k088' THEN 'audit-refresh-jsa-activation-v1'
      WHEN 'cmsnchj1g0001pl1y7odyjqsc' THEN 'audit-refresh-itrack-activation-v1'
    END AS activation_id
  FROM "Scope" s
  WHERE s.id IN ('cmrpatpkv0000ov1ylif2k088', 'cmsnchj1g0001pl1y7odyjqsc')
    AND NOT EXISTS (SELECT 1 FROM "ProjectActivation" a WHERE a."scopeId" = s.id)
), receipts AS (
  SELECT DISTINCT ON (cs."scopeId")
    cs."scopeId" AS scope_id,
    cs.id AS snapshot_id,
    ar.id AS audit_id
  FROM "ContextSnapshot" cs
  JOIN "AuditRun" ar ON ar."contextSnapshotId" = cs.id
  WHERE cs."scopeId" IN ('cmrpatpkv0000ov1ylif2k088', 'cmsnchj1g0001pl1y7odyjqsc')
  ORDER BY cs."scopeId", cs."createdAt" DESC, ar."createdAt" DESC
)
INSERT INTO "ProjectActivation" (
  id, "bootstrapId", "scopeId", "reviewRevision", "manifestVersion",
  manifest, "contextSnapshotId", "firstAuditRunId", "createdAt"
)
SELECT
  e.activation_id, e.bootstrap_id, e.scope_id, 1, '1.0',
  '{"kind":"existing-project-companion-binding","canonicalWrites":0,"acceptedSnapshotPreserved":true}'::jsonb,
  r.snapshot_id, r.audit_id, now()
FROM eligible e
JOIN receipts r ON r.scope_id = e.scope_id
JOIN "ProjectBootstrap" b ON b.id = e.bootstrap_id
ON CONFLICT DO NOTHING;

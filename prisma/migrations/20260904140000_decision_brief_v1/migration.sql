-- Preserve every historical Report exactly as written. Existing rows remain
-- NULL in these columns and continue through the legacy renderer.
ALTER TABLE "Report"
  ADD COLUMN "briefVersion" TEXT,
  ADD COLUMN "briefSnapshot" JSONB,
  ADD COLUMN "mode" TEXT,
  ADD COLUMN "scenarioSnapshot" JSONB;

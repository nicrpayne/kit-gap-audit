-- Audience/purpose presentation is saved beside the immutable DecisionBriefV1.
-- Existing Reports remain valid with null presentation fields.
ALTER TABLE "Report"
  ADD COLUMN "recipeVersion" TEXT,
  ADD COLUMN "briefRecipe" JSONB,
  ADD COLUMN "presentationVersion" TEXT;

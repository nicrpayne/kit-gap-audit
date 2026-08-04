-- Scope.projectName (single, exact-match) -> Scope.projectNames (array,
-- union match). A Scope now pulls issues from any number of Linear
-- projects -- e.g. a product Scope covering its own project plus shared
-- Platform work -- instead of exactly one.

ALTER TABLE "Scope" ADD COLUMN "projectNames" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "Scope"
SET "projectNames" = ARRAY["projectName"]
WHERE "projectName" IS NOT NULL;

ALTER TABLE "Scope" DROP COLUMN "projectName";

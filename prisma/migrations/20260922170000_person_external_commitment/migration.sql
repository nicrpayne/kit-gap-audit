-- Preserve a person's full embodied capacity while distinguishing time that
-- is already committed to work outside Signal's currently tracked Scopes.
ALTER TABLE "Person"
ADD COLUMN "externalCommitmentFte" DOUBLE PRECISION NOT NULL DEFAULT 0;

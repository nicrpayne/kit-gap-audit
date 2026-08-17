-- A SUGGESTED END FOR A CANDIDATE ACTIVITY.
--
-- Timeline already models a suggested START (`date`), nullable because most
-- candidates arrive without one and Timeline refuses to infer a date from
-- prose. A suggested duration is the same kind of fact and gets the same
-- treatment: present only when structured evidence metadata stated an end,
-- absent otherwise. Nullable and additive; every existing row keeps its
-- current meaning (a moment).
ALTER TABLE "TimelineEventCandidate" ADD COLUMN "endDate" TIMESTAMP(3);

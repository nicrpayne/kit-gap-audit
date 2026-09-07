# Idempotence

`ProjectActivation.bootstrapId` is unique, and every candidate-backed canonical row uses a unique `sourceCandidateId` where applicable. A retry at the same review revision returns the original Scope, snapshot, and Audit. A retry at a different revision returns conflict.

Serializable conflicts and unique-key races are retried/reconciled up to three attempts. The database proof covers sequential response-loss retry and two simultaneous activation calls; both resolve to one Scope and one ProjectActivation. The forced invalid-milestone case verifies exact before/after counts and zero partial writes.

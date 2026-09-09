# Acceptance and Idempotence

An acceptance request carries an operator-generated idempotency key. The transaction:

1. loads and locks the semantic proposal through serializable isolation;
2. validates evidence and all owner-required fields;
3. returns the existing receipt if the proposal is already accepted;
4. writes the owner object using proposal-backed unique source identity;
5. stores before/after state and canonical object identity on the proposal;
6. appends an acceptance event;
7. increments the project Reality revision and marks derived consumers stale.

Validation occurs before mutation. A missing dependency endpoint, unsupported action, missing evidence, or unconfirmed proposal exits without partial owner state. Transaction serialization conflicts are retried with a bounded retry; a repeated click converges on the same canonical object.

After commit, derived recomputation runs from accepted Reality. If an external execution source prevents Forecast computation, the acceptance remains valid and the durable derived state records the explicit error/stale condition for readiness. Audit never conceals that state.

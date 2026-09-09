# Change Contract

`AuditChangeProposal` is a governed-delta ledger, not a second owner of Reality.

Each proposal records:

- Scope, source Audit, and external ContextSnapshot
- stable source key plus semantic fingerprint; a changed version supersedes its prior card while an unchanged version keeps its governed disposition
- category, change type, target owner, and owner handoff URL
- current accepted state and proposed state
- why it was proposed
- exact evidence/provenance
- currentness, retrieval basis, and retrieval confidence
- project relevance class and reason
- deterministic Forecast effect only when known
- recommended action, completion requirements, and current status
- canonical object receipt, before/after state, and accepted time after acceptance

Statuses are `pending`, `needs_completion`, `deferred`, `rejected`, `information_only`, and `accepted`. Every edit or disposition creates an append-only `AuditChangeEvent` with its own idempotency key.

The inbox suppresses raw source-inventory rows. If a refresh contains new knowledge but no governed semantic change, it creates one information-only receipt rather than a false change list.

Related concepts are not multiplied by default. A refresh proposal maps to one owner category. Converting a Finding into a Decision or Scope object is an explicit owner action, and the Finding can then be resolved through its own proposal.

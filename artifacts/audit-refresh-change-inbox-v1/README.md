# Audit Daily Refresh + Change Inbox V1

Audit is now the daily orchestration surface for an active project. It checks external-knowledge freshness, waits while ingestion is incomplete, requests the latest complete package, freezes a new ContextSnapshot, runs the existing refresh Audit, and places meaningful deltas in a governed inbox. None of those steps writes canonical Reality.

The first durable inbox is seeded from the already completed September 9 JSA/iTrack reconciliation. The seed is keyed to the verified snapshot and Hermes package identities, so it neither reruns the 40-transcript analysis nor creates records against an unverified package.

Accepted deltas cross a transaction boundary into the owning instrument. Audit retains the proposal, provenance, operator disposition, before/after state, canonical object receipt, and acceptance time. Derived reads are invalidated in that same transaction and Forecast is eagerly recomputed afterward.

## Product law

> Audit discovers and proposes. Owner instruments own accepted Reality. Forecast, Timeline, Control Room, and Reports derive consequences automatically.

The Rubric/Audit World implementation and geometry are unchanged. The freshness status and Change Inbox are widgets around the world.

## Review map

- `DAILY-FLOW.md`: operator workflow and trigger boundaries
- `FRESHNESS-CONTRACT.md`: complete-package freshness state machine
- `CHANGE-CONTRACT.md`: proposal and disposition shape
- `OWNER-ROUTING.md`: canonical owner mutations
- `ACCEPTANCE-IDEMPOTENCE.md`: atomicity and retry behavior
- `PROJECT-RELEVANCE.md`: project-local and cross-project filtering
- `REPORT-READINESS.md`: machine-readable blockers
- `JSA-ITRACK-BASELINE.md`: seeded reconciliation set
- `TEST-MATRIX.md`: requested scenarios and regression evidence
- `measurements.json`: machine-readable implementation and verification census

No production deployment was performed.

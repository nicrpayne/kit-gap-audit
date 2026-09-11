# Signal Operator Cleanup V1

Production authority was verified before branching:

- deployment commit: `3e315120c45a021b602d6f2fafbd9c860a15406d`
- deployment tree: `2b003fba5324baf8ea6a8598d56d45ef5ea0d907`
- source: fetched `origin` plus the public production `/api/version` contract
- branch: `codex/signal-operator-cleanup-v1`
- deployment: intentionally not performed

## Audit

The normal action is now stateful knowledge refresh rather than pasted evidence intake. Audit shows `Check for updates`, `Refresh Audit`, `Ingestion in progress`, `Companion offline`, or `Refreshing Audit…` from the existing activation/companion state. Refresh uses the existing companion job, completed package, external `ContextSnapshot`, and governed change-inbox path. The existing 15-minute receipt-time guard remains authoritative. Refresh does not accept proposals or mutate canonical product Reality.

Direct `POST /api/audit` evidence ingestion now fails closed with `UPSTREAM_KNOWLEDGE_INTAKE_REQUIRED`. `Add evidence to knowledge system` explains the approved KE/Wiki Update path and states that a safe Signal-to-KE handoff does not exist yet. No unattended wiki mutation was invented.

## Named Capacity

`Set actual team` is a portfolio-wide complete-roster editor. It supports named people, available FTE, split project allocations, free capacity, raw/effective readings, context-switch effects, removal impact confirmation, duplicate identity rejection, and a final legacy-versus-named reconciliation summary.

Canonical transition states are `aggregate_unreconciled`, `named_partial` (local draft/scenario only), and `named_exact`. Only a complete, explicitly confirmed roster can write `named_exact`. Legacy Scope aggregate and Forecast bases are retained in `CapacityReconciliation` provenance/history. Existing non-synthetic allocation-sourced scopes retain their prior canonical status during migration; aggregate and synthetic-only scopes do not cross the boundary.

Scenario faders remain free to explore aggregate scopes. Commit routes to `Set actual team` until every affected Scope has a complete roster receipt. After reconciliation, commits conserve each person's FTE, update named raw/effective receipts, are idempotent when unchanged, and invalidate/recompute all derived consumers.

## Scope product shape

Scope now renders canonical Capability rows independently from Linear work. The bounded representation has four answers: accepted product shape, out-of-release/excluded/deferred shape, open shape Decisions, and execution work. Each accepted Capability gets an explicit execution state. An open Decision stays a linked open question, and a Finding is never projected into Scope merely because it exists.

The production-seeded reconciliation contract proves that accepted Scope cards route through `upsert_capability`; milestones route to Timeline; Cam/Colton routes to one open Decision; and source-health cards cannot cross into product truth. The protected production data endpoints require an authenticated operator session, which was not available to this isolated review run, so no claim is made about which cards Nic has accepted since the verified 30-card baseline. The new empty-Scope copy identifies the exact live case directly: zero accepted Capability rows versus accepted shape with zero execution coverage.

## Screenshots

1. `screenshots/01-audit-current.jpg`
2. `screenshots/02-audit-new-intelligence.jpg`
3. `screenshots/03-audit-secondary-menu.jpg`
4. `screenshots/04-evidence-upstream.jpg`
5. `screenshots/05-aggregate-capacity-warning.jpg`
6. `screenshots/06-set-actual-team-editor.jpg`
7. `screenshots/07-roster-split-allocations.jpg`
8. `screenshots/08-roster-reconciliation-summary.jpg`
9. `screenshots/09-named-exact-capacity.jpg`
10. `screenshots/10-scenario-after-named-roster.jpg`
11. `screenshots/11-scope-product-shape-zero-execution.jpg`


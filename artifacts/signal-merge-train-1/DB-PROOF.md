# Disposable PostgreSQL proof

## Isolation

- Engine: PostgreSQL 16 Alpine in Docker
- Container: `signal-merge-train-1-db-20260904`
- Bind: ephemeral port on `127.0.0.1` only
- Database: `signal_merge_train_1`
- Production connection or write: none
- Final state: container stopped with `--rm` behavior and verified absent

## Schema

All 20 repository migrations applied successfully, including:

- `20260904140000_decision_brief_v1`
- `20260904170000_report_composer_recipe_v1`

The database was seeded with the local development portfolio and Audit fixture. The exact bridge-produced JSA package was then persisted for the graph/zoom proofs and its mirror Scope, registrations and snapshot were removed afterward.

## Results

- Reports composer persistence proof: immutable snapshot + recipe + presentation version + exact Markdown — PASS.
- Reports API boundary: Scenario generation refused without a canonical Scenario read model; Reality report generated; JSON/typed columns/Markdown reconciled; upstream Decision mutation did not alter saved data; history and print read the saved snapshot — PASS.
- Audit model/review lifecycle — PASS.
- Audit interaction, semantic zoom and graph proofs against the exact bridge package — PASS.
- Audit HTTP ingest: exact package accepted and stored; retry idempotent; false trust rejected; ingest-only path 200 with no Audit/Forecast/Report/model call and no Reality mutation — PASS.

Before destruction the database contained only the expected local baseline after proof cleanup: 4 Scopes, 9 Findings, 24 seeded historical Reports, 1 ContextSnapshot and 1 Decision. The disposable container was then destroyed and verified absent.

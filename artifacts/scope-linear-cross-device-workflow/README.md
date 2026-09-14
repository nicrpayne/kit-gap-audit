# Scope + Linear cross-device workflow

This tranche replaces browser-owned accepted Scope composition with governed PostgreSQL owner rows, adds explicit Capability ↔ Linear work linking, and makes the existing Scope Composer directly operable without turning it into a Kanban board.

## Outcome

- Accepted Capability create/edit/release-state/link/unlink operations are server Reality.
- Each write is idempotent, revision-checked, append-only in owner history, and followed by deterministic downstream invalidation/recomputation.
- Two isolated browser contexts over one disposable PostgreSQL database passed add, edit, link, release-state, Scenario isolation/commit, and Back/Forward freshness checks.
- The Forecast models only work explicitly linked to accepted capabilities once governed shape exists. An out-of-release capability removes its linked work from the active model. A legacy scope with no governed capabilities retains its prior all-Linear behavior.
- Missing estimates remain explicit placeholder estimates; they never become zero duration.
- No production write or deployment was performed.

## Important live-data limitation

The Linear connector returned `UNAUTHORIZED / oauth_token_invalid_grant` for every read-only query. Production `/api/debug/linear` also requires an authenticated Signal session that was not available. Therefore the requested current JSA issue census is recorded as blocked, not guessed. Repository evidence proves that `KIT Safety (JSA and iTrack)` is a stale historical project name and that the intended current JSA project is `KIT JSA`; only authenticated production reads can prove which value the production Scope row currently stores and enumerate Nic's Friday tickets.

## Evidence index

- [Root causes](ROOT-CAUSE-LEDGER.md)
- [State and cross-device contract](CROSS-DEVICE-CONTRACT.md)
- [Linear forensics](LINEAR-FORENSICS.md)
- [Live issue census status](LINEAR-ISSUE-CENSUS.json)
- [Authoring](SCOPE-AUTHORING.md)
- [Drag/drop](DRAG-DROP-CONTRACT.md)
- [Work mapping](WORK-MAPPING.md)
- [Forecast consequences](FORECAST-CONSEQUENCES.md)
- [Source-of-truth contract](SOURCE-OF-TRUTH.md)
- [Test matrix](TEST-MATRIX.md)
- [Measurements](measurements.json)
- [Browser proof](screenshots/browser-proof.json)

The screenshots are a deterministic production-shaped fixture, not a prediction of the real JSA delivery date.

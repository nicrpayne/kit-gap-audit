# Phase 3A — Rubric world reintegrated as Signal Audit

Starting SHA: `223010fbf6c6e4b4dd05969d53d9a00d3cf5f6cf`

## Browser evidence

All world screenshots use the redacted deterministic production-shaped JSA mirror. That keeps browser verification read-only while exercising the same 438-canonical-object adapter shape used by the captured production graph.

1. `01-audit-route-world.png` — `/audit` with one thin Signal/Audit frame and the Rubric world occupying all remaining viewport.
2. `02-primary-popup.png` — Rubric selected-item card with Signal identity, trust/currentness, canonical connections, `View here`, `Fly to`, `Copy reference`, safe hide, and Trace.
3. `03-view-here-drawer.png` — deeper Signal detail using Rubric's viewer as an overlay; the world remains mounted behind it.
4. `04-project-overview-overlay.png` — Project Overview over the world rather than consuming permanent graph width.
5. `05-search-overlay.png` — Rubric search/control surface backed by Signal MiniSearch.
6. `06-trace.png` — canonical provenance path revealed through Rubric focus/fog/camera behavior.
7. `07-run-audit-overlay.png` — existing Audit ingestion entry point presented over the world; it states that Findings enter review and Reality does not change automatically. The local server intentionally had no `DATABASE_URL`, so the form was not submitted.

The fresh integrated fixture load produced no browser warnings or errors. Search selected `finding:mirror:002` through the canonical result bridge. Trace then displayed `Canonical provenance path`. Closing the deeper viewer preserved both the selected canonical object and camera. Opening and closing Project Overview also left the camera unchanged.

## Automated checks

- production build: passed
- TypeScript: passed
- targeted ESLint: passed
- host JavaScript syntax: passed
- Phase 3A integration proof: passed
- Phase 3 protected structural/spatial law proof: passed for the deterministic JSA fixture, redacted production-shaped mirror, and read-only current production capture

The protected-law proof reconciles 438 canonical nodes for the production-shaped/current capture, reports no duplicate or missing canonical census, preserves canonical relationship endpoints, verifies exact passage-to-provider parenting, and confirms that the adapter emits no geometry.

## Chassis integrity

The accepted Phase 1 Rubric files remain byte-identical to the supplied reference:

| File | SHA-256 |
| --- | --- |
| `_core.js` | `efa2678c8c62fe2b85fec8826d7778c6dcecb23543f5426501488ba967caa213` |
| `_flows2.js` | `2fb3e9937a141df8ec9233c851426f845718216c54fb6336752291b539b07496` |
| `_core.css` | `51797b9f261c03255db8cc660897812f1106d16e4ca1eacaeb7f94de7bc7a06a` |
| `_icons.js` | `59dfd3e24f8cf7504c05609eb0063c22898950c33f45facea13b92c2b173f48a` |

## Honest limitations

- The local development process had no database connection, so Phase 3A browser testing used the production-shaped fixture and did not submit a new Audit. The normal `/audit` path is live by default; fixture mode is opt-in.
- Audit-history selection is a source/Finding lens over the current canonical project frame, not a fabricated historical Reality snapshot.
- Provider-wide automated Hermes refresh remains the existing Phase 3 follow-up. Phase 3A uses Signal's current `/api/audit` ingestion pipeline and refreshes the mounted Rubric projection after it succeeds.


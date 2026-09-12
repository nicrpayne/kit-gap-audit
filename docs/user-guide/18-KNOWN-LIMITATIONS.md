# Known Limitations — Production `6c46ce9`

These are current production boundaries, not roadmap promises.

1. **Authenticated visual verification is tool-blocked during this documentation pass.** The production tab remains open, but the browser policy verifier denied programmatic page inspection. `/api/version`, the Git tree, current production code, and release evidence are verified; screenshot provenance records this limitation. Re-run the live visual checklist before recording.
2. **Project Activation depends on a local companion/bridge.** Railway cannot read the local knowledge corpus. The companion must be online and associated with the project identity.
3. **The bridge distribution path is not fully governed in the checked-in release record.** The verified bridge commit was local and lacked an off-machine Git remote/tag/install-and-rollback channel at the time of that record.
4. **Semantic retrieval may be unavailable.** Activation reports the configured retrieval modes; lexical/identity/lineage search can still work. Do not label semantic search as live unless the provider says it is.
5. **Forecast coverage is all-or-caveated.** Accepted capabilities without current active execution mapping, open product-shape Decisions, stale/empty execution, or an incompletely covered dependency closure make the date a modeled subset or unavailable.
6. **Decision gates are strictly serial.** Multiple gates add. The engine does not model gates resolving concurrently or blocking only part of a Scope.
7. **Person-to-work assignment is not grounded.** Named allocations say who is allocated to a project, not which capability or ticket a person is working on.
8. **Context-switch cost is a shared portfolio assumption.** Effective FTE is a model input, not a measurement of productivity.
9. **Dependency semantics and visualization are still narrower than the knowledge graph.** Only declared Scope dependencies belong in delivery topology. Related or inferred edges stay outside Reality.
10. **Timeline can edit only Timeline-owned events.** Forecast marks, Decisions, Reports, and external execution items are read-only marks from their owners.
11. **Historical Reports are immutable.** They can become stale relative to live Forecast. The app discloses the delta; it does not update the snapshot.
12. **Interactive Site creation is a user-mediated handoff.** Signal prepares the governed bundle. It does not autonomously publish or keep a Site synchronized.
13. **Dense instruments require a wide viewport.** Below 1024 px, the app intentionally refuses to show a clipped control surface. Audit, Reports, and Settings remain the recommended narrow-screen surfaces.
14. **`/orbit` status is internally inconsistent in source commentary.** The route comment calls it development-only and absent from destinations, while the production destination list includes Dependencies at `/orbit`. Treat the live rail as authority and verify before recording.
15. **No Human Release History instrument is present.** Timeline and immutable Reports provide history, but the named standalone capability is not represented as live.

When a limitation is retired, update this file, `SOURCE-STATE.md`, the relevant guide, screenshots, scripts, and coverage matrix in the same release documentation change.


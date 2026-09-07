# Project Activation Phase 1

Production base: `bce38dde332fa1d049363fe502c5921326556311`

Implementation boundary: `+ Add project → pre-Reality identity → persisted scan → immutable bootstrap package → governed three-pane review`.

Phase 1 deliberately contains no activation writer. The lifecycle shows Activate and Audit disabled so the future path is legible without implying it exists.

## Shipped surface

- `+ Project` in the global instrument rail and `+ Add project` in `⌘K` open the same compact sheet.
- Identity fields are canonical name, aliases, optional owner/source hints, and knowledge-search mode.
- Scan runs are stage-persisted and scheduled after the route returns `202`; polling survives reload.
- Exact identity plus existing MiniSearch token/prefix/fuzzy rules search Signal-held Sources, ContextDocs, and ContextSnapshot packages.
- Stored current structured intelligence and evidence/source lineage are projected when available.
- Semantic/vector retrieval is explicitly unavailable. Linear, Notion, Figma, live wiki, and live Hermes are never fabricated as checked.
- Typed deterministic compilers support sources, people mentions, explicit capability concepts, Decisions without gates, causally structured dependencies, dated commitments as milestone candidates, risks, unknowns, and information gaps.
- Accept, edit, defer, reject, information-only, evidence attach/detach, and manual bootstrap-only assertions persist only inside ProjectBootstrap state.
- Merge is visible but disabled until activation reconciliation can preserve canonical ancestry correctly.
- Rescan fingerprints include typed payload plus independent raw lineage roots; reviewed state is recovered from matching history even after a candidate temporarily disappears.

## Artifact index

- [DATA-MODEL.md](./DATA-MODEL.md)
- [SCAN-CONTRACT.md](./SCAN-CONTRACT.md)
- [CANDIDATE-CONTRACT.md](./CANDIDATE-CONTRACT.md)
- [PROVENANCE.md](./PROVENANCE.md)
- [RESCAN-LAW.md](./RESCAN-LAW.md)
- [PHASE2-HANDOFF.md](./PHASE2-HANDOFF.md)
- [TEST-MATRIX.md](./TEST-MATRIX.md)
- [measurements.json](./measurements.json)
- [screenshots/](./screenshots/)

## Non-Reality proof

`scripts/project-activation-phase1-db-proof.ts` captures protected-table counts, creates/scans/reviews/reloads/rescans a bootstrap, exercises `accepted → absent → returned`, and asserts every protected count is unchanged. The Phase 1 schema gives ProjectBootstrap no Scope relation and implements no canonical writer.

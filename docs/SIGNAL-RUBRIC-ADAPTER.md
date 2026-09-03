# Signal → Rubric adapter contract

Phase 2 treats the transplanted Rubric browser runtime as the Audit viewport
chassis. `SignalRubricAdapter` is the only semantic boundary between the
canonical, read-only Signal Audit graph and Rubric's graph payload.

## Rubric input boundary

The runtime reads:

- `meta`: counts and optional adapter metadata.
- `departments[]`: `{ key, label, color, icon }` territory definitions.
- `layers[]`: `{ key, label, color, shape, blurb }` for Rubric's four
  structural roles. Phase 2 supplies Signal-facing labels.
- `nodes[]`: a stable `id`, Rubric structural `type`, structural `layer`,
  visible `label`, territory `dept`, and optional detail/action metadata.
- `links[]`: `{ s, t, k, w? }`. Structural route/spoke links coexist with
  canonical Signal relationships.
- `mdLinks[]`: optional pairs used by Rubric's note-link aggregation. Phase 2
  leaves this empty and keeps typed canonical relations in `links`.

Search expects `{ results: [{ path, name, type, layer, dept }] }`. Expansion
expects `{ nodes }`. Detail expects `{ content }` and open expects `{ ok,
error? }`.

Rubric itself owns all coordinates, ring/sector geometry, forces, layouts,
camera transforms, hit testing, drag/pan/zoom, morphs, fog, labels, and popup
placement. The adapter contract contains no `x`, `y`, target, radius, angle,
velocity, force, camera, or physics field.

## Identity law

Every canonical Signal object carries `canonicalId` and `canonicalRef`.
Canonical objects use their canonical graph ID as the Rubric `id`, except
Reality: the unmodified Rubric runtime looks up the router by the literal
transport ID `CLAUDE.md`, so the Reality projection uses that transport ID
and retains canonical `reality` as `canonicalId`. This compatibility alias is
the only canonical-ID exception and is checked explicitly.

Presentation-only nodes use reserved `signal:*` IDs, set
`presentationOnly: true`, and carry `memberIds` when they summarize or echo
canonical objects. They never enter canonical counts.

## Structural role mapping

| Rubric mechanic | Signal meaning |
| --- | --- |
| router | Reality |
| Skills (`S`) | Project Model: Scope, supplied lanes, Requirements, accepted Decisions |
| Memory (`M`) | Project World: canonical Findings, evidence, external intelligence, Decisions, Dependencies, Work, People |
| department hubs | Delivery, Evidence, External Intelligence, Decisions, Dependencies, Capacity |
| Routines (`R`) | presentation-only Attention echoes for unresolved Findings/open Decisions/gates/current external Risks and Unknowns |
| Applications (`A`) | presentation-only Source System anchors |

Source artifacts and passages remain canonical Project World objects. A
presentation-only Source System anchor is emitted only when the graph contains
evidence of that provider (including a supplied source lane). Real canonical
relations remain typed and preserve `basis`, `rule`, external relation name,
and currentness in adapter metadata.

## Actions and disclosure

The Audit-local host translates the existing Rubric popup actions. Detail
opens in Rubric's viewer; fly-to stays Rubric-native; copy returns canonical
identity; source opening is offered only for a resolvable HTTP(S) reference;
hide affects only the current presentation session. Connection rows are
rebuilt from canonical relations, never structural spokes.

Signal Search continues to use the existing `SignalSearchIndex` (MiniSearch)
and returns canonical hits translated to their Rubric transport IDs. Trace is
an Audit-local overlay drawn from canonical supported provenance paths using
Rubric's live node positions. It does not alter target generation or physics.

Phase 2 carries disagreement as semantic metadata only. Phase 3 consumes the
same presentation-only value through the guarded extension documented in
`SIGNAL-RUBRIC-PHASE3.md`; the adapter still emits no spatial fields.

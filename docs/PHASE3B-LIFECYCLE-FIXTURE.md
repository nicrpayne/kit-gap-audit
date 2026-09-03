# Phase 3B production-shaped lifecycle fixture

The final model-backed lifecycle test must start from the same realistic JSA
population used for Phase 3 visual acceptance. It must not place the captured
Rubric JSON in front of a smaller database.

`scripts/seed-phase3b-production-capture.ts` reconstructs the read-only local
capture through Signal's persistence and graph contracts:

1. First-class Prisma records are created in the guarded disposable database.
2. The two captured, immutable Project Context Packages are validated and
   stored as `ContextSnapshot` records.
3. `loadAuditGraphInputs` reads the disposable database.
4. `buildAuditGraph` derives the canonical graph.
5. The seed requires exact 438-node and 543-edge counts, then compares hashes
   of every canonical node identity and canonical relationship signature with
   the read-only capture.
6. Only after those checks pass is the canonical graph passed to
   `SignalRubricAdapter`.

The raw production capture is intentionally gitignored. The seed contains no
captured IDs, prose, passages, claims, or credentials.

## Canonical census and ownership

| Owner / source | Canonical nodes | Composition |
| --- | ---: | --- |
| First-class database records | 42 | selected Scope 1, upstream dependency Scope 1, Source 1, Findings 37, Decision 1, DecisionGate 1 |
| ContextSnapshot projections | 373 | package sources/artifacts 47, passages 164, intelligence aggregate 1, external-intelligence objects 161 |
| Signal truth derivation | 23 | Reality 1, semantic lanes 8, checkpoints 14 |
| Total canonical world | 438 | exact capture identity set |

The database also contains two immutable `ContextSnapshot` wrapper records,
two `SourceRegistration` policy records, and two historical `AuditRun` context
records. One auxiliary Scope exists only to satisfy the captured
`DecisionGate.targetScopeId` foreign key and is not in the JSA canonical graph.

The capture contains no canonical Work, Person, or Requirement nodes. Linear,
Notion, and Figma are truthfully represented by unsupplied lane/checkpoint
nodes. Capacity comes from `Scope.teamCapacity`. No absent category is invented
to make the visual population look fuller.

## Adapter-only presentation nodes

The adapter supplements the 438 canonical nodes with 75 presentation-only
nodes:

- 6 large source-system anchors
- 6 semantic/provenance territory hubs
- 3 layer hubs
- 60 Attention echoes that retain their canonical member IDs

These nodes do not replace canonical objects. The resulting Rubric payload has
513 visual nodes and reports `hiddenCount: 0`.

## Safety boundary

The seed refuses to run unless all of the following are true:

- `DATABASE_URL` names `signal_audit_p3b` on localhost port 55432
- `KIT_DEV_FIXTURES=1`
- the database is empty
- both gitignored read-only capture files exist

It never reads production services, never supplies an Anthropic credential,
and never runs Audit. The lifecycle helper prompts for the credential only
after this reconstruction and reconciliation have succeeded.

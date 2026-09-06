# Proposed Dependencies

## Four different relationships

| Relationship | Owner | Meaning | Forecast effect |
| --- | --- | --- | --- |
| Declared canonical dependency | `ScopeDependency` | downstream project cannot finish ahead of prerequisite project/external deliverable | Existing portfolio dependency-floor logic, after migration parity |
| Candidate/inferred dependency | bootstrap candidate ledger | knowledge suggests a prerequisite relationship that needs review | None |
| DecisionGate serial constraint | `DecisionGate` | accepted Decision physically pauses target Scope for a stated serial delay | Serial gate sampling only |
| Temporal sequence/milestone relationship | Timeline projection/relation | B is planned after A or events occurred in order | None by itself |

Adjacency, semantic similarity, shared people, or chronological order is never causal dependency.

## Candidate fields

- upstream/prerequisite entity;
- downstream/dependent entity;
- relationship kind (`scope_prerequisite`, `external_prerequisite`, `decision_gate`, `temporal_sequence`, `related_only`);
- why proposed;
- assertion basis (`explicit_language`, `structured_relation`, `semantic_hypothesis`, `operator_assertion`);
- exact evidence passages;
- source lineage and independent-origin count;
- currentness/contradictions;
- candidate mappings to existing Scopes/Decisions/TimelineEvents;
- for a proposed DecisionGate only: what waits, why the wait is serial, evidence for the gate, and delay range source.

## Acceptance rules

### Scope dependency

May be accepted only when:

- both endpoints have resolved identities, or the prerequisite is explicitly external;
- the direction is explicit;
- evidence or operator rationale states prerequisite behavior, not just relationship;
- self-dependency and cycles are rejected;
- the operator acknowledges the existing engine meaning: the dependent Scope cannot finish before the prerequisite Scope.

If the evidence says “teams coordinate” or “these projects share a component,” the item can be information only, not a dependency.

### DecisionGate

Decision acceptance and gate acceptance are separate acts. A candidate Decision always becomes an open, ungated Decision first. A gate proposal requires:

- target Scope;
- what waits;
- why it cannot proceed in parallel;
- evidence for seriality;
- low/likely/high delay with an explicit basis;
- confirmation that the current engine applies the delay scope-wide and serially.

If any field is missing, keep the Decision open without a gate. Never fill a default delay.

### Temporal sequence

“Review before pilot” may seed a Timeline relationship or inform ordering, but it is not a causal delivery dependency unless the operator separately declares it. A date relationship has no Forecast effect by itself.

## Semantic inference guardrail

Semantic retrieval can surface candidate evidence and suggest `related_only`. It cannot emit `scope_prerequisite` unless one of the following exists:

- explicit causal phrase in direct evidence (“blocked by,” “cannot start until,” “depends on”);
- structured intelligence relation typed `depends_on` with cited direct evidence;
- operator-authored causal rationale.

Even then, it remains a candidate. The UI labels `Explicit in source` versus `Semantic hypothesis`.

## Canonical model migration

Current `Scope.dependsOnScopeIds` carries the right forecast meaning but no provenance. Introduce `ScopeDependency`, backfill every array entry as `source = migrated`, prove portfolio simulation parity, dual-read with row preference, then remove/stop writing the array in a later migration.

Do not overload `DecisionGate` for project-to-project dependencies. Its delay semantics are different and intentionally stricter.

## Visual treatment

In Bootstrap Review:

- solid cyan connector preview = accepted for activation but still not Reality until activation;
- dashed violet connector = pending candidate;
- amber stop = unresolved DecisionGate proposal;
- thin neutral line = temporal sequence / related only.

These are prototype semantics only. The package contains no geometry; the client lays out the relationship view.


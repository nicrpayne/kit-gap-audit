# Reports upstream contracts and tranche-1 plan

Reports remains an immutable communication layer downstream of live Signal truth. No Reports assembly or schema change was implemented in this tranche.

## Readiness after hardening

| Input | Canonical owner/read contract | Readiness | Caveat |
|---|---|---:|---|
| Audit current/prior delta | AuditRun + ContextSnapshot + Finding identity/status | READY WITH CAVEAT | Current/prior exists; grounding quality and unsupplied provider lanes must travel with the delta. A dedicated compact delta read model should be extracted. |
| Live Forecast | `computeForecast` / portfolio simulation output | READY WITH CAVEAT | Finding leakage and parent-container duplication are fixed. Legacy inferred capacity must be disclosed and cannot be narrated as named staffing. |
| Decisions and gates | Decision lifecycle + `DecisionGate.targetScopeId` joined target | READY | Candidate/open/decided and ungated-zero-effect laws are intact. Reports must read first-class Decisions, never legacy decision Findings. |
| Scope | Canonical Linear executable leaf work | READY WITH CAVEAT | Parent containers with counted descendants are excluded. There is still no persistent first-class accepted capability model for non-Linear work. |
| Capacity | Person + Allocation + context-switch setting + `CapacityForecastContract` | READY WITH CAVEAT | Named allocations reconcile exactly. Current production scopes are still legacy inferred/unallocated. |
| Dependencies | `Scope.dependsOnScopeIds` plus serial DecisionGate target | READY | Only declared edges may be causal. Sparse or stale production data must be stated as missing, not inferred. |
| Timeline | TimelineEvent for live plan; Report for historical memory; live Forecast at NOW | READY | Temporal role is explicit. Historical snapshots remain useful only as labelled memory/comparison. |
| Momentum | Immutable Report history and stored change counts | READY WITH CAVEAT | It is report cadence memory, not live delivery velocity. No report means no trend. |

Verdict: the contracts are sufficient to begin Reports assembly. The first report must render missing/stale/unreconciled states explicitly, especially current production capacity and absent KIT Construct inputs.

## Reuse

- Keep the Reports route shell, URL-owned project selection, history selector, immutable `Report` rows, snapshot provenance banner, Markdown copy, print-friendly reading surface, and Momentum helpers.
- Keep `computeForecast` as the only live Forecast owner.
- Keep `ContextSnapshot` as the source-manifest reference rather than duplicating provider details into Reports.
- Keep Report history as immutable memory consumed by Timeline and Momentum.

## Retire or replace

- Retire `lib/reports/generate.ts` derivation of open Decisions from `Finding.type === "decision"`.
- Retire the existing report-body contract that is only Forecast + shipped counts + legacy Finding categories + one best scenario.
- Do not let `summaryMarkdown` be the only machine-readable snapshot. It is an export/rendered artifact, not a reusable read model.
- Do not reuse historical Report values as inputs to the new current brief, except for explicitly labelled movement/comparison.

## Required data contract

Add one server-owned `DecisionBriefReadModel` assembled from owner reads, then serialize the same object to both the screen and immutable snapshot:

```ts
type DecisionBriefReadModel = {
  identity: {
    projectId: string;
    projectName: string;
    generatedAt: string;
    mode: "reality" | "scenario";
    scenarioId: string | null;
    contextSnapshotId: string | null;
    sourceCurrentness: SourceCurrentness[];
  };
  headline: LiveForecastHeadline;
  changes: AuditDelta & DeliveryDelta;
  calls: Array<OpenDecision & { gate: CanonicalGateTarget | null }>;
  movable: CapacityScopeOption[];
  timeline: LiveTimelineSummary;
  provenance: ProvenanceReference[];
  caveats: TruthCaveat[];
};
```

Every value must carry `owner`, `asOf`, and `temporalRole` (`live | historical`). Evidence references carry grounding (`passage | source_only | none`) and currentness. Capacity options carry reconciliation status and may not claim named staffing unless `capacityContract.reconciles` is true.

## Schema recommendation

Add an immutable JSON snapshot to `Report` in the Reports tranche:

- `briefVersion String`
- `briefSnapshot Json`
- `mode String` (`reality | scenario`)
- `scenarioSnapshot Json?`

Retain the current typed headline columns for efficient Timeline/Momentum reads and compatibility. Keep `summaryMarkdown` as the exact rendered export generated from `briefSnapshot`. Migration should leave old reports readable as legacy snapshots and must never rewrite them into the new schema semantically.

## Exact implementation slices

1. **Owner adapters and contract test.** Build pure adapters for Audit delta, first-class Decisions/Gates, executable Scope, capacity contract, Dependencies, live Timeline, and Momentum. Add the permanent cross-instrument fixture as the acceptance oracle.
2. **Brief assembler.** Add a read-only server function that joins those adapters for one project and emits caveats instead of filling missing values. No persistence yet.
3. **Tranche-1 brief surface.** Replace the legacy report body with As-of/Trust, Headline, What Changed, What Needs a Call, What Can Move, Timeline, and Evidence/Provenance sections. Reality and Scenario use visibly distinct materials.
4. **Immutable save.** Persist `briefSnapshot` and generate Markdown/plain-text/print output from that exact snapshot in one transaction. Saved reports never re-read live values.
5. **History and comparison.** Browse immutable briefs, compare the selected snapshot with current live owner reads, and show movement/staleness without mutating the saved brief.

## Tranche-1 acceptance tests

- Report headline equals live Forecast output for the same project/read instant.
- An open ungated Decision appears under “needs a call” and contributes zero delay.
- A serial gate displays its `targetScopeId` target and exact low/likely/high range.
- An open Finding appears in changes/attention but contributes zero baseline work.
- A historical Report date is always labelled snapshot/as-of; it is never “current”.
- Named raw/effective FTE and Forecast capacity reconcile exactly; unreconciled legacy capacity produces a warning and no named-staffing claim.
- Scope parent containers with counted descendants contribute zero duplicate effort.
- Copy, screen, and print are derived from the same immutable snapshot.
- Refreshing live data changes the live comparison, not the saved snapshot.
- Missing KIT Construct data produces explicit missing-input rows, never fabricated options or recommendations.

## JSA → KIT Construct pivot brief

The first useful brief should compare finish-first, staged-pivot, and immediate-pivot options only after canonical KIT Construct inputs exist. Each option must state:

- accepted remaining JSA executable work and what can explicitly defer;
- open Decisions, which are gated, exact target Scope, owner, needed-by, and evidence;
- named people moving, raw FTE, effective FTE, context-switch loss, and remaining JSA support tail;
- declared dependencies and next committed Timeline milestone;
- live target/likely window/confidence consequence from the same scenario input;
- current-vs-prior Audit delta and grounding/currentness warnings;
- recommendation evidence and the unresolved inputs that prevent a responsible call.

The current production world cannot answer this yet because KIT Construct Scope/work and named allocations are absent. Reports should expose that absence; the next data tranche should not hide it with hypothetical defaults.


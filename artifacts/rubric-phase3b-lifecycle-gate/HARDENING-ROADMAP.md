# Signal hardening roadmap after Audit lifecycle acceptance

This is a pre-production roadmap derived from the accepted lifecycle proof,
the current code, and existing production-shaped evidence. It is not presented
as a fresh production assessment because promotion stopped at the branch
topology gate.

## NOW

### 1. Reconcile production ancestry and run the read-only production gate

**Acceptance**

- approved reconciliation preserves both histories and produces a tree
  byte-identical to the accepted experimental tree;
- no force push or manual conflict edit;
- Railway reports the exact pushed production SHA at `/api/version`;
- the visible short build marker matches it;
- the requested JSA smoke passes without running a production Audit or
  changing Reality.

**Likely subsystem:** Git/Railway release workflow, `app/api/version`, shared
build marker.

**Dependency:** explicit approval for the topology-reconciliation strategy.

### 2. Close the remaining Audit P2 surface and production data-veracity gap

**Acceptance**

- one truthful source-count line; long source/Finding titles wrap cleanly;
- Hide has a visible, presentation-only undo that preserves camera/selection;
- Circle and Hex honor Rubric label budget/progressive identity at 438+ objects;
- Project Overview exposes canonical category, provider coverage, grounding,
  current/prior delta, and safe click-through metrics;
- the production `Test` Decision and `This is a test connection` Gate receive
  an owner-approved disposition through governed workflows;
- every Finding visibly declares its basis family, and unsupported/missing
  providers are reported instead of invented.

**Likely files/subsystems:** `components/audit/AuditWorld.tsx`,
`public/audit-rubric-phase2/phase2-host.js`,
`public/audit-rubric-phase3/phase3-host.js`,
`lib/audit/rubricVisualAdapter.ts`, `lib/audit/signalRubricAdapter.ts`, Audit
read models and proof scripts.

**Dependency:** production read-only census and owner decision on test residue.
Protected Rubric files remain untouched.

### 3. Build Reports tranche 1 as the decision brief

Reports are the next major instrument. The current generator is useful but
incomplete: it snapshots Forecast and change counts, while its decision
sections still derive from legacy decision Findings rather than the
first-class `Decision`/`DecisionGate` model. It does not yet explain the latest
Audit delta, Scope composition, Capacity allocation, or Timeline commitments.

**Acceptance**

- one immutable report snapshot names its as-of time and source snapshots;
- headline: target, likely window, confidence, and movement since prior report;
- `What changed`: shipped/resolved work plus current-vs-prior Audit Findings;
- `What needs a call`: first-class open Decisions, clearly separating gated
  from ungated and naming target Scope/gate range where present;
- `What can move`: Scope/Capacity scenarios with explicit Reality vs Scenario;
- `Timeline`: next committed milestone and conflicts;
- every copied Markdown report carries provenance/staleness language;
- snapshot numbers reconcile to the live Forecast, Decisions, Scope, Timeline,
  and Audit read models at generation time;
- retire the legacy Finding-derived decision summary only after comparison
  tests prove no information loss.

**Likely files/subsystems:** `lib/reports/generate.ts`,
`lib/reports/render.ts`, `lib/reports/changes.ts`, `lib/reports/snapshot.ts`,
`components/ReportsPageClient.tsx`, `components/ReportView.tsx`,
`app/api/reports/route.ts`, Report schema/migration, shared read models.

**Dependency:** production veracity cleanup and a declared report audience/
cadence. Reuse immutable Report history, snapshot banner, copy flow, momentum,
and Forecast computation.

## NEXT

### 4. Harden Decisions for pivot calls without weakening gate semantics

Preserve candidate → open → decided, evidence attachment, and the rule that an
open Decision has zero forecast effect unless a human creates a serial
`DecisionGate`.

**Acceptance**

- an Audit-created candidate/open Decision deep-links into Decisions selected;
- owner, needed-by, options, evidence, choice, and resolution form one coherent
  workflow with clear next action;
- candidate dedup/attach/accept stays idempotent;
- gate creation still requires target Scope, serial rationale, evidence, and a
  valid low/likely/high range;
- preview names the exact forecast effect before a gate write;
- Reports consumes first-class Decisions/Gates;
- an automated flow proves candidate → open → gated/ungated → decided and
  confirms only open serial gates move Forecast.

**Likely files/subsystems:** `components/DecisionsPageClient.tsx`,
`components/decisions/*`, `lib/decisions/*`, `app/api/decisions/*`,
`app/api/decision-candidates/*`, Forecast gate query and decision proofs.

**Dependency:** Reports read contract and agreed pivot-decision fields.

### 5. Harden Scope for KIT Construct allocation scenarios

The current Scope instrument is a strong session-only composer, but three
known model gaps matter for the pivot: Linear parent Feature issues can be
double-counted as phantom effort; release assignment is an inert prototype;
and manual/Hermes capabilities and exclusions do not persist to Reality.

**Acceptance**

- exclude in-scope Linear parent Feature issues from effort and prove the
  before/after Forecast delta;
- compare JSA keep/finish/defer against an initial KIT Construct tranche using
  named Capacity allocations and visible uncertainty;
- preserve Reality/Scenario separation and one-click discard restoration;
- define a real release/capability persistence model before enabling
  assignment or commit controls;
- accepted Hermes/manual capabilities reconcile to Linear without duplicate
  work;
- a scenario handoff to Forecast and Reports carries exact input provenance.

**Likely files/subsystems:** `components/instrument/ScopeInstrument.tsx`,
`components/instrument/FeatureDetail.tsx`, `lib/scope/*`,
`lib/instrument/useProject.ts`, `lib/forecast/build.ts`, Portfolio/Capacity read
models, Prisma only after the persistence contract is approved.

**Dependency:** named JSA/KIT Construct allocation options, release semantics,
and the parent-Feature data proof.

## LATER

### Cross-app hardening and color/material system

- Inventory `--i-*` versus legacy `--color-*` tokens and assign one semantic
  meaning to cyan, violet, amber, red, graphite, attested/inferred/external,
  Reality/Scenario, selected/hovered, and stale/current.
- Preserve project/context selection across instrument handoffs and back/forward.
- Remove build warnings outside protected Rubric files in subsystem-sized
  passes with visual regression proof.
- Standardize shell labels, empty/error/loading states, build identity, and
  keyboard/reduced-motion behavior.

**Acceptance:** token inventory has no contradictory meanings; cross-instrument
deep links restore project and selected object; zero product-code lint warnings;
automated shell/context suite passes all instruments.

### User guides and teaching scripts

Create a `How to play Signal` hub, then one guide per instrument in this order:
Audit; Forecast/Capacity/Portfolio; Decisions; Scope; Reports; Timeline;
Control Room/source management.

Every guide should contain: the question the instrument answers; inputs and
data owner; visual grammar; a five-minute happy path; every write and what it
does not write; handoffs to other instruments; stale/missing-data warnings;
common mistakes; recovery/undo; and a short operator checklist.

Teaching assets should include a 15-minute overview, a 30-minute PO workflow,
and a 60-minute live JSA → KIT Construct scenario. Each script needs exact demo
data, expected screen state, audience questions, and fallback steps if a live
source is unavailable.

### Deeper capabilities

- provider-resolved source drill-down only where a typed resolver exists;
- exact identity → lexical → semantic → graph-aware Search with match labels;
- current/prior Audit material comparison in the same Rubric world;
- concurrent/partial decision-gate modelling only after the simulation contract
  can represent it honestly;
- persistent release and capability models after Scope semantics are approved.

## KIT Construct pivot-readiness checklist

Signal must make the following decision inputs explicit before Nic uses it for
staffing/allocation:

1. **Exit condition and pivot date:** what “JSA done enough” means, the earliest
   responsible pivot window, and the decisions/gates that can move it.
2. **Named capacity:** current and proposed FTE by person/team across JSA,
   shared platform work, support tail, and KIT Construct.
3. **Scope split:** JSA must-ship, safe-to-defer, operational/support tail, and
   the first KIT Construct capability tranche.
4. **Decision queue:** who decides Notifications ownership, App Store reviewer
   access, pivot trigger, and ongoing JSA stewardship; each with owner,
   needed-by, options, evidence, and gate status.
5. **Evidence/currentness:** which providers are present, what is stale or
   unsupported, and which Findings are weakly grounded.
6. **Scenario comparison:** finish JSA first, staged pivot, and immediate pivot;
   compare dates, confidence, capacity, stranded work, and reversible unknowns.

The minimum trusted feature chain is therefore: production-veracity census →
parent-Feature effort fix → first-class Decisions/Gates in Reports → named
Capacity/Scope scenarios → a copyable pivot brief with provenance.

## Exact recommended next tranche — maximum five

1. Approve and execute the controlled production ancestry reconciliation;
   deploy and verify exact SHA/marker.
2. Run the complete read-only JSA production smoke and capture the live
   veracity/provider census.
3. Fix the bounded Audit P2 polish set and govern the `Test` Decision/Gate
   residue; rerun the permanent hover/lifecycle regressions without a
   production Audit.
4. Implement Reports tranche 1 on first-class Audit/Forecast/DecisionGate/
   Scope/Timeline read models.
5. Run the KIT Construct operator tranche: parent-Feature effort correction,
   named capacity scenarios, pivot Decision set, and the 30-minute PO demo
   script.

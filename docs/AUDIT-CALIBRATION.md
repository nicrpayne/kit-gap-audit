# Audit reasoning calibration — golden set regression pass

Written after the first real Hermes → Gap App handshake produced 11
Findings from one JSA package, independently forensically reviewed as: 0
excellent, 3 useful-but-needs-calibration, 4 duplicate, 1 stale, 3
should-not-have-been-Findings, 8 of 11 marked blocking, zero firmly-proven
serial gates. This document is a description of what shipped in response
— trace actual pre-existing behavior first, then the fix — not a design
aspiration. If something here and the code disagree, the code is right.

**Scope discipline, confirmed unchanged**: `lib/forecast/simulate.ts`,
`lib/forecast/portfolio.ts`, `lib/capacity/resolve.ts`, `lib/scenario/`,
`lib/momentum/`, every Portfolio/Instrument component, Hermes, and
`kit-gap-bridge` — byte-for-byte untouched. No UI built or changed. No
new Prisma migration (see "Migration" below).

## 1. Root cause assessment

Traced directly in `lib/audit/run.ts`, `lib/audit/prompts/audit-v1.ts`
(pre-calibration, "v1"), and `lib/audit/normalize.ts` before any change:

**Duplicate (golden 1, 3, 11)** — `runAudit()`'s `priorFindings` query
selected `status: { in: ["dismissed", "ticketed", "resolved"] }` only.
**Open Findings were never shown to the model at all.** A Finding
representing SOF-572, SOF-510, or the access blocker being *open* (not
yet handled) was structurally invisible to every subsequent audit —
duplication wasn't a judgment failure, it was a missing-input failure.
Even the handled findings shown carried only `{title, status,
resolution}` — no type, no `matchedIssues`, no `blocking` — too thin to
reconcile against by substance rather than title text.

**Stale (golden 8)** — no representation of *when* evidence was observed
was ever shown to the model. `PromptEvidenceItem` carried `id`/`excerpt`/
`data` only; the package's own source-manifest `observedAt` (the one
place recency actually lived) was computed and stored but never rendered
into the prompt. An old composite wiki note and a fresh tracker row
looked equally "current" to the model.

**Qualifier ignored (golden 9, 10)** — nothing in the prompt or code ever
constrained a conclusion against the evidence's own structured/prose
qualifiers. `Tickets Created: y` and `not needed for JSA` were exactly as
persuasive, or as ignorable, as any other sentence in the excerpt — nothing
forced the model to reconcile a claim against a qualifier that flatly
contradicted it, and nothing in code double-checked afterward.

**Wrong/no Linear match (golden 11)** — `matchedIssues` was always
free-form model output, never checked against anything. A near-duplicate
Finding and a decoy ticket sharing a loose keyword ("notification") were
equally likely to be cited as a match; the prompt only said "match
generously," which pushes toward false positives, not away from them.

**Over-blocking (8 of 11 marked blocking)** — `normalizeFindings` did
`blocking: r.blocking === true`, i.e. trusted the model's own boolean
outright, for every finding type. The prompt's guidance ("blocking: true
only if it blocks work that is already scoped or in progress") is a
*plausibility* bar, not an *evidence* bar — nothing required the model to
name what release boundary was gated or what evidence proved a serial
dependency. (Aside, traced for completeness: `lib/forecast/build.ts`'s
`blockingDecisions` filter only ever turns `type === "decision" &&
blocking` into a real `DecisionGate` — a blocking `risk`/`missing_work`
had zero forecast effect even pre-calibration. The *data* was still wrong
and misleading in the UI/API regardless of forecast blast radius, which
is why "zero firmly-proven serial gates" was the forensic finding even
though forecast math itself was never literally corrupted by this batch.)

**Observation promoted to Finding (golden 2, 4)** — there was only ever
one candidate shape: a persisted-Finding-shaped JSON object. A direction
reversal or a "these two trackers might be the same thing" observation
had nowhere to go except full Finding status or nothing — there was no
middle tier, so genuinely useful intelligence either got force-fit into a
Finding (inflating the promotion rate) or silently dropped.

## 2. Revised reasoning model

```
EVIDENCE
  -> CANDIDATE (kind: "finding" | "signal" | "clarification")
       -> RECONCILE (against current Linear + every existing Finding,
                      open and handled, + every other candidate in this
                      same batch)
       -> RESPECT QUALIFIERS (structured/prose disclaimers in the cited
                      evidence constrain the conclusion)
  -> ACTIONABLE FINDING (kind="finding" candidates that survive both)
       -> BLOCKING is a separate, later decision (needs a complete gate:
                      release boundary + dependency + evidence)
```

Determined this fits entirely in the **prompt contract + one JSON output
shape** — no new persisted Signal/Candidate model needed *for this pass*.
Signals and clarifications are real output (surfaced via the API), just
never written to the `Finding` table. See "Finding / Signal boundary"
below for the recommendation on when a persisted Signal model would
become worth it.

## 3. Prompt changes

`lib/audit/prompts/audit-v1.ts`, version bumped `v1` → `v2` (same file
path — a rename wasn't justified, nothing else keys off it):

- (B) now shows **every existing Finding for the Scope, open and
  handled**, each with type/status/blocking/matchedIssues/resolution —
  not just handled ones, not just titles.
- (C) evidence items now carry `sourceRef`/`observedAt` when known (from
  the package's own source manifest), so freshness is visible.
- New promotion-ladder framing: EVIDENCE → RECONCILE → QUALIFIERS →
  BLOCKING, stated as an explicit up-front rule, not just per-field
  guidance.
- Three candidate kinds (`finding`/`signal`/`clarification`), each with
  its own required-field contract (see `lib/audit/normalize.ts`).
- Every `finding` candidate must supply `qualifiers` (four honest
  booleans read from cited evidence), `reconciliation` (`newObligation`,
  `checkedAgainst`, `matchedExistingId`, `reason`), and, only if
  requesting `blocking: true`, a fully-populated `gate` (`releaseBoundary`,
  `dependency`, `evidenceForGate`).
- `reasoningOrigin` (`explicit`/`cross_source`/`coverage`/
  `domain_inferred`/`predictive`) required on every candidate.
- Composite-claim and freshness rules stated explicitly (prompt-only —
  see "Deterministic guardrails" for why these two can't be fully coded).

## 4. Deterministic guardrails

Enforced in code (`lib/audit/run.ts`), never left to hope the model
followed instructions — each exported for direct unit testing
(`scripts/golden-regression/deterministic.test.ts`):

| Guardrail | Function | Effect |
|---|---|---|
| Missing/uncited evidence | existing citation safety-net (unchanged from Phase 1b) | reject (no provenance) |
| Cited evidence contradicts the claim itself (`Tickets Created: y` vs. `missing_work`; evidence says not needed for **this project** vs. any claim) | `qualifierContradiction` | **suppress** — never a softened Finding |
| Model's own reconciliation says this isn't new | inline check on `reconciliation.newObligation` (defaults to **false**, i.e. unsafe, if the model omits the field) | **suppress** |
| Two candidates in the same batch, same type + same `matchedIssues` set | `withinBatchDuplicateKey` | **suppress** the second |
| `blocking: true` without a complete `gate`, or with a release-boundary-only qualifier (`explicitlyDeferred`/`explicitlyNotReleaseBlocker`) | `resolveBlocking` | **downgrade** to `blocking: false` (Finding persists, just non-blocking) |

Deliberately delegated to LLM judgment (semantic, rubric-scored — see
`scripts/golden-regression/RUBRIC.md`), NOT coded, because no reliable
deterministic signal exists for it:

- **Freshness** (golden 8): no universal "which timestamp wins" rule
  exists across arbitrary source semantics (an old decision log can still
  be authoritative for a specific past date). `observedAt` is surfaced;
  weighing it is the model's job. Per the brief's own instruction: "do
  not build a universal numeric trust score."
- **Composite splitting**: whether a claim bundles independent
  workstreams is a reading-comprehension judgment, not a structural one.
- **Reconciliation truthfulness**: `qualifiers`/`reconciliation` are
  code-*enforced* once set, but code cannot verify the model set them
  *honestly* from the actual cited text — same trust boundary that
  already existed for `evidenceRefs` citation before this pass.

One important asymmetry, proved directly while building the harness (see
"Golden set results"): when a hand-authored fixture candidate accidentally
omitted `reconciliation` entirely, the code correctly suppressed it (safe
default), rather than silently persisting an unreconciled Finding — this
is the guardrail working as designed, not a bug, and a concrete example of
why "missing judgment defaults to unsafe" matters in practice, not just in
theory.

## 5. Finding / Signal boundary

No new Prisma model. A `kind: "signal"` or `kind: "clarification"`
candidate is parsed (`normalizeAuditOutput`) but **never reaches
`prisma.finding.create`** — `runAudit()`'s persistence loop only ever
iterates `candidates.findings`. They're returned in
`AuditRunResult.signals` / `.clarifications`, surfaced additively in
`POST /api/refresh` and `POST /api/audit`'s JSON responses, and otherwise
go nowhere — no UI, no forecast input, no DB row. This is the
"acceptable to return as non-persisted audit candidates" option the brief
named, chosen because a persisted Signal model would be schema growth
with no consumer yet (no UI, no reconciliation workflow to act on it).

**Recommendation for later** (not built, not started): if Nic starts
regularly wanting to *act* on signals/clarifications across sessions
(e.g. "show me open reconciliation questions across all Scopes"), that's
the trigger for a real persisted model — today they only live for the
lifetime of one API response.

## 6. Blocking semantics

**New standard**: `blocking: true` survives only when the candidate names
a complete gate — `releaseBoundary` (what boundary), `dependency` (what
can't complete until this resolves), `evidenceForGate` (what evidence
establishes the dependency is serial, not just correlated) — **and** the
cited evidence carries no release-boundary disclaimer
(`explicitlyDeferred`/`explicitlyNotReleaseBlocker`). Default is
`blocking: false`. Being serious, risky, unresolved, or historically
described as "a blocker" is explicitly insufficient. This applies
uniformly to every Finding type in the persisted data (not just
`type: "decision"`, even though today's forecast math only turns a
blocking **decision** into a `DecisionGate` — the data itself needs to be
honest regardless of which types currently feed the simulator, since the
Decision Queue/API/a future consumer all read the raw field).

A second, narrower qualifier — `explicitlyOutOfProjectScope` (evidence
says not needed for the **Scope/project itself**, e.g. "not needed for
JSA" while auditing JSA) — is stronger than a blocking-only disclaimer:
it suppresses the candidate **entirely**, on the theory that a claim the
evidence itself disclaims from this project shouldn't become a Finding
for this project at all, whereas "outside Beta"/"deferred" still leaves a
real, trackable, non-blocking Finding behind. This distinction is what
keeps golden Finding 7 (Notifications POC — real risk, just not
Beta-blocking) and golden Finding 10 (job service auth decision —
evidence disclaims JSA relevance entirely) landing correctly on opposite
sides.

## 7. Domain-inferred gap support

Confirmed still possible, honestly labeled. `reasoningOrigin:
"domain_inferred"` is a first-class, valid value — the prompt explicitly
tells the model this is a legitimate, valuable candidate kind (using the
brief's own state-management example), not something to suppress.
Grounding: every origin tag is prefixed onto the persisted
`rationale` (`[domain-inferred] ...`, see `ORIGIN_LABELS` in
`lib/audit/run.ts`) — durable without a schema migration, so a
domain-inferred Finding stays honestly distinguishable from an explicit
one for as long as the Finding exists, not just for the one API response
that created it. A domain-inferred candidate still has to survive
reconciliation and the blocking bar exactly like any other — "inferred"
is a provenance label, not a promotion shortcut or a demotion.

## 8. Golden regression harness

`scripts/golden-regression/` (see its own `README.md` for exact run
commands):

- **`fixture.ts`** — the 19-evidence-item, 2-source package (JSA wiki +
  JSA Infrastructure Alignment tracker) and the 3 pre-existing Findings
  (SOF-572/SOF-510/access-blocker) each golden case reconciles against.
  **Reconstructed from the brief's own descriptions**, not a copy of the
  literal original packet — that packet isn't available in this repo,
  only the forensic classification of its output is. Close enough to
  exercise every named guardrail path; not a byte-for-byte replay.
- **`calibratedOutput.ts`** — a hand-authored "what a calibrated model
  should output" candidate batch in the real v2 JSON shape. **Not a live
  model call** — no `ANTHROPIC_API_KEY` in this sandbox (confirmed
  absent; `ANTHROPIC_BASE_URL` is set but no key). Injected via
  `AuditRunOptions.complete`.
- **`deterministic.test.ts`** — pure functions only, no DB, no LLM: 21
  checks covering every "MUST FIX" deterministic invariant named in the
  brief plus a few defensive extras (see below).
- **`e2e.ts`** — the real `runAudit()` against real local Postgres
  (`KIT_DEV_FIXTURES=1` for Linear, matching this repo's existing testing
  discipline), asserting on actual persisted rows: 31 checks.
- **`RUBRIC.md`** — the semantic dimension neither script can execute
  here. Explicit about the gap: proving the deterministic layer enforces
  golden outcomes *given* correct model judgment is not the same as
  proving the live model *supplies* that judgment. To be run by hand (or
  scripted) the first time a real key + Linear access coexist.

Per the brief's own instruction, these are **not conflated**: pure-logic
invariants are asserted with real `===` checks against real persisted
rows; the semantic-quality dimension is explicitly deferred to a rubric,
not faked as if it were deterministic.

## 9. Golden set results

**Before (traced, not re-executed — the pre-calibration code no longer
exists to re-run)**: root cause section above traces exactly why each of
the 11 would fail as forensically observed: open Findings invisible to
the model (1, 3, 11), no freshness signal (8), no qualifier enforcement
(9, 10), no reconciliation requirement beyond "matched generously" (all
duplicates), `blocking` trusted verbatim (8 of 11).

**After** (`e2e.ts`, 31/31 passing, given the calibrated candidate
batch):

| Golden # | Classification | Outcome this pass |
|---|---|---|
| 1 | C (duplicate) | Suppressed (reconciliation match: SOF-572 Finding). Residual uncertainty preserved as 1 clarification. |
| 2 | E (should be signal) | Never a Finding — 1 signal (`possible_duplicate_tracker`). |
| 3 | C (duplicate) | Suppressed (reconciliation match: SOF-510 Finding). |
| 4 | C (duplicate, preserve insight) | Never a Finding — 1 signal (`direction_change`). |
| 5 | B (needs calibration) | Persisted, **non-blocking** (gate absent → downgraded). |
| 6 | B | Persisted (cutover-ownership only — the "migration itself" half correctly never raised), non-blocking. |
| 7 | B | Persisted, **non-blocking** (release-boundary qualifier → downgraded). |
| 8 | D (stale) | Never raised (LLM-judgment path — see RUBRIC.md, no deterministic backstop for this one). |
| 9 | E | Suppressed (`explicitlyTicketed` contradiction — the brief's own literal example). |
| 10 | E | Suppressed (`explicitlyOutOfProjectScope` contradiction). |
| 11 | C (duplicate) | Suppressed (reconciliation match: access-blocker Finding; SOF-645 decoy correctly rejected as a false match in the reconciliation reason). |

Plus 3 synthetic additions beyond the 11 (within-batch duplicate pair,
one gate-satisfied positive case) proving the backstop isn't one-sided:
blocking **can** survive with a real gate, and within-batch duplication
is caught even when the model's own `reconciliation.newObligation`
wrongly claims "new."

**Net**: 5 new Findings persisted (down from 11), **1 blocking** (the
synthetic positive-gate case — real production evidence would need to
supply an equivalently complete gate for any blocking Finding to survive;
zero of the 11 real golden findings clear that bar with the evidence
described in the brief), 6 suppressed duplicates/contradictions, 2
signals preserved, 1 clarification preserved, 0 pre-existing Findings
duplicated.

## 10. Forecast safety

`lib/forecast/simulate.ts`, `lib/forecast/portfolio.ts`,
`lib/capacity/resolve.ts`, `lib/scenario/`, `lib/momentum/` — not
imported, not opened for edit, not diffed against (nothing here touches
them). `lib/forecast/build.ts`'s `blockingDecisions`/gate-estimate logic
is unchanged; the only thing that changed is what's now honestly written
into `Finding.blocking` upstream of it. No simulation tuning performed to
compensate for anything.

## 11. Tests

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npm run build` — clean (pre-existing `encoding` module warning from
  `@linear/sdk`, unrelated, present before this change too).
- `scripts/golden-regression/deterministic.test.ts` — 21/21.
- `scripts/golden-regression/e2e.ts` — 31/31, against real local
  Postgres, cleans up after itself (re-run confirmed idempotent, zero
  stray rows).

## 12. Files changed

- `lib/audit/prompts/audit-v1.ts` — new v2 prompt contract (kept the file
  path; bumped the internal version string).
- `lib/audit/normalize.ts` — rewritten: `normalizeAuditOutput` replaces
  `normalizeFindings`, routing `finding`/`signal`/`clarification` kinds,
  parsing the new qualifier/reconciliation/gate/reasoningOrigin fields.
- `lib/audit/run.ts` — existing-Findings query now includes open Findings
  with richer fields; package evidence rendering now carries
  `sourceRef`/`observedAt`; new exported guardrail functions
  (`qualifierContradiction`, `resolveBlocking`, `withinBatchDuplicateKey`);
  persistence loop now applies all guardrails and prefixes an origin tag
  onto `rationale`; `AuditRunResult` gained `suppressedFindings`,
  `downgradedBlocking`, `signals`, `clarifications`.
- `app/api/refresh/route.ts` — surfaces the four new `AuditRunResult`
  fields additively (`buildAuditResponse` helper); passes the package's
  source manifest through to `runAudit` for freshness rendering.
- `app/api/audit/route.ts` — same additive surfacing for the
  transcript-only audit path.
- `scripts/golden-regression/*` — new (fixture, calibrated-output
  stand-in, deterministic tests, e2e harness, rubric, README).
- `docs/AUDIT-CALIBRATION.md` — this document.

No changes to: `prisma/schema.prisma`, any `lib/forecast/*`,
`lib/capacity/*`, `lib/scenario/*`, `lib/momentum/*`, any component, any
page, Hermes, `kit-gap-bridge`.

## 13. Migration

**None.** `reasoningOrigin` is persisted as a rationale-text prefix, not a
column (see "Domain-inferred gap support"). `qualifiers`/`reconciliation`/
`gate` are transient, used only within one `runAudit()` call to decide
what gets written to the existing `Finding` columns
(`blocking`/`title`/`rationale`/etc.) — never stored themselves. Signals/
clarifications never touch a table. `prisma/schema.prisma` is unchanged.

## 14. Remaining product decisions

Only genuine blockers/judgment calls, not busywork:

1. **Finding 8's freshness case has no deterministic backstop** — it's
   entirely LLM judgment (see "Deterministic guardrails" and
   `RUBRIC.md`). If real runs show this regressing often, the smallest
   next fix would be a narrow, explicit rule (not a numeric trust score):
   "if a newer source's evidence item shares a matchedIssues-style
   pointer with an older source's claim, the newer one wins" — deferred
   until there's real evidence this is actually needed, per the brief's
   "do not build a universal numeric trust score" instruction.
2. **Rationale now carries a bracket origin tag** (e.g. `[cross-source]
   ...`) with no UI change to hide/style it — `FindingCard` renders
   `rationale` as a plain paragraph, so the tag is visible as literal text
   today. Left as-is since "build UI" was explicitly out of scope for
   this pass; worth a one-line UI treatment later if Nic wants the tag
   styled instead of read as prose.
3. **Signals/clarifications are response-only, not persisted** — see
   section 5's recommendation on when to revisit.
4. **The rubric in `RUBRIC.md` has never been run against a real model.**
   This sandbox cannot reach both `api.anthropic.com` with a real key and
   Linear at once; the first real environment that can should run it
   before fully trusting live behavior matches this proof.

## 15. Git status

Committed to `claude/gap-audit-calibration-6i5jyn`, pushed. Feature
branch only — no merge, no deploy, no production handshake run.

## 16. Recommendation

GOLDEN SET CALIBRATED — READY FOR NIC REVIEW

---

## Addendum — semantic review follow-up: release-boundary qualifier coherence

A first real semantic evaluation (a real model call against real
first-handshake-shaped evidence, `evaluation/model-bakeoff/raw/
openai-result.json` — external to this repo, not committed here, see
"Golden regression harness" below for why) surfaced one bounded defect in
the pipeline this document describes.

### The defect

Candidate 1 ("JSA production is serially coupled to iTrack readiness")
had a complete, well-evidenced gate against a production release
boundary (`gate.releaseBoundary: "2026-10-31 production release"`,
explicit dependency, a direct quote as evidence) — genuinely the
strongest-shaped gate this pipeline had seen. It ALSO had
`qualifiers.explicitlyNotReleaseBlocker: true`, because its evidence also
included a Beta-scoped exception ("JSA-only Beta is allowed"). The
pre-fix `resolveBlocking()` (see "Blocking semantics" above) treated
`explicitlyNotReleaseBlocker` as a global disqualifier with no boundary
of its own — so a disclaimer about Beta silently canceled a gate about
Production. Verified by independently replaying the raw candidate through
the unmodified code before touching anything (`scripts/semantic-review/
replay-saved-sol.ts`): reproduced the exact same downgrade and reason
string the saved evaluation recorded, byte-for-byte.

### The fix

`qualifiers` gained one field: `appliesToBoundary: string | null` — the
same free-text boundary label `gate.releaseBoundary` already uses (no new
ontology, no enum). `resolveBlocking()` (`lib/audit/run.ts`) now only
lets `explicitlyDeferred`/`explicitlyNotReleaseBlocker` cancel a complete
gate when `qualifiers.appliesToBoundary` is stated AND matches
`gate.releaseBoundary` (case/whitespace-normalized string equality via a
new `boundariesMatch()` helper — not a keyword list, not string-matching
against "Beta"/"Production" specifically). An UNSCOPED qualifier
(`appliesToBoundary` null — exactly the shape the saved evaluation's raw
JSON has, since it predates this field) does **not** cancel a complete
gate: between a specific claim (the gate) and a vague one (a disqualifier
naming no boundary), the specific one wins. This mirrors the original
blocking-bar asymmetry (an incomplete gate always loses to
non-blocking-by-default) applied symmetrically to the qualifier side.

This required a narrow, disclosed prompt change (`lib/audit/
prompts/audit-v1.ts`, version bumped `v2` → `v2.1`) — traced first and
found necessary, not optional: the archived raw candidate has no
structured field distinguishing "this disclaimer is about Beta" from
"this disclaimer is about Production" anywhere, only in free prose
(`rationale`), and resolving that generally without a schema field would
have required exactly the "string hacks against 'Beta'/'Production'"
the review explicitly ruled out. One field, one paragraph of guidance,
one JSON-schema-example line — nothing else in the prompt touched.

### Candidate 1 — before / after

| | Before | After |
|---|---|---|
| `blockingRequested` | `true` | `true` (unchanged — model's own request) |
| `gate` | complete (Production, Oct 31, iTrack dependency, direct-quote evidence) | unchanged |
| `qualifiers.explicitlyNotReleaseBlocker` | `true` | `true` (unchanged — still a real, true fact about Beta) |
| `qualifiers.appliesToBoundary` | *(field didn't exist)* | `null` (archived data predates the field) |
| Normalized outcome | `persist_eligible` | `persist_eligible` (unchanged) |
| **`finalBlocking`** | **`false`** | **`true`** |
| Downgrade reason | `"cited evidence explicitly states this is not a release blocker"` | *(none — survives)* |

Internally coherent now: the Beta exception is still true and still
visible (it's exactly what earned `explicitlyNotReleaseBlocker: true` in
the first place), but it no longer cancels a gate about a boundary it was
never about. A Beta exception no longer incorrectly cancels a Production
gate — verified generally (not just for this one candidate) by the CASE
A–E deterministic tests in `scripts/golden-regression/
deterministic.test.ts`, using synthetic boundary labels ("Milestone A",
"GA", "Pilot", "Phase 1") to prove the mechanism itself doesn't hinge on
recognizing "Beta"/"Production" as special strings.

### Forecast effect — the one residual, honestly reported, NOT fixed here

Candidate 1's `type` is `"risk"`, not `"decision"`. `lib/forecast/
build.ts`'s `blockingDecisions` filter — unchanged, protected,
untouched by this fix — only converts `type === "decision" &&
status === "open" && blocking` findings into a `DecisionGate` (the
serial, non-parallelizable delay). A blocking `risk` (or `missing_work`/
`contradiction`) instead flows through `openWorkFindings` (every open
non-decision finding, blocking or not) and gets a placeholder-effort
estimate from `classifyEstimateHint("needs scoping")` →
`{low:2, likely:5, high:12}` days — parallelizable backlog work, not a
serial gate. So: **even after this fix, Candidate 1 would still enter a
real forecast as generic 2/5/12-day placeholder effort, not as a serial
DecisionGate** — not because the boundary-qualifier defect was
mishandled (that part is now fixed and coherent), but because of a
separate, pre-existing, structural characteristic of the
(explicitly-protected, unchanged) forecast wiring: only `type:
"decision"` findings ever become gates. Fixing that would mean touching
`lib/forecast/build.ts` and/or reconsidering whether `type` classification
itself needs revisiting for release-dependency risks — both explicitly
out of this task's bounded scope ("do not change forecast math," "do not
redesign anything"). Flagged here, not silently left implicit.

### Candidates 2–12 — regression check

Replayed the full saved result (all 12 candidates) through the fixed
pipeline. Only Candidate 1 changed — it's the only candidate in the file
with `blockingRequested: true` and a non-null `gate` at all, so it's the
only one that can even reach the new boundary-comparison branch.
Confirmed byte-identical before/after for the other 11: 3 more findings
(all `persist_eligible`, all non-blocking, all for the same reasons as
before — none touch `resolveBlocking`'s changed branch since none
request blocking), 6 signals (never reach `resolveBlocking` at all —
`normalizeAuditOutput` routes them out of the findings array entirely),
2 clarifications (same). Zero new suppressions, zero new duplicates,
zero blocker inflation beyond the one intended flip. Totals: `{findings:
4, persistEligible: 4, signals: 6, clarifications: 2, suppressed: 0,
proposedBlockers: 1, finalBlockers: 1}` (was `finalBlockers: 0`).

### Golden regression harness (from the original calibration pass)

Re-ran unchanged: 30 deterministic checks (9 new, covering CASE A–E plus
the literal Candidate 1 shape) and all 31 end-to-end checks against real
Postgres — zero regression, since the original golden fixture's two
blocking-downgrade cases (findings 5 and 7) were both downgraded via the
"no gate" branch, never the qualifier-boundary branch this fix changed.

### Tests added

`scripts/golden-regression/deterministic.test.ts` — 9 new checks: CASE
A (same-boundary suppresses), CASE B (different-boundary survives — the
core Candidate-1-shaped regression case), CASE C (same-boundary
`explicitlyDeferred` suppresses), CASE D (no gate, never blocking), CASE
E (complete gate, no disqualifier, survives), unscoped-qualifier-doesn't-
cancel, boundary normalization (case/whitespace), boundary-vocabulary
generality (arbitrary labels, not just Beta/Production), and the literal
Candidate 1 reproduction.

### Files changed (this addendum)

- `lib/audit/normalize.ts` — `FindingQualifiers.appliesToBoundary` field.
- `lib/audit/run.ts` — `boundariesMatch()` helper; `resolveBlocking()`
  boundary-aware disqualification.
- `lib/audit/prompts/audit-v1.ts` — one new qualifier field + guidance
  paragraph + JSON-schema-example line; version `v2` → `v2.1`.
- `scripts/golden-regression/deterministic.test.ts` — fixture helper
  updated for the new required field; 9 new checks.
- `scripts/semantic-review/replay-saved-sol.ts` — new. Evaluation-only
  replay harness (no Prisma import, no model call, no mutation of the
  saved raw file) for re-running any saved raw-candidate-shaped result
  through the current normalize/guardrail pipeline.
- This document.

No changes to: `prisma/schema.prisma`, `qualifierContradiction()`
(the separate full-suppression guardrail — `explicitlyTicketed`/
`explicitlyOutOfProjectScope` are untouched, this defect was specific to
`resolveBlocking()`), any `lib/forecast/*`, `lib/capacity/*`,
`lib/scenario/*`, `lib/momentum/*`, any component, any page, Hermes, or
`kit-gap-bridge`.

### Migration

None.

### Deferred, non-blocking improvements

Per the semantic review's own list, not expanded here: SOF-510-direction-change recall, notifications-POC
recall, zero fully-domain-inferred candidates in this sample, draft
generation still limited, the Anthropic side of a provider bake-off still
incomplete, `matchedIssues` representation could be cleaner. Plus one
newly surfaced item from this pass: **`type`-vs-forecast-gate coherence**
for release-dependency risks (see "Forecast effect" above) — real,
worth a future decision, explicitly not fixed here.

### Git status (this addendum)

Committed locally on `claude/gap-audit-calibration-6i5jyn`. **Not
pushed** — the saved evaluation file lives outside this repo (uploaded to
this session only) and per instruction the historical corpus itself is
not to be pushed; only the code/test/doc changes are committed. Not
merged, not deployed.

### Design gate

REASONING FOUNDATION V1 COMPLETE — READY FOR DESIGN

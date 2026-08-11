# HANDOFF — Product Timeline Audit App (KIT Gap App)

Written for a fresh Claude instance (or human) with zero prior context on
this project. Read this top to bottom before touching code or answering
questions about it. It is a snapshot as of **2026-08-11** — check git log
and ROADMAP.md for anything that's happened since.

**Naming**: KIT is Nic's broader product family (KIT Safety, KIT
Construct, KIT Design) — this app is the **Product Timeline Audit App**,
"KIT Gap App" or "Gap App" for short, not bare "KIT." JSA/iTrack are
components of KIT Safety. See `docs/PRODUCT-VISION.md`.

## What this is, in one breath

KIT Gap Audit ("Gap App") is a Next.js app Nic Payne is building to turn
messy meeting/planning context into three things: **what's missing**
(gaps between what's been discussed/planned and what actually has a
Linear ticket), **what's undecided** (a Decision Queue leadership can
act on), and **when will it actually ship** (an AI-driven forecast, not
a guess) — now extended to a **portfolio view** across all three products
at once with live, draggable capacity/scope/date levers. It reads Linear
tickets directly, reads Notion/Figma/pasted spreadsheets as additional
context, and is meant to be callable by — and to eventually collaborate
with — a separate personal agent Nic runs called **Hermes**.

Repo: `nicrpayne/kit-gap-audit`. **Base branch is
`claude/product-timeline-audit-a72dmg`** — there is no branch literally
named `main` in this repo (confirmed via `git remote show origin`); every
feature branch is cut from and merged back into this one. Deployed on
Railway at `kit-gap-audit-production.up.railway.app`, gated by a single
shared password (`APP_PASSWORD`). **Production lags behind this branch
until Nic redeploys on Railway — always check before assuming a fix
described here is actually live.**

## Who's using it and why

Nic is a PM/lead on a small team (~4-5 devs) shipping two related mobile
products for a construction-safety company:
- **JSA** (Job Safety Analysis) — a Flutter forms app, closest to release.
- **iTrack** — incident/severity tracking + quality tracking, still in
  design, follows JSA in priority. Real Linear data: only 2 issues total
  as of this writing — genuinely early.
- Both depend on shared **Platform** work (infra, file storage, shared
  notification service, CI/CD, app-shell screens), now its own Scope with
  JSA/iTrack depending on it (see "Scope dependencies" below).

Real canonical Linear projects on team `SOF` (confirmed via the Linear
MCP tools, see "Linear access" below): `KIT JSA`
(`28a1de31-a367-462d-9828-a8f9d570f097`), `KIT Platform`
(`39699fa5-a920-412b-af8c-80780a1a9c3f`), `KIT iTrack`
(`659ac27f-2b63-4080-a85c-6ed4bae9458f`). **Decoy/near-duplicate projects
that exist on the same team and have burned time before**: `Legacy
Platform`, `Platform` (generic, shared across other teams too), `Safety
Legacy Portal` (also shared). There is **no** project named `KIT Safety
(JSA and iTrack)` any more — that was the original pre-split project and
any Scope still pointing at it by that name is stale (see "Known-fixed
scope-editor bug" below). Real remaining-ticket counts at last check: KIT
JSA 116 total/41 remaining/5 distinct assignees; KIT Platform 95
total/45 remaining/6 distinct assignees; KIT iTrack 2 issues total.

The whole point of the tool is Nic being able to answer "when do we
actually ship, and what's the honest confidence" for leadership — and,
as of this session, to actually **drive** that answer live on a
screen-share ("what if I move Sam onto Platform," "what if we accept two
weeks later," "what if we cut this feature") without it being a guess or
a vibes-based Slack update.

## Current status

Everything below marked **shipped** is built, has passed a full
`npm run build` + `npx eslint .`, and has been verified as far as this
sandbox's network restrictions allow (see "Testing discipline" below).

**Shipped and merged into the base branch:**
- v0 Audit + Decisions, V1 Forecast (AI estimation, Notion/Figma context,
  scenarios), V3 Reports — all pre-date this session, still the
  foundation everything else builds on.
- **Shared capacity pool + portfolio forecasting** (Person/Allocation/
  PortfolioSettings, scope dependency gates, lockstep joint simulation,
  `/portfolio` dashboard with live drag-to-preview).
- **Design language + momentum** (`/forecast`, `/reports`, `/portfolio`
  all carry momentum chips, betting-odds phrasing, Ask chips).
- **Scopes editing overhaul** (full edit UI, DELETE hardening, Nav fix).
- **Scenario Lever 1** (target date, both directions) plus two live bug
  fixes (garbled portfolio axis on wide date ranges; stale Scope project
  names invisible/unremovable in the edit UI).
- **Scenario foundation** (`ScenarioInputDelta`/`applyScenarioInputDelta`
  — one implementation of "Reality + a hypothetical, re-forecast," see
  `docs/SCENARIO-MODEL.md`) and the **capacity-scenario correctness fix**
  that followed it (the "+1 developer makes the date later" bug — see
  ROADMAP.md for the full root-cause writeup). Both merged to
  `claude/product-timeline-audit-a72dmg` at `46812f0`.

**Open, not yet merged** (branch `claude/portfolio-instrument-surface`,
cut from `46812f0`): the **Portfolio Instrument Surface** — `/portfolio`'s
old vertically-isolated release-date cards, the "+1/+2 developer" opaque
buttons, and the overlay toggle are replaced by a single dark "Instrument"
surface inside the Workbench shell: a Forecast Canvas (every Scope on one
shared axis, Reality-vs-Scenario ghosting built in), an explicit Capacity
Control (Reality/Scenario FTE, safe decrement/reset), and a persistent
contextual Inspector (deterministic "why" explanations, target-date lever,
Ask Hermes). See `docs/PRODUCT-VISION.md`, `docs/DESIGN-NORTH-STAR.md`,
and ROADMAP.md's newest entry for the full writeup. **Not yet clicked
through by Nic — do not merge without an explicit instruction to do so.**

**V2 Timeline** is still genuinely NOT built — `/timeline` renders a
placeholder. Deliberately deprioritized; do not assume it exists.

**Context Package Foundation, Phase 1a** (this branch,
`claude/gap-app-context-sources-hwy0v3`) — foundation-only, nothing wired
in. Followed a two-turn architecture assessment (repository/data-flow audit
of every existing context-like mechanism — Linear, Notion/Figma, the audit
Source/Finding pair, Reports, uploads — then a Source Lifecycle/Context
Package reconciliation) neither of which is reproduced here; see
`docs/CONTEXT-MODEL.md` for what actually shipped. Ships: a versioned
`ProjectContextPackage` v1 TypeScript contract (`lib/context/package.ts`)
with hand-rolled validation (`lib/context/validate.ts`, no new dependency)
and a deterministic hash (`lib/context/hash.ts`); a `SourceRegistration`
table (tracking policy for a recurring source — candidate/active/paused/
superseded/retired, role independent of status, `statusReason` required on
every status change) with minimal CRUD API
(`/api/source-registrations[/:id]`); a `ContextSnapshot` table (one
immutable, frozen package instance, idempotent by `(producer, packageId)`,
created only by `lib/context/snapshot.ts`'s `persistContextSnapshot()`);
and nullable `contextSnapshotId`/`evidenceRefs` provenance fields on
`Finding`, `contextSnapshotId` on `Report`. All four are additive —
verified against real local Postgres that persisting a JSA-infra-shaped
package round-trips exactly (structured `data` fields, `derivedClaims`,
completeness, `observedAt` semantics all intact), that a retried push is
idempotent, that changing a `SourceRegistration`'s status afterward does
NOT mutate an already-persisted snapshot, and that existing/old-style
`Finding`/`Report` rows with no snapshot reference are unaffected. **Zero
existing routes, pages, or flows call any of this yet** — `/api/refresh`,
`runAudit()`, `generateReport()`, `computeForecast()`, `/portfolio`,
Momentum, and every simulation module are byte-for-byte unchanged. `npx tsc
--noEmit`, `npx eslint .`, `npm run build` all clean. **Not yet merged, not
yet clicked through by Nic** — do not merge without an explicit instruction
to do so. Phase 1b (wiring one real ingestion path — a package-assembler
for the `ContextDoc`/spreadsheet case, extending `POST /api/refresh` to
accept an optional package) and Phase 1c (a read-only
`ProjectIntelligenceEnvelope` endpoint) are designed but explicitly not
started.

**Context Package Foundation, Phase 1b** (same branch, built on top of
Phase 1a) — hardened Phase 1a's validation (malformed evidence now REJECTS
the whole package instead of being silently dropped; referential integrity
enforced -- duplicate ids and dangling `evidenceRefs`/`sourceRef` pointers
rejected; identity collision detected -- same `(producer, packageId)` with
different content now throws `PackageIdentityConflictError` rather than
overwriting or silently reusing; a package's `scopeId` is checked against
the request's expected scope) and wired ONE real ingestion/provenance path
end to end. `Finding.sourceId` is now nullable (`AuditRun.sourceId` too) --
the real blast-radius finding here: every place that found "this Scope's
Findings" (`lib/forecast/compute.ts`, `lib/estimate/runForScope.ts`,
`lib/audit/run.ts`'s own re-raise guard) did it exclusively through the
Finding→Source relation, which would have made a package-derived Finding
(no Source, by design -- never fabricated) invisible everywhere; all three
now check `Source.scopeId` OR `ContextSnapshot.scopeId`. `POST /api/refresh`
additively accepts an optional `contextPackage`, persists exactly ONE
`ContextSnapshot` at the request boundary (the sole call site for
`persistContextSnapshot()` in the whole codebase), and threads that same
snapshot id into `runAudit()` and `generateReport()` -- neither creates a
second snapshot. `runAudit()`'s `input` is now optional and package
evidence is rendered to the model as its own block (never flattened into
the transcript string) with instructions to cite evidence ids back in a
new `evidenceRefs` field, safety-net-intersected against the real evidence
set before anything is written. Proved end to end with a synthetic
JSA-Infrastructure-Alignment-tracker package (`infra-row-10`/`infra-row-13`,
real structured fields): package accepted → one snapshot → audit (Linear
via `KIT_DEV_FIXTURES=1`, the LLM call mocked via `runAudit()`'s existing
`options.complete` injection point -- no `ANTHROPIC_API_KEY` in this
sandbox, clearly flagged rather than faked) → one `missing_work` Finding
with `sourceId: null`, `contextSnapshotId` set, `evidenceRefs:
["infra-row-13"]` → the full chain (Finding → snapshot → evidence item →
source manifest entry → `SourceRegistration`) walks end to end →
`computeForecast()` picks it up through the exact existing unticketed-
Finding path (`unticketedFindingCount` +1, `remainingIssueCount`
unchanged, no double count on a second read) → a generated Report
references the same snapshot id. Also proved: superseding the
`SourceRegistration` afterward changes nothing about the already-persisted
snapshot or the Finding's provenance -- no auto-resolution, no lost
history. `npx tsc --noEmit`, `npx eslint .`, `npm run build` all clean;
diffed against the Phase 1a commit to confirm `lib/forecast/simulate.ts`,
`lib/forecast/portfolio.ts`, `lib/capacity/resolve.ts`, `lib/scenario/`,
and `lib/momentum/` are byte-for-byte untouched. **Not yet merged, not yet
clicked through by Nic.** Still NOT Hermes integration -- every proof used
a synthetic package; no Notion/Figma/spreadsheet-connector assembler, no
`ProjectIntelligenceEnvelope`, no Context Workbench UI exist yet. See
`docs/CONTEXT-MODEL.md`.

## Tech stack

- **Next.js 15** (App Router, TypeScript), **React 19**
- **Postgres** via **Prisma 6** (`prisma/schema.prisma`); Railway-hosted
  in prod, local Postgres 16 for dev in this sandbox
- **Tailwind v3** (not v4 — v4's `@tailwindcss/oxide` native binary
  failed to build on Railway's Nixpacks image; downgraded, visually
  confirmed identical)
- **`@anthropic-ai/sdk`**, wrapped in `lib/model.ts` — every LLM call goes
  through `completeJson()` (model config, defensive JSON parsing,
  truncation detection). Model configurable via `AUDIT_MODEL`. **Standing
  rule established this session: no LLM call anywhere in the
  deterministic simulation/preview/drag path.** The only allowed LLM
  surfaces are the existing cached AI estimator (`lib/estimate/`) and
  explicitly user-triggered "Ask" explanations (`POST /api/forecast/ask`)
  — never anything automatic on a recompute, drag frame, or page load.
- **`@linear/sdk`** for auth/team/project listing only; the issue-fetch
  path (`getScopedIssues` in `lib/linear.ts`) uses a raw GraphQL query to
  avoid the SDK's lazy-relation N+1 problem that once blew Linear's rate
  limit. 2-minute in-process cache.
- **Notion & Figma**: raw REST (`lib/notion.ts`, `lib/figma.ts`), 5-minute
  caches, injectable `fetch`.
- **`exceljs`** for server-side `.xlsx` parsing (deliberately not
  `xlsx`/SheetJS — unpatched CVEs).
- Auth: httpOnly cookie session (`middleware.ts`) for the browser, plus
  `Authorization: Bearer <APP_PASSWORD>` on every `/api/*` route for
  programmatic callers (Hermes, and this sandbox's own test scripts).

## Data model (`prisma/schema.prisma`)

- **`Scope`** — the central concept. Team + `projectNames: String[]`
  (union match) + optional label filter, `targetDate`, `teamCapacity`
  (now a *fallback*, see capacity pool below), `includeTriage`,
  `estimationContext`, `notionPageIds[]`, `figmaRefs[]`, and (new this
  session) **`dependsOnScopeIds: String[]`** — other Scopes this one
  can't finish ahead of (JSA/iTrack depend on Platform). Also has
  `allocations Allocation[]` (new).
- **`Person`** (new) — `id, name, fte (default 1.0), active`. Deliberately
  lightweight, not a generic HR/user system — models "Sam is 60% JSA,"
  not an anonymous headcount integer.
- **`Allocation`** (new) — `personId, scopeId, fraction` (share of *that
  person's* time, not a global FTE number — multiply by `Person.fte` to
  get an FTE contribution), unique per `(personId, scopeId)`. A person's
  fractions across all their allocations must sum to ≤ 1.0 — **rejected
  with a 400 if violated, never silently clamped** (`validateAllocations`
  in `lib/capacity/resolve.ts`).
- **`PortfolioSettings`** (new) — singleton row (`id = "singleton"`),
  currently just `contextSwitchCostPct` (default 0 — a visible, user-set
  lever, never an inferred or baked-in "industry" number, same rule as
  everywhere else in this app).
- **`Source`**, **`WorkEstimate`**, **`Report`** (now also fetched
  per-scope for the portfolio momentum strip via `lastReport`),
  **`ContextDoc`**, **`AuditRun`** — unchanged, see inline schema comments
  for exact shapes. Nothing is ever deleted from these; full traceability
  is a standing requirement.
- **`Finding`** — unchanged except two new nullable fields this session,
  `contextSnapshotId`/`evidenceRefs` (see Context Package Foundation
  below); nothing sets them yet.
- **`SourceRegistration`**, **`ContextSnapshot`** (both new this session) —
  see "Context Package Foundation, Phase 1a" above and
  `docs/CONTEXT-MODEL.md`.

## Feature rundown

### v0 — Audit + Decisions (shipped, oldest, most battle-tested)

Unchanged this session. Paste/upload a transcript/notes/spreadsheet at
`/audit/new`, `runAudit()` extracts findings, each can be **Draft
ticket** or **Dismiss**. `/decisions` is the Decision Queue view.

### V1 — Forecast (shipped, extended this session with momentum)

`/forecast`. Monte Carlo simulation (`lib/forecast/simulate.ts`),
AI-based three-point estimation, "Paths to a sooner date" scenarios,
"Why this date?" panel — all as before. **New this session**: a momentum
strip (delta vs. the last report, betting-odds phrasing) and Ask chips
(see "Design language + momentum" below).

### V3 — Reports (shipped, extended this session with momentum)

`/reports`. Same generation pipeline as before; now also surfaces
momentum/attribution ("date moved 6 days later, mostly because 2 new
findings landed").

### V2 — Timeline (still NOT built)

`/timeline` is still a placeholder page (`<ComingNext>` — confirmed via
`git log -- app/timeline/` that it's unchanged since the original
scaffold commit). Genuinely deprioritized; do not describe it as built.

### Multi-source estimator context, spreadsheet upload, audit Kind field

Unchanged from before this session — see inline code comments in
`lib/notion.ts`, `lib/figma.ts`, `lib/client/uploadFile.ts`,
`app/api/parse-spreadsheet` if you need the detail.

## Shared capacity pool + portfolio forecasting (shipped this session — the big one)

This is the largest addition since the last handoff. Full build plan is
`/root/.claude/plans/piped-wiggling-stream.md` if you need the original
reasoning; the summary below is what actually landed.

**The problem it solves**: each Scope used to carry an independent
`teamCapacity` number, and Platform tickets were pulled into *both* JSA
and iTrack via the `projectNames` union — so bumping capacity to account
for one new hire made both forecasts improve as if that person worked
full-time twice, and Platform work was double-counted in the combined
picture.

**The fix, structurally:**
1. **`Person`/`Allocation`/`PortfolioSettings`** (see Data model above)
   let one person's time be split with fractions that must sum to ≤ 1.0.
2. **Platform became its own Scope**, with JSA and iTrack each carrying
   `dependsOnScopeIds: [platformScopeId]` instead of pulling Platform
   tickets into their own union.
3. **`lib/capacity/resolve.ts`** (`resolveCapacity`, `validateAllocations`,
   `unallocatedCapacity`) — **pure and isomorphic, no Prisma import** —
   deliberately, because the portfolio dashboard re-runs it client-side
   on every drag frame. Fallback chain: ≥1 real allocation → allocations;
   else `scope.teamCapacity` → explicit; else infer from distinct Linear
   assignees → inferred (original behavior, untouched). With zero
   `Person` rows this is a proven no-op — verified against real Postgres
   that every existing Scope's forecast is byte-identical to before.
4. **Lockstep joint simulation** (`lib/forecast/portfolio.ts`,
   `runPortfolioTrials`/`runPortfolioSimulation`) — this is what makes
   cross-scope dependency risk *genuinely correlated* rather than
   independently bootstrap-resampled (an earlier, broken approach that
   was replaced — see ROADMAP.md commit `7709d50` "Replace
   bootstrap-resample dependency modeling with lockstep simulation" if
   you need the history). A single outer trial loop is shared across an
   entire dependency component; a dependent scope reads its dependency's
   value **at the same trial index**, not a random resample, so "Platform
   ran long in trial #4302" consistently makes every dependent scope
   also run long in trial #4302. Topologically orders scopes by
   `dependsOnScopeIds`; throws a clear, named error on cycles rather than
   looping forever.
5. **Percentile/confidence pure lookups**
   (`lib/forecast/simulate.ts`): `percentileDay(sorted, p)` (exported —
   "what day-count for N% confidence") and `confidenceAtDay(sorted,
   targetDays)` (extracted from what used to be inline logic in
   `summarizeCompletionDays`, which now calls both instead of duplicating
   the logic) — the basis for the target-date scenario lever (see below),
   zero new simulation runs needed to answer either direction.

**The `/portfolio` page and its preview architecture** — the part that
makes dragging feel instant:
- **`GET /api/portfolio/inputs`** — the one expensive call per page load.
  Returns, per scope, the built forecast inputs, resolved capacity +
  contributors, dependency edges, target date, and (new) each scope's
  `lastReport` for the momentum strip.
- **`POST /api/portfolio/preview`** — accepts hypothetical
  allocations/settings, **persists nothing**, returns recomputed
  forecasts. Exists for programmatic/MCP what-if callers; the browser UI
  doesn't need it because of the next point.
- **`components/PortfolioPageClient.tsx`** re-runs `resolveCapacity` +
  `runPortfolioSimulation` **directly in the browser** on every drag
  frame — zero network calls while previewing. Explicit "Save" vs.
  "Discard" actions commit or throw away the preview.
- Confidence bands render as absolutely-positioned HTML on a percentage
  basis (no charting library, no SVG except the pre-existing
  `ConfidenceRing`), matching the rest of the app's flat, no-gradient
  visual language.
- Portfolio insights panel: auto-surfaced observations ("iTrack finishes
  38 days before JSA," "2.5 FTE unallocated," "Sam is over-allocated at
  110%," "Platform is on the critical path for both").

**Standing rule from this phase, still binding**: any change that would
touch `simulate.ts`'s core Monte Carlo sampling/aggregation math requires
stopping and reporting back before proceeding. Every phase since the
lockstep fix has explicitly not needed this and confirmed so in writing
before starting each one.

## Design language + momentum (shipped this session)

Driven by `DESIGN_LANGUAGE_AND_MOMENTUM_BUILD_BRIEF.md` (committed to the
base branch — read it directly for the full prose spec/principles).
Applied in the brief's own recommended order: `/forecast` → `/reports` →
`/portfolio` (compact strip variant, brief item #9).

**Principles**: one hero stat per screen, progressive disclosure
(collapsed/expanded), momentum over snapshots, betting-odds phrasing over
raw percentages ("about as likely as not" vs. "52%"), "Try" chips (change
something, see a result) vs. "Ask" chips (ask something, get an
explanation) as the same interaction pattern with different intent, flat
surfaces (no gradients/shadows), sentence case throughout.

**`lib/momentum/`**:
- `compute.ts` — `computeMomentum` (pure delta math; "stalled" threshold
  is <1 day of date movement **and** <5 percentage points of confidence
  movement), `dateDeltaPhrase`, `bettingOddsPhrase`.
- `attribution.ts` — `attributionSentence`/`reportAttributionSentence`,
  priority order: a resolved blocking decision > fresh AI estimates >
  shipped-ticket count.
- `askPrompt.ts` — the prompt builder behind `POST /api/forecast/ask`
  (the one explicitly user-triggered LLM surface in this whole momentum
  system).
- `lib/reports/changes.ts`'s `computeChangesSince` is shared by both
  report generation and the live momentum strip so the two never drift
  out of agreement.

**Components**: `MomentumChip.tsx`, `Sparkline.tsx`, `AskChips.tsx`,
`CalibrationLink.tsx` — used across `ForecastView.tsx`,
`ReportsPageClient.tsx`, and the portfolio strip in
`PortfolioPageClient.tsx`.

## Scopes editing overhaul (shipped this session)

Before this session `/scopes` only supported create/delete — no edit UI
existed at all, even though `PATCH /api/scopes/:id` (including
`dependsOnScopeIds` validation) had shipped server-side earlier. That gap
is exactly why "reconfigure a Scope's projects" used to look like it
required delete-and-recreate.

`components/ScopesManager.tsx` was substantially rewritten:
- `ScopeFormFields` — shared between "Add scope" and per-row "Edit."
- `useLinearTeams`/`useLinearProjects` hooks — live Linear project
  checkboxes per selected team.
- `EditScopeRow` — inline edit per scope row.
- **Rename control** added (the PATCH endpoint already supported it,
  there was just no UI button for it).

**`DELETE /api/scopes/:id` hardened**: previously an uncaught Prisma FK
error (bare 500) if the Scope had any `Report`/`Source`/`WorkEstimate`/
`ContextDoc` history, since those don't cascade (unlike `Allocation`,
which cascades intentionally). Now pre-checks all four plus whether any
other Scope's `dependsOnScopeIds` references this one, returning a clear
409 naming exactly what's attached.

**Known-fixed bug worth knowing about** (found from Nic's own screenshot
after he ran a manual scope consolidation): the project checkbox list
only ever rendered *currently live* Linear projects for the selected
team — so a saved `projectNames` entry that no longer matched any live
project (e.g. the old `KIT Safety (JSA and iTrack)` name) had **no
checkbox to uncheck**, meaning editing could only ever *add* a project,
never remove a stale one. Fixed by rendering any unmatched saved entry as
its own flagged, removable badge ("not a current Linear project" +
Remove button) right alongside the live checkboxes. **This fix is on
`claude/portfolio-scenario-levers`, not yet merged/deployed** — see
"Where things actually stand."

**Nav fix**: `components/Nav.tsx`'s "COMING NEXT" section used to claim
Forecast/Portfolio/Timeline/Reports were all still upcoming, which was
stale and wrong for three of the four. `PRIMARY_TABS` now correctly
includes Forecast/Portfolio/Reports; `COMING_NEXT_TABS` correctly
contains only Timeline, which genuinely is still a placeholder.

## Portfolio scenario levers — in progress (open branch, not merged)

Driven by `PORTFOLIO_SCENARIO_LEVERS_BUILD_BRIEF` (committed to the base
branch — read it directly for the full spec). Four levers, in the
brief's recommended order, all sitting alongside the existing
allocation-drag lever in the same preview/override mechanism:

1. **Target date, both directions** (done, on
   `claude/portfolio-scenario-levers`) — `TargetDateLever` component in
   `PortfolioPageClient.tsx`. Bidirectional: drag the date and see
   confidence recompute (`confidenceAtDay`), *or* set a target confidence
   and see what date that requires (`percentileDay` + `addDays`) — both
   pure reads over the already-computed `completionDaysSorted` array, no
   new simulation trials. Explicit "Save target date" button (only shown
   when dirty) PATCHes `/api/scopes/:id`.
2. **Context-switch/focus toggle** — not started. Per the brief, check
   what already exists first: `PortfolioSettings.contextSwitchCostPct`
   and its math in `resolve.ts` already exist from Phase 1 of the
   capacity pool work, so this is likely mostly UI framing, not new
   plumbing.
3. **Dependency-relief preview** — not started. Reuse the existing
   lockstep orchestration in `portfolio.ts` with a modified/removed
   dependency edge; the brief asks for the correlation to be proven
   explicitly, the same way the original lockstep fix was.
4. **Scope-cut** — not started, most involved. There is no DB concept
   today of "manually excluded ticket" — needs new schema. The
   live-preview half should be cheap since simulation items are already
   client-side once `/api/portfolio/inputs` has loaded.

**Two live bugs found and fixed on this same branch** during Nic's own
manual testing (not part of the levers brief, but fixed here since they
blocked his testing):
- **Garbled/overlapping month-axis labels on `/portfolio`** for scopes
  forecasting far out — `monthTicks()` used to advance by exactly one
  month per tick regardless of total span, so a multi-year range produced
  30-50+ crammed, overlapping labels. Fixed with a new `monthStep(spanDays)`
  helper that adaptively sizes the tick interval (1/2/3/6/12 months
  depending on total span). Verified via Playwright with a fixture
  forecasting to 2030 — 10 evenly-spaced, non-overlapping ticks.
- **Stale Scope project names invisible/unremovable in the edit UI** —
  see "Scopes editing overhaul" above, this is the same fix, just also
  listed here since it was found via scenario-levers-branch testing.

**Investigated, not fully resolved**: Nic reported one scope forecasting
out to 2029 (+847 days vs. saved). Using real Linear data pulled via the
MCP tools (see "Linear access" below), confirmed the double-project scope
was pulling 86 combined open tickets (vs. 41 for JSA alone) — consistent
with, but not conclusively proven as, the sole cause, since this sandbox
still can't reach the actual resolved team-capacity numbers in production
Postgres. **Recommended follow-up, not yet done**: re-check this scope's
forecast after the (now-completed, per Nic's screenshot) scope
consolidation to see if the number resolves to something sane.

## Scenario foundation — Phase 1 of a larger architectural evolution (open branch, not merged)

Separate from the scenario-levers brief above. Nic gave a north-star
product direction — KIT evolving into an explicit "delivery-simulation
instrument" with a structural Reality / Scenario / Forecast distinction,
eventually A/B/C/D saved scenarios, direct manipulation, and a
darker "Instrument Mode" surface for Forecast/Portfolio — and asked for an
architectural assessment before any of that gets built. The assessment
(full text lives in that conversation, not repeated here) found that the
hard part already existed correctly (`runPortfolioSimulation` already
takes arbitrary specs and doesn't care if they're real or hypothetical);
what was missing was a *name* for "Reality + a hypothetical change," which
existed as two independently-diverged implementations
(`PortfolioPageClient.tsx`'s local `specsFor()` and
`POST /api/portfolio/preview`'s inline logic, the latter unreachable from
the browser).

**Phase 1** (branch `claude/scenario-input-delta`, cut from
`claude/portfolio-scenario-levers`) named and unified that transform —
`ScenarioInputDelta` + `applyScenarioInputDelta` in
`lib/scenario/inputDelta.ts`, `compareToBaseline` in
`lib/scenario/compare.ts` — and deleted both duplicate implementations.
Deliberately narrow: it covers only today's input-side levers
(allocations, hypothetical people, context-switch cost); target date
stays outside it on purpose, since it's an output-side/evaluation read
against an already-simulated distribution, not something that needs the
engine to re-run. **Full writeup: `docs/SCENARIO-MODEL.md`** — read that
before touching anything in `lib/scenario/` or the Portfolio
preview/apply path. Zero schema changes, zero visual changes, zero
changes to `simulate.ts`/`portfolio.ts`/`resolve.ts`/`scenarios.ts`.
Verified via a fixture regression script (old vs. new spec-building,
byte-identical across every capacity-source case and a dependency chain)
and a real-browser Playwright run confirming the lockstep correlation
still works end to end after the refactor. **Not yet merged, not yet
clicked through by Nic** — do not merge without explicit instruction.

Explicitly NOT part of Phase 1 (all future, all unstarted): the visual/
Instrument-Mode redesign, a Forecast Canvas, the resource mixer, saved
A/B/C/D scenarios, target-seeking as a first-class lever, any Hermes
changes, and Scenario Levers 2-4 from the brief above.

**Follow-on: capacity-scenario correctness fix** (same branch,
`claude/scenario-input-delta`, commit after Phase 1) — Nic's hands-on
click-through of Phase 1 found a real, reproducible bug: the "+1
developer" / "+2 developers" quick actions on `/portfolio` could make a
scope's forecast date *later*, non-monotonically, the more capacity you
added. Root cause traced (not assumed) to `resolveCapacity`
(`lib/capacity/resolve.ts`, **left completely unchanged** by the fix):
its three-rung fallback chain (allocations > explicit > inferred) is
correct for authoritative Reality but is mutually exclusive — the instant
*any* allocation-shaped entry exists for a scope (a hypothetical ghost,
or an existing real person moved in from another scope), the chain
switches that scope's capacity source to "allocations" and computes
*only* from that entry, silently discarding whatever aggregate number
(explicit or inferred) was there a moment before. Confirmed present on
the base branch too (not a Phase 1 regression) via byte-identical-file
diffs and independent reproduction on both branches.

**The fix** (fully implemented, `lib/scenario/inputDelta.ts` +
`lib/scenario/namedTransfer.ts` (new) + `PortfolioPageClient.tsx`'s
`save()` + a new server-side check in `app/api/allocations/route.ts`):
`ScenarioInputScope` gained one field, `capacitySource`, carrying
Reality's own capacity source for that scope (fixed before any scenario
is applied). `applyScenarioInputDelta` now branches on it: an
allocations-sourced scope behaves exactly as before (unchanged); an
aggregate (explicit/inferred) scope preserves its resolved baseline
untouched and adds the scenario's contribution on top via a second
`resolveCapacity` call. Commit rules (approved product decisions, not
just an implementation choice): anonymous/net-new capacity added to an
aggregate scope commits by updating `explicitTeamCapacity` (deliberately
converting `inferred → explicit`, surfaced to the user via a live
"Saving this will..." summary, never silent) — never a fabricated
`Person`/`Allocation` row. A **named, real person's** reallocation
commits only when every scope they touch is allocations-sourced; if any
touched scope is aggregate-sourced, that person's **entire** allocation
set is excluded from that Save (both legs of a move, not just the
aggregate-destination leg) so Reality never ends up with, e.g., a person
shown reduced on their source scope while the corresponding increase at
an untracked destination silently vanishes. Preview still shows the full
hypothetical trade either way — only *commit* is restricted; Scenario is
explicitly allowed to model things Reality can't yet persist. Server-side
defense-in-depth: `PUT /api/allocations` independently rejects (409) any
write that would create the first-ever `Allocation` row on a scope that
currently has none, regardless of caller (UI, script, Hermes, a future
client) — a single cheap Postgres query, no Linear dependency.

Verified: 14 pure-math fixture checks (all four capacity-source cases +
the mixed case + determinism + dependency preservation), real-Postgres
persistence tests (server 409 rejection, valid allocations-sourced
writes, explicit/inferred-to-explicit conversion with zero stray
Person/Allocation rows), and three real-browser Playwright runs
(full save() flow through real persistence including the named-move
atomicity proof, the unaffected allocations-sourced happy path, and
Discard). Full detail: `docs/SCENARIO-MODEL.md`. **Not yet merged, not
yet clicked through by Nic** — do not merge without explicit instruction.

Deliberately NOT touched: `resolveCapacity`'s fallback semantics,
`simulate.ts`, `portfolio.ts`, the Prisma schema, the visual design, and
(flagged, not fixed) whether a ghost added to an *already*
allocations-sourced scope should also stay anonymous rather than minting
a "New developer N" `Person` row — evidence strongly suggests it should,
but it's a data-hygiene question, not a correctness bug, and was
explicitly kept out of this fix's scope.

**Known trade-off worth knowing about**: the new server-side invariant on
`PUT /api/allocations` means there is currently no supported way — client
or direct API — to set up person-level tracking for a scope **for the
first time**, even as one deliberate, complete, multi-person request. It
rejects the first allocation onto any scope with zero existing ones,
unconditionally, because it can't distinguish a legitimate one-shot setup
from the same partial-write bug via a different call shape. That's a real
capability gap, not an oversight — converting an aggregate scope to
tracked people needs its own deliberate mechanism, not built yet.

## Linear access — an important sandbox capability correction

This sandbox has **two separate network paths to Linear**, discovered
this session, with very different reachability:
- **The app's own code** (`@linear/sdk`, raw GraphQL calls in
  `lib/linear.ts`) calls `api.linear.app` directly — **still blocked** in
  this sandbox, same as always (see "Testing discipline" below).
- **`mcp__Linear__*` MCP tools** (list_projects, list_issues, get_team,
  etc.) go through a **separate, working** network path and give genuine
  read/write access to the real Linear workspace. This means real
  investigation of Linear data (project lists, ticket counts, assignees,
  states) **is possible from this sandbox** even though the deployed app
  itself, its own Linear calls, the Railway Postgres DB, and the
  production app URL remain unreachable. Used this session to ground the
  scope-consolidation instructions and the +847-day investigation in
  verified real data instead of guessing. Reach for these tools whenever
  a task needs to know what's actually true in the real Linear workspace.

## Programmatic API + `POST /api/refresh` — the Hermes integration surface

Unchanged this session — full detail preserved from the prior handoff:

**Hermes** is Nic's separate personal agent (decision/commitment ledger,
broader conversational context Gap App can't see directly). **Critical
architectural fact**: this is a **push, not a pull** — Gap App cannot
reach into Hermes' local state, so any Hermes context has to be pushed
into Gap App by Hermes itself, via:
- `Authorization: Bearer <APP_PASSWORD>` on every `/api/*` route.
- **`POST /api/refresh`** — one call to push context docs, optionally
  audit a new transcript, re-run AI estimation, re-run the forecast, and
  optionally generate a report. Response includes `contextComplete:
  boolean` / `contextIssues: string[]` so an unattended run can be
  distrusted explicitly rather than silently wrong. Pushes context docs
  *before* anything Linear-dependent, so a Linear outage doesn't lose a
  freshly pushed brief. Upserts by `(scopeId, label)`.
- **The scoped-brief prompt pattern** (manual today): ask Hermes for a
  *scoped* context brief for one product, explicitly told to leave out
  anything not clearly relevant — never dump the whole ledger in.

**Still explicitly NOT built**: routing (which Scope a transcript
belongs to), notifications either direction, a scheduled/cron trigger.

## Planned, not built

Roughly in priority order:
1. **Finish the scenario-levers brief** (Levers 2-4 above) — active work.
2. **Cross-project ticket-level dependency modeling** — a specific
   Platform ticket blocking a specific JSA ticket, from Linear's native
   issue-blocking relations, modeled as a critical-path gate. The scope-
   level dependency gates (`dependsOnScopeIds`) shipped this session
   answer "what are the numbers"; this would answer "why do they move."
   Not started.
3. **Points-to-days calibration from real velocity** — `issueEstimateToThreePoint`
   in `lib/forecast/build.ts` is a documented placeholder. Worth
   revisiting once there's enough completed-ticket history.
4. **Timeline/Gantt (V2)** — deferred, still a placeholder.
5. Hermes-side automation: routing, notifications, a scheduled trigger.
6. **Persistent automated test suite** — explicitly flagged by Nic as a
   real gap, deliberately deferred to its own dedicated conversation
   "after Phase 2 settles" — **not to be raised proactively**, but should
   happen before Phases 4-6 below.
7. `linearIssueUrl` on `Finding` (currently just the identifier).
8. `package.json#prisma` seed config deprecation warning — cosmetic.
9. (From the original capacity-pool plan, still not started) Provenance
   badges, an in-process MCP server at `/api/mcp`, an outbound webhook to
   Hermes — see `/root/.claude/plans/piped-wiggling-stream.md` for the
   full original spec on these if picked back up.

## Recent bugs fixed (useful not to repeat)

Pre-this-session fixes (Linear rate-limit blowout, November forecast
blowup, audit JSON-truncation crash, spreadsheet-upload 500, Tailwind v4
build failure) are unchanged from before — see git log if you need the
detail. **This session's fixes**, roughly chronological:
- Duplicate scope names + stray "New developer NN PREVIEW" ghost rows on
  `/portfolio` — duplicate-name guard on `POST/PATCH /api/scopes*`, plus
  a per-row Remove action for both ghost and real people.
- `PUT /api/allocations` batch write was not actually atomic against a
  duplicate-pair payload — hit the DB's unique constraint mid-transaction,
  uncaught, bare 500. Fixed with an explicit pre-check (clean 400) plus a
  try/catch as defense in depth; atomicity re-verified directly against
  real Postgres afterward.
- Broken bootstrap-resample dependency modeling replaced with lockstep
  joint simulation (see capacity-pool section above) — the resample
  approach could not produce genuinely correlated cross-scope risk.
- Garbled portfolio axis on wide date ranges; stale project names
  invisible/unremovable in the scope editor — both described in detail
  above, both on the still-open `claude/portfolio-scenario-levers` branch.

## Deployment

Railway, Nixpacks build. `railway.json`'s start command is `npx prisma
migrate deploy && npm run start`. Env vars: `DATABASE_URL`,
`LINEAR_API_KEY`, `ANTHROPIC_API_KEY`, `AUDIT_MODEL`, `APP_PASSWORD`,
`NOTION_API_KEY` (optional), `FIGMA_API_KEY` (optional). Nic redeploys
manually — **always check whether he has before assuming a fix is live.**

## Testing discipline (important, and corrected this session)

This sandbox's egress is restricted: `api.linear.app` (from the app's own
SDK/GraphQL code), `api.notion.com`, `api.figma.com`, `*.up.railway.app`,
and the Railway Postgres TCP proxy are all **blocked**. `api.anthropic.com`
is reachable. **New this session**: the `mcp__Linear__*` MCP tools give a
genuinely separate, working path to real Linear data — see "Linear
access" above; don't assume "Linear is blocked" applies to those tools.

- Pure logic gets a fixture-based unit test in a temporary
  `scripts/*.ts`/`.mjs` file, run via `npx tsx` or `node`, deleted after
  passing. For refactors of existing pure functions, prove
  behavior-preservation explicitly (old output vs. new output on the same
  fixtures) before layering new capability on top.
- **Playwright correction — the old handoff was wrong about this.**
  Headless Chromium is **pre-installed** at `/opt/pw-browsers/chromium`
  and the `playwright` package is **pre-installed** at
  `/opt/node22/lib/node_modules/playwright` — it is NOT a per-session
  `npm install --no-save playwright` dependency as the previous version
  of this doc claimed, and it does not need to be uninstalled afterward.
  Launch with `chromium.launch({executablePath:
  "/opt/pw-browsers/chromium"})`; import the package from the absolute
  path `/opt/node22/lib/node_modules/playwright/index.mjs` if a local
  `node_modules/playwright` isn't present. Test against **local Postgres**
  (`postgresql://postgres:localdev@localhost:5432/kit_gap_audit` — the
  `postgres` role's password was set to `localdev` this session), with
  Linear/Notion/Figma responses mocked via `page.route()` where the flow
  needs them. Local auth: `Authorization: Bearer kit-jsa-dev`
  (`APP_PASSWORD` in local `.env`).
- Local Postgres drops between shell invocations in this sandbox —
  `service postgresql start` before any DB-dependent command.
- Anything that genuinely needs the app's own Linear/Notion/Figma/Railway
  calls is acknowledged as untested-from-here and flagged as such. The
  one reliable real-integration check for those routes is confirming they
  fail *gracefully* with the same "Couldn't read tickets from Linear:
  ...403 Host not in allowlist..." signature before/after a change —
  used repeatedly this session as a cheap regression check.

## Where things actually stand (git state, check this first)

Base branch: `claude/product-timeline-audit-a72dmg`. Merged into it, most
recent first: `claude/scenario-input-delta` (scenario foundation +
capacity-scenario correctness fix, fast-forward merge, base HEAD now
`46812f0`), scopes-fix (`claude/scopes-fix`), design-momentum
(`claude/design-momentum`), portfolio-capacity-pool
(`claude/portfolio-capacity-pool`, Phases 1-3 + a post-review atomicity
bugfix). Note: `claude/portfolio-scenario-levers` (Lever 1 + two bug
fixes) is folded into base too, since `claude/scenario-input-delta` was
cut from its HEAD and base was fast-forwarded through it.

**Open, not merged**: `claude/portfolio-instrument-surface`, cut from base
at `46812f0` — the Portfolio Instrument Surface (Forecast Canvas,
Capacity Control, Scenario Inspector, Instrument Footer; see "Current
status" above and ROADMAP.md's newest entry for the full writeup).

**Do not merge any branch into base without an explicit instruction to do
so** — every merge this session was explicitly requested first, and that
pattern should continue. Check `git log --oneline -15` and `ROADMAP.md`'s
top summary for anything more recent than this doc.

## Where to look for more

- **`docs/PRODUCT-VISION.md`** — what this app is *for*: the product-
  delivery-simulation framing, Reality/Scenario/Forecast, the live-call
  use case, the naming convention (this app vs. the broader KIT family),
  "play the project." Read this before making any product-level judgment
  call.
- **`docs/DESIGN-NORTH-STAR.md`** — what it should *feel like*: Workbench
  vs. Instrument surfaces, direct-manipulation principles borrowed from
  pro creative tools (explicitly without their visual chrome), the
  simple-surface/deep-on-demand rule, color/motion/accessibility
  conventions. Read this before touching any `/portfolio` UI.
- **`README.md`** — setup instructions, all API endpoint docs.
- **`ROADMAP.md`** — chronological build log with full reasoning behind
  each decision, kept up to date after every merged unit of work. More
  granular than this document — read it for the "why" behind anything
  summarized here, and check its "Where things stand" header first, since
  it's usually the freshest single source of truth on active work.
- **`DESIGN_LANGUAGE_AND_MOMENTUM_BUILD_BRIEF.md`** and
  **`PORTFOLIO_SCENARIO_LEVERS_BUILD_BRIEF`** — the two build briefs
  driving an earlier session's design/momentum and scenario-levers work,
  committed to the base branch, worth reading directly rather than
  relying solely on this summary.
- **`docs/SCENARIO-MODEL.md`** — describes what the scenario-foundation
  refactor and the capacity-scenario correctness fix actually built
  (Reality / `ScenarioInputDelta` / apply-delta flow / baseline-vs-preview
  / named-transfer commit rules / why target date doesn't re-simulate).
  Read before touching `lib/scenario/`, `PortfolioPageClient.tsx`'s
  preview logic, or `POST /api/portfolio/preview`.
- **`docs/CONTEXT-MODEL.md`** — describes what Context Package Foundation
  Phase 1a actually built (`ProjectContextPackage`/`SourceRegistration`/
  `ContextSnapshot`, Finding/Report provenance fields, snapshot identity
  and immutability guarantees) and, explicitly, what it did not (no
  wiring into `/api/refresh` or any existing flow, no
  `ProjectIntelligenceEnvelope`, no Notion/Figma package assembly). Read
  before touching `lib/context/` or resuming Phase 1b/1c.
- **`BUILDPACK.md`** — the original v0 spec. Historical.
- This file (`HANDOFF.md`) — update it whenever a change is significant
  enough that a fresh agent picking this up next would need to know.

# ROADMAP

Read this file, then continue. v0 (Audit + Decisions) and v1's Forecast are
built and deployed. Timeline and Reports are next.

## Where things stand

- **AI estimation is live** (`lib/estimate/`, `POST /api/estimate`,
  "Estimate tickets with AI" on /forecast). The model reads each ticket's
  actual content and produces its own three-point day estimate with a
  one-line rationale, judges release *relevance* from content (core /
  peripheral / unrelated -- unrelated tickets are excluded from the
  forecast, listed visibly), and flags tickets whose scope is unclear,
  imply hidden work, or disagree 2x+ with the team's own points
  ("Worth a look" panel). Estimates are cached in WorkEstimate keyed by
  (scopeId, source, externalId) with a content hash -- unchanged tickets
  are never re-sent to the model; changed ones show as "stale" until
  re-run. Keyed by source (not Linear-specific) deliberately: Nic plans a
  Notion-requirements-as-source-of-truth workflow later, and a Notion row
  can flow through the identical pipeline. Scope.estimationContext (free
  text, editable on /forecast) feeds team/stack/release context into the
  estimator. Verified end-to-end with real Anthropic calls against Nic's
  real tickets: caught a deliberately sandbagged 1-point ticket at ~18
  likely days flagged bigger_than_pointed, and correctly judged an iTrack
  ticket unrelated with no labels involved. Forecast prefers fresh AI
  estimates over points; provenance shows in "Where the estimates come
  from."

- **Forecast scenarios are live** (`lib/forecast/scenarios.ts`): a "Paths
  to a sooner date" panel re-runs the simulation per lever (resolve
  blocking decisions / +1 or +2 developers / descope each of the top 3
  items) with a fixed RNG seed so deltas are lever-only, showing the new
  likely date, delta days, and confidence-at-target per row. The explainer
  also reports estimate provenance (real Linear points vs. parsed hints
  vs. wide placeholders, and placeholders' share of projected effort).
  Deliberate call, per Nic's ask about industry benchmarks: no generic
  "Flutter apps of this size take N weeks" figures are baked in -- no
  credible dataset exists, and invented numbers would undermine trust.
  The calibration path is the team's own completed-ticket history (below).
- **Forecast is live** (`/forecast`, `lib/forecast/`). Monte Carlo
  simulation over three-point estimates (Linear issue estimate -> points
  treated as likely days with a ±heuristic spread; `Finding.estimateHint`
  parsed for un-ticketed work; open *blocking* decisions modeled as a
  serial delay, not divided by capacity). `Scope.targetDate` and
  `Scope.teamCapacity` are user-editable inline on the page (team capacity
  defaults to inferred distinct-assignee count if unset). Confidence =
  % of simulated outcomes landing on or before the target date, per spec.
  Math verified numerically (triangular-mean convergence, date ordering,
  monotonic confidence vs. target, ~2x capacity scaling, gate delay) and
  the data-assembly logic verified against a 13-case fixture (done/canceled
  exclusion, ticketed-finding exclusion, decision-vs-item routing, hint
  parsing). UI verified via a mocked `/api/forecast` response since this
  sandbox can't reach Linear -- real production numbers not yet eyeballed.
- **Programmatic API access**: `POST /api/audit` (and every other API
  route) now accepts `Authorization: Bearer <APP_PASSWORD>` as an
  alternative to the cookie session, for Nic's separate Hermes agent to
  call directly later. Documented in README.md. Explicitly NOT built:
  Scope routing (which scopeId a transcript belongs to) or a
  run-completed notification -- real design questions once Hermes exists
  to actually integrate with.
- `Finding` already carries `estimateHint`, `blocks`, and `blocking` --
  Forecast already consumes these directly, no further schema change
  needed for Timeline's first pass either.
- Nav has Timeline / Reports still as placeholder pages (`app/timeline`,
  `app/reports`) -- turning them on is additive, not structural.
- Linear access is Scope-driven (`/scopes`), not an env var — adding a new
  module (iTrack, Precon, ...) is a data row, not a redeploy.
- `/audit` is a paginated index of every audit ever run (not just the
  dashboard's 5 most recent), and each source page has a collapsible
  "view original transcript" section -- full traceability, nothing is
  ever deleted.
- Known gap: `Finding.linearIssueId` currently stores the Linear
  *identifier* (e.g. `SOF-123`), not a clickable URL — there's no stored
  workspace slug to build a link from. If that starts to matter, either
  add a `linearIssueUrl` field or fetch the org's URL slug once and cache
  it.
- Known gap (flagged by Nic, not urgent): JSA and iTrack currently share
  one Linear project with no separating label. Worth a first entry in the
  Decision Queue: ask whoever owns Linear structure (Lucas? Colton?) for a
  consistent `jsa` / `itrack` label so Scopes can split cleanly instead of
  guessing from title text.

## v1 plan

### 1. Forecast (`/forecast`) -- done, see "Where things stand"

### 2. Timeline (`/timeline`)

A Gantt view built from Linear issues (assignee, estimate, state) plus open
findings shown as unscoped/at-risk bars, laid out against the release date
from Forecast. Reuse the workstream-row visual pattern from the KIT mockup.

Depends on Forecast existing (for the target date and confidence band).

### 3. Reports (`/reports`)

A one-click leadership summary generator: what shipped since the last
report, what's blocked (pulls straight from the Decision Queue), and the
current Forecast headline. Render as a clean, screenshot-able page — same
job the Decision Queue already does for decisions specifically, generalized
to a full status report.

Likely a `lib/reports/` module that composes existing data (AuditRun
history, open/resolved Findings, Forecast output) rather than anything new
to fetch.

## Smaller things worth doing alongside v1

- Fix the `package.json#prisma` seed config deprecation warning by moving
  to `prisma.config.ts` (Prisma 7 will require it).
- Consider adding a `linearIssueUrl` to `Finding` if the identifier-only
  link starts to bite (see "known gap" above).
- The JSA/iTrack Linear labeling ask (see above) — small, but unblocks
  cleaner Scope filtering.
- Forecast's estimate heuristics (`lib/forecast/build.ts`) are a
  documented placeholder, not calibrated to real team velocity: Linear
  points are treated as literal days with a fixed ±spread, and
  un-estimated issues/findings get flat placeholder ranges. Worth
  revisiting once there's enough completed-issue history to fit a real
  points-to-days conversion instead of guessing.

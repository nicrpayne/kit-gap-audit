# ROADMAP

Read this file, then continue. v0 (Audit + Decisions), V1 (Forecast, with
AI estimation + Notion + Figma), and V3 (Reports) are built and deployed.
Timeline (V2) is the one piece left from the original plan -- deferred on
purpose since Reports was the actually-needed leadership deliverable.
Active work: **shared capacity pool + portfolio forecasting**, on branch
`claude/portfolio-capacity-pool` (see "Where things stand" for Phase 1,
done; Phases 1.5-3 still ahead, each with an explicit go-ahead checkpoint
per Nic before starting -- do not proceed past Phase 1 on that branch
without checking recent conversation for approval).

## Where things stand

- **Shared capacity pool, Phase 1 of 3 (branch `claude/portfolio-
  capacity-pool`, not yet merged)** — the structural fix for a real bug:
  each Scope's `teamCapacity` was independent, so "hire 5, put 3 on JSA,
  1 on iTrack, 1 on Platform" had no way to be modeled without
  double-counting a person's hours across separate simulations. New
  `Person` (`id, name, fte, active`) and `Allocation` (`personId,
  scopeId, fraction` -- share of *that person's* time, unique per
  person+scope) models, plus a singleton `PortfolioSettings` row holding
  `contextSwitchCostPct` (0 by default -- a visible, user-set lever for
  the productivity cost of being split across scopes, never an inferred
  or baked-in number, same "no invented benchmarks" rule as Forecast's
  estimate math). `lib/capacity/resolve.ts` is pure and isomorphic (no
  Prisma import) since it's designed to run client-side too once the
  portfolio dashboard re-simulates on every slider drag (Phase 2/3):
  `resolveCapacity` implements stage 1 of the fallback chain
  (allocations -> explicit `Scope.teamCapacity` -> null), stage 2
  (null -> inferred from distinct Linear assignees) stays exactly where
  it already lived in `lib/forecast/build.ts` since it needs Linear
  issue data `resolveCapacity` doesn't have. `validateAllocations`
  rejects (never silently clamps) a person's fractions summing past
  1.0. `lib/forecast/compute.ts` loads people/allocations/settings and
  resolves capacity before calling `buildForecastInputs` -- **with zero
  `Person` rows (every existing Scope today), this is a proven no-op**:
  verified directly against real Postgres that the exact Prisma query
  shapes `compute.ts` uses return empty arrays and `resolveCapacity`
  degrades to `{capacity: null, source: null}`, letting
  `scope.teamCapacity` flow through completely unchanged. New CRUD
  routes: `POST/GET /api/people`, `PATCH/DELETE /api/people/:id`,
  `GET/PUT /api/allocations` (PUT does a full replace scoped to
  whichever people are named in the payload -- not the whole table --
  and validates before writing anything, so a rejected over-allocation
  never partially lands), `GET/PATCH /api/portfolio-settings`. Verified:
  41 fixture assertions on the pure capacity math (fractional splits
  across scopes summing to exactly the person's total with no double-
  count, unallocated capacity, the fallback chain's rungs, context-
  switch factor at 0% and 20% with a floor at 0.1x, `build.ts`'s new
  `capacitySource` field including explicit regression checks that the
  old call shape behaves identically) plus a 46-assertion live
  acceptance test against real local Postgres over real HTTP (the
  brief's own scenario: 3 people full-time on one scope, 1 on another,
  1 split 0.5/0.5 across two more, confirming the split person's total
  across every scope is exactly 1.0 -- never more -- and that over-
  allocation, negative fractions, and unknown person IDs are all
  rejected with no partial writes).

  Post-review fix: Nic's spot-check on whether `PUT /api/allocations`'
  `prisma.$transaction([...])` batch was a real atomic transaction (vs.
  an in-memory pre-check followed by unprotected writes) led to finding
  a real gap while confirming it -- a payload listing the same
  `(personId, scopeId)` pair twice hit the DB's unique constraint
  *inside* the transaction, uncaught, surfacing as a bare 500 with no
  error body (same failure class as the `/api/parse-spreadsheet` bug
  fixed earlier). Fixed with an explicit duplicate-pair check before the
  transaction (clean 400) plus a try/catch around the transaction itself
  as defense in depth. Reproduced the original bug live against real
  Postgres before fixing it, then proved the atomicity claim for real:
  a script calling `prisma.$transaction` directly (bypassing the route's
  new guard entirely) with a `deleteMany` followed by a guaranteed
  constraint violation confirmed the pre-existing allocation was still
  present afterward -- the `deleteMany`, despite running first in the
  batch, was rolled back along with the failed creates. Also confirmed,
  by re-running with explicitly named cases, that the switch-cost-at-0%/
  20% and `unallocatedCapacity` fixture coverage Nic asked about was
  real and not folded invisibly into an aggregate pass count.

  **Stopped here per Nic's explicit checkpoint** --
  Phase 1.5 (splitting Platform into its own Scope + scope-level
  dependency gates in the simulation trial loop, so JSA/iTrack still
  correctly reflect waiting on shared Platform work) touches the actual
  Monte Carlo math and needs its own go-ahead before starting, same as
  Phase 1 did. See the plan this was built from for the full six-phase
  scope (portfolio dashboard, provenance badges, an MCP server wrapper,
  outbound webhooks) -- Phases 2-3 (interactive allocation levers, the
  portfolio dashboard) are the next actually-scoped work once 1.5 lands
  and is confirmed good.

- **Reports is live** (`/reports`, `lib/reports/`, `POST /api/reports`).
  Composes the same Forecast pipeline as `/forecast` (so numbers always
  agree) into a stored, immutable leadership update: likely date +
  confidence, what shipped since the last report (needs `completedAt` on
  Linear issues, now fetched), what's blocking (from the Decision Queue),
  what got resolved since last time (`Finding.resolvedAt`, new field, set
  on resolve), and the single best available "fastest path to a sooner
  date" lever. Each generated report is stored verbatim
  (`Report.summaryMarkdown`) rather than recomputed on view, specifically
  so historical reports don't silently change if the underlying logic
  changes later, and so "what did I report last week" has a stable
  answer. History list + copy-to-clipboard on the page. Rendering is a
  small dependency-free line parser (`components/ReportView.tsx`) rather
  than pulling in a markdown library, since the format is fully
  controlled by `lib/reports/render.ts`. Verified: 14-assertion fixture
  suite against the pure render function (first-report framing, delta
  phrasing both directions, section omission when there's nothing to
  show), a real-browser check of the React rendering against a mocked API
  response, and the real unmocked pipeline against local Postgres --
  correct empty state, and the same graceful Linear-blocked error path
  everything else hits in this sandbox.

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

### 3. Reports (`/reports`) -- done, see "Where things stand"

### 4. Interactive scenario levers (Nic's next priority, not V2)

Turn "Paths to a sooner date" from static pre-computed rows into live
levers: drag team capacity, toggle which decisions are treated as
resolved, toggle which tickets are in/out of scope, and see the date and
confidence recompute in place -- meant to facilitate an actual
conversation (dragging a slider while someone watches), not just generate
a static report. The simulation engine and API already support arbitrary
overrides in spirit (`buildScenarios` already re-runs with one changed
input per row); this is mostly a generalized "recompute with overrides"
endpoint plus an interactive UI layer, not new simulation logic.

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

## Figma integration (shipped)

Same shape as Notion, text-level (Nic chose the contained option): Scopes
link Figma frame/page URLs (must have a node-id, i.e. a specific
page/frame selected, not just the file root); `lib/figma.ts` (raw REST,
no SDK -- personal access token, `/v1/files/:key/nodes?ids=` scoped to
just the requested node, not the whole file) flattens the node tree to
plain text: named frames/components become headings, TEXT node content is
extracted verbatim, purely decorative shape nodes (rectangles, vectors,
etc. with no children) are filtered out entirely, default-autogenerated
names ("Frame 8", "Rectangle 47") don't produce noise headings. Feeds into
the same `lib/estimate/context.ts` as Notion, with its own char budget and
its own contextHash contribution. The estimator prompt is told explicitly
to weight Figma content as *current design intent*, not committed
requirements the way Notion docs are -- deliberately lower-trust,
especially for anything still in active design (iTrack). UI: a second
URL-list textarea next to the Notion one on /forecast, showing connected
page names. Verified against a 15-assertion fixture built to mirror the
actual JSA v2 board structure Nic showed (frames, text labels, and
decorative noise): correct file/page name extraction, real content
present, decorative shapes and empty-default-named frames correctly
absent from output, 404 gives an actionable message. Live api.figma.com
calls untested (sandbox blocks it, same as Linear/Notion).

## Spreadsheet upload + audit truncation fix (shipped)

Two bugs hit in the same production session, from the same underlying
cause: Nic pasted the full "Task List" tab of a working doc into the
Audit form and got a cryptic `Model did not return parseable JSON
(Unexpected end of JSON input)` error with a wall of cut-off JSON dumped
into the error text.

**Root cause**: the model's response hit `max_tokens` (8000) before
finishing the JSON array -- a dense, already-structured input (30+ rows,
several already flagged GAP/OPEN/BLOCKER) legitimately produces a lot of
findings. `completeJson` (`lib/model.ts`) never checked
`response.stop_reason`, so it tried to parse a truncated string and threw
whatever `JSON.parse` said, which is meaningless to a user. Fixed two
ways: `completeJson` now checks `stop_reason === "max_tokens"` first and
throws a clear "input was likely too large, try a shorter paste" error
instead of a parse-error dump (verified against the real Anthropic API
in this sandbox, deliberately forcing truncation with a tiny `maxTokens`
-- Anthropic is the one external API this sandbox can actually reach);
and the audit call's `maxTokens` went from 8000 to 16000 for headroom.

**Also requested in the same breath**: real spreadsheet upload, not just
copy/paste. `.txt/.md/.csv` were already plain text (`file.text()`
worked fine); `.xlsx` needs real parsing. Chose `exceljs` over the more
common `xlsx` (SheetJS) package deliberately -- `xlsx` on npm has two
high-severity unpatched vulnerabilities (prototype pollution, ReDoS,
"no fix available"); `exceljs`'s own footprint is clean, its only flagged
issue is a moderate transitive one with a fix path. Parsing happens
server-side (`POST /api/parse-spreadsheet`, exceljs is Node-oriented
anyway) rather than shipping a spreadsheet-parsing library into the
client bundle. Converts to the same pipe-delimited text Nic's already
been pasting manually, dropping blank rows; merged cells (common in
these working docs -- banner rows, notes) are de-duplicated to their
anchor cell using `cell.isMerged`/`cell.master`, otherwise a merged
banner row repeats itself once per spanned column. Multi-sheet workbooks
get a sheet picker (defaults to the first sheet) instead of guessing
which tab matters -- both the Audit form and the Forecast page's "Other
context" uploader share one client helper (`lib/client/uploadFile.ts`)
and the same server route. Verified against the real multi-sheet working
doc from this session (6 sheets, merged banner rows, formulas, date
cells) and a real classification workbook with hyperlink cells, plus
error paths (corrupt file, oversized file, wrong extension) -- all via a
real browser upload through both UI surfaces.

## Programmatic refresh (shipped)

Nic's ask: a single call Hermes/Cowork can make to trigger a full
refresh, instead of sequencing `/api/audit`, `/api/estimate`, and
`/api/forecast` itself. `POST /api/refresh` (see README) does: push
context docs -> optionally audit a transcript -> re-run AI estimation ->
re-run the forecast -> optionally generate a Report, all through the
exact same pipeline the individual routes use (no duplicated logic to
drift out of sync -- `computeForecast` in `lib/forecast/compute.ts` is
now the one place Forecast math happens, used by `GET /api/forecast`,
`generateReport`, and `/api/refresh`; `runAudit` and
`runEstimationForScope` are the equivalent extractions for Audit and
Estimate). Context docs are pushed before anything Linear-dependent, so a
Linear outage doesn't lose freshly-pushed context along with the failed
refresh -- verified for real against local Postgres (Linear blocked in
this sandbox, same as always): the push landed and `contextDocsUpdated`
came back correctly on a request that still 502'd on the Linear call.
Also verified: identical 502 error text from all four now-refactored
routes (audit/estimate/forecast/reports) before and after the extraction,
confirming the refactor didn't change behavior; pushing the same
`label` twice updates in place rather than duplicating.

Answers the second half of Nic's context question too: this is a *push*,
not a pull -- the app can't reach into Hermes' local ledger, so
`contextComplete`/`contextIssues` in the response is the hardening for
that. A human on `/forecast` sees a Notion/Figma failure inline; an
unattended Hermes-triggered refresh has no one watching, so
`contextComplete: false` makes a fully-failed configured context source
explicit in the response instead of a silent degrade only visible if
someone happens to read a warning string.

Not built: the reverse direction (the app notifying Hermes when a refresh
finishes, or Hermes discovering which Scope a transcript belongs to) --
same "real design question once both sides exist" note as the audit API
already carries.

## Scope: multi-project support (shipped)

Nic's ask, once the Cowork Linear split (JSA / iTrack / Platform / Legacy)
was underway: JSA and iTrack need to be forecast separately *and*
together, and both real products depend on shared Platform work that
neither's own Linear project alone would surface. `Scope.projectName`
(single, exact-match) is now `Scope.projectNames` (array, union match) --
`getScopedIssues` filters with Linear's `project: { name: { in: [...] } }`
instead of `eq`, so one Scope can pull "KIT JSA" + "KIT Platform" while
another pulls "KIT iTrack" + "KIT Platform" and a third pulls all of "KIT
JSA" + "KIT iTrack" + "KIT Platform" for the combined view -- three
independent Scopes, three independent simulations, no cross-Scope
arithmetic to get wrong. The two per-product Scopes should be read as "if
we only worked on this" (full capacity dedicated), and the Combined Scope
as the realistic date given the team's actual capacity split across both
-- worth surfacing that distinction in the UI copy so a JSA-only date and
the Combined date don't read as contradicting each other.
Migration backfills every existing `projectName` into a one-element
`projectNames` array before dropping the old column -- verified against
local Postgres, the existing JSA scope kept its one project correctly.
`/scopes` UI is now a checkbox list per team (was a single dropdown) --
verified with a real create-scope round trip against local Postgres
(mocked team/project lookups), multi-select shows as a joined list in the
table. Deliberately not built yet: cross-project dependency modeling
(e.g. a specific Platform ticket blocking a specific JSA ticket, pulled
from Linear's native issue-blocking relations and shown as a critical-path
gate the way blocking decisions already are) -- the three-Scope split
answers "what are the numbers," dependency modeling would answer "why do
they move," and that's a real feature, not a field addition. Next in line
on the roadmap, after interactive scenario levers.

## Pasted context docs (shipped)

Nic's ask: "How can we make it so I can add sheets like this for context,"
showing a SharePoint/Excel task-tracker spreadsheet with per-row owner,
effort estimate, status, and notes -- real team-maintained tracking data
that isn't in Linear or Notion. Live SharePoint/Graph sync was judged too
big to build blind (Azure AD OAuth, a new credential type, a fourth
external API) versus Notion/Figma's simple personal-token REST calls, so
this ships as paste/upload instead: a `ContextDoc` model
(`scopeId, label, content, createdAt`) via `POST /api/context-docs` (list:
`GET`, remove: `DELETE /api/context-docs/:id`), fed into
`lib/estimate/context.ts` as a fourth context source alongside
`estimationContext`, Notion, and Figma, budgeted at 20k chars total and
mixed into the same `contextHash` -- editing or re-pasting a doc marks
every estimate stale the same way an edited Notion doc does. Told to the
model explicitly as a signal alongside Linear's own points, not
automatically correct (the team's own effort estimates in a sheet like
this can be as rough as Linear's points). UI: a third block in the
"Team & release context" section on `/forecast`, same paste-and-save
pattern as Notion/Figma URLs but for raw text instead of a link -- copy a
sheet's rows out of Excel/SharePoint and paste as text, no export format
required. Verified: a 10-assertion fixture on `buildReleaseContext`
(inclusion, per-doc and cross-doc char-budget truncation, doc content
change flips the contextHash, empty state), and a real-browser check
against local Postgres (add appears in the list with its char count,
remove returns to the empty state) -- this path needed no Linear/Notion/
Figma mocking since it's pure local data.

Also asked, not yet built: pulling context from "Hermes" (Nic's separate
agent), which keeps a decision/commitment ledger (`~/.hermes/ledger.db`,
e.g. "LED-004 Keep funding Pancho...", "LED-008 JSA/iTrack design
ownership: Lucy vs. Maru") plus a wiki. Recommendation given, not
implemented: treat it as a fifth *scoped, attributed* context source the
same shape as Notion/Figma/ContextDoc -- specific relevant ledger rows
tagged to a Scope -- not "the whole wiki," since dumping unscoped context
into the estimator prompt dilutes signal rather than adding it (the model
can't tell what's relevant from what's ambient). The real blocker is
reachability: the ledger is a local SQLite file on Nic's machine, not
reachable by the Railway-hosted app, so Hermes would need to expose an
API or push relevant rows -- mirroring the Bearer-token pattern already
built for Hermes calling `/api/audit`. Daily re-estimation is already
cheap thanks to content-hash caching (unchanged tickets/context are never
re-sent to the model); what's missing for "estimate changes almost daily"
isn't a redesign, just a cron trigger once there's a stable Hermes->Gap
App integration to trigger against.

## Notion integration (shipped)

Scopes can link Notion pages (requirements/scoping docs) whose content is
pulled as estimator context: `lib/notion.ts` (raw REST, no SDK; page ->
plain text with pagination + depth-2 nesting, 15k chars/page, 20k total),
`lib/estimate/context.ts` (assembles scope + estimationContext + Notion
docs; its hash is mixed into every item's estimate hash so context/doc
edits mark all estimates stale). Setup documented in README (integration
token + per-page Connections sharing). NOT yet fed into audits -- worth
doing next: transcripts compared against requirements, not just tickets.
Live Notion API verification pending first production use (sandbox
blocks api.notion.com, same as Linear).

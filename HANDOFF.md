# HANDOFF — KIT Gap Audit

Written for a fresh Claude instance (or human) with zero prior context on
this project. Read this top to bottom before touching code or answering
questions about it. It is a snapshot as of 2026-08-05 — check git log and
ROADMAP.md for anything that's happened since.

## What this is, in one breath

KIT Gap Audit ("Gap App") is a Next.js app Nic Payne is building to turn
messy meeting/planning context into three things: **what's missing**
(gaps between what's been discussed/planned and what actually has a
Linear ticket), **what's undecided** (a Decision Queue leadership can
act on), and **when will it actually ship** (an AI-driven forecast, not
a guess). It reads Linear tickets directly, is starting to read Notion/
Figma/pasted spreadsheets as additional context, and is meant to be
callable by — and to eventually collaborate with — a separate personal
agent Nic runs called **Hermes**, which has broader context (a decision
ledger, ongoing conversations, a wiki) that Gap App doesn't have direct
access to.

Repo: `nicrpayne/kit-gap-audit`, branch `claude/product-timeline-audit-a72dmg`.
Deployed on Railway at `kit-gap-audit-production.up.railway.app`, gated
by a single shared password (`APP_PASSWORD`).

## Who's using it and why

Nic is a PM/lead on a small team (~4-5 devs) shipping two related mobile
products for a construction-safety company:
- **JSA** (Job Safety Analysis) — a Flutter forms app, actively being
  built, closest to release.
- **iTrack** — incident/severity tracking + quality tracking, still in
  design, follows JSA in priority.
- Both depend on shared **Platform** work (infra, file storage, shared
  notification service, CI/CD, app-shell screens) that used to be
  tangled into one Linear project with legacy-portal maintenance.

The whole point of the tool is Nic being able to answer "when do we
actually ship, and what's the honest confidence" for leadership, without
that being a guess or a vibes-based Slack update.

## Current status

Everything below marked **shipped** is built, has passed a full
`npm run build` + `npx eslint .`, and has been verified as far as this
sandbox's network restrictions allow (see "Testing discipline" below).
Production is a few commits behind at any given moment until Nic
redeploys on Railway — always check whether he has before assuming a
fix is live.

## Tech stack

- **Next.js 15** (App Router, TypeScript), **React 19**
- **Postgres** via **Prisma 6** (`prisma/schema.prisma`); Railway-hosted
  in prod, local Postgres 16 for dev in this sandbox
- **Tailwind v3** (not v4 — v4's `@tailwindcss/oxide` native binary
  failed to build on Railway's Nixpacks image; downgraded, visually
  confirmed identical)
- **`@anthropic-ai/sdk`**, wrapped in `lib/model.ts` — every LLM call in
  the app goes through `completeJson()`, which handles model config,
  defensive JSON parsing (strips code fences, trailing commas), and
  (as of the last fix) detects a truncated response (`stop_reason ===
  "max_tokens"`) and throws a clear error instead of trying to parse
  garbage. Model is configurable via `AUDIT_MODEL` env var.
- **`@linear/sdk`** — but only for auth/team/project listing. The actual
  issue-fetch path (`getScopedIssues` in `lib/linear.ts`) uses a **raw
  GraphQL query** (`SCOPED_ISSUES_QUERY`) with everything inlined
  (state, assignee, labels, estimate, completedAt) in one request per
  100 issues, because the SDK's lazy relations (`issue.state`,
  `issue.assignee`, `issue.labels()`) each fire a separate request —
  that cost ~770 calls for one 255-issue page load and blew Linear's
  2500/hour rate limit in production. Has a 2-minute in-process cache.
- **Notion & Figma**: no SDKs, raw REST (`lib/notion.ts`, `lib/figma.ts`),
  both with injectable `fetch` for testability and their own 5-minute
  caches.
- **`exceljs`** for server-side `.xlsx` parsing (`app/api/parse-spreadsheet`)
  — deliberately *not* the more common `xlsx`/SheetJS npm package, which
  has two unpatched high-severity vulnerabilities (prototype pollution,
  ReDoS, no fix available). `exceljs`'s own footprint is clean.
- Auth: httpOnly cookie session (SHA-256 via Web Crypto, `middleware.ts`)
  for the browser, plus `Authorization: Bearer <APP_PASSWORD>` as an
  alternative on every `/api/*` route for programmatic callers (Hermes).
  No separate API keys yet — same shared secret.

## Data model (`prisma/schema.prisma`)

- **`Scope`** — the central concept. Maps a product/module (JSA, iTrack,
  Platform, a combined view, ...) to a Linear team + **`projectNames:
  String[]`** (as of the last schema change — was a single `projectName`
  string, now a union match so one Scope can pull e.g. `["KIT JSA",
  "KIT Platform"]` together) + optional label filter. Also carries
  `targetDate`, `teamCapacity`, `includeTriage`, `estimationContext`
  (free text fed to the AI estimator), `notionPageIds[]`, `figmaRefs[]`.
  Everything else hangs off a Scope.
- **`Source`** — one submitted piece of context (transcript/notes/
  estimates/spreadsheet — see `kind`), stores the raw content verbatim,
  belongs to a Scope, has many `Finding`s. Nothing is ever deleted —
  full traceability was an explicit early requirement.
- **`Finding`** — one audit result: `type` (`missing_work` | `decision` |
  `risk` | `contradiction`), verbatim `quote`, `rationale`, `severity`,
  `estimateHint`, `owner`/`blocks`/`blocking` (decisions), `status`
  (`open` | `ticketed` | `dismissed` | `resolved`), `resolvedAt` (powers
  "resolved since last report").
- **`WorkEstimate`** — one AI-produced three-point estimate (low/likely/
  high days) for one work item, keyed by `(scopeId, source, externalId)`
  with a content hash so unchanged items are never re-estimated.
  `source` is `"linear"` or `"finding"` (deliberately not
  Linear-specific — a Notion requirement row could flow through the
  same pipeline later). Carries `relevance` (core/peripheral/unrelated)
  and `flags` (unclear_scope, bigger/smaller_than_pointed, hidden_work).
- **`Report`** — an immutable leadership-report snapshot. The rendered
  markdown is stored, not recomputed on view, so historical reports
  don't silently change if the underlying math changes later.
- **`ContextDoc`** — pasted or uploaded context with no live API to sync
  from (a spreadsheet export, notes). `(scopeId, label, content)`. Fed
  into the estimator the same way a Notion doc is.
- **`AuditRun`** — a log row per audit pass (issue/finding counts, model
  used) for traceability.

## Feature rundown

### v0 — Audit + Decisions (shipped, oldest, most battle-tested)

Paste (or now upload) a transcript/notes/spreadsheet at `/audit/new`.
`runAudit()` (`lib/audit/run.ts`) fetches the Scope's Linear issues +
previously-handled findings, builds a prompt (`lib/audit/prompts/
audit-v1.ts`) instructing the model to extract `missing_work` /
`decision` / `risk` / `contradiction` findings — each with a mandatory
verbatim quote as evidence — and stores them. Each finding can be
**Draft ticket** (creates a real Linear issue labeled `kit-found`) or
**Dismiss** (reason stored, never re-raised — the prompt is told about
prior handled findings explicitly). Bulk select + draft-multiple exists.
`/audit` is a paginated index of every audit ever run with the original
source viewable inline — nothing is ever deleted. `/decisions` is a
dedicated Decision Queue view (blocking vs non-blocking, owner, what
each blocks) — literally designed to be screenshotted into a leadership
thread.

### V1 — Forecast (shipped, grew well past original spec)

`/forecast`. The actual engineering core of the app:

1. **Monte Carlo simulation** (`lib/forecast/simulate.ts`) — triangular-
   distribution sampling per work item, summed under team capacity,
   producing likely/earliest/latest dates and a confidence % (share of
   simulated outcomes landing on or before the target date). Pure,
   deterministic-seedable (mulberry32 PRNG) math, verified with a
   numeric fixture suite (triangular-mean convergence, date ordering,
   monotonic confidence, capacity scaling, gate delay).
2. **Input assembly** (`lib/forecast/build.ts`, `buildForecastInputs`) —
   turns Linear issues + Findings into three-point estimates. Prefers a
   fresh AI estimate over Linear points over a wide placeholder guess;
   excludes done/canceled and (by default) Triage-state issues; models
   open *blocking* decisions as a serial delay gate, not divisible work.
3. **AI estimation** (`lib/estimate/`, "Estimate tickets with AI" button,
   `POST /api/estimate` -> `lib/estimate/runForScope.ts` ->
   `lib/estimate/run.ts`'s `runEstimation`) — the model reads each
   ticket's actual content (not just points/labels) and produces its
   own three-point estimate + one-line rationale, judges release
   *relevance* (core/peripheral/unrelated — unrelated tickets excluded
   from the forecast but listed visibly), and flags tickets whose
   scope is unclear, imply hidden work, or disagree 2x+ with the team's
   own points. **Content-hash cached** — unchanged tickets/context are
   never re-sent to the model, which is what makes "re-run daily"
   actually cheap.
4. **Release context** (`lib/estimate/context.ts`, `buildReleaseContext`)
   — assembles `estimationContext` (free text) + Notion docs + Figma
   refs + ContextDocs into one prompt block and one `contextHash`, mixed
   into every item's estimate hash so any context change marks
   everything stale. Figma is explicitly weighted lower-trust ("current
   design intent") than Notion ("committed requirements") in the prompt.
5. **Scenarios** (`lib/forecast/scenarios.ts`) — a "Paths to a sooner
   date" panel re-runs the simulation per lever (resolve blocking
   decisions / +1-2 devs / descope top items) with a fixed RNG seed so
   deltas are lever-only.
6. **"Why this date?"** panel — remaining issue/finding counts, team
   capacity (with an "inferred from assignees" caveat when not set
   explicitly), largest contributors, and an estimate-provenance
   breakdown (how many AI-estimated vs. real points vs. placeholder,
   and placeholders' share of total effort — the honest "here's what
   would tighten this range" signal).

Deliberate non-feature: **no generic industry benchmarks** ("apps like
this take N weeks") are baked in anywhere — Nic explicitly asked for
this and agreed no credible dataset exists; invented numbers would
undermine trust. The credible calibration path is the team's own
completed-ticket history once there's enough of it (not built yet).

### V3 — Reports (shipped, built ahead of V2 Timeline on purpose)

`/reports`, `POST /api/reports` -> `lib/reports/generate.ts` ->
`lib/reports/render.ts`. A one-click leadership summary: current
Forecast (reusing the exact same pipeline as `/forecast` so numbers
always agree — see "Shared pipeline extraction" below), what shipped
since the last report, what's blocking, what got resolved, the single
best "path to a sooner date" lever. Each report is stored verbatim and
immutable. Built before Timeline because it's the actual leadership
deliverable; Timeline is a nice-to-have visual, not a decision-driver.

### V2 — Timeline (NOT built, deliberately deferred)

`/timeline` is still a placeholder page. Would be a Gantt view from
Linear issues + open findings against the Forecast's target date/
confidence. Depends on Forecast existing (it does). Nic's own stated
next priority is actually **interactive scenario levers** (see
"Planned, not built" below), not Timeline — Timeline may never get
built at this rate and that's fine, it was explicitly deprioritized.

### Multi-source estimator context (shipped, three sources)

- **Notion** (`lib/notion.ts`) — link requirements/scoping pages per
  Scope; raw REST, page -> plain text, 15k chars/page, 20k total.
  Needs `NOTION_API_KEY` (internal integration) + each page individually
  shared with that integration (Notion's Connections menu) or the API
  404s.
- **Figma** (`lib/figma.ts`) — link frame/page URLs (must include a
  `node-id`); raw REST, flattens frame/text-layer content to text,
  filters decorative shapes and default-named noise ("Rectangle 47").
  Needs `FIGMA_API_KEY` (personal access token, no per-file sharing
  step needed). Explicitly weighted as lower-trust design-intent, not
  committed requirements — matters most for iTrack, which is still in
  design with no written requirements doc.
- **Pasted/uploaded context (`ContextDoc`)** — for anything with no live
  API (a SharePoint/Excel task tracker, meeting notes). Paste text
  directly, or upload `.txt/.md/.csv/.xlsx` (see spreadsheet upload
  below). `POST/GET /api/context-docs`, `DELETE /api/context-docs/:id`.

### Multi-project Scopes (shipped)

`Scope.projectNames` (array) replaced the original single `projectName`
string, specifically so a Scope can union multiple Linear projects — the
motivating case: after Nic split the old shared "KIT Safety (JSA and
iTrack)" Linear project into `KIT JSA` / `KIT iTrack` / `KIT Platform`
(shared infra/service work both products depend on) / a renamed legacy
project, a JSA-only Scope pointed at just `KIT JSA` would silently miss
real release-blocking Platform work (file storage service, shared
notifications, CI/CD). The plan is three Scopes: `KIT JSA` = `[KIT JSA,
KIT Platform]`, `KIT iTrack` = `[KIT iTrack, KIT Platform]`, and a
`Combined` Scope = all three with the team's real total capacity — the
per-product Scopes answer "if we only worked on this" (optimistic), the
Combined Scope answers the realistic date given the team splits across
both. `/scopes` UI is a per-team checkbox list now, not a dropdown.
Migration backfilled every existing `projectName` into a one-element
array before dropping the old column.

### Programmatic API + `POST /api/refresh` (shipped) — **the Hermes integration surface**

See the dedicated Hermes section below — this is the part of the app
built specifically for another agent to call.

### Spreadsheet upload (shipped, hardened after a production bug)

Both `/audit/new` and `/forecast`'s "Other context" now have a real
**Upload .txt / .md / .csv / .xlsx** button (`lib/client/uploadFile.ts`
shared by both). `.txt/.md/.csv` are read client-side as plain text.
`.xlsx` is parsed server-side (`POST /api/parse-spreadsheet`, `exceljs`)
into the same pipe-delimited row format Nic was already pasting
manually — merged cells de-duplicated to their anchor (otherwise a
banner row repeats itself once per spanned column), multi-sheet
workbooks get a sheet picker. Had a production crash (bare 500, no
error body) from an unguarded row/cell-extraction loop after the
initial `workbook.xlsx.load()` succeeded — hardened so no cell shape
(formula errors, malformed rich text, whatever) can crash the whole
request; each sheet parses in isolation now.

### Audit "Kind" field (shipped, minor)

`transcript | notes | estimates | spreadsheet` (added the last one).
Purely descriptive — a label in the prompt, the source's display tag,
the auto-generated title — nothing branches on it. Uploading a
`.csv`/`.xlsx` auto-selects "spreadsheet."

## Shared pipeline extraction (architecture note, not a feature)

To build `/api/refresh` without a third copy of the Forecast/Report
math drifting out of sync, the logic that used to live inline in each
route handler was extracted into reusable `lib/` functions:
- `lib/forecast/compute.ts` — `computeForecast(scope)`. **The one place
  Forecast math happens now.** Used by `GET /api/forecast`,
  `generateReport`, and `/api/refresh`.
- `lib/reports/generate.ts` — `generateReport(scope)`, built on top of
  `computeForecast`.
- `lib/audit/run.ts` — `runAudit(scope, input)`.
- `lib/estimate/runForScope.ts` — `runEstimationForScope(scope)`.

All four routes (`/api/audit`, `/api/estimate`, `/api/forecast`,
`/api/reports`) are now thin wrappers around these. Verified this
refactor changed nothing by confirming byte-identical error text
before/after on all four routes' Linear-blocked error path.

## The Hermes integration — what's built, what's the plan

**Hermes** is Nic's separate personal agent. It maintains a
decision/commitment ledger (SQLite, `~/.hermes/ledger.db`, entries like
"LED-004 Keep funding Pancho through remaining JSA front-end work" or
"LED-008 JSA/iTrack design ownership: Lucy vs. Maru") and has broad
context from ongoing conversations that Gap App has no way to see
directly.

**Nic's stated vision**: Gap App should work as something Hermes (or
Claude Cowork, or another agent) can *call* — "here's the current
context, work your magic and give me a forecast for the morning
briefing" — and separately, Gap App should be an interactive workspace
Nic can drive live on a screen-share (drag capacity, toggle scope,
watch the date move).

**Critical architectural fact, established early and holding**: this is
a **push, not a pull**. Gap App (Railway-hosted, public) cannot reach
into Hermes' local `~/.hermes/ledger.db` or wiki — there's no live
connector to it, unlike Notion/Figma which Gap App calls directly. So
any Hermes context has to be *pushed* into Gap App by Hermes itself.

**What's built for this**:

- Every `/api/*` route accepts `Authorization: Bearer <APP_PASSWORD>` as
  an alternative to the cookie session (see `middleware.ts`) — this is
  the auth Hermes uses for everything below.
- **`POST /api/refresh`** (`app/api/refresh/route.ts`) is the single
  "do everything" entrypoint, purpose-built for this: one call that
  pushes context docs, optionally audits a new transcript, re-runs AI
  estimation, re-runs the forecast, and optionally generates a report —
  instead of Hermes sequencing four separate calls. Request shape:
  ```
  POST /api/refresh
  Authorization: Bearer <APP_PASSWORD>
  { "scopeId": "...",
    "transcript": { "kind": "notes", "content": "..." },       // optional
    "contextDocs": [{ "label": "Hermes brief — JSA", "content": "..." }], // optional
    "generateReport": false }                                  // optional
  ```
  Response includes `contextDocsUpdated`, `audit`, `estimate`,
  `forecast` (same shape as `GET /api/forecast`'s core fields), and
  critically **`contextComplete: boolean` / `contextIssues: string[]`**.
- **Why `contextComplete` matters**: on `/forecast`, a human sees a
  Notion/Figma load failure as an inline warning. An unattended
  Hermes-triggered refresh has no one watching — so a fully-failed
  configured context source needs to be an explicit, checkable field in
  the response, not a string nobody reads. `contextComplete: false`
  means "don't trust this run's numbers, surface `contextIssues` back
  to Nic." This directly answers the "how do we make sure the app is
  getting the full context it needs" half of Nic's original question.
- **Ordering matters**: `/api/refresh` pushes context docs *before*
  anything Linear-dependent, so if Linear is rate-limited/down, freshly
  pushed context still lands (verified for real: a context doc
  persisted to Postgres on a call that still 502'd on the blocked
  Linear call in this sandbox).
- **Pushing the same `label` twice updates in place** rather than
  duplicating (upsert by `(scopeId, label)`, app-level, no DB unique
  constraint added to avoid a migration risk against unknown existing
  production data).
- **The scoped-brief prompt pattern** (given to Nic to paste into
  Hermes, not yet automated): ask Hermes to produce a *scoped* context
  brief for one product — open ledger decisions/commitments relevant to
  that product, anything resolved recently that changes scope/
  ownership/timing, risks it would flag — explicitly told to leave out
  anything not clearly relevant, formatted as short plain text ready to
  paste. This is the "scoped, attributed pull" recommendation: **never
  dump the whole ledger/wiki in** — unscoped context dilutes signal
  rather than adding it, and this is the same failure mode that caused
  an earlier real forecast bug (Triage tickets + a shared JSA/iTrack
  Linear project inflating the date to November before Scopes/AI
  estimation fixed it). The prompt currently has Nic running it
  manually and pasting Hermes' output in, or (once Hermes can make its
  own HTTP calls) Hermes could call `/api/refresh` directly with that
  brief as a `contextDocs` entry — no new endpoint needed for that, it
  already accepts it.

**What's explicitly NOT built** (real design questions, deliberately
not built blind before both sides' real shapes are known):
- Hermes doesn't know *which* Scope a given transcript/brief belongs to
  — no routing layer.
- No notification path in either direction — Gap App doesn't tell
  Hermes when a refresh finishes, Hermes doesn't get pinged.
- No scheduled/cron trigger for "refresh daily" — content-hash caching
  already makes repeated runs cheap (unchanged tickets/context are
  never re-sent to the model), so this is genuinely just "add a
  trigger," not a redesign, once there's a stable calling pattern.
- Whether Gap App's own direct Notion/Figma connectors become redundant
  once/if Hermes reliably pushes a consolidated context bundle instead
  — flagged as worth revisiting later, not decided now. Don't remove
  working Notion/Figma code speculatively.

## Planned, not built

Roughly in the order Nic cares about them (see ROADMAP.md's "Where
things stand" header for the current authoritative priority statement):

1. **Interactive scenario levers** — Nic's explicitly stated next
   priority, not Timeline. Turn "Paths to a sooner date" from static
   precomputed rows into live UI (drag capacity, toggle decisions/
   scope) recomputing in place — meant for driving during an actual
   conversation/screen-share. The simulation engine already supports
   arbitrary per-lever overrides in spirit (`buildScenarios` already
   re-runs with one changed input per row); this is mostly a
   generalized "recompute with overrides" endpoint plus an interactive
   UI layer, not new simulation logic.
2. **Cross-project dependency modeling** — a specific Platform ticket
   blocking a specific JSA ticket, pulled from Linear's native issue-
   blocking relations and modeled as a critical-path gate the way
   blocking *decisions* already are (`DecisionGate` in
   `lib/forecast/simulate.ts`). The three-Scope split (above) answers
   "what are the numbers"; this would answer "why do they move." Not
   started.
3. **Points-to-days calibration from real velocity** — `lib/forecast/
   build.ts`'s `issueEstimateToThreePoint` is a documented placeholder
   (treats a point as a literal day count ± a fixed spread). Worth
   revisiting once there's enough completed-ticket history to fit a
   real conversion. This is also the credible replacement for "generic
   industry benchmark" figures Nic asked about and was told no
   — this is that, once there's data for it.
4. **Timeline/Gantt (V2)** — deferred, `/timeline` still a placeholder.
5. Hermes-side automation (see above): routing, notifications, a
   scheduled trigger.
6. `linearIssueUrl` on `Finding` — currently stores just the Linear
   identifier (`SOF-123`), not a clickable URL (no stored workspace
   slug to build one from). Minor, not urgent.
7. `package.json#prisma` seed config is deprecated (Prisma 7 will
   require `prisma.config.ts` instead) — cosmetic warning, not urgent.

## Recent bugs fixed (useful not to repeat)

- **Linear rate-limit blowout** (~770 calls/page load) — fixed by
  switching `getScopedIssues` from lazy SDK relations to one raw
  GraphQL query per 100 issues with everything inlined.
- **November forecast blowup** — compound cause: shared JSA+iTrack
  Linear project, Triage tickets counted as real work, unestimated
  tickets carrying flat placeholders. Fixed via Triage exclusion
  toggle + AI content-based estimation + Scopes.
- **Audit JSON-truncation crash** — `completeJson` didn't check
  `stop_reason`, so a response cut off by `max_tokens` (a dense
  spreadsheet paste producing many findings) surfaced as a
  `JSON.parse` error dumping the cut-off text. Fixed: explicit
  `stop_reason === "max_tokens"` check with a clear "input too large"
  error; audit's `maxTokens` also raised 8000 -> 16000.
- **`/api/parse-spreadsheet` uncaught 500** — the row/cell extraction
  loop after a successful `workbook.xlsx.load()` had no try/catch, so
  an unexpected cell shape (formula error, etc.) crashed the whole
  request with no error body. Fixed: defensive `cellToText` (never
  throws) + per-sheet try/catch (one bad sheet doesn't sink the
  workbook).
- **Tailwind v4 build failure on Railway** — `@tailwindcss/oxide`
  native binary mismatch between this sandbox and Railway's Nixpacks
  image. Downgraded to Tailwind v3 (pure JS), visually confirmed
  identical.

## Deployment

Railway, Nixpacks build. `railway.json`'s start command is `npx prisma
migrate deploy && npm run start` — every deploy applies pending
migrations automatically, no separate release step. Env vars:
`DATABASE_URL`, `LINEAR_API_KEY`, `ANTHROPIC_API_KEY`, `AUDIT_MODEL`,
`APP_PASSWORD`, `NOTION_API_KEY` (optional), `FIGMA_API_KEY` (optional)
— see `.env.example`. Nic redeploys manually; **always check whether
he has before assuming a fix described in ROADMAP.md/HANDOFF.md is
actually live in production.**

## Testing discipline (important for whoever works on this next)

This dev sandbox's egress is restricted: `api.linear.app`,
`api.notion.com`, `api.figma.com`, and `*.up.railway.app` are all
**blocked**. `api.anthropic.com` is the one external API actually
reachable from here — real Anthropic calls have been used for real
verification (e.g. deliberately forcing a truncated response to test
the `stop_reason` fix). Everything else follows this pattern:
- Pure logic (simulation math, prompt builders, JSON parsing, markdown
  rendering) gets a fixture-based unit test in a temporary
  `scripts/*.ts`/`.mjs` file, run via `npx tsx` or `node`, deleted after
  passing.
- Anything needing the real UI gets a real-browser Playwright check
  (headless Chromium at `/opt/pw-browsers/chromium` — `playwright`
  itself isn't a permanent dependency, installed with `npm install
  --no-save playwright` per session and uninstalled after) against
  **local Postgres** (`postgresql://postgres:postgres@localhost:5432/
  kit_gap_audit` — the `postgres` role's password was set locally this
  session; production `DATABASE_URL` in `.env` points at Railway and is
  unreachable from here), with Linear/Notion/Figma responses mocked via
  `page.route()` where the flow needs them.
- Anything that genuinely needs Linear/Notion/Figma/Railway is
  acknowledged as untested-from-here and flagged as such rather than
  faked. The one reliable real integration test available in this
  sandbox for the Linear-dependent routes is confirming they fail
  *gracefully* with the expected "Couldn't read tickets from Linear:
  ...403 Host not in allowlist..." error — which has actually been
  useful for confirming refactors didn't change behavior (byte-
  identical error text before/after).
- Local Postgres has occasionally stopped between shell invocations in
  this sandbox (environment quirk) — `service postgresql start` before
  any DB-dependent command fixes it.

## Where to look for more

- **`README.md`** — setup instructions, all API endpoint docs
  (request/response shapes), Notion/Figma/spreadsheet setup steps.
- **`ROADMAP.md`** — chronological build log with the reasoning behind
  each decision, kept up to date after every feature. More granular
  than this document; read it if you need the "why" behind something
  summarized here.
- **`BUILDPACK.md`** — the original spec this was built against (v0
  scope). Historical, superseded by everything built since.
- This file (`HANDOFF.md`) — update it if you make a change significant
  enough that a fresh agent picking this up next would need to know.

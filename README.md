# KIT Gap Audit

Turn messy context into clarity: what's missing, what's undecided, who owns
it, and what it blocks. Paste a transcript, notes, or a list of developer
estimates; KIT compares it against Linear tickets and previously handled
findings and surfaces the gaps.

See `BUILDPACK.md` for the full spec this was built against, and
`ROADMAP.md` for what's next.

For development and review, start with [CONTRIBUTING.md](CONTRIBUTING.md) and
the [engineering quality repair plan](docs/ENGINEERING-QUALITY.md). Repairs are
being tested independently of the live app; a local pass is not a deployment.
The repository contains private historical evidence and is **not cleared for
public sharing**.

## Signal forecasting when knowledge is incomplete

Signal forecasts **current eligible work, not just neatly classified work**.
Feature mapping is an organizational/review task, not permission to count a
ticket. This implementation's policy is versioned as `eligible-current-work.v1`. It does
not accept Scope, close Decisions, change Linear, or rewrite historical reports.

| Input | Forecast treatment |
| --- | --- |
| Open ticket in the configured project, mapped to an accepted feature | Included once, using its remaining-work range. |
| Eligible open ticket with no feature mapping | Included automatically as **Ungrouped work**, visibly assumed in. |
| Ticket explicitly linked to out/later or removed scope | Excluded. Mapping conflicts require review; deferral wins until resolved. |
| Done or canceled ticket | No remaining effort. Completion is not deployment/release approval. |
| Grouping parent with an eligible open child | Excluded as a second work item. Leaf selection happens against the full source read, before Scope filtering. A dangling parent still counts. |
| Triage | Uses the project's existing `includeTriage` setting. Not silently included. |
| Feature/meeting remaining-work estimate | Replaces only its explicitly reviewed covered ticket IDs. Additional and ungrouped tickets remain separate. |
| Missing effort estimate | Clearly labeled provisional **1 / 3 / 7 effort days**, not zero. Linear story points are not converted into days. |
| Already-built or reusable work | Record the remaining integration/testing effort in a reviewed Signal estimate; no automatic reuse or in-progress discount. Preserve the source quote when provided. |
| Unknown future work / unestimated unticketed feature | Not invented. Disclosed as a limitation; no arbitrary scope-growth buffer or accuracy penalty is applied. |

### Dates, percentages and readiness are different things

- The date is the model's P50; P10–P90 contains the middle 80% of simulated
  outcomes under the stated work, estimate, staffing and dependency assumptions.
- The target percentage is **the fraction of simulations finishing by the
  chosen target**, not a measured probability of real-world delivery and not
  an accuracy score. Missing information can move the result outside the range.
- Ungrouped work and open product choices are visible assumptions, not an
  automatic `Incomplete` wall. Reviewing/mapping a ticket alone must leave
  effort and the date unchanged. Deferring it or changing its estimate can
  legitimately change the date.
- `coverage.state = forecastable` means the conditional model is usable.
  `canonicalForecast = true` additionally means its coverage checks are reviewed;
  it is not approval to ship. `workPolicy`, assumed-in IDs, counts and reasons
  distinguish new conditional forecasts from historical subset forecasts.
- Missing/stale execution inputs, conflicting mappings, invalid/stale estimate
  boundaries, empty/all-deferred work and zero remaining effort retain refusal
  or qualified-subset behavior. Invalid ranges or no funded capacity cannot
  produce a useful date. An empty model must never look like 100% success.

### Playing with the plan and reporting it

**Scenario saved** means the named what-if has been stored. **Scenario unsaved**
means this draft has not been saved, or has edits since its named save. Neither
changes accepted Reality or creates a forecast report. Portfolio uses the shared
workspace's save state, so its label agrees with Saved Scenarios after saving,
reopening and reloading. Pausing a Scenario returns the view to Reality while
retaining the draft. Hermes answers use saved forecast reports, not a named
Scenario merely because it has been saved.

For saved report PDFs, use **Download PDF**. If the embedded browser does not
start the download, choose **Use browser download** beneath it. Both paths
require the same access checks; see [PDF download and recovery](docs/NATIVE-REPORT-PDF.md).

Forecast shows **Ungrouped work — already counted**. Use **Try deferring** to
test removing a ticket in the shared Scenario; **Restore** brings it back.
Review Scope to make an actual release choice. A Scenario never changes
accepted Reality automatically. Saved Scenarios retain explicit ticket IDs and
their existing baseline/currentness checks; new source work must be refreshed.

Forecast, Scope, Control Room and report generation use the same work boundary.
Reports may be saved with ungrouped work included when their other source,
estimate, coherent-revision and staffing checks pass. Saved Reality/Scenario
reports freeze the exact modeled inputs, coverage policy, assumed-in IDs and
model assumptions. Their renderers and recipient views carry the qualification;
old snapshots are never backfilled with today's rules. A downloadable planning
brief is still a local file, not an access-controlled published report site.
Recipient sharing/authentication rules are unchanged.

Core implementation: `lib/forecast/workBoundary.ts`, `coverage.ts`, `compute.ts`,
`lib/scenario/workItems.ts`, `lib/reports/scenarioCoverage.ts`, and the report
assumption snapshots. Tests: `npm run proof:current-work`, plus the existing
forecast, Scenario, report and browser regression suites. Passing local proofs
does not mean staging/production was deployed or real business inputs accepted.

The local browser proof supports both policies: run
`SIGNAL_PROOF_CURRENT_WORK=1 npm run proof:provisional-forecast-browser -- <output-directory>`
against an isolated loopback server to test automatic inclusion; omit that flag
to verify legacy subset behavior. The browser proof intercepts source reads with
fictional fixtures and refuses persistent writes. `proof:report-comparison-db`
separately exercises real persistence, guarded to a disposable local database.

### Requested staffing versus forecast capacity

In Portfolio, the fader is a **request**, not a way to create people. Each
channel distinguishes **Requested**, **Staffed**, and **Used by forecast** FTE.
The last value is staffed capacity after the shared context-switching assumption.

- Raising a fader uses free capacity first. If you request 6.0 FTE but only
  5.5 can be assigned, the remaining 0.5 stays visibly **unstaffed, not modeled**.
  The forecast uses 5.5 (less any switching costs), never an invented sixth person.
- Use **Take from** to transfer a real allocation from another project, or
  **Try hypothetical hire** to explicitly model extra people. Both stay in the
  shared Scenario until deliberately committed; a request alone is not a hire.
- Navigation, Scenario restoration, and planning exports retain the same
  allocations, explicit hires, switching assumptions, and unfilled requests.
  Planning briefs disclose shortfalls; accepted report/Reality write safeguards
  still reject unresolved staffing. Existing saved reports are not rewritten.

Regression checks: `npx tsx scripts/mixer-model-proof.ts`,
`npx tsx scripts/capacity-display-proof.tsx`, and `npm run proof:scenario-capacity-plan`.

### Recovering when a Scenario needs review

The Scenario is shared across instrument pages within a tab. If its baseline
changes (including the forecast start day), Signal withholds that Scenario's
preview rather than mixing old assumptions with current inputs. This does not
mean the live project or its data has been lost.

Use **Pause Scenario · view Reality** to keep working without approving or
discarding the draft. Signal writes and verifies a local paused copy before
leaving Scenario mode. **Paused Scenarios** remains visible across the instrument
pages; reopening restores the exact payload, original baseline, named-save
identity/revision and unsaved status, then checks current inputs again. It never
automatically rebases staffing, estimates or decisions. Previous paused copies
are retained rather than overwritten. Storage errors leave the active draft in
place and explain that pausing did not succeed.

Paused copies are **tab-local recovery**, not server saves: they survive reload
in that tab, but are not promised after closing it or on another device. Use a
named Scenario after reviewing inputs for durable/shared storage. The existing
explicit discard/replace actions remain distinct from pause. No accepted
Reality, named Scenario or report is written by pausing or reopening.

Regression checks: `npm run proof:scenario-workspace-lifecycle`,
`npm run proof:saved-scenarios`, `npm run proof:scenario-preview-refusal`, and
`npx tsx scripts/control-room-scenario-recovery-proof.ts`, plus browser checks
for pause, navigation, reload, reopening and stale-preview refusal.

## Stack

Next.js 15 (App Router, TypeScript) · Postgres via Prisma · Anthropic
(`claude-sonnet-4-6` by default) · `@linear/sdk` · shared operator password with
random, expiring server sessions and Node middleware. See
[operator authentication](docs/OPERATOR-AUTH.md) for origin checks, throttling,
session transition, and rollout/rollback requirements. This remains a shared
operator account, not individual-user identity or role-based access control.

## Local development

```bash
npm ci
cp .env.example .env   # use local development values, never production credentials
npx prisma migrate dev
npx prisma db seed     # seeds one Scope (JSA)
npm run dev
```

Open http://localhost:3000 — you'll be asked for `APP_PASSWORD`.

### Scopes

There's no hardcoded Linear team. Each audit runs against a **Scope**
(one validated Linear team/project boundary + optional label), managed at
`/scopes`. Adding a new KIT module (iTrack, Precon, ...) is a new Scope
row, not a redeploy.

Creation, renaming and reviewed activation share a concurrency-safe name/alias
check. Creation and selected dependencies save together; conflicting requests
return a recoverable message without leaving a partial project. Existing
projects and reports are never merged or rewritten to resolve a collision.
See [project write integrity](docs/PROJECT-WRITE-INTEGRITY.md) for validation,
normalization, tests and rollout limits. This describes the local repair branch,
not a claim that a deployment has occurred.

Project setup has a separate draft identity. Editing that identity retires old
proposals and requires a fresh scan, without erasing their quotes or review
history. Late scan results cannot quietly restore the old proposals. Failed
review saves keep the entered draft visible for correction and retry. See
[project setup and review integrity](docs/BOOTSTRAP-WRITE-INTEGRITY.md).

## Deploying to Railway

1. **New project.** In Railway, create a new project. Keep it separate from
   any other projects on your account.
2. **Add Postgres.** In the project, click **+ New → Database → Add
   PostgreSQL**. Once it's up, open its **Variables** tab and copy the
   `DATABASE_URL` value (or reference it directly in step 4 below).
3. **Add the app service.** Click **+ New → GitHub Repo** and select this
   repo (`kit-gap-audit`). Point it at the branch you want deployed.
4. **Set environment variables** on the app service (Variables tab):
   - `DATABASE_URL` — reference the Postgres service's `DATABASE_URL`
     (Railway lets you do this with a variable reference,
     `${{Postgres.DATABASE_URL}}`, so it stays in sync)
   - `LINEAR_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `AUDIT_MODEL` — `claude-sonnet-4-6`
   - `APP_PASSWORD` — pick something real; this gates the whole app
5. **Deploy.** Railway builds with Nixpacks and reads `railway.json`, whose
   start command runs `npx prisma migrate deploy` before `next start` — so
   every deploy applies any new migrations automatically. No separate
   release step to configure.
6. **Seed the first Scope.** Once the service is up, run once from your
   machine (with Railway's `DATABASE_URL` in your shell), or via
   `railway run npx prisma db seed`:
   ```bash
   DATABASE_URL="<railway postgres url>" npx prisma db seed
   ```
   Or just add it by hand at `/scopes` in the running app — same result,
   no CLI needed.
7. **Verify.** Visit the deployed URL, log in with `APP_PASSWORD`, and hit
   `/api/debug/linear` (while logged in) to confirm the Linear read works.
   Then run a real audit from `/audit/new`.

### Why the start command handles migrations

Railway doesn't have a separate "release phase" the way Heroku does, so the
standard pattern is to chain the migration into the start command:
`npx prisma migrate deploy && npm run start` (see `railway.json`). This runs
on every deploy, is a no-op when there's nothing new to migrate, and keeps
the schema and the running app in lockstep.

## Notion requirements as estimator input

Optional: link Notion pages (requirements docs, scoping docs) to a Scope
and their content is pulled in as context for the AI estimator — the model
reads the requirements alongside each ticket when estimating.

Setup:

1. Create an **internal integration** at
   [notion.so/my-integrations](https://www.notion.so/my-integrations) and
   copy its secret into `NOTION_API_KEY` (Railway env var).
2. **Share each page with the integration** — open the page in Notion, ⋯
   menu → Connections → add your integration. Without this step the API
   returns 404 for that page (Notion's way of saying "not shared").
3. On `/forecast` → "Team & release context" → paste the page URLs (one
   per line).

Changing the linked docs (or their content) marks all estimates stale —
context legitimately changes every estimate — so the next "Estimate
tickets with AI" run re-estimates everything against the new context.

## Figma design references as estimator input

Optional, same idea as Notion but for design: link Figma frames/pages to a
Scope and their screen names, flow names, and on-canvas text are pulled in
as estimator context — useful for scope that's still in design with no
written requirements doc yet.

Setup:

1. Generate a **personal access token** at figma.com → account settings →
   Security → Personal access tokens, and set `FIGMA_API_KEY` (Railway env
   var). No per-file sharing step like Notion — the token's owner just
   needs their own access to the file.
2. In Figma, click the specific page or frame you want (not just the file
   root) so the URL includes a `node-id`, then copy that link.
3. On `/forecast` → "Team & release context" → paste the URL(s), one per
   line.

The estimator is told to treat Figma content as *current design intent* —
useful for judging structural scope and relevance — not as committed
requirements the way a written Notion doc is. That distinction matters
most for anything still in active design.

## Pasted context (spreadsheets, notes) as estimator input

For team-tracking data that doesn't have a live API to sync from — a
SharePoint/Excel task list, meeting notes, anything else — paste its
content directly rather than linking it, or upload the file:

1. On `/forecast` → "Team & release context" → "Other context" → give it a
   short label (e.g. the sheet's filename and date) and either paste the
   rows as text, or click **Upload .txt / .md / .csv / .xlsx** and pick the
   file directly — `.xlsx` workbooks are parsed server-side into the same
   pipe-delimited row format as a manual paste; a multi-sheet workbook
   shows a sheet picker so you choose which tab matters. The Audit form
   (`/audit/new`) has the same upload option for transcripts/notes.
2. Click **Add**. It's included in the estimator's context immediately,
   same as a Notion doc.
3. To update it, remove the old one and paste/upload the new version —
   re-adding marks affected estimates stale, same as an edited Notion doc.

Treated as a signal alongside Linear's own points and estimates, not
automatically correct — the model is told a team's own tracking sheet can
be as rough as its Linear pointing.

## API: running an audit programmatically

`POST /api/audit` is the same endpoint the `/audit/new` form submits to —
it's a real API, not a UI-only action. An external agent (e.g. a personal
automation agent monitoring calls) can call it directly to submit a
transcript and get findings back as JSON, without touching the browser.

**Auth**: either the browser's cookie session, or, for programmatic callers,
an `Authorization: Bearer <APP_PASSWORD>` header. Same shared secret as the
UI login for now — no separate API keys yet.

Cookie-authenticated writes require an exact same-origin `Origin` header.
Ordinary browser requests supply it automatically. Explicit bearer clients may
omit it; if supplied, it must match. Bridge transports retain their separate
scoped bearer token and do not accept the operator password bearer. Browser
session tokens must come from login; deriving a cookie from the password is no
longer supported outside an explicitly configured, short migration window.

```
POST /api/audit
Authorization: Bearer <APP_PASSWORD>
Content-Type: application/json

{
  "scopeId": "cmrod5o1s0000os1y75kwumnh",  // required, see GET below
  "kind": "transcript",                     // required: transcript | notes | estimates | spreadsheet
  "title": "JSA Status Quick Sync 7-16",    // optional, defaults to "<Kind> — <date>"
  "content": "Maya: ... Nic: ..."           // required, the raw text to audit
}
```

Response (`200`):

```
{
  "source": { "id": "...", "kind": "...", "title": "...", "content": "...", "scopeId": "...", "createdAt": "..." },
  "findings": [
    {
      "id": "...",
      "type": "missing_work",        // missing_work | decision | risk | contradiction
      "title": "...",
      "quote": "...",                // verbatim from content
      "rationale": "...",
      "severity": "high",            // high | medium | low
      "estimateHint": "needs scoping" | null,
      "owner": "Priya" | null,       // decisions only
      "blocks": "..." | null,        // decisions/risks
      "blocking": true,
      "matchedIssues": ["SOF-497"],
      "status": "open",
      "linearIssueId": null,
      "dismissReason": null,
      "createdAt": "..."
    }
  ]
}
```

Errors are `400` (bad input), `401` (missing/wrong auth), `404` (unknown
`scopeId`), or `502` (Linear or Anthropic call failed) — always
`{ "error": "..." }`.

To find a `scopeId`, call `GET /api/scopes` (same auth) and match on `name`.

Not built yet, and deliberately deferred: Hermes doesn't have a way to know
*which* Scope a given transcript belongs to, or to be notified that a run
happened without someone checking the UI. That routing/notification layer
is a real design question once both sides exist to actually talk to each
other — this endpoint is just the entry point it would call.

## API: triggering a full refresh (audit + estimate + forecast + report)

`POST /api/refresh` is the "here's the context, work your magic" entry
point — one call that does everything a manual pass through the UI would:
push fresh context, optionally audit a new transcript, re-run AI
estimation, re-run the forecast, and optionally generate a leadership
report. Built for Hermes/Cowork to trigger a refresh without sequencing
four separate calls itself. Same Bearer auth as `/api/audit`.

**This is a push, not a pull.** The app has no way to reach into Hermes'
local ledger or wiki — it can only act on what's sent to it in the
request body. If you want a refresh to include Hermes' context (its
decision ledger, recent notes, whatever), Hermes has to generate that
scoped brief itself and include it as a `contextDocs` entry in the call —
same shape as pasting into "Other context" on `/forecast` manually, just
automated. There's no scheduled or automatic pull in either direction.

```
POST /api/refresh
Authorization: Bearer <APP_PASSWORD>
Content-Type: application/json

{
  "scopeId": "cmrod5o1s0000os1y75kwumnh",     // required
  "transcript": {                              // optional — audits a new transcript first
    "kind": "notes",                            // transcript | notes | estimates | spreadsheet
    "title": "...",                             // optional
    "content": "..."
  },
  "contextDocs": [                              // optional — pushed/updated before anything else
    { "label": "Hermes brief — JSA", "content": "..." }
  ],
  "generateReport": false                       // optional — also creates a Report if true
}
```

Response (`200`):

```
{
  "ok": true,
  "scopeId": "...", "scopeName": "...",
  "contextDocsUpdated": ["Hermes brief — JSA"],  // labels pushed this call, created or updated
  "audit": { "sourceId": "...", "findingCount": 3 } | undefined,
  "estimate": { "total": 40, "estimated": 6, "cached": 34, "failed": 0 },
  "forecast": {
    "likelyDate": "...", "earliestDate": "...", "latestDate": "...",
    "confidenceAtTarget": 62,
    "breakdown": { ... }                          // same shape as GET /api/forecast
  },
  "contextComplete": true,                       // false if a configured Notion/Figma source failed to load
  "contextIssues": [],                           // human-readable reasons when contextComplete is false
  "report": { "id": "...", "summaryMarkdown": "..." } | undefined
}
```

**Check `contextComplete` before trusting the result.** On the `/forecast`
page a human sees the warning text inline if Notion or Figma fails to
load; an unattended refresh has no one watching, so a silently degraded
context could drift the number for days unnoticed. `contextComplete:
false` means treat this run's numbers as unreliable and surface
`contextIssues` back to Nic rather than reporting them as a normal
refresh.

Context docs are pushed *before* the transcript/estimate/forecast steps,
which need Linear — so if Linear is unreachable, freshly pushed context
still lands and shows up in `contextDocsUpdated` even though the call
returns a `502`. Pushing the same `label` again replaces that doc's
content rather than creating a duplicate.

Errors are `400` (bad input), `401` (missing/wrong auth), `404` (unknown
`scopeId`), or `502` (Linear or Anthropic call failed) — same shape as
`/api/audit`, with whatever partial progress (`contextDocsUpdated`,
`audit`, `estimate`) completed before the failure included in the error
body.

## Project structure

- `lib/model.ts` — single wrapper for Anthropic calls (model/tokens from
  env, defensive JSON parsing)
- `lib/linear.ts` — all Linear reads/writes, driven by Scope
- `lib/audit/prompts/audit-v1.ts` — the extraction prompt as a versioned
  template
- `lib/audit/normalize.ts` — defensive parsing/validation of raw findings
- `prisma/schema.prisma` — persisted project, evidence, Scenario and report records
- `lib/project/contracts.ts` — framework-neutral project and Scenario types
- `lib/instrument/useProject.ts` — client project loading, shared preview and recovery
- `lib/forecast/` and `lib/scenario/` — shared simulation and what-if rules
- `lib/reports/` — frozen report snapshots, presentation and recipient access
- `components/instrument/`, `components/timeline/`, `components/reports/` — live
  Forecast, Scope, Timeline and Reports views (not placeholders)
- `tests/unit/` — isolated behavioral regressions; `scripts/*proof*` contains
  additional domain, database and browser checks with differing safety requirements

# ROADMAP

Read this file, then continue. v0 (Audit + Decisions) is built and deployed.
Everything below is v1+.

## Where things stand

- `Finding` already carries `estimateHint`, `blocks`, and `blocking` — the
  Forecast engine below can consume findings + Linear estimates directly.
  **No schema migration needed to start v1.**
- Nav already has Forecast / Timeline / Reports wired in as placeholder
  pages (`app/forecast`, `app/timeline`, `app/reports`) — turning them on
  is additive, not structural.
- Linear access is Scope-driven (`/scopes`), not an env var — adding a new
  module (iTrack, Precon, ...) is a data row, not a redeploy.
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

### 1. Forecast (`/forecast`)

Three-point estimates (best/likely/worst) on open work items → a simple
Monte Carlo or triangular-distribution simulation → a likely/earliest/latest
release date view, in the visual language of the KIT mockup (the confidence
ring, the date range bar).

Inputs: Linear issue estimates for scoped, un-done issues, plus
`estimateHint` from open findings for work that has no ticket yet. Decisions
with `blocking: true` should visibly gate the forecast (a blocking decision
with no resolution means "this date isn't real yet," same as the mockup's
readiness warning).

Where it plugs in: a new `lib/forecast/` module (simulation logic), reading
from `lib/linear.ts` and Prisma directly. No new tables needed for the first
pass.

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

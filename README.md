# KIT Gap Audit

Turn messy context into clarity: what's missing, what's undecided, who owns
it, and what it blocks. Paste a transcript, notes, or a list of developer
estimates; KIT compares it against Linear tickets and previously handled
findings and surfaces the gaps.

See `BUILDPACK.md` for the full spec this was built against, and
`ROADMAP.md` for what's next.

## Stack

Next.js 15 (App Router, TypeScript) · Postgres via Prisma · Anthropic
(`claude-sonnet-4-6` by default) · `@linear/sdk` · single-password auth via
an httpOnly cookie in `middleware.ts`.

## Local development

```bash
npm install
cp .env.example .env   # fill in real values
npx prisma migrate dev
npx prisma db seed     # seeds one Scope (JSA)
npm run dev
```

Open http://localhost:3000 — you'll be asked for `APP_PASSWORD`.

### Scopes

There's no hardcoded Linear team. Each audit runs against a **Scope**
(Linear team key + optional project name + optional label), managed at
`/scopes`. Adding a new KIT module (iTrack, Precon, ...) is a new Scope
row, not a redeploy.

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
- `prisma/schema.prisma` — `Scope`, `Source`, `Finding`, `AuditRun`
- Nav ships with Forecast / Timeline / Reports as placeholders — see
  `ROADMAP.md` for what they'll become.

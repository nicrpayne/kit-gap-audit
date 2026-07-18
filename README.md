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
  "kind": "transcript",                     // required: transcript | notes | estimates
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

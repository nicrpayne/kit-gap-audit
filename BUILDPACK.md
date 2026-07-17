KIT Gap Audit — Build Pack v2 (Railway edition)
Supersedes v1. Changes: Railway instead of Vercel/Neon, decisions elevated to a first-class output, and the codebase structured so Forecast/Timeline (Gantt) slot in tomorrow without rework.
The product's job, in one line: turn messy context into clarity and clear next steps — what's missing, what's undecided, who owns it, and what it blocks.
v0 scope (tonight)

1. Paste/upload a transcript, notes, or dev-estimate list
2. App pulls all issues from the Linear JSA project
3. Claude audits the context against tickets + previously handled findings and produces findings in four types: missing_work, decision, risk, contradiction — each with a verbatim quote, severity, rationale, estimate hint, and (for decisions) an owner and what it blocks
4. Review each finding: Draft ticket (real Linear issue, label `kit-found`) or Dismiss (reason stored, never re-raised)
5. Decision Queue: a dedicated view of all open decisions across all sources — blocking vs non-blocking, owner, what each blocks. This is the page you screenshot into leadership threads.
NOT tonight: forecasting math, Gantt rendering, Notion/Figma connectors, multi-user auth. But the shell, nav, and data model leave room for them (see "Built for tomorrow" below).
Part A — Your setup checklist (~15 min)

1. Linear API key: Linear → Settings → Security & access → Personal API keys. Note the JSA team key (e.g. `JSA`).
2. Anthropic API key: console.anthropic.com (add ~$20 credit if new).
3. Railway: you already have an account (rebel-leader.com lives there). Create a new project — keep it fully separate from the Rebel Leaders project. Add a Postgres service to it and copy the `DATABASE_URL`.
4. GitHub: empty private repo `kit-gap-audit`.
5. Claude Code installed and signed in (desktop app is fine).
Secrets to have ready: `LINEAR_API_KEY`, `LINEAR_TEAM_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `APP_PASSWORD`.
Data note: KE meeting content on your personal Railway account is fine for a password-protected prototype; plan to move it into KE infrastructure before the team uses it.
Part B — Architecture (decided; the agent should not relitigate)

* Stack: Next.js 15 (App Router, TypeScript), one repo, one deploy.
* DB: Postgres (Railway) via Prisma.
* Auth: single `APP_PASSWORD` → httpOnly cookie via middleware.
* Deploy: Railway, GitHub-connected service. Include a `railway.json` (or Nixpacks defaults) so build/start commands are explicit. Prisma migrations run via a release/predeploy command.
* LLM: `claude-sonnet-4-6` for extraction; model name in an env var (`AUDIT_MODEL`) so upgrading later is a config change.
* Linear: `@linear/sdk`. Read issues; create issues with label `kit-found`.
Data model (Prisma)

```prisma
model Source {
  id        String    @id @default(cuid())
  kind      String    // "transcript" | "notes" | "estimates"
  title     String
  content   String
  createdAt DateTime  @default(now())
  findings  Finding[]
}

model Finding {
  id            String   @id @default(cuid())
  sourceId      String
  source        Source   @relation(fields: [sourceId], references: [id])
  type          String   // "missing_work" | "decision" | "risk" | "contradiction"
  title         String
  quote         String
  rationale     String
  severity      String   // "high" | "medium" | "low"
  estimateHint  String?
  owner         String?  // for decisions: who seems to own the call
  blocks        String?  // for decisions/risks: what this is holding up
  blocking      Boolean  @default(false) // true = actively blocks scoped work
  matchedIssues String[]
  status        String   @default("open") // open | ticketed | dismissed | resolved
  linearIssueId String?
  dismissReason String?
  resolution    String?  // for decisions: what was decided, when marked resolved
  createdAt     DateTime @default(now())
}

model AuditRun {
  id           String   @id @default(cuid())
  sourceId     String
  issueCount   Int
  findingCount Int
  model        String
  createdAt    DateTime @default(now())
}

```

Pages / routes

* `/` — dashboard: open-decision count (blocking highlighted), untracked finding count, recent sources, "New audit" CTA
* `/audit/new` — textarea + .txt/.md upload, kind selector, Run audit
* `/audit/[sourceId]` — findings for one source; filter chips (All / Missing tickets / Decisions / Risks / Contradictions); actions per finding: Draft ticket / Dismiss (reason)
* `/decisions` — the Decision Queue: every open decision across all sources. Two sections: Blocking (top, red accent) and Non-blocking. Columns: decision, owner, what it blocks, source (linked), age. Action: Mark resolved (records the resolution text — that resolution is then fed to future audits as handled context)
* Nav shell with tabs: Audit · Decisions · Forecast · Timeline · Reports — Forecast/Timeline/Reports render a clean "coming next" placeholder page (one sentence on what it will do), so the app already looks like the KIT product and tomorrow's work is additive, not structural
* API: `POST /api/audit`, `POST /api/findings/[id]/ticket`, `POST /api/findings/[id]/dismiss`, `POST /api/findings/[id]/resolve`, `GET /api/debug/linear`
Visual style
Warm off-white (#F1F0E8), deep green-ink accents (#0D7A5F on #10201B), serif display headers, generous whitespace, severity dots, italic quotes. Match the KIT mockup language: calm, evidence-forward, no dashboard clutter.
The core route: `POST /api/audit`

1. Fetch all non-canceled issues for `LINEAR_TEAM_KEY`: identifier, title, description (truncate 500 chars), state, estimate, assignee, labels.
2. Fetch prior findings with status `dismissed`, `ticketed`, or `resolved` (title + status + resolution) — passed as "already handled."
3. Call Anthropic (model from `AUDIT_MODEL`, max_tokens 8000) with the extraction prompt below. Parse defensively (strip code fences, tolerate trailing commas).
4. Store Source, Findings, AuditRun. Return findings.
Extraction prompt (base version — iterate in prod)

```
You are a release-planning auditor. You will receive:
(A) the full list of existing Linear tickets for a software project,
(B) previously handled findings with their resolutions (do not re-raise), and
(C) new context: a meeting transcript, notes, or developer estimates.

Your job: surface everything in (C) that is real work, a required decision,
a risk, or a contradiction of existing tickets, that is NOT adequately
covered by (A) or handled in (B). The goal is clarity and clear next steps.

Rules:
- Every finding MUST include a short verbatim quote from (C) as evidence.
- "missing_work": concrete work implied or stated with no matching ticket.
  Match generously — if a ticket plausibly covers it, it is NOT missing
  (list that ticket in matchedIssues instead).
- "decision": an open question that must be answered for work to be scoped,
  scheduled, or released. Set "owner" to whoever the text suggests owns the
  call (or null). Set "blocks" to what it's holding up, in plain language.
  Set "blocking": true only if it blocks work that is already scoped or
  in progress; false if it blocks future/optional scope.
- "risk": stated uncertainty or dependency that could delay release. Use
  "blocks" for what it threatens.
- "contradiction": the conversation implies a ticket's scope, status, or
  estimate is wrong. Name the ticket in matchedIssues.
- severity: "high" if it plausibly moves the release date or blocks other
  work; "medium" if it adds work; "low" otherwise.
- estimateHint: rough range in days, or "decision, not a build", or
  "needs scoping".
- Prefer fewer, sharper findings over exhaustive noise. Cap at 15.

Respond with ONLY a JSON array of objects:
{ "type", "title", "quote", "rationale", "severity", "estimateHint",
  "owner", "blocks", "blocking", "matchedIssues": ["JSA-123", ...] }
No markdown, no preamble.

```

Built for tomorrow (structure now, features later)
The agent must set these up tonight so v1 is additive:

* `lib/model.ts` — single wrapper for all Anthropic calls (model, tokens, JSON parsing in one place)
* `lib/linear.ts` — all Linear reads/writes
* `lib/audit/` — extraction prompt as a versioned template file (`prompts/audit-v1.ts`), so prompt iterations are diffs, not archaeology
* Finding already carries `estimateHint`/`blocks`/`blocking` — the Forecast engine will consume findings + Linear estimates directly; no schema migration needed for v1's first pass
* Placeholder pages for Forecast / Timeline / Reports wired into nav
* `ROADMAP.md` in the repo: agent writes a short v1 plan (three-point estimates on work items → simulation engine → likely/earliest/latest date view; Gantt from Linear issues + findings; leadership report generator) so tomorrow's session starts with `read ROADMAP.md and continue`
Part C — Claude Code kickoff prompt (paste into Claude Code in an empty folder containing this file as BUILDPACK.md)

```
Read BUILDPACK.md in this directory. It is the complete spec — follow it
exactly, including the Prisma schema, routes, extraction prompt, and the
"Built for tomorrow" structure requirements. Do not redesign the
architecture. The product's job is producing clarity and clear next steps:
missing work, and decisions with owners and what they block.

You have full discretion over subagents and model selection — parallelize
independent work (e.g., UI components vs API routes) with subagents where
safe, use cheaper models for boilerplate, and reserve deeper reasoning for
M3, which is the core of the app. Optimize for shipping tonight.

Build in this order, committing after each milestone:

M1 — Scaffold: Next.js 15 + TypeScript + Prisma + schema, .env.example,
     password middleware, nav shell with Audit / Decisions / Forecast /
     Timeline / Reports (last three as clean "coming next" placeholders).
M2 — Linear: lib/linear.ts (@linear/sdk) + /api/debug/linear returning
     issue count. STOP here and ask me for env vars; verify the debug
     route together before continuing.
M3 — Core audit: /api/audit per spec — prior-findings exclusion, versioned
     prompt file, defensive JSON parsing, lib/model.ts wrapper.
M4 — UI: /audit/new, /audit/[sourceId] with filters and Draft ticket /
     Dismiss actions, /decisions Decision Queue (blocking section on top,
     Mark resolved flow), dashboard at /.
M5 — Ship: loading/error states (Linear and Anthropic failures especially),
     railway.json + Prisma migrate on deploy, README with exact Railway
     steps (new project, Postgres service, GitHub-connected service, env
     vars), and write ROADMAP.md per the spec so tomorrow's session starts
     with "read ROADMAP.md and continue."

After M5, walk me through the Railway deploy step by step and verify
production works end to end.

Acceptance test before we're done: I will paste a real meeting transcript.
The audit must surface at least: a missing test-infrastructure ticket, a
beta-to-release-window decision (owner and what it blocks populated), and
a PDF template ownership decision — each with a verbatim quote. The
Decision Queue must show them with blocking status. "Draft ticket" must
create a real Linear issue labeled kit-found.

```

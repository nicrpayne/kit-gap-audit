# Signal intelligence architecture

**What Signal can actually do today, versus the product vision.**

This is a discovery document. It was produced by reading the code, not by
running the product against production data, and it changes nothing. Where
it states a behaviour, the file and function that produce that behaviour
are named so the claim can be checked rather than believed.

## How to read this

Three words are used strictly:

- **Exists** — there is a code path a user or an external caller can
  actually reach today.
- **Partial** — the mechanism exists but something material is missing: no
  entry point, no producer, no consumer, or it only works in one of the
  two cases it claims to cover.
- **Does not exist** — no code, no model, no route.

"A user" means someone operating the browser. "A caller" means an external
system holding `APP_PASSWORD` and posting to the API. These are very
different populations in Signal today, and the difference turns out to be
the single most important finding in this document.

## Provenance of the evidence in this document

Every code claim comes from the repository at the current HEAD of
`claude/scope-instrument-design-w5bz09`.

Every *data* observation — row counts, which snapshots exist, which
registrations exist — comes from the **local development database**
(`DATABASE_URL` pointing at localhost, `KIT_DEV_FIXTURES=1`, no
`LINEAR_API_KEY`). It is **not production evidence**, and nothing in this
document should be read as a statement about what is in the Railway
database. Where a local observation is used, it is labelled `[dev DB]`.

This distinction is not pedantry. An earlier audit in this project
mislabelled dev-database findings as production-verified, and the
correction is the reason this section exists.

---

# Part 1 — Current Audit capability

## User entry

| | |
|---|---|
| Routes | `/audit` (index), `/audit/new` (run one), `/audit/[sourceId]` (results) |
| Server pages | `app/audit/page.tsx`, `app/audit/new/page.tsx`, `app/audit/[sourceId]/page.tsx` |
| Components | `components/AuditNewForm.tsx` (input), `components/AuditFindings.tsx` + `components/FindingCard.tsx` (output) |
| API | `POST /api/audit` (`app/api/audit/route.ts`) |
| Engine | `lib/audit/run.ts` → `runAudit()` |

**Required inputs** (`AuditNewForm.tsx`, validated again in
`app/api/audit/route.ts`):

- `scopeId` — which project. Required. No default beyond the first Scope
  in the dropdown.
- `kind` — one of `transcript` | `notes` | `estimates` | `spreadsheet`
  (`VALID_AUDIT_KINDS`, `lib/audit/run.ts:21`). Purely descriptive: it is
  shown to the model, stored on `Source.kind`, and used for the default
  title. **Nothing branches on it.**
- `content` — the pasted text. Required and non-empty. A `.txt/.md/.csv`
  file is read client-side into the same textarea; `.xlsx` is flattened
  first by `POST /api/parse-spreadsheet`.
- `title` — optional; defaults to `"Transcript — 2026-08-21"`.

There is exactly one button that starts an audit, and it lives on
`/audit/new`. **No other surface in Signal can run an audit.** Not the
Control Room, not Forecast, not Reports.

## Processing flow

```
Paste (transcript | notes | estimates | spreadsheet)
  │
  ▼
POST /api/audit                        app/api/audit/route.ts
  │  validates content / kind / scopeId, loads Scope
  ▼
runAudit(scope, input)                 lib/audit/run.ts:84
  │
  ├─► getScopedIssues(scope)           lib/linear.ts:111
  │     Linear GraphQL, filtered by teamKey + projectNames + labelFilter,
  │     state.type ≠ canceled. 60s in-process cache. Returns identifier,
  │     title, description, state, estimate, assignee, labels.
  │
  ├─► prisma.finding.findMany          status ∈ {dismissed, ticketed, resolved}
  │     reached via Source.scopeId OR ContextSnapshot.scopeId
  │
  ├─► buildAuditPrompt(...)            lib/audit/prompts/audit-v1.ts:92
  │     (A) every in-scope Linear ticket
  │     (B) previously handled findings + resolutions ("do not re-raise")
  │     (C) the new context: pasted text and/or package evidence
  │
  ├─► completeJson({prompt, maxTokens: 16000})   lib/model.ts
  │     Anthropic, AUDIT_MODEL (default claude-sonnet-4-6)
  │
  ├─► normalizeFindings(raw)           lib/audit/normalize.ts
  │
  ├─► prisma.source.create             one Source row (the pasted text, verbatim)
  ├─► prisma.finding.create × N        one Finding per surviving proposal
  └─► prisma.auditRun.create           {sourceId, contextSnapshotId, issueCount,
                                        findingCount, model}
```

**Database models written:** `Source`, `Finding`, `AuditRun`. Nothing
else. No Decision, no Report, no TimelineEvent, no Linear write.

**Finding shape** (`prisma/schema.prisma`, `model Finding`): `type` ∈
`missing_work | decision | risk | contradiction`, `severity` ∈
`high | medium | low`, plus `quote` (required verbatim evidence),
`rationale`, `estimateHint`, `owner`, `blocks`, `blocking`,
`matchedIssues[]`, `status`, `evidenceRefs[]`, `contextSnapshotId`.

## The ten questions, answered

**Does Audit call any LLM?** **Yes.** One call per run, `completeJson` at
`lib/audit/run.ts:137`, `maxTokens: 16000`, model `AUDIT_MODEL` (default
`claude-sonnet-4-6`). This is one of only three LLM call sites in the
product; the others are the estimator (`lib/estimate/`) and the two fixed
Ask questions (`POST /api/forecast/ask`).

**Does Audit call Linear?** **Yes**, once, at the start
(`getScopedIssues`). The full in-scope ticket list is section (A) of the
prompt. If Linear is unreachable the audit throws and the route returns
502 — there is no degraded "audit without tickets" mode, deliberately,
because the whole claim an audit makes is *"this is not covered by
existing tickets."*

**Does Audit use uploaded context?** **Partial.** It uses exactly what was
pasted into that one form. It does **not** read `ContextDoc` rows, Notion
pages (`Scope.notionPageIds`) or Figma refs (`Scope.figmaRefs`) — those
feed the *estimator*, not the auditor. So a Scope can have rich standing
context that the audit never sees.

**Does Audit use Hermes packages?** **Yes, but only through
`POST /api/refresh`.** `runAudit` accepts a `PackageAuditContext`
(`lib/audit/run.ts:36`) carrying `contextSnapshotId` + the package's
`evidence[]`, rendered into the prompt as its own block with stable ids
the model can cite. `POST /api/audit` never passes it. See Part 3.

**Does Audit compare against existing project reality?** **Yes, against
two of the three kinds.** It compares against live Linear tickets and
against previously *handled* findings. It does **not** compare against
open Decisions, against DecisionGates, against the current forecast, or
against still-open Findings. That last one is a live defect: only
`dismissed | ticketed | resolved` are sent as "do not re-raise"
(`HANDLED_STATUSES`, `lib/audit/run.ts:9`), so **auditing a second
transcript that discusses the same unresolved gap will raise it again**,
as a second open Finding, which then counts twice in the forecast's
inferred work.

**Does Audit create findings?** **Yes** — that is its only output.
Subject to one hard invariant: a finding produced by a *package-only* run
(no pasted transcript) that cites no valid evidence id is **rejected, not
saved** (`lib/audit/run.ts:181`), and returned to the caller as
`rejectedFindings`. Signal will not persist a conclusion it cannot trace.

**Do findings affect Forecast?** **Yes, materially.** In
`lib/forecast/build.ts:298`, every Finding with `type !== "decision"` and
`status === "open"` becomes a simulated work item — an "inferred" item
alongside real tickets. Its duration comes from an AI estimate if one is
cached and fresh, from a parseable day range in `estimateHint` otherwise,
and from a hard-coded placeholder if neither
(`estimateSource: "finding_placeholder"`). **So dismissing a finding
moves the date, and so does raising one.** Findings of `type: "decision"`
do *not* enter the forecast; only a `DecisionGate` can delay delivery,
and only a Decision row can carry a gate.

**Do findings affect Reports?** **Yes.** `lib/reports/generate.ts:40`
takes findings of `type === "decision"` with `status === "open"` and
splits them into `blockingDecisions` (`blocking: true`) and
`nonBlockingDecisions`. The blocking list, with each finding's verbatim
quote, is the "What's blocking" section of every report.

**Can findings create tickets?** **Yes, in Linear, with a two-step
confirmation.** `FindingCard` → "Draft ticket" issues a *read-only*
`GET /api/findings/[id]/ticket/preview`; the write only happens on
"Create issue in Linear", a `POST` carrying `{confirm: true}`. An
unconfirmed POST is refused with 400 and returns the preview instead
(`app/api/findings/[id]/ticket/route.ts`). Both paths compose the payload
through one shared function (`lib/findings/ticketPayload.ts`) so preview
and reality cannot drift. On success the finding moves to
`status: "ticketed"` with `linearIssueId` recorded;
`POST /api/findings/[id]/unlink` reopens it while deliberately preserving
`linearIssueId` so the provenance survives.

**Can findings create decisions?** **No.** There is no route, button or
API that turns a Finding into a `Decision` row. `Decision.sourceFindingId`
exists in the schema, but the only writer is the one-off backfill
`scripts/migrate-decisions.ts`. The three live `decision.create` call
sites are: accepting a DecisionCandidate, the manual `POST /api/decisions`
form, and `POST /api/decisions/import` (paste/spreadsheet). **A
`type: "decision"` Finding is therefore a dead end** — it appears in
reports, it is visible on `/audit/[sourceId]`, and it can never become a
tracked, gateable Decision without someone retyping it.

## "What does pressing Run Audit actually do today?"

It takes one blob of text you pasted, fetches every live Linear ticket in
that project, adds the list of findings you have already dealt with, and
asks Claude once: *what in this text is real work, a required decision, a
risk, or a contradiction, that these tickets don't already cover?*

It saves the text as a `Source`, saves up to fifteen answers as
`Finding` rows, and logs an `AuditRun`. From there, the non-decision
findings immediately become simulated work in the Forecast, the blocking
decision findings appear in the next Report, and each finding gets two
buttons: draft a Linear ticket from it, or dismiss it with a reason.

What it does **not** do: read anything you didn't paste, notice that this
transcript contradicts *last* month's transcript, re-check whether a
previously raised gap has since been ticketed by someone else, produce a
decision you can track, or tell you anything about the audit as a whole.
There is no run summary — you get a list of findings, not a briefing.

---

# Part 2 — Current Reports capability

## How reports are created

One route, one trigger, one function.

| | |
|---|---|
| Page | `/reports` → `app/reports/page.tsx` → `components/ReportsPageClient.tsx` |
| API | `GET /api/reports?scopeId=` (list) · `POST /api/reports` (generate) |
| Engine | `lib/reports/generate.ts` → `generateReport(scope, contextSnapshotId?)` |
| Rendering | `lib/reports/render.ts` → `renderReportMarkdown()` — pure, no DB, no network |
| Diffing | `lib/reports/changes.ts` → `computeChangesSince()` |
| Snapshot honesty | `lib/reports/snapshot.ts` → `describeSnapshot()`, `withSnapshotProvenance()` |

**What triggers generation:** a human pressing "Generate report" on
`/reports`, or an external caller passing `generateReport: true` to
`POST /api/refresh`. Nothing else. There is no schedule, no cron, no
trigger on a forecast movement, no trigger on a new context package
arriving unless the caller asks for one.

## The pipeline

```
POST /api/reports {scopeId}
  │
  ▼
generateReport(scope)                       lib/reports/generate.ts:25
  │
  ├─► computeForecast(scope)                the SAME function /forecast calls
  │     → likelyDate, earliestDate, latestDate, confidenceAtTarget,
  │       findings, issues, scenarios
  │
  ├─► prisma.report.findFirst (previous, by generatedAt desc)
  │
  ├─► computeChangesSince(scope, forecast, previousReport.generatedAt)
  │     shipped:  issues with stateType "completed" and completedAt > since
  │     resolved: findings type "decision", status "resolved", resolvedAt > since
  │
  ├─► blocking / non-blocking decision findings, best scenario,
  │     likelyDateDeltaDays vs the previous report
  │
  ├─► renderReportMarkdown(data)            pure string assembly
  │
  └─► prisma.report.create({ ..., summaryMarkdown })
```

`generateReport` **never persists a ContextSnapshot** — it only stamps an
id it was handed. The one-package-one-snapshot invariant lives entirely in
`POST /api/refresh`.

## What is stored, what is snapshot, what is live

**Stored on the `Report` row** (immutable after creation — nothing in the
codebase ever updates a Report):

`generatedAt`, `targetDate`, `likelyDate`, `earliestDate`, `latestDate`,
`confidenceAtTarget`, `likelyDateDeltaDays`, `shippedCount`,
`blockingCount`, `resolvedSinceLastCount`, `summaryMarkdown` (the full
rendered text — the historical record), `contextSnapshotId`.

**Snapshot:** everything above. The markdown is stored verbatim and is
never re-rendered, so a later change to `render.ts` cannot retroactively
alter what a past report said.

**Live, recomputed on every page view:**

- The **comparison forecast**. `/reports` fetches `GET /api/forecast` once
  per project purely so it can say whether the stored report still holds
  (`ReportsPageClient.tsx:108`). It is never written back.
- The **snapshot verdict** — `describeSnapshot()` compares the report's
  `likelyDate` against the live one and against `STALE_AFTER_DAYS = 7`,
  producing the amber "Historical snapshot / Live forecast has moved"
  banner. Three states, deliberately: agrees, moved, *and* "could not
  check", because collapsing the third into the first is how a stale
  report starts looking current.
- The **momentum chip** — computed in the browser from the two adjacent
  stored Report rows, not from live data.

**Regenerated dynamically:** nothing inside the report body. A report is a
frozen artifact.

## What a report contains

| Element | In a report? | Detail |
|---|---|---|
| Forecast dates | **Yes** | Likely date, plus the earliest–latest range |
| Confidence | **Yes** | `N% chance of landing on or before the target` — omitted entirely when the Scope has no `targetDate` |
| Movement since last report | **Yes** | "the likely date moved **12 days later**" |
| What shipped | **Yes** | Linear identifier + title for each ticket completed since the last report |
| Decisions | **Partial** | Open *decision Findings* only, split blocking / non-blocking, each with its verbatim quote. **The `Decision` model is not in reports at all** — a tracked, gated Decision on `/decisions` does not appear |
| Resolved since last | **Yes** | Title + resolution text |
| Best available lever | **Yes** | "Add 1 developer to Platform → **9 days sooner**", from `forecast.scenarios` |
| Risks | **No** | `type: "risk"` findings are computed by the audit and then dropped on the floor by `generate.ts` |
| Contradictions | **No** | Same — `type: "contradiction"` never reaches a report |
| Missing work | **No, not by name** | It is inside the forecast dates as inferred work, but no section names it |
| Dependencies | **No** | `Scope.dependsOnScopeIds` affects the simulated date; no report says "iTrack is waiting on Platform" |
| Evidence | **Partial** | Decision findings carry their quote. Nothing carries a source, a link, or an evidence id |
| Context snapshots | **Stored, never shown** | `Report.contextSnapshotId` is written and then read by no rendering path |
| Findings (as findings) | **No** | Only the decision subset |

## "What does a user actually receive when they generate a Report?"

A frozen markdown document, roughly 15–40 lines, titled
`{Project} — Release Update`, containing: the likely release date, the
confidence against target if a target exists, the range, how far the date
has moved since last time, a list of tickets that shipped since last time,
a list of open blocking decisions each with a verbatim quote, anything
resolved since last time, other open decisions, and the single fastest
lever available.

It is signed `Generated {ISO timestamp} · KIT Gap Audit` — the product's
old name, still on the bottom of every report a leadership team receives
(`lib/reports/render.ts:118`).

They can read it on `/reports`, browse every previous one in a history
sidebar, and copy it to the clipboard — and the copied text carries a
`> **HISTORICAL SNAPSHOT.** Generated …` line prepended above the body, so
the provenance travels with the text into the email where Signal can no
longer annotate it.

What they do **not** receive: any risk, any contradiction, any dependency
statement, any evidence trail, any named missing work, anything from the
Decision instrument, and any indication of which context the numbers were
computed from. It is an accurate, narrow, honest release-date bulletin. It
is not a briefing.

---

# Part 3 — Hermes ↔ Signal contract

## Hermes side

**What package format exists:** `ProjectContextPackage` v1, defined in
`lib/context/package.ts` and documented normatively in
`docs/CONTEXT-MODEL.md`. It is a plain serialisable value — no class, no
behaviour:

```ts
{
  version: "1.0",
  packageId: string,          // the PRODUCER's identity for this instance
  producer: "hermes" | "manual" | "gap_app",
  generatedAt: string,        // when the producer assembled it
  scopeId: string,            // single-scope only in v1

  sources: [{                 // the manifest: what was consulted
    sourceType, sourceRef, registrationId, role, status,
    observedAt,               // when the source was ACTUALLY read at origin
    succeeded, detail
  }],

  evidence: [{                // the citable atoms
    id, sourceRef, kind, excerpt, externalRef?, data?
  }],

  derivedClaims?: [{          // Hermes's UNDERSTANDING — never evidence
    id, kind, statement, evidenceRefs[]
  }],

  completeness: { expectedSources, missingSources, excludedSources },
  warnings: string[]
}
```

Three properties of this format matter more than the field list:

1. **`observedAt` is not `generatedAt`.** A cache hit is never a new
   observation. If Hermes read the wiki at 2:10 and assembled the package
   at 2:14 from that cached read, `observedAt` stays 2:10. Signal stores
   the producer's value verbatim and never bumps it.
2. **Evidence and understanding are separate arrays.** An `EvidenceItem`
   is a quotable fragment with an id. A `DerivedClaim` is Hermes's
   conclusion, and it is **inert by contract** — never a Finding, never a
   forecast input, never Reality.
3. **`packageId` identifies immutable content.** Resending the same
   package is idempotent; sending *different* content under the same
   `packageId` is a 409 conflict, not a silent overwrite.

**How it arrives:** `POST /api/refresh` with a `contextPackage` field.
That is the only ingestion door. Authentication is
`Authorization: Bearer $APP_PASSWORD` (`middleware.ts:29`) — the same
shared secret that gates the whole app; there is no per-producer
credential, no signing, no scoped token.

**Signal never calls Hermes.** There is no `HERMES_*` environment
variable, no outbound client, no pull endpoint. The only env vars in the
codebase are `ANTHROPIC_API_KEY`, `APP_PASSWORD`, `AUDIT_MODEL`,
`FIGMA_API_KEY`, `KIT_DEV_FIXTURES`, `LINEAR_API_KEY`, `NODE_ENV`,
`NOTION_API_KEY`. The relationship is push-only, and the initiative is
entirely Hermes's.

## Signal side

**How the package is stored:** `persistContextSnapshot()`
(`lib/context/snapshot.ts:108`) is the only function in the codebase that
creates a `ContextSnapshot` row. It:

1. validates the package structurally (`lib/context/validate.ts`);
2. checks the package's `scopeId` matches the request's (defence in
   depth);
3. hashes the content (`lib/context/hash.ts`);
4. looks up `(producer, packageId)` — if a row exists with the same hash
   it returns it with `reused: true`; if the hash differs it throws
   `PackageIdentityConflictError` → **409**;
5. for genuinely new content only, validates every `registrationId` in
   the manifest against current `SourceRegistration` rows — a wrong type,
   ref, scope, or a superseded/retired registration **rejects the whole
   package** with 400;
6. computes Signal's **own** completeness verdict
   (`evaluateSourcePolicyCompleteness`), which is stored *alongside* the
   producer's claim rather than replacing it;
7. writes one immutable row. **Nothing in the codebase ever updates a
   `ContextSnapshot`.**

**How it is consumed** — `POST /api/refresh` (`app/api/refresh/route.ts`),
in a deliberate order:

```
contextDocs ingested FIRST        (so a Linear outage can't lose them)
  ↓
contextPackage accepted           → ONE ContextSnapshot, id threaded onward
  ↓
harvestCandidates(snapshot)       → DecisionCandidate rows (suggestions)
harvestTimelineCandidates(...)    → TimelineEventCandidate rows (suggestions)
  ↓
runAudit(scope, transcript?, {packageContext})
  → Findings citing evidence ids; uncited package-only findings REJECTED
  ↓
runEstimationForScope(scope)      → AI estimates
  ↓
computeForecast(scope)            → the dates
  ↓
generateReport(scope, snapshotId) → only if generateReport: true
```

**What Signal does with each part of the package:**

| Package element | What happens to it |
|---|---|
| `evidence[]` | Rendered into the audit prompt as its own block, each with its id; cited ids land on `Finding.evidenceRefs` |
| `derivedClaims[]` of kind `decision`/`open_question`/`question`/`choice` | Become **DecisionCandidate** rows — pending suggestions in a tray. Never a Decision, never a gate, never a date move (`lib/decisions/candidates.ts`) |
| `derivedClaims[]` that read like landmarks | Become **TimelineEventCandidate** rows, mostly dateless, in Event Intake |
| `derivedClaims[]` of any other kind | Counted as `skippedKind` and otherwise ignored |
| `sources[]` manifest | Validated against `SourceRegistration`, then stored verbatim inside the frozen package |
| `completeness` | Stored verbatim as the producer's claim; Signal's own verdict is computed separately and stored as `completenessSummary` |
| `warnings[]` | Stored; surfaced nowhere in the UI |

**What Signal gives back** — `GET /api/context/envelope?scopeId=`
(`lib/context/envelope.ts`), the `ProjectIntelligenceEnvelope` v1: forecast
dates and confidence, momentum vs the last report, capacity with its
source and basis, every open Finding with its evidence refs, the latest
snapshot's id/producer/age and Signal's own health verdict for it, and a
separate `directSources.linear` block so "our context is stale" can never
be confused with "we can't read Linear". It is composed on every read and
**persists nothing**.

## The gap between the contract and the reality

The contract is real, enforced and well-designed. What is missing is
everything on the *producing* side.

`docs/CONTEXT-MODEL.md` states it plainly: *"No real Hermes integration,
no KE wiki access, no Hermes pull path… only the manual/synthetic
construction path has ever been exercised."* Reading the code confirms it:
there is no Notion assembler, no Figma assembler, no wiki reader, no
transcript-to-package converter — anywhere in the repository or in Signal's
dependencies.

`[dev DB]` The four `ContextSnapshot` rows present locally are named
`timeline-demo-1`, `timeline-demo-2`, `timeline-demo-3` and
`refinement-call-2026-08-14` — three demo fixtures and one hand-built
sample. `SourceRegistration` is **empty**, which means the source-policy
layer currently has no policy to enforce: every package source would be
treated as ad-hoc, and `completenessSummary` would have nothing to measure
"expected but missing" against. This is a dev-database observation and
production may differ, but the *code* path is the same either way: an empty
registration table makes the completeness verdict structurally unable to
report a missing source.

And on the Signal side: **no UI anywhere calls `/api/refresh` or
`/api/context/envelope`.** Verified by search — the only references are in
comments. Both are external-caller-only endpoints. Nic cannot refresh
Signal's intelligence from inside Signal.

## "If Nic updated the wiki today and asked Hermes for a fresh project understanding, what exactly reaches Signal?"

**Today, nothing — because nothing is connected.**

Signal has no wiki access and never asks Hermes for anything. Hermes has
no code in this repository that assembles a `ProjectContextPackage`. The
wiki edit would sit in the wiki.

**If someone wrote the Hermes-side assembler tomorrow**, using the
contract exactly as specified and posting it to `POST /api/refresh` with
the bearer token, then this is precisely what would reach Signal:

1. **One immutable `ContextSnapshot`** holding the package verbatim —
   every excerpt, every source manifest entry with its true `observedAt`,
   every derived claim, plus Signal's independent completeness verdict.
2. **`DecisionCandidate` rows** for any claim phrased as a decision or
   open question — as *pending suggestions*, in a tray, requiring a human
   to accept before they become tracked Decisions.
3. **`TimelineEventCandidate` rows** for anything that reads like a
   landmark, mostly without dates.
4. **`Finding` rows** from one audit pass over the package's evidence
   *together with* every live Linear ticket — each finding either citing
   real evidence ids or refusing to be saved.
5. **Recomputed AI estimates and a recomputed forecast**, returned inline
   in the response with `contextComplete` / `contextIssues` flags.
6. **A generated `Report`**, only if the caller explicitly asked.

And this is what would **not** happen: no wiki prose is stored as a
document, no requirement becomes a tracked object, no Decision is created
without a human, no Linear ticket is written, no date moves because Hermes
said so. Every path from "Hermes believes X" to "Signal treats X as true"
runs through either an audit that must cite evidence, or a human accepting
a candidate. That boundary is the most valuable thing in the current
architecture and should not be relaxed to make the daily loop feel
smoother.

---

# Part 4 — Desired daily workflow, and every gap

The intended loop, with each step marked against what exists.

## Step 1 — Hermes updates itself from transcripts, wiki, conversations, documents, decisions, requirements

**Does not exist in Signal's world, and correctly so** — this is Hermes's
own job. But Signal has no way to know whether it happened. There is no
`lastRefreshAt` on a Scope, no "Hermes last spoke to us at 07:14"
anywhere in the model.

**Gap 4.1** — Signal cannot distinguish "Hermes has nothing new" from
"Hermes is broken and hasn't called in nine days". The envelope exposes
`context.latestSnapshotCreatedAt`, which is the raw material for this, but
no Signal surface reads it.

## Step 2 — Hermes sends the current package to Signal

**Partial.** The receiving contract exists and is strong (Part 3). The
sending side does not exist. No assembler, no scheduler, no connector.

**Gap 4.2** — no `ProjectContextPackage` producer exists for any real
source (wiki, Notion, transcripts, Google Docs).
**Gap 4.3** — no scheduled ingestion of any kind. Nothing in the repo runs
on a timer; Railway runs a web process only.
**Gap 4.4** — `SourceRegistration` is unpopulated `[dev DB]` and has no
UI, so even a working producer would get a completeness verdict with no
baseline to measure against.

## Step 3 — Nic opens Signal

**Exists.** `/` redirects to `/control-room`, which composes readings from
every instrument without owning any of them.

**Gap 4.5** — the arrival is passive. The Control Room shows the current
state; it cannot show *what is new since you last looked*, because Signal
stores nothing about when you last looked. `lib/control-room/read.ts` is
explicit about this: `dataReceivedAt` is *"when this browser last received
`data`… there is nothing on the server that knows when a particular client
last asked."*

## Step 4 — Signal answers the five questions

### "Are we still on track?"

**Exists.** This is Signal's strongest capability. `computeForecast` gives
a likely date, a range, and confidence against target; `/forecast` and
the Control Room both show it; `/portfolio` lets you play with it. Every
surface calls the same function, so they cannot disagree.

### "What changed?"

**Partial, and it is the weakest link in the loop.**

What exists: the Control Room's "What Changed" panel reads the Timeline's
own typed event stream — completed Linear work, decisions raised / gated /
decided, findings raised and resolved, context observations, landmarks,
and reports *where the forecast actually moved* — deduplicated by subject
so one question asked four times reads as one row
(`lib/control-room/read.ts:767`). The Reports page shows momentum between
adjacent reports. `computeChangesSince` diffs shipped tickets and resolved
decisions against a timestamp.

What does not:

**Gap 4.6 — there is no forecast history.** Only `Report` rows record a
past date, so "what changed" is measured *since the last report you chose
to generate*, not since yesterday. Generate no report for three weeks and
Signal cannot tell you how the date moved over those three weeks. This is
the single highest-leverage missing model in the product.

**Gap 4.7 — there is no per-user "since you last looked" state.** No
`lastSeenAt`, no read/unread, no digest.

**Gap 4.8 — no Linear historical snapshotting.** Already documented as a
known limitation in `docs/CONTEXT-MODEL.md`: when an audit concluded "this
has no matching ticket", the *set of tickets that proved the absence* is
not stored, so the negative half of the conclusion cannot be
reconstructed later.

**Gap 4.9 — change is not attributed to a cause.** `attributionSentence()`
picks one sentence (a resolved blocking decision > fresh estimates >
shipped count), but nothing connects "the date moved 9 days later" to
"because these three tickets got real estimates and one grew".

### "What decisions are blocking?"

**Exists, but split across two disconnected models.** `/decisions` shows
tracked `Decision` rows, and only a `DecisionGate` reaches the forecast —
a deliberate, well-documented boundary (`Decision ≠ Gate`). Meanwhile the
audit produces `type: "decision"` *Findings*, which appear in reports and
on the audit page.

**Gap 4.10 — a decision Finding cannot become a Decision.** No route, no
button (Part 1). The two populations never converge, so "what decisions
are blocking?" has two different answers depending on which page you are
standing on.

### "What risks emerged?"

**Barely exists.** The audit produces `type: "risk"` and
`type: "contradiction"` findings, and they are visible on
`/audit/[sourceId]` and (as inferred work, if non-decision) inside the
forecast dates.

**Gap 4.11 — no risk surface.** No page lists risks across sources. Reports
omit them entirely. The Control Room has no risk panel — and per
`docs/CONTROL-ROOM-TRUTH-AUDIT.md` that absence was deliberate, because no
risk *score* exists in the model and inventing one would be dishonest. The
honest version — a list of open risk findings with their quotes — is
simply not built.

**Gap 4.12 — nothing ages.** A risk raised in May is displayed exactly
like one raised this morning. There is no staleness concept for a finding,
no "is this still true?", no re-verification pass.

### "What should I do next?"

**Does not exist.** No recommendation, no ranking, no queue. The nearest
thing is Forecast's "fastest path to a sooner date", which is a *lever*
(add capacity, cut scope), not an action.

**Gap 4.13** — nothing in the product answers "what should I do next".
Note that the ingredients are all present and already computed: open
blocking gates, findings with no ticket, decisions past `neededBy`,
placeholder-estimate share, candidates sitting unreviewed in a tray. What
is missing is a surface that assembles them into one ordered list.

## Step 5 — Nic generates a leadership brief, a report, findings, tickets, actions

| Output | State |
|---|---|
| Project report | **Exists** — `/reports`, one click, copyable, provenance-stamped |
| Leadership brief (current truth, not history) | **Does not exist** — every report is a frozen historical artifact by design |
| Audit findings | **Exists** — but only from text you paste by hand |
| Tickets | **Exists** — per finding, draft → confirm → Linear |
| Questions / actions | **Does not exist** |

**Gap 4.14** — there is no "brief of right now". `/reports` deliberately
freezes; the live comparison forecast it fetches is used only to warn that
the frozen one has drifted. To send leadership current truth today, you
must generate a new Report, which permanently adds a row to history — so
the act of *reading* the current state pollutes the historical series.

**Gap 4.15** — audit input is manual paste only. Once Hermes is connected,
`POST /api/refresh` audits package evidence automatically — but there is
no UI path to that, and no UI path to auditing a `ContextDoc` already
stored.

**Gap 4.16** — nothing can be sent anywhere. No email, no Slack, no
export beyond copy-to-clipboard.

## Gap summary

| # | Gap | Blocks |
|---|---|---|
| 4.1 | No record of when intelligence last arrived | "Is this current?" |
| 4.2 | No package producer for any real source | The entire loop |
| 4.3 | No scheduled ingestion | Morning refresh |
| 4.4 | `SourceRegistration` unpopulated, no UI | Completeness verdicts |
| 4.5 | Passive arrival, no "since last visit" | "What changed?" |
| 4.6 | **No forecast history outside Reports** | "What changed?" |
| 4.7 | No per-user seen-state | "What changed?" |
| 4.8 | No Linear historical snapshot | Provenance of absence |
| 4.9 | Change is not attributed to cause | "Why did it move?" |
| 4.10 | Finding → Decision path missing | "What's blocking?" |
| 4.11 | No risk surface anywhere | "What risks emerged?" |
| 4.12 | Findings never age or get re-verified | Trust over time |
| 4.13 | No "what should I do next" | The whole morning |
| 4.14 | No live brief, only frozen reports | Sharing current truth |
| 4.15 | Audit input is paste-only | Automation |
| 4.16 | No delivery channel | Sharing |

---

# Part 5 — Missing intelligence capabilities

## A. Intelligence Audit

> *"Read everything important and tell me what I am missing."*

**Current state: Partial.**

The *engine* for this is genuinely built and is better than it looks. One
audit pass already takes (A) every live Linear ticket, (B) everything
previously handled, and (C) new context, and returns typed findings with
mandatory verbatim citations and a hard rejection of uncitable claims.
The package path already carries stable evidence ids end to end.

What is missing is **breadth of input and shape of output**:

| Required input | State |
|---|---|
| Hermes context | Mechanism exists; no producer (Part 3) |
| Transcripts | Exists — paste only |
| Linear | Exists — live, every run |
| Requirements | **Does not exist** — no requirements model at all |
| Decisions | **Does not exist as input** — the audit never sees `Decision` rows |
| Wiki | **Does not exist** |

| Required output | State |
|---|---|
| Missing tickets | **Exists** (`type: missing_work`) |
| Missing decisions | **Partial** — produced as findings, cannot become Decisions |
| Contradictions | **Partial** — produced, then dropped from every summary surface |
| Stale assumptions | **Does not exist** — requires comparing this run to a previous belief; nothing stores a previous belief |
| Risks | **Partial** — produced, surfaced only on the audit detail page |
| Recommended actions | **Does not exist** |

**Needed work: Medium.** Not a rewrite. The concrete pieces: feed open
Decisions and open Findings into prompt section (B) so nothing is
re-raised and contradictions against tracked decisions become findable;
add an audit *summary* alongside the finding list; add a Finding →
Decision promotion route mirroring the existing DecisionCandidate accept
flow; surface risks and contradictions somewhere other than the source
detail page. "Stale assumptions" is the one genuinely Large piece, because
it needs the belief-history model that Part 5D also needs.

**Priority: High** — but *after* B, because the audit's output has nowhere
good to land until there is a surface that shows current truth.

## B. Signal Brief

> *"Give me the current truth."* Not a historical report.

**Current state: Partial — arguably the cheapest large win in the
product.**

Every ingredient exists and is already computed on demand:

| Brief element | Where it already comes from |
|---|---|
| Current forecast | `computeForecast(scope)` |
| Confidence | `forecast.confidenceAtTarget` |
| Blockers | `forecast.breakdown.blockingGates` + open blocking decision findings |
| Changes | `computeChangesSince(scope, forecast, since)` |
| Evidence | `Finding.quote`, `Finding.evidenceRefs`, snapshot excerpts |
| Best lever | `forecast.scenarios` |
| Context health | `buildProjectIntelligenceEnvelope(scope).context.health` |

`GET /api/context/envelope` is already 80% of a Signal Brief in JSON. What
is missing is (1) a renderer that produces prose rather than a payload,
(2) a page, and (3) the discipline that generating one **writes nothing** —
so reading the current truth never adds a row to report history.

**Needed work: Small–Medium.** A `lib/brief/render.ts` beside
`lib/reports/render.ts`, a `/brief` surface, and a copy button. No schema
change. No engine change. The one design decision that matters: a Brief
must be *explicitly not a Report* — no `generatedAt` stored, no momentum
baseline, nothing that makes the historical series depend on how often
someone looked.

**Priority: Highest.** It closes gap 4.14, gives audit findings and risks
somewhere to appear, and is the thing Nic can actually send at 9am.

## C. Historical Report

> *"Capture what we believed at a moment in time."*

**Current state: Exists, narrowly.**

This is the one capability that is genuinely built. Reports are immutable,
store their rendered markdown verbatim, label themselves as historical
snapshots, detect their own staleness against the live forecast, and carry
that provenance into the clipboard.

| Element | State |
|---|---|
| Snapshot semantics | **Exists** — immutable, never re-rendered |
| Forecast | **Exists** — dates, range, confidence, delta |
| Decisions | **Partial** — decision *findings* only, not tracked Decisions |
| Assumptions | **Does not exist** — capacity source, estimate quality, placeholder share are all computed and none reach the report |
| Context | **Stored, never shown** — `contextSnapshotId` is written and read by nothing |

**Needed work: Small.** Render what is already on the row and already in
`forecast.breakdown`: capacity and its source, placeholder-effort share,
which context snapshot fed it, tracked Decisions and gates. Adding risks
and contradictions to the report body is the same size of change.

**Priority: Medium.** The foundation is sound; this is filling in
sections.

## D. Project Intelligence / Meta Analytics

> *"Learn from every project."*

**Current state: Does not exist** — but the raw material is unevenly
present, and the distinction matters for sizing.

| Metric | Data available today? |
|---|---|
| Decision latency | **Yes.** `Decision.createdAt` → `Decision.decidedAt`. `[dev DB]` 73 decisions, 26 gates — computable right now |
| Forecast trajectory | **Partial.** `Report` rows carry `likelyDate` + `likelyDateDeltaDays` over time — but only where a report was generated. Sampled by human habit, not by time (gap 4.6) |
| Where delays accumulated | **Partial.** `DecisionGate.low/likely/high` says how long a gate *might* take; nothing records how long it actually took |
| Dependency waiting time | **No.** `Scope.dependsOnScopeIds` models the constraint per simulation trial; no observation of real waiting is stored |
| Estimate accuracy | **Partial.** `WorkEstimate` stores low/likely/high + `contentHash` + `createdAt`; Linear carries `completedAt`. Nothing joins them, and no `startedAt` is captured, so cycle time is not derivable |
| Time kickoff → production | **No.** `Scope` has no kickoff date and no ship date. Only `createdAt` — when the row was made in this app |
| Recurring failure patterns | **No.** Requires all of the above plus cross-project aggregation |

Structural blockers, in order of severity:

1. **No time series for anything.** Forecast, capacity and confidence are
   all recomputed on demand and never recorded. Every retrospective
   question is unanswerable not because the math is hard but because the
   observations were never written down.
2. **No lifecycle model.** A Scope has no phases, no kickoff, no launch.
3. **Everything is single-project.** `ContextSnapshot` is explicitly
   single-scope; `lib/forecast/portfolio.ts` simulates the portfolio but
   stores nothing.

**Needed work: Large.** The enabling step is small and should happen
early regardless: **a periodic `ForecastObservation` row** — scope,
timestamp, likely/earliest/latest, confidence, capacity, open finding
count, placeholder share. Cheap to write, no engine change, and it is the
prerequisite for gap 4.6, for "stale assumptions" in 5A, and for most of
this section. Every remaining metric needs its own observation.

**Priority: Low now, but write the observation row now.** Analytics you
did not start collecting a year ago is analytics you cannot have. The row
costs almost nothing; the year of missing history cannot be bought back.

## E. Agent / MCP future architecture

**Current state: Partial — further along than it appears.**

Signal already has one honest read-only intelligence contract
(`ProjectIntelligenceEnvelope` v1) and one honest write contract
(`ProjectContextPackage` v1). Both are versioned, both are documented, both
enforce provenance. What does not exist: any MCP server, any per-agent
credential, any tool schema, any way for an agent to *act* rather than
read.

**What Signal should expose, in order:**

**1. The envelope, as the universal read.** It already exists at
`GET /api/context/envelope`. It is the right shape: computed, never
persisted, carrying its own health and its own staleness. Agents should
read this and nothing else. It needs one addition —
`GET /api/context/envelope` is single-scope; a portfolio envelope is the
obvious next version.

**2. The package, as the universal write.** Also already exists. Any
producer — Hermes, Claude, Codex, a spreadsheet script — should assemble a
`ProjectContextPackage` and post it to `/api/refresh`. The idempotency
key, the evidence citation requirement, and the candidates-not-Reality
rule are exactly the guarantees a multi-agent system needs. **Do not build
a second, easier write path.** The whole value is that there is one door
and it demands citations.

**3. An MCP server, as a thin wrapper — not a new architecture.** The
tools it should expose map almost one-to-one onto endpoints that already
exist:

| MCP tool | Backed by | Writes? |
|---|---|---|
| `get_project_intelligence` | `GET /api/context/envelope` | No |
| `list_projects` | `GET /api/scopes` | No |
| `get_forecast` | `GET /api/forecast` | No |
| `get_open_findings` | envelope's `findings.items` | No |
| `get_report` / `list_reports` | `GET /api/reports` | No |
| `submit_context_package` | `POST /api/refresh` | Yes — snapshot, candidates, findings |
| `run_audit` | `POST /api/audit` | Yes — Source, Findings |

Everything that writes Reality stays behind a human: accepting a
candidate, gating a decision, creating a Linear ticket, committing a
scenario. An agent may *propose*; only a person may make it true.

**4. Per-agent credentials.** The current model is one shared
`APP_PASSWORD` for the browser, every API caller and every future agent.
That is acceptable for one producer and unacceptable for four. Per-producer
tokens with scoped rights (read-envelope vs submit-package) are the
smallest honest fix, and `ProjectContextPackage.producer` already exists to
attribute the write.

**Needed work: Medium** for a useful MCP server over existing endpoints;
**Small** for per-agent tokens; **Large** for anything that lets agents
mutate Reality — which should be deferred indefinitely, on purpose.

**Priority: Low until the daily loop works.** A shared intelligence layer
that has nothing fresh to share is not worth building. Revisit once Hermes
actually produces packages.

## Capability summary

| | Capability | Current state | Work | Priority |
|---|---|---|---|---|
| A | Intelligence Audit | Partial — strong engine, narrow inputs, no summary | Medium | High |
| B | Signal Brief | Partial — every ingredient computed, no renderer or page | Small–Medium | **Highest** |
| C | Historical Report | Exists, narrowly — snapshot semantics are solid | Small | Medium |
| D | Project Intelligence | Does not exist — no time series, no lifecycle | Large | Low (but start the observation row now) |
| E | Agent / MCP | Partial — both contracts exist, no server, no per-agent auth | Medium | Low until the loop works |

---

# Part 6 — Recommended next milestone

## The smallest version of Signal that Nic can use every day

Not a rewrite. Four questions, four answers, and a deliberate refusal to
build anything that does not serve one of them.

### 1. "How do I refresh intelligence?"

**One button, on the Control Room, per project: *Refresh intelligence*.**

It calls the pipeline that `POST /api/refresh` already runs — context docs,
package if one is supplied, audit, estimates, forecast — from inside the
product instead of from a curl command. When Hermes exists it posts the
package first and this button consumes it; until then it runs the audit and
estimate passes over what Signal already holds.

It must show three things while it runs and after: **when intelligence last
arrived**, **which sources were consulted**, and **which failed**. All
three are already computed —
`envelope.context.latestSnapshotCreatedAt`, the package manifest, and
`forecast.contextComplete` / `contextIssues` — and none are displayed
anywhere today.

*Complexity: Small.* One route the UI can call, one panel. No new model.

### 2. "How do I know what changed?"

**Record a `ForecastObservation` on every refresh**, and read the last two
to state the change.

```
ForecastObservation
  scopeId, observedAt,
  likelyDate, earliestDate, latestDate, confidenceAtTarget,
  teamCapacity, openFindingCount, placeholderEffortSharePct,
  contextSnapshotId?
```

This is the keystone of the whole milestone. It closes gap 4.6, makes
"what changed" answerable without generating a report, gives the Brief its
delta, and starts the time series that Part 5D cannot exist without. It is
one table, one insert, no engine change, and it is the single highest
value-per-line item in this document.

*Complexity: Small (the model), Medium (the surface that reads it).*

### 3. "How do I know what needs attention?"

**One ordered Attention list, on the Control Room.** No score, no health
percentage, no invented severity — every row is a real object with a real
reason, sorted by consequence:

1. Open `DecisionGate`s — the only decisions that provably delay delivery,
   with the days they add.
2. Decisions past `neededBy`.
3. Open findings with `severity: "high"` and no ticket.
4. Risks and contradictions — currently produced by every audit and shown
   nowhere.
5. Unreviewed DecisionCandidates and TimelineEventCandidates.
6. Placeholder-estimate share above a stated threshold — "38% of remaining
   effort is a guess."

Every one of these is already computed today. This is a composition, not
a new capability, and it is the same discipline `lib/control-room/read.ts`
already holds itself to: carry the real reading, never invent a metric.

*Complexity: Medium.*

### 4. "How do I generate something useful to send?"

**The Signal Brief (capability B).** Current forecast, confidence, what
changed since the last observation, what is blocking with its evidence,
the fastest lever, and a context-health line. Rendered as markdown, copied
to the clipboard, **and it writes nothing** — reading current truth must
never add a row to report history.

Reports stay exactly as they are: the deliberate act of freezing what we
believed on a date.

*Complexity: Small–Medium.*

## Explicitly deferred

| Deferred | Why |
|---|---|
| MCP server | Nothing fresh to serve until the loop runs |
| Cross-project meta-analytics | Needs a year of observations that start with item 2 |
| Requirements ingestion model | Large, and unblocked by nothing in the daily loop |
| Linear historical snapshotting | Real limitation, no daily consequence |
| Automatic staleness-triggered refresh | Make refresh visible and manual first |
| Any agent write path beyond `/api/refresh` | One door, with citations |
| Notion / Figma / wiki package assemblers | Hermes's side of the contract, not Signal's |
| Risk scoring, health percentages, alignment metrics | No such thing exists in the model; inventing one would break the product's only real promise |

## Sequence

```
1. ForecastObservation model + write on every refresh        Small
2. Refresh intelligence button + context health panel        Small
3. Signal Brief (render + page + copy, writes nothing)       Small–Medium
4. Attention list                                            Medium
5. Finding → Decision promotion; risks in Brief and Report   Medium
```

Items 1–3 alone make Signal usable every morning. Item 1 should go first
regardless of everything else, because it is the only item whose value
decays every day it is not built.

---

# SIGNAL TODAY vs SIGNAL VISION

| Capability | Today | Needed |
|---|---|---|
| **Forecast** | Strong and honest. Monte Carlo over Linear tickets + open findings + AI estimates + serial decision gates, with capacity resolved from a real roster. One function (`computeForecast`) behind every surface, so no two pages can disagree. Uncertainty-native: a range and a confidence, never a false-precision date. | Persist it. Every value is recomputed and thrown away, so the forecast has no memory — no trajectory, no "how did we get here", no way to answer "what changed" without a report. Add `ForecastObservation`; add attribution from movement to cause. |
| **Audit** | One text blob at a time, pasted by hand, compared against every live Linear ticket and previously *handled* findings. Typed findings with mandatory verbatim quotes; package-derived findings must cite real evidence ids or be rejected. Findings feed the forecast and can become Linear tickets. | Broaden the input (stored context docs, Hermes evidence, decisions, requirements) and fix the output. Feed open Findings and Decisions into the prompt so gaps are not re-raised. Give an audit a summary, not just a list. Let a decision finding become a Decision. Give risks and contradictions a home — they are produced today and displayed almost nowhere. |
| **Reports** | Immutable, honest, well-built. Frozen markdown, self-labelling as historical, staleness detected against the live forecast, provenance carried into the clipboard. Dates, confidence, movement, shipped work, blocking decisions with quotes, fastest lever. | Two things. Add the assumptions and evidence already computed — capacity source, placeholder share, the context snapshot behind it, tracked Decisions, risks. And separate the two jobs: a **Brief** for current truth (writes nothing) and a **Report** for freezing a moment. Today one artifact is doing both, badly for one of them. |
| **Hermes integration** | A well-designed contract with no producer. `ProjectContextPackage` v1 is validated, hashed, idempotent by `(producer, packageId)`, policy-checked against source registrations, and stored immutably. Derived claims are inert by law. `[dev DB]` the only snapshots that exist are demo fixtures. | The Hermes-side assembler. Plus, on Signal's side: a UI path to refresh (no page calls `/api/refresh` today), a visible "intelligence last arrived at" reading, and a populated `SourceRegistration` table so completeness verdicts have a baseline. |
| **Requirements ingestion** | Does not exist as a model. Requirements can arrive as evidence in a package, as a Notion page id feeding the estimator, or as pasted text — but there is no requirement object, no coverage tracking, no traceability from requirement to ticket. | A real model, if this is a product goal: requirements as first-class objects with source, status and coverage against Linear. Large. Not required for the daily loop. |
| **Transcript intelligence** | One transcript at a time, one prompt, findings out. No cross-transcript memory beyond "do not re-raise what I already handled". No speaker attribution, no commitment tracking, no contradiction against previous transcripts. | Cross-source and cross-time comparison: this transcript against the last one, against tracked decisions, against the wiki. Commitment extraction. This is the "stale assumptions" capability from 5A and it needs a belief history to compare against. |
| **Agent interoperability** | Better than it looks. Two versioned contracts — read (`ProjectIntelligenceEnvelope`) and write (`ProjectContextPackage`) — both provenance-enforcing. No MCP server. One shared password for browser, API and agents alike. | An MCP server as a thin wrapper over the endpoints that already exist, per-producer credentials, and a portfolio-wide envelope. Keep every Reality mutation behind a human: agents propose, people decide. |
| **Project onboarding** | Manual, thin, and scattered across three surfaces. `/scopes` sets name, team key, Linear project names, label filter and cross-scope dependencies; `/forecast` sets target date, capacity, estimation context, Notion pages and Figma refs; `/portfolio` also sets target date and capacity. No template, no guided setup, no source-registration UI, no kickoff date. `[dev DB]` five Scopes exist locally, two of them named "JSA", one pointing at a Linear project name that does not exist in the real workspace — evidence that hand-entry drifts. | One guided setup that validates against Linear at entry time (a project name matching nothing should fail loudly, not silently forecast an empty scope), registers sources with roles, and records a kickoff date so lifecycle analytics is possible later. |

---

## Standing rules this document must not be read as relaxing

Recorded here because the sections above propose new surfaces, and every
one of them must obey these.

1. **Reality changes only by deliberate human act.** Candidates are
   suggestions. Derived claims are inert. An agent, an audit or a package
   may propose; only a person commits.
2. **A `Decision` is not a `DecisionGate`.** Only a gate reaches the
   forecast, and only when a human has answered what waits, why it is
   serial, and on what evidence.
3. **No invented metrics.** No health score, no utilisation percentage, no
   risk rating, no alignment index. If it is not in the model, it does not
   go on the screen. `docs/CONTROL-ROOM-TRUTH-AUDIT.md` records which
   metrics were rejected and why.
4. **A finding without provenance is not saved.** Never fabricate a
   citation to make a claim persistable.
5. **The forecast engine is protected.** `lib/forecast/simulate.ts`,
   `lib/forecast/portfolio.ts`, `lib/capacity/resolve.ts` and `lib/scenario/`
   are not touched by feature work.
6. **Historical artifacts are immutable.** A `ContextSnapshot` and a
   `Report`, once written, are never updated.

## Related documents

- `docs/CONTEXT-MODEL.md` — the normative Hermes contract (Phases 1a–1c)
- `docs/PRODUCT-VISION.md` — what this product is for
- `docs/SCENARIO-MODEL.md` — Reality / Scenario / Forecast
- `docs/CONTROL-ROOM-TRUTH-AUDIT.md` — which readings were rejected as dishonest
- `docs/DESIGN-NORTH-STAR.md` — how instruments and reading surfaces behave
- `docs/ORBIT-TRUTH-AUDIT.md` — the dependency view's truth boundaries

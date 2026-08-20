# Signal — Production Runbook (Release Candidate)

**Status: pre-deployment. Nothing in this document has been executed against
production.** Every claim below was verified against the repository and a
local instance; every claim that could NOT be verified from here is marked
**UNVERIFIED** with the reason. Do not treat an unverified line as fact.

---

## 1. What computes a forecast, and what persists one

Traced through `app/api/refresh/route.ts`, `lib/forecast/compute.ts`,
`lib/reports/generate.ts` and `lib/instrument/useProject.ts`.

| Question | Answer |
|---|---|
| **A. What action computes a forecast?** | `computeForecast` (`lib/forecast/compute.ts`), invoked by `POST /api/refresh`, by the Forecast/Portfolio pages, and by `generateReport`. It **reads only** — it writes nothing. |
| **B. Does changing Reality auto-recompute the preview?** | Yes, **in the browser only**. `useProject` re-runs `runPortfolioSimulation` in a debounced effect keyed on `[data, scenarioScopes, scenario]`, and `subscribeReality` re-fetches the payload after any Reality write. This is an in-memory preview. It persists nothing. |
| **C. What persists a Report?** | Exactly one call: `generateReport()` → `prisma.report.create` (`lib/reports/generate.ts:76`). Nothing else in the codebase creates a `Report` row. |
| **D. `generateReport: false` (or omitted)** | Refresh ingests context docs, optionally accepts a `ProjectContextPackage`, runs the audit, re-runs estimation, recomputes the forecast, and **returns** `forecast.likelyDate` / `forecast.confidenceAtTarget` in the response body. **No `Report` row is written.** The confidence chart's history does not move. |
| **E. `generateReport: true`** | Everything in D, **plus** `generateReport(scope, contextSnapshotId)` → a persisted `Report` row carrying `confidenceAtTarget`, `shippedCount` and the summary markdown. This is what the Control Room's confidence history and "last forecast update" read from. |
| **F. Can an operational Hermes refresh persist a Report today?** | **Yes.** Any caller that sends `generateReport: true` to `POST /api/refresh` creates a permanent `Report` row. There is no additional guard. |
| **G. What controls it?** | On the Signal side it is a **request body field**, not a CLI flag: `RefreshBody.generateReport?: boolean` (`app/api/refresh/route.ts:32`). Whatever CLI flag the bridge exposes lives in the bridge repository, which is **not present in this workspace** — see §4. |

### H. What to use for each job

| Job | Call | Why |
|---|---|---|
| Ad-hoc context refresh | `POST /api/refresh` with `generateReport` omitted | Updates context and recomputes, leaves no permanent record. Safe to repeat. |
| Scheduled morning operational snapshot | `POST /api/refresh` with `generateReport` omitted | A daily job that persisted a Report would inflate the confidence history with machine noise and make the chart's cadence meaningless. |
| Explicit manual forecast snapshot | `POST /api/refresh` with `generateReport: true`, **or** `POST /api/reports` | A deliberate, human-triggered act that is *supposed* to leave a mark on the record. |

**Recommendation:** keep report persistence a deliberate human act. Do not wire
`generateReport: true` into any scheduled job. No new API is proposed here.

---

## 2. Signal ↔ Hermes — verified direction of travel

Verified from `app/api/refresh/route.ts`, `app/api/context/envelope/route.ts`,
`lib/context/package.ts` and `lib/context/snapshot.ts`.

```
Hermes / local bridge
    → ProjectContextPackage v1        (lib/context/package.ts)
    → POST /api/refresh               (validated strictly, persisted as ONE ContextSnapshot)
    → Signal reads Linear, audits the context, computes the forecast
    → ContextSnapshot + intelligence
    → GET /api/context/envelope?scopeId=…
    → Hermes
```

**Signal never calls the local Hermes.** Confirmed by inspection: there is no
outbound Hermes client anywhere in the codebase. Signal is a pull target and a
read source; the bridge always initiates.

### Idempotency and duplicate retries — the actual contract

`(producer, packageId)` is the identity of a package.

- Re-sending the **byte-identical** package reuses the existing snapshot and
  returns the same `contextSnapshotId`. A retry after a timeout is therefore
  safe.
- Sending a **different** package under the same `(producer, packageId)`
  returns **409** `PackageIdentityConflictError`, which says in its own words:
  *"packageId must identify immutable content — send a new packageId for
  changed content, or resend the exact original package."*

This is how a duplicate retry is proven not to have double-written: the
`contextSnapshotId` in the second response equals the first.

---

## 3. Bridge project coverage — what is actually supported

**Determined by inspection, not inferred.**

- `GET /api/context/envelope` takes **any `scopeId`** and builds the envelope
  from that Scope's own configuration. There is no JSA-specific branch
  anywhere in Signal.
- `POST /api/refresh` is likewise scope-agnostic: it resolves `scopeId` and
  runs the same pipeline for any Scope.

**So on the Signal side, JSA / iTrack / Platform / an arbitrary Scope are all
equally supported today.** The contract is per-Scope by construction.

**What I cannot determine from here:** whether the *bridge* (the producer) is
production-ready for anything beyond JSA. The bridge lives at
`/Users/nicholaspayne/AI-Agents/kit-gap-bridge`, which is not reachable from
this environment (§4). **If only JSA is production-ready, that is a property
of the bridge, not of Signal, and this document cannot confirm it either way.**

### Minimum work to reuse the proven contract for iTrack and Platform

Assuming the bridge is genuinely scope-parameterised, this is configuration
only on the Signal side:

1. The target Scope must exist with a correct `teamKey` and `projectNames`.
2. The bridge must send that Scope's `scopeId`.

**One real data-hygiene item blocks this today.** `HANDOFF.md` records that the
Linear project `KIT Safety (JSA and iTrack)` is **stale** — it was the original
pre-split project — yet both seeded JSA Scopes still point at it. Any Scope
still carrying that name needs repointing at `KIT JSA` / `KIT iTrack` before
its numbers mean anything. Verify before the first live handshake.

---

## 4. Documentation that could NOT be integrated — **UNVERIFIED**

The brief asked for verified Signal↔Hermes documentation to be brought in from
another local worktree. **It is not reachable from this environment, and I did
not invent it.**

| Requested | Status |
|---|---|
| `docs/SIGNAL-HERMES-INTEGRATION.md` | **Does not exist in any commit on any ref of this repository.** Searched with `git log --all --diff-filter=A`. |
| `docs/PRODUCTION-RUNBOOK.md` | Did not exist. This file is newly written from source inspection. |
| `docs/NIC-HANDOFF.md` | **Does not exist in any commit on any ref.** |
| `/Users/nicholaspayne/AI-Agents/kit-gap-bridge/README.md` | **Unreachable.** This session runs in a Linux container; `/Users` does not exist. |
| `/Users/nicholaspayne/AI-Agents/knowledge/ke/wiki/HERMES.md` | **Unreachable**, same reason. |
| Other worktree | `git worktree list` shows **one** worktree. There is no second checkout here. |

What *does* exist and was used as the factual basis above: `HANDOFF.md`,
`ROADMAP.md`, and the integration code itself.

**Action required from a machine that can see those paths:** copy the four
documents into `docs/` and reconcile them against §1–§3 of this file. Until
then the architecture statement in §2 stands on code inspection alone — which
is stronger evidence than a document, but it is not the same as the verified
documentation the brief asked for.

---

## 5. Reality Zero — the safe procedure

**There is no production reset endpoint, and that is correct.** Verified: no
route under `app/api` performs an unscoped destructive reset. The only
`deleteMany` in the API surface is scoped to allocations for one scope.

**`prisma/seed-dev.ts` and `prisma/seed.ts` must never run against the real
production database.** They create demo Scopes, demo people and demo history.
Running either against production would fabricate exactly the kind of data this
release spent its time removing.

### Recommended procedure

Prefer a **new, clean Postgres** over any in-place wipe:

1. **Preserve the current database as a calibration archive.** Do not delete
   it. Rename the Railway service or take a `pg_dump` and store it. Past
   forecasts are the only calibration evidence that exists.
2. **Provision a new Postgres service.**
3. Point `DATABASE_URL` at the new database.
4. **Migrations only:** `npx prisma migrate deploy`. This is what
   `railway.json` already runs on every deploy. **Do not run any seed.**
5. Create the real Scopes by hand at `/scopes` with correct `teamKey` and
   `projectNames` — and confirm none of them carries the stale
   `KIT Safety (JSA and iTrack)` project name.
6. Add the real roster and allocations. Any Scope left without allocations
   will now correctly read `—` rather than inventing a capacity.
7. Only then run the first handshake (§7).

Rollback for this step is to point `DATABASE_URL` back at the archived
database. That is why step 1 comes first.

---

## 6. Deployment preflight — **PARTLY UNVERIFIED**

| Item | Value |
|---|---|
| Release candidate SHA | see the final report |
| Deploy command | `npx prisma migrate deploy && npm run start` — from `railway.json`, so **migrations run automatically on deploy** |
| Builder | NIXPACKS |
| Restart policy | ON_FAILURE, max 3 retries |
| Migrations in repo | 18 |
| **Current production SHA** | **UNVERIFIED** — no deployment credentials or Railway API access from this environment |
| **Railway watched branch** | **UNVERIFIED** — this is Railway dashboard configuration and is not represented in the repository. `railway.json` does not name a branch. |
| **Migrations between prod and RC** | **CANNOT BE COMPUTED** without the production SHA |

**Required environment variables** (from `.env.example` and every
`process.env` reference in `app/` and `lib/`):

| Variable | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres |
| `LINEAR_API_KEY` | **yes** | without it `getClient()` throws |
| `ANTHROPIC_API_KEY` | **yes** | audit + estimation |
| `AUDIT_MODEL` | recommended | pinned model id |
| `APP_PASSWORD` | **yes for production** | the only access control |
| `NOTION_API_KEY` | optional | Notion context ignored without it |
| `FIGMA_API_KEY` | optional | Figma context ignored without it |
| `KIT_DEV_FIXTURES` | **MUST BE UNSET IN PRODUCTION** | `=1` serves offline fixture issues instead of Linear |

`KIT_DEV_FIXTURES` is the single most dangerous variable in the list: set in
production it would serve **fabricated work items** while looking entirely
normal. Confirm it is absent, not merely `0`.

### Fast-forward safety

**Cannot be determined from here** — it requires the production SHA. The
mechanical test once known:

```bash
git merge-base --is-ancestor <production-sha> <rc-sha> && echo "fast-forward safe"
```

If that fails, production carries commits the RC does not, and the deploy is
not a fast-forward.

---

## 7. First production handshake

**Do not run these until §5 and §6 are settled.** Substitute the real
`SCOPE_ID`; the placeholder is deliberate.

```bash
# 0. ENVIRONMENT — never inline secrets into the shell history
set -a; source .env.production; set +a
test -z "$KIT_DEV_FIXTURES" || { echo "REFUSING: KIT_DEV_FIXTURES is set"; exit 1; }

# 1. IDENTIFY THE SCOPE, and confirm its Linear project filter is current
curl -s "$SIGNAL_URL/api/scopes" | jq '.scopes[] | {id, name, teamKey, projectNames}'
# → confirm no Scope still points at "KIT Safety (JSA and iTrack)"

# 2. INSPECT THE PACKAGE the bridge would send, without sending it
#    (the bridge's own dry-run flag lives in the bridge repo — see §4)
jq '{producer, packageId, scopeId, completeness, sources: (.sources|length)}' package.json

# 3. LIVE SEND — context only, NO persisted Report on the first handshake
curl -s -X POST "$SIGNAL_URL/api/refresh" \
  -H 'Content-Type: application/json' \
  -d @package-request.json | tee receipt-1.json | jq '{contextSnapshotId, contextDocsUpdated, forecast, audit: (.audit|type)}'

# 4. RECORD THE RECEIPT
jq -r '.contextSnapshotId' receipt-1.json > snapshot-1.id
```

**Ambiguous timeout — the safe recovery.** If the call times out you do not
know whether it landed. Do **not** send a new `packageId`. Re-send the
**byte-identical** package:

```bash
curl -s -X POST "$SIGNAL_URL/api/refresh" \
  -H 'Content-Type: application/json' \
  -d @package-request.json | tee receipt-2.json | jq -r '.contextSnapshotId'
```

- Same `contextSnapshotId` as `snapshot-1.id` → the first call **did** land and
  nothing was duplicated.
- **409** with `PackageIdentityConflictError` → the payload is not identical to
  what was stored. Fix the payload; do not force a new id.
- A new `contextSnapshotId` → the first call did not land, and this one did.

**Proving no duplicate retry occurred:**

```bash
diff <(cat snapshot-1.id) <(jq -r '.contextSnapshotId' receipt-2.json) \
  && echo "IDEMPOTENT — one snapshot, no duplicate"
```

**Verify Signal used current Linear** — the audit and forecast must be built on
today's issues, not a cached page:

```bash
curl -s "$SIGNAL_URL/api/context/envelope?scopeId=$SCOPE_ID" \
  | jq '{scope: .scope.name, generatedAt, linearIssueCount, snapshotId}'
```

Cross-check `linearIssueCount` against Linear directly for the same team and
project filter. They must agree.

**Verify the forecast result:**

```bash
jq '.forecast' receipt-1.json     # likelyDate + confidenceAtTarget from this run
curl -s "$SIGNAL_URL/api/instrument/project" \
  | jq --arg s "$SCOPE_ID" '.scopes[] | select(.scopeId==$s) | {name, targetDate, capacitySource, items: (.items|length)}'
```

`capacitySource` must be `allocations` for a project you intend to make
decisions about. `inferred` now displays as `est` in the Control Room and a
Scope with nobody on it displays `—`; neither is a basis for a $50M call.

**No Report is persisted by any command above.** To take a deliberate forecast
snapshot afterwards, and only when a human intends it:

```bash
curl -s -X POST "$SIGNAL_URL/api/reports" \
  -H 'Content-Type: application/json' \
  -d "{\"scopeId\":\"$SCOPE_ID\"}" | jq '.report.id'
```

---

## 8. Rollback

**Application:** redeploy the previous production SHA. Railway will re-run
`prisma migrate deploy`, which is forward-only — it will not undo a migration.

**Therefore:** if the RC introduces a migration that production does not have,
rolling the application back does **not** roll the schema back. Check before
deploying:

```bash
git diff --name-only <production-sha>..<rc-sha> -- prisma/migrations
```

This release candidate adds **no new migration** — the newest is
`20260817090000_timeline_candidate_enddate`, which predates it. So an
application-only rollback is clean *provided* production is already at or
beyond that migration. **Confirm against the real production SHA**, which this
environment cannot read.

**Database:** restore the calibration archive from §5 step 1.

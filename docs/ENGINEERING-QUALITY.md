# Engineering quality repair plan

Baseline: `0c0acb2218c2c60e5dbf32761ab66b521ce14f0c`, reviewed November 6, 2026.
Repair branch: `codex/signal-quality-2026-11-06`.

## Availability contract

Production stays on its existing release while the owner updates the wiki and
generates a report. Local development is isolated and holds no production
credentials. No production data edits, migrations, refreshes, secret changes,
pushes to deploying branches, or deployments are part of this initial batch.
This protects the current workflow; it is not a claim that existing production
bugs are fixed or that any system can guarantee uninterrupted availability.

November 8 update: the owner has authorized production updates along the way.
That removes the initial deployment-approval hold, not the staging, active-use,
session-transition or rollback gates below. No deployment has occurred yet.

Before any promotion, coordinate a quiet window with the owner, verify the
running production build and configuration, rehearse in staging, and record an
exact rollback build. Do not promote while a refresh, acceptance operation,
Scenario save, report generation, or report publication is in flight.

## Review findings and repair tranches

| Tranche | Work | Acceptance gate | Current state |
| --- | --- | --- | --- |
| 1. Safety and repeatable checks | Fail closed on missing deployment password; bounded input validation for people, scopes, allocations and login; identical Orbit/Forecast target date and frequency; dependency patch; lint errors; core checks/CI; type extraction and contributor docs. | Behavioral regressions, typecheck, lint, core proofs, dependency checks, build; then isolated browser/DB acceptance. | Implemented locally; validation results recorded below. Not deployed. |
| 2. Authentication and API integrity | Replace password-derived sessions with expiring/revocable server sessions, rate-limit login, test CSRF/origin controls across owner writes, complete API runtime schemas and safe errors, make duplicate scope creation concurrency-safe. | Disposable DB fault/concurrency tests, operator and recipient auth matrix, bridge compatibility, documented session transition and rollback. | Authentication, canonical writes and draft setup/review integrity implemented/tested locally. Broader API schema migration and staging transition/rollback remain pending. |
| 3. Structure and readability | Extract focused Scope/Audit/Timeline views and hooks, isolate Scenario lifecycle from model projection, remove remaining lint warnings, establish a formatting gate per migrated feature. | Each extraction preserves interaction, keyboard/accessibility, Scenario persistence/refusal/recovery, and exact report content. Small independent changes. | Started: neutral contracts, report JSX formatting and setup package persistence separated from compilation. Major component extraction pending. |
| 4. Shareable repository | Inventory private business evidence in current files and history; move operational evidence to private storage through a reviewed, recoverable plan; replace required fixtures with fictional data; scan clean export and history. | Reviewer-approved sanitized export/clone. No names, quotes, credentials, private URLs or actual project IDs in distributable artifacts. | Pending. Do not publish this repository yet. Nothing deleted or history rewritten. |
| 5. Acceptance and documentation | Automate a fresh Audit → review → Scope → estimates/staffing → Scenario → report → recipient site journey; cover failure/retry, Safari/Chromium, reduced motion, narrow screens, and no-write guarantees. Update architecture and operating docs. | Clean isolated end-to-end run plus owner-approved staging rehearsal; distinguish synthetic acceptance from real-project report signoff. | Pending. Unit/core passes do not substitute for this gate. |

## First-batch boundaries

- No Prisma schema or migration changes; accepted data and frozen reports retain
  their existing format. Scope duplicate-name concurrency remains a separate fix.
- Existing operator cookies and bridge credentials remain compatible. A missing
  `APP_PASSWORD` now refuses operator access outside explicit development/test.
  Confirm production configuration before promoting; do not rotate it casually.
- Recipient report authentication remains independent and unchanged.
- HTTP limits: login 8 KiB; initial people/scope/allocation bodies 64 KiB;
  allocations at most 500 entries and scope selection at most 100 project names.
  Validate real usage against these limits in staging before release.
- Pure modules now import shared project types from `lib/project/contracts.ts`.
  The hook keeps compatibility re-exports. Scenario storage and simulation logic
  are deliberately unchanged in this extraction.
- Report view formatting is a readability change only; its content and behavior
  must continue to pass rendering proofs.

## Release sequence for each tranche

1. Reproduce the defect and add a behavioral test using fictional data.
2. Implement in isolation. Run `npm run check`, dependency checks, and the
   relevant database/browser suites. Record omissions explicitly.
3. Review the diff for business-rule drift, privacy, and compatibility. Do not
   weaken refusal rules merely to make a test or dashboard green.
4. Deploy only to staging with staging credentials. Verify exact build, full
   journey, existing saved report rendering, and rollback there.
5. Coordinate production promotion with the owner after wiki/report activity.
   Verify health, sign-in, bridge, Scenario recovery and report reads. Roll back
   on regressions; preserve user drafts and stored data.

Future schema changes must use expand/contract migrations: add compatible
structures first, migrate and verify separately, remove obsolete fields only
after old readers are retired. Never rely on a code rollback to undo a destructive
database migration. Railway currently runs migrations at startup—review that
implication before adding any migration to a release.

## Second batch: operator authentication

See [authentication behavior and rollout](OPERATOR-AUTH.md). This supersedes the
first batch's compatibility statement only for this new local candidate: legacy
cookies now require an explicit absolute migration window of at most seven days.
New logins create random, expiring, individually revocable server sessions.

- Added two authentication tables through an additive migration. No project,
  evidence, Scenario, report or executive-recipient schema changed.
- Added durable atomic login throttling, exact-origin checks on browser writes,
  safe login return paths, and a sign-out action that preserves tab storage.
- Middleware now uses Next 15.5's Node runtime for Prisma session checks. The
  report-owner guard and sharing page recognize the same session. Scoped bridge
  transport and separate report-reader permissions remain intact.
- The deployment origin, session transition, and rollback sign-in implications
  require explicit staging verification before promotion. No credentials,
  deployment settings, production data or active user session were changed.
- Remaining tranche-two work: complete all API runtime validation/safe error
  responses and duplicate-scope concurrency. This batch does not claim to finish
  the entire quality plan or convert the shared account to individual identity.

### Second-batch validation (November 6, 2026)

- Node 22.22.2: typecheck, lint (zero errors, unchanged 37 warnings), 12 unit
  groups, existing core proofs and production build passed.
- Fresh isolated PostgreSQL 18: all 34 migrations applied. Actual session/hash
  persistence, independent revocation, copied-cookie replay rejection, expiry,
  password/epoch rotation, 50 concurrent limiter reservations and exact reset
  boundary passed. Project and saved-report sentinels were unchanged.
- Built-app HTTP suite passed origin enforcement, secure cookie attributes,
  separate report-owner checks, bridge credential scope, existing-session
  continuity during login throttling, legacy transition, missing-table outage
  refusal and recovery without losing a valid cookie.
- Chromium and WebKit passed UI sign-in, protected navigation, canceled sign-out,
  actual sign-out, server-side revocation and preserved tab storage. WebKit's
  loopback-only test adaptation is described in the auth guide; this is not a
  deployed HTTPS acceptance claim.
- The existing private-report HTTP suite passed anonymous/approved-recipient
  boundaries, mock email delivery, wrong-origin/code/replay, read-only snapshot,
  recipient removal/regrant/logout, config refusal and revocation. No real email
  was sent and no production report/site was published.
- The eligible-current-work browser journey still passed in Chromium/WebKit:
  conditional dates, Scope deferral, navigation/reload, cross-screen Scenario
  consistency, downloads, readiness, restoration and stale-preview refusal.
  Business APIs in that journey were fictional/intercepted; only the isolated
  authentication store was used for login.
- Legacy-subset planning and Audit inbox hide/reopen/deep-link/focus/refresh
  regressions also passed in both browsers, including 1024-pixel layouts.
  Existing proof login calls now send the required Origin header. Historical
  scripts that synthesize password-hash cookies are not covered by this batch;
  migrate them to real disposable sessions before relying on those scripts.
- All of this is local. Staging HTTPS/proxy, live bridge delivery, production
  promotion and rollback rehearsal remain separate owner-coordinated gates.

## Validation ledger

### Fifth batch: active-code lint gate and Timeline regressions (November 9, 2026)

Removed dead Portfolio calculations/imports and unused proof scaffolding. No
forecast algorithm, accepted record, source quote, or database schema changed.
See [contributor checks](../CONTRIBUTING.md) for the two explicit lint gates.

- Node 22.22.2: full `npm run check` passed: typecheck, both lint gates,
  **22 unit tests**, selected core proofs and production build. The warning
  count is down from 37 to nine. Active code has a zero-warning gate; the nine
  remaining warnings are visible and capped in two frozen Audit scripts.
- The protected Audit files remain byte-for-byte unchanged. The 33-file
  integrity proof and its negative mutation/addition self-test passed. No
  fingerprint, reference artifact or exception list was modified to clear lint.
- Three new isolated Timeline tests exercise the production memory projection:
  no report before the first saved snapshot, exact snapshot identity at the
  millisecond boundary, and no mutation of frozen history. Historical proof
  assertions now also check the first report boundary, the first playback
  geometry sample and the remembered-state label.
- Current-work browser regression passed in **Chromium and WebKit** on the
  local production build: Scenario date changes, exact reload, Portfolio,
  Scope, Timeline, Decisions, qualified HTML/JSON exports, restoration and
  stale-preview refusal. Audit inbox regression passed in both engines:
  hide/reopen, focus, refresh, reload, project switching, evidence deep links,
  modal precedence and denied browser storage. Both cover 1440px and 1024px.
  Business APIs were intercepted with fictional data; the graph was stubbed
  in the inbox test. This is not full graph or live-business acceptance.
- Browser receipts/screenshots are in the private sibling directory
  `../outputs/lint-quality-2026-11-09/`. Four representative screenshots were
  inspected (Portfolio, narrow Forecast, hidden inbox and staging Reports).
  The disposable DB retained zero Scope, setup and report rows; four test
  login sessions were created. Local server and DB are stopped.
- Coverage collection passed: 7.01% line/statement coverage (7,130 of 101,686
  lines) over the application denominator. This is **unit-suite coverage**,
  not combined core-proof, browser or end-to-end coverage. Dependency
  compatibility and both live advisory scans passed with zero known advisories.
- Historical DB-backed Timeline proof was attempted without `DATABASE_URL`
  and stopped at initialization, before any write. It was not rerun against
  real data. Historical graph/model suites were not executed; modified `.mjs`
  scripts passed syntax checks but their old browser journeys were not rerun.
- Staging browser access is now verified after the user configured access and
  supplied the existing password. Authenticated build **b301803** opened
  Control Room, Audit, Forecast and Reports; the inbox closed successfully.
  Semantic keyboard navigation worked. Pointer actions with the temporary
  viewport override did not reliably hit the intended control; do not treat
  that as verified pointer acceptance. The override was reset afterward.
- Staging still contains historical QA projects, duplicate ticket ownership,
  placeholder estimates and an unconnected seed project's knowledge source.
  Those are observed acceptance limitations, not evidence about production.
  No refresh, finding acceptance, Scenario save, report generation/publication
  or business-record cleanup was performed there. Merely opening a page may
  exercise the app's normal provider read/cache behavior.
- **No push or deployment.** Staging is the older build, not this local quality
  candidate. Its HTTPS session migration/rollback test and a full persistent
  report-to-recipient journey still gate promotion. Production is unchanged.

### Fourth batch: draft setup and review integrity (November 8, 2026)

See [setup write integrity](BOOTSTRAP-WRITE-INTEGRITY.md). No schema changes or
business-data backfill. The compiler/persistence split preserves its compatibility
export while giving identity validation, transactions and storage clear owners.

- Node 22.22.2: `npm run check` passed with 19 unit tests, typecheck, zero lint
  errors (37 pre-existing warnings), selected core proofs and production build.
  The 501-candidate / 1,002-link synthetic persistence proof is now a core gate.
- Real PostgreSQL/HTTP checks passed setup create/rename races, no-op saves,
  late and queued scan refusal, rename-back, publication-versus-identity-edit,
  review isolation and unchanged immutable source quotes. The earlier canonical
  Scope/activation/dependency suite and frozen-report sentinel checks also passed.
- Chromium and WebKit passed failed review validation with draft retained,
  corrected retry, reload and persisted disposition, alongside Scope form tests.
  Four screenshots and the result receipt are in
  `../outputs/bootstrap-integrity-2026-11-08/`; all four images inspected.
  An independent repeat run passed in `../outputs/bootstrap-integrity-repeat-2026-11-08/`.
- The phase-one DB regression passed disappearing/reappearing accepted proposals
  and unchanged counts for all eleven protected Reality/report owner families.
  Dependency compatibility and both advisory scans passed with zero known
  production or development advisories at this check.
- Stress testing found PostgreSQL row-lock conflicts exposed as Prisma P2010,
  not P2034. Retry now recognizes only confirmed-abort SQLSTATEs. Tests prove
  connection failures and uncertain transaction outcomes are not retried.
- Read-only Railway inspection: production remains `0c0acb2`, deployment
  `bdb2dfd5-c497-472e-96a5-7e7d7c4ffec7`; staging remains deployment
  `849da325-b2db-4979-92dc-2b44dd92c375`. Neither is this quality candidate.
- The in-app staging browser attempt was blocked by `net::ERR_BLOCKED_BY_CLIENT`.
  No alternate access was used to bypass that refusal. Staging HTTPS/session
  transition, rollback and full private report journey remain unverified.
- No push, deployment, production refresh, secret change or user-data edit.
  This is another bounded local repair, not completion of the whole quality plan.

### Third batch: canonical project writes (November 8, 2026)

See [project write integrity](PROJECT-WRITE-INTEGRITY.md). This completes the
previously outstanding canonical Scope duplicate-name race across create,
rename and activation, without a schema change, destructive cleanup or merge.
Dependency validation now shares its save transaction; creation saves selected
dependencies atomically. Settings/activation payloads are bounded and validated;
unexpected errors in these write handlers no longer expose raw server details.

- Built-app PostgreSQL/HTTP proof passed duplicate-create races (50 requests),
  create/rename, rename/rename, activation alias collisions, activation retry
  convergence, full rollback, dependency cycle races, revision guards, and
  preservation of existing project/report sentinels and historical duplicates.
- Chromium and WebKit passed real create/rename forms, conflict feedback with
  entered draft retained, persisted reload and no browser page errors.
- Node 22.22.2: full `npm run check` passed (typecheck, zero lint errors with the
  unchanged 37-warning baseline, 16 unit tests, core proofs, production build).
  Both additional activation contract proofs passed, as did dependency
  compatibility and production/development advisory checks (zero advisories).
- The expanded built-app proof passed valid settings round trips and clearing,
  names/aliases across all canonical writers, and all cases above. Its receipt
  and two browser screenshots are in the sibling private output directory
  `../outputs/project-write-integrity-2026-11-08/`. Screenshots were inspected.
- No production or staging access, deployments or business-data edits. These
  tests use only an empty local DB and fictional provider responses.
- Remaining API work includes draft-bootstrap editing, other resource families,
  GET/error paths and old maintenance scripts. The canonical identity guard is
  not a database unique constraint; direct SQL/old writers can bypass it. Do not
  advertise the whole API tranche or the whole product as complete.

### First-batch ledger

- `npm run check`: passed on Node 24.16.0 and the deployment-pinned Node 22.22.2.
  Includes 8 behavioral test groups and 11 scripts in the selected core proofs,
  with 250 randomized phased-capacity properties. Production build passed.
- Lint: zero errors; 37 pre-existing warnings remain. The command fails above
  this baseline, but the target is zero. They are not silently suppressed.
- `npm run proof:dependencies`: compatibility probes and both live advisory scans
  passed; zero known production or development advisories at this check.
- Unit coverage collection: passed on both runtimes. Initial line coverage is
  6.0% on Node 22 (6.4% on Node 24) over the
  app/components/lib/middleware denominator. This measures only the new unit
  command; core proofs, browser tests and database tests are not merged into it.
  Do not call this full application or end-to-end coverage.
- Local production-build browser rehearsal: Chromium and WebKit passed the
  eligible-current-work journey with intercepted fictional APIs. It covers
  screen navigation, keyboard deferral, exact draft reload, conditional dates,
  staffing/scope/timeline/decision displays, HTML/JSON downloads, report-button
  eligibility, restoration and stale-preview refusal. No real report was saved
  and no private executive site was published.
- Legacy subset-policy browser rehearsal also passed in Chromium and WebKit;
  older qualified results keep their previous interpretation. Audience-composer,
  exact-evidence rendering, and plain-text report proofs passed as well.
- Report view: 192 before/after static-HTML comparisons passed across four
  fictional owner states and every audience/purpose recipe. Formatting preserves
  identical output; no evidence strings or forecast values were rewritten.
- Browser proof maintenance: replaced the obsolete `SCENARIO PREVIEW REFUSED`
  text locator with the existing `scenario-preview-refused` test selector. The
  source-change and withheld-export assertions remain intact.
- Still required before promotion: database acceptance for valid CRUD and
  concurrency; staging configuration/compatibility checks; broader browser
  acceptance including Audit refresh, persistent report creation and recipient
  access; owner-coordinated deployment and rollback rehearsal.
- Original release checkout remains clean. No production credentials were copied,
  no production data/config was altered, and no staging or production deployment
  occurred. CI is checked in locally; its hosted run is not yet verified.

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

Before any promotion, coordinate a quiet window with the owner, verify the
running production build and configuration, rehearse in staging, and record an
exact rollback build. Do not promote while a refresh, acceptance operation,
Scenario save, report generation, or report publication is in flight.

## Review findings and repair tranches

| Tranche | Work | Acceptance gate | Current state |
| --- | --- | --- | --- |
| 1. Safety and repeatable checks | Fail closed on missing deployment password; bounded input validation for people, scopes, allocations and login; identical Orbit/Forecast target date and frequency; dependency patch; lint errors; core checks/CI; type extraction and contributor docs. | Behavioral regressions, typecheck, lint, core proofs, dependency checks, build; then isolated browser/DB acceptance. | Implemented locally; validation results recorded below. Not deployed. |
| 2. Authentication and API integrity | Replace password-derived sessions with expiring/revocable server sessions, rate-limit login, test CSRF/origin controls across owner writes, complete API runtime schemas and safe errors, make duplicate scope creation concurrency-safe. | Disposable DB fault/concurrency tests, operator and recipient auth matrix, bridge compatibility, documented session transition and rollback. | Authentication and canonical project-write integrity implemented/tested locally. Broader API schema migration and staging transition/rollback remain pending. |
| 3. Structure and readability | Extract focused Scope/Audit/Timeline views and hooks, isolate Scenario lifecycle from model projection, remove remaining lint warnings, establish a formatting gate per migrated feature. | Each extraction preserves interaction, keyboard/accessibility, Scenario persistence/refusal/recovery, and exact report content. Small independent changes. | Started: neutral contracts and report JSX formatting. Major component extraction pending. |
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

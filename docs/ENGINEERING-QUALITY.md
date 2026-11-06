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
| 2. Authentication and API integrity | Replace password-derived sessions with expiring/revocable server sessions, rate-limit login, test CSRF/origin controls across owner writes, complete API runtime schemas and safe errors, make duplicate scope creation concurrency-safe. | Disposable DB fault/concurrency tests, operator and recipient auth matrix, bridge compatibility, documented session transition and rollback. | Pending. Missing-password fix is not a complete auth redesign. |
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

## Validation ledger

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

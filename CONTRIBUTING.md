# Working on Signal safely

Signal is an actively used planning tool. A refactor must preserve accepted
Reality, source evidence, saved Scenarios, and frozen reports—not just compile.

## Local setup

1. Use Node 22 (`.nvmrc`) and `npm ci`.
2. Work in an isolated checkout on a non-deploying branch.
3. Run `npm run check` without copying a production `.env` file. The default
   tests use fictional inputs and need no database, Linear, or model credentials.
4. For interactive development, configure a **disposable local** database using
   `.env.example`. Verify host and database name before applying migrations or
   seeding. Never point a test at the production database.
5. Run `npm run dev`. Development/test can run without `APP_PASSWORD`; deployment
   runtimes must provide it or operator routes return 503. Recipient report
   routes enforce their own authentication.

## Checks and what they prove

| Command | Scope |
| --- | --- |
| `npm run typecheck` | TypeScript contracts across application and proof scripts. |
| `npm run lint` | Repository lint; currently ratchets the existing 37 warnings, with zero errors allowed. |
| `npm test` | Behavioral unit/handler regressions, no real database or network calls. |
| `npm run test:core` | Selected deterministic work, forecast, Scenario, staffing and report proofs. |
| `npm run test:coverage` | Unit-suite coverage over app/components/lib/middleware, including unexecuted files. Not end-to-end coverage. |
| `npm run proof:dependencies` | Compatibility probes and live advisory checks; unavailable advisory service is not a pass. |
| `npm run build` | Production compilation, not a live acceptance claim. |
| `npm run check` | Typecheck, lint, unit tests, core proofs and production build. |
| `npm run proof:operator-auth-db` | Guarded disposable PostgreSQL session/concurrency proof; requires the [auth test setup](docs/OPERATOR-AUTH.md). |
| `npm run proof:operator-auth-http` | Built-app HTTP + Chromium/WebKit auth proof; owns local port 4397 and uses only the guarded disposable DB. |
| `npm run proof:project-writes` | Actual project CRUD/activation concurrency, rollback and Chromium/WebKit forms; requires an empty guarded DB and owns local port 4398. See [setup and limits](docs/PROJECT-WRITE-INTEGRITY.md). |

Database and browser scripts have separate setup and safety requirements. Read a
script's guard before running it; do not run every `scripts/*` file indiscriminately.
Some historical tools are maintenance commands that write data. Do not disable
their guards to obtain a green result. CI contains no deployment step.

Browser/HTTP proofs that log in need a real disposable database after the
session migration. Non-browser login requests must send `Origin`. Do not run
`next build` against a checkout while its `next start` process is serving browser
tests: both use `.next`. Stop the test server before rebuilding.

## Organization and readable code

See [the architecture map](docs/ARCHITECTURE.md) for data owners and entry points.

- Put framework-neutral data types in `lib/project/contracts.ts`. Existing type
  exports from `useProject` are compatibility aliases, not the preferred import.
- Keep domain rules in `lib/<feature>/`; routes validate and delegate; components
  render state and issue explicit user actions. Do not duplicate forecast math.
- Accept `unknown` at trust boundaries, then validate. Type assertions do not
  validate HTTP, database JSON, or model output.
- Use descriptive names, focused functions, and explicit units (effort days,
  calendar days, story points, and FTE are different quantities).
- Comments explain **why**, invariants, units, compatibility constraints and
  recovery behavior. Avoid narrating syntax, dated completion claims, or promises
  that a test cannot establish. Link a regression test for subtle fixes.
- Prettier configuration is checked in. Format touched modules with
  `npx prettier --write <files>`; do not reformat the entire repository during a
  functional change. Formatting-only edits should be identified in review.
- Keep tests next to a named behavior under `tests/unit/`. Prefer real handler or
  domain calls; source-text assertions are supplemental, not acceptance tests.

## Review and release

Every change states: problem, behavior preserved, tests run, tests not run,
schema/config implications, and rollback. Follow
[the quality repair plan](docs/ENGINEERING-QUALITY.md). Public sharing additionally
requires an evidence/privacy review; a clean build does not make the repository
or its history safe to publish.

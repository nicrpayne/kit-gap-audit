# Operator authentication and safe rollout

Implemented on the isolated quality branch, November 6, 2026. Not deployed.
The existing production app and business data have not been changed.

## Boundary and owners

- Signal still has **one shared operator account**. This is not individual user
  identity, SSO, MFA, or role-based access control. Use a unique high-entropy
  password from a password manager; do not publish the repository as a secure
  multi-tenant product on the strength of this change.
- Login issues a fresh 256-bit random token (`op1_…`) in `kit_session` with
  `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production. The database
  stores only its SHA-256 hash, credential-version verifier, creation/expiry and
  revocation timestamps. Treat database contents as sensitive too.
- Sessions expire server-side after 30 days, without a sliding renewal. Every
  protected request checks storage; no positive-auth cache delays revocation.
  A new login does not invalidate another browser's valid session.
- Sign out revokes this session before clearing its cookie. It asks the operator
  to save unsaved forms first. It does not clear browser storage, accepted project
  data, saved Scenarios or reports. A failed revocation returns 503 and keeps the
  cookie so the operator can retry; the UI does not claim sign-out succeeded.
- A password change or **new** `OPERATOR_SESSION_EPOCH` invalidates existing
  sessions. Never reuse an old password/epoch pair: an unexpired session whose
  only invalidation was rotation could otherwise become valid again. Logout
  writes `revokedAt` and cannot be undone by changing the epoch.
- Missing production/unknown-runtime password fails closed. Explicit local
  development/test may run without it, but browser write-origin checks remain.
  Recipient/report-publication routes retain their own fail-closed guards.
- Temporary session-storage failure returns a generic 503, not an authenticated
  response and not a destructive cookie reset. Readiness probes can still use
  the deliberately public, allowlisted `/api/version` endpoint.

### Separate credentials

| Credential | Permitted use |
| --- | --- |
| Operator session | App pages/APIs; writes require same origin. |
| Explicit `Bearer <APP_PASSWORD>` | Existing non-bridge operator APIs; not page access. |
| Scoped bridge bearer | Existing `/api/bridge/*` transports only; their job-claim checks still apply. |
| Executive report reader session | Only its separately authorized report; never working-app access. |

`lib/auth/operatorPolicy.ts` owns token/version/grace rules;
`operatorSessions.ts` owns persistence and throttling;
`requestPolicy.ts` owns origin checks. Middleware runs on Node, supported by the
[installed Next 15.5 runtime](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware#runtime).
The report-owner API guard and sharing page use the same session verifier.
The existing report-reader mechanism and frozen report format are unchanged.

## Login throttling and origin rules

- One shared account means one durable global bucket: at most 20 well-formed,
  same-origin login attempts per five-minute window, including successful ones.
  Reservation is atomic across processes/replicas. Failures return 429 with
  `Retry-After`; existing sessions are not locked out.
- This prevents bypass by changing a caller-supplied IP header and survives
  restarts. It also means a hostile caller can temporarily exhaust the shared
  login budget. It is **not** DDoS protection; edge rate limiting and individual
  identities remain future hardening work. Never disable the guard to pass QA.
- Cookie-authenticated POST/PUT/PATCH/DELETE and other unsafe methods require an
  exact `Origin` match and refuse `Sec-Fetch-Site: cross-site`. Login and logout
  enforce this themselves. GET/HEAD/OPTIONS must remain non-mutating interfaces.
- Set `OPERATOR_APP_ORIGIN` to the exact public HTTPS origin behind Railway or
  another proxy. Without it, the request URL origin is used. Invalid configured
  origins fail browser writes closed; forwarded-host headers are not trusted.
- Explicit bearer clients may omit `Origin`. If present, it must match; a
  cross-site fetch marker is refused. Existing bridge tokens are unchanged.
- Non-browser login clients must send the exact origin too. Historical test
  scripts that fabricate password-hash cookies are not valid session tests.
  Use a real login against a disposable environment, or provide an existing
  session for a genuinely read-only diagnostic. Never log credentials.
- Login accepts a bounded JSON body (8 KiB, password at most 1,024 characters),
  preserves password whitespace and compares credentials without prefix timing.
  Login return URLs are constrained to paths inside Signal.

## Deployment gate — do not interrupt an active report session

1. Confirm the production build, exact external origin, existing password setup,
   database backup/recovery procedure, and a quiet window with the owner. Do not
   rotate secrets or deploy while a wiki refresh, review, save or report is active.
2. Rehearse the additive `20261106120000_operator_sessions` migration in staging.
   It creates two authentication tables only; it does not rewrite project or
   report rows. Railway runs migrations at startup, so review that startup path.
   Old app code can run with these extra tables present.
3. Choose the cookie transition deliberately. By default, old deterministic
   cookies are refused and users must sign in again. To preserve existing sign-in
   temporarily, set **both** `OPERATOR_LEGACY_SESSION_FROM` and
   `OPERATOR_LEGACY_SESSION_UNTIL` to absolute ISO UTC timestamps no more than
   seven days apart. Before/after that window, or with invalid configuration,
   the old cookie is refused. Restarts do not extend it.
4. A legacy cookie is shared and cannot be individually revoked server-side;
   signing it out clears only that browser's copy. All new logins, including
   those during grace, get individually revocable random sessions. Do not extend
   grace repeatedly. End it early if a legacy credential may be compromised.
5. Test a fresh sign-in, an existing-cookie transition, actual same-origin saves,
   bridge delivery, named Scenario recovery, existing report/PDF reads and
   recipient access over staging **HTTPS**. Verify the build and business state.
6. Promote only with owner coordination. Roll back to the recorded known build on
   regression. Leave additive tables in place; do not drop them as part of code
   rollback. Old code cannot read new cookies, so users may need to sign in again.
   A rollback also restores old auth weaknesses; it is availability recovery,
   not equivalent security. Do not claim a seamless session rollback.

## Local verification

`npm run check` covers unit boundaries, core regressions and build without a DB.
For integration, create a fresh disposable loopback PostgreSQL cluster/database,
apply migrations and set:

```text
DATABASE_URL=postgresql://signal_t0_local@127.0.0.1:<unused-port>/signal_t0_test_<digits>
SIGNAL_AUTH_DB_PROOF=1
```

Then run `npm run proof:operator-auth-db` followed by
`npm run proof:operator-auth-http`. The HTTP proof starts/stops its own local
production server on port 4397; reserve that port first. Run database suites
sequentially: their sentinels and authentication rows are deliberately disposable.

The DB suite tests random/hash-only sessions, independent logout/replay rejection,
expiry, password/epoch rotation, 50 simultaneous rate-limit reservations, exact
window reset and unchanged project/report sentinels. The HTTP suite exercises
the built middleware, sign-in cookies, owner sharing guards, scoped bridge/job
checks, outage recovery, 429 responses, legacy transition and Chromium/WebKit UI
sign-in/sign-out. It simulates missing session storage only inside that guarded
disposable database and restores it during cleanup.

The WebKit loopback HTTP harness removes `Secure` only from its intercepted test
login response so it can exercise navigation; the real server's Secure attribute
is asserted separately. This is **not** staging HTTPS/Safari deployment acceptance.
The private-report HTTP proof uses a blocked-external-network mock email transport;
it does not send real mail or publish a production report.

Still required: staging HTTPS/proxy verification, old-browser transition and
rollback rehearsal, production promotion approval, individual identity/edge
hardening, and the remainder of the API schema/concurrency tranche.

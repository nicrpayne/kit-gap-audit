# Private executive reports

## Operator flow

1. Finish the normal Audit → Scope → Decisions → capacity/estimates → Forecast review. Generate a saved Reality report or a saved Reality/Scenario pair.
2. In Reports, choose **Share privately with named recipients**. The executive preview is an explicit read-only projection of the saved facts, not the working application and not an automatically updating dashboard. It includes the saved scope, schedule, quotes, source dates, estimate-use boundaries and limitations. A paired report starts with a Reality/Scenario comparison.
3. Review private names and quotes. Enter the exact approved email addresses (maximum 25), choose 7, 30 or 90 days, and confirm the content review.
4. Create the link, then copy and send it to the intended recipients. Signal does not send invitation messages automatically. Possession of the link alone does not grant access.
5. Readers enter an approved email and the eight-digit, ten-minute code sent to that mailbox. A verified session lasts at most eight hours and never outlives the share.
6. Edit recipients or revoke a link in the same operator screen. Removal, revocation and expiry prevent subsequent server reads. Re-adding someone never reactivates an old code or session. Printed, copied or photographed content cannot be recalled.

Each link has an immutable copy of the captured report projection. A newer wiki, restored source, revised estimate or regenerated report does not rewrite an existing link. Generate and share a new snapshot for an update. Revoked/expired links cannot be reopened; create a new one.

## Required service configuration

Configure these as protected Railway service variables, separately for staging and production:

- `APP_PASSWORD`: existing operator authentication; publication management fails closed without it.
- `REPORT_SHARING_SECRET`: a cryptographically random secret of at least 32 characters. Use a different secret per environment. Rotation invalidates outstanding codes and sessions; shares and approved recipients remain.
- `REPORT_PUBLIC_ORIGIN`: the exact canonical HTTPS origin of that Signal environment, with no path, query, user information or fragment.
- `REPORT_EMAIL_FROM`: verified sending email address, without a display-name wrapper.
- `RESEND_API_KEY`: a sending key for the verified sender/domain. Store in the service secret manager, not source control or chat.

No domain, account, paid service or real recipient is created by this patch. Finish sender/domain verification and approve an exact QA inbox before sending a real test message. While any configuration is missing, the owner sees a setup notice; publication and recipient authentication are disabled. Existing access also fails closed. Owner revocation remains available.

The initial integration uses Resend's HTTPS email endpoint with a per-challenge idempotency key and a ten-second timeout. Mail contains only the code, canonical sign-in URL and security instructions—no project name or report body. A provider failure leaves the challenge undelivered and unusable. The public request response remains generic; it does not disclose membership or provider errors.

## Security and operating boundaries

- Reader routes are narrowly public and enforce their own authentication. The HttpOnly/Secure/SameSite=Strict `signal_report_reader` cookie is separate from the operator cookie and never authorizes working-app APIs.
- Codes and session tokens are random; only keyed hashes are stored. A code is single-use, expires in ten minutes and permits five guesses. Redemption is transactional; concurrent requests cannot redeem it twice.
- Delivery is limited per existing recipient. Unknown IDs/emails do not allocate throttle records or consume a shared legitimate-reader budget. Infrastructure-level abuse protection is still required for volumetric denial-of-service; the application limiter is not a WAF. A targeted flood can temporarily exhaust one known recipient's delivery allowance.
- Owner cookie writes require same-origin requests. Public authentication writes require the configured canonical origin. JSON bodies are bounded while streaming. Management writes use optimistic revisions, and creation retries are idempotent.
- Report HTML, React server-component responses and access APIs use private/no-store caching, no-index and no-referrer headers. No third-party analytics or images are added. Report text and quotes render as inert text; raw simulation corpora, owner links and private-system navigation are excluded.
- Publication/revocation/recipient changes and verified access are recorded in `ReportShareEvent`. Codes, provider credentials and email payloads are not logged by the application. Deployment/proxy logging configuration must not capture request bodies or cookies.
- Expired access is denied in queries regardless of retention. Expired challenge/session rows currently remain until administrative database retention cleanup; no automatic destructive retention policy is enabled. Report snapshots and audit history are retained. Review the retention policy before broader organizational rollout.
- This remains Signal's existing single-operator/single-organization model, not a multi-tenant SaaS identity system. An email account's own access controls determine who can receive its code.

## Migration and rollback

`20261008160000_private_report_sharing` is additive: six new tables with indexes and a reference to existing saved Reports. It does not rewrite business data. A shared report is protected from deletion by its reference. Rolling application code back leaves the added tables intact; do not drop tables containing publications or access history as an automatic rollback step.

The disposable proof database has four pre-existing schema differences outside this migration (CapacityReconciliation.updatedAt default, Finding auditRunId index, SavedScenarioMutation index name and ScopeProposalItem.origins default). These are not caused or silently repaired by this feature. All six new tables match the declared migration/schema.

## Verification gates

- `npm run proof:report-sharing`: config, policy, source projection, inert rendering, estimate boundaries, frozen phase start, origin/body/owner checks and reader/operator separation.
- `npm run proof:report-sharing-db`: guarded disposable PostgreSQL only; immutable snapshot/pair, retries, wrong/expired/replayed codes, concurrent redemption, recipient removal/regrant, revocation, throttling and cleanup.
- `npm run proof:report-sharing-http`: guarded disposable PostgreSQL and loopback Next server; explicitly loaded mock mail transport intercepts all Resend calls and forbids external fetches. Exercises actual routes, `after()`, cookies, HTML/RSC privacy and configuration failures. This is not real mail delivery or browser acceptance.
- Supported browser acceptance must separately check owner create/edit/revoke, isolated recipient sign-in, responsive/keyboard interaction, exact source facts and data preservation.
- Real email delivery, named-recipient verification and an actual printed/exported PDF with pagination review remain separate acceptance gates. Never promote a mock or HTML print view to those passes.

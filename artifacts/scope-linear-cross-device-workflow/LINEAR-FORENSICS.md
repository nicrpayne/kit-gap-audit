# Linear forensics

## What Signal actually filters

`lib/linear.ts` reads Linear GraphQL issues with:

- exact configured team key;
- exact configured project name or names;
- optional exact label membership;
- optional inclusion of triage;
- exclusion of canceled issues;
- cursor pagination in pages of 100;
- a two-minute process cache.

There is no `createdAt` or `updatedAt` cutoff. Completed work is retained for coverage/history; archived/completed state is not generically discarded. Issue URL, state, estimate, assignee, parent, project, team, created and updated timestamps ride through the read model. Browser project payload responses now use private `no-store` caching.

## Proven configuration discrepancy

Repository authority identifies the current Linear projects as:

- `KIT JSA` — `28a1de31-a367-462d-9828-a8f9d570f097`
- `KIT Platform` — `39699fa5-a920-412b-af8c-80780a1a9c3f`
- `KIT iTrack` — `659ac27f-2b63-4080-a85c-6ed4bae9458f`

There is no current project named `KIT Safety (JSA and iTrack)` in that authority. `prisma/seed.ts`, `prisma/seed-dev.ts`, and an older project-context fixture still carry that legacy name. `docs/PRODUCTION-RUNBOOK.md` explicitly calls the stale mapping a blocker and instructs repointing JSA to `KIT JSA`.

Because the server uses exact project-name matching, a production Scope still configured to the legacy name would deterministically return no JSA issues. This is the leading, code-and-runbook-supported explanation for `Linear current · empty`.

## What could not be proven

The exact production JSA Scope id/config row and exact current Linear issues could not be read:

- every read-only Linear connector query returned `UNAUTHORIZED` with `oauth_token_invalid_grant` and `TRIGGER_REAUTHENTICATION`;
- unauthenticated production `/api/debug/linear` returned 401;
- no production Signal session/credential or Railway CLI was available locally.

Therefore this artifact does **not** claim that the production row definitely still has the stale value, and it does not invent Notifications/PDF/Offline/Approval ticket ids from title resemblance.

## Required read-only closeout after reauthentication

1. Read the active production JSA Scope id, team key, project names, label filter, triage flag and execution timestamp.
2. Enumerate all issues from the configured team and from `KIT JSA`, paginating to exhaustion.
3. Record exact identifiers for Nic's Friday tickets and evaluate each against team/project/label/state rules.
4. If the owner row is stale, use the existing guarded Scope edit in staging first; do not patch the database directly.
5. Re-run `/api/debug/linear`, Scope, and Forecast and archive the completed census.

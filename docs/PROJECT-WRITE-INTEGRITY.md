# Project write integrity

Local quality candidate, November 8, 2026. Not a production deployment receipt.

## Behavior

- Creating a Scope, renaming it, and activating a reviewed bootstrap use the
  same identity check. Names and accepted aliases share a namespace. The check
  uses the existing activation normalization: case, diacritics, separator
  punctuation and repeated spaces do not create distinct identities. A name
  must contain a letter or number. An archived Scope still retains its name.
- Duplicate checks and the corresponding writes run in PostgreSQL Serializable
  transactions. All canonical name/alias writers must follow this rule; a
  check outside the transaction is not sufficient. Serialization conflicts
  retry the whole transaction, at most three times. Network/provider calls
  remain outside the transaction. Exhausted conflicts return a recoverable 409,
  not a partial success. Timeouts and arbitrary failures are not blindly retried.
- This is an application-level invariant, **not a database unique constraint**.
  Direct SQL, seed/maintenance scripts and old deployments can bypass it.
  Existing duplicates are not merged, renamed or removed. Unrelated settings
  edits remain possible on them. Staging must check real identity collisions;
  deployment must not leave older canonical writers serving concurrently.
- Project creation saves its selected dependencies in the same transaction.
  Invalid dependencies reject the entire creation. The form no longer creates
  first and then makes a separate dependency request.
- Settings changes check dependency existence and cycles within their save
  transaction. Two opposite dependency edits cannot both commit a new cycle.
  This does not claim to redesign every archive/deletion workflow.
- Activation retains its immutable receipt: repeating a successful activation
  returns the original Scope, snapshot and Audit. A collision or invalid
  accepted source rolls back every canonical write in that activation.

No source acceptance, forecast membership, estimates, staffing, stored reports,
recipient access or business choices are changed automatically.

## Input and error contracts

`lib/scopes/input.ts` validates settings before database/provider access;
`lib/bootstrap/activationInput.ts` validates activation requests. Bodies are
bounded by `lib/http/json.ts` to 64 KiB of actual streamed bytes.

- Partial settings preserve omitted fields. Null clears nullable fields;
  zero capacity keeps its prior meaning of clearing the explicit override.
- Names, IDs and project-name entries are at most 200 characters; URL entries
  at most 2,048; lists at most 100 entries; estimation context at most 20,000.
- Booleans must be booleans; capacities must be finite and non-negative;
  revisions must be non-negative safe integers. Activation acknowledgements
  cannot be strings that accidentally act as `true`.
- Targets accept valid `YYYY-MM-DD` dates or offset-bearing ISO timestamps.
  Impossible dates such as February 30 and timezone-free timestamps are refused.
- Malformed fields return 400, oversized bodies 413, wrong content types 415,
  missing records 404, identity/revision conflicts 409, and a missing required
  owner-boundary revision 428. Existing UIs handle non-success responses and keep
  the entered draft. Duplicate Scope responses changed from 400 to 409.
- Unexpected errors are logged on the server; these handlers return a stable
  recovery message rather than raw Prisma/connection details. Linear connection
  failures no longer echo the provider's arbitrary error text into this flow.

Unknown fields are ignored, matching the existing partial-update contract.
This is not a claim that every API has been migrated to runtime schemas. Draft
bootstrap editing is covered by the subsequent [setup integrity batch](BOOTSTRAP-WRITE-INTEGRITY.md).
Other resource families, GET/error paths, and older maintenance scripts still
require the wider API review.

## Code ownership

| Concern | Owner |
| --- | --- |
| Transaction retry policy | `lib/db/serializable.ts` |
| Canonical name and alias collisions | `lib/scopes/identity.ts` |
| Dependency validation | `lib/scopes/dependencies.ts` |
| Settings input | `lib/scopes/input.ts` |
| Activation input | `lib/bootstrap/activationInput.ts` |
| Deliberate versus unexpected API errors | `lib/http/writeErrors.ts` |
| Existing activation receipt and retry behavior | `lib/bootstrap/activation.ts` |

PostgreSQL's [Serializable isolation contract](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-SERIALIZABLE)
is the basis for the concurrent read/check/write behavior. Use the installed
Prisma 6 client API, not unversioned examples for a different major release.

## Verification and running the proof

`npm test` covers malformed payloads, date/list bounds, partial-update behavior,
acknowledgement types, retry limits and safe error responses without a DB.

`npm run proof:project-writes` exercises the **built app's actual HTTP routes**,
PostgreSQL and Chromium/WebKit. Requirements:

1. Use an empty, dedicated local PostgreSQL DB with all migrations applied.
   `DATABASE_URL` must use role `signal_t0_local`, a loopback host, an explicit
   port, and a database named `signal_t0_test_<digits>`.
2. Set `SIGNAL_PROJECT_WRITE_PROOF=1`. Set `SIGNAL_PROJECT_PROOF_OUTPUT_DIR` to an
   output directory outside the source tree if desired. No production `.env` or
   provider credentials are needed; the child server clears provider keys and
   uses existing fictional Linear fixtures.
3. Run `npm run build` with no server using this checkout, then the proof. It
   starts/stops its own server on loopback port 4398. Do not rebuild during it.
4. The proof requires empty owner/auth tables at startup, removes its fictional
   rows afterward, and emits `result.json` plus four browser screenshots. It does
   not drop the database. Never run it on a database containing user data.

Cases include 50 simultaneous duplicate-create requests in five rounds,
create-versus-rename and rename-versus-rename, activation/name/alias races,
activation replay and rollback, opposite dependency edits, atomic dependency
creation, valid settings and explicit clearing, malformed/oversized HTTP input,
revision guards, historical duplicates, and browser error recovery/reload.
An existing-project sentinel and frozen-report sentinel must remain identical.

The browser form test attaches a real session from the login endpoint without
the Secure flag only in its loopback context. This is not a deployed TLS/auth
acceptance test; the separate auth suites cover cookie flags and revocation.

## Release and rollback

This batch adds **no schema change or data backfill**. The repair branch still
contains the prior additive operator-session migration and its separate
[transition requirements](OPERATOR-AUTH.md). Rehearse the whole candidate in
staging, coordinate a quiet production window, record the exact prior build,
and keep current wiki/report operations on production until promotion is agreed.
A code rollback does not undo accepted project edits or prior auth migrations.

# Project setup and review integrity

Local quality candidate, November 8, 2026. This is not a deployment receipt.
“Bootstrap” is the internal name for the Add Project / project setup workflow.

## Behavior and boundaries

Draft setup names are checked and saved in one Serializable transaction. A
duplicate responds with a recoverable conflict and the existing setup ID, so
the operator can continue that setup. This draft namespace is separate from
the canonical Scope name/alias checks at activation. It is not a DB uniqueness
constraint; direct SQL and older writers can bypass it.

Changing a draft's identity (name, aliases, owner/source hints, or knowledge
search setting) does all of the following atomically:

1. Retires active proposals without deleting their dispositions or exact quotes.
2. Invalidates queued/running scans and outstanding companion jobs.
3. Clears the active package pointer, returns the setup to draft, and advances
   its review revision, invalidating an old activation review.
4. Records an identity-change event with the affected scan IDs.

A no-op save does none of those things. Activated and archived setups cannot
change identity; live project settings have their own owner. No canonical
Scope, forecast membership, estimate, staffing choice or report changes here.

Package publication and review writes lock the same parent row as identity
editing. Publication checks the identity and invalidated scan IDs **inside**
that transaction. A late result is refused even if the operator changes a name
back to its previous spelling. A deliberately started fresh scan may reuse the
same immutable package content; a new `generatedAt` alone is not new content.
External transport retains its stricter producer/package-hash replay check.

Review history is carried forward only for the same requested identity and
the existing source-fingerprint rules. Matching proposal keys under a different
identity do not transfer accepted choices. Quote-complete packages retain the
existing batched persistence (250 candidates / 1,000 evidence links per batch).

## Input and failure handling

- Setup and candidate writes accept at most 64 KiB of streamed JSON, using
  `lib/http/json.ts`. Invalid JSON/fields return 400, oversized bodies 413,
  wrong content types 415, missing records 404 and conflicts 409.
- Setup names and aliases: 160 characters; at most 20 aliases/source hints;
  source hints: 2,048 characters each; owner hint: 200 characters. Empty alias
  entries from the comma-separated UI are permitted; malformed values are not
  silently discarded or truncated. Omitted fields remain unchanged.
- Manual candidate titles: 1,000 characters; summaries: 10,000; review reasons:
  500. Manual candidates remain operator assertions, not external evidence.
- Unexpected DB errors are logged server-side. These handlers return a safe
  recovery message rather than credentials, SQL, or a misleading “not found.”
- Entire transactions retry at most three times, and only for confirmed
  serialization/deadlock aborts: Prisma `P2034`, or `P2010` carrying PostgreSQL
  SQLSTATE `40001` / `40P01`. Timeouts/disconnects and uncertain outcomes are not
  blindly retried. Exhausted conflicts return a recoverable 409.
- Candidate editing/rejection closes its dialog only after a successful save.
  Validation failure keeps the text and displays the error inside the dialog;
  inputs are disabled while a save is pending.

## Code ownership

| Concern | Module |
| --- | --- |
| Request parsing and bounds | `lib/bootstrap/input.ts` |
| Draft identity and invalidation transaction | `lib/bootstrap/identity.ts` |
| Immutable package persistence and review carry-forward | `lib/bootstrap/packageStore.ts` |
| Compilation and local scan execution | `lib/bootstrap/scan.ts` |
| Confirmed-abort retry policy | `lib/db/serializable.ts` |
| Deliberate versus unexpected API errors | `lib/http/writeErrors.ts` |

Routes validate the input, invoke a domain operation, and map its result to an
HTTP response. Comments explain the invariants and unusual failure boundaries;
they do not restate every line. Persistence was extracted from the compiler;
existing imports from `scan.ts` remain compatible through a re-export.

## Verification

`npm run check` now includes the fictional bulk-package proof (501 candidates,
1,002 evidence links), in addition to unit tests, existing core proofs and build.
It does not need a DB or live provider credentials.

The guarded `proof:project-writes` uses a dedicated empty local PostgreSQL DB
and the built application's real HTTP routes. It covers duplicate setup
create/rename races, no-op revisions, late/queued scan rejection, rename-back,
publication-versus-edit, identity-bound review history and immutable quotes.
Chromium and WebKit exercise failed review validation, retained text, correction,
successful save and persisted reload. Existing Scope/activation/dependency and
frozen-report sentinel checks also remain in this suite. Its four screenshots
and result receipt live outside the source tree.

The WebKit harness waits for sidebar prefetch to settle before forced document
reloads, which otherwise report canceled RSC fetches as access-control errors.
Page errors are still asserted empty; no matching errors are filtered away.
This is not a rapid-navigation stress test or a deployed HTTPS acceptance claim.

See [the canonical write proof instructions](PROJECT-WRITE-INTEGRITY.md) for the
strict empty-database guard. Run DB suites sequentially, never on user data.
The separate phase-one DB regression also checks disappearance/reappearance of
a reviewed proposal and zero writes to canonical project/report owners.

## Remaining work and rollout

No schema change or data backfill is introduced by this batch. The candidate
branch includes the earlier additive operator-session migration; its
[staging transition and rollback checks](OPERATOR-AUTH.md) still apply.

This does not complete API validation across the app, redesign all scan/job
queue races or archive paths, validate every candidate payload's business
meaning, or prove an end-to-end live bridge/recipient journey. Existing history
is not retroactively repaired. Staging acceptance must precede production.

# Context model — Phase 1a + 1b

Describes what actually exists in the codebase after Context Package
Foundation Phase 1a and Phase 1b (branch
`claude/gap-app-context-sources-hwy0v3`). This is a description of shipped
code, not a design spec — if something below and the code disagree, the
code is right and this doc is stale.

**Phase 1a** (foundation) shipped the `ProjectContextPackage` contract, the
`SourceRegistration` and `ContextSnapshot` tables, and nullable provenance
fields on `Finding`/`Report` — nothing was wired into any existing flow.
**Phase 1b** (this update) hardened that foundation (strict validation,
identity-conflict detection, referential integrity) and wired ONE real
ingestion/provenance path end to end: `POST /api/refresh` can now accept an
optional `contextPackage`, persist it as a `ContextSnapshot`, and have the
audit pipeline produce a `Finding` that traces back through that snapshot
to the exact evidence that grounded it — which then flows into the
existing forecast through the exact same path any other unticketed
Finding already used.

**This is still not Hermes integration.** Every proof in this phase used a
synthetic, manually-constructed package. Nothing here calls the real KE
wiki, a real Hermes agent, or a real spreadsheet connector.

## Four distinct concepts (unchanged from Phase 1a)

```
SourceRegistration   POLICY — mutable, current tracking policy for a
                      recurring source
        │
ProjectContextPackage   TRANSPORT — a versioned value shape, assembled by
                         a producer (Hermes, a human, or the Gap App)
        │
ContextSnapshot   HISTORY — persisted, immutable, one frozen package
                   instance, created exactly once per accepted package
        │
Finding.contextSnapshotId / evidenceRefs, Report.contextSnapshotId
                  — provenance pointers into that history
```

`ProjectIntelligenceEnvelope` remains designed, not built.

## Phase 1a hardening

Three invariants Phase 1a's first draft did not fully enforce, corrected
before any wiring:

### 1. Never silently drop evidence

`lib/context/validate.ts` was rewritten to be **strict, not lenient**. Any
structural problem anywhere in an incoming package — a missing required
field on any `sources[]`/`evidence[]`/`derivedClaims[]` entry, an
oversized field, a duplicate id — rejects the **whole package** by
throwing `PackageValidationError`, identifying exactly which entry and
field failed (e.g. `evidence[2].id is required...`). There is no partial
acceptance and no silent truncation: "we received a blocker but couldn't
parse it" must never quietly become "there was no blocker."

**Referential integrity** is enforced at the same boundary: every
`evidence[].sourceRef` must match a `sources[].sourceRef` in the same
package; every `derivedClaims[].evidenceRefs` entry must match an
`evidence[].id` in the same package; evidence ids and derived-claim ids
must each be unique within the package. A package with a dangling pointer
never reaches an immutable snapshot.

### 2. Identity collision, not silent overwrite

`lib/context/snapshot.ts`'s `persistContextSnapshot()` now computes the
incoming package's hash **before** checking for an existing
`(producer, packageId)` row. Three outcomes:
- No existing row → create.
- Existing row, **same** hash → idempotent reuse (`reused: true`, same
  `ContextSnapshot.id`) — a safe retry.
- Existing row, **different** hash → throws `PackageIdentityConflictError`.
  The original snapshot is never overwritten, never silently returned as
  if the new content were identical, and no second row is created under
  the same identity. `packageId` is supposed to identify immutable
  content; a different payload under the same id is a real error, not
  something to paper over.

### 3. Scope match enforced at the persistence boundary

`persistContextSnapshot(rawPackage, { expectedScopeId })` throws
`PackageScopeMismatchError` if the package's own `scopeId` doesn't match
the scope the caller is persisting for — defense-in-depth so an ingestion
boundary can't accidentally attach a package to the wrong Scope.

### 4. `observedAt` semantics (reconfirmed, unchanged)

`PackageSourceManifestEntry.observedAt` still means "the last time the
underlying source was actually read from its origin" — never a cache-hit
time, never `package.generatedAt`, never snapshot-persistence time. No
behavior changed here; Phase 1a already had this right (re-verified in
Phase 1b's own proof, which built a fixture with `observedAt` four minutes
before `generatedAt` and asserted both survived independently).

## Finding provenance: Source-backed vs. ContextSnapshot-backed

`Finding.sourceId` is **nullable as of Phase 1b** (was required through
Phase 1a). Two shapes now coexist, deliberately:

| | `sourceId` | `contextSnapshotId` | `evidenceRefs` |
|---|---|---|---|
| **Legacy / direct audit Finding** | set | usually null | usually `[]` |
| **Package-derived Finding** | null | set | non-empty |

A Finding can carry both if a single audit run genuinely used a pasted
transcript **and** package evidence, and the model grounded that specific
finding in package evidence too (`evidenceRefs` non-empty) — `sourceId`
still points at the transcript's `Source` row in that case. A finding from
the same mixed run that's grounded **only** in the transcript keeps
`contextSnapshotId: null` even though a package was present in the run —
"package-derived" is a precise, checkable claim (`evidenceRefs` non-empty
and cited), not "this run happened to have a package attached."

**No fake `Source` row is ever created** for a package-only audit run.
`runAudit()`'s `AuditRunResult.source` is typed `Source | null`; it's
`null` whenever the run had no pasted transcript.

**Consumers updated to handle both shapes truthfully**, not by fabricating
data:
- `lib/forecast/compute.ts`'s `buildScopeSimInputs()`,
  `lib/estimate/runForScope.ts`, and `lib/audit/run.ts`'s own
  "don't re-raise a handled finding" query all changed from
  `where: { source: { scopeId } }` to
  `where: { OR: [{ source: { scopeId } }, { contextSnapshot: { scopeId } }] }`
  — this was the real blast-radius finding of making `sourceId` nullable:
  every place that found "this Scope's Findings" did it exclusively via
  the (previously required) `Source` relation, which would have made a
  package-derived Finding invisible to the forecast, the estimator, and
  the audit's own re-raise guard.
- `POST /api/findings/:id/ticket` resolves the Finding's Scope via
  `finding.source?.scope ?? finding.contextSnapshot?.scope`, and writes a
  provenance line into the created Linear issue's description naming
  whichever is actually true ("from source ..." vs. "from a tracked
  project context package (snapshot ...)").
- `/decisions` and `DecisionQueue.tsx` render a plain label instead of a
  broken link when a decision Finding has no `Source` to link to.

## One snapshot per accepted package

`POST /api/refresh` calls `persistContextSnapshot()` **exactly once**, at
the top of the request, immediately after the (unchanged) `ContextDoc`
upsert step and before anything else runs. The resulting
`contextSnapshotId` is then **passed as a parameter** into `runAudit()`
(as `options.packageContext`) and `generateReport()` (as its second
argument) — neither of those functions ever persists a snapshot itself;
they only ever receive an id and stamp it onto what they create. This is
what makes "one accepted package instance → one ContextSnapshot" true by
construction rather than by convention: there is exactly one call site in
the entire codebase that creates a `ContextSnapshot` row.

## `POST /api/refresh` contract (additive)

```ts
interface RefreshBody {
  scopeId: string;
  transcript?: { kind: string; title?: string; content: string };
  contextDocs?: { label: string; content: string }[];
  generateReport?: boolean;
  contextPackage?: unknown; // ProjectContextPackage v1, validated internally
}
```

`contextPackage` is entirely optional and additive — **every existing
caller that omits it gets exactly today's behavior**, unchanged. When
present:

1. Validated strictly (`validateProjectContextPackage`) and checked
   against the request's `scopeId` (`PackageScopeMismatchError` on
   mismatch) — both mapped to `400`.
2. An identity conflict (`PackageIdentityConflictError`) maps to `409`.
3. On success, persisted as one `ContextSnapshot`; the response's
   top-level `contextSnapshotId` field carries its id (`null` when no
   package was sent).
4. **The audit now runs whenever either a transcript or an accepted
   package is present** (previously: transcript only) — a package-only
   refresh, with no pasted transcript at all, is a real, supported call
   shape, since a package alone is enough evidence to audit against
   Linear.
5. If a Report is generated in the same request, `Report.contextSnapshotId`
   is set to the same snapshot.

## Package evidence audit flow

`runAudit(scope, input, options)` — `input` is now optional
(`AuditInput | undefined`); `options.packageContext` carries
`{ contextSnapshotId, evidence }`. At least one of the two must be
present. `lib/audit/prompts/audit-v1.ts`'s `buildAuditPrompt()` renders
package evidence as its **own block**, each item shown with its stable
`id` and any structured `data`, distinct from a pasted transcript block —
evidence is never flattened into one anonymous string before the model
sees it, and the prompt explicitly instructs the model to cite an item's
`id` in a new `evidenceRefs` output field for any finding grounded in it.
`lib/audit/normalize.ts` parses that field defensively (`string[]`,
default `[]`).

**Safety net, not blind trust**: `runAudit()` intersects whatever
`evidenceRefs` the model returns against the actual set of evidence ids it
was shown before writing anything — a hallucinated id can never survive
into a `Finding.evidenceRefs` array. Only findings whose cited refs
survive that intersection get `contextSnapshotId` set at all.

The audit prompt is real, shipped code. **What Phase 1b's proof did NOT
do** is call the real Anthropic model to verify it live — there is no
`ANTHROPIC_API_KEY` in this sandbox. The proof injected a fixed,
deterministic response via `runAudit()`'s `options.complete` parameter
(the same dependency-injection pattern already used by
`lib/notion.ts`/`lib/figma.ts`'s `fetcher` parameter) instead of weakening
`/api/refresh` itself to accept a mockable LLM call. See "Mocked vs. live
boundaries" in the phase's own report for the exact boundary.

## Derived claims remain inert

Unchanged from Phase 1a: `ProjectContextPackage.derivedClaims` round-trips
through validation and persistence, and nothing anywhere reads or acts on
it. The audit prompt does not currently render `derivedClaims` to the
model at all (only `evidence` is shown) — a derived claim is context a
future Gap App evaluation step could consider, not something auto-promoted
into a Finding, forecast input, Linear ticket, or capacity/dependency
change. That evaluation step does not exist yet.

## What is NOT built in Phase 1b

- No real Hermes integration, no KE wiki access, no Hermes pull path.
- No `ProjectIntelligenceEnvelope`.
- No Context Workbench UI, no generic file upload.
- No Notion/Figma package assemblers — only the manual/synthetic
  construction path has been exercised (Phase 1a and 1b both).
- No automated Linear reconciliation — superseding a `SourceRegistration`
  does not auto-resolve any Finding derived from it; that stays a human
  (or a future, deliberate) action.
- No entity/obligation matching across sources (spreadsheet row vs. Linear
  ticket correlation remains unsolved, deliberately — `Finding.evidenceRefs`
  stays stable enough to support it later without a further migration).
- No portfolio-wide (multi-scope) snapshot semantics — `ContextSnapshot`
  is still single-scope only.
- No source-supersession *recommendations* — Hermes-style "this looks
  obsolete" suggestions are not computed anywhere; only the explicit,
  human-approved status-transition write path exists
  (`PATCH /api/source-registrations/:id`).

## Protected areas — confirmed untouched

`lib/forecast/simulate.ts`, `lib/forecast/portfolio.ts`,
`lib/capacity/resolve.ts`, `lib/scenario/` (`ScenarioInputDelta` and all),
`lib/momentum/`, and every Portfolio Instrument component are
byte-for-byte unchanged by Phase 1a or Phase 1b (verified by diffing
against the Phase 1a commit before Phase 1b started).

## Next phases (not started)

- **A real Notion/Figma/spreadsheet-connector package assembler** —
  everything proven so far uses a hand-built package matching the shape a
  real assembler would need to produce, but no such assembler exists.
- **Hermes wiring** — a real push from Hermes using this exact same
  `ProjectContextPackage` contract, unchanged.
- **`ProjectIntelligenceEnvelope`** — a read-only composition of
  `computeForecast`/`computeMomentum`/`Finding`/capacity data, citing
  whichever `ContextSnapshot` backs it.
- **Source-supersession recommendations** — a computed (never
  auto-applied) "this source appears obsolete" suggestion, evaluated
  against a `SourceRegistration`'s `rationale` and current Linear/other
  source state.

All designed in the architecture assessments that preceded these two
phases; none built.

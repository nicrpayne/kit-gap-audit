# Context model — Phase 1a

Describes what actually exists in the codebase after Context Package
Foundation Phase 1a (branch `claude/gap-app-context-sources-hwy0v3`). This is
a description of shipped code, not a design spec — if something below and
the code disagree, the code is right and this doc is stale.

**Nothing in this phase is wired into any existing flow.** `/api/refresh`,
`runAudit()`, `generateReport()`, `computeForecast()`, `/portfolio`, Momentum,
and every simulation module are byte-for-byte unchanged. This phase is pure
foundation: a contract, two new tables, two new nullable fields, and a
persistence helper — nothing yet calls any of it in production code paths.

## Why this exists

The Gap App's evidence/context system today is three unrelated pipelines
(Linear, Notion/Figma, the audit `Source`/`Finding` pair) that each discard
provenance at the point they're consumed — see the architecture assessment
that preceded this phase (not reproduced here) for the full inventory. This
phase builds the smallest set of primitives that let a future refresh
preserve *where a fact came from, how fresh it was, and whether the source
that produced it is still considered current* — without touching any
existing forecast, simulation, or Reality data.

## Four distinct concepts

```
SourceRegistration                 POLICY — mutable, current, answers
  (candidate/active/paused/        "what recurring source should we be
   superseded/retired)             looking at right now"
        │
        │ governs which sources are eligible for inclusion
        ▼
ProjectContextPackage              TRANSPORT — a TypeScript value shape,
  (lib/context/package.ts)         constructed by a producer (Hermes,
                                    a human, or later the Gap App itself)
        │
        │ deliberately accepted/frozen at a specific moment
        ▼
ContextSnapshot                    HISTORY — persisted, immutable, one
  (Postgres row)                    specific package instance, forever
        │
        │ referenced by (never re-derived from)
        ▼
Finding.contextSnapshotId / Report.contextSnapshotId
```

A fifth concept, **ProjectIntelligenceEnvelope** (the output contract —
"what does the Gap App currently believe"), is designed in the architecture
assessment but **not built in Phase 1a**. Nothing in this phase computes or
exposes one.

## SourceRegistration

`prisma/schema.prisma`'s `SourceRegistration` model — tracking *policy* for a
recurring source, independent of its content. Not every piece of context
gets a row here: a one-off pasted transcript audited once (today's
`POST /api/audit` flow) is never registered. Registration is reserved for
things meant to be repeatedly relied on and reviewed (a recurring
`ContextDoc`, a Notion page, a Figma ref).

Fields: `sourceType`, `sourceRef` (references existing content by id —
this table never stores content itself), `scopeIds String[]` (empty =
portfolio-wide, mirroring `Scope.projectNames`' own "empty = any project"
convention), `role`, `status`, `rationale`, `statusReason`,
`statusChangedAt`, `supersededByRegistrationId` (a real FK, set only when
the replacement is itself a tracked source — never a free-text label
standing in for an id).

**Status** (five states): `candidate` → `active` ⇄ `paused` /
`active` → `superseded` / `active` → `retired`. Only `active`/`paused`
count as "expected" for a future completeness read; `superseded`/`retired`
are deliberately excluded, not treated as a failed read.

**Role** is independent of status on purpose: `operational_tracker` |
`requirements_of_record` | `design_reference` | `supplemental_context` |
`raw_evidence`. A source can stay `active` while its role changes from
`operational_tracker` to `supplemental_context` once execution moves
elsewhere — status and role change independently.

**Linear is deliberately never registered here.** It's a structural source
via `Scope.projectNames`/`teamKey` — editing those fields already *is*
Linear's retirement mechanism. See `PackageSourceManifestEntry.status`'s
`"structural"` value for how a future package assembler would represent it
alongside registered sources.

API: `GET/POST /api/source-registrations`, `PATCH /api/source-registrations/:id`.
**Any status change requires a non-empty `statusReason`** — enforced
server-side, not just by convention; there is no silent, reason-less status
change from any caller. This is the whole "Hermes recommends, an explicit
write changes Reality" boundary: nothing computes or persists a
recommendation object, and the only mutation path is this one endpoint.

## ProjectContextPackage v1 (`lib/context/package.ts`)

The transport contract. A plain, versioned, serializable value type — no
class, no behavior, no Prisma import. Key shape:

```ts
interface ProjectContextPackage {
  version: "1.0";
  packageId: string;       // the PRODUCER's own identity for this package instance
  producer: "hermes" | "manual" | "gap_app";
  generatedAt: string;     // when the PRODUCER assembled this package
  scopeId: string;         // Phase 1a is single-scope only, always required
  sources: PackageSourceManifestEntry[];
  evidence: EvidenceItem[];
  derivedClaims?: DerivedClaim[];
  completeness: PackageCompleteness;
  warnings: string[];
}
```

**Package identity vs. snapshot identity**: `packageId` is the producer's
own transport identity, independent of `ContextSnapshot.id` (the Gap App's
local, immutable historical identifier, assigned only once a package is
accepted and persisted). This split is what makes a retried push safe — see
"Snapshot identity" below.

**`observedAt` semantics** (`PackageSourceManifestEntry.observedAt`): the
last time the underlying source was *actually* read from its origin —
never the time the package was assembled, and never bumped by a cache hit.
A package assembled at 2:14 reusing Notion content actually fetched at 2:10
reports `observedAt: "...2:10"`, `package.generatedAt: "...2:14"`. The
producer owns this value; nothing in this codebase infers or overwrites it.

**`EvidenceItem.data`**: a deliberately generic `Record<string, JsonValue>`
escape hatch, size-bounded (see `lib/context/validate.ts`), so a structured
source (a spreadsheet row's columns, a database row's properties) survives
as structured data instead of being flattened into prose. No
source-specific typed fields exist on purpose.

**`DerivedClaim`**: Hermes-derived *understanding about* the evidence —
never itself evidence, and never itself a `Finding`, forecast input, Linear
ticket, or Reality. Phase 1a stores this field and nothing else — no code
anywhere reads, evaluates, or acts on a `derivedClaims` entry. Turning one
into a `Finding` is explicitly future work, gated behind deliberate logic
or a human action, never automatic.

## Validation (`lib/context/validate.ts`)

Hand-rolled, matching the codebase's existing precedent for untrusted-JSON
validation (`lib/audit/normalize.ts`) — no new dependency. Two failure
modes: a malformed **top-level** package (missing `packageId`, an unknown
`producer`, a version mismatch) throws `PackageValidationError` outright —
there's no safe partial acceptance of "which package, from whom, for which
scope." A malformed **entry** within `sources`/`evidence`/`derivedClaims`
is dropped individually so one bad row doesn't sink an otherwise-good
package. Size bounds (per-item excerpt length, `data` JSON size, item
counts) reuse the same char-budget discipline already used in
`lib/notion.ts`/`lib/figma.ts`.

## Deterministic hash (`lib/context/hash.ts`)

`hashProjectContextPackage()` — sha256, truncated, same convention as
`lib/estimate/context.ts`'s existing `contextHash`. Recursively sorts
object keys before hashing so two packages with identical content but
different key insertion order hash identically.

## ContextSnapshot

`prisma/schema.prisma`'s `ContextSnapshot` model — one immutable, frozen
instance of an accepted package. Fields: `scopeId` (required, single-scope
only in Phase 1a — portfolio-wide snapshots are explicitly deferred),
`packageId`/`packageVersion`/`producer` (denormalized from the package, for
querying without parsing the JSON), `package` (the full accepted package,
verbatim), `contextHash`, `completenessSummary` (denormalized copy of
`package.completeness`), `createdAt`.

**Created only by `persistContextSnapshot()`** (`lib/context/snapshot.ts`)
— this is the single write path, by design (one accepted package instance
produces exactly one snapshot; nothing else in the codebase creates a
`ContextSnapshot` row). **Never updated after creation.** A later
`SourceRegistration` status change never mutates an existing snapshot —
proven directly against real Postgres during Phase 1a's verification (see
`docs/CONTEXT-MODEL.md`'s companion assessment / the phase's own commit
history for the proof script's assertions, since the script itself was
deleted after passing per this repo's standing testing discipline).

**Idempotent by `(producer, packageId)`** (a real unique constraint): a
retried push of the same logical package — same producer re-sending the
same `packageId`, e.g. after a timeout — returns the existing snapshot
(`reused: true` on the result) rather than creating a duplicate.

**Snapshotting is a deliberate boundary, not an ordinary read.** No route
or page load creates a `ContextSnapshot` today, because nothing calls
`persistContextSnapshot()` yet — Phase 1a ships the mechanism, not the
wiring. Linear's existing 2-minute cache and Notion/Figma's existing
5-minute caches (`lib/linear.ts`, `lib/notion.ts`, `lib/figma.ts`) are
completely unchanged; an ordinary `/forecast` page load still never writes
to the database on account of context. There is no `FetchRecord` table or
equivalent — a per-fetch append-only log was considered and rejected: a
live package assembly already reports per-source freshness in-memory via
`PackageSourceManifestEntry.observedAt`, and a *meaningful* observation is
exactly what `ContextSnapshot` already is once something deliberately
freezes one.

## Finding / Report provenance fields

`Finding` gained `contextSnapshotId String?` and `evidenceRefs String[]`.
`Report` gained `contextSnapshotId String?`. Both nullable/empty-by-default
— every existing row, and everything produced by the app's current code
paths, has neither, and that's correct: nothing yet sets them.

`Finding.evidenceRefs` holds `EvidenceItem.id` values from the snapshot's
package (e.g. `["infra-row-13"]`) — this is deliberately more precise than
a source-level FK alone. The chain `Finding.contextSnapshotId →
ContextSnapshot.package.evidence[].id → .sourceRef →
package.sources[].registrationId → SourceRegistration` is fully walkable
today for any row that has one, using only these fields and the existing
`SourceRegistration` table — nothing further is needed to answer "why does
this Finding exist" once something populates them.

`Report.contextSnapshotId` deliberately replaces an earlier draft proposal
(`Report.sourcesUsed Json?`) that would have created two competing
provenance representations. A `Report` references the snapshot that fed
it; it does not duplicate the snapshot's manifest.

## What is NOT built in Phase 1a

- Nothing wires a real Hermes push. `POST /api/refresh` is completely
  unchanged.
- Nothing calls `persistContextSnapshot()` from any existing route,
  `runAudit()`, or `generateReport()`.
- `ProjectIntelligenceEnvelope` does not exist as a type, endpoint, or
  computation.
- No Notion/Figma package assembler exists — only the manual/test path
  (constructing a `ProjectContextPackage` by hand) has been exercised.
- No portfolio-wide (multi-scope) snapshot semantics.
- No UI of any kind — no Context Workbench, no `/portfolio` change, no
  `/scopes` change.
- No automatic `Finding` creation from a package's `derivedClaims` — that
  field round-trips and nothing else.
- No cross-source conflict detection, no obligation/entity-resolution
  layer (spreadsheet row vs. Linear ticket correlation remains unsolved,
  deliberately — `Finding.evidenceRefs` and `Finding.matchedIssues` are
  left stable enough to support this later without a further migration).

## Protected areas — confirmed untouched

`lib/forecast/simulate.ts`, `lib/forecast/portfolio.ts`,
`lib/capacity/resolve.ts`, `lib/scenario/inputDelta.ts` and the rest of
`lib/scenario/`, `lib/momentum/`, and every Portfolio Instrument component
are byte-for-byte unchanged by this phase.

## Next phases (not started)

- **Phase 1b**: a package-assembler for one source type (the `ContextDoc`/
  spreadsheet case), extending `POST /api/refresh` to accept an optional
  `contextPackage`, tagging resulting `Finding`s with `contextSnapshotId`/
  `evidenceRefs`.
- **Phase 1c**: a read-only `ProjectIntelligenceEnvelope` endpoint,
  composing existing `computeForecast`/`computeMomentum`/`Finding` data —
  independent of 1b, no new persistence.

Both are designed, not built. See the architecture assessment that preceded
this phase for the full contract shapes and reasoning.

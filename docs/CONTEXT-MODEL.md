# Context model — Phase 1a + 1b + 1c

Describes what actually exists in the codebase after Context Package
Foundation Phase 1a, 1b, and 1c (branch
`claude/gap-app-context-sources-hwy0v3`). This is a description of shipped
code, not a design spec — if something below and the code disagree, the
code is right and this doc is stale.

**Phase 1a** (foundation) shipped the `ProjectContextPackage` contract, the
`SourceRegistration` and `ContextSnapshot` tables, and nullable provenance
fields on `Finding`/`Report` — nothing was wired into any existing flow.
**Phase 1b** hardened that foundation (strict validation, identity-conflict
detection, referential integrity) and wired ONE real ingestion/provenance
path end to end through `POST /api/refresh` and the audit pipeline.
**Phase 1c** (this update) closes the main remaining trust gap — an
incoming package's own claim of completeness is never authoritative — and
ships the first read-only `ProjectIntelligenceEnvelope`.

**This is still not Hermes integration.** Every proof across all three
phases used a synthetic, manually-constructed package.

## Four distinct concepts

```
SourceRegistration   POLICY — mutable, current tracking policy for a
                      recurring source. AUTHORITATIVE over anything a
                      package claims about itself.
        │
ProjectContextPackage   TRANSPORT — a versioned value shape, assembled by
                         a producer (Hermes, a human, or the Gap App)
        │
ContextSnapshot   HISTORY — persisted, immutable, one frozen package
                   instance, created exactly once per accepted package.
                   Stores the package verbatim (producer's claims) AND a
                   separately Gap-App-evaluated completenessSummary.
        │
Finding.contextSnapshotId / evidenceRefs, Report.contextSnapshotId,
AuditRun.contextSnapshotId — provenance pointers into that history
        │
ProjectIntelligenceEnvelope   OUTPUT — read-only, composed on every
                                request, never persisted (Phase 1c)
```

## The main trust gap this phase closes

Phase 1b proved the pipe works: package → snapshot → Finding → forecast
input, with provenance intact. It did **not** prove the thing
`SourceRegistration` exists for: that a producer forgetting an expected
source can't quietly declare the package complete. A package's own
`completeness` field (its `expectedSources`/`missingSources`/
`excludedSources`) is a **producer assertion** — Hermes' own claim about
what it thinks it sent. It is preserved verbatim inside
`ContextSnapshot.package` as a historical record of that claim, and it is
**never trusted** as the Gap App's own answer to "is this package
complete."

## Source policy enforcement (`lib/context/sourcePolicy.ts`)

Two separate jobs, kept apart on purpose:

### 1. Registration validation (can reject the whole package)

For every package source entry that supplies a `registrationId`,
`validatePackageAgainstRegistrations()` checks it against **current**
`SourceRegistration` rows — never trusting the package's own
`sourceType`/`role`/`status` claims for a registered source, only using
them to confirm they still match:

- **Unknown `registrationId`** → rejected (`SourcePolicyViolationError`).
- **`sourceType` mismatch** against the registration → rejected.
- **`sourceRef` mismatch** against the registration → rejected (refusing
  to let one source impersonate another's registration).
- **Registration doesn't apply to this Scope** (`scopeIds` non-empty and
  doesn't include the package's `scopeId`) → rejected.
- **Registration is `superseded` or `retired`** → rejected. A producer
  cannot use a formerly-tracked source as current evidence by citing its
  old registration; the source must be resent with `registrationId`
  omitted (ad-hoc, see below) if the content is still worth using once.
- A source with `registrationId: null` (**ad-hoc**) is always allowed —
  it makes no policy claim, so there's nothing to validate against.
- A source citing a `candidate` registration is allowed (not rejected) —
  candidates simply don't count toward completeness either way (see
  below).

Rejection happens **before** a `ContextSnapshot` is ever created — a
policy-violating package leaves no row behind at all.

### 2. Completeness evaluation (never rejects, only summarizes)

`evaluateSourcePolicyCompleteness()` computes what the Gap App
independently concludes, against **every `SourceRegistration` applicable
to this Scope** (`scopeIds` empty or including it) — regardless of
whether the package mentions them:

| Registration status | In the package? | Bucket | Counts as missing? |
|---|---|---|---|
| `active` | supplied | `activeSupplied` | — |
| `active` | **omitted** | `missingActive` | **Yes** — this is the trust-gap case |
| `paused` | either | `paused` (`supplied: true/false`) | No — reported distinctly, a known/expected gap, not "Hermes forgot" |
| `superseded` | either | `excluded` | No — deliberately excluded |
| `retired` | either | `excluded` | No — deliberately excluded |
| `candidate` | either | *(none)* | No — zero Reality effect until promoted |

A package source with `registrationId: null` appears in `adHoc` —
contributes evidence for this one package, makes no completeness claim,
and **never becomes an expected source** in any later package (proved:
persisting a second package that simply omits the same ad-hoc source
never causes it to appear in `missingActive`).

`status` is `"partial"` whenever `missingActive.length > 0` — **even when
the producer's own `package.completeness` claimed nothing was missing.**
This is the concrete fix for the motivating example: Hermes sends a JSA
package, forgets the Infrastructure Alignment spreadsheet (an `active`
registration), and claims `completeness: { missingSources: [] }` — the Gap
App still independently concludes `partial`, missing that exact source.

**This result — not a copy of `package.completeness` — becomes
`ContextSnapshot.completenessSummary`.** The producer's own claim stays
preserved, untouched, inside `ContextSnapshot.package` purely as a
historical record of what was asserted; it is never read as the
authoritative answer anywhere in this codebase.

## Package-only Finding citation invariant

Extends Phase 1b's evidence-safety-net: a Finding produced by an audit run
with **no pasted transcript** (`source === null` for that run) **must**
end up with at least one valid `evidenceRef`, or it would persist with
**no provenance at all** — neither a `Source` nor a `ContextSnapshot`
behind it. `runAudit()` now checks this per finding, before writing
anything:

- Cited refs survive the existing safety-net intersection (Phase 1b) →
  Finding persists, `contextSnapshotId` set.
- Zero refs survive **and** this run has no transcript → the proposed
  Finding is **not persisted**. It's collected instead into
  `AuditRunResult.rejectedFindings` (`{ title, type, reason }`), surfaced
  in `POST /api/refresh`'s response under `audit.rejectedFindings` — a
  clear diagnostic, never a silent drop and never a fabricated citation.
- A finding from a **mixed** run (transcript present) always has
  `sourceId` set regardless of `evidenceRefs`, so this invariant only ever
  bites a pure package-only run — exactly where it matters, since a
  transcript-backed finding already has real provenance.

## Finding provenance: Source-backed vs. ContextSnapshot-backed

Unchanged from Phase 1b:

| | `sourceId` | `contextSnapshotId` | `evidenceRefs` |
|---|---|---|---|
| **Legacy / direct audit Finding** | set | usually null | usually `[]` |
| **Package-derived Finding** | null | set | non-empty (now enforced, see above) |
| **Mixed** | set | set (if this finding cites package evidence) | non-empty |

## AuditRun provenance

`AuditRun.contextSnapshotId String?` (new, nullable, `onDelete: SetNull`)
— traced before adding: `AuditRun.sourceId` was already a loose string
(no real Prisma relation), and nothing outside `lib/audit/run.ts`'s own
creation call reads it, so the blast radius was zero. A package-only
audit run now writes `contextSnapshotId` alongside `sourceId: null`,
closing the provenance-orphan gap Phase 1b left open: without this field,
a package-driven `AuditRun` row recorded that *an* audit happened but not
*from what*.

| Run shape | `AuditRun.sourceId` | `AuditRun.contextSnapshotId` |
|---|---|---|
| Legacy (transcript only) | set | null |
| Package-only | null | set |
| Mixed | set | set |

## One snapshot per accepted package

Unchanged from Phase 1b: `persistContextSnapshot()` is the sole call site
that creates a `ContextSnapshot` row. `POST /api/refresh` calls it exactly
once per request, before anything else runs, and threads the resulting id
into `runAudit()`/`generateReport()` as a parameter — neither persists a
second snapshot.

An identical retry (same `producer`+`packageId`+content hash) reuses the
existing row **without re-running registration validation or
re-evaluating completeness** — a pure retry of unchanged content must not
start failing (or silently change what was recorded as true) just because
`SourceRegistration` state moved on in between. Only a genuinely *new*
package is checked against current policy.

## Ingest-only refresh

`ingestOnly: true` — or `generateReport: false`, which is what a caller
sending it means — accepts the context and stops. No audit, no estimation, no
forecast, no report. Nothing on that path calls a model or reads Linear, so an
ingestion succeeds on a deployment with no `ANTHROPIC_API_KEY` and with Linear
unreachable. The response carries `mode: "ingest"` and names what it skipped.

**Omitting `generateReport` is unchanged**: a request that never mentions it
still audits, estimates and forecasts exactly as before.

This was a real defect, not a nicety. `runAudit` fired on the mere presence of
an accepted package, and estimation and forecast ran unconditionally after it;
`generateReport` gated only the last of four stages. Pushing context and
drawing conclusions from it were fused, so the first production handshake —
sent with `generateReport: false` — returned 502 from the first model call
**after the snapshot had already been written**. The package was accepted and
the caller was told it had failed.

## `POST /api/refresh` contract (additive, extended in 1c)

```ts
interface RefreshBody {
  scopeId: string;
  transcript?: { kind: string; title?: string; content: string };
  contextDocs?: { label: string; content: string }[];
  generateReport?: boolean;
  contextPackage?: unknown; // ProjectContextPackage v1
}
```

New in 1c: a `SourcePolicyViolationError` (unknown/mismatched/inapplicable/
superseded/retired registration reference) maps to `400`, same as a
structural `PackageValidationError` or a scope mismatch. The response's
`audit.rejectedFindings` array (new) surfaces any proposed Finding the
citation invariant above refused to persist. Every existing caller that
omits `contextPackage` still gets exactly today's behavior, unchanged.

## `ProjectIntelligenceEnvelope` v1 (`lib/context/envelope.ts`)

The first read-only OUTPUT contract: `GET /api/context/envelope?scopeId=X`
composes, on every request, **from existing functions only** — no
duplicated forecast, momentum, or capacity logic:

- `forecast` — `computeForecast()`'s own likely/earliest/latest/target
  dates and confidence, unchanged.
- `momentum` — `computeMomentum()` against the most recent `Report`, or
  `null` if none exists yet (same as every other momentum surface).
- `capacity.basis` — `computeForecast()`'s `breakdown.capacityBasis`, a
  small **additive** field added to `ForecastResult` this phase (computed
  by calling the already-existing internal `capacityBasisFor()` helper,
  previously only invoked for the portfolio path) — the exact same
  discriminated union the Instrument's "why is Reality 10?" explanation
  already uses. No second capacity-explanation model.
- `findings.items` — every open Finding for the Scope (via the same
  `source.scopeId OR contextSnapshot.scopeId` query used everywhere else),
  with its provenance fields (`contextSnapshotId`, `evidenceRefs`)
  surfaced directly.
- `context.health` — read **verbatim** from the latest `ContextSnapshot`'s
  own Gap-App-evaluated `completenessSummary` — never recomputed live
  against current `SourceRegistration` state, and never trusted from a
  package's own `completeness` claim (see "Source policy enforcement"
  above). `"unknown"`, not `"complete"`, when no snapshot exists at all —
  the absence of any deliberate context acceptance is never conflated with
  "context is fine."
- `directSources.linear` — see below.

**Never persisted.** Reading the endpoint — once, or a hundred times —
creates no `ContextSnapshot`, `Report`, or `Finding` row (proved directly:
building the envelope twice in a row, row counts identical before and
after both calls).

## Direct Linear vs. package context health

Linear remains a **structural** execution source the Gap App owns
directly (`Scope.projectNames`/`teamKey`) — it is never routed through
Hermes or represented as a producer's package obligation. A package
producer is not expected to prove it "consulted Linear"; that's the Gap
App's own job, unrelated to whatever context package arrived. The envelope
keeps this as its own section (`directSources.linear`), deliberately
separate from `context.health` (which is entirely about registered/ad-hoc
package sources) so the two health signals are never confused with each
other. `directSources.linear.configured` is always `true` (every Scope has
one); `availableForCurrentComputation` is `true` whenever an envelope is
successfully returned at all, since `computeForecast()` — which the
envelope calls unconditionally — throws before that point on a genuine
Linear failure, converted to a `502` by the route exactly like every other
Linear-dependent endpoint in this app.

## Current vs. historical honesty

The envelope deliberately combines two different time bases and never
implies they're the same instant:

- `generatedAt` — when *this* envelope was composed (now).
- `context.latestSnapshotCreatedAt` — when the most recent *deliberate*
  package was accepted (possibly much earlier, or never).

A caller comparing the two can reason about staleness ("context is 6 days
old, request a fresh package before trusting this") — the mechanism to
*act* on that (automatic refresh) is explicitly not built in this phase.

## Derived claims remain inert

Unchanged from Phase 1a/1b: `derivedClaims` round-trips through
validation and persistence; nothing anywhere reads or acts on it,
including the envelope.

## What is NOT built (through Phase 1c)

- No real Hermes integration, no KE wiki access, no Hermes pull path.
- No `ProjectContextPackage` pull endpoint.
- No MCP server.
- No Context Workbench UI, no source-policy UI, no source recommendations.
- No Notion/Figma/real-SharePoint-connector package assemblers — only the
  manual/synthetic construction path has ever been exercised.
- No automatic context refresh when stale — the envelope makes staleness
  *visible* (see above), nothing acts on it.
- No Linear historical snapshotting (see "Known provenance limitations").
- No automated Linear reconciliation, no auto-created Linear tickets, no
  auto-resolved Findings.
- No entity/obligation matching across sources.
- No portfolio-wide (multi-scope) snapshot semantics.

## Known provenance limitations

**A Finding can now prove which package evidence caused a conclusion, but
not the full Linear comparison set that proved an absence.** When an audit
concludes "this spreadsheet work has no matching Linear ticket," the
resulting Finding's `evidenceRefs` faithfully cites the *positive*
evidence (the spreadsheet row) — but the *negative* half of that
conclusion (a scan of every current Linear issue finding none of them
covers it) is not itself snapshotted anywhere. Six weeks later, the exact
set of Linear issues that existed at the audit moment cannot be
reconstructed with full historical fidelity — only Reality's own live
Linear state can be queried, which has moved on. This is a real,
documented limitation, not solved in Phase 1c: no Linear snapshot/history
model exists, and none is proposed here. Do not claim otherwise.

## Protected areas — confirmed untouched (all three phases)

`lib/forecast/simulate.ts`, `lib/forecast/portfolio.ts`,
`lib/capacity/resolve.ts`, `lib/scenario/` (`ScenarioInputDelta` and all),
`lib/momentum/`, and every Portfolio Instrument component are
byte-for-byte unchanged (verified by diffing against the Phase 1a commit
before Phase 1b started, and again against the Phase 1b commit before
Phase 1c started). `lib/forecast/compute.ts` gained exactly one additive
field (`breakdown.capacityBasis`) via an already-existing internal helper
— no simulation math, no capacity-resolution semantics, touched.

## Contract revisions, and package identity

`SUPPORTED_PACKAGE_VERSIONS = ["1.0", "1.1"]`. The version a producer sends is
**preserved**, not normalised to Signal's own constant — so it takes part in
`contextHash`, which is what makes a revision a real identity change rather
than a cosmetic one.

| | |
|---|---|
| `1.0` | sources, evidence, derivedClaims, completeness, warnings |
| `1.1` | adds `intelligenceObjects`, `intelligenceRelations`, `intelligenceMeta` and the producer field vocabulary they arrive in |

A 1.1 package carrying no intelligence is a 1.0 package with a different
version string, and is accepted as one. An unrecognised revision is still
refused.

### Why this exists

A producer that derives `packageId` from the content it sends mints the **same
id for the same corpus forever** — correctly, because that is what
content-addressing means. But an id is only as good as the contract it was
consumed under.

The first production handshake proved the point. The package was accepted and
a snapshot was written, by a build whose validator had **no knowledge of the
intelligence fields** and rebuilt the package from the fields it did know.
Replaying that exact file through that exact validator:

```
intelligenceObjects  : DROPPED
intelligenceRelations: DROPPED
intelligenceMeta     : DROPPED
contextHash          : 05881cbe5db1c70b   (this build: 479f99e42a351198)
```

Resending those bytes after deployment would not be a retry. Signal's identity
rule — `@@unique([producer, packageId])` plus a `contextHash` comparison —
would see the same id resolve to different content and raise
`PackageIdentityConflictError`. **That is the rule working**, and the id is
correctly spent: it belongs to the ingestion that consumed it.

### What the producer must change

One thing, and it is semantic rather than cosmetic:

1. emit `version: "1.1"`
2. **include that version string in the content hash `packageId` is derived
   from**

Then `same corpus + same contract → same packageId` still holds, and
`same corpus + new contract → new packageId` follows from what actually
changed. No salts, no clock, no padding — none of which say anything true.

## Next phases (not started)

- **A real Notion/Figma/spreadsheet-connector package assembler.**
- **Hermes wiring** — a real push using this exact same
  `ProjectContextPackage` contract, unchanged, plus an eventual pull path.
- **Source-supersession recommendations** — a computed (never
  auto-applied) "this source appears obsolete" suggestion.
- **Automatic staleness-triggered refresh**, once the envelope's
  now-visible staleness signal has a real consumer to act on it.
- **Linear historical snapshotting**, if the negative-provenance
  limitation above ever becomes a real product need.

All designed or flagged in the architecture assessments and phases that
preceded this document; none built.

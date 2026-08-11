# ROADMAP

Read this file, then continue. v0 (Audit + Decisions), V1 (Forecast, with
AI estimation + Notion + Figma), and V3 (Reports) are built and deployed.
Timeline (V2) is the one piece left from the original plan -- deferred on
purpose since Reports was the actually-needed leadership deliverable.
The shared capacity pool + portfolio forecasting work (Phases 1-3, plus a
post-review bug fix), design language + momentum, scopes-editing + Nav
fix, portfolio scenario Lever 1 + two live bug fixes, the scenario
foundation refactor, and the capacity-scenario correctness fix are all
merged into the base branch (`claude/product-timeline-audit-a72dmg`,
HEAD `46812f0`) -- see "Where things stand" for the full history. Phases
4-6 (provenance badges, MCP server, outbound webhook) and Scenario Levers
2-4 (context-switch/focus toggle, dependency-relief preview, scope-cut)
are planned but not yet approved to start.

**Context Package Foundation, Phase 1a + 1b** (see `docs/CONTEXT-MODEL.md`),
on branch `claude/gap-app-context-sources-hwy0v3`, cut from base at
`45d4312`. Phase 1a: foundation-only groundwork for a future evidence/
provenance layer under Reality (`ProjectContextPackage` transport contract,
`SourceRegistration` tracking-policy table, immutable `ContextSnapshot`
table, nullable provenance fields on `Finding`/`Report`), nothing wired in.
Phase 1b: hardened that foundation (strict rejection of malformed packages,
referential integrity, identity-collision detection) and wired ONE real
ingestion/provenance path end to end through `POST /api/refresh` and
`runAudit()`, proved with a synthetic JSA-Infrastructure-Alignment-tracker
package. Still not Hermes integration. `/portfolio` and Momentum remain
byte-for-byte unchanged. **Not yet merged, not yet clicked through by
Nic** -- do not resume Phase 1c or merge without checking recent
conversation history first.

**Portfolio Instrument Surface** (see `docs/PRODUCT-VISION.md`,
`docs/DESIGN-NORTH-STAR.md`), on branch `claude/portfolio-instrument-
surface`, cut from base at `46812f0`. Replaces `/portfolio`'s vertically-
isolated release-date cards and opaque "+1/+2 developer" buttons with a
single dark "Instrument" surface (Forecast Canvas on one shared axis,
explicit Capacity Control, persistent contextual Inspector, Commit/
Discard footer) presenting the same, already-correct Reality/Scenario/
Forecast plumbing from the two merged phases above. No forecast math, no
schema, and no commit semantics changed -- presentation and a display-only
capacity-number bug fix only (see "Where things stand" below). **Not yet
merged, not yet clicked through by Nic** -- do not resume this work or
merge without checking recent conversation history first.

## Where things stand

- **Context Package Foundation, Phase 1a (branch
  `claude/gap-app-context-sources-hwy0v3`, cut from base `45d4312`, not yet
  merged)** -- followed a two-part architecture assessment (a full
  repository/data-flow audit of every existing context-like mechanism --
  Linear, Notion/Figma, the audit `Source`/`Finding` pair, Reports,
  uploads -- then a Source Lifecycle/Context Package reconciliation) that
  is not reproduced in this file; `docs/CONTEXT-MODEL.md` documents what
  actually shipped. The core finding driving this phase: the app's
  evidence system is three unrelated pipelines that each discard
  provenance at the point of consumption, except the audit `Source`/
  `Finding` pair, which already has a working evidence-quote-to-claim
  pattern worth generalizing rather than duplicating.

  Four new/extended pieces, all additive: (1) `ProjectContextPackage` v1
  (`lib/context/package.ts`) -- a versioned transport contract with its own
  `packageId`/`producer` identity (independent from any local Gap App id,
  so a retried push can be detected safely), a source manifest whose
  `observedAt` reflects when a source was *actually* read from origin
  (never bumped by a cache hit -- a cache hit is not a new observation, a
  standing product rule this phase treats as load-bearing), itemized
  `EvidenceItem[]` (not one flattened prompt string) with a generic
  `data?: Record<string, JsonValue>` field so structured sources (a
  spreadsheet row's columns) survive as structured data, and an optional
  `derivedClaims[]` field for Hermes-derived understanding that is
  deliberately inert transport data in this phase -- nothing reads or acts
  on it, and it must never silently become a Finding. Validated by
  `lib/context/validate.ts`, hand-rolled in the same style as the existing
  `lib/audit/normalize.ts` (no new dependency); hashed deterministically by
  `lib/context/hash.ts` (same sha256-truncated convention as
  `lib/estimate/context.ts`'s existing `contextHash`, with canonical key
  sorting so key order never changes the hash). (2) `SourceRegistration` --
  a Prisma model for tracking POLICY, independent of content: five-state
  lifecycle (`candidate`/`active`/`paused`/`superseded`/`retired`), `role`
  kept fully independent of `status` (a source can stay active while its
  role changes from `operational_tracker` to `supplemental_context`),
  `scopeIds String[]` (empty = portfolio-wide, mirroring `Scope.
  projectNames`' own convention rather than a join table), and an
  unambiguous `supersededByRegistrationId` FK (never a free-text label
  standing in for an id). Linear itself is deliberately never registered --
  it stays a structural source via `Scope.projectNames`/`teamKey`, since
  editing those fields already is Linear's own retirement mechanism.
  Minimal CRUD API (`GET/POST /api/source-registrations`,
  `PATCH /api/source-registrations/:id`) -- any status change requires a
  non-empty `statusReason`, enforced server-side, so there is no silent,
  reason-less status change from any caller, human or an eventual approved
  Hermes action. (3) `ContextSnapshot` -- one immutable, frozen package
  instance per accepted package, created ONLY by
  `lib/context/snapshot.ts`'s `persistContextSnapshot()`, idempotent by a
  real `@@unique([producer, packageId])` constraint (a retried push returns
  the existing row, `reused: true`, rather than duplicating it). Nothing
  calls this function from any existing route yet -- an ordinary
  `/forecast` page load still never writes to the database on account of
  context, exactly as before this phase. A `FetchRecord`-style append-only
  table (considered in the preceding architecture discussion) was
  explicitly rejected once `ContextSnapshot` existed: live freshness is
  already reported in-memory per package assembly, and a *meaningful*
  observation is exactly what a snapshot already is. (4) `Finding` gained
  nullable `contextSnapshotId`/`evidenceRefs String[]`; `Report` gained
  nullable `contextSnapshotId` -- deliberately a single FK, not a parallel
  `sourcesUsed` JSON manifest (an earlier draft of this design proposed
  that and was corrected before implementation, since a Report referencing
  the snapshot that fed it is strictly better than a Report duplicating the
  snapshot's own manifest).

  Verified against real local Postgres (temp script, `npx tsx`, deleted
  after passing per this repo's standing testing discipline): a
  JSA-Infrastructure-Alignment-shaped package (evidence items
  `infra-row-13`/`infra-row-10` with structured `data` fields matching a
  real spreadsheet's columns, a `derivedClaim` citing both an evidence item
  and a non-evidence reference, a source manifest entry with `observedAt`
  four minutes before `package.generatedAt`) round-trips through
  `persistContextSnapshot()` -> `getContextSnapshot()` with every field
  intact, including a deliberately malformed evidence item (missing `id`)
  correctly dropped rather than accepted; retrying the identical
  `(producer, packageId)` returns the same row with zero duplicate rows
  created; registering the source, attaching a `Finding` to the resulting
  snapshot, then marking that `SourceRegistration` `superseded` with a
  `statusReason` afterward, followed by re-reading the ORIGINAL snapshot,
  confirmed its embedded source-manifest entry still reads `"active"` --
  historical immutability holds structurally, not just by convention; a
  plain old-style `Finding`/`Report` created with no snapshot reference
  round-trips with `contextSnapshotId: null`/`evidenceRefs: []` exactly as
  every pre-existing row does; a malformed top-level package (missing
  `packageId`/`generatedAt`/`scopeId`) is rejected via
  `PackageValidationError` rather than silently accepted. Migration
  inspected before applying: purely additive (two new tables, two new
  nullable columns, all new foreign keys `ON DELETE SET NULL` or on a new
  table) -- no existing data touched, no backfill required, confirmed by
  running it against a fresh copy of every prior migration in sequence.
  `npx tsc --noEmit`, `npx eslint .`, `npm run build` all clean.

  **Not done, not started, explicitly out of scope for this phase**: any
  wiring into `/api/refresh`, `runAudit()`, `generateReport()`, or
  `computeForecast()`; a `ProjectIntelligenceEnvelope` type or endpoint; a
  Notion/Figma package assembler (only the manual/test construction path
  has been exercised); portfolio-wide (multi-scope) snapshot semantics;
  any UI; automatic `Finding` creation from a package's `derivedClaims`;
  cross-source conflict detection; an obligation/entity-resolution layer
  (deliberately left buildable-later via `Finding.evidenceRefs` staying
  stable, not solved now). `lib/forecast/simulate.ts`,
  `lib/forecast/portfolio.ts`, `lib/capacity/resolve.ts`,
  `lib/scenario/inputDelta.ts`, and `lib/momentum/` are confirmed
  byte-for-byte unchanged. **Not yet merged, not yet clicked through by
  Nic** -- do not merge without an explicit instruction to do so.

- **Context Package Foundation, Phase 1b (same branch, built on Phase 1a,
  not yet merged)** -- hardened Phase 1a's foundation, then proved one
  real ingestion/provenance path end to end. Three invariants corrected
  before any wiring, per explicit review: (1) **never silently drop
  evidence** -- `lib/context/validate.ts` rewritten from "drop a malformed
  entry, keep the rest" to strict: any structural problem anywhere in
  `sources[]`/`evidence[]`/`derivedClaims[]` rejects the WHOLE package
  (`PackageValidationError`, naming the exact entry/field), since "we
  received a blocker but couldn't parse it" must never quietly become
  "there was no blocker." Referential integrity added at the same
  boundary: every `evidence[].sourceRef` must resolve to a `sources[]`
  entry, every `derivedClaims[].evidenceRefs` entry must resolve to a real
  `evidence[].id`, evidence/claim ids must be unique within the package --
  no dangling pointer reaches an immutable snapshot. (2) **identity
  collision, not silent overwrite** -- `persistContextSnapshot()` now
  hashes the incoming package BEFORE checking `(producer, packageId)`:
  same id + same hash reuses the existing row (unchanged from 1a); same id
  + DIFFERENT hash throws `PackageIdentityConflictError`, leaving the
  original untouched and creating no second row -- `packageId` is
  supposed to identify immutable content, so a differing payload under the
  same id is a real, throwable error. (3) **scope match enforced at
  persistence** -- `persistContextSnapshot(pkg, { expectedScopeId })`
  throws `PackageScopeMismatchError` on mismatch, defense-in-depth against
  an ingestion boundary attaching a package to the wrong Scope.

  **The bigger finding**: making `Finding.sourceId` nullable (needed so a
  package-derived Finding never requires a fabricated `Source` row) had a
  real blast radius, traced before any schema change per explicit
  instruction rather than assumed safe. Three places found "this Scope's
  Findings" exclusively via the Finding→Source relation --
  `lib/forecast/compute.ts`'s `buildScopeSimInputs()` (the forecast's own
  Finding query), `lib/estimate/runForScope.ts` (the AI estimator's
  un-ticketed-findings query), and `lib/audit/run.ts`'s own "don't
  re-raise a handled finding" guard -- all three would have made a
  package-derived Finding silently invisible everywhere that mattered had
  the query not changed. Fixed identically in all three:
  `where: { source: { scopeId } }` -> `where: { OR: [{ source: { scopeId
  } }, { contextSnapshot: { scopeId } }] }`. Also fixed:
  `POST /api/findings/:id/ticket` (resolves Scope via
  `finding.source?.scope ?? finding.contextSnapshot?.scope`, writes an
  honest provenance line into the created Linear issue either way) and
  `/decisions`/`DecisionQueue.tsx` (renders a plain label instead of a
  broken link when a decision Finding has no `Source`). `AuditRun.sourceId`
  made nullable too (a loose string reference, not a real Prisma relation,
  zero other consumers found). Migration inspected: purely constraint-
  relaxing (`DROP NOT NULL` on two columns, one FK's `onDelete` changed to
  `SetNull`) -- no data loss, no existing row altered.

  **Wired**: `POST /api/refresh` additively gained an optional
  `contextPackage` field -- every existing caller that omits it gets
  exactly today's behavior, unchanged. When present: validated strictly
  and scope-checked (`400` on either failure), an identity conflict maps
  to `409`, and on success exactly ONE `ContextSnapshot` is persisted at
  the request boundary -- the sole call site for `persistContextSnapshot()`
  in the whole codebase -- with the resulting id threaded as a parameter
  into `runAudit()` and `generateReport()`, neither of which persists a
  second snapshot for the same accepted package. The audit now runs
  whenever a transcript OR an accepted package is present (previously
  transcript-only) -- a package-only refresh with no pasted transcript is
  a real, supported call shape. `runAudit()`'s `input` parameter is now
  optional; `lib/audit/prompts/audit-v1.ts`'s `buildAuditPrompt()` renders
  package evidence as its own block (each item shown with its stable `id`
  and structured `data`, never flattened into the transcript string) and
  instructs the model to cite ids back in a new `evidenceRefs` output
  field; `lib/audit/normalize.ts` parses it defensively. `runAudit()`
  intersects whatever the model returns against the real evidence-id set
  before writing anything -- a hallucinated id can never survive into a
  `Finding.evidenceRefs` array -- and only sets `contextSnapshotId` on a
  Finding whose cited refs actually survive that intersection, so
  "package-derived" (`contextSnapshotId` set, `evidenceRefs` non-empty)
  stays a precise, checkable claim even in a mixed run that also had a
  transcript.

  **Proved end to end** with a synthetic package modeled on the real JSA
  Infrastructure Alignment tracker (`infra-row-10` "Terraform + Safety
  infra deployed," `infra-row-13` "BLOCKER -- GitHub/VPN access," both
  with real structured fields -- bucket/owner/effortEstimate/dueDate/
  confidence/status/dependsOn): package accepted -> exactly one
  `ContextSnapshot` -> `runAudit()` against Linear (`KIT_DEV_FIXTURES=1`,
  this repo's own existing offline stand-in -- confirmed the fixture team's
  tickets genuinely contain no VPN/GitHub work) with the LLM call
  substituted via `runAudit()`'s existing `options.complete` injection
  point (same dependency-injection pattern `lib/notion.ts`/`lib/figma.ts`'s
  `fetcher` parameter already uses) for a fixed, deterministic response,
  since no `ANTHROPIC_API_KEY` exists in this sandbox -- clearly flagged as
  mocked, not claimed as a live model verification -> one `missing_work`
  Finding produced with `sourceId: null`, `contextSnapshotId` set,
  `evidenceRefs: ["infra-row-13"]` -> the full chain (Finding ->
  `ContextSnapshot` -> `EvidenceItem` -> source manifest entry ->
  `SourceRegistration`) walked and verified end to end ->
  `computeForecast()` picked the Finding up through the pre-existing
  unticketed-Finding path with zero special-casing (`unticketedFindingCount`
  +1, `remainingIssueCount` -- the Linear-derived count -- unchanged, no
  double count confirmed on a second read) -> `generateReport()` produced
  a Report whose `contextSnapshotId` matches the same snapshot. Also
  proved: marking the `SourceRegistration` `superseded` afterward changes
  nothing about the already-persisted snapshot (its embedded source-
  manifest entry still reads `"active"`) or the Finding's provenance, and
  does not auto-resolve the Finding -- historical immutability and "no
  silent auto-reconciliation" both hold under a real state transition, not
  just by inspection. Legacy Source-backed Findings and old-style
  snapshot-free `Finding`/`Report` rows confirmed unaffected throughout.

  Verified via a temp script (`npx tsx`, `KIT_DEV_FIXTURES=1`, deleted
  after passing) covering all of: strict rejection of malformed evidence,
  duplicate evidence ids, a `derivedClaim` citing a nonexistent evidence
  id, evidence pointing at an unknown source, idempotent same-hash retry,
  rejected different-hash retry (original snapshot proven untouched),
  scope-mismatch rejection, the one-snapshot-per-package invariant,
  structured-data round-trip, and every step of the end-to-end chain above.
  `npx tsc --noEmit`, `npx eslint .`, `npm run build` all clean; diffed
  against the Phase 1a commit to confirm `lib/forecast/simulate.ts`,
  `lib/forecast/portfolio.ts`, `lib/capacity/resolve.ts`, `lib/scenario/`,
  and `lib/momentum/` are byte-for-byte untouched.

  **Not done, not started, explicitly out of scope**: real Hermes
  integration (every proof used a synthetic package), real KE wiki access,
  a Hermes pull path, `ProjectIntelligenceEnvelope`, Context Workbench UI,
  a Notion/Figma/spreadsheet-connector package assembler, automated Linear
  reconciliation (superseding a source never auto-resolves a Finding),
  entity/obligation matching across sources, portfolio-wide snapshot
  semantics, source-supersession recommendations (the human-approved
  status-transition write path is the only mutation path that exists).
  **Not yet merged, not yet clicked through by Nic** -- do not merge
  without an explicit instruction to do so.

- **Portfolio Instrument Surface (branch `claude/portfolio-instrument-
  surface`, cut from base `46812f0`, not yet merged)** -- Phase 2 of the
  Reality/Scenario/Forecast product direction the scenario-foundation
  refactor was groundwork for (see `docs/PRODUCT-VISION.md`): the first
  visual/interaction pass built specifically around that model, on top of
  already-correct plumbing rather than alongside a redesign of it.
  Explicitly presentation-layer work -- `lib/forecast/simulate.ts`,
  `lib/forecast/portfolio.ts`, `resolveCapacity`, `applyScenarioInputDelta`,
  the Prisma schema, the dependency model, target-date computation, and
  `save()`'s commit rules are all byte-for-byte unchanged (one narrow,
  justified exception below).

  **What changed on `/portfolio`**: the "Release dates" card (per-scope
  isolated rows *or* an overlay-toggle combined view) and the separate
  "Portfolio insights" card are replaced by one `ForecastCanvas`
  (`components/portfolio/ForecastCanvas.tsx`) -- every Scope on one
  shared axis by default, no toggle, since overlay was always the more
  legible mental model. Each row: name + clickable "depends on X" badge,
  likely date + delta + confidence-at-target, and a band track (P10-P90 /
  P50-P85 / P50 dot / dashed target marker) using the exact
  `SimulationResult.percentiles` already computed -- no new statistics.
  When a Scenario is active, Reality renders as a muted ghost tick next to
  the now-violet Scenario position on the SAME row, not just as caption
  text; position changes transition over 150-300ms
  (`transition-[left,right] duration-200`), collapsed to near-zero under
  `prefers-reduced-motion` (new `.instrument` rule, `app/globals.css`).

  New `components/portfolio/ScenarioInspector.tsx` is the persistent
  right-rail: selected-scope header (big date, violet when dirty, delta,
  per-scope momentum), a `CapacityControl` (Reality FTE / Scenario FTE /
  `[-] +N.0 FTE [+]` / Reset -- replaces the old opaque "+1/+2 developer"
  buttons, which still exist as secondary "+2 quick add" shortcuts that
  now visibly update this same control instead of firing invisibly), a
  `TargetControl` (the pre-existing `TargetDateLever` logic moved here
  verbatim and restyled -- semantics, including zero re-simulation on
  edit, untouched), an "Effect on portfolio" dependents list, a "Why"
  section, and an "Ask Hermes" section. The "Why" prose comes from a new
  pure module, `lib/portfolio/explain.ts` (`explainScope`) -- zero LLM
  calls, built entirely from data already in the browser (deltas,
  dependency relationships, active capacity/named-transfer changes) --
  checked FIRST, per the standing simple-surface/deep-on-demand and
  no-LLM-in-the-simulation-path rules. Only after that does the Inspector
  offer Hermes (`AskChips`, reused verbatim via a CSS-variable-shadowing
  adapter class `.instrument-ask` rather than forking the component),
  with an explicit, honest caption that `/api/forecast/ask` answers about
  the current *saved* forecast and has no visibility into the unsaved
  Scenario -- confirmed by reading the route in full before writing that
  caption, not assumed.

  New `components/portfolio/InstrumentFooter.tsx`: a violet scenario-chip
  summary row, the exact pre-existing "Saving this will..." truth-model
  warnings (aggregate-capacity conversions, blocked named transfers,
  same wording) retitled "Committing this will:", and
  **`[ Commit changes ]` / `[ Discard ]`** -- "Commit changes," not "Save
  Scenario," per explicit instruction: this action still writes straight
  into Reality and no saved-scenario object exists yet, so "Save Scenario"
  would imply a feature that isn't built. Both buttons call the exact
  pre-existing `save()`/`discard()` functions, unmodified.

  A toplevel toolbar states `CURRENT` / `SCENARIO · UNSAVED` in **text**
  (never color-only, for screen-share legibility) plus a compact
  active-scenario summary ("Platform +1.0 FTE") when dirty.  The old,
  detailed per-person allocation grid (sliders, over-allocation/
  unallocated warnings, Remove) is fully preserved, logic untouched, and
  relocated into a collapsed `<details>` "Per-person allocation detail"
  section in the original light Workbench styling below the dark
  Instrument -- deep-on-demand rather than deleted or redesigned.
  `app/portfolio/page.tsx` widened to `max-w-[1440px]` (was `max-w-5xl`)
  and its heading/copy updated to describe the new primary interaction.

  **One real bug found and fixed during verification, in-scope and
  narrow**: `capacityByScope` (the memo powering both the Inspector's
  "Scenario" FTE number and the per-person grid's "Effective capacity"
  row) called `resolveCapacity` directly instead of mirroring
  `applyScenarioInputDelta`'s capacity-source branch -- for an
  explicit/inferred scope with a scenario-added ghost, it displayed only
  the ghost's own contribution (e.g. "1.0 FTE") instead of the aggregate
  baseline plus that contribution (correctly "5.0 FTE," what the
  simulation actually uses). Same bug class as the capacity-scenario fix
  this phase explicitly preserves, just re-surfaced in a *display* number
  the new Capacity Control now makes load-bearing rather than in the
  simulation itself -- fixed by branching `capacityByScope` on
  `capacitySource` exactly like `applyScenarioInputDelta` already does,
  using only the same already-approved `resolveCapacity` primitive.
  `resolveCapacity`, `applyScenarioInputDelta`, `simulate.ts`, and
  `portfolio.ts` remain completely untouched; this is a one-memo fix in
  `PortfolioPageClient.tsx`, the same file already being rewritten this
  phase.

  **Verified**: `npx tsc --noEmit`, `npx eslint .`, `npm run build` all
  clean. Since `GET /api/portfolio/inputs` needs live Linear data (a
  server-side call this sandbox can't reach, confirmed by reading
  `lib/forecast/compute.ts`'s "throws on Linear failure" comment -- unlike
  the app's own client-side fetches, `page.route()` cannot intercept it),
  end-to-end verification used a Playwright fixture engineered to
  reproduce the exact STRUCTURAL pattern from the motivating real bug
  report -- Platform (aggregate capacity) with iTrack depending on it at
  negligible own effort (fully tracks Platform) and JSA depending on it at
  large own effort (own constraint always dominates, provably never moves
  when Platform's capacity changes, by construction of the fixture's
  margins) -- with all mutating routes (`/api/allocations`,
  `/api/people`, `/api/scopes/:id`, `/api/portfolio-settings`) also mocked
  so Commit could be exercised with zero database writes. Dates produced
  are synthetic fixture output, not the real Sep/Oct 2026 production
  dates from the bug report -- an explicit, honest substitution forced by
  the sandbox's Linear restriction. 44 assertions, all passing, covering:
  baseline render (including the dependency-badge presence and the
  structural iTrack-tracks-Platform / JSA-independent pattern before any
  interaction); selecting a scope and reading Reality/Scenario capacity;
  the exact acceptance case (+1 FTE on Platform moved Platform AND iTrack
  the identical number of days earlier, JSA showed the literal text
  "no change," a Reality ghost tick appeared at the old date, zero
  additional `/api/portfolio/inputs` or `/preview` network calls fired --
  confirming the client-only resimulation path); decrement returning both
  affected scopes exactly to Reality; `+2 quick add` then Reset; clicking
  a dependency badge re-targeting the Inspector; editing the target date
  firing no new simulation network call while still updating the
  probability field; the Commit warning text and the resulting PATCH body
  (`teamCapacity: 5`, exactly Reality's 4 plus the scenario's 1); Discard
  fully reverting date and toolbar state; Enter-key row selection;
  `prefers-reduced-motion` collapsing the measured `transitionDuration` to
  effectively zero; and byte-identical dates across a full page reload
  (same fixed `FORECAST_SEED`, confirming no determinism regression).
  Screenshots taken at each major state for visual QA against the design
  brief's bar -- confirmed the warm Workbench shell survives unchanged
  around the dark Instrument, the semantic color rules hold (violet
  active-scenario, mint favorable delta, amber commit warning), and there
  is no dashboard-card proliferation or DAW-chrome regression.

  **Not done, not started, explicitly out of scope for this phase**: the
  Resource Mixer, saved A/B/C/D scenario persistence, any new forecast
  math, Scenario Levers 2-4, and any change to
  `lib/forecast/buildScenarios`. `components/Nav.tsx`'s sidebar still
  reads bare "KIT" -- pre-existing UI text, not touched by this phase's
  naming convention (see `docs/PRODUCT-VISION.md`), flagged rather than
  silently changed since relabeling app-wide navigation wasn't requested.
  **Not yet merged, not yet clicked through by Nic** -- do not merge
  without an explicit instruction to do so.

- **Scenario foundation and the capacity-scenario correctness fix are
  merged** (branch `claude/scenario-input-delta`, fast-forward merge into
  `claude/product-timeline-audit-a72dmg`, base HEAD now `46812f0`) --
  Nic's production click-through approved both; see the two entries
  immediately below for what shipped. `claude/portfolio-scenario-levers`
  (Lever 1 + two bug fixes) is folded into base along with it, since
  `claude/scenario-input-delta` was cut from its HEAD.

- **Scenario foundation Phase 1 (branch `claude/scenario-input-delta`, cut
  from `claude/portfolio-scenario-levers`, not yet merged)** -- an
  architectural assessment (not build work) established that the product
  is evolving toward an explicit Reality / Scenario / Forecast model (a
  "delivery-simulation instrument," per the north-star brief that drove
  this), and that most of the hard part already exists correctly:
  `runPortfolioSimulation` (`lib/forecast/portfolio.ts`) already takes
  arbitrary `ScopeSimulationSpec[]` and doesn't care whether they came
  from saved data or a hypothetical. What didn't exist was a *name* for
  "Reality + a hypothetical change" -- that concept lived as two
  independently hand-maintained implementations: `PortfolioPageClient.tsx`'s
  local `specsFor()` (driving the live drag preview) and
  `POST /api/portfolio/preview`'s inline spec-building (server-side,
  unreachable from the browser, already quietly diverged from the client's
  version -- different hypothetical-person id schemes, no target-date
  handling). This phase named it (`ScenarioInputDelta`,
  `lib/scenario/inputDelta.ts`) and reduced it to one implementation
  (`applyScenarioInputDelta`), used by both call sites. Also extracted the
  previously-inline `deltaDays` arithmetic (duplicated three times across
  the client's two render call-sites and the preview route's response
  building) into `compareToBaseline` (`lib/scenario/compare.ts`) --
  deliberately narrow, no confidence-delta field, since confidence is only
  meaningful relative to an explicit target date.

  **Deliberately excluded from this type**: target date. It's an
  output-side/evaluation lever (a pure percentile/confidence read against
  an already-simulated `completionDaysSorted` array, via
  `confidenceAtDay`/`percentileDay` in `lib/forecast/simulate.ts`), not an
  input the engine needs to re-run for -- `TargetDateLever` is untouched
  and still bypasses `ScenarioInputDelta`/`applyScenarioInputDelta`
  entirely, confirmed via Playwright to trigger zero network calls when
  edited. Keeping the type this narrow leaves room for a future
  `Scenario = ScenarioInputDelta + Evaluation + Metadata` composition
  (needed for saved scenarios like "September 15 Plan" to remember their
  own target without implying a target change reruns Monte Carlo) --
  see `docs/SCENARIO-MODEL.md` for the full writeup, including what this
  foundation deliberately does NOT build yet (no saved/named scenarios, no
  undo/redo, no A/B/C/D slots -- all future work).

  Zero Prisma schema changes. `lib/forecast/simulate.ts`,
  `lib/forecast/portfolio.ts`, `lib/capacity/resolve.ts`,
  `lib/forecast/scenarios.ts`/`buildScenarios`, `ForecastView.tsx`, and
  the interaction-layer state shape (`fractions`/`ghosts`/`switchCostPct`,
  each its own `useState` for cheap point updates on a drag frame) are
  all untouched, per explicit instruction. Verified: a fixture regression
  script proved `applyScenarioInputDelta`'s output is numerically
  identical to both old implementations across every capacity-source rung
  (allocations / explicit / inferred-fallback), a hypothetical-person
  case, and a dependency chain (a scope depending on two others) -- both
  as raw `ScopeSimulationSpec[]` equality and as identical
  `runPortfolioSimulation` output (`completionDaysSorted`, `likelyDate`).
  A live-server check confirmed `POST /api/portfolio/preview`'s
  validation (invalid body, duplicate pair, unknown person, over-
  allocation) is byte-identical to before, and that a valid request still
  reaches the same Linear-blocked 502 at the same point. A real-browser
  Playwright run against `/portfolio` (with `GET /api/portfolio/inputs`
  mocked, the same pattern used for every prior Portfolio verification
  this session) confirmed: dragging a scope's own allocations down moved
  its displayed date later (Sep 14 -> Oct 19, +35d) and its dependent
  scope moved by the *identical* +35d in the same live drag -- the
  lockstep correlation survived the refactor end to end, not just in
  isolated fixtures. `npm run build`, `npx eslint .`, and `npx tsc
  --noEmit` all clean.

  **Not done, not started, and explicitly out of scope for this phase**:
  the visual/Instrument-Mode redesign, a Forecast Canvas, the resource
  mixer, saved A/B/C/D scenarios, target-seeking as its own lever, Hermes
  changes, and Scenario Levers 2-4 (context-switch toggle, dependency-
  relief preview, scope-cut). **Merged since**: approved after Nic's
  production click-through, fast-forward merged into
  `claude/product-timeline-audit-a72dmg` (base HEAD `46812f0`) alongside
  the capacity-scenario fix below. The visual/Instrument-Mode redesign and
  Forecast Canvas that were out of scope here are the Portfolio Instrument
  Surface entry at the top of this section.

- **Capacity-scenario correctness fix (same branch
  `claude/scenario-input-delta`, committed right after Phase 1, not yet
  merged)** -- found during Nic's own click-through of Phase 1: clicking
  "+1 developer" / "+2 developers" on `/portfolio` could push a scope's
  forecast *later*, and repeated clicks moved the date around
  non-monotonically (worse, then better, as more capacity was added).
  Investigated rigorously before any fix -- reproduced identically via
  pure-function calls AND a real browser on both `claude/portfolio-
  scenario-levers` and `claude/scenario-input-delta` (git-worktree
  checkouts of each, `node_modules` symlinked in, real local dev servers),
  and confirmed via byte-identical file diffs that `lib/capacity/
  resolve.ts`, `lib/forecast/portfolio.ts`, and the button-handler code
  are unchanged across base/scenario-levers/scenario-input-delta -- so the
  bug predates Phase 1 entirely and is live on the deployed base branch,
  not a regression this session introduced.

  **Root cause**: `resolveCapacity`'s fallback chain (allocations >
  explicit > inferred) is correct for authoritative Reality -- a scope is
  administered one way, never a blend -- but is mutually exclusive: the
  instant *any* allocation-shaped entry exists for a scope, the chain
  switches to "allocations" and computes *only* from that entry,
  discarding whatever aggregate baseline (explicit or inferred) was there
  a moment before. A hypothetical "+1 developer" click, or an existing
  real person's allocation moved in from another scope, is exactly such
  an entry. Concretely reproduced: a scope with `explicit=4`, click "+1
  developer" once -> capacity becomes 1 (not 5), pushing a same-day
  forecast from Sep 17 to Jan 11 (+116 days) from a single "add capacity"
  click; five cumulative clicks were needed just to break even with the
  original baseline.

  **Two more architecture passes preceded the fix**, both explicitly
  requested by Nic before any code changed: the first established the
  Reality/Scenario boundary (`resolveCapacity` stays unchanged; scenario
  application must resolve Reality's authoritative capacity first, then
  add scenario-only effects on top, never blend all available sources).
  The second caught a real hole in that first design: partitioning by
  "real person vs. hypothetical person" (the natural-seeming axis) still
  reproduces the identical bug for an *existing real person* moved into
  an aggregate scope, and can't correctly combine a ghost and a real
  person landing on the same aggregate scope in one scenario. The
  corrected axis is the *destination scope's own Reality capacity
  source*, not contributor identity -- once conditioned on that, real vs.
  hypothetical turns out to be irrelevant to the capacity math and only
  matters for a separate question: commit eligibility.

  **What shipped**: `ScenarioInputScope` (`lib/scenario/inputDelta.ts`)
  gained one field, `capacitySource` (Reality's own source for that
  scope, fixed before the scenario is applied, populated from data both
  call sites already had). `applyScenarioInputDelta` branches on it:
  allocations-sourced scopes behave exactly as before (one
  `resolveCapacity` call against the full current allocation picture);
  explicit/inferred scopes preserve their resolved baseline untouched and
  add a second `resolveCapacity` call's contribution on top
  (`explicitTeamCapacity` forced to `null` so it can never itself resolve
  to "explicit," but still correctly switch-cost-adjusted against the
  full cross-scope allocation array). `resolveCapacity` itself, `simulate.ts`,
  and `portfolio.ts` are **completely untouched**.

  New `lib/scenario/namedTransfer.ts` (`detectNamedPersonMoves`) --
  deliberately minimal, answers exactly one question ("did this real
  person's allocation move, and can every touched scope represent that
  truthfully"), not a general workflow engine. Drives three approved
  product rules: (1) anonymous/net-new capacity is always committable --
  onto an allocations-sourced scope it still becomes a real
  `Person`/`Allocation` row (unchanged); onto an aggregate scope it's
  folded into a new `explicitTeamCapacity` via the existing `PATCH
  /api/scopes/:id`, **never** a fabricated `Person` row, deliberately
  converting that scope's source to `"explicit"` going forward. (2) A
  named real person's reallocation commits only when every scope they
  touch is allocations-sourced; if any touched scope is aggregate-sourced,
  their **entire** allocation set is excluded from that Save (both legs
  of a move, not just the aggregate-destination leg -- chosen as the
  atomicity boundary because "which legs belong to which transfer" isn't
  well-defined once a person has touched multiple scopes in one session,
  and the broader exclusion is strictly safer). (3) Preview is
  unrestricted either way -- it can honestly show a trade Reality can't
  yet persist, since Scenario answers "what if" and Reality answers "what
  do we actually know," and weakening Preview to match Reality's
  persistence limits would undo the point of separating them.
  `PortfolioPageClient.tsx`'s `save()` implements all three; a live
  "Saving this will..." summary (reusing the app's existing inline-
  message pattern, no new modal/design element) shows pending aggregate
  conversions and blocked named transfers *before* Save is even clicked,
  and a short post-save summary confirms what happened -- the explicit
  invariant "must never be silent" holds throughout.

  **Server-side invariant added as approved defense-in-depth**: `PUT
  /api/allocations` independently rejects (409) any write that would
  create the first-ever `Allocation` row on a scope with none today,
  regardless of caller -- one cheap `prisma.allocation` query (does this
  scope already have any row, checked against current pre-transaction
  state), no Linear dependency, no need to distinguish explicit from
  inferred (both are exactly "zero existing rows," which is all the check
  needs). Known trade-off, stated plainly in the route's own comment and
  in `docs/SCENARIO-MODEL.md`: this also blocks a legitimate one-shot
  "set up person-level tracking for this scope for the first time" write,
  since the check can't distinguish that from the same partial-write bug
  via a different call shape -- that capability doesn't exist via any
  path today and would need its own deliberate mechanism later.

  **Verified**: 14 pure-function fixture checks (`npx tsx`, deleted after
  passing) covering all three capacity sources, the mixed
  anonymous-plus-named case (Case 4: inferred 4 + anonymous 1 + real
  0.3 -> 5.3), named-move atomicity detection, determinism (identical
  specs -> identical `completionDaysSorted`), and dependency-chain
  preservation. Real-Postgres persistence tests via direct HTTP against a
  local dev server: valid writes to already-allocations-sourced scopes
  succeed unchanged; direct bypass writes to aggregate scopes correctly
  rejected with 409 and zero rows created; `PATCH /api/scopes/:id`
  conversions correctly leave zero `Allocation` rows and zero stray
  "New developer N" `Person` rows; a valid allocations-to-allocations
  named transfer commits and survives reload. Three real-browser
  Playwright runs against the actual `save()` flow with real persistence
  (not mocked beyond the one unavoidable Linear-blocked `GET
  /api/portfolio/inputs` call): the full blocked-named-transfer-plus-
  aggregate-conversion scenario end to end (summary text visible before
  Save, correct persisted state after -- Platform's explicit capacity
  became 5, Anders' JSA allocation stayed at 1.0 untouched, no iTrack
  allocation was created), the unaffected allocations-sourced happy path
  (a ghost still becomes exactly one real Person, capacity sums
  correctly, no summary block shown since nothing needs flagging), and
  Discard (zero network writes fired, state reverts exactly, confirmed
  directly against Postgres that nothing was ever persisted). `npx tsc
  --noEmit`, `npx eslint .`, `npm run build` all clean throughout.

  **Not done, not started, explicitly out of scope**: whether a ghost
  added to an *already* allocations-sourced scope should also stay
  anonymous instead of minting a "New developer N" `Person` row
  (evidence from the button's own UX strongly suggests it should, but
  it's a data-hygiene question, not a correctness bug -- flagged for a
  later pass); a deliberate "convert this scope to person-level tracking"
  mechanism; the resource mixer; any Hermes changes; Scenario Levers 2-4.
  **Merged since**: Nic approved both this fix and Phase 1 above after his
  production click-through; fast-forward merged into
  `claude/product-timeline-audit-a72dmg` (base HEAD `46812f0`). The
  visual/Instrument-Mode redesign that was out of scope here is the
  Portfolio Instrument Surface entry at the top of this section.

- **Shared capacity pool, Phase 1 of 3 (branch `claude/portfolio-
  capacity-pool`, not yet merged)** — the structural fix for a real bug:
  each Scope's `teamCapacity` was independent, so "hire 5, put 3 on JSA,
  1 on iTrack, 1 on Platform" had no way to be modeled without
  double-counting a person's hours across separate simulations. New
  `Person` (`id, name, fte, active`) and `Allocation` (`personId,
  scopeId, fraction` -- share of *that person's* time, unique per
  person+scope) models, plus a singleton `PortfolioSettings` row holding
  `contextSwitchCostPct` (0 by default -- a visible, user-set lever for
  the productivity cost of being split across scopes, never an inferred
  or baked-in number, same "no invented benchmarks" rule as Forecast's
  estimate math). `lib/capacity/resolve.ts` is pure and isomorphic (no
  Prisma import) since it's designed to run client-side too once the
  portfolio dashboard re-simulates on every slider drag (Phase 2/3):
  `resolveCapacity` implements stage 1 of the fallback chain
  (allocations -> explicit `Scope.teamCapacity` -> null), stage 2
  (null -> inferred from distinct Linear assignees) stays exactly where
  it already lived in `lib/forecast/build.ts` since it needs Linear
  issue data `resolveCapacity` doesn't have. `validateAllocations`
  rejects (never silently clamps) a person's fractions summing past
  1.0. `lib/forecast/compute.ts` loads people/allocations/settings and
  resolves capacity before calling `buildForecastInputs` -- **with zero
  `Person` rows (every existing Scope today), this is a proven no-op**:
  verified directly against real Postgres that the exact Prisma query
  shapes `compute.ts` uses return empty arrays and `resolveCapacity`
  degrades to `{capacity: null, source: null}`, letting
  `scope.teamCapacity` flow through completely unchanged. New CRUD
  routes: `POST/GET /api/people`, `PATCH/DELETE /api/people/:id`,
  `GET/PUT /api/allocations` (PUT does a full replace scoped to
  whichever people are named in the payload -- not the whole table --
  and validates before writing anything, so a rejected over-allocation
  never partially lands), `GET/PATCH /api/portfolio-settings`. Verified:
  41 fixture assertions on the pure capacity math (fractional splits
  across scopes summing to exactly the person's total with no double-
  count, unallocated capacity, the fallback chain's rungs, context-
  switch factor at 0% and 20% with a floor at 0.1x, `build.ts`'s new
  `capacitySource` field including explicit regression checks that the
  old call shape behaves identically) plus a 46-assertion live
  acceptance test against real local Postgres over real HTTP (the
  brief's own scenario: 3 people full-time on one scope, 1 on another,
  1 split 0.5/0.5 across two more, confirming the split person's total
  across every scope is exactly 1.0 -- never more -- and that over-
  allocation, negative fractions, and unknown person IDs are all
  rejected with no partial writes).

  Post-review fix: Nic's spot-check on whether `PUT /api/allocations`'
  `prisma.$transaction([...])` batch was a real atomic transaction (vs.
  an in-memory pre-check followed by unprotected writes) led to finding
  a real gap while confirming it -- a payload listing the same
  `(personId, scopeId)` pair twice hit the DB's unique constraint
  *inside* the transaction, uncaught, surfacing as a bare 500 with no
  error body (same failure class as the `/api/parse-spreadsheet` bug
  fixed earlier). Fixed with an explicit duplicate-pair check before the
  transaction (clean 400) plus a try/catch around the transaction itself
  as defense in depth. Reproduced the original bug live against real
  Postgres before fixing it, then proved the atomicity claim for real:
  a script calling `prisma.$transaction` directly (bypassing the route's
  new guard entirely) with a `deleteMany` followed by a guaranteed
  constraint violation confirmed the pre-existing allocation was still
  present afterward -- the `deleteMany`, despite running first in the
  batch, was rolled back along with the failed creates. Also confirmed,
  by re-running with explicitly named cases, that the switch-cost-at-0%/
  20% and `unallocatedCapacity` fixture coverage Nic asked about was
  real and not folded invisibly into an aggregate pass count.

- **Shared capacity pool, Phase 1.5 of 3 (branch `claude/portfolio-
  capacity-pool`, not yet merged)** — scope-level dependency gates, so a
  Scope depending on shared work (JSA/iTrack on Platform) reflects it in
  the actual Monte Carlo math instead of silently ignoring it once
  Platform becomes its own Scope. `Scope.dependsOnScopeIds String[]`
  (additive, defaults to `[]` -- true for every existing Scope).
  `lib/forecast/simulate.ts`'s `SimulationInput` gains
  `dependencySamples?: number[][]`: per trial, a random index is drawn
  from each dependency's own (already-simulated) sorted completion-days
  array (empirical bootstrap), and this scope's day for that trial
  becomes `max(own, every drawn dependency day)` -- "can't finish before
  what you depend on finishes," the same idea as `DecisionGate`'s serial
  delay, applied at scope granularity. Absent/empty `dependencySamples`
  is provably a no-op (the loop simply doesn't run), and `SimulationResult`
  gains `completionDaysSorted` + `percentiles` (p10/p50/p70/p85/p90) as
  pure additions -- existing fields' *values* are computed identically to
  before. New `lib/forecast/portfolio.ts` (pure, no Prisma) topologically
  orders a set of Scope simulation specs and runs each one exactly once,
  threading a shared dependency's samples into every scope that depends
  on it -- so a diamond (two products both depending on Platform) draws
  from one simulated Platform, not two independently-simulated copies of
  it. Throws `DependencyCycleError` (naming the exact cycle) or
  `MissingDependencyError` rather than looping forever or silently
  mis-ordering. `lib/forecast/compute.ts` branches on
  `dependsOnScopeIds.length`: **a Scope with no dependencies takes the
  exact pre-1.5 code path, byte-for-byte** (verified: bit-identical
  `completionDaysSorted` between calling `runSimulation` directly and
  going through the single-node `runPortfolioSimulation` path, same
  seed); only a Scope that explicitly opts in takes the new
  `collectDependencyClosure` (BFS the transitive dependency graph via
  Prisma, throws a clear error on a dangling reference) ->
  `runPortfolioSimulation` branch. New: `POST/PATCH /api/scopes/:id`
  accepts `dependsOnScopeIds` (self-reference rejected at write time;
  a longer cycle is legal to *write* but caught at simulate time by
  `portfolio.ts` -- verified directly: constructed a real 2-cycle via two
  PATCH calls and confirmed `runPortfolioSimulation` throws
  `DependencyCycleError` on it, not a silent bad ordering).

  Known, deliberate limitation: "Paths to a sooner date" scenario levers
  are **not yet dependency-aware** in either branch -- they still compute
  against a Scope's own items/gates/capacity only. Making the interactive
  levers (Phase 2) respect dependencies too is that phase's job, not
  this one's.

  Verified: 15 fixture assertions on `simulate.ts`'s extension (explicit
  regression cases proving `dependencySamples` absent/empty is bit-
  identical to before; a dominant dependency provably pushes every trial
  to at least its own value; multiple dependencies correctly take the
  max across all of them, not just the last one) plus 19 on
  `portfolio.ts` (the single-node case is bit-identical to calling
  `runSimulation` directly; a diamond dependency's two dependents are
  proven to draw from the exact same simulated shared-dependency array,
  not two separate copies of it; a direct cycle, a self-cycle, and a
  3-scope cycle all throw `DependencyCycleError`; a missing dependency
  throws `MissingDependencyError`) -- 34 total, all on the pure math, no
  DB or Linear involved. Plus 16 live assertions against real Postgres
  over real HTTP (self-reference and unknown-id rejection on the new
  PATCH field; a dependency persisting through a fresh GET, not just
  echoed back; deduping; **the regression proof that a 0-dependency
  Scope's `/api/forecast` call still hits the byte-identical
  Linear-blocked error this sandbox always produces**; confirmation that
  the dependency-aware branch also fails gracefully at the same Linear
  wall rather than crashing) and 7 more directly exercising
  `collectDependencyClosure` against real Scope rows (a real transitive
  A->B->C chain; a dangling dependency after its target was deleted,
  correctly throwing rather than crashing, since `dependsOnScopeIds`
  isn't a real foreign key; a real 2-cycle constructed via two PATCH
  calls, confirming closure-collection itself doesn't infinite-loop on it
  and that the actual safety net is `runPortfolioSimulation`'s cycle
  detection downstream, not closure collection). Full `npm run build` +
  `npx eslint` clean throughout; local Postgres confirmed back to its
  exact pre-test state after every verification pass.

  **Post-review correction: the dependency mechanism above was replaced
  before Phase 2 started.** Nic's spot-check ("in a single portfolio
  trial, do JSA and iTrack draw from the SAME Platform trial index, or
  does each independently resample?") surfaced that the bootstrap-
  resampling design described above does NOT model correlated risk --
  confirmed empirically, not just reasoned about: with realistically
  different-shaped dependent scopes (different item counts), only ~1.5%
  of sorted-position pairs matched across 5000 trials, and the ~27% that
  were "close" was a sorting artifact (small values cluster near the
  front of any ascending array), not real shared-scenario correlation.
  Root cause was structural, not an RNG detail: the old design ran each
  scope's FULL simulation to completion (all N trials, then sorted)
  before its dependents' simulations even began, so there was never a
  shared "trial i" concept across scopes to correlate in the first
  place -- and sorting would have destroyed trial identity even if
  timing weren't sequential.

  Replaced with a genuine **lockstep joint simulation**: a single outer
  loop of N trials shared across the whole dependency component;
  within each trial, scopes are processed in topological order and a
  dependency's day for THAT SAME trial is read directly out of the
  array being built for it, not re-sampled. `lib/forecast/simulate.ts`
  was split into two reusable pure primitives -- `sampleOwnDays` (one
  trial's own item/gate sampling, capacity-clamped) and
  `summarizeCompletionDays` (raw days array -> the full percentile/date
  summary) -- so `runSimulation` (standalone, single-scope) and the new
  `lib/forecast/portfolio.ts` (`runPortfolioTrials` for raw per-scope
  arrays, `runPortfolioSimulation` summarizing on top) share the exact
  same math instead of two competing implementations.
  `dependencySamples`/bootstrap-resampling was removed outright rather
  than left as dead code alongside the new mechanism.

  Verified with the same rigor as the original build, plus the two
  proofs Nic asked for specifically: (1) **the direct, non-aggregate
  proof** -- found a real trial (#2 in one run: Platform drew 407.0d
  against its own 366.5d p90) and confirmed JSA's and iTrack's values at
  that exact same trial index both showed 407.0d too, not an
  approximation -- then checked this holds across every one of 500+ bad
  trials in the run, not just the one cherry-picked example, plus a
  converse sanity check that a *good* Platform trial does NOT force
  dependents up (proving the relationship is conditional, not a
  constant floor); (2) **the diamond "computed once" proof, re-run
  under lockstep**, now strengthened to check exact per-trial value
  equality, not just aggregate stats -- both dependents equal the exact
  same shared value at every trial where it dominates their own small
  item, not two independent approximations of it. Both the no-dependency
  regression proof and the comparable-magnitude max-vs-add case from the
  original build were re-run against the new code and still pass.
  Mutation-tested the rewrite itself: patched `Math.max` to `+` in the
  new lockstep loop and confirmed exactly the two tests built to catch
  that bug class failed (the diamond exact-equality check and the
  comparable-magnitude case) while the other seven -- testing different
  properties like cycle detection and no-op regression -- correctly kept
  passing, then reverted and re-confirmed clean. Re-ran the same live
  Linear-blocked regression check against real Postgres to confirm
  nothing else in the wiring moved.

  Also flagged, not yet acted on: this project has no persistent
  automated test suite at all (no Jest/Vitest, nothing in CI) -- every
  verification this session, correction included, was a temp script run
  once and deleted after passing. Three subtle invariants have surfaced
  and been caught this way in one session alone (duplicate-allocation-
  pair rejection, max-not-sum in the dependency trial loop, and this
  trial-index correlation property) with nothing currently protecting
  against any of them regressing later. Nic wants this raised again once
  the portfolio math stabilizes post-Phase-2, as its own conversation.

  **Stopped here per Nic's explicit checkpoint** -- Phase 2 (portfolio-
  scoped interactive allocation levers) is real UI/endpoint work on top
  of both capacity pooling and now-correlated dependency gates, and gets
  its own go-ahead per the same pacing as every phase so far.

- **Shared capacity pool, Phase 2 of 3 (branch `claude/portfolio-
  capacity-pool`, not yet merged)** — the live "what if we moved
  someone?" lever: turns every Scope's forecast into something Nic can
  recompute in real time by dragging an allocation, before saving
  anything. Nic's one binding requirement going in: the new preview path
  must call `lib/forecast/portfolio.ts`'s lockstep orchestration for any
  Scope in a dependency component, never a second "recompute this scope"
  implementation built fresh for the preview case -- reintroducing the
  exact bootstrap-resample correlation bug Phase 1.5's post-review
  correction just fixed, just in the preview path instead of the saved
  one.

  Two new endpoints, both thin wrappers with zero simulation math of
  their own:
  - `GET /api/portfolio/inputs` -- the one expensive fetch per page load
    (Linear + findings + release context, per Scope). New
    `buildPortfolioInputs()` in `lib/forecast/compute.ts` reuses
    `buildScopeSimInputs` verbatim across every Scope (the same function
    `computeForecast` already calls for the saved path) rather than a
    second Linear-fetch implementation, and returns each Scope's
    items/gates/resolved-capacity plus every Person, Allocation, and the
    portfolio switch-cost setting.
  - `POST /api/portfolio/preview` -- accepts a hypothetical allocation
    set (optionally including people who don't exist yet, via
    `hypotheticalPeople`, for "what if we hired one more developer"),
    persists nothing. Cheap DB-only checks (unknown person/scope ids,
    over-allocation) run first and fail fast with a 400 before the
    Linear-touching fetch, rather than paying for every Scope's ticket
    fetch just to reject a typo. Both the saved baseline and the
    hypothetical preview are produced by calling
    `runPortfolioSimulation` from `lib/forecast/portfolio.ts` **once
    each**, over every Scope together -- provably identical to
    simulating a no-dependency Scope alone (see Phase 1.5 above), so
    running every Scope through the same call, dependencies or not, is
    both simpler and the only way the preview path structurally can't
    drift from the saved path's correlated-risk behavior.

  The actual live-drag UI (`/portfolio`, in "Coming next") never even
  calls the preview endpoint: `lib/capacity/resolve.ts` and
  `lib/forecast/portfolio.ts` are both pure and isomorphic by design
  (see Phase 1), so `PortfolioPageClient` imports `resolveCapacity`,
  `validateAllocations`, `unallocatedCapacity`, and
  `runPortfolioSimulation` directly and re-runs them in the browser on
  every allocation edit (debounced 120ms), with zero network round-trips
  during a drag. `POST /api/portfolio/preview` exists for programmatic /
  non-JS callers (MCP later, curl, an external agent) where that's not
  an option. A person x Scope allocation grid (slider per cell, running
  totals, red on over-allocation), a context-switch-cost slider, "+1
  developer" / "+2 developers" preset buttons per Scope that add a
  hypothetical person at 1.0 FTE fully allocated to that Scope (the
  generalized version of the old scenario-lever presets, per the brief
  -- "resolve blocking decisions" and "descope" levers are unrelated to
  allocations and deliberately untouched, still living in
  `scenarios.ts`), and "Save this allocation" (creates any used
  hypothetical person for real via `POST /api/people`, then a full
  per-person allocation replace via the existing `PUT /api/allocations`)
  / "Discard preview" actions round it out.

  Verified: a fixture script mirroring the preview endpoint's exact
  algorithm (two `runPortfolioSimulation` calls, baseline specs vs
  override specs, both built through `resolveCapacity`) proved starving
  a shared Platform dependency's capacity via a hypothetical allocation
  still pushes JSA's and iTrack's preview dates together, plus a direct
  per-trial-index check (Platform's bad trials showing up in both
  dependents' arrays at the same index) under the *preview* allocation
  set specifically, not just the already-proven saved path. Both new
  routes exercised live against real Postgres: `GET /api/portfolio/
  inputs` reaches the same Linear-blocked signature every other Forecast
  entry point hits in this sandbox (confirms the whole wiring path);
  `POST /api/portfolio/preview`'s validation branches (bad JSON, missing
  fields, duplicate pairs, bad `contextSwitchCostPct`, unknown person/
  scope ids, real over-allocation using a seeded Person and two Scopes)
  all return the right 400s without touching Linear, and a fully valid
  override correctly falls through to the same 502. UI exercised end-to-
  end with Playwright against the running dev server (network call to
  `/api/portfolio/inputs` mocked with fixture data, since Linear is
  blocked here): dragging the Platform allocation down from 100% to 20%
  correctly moved JSA's and iTrack's displayed dates together (+374d,
  identical delta on both, 0% confidence at target); the "+1 developer"
  preset correctly added a preview-only person row and pulled the date
  back in (-15d vs saved); pushing a person past 100% correctly showed
  the over-allocation warning and disabled Save. `npx tsc --noEmit`,
  `npm run lint`, and `npm run build` all clean; re-ran the standard
  Linear-blocked regression check plus `GET /api/allocations` and
  `GET /api/portfolio-settings` to confirm nothing else moved.

  No math-proof checkpoint required before merging this phase per Nic
  (API + UI wiring on top of already-verified simulation math, not new
  math itself) -- flagged as a phase-completion report rather than a
  stop-and-wait gate.

- **Shared capacity pool, Phase 3 of 3 (branch `claude/portfolio-
  capacity-pool`, not yet merged)** — the portfolio dashboard: `/portfolio`
  (already routed and navved in Phase 2) grows confidence bands, a shared
  date axis, an overlay view, and auto-surfaced insights on top of the
  allocation grid. Zero changes to `lib/forecast/simulate.ts` or
  `lib/forecast/portfolio.ts` were needed -- `SimulationResult.percentiles`
  (`p10/p50/p70/p85/p90`, already returned by `runPortfolioSimulation`
  since the Phase 1.5 lockstep rewrite) was already everything the bands
  need; this phase is presentation only.

  - **Confidence bands + shared axis**: each Scope's row gets a light
    P10-P90 band, a denser P50-P85 band, a P50 marker dot, and a dashed
    target-date marker (when the Scope has one), all positioned as
    percentages against ONE shared day-offset axis (computed from the
    union of every Scope's baseline-and-preview P10/P90 extents plus any
    target dates, so the axis grows to fit a big preview swing rather
    than clipping it) with real month-boundary tick labels. Percentiles
    are read directly off `SimulationResult.percentiles` -- the same
    values `runPortfolioSimulation` already returns -- so a band's
    position is provably the same number already shown as text
    elsewhere on the page, not a separately-computed approximation.
  - **Overlay toggle**: collapses every Scope's band onto one shared
    strip (color-coded, thin per-Scope lanes, a legend underneath)
    instead of one row each, so a call can see directly whether two
    products are competing for the same window rather than reading two
    separate rows and doing the comparison mentally.
  - **Portfolio insights**: new pure module `lib/portfolio/insights.ts`
    (`computePortfolioInsights`), deterministic and isomorphic like the
    rest of `lib/capacity`/`lib/forecast/portfolio` -- no model call
    anywhere in it, per the standing no-LLM-in-the-simulation-path rule.
    Surfaces, unprompted: the single biggest gap between any two Scopes'
    likely dates (above a 7-day noise floor -- "X finishes N days before
    Y"), any Scope more than one other Scope depends on ("X is on the
    critical path for N scopes"), every over-allocated person, and total
    unallocated FTE. All computed from data the page already has (percentiles,
    `dependsOnScopeIds`, `validateAllocations`/`unallocatedCapacity` --
    both already built in Phase 1).
  - **Grid polish**: an "Effective capacity" column-totals row (live,
    recomputed on every keystroke via `resolveCapacity` directly --
    cheap, no simulation trials, so it isn't debounced like the band
    recompute) and a persistent linear-scaling caveat near the capacity
    controls (the model treats 2x people as 2x speed; real teams rarely
    achieve that).

  Verified: 6 fixture assertions on `computePortfolioInsights` (biggest-
  gap selection among multiple candidate pairs, the 7-day noise floor
  correctly suppressing a 3-day gap, critical-path detection requiring
  more than one dependent, over-allocation and unallocated-FTE pass-
  through formatting). End-to-end with Playwright against the running
  dev server (Linear mocked, same approach as Phase 2's UI check):
  confirmed all three Scopes' P50 markers render at the mathematically
  correct shared position (identical, since Platform dominates both
  dependents in the fixture), the shared month-tick axis renders real
  calendar labels, the target-date dashed marker appears for the one
  Scope with a target date, the overlay toggle's legend renders, and --
  the one property that actually matters for this phase -- dragging
  Platform's capacity down still moved JSA's and iTrack's bands together
  (identical +374d) and the axis auto-expanded to fit the new range
  without clipping. The critical-path insight ("Platform is on the
  critical path for 2 scopes") appeared correctly; the unallocated-FTE
  insight appeared correctly after the drag freed up capacity; the
  Effective-capacity row updated live. Save still correctly round-
  tripped through the existing (unmodified) `PUT /api/allocations` with
  the new fraction. `npx tsc --noEmit`, `npm run lint`, and
  `npm run build` all clean; re-ran the standard Linear-blocked
  regression check against real Postgres.

  **Post-Phase-3 bug fixes** (found live, on `/portfolio`, after real
  Scopes existed): two rows both labeled "JSA" (which also broke the
  insights panel -- "JSA finishes 75 days before JSA"), and a pile of
  stray "New developer N PREVIEW" rows in the allocation grid. Code
  review of the render path (`buildPortfolioInputs` in `compute.ts`,
  `PortfolioPageClient`) found no way for the code itself to duplicate a
  Scope's name -- `prisma.scope.findMany()` renders each row's own
  `name` directly -- so this had to be two real Scope rows sharing a
  name, and `POST /api/scopes` / `PATCH /api/scopes/:id` had nothing
  stopping that. Fixed: both routes now reject a case-insensitive
  duplicate name with a 400, verified live against real Postgres
  (case-variant create rejected, rename-to-existing-name rejected,
  rename-to-its-own-current-name correctly NOT flagged as a false-
  positive collision). Renaming the actual mislabeled Scope in
  production is Nic's to do at `/scopes` -- this sandbox can't reach the
  Railway DB or the deployed app to do it directly (both blocked at the
  network layer, confirmed by testing the TCP proxy and the app URL
  directly, same allowlist that already blocks Linear).

  For the ghost-person pileup: root cause found in
  `PortfolioPageClient` -- every "+1 developer" / "+2 developers" click
  adds a hypothetical person to local state that's never removed except
  by a full page reload (module-scoped `ghostCounter` never resets
  either), and there was no way to remove a single one. If any of those
  were still allocated when Save was clicked, they'd have become real,
  permanent `Person` rows with no UI path to undo it -- `DELETE
  /api/people/:id` already existed server-side (built in Phase 1) but
  was never wired to any button. Added a "Remove" action per grid row:
  for a preview-only ghost it's pure local cleanup; for a real person it
  calls the existing DELETE endpoint and reloads, so either way -- stale
  client state or an actual persisted row -- there's now a one-click fix
  directly in the tool, without needing direct DB access. Verified with
  Playwright: two "+1 developer" clicks produce two ghost rows, removing
  one leaves exactly one; removing a real person correctly calls
  `DELETE /api/people/:id` with the right id. `npx tsc --noEmit`,
  `npm run lint`, `npm run build` all clean; standard Linear-blocked
  regression re-confirmed. Landed on a short-lived
  `claude/portfolio-bugfixes` branch, merged straight back into
  `claude/product-timeline-audit-a72dmg`.

- **Reports is live** (`/reports`, `lib/reports/`, `POST /api/reports`).
  Composes the same Forecast pipeline as `/forecast` (so numbers always
  agree) into a stored, immutable leadership update: likely date +
  confidence, what shipped since the last report (needs `completedAt` on
  Linear issues, now fetched), what's blocking (from the Decision Queue),
  what got resolved since last time (`Finding.resolvedAt`, new field, set
  on resolve), and the single best available "fastest path to a sooner
  date" lever. Each generated report is stored verbatim
  (`Report.summaryMarkdown`) rather than recomputed on view, specifically
  so historical reports don't silently change if the underlying logic
  changes later, and so "what did I report last week" has a stable
  answer. History list + copy-to-clipboard on the page. Rendering is a
  small dependency-free line parser (`components/ReportView.tsx`) rather
  than pulling in a markdown library, since the format is fully
  controlled by `lib/reports/render.ts`. Verified: 14-assertion fixture
  suite against the pure render function (first-report framing, delta
  phrasing both directions, section omission when there's nothing to
  show), a real-browser check of the React rendering against a mocked API
  response, and the real unmocked pipeline against local Postgres --
  correct empty state, and the same graceful Linear-blocked error path
  everything else hits in this sandbox.

- **AI estimation is live** (`lib/estimate/`, `POST /api/estimate`,
  "Estimate tickets with AI" on /forecast). The model reads each ticket's
  actual content and produces its own three-point day estimate with a
  one-line rationale, judges release *relevance* from content (core /
  peripheral / unrelated -- unrelated tickets are excluded from the
  forecast, listed visibly), and flags tickets whose scope is unclear,
  imply hidden work, or disagree 2x+ with the team's own points
  ("Worth a look" panel). Estimates are cached in WorkEstimate keyed by
  (scopeId, source, externalId) with a content hash -- unchanged tickets
  are never re-sent to the model; changed ones show as "stale" until
  re-run. Keyed by source (not Linear-specific) deliberately: Nic plans a
  Notion-requirements-as-source-of-truth workflow later, and a Notion row
  can flow through the identical pipeline. Scope.estimationContext (free
  text, editable on /forecast) feeds team/stack/release context into the
  estimator. Verified end-to-end with real Anthropic calls against Nic's
  real tickets: caught a deliberately sandbagged 1-point ticket at ~18
  likely days flagged bigger_than_pointed, and correctly judged an iTrack
  ticket unrelated with no labels involved. Forecast prefers fresh AI
  estimates over points; provenance shows in "Where the estimates come
  from."

- **Forecast scenarios are live** (`lib/forecast/scenarios.ts`): a "Paths
  to a sooner date" panel re-runs the simulation per lever (resolve
  blocking decisions / +1 or +2 developers / descope each of the top 3
  items) with a fixed RNG seed so deltas are lever-only, showing the new
  likely date, delta days, and confidence-at-target per row. The explainer
  also reports estimate provenance (real Linear points vs. parsed hints
  vs. wide placeholders, and placeholders' share of projected effort).
  Deliberate call, per Nic's ask about industry benchmarks: no generic
  "Flutter apps of this size take N weeks" figures are baked in -- no
  credible dataset exists, and invented numbers would undermine trust.
  The calibration path is the team's own completed-ticket history (below).
- **Forecast is live** (`/forecast`, `lib/forecast/`). Monte Carlo
  simulation over three-point estimates (Linear issue estimate -> points
  treated as likely days with a ±heuristic spread; `Finding.estimateHint`
  parsed for un-ticketed work; open *blocking* decisions modeled as a
  serial delay, not divided by capacity). `Scope.targetDate` and
  `Scope.teamCapacity` are user-editable inline on the page (team capacity
  defaults to inferred distinct-assignee count if unset). Confidence =
  % of simulated outcomes landing on or before the target date, per spec.
  Math verified numerically (triangular-mean convergence, date ordering,
  monotonic confidence vs. target, ~2x capacity scaling, gate delay) and
  the data-assembly logic verified against a 13-case fixture (done/canceled
  exclusion, ticketed-finding exclusion, decision-vs-item routing, hint
  parsing). UI verified via a mocked `/api/forecast` response since this
  sandbox can't reach Linear -- real production numbers not yet eyeballed.
- **Programmatic API access**: `POST /api/audit` (and every other API
  route) now accepts `Authorization: Bearer <APP_PASSWORD>` as an
  alternative to the cookie session, for Nic's separate Hermes agent to
  call directly later. Documented in README.md. Explicitly NOT built:
  Scope routing (which scopeId a transcript belongs to) or a
  run-completed notification -- real design questions once Hermes exists
  to actually integrate with.
- `Finding` already carries `estimateHint`, `blocks`, and `blocking` --
  Forecast already consumes these directly, no further schema change
  needed for Timeline's first pass either.
- Nav has Timeline / Reports still as placeholder pages (`app/timeline`,
  `app/reports`) -- turning them on is additive, not structural.
- Linear access is Scope-driven (`/scopes`), not an env var — adding a new
  module (iTrack, Precon, ...) is a data row, not a redeploy.
- `/audit` is a paginated index of every audit ever run (not just the
  dashboard's 5 most recent), and each source page has a collapsible
  "view original transcript" section -- full traceability, nothing is
  ever deleted.
- Known gap: `Finding.linearIssueId` currently stores the Linear
  *identifier* (e.g. `SOF-123`), not a clickable URL — there's no stored
  workspace slug to build a link from. If that starts to matter, either
  add a `linearIssueUrl` field or fetch the org's URL slug once and cache
  it.
- Known gap (flagged by Nic, not urgent): JSA and iTrack currently share
  one Linear project with no separating label. Worth a first entry in the
  Decision Queue: ask whoever owns Linear structure (Lucas? Colton?) for a
  consistent `jsa` / `itrack` label so Scopes can split cleanly instead of
  guessing from title text.

- **Design language + momentum, `/forecast` and `/reports` done (branch
  `claude/design-momentum`, not yet merged)** — implements
  `DESIGN_LANGUAGE_AND_MOMENTUM_BUILD_BRIEF.md`, in the brief's own
  recommended order (`/forecast` first, then `/reports`; `/portfolio`'s
  compact strip is next, gated on Nic's go-ahead). No mockup screenshots
  were available (none attached), so this was built from the written
  spec. Doesn't touch `lib/forecast/simulate.ts`'s core math -- everything
  here is presentation and history-diffing on top of data that's already
  computed or stored, per the brief's own non-goal, so it didn't need the
  capacity-pool work's math-proof checkpoint.

  New shared data layer, built once and reused by both pages (and by the
  new Ask-chip endpoint):
  - `lib/reports/changes.ts` (`computeChangesSince`) -- extracted from
    `generateReport`'s previously-inline logic so report generation and
    live momentum can never compute "what shipped/resolved since X" two
    different ways. Also derives `freshEstimateCount` (WorkEstimate rows
    created/refreshed since a point in time) as a new signal --
    WorkEstimate rows only ever exist for AI-produced estimates (see
    `lib/estimate/run.ts`), so this count directly means "tickets that
    got a real estimate instead of a placeholder guess," no cross-
    referencing needed.
  - `lib/momentum/compute.ts` (pure, no DB): `computeMomentum` (date/
    confidence deltas + a stalled threshold: <1 day AND <5 points of
    confidence movement -- either one moving enough counts as
    real movement), `dateDeltaPhrase`, `bettingOddsPhrase` ("you'd win
    this bet N times out of 100").
  - `lib/momentum/attribution.ts` (pure): `attributionSentence` (live
    /forecast path -- priority order resolved blocking decision > fresh
    estimates > shipped count, same "pick the biggest lever" instinct as
    the existing scenario picker) and `reportAttributionSentence` (the
    /reports path -- reuses each Report row's own already-stored
    `resolvedSinceLastCount`/`shippedCount` rather than re-deriving from
    live data, which is both cheaper AND more correct for a pair of
    *historical* reports, since live Linear/estimate state has moved on
    since both of them).

  `/forecast` (`components/ForecastView.tsx`, `GET /api/forecast`
  extended with a `momentum`/`calibration` payload computed alongside the
  existing pipeline -- no second round trip): hero date at `text-6xl`
  (was competing with a side-by-side confidence ring before -- ring
  removed, `ConfidenceRing.tsx` deleted as dead code), betting-odds pill
  replaces the raw percentage, collapsed/expanded `MomentumChip`
  (sparkline + one-liner collapsed; attribution + confidence-momentum
  lines only on expand, per progressive disclosure), a neutral gray
  "Unchanged for N days" pill when stalled, a 🎯 icon on each existing
  scenario row so it reads as a "Try" chip pairing with the new 💬 "Ask"
  chips row (`components/AskChips.tsx`, hitting new
  `POST /api/forecast/ask`), and a muted `components/CalibrationLink.tsx`
  stub ("See how past forecasts held up" -- honestly says "not enough
  history yet" below a 4-reports/28-days threshold, or "not built yet"
  above it, never a fabricated comparison).

  The Ask-chip endpoint is the one new LLM-calling surface this phase
  adds -- explicitly allowed under the standing rule (only ever
  user-triggered by a click, never automatic on a recompute/drag/load).
  Two fixed question types (`why_moved`, `hit_target` -- the latter
  hidden when the Scope has no target date), reuses
  `lib/model.ts`'s existing `completeJson` pattern, prompt in
  `lib/momentum/askPrompt.ts` with the same "cite the real numbers,
  never invent a fact" rules as the estimator prompt.

  `/reports` (`components/ReportsPageClient.tsx`) reuses the exact same
  `MomentumChip` component and `computeMomentum` function -- confirmed
  "mostly free" per the brief, since `Report` was already storing
  everything needed. Comparison is against whichever report is
  immediately before the SELECTED one chronologically (not always "vs.
  today"), all computed client-side from the already-fetched report
  history with zero new network calls; the oldest report in history
  correctly shows no momentum chip at all (nothing to compare against).

  Verified: fixture assertions on `computeMomentum` (stalled threshold
  both ways, a null-confidence scope not forcing "not stalled"),
  `attributionSentence` (priority ordering, singular/plural phrasing),
  and `reportAttributionSentence`. `computeChangesSince` verified against
  real local Postgres with seeded `WorkEstimate`/`Finding` rows (only
  post-`since` rows counted, `since = null` correctly includes
  everything). Both new/changed routes re-verified live: validation
  branches on `POST /api/forecast/ask` (bad question type, unknown
  scope, `hit_target` correctly rejected when no target date is set) all
  return the right code without touching Linear; a fully valid request
  on both routes falls through to the same standard Linear-blocked
  signature as every other Forecast entry point. `/forecast` exercised
  end-to-end with Playwright (Linear mocked, both a clear-movement and a
  stalled fixture): hero, odds pill, collapsed/expanded momentum,
  stalled-pill styling, Ask-chip round-trip, and the calibration stub
  all confirmed rendering correctly. `/reports` exercised with Playwright
  against **real, unmocked** local Postgres (seeded two real `Report`
  rows for a throwaway Scope, since `GET /api/reports` never touches
  Linear at all) -- confirmed the momentum chip, attribution, and
  confidence-momentum line all render from genuine stored data, and that
  browsing to the oldest report correctly shows no chip. `npx tsc
  --noEmit`, `npm run lint`, `npm run build` all clean; re-ran the
  standard Linear-blocked regression check plus `GET /api/reports` and
  `GET /api/scopes` to confirm nothing else moved.

  **`/portfolio` done too** -- the brief's #9, the compact strip, and the
  last of its three target pages. `buildPortfolioInputs()`
  (`lib/forecast/compute.ts`) now also fetches each Scope's most
  recently STORED Report (one extra `findFirst` in the existing per-
  Scope loop, same "expensive, once" fetch this function already does --
  no new network round trip). `PortfolioPageClient` reuses the exact
  same `computeMomentum`/`dateDeltaPhrase` functions /forecast and
  /reports already use -- literally the same pure module, not a
  reimplementation -- comparing the live client-side BASELINE
  (saved-allocations) simulation against that stored Report, same
  semantics as everywhere else. Deliberately compared against baseline,
  not the live in-progress preview: an unsaved drag already has its own
  "vs saved" delta text right next to this, and this pill answers a
  different question (has this Scope moved since it was last reported
  on) that shouldn't flicker while dragging. Per the brief, no sparkline
  and no expansion at this density -- just an icon + short phrase pill
  next to each Scope's date (a compact `MomentumChip`-equivalent was
  deliberately NOT built; the full component's sparkline/expand
  mechanics don't fit here, only its underlying computation does).
  Attribution is intentionally left out too, since it's expand-only
  content in every other surface and there's no expand state here to put
  it in -- would need a `computeChangesSince` call per Scope for no
  visible payoff.

  Also confirmed (asked explicitly before starting): the target-date
  lever planned for the next brief covers both directions --
  date-to-confidence (already how `confidenceAtTarget` works) and
  confidence-to-date (a `percentile()` lookup on `completionDaysSorted`,
  which every client-side `SimulationResult` already carries in memory
  right now, unused past the 5 fixed percentiles) -- both a pure lookup
  on already-computed simulation output, zero new simulation math either
  direction.

  Verified: the new `prisma.report.findFirst(...)` query checked
  directly against real Postgres (returns null with no Report, correctly
  picks the NEWER of two seeded Reports by `generatedAt`) --
  `buildPortfolioInputs()` itself still can't be exercised end-to-end
  live here, same Linear-blocks-first constraint as always, so
  `GET /api/portfolio/inputs` was re-confirmed to still fall through to
  the standard Linear-blocked signature (proves the new code executes
  without crashing up to that point). Playwright with `/api/portfolio/
  inputs` mocked (three scopes: one that moved a lot -> a green
  "N days sooner" pill, one that barely moved -> the neutral "unchanged
  Nd" pill, one with no prior Report at all -> confirmed NO pill
  renders) plus an explicit check that no chevron/expand affordance
  leaked in from the other surfaces. `npx tsc --noEmit`, `npm run lint`,
  `npm run build` all clean; standard regression re-confirmed across all
  three pages.

  This closes out every item in
  `DESIGN_LANGUAGE_AND_MOMENTUM_BUILD_BRIEF.md`. Reported back to Nic per
  his explicit checkpoint before the next brief (the scenario levers)
  goes out.

  **Next brief, not yet written: scenario levers (target date + scope
  cut) alongside the existing allocation lever, same preview/what-if
  system.** Discussed with Nic but not yet built -- noted here so the
  reuse-vs-new-work split isn't lost before that brief lands:
  - **Target date -- cheap.** `confidenceAtTarget` is already a pure
    per-trial check against whatever `targetDate` a `ScopeSimulationSpec`
    carries; the reverse ("what date for N% confidence") is an equally
    pure `percentile()` lookup on `completionDaysSorted`, which every
    client-side `SimulationResult` already carries in memory today (see
    `PortfolioPageClient`'s `preview`/`baseline` state) -- both
    directions, zero new simulation math. New work: a hypothetical
    `targetDateOverrides` map threaded through the same override pattern
    allocations already use, both client-side and as an optional param
    on `POST /api/portfolio/preview`. Saving reuses the existing
    `PATCH /api/scopes/:id` (already accepts `targetDate`) -- no new
    endpoint.
  - **Scope cut -- the live-preview half is cheap too, the persistence
    half is real new work.** `GET /api/portfolio/inputs` already returns
    every Scope's individual items, so filtering them client-side before
    a resimulation is the same shape as the capacity lever -- no backend
    change needed for the drag/toggle interaction itself. What's
    genuinely new: (1) the UI is a different pattern, a per-ticket
    checklist rather than a slider; (2) there's no DB concept today of
    "this ticket is manually excluded" -- exclusion currently only
    happens implicitly via Linear ticket state or AI-judged relevance,
    so persisting a manual cut needs real new schema (e.g. an
    `excludedIssueIds` field or a small new model); (3) dependency
    propagation is free -- cutting Platform's items already correctly
    flows through the existing lockstep machinery to JSA/iTrack, same as
    any other capacity change, no changes needed there.

- **Scopes cleanup + Nav fix (branch `claude/scopes-fix`, cut from the
  base branch, not yet merged)** — two real issues found in testing,
  fixed before starting the scenario-levers brief.

  **Duplicate "JSA" Scopes.** Nic confirmed this was his own manual
  experimentation (duplicating a Scope to try different project-filter
  setups), not a bug -- but it surfaced a real product gap: `/scopes` had
  no way to EDIT an existing Scope's identity fields at all, only create
  or delete. `dependsOnScopeIds` in particular has had zero UI since it
  shipped in Phase 1.5 -- the original plan's own text ("re-point the
  JSA/iTrack Scopes... at `/scopes`") assumed an edit surface that was
  never actually built, so delete-and-recreate looked like the only
  option even though it isn't. Confirmed target end state (structural
  reasoning from the schema + Nic's own confirmation that KIT JSA/
  iTrack/Platform are now separate Linear projects, no live data access
  needed or possible from this sandbox): one Scope per product, one
  project each -- Platform standalone, JSA and iTrack each with
  `dependsOnScopeIds: [platform.id]` instead of folding Platform's
  project into their own filter (which is exactly what double-counts
  Platform's tickets, the original motivating bug for the whole
  capacity-pool brief).

  Fixed: `ScopesManager.tsx` gained a full inline Edit control per row
  (name, team, project, label filter, AND `dependsOnScopeIds` -- not
  just the "rename control" asked for, since rename alone can't actually
  fix a project-filter/dependency setup) wired to the existing
  `PATCH /api/scopes/:id` (built during the duplicate-name-guard fix,
  never had UI). Shares one `ScopeFormFields` component with the "Add
  scope" form so create and edit can't drift apart. Also fixed the
  page's own description text and the project-field placeholder, which
  were BOTH actively suggesting the double-counting pattern ("pick more
  than one project... e.g. JSA + Platform") -- i.e. the UI itself
  taught the mistake that caused this. `DELETE /api/scopes/:id` had zero
  error handling -- `Report`/`Source`/`WorkEstimate`/`ContextDoc` all
  reference Scope WITHOUT cascading (unlike `Allocation`, which cascades
  on purpose), so deleting a Scope with any real history threw an
  uncaught Prisma FK error, a bare 500. Now checks up front and returns
  a clear 409 naming exactly what's attached (and separately, whether
  another Scope still lists it in `dependsOnScopeIds`), consistent with
  "nothing here is ever auto-deleted" for real history -- directly
  relevant since Nic is about to delete one of the duplicate Scopes
  himself. This sandbox still can't reach the deployed app or the
  Railway DB (both blocked at the network layer, confirmed again), so
  the actual production consolidation is Nic's to do -- now doable
  entirely through `/scopes` rather than needing raw API calls.

  **Stale "Coming next" label.** Was sitting over Forecast/Portfolio/
  Timeline/Reports -- Nic's report said all four were built, but
  `app/timeline/page.tsx` still just renders `<ComingNext>` (unchanged
  since the very first scaffold commit) -- flagged that discrepancy
  rather than silently going along with it. Moved Forecast/Portfolio/
  Reports into `PRIMARY_TABS`; `COMING_NEXT_TABS` now correctly contains
  only Timeline.

  Verified: the hardened DELETE checked live against real Postgres (no
  history -> clean 200; a Scope with a seeded `Report` row -> clean 409
  naming it, not a crash; a Scope another Scope depends on -> clean 409;
  clears correctly once the dependency is removed). The new edit UI
  exercised end-to-end with Playwright against real Postgres (`/scopes`
  never touches Linear): rename, project-filter change, and
  `dependsOnScopeIds` all confirmed persisted via a fresh server-side
  read (not just DOM text, which caught a false positive in the first
  pass -- a rename attempt had silently collided with the pre-existing
  seed Scope's name and been correctly rejected by the duplicate-name
  guard, which the DOM-only assertion didn't distinguish from success).
  The manual-entry fallback for the team/project pickers (Linear
  blocked) confirmed working. Nav text confirmed "Coming next" appears
  exactly once, over Timeline only, with Forecast/Portfolio/Reports
  above it as primary tabs. `npx tsc --noEmit`, `npm run lint`,
  `npm run build` all clean; standard regression re-swept.

  **Merged into the base branch** (`claude/product-timeline-audit-a72dmg`,
  clean fast-forward, no conflicts) once Nic explicitly asked for it.

- **Portfolio scenario levers, lever 1 of 4: target date, both
  directions (branch `claude/portfolio-scenario-levers`, cut from the
  updated base, not yet merged)** — implements
  `PORTFOLIO_SCENARIO_LEVERS_BUILD_BRIEF`'s cheapest/lowest-risk lever
  first, per its own recommended order. Confirmed before writing code
  (the brief explicitly asked for this, not to be assumed): a Scope's
  `SimulationResult.completionDaysSorted` already has any correlated
  dependency effect baked in post-lockstep, so both directions are pure
  reads over already-computed trial output -- zero changes to
  `portfolio.ts` or `simulate.ts`'s actual Monte Carlo sampling.

  `lib/forecast/simulate.ts` gained two exported pure functions,
  `percentileDay` (was already there as a private `percentile`, just
  exported and renamed for clarity) and `confidenceAtDay` (extracted
  from what was inline logic inside `summarizeCompletionDays`, which now
  calls it too instead of duplicating it -- one implementation, not two
  that could drift). New `TargetDateLever` component in
  `PortfolioPageClient.tsx`: a date input and a confidence-percent input
  per Scope, kept in sync with exactly one source of truth (the date;
  confidence is a derived `useMemo`, never separate state, so the two
  can't drift apart from each other). Editing the date recomputes
  confidence via `confidenceAtDay`; typing a confidence percentage
  computes the required date via `percentileDay` -- both purely
  client-side against data already in memory (`preview`/`baseline`'s
  `SimulationResult` per Scope), zero new network call while previewing.
  Preview-only by default with an explicit "Save target date" button
  (only appears once the date actually differs from the Scope's saved
  value) that reuses the existing `PATCH /api/scopes/:id` -- no new
  endpoint, and a smaller/separate save action from the allocation
  grid's big Save, since a target-date change is its own decision.

  Placement: `/portfolio` only, not `/forecast` -- the brief left this
  open: it's the same lever mechanism as everywhere else in this brief,
  and this brief's own motivating-gap section frames all four levers
  around `/portfolio`'s live preview specifically, not the single-scope
  page.

  Verified: a fixture script proved the refactor is behavior-preserving
  (summarizeCompletionDays' own `confidenceAtTarget`/`percentiles` match
  calling `confidenceAtDay`/`percentileDay` directly on the same sorted
  array) and proved the actual new capability (percentileDay monotonic
  non-decreasing in the requested confidence; confidence read back at
  the computed date is always >= the percentage that was asked for,
  never less; empty-array edge cases return 0, not a crash). Playwright
  against the dev server (Linear mocked): initial fields correctly
  default from the Scope's saved target date; editing the date updates
  confidence; typing a confidence percentage updates the date and the
  confidence shown afterward correctly reflects the REAL achieved value
  at that computed date (can overshoot the ask slightly due to
  percentile flooring, by design, never undershoot); the Save button
  only appears once dirty and disappears again after a successful save;
  `PATCH /api/scopes/:id` confirmed called with the right payload.
  `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean;
  standard regression re-swept.

## v1 plan

### 1. Forecast (`/forecast`) -- done, see "Where things stand"

### 2. Timeline (`/timeline`)

A Gantt view built from Linear issues (assignee, estimate, state) plus open
findings shown as unscoped/at-risk bars, laid out against the release date
from Forecast. Reuse the workstream-row visual pattern from the KIT mockup.

Depends on Forecast existing (for the target date and confidence band).

### 3. Reports (`/reports`) -- done, see "Where things stand"

### 4. Interactive scenario levers (Nic's next priority, not V2)

Turn "Paths to a sooner date" from static pre-computed rows into live
levers: drag team capacity, toggle which decisions are treated as
resolved, toggle which tickets are in/out of scope, and see the date and
confidence recompute in place -- meant to facilitate an actual
conversation (dragging a slider while someone watches), not just generate
a static report. The simulation engine and API already support arbitrary
overrides in spirit (`buildScenarios` already re-runs with one changed
input per row); this is mostly a generalized "recompute with overrides"
endpoint plus an interactive UI layer, not new simulation logic.

## Smaller things worth doing alongside v1

- Fix the `package.json#prisma` seed config deprecation warning by moving
  to `prisma.config.ts` (Prisma 7 will require it).
- Consider adding a `linearIssueUrl` to `Finding` if the identifier-only
  link starts to bite (see "known gap" above).
- The JSA/iTrack Linear labeling ask (see above) — small, but unblocks
  cleaner Scope filtering.
- Forecast's estimate heuristics (`lib/forecast/build.ts`) are a
  documented placeholder, not calibrated to real team velocity: Linear
  points are treated as literal days with a fixed ±spread, and
  un-estimated issues/findings get flat placeholder ranges. Worth
  revisiting once there's enough completed-issue history to fit a real
  points-to-days conversion instead of guessing.

## Figma integration (shipped)

Same shape as Notion, text-level (Nic chose the contained option): Scopes
link Figma frame/page URLs (must have a node-id, i.e. a specific
page/frame selected, not just the file root); `lib/figma.ts` (raw REST,
no SDK -- personal access token, `/v1/files/:key/nodes?ids=` scoped to
just the requested node, not the whole file) flattens the node tree to
plain text: named frames/components become headings, TEXT node content is
extracted verbatim, purely decorative shape nodes (rectangles, vectors,
etc. with no children) are filtered out entirely, default-autogenerated
names ("Frame 8", "Rectangle 47") don't produce noise headings. Feeds into
the same `lib/estimate/context.ts` as Notion, with its own char budget and
its own contextHash contribution. The estimator prompt is told explicitly
to weight Figma content as *current design intent*, not committed
requirements the way Notion docs are -- deliberately lower-trust,
especially for anything still in active design (iTrack). UI: a second
URL-list textarea next to the Notion one on /forecast, showing connected
page names. Verified against a 15-assertion fixture built to mirror the
actual JSA v2 board structure Nic showed (frames, text labels, and
decorative noise): correct file/page name extraction, real content
present, decorative shapes and empty-default-named frames correctly
absent from output, 404 gives an actionable message. Live api.figma.com
calls untested (sandbox blocks it, same as Linear/Notion).

## Spreadsheet upload + audit truncation fix (shipped)

Two bugs hit in the same production session, from the same underlying
cause: Nic pasted the full "Task List" tab of a working doc into the
Audit form and got a cryptic `Model did not return parseable JSON
(Unexpected end of JSON input)` error with a wall of cut-off JSON dumped
into the error text.

**Root cause**: the model's response hit `max_tokens` (8000) before
finishing the JSON array -- a dense, already-structured input (30+ rows,
several already flagged GAP/OPEN/BLOCKER) legitimately produces a lot of
findings. `completeJson` (`lib/model.ts`) never checked
`response.stop_reason`, so it tried to parse a truncated string and threw
whatever `JSON.parse` said, which is meaningless to a user. Fixed two
ways: `completeJson` now checks `stop_reason === "max_tokens"` first and
throws a clear "input was likely too large, try a shorter paste" error
instead of a parse-error dump (verified against the real Anthropic API
in this sandbox, deliberately forcing truncation with a tiny `maxTokens`
-- Anthropic is the one external API this sandbox can actually reach);
and the audit call's `maxTokens` went from 8000 to 16000 for headroom.

**Also requested in the same breath**: real spreadsheet upload, not just
copy/paste. `.txt/.md/.csv` were already plain text (`file.text()`
worked fine); `.xlsx` needs real parsing. Chose `exceljs` over the more
common `xlsx` (SheetJS) package deliberately -- `xlsx` on npm has two
high-severity unpatched vulnerabilities (prototype pollution, ReDoS,
"no fix available"); `exceljs`'s own footprint is clean, its only flagged
issue is a moderate transitive one with a fix path. Parsing happens
server-side (`POST /api/parse-spreadsheet`, exceljs is Node-oriented
anyway) rather than shipping a spreadsheet-parsing library into the
client bundle. Converts to the same pipe-delimited text Nic's already
been pasting manually, dropping blank rows; merged cells (common in
these working docs -- banner rows, notes) are de-duplicated to their
anchor cell using `cell.isMerged`/`cell.master`, otherwise a merged
banner row repeats itself once per spanned column. Multi-sheet workbooks
get a sheet picker (defaults to the first sheet) instead of guessing
which tab matters -- both the Audit form and the Forecast page's "Other
context" uploader share one client helper (`lib/client/uploadFile.ts`)
and the same server route. Verified against the real multi-sheet working
doc from this session (6 sheets, merged banner rows, formulas, date
cells) and a real classification workbook with hyperlink cells, plus
error paths (corrupt file, oversized file, wrong extension) -- all via a
real browser upload through both UI surfaces.

## Programmatic refresh (shipped)

Nic's ask: a single call Hermes/Cowork can make to trigger a full
refresh, instead of sequencing `/api/audit`, `/api/estimate`, and
`/api/forecast` itself. `POST /api/refresh` (see README) does: push
context docs -> optionally audit a transcript -> re-run AI estimation ->
re-run the forecast -> optionally generate a Report, all through the
exact same pipeline the individual routes use (no duplicated logic to
drift out of sync -- `computeForecast` in `lib/forecast/compute.ts` is
now the one place Forecast math happens, used by `GET /api/forecast`,
`generateReport`, and `/api/refresh`; `runAudit` and
`runEstimationForScope` are the equivalent extractions for Audit and
Estimate). Context docs are pushed before anything Linear-dependent, so a
Linear outage doesn't lose freshly-pushed context along with the failed
refresh -- verified for real against local Postgres (Linear blocked in
this sandbox, same as always): the push landed and `contextDocsUpdated`
came back correctly on a request that still 502'd on the Linear call.
Also verified: identical 502 error text from all four now-refactored
routes (audit/estimate/forecast/reports) before and after the extraction,
confirming the refactor didn't change behavior; pushing the same
`label` twice updates in place rather than duplicating.

Answers the second half of Nic's context question too: this is a *push*,
not a pull -- the app can't reach into Hermes' local ledger, so
`contextComplete`/`contextIssues` in the response is the hardening for
that. A human on `/forecast` sees a Notion/Figma failure inline; an
unattended Hermes-triggered refresh has no one watching, so
`contextComplete: false` makes a fully-failed configured context source
explicit in the response instead of a silent degrade only visible if
someone happens to read a warning string.

Not built: the reverse direction (the app notifying Hermes when a refresh
finishes, or Hermes discovering which Scope a transcript belongs to) --
same "real design question once both sides exist" note as the audit API
already carries.

## Scope: multi-project support (shipped)

Nic's ask, once the Cowork Linear split (JSA / iTrack / Platform / Legacy)
was underway: JSA and iTrack need to be forecast separately *and*
together, and both real products depend on shared Platform work that
neither's own Linear project alone would surface. `Scope.projectName`
(single, exact-match) is now `Scope.projectNames` (array, union match) --
`getScopedIssues` filters with Linear's `project: { name: { in: [...] } }`
instead of `eq`, so one Scope can pull "KIT JSA" + "KIT Platform" while
another pulls "KIT iTrack" + "KIT Platform" and a third pulls all of "KIT
JSA" + "KIT iTrack" + "KIT Platform" for the combined view -- three
independent Scopes, three independent simulations, no cross-Scope
arithmetic to get wrong. The two per-product Scopes should be read as "if
we only worked on this" (full capacity dedicated), and the Combined Scope
as the realistic date given the team's actual capacity split across both
-- worth surfacing that distinction in the UI copy so a JSA-only date and
the Combined date don't read as contradicting each other.
Migration backfills every existing `projectName` into a one-element
`projectNames` array before dropping the old column -- verified against
local Postgres, the existing JSA scope kept its one project correctly.
`/scopes` UI is now a checkbox list per team (was a single dropdown) --
verified with a real create-scope round trip against local Postgres
(mocked team/project lookups), multi-select shows as a joined list in the
table. Deliberately not built yet: cross-project dependency modeling
(e.g. a specific Platform ticket blocking a specific JSA ticket, pulled
from Linear's native issue-blocking relations and shown as a critical-path
gate the way blocking decisions already are) -- the three-Scope split
answers "what are the numbers," dependency modeling would answer "why do
they move," and that's a real feature, not a field addition. Next in line
on the roadmap, after interactive scenario levers.

## Pasted context docs (shipped)

Nic's ask: "How can we make it so I can add sheets like this for context,"
showing a SharePoint/Excel task-tracker spreadsheet with per-row owner,
effort estimate, status, and notes -- real team-maintained tracking data
that isn't in Linear or Notion. Live SharePoint/Graph sync was judged too
big to build blind (Azure AD OAuth, a new credential type, a fourth
external API) versus Notion/Figma's simple personal-token REST calls, so
this ships as paste/upload instead: a `ContextDoc` model
(`scopeId, label, content, createdAt`) via `POST /api/context-docs` (list:
`GET`, remove: `DELETE /api/context-docs/:id`), fed into
`lib/estimate/context.ts` as a fourth context source alongside
`estimationContext`, Notion, and Figma, budgeted at 20k chars total and
mixed into the same `contextHash` -- editing or re-pasting a doc marks
every estimate stale the same way an edited Notion doc does. Told to the
model explicitly as a signal alongside Linear's own points, not
automatically correct (the team's own effort estimates in a sheet like
this can be as rough as Linear's points). UI: a third block in the
"Team & release context" section on `/forecast`, same paste-and-save
pattern as Notion/Figma URLs but for raw text instead of a link -- copy a
sheet's rows out of Excel/SharePoint and paste as text, no export format
required. Verified: a 10-assertion fixture on `buildReleaseContext`
(inclusion, per-doc and cross-doc char-budget truncation, doc content
change flips the contextHash, empty state), and a real-browser check
against local Postgres (add appears in the list with its char count,
remove returns to the empty state) -- this path needed no Linear/Notion/
Figma mocking since it's pure local data.

Also asked, not yet built: pulling context from "Hermes" (Nic's separate
agent), which keeps a decision/commitment ledger (`~/.hermes/ledger.db`,
e.g. "LED-004 Keep funding Pancho...", "LED-008 JSA/iTrack design
ownership: Lucy vs. Maru") plus a wiki. Recommendation given, not
implemented: treat it as a fifth *scoped, attributed* context source the
same shape as Notion/Figma/ContextDoc -- specific relevant ledger rows
tagged to a Scope -- not "the whole wiki," since dumping unscoped context
into the estimator prompt dilutes signal rather than adding it (the model
can't tell what's relevant from what's ambient). The real blocker is
reachability: the ledger is a local SQLite file on Nic's machine, not
reachable by the Railway-hosted app, so Hermes would need to expose an
API or push relevant rows -- mirroring the Bearer-token pattern already
built for Hermes calling `/api/audit`. Daily re-estimation is already
cheap thanks to content-hash caching (unchanged tickets/context are never
re-sent to the model); what's missing for "estimate changes almost daily"
isn't a redesign, just a cron trigger once there's a stable Hermes->Gap
App integration to trigger against.

## Notion integration (shipped)

Scopes can link Notion pages (requirements/scoping docs) whose content is
pulled as estimator context: `lib/notion.ts` (raw REST, no SDK; page ->
plain text with pagination + depth-2 nesting, 15k chars/page, 20k total),
`lib/estimate/context.ts` (assembles scope + estimationContext + Notion
docs; its hash is mixed into every item's estimate hash so context/doc
edits mark all estimates stale). Setup documented in README (integration
token + per-page Connections sharing). NOT yet fed into audits -- worth
doing next: transcripts compared against requirements, not just tickets.
Live Notion API verification pending first production use (sandbox
blocks api.notion.com, same as Linear).

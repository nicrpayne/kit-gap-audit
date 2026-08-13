# The Scope instrument

Companion to `docs/DESIGN-NORTH-STAR.md`. That document says what the
Instrument surface should feel like; this one says what **Scope** is, what it
is allowed to control, and where the model stops.

Scope answers one question: **what are we actually shipping?**

## The unit is a capability, not a ticket

A product manager thinks in capabilities — "Offline Capture", "Approval
Workflow" — and tickets are how those get built. Scope's first version worked
at the WorkItem level and was wrong for that reason: it was a beautifully
argued backlog visualiser, and a backlog is not a product.

So the surface is a **desk**. One channel per capability, feeding a master
section that is the release. Each channel is a fixed-size module: effort never
changes its size, only the light inside it. Muting a channel takes that
capability out of the release, and — as on any desk — the channel stays
exactly where it was.

## Where features come from

Linear has no first-class Feature entity. Scope derives one, from structure
rather than from language, and never by clustering titles or asking a model to
guess. `lib/scope/features.ts` is the only place that knows what a feature is.

| Source | Derived from | Status |
|---|---|---|
| **Linear** | the top of an issue's `parent` chain (Epic → Feature → Issue → Sub-issue) | real |
| **Hermes** | an open Finding no ticket represents | **candidate**, never accepted Reality |
| **Manual** | declared by hand in the app | **draft**, session-local — see below |
| **Unmapped** | work with no parent at all | not a capability — a coverage gap, shown as one |

Two details that matter:

- The chain is **walked to its root**, because a sub-issue's parent is another
  issue, not a feature. `rootParentOf` bounds the walk rather than trusting the
  data for acyclicity.
- **Unmapped work gets its own visible module.** Inventing a bucket for it
  would hide exactly the thing Scope should be surfacing: nobody has said what
  product capability this work serves.

### What this cost in code

Nothing structural. `lib/linear.ts` gained two fields on a query it already
ran — `parent { identifier title }` and `project { name }`. Before this pass
the app fetched neither, so feature discovery was not merely unbuilt, it was
impossible. **No Prisma migration was made** (see below for the one that is
eventually needed).

## ⚠ Before real Linear data flows in: the double-count

The dev fixtures deliberately model Feature issues as *references* — children
carry `parentIdentifier`, and the Feature issue itself is not in the fetched
set. Real Linear will not be so tidy.

**If the reorganised Linear returns Feature issues inside a Scope's own
filter, `buildForecastInputs` will count them as work alongside their
children.** A Feature issue with no estimate picks up the 1–7 day placeholder,
so a release with 8 features would silently gain ~30 days of phantom effort.

The fix is one filter — exclude issues that are parents of other in-scope
issues — but it changes forecast numbers, so it belongs in its own pass with
its own before/after evidence, not smuggled into a design change. It is the
single highest-value follow-up from this work.

## What Scope actually controls

**Real, and wired:**

- **Capability inclusion / exclusion.** Bypassing writes both halves of the
  truth: `bypassedFeatureIds` (the product decision) and the `excludedItemIds`
  the engine actually simulates. Written together, so they cannot disagree.
- **Three-point estimate override**, per work item, inside Feature Detail. The
  simulation reads `low/likely/high` off the spec it is handed, so substituting
  them is a pure input change. The stored `WorkEstimate` is never written.

Both are input substitutions on the existing path. **Monte Carlo sampling and
`runPortfolioSimulation` orchestration are untouched.**

**Real, but owned elsewhere — shown, never edited here:** capacity and context
switch (Portfolio), decision resolution (Decisions), release dates (Timeline),
the synthesized consequence (Forecast). Each appears only where it bears on the
composition, with a door.

**Not supported by the model, and therefore fenced:**

- **Release assignment (Beta / Production / Later).** There is no release
  entity a WorkItem can belong to. The control is drawn in Feature Detail,
  marked `Prototype`, and inert. `"Move Offline Capture to Production"` is a
  Scope operation and it is coming; today, taking the capability out of the
  Scenario is the honest version of the question.
- **Accepting a Hermes candidate.** Acceptance means writing a capability down,
  which needs the table below. Until then a candidate stays a candidate — and
  the work it implies keeps being counted, which is the safe way round.
- **Saving a manual capability.** A declared capability is real to the
  instrument and dies with the Scenario. The surface says so.
- **Committing anything to Reality.** Scope has no Commit button, because there
  is nowhere to write an exclusion.

## The migration this is standing in for

Two models, whenever features should outlive a session:

```
model Feature {
  id, scopeId, name, intent,
  source        // "manual" | "accepted_hermes"
  linearParentId String?   // set once reconciled to Linear
  createdAt
}
model FeatureWorkLink { featureId, source, externalId }  // @@unique
```

`composeFeatures` already takes drafts as an argument and merges them over the
Linear-derived set, so persisting them is a matter of loading rows into that
argument. The UI does not change.

## Visual → semantic map

Nothing is decorative. If it is drawn, it is derived.

| What you see | What it means |
|---|---|
| Channel **width/height** | nothing — fixed, so the composition stays learnable |
| Meter **level line** | this capability's expected load, `mean(range) ÷ capacity` |
| Meter **fill gradient** | light falling away from the level; the eye lands on the level, not the block |
| Meter **ticks** | a real scale in whole days, 4–6 graduations across the tallest |
| **Bracket** on the meter's right | the low-to-high range this could actually run |
| **Hatching** | placeholder estimates / unmapped work — the one texture, one meaning |
| Dashed violet border | Hermes candidate or manual draft — hypothetical, not Reality |
| Amber tag | a coverage gap, not a capability |
| Channel **dark, meter drained** | muted: out of this release, still in Reality |
| **Mint dot** on the switch | engaged and feeding the master |

Colour follows the suite rule — state, never category. Every capability that is
simply *in* the release is neutral warm white; violet means hypothetical, amber
means a gap, mint means engaged.

## Feature Detail

Five modes, each showing what the model holds or saying plainly that it holds
nothing: **Overview** (what it is, load, share, certainty, coverage, the fenced
release control), **Work** (the Linear issues, open and done — the only place
tickets appear in Scope), **Evidence** (why the machine believes it exists),
**Estimate** (where each number comes from, plus the estimate pad),
**History** (completions from stored records; it says outright that no
feature-level change log exists).

## Proofs

- `scripts/scope-forecast-proof.mjs` — 18 assertions over the real UI: bypass a
  capability, watch the release move, walk to Forecast and find the same
  hypothetical named as a capability, discard, both back on Reality. Plus the
  two honest negatives: a dominated scope where cutting moves nothing, and a
  declared capability with no work that changes no date.
- `scripts/scope-truth.mjs` — re-derives the cutting-helps / cutting-does-not
  cases against the live payload.

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

So the surface is a **tray**. Capabilities are physical tiles seated in a lit
bay that IS this release, with a dark shelf beneath it for what has been taken
out. You pick a tile up, the bay makes room, you carry it to the shelf, and the
release recomposes around the hole it left. Manipulating the object is
manipulating the model: a tile leaving the tray removes its work items from the
simulation on the next frame.

### Three materials, one glance

| Material | What it is | How it reads |
|---|---|---|
| **Seated** | accepted Reality | solid, lit from within, contact shadow — it is touching the surface |
| **Spectral** | a Hermes candidate or an unsaved draft | hovers above the tray, translucent, dashed edge, a cast shadow with a gap beneath it |
| **Raw** | unmapped work | hatched amber, deliberately not tile-shaped enough to be mistaken for a finished capability |

The spectral state carries a precise fact that took three versions to land:
a candidate's **work is already counted in the forecast**, but its existence as
a capability is not settled. So it belongs in the bay while visibly not being
seated in it. Accepting one sets it down — and changes no simulation input,
because nothing about the work changed.

Tile **size** carries relative load in three discrete steps, not continuously.
A tile that resizes by a few pixels every time an estimate moves is a chart;
three sizes is a hierarchy you can learn and recognise across sessions.

## The drag is the instrument

Libraries were chosen after inspecting the shipped packages and compiling them
against this repo's React 19.2.7, because the doc sites were unreachable from
the build environment.

| Choice | Why | Why not the alternative |
|---|---|---|
| **@dnd-kit/core 6.3.1** | has exactly the set this surface needs — pointer + keyboard sensors, `pointerWithin` collision, a portalled `DragOverlay`, and screen-reader `announcements`. Ships complete types, and a probe file compiled clean on React 19. | `@dnd-kit/react` 0.5.0 is the maintainer's stated direction and explicitly supports React 19, but it is 0.x. Where the drag *is* the product, proven behaviour beats a newer API. Worth revisiting when it reaches 1.x. |
| **motion 13.1.0** | `layout` FLIP so neighbours make room continuously, springs that settle rather than bounce, `AnimatePresence`, and `MotionConfig reducedMotion="user"` — which honours the OS setting for every animation on the surface with one wrapper. | — |
| **no `@dnd-kit/sortable`** | order in the bay is derived from load, not user-arranged. There is nothing to sort. | — |
| **no GSAP** | Motion's layout + spring already cover displacement and settle. A second animation runtime would duplicate ~60kb for behaviour already available. | Revisit only if the settle feel proves inadequate in use. |

### The one structural decision

The source tile deliberately does **not** carry dnd-kit's transform. It becomes
a depression in the tray with the same footprint, and the real tile flies in a
`DragOverlay`. That keeps Motion's layout animation free of a competing
transform, gives the lifted object its own physics, and — most importantly —
stops the bay collapsing under the hand, so the composition stays spatially
continuous.

### Motion states

`rest → hover → pickup → carry → armed → drop → settle → recomposed`, and
`cancel` returning the tile to exactly where it came from. Each is a distinct
treatment, not a single transition: pickup trades the contact shadow for a cast
one, the shelf arms in violet as the hand approaches, and the master's date
animates in a beat *after* the tile lands — the object moves first, the number
follows. `scripts/scope-drag-record.mjs` records video and samples every one of
those states as its own frame.

**A note on the spectral float:** it is a static offset, not a loop. An element
that never comes to rest is never "stable" — it blocks pointer actionability,
defeats assistive tooling and composites forever. The life lives in the shadow
beneath it, which nothing needs to interact with.

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

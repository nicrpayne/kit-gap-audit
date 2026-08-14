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

So the surface is a **chassis**: one continuous instrument deck into which
capability modules are seated, with a recessed shelf directly beneath it for
what has been taken out of this release. Manipulating the object is
manipulating the model: a module leaving the deck removes its work items from
the simulation on the next frame.

The **seat** is the whole physical vocabulary. Every module occupies a recess
cut into the deck; lifting one leaves its empty seat behind; a candidate hovers
above a seat it has not accepted; a valid destination is nothing more than a
new seat opening between modules, at the position the module will truly take.
There is deliberately no dropzone language anywhere — no perimeter highlight,
no giant labelled target.

### The removal bay

The destination is a **cassette cut into the chassis**, not a drop column. At
rest it sleeps: no dashed perimeter, no instruction, nothing but two machined
guide rails at the threshold of visibility. It wakes on real pointer geometry —
`shelfPull` runs 0→1 over the last ~320px of actual approach — and the rails
illuminate, the label warms toward violet, and a receiving seat rises into view
and deepens. Only at contact does it arm, and only then does it say anything.
Crossing the exclusion boundary is therefore progressively *intentional*
rather than validated after the fact.

### The staging is the argument

The consequence is **staged**, and the order is what the instrument is
claiming: the object moves first, the machine recomputes second, the
interpretation arrives last.

| Beat | At |
|---|---|
| the module lands in its destination and settles | 0ms (240ms drop) |
| the deck recomposes, closing the vacated seat | continuous, Motion `layout` |
| **release load** resolves | +240ms |
| **landing date** resolves | +420ms |
| **scenario impact** illuminates | +580ms |

In the dominated case the date does **not** move, and nothing pretends it did:
the date is keyed on its own value, so an unchanged date never re-animates and
stays spatially still. Only the caption re-arrives — "held — it waits on
Platform" — which is how the machine says *I recalculated; the answer is the
same*.

### Four materials, one glance

Hue is **material, not measurement**. Everything that is accepted Reality and
live in this release shares one signal colour, because those modules are all
the same kind of thing. Certainty is not a hue — it is legible in the shape of
the distribution, which is where it actually lives.

| Material | What it is | How it reads |
|---|---|---|
| **Seated** | accepted Reality, carrying work | graphite face, cyan signal in the edge, sigil and trace; a real top facet and hard contact with the deck |
| **Spectral** | a Hermes candidate or an unsaved draft | violet, dashed, translucent enough to see the recess through, hovering above its seat with a shadow gap and no contact edge |
| **Raw** | unmapped work | amber and hatched, with **no specular facet** — deliberately not a finished faceplate |
| **Parked** | out of this release, still Reality | powered down: graphite, unlit sigil, neutral trace, and a visibly *cut* conductor across the top edge rather than a faded copy of itself |

The colour law for the whole surface:

| Colour | Means |
|---|---|
| **cyan** (`--i-signal`) | accepted capability material, live in this release |
| **violet** | scenario, hypothetical, unsettled — candidates, drafts, the removal bay |
| **amber** | unmapped work, constraints, structural stops |
| **mint** | movement in your favour |
| **graphite** | Reality, baseline, powered down |

Deliberately cooler than mint, so "this is seated and powered" can never be
misread as "this moved in your favour".

The spectral state carries a precise fact that took three versions to land:
a candidate's **work is already counted in the forecast**, but its existence as
a capability is not settled. So it belongs in the bay while visibly not being
seated in it. Accepting one sets it down — and changes no simulation input,
because nothing about the work changed.

### The light law

> Nothing glows because it exists. Light means active, changing, uncertain,
> constrained, or being touched.

A seated module at rest has no outer glow at all. What it has is a specular
top edge at 42%, which goes to full in ~120ms when a pointer arrives — the
edge answers *before* the body moves. There is no perpetual breath anywhere on
the surface; the one thing that emits continuously is the trace's phosphor,
and a trace only exists where there is real estimate data behind it.

## The module, and the deck it sits in

Every module is the same size. Load is not encoded in the footprint, because a
tile that resizes whenever an estimate moves is a chart pretending to be an
object. What varies is what is *drawn on* the module:

| Element | Derived from |
|---|---|
| **sigil** | a stable hash of the capability's name — an identity anchor, deliberately not a domain icon, which would be a semantic claim the model does not make |
| **load readout** | `mean(low, likely, high) ÷ capacity`, and its share of the release |
| **trace** | the triangular density of the summed three-point range: horizontal extent = spread against the release's widest, peak height = concentration, peak position = `(likely − low) / (high − low)` |
| **trace scale** | the actual `low` / `likely` / `high` in days, so the curve is readable rather than decorative |
| **accent** | MATERIAL, not measurement — cyan for accepted, violet for unsettled, amber for unmapped, graphite for parked. Certainty is not a hue |
| **dots** | done work over total mapped work, capped at six |

The trace lives in a **recess cut into the faceplate** rather than floating on
it, which is what separates an instrument readout from a sparkline in a card.

### The deck sizes itself to the release

A chassis shows its bays. `packDeck` lays every release out in **two rows**,
choosing the column count so at most one bay is left spare, and whatever is
spare is drawn as an empty seat carrying a machined registration mark. A
four-capability release therefore reads as "four modules racked, four bays
open" — which is true — instead of as a short row floating in the middle of a
tall empty box. Rows divide the rack's height rather than being stamped out at
a fixed size, so a release always fits its chassis and nothing is clipped; only
past two rows does the deck become a scrolling surface.

Crucially the deck is sized from **every capability the release has**, seated or
not. Taking one out leaves its seat empty; it does not re-cut the chassis. The
geometry is a property of the release, not of the current scenario.

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

`rest → hover → press → pickup → carry → armed → drop → settle → recomposed`,
and `cancel` returning the module to exactly where it came from. Each is a
distinct treatment, not one transition with different durations.

| State | Treatment | Spring |
|---|---|---|
| **hover** | the specular edge goes to full *first* (120ms), then the body lifts 3px | 380 / 34 |
| **press** | 1.5px into the seat, contact shadow tightens, no travel back through zero | 900 / 42 (~90ms) |
| **pickup** | releases from the seat, face catches more light, cast shadow separates, the vacated seat stays visible | 420 / 36 |
| **carry** | attached to the pointer via `DragOverlay`; a velocity lean capped at **±0.9°** — enough to feel mass, never a cartoon | 300 / 28 |
| **armed** | the bay's rails and receiving seat, driven by real pointer distance | 180ms tween |
| **drop** | 240ms `cubic-bezier(0.25, 0, 0.2, 1)`, then neighbours settle by Motion `layout` | 330 / 33 |

Everything lands inside 150–350ms, critically damped: no wobble, no overshoot,
no elastic bounce. The eye can follow the object at every moment.
`scripts/scope-drag-record.mjs` records video and samples every state as its
own frame. `MotionConfig reducedMotion="user"` plus the `.instrument *` CSS
guard flatten all of it when the OS asks.

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

## The distribution display

The signature object. One component, `DistributionDisplay`, drawn once and
opened at two sizes — small in the module, large in Feature Detail — so the
deck and the editor can never drift.

| What you see | What it means |
|---|---|
| **Horizontal position** | days. The drawn span IS the capability's low→high range |
| **Drawn width** | that range against the release's widest, so a badly-bounded capability is visibly wider than a well-bounded one across the whole deck |
| **Curve** | the triangular density of the summed three-point range |
| **Peak height** | concentration — what a density normalised to unit area does. A taller curve is a *surer* capability, never a bigger one. Size is the readout above it |
| **Peak position** | `(likely − low) / (high − low)` |
| **Locator + its number** | the likely value, riding its own hairline like a marker readout |
| **Numbers at the window's foot** | `low` and `high` in real days, placed at the exact x the curve reaches — the labels *are* the axis |
| **Dashed grey curve behind** | Reality's own distribution, when a Scenario re-estimate has moved this one off it |
| **Three faint hairlines + a floor** | reference marks. Enough to read a curve against; not a chart grid |
| **Phosphor bloom on the stroke** | the one emissive thing in the window, and only where real estimate data exists |

The peak floor is `0.62`, so even the widest capability fills its window rather
than smearing along the glass. The ordering still reads; the display is never a
flat line pretending to be a distribution.

When a Scenario re-estimates a capability, the active curve **morphs** to its
new shape on a spring — never a jump cut, never animated fake samples — and
Reality stays behind it as a ghost. Both curves are real data.

## Visual → semantic map

Nothing is decorative. If it is drawn, it is derived.

| What you see | What it means |
|---|---|
| Module **width/height** | nothing — uniform, so the composition stays learnable |
| Module **accent** | material: cyan accepted, violet unsettled, amber unmapped, graphite parked |
| **Specular top edge** | a finished faceplate. Brightens first under a pointer; absent on raw work |
| **Cut conductor** across a module's top | parked: the signal path is broken, not merely faded |
| **Hatching** | placeholder estimates / unmapped work — the one texture, one meaning |
| Dashed violet border, module floating with a shadow gap | Hermes candidate or manual draft — hypothetical, not Reality |
| **Empty recess** in the deck | a seat: a module was lifted from here, or could be set down here |
| **Registration mark** in a recess | a bare bay — a mounting position with nothing racked in it |
| **Guide rails** in the removal bay | the receiving mechanism, lit in proportion to a real approach |
| **Amber conductor** under the deck | the lock rail: real open decision gates, ending in the measured floor |
| Lock rail **illuminated** | the release is dominated — cutting scope can no longer reach the date |

## The lock rail, and what it cannot say

A mechanical stop beneath the release: mostly black, one engraved amber
conductor with machined graduations, a compact lock indicator per open gate,
and the measured FLOOR as its terminal. Scope does not own decisions, so
everything here is read-only with a door to Decisions.

The conductor and the terminal illuminate **only when the release is actually
dominated**. Individual locks stay quiet, and that is a deliberate limit rather
than a design preference: `readDominance` attributes the floor to open
decisions and dependencies *collectively*. The model does not know which single
gate sets it. Illuminating one anyway would be invented attribution that a user
could act on, so the rail says what is true — there is a structural stop under
this release — and no more.

## The signal strip

Not four equal cards. One thin strip reading left to right: what Scope
**inherited** (capacity, context switch — quiet, with doors to Portfolio),
what the current composition **costs** (load moved, landing moved — dark until
there is a scenario, and resolving on the master's own schedule so the whole
instrument answers in one voice), then the actions as machined controls.

Load delta is signed rather than prefixed, because a re-estimate can make a
release *heavier*: `−3.8d removed` and `+0.8d added` are both real outcomes.

## Feature Detail

Summoned as a **docked plugin panel** on the right rather than a floating
window: it belongs to a module you selected, so it sits alongside the deck
rather than covering it. Picking a module up closes the panel — it is docked
over the destination, and lifting something is a statement that you are done
reading about it.

Under the header sits a fixed **module head** that every mode shares: the
capability's source and state, a large instance of the same distribution
display the deck draws, and three tight readouts (load, share, certainty). The
take-out control and the door to Forecast are pinned to the footer, reachable
from every mode. The result is an editor opened *for the object*, not a page
about it.

Because the head carries the aggregate, the modes no longer restate it —
Overview lost about a third of its prose, and **Estimate** is now what it
should be: provenance per item, and the one lever Scope owns. Re-estimating
morphs the head's display while Reality stays ghosted behind it.

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

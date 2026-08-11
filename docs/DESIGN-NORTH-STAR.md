# Design north star

Companion to `docs/PRODUCT-VISION.md` — that document says *why* this app
exists and what it's for; this one says what it should *feel like* to use,
and the concrete rules that keep it that way as more of it gets built.

## Two modes under one roof

This app has always had one visual identity: the **Workbench** — warm
cream paper background, deep green nav, serif/editorial headings
(`--color-paper`, `--color-ink`, `--font-display`, see `app/globals.css`).
That doesn't go away and doesn't get redesigned. `/audit`, `/decisions`,
`/forecast`, `/reports`, `/scopes` all stay exactly as they are.

`/portfolio` is the first route in **Instrument Mode** — a dark, graphite
simulation environment (`.instrument`-scoped CSS variables, same file).

**Instrument Mode owns the viewport.** This is the rule that replaced the
original "a dark panel inside the light page" arrangement, and the reason
is a real one: simulating is something you enter, not something you peer
at through a letterbox. A cream document frame around a dark console makes
the console read as a widget embedded in somebody else's application. So
on an Instrument route the Workbench's 256px nav stands down entirely
(`components/Nav.tsx` returns null), the page renders no eyebrow, heading
or intro paragraph, and the surface is fixed to the full viewport.
Navigation becomes a 48px icon rail that can be hidden outright (`⌘\`), so
the simulation can take the whole screen when it is being presented.

Which routes are Instrument Mode lives in one place, `lib/shell/mode.ts`,
shared by both the Workbench nav and the Instrument rail. **This is a
presentation switch only** — the route table, the destination list, and
what any page can reach are all unchanged. Adding a route to that list
changes what chrome it wears, nothing else.

Instrument Mode is **dark-first, and only dark**. There is no parallel
light Instrument theme and none should be built: the surface's whole
vocabulary — lit travel on a control, recessed meter windows, a luminous
ridge over a dark field — depends on darkness, and maintaining an inverted
twin would cost more than it could ever return. The light Workbench
continues to exist on its own routes.

Never mix the two languages inside one component: a Workbench-styled
control does not belong inside the Instrument, and vice versa. That
includes type — the Workbench's serif display face has no place on the
Instrument, where numerals are the voice (see below).

Why a second surface at all, instead of reskinning everything: the
Workbench is for *reading* (audits, decisions, reports — mostly text,
mostly calm). The Instrument is for *playing* (direct manipulation, rapid
comparison, live numbers) — a genuinely different task with a genuinely
different visual job, the same way a DAW's mixer looks nothing like its
file browser despite being one application.

## Borrow the interaction, not the costume

The Instrument's inspiration is professional creative tools — DAWs,
FabFilter-style audio plugins, Ableton's session view. What's borrowed is
**how they behave**, never how they look:

- Direct manipulation — touch the thing you mean, not a form that
  represents it.
- Immediate feedback — the Forecast updates as you interact, not after a
  submit.
- Baseline vs. hypothetical, always visible together — Ableton never lets
  you forget you're in a clip that hasn't been committed.
- Tactile, precise controls — a capacity fader you can drag, arrow-key,
  fine-adjust and reset, with its value always legible, beats a mystery
  button.
- Progressive disclosure — a dense professional tool doesn't dumb itself
  down, it *layers*.
- Contextual inspection — select something, get detail about that thing
  specifically, in one consistent place.
- Clear state awareness — you always know whether you're looking at the
  saved thing or an experiment.

The tactile *feel* of those tools is wanted here, and the physical
vocabulary that comes with it is allowed — bevels, travel, ticks, recessed
windows — under one hard condition, which is the next section.

**Explicitly forbidden**, because none of it is what makes those tools
good: decorative waveforms, spectrum analysers, BPM/transport playback
controls, RGB or neon glow, cyberpunk chrome, and any control that does
not control something. If a component's only reason for existing is "it
looks like a mixing console," cut it. The Instrument earns its identity
from precision and responsiveness, not from costume.

## Controls are real, or they are not controls

The single rule that keeps this surface honest:

> **If it looks grabbable, it must change a variable the simulation
> reads. If it is a computed result, it must not look grabbable.**

This is enforced physically, not by labelling, so it can be read without
reading:

| | Input / control | Derived output / meter |
|---|---|---|
| Component | `components/instrument/Fader.tsx` | `components/instrument/Meter.tsx` |
| Surface | **raised** (`.i-control`) — lit from above, bevelled | **recessed** (`.i-meter`) — cut in, inset shadow, unlit |
| Handle | a cap with grip ridges, `cursor: grab` | none, `cursor: default` |
| Semantics | real ARIA `slider`, arrow keys, Shift = fine, double-click resets | plain text |

The levers that exist today are **capacity** (per Scope, as anonymous
scenario FTE) and **context-switch cost** (portfolio-wide) — both faders in
the Instrument Bay — plus **target date**, which is scrubbed directly on
the Forecast Field because a date belongs on the timeline, not abstracted
into a knob. Nothing else gets a fader. When a future lever becomes real
(scope, dependency assumptions, resource allocation), it gets one then —
never before, and never to fill out the bay.

Momentum, Confidence, Spread and Open gates are **consequences**. They may
be given rich instrument treatment, but they take no `onChange`, and
nothing about them may imply you can turn Momentum up.

## Momentum is a direction, not a score

Momentum answers "are we moving, and which way" — and it does so from the
stored `Report` record, not from a new scoring system.
`lib/momentum/trend.ts` is a thin reading of the existing
`lib/momentum/compute.ts` (same deltas, same thresholds) into a direction
(`rising` / `falling` / `steady` / `mixed`), the factual delta behind it,
and the period it covers. There is deliberately **no 0–100 momentum
number**: "72/100" is unfalsifiable and unactionable, while "rising — 11
days sooner over 14" is a claim you can check against the record.

Attribution comes only from values that were actually stored
(`resolvedSinceLastCount`, `shippedCount`, the date and confidence deltas).
Never infer a cause that isn't in the data.

One state is called out explicitly because it is the most useful thing this
readout can say: **forecast date unchanged, confidence improving.** That is
a project whose trajectory got better before its headline moved, and
without naming it a reader sees "no change" and hears "no progress."

## Simple surface, deep on demand

The rule from `docs/PRODUCT-VISION.md`, applied to layout: nobody should
need to understand P10/P50/P85/P90, inferred-vs-explicit capacity, Monte
Carlo mechanics, or context-switch math to operate `/portfolio`. Concretely:

- The Forecast Field shows a likely date, a visual uncertainty range, and
  a delta — never a raw percentile label. Percentile detail lives in a
  hover title/tooltip and the Inspector, never as the primary text.
- The Capacity fader shows resolved FTE and Reality's own value — not
  "capacitySource" or a fallback-chain explanation. That explanation is
  one Inspector paragraph away (`explainScope`, `lib/portfolio/explain.ts`),
  never the default view.
- Per-person allocation detail is a drawer opened from the state bar, not
  a permanent panel. The fader is the fast answer ("what if we had more
  people"); the grid is the precise one ("who, exactly, and how split").
- One persistent Inspector panel, not a stack of modals — depth is
  reached by *selecting*, not by navigating away from the thing you're
  looking at.

## The Forecast Field is the visual center

Every Scope lives on **one shared temporal axis, always** — there is no
"overlay all on one axis" toggle any more; the overlay *is* the model.
Isolating each Scope on its own axis was the old design's actual usability
bug: it made "how do these products compare" a mental-math exercise
instead of a glance.

A Scope is drawn as **the actual shape of its outcome distribution**,
binned straight out of `SimulationResult.completionDaysSorted` — the same
5000 trials the forecast is computed from. This replaced the earlier thin
band-and-dot, and the reason is that the band was a summary of a shape we
already had. A wide flat ridge *is* an uncertain project; a tall narrow one
*is* a confident one; you read it before you read any number.

Three things are drawn over that mass, and each is a fact, not decoration:

- the **P50 stem**, where the outcome balances
- **Reality's own ridge**, hollow and dashed, once a scenario moves things
  — so you can see both how far the mass moved and whether it also tightened
- the **hatched tail past the target date** — that hatched area *is* the
  probability of missing, which makes "how sure are we" spatial before
  anyone reads the percentage

Hatching is the Instrument's only texture and means exactly this one thing.

Above the rows, one headline: **the last date anything lands on**, plus
which Scope is setting it. Naming the gating Scope is not garnish — without
it, a scenario that pulls two Scopes in but leaves the headline still says
"unchanged" and reads as broken rather than gated.

## Reality vs. Scenario is always visually distinct

When no Scenario is active, the Field shows one clean state — Reality's
own forecast, nothing else competing with it. The moment a Scenario
exists, Reality does not disappear: it becomes a muted ghost reference (a
thin tick + "Reality {date}" label) next to the now-active, colored
Scenario forecast, on the Field itself — not just as a caption. The
toplevel toolbar pill (`CURRENT` / `SCENARIO · UNSAVED`) restates the same
fact in words, because color alone is never sufficient (see
Accessibility, below). Position transitions on a date change animate over
150–300ms — enough to read as "this moved," never theatrical — and every
such transition respects `prefers-reduced-motion` (`.instrument *`
collapses to near-zero duration under that media query, `app/globals.css`).

## Color means state, not category

A small, restrained semantic palette (`.instrument`'s `--i-*` tokens),
used consistently everywhere rather than assigned per-Scope:

| Token | Meaning |
|---|---|
| `--i-text` (warm white) | Neutral structure, Reality's own forecast when no Scenario is active |
| `--i-reality` (muted gray) | Reality shown as a ghost reference once a Scenario exists |
| `--i-violet` | Active Scenario / hypothetical state |
| `--i-mint` | Favorable movement (earlier, higher confidence) |
| `--i-red` | Unfavorable movement, blocking risk, over-allocation |
| `--i-amber` | Uncertainty, a commit-time warning worth reading |

A Scope's identity is its *name*, not a color — the old build cycled a
five-color palette per row; this one doesn't need to, because rows are
never compared by color, they're compared by position on the shared axis.

## Dependencies, without a graph

`dependsOnScopeIds` is real and matters (it's *why* iTrack moves with
Platform and JSA doesn't), but a dependency graph is the wrong visual for
2–4 Scopes. Instead: a small "depends on X" badge under the dependent
Scope's name (clickable — jumps the Inspector to X), and the Inspector's
"Why" section narrates the actual relationship in a sentence
(`lib/portfolio/explain.ts`) when it's relevant to whatever's selected.

## The Inspector: one panel, not a modal per question

The right-hand rail of the Instrument answers "why did this move," "why
is the range this wide," "what depends on this," "what did I just
change" — for whichever Scope is currently selected, in one place, always
present. Selecting a Field row, a dependency badge, or (via keyboard)
tabbing to a row and pressing Enter all update the same panel; nothing
here opens a modal.

Two explanation layers, deliberately ordered:

1. **Deterministic first** (`explainScope`) — built from data already in
   the browser (the delta, the dependency relationship, the active
   Scenario parameters), zero network calls, always available, always
   truthful about exactly what it can see.
2. **Hermes second**, only for what `/api/forecast/ask` can actually,
   truthfully answer today — which is questions about the current *saved*
   forecast. It has no visibility into an unsaved Scenario, and the
   Inspector says so explicitly rather than implying otherwise. Don't
   build a bigger promise than the backend can keep; a small, honest
   affordance beats a impressive-looking one that quietly lies.

## The Capacity fader replaces the opaque "+1 developer" button

The bug that motivated this phase: clicking "+1 developer" changed two
dates and left three unanswered questions (is this active? what's Reality
vs. Scenario? why did iTrack move but not JSA? how do I undo *just* this?).

The Capacity fader answers all of them by being continuous and always
readable: it shows the Scope's resolved FTE, Reality's own value as a notch
on the slot and in the caption, and lit travel for the part you added.
Dragging it maintains exactly **one** scenario ghost per Scope whose FTE
*is* the added amount — a continuous control mapped onto one hypothetical
person, rather than a pile of 1.0-FTE placeholders. Its zero point is
Reality-with-your-ghost-removed, so "how much did I add" stays truthful
even after the switch-cost lever has moved everyone's effective
contribution.

Commit semantics are untouched by any of this: on an allocations-sourced
Scope the ghost becomes a real Person + Allocation; on an aggregate Scope
it is folded into a new `explicitTeamCapacity` and never becomes a Person
row. A Scope's `capacitySource` still never flips as a side effect. See
`docs/SCENARIO-MODEL.md`.

## Target date stays an evaluation lever, and lives on the timeline

Changing a target date never re-runs the simulation — it's a pure lookup
against an already-computed distribution (`percentileDay` /
`confidenceAtDay`, `lib/forecast/simulate.ts`). It is therefore *not* a
fader, and must never look like one: it is a flag you scrub along the
Forecast Field itself, carrying its own live probability, because a date
belongs on the axis where dates are.

Scrubbing is local until explicitly saved — the flag offers "Save target"
only once it differs from what's stored, so exploring a date can't
accidentally write one.

## What "beautiful" means here

Linear-level typography and spacing discipline. One dominant
visualization per screen, the way a FabFilter plugin has one focal
control surface, not six competing meters. Ableton-level clarity about
which state (saved vs. experimental) you're looking at. Restrained,
purposeful color — most of the surface is graphite and warm white;
violet/mint/amber/red appear only when they mean something. No giant
corner radii, no glass, no gradient soup, no decorative shadow stacks —
crisp borders, precise 4/8px-rhythm spacing, real hierarchy from type size
and weight rather than boxes. "Machined, not generic."

## Accessibility, because this runs on a screen-share

- State (Current vs. Scenario) is always stated in **text**, never color
  alone.
- Primary dates and deltas are large enough to read across a shared
  screen at a glance.
- Every interactive row is keyboard-reachable and operable (`tabIndex`,
  `Enter`/`Space`, visible focus ring) — a live demo sometimes means
  driving from the keyboard, not a mouse.
- Critical information is never tooltip-only; a tooltip adds precision
  (an exact date), it never gates access to the underlying fact.
- `prefers-reduced-motion` is respected everywhere in the Instrument.

## Performance is a design constraint, not an implementation detail

The reason direct manipulation can feel instant at all: one expensive
fetch per page load (`GET /api/portfolio/inputs` — Linear + findings +
capacity, once), then every interaction re-runs the same pure simulation
functions **in the browser**, debounced ~120ms, zero network round trips.
This is not an optimization to revisit later — it's the reason the whole
"play the project" interaction model is possible at all. Nothing in the
Instrument's design should ever require moving that loop back to the
server.

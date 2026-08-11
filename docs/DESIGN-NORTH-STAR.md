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

`/portfolio` is where a second surface lives *inside* that shell: the
**Instrument** — a dark, graphite simulation environment
(`.instrument`-scoped CSS variables, same file) that opens like a
precision tool sitting on the workbench, not a different app. The page
around it (nav, heading, intro copy) stays warm Workbench. The Canvas,
Inspector, and Footer inside the `.instrument` wrapper are dark. Never mix
the two inside one component — a Workbench-styled control does not belong
floating inside the Instrument, and vice versa.

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
- Tactile, precise controls — a capacity stepper with a legible current
  value beats a mystery button.
- Progressive disclosure — a dense professional tool doesn't dumb itself
  down, it *layers*.
- Contextual inspection — select something, get detail about that thing
  specifically, in one consistent place.
- Clear state awareness — you always know whether you're looking at the
  saved thing or an experiment.

**Explicitly forbidden**, because none of it is what actually makes those
tools good: fake knobs, decorative waveforms, giant circular gauges,
BPM/transport-style playback controls, spectrum analyzers, VU meters, RGB
or neon glow, fake-hardware skeuomorphism, cyberpunk chrome. If a
component's reason for existing is "it looks like a mixing console," cut
it. The Instrument earns its identity from precision and responsiveness,
not from costume.

## Simple surface, deep on demand

The rule from `docs/PRODUCT-VISION.md`, applied to layout: nobody should
need to understand P10/P50/P85/P90, inferred-vs-explicit capacity, Monte
Carlo mechanics, or context-switch math to operate `/portfolio`. Concretely:

- The Forecast Canvas shows a likely date, a visual uncertainty range, and
  a delta — never a raw percentile label. Percentile detail lives in a
  hover title/tooltip and the Inspector, never as the primary text.
- The Capacity Control shows Reality FTE, Scenario FTE, and a delta — not
  "capacitySource" or a fallback-chain explanation. That explanation is
  one Inspector paragraph away (`explainScope`, `lib/portfolio/explain.ts`),
  never the default view.
- One persistent Inspector panel, not a stack of modals — depth is
  reached by *selecting*, not by navigating away from the thing you're
  looking at.

## The Forecast Canvas is the visual center

Every Scope lives on **one shared temporal axis, always** — there is no
"overlay all on one axis" toggle any more; the overlay *is* the model.
Isolating each Scope on its own axis was the old design's actual usability
bug: it made "how do these products compare" a mental-math exercise
instead of a glance. A row shows, left to right: name + dependency badge,
likely date + delta + confidence, then a band track (P10–P90 range, a
denser P50–P85 band, a P50 dot, a dashed target marker). No dashboard-card
grid, no separate "Confidence" or "Momentum" card competing for attention
— one visualization, one place to look.

## Reality vs. Scenario is always visually distinct

When no Scenario is active, the Canvas shows one clean state — Reality's
own forecast, nothing else competing with it. The moment a Scenario
exists, Reality does not disappear: it becomes a muted ghost reference (a
thin tick + "Reality {date}" label) next to the now-active, colored
Scenario forecast, on the Canvas itself — not just as a caption. The
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
present. Selecting a Canvas row, a dependency badge, or (via keyboard)
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

## Capacity Control replaces the opaque "+1 developer" button

The bug that motivated this phase: clicking "+1 developer" changed two
dates and left three unanswered questions (is this active? what's Reality
vs. Scenario? why did iTrack move but not JSA? how do I undo *just* this?).
The Capacity Control answers all four in place: Reality FTE, Scenario FTE,
a `[−] +N.0 FTE [+]` stepper with the running delta always visible, and a
Reset. Decrement is deliberately the smallest safe operation — it removes
only scenario-added anonymous capacity from the current session, never a
named person from an inferred aggregate (that's unknowable, see
`docs/SCENARIO-MODEL.md`). The quick "+1"/"+2" actions still exist as
secondary shortcuts, but they update this same visible control — nothing
in this app fires an invisible change any more.

## Target date stays an evaluation lever, visually

Changing a target date never re-runs the simulation — it's a pure lookup
against an already-computed distribution (`percentileDay`/
`confidenceAtDay`, `lib/forecast/simulate.ts`). The control reads
`TARGET / date / Probability by target / N%` specifically so it can't be
misread as "the forecast changed" — it's a different kind of lever than
capacity, and should never look identical to one.

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

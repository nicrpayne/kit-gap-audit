# Build brief: design language + momentum features

Written for a Claude Code session on `nicrpayne/kit-gap-audit`. Companion
to `CAPACITY_POOL_AND_PORTFOLIO_BUILD_BRIEF.md` — read that first if you
haven't, since some of this depends on it. Two mockup screenshots exist
showing the target look (a Cowork conversation produced them); if Nic has
attached them to this message, treat them as the visual source of truth
over the prose below wherever they conflict.

## When to build this relative to the other brief

Most of what's here does **not** depend on the capacity-pool/portfolio
work — it can be built against the existing single-scope `/forecast`
page as-is, in a separate branch, in parallel with or after that brief's
Phase 1. Only the last item below (applying this to `/portfolio`)
genuinely needs that brief's Phases 1-3 done first, since portfolio rows
don't exist until then.

**Recommended sequencing:** if the capacity-pool branch is mid-flight,
don't merge this into it — let that branch finish Phase 1 and get
reviewed first (it already has an explicit checkpoint there). Do this as
its own branch against `/forecast` and `/reports`, then apply the same
pattern to `/portfolio` once it exists. Two large efforts on one branch
at once is how things get hard to review.

## Design philosophy (apply everywhere, not just to new screens)

- **One hero stat per screen.** Everything else is quieter and smaller.
  Resist the urge to give five numbers equal visual weight — pick the
  one thing that matters most on this screen and make it big.
- **Progressive disclosure over density.** Secondary-but-real signal
  (why something moved, how confidence trended separately from the
  date, a longer history) lives one tap away, not competing for
  attention by default. The rule of thumb: if you can't explain why
  something is visible at first glance without scrolling, it goes
  behind a tap.
- **Momentum over snapshots.** Wherever there's history to compare
  against (and there almost always is — `Report` is already immutable
  and timestamped), show the trend, not just the current value.
  Stillness is itself a signal worth surfacing, not just movement.
- **Say it like a person would.** Betting-odds phrasing over raw
  percentages where it fits ("you'd win this bet 62 times out of 100"
  reads more honestly than "62% confidence" for what a Monte Carlo
  simulation actually is). Attribution sentences over bare deltas
  ("12 days sooner, mostly because 4 tickets got real estimates" beats
  "-12 days").
- **Conversational affordances, not just data.** Chips that either
  change something and show a result ("Try") or ask something and get
  an explanation ("Ask") — same interaction pattern, different intent,
  visually distinguished (icon is enough, don't over-engineer the
  distinction).
- Keep every existing hard constraint: flat surfaces, no gradients/
  shadows/blur, restrained 2-3 color use with semantic meaning, thin
  hairline borders, sentence case, the existing serif-heading/
  mint-green/dark-sidebar visual identity extends rather than gets
  replaced wholesale.

## Features to build

### 1. Hero stat + betting-odds framing

Replace the current dense "likely/earliest/latest + confidence %" block
with: a large date as the single biggest element on the page, and the
confidence number rephrased as odds ("you'd win this bet N times out of
100") in a small pill beneath it. Pure presentation — no new data needed,
`computeForecast`'s existing confidence-at-target output just gets a new
copy template.

### 2. Momentum chip — collapsed/expanded

A single chip, collapsed by default, sitting just below the hero:

- **Collapsed:** a small inline sparkline (see #4) + one line ("12 days
  sooner than last week") + a chevron. This is the only thing visible
  by default.
- **Expanded (on click/tap):** reveals two more lines — the attribution
  sentence (#3) and the confidence-momentum line (#5), which are *not*
  shown until expanded.

This is the concrete implementation of "progressive disclosure" above —
don't build a version where attribution/confidence-momentum are always
visible; the whole point is that they're one interaction away.

### 3. Attribution ("what moved it")

Compute this by diffing the current `computeForecast` result against the
most recent prior stored `Report` for the same Scope (or a lighter
periodic snapshot if reports aren't generated often enough to be
useful — worth checking real report cadence before deciding which).
Identify the single largest contributing factor and phrase it as one
sentence: which `WorkEstimate` rows flipped from placeholder to
AI-estimated since last time, which blocking `Finding` resolved, or
which capacity/allocation changed. Doesn't need to enumerate every
change — pick the biggest one, same instinct as the existing "Paths to a
sooner date" panel already has for picking a best lever.

### 4. Sparkline

A tiny inline chart (plain SVG polyline is enough, no charting library
needed for something this small) showing the last N `Report` snapshots'
likely-date-vs-target trend for the scope. Pulls from existing `Report`
history — no new storage needed, just a query.

### 5. Confidence momentum (separate from date momentum)

Track confidence-at-target across the same `Report` history
independently from the likely date — sometimes the date barely moves but
confidence swings a lot (more real estimates landed, fewer
placeholders), and that's worth its own line in the expanded momentum
panel ("confidence climbed 41% → 62%").

### 6. Stalled / unchanged indicator

The absence of momentum is itself a signal. Define a threshold (e.g.
less than 1 day of date movement and less than 5 percentage points of
confidence movement over the lookback window) and render it as a
distinct, neutral (gray, not red/green) small pill — "unchanged for 9
days" — rather than silently showing nothing. Worth surfacing at the
portfolio level too, compactly (see #8).

### 7. Ask chips (new backend capability, not just UI)

A second row of chips alongside the existing scenario ("Try") chips,
visually distinguished (a message/chat icon is enough), each triggering
a real natural-language explanation rather than a static precomputed
number — "Why did this move?", "What would it take to hit [date]?".
This needs a small new capability: a lightweight explain endpoint
(reuse the existing model-calling pattern in `lib/model.ts`/
`completeJson`, feed it the current forecast + recent findings + recent
report diff as context) rather than just a UI skin over existing data.
Scope this small — one or two canned question types to start, not a
free-text chat interface.

### 8. Calibration track record (stub now, real feature later)

Not worth building the full version yet — there isn't enough `Report`
history stored for it to say anything meaningful. Add the affordance
now (a quiet, muted text link, not a prominent button — "See how past
forecasts held up") so the hook exists, but have it render an honest
"not enough history yet" state until there's a real threshold worth of
reports (e.g. 4+ weeks) for a given Scope. When it is buildable: compare
what a report from N weeks ago predicted against what's true today.
Nobody else doing this kind of dashboard has this feature, specifically
because it only works if the tool has been consistently honest the whole
time — which this one has been, by design, since day one.

### 9. Compact portfolio-level momentum strip

Once `/portfolio` exists (depends on the other brief), the same
momentum language shrinks to a small pill per scope — icon + short
phrase only ("iTrack: 9 days sooner", "Platform: unchanged 9 days"), no
sparkline or expansion at that density. This is the same pattern as #2
just compressed, not a new pattern — reuse the same underlying
attribution/momentum computation, just render it smaller.

## Where to apply this, in order

1. `/forecast` (single scope) — proves the pattern works before anything
   else needs it.
2. `/reports` — the stored report is already a snapshot; showing
   momentum there means comparing to the *previous* stored report, which
   already exists as history, so this is mostly free once #2-#5 exist.
3. `/portfolio`, once the other brief's Phases 1-3 land — apply the
   compact strip version (#9).

## Non-goals

- Don't build the full calibration analysis (#8) before there's real
  history to analyze — a stub state is the correct amount of work now.
- Don't add animation/motion for its own sake — the existing flat,
  no-gradient, no-shadow constraints still apply. Interactivity (the
  chip expanding) should feel immediate, not have decorative transition
  effects layered on.
- Don't build a general free-text chat interface for the "Ask" chips —
  start with a small fixed set of question types tied to real computed
  data, not an open-ended LLM chat box.
- Don't touch `lib/forecast/simulate.ts`'s core math for any of this —
  everything here is presentation and history-diffing on top of data
  that's already computed or already stored.

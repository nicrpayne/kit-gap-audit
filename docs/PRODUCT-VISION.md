# Product vision

## Naming

**KIT** is Nic's broader product family — KIT Safety, KIT Construct, KIT
Design. This app is not "KIT." It's the **Product Timeline Audit App**,
called **KIT Gap App** or **Gap App** for short. JSA and iTrack are
components of KIT Safety, not products in their own right. Use the full
name in anything durable — docs, commit messages, code comments that
outlive a single session. `components/Nav.tsx`'s sidebar still renders a
bare "KIT" wordmark; that's pre-existing UI text, not touched by this
convention retroactively, but don't propagate the shorthand into new
writing.

## What this is

Not a dashboard. A dashboard reports a state. This app runs a **product
delivery simulation** — it exists so a question like "what happens if we
add a developer to Platform" has a real, honest, immediately-visible
answer instead of a guess, a gut feeling, or a Slack message three days
later.

The whole point is the loop:

```
Reality exists
     │
     ▼
you change something (capacity, allocation, target date —
eventually scope, dependencies, decisions)
     │
     ▼
the Forecast responds immediately: what changed, how much dates
moved, what else was affected, and why
```

That loop is the product. Everything else — the Audit, the Decision
Queue, Reports, even the underlying Monte Carlo math — exists to feed
honest inputs into that loop or to communicate its output. The guiding
phrase for how this should *feel* to operate: **play the project**. Not
"configure a plan" or "fill out a form" — play it, the way you'd play an
instrument: touch something, hear/see the result immediately, adjust,
listen again.

## Reality, Scenario, Forecast

Three words this codebase uses precisely (see `docs/SCENARIO-MODEL.md`
for the implementation):

- **Reality** — the authoritative current state: saved `Scope`/`Person`/
  `Allocation` rows, live Linear ticket data, whatever
  `buildPortfolioInputs()` returns right now. Not a snapshot; it's live.
- **Scenario** — a hypothetical overlay on top of Reality: "what if
  Platform had one more developer," "what if the target moved to
  September 15." Exists only in the browser until it's committed.
  Nothing about Scenario is persisted by looking at it.
- **Forecast** — what the Monte Carlo simulation says will happen, given
  either Reality alone (the baseline) or Reality-plus-Scenario (the
  preview). Uncertainty-native: a range and a likely date, not a single
  false-precision number.

A Scenario is disposable and cheap to explore. A Forecast is a
consequence, computed, never hand-typed. Reality is the only thing that
requires a deliberate act (Commit) to change.

## Who uses this, and how

Nic — PM/lead on a small team shipping JSA and iTrack, both dependent on
shared Platform work — uses this **live, on a call, while screen-sharing**
with leadership or the team. That constraint shapes almost every design
decision in this app: numbers have to be readable from across a
screen-share at a glance, a change has to show its effect in well under a
second, and nothing can require the presenter to stop and explain
Monte Carlo mechanics mid-sentence. If an interaction needs a tutorial to
operate live, it has failed at its actual job.

The motivating case: someone asks "what if we put another developer on
Platform?" The honest answer today is "Platform ships 5 days sooner,
iTrack — which depends on it — also moves 5 days sooner, and JSA doesn't
move at all because something else is the real constraint there." That
answer should be visible, correct, and *obviously* correct — not a number
that needs a follow-up Slack thread to trust.

## Simple on the surface, deep on demand

Nobody operating this app needs to know what P10/P50/P85/P90 mean,
whether a Scope's capacity is inferred or explicit, how dependency
correlation works in the Monte Carlo engine, or what a context-switch
penalty is. The **default surface** only ever needs to answer four
questions:

1. What will ship, and when?
2. What did I just change?
3. What did that change do?
4. Why?

Every layer of extra precision — percentile labels, capacity source,
named-vs-anonymous capacity rules, the exact math behind a confidence
number — is real, available, and one click away (the Inspector, a
tooltip, the collapsed per-person detail section). It is never required
reading to operate the instrument. See `docs/DESIGN-NORTH-STAR.md` for
how this plays out visually.

## Why this matters

The alternative to this tool is a status update built from memory,
optimism, and whatever spreadsheet was open last. That's not dishonest,
exactly — it's just unfalsifiable. This app's entire value is that its
numbers come from the same simulation every time, respond instantly to a
real question asked out loud, and show their work when asked "why." Trust
is the product. A beautiful interaction that doesn't hold up under a
skeptical "wait, why did that happen" is worse than a plain one that does.

# Control Room — Trust Audit

**Question:** could a leader safely make a $50M decision from this screen?

**Answer today: no.** The engine underneath is careful and mostly honest. The
presentation layer has three defects that make the surface *fail silently*, and
five that make it *state things the model does not know*. Both classes are
fixable without touching the visual design.

Method: every displayed value traced to its source; the Control Room driven
against nine adversarial projects (empty, zero-capacity, cyclic, self-referential,
orphaned reference, extreme dates, duplicate name) created directly in the
database and then removed.

Scope of this audit: the Control Room Command workspace and the read model
behind it. Findings marked **[engine]** are upstream of the Control Room and
affect every surface.

---

## CRITICAL — the surface fails silently

### C1. A dependency cycle hangs the Control Room forever, with no error

**What the user sees.** `READING THE PROJECT…` — indefinitely. No error, no
timeout, no diagnosis. HTTP 200. Refreshing does nothing. An executive would
conclude the tool is slow and keep waiting.

**Why it is misleading.** The single worst failure mode for a decision surface
is one that looks like it is *about to* show you something. A visible error
would send someone to fix the data; an eternal spinner sends them to another
tool, or to guessing.

**Reproduction.** Two projects that declare each other as dependencies
(`A.dependsOnScopeIds = [B]`, `B.dependsOnScopeIds = [A]`). Verified in
isolation: with the cycle present the page never renders; with it removed the
page renders immediately.

**Underlying cause.** `lib/forecast/portfolio.ts` `topologicalOrder()` is
*correct* — it detects the cycle and throws `DependencyCycleError` naming the
exact path, deliberately, rather than looping. The Control Room never catches
it. `ControlRoomPageClient.tsx:338` gates on `if (!reading || !field ||
!m.startDate)` and prints `m.error ?? dec.error ?? tlError ?? "Reading the
project…"`. Those three error slots only carry *fetch* failures. A computation
that throws leaves `reading` null with every error slot empty, so the fallback
string wins.

**Recommended fix.** Catch around the preview/reading computation and put the
thrown error into a fourth slot. `DependencyCycleError` already carries the
cycle path — surface it: *"Platform → JSA → Platform is a circular dependency.
Forecasting is stopped until it is broken."* That turns a dead screen into a
work item. Add a proof asserting the Control Room shows an error, not a
spinner, when the graph is cyclic.

---

### C2. A self-dependency does the same

**What the user sees.** Identical eternal `READING THE PROJECT…`.

**Reproduction.** One project listing its own id in `dependsOnScopeIds`.
Verified in isolation.

**Underlying cause.** Same path as C1 — a self-edge is a length-one cycle.

**Recommended fix.** Same error surfacing as C1, plus reject a self-edge at the
write boundary (`PATCH /api/scopes/:id`). Nothing in the product means "this
project cannot finish before itself"; it is never a legitimate input.

---

### C3. An orphaned dependency reference does the same

**What the user sees.** Identical eternal `READING THE PROJECT…`.

**Reproduction.** A project depending on a scope id that does not exist — which
is what a **deleted project** leaves behind. Verified in isolation.

**Underlying cause.** `Scope.dependsOnScopeIds` is a bare `String[]` in
`prisma/schema.prisma` with **no foreign key**, so nothing prevents a dangling
reference and deleting a project does not clean up its dependents.
`topologicalOrder()` correctly throws `MissingDependencyError`; the Control Room
swallows it exactly as in C1.

**Why this one is the most likely to happen in real use.** C1 and C2 need
someone to declare something odd. C3 happens by *deleting a project* — a normal,
encouraged action. Whoever deletes it will not be the person whose Control Room
dies.

**Recommended fix.** Three layers: surface the error (C1); clean up
`dependsOnScopeIds` on scope delete; and have the read model drop unresolvable
references with a visible note (*"iTrack declares a dependency on a project that
no longer exists"*) rather than failing the whole page for one bad edge.

---

## HIGH — the surface states things the model does not know

### H1. Projects with no data are given a capacity and a workload, presented as fact **[engine]**

**What the user sees.** A project with no allocations, no items and no
configuration appears in Capacity Overview as **`4.0 ct`** and in Release
Composition as **`10.7d`** remaining. The Release Composition headline total —
the single number an executive would quote — read **171d**, of which ~107d came
from ten projects that contain nothing.

**Why it is misleading.** These are not zeros or blanks. They are confident,
plausible, mid-range numbers in the same typography as measured ones. Nothing
distinguishes them.

**Underlying cause.** Two compounding defaults:

1. `Scope.projectNames = []` means **"match any project"** (documented in the
   schema). An unconfigured scope therefore absorbs a slice of the *whole*
   backlog — the API reported `items: 10` for every empty test project.
2. Capacity is then *inferred from the assignees of those borrowed items*,
   yielding `teamCapacity: 4, capacitySource: "inferred"`.

So an empty project silently claims ten other people's work items and four
people's time. Every downstream number inherits it.

**Recommended fix.** `projectNames: []` should mean *unconfigured*, not *all*.
An unconfigured scope should read as `—` with "not configured" rather than
borrowing the portfolio. If the permissive default must stay for compatibility,
the Control Room must mark inferred rows explicitly (see H2) and exclude
unconfigured scopes from the Release Composition total.

---

### H2. Inferred capacity is labelled "counted"

**What the user sees.** `PLATFORM 10.0 ct`, `ITRACK 2.0 ct`, `JSA-SEED 4.0 ct`.

**Why it is misleading.** `ct` abbreviates "counted", but it marks exactly the
rows whose capacity was **inferred**, not counted. The label asserts the
opposite of the truth, and it is attached to the least reliable numbers on the
panel. A row backed by real allocations (`0.4/0.4`) looks *less* authoritative
than one that was guessed.

**Underlying cause.** `CommandWorkspace.tsx` renders
`c.basis === "allocations" ? "/raw" : " ct"`. The V4 wording was `" counted"`;
V5.1 shortened it. Both are wrong in the same direction.

**Recommended fix.** Rename to `est` / "inferred", and tint it with the
uncertainty colour rather than the value colour. One word, and the panel stops
lying.

---

### H3. A stale target turns a data-entry error into the top constraint

**What the user sees.** Current Constraints, top row, above every real one:
**`10104d over — Likely Aug 31, target Jan 1.`**

**Why it is misleading.** Two compounding problems. The constraint list sorts by
magnitude, so a project with a 1999 target dominates a list whose purpose is to
show what actually needs attention. And the sentence says **"target Jan 1"** —
no year. It reads as *next* January, i.e. a live, urgent constraint, when the
truth is a target twenty-seven years stale.

**Underlying cause.** Date formatting drops the year, and there is no staleness
test on `targetDate` before it becomes a constraint.

**Recommended fix.** Always print the year when a date is not in the current or
next year. Treat a target in the past as its own category —
*"target date is 27 years old; set a current one"* — not as an overrun of ten
thousand days.

---

### H4. Forecast horizon reports a viewport as a project property

**What the user sees.** Header: `FORECAST HORIZON 26810 days`. Status bar:
`HORIZON 26810 Days`.

**Why it is misleading.** It sits beside `LIVE NOW` and `LAST FORECAST UPDATE`
in identical treatment, so it reads as a forecasting parameter. It is not: it is
`Math.round(days(timelineRangeEnd, now))` — the width of the **Timeline's
display window**, which stretches to fit the furthest date in the data. One
project with a far-future target moved the "forecast horizon" to 73 years.

**Underlying cause.** `read.ts` `horizonDays` derives from `i.timelineRangeEnd`,
a UI range, and is then presented as a model quantity.

**Recommended fix.** Either label it for what it is (`TIMELINE SPAN`) or replace
it with a real forecast horizon. Do not present a viewport as a forecast.

---

### H5. Two projects with the same name are indistinguishable in What Changed

**What the user sees.** Two adjacent rows reading
`ADV-100 Share JSA flow: result st…` with no way to tell them apart.

**Why it is misleading.** They are different projects. The reader will assume a
duplicated row, or that one event was double-counted.

**Underlying cause.** My own V5.1 disambiguation is insufficient: it appends the
**project name** when a title repeats, but when the two projects *share a name*
the appended label is identical too. The seed genuinely carries two projects
called "JSA" (`jsa`, `jsa-seed`).

**Recommended fix.** Disambiguate on the scope **id**, as the capacity and
composition panels now do — not the name.

---

## MEDIUM

### M1. "accepted" overstates what the model knows

Dependency Watch renders a mint **`accepted`** chip on every declared edge.
Nothing was accepted by anyone: `dependsOnScopeIds` is a declared modelling
input with no review step or provenance. The word exists to contrast with the
genuinely unreviewed external claims below it, which is a fair distinction —
but "accepted" implies human ratification that never happened.
**Fix:** say `declared`. Same contrast, no false provenance.

### M2. The confidence figure and the confidence chart have different provenances

The Forecast Confidence headline is `preview.confidenceAtTarget` — a **live
Monte Carlo run this second**. The chart beneath it is
`reportHistory[].confidenceAtTarget` — **stored integers from past reports**,
the newest of which is currently ten days old. They are presented as one
reading, and a viewer will read the chart as ending at the headline.

To its credit the chart draws an honest dashed NOW line, so a line that stops
short is *visible* — but nothing says the two numbers come from different
machines. **Fix:** label the headline `simulated now` and the chart
`as reported`, and mark the gap between the last report and now.

### M3. Duplicate-name disambiguation exposes raw database ids

Where two projects share a name, panels now print the scope id. For seeded
projects that is readable (`jsa`, `jsa-seed`); for a project created through the
app it is a 25-character cuid — `CMT10BD4B00087DYVBVIIVJIP` appeared in Capacity
Overview. Correct, and unreadable. **Fix:** disambiguate with a short
distinguishing suffix (team key, target date, creation date) and keep the id in
the tooltip.

### M4. No project count is shown anywhere

The portfolio silently grew from four projects to fourteen and no surface
stated a count. A reader has no way to notice that the thing they are looking at
is not the portfolio they think it is. **Fix:** state the count beside the
Release Composition and Capacity headings.

---

## COSMETIC

- **X1.** With fourteen projects the Release Composition legend overflows its
  panel and paints over its own heading.
- **X2.** With fourteen projects the Capacity Overview list scrolls its first
  rows out of view with no affordance indicating more.
- **X3.** The embedded Timeline loses its month axis beyond four projects
  (previously reported; unchanged).

---

## What held up

Worth recording, because the audit was looking for failures:

- **No fabricated health, severity or risk score anywhere.** Repeatedly checked;
  the product genuinely has no such model and genuinely does not draw one.
- **Capacity `arrivingPct` is null, not 100%, when nothing is allocated.** A
  ratio of nothing is correctly refused.
- **Confidence history omits projects that were never reported on** rather than
  drawing them flat at zero.
- **Capacity history is absent and says so on the panel face**, not in a tooltip.
- **The cycle-safe walks in `field.ts`** (`closure`, `walk`) handle cyclic and
  self-referential graphs without hanging — the failure in C1/C2 is error
  *surfacing*, not graph handling.
- **`topologicalOrder` throws precise, well-named errors** rather than picking an
  arbitrary order. The engine's instinct is right; only the UI wastes it.
- **Scenario separation** holds under the existing proofs: a hypothetical is
  carried by four independent signals and discarding restores Reality exactly,
  with zero writes.
- **Unreviewed external claims** are kept dashed, separate, and explicitly
  counted towards no date.

---

## Recommended order of work

1. **C1/C2/C3 together** — one change (surface computation errors) fixes all
   three, and they are the difference between "wrong" and "dead".
2. **H1** — the largest source of invented numbers.
3. **H2, H3, M1** — three wording changes, each removing a false assertion.
4. **H4, H5, M2, M3** — provenance and identity.
5. Cosmetic.

None of this requires touching the visual design.

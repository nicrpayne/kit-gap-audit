# Signal date/time contract

Signal has two temporal value classes. They are not interchangeable.

## DateOnly: a calendar day

Delivery outcomes, forecast-window bounds, targets, milestones, commitments,
Decision `neededBy` values, and the landing dates stored in Reports are
calendar days. Their canonical wire form is `YYYY-MM-DD`.

A DateOnly value keeps the exact owner calendar day in every browser, server,
and deployment timezone. Code must not render one by passing
`new Date("YYYY-MM-DD")` to a locale formatter without an explicit UTC-safe
date-only boundary. `lib/time/dateContract.ts` owns parsing, serialization,
and presentation:

```ts
const day = toDateOnly("2026-09-18T03:03:40.000Z"); // "2026-09-18"
formatDateOnly(day, { month: "short", day: "numeric" }); // "Sep 18"
```

Forecast math remains day-index based. `SimulationResult` may use `Date` as
an internal arithmetic carrier, but an owner read model must serialize its
delivery values with `toDateOnly`, and a surface must render them with
`formatDateOnly`.

## Instant: a point on the timeline

Source observations, report generation times, record creation/completion
times, deployment times, and audit timestamps are instants. Their canonical
wire form is an ISO-8601 timestamp with `Z` or an explicit offset.

An Instant may legitimately display on different calendar days in different
timezones. Its formatter must therefore name the intended timezone:

```ts
const observedAt = toInstant("2026-09-18T03:30:00.000Z");
formatInstant(observedAt, {
  timeZone: "America/Chicago",
  dateStyle: "medium",
  timeStyle: "short",
});
```

Never remove an Instant's offset and never use DateOnly formatting to imply
that an observation timestamp is a delivery commitment.

## Read-model and storage rules

- Existing database `DateTime` columns may continue to hold UTC values; the
  semantic field, not the database primitive, determines DateOnly vs Instant.
- New DateOnly read-model fields serialize as `YYYY-MM-DD`.
- Existing full-ISO DateOnly values are normalized at the read-model boundary.
- Instant fields serialize with `toISOString()` (or an equivalent offset-
  bearing ISO representation).
- Arithmetic on calendar days uses UTC calendar components or explicit day
  indexes. Arithmetic on instants uses epoch time.
- A page-specific date formatter is not allowed for canonical delivery days.
  Use the central contract.

## Required verification

Any change to milestones, commitments, targets, Reports, Timeline, Forecast,
Scope, Portfolio/Capacity, or Control Room must run:

```text
npm run proof:date-contract
```

The permanent matrix executes the same boundary fixture under:

- America/Chicago
- UTC
- America/Los_Angeles
- Europe/London
- Asia/Tokyo

It covers the likely outcome and window, target, milestone, historical Report
day, DST transitions, month/year boundaries, and an actual Instant. All
DateOnly consumers must agree exactly; the Instant proof must retain the
intentional timezone difference.

## Production incident example

The Hardening 2 candidate exposed `2026-09-18T03:03:40.000Z`, a simulation
completion day derived from the UTC base day plus its P50 day index. UTC-safe
surfaces rendered Sep 18. Consumers that treated the same value as a local
instant rendered Sep 17 in America/Chicago. The canonical owner day is
`2026-09-18`; the one-day change was presentation drift, not forecast math.

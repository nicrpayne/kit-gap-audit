import type { ChangesSince } from "@/lib/reports/changes";

// Picks the single most narratively significant thing that changed --
// same instinct as "Paths to a sooner date" already has for picking a
// best lever, not an exhaustive changelog. Priority: a resolved blocking
// decision is the most legible single cause of movement, then fresh
// estimates (placeholder -> real), then raw shipped-ticket count.
// Pure -- ChangesSince is already fully resolved data.
export function attributionSentence(changes: ChangesSince): string | null {
  if (changes.resolvedDecisions.length > 0) {
    const d = changes.resolvedDecisions[0];
    return `The blocking decision on "${d.title}" got resolved${d.resolution ? ` — ${d.resolution}` : ""}.`;
  }

  if (changes.freshEstimateCount > 0) {
    const n = changes.freshEstimateCount;
    return `${n} ticket${n === 1 ? "" : "s"} got real estimates instead of placeholder guesses.`;
  }

  if (changes.shipped.length > 0) {
    const n = changes.shipped.length;
    return `${n} ticket${n === 1 ? "" : "s"} shipped.`;
  }

  return null;
}

// The /reports equivalent: two already-generated Report rows carry their
// own "since the previous report" counts (shippedCount,
// resolvedSinceLastCount) captured at generation time -- reusing those
// is both cheaper AND more correct than re-deriving "what changed"
// between two points in the past from live data, since the live Linear/
// estimate state has moved on since both of those historical reports.
// Less specific than attributionSentence (a count, not a decision title
// -- that detail was never stored on Report), which is exactly the
// "mostly free" trade the design brief calls out for this page.
export function reportAttributionSentence(report: { resolvedSinceLastCount: number; shippedCount: number }): string | null {
  if (report.resolvedSinceLastCount > 0) {
    const n = report.resolvedSinceLastCount;
    return `${n} blocking decision${n === 1 ? "" : "s"} resolved.`;
  }
  if (report.shippedCount > 0) {
    const n = report.shippedCount;
    return `${n} ticket${n === 1 ? "" : "s"} shipped.`;
  }
  return null;
}

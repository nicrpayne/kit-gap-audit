"use client";

// THE FRESHNESS CONTRACT FOR PERSISTED TRUTH.
//
// Reality is what the app has written down; a Scenario is what someone is
// currently imagining on top of it. Those are separate concerns and this
// module is only ever about the first one.
//
// The rule it exists to enforce:
//
//   a persisted Reality mutation succeeds
//     -> shared project truth is invalidated
//     -> every instrument, whether already on screen or entered afterwards,
//        reads the new truth without a browser refresh
//     -> nobody's active Scenario is destroyed on the way
//
// Instruments are separate routes over ONE project. Portfolio can change
// what a Scope's capacity actually is, and Forecast three clicks later is
// obliged to answer using that number -- otherwise the suite is showing two
// different worlds and calling both of them Reality.
//
// This is a revision counter rather than a cache of anything. It carries no
// data and knows nothing about the payload's shape, so any future instrument
// (Decisions, Timeline) participates by using mutateReality for its writes,
// with nothing to keep in sync here.

let revision = 0;
const listeners = new Set<() => void>();

/** Which generation of persisted truth is current. */
export function realityRevision(): number {
  return revision;
}

/** Notified whenever persisted truth changes. Used by useProject to
    revalidate a snapshot that is already on screen. */
export function subscribeReality(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Declare that persisted project truth has changed. Safe to call from
    anywhere; the data layer decides what that costs. */
export function invalidateReality(): void {
  revision++;
  // Copied, so a listener that unsubscribes during the walk can't corrupt it.
  for (const listener of [...listeners]) listener();
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Fetch, then tell the suite that truth moved.
//
// Deliberately a wrapper at the REQUEST boundary rather than a rule each
// screen has to remember after each of its saves. A write that persists
// Reality is exactly the event that invalidates it, so the invalidation
// belongs to the write itself -- which is also why a surface can't
// accidentally get this half-right by wiring up two of its three saves.
//
// Only a successful mutating response counts. A GET changes nothing, and a
// rejected write means Reality is exactly where it was.
export async function mutateReality(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.ok && MUTATING.has((init?.method ?? "GET").toUpperCase())) invalidateReality();
  return res;
}

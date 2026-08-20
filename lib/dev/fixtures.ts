// Deterministic offline stand-ins for Linear issues, used ONLY when
// KIT_DEV_FIXTURES=1 (see getScopedIssues in lib/linear.ts). This exists so
// the app -- and especially /portfolio, whose whole job is live simulation
// -- can be run, designed against, and screenshotted without a Linear API
// key or network access. It is never reachable in a normal deployment: the
// env var is opt-in and absent everywhere except a developer's own machine.
//
// The shape returned is exactly LinearIssueSummary, so every downstream
// consumer (buildForecastInputs' points heuristic, the composition counts,
// the distinct-assignee capacity inference) exercises its real code path --
// these are substitute inputs, not a substitute pipeline.
//
// Assignment is DELIBERATE, not random: the capacity inference counts
// distinct assignees on remaining work, so a fixture whose assignee spread
// wobbled between reloads would make "Reality = 10 FTE" unreproducible and
// the design work untestable. Each team below declares exactly how many
// distinct people hold its remaining tickets.

import type { LinearIssueSummary, ScopeFilter } from "@/lib/linear";

interface TeamFixture {
  titles: string[];
  /** Names that hold REMAINING tickets -- this count IS the inferred FTE. */
  assignees: string[];
  /** How many of the titles are already finished (they hold no capacity). */
  doneCount: number;
  /** Remaining tickets left deliberately unassigned. */
  unassignedCount: number;
  /** The Linear Project these issues sit in -- the EPIC in the new structure. */
  epic: string;
  // THE FEATURE LAYER, modelled the way the reorganised Linear actually
  // expresses it: implementation issues carry a `parent` pointing at the
  // Feature issue they belong to. Indexes are into `titles` above.
  //
  // Titles listed in NO feature are deliberate: real backlogs always contain
  // work nobody has mapped to a capability yet, and Scope's job is to show
  // that gap rather than quietly invent a bucket for it.
  features: { key: string; title: string; items: number[] }[];
  // One issue whose parent is ANOTHER ISSUE rather than the feature directly
  // -- a sub-issue. Present so the feature resolver's parent-chain walk is
  // exercised offline and not just in production.
  subIssueOf?: Record<number, number>;
}

const TEAMS: Record<string, TeamFixture> = {
  // Platform: capacity is INFERRED. Ten distinct people hold remaining
  // tickets, so the engine infers 10 FTE -- the exact case that was
  // baffling in production ("why is Platform 10?").
  PLAT: {
    titles: [
      "Auth service token refresh race condition",
      "Shared design-system package extraction",
      "Introduce request tracing across services",
      "Migrate file storage to the new bucket layout",
      "Rate limiter for the public submission API",
      "Background job runner replacement",
      "Secrets rotation without redeploy",
      "Postgres connection pooling under load",
      "CI pipeline split for faster feedback",
      "Structured audit logging library",
      "Feature flag service client",
      "Session invalidation across devices",
      "Health checks for the worker fleet",
      "Blue/green deploy switchover",
      "Log retention and PII scrubbing",
      "Shared error taxonomy package",
    ],
    assignees: [
      "Sam Ortiz",
      "James Whitfield",
      "Priya Raman",
      "Tom Beckett",
      "Ana Duarte",
      "Ken Iwasaki",
      "Rosa Lindqvist",
      "Dev Patel",
      "Marta Kowalczyk",
      "Owen Bradley",
    ],
    doneCount: 4,
    unassignedCount: 2,
    epic: "KIT Platform",
    features: [
      { key: "PLAT-F1", title: "Identity & Access", items: [0, 6, 11] },
      { key: "PLAT-F2", title: "Service Platform", items: [2, 5, 12, 13] },
      { key: "PLAT-F3", title: "Data & Storage", items: [3, 7, 14] },
      { key: "PLAT-F4", title: "Developer Platform", items: [1, 8, 10, 15] },
    ],
    // "Session invalidation across devices" hangs off the auth ticket, not
    // off the feature -- so resolving it needs the chain walk.
    subIssueOf: { 11: 0 },
  },
  SOF: {
    titles: [
      "Share JSA flow: result states (success / failure / partial)",
      "Offline capture queue for field submissions",
      "Signature capture on the hazard sign-off step",
      "Photo attachment compression before upload",
      "JSA template versioning and migration",
      "Crew roster sync from the directory service",
      "Push notification when a JSA is rejected",
      "Audit trail export for compliance review",
      "Permit-to-work linkage on high-risk tasks",
      "Bulk reassign JSAs when a supervisor changes",
      "Weather condition capture at submission",
      "Hazard library search and favourites",
      "Rework the review queue filters",
      "Fix duplicate submissions on flaky connections",
    ],
    assignees: ["Maru Tanaka", "Lucy Bell", "Alex Reyes", "Sam Ortiz"],
    doneCount: 4,
    unassignedCount: 3,
    epic: "KIT Safety (JSA and iTrack)",
    features: [
      { key: "SOF-F1", title: "Offline Capture", items: [1, 3, 13] },
      { key: "SOF-F2", title: "JSA Authoring", items: [4, 10, 11] },
      { key: "SOF-F3", title: "Review & Approval", items: [6, 9, 12] },
      { key: "SOF-F4", title: "Compliance Export", items: [7, 8] },
    ],
  },
  TRK: {
    titles: [
      "iTrack incident intake form",
      "Corrective action assignment and due dates",
      "Incident severity triage rules",
      "Root-cause category taxonomy",
      "Link incidents to the originating JSA",
      "Investigator notes with attachments",
      "Incident dashboard for site leads",
      "Regulatory export (OSHA 300 format)",
      "Recurring hazard detection across sites",
      "Close-out approval chain",
    ],
    assignees: ["Alex Reyes", "Maru Tanaka"],
    doneCount: 3,
    unassignedCount: 2,
    epic: "KIT iTrack",
    features: [
      { key: "TRK-F1", title: "Incident Intake", items: [0, 2] },
      { key: "TRK-F2", title: "Corrective Actions", items: [1, 9] },
      { key: "TRK-F3", title: "Root Cause Analysis", items: [3, 5, 8] },
      { key: "TRK-F4", title: "Regulatory Export", items: [7] },
    ],
  },
  DSN: {
    titles: [
      "Design system audit across JSA and iTrack",
      "Hazard iconography set",
      "Field-mode colour and contrast pass",
      "Empty and error states for offline capture",
      "Incident report print layout",
      "Motion guidelines for status transitions",
    ],
    assignees: ["Lucy Bell", "Sam Ortiz"],
    doneCount: 2,
    unassignedCount: 1,
    epic: "KIT Design",
    features: [
      { key: "DSN-F1", title: "Design System", items: [0, 1] },
      { key: "DSN-F2", title: "Field Experience", items: [2, 3] },
    ],
  },
};

// Points spread, cycled deterministically so effort totals are stable
// between runs but not uniform.
const POINTS = [3, 5, 2, 8, 3, 1, 5, 2, 8, 3, 5, 2, 3, 8, 1, 5];

/**
 * ONE CLOCK PER PROCESS, not one per read.
 *
 * Completion dates used to be derived from `Date.now()` inside the issue
 * builder, so two reads a second apart described a subtly different world:
 * every completedAt shifted by the milliseconds between the calls, and any
 * completion sitting near another entry's timestamp could swap places in
 * Timeline's chronological sort. That made "the projection is identical
 * across two requests" intermittently false for reasons that had nothing to
 * do with the projection — a fixture that will not hold still cannot be
 * used to prove anything holds still.
 *
 * Anchored ONCE PER PROCESS, not once per module evaluation. Anchoring at
 * module load was not enough: the dev server re-evaluates this module when
 * anything upstream of it is recompiled, and every re-evaluation moved the
 * whole fixture history a few seconds later. Two reads of the projection
 * taken either side of a recompile then disagreed about when work was
 * completed — which reads exactly like a real instrument writing to rows it
 * should not touch, and is the reason a "presentation only" assertion could
 * fail without anything having changed.
 *
 * Held on globalThis so a reload finds the epoch already chosen. The
 * offsets stay relative to today, so the fixture still looks like a live
 * project; it simply stops moving underneath the thing observing it.
 */
const FIXTURE_EPOCH: number = ((globalThis as { __kitFixtureEpoch?: number }).__kitFixtureEpoch ??= Date.now());

// identifier for title index i -- kept as its own function so the parent
// links below and the issues themselves cannot drift apart.
function identifierFor(teamKey: string, i: number): string {
  return `${teamKey}-${100 + i * 7}`;
}

export function devFixtureIssues(scope: ScopeFilter): LinearIssueSummary[] {
  // AN UNKNOWN TEAM HAS NO WORK, and must not be handed someone else's.
  //
  // This used to fall back to `TEAMS.SOF`, so every Scope with an
  // unrecognised team key silently received SOF's ten issues and four
  // assignees. A brand-new or misconfigured Scope therefore appeared —
  // in dev and design mode only — with a full backlog and an inferred
  // capacity of 4 FTE, and those fabricated numbers flowed into the
  // Control Room's release-load total as if they were measured.
  //
  // Production is unaffected either way: with KIT_DEV_FIXTURES unset,
  // getScopedIssues queries Linear by team key and an unknown team simply
  // returns nothing. This makes the offline path agree with that.
  const fixture = TEAMS[scope.teamKey];
  if (!fixture) return [];
  const issues: LinearIssueSummary[] = [];

  // Index -> the Feature issue it hangs from. Everything about the
  // simulation (estimates, assignees, states) is untouched by this: a
  // feature is metadata ABOUT work that was already being counted, never a
  // change to what gets counted.
  const featureOf = new Map<number, { key: string; title: string }>();
  for (const f of fixture.features) {
    for (const idx of f.items) featureOf.set(idx, { key: f.key, title: f.title });
  }

  fixture.titles.forEach((title, i) => {
    const isDone = i < fixture.doneCount;
    const remainingIndex = i - fixture.doneCount;
    const isUnassigned = !isDone && remainingIndex < fixture.unassignedCount;
    // Every name in `assignees` gets at least one remaining ticket, so the
    // distinct-assignee inference lands on exactly assignees.length.
    const assignee = isDone
      ? fixture.assignees[i % fixture.assignees.length]
      : isUnassigned
        ? null
        : fixture.assignees[(remainingIndex - fixture.unassignedCount) % fixture.assignees.length];

    // A sub-issue points at another ISSUE; everything else points straight
    // at its Feature. Both shapes exist in the reorganised Linear, and
    // resolveFeatures walks whichever chain it is handed.
    const subParent = fixture.subIssueOf?.[i];
    const feature = featureOf.get(i) ?? null;
    const parentIdentifier =
      subParent !== undefined ? identifierFor(scope.teamKey, subParent) : feature?.key ?? null;
    const parentTitle =
      subParent !== undefined ? fixture.titles[subParent] : feature?.title ?? null;

    issues.push({
      identifier: identifierFor(scope.teamKey, i),
      title,
      description: null,
      state: isDone ? "Done" : remainingIndex < fixture.unassignedCount + 2 ? "In Progress" : "Todo",
      stateType: isDone ? "completed" : remainingIndex < fixture.unassignedCount + 2 ? "started" : "unstarted",
      // Roughly a third of remaining work carries no Linear estimate at all
      // -- the realistic case the forecast's placeholder handling exists for.
      estimate: i % 3 === 0 ? null : POINTS[i % POINTS.length],
      assignee,
      labels: [],
      completedAt: isDone ? new Date(FIXTURE_EPOCH - (i + 3) * 86400000).toISOString() : null,
      parentIdentifier,
      parentTitle,
      projectName: fixture.epic,
    });
  });

  return issues;
}

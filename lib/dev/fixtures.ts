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
  },
};

// Points spread, cycled deterministically so effort totals are stable
// between runs but not uniform.
const POINTS = [3, 5, 2, 8, 3, 1, 5, 2, 8, 3, 5, 2, 3, 8, 1, 5];

export function devFixtureIssues(scope: ScopeFilter): LinearIssueSummary[] {
  const fixture = TEAMS[scope.teamKey] ?? TEAMS.SOF;
  const issues: LinearIssueSummary[] = [];

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

    issues.push({
      identifier: `${scope.teamKey}-${100 + i * 7}`,
      title,
      description: null,
      state: isDone ? "Done" : remainingIndex < fixture.unassignedCount + 2 ? "In Progress" : "Todo",
      stateType: isDone ? "completed" : remainingIndex < fixture.unassignedCount + 2 ? "started" : "unstarted",
      // Roughly a third of remaining work carries no Linear estimate at all
      // -- the realistic case the forecast's placeholder handling exists for.
      estimate: i % 3 === 0 ? null : POINTS[i % POINTS.length],
      assignee,
      labels: [],
      completedAt: isDone ? new Date(Date.now() - (i + 3) * 86400000).toISOString() : null,
    });
  });

  return issues;
}

// Deterministic offline stand-ins for Linear issues, used ONLY when
// KIT_DEV_FIXTURES=1 (see getScopedIssues in lib/linear.ts). This exists so
// the app -- and especially /portfolio, whose whole job is live simulation
// -- can be run, designed against, and screenshotted without a Linear API
// key or network access. It is never reachable in a normal deployment: the
// env var is opt-in and absent everywhere except a developer's own machine.
//
// The shape returned is exactly LinearIssueSummary, so every downstream
// consumer (buildForecastInputs' points heuristic, the composition counts,
// assignee-based capacity inference) exercises its real code path -- these
// are substitute inputs, not a substitute pipeline.

import type { LinearIssueSummary, ScopeFilter } from "@/lib/linear";

// Small deterministic PRNG (mulberry32) so a given scope always produces
// the same backlog -- a fixture that reshuffles on every reload would make
// visual diffing of a design change impossible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const WORK: Record<string, string[]> = {
  SOF: [
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
    "Weather condition capture at time of submission",
    "Hazard library search and favorites",
    "Multi-language field labels",
    "Rework the review queue filters",
    "Fix duplicate submissions on flaky connections",
    "Harden the attachment virus scan step",
  ],
  PLAT: [
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
  ],
  TRK: [
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
};

const STATES: { name: string; type: string; weight: number }[] = [
  { name: "Backlog", type: "backlog", weight: 3 },
  { name: "Todo", type: "unstarted", weight: 3 },
  { name: "In Progress", type: "started", weight: 2 },
  { name: "In Review", type: "started", weight: 1 },
  { name: "Done", type: "completed", weight: 3 },
];

const ASSIGNEES = ["Sam Ortiz", "James Whitfield", "Maru Tanaka", "Lucy Bell", "Alex Reyes"];

function pickState(r: () => number): { name: string; type: string } {
  const total = STATES.reduce((sum, s) => sum + s.weight, 0);
  let roll = r() * total;
  for (const s of STATES) {
    roll -= s.weight;
    if (roll <= 0) return { name: s.name, type: s.type };
  }
  return { name: "Backlog", type: "backlog" };
}

export function devFixtureIssues(scope: ScopeFilter): LinearIssueSummary[] {
  const titles = WORK[scope.teamKey] ?? WORK.SOF;
  const seedBase = hashString(`${scope.teamKey}::${(scope.projectNames ?? []).join(",")}::${scope.labelFilter ?? ""}`);
  const r = mulberry32(seedBase);

  const issues: LinearIssueSummary[] = [];
  titles.forEach((title, i) => {
    const state = pickState(r);
    const done = state.type === "completed";
    // Roughly a third of remaining work carries no Linear estimate at all
    // -- that is the realistic case the forecast's placeholder handling and
    // the "unestimated" pressure readout both exist for.
    const hasPoints = r() > 0.34;
    const points = [1, 2, 3, 5, 8][Math.floor(r() * 5)];
    issues.push({
      identifier: `${scope.teamKey}-${100 + i * 7}`,
      title,
      description: null,
      state: state.name,
      stateType: state.type,
      estimate: hasPoints ? points : null,
      assignee: r() > 0.2 ? ASSIGNEES[Math.floor(r() * ASSIGNEES.length)] : null,
      labels: [],
      completedAt: done ? new Date(Date.now() - Math.floor(r() * 30) * 86400000).toISOString() : null,
    });
  });
  return issues;
}

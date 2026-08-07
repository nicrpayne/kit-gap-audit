// Deterministic, client-side portfolio observations -- computed purely
// from already-simulated percentiles and already-resolved capacity data,
// never a model call, per the standing "no LLM in the simulation/insights
// path" rule. Pure and isomorphic like the rest of lib/capacity and
// lib/forecast/portfolio, so it runs identically whether the caller is
// the live dashboard or (later) an MCP tool asking the same question.

export interface ScopeInsightInput {
  scopeId: string;
  name: string;
  dependsOnScopeIds: string[];
  likelyDays: number; // percentiles.p50 -- a day offset from the shared startDate
}

export interface OverAllocatedInsightInput {
  personName: string;
  totalFraction: number; // > 1.0
}

export interface UnallocatedInsightInput {
  name: string;
  unallocatedFte: number;
}

export interface PortfolioInsight {
  id: string;
  text: string;
  tone: "info" | "warning";
}

// Minimum gap worth calling out -- below this, "finishes N days before"
// is noise, not a decision-relevant observation.
const GAP_THRESHOLD_DAYS = 7;

export function computePortfolioInsights(
  scopes: ScopeInsightInput[],
  overAllocated: OverAllocatedInsightInput[],
  unallocated: UnallocatedInsightInput[]
): PortfolioInsight[] {
  const insights: PortfolioInsight[] = [];

  // Biggest single gap between any two Scopes' likely dates -- the one
  // most worth surfacing unprompted ("nobody thought to ask").
  let biggestGap: { earlier: ScopeInsightInput; later: ScopeInsightInput; gap: number } | null = null;
  for (let i = 0; i < scopes.length; i++) {
    for (let j = i + 1; j < scopes.length; j++) {
      const [a, b] = scopes[i].likelyDays <= scopes[j].likelyDays ? [scopes[i], scopes[j]] : [scopes[j], scopes[i]];
      const gap = Math.round(b.likelyDays - a.likelyDays);
      if (gap >= GAP_THRESHOLD_DAYS && (!biggestGap || gap > biggestGap.gap)) {
        biggestGap = { earlier: a, later: b, gap };
      }
    }
  }
  if (biggestGap) {
    insights.push({
      id: "gap",
      tone: "info",
      text: `${biggestGap.earlier.name} finishes ${biggestGap.gap} days before ${biggestGap.later.name}.`,
    });
  }

  // A Scope more than one other Scope depends on is a shared risk, not
  // just a sequencing detail -- worth naming explicitly.
  for (const scope of scopes) {
    const dependents = scopes.filter((s) => s.dependsOnScopeIds.includes(scope.scopeId));
    if (dependents.length > 1) {
      insights.push({
        id: `critical-path-${scope.scopeId}`,
        tone: "warning",
        text: `${scope.name} is on the critical path for ${dependents.length} scopes: ${dependents
          .map((d) => d.name)
          .join(", ")}.`,
      });
    }
  }

  for (const person of overAllocated) {
    insights.push({
      id: `over-${person.personName}`,
      tone: "warning",
      text: `${person.personName} is over-allocated at ${Math.round(person.totalFraction * 100)}%.`,
    });
  }

  if (unallocated.length > 0) {
    const totalFte = unallocated.reduce((sum, u) => sum + u.unallocatedFte, 0);
    insights.push({
      id: "unallocated",
      tone: "info",
      text: `${totalFte.toFixed(2)} FTE unallocated: ${unallocated
        .map((u) => `${u.name} (${u.unallocatedFte.toFixed(2)})`)
        .join(", ")}.`,
    });
  }

  return insights;
}

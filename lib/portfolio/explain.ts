// Deterministic "why did this move / why didn't it" explanations for the
// Scenario Inspector -- pure, no LLM, no network. Everything referenced
// here (deltas, dependency relationships, scenario-added capacity) is
// already sitting in the browser by the time a scope is selected; the
// whole point of this module is to narrate it in plain language before
// ever reaching for Hermes. See docs/DESIGN-NORTH-STAR.md's "simple
// surface, deep on demand" principle and docs/SCENARIO-MODEL.md for what
// each of these numbers actually means underneath.

export interface DependencyDelta {
  scopeId: string;
  name: string;
  deltaDays: number; // that dependency's own preview-vs-baseline delta
}

export interface DependentDelta {
  scopeId: string;
  name: string;
  deltaDays: number; // a scope that depends on THIS one, and its own delta
}

export interface ScopeExplanationInput {
  scopeName: string;
  deltaDays: number; // this scope's own preview-vs-baseline delta, 0 if not dirty
  anonymousFteAdded: number; // scenario-added anonymous FTE on this scope specifically
  namedFteChanged: boolean; // true if a named real person's allocation to this scope changed
  dependsOn: DependencyDelta[]; // scopes this one depends on, with THEIR own deltas
  dependents: DependentDelta[]; // scopes that depend on this one
}

function moveWord(deltaDays: number): string {
  if (deltaDays === 0) return "unchanged";
  return deltaDays < 0 ? `${Math.abs(deltaDays)} days earlier` : `${deltaDays} days later`;
}

// Returns an ordered list of short sentences -- the Inspector renders
// them as separate lines, not one dense paragraph, per the "elegant
// information density" principle. Empty array means genuinely nothing to
// say (no scenario active, no dependency movement) -- the caller shows a
// quiet default rather than an empty section.
export function explainScope(input: ScopeExplanationInput): string[] {
  const { scopeName, deltaDays, anonymousFteAdded, namedFteChanged, dependsOn, dependents } = input;
  const lines: string[] = [];

  const capacityChanged = anonymousFteAdded > 1e-6 || namedFteChanged;
  const movedDependencies = dependsOn.filter((d) => d.deltaDays !== 0);

  if (!capacityChanged && movedDependencies.length === 0 && deltaDays === 0) {
    return lines; // nothing scenario-related is happening for this scope
  }

  if (capacityChanged) {
    const capacityPhrase =
      anonymousFteAdded > 1e-6 && namedFteChanged
        ? `${scopeName}'s own capacity changed in this scenario (+${anonymousFteAdded.toFixed(1)} FTE added, plus a reallocated person)`
        : anonymousFteAdded > 1e-6
        ? `${scopeName} has +${anonymousFteAdded.toFixed(1)} FTE of scenario capacity added`
        : `${scopeName}'s allocated people changed in this scenario`;

    if (deltaDays < 0) {
      lines.push(`${capacityPhrase}, which shortened its own forecast by ${Math.abs(deltaDays)} days.`);
    } else if (deltaDays === 0) {
      lines.push(`${capacityPhrase}, but its own forecast didn't move — another constraint (its remaining work, or a blocking decision) still dominates.`);
    } else {
      lines.push(`${capacityPhrase}. Its forecast still moved later — the added capacity wasn't enough to offset something else that changed.`);
    }
  }

  for (const dep of movedDependencies) {
    if (deltaDays !== 0 && Math.sign(deltaDays) === Math.sign(dep.deltaDays)) {
      lines.push(`${scopeName} depends on ${dep.name}, which moved ${moveWord(dep.deltaDays)} — ${scopeName} moved with it.`);
    } else {
      lines.push(`${scopeName} depends on ${dep.name}, which moved ${moveWord(dep.deltaDays)}, but ${scopeName}'s own date didn't follow — another constraint still dominates ${scopeName}'s forecast.`);
    }
  }

  if (!capacityChanged && movedDependencies.length === 0 && deltaDays !== 0) {
    // Moved, but not for any reason visible in this scope's own inputs or
    // its direct dependencies -- honest about the limit of this
    // deterministic pass rather than guessing.
    lines.push(`${scopeName}'s forecast moved ${moveWord(deltaDays)} this scenario, from a change elsewhere in the portfolio.`);
  }

  const movedDependents = dependents.filter((d) => d.deltaDays !== 0);
  if (movedDependents.length > 0) {
    lines.push(
      `Effect on the rest of the portfolio: ${movedDependents
        .map((d) => `${d.name} ${moveWord(d.deltaDays)}`)
        .join(", ")}.`
    );
  }
  const unmovedDependents = dependents.filter((d) => d.deltaDays === 0);
  if (unmovedDependents.length > 0 && movedDependents.length > 0) {
    lines.push(`${unmovedDependents.map((d) => d.name).join(", ")} did not move.`);
  }

  return lines;
}

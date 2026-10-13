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
  deltaDays: number | null; // null means no supported comparison
}

export interface DependentDelta {
  scopeId: string;
  name: string;
  deltaDays: number | null; // null means no supported comparison
}

export interface ScopeExplanationInput {
  scopeName: string;
  deltaDays: number; // this scope's own preview-vs-baseline delta, 0 if not dirty
  anonymousFteAdded: number; // scenario-added anonymous FTE on this scope specifically
  namedFteChanged: boolean; // true if a named real person's allocation to this scope changed
  /** Effective pooled capacity, not a claim about named people or a hire. */
  effectiveCapacity?: { reality: number; scenario: number };
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
  const { scopeName, deltaDays, anonymousFteAdded, namedFteChanged, effectiveCapacity, dependsOn, dependents } = input;
  const lines: string[] = [];

  const effectiveCapacityChanged = effectiveCapacity !== undefined
    && Number.isFinite(effectiveCapacity.reality) && Number.isFinite(effectiveCapacity.scenario)
    && Math.abs(effectiveCapacity.scenario - effectiveCapacity.reality) > 1e-6;
  const capacityChanged = effectiveCapacityChanged || anonymousFteAdded > 1e-6 || namedFteChanged;
  const movedDependencies = dependsOn.filter((d): d is DependencyDelta & {deltaDays:number} => d.deltaDays !== null && d.deltaDays !== 0);

  if (!capacityChanged && movedDependencies.length === 0 && deltaDays === 0) {
    return lines; // nothing scenario-related is happening for this scope
  }

  if (capacityChanged) {
    const capacityPhrase =
      effectiveCapacityChanged
        ? `${scopeName}'s effective capacity changed from ${effectiveCapacity!.reality.toFixed(2)} to ${effectiveCapacity!.scenario.toFixed(2)} FTE in this Scenario`
        : anonymousFteAdded > 1e-6 && namedFteChanged
        ? `${scopeName}'s own capacity changed in this scenario (+${anonymousFteAdded.toFixed(1)} FTE added, plus a reallocated person)`
        : anonymousFteAdded > 1e-6
        ? `${scopeName} has +${anonymousFteAdded.toFixed(1)} FTE of scenario capacity added`
        : `${scopeName}'s allocated people changed in this scenario`;

    // These are observations, not counterfactual attribution. Other levers
    // may change alongside capacity; the delta alone cannot tell us why.
    lines.push(`${capacityPhrase}. Its modeled outcome ${deltaDays === 0 ? "did not move" : `moved ${moveWord(deltaDays)}`}.`);
    lines.push("The comparison includes all Scenario assumptions; it does not isolate the effect of capacity alone.");
  }

  for (const dep of movedDependencies) {
    if (deltaDays !== 0 && Math.sign(deltaDays) === Math.sign(dep.deltaDays)) {
      lines.push(`${dep.name} is a declared finish floor and moved ${moveWord(dep.deltaDays)}. ${scopeName} also moved ${moveWord(deltaDays)}; the simulation does not attribute how much of that movement came from the floor.`);
    } else {
      lines.push(`${dep.name} is a declared finish floor and moved ${moveWord(dep.deltaDays)}, but ${scopeName}'s later completion did not follow it — the scope's own outcome or another floor still set the date.`);
    }
  }

  if (!capacityChanged && movedDependencies.length === 0 && deltaDays !== 0) {
    // Moved, but not for any reason visible in this scope's own inputs or
    // its direct dependencies -- honest about the limit of this
    // deterministic pass rather than guessing.
    lines.push(`${scopeName}'s modeled outcome moved ${moveWord(deltaDays)} in this Scenario. This summary does not identify which changed assumption caused the movement.`);
  }

  const movedDependents = dependents.filter((d): d is DependentDelta & {deltaDays:number} => d.deltaDays !== null && d.deltaDays !== 0);
  if (movedDependents.length > 0) {
    lines.push(
      `Other dependent projects also changed: ${movedDependents
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

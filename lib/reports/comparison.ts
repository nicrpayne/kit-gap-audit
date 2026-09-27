import { isDecisionBriefV1, type DecisionBriefV1 } from "./decisionBrief";

/** Historical pairs are explicit, never the independently newest two modes. */
export function reportComparison<T extends { id: string; mode: string | null; briefSnapshot: unknown }>(
  reports: readonly T[], selectedId: string | null,
): { reality: T; scenario: T; realityBrief: DecisionBriefV1; scenarioBrief: DecisionBriefV1 } | null {
  const selected = reports.find((report) => report.id === selectedId);
  if (!selected || !isDecisionBriefV1(selected.briefSnapshot)) return null;
  const identity = selected.briefSnapshot.identity;
  if (!identity.comparisonId) return null;
  const matches = reports.filter((report) => isDecisionBriefV1(report.briefSnapshot) &&
    report.briefSnapshot.identity.comparisonId === identity.comparisonId &&
    report.briefSnapshot.identity.project.value.id === identity.project.value.id);
  const realities = matches.filter((report) => report.mode === "reality");
  const scenarios = matches.filter((report) => report.mode === "scenario");
  // Ambiguity is a data problem; don't choose an arbitrary pair.
  if (realities.length !== 1 || scenarios.length !== 1) return null;
  const reality = realities[0], scenario = scenarios[0];
  const realityBrief = reality.briefSnapshot as DecisionBriefV1;
  const scenarioBrief = scenario.briefSnapshot as DecisionBriefV1;
  if (realityBrief.identity.mode !== "reality" || scenarioBrief.identity.mode !== "scenario" ||
      realityBrief.identity.generatedAt !== scenarioBrief.identity.generatedAt ||
      realityBrief.identity.realityRevision !== scenarioBrief.identity.realityRevision ||
      !realityBrief.identity.comparisonRequestHash ||
      realityBrief.identity.comparisonRequestHash !== scenarioBrief.identity.comparisonRequestHash) return null;
  return { reality, scenario, realityBrief, scenarioBrief };
}

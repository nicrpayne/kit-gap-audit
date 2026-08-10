import type { SimulationResult } from "@/lib/forecast/simulate";

// Deliberately narrow: the only comparison Portfolio's UI actually renders
// today is the likely-date delta between a baseline and a preview
// SimulationResult (previously computed inline, once per scope row, in
// PortfolioPageClient.tsx's JSX). A confidence delta is NOT included here
// on purpose -- confidence is only meaningful relative to a specific
// target/evaluation date (an output-side concept resolved by
// confidenceAtDay/percentileDay in lib/forecast/simulate.ts, not an input
// this module knows about), so bolting an implicit confidenceDeltaPct onto
// this type would silently assume whichever target happened to be set
// rather than requiring a caller to say so. Extend this later with an
// explicit target-date argument, not an implicit one, if/when
// target-relative comparison is actually needed (Forecast Canvas work).
export interface ScenarioComparison {
  deltaDays: number;
}

// baseline/preview undefined (e.g. still loading, or no preview computed
// yet) -> a zero delta, matching the JSX's prior inline fallback exactly.
export function compareToBaseline(
  baseline: SimulationResult | undefined,
  preview: SimulationResult | undefined
): ScenarioComparison {
  if (!baseline || !preview) return { deltaDays: 0 };
  return {
    deltaDays: Math.round((preview.likelyDate.getTime() - baseline.likelyDate.getTime()) / 86400000),
  };
}

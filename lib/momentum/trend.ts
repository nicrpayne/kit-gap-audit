// Momentum as DIRECTION, not as a score.
//
// This module deliberately introduces no new scoring system. It is a thin
// reading of what lib/momentum/compute.ts already produces (dateDeltaDays,
// confidenceDeltaPct, stalled -- and the same fixed thresholds), turned
// into the one thing a person actually wants off a glance: are we moving,
// which way, and over what period. Everything below is derived from stored
// Reports; nothing is estimated, weighted, or invented.
//
// Why direction beats a number here: "Momentum 72/100" is unfalsifiable and
// unactionable, while "rising -- 11 days sooner over the last 14" is a
// claim you can check against the record and argue with.

import type { Momentum } from "@/lib/momentum/compute";

export type TrendDirection = "rising" | "falling" | "steady" | "mixed";

export interface MomentumTrend {
  direction: TrendDirection;
  /** Forecast movement in days; negative = pulled earlier = favourable. */
  dateDeltaDays: number;
  confidenceDeltaPct: number | null;
  /** Days between the comparison report and now. */
  overDays: number;
  /** The state worth calling out: trajectory improved before the headline
      date did. Lets the UI say so explicitly instead of looking inert. */
  dateUnchangedButImproving: boolean;
  /** Factual one-liners, each traceable to a stored value. */
  drivers: MomentumDriver[];
}

export interface MomentumDriver {
  tone: "good" | "bad" | "neutral";
  text: string;
}

// Same thresholds as computeMomentum's `stalled` -- imported by value
// rather than re-tuned, so "did anything happen" means one thing app-wide.
const DATE_THRESHOLD_DAYS = 1;
const CONFIDENCE_THRESHOLD_PCT = 5;

export interface TrendSourceReport {
  generatedAt: Date;
  shippedCount: number;
  resolvedSinceLastCount: number;
}

export function computeMomentumTrend(
  momentum: Momentum,
  latestReport: TrendSourceReport | null,
  now: Date = new Date()
): MomentumTrend {
  const { dateDeltaDays, confidenceDeltaPct } = momentum;

  const dateSignal = Math.abs(dateDeltaDays) < DATE_THRESHOLD_DAYS ? 0 : dateDeltaDays < 0 ? 1 : -1;
  const confSignal =
    confidenceDeltaPct === null || Math.abs(confidenceDeltaPct) < CONFIDENCE_THRESHOLD_PCT
      ? 0
      : confidenceDeltaPct > 0
        ? 1
        : -1;

  let direction: TrendDirection;
  if (dateSignal === 0 && confSignal === 0) direction = "steady";
  else if (dateSignal * confSignal < 0) direction = "mixed";
  else direction = dateSignal + confSignal > 0 ? "rising" : "falling";

  const overDays = Math.max(
    0,
    Math.round((now.getTime() - momentum.previousGeneratedAt.getTime()) / 86400000)
  );

  const drivers: MomentumDriver[] = [];
  if (dateSignal !== 0) {
    drivers.push({
      tone: dateSignal > 0 ? "good" : "bad",
      text:
        dateSignal > 0
          ? `Forecast pulled in ${Math.abs(dateDeltaDays)} days`
          : `Forecast slipped ${dateDeltaDays} days`,
    });
  }
  if (confSignal !== 0 && confidenceDeltaPct !== null) {
    drivers.push({
      tone: confSignal > 0 ? "good" : "bad",
      text:
        confSignal > 0
          ? `Confidence at target up ${Math.round(confidenceDeltaPct)} points`
          : `Confidence at target down ${Math.abs(Math.round(confidenceDeltaPct))} points`,
    });
  }
  // Stored counts from the report itself -- the only attribution available
  // without re-deriving history, and already the basis of /reports' own
  // "what changed" line (see lib/momentum/attribution.ts).
  if (latestReport) {
    if (latestReport.resolvedSinceLastCount > 0) {
      const n = latestReport.resolvedSinceLastCount;
      drivers.push({ tone: "good", text: `${n} blocking decision${n === 1 ? "" : "s"} resolved` });
    }
    if (latestReport.shippedCount > 0) {
      drivers.push({ tone: "neutral", text: `${latestReport.shippedCount} tickets shipped` });
    }
  }

  return {
    direction,
    dateDeltaDays,
    confidenceDeltaPct,
    overDays,
    dateUnchangedButImproving: dateSignal === 0 && confSignal > 0,
    drivers,
  };
}

export const DIRECTION_GLYPH: Record<TrendDirection, string> = {
  rising: "↑",
  falling: "↓",
  steady: "→",
  mixed: "↕",
};

export const DIRECTION_LABEL: Record<TrendDirection, string> = {
  rising: "Rising",
  falling: "Falling",
  steady: "Steady",
  mixed: "Mixed",
};

export function directionTone(d: TrendDirection): string {
  if (d === "rising") return "var(--i-mint)";
  if (d === "falling") return "var(--i-red)";
  if (d === "mixed") return "var(--i-amber)";
  return "var(--i-text-soft)";
}

// "11 days sooner over 14 days" / "unchanged over 7 days" -- the one-line
// factual restatement under the direction word.
export function trendPhrase(t: MomentumTrend): string {
  const over = t.overDays === 0 ? "today" : `over ${t.overDays} day${t.overDays === 1 ? "" : "s"}`;
  if (t.dateUnchangedButImproving && t.confidenceDeltaPct !== null) {
    return `date unchanged, confidence +${Math.round(t.confidenceDeltaPct)} pts ${over}`;
  }
  if (Math.abs(t.dateDeltaDays) < DATE_THRESHOLD_DAYS) {
    if (t.confidenceDeltaPct !== null && Math.abs(t.confidenceDeltaPct) >= CONFIDENCE_THRESHOLD_PCT) {
      const sign = t.confidenceDeltaPct > 0 ? "+" : "";
      return `date unchanged, confidence ${sign}${Math.round(t.confidenceDeltaPct)} pts ${over}`;
    }
    return `unchanged ${over}`;
  }
  const days = Math.abs(t.dateDeltaDays);
  return `${days} day${days === 1 ? "" : "s"} ${t.dateDeltaDays < 0 ? "sooner" : "later"} ${over}`;
}

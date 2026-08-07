// Pure momentum arithmetic -- no DB, no network. Shared by the live
// /forecast momentum chip and the /reports momentum strip so "what counts
// as stalled" and "how a delta gets phrased" can never drift between the
// two surfaces. See lib/reports/changes.ts for the (DB-touching)
// attribution half.

export interface MomentumSnapshot {
  generatedAt: Date;
  likelyDate: Date;
  confidenceAtTarget: number | null;
}

export interface Momentum {
  previousGeneratedAt: Date;
  dateDeltaDays: number; // negative = sooner than the comparison point
  confidenceDeltaPct: number | null; // null if either side has no target date
  // Below-threshold movement is itself a signal worth naming, not just
  // silence -- see the "stalled" pill. Thresholds are deliberately small
  // and fixed, not learned or configurable, since "did anything happen"
  // is a simple factual question, not a judgment call worth a lever.
  stalled: boolean;
}

const STALLED_DATE_THRESHOLD_DAYS = 1;
const STALLED_CONFIDENCE_THRESHOLD_PCT = 5;

export function computeMomentum(current: MomentumSnapshot, previous: MomentumSnapshot): Momentum {
  const dateDeltaDays = Math.round((current.likelyDate.getTime() - previous.likelyDate.getTime()) / 86400000);
  const confidenceDeltaPct =
    current.confidenceAtTarget !== null && previous.confidenceAtTarget !== null
      ? current.confidenceAtTarget - previous.confidenceAtTarget
      : null;

  const stalled =
    Math.abs(dateDeltaDays) < STALLED_DATE_THRESHOLD_DAYS &&
    (confidenceDeltaPct === null || Math.abs(confidenceDeltaPct) < STALLED_CONFIDENCE_THRESHOLD_PCT);

  return { previousGeneratedAt: previous.generatedAt, dateDeltaDays, confidenceDeltaPct, stalled };
}

// "12 days sooner" / "3 days later" / "unchanged" -- the one-line phrasing
// used both collapsed (paired with a time reference) and in prose.
export function dateDeltaPhrase(days: number): string {
  if (days === 0) return "unchanged";
  return days < 0 ? `${Math.abs(days)} days sooner` : `${days} days later`;
}

// "you'd win this bet 62 times out of 100" -- betting-odds framing for a
// raw confidence percentage, per the design brief's "say it like a person
// would" principle.
export function bettingOddsPhrase(confidencePct: number): string {
  const wins = Math.round(confidencePct);
  return `you'd win this bet ${wins} times out of 100`;
}

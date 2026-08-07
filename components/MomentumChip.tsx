"use client";

import { useState } from "react";
import Sparkline, { type SparklinePoint } from "./Sparkline";
import { dateDeltaPhrase } from "@/lib/momentum/compute";

export interface MomentumData {
  previousGeneratedAt: string;
  dateDeltaDays: number;
  confidenceDeltaPct: number | null;
  stalled: boolean;
  attribution: string | null;
  sparkline: SparklinePoint[];
}

function daysSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
}

// Collapsed by default: sparkline + one line + chevron. Expanding reveals
// the attribution sentence and the confidence-momentum line -- neither is
// shown until the user asks, per the brief's progressive-disclosure rule.
// The absence of movement (stalled) is rendered as its own neutral pill
// rather than silently showing nothing, since stillness is a signal too.
export default function MomentumChip({ momentum, currentConfidence }: { momentum: MomentumData; currentConfidence: number | null }) {
  const [expanded, setExpanded] = useState(false);

  const previousConfidence =
    currentConfidence !== null && momentum.confidenceDeltaPct !== null
      ? currentConfidence - momentum.confidenceDeltaPct
      : null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 rounded-full border border-[var(--color-line)] bg-white px-3.5 py-2 text-xs hover:bg-black/[0.02] transition-colors"
      >
        <Sparkline points={momentum.sparkline} color={momentum.stalled ? "var(--color-ink-soft)" : "var(--color-accent)"} />
        {momentum.stalled ? (
          <span className="rounded-full bg-[var(--color-line)]/60 text-[var(--color-ink-soft)] px-2 py-0.5 font-medium">
            Unchanged for {daysSince(momentum.previousGeneratedAt)} days
          </span>
        ) : (
          <span className="text-[var(--color-ink)]">
            <strong>{dateDeltaPhrase(momentum.dateDeltaDays)}</strong> than last report
          </span>
        )}
        <span className="ml-auto text-[var(--color-ink-soft)]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-2 px-3.5 py-3 rounded-lg bg-[var(--color-accent-soft)]/40 text-xs space-y-1.5">
          {momentum.attribution ? (
            <p>{momentum.attribution}</p>
          ) : (
            <p className="text-[var(--color-ink-soft)]">Nothing specific moved the number since last report.</p>
          )}
          {momentum.confidenceDeltaPct !== null && previousConfidence !== null && (
            <p className="text-[var(--color-ink-soft)]">
              Confidence {momentum.confidenceDeltaPct >= 0 ? "climbed" : "dropped"} {Math.round(previousConfidence)}%
              {" → "}
              {Math.round(currentConfidence!)}%.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

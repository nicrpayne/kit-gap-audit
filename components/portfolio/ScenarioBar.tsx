"use client";

// The state bar: what you are looking at, and the two things you can do
// about it. Replaces the old bottom InstrumentFooter -- with the bay now
// occupying the lower edge, a second strip down there was one horizontal
// band too many, and "am I in Reality or a scenario" belongs next to
// "commit it / throw it away" rather than at the opposite end of the
// screen.
//
// The truth-model warnings (aggregate -> explicit conversion, blocked named
// transfers) are preserved verbatim in meaning from the pre-Instrument UI --
// see docs/SCENARIO-MODEL.md. "Commit changes", not "Save scenario": this
// still writes straight into Reality; there is no saved-scenario object yet.

export interface ScenarioCapacityLine {
  scopeId: string;
  scopeName: string;
  fteAdded: number;
}

export interface AggregateConversionLine {
  scopeId: string;
  scopeName: string;
  from: number;
  to: number;
  wasInferred: boolean;
}

export interface BlockedMoveLine {
  personId: string;
  personName: string;
  blockedReason: string;
}

interface ScenarioBarProps {
  dirty: boolean;
  saving: boolean;
  canCommit: boolean;
  capacityLines: ScenarioCapacityLine[];
  namedTransferCount: number;
  switchCostChanged: boolean;
  aggregateConversions: AggregateConversionLine[];
  blockedMoves: BlockedMoveLine[];
  onCommit: () => void;
  onDiscard: () => void;
  onOpenAllocations: () => void;
  saveError: string | null;
  saveSummary: { text: string; hadBlocks: boolean } | null;
}

export default function ScenarioBar({
  dirty,
  saving,
  canCommit,
  capacityLines,
  namedTransferCount,
  switchCostChanged,
  aggregateConversions,
  blockedMoves,
  onCommit,
  onDiscard,
  onOpenAllocations,
  saveError,
  saveSummary,
}: ScenarioBarProps) {
  const hasWarnings = aggregateConversions.length > 0 || blockedMoves.length > 0;

  return (
    <div className="shrink-0" style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}>
      <div className="flex items-center gap-2.5 px-4 py-2.5 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{
            background: dirty ? "var(--i-violet-soft)" : "var(--i-panel-raised)",
            color: dirty ? "var(--i-violet)" : "var(--i-text-soft)",
          }}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: dirty ? "var(--i-violet)" : "var(--i-text-faint)" }}
          />
          {dirty ? "Scenario · unsaved" : "Reality"}
        </span>

        {dirty &&
          capacityLines.map((l) => (
            <span
              key={l.scopeId}
              className="rounded-full px-2.5 py-1 text-[11px] tabular-nums"
              style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
            >
              {l.scopeName} +{l.fteAdded.toFixed(1)} FTE
            </span>
          ))}
        {dirty && namedTransferCount > 0 && (
          <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}>
            {namedTransferCount} {namedTransferCount === 1 ? "person" : "people"} reallocated
          </span>
        )}
        {dirty && switchCostChanged && (
          <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}>
            switch cost changed
          </span>
        )}

        <div className="flex-1" />

        {!canCommit && dirty && <span className="text-[11px] text-[var(--i-red)]">Fix over-allocation to commit.</span>}
        {saveError && <span className="text-[11px] text-[var(--i-red)]">{saveError}</span>}
        {saveSummary && (
          <span className="text-[11px]" style={{ color: saveSummary.hadBlocks ? "var(--i-amber)" : "var(--i-text-faint)" }}>
            {saveSummary.text}
          </span>
        )}

        <button
          onClick={onOpenAllocations}
          className="rounded-md px-2.5 py-1.5 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] transition-colors"
          style={{ border: "1px solid var(--i-border-strong)" }}
        >
          People
        </button>
        <button
          onClick={onDiscard}
          disabled={saving || !dirty}
          className="rounded-md px-2.5 py-1.5 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] disabled:opacity-25 transition-colors"
          style={{ border: "1px solid var(--i-border-strong)" }}
        >
          Discard
        </button>
        <button
          onClick={onCommit}
          disabled={saving || !dirty || !canCommit}
          className="rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-25 transition-[filter] hover:brightness-110"
          style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
        >
          {saving ? "Committing…" : "Commit changes"}
        </button>
      </div>

      {hasWarnings && dirty && (
        <div
          className="px-4 py-2.5 text-[11px] space-y-1"
          style={{ background: "var(--i-amber-soft)", borderTop: "1px solid rgba(224,176,74,0.25)" }}
        >
          <div className="font-semibold text-[var(--i-amber)]">Committing this will:</div>
          {aggregateConversions.map((c) => (
            <div key={c.scopeId} className="text-[var(--i-text-soft)]">
              Set <strong className="text-[var(--i-text)]">{c.scopeName}</strong>&rsquo;s capacity explicitly to{" "}
              <strong className="text-[var(--i-text)]">{c.to.toFixed(2)}</strong> — it will no longer be{" "}
              {c.wasInferred ? "inferred from Linear" : "a plain flat number"}, and stays explicit going forward.
            </div>
          ))}
          {blockedMoves.map((m) => (
            <div key={m.personId} className="text-[var(--i-red)]">
              Can&rsquo;t commit {m.personName}&rsquo;s allocation change — {m.blockedReason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

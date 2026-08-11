"use client";

// Compact scenario summary + Commit/Discard -- ONE footer strip, not a
// second card pile. The truth-model warnings (aggregate->explicit
// conversion, blocked named transfers) are preserved verbatim in meaning
// from the pre-Instrument UI, just restyled -- see docs/SCENARIO-MODEL.md.
// "Commit changes" not "Save Scenario": this action still writes straight
// into Reality, there is no saved-scenario object yet (see
// docs/DESIGN-NORTH-STAR.md).

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

interface InstrumentFooterProps {
  dirty: boolean;
  saving: boolean;
  canCommit: boolean;
  capacityLines: ScenarioCapacityLine[];
  namedTransferCount: number;
  aggregateConversions: AggregateConversionLine[];
  blockedMoves: BlockedMoveLine[];
  onCommit: () => void;
  onDiscard: () => void;
  saveError: string | null;
  saveSummary: { text: string; hadBlocks: boolean } | null;
}

export default function InstrumentFooter({
  dirty,
  saving,
  canCommit,
  capacityLines,
  namedTransferCount,
  aggregateConversions,
  blockedMoves,
  onCommit,
  onDiscard,
  saveError,
  saveSummary,
}: InstrumentFooterProps) {
  const hasWarnings = aggregateConversions.length > 0 || blockedMoves.length > 0;

  return (
    <div className="border-t border-[var(--i-border)] bg-[var(--i-panel)] px-5 py-4">
      {dirty && (capacityLines.length > 0 || namedTransferCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-[var(--i-violet)] font-medium">Scenario</span>
          {capacityLines.map((l) => (
            <span
              key={l.scopeId}
              className="rounded-full border border-[var(--i-violet)]/40 bg-[var(--i-violet-soft)] text-[var(--i-violet)] px-2.5 py-1"
            >
              {l.scopeName} +{l.fteAdded.toFixed(1)} FTE
            </span>
          ))}
          {namedTransferCount > 0 && (
            <span className="rounded-full border border-[var(--i-violet)]/40 bg-[var(--i-violet-soft)] text-[var(--i-violet)] px-2.5 py-1">
              {namedTransferCount} {namedTransferCount === 1 ? "person" : "people"} reallocated
            </span>
          )}
        </div>
      )}

      {hasWarnings && (
        <div className="mb-3 text-xs space-y-1.5 rounded-md border border-[var(--i-amber)]/30 bg-[var(--i-amber-soft)] px-3 py-2.5">
          <div className="font-medium text-[var(--i-amber)]">Committing this will:</div>
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

      <div className="flex items-center gap-3">
        <button
          onClick={onCommit}
          disabled={saving || !dirty || !canCommit}
          className="rounded-md bg-[var(--i-violet)] text-[var(--i-bg)] px-4 py-2 text-xs font-medium hover:brightness-110 disabled:opacity-30 disabled:hover:brightness-100 transition-colors"
        >
          {saving ? "Committing…" : "Commit changes"}
        </button>
        <button
          onClick={onDiscard}
          disabled={saving || !dirty}
          className="rounded-md border border-[var(--i-border-strong)] text-[var(--i-text-soft)] px-4 py-2 text-xs font-medium hover:bg-[var(--i-panel-raised)] hover:text-[var(--i-text)] disabled:opacity-30 transition-colors"
        >
          Discard
        </button>
        {!canCommit && dirty && (
          <span className="text-xs text-[var(--i-red)]">Fix over-allocation before committing.</span>
        )}
        {saveError && <span className="text-xs text-[var(--i-red)]">{saveError}</span>}
        {saveSummary && (
          <span className="text-xs" style={{ color: saveSummary.hadBlocks ? "var(--i-amber)" : "var(--i-text-faint)" }}>
            {saveSummary.text}
          </span>
        )}
      </div>
    </div>
  );
}

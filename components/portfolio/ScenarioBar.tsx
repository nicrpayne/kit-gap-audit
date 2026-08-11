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
  realityFte: number;
  scenarioFte: number;
}

export interface BlockedCapacityScope {
  scopeId: string;
  scopeName: string;
  realityFte: number;
  scenarioFte: number;
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
  /** Target dates scrubbed but not saved. Deliberately NOT part of `dirty`:
      moving a target is an evaluation, not a scenario change, and must not
      make the state pill claim you're holding an unsaved scenario. It does
      still need to be abandonable, so Discard covers it. */
  hasPendingTargets: boolean;
  saving: boolean;
  canCommit: boolean;
  overAllocated: boolean;
  capacityLines: ScenarioCapacityLine[];
  namedTransferCount: number;
  switchCostChanged: boolean;
  aggregateConversions: AggregateConversionLine[];
  blockedCapacityScopes: BlockedCapacityScope[];
  blockedMoves: BlockedMoveLine[];
  onCommit: () => void;
  onDiscard: () => void;
  onOpenAllocations: () => void;
  saveError: string | null;
  saveSummary: { text: string; hadBlocks: boolean } | null;
}

export default function ScenarioBar({
  dirty,
  hasPendingTargets,
  saving,
  canCommit,
  overAllocated,
  capacityLines,
  namedTransferCount,
  switchCostChanged,
  aggregateConversions,
  blockedCapacityScopes,
  blockedMoves,
  onCommit,
  onDiscard,
  onOpenAllocations,
  saveError,
  saveSummary,
}: ScenarioBarProps) {
  const hasWarnings = aggregateConversions.length > 0 || blockedMoves.length > 0 || blockedCapacityScopes.length > 0;

  return (
    <div className="shrink-0" data-shoot="scenario-bar" style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}>
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

        {dirty && capacityLines.length > 0 && (
          <span className="i-label" style={{ color: "var(--i-violet)" }}>
            Changed
          </span>
        )}
        {dirty &&
          capacityLines.map((l) => (
            <span
              key={l.scopeId}
              className="rounded-full px-2.5 py-1 text-[11px] tabular-nums"
              style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
            >
              {l.scopeName} {l.realityFte.toFixed(1)} → {l.scenarioFte.toFixed(1)} FTE
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

        {overAllocated && dirty && <span className="text-[11px] text-[var(--i-red)]">Fix over-allocation to commit.</span>}
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
          disabled={saving || (!dirty && !hasPendingTargets)}
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

      {/* Blocked-by-design, not an error: previewing an aggregate total on a
          people-tracked scope is legitimate; writing it back is not, because
          a single number can't say which person changed. */}
      {dirty && blockedCapacityScopes.length > 0 && (
        <div
          className="px-4 py-2.5 text-[11px] space-y-1"
          style={{ background: "var(--i-red-soft)", borderTop: "1px solid rgba(239,107,91,0.3)" }}
        >
          <div className="font-semibold text-[var(--i-red)]">Can&rsquo;t commit this capacity change:</div>
          {blockedCapacityScopes.map((s) => (
            <div key={s.scopeId} className="text-[var(--i-text-soft)]">
              <strong className="text-[var(--i-text)]">{s.scopeName}</strong> is tracked by named people
              ({s.realityFte.toFixed(1)} FTE). Simulating it at {s.scenarioFte.toFixed(1)} is fine, but saving a
              total wouldn&rsquo;t say who changed — adjust individual allocations under{" "}
              <button onClick={onOpenAllocations} className="underline underline-offset-2 hover:text-[var(--i-text)]">
                People
              </button>
              , or reset the fader to commit everything else.
            </div>
          ))}
        </div>
      )}

      {hasWarnings && dirty && (aggregateConversions.length > 0 || blockedMoves.length > 0) && (
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

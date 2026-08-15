"use client";

// CHANGING HOW PRECISELY WE KNOW A TEAM, with the consequence shown first.
//
// The product thesis is CONSEQUENCE BEFORE COMMITMENT, and nowhere does it
// matter more than here: a Scope modelled as "10 FTE" that becomes "Alice
// half-time and Bob" has not lost 8.5 people, it has stopped guessing --
// but the date moves a long way, and nobody should discover that after
// pressing the button.
//
// So this dialog is a Scenario with a confirm on the end. The date it
// shows comes from the same runPortfolioSimulation over the same payload
// the Forecast uses, via resolutionOverrideByScope -- not a separate
// estimate that could disagree with what committing actually does.

import { useMemo } from "react";

export interface ResolutionCandidate {
  personId: string;
  name: string;
  fte: number;
  /** Share of their own time not committed to any other Scope, 0..1. */
  availableFraction: number;
}

interface Props {
  open: boolean;
  scopeName: string;
  teamEstimate: number;
  contextSwitchCostPct: number;
  candidates: ResolutionCandidate[];
  /** personId -> share of their time, as this dialog currently proposes. */
  roster: Map<string, number>;
  onSetFraction: (personId: string, fraction: number) => void;
  /** Reality's date today, and the date the proposed roster would produce. */
  currentDate: string | null;
  proposedDate: string | null;
  proposedCapacity: number;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CapacityResolutionDialog({
  open,
  scopeName,
  teamEstimate,
  contextSwitchCostPct,
  candidates,
  roster,
  onSetFraction,
  currentDate,
  proposedDate,
  proposedCapacity,
  saving,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const assigned = useMemo(() => [...roster.values()].filter((f) => f > 1e-6).length, [roster]);

  // Over-committing someone is refused by the server too; catching it here
  // means the button explains itself rather than failing on press.
  const overCommitted = useMemo(
    () =>
      candidates.filter((c) => (roster.get(c.personId) ?? 0) - c.availableFraction > 1e-6).map((c) => c.name),
    [candidates, roster]
  );

  const splitPeople = useMemo(
    () =>
      candidates.filter(
        (c) => (roster.get(c.personId) ?? 0) > 1e-6 && c.availableFraction < 1 - 1e-6
      ).length,
    [candidates, roster]
  );

  if (!open) return null;

  const canConfirm = assigned > 0 && overCommitted.length === 0 && !saving;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(6,8,10,0.72)" }}
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Track ${scopeName} by named people`}
        onClick={(e) => e.stopPropagation()}
        data-shoot="resolution-dialog"
        className="w-[560px] max-w-full max-h-full overflow-y-auto rounded-lg"
        style={{ background: "var(--i-bg)", border: "1px solid var(--i-border-strong)" }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div className="i-label">Allocation resolution</div>
          <div className="mt-1 text-[14px] text-[var(--i-text)]">Track {scopeName} by named people?</div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-[11.5px] leading-relaxed text-[var(--i-text-soft)]">
            {scopeName} is currently modelled as{" "}
            <strong className="text-[var(--i-text)]">{teamEstimate.toFixed(1)} FTE</strong> — a single number standing
            in for whoever is on it. Tracking it by name means the people you assign{" "}
            <strong className="text-[var(--i-text)]">become</strong> its capacity. The {teamEstimate.toFixed(1)} stops
            being used; it is remembered, so you can switch back.
          </p>

          <div>
            <div className="i-label mb-2">Who is on {scopeName}?</div>
            <div className="space-y-1.5">
              {candidates.length === 0 && (
                <div className="text-[11px] text-[var(--i-amber)]">
                  There are no people tracked yet, so there is nobody to assign.
                </div>
              )}
              {candidates.map((c) => {
                const pct = Math.round((roster.get(c.personId) ?? 0) * 100);
                const availablePct = Math.round(c.availableFraction * 100);
                const over = (roster.get(c.personId) ?? 0) - c.availableFraction > 1e-6;
                return (
                  <div
                    key={c.personId}
                    data-shoot="candidate"
                    data-free={availablePct}
                    className="flex items-center gap-2.5 text-[11.5px]"
                  >
                    <span className="w-32 shrink-0 truncate text-[var(--i-text)]">{c.name}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={pct}
                      aria-label={`${c.name} on ${scopeName}`}
                      onChange={(e) => onSetFraction(c.personId, parseInt(e.target.value, 10) / 100)}
                      className="flex-1 accent-[var(--i-violet)]"
                    />
                    <span
                      className="w-9 text-right tabular-nums"
                      style={{ color: over ? "var(--i-red)" : "var(--i-text-soft)" }}
                    >
                      {pct}%
                    </span>
                    <span className="w-24 shrink-0 text-[10.5px] text-[var(--i-text-faint)]">
                      {availablePct}% free
                    </span>
                  </div>
                );
              })}
            </div>
            {overCommitted.length > 0 && (
              <div className="mt-2 text-[11px] text-[var(--i-red)]">
                {overCommitted.join(", ")} {overCommitted.length === 1 ? "is" : "are"} already committed elsewhere.
                Capacity is one fixed pool — take the time from another Scope first.
              </div>
            )}
          </div>

          {/* THE CONSEQUENCE. Shown before the button, always, even when it
              is good news. */}
          <div className="rounded-md px-3.5 py-3" style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="i-label">Now</div>
                <div className="i-readout text-[19px] mt-1" data-shoot="resolution-current">
                  {currentDate ?? "—"}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[var(--i-text-faint)]">
                  {teamEstimate.toFixed(1)} FTE, team estimate
                </div>
              </div>
              <div className="text-[var(--i-text-faint)]">→</div>
              <div className="text-right">
                <div className="i-label">After switching</div>
                <div
                  className="i-readout text-[19px] mt-1"
                  data-shoot="resolution-proposed"
                  style={{ color: "var(--i-violet)" }}
                >
                  {assigned > 0 ? proposedDate ?? "—" : "—"}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[var(--i-text-faint)]">
                  {assigned > 0 ? `${proposedCapacity.toFixed(2)} FTE from ${assigned} ${assigned === 1 ? "person" : "people"}` : "nobody assigned yet"}
                </div>
              </div>
            </div>
            {assigned > 0 && splitPeople > 0 && contextSwitchCostPct > 0 && (
              <div className="mt-2.5 text-[10.5px] leading-relaxed text-[var(--i-amber)]">
                Context-switch cost ({contextSwitchCostPct}%) starts applying to {scopeName} — it never did while this
                was a flat number. {splitPeople} of the people you are assigning also work elsewhere, so they contribute
                less than their full share here.
              </div>
            )}
          </div>

          {assigned === 0 && (
            <p className="text-[10.5px] leading-relaxed text-[var(--i-text-faint)]">
              Assign at least one person. A Scope tracked by name with nobody on it has no capacity, and no honest
              forecast — so it can&rsquo;t be saved that way.
            </p>
          )}

          {error && <div className="text-[11px] text-[var(--i-red)]">{error}</div>}
        </div>

        <div className="px-5 py-3.5 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--i-border)" }}>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md px-2.5 py-1.5 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            data-shoot="confirm-resolution"
            className="rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-25"
            style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
          >
            {saving ? "Switching…" : "Switch to named tracking"}
          </button>
        </div>
      </div>
    </div>
  );
}

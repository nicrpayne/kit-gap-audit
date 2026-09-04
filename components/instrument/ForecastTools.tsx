"use client";

// The small summoned tools: Gate, Target, Context. Each one explains a
// single structure on the canvas and offers only the actions that structure
// truthfully supports. They are windows onto the model, not forms.

import ToolWindow, { Row } from "@/components/instrument/ToolWindow";
import type { DecisionGate, SimulationResult } from "@/lib/forecast/simulate";
import type { ProjectScope, ProjectSource } from "@/lib/instrument/useProject";
import { fmtDay, fmtFull } from "@/lib/instrument/useProject";
import { confidenceAtDay } from "@/lib/forecast/simulate";
import Link from "@/components/instrument/SignalLink";

// ── GATE ─────────────────────────────────────────────────────────────────

export function GateDetail({
  gate,
  resolved,
  onToggle,
  onClose,
}: {
  gate: DecisionGate | null;
  resolved: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  if (!gate) return null;
  return (
    <ToolWindow open onClose={onClose} title="Open decision" subtitle={gate.label} width={380} dataShoot="tool-gate">
      <div className="px-5 py-4">
        <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">
          A decision is <strong className="text-[var(--i-text)]">serial delay, not effort</strong>. Every simulated
          run waits it out before the outcome can land — adding people changes nothing about it, which is why it is
          drawn as a wall the forecast presses against rather than as work inside the object.
        </p>

        <div className="mt-4">
          <Row k="Time to decide, best" v={`${gate.low}d`} />
          <Row k="Likely" v={`${gate.likely}d`} note="the wall stands at this day" />
          <Row k="Worst" v={`${gate.high}d`} />
        </div>

        <button
          type="button"
          data-shoot="gate-toggle"
          onClick={onToggle}
          className="mt-5 w-full rounded-md px-3 py-2.5 text-[12px] font-medium transition-colors"
          style={{
            background: resolved ? "var(--i-violet)" : "var(--i-panel-raised)",
            color: resolved ? "var(--i-void)" : "var(--i-text)",
            border: `1px solid ${resolved ? "var(--i-violet)" : "var(--i-border-strong)"}`,
          }}
        >
          {resolved ? "Assumed resolved — put it back" : "Assume resolved in Scenario"}
        </button>
        <p className="mt-2 text-[10px] text-[var(--i-text-faint)] leading-relaxed">
          Scenario only. Nothing is decided by this button — the wall releases in the hypothetical, and the forecast
          re-runs without the delay.
        </p>

        <Link
          href="/decisions"
          className="mt-4 block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
        >
          Decisions owns this →
        </Link>
      </div>
    </ToolWindow>
  );
}

// ── TARGET ───────────────────────────────────────────────────────────────

export function TargetDetail({
  open,
  onClose,
  scope,
  result,
  startDate,
  savedTargetDay,
  targetDay,
  onSetOverride,
  onClearOverride,
}: {
  open: boolean;
  onClose: () => void;
  scope: ProjectScope;
  result: SimulationResult;
  startDate: Date;
  savedTargetDay: number | null;
  targetDay: number | null;
  onSetOverride: (day: number) => void;
  onClearOverride: () => void;
}) {
  if (!open) return null;
  const d = (days: number) => fmtFull(new Date(startDate.getTime() + days * 86400000));
  const conf = targetDay === null ? null : confidenceAtDay(result.completionDaysSorted, targetDay);
  const overridden = targetDay !== null && targetDay !== savedTargetDay;

  const step = (delta: number) => {
    const from = targetDay ?? Math.round(result.percentiles.p50);
    onSetOverride(Math.round(from + delta));
  };

  return (
    <ToolWindow open onClose={onClose} title="Target evaluation" subtitle={scope.name} width={380} dataShoot="tool-target">
      <div className="px-5 py-4">
        <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">
          A target is <strong className="text-[var(--i-text)]">evaluation, not forecast input</strong>. Moving it
          never re-runs the simulation and never moves the object — it is a lookup against the same runs, which is
          why the form holds still while the line sweeps through it.
        </p>

        {targetDay === null ? (
          <>
            <p className="mt-4 text-[11px] text-[var(--i-text-faint)] leading-relaxed">
              No target is set on {scope.name}. You can evaluate a hypothetical one without saving anything.
            </p>
            <button
              type="button"
              data-shoot="target-hypothetical"
              onClick={() => onSetOverride(Math.round(result.percentiles.p50))}
              className="mt-3 w-full rounded-md px-3 py-2.5 text-[12px] font-medium transition-colors"
              style={{ background: "var(--i-panel-raised)", color: "var(--i-text)", border: "1px solid var(--i-border-strong)" }}
            >
              Evaluate a hypothetical target
            </button>
          </>
        ) : (
          <>
            <div className="mt-4">
              <Row k="Evaluating" v={d(targetDay)} changed={overridden} />
              {savedTargetDay !== null && overridden && <Row k="Saved target" v={d(savedTargetDay)} />}
              <Row
                k="Chance of hitting it"
                v={`${conf}%`}
                tone={conf !== null && conf >= 70 ? "var(--i-mint)" : conf !== null && conf >= 40 ? "var(--i-amber)" : "var(--i-red)"}
                note={`${conf} of every 100 runs land on or before it`}
              />
              <Row k="Miss tail" v={`${100 - (conf ?? 0)}%`} note="the hatched part of the object" />
            </div>

            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {[
                { l: "−7d", v: -7 },
                { l: "−1d", v: -1 },
                { l: "+1d", v: +1 },
                { l: "+7d", v: +7 },
              ].map((b) => (
                <button
                  key={b.l}
                  type="button"
                  data-shoot={`target-step-${b.v}`}
                  onClick={() => step(b.v)}
                  className="rounded-md py-2 text-[12px] i-readout transition-colors hover:text-[var(--i-text)]"
                  style={{ background: "var(--i-panel-raised)", color: "var(--i-text-soft)", border: "1px solid var(--i-border-strong)" }}
                >
                  {b.l}
                </button>
              ))}
            </div>

            {overridden && (
              <button
                type="button"
                data-shoot="target-reset"
                onClick={onClearOverride}
                className="mt-2 w-full rounded-md px-3 py-2 text-[11px] transition-colors"
                style={{ background: "transparent", color: "var(--i-text-soft)", border: "1px solid var(--i-border-strong)" }}
              >
                {savedTargetDay !== null ? `Back to the saved target · ${fmtDay(new Date(startDate.getTime() + savedTargetDay * 86400000))}` : "Stop evaluating"}
              </button>
            )}
          </>
        )}

        <Link
          href="/timeline"
          className="mt-4 block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
        >
          Timeline owns targets →
        </Link>
      </div>
    </ToolWindow>
  );
}

// ── REALITY ──────────────────────────────────────────────────────────────
// Summoned by clicking the ghost: the baseline this scenario left, side by
// side with the hypothetical, in the same vocabulary the object uses.

export function RealityDetail({
  open,
  onClose,
  scopeName,
  reality,
  scenario,
  scenarioActive,
  startDate,
}: {
  open: boolean;
  onClose: () => void;
  scopeName: string;
  reality: SimulationResult;
  scenario: SimulationResult;
  scenarioActive: boolean;
  startDate: Date;
}) {
  if (!open) return null;
  const d = (days: number) => fmtFull(new Date(startDate.getTime() + days * 86400000));
  const spreadR = Math.round(reality.percentiles.p90 - reality.percentiles.p10);
  const spreadS = Math.round(scenario.percentiles.p90 - scenario.percentiles.p10);
  const movedP50 = Math.round(scenario.percentiles.p50 - reality.percentiles.p50);
  const dSpread = spreadS - spreadR;
  return (
    <ToolWindow open onClose={onClose} title="Reality comparison" subtitle={scopeName} width={380} dataShoot="tool-reality">
      <div className="px-5 py-4">
        <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">
          The dashed outline is <strong className="text-[var(--i-text)]">Reality</strong> — what the app currently
          accepts as true. The solid body is the Scenario preview. Nothing becomes Reality from here: committing an
          assumption happens in the instrument that owns it.
        </p>

        <div className="i-label mt-4 mb-1" style={{ color: "var(--i-reality)" }}>
          Reality — the baseline
        </div>
        <Row k="Lands" v={d(reality.percentiles.p50)} />
        <Row k="Range" v={`${fmtDay(new Date(startDate.getTime() + reality.percentiles.p10 * 86400000))} — ${fmtDay(new Date(startDate.getTime() + reality.percentiles.p90 * 86400000))}`} note={`${spreadR}d spread`} />

        {scenarioActive ? (
          <>
            <div className="i-label mt-4 mb-1" style={{ color: "var(--i-violet)" }}>
              Scenario — the hypothetical
            </div>
            <Row k="Lands" v={d(scenario.percentiles.p50)} tone="var(--i-violet)" />
            <Row
              k="Range"
              v={`${fmtDay(new Date(startDate.getTime() + scenario.percentiles.p10 * 86400000))} — ${fmtDay(new Date(startDate.getTime() + scenario.percentiles.p90 * 86400000))}`}
              note={`${spreadS}d spread`}
            />
            <div className="i-label mt-4 mb-1">What the scenario changed</div>
            <Row
              k="Likely date"
              v={movedP50 === 0 ? "no change" : `${Math.abs(movedP50)}d ${movedP50 < 0 ? "earlier" : "later"}`}
              tone={movedP50 === 0 ? undefined : movedP50 < 0 ? "var(--i-mint)" : "var(--i-red)"}
            />
            <Row
              k="Uncertainty"
              v={dSpread === 0 ? "unchanged" : `${Math.abs(dSpread)}d ${dSpread < 0 ? "tighter" : "wider"}`}
              note="the spread between best and worst case"
            />
          </>
        ) : (
          <p className="mt-3 text-[11px] text-[var(--i-text-faint)] leading-relaxed">
            No scenario is active — the body on the canvas IS Reality right now.
          </p>
        )}
      </div>
    </ToolWindow>
  );
}

// ── CONTEXT ──────────────────────────────────────────────────────────────

export function ContextDetail({
  open,
  onClose,
  scope,
  sources,
  reportCount,
}: {
  open: boolean;
  onClose: () => void;
  scope: ProjectScope;
  sources: ProjectSource[];
  reportCount: number;
}) {
  if (!open) return null;
  const relevant = sources.filter((s) => s.scopeId === scope.scopeId || s.scopeId === null);
  const age = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return days <= 0 ? "today" : days === 1 ? "1 day old" : `${days} days old`;
  };
  return (
    <ToolWindow open onClose={onClose} title="What the model knows" subtitle={scope.name} width={380} dataShoot="tool-context">
      <div className="px-5 py-4">
        <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">
          The forecast is only as honest as its inputs. This is the provenance: what has been ingested, how fresh it
          is, and how much of the model it feeds.
        </p>

        <div className="mt-4">
          <Row k="Modelled work" v={`${scope.items.length} items`} note="each with a three-point estimate" />
          <Row k="Open decisions" v={`${scope.gates.length}`} />
          <Row
            k="Capacity"
            v={`${scope.teamCapacity.toFixed(2).replace(/0$/, "")} FTE`}
            note={
              scope.capacitySource === "inferred"
                ? "inferred from Linear assignees on remaining work"
                : scope.capacitySource === "allocations"
                  ? "named people allocated in Portfolio"
                  : "set by hand in Portfolio"
            }
          />
          <Row k="Reports" v={`${reportCount}`} note="the history Momentum reads" />
        </div>

        <div className="i-label mt-5 mb-1">Sources</div>
        {relevant.length === 0 && (
          <p className="text-[11px] text-[var(--i-text-faint)]">No ingested sources reference this scope.</p>
        )}
        {relevant.map((s) => (
          <div key={s.id} className="flex items-baseline justify-between gap-3 py-2" style={{ borderTop: "1px solid var(--i-border)" }}>
            <span className="min-w-0">
              <span className="block text-[11.5px] text-[var(--i-text)] truncate">{s.title}</span>
              <span className="block text-[9.5px] uppercase tracking-wide text-[var(--i-text-faint)] mt-0.5">{s.kind}</span>
            </span>
            <span className="i-readout shrink-0 text-[10.5px] text-[var(--i-text-faint)]">{age(s.createdAt)}</span>
          </div>
        ))}

        <Link
          href="/audit"
          className="mt-4 block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
        >
          Audit owns ingestion →
        </Link>
      </div>
    </ToolWindow>
  );
}

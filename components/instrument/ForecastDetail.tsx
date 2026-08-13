"use client";

// FORECAST DETAIL — the summoned tool window.
//
// All the statistical vocabulary the main instrument deliberately refuses to
// wear permanently: percentiles, trial count, what "likely" means, where the
// inputs came from. It opens instantly and closes completely, so the default
// surface can stay quiet without the rigour being hidden.

import type { SimulationResult, DecisionGate } from "@/lib/forecast/simulate";
import { fmtFull, deltaLabel } from "@/lib/instrument/useProject";

function Row({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2" style={{ borderTop: "1px solid var(--i-border)" }}>
      <span className="i-label shrink-0">{k}</span>
      <span className="min-w-0 text-right">
        <span className="i-readout text-[12.5px] text-[var(--i-text)]">{v}</span>
        {note && <span className="block text-[10px] text-[var(--i-text-faint)] mt-0.5">{note}</span>}
      </span>
    </div>
  );
}

export default function ForecastDetail({
  open,
  onClose,
  scopeName,
  result,
  reality,
  startDate,
  targetDay,
  confidence,
  gates,
  resolvedGateIds,
  capacity,
  capacitySource,
  itemsIn,
  itemsTotal,
}: {
  open: boolean;
  onClose: () => void;
  scopeName: string;
  result: SimulationResult;
  reality?: SimulationResult;
  startDate: Date;
  targetDay: number | null;
  confidence: number | null;
  gates: DecisionGate[];
  resolvedGateIds: Set<string>;
  capacity: number;
  capacitySource: string;
  itemsIn: number;
  itemsTotal: number;
}) {
  if (!open) return null;
  const d = (days: number) => fmtFull(new Date(startDate.getTime() + days * 86400000));
  const moved = reality ? Math.round((result.likelyDate.getTime() - reality.likelyDate.getTime()) / 86400000) : 0;
  const openGates = gates.filter((g) => !resolvedGateIds.has(g.id));
  const gateDays = openGates.reduce((s, g) => s + g.likely, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end"
      style={{ background: "rgba(6,8,10,0.55)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Forecast detail"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-[420px] max-w-[95vw] overflow-y-auto"
        style={{ background: "var(--i-panel)", borderLeft: "1px solid var(--i-border-strong)" }}
      >
        <div
          className="sticky top-0 flex items-start justify-between px-5 py-4"
          style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}
        >
          <div>
            <div className="i-label">Forecast detail</div>
            <div className="mt-1 text-[13px] text-[var(--i-text)]">{scopeName}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 rounded flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <section>
            <div className="i-label mb-1">The distribution</div>
            <p className="text-[11px] text-[var(--i-text-faint)] leading-relaxed mb-2">
              5,000 simulated runs of the remaining work. Each run samples every item&rsquo;s three-point estimate and
              adds the serial delay of any open decision, then divides the effort by the team&rsquo;s parallel
              capacity.
            </p>
            <Row k="Earliest realistic (P10)" v={d(result.percentiles.p10)} note="1 run in 10 finishes by here" />
            <Row k="Likely (P50)" v={d(result.percentiles.p50)} note="half the runs land before this" />
            <Row k="Comfortable (P85)" v={d(result.percentiles.p85)} />
            <Row k="Worst realistic (P90)" v={d(result.percentiles.p90)} note="9 runs in 10 finish by here" />
            <Row
              k="Spread"
              v={`${Math.round(result.percentiles.p90 - result.percentiles.p10)} ${
                Math.round(result.percentiles.p90 - result.percentiles.p10) === 1 ? "day" : "days"
              }`}
              note="this is what the object's length shows"
            />
          </section>

          <section>
            <div className="i-label mb-1">Target evaluation</div>
            {targetDay === null ? (
              <p className="text-[11px] text-[var(--i-text-faint)] leading-relaxed">
                No target set. Moving a target never re-runs the simulation — it is a lookup against the runs above,
                which is why the object does not move when you scrub it.
              </p>
            ) : (
              <>
                <Row k="Target" v={d(targetDay)} />
                <Row
                  k="Chance of hitting it"
                  v={`${confidence}%`}
                  note={`${confidence} of every 100 runs land on or before the target`}
                />
                <Row
                  k="Miss tail"
                  v={`${100 - (confidence ?? 0)}%`}
                  note="the hatched part of the object"
                />
              </>
            )}
          </section>

          <section>
            <div className="i-label mb-1">What is shaping it</div>
            <Row
              k="Capacity"
              v={`${capacity.toFixed(1)} FTE`}
              note={
                capacitySource === "inferred"
                  ? "inferred from Linear assignees — Portfolio owns this"
                  : capacitySource === "allocations"
                    ? "named people — Portfolio owns this"
                    : "set by hand — Portfolio owns this"
              }
            />
            <Row k="Work in scope" v={`${itemsIn} of ${itemsTotal} items`} note="Scope owns this" />
            <Row
              k="Open decisions"
              v={openGates.length === 0 ? "none" : `${openGates.length} · +${Math.round(gateDays)}d`}
              note={
                openGates.length === 0
                  ? "nothing gating"
                  : "serial delay — adding people does not shorten it. Decisions owns this"
              }
            />
            {reality && (
              <Row
                k="Versus Reality"
                v={moved === 0 ? "no change" : deltaLabel(moved)}
                note="the dashed outline behind the object"
              />
            )}
          </section>

          <section>
            <div className="i-label mb-2">How to read the object</div>
            <ul className="space-y-2 text-[11px] text-[var(--i-text-soft)] leading-relaxed">
              <li>
                <strong className="text-[var(--i-text)]">Length</strong> is the real spread between best and worst
                case, measured in days on the same scale as the target line. Long means uncertain, not late.
              </li>
              <li>
                <strong className="text-[var(--i-text)]">Grain</strong> appears as the spread grows — the same fact as
                the length, given a second channel so you can read it without measuring.
              </li>
              <li>
                <strong className="text-[var(--i-text)]">Glow</strong> only means something when a target exists: it is
                the chance of hitting it. With no target the object stays neutral rather than implying earlier is
                better.
              </li>
              <li>
                <strong className="text-[var(--i-text)]">The amber wall</strong> is an open decision. It is drawn as a
                boundary because a decision is not effort — capacity cannot cross it.
              </li>
              <li>
                <strong className="text-[var(--i-text)]">The lean</strong> is Momentum: an interpretation of past
                reports, applied to the layer and never to the geometry. It cannot move the forecast.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

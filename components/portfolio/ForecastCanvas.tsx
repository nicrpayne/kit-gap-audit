"use client";

// The Forecast Canvas -- the primary Portfolio visualization (see
// docs/DESIGN-NORTH-STAR.md). Every Scope lives on ONE shared temporal
// axis by default; the old "Overlay all on one axis" toggle is gone
// because overlay IS the model now, not an option. Purely presentational:
// takes already-simulated SimulationResults and renders them, computes
// no forecast math of its own, and reports selection back to the parent
// rather than owning any Scenario state itself.

import type { SimulationResult } from "@/lib/forecast/simulate";

export interface CanvasScope {
  scopeId: string;
  name: string;
  dependsOnScopeIds: string[];
  targetDate: string | null;
}

export interface AxisSpec {
  minDay: number;
  maxDay: number;
  ticks: { day: number; label: string }[];
}

interface ForecastCanvasProps {
  scopes: CanvasScope[];
  baseline: Map<string, SimulationResult> | null;
  preview: Map<string, SimulationResult> | null;
  axis: AxisSpec | null;
  startDate: Date;
  dirty: boolean;
  selectedScopeId: string | null;
  onSelectScope: (scopeId: string) => void;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d;
}
function dayOffset(startDate: Date, date: Date): number {
  return (date.getTime() - startDate.getTime()) / 86400000;
}
function confidenceTone(pct: number): string {
  return pct >= 70 ? "var(--i-mint)" : pct >= 35 ? "var(--i-amber)" : "var(--i-red)";
}

const NAME_COL = "168px";
const GRID = `${NAME_COL} 1fr`;

export default function ForecastCanvas({
  scopes,
  baseline,
  preview,
  axis,
  startDate,
  dirty,
  selectedScopeId,
  onSelectScope,
}: ForecastCanvasProps) {
  function axisPct(day: number): number {
    if (!axis) return 0;
    const span = Math.max(1, axis.maxDay - axis.minDay);
    return Math.min(100, Math.max(0, ((day - axis.minDay) / span) * 100));
  }

  const byId = new Map(scopes.map((s) => [s.scopeId, s]));

  return (
    <div>
      {axis && (
        <div className="px-5 pt-4 pb-1" style={{ display: "grid", gridTemplateColumns: GRID }}>
          <div />
          <div className="relative h-4">
            {axis.ticks.map((t) => (
              <div
                key={t.day}
                className="absolute text-[10px] tracking-wide uppercase text-[var(--i-text-faint)] -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${axisPct(t.day)}%` }}
              >
                {t.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--i-border)]">
        {scopes.map((s) => {
          const b = baseline?.get(s.scopeId);
          const p = preview?.get(s.scopeId) ?? b;
          if (!p) return null;
          const selected = s.scopeId === selectedScopeId;
          const deltaDays = dirty && b ? Math.round((p.likelyDate.getTime() - b.likelyDate.getTime()) / 86400000) : 0;
          const showGhost = dirty && !!b && Math.abs(deltaDays) >= 1;
          const targetDay = s.targetDate ? dayOffset(startDate, new Date(s.targetDate)) : null;
          const deltaColor = deltaDays < 0 ? "var(--i-mint)" : deltaDays > 0 ? "var(--i-red)" : "var(--i-text-soft)";

          return (
            <div
              key={s.scopeId}
              role="button"
              aria-pressed={selected}
              tabIndex={0}
              onClick={() => onSelectScope(s.scopeId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectScope(s.scopeId);
                }
              }}
              className={`px-5 py-4 cursor-pointer outline-none transition-colors duration-150 ${
                selected ? "bg-[var(--i-panel-raised)]" : "hover:bg-[var(--i-panel-raised)]/60"
              } focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--i-violet)]`}
              style={{ display: "grid", gridTemplateColumns: GRID, columnGap: "16px", alignItems: "start" }}
            >
              <div className="pt-0.5 min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: selected ? "var(--i-text)" : "var(--i-text)" }}
                >
                  {selected && <span className="text-[var(--i-violet)] mr-1">●</span>}
                  {s.name}
                </div>
                {s.dependsOnScopeIds.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectScope(s.dependsOnScopeIds[0]);
                    }}
                    className="mt-1 text-left text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] underline decoration-dotted underline-offset-2"
                  >
                    depends on {s.dependsOnScopeIds.map((id) => byId.get(id)?.name ?? id).join(", ")}
                  </button>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap mb-2.5">
                  <span className="font-display text-xl leading-none text-[var(--i-text)]">
                    {formatDate(p.likelyDate)}
                  </span>
                  {dirty && (
                    <span className="text-xs font-medium" style={{ color: deltaColor }}>
                      {deltaDays === 0 ? "no change" : deltaDays < 0 ? `${Math.abs(deltaDays)}d earlier` : `${deltaDays}d later`}
                    </span>
                  )}
                  {showGhost && b && (
                    <span className="text-xs text-[var(--i-text-faint)]">Reality {formatDate(b.likelyDate)}</span>
                  )}
                  {p.confidenceAtTarget !== null && (
                    <span
                      className="text-xs font-medium ml-auto whitespace-nowrap"
                      style={{ color: confidenceTone(p.confidenceAtTarget) }}
                    >
                      {p.confidenceAtTarget}% at target
                    </span>
                  )}
                </div>

                <div className="relative h-6">
                  {showGhost && b && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-px transition-[left] duration-200 ease-out"
                      style={{ left: `${axisPct(dayOffset(startDate, b.likelyDate))}%`, background: "var(--i-reality)" }}
                      title={`Reality: ${formatDate(b.likelyDate)}`}
                    />
                  )}

                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full transition-[left,right] duration-200 ease-out"
                    style={{
                      left: `${axisPct(p.percentiles.p10)}%`,
                      right: `${100 - axisPct(p.percentiles.p90)}%`,
                      background: "var(--i-text)",
                      opacity: 0.14,
                    }}
                    title={`P10 ${formatDate(addDays(startDate, p.percentiles.p10))} – P90 ${formatDate(addDays(startDate, p.percentiles.p90))}`}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full transition-[left,right] duration-200 ease-out"
                    style={{
                      left: `${axisPct(p.percentiles.p50)}%`,
                      right: `${100 - axisPct(p.percentiles.p85)}%`,
                      background: "var(--i-text)",
                      opacity: 0.32,
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full border-2 transition-[left] duration-200 ease-out"
                    style={{
                      left: `${axisPct(p.percentiles.p50)}%`,
                      background: dirty ? "var(--i-violet)" : "var(--i-text)",
                      borderColor: "var(--i-panel)",
                    }}
                    title={`Likely: ${formatDate(p.likelyDate)}`}
                  />
                  {targetDay !== null && (
                    <div
                      className="absolute inset-y-0 border-l border-dashed"
                      style={{ left: `${axisPct(targetDay)}%`, borderColor: "var(--i-amber)" }}
                      title={`Target: ${formatDate(new Date(s.targetDate!))}`}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

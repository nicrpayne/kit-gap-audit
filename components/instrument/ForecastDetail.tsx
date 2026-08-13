"use client";

// FORECAST DETAIL — the summoned advanced panel of the instrument.
//
// The main canvas answers four questions at a glance. Everything else the
// model knows lives here, organised the way a plug-in organises depth: five
// pages on a mode rail, each one a complete answer to a single question.
//
//   SUMMARY       what would I say in a meeting?
//   DRIVERS       why is the forecast here?
//   DISTRIBUTION  the statistics — every quantile, every trial
//   INPUTS        what does the simulation currently believe?
//   HISTORY       how has this moved, and what does Momentum read?
//
// Every number is real: capacityBasis, reportHistory, three-point estimates
// and gates come straight from the model. Where the system cannot truthfully
// attribute an effect, the page says what the input IS and does not invent a
// contribution percentage. INPUTS carries the two levers that are genuinely
// simulable from here (include/exclude an item, assume a gate resolved) —
// both write the same SuiteScenario the whole suite shares.

import { useMemo, useState } from "react";
import Link from "next/link";
import ToolWindow, { RailButton, Row } from "@/components/instrument/ToolWindow";
import type { SimulationResult } from "@/lib/forecast/simulate";
import type { ProjectScope, SuiteScenario } from "@/lib/instrument/useProject";
import { fmtDay, fmtFull, deltaLabel, deltaTone, confidenceTone } from "@/lib/instrument/useProject";
import { dispersionWord } from "@/components/instrument/LivingForecast";
import type { MomentumTrend } from "@/lib/momentum/trend";
import { DIRECTION_GLYPH, DIRECTION_LABEL, directionTone, trendPhrase } from "@/lib/momentum/trend";

type Mode = "summary" | "drivers" | "distribution" | "inputs" | "history";

const MODES: { id: Mode; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "drivers", label: "Drivers" },
  { id: "distribution", label: "Distribution" },
  { id: "inputs", label: "Inputs" },
  { id: "history", label: "History" },
];

function SectionNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">{children}</p>;
}

/** The real histogram, recessed like a meter window. Same trials the object
    is drawn from, finer bins, with quantile ticks and the target line. */
function MiniHistogram({
  result,
  targetDay,
  startDate,
}: {
  result: SimulationResult;
  targetDay: number | null;
  startDate: Date;
}) {
  const W = 300;
  const H = 66;
  const BINS = 56;
  const sorted = result.completionDaysSorted;
  const lo = sorted[0] ?? 0;
  const hi = sorted[sorted.length - 1] ?? 1;
  const span = hi - lo || 1;
  const bars = useMemo(() => {
    const counts = new Array<number>(BINS).fill(0);
    for (const d of sorted) counts[Math.min(BINS - 1, Math.floor(((d - lo) / span) * BINS))] += 1;
    const max = Math.max(...counts, 1);
    return counts.map((c) => c / max);
  }, [sorted, lo, span]);
  const x = (day: number) => ((day - lo) / span) * W;
  return (
    <div>
      <div className="i-meter rounded-md px-2 py-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
          {bars.map((v, i) => (
            <rect
              key={i}
              x={(i / BINS) * W + 0.4}
              width={W / BINS - 0.8}
              y={H - v * (H - 4)}
              height={v * (H - 4)}
              fill="var(--i-violet)"
              opacity={0.55}
            />
          ))}
          {([10, 50, 90] as const).map((p) => (
            <line
              key={p}
              x1={x(result.percentiles[`p${p}` as "p10"])}
              x2={x(result.percentiles[`p${p}` as "p10"])}
              y1={2}
              y2={H}
              stroke="var(--i-text-soft)"
              strokeWidth={p === 50 ? 1.2 : 0.7}
              strokeDasharray={p === 50 ? undefined : "2 3"}
            />
          ))}
          {targetDay !== null && targetDay >= lo && targetDay <= hi && (
            <line x1={x(targetDay)} x2={x(targetDay)} y1={0} y2={H} stroke="var(--i-red)" strokeWidth={1.2} />
          )}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-[var(--i-text-faint)]">
        <span>{fmtDay(new Date(startDate.getTime() + lo * 86400000))}</span>
        <span>P10 · P50 · P90 ticks{targetDay !== null && targetDay >= lo && targetDay <= hi ? " · target in red" : ""}</span>
        <span>{fmtDay(new Date(startDate.getTime() + hi * 86400000))}</span>
      </div>
    </div>
  );
}

export default function ForecastDetail({
  open,
  onClose,
  scope,
  scopeNameById,
  result,
  reality,
  startDate,
  targetDay,
  confidence,
  scenario,
  setScenario,
  scenarioActive,
  contextSwitchCostPct,
  momentum,
}: {
  open: boolean;
  onClose: () => void;
  scope: ProjectScope;
  scopeNameById: Map<string, string>;
  result: SimulationResult;
  reality: SimulationResult | null;
  startDate: Date;
  targetDay: number | null;
  confidence: number | null;
  scenario: SuiteScenario;
  setScenario: React.Dispatch<React.SetStateAction<SuiteScenario>>;
  scenarioActive: boolean;
  contextSwitchCostPct: number;
  momentum: MomentumTrend | null;
}) {
  const [mode, setMode] = useState<Mode>("summary");
  if (!open) return null;

  const d = (days: number) => fmtFull(new Date(startDate.getTime() + days * 86400000));
  const day = (iso: string) => fmtDay(new Date(iso));
  const moved = reality ? Math.round((result.likelyDate.getTime() - reality.likelyDate.getTime()) / 86400000) : 0;
  const openGates = scope.gates.filter((g) => !scenario.resolvedGateIds.has(g.id));
  const excluded = scope.items.filter((i) => scenario.excludedItemIds.has(i.id));
  const capOverride = scenario.capacityOverrideByScope[scope.scopeId];
  const capacity = capOverride ?? scope.teamCapacity;
  const spread = Math.round(result.percentiles.p90 - result.percentiles.p10);
  const sinceLast = scope.lastReport
    ? Math.round((result.likelyDate.getTime() - new Date(scope.lastReport.likelyDate).getTime()) / 86400000)
    : null;

  const toggleItem = (id: string) =>
    setScenario((prev) => {
      const n = new Set(prev.excludedItemIds);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...prev, excludedItemIds: n };
    });
  const toggleGate = (id: string) =>
    setScenario((prev) => {
      const n = new Set(prev.resolvedGateIds);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...prev, resolvedGateIds: n };
    });

  const capNote =
    scope.capacitySource === "inferred"
      ? `inferred from ${scope.capacityBasis.assignees?.length ?? 0} Linear assignees on remaining work`
      : scope.capacitySource === "allocations"
        ? "named people allocated in Portfolio"
        : "set by hand in Portfolio";

  return (
    <ToolWindow
      open={open}
      onClose={onClose}
      title="Forecast detail"
      subtitle={scope.name}
      width={440}
      dataShoot="tool-forecast"
      rail={MODES.map((m) => (
        <RailButton
          key={m.id}
          label={m.label}
          active={mode === m.id}
          onClick={() => setMode(m.id)}
          dataShoot={`detail-mode-${m.id}`}
        />
      ))}
    >
      <div className="px-5 py-4">
        {/* ── SUMMARY ─────────────────────────────────────────────────── */}
        {mode === "summary" && (
          <>
            <SectionNote>The sentence for the meeting, and nothing that does not belong in it.</SectionNote>
            <div className="mt-3">
              <Row
                k="Lands"
                v={d(result.percentiles.p50)}
                tone={scenarioActive && moved !== 0 ? "var(--i-violet)" : undefined}
                note="half the simulated runs finish by here"
              />
              <Row k="Realistic range" v={`${d(result.percentiles.p10)} — ${d(result.percentiles.p90)}`} note={`${spread}d spread · ${dispersionWord(result)}`} />
              {targetDay !== null ? (
                <>
                  <Row k="Target" v={d(targetDay)} />
                  <Row k="Chance of hitting it" v={`${confidence}%`} tone={confidenceTone(confidence)} />
                </>
              ) : (
                <Row k="Target" v="none set" note="the instrument stays neutral without one" />
              )}
              {scenarioActive && reality && (
                <Row k="Versus Reality" v={moved === 0 ? "no change" : deltaLabel(moved)} tone={deltaTone(moved)} changed />
              )}
              <Row
                k="Primary constraint"
                v={openGates.length === 0 ? "none" : openGates[0].label}
                note={openGates.length === 0 ? "nothing structural in the way" : `serial · likely +${openGates[0].likely}d · capacity cannot cross it`}
              />
              {sinceLast !== null && scope.lastReport && (
                <Row
                  k="Since last report"
                  v={deltaLabel(sinceLast)}
                  tone={deltaTone(sinceLast)}
                  note={`reported ${day(scope.lastReport.generatedAt)}`}
                />
              )}
              {momentum && (
                <Row
                  k="Momentum"
                  v={`${DIRECTION_GLYPH[momentum.direction]} ${DIRECTION_LABEL[momentum.direction]}`}
                  tone={directionTone(momentum.direction)}
                  note="interpretation of past reports — never forecast input"
                />
              )}
            </div>
          </>
        )}

        {/* ── DRIVERS ─────────────────────────────────────────────────── */}
        {mode === "drivers" && (
          <>
            <SectionNote>
              Why the forecast is here. Magnitudes are the model&rsquo;s actual inputs — nothing below is a computed
              attribution, because the simulation doesn&rsquo;t produce one.
            </SectionNote>

            {openGates.length > 0 && (
              <>
                <div className="i-label mt-4 mb-1" style={{ color: "var(--i-amber)" }}>
                  Serial decisions — the walls
                </div>
                {openGates.map((g) => (
                  <Row key={g.id} k={g.label} v={`+${g.likely}d`} note="waits in every trial; people don't help" />
                ))}
              </>
            )}

            <div className="i-label mt-4 mb-1">The work itself</div>
            <Row
              k={`${scope.items.length - excluded.length} items in scope`}
              v={`${Math.round(scope.items.filter((i) => !scenario.excludedItemIds.has(i.id)).reduce((s, i) => s + i.likely, 0))}d likely effort`}
              note="divided across parallel capacity"
            />
            {[...scope.items]
              .filter((i) => !scenario.excludedItemIds.has(i.id))
              .sort((a, b) => b.high - b.low - (a.high - a.low))
              .slice(0, 3)
              .map((i) => (
                <Row key={i.id} k={i.label} v={`${i.low}–${i.high}d`} note="widest estimate — a driver of the spread" />
              ))}

            <div className="i-label mt-4 mb-1">People</div>
            <Row k="Capacity" v={`${capacity.toFixed(2).replace(/0$/, "")} FTE`} note={capNote} changed={capOverride !== undefined} />
            {scope.capacityBasis.contributors
              ?.filter((c) => c.scopeCount > 1)
              .map((c) => (
                <Row
                  key={c.personId}
                  k={c.name}
                  v={`${c.effectiveFte.toFixed(2)} effective FTE`}
                  note={`split across ${c.scopeCount} scopes · ${contextSwitchCostPct}% switch cost applied`}
                />
              ))}

            {scope.dependsOnScopeIds.length > 0 && (
              <>
                <div className="i-label mt-4 mb-1">Upstream</div>
                {scope.dependsOnScopeIds.map((id) => (
                  <Row key={id} k={`starts after ${scopeNameById.get(id) ?? id}`} v="correlated" note="late upstream trials delay this scope in the same run" />
                ))}
              </>
            )}
          </>
        )}

        {/* ── DISTRIBUTION ────────────────────────────────────────────── */}
        {mode === "distribution" && (
          <>
            <SectionNote>
              {result.completionDaysSorted.length.toLocaleString()} simulated runs of the remaining work. Each run
              samples every item&rsquo;s three-point estimate, adds the serial delay of open decisions, and divides
              effort by parallel capacity. This histogram is the same data the object is drawn from.
            </SectionNote>
            <div className="mt-3">
              <MiniHistogram result={result} targetDay={targetDay} startDate={startDate} />
            </div>
            <div className="mt-3">
              <Row k="Earliest trial" v={d(result.completionDaysSorted[0] ?? 0)} />
              <Row k="Earliest realistic (P10)" v={d(result.percentiles.p10)} note="1 run in 10 finishes by here" />
              <Row k="Likely (P50)" v={d(result.percentiles.p50)} note="half the runs land before this" />
              <Row k="P70" v={d(result.percentiles.p70)} />
              <Row k="Comfortable (P85)" v={d(result.percentiles.p85)} />
              <Row k="Worst realistic (P90)" v={d(result.percentiles.p90)} note="9 runs in 10 finish by here" />
              <Row k="Latest trial" v={d(result.completionDaysSorted[result.completionDaysSorted.length - 1] ?? 0)} />
              <Row k="Spread (P10–P90)" v={`${spread} ${spread === 1 ? "day" : "days"}`} note="what the object's length shows" />
              {targetDay !== null && (
                <>
                  <Row k="Target confidence" v={`${confidence}%`} tone={confidenceTone(confidence)} note={`${confidence} of every 100 runs land on or before ${d(targetDay)}`} />
                  <Row k="Miss tail" v={`${100 - (confidence ?? 0)}%`} note="the hatched mass past the target line" />
                </>
              )}
            </div>
          </>
        )}

        {/* ── INPUTS ──────────────────────────────────────────────────── */}
        {mode === "inputs" && (
          <>
            <SectionNote>
              What the simulation currently believes{scenarioActive ? " — scenario changes are tagged" : ""}. The two
              toggles here are real levers: they re-run the same simulation the object is drawn from.
            </SectionNote>

            <div className="i-label mt-4 mb-1">People — Portfolio owns these</div>
            <Row k="Capacity" v={`${capacity.toFixed(2).replace(/0$/, "")} FTE`} note={capNote} changed={capOverride !== undefined} />
            {scope.capacityBasis.contributors?.map((c) => (
              <Row key={c.personId} k={c.name} v={`${c.effectiveFte.toFixed(2)} FTE`} note={c.scopeCount > 1 ? `across ${c.scopeCount} scopes` : undefined} />
            ))}
            {scope.capacityBasis.kind === "inferred" && (
              <Row
                k="Basis"
                v={`${scope.capacityBasis.assignees?.length ?? 0} assignees`}
                note={`${scope.capacityBasis.remainingIssueCount ?? 0} remaining issues · ${scope.capacityBasis.unassignedCount ?? 0} unassigned`}
              />
            )}
            <Row
              k="Context switch"
              v={`${scenario.contextSwitchCostPct ?? contextSwitchCostPct}%`}
              note="per additional scope a person spans"
              changed={scenario.contextSwitchCostPct !== null}
            />

            <div className="i-label mt-5 mb-1">Work — Scope owns this</div>
            {scope.items.map((i) => {
              const out = scenario.excludedItemIds.has(i.id);
              return (
                <div key={i.id} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: "1px solid var(--i-border)" }}>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] truncate" style={{ color: out ? "var(--i-text-faint)" : "var(--i-text)", textDecoration: out ? "line-through" : undefined }}>
                      {i.label}
                    </span>
                    <span className="i-readout block text-[10px] text-[var(--i-text-faint)] mt-0.5">
                      {i.low} · {i.likely} · {i.high}d
                    </span>
                  </span>
                  <button
                    type="button"
                    data-shoot={`item-toggle-${i.id}`}
                    onClick={() => toggleItem(i.id)}
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors"
                    style={{
                      background: out ? "var(--i-violet-soft)" : "var(--i-panel-raised)",
                      color: out ? "var(--i-violet)" : "var(--i-text-soft)",
                      border: `1px solid ${out ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                    }}
                  >
                    {out ? "out · scenario" : "in"}
                  </button>
                </div>
              );
            })}

            <div className="i-label mt-5 mb-1">Decisions — Decisions owns these</div>
            {scope.gates.length === 0 && <p className="text-[11px] text-[var(--i-text-faint)]">No open decisions gate this scope.</p>}
            {scope.gates.map((g) => {
              const res = scenario.resolvedGateIds.has(g.id);
              return (
                <div key={g.id} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: "1px solid var(--i-border)" }}>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] truncate" style={{ color: res ? "var(--i-text-faint)" : "var(--i-text)" }}>{g.label}</span>
                    <span className="i-readout block text-[10px] text-[var(--i-text-faint)] mt-0.5">serial {g.low} · {g.likely} · {g.high}d</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGate(g.id)}
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors"
                    style={{
                      background: res ? "var(--i-violet-soft)" : "var(--i-panel-raised)",
                      color: res ? "var(--i-violet)" : "var(--i-text-soft)",
                      border: `1px solid ${res ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                    }}
                  >
                    {res ? "assumed resolved" : "open"}
                  </button>
                </div>
              );
            })}

            {(scope.dependsOnScopeIds.length > 0 || scope.targetDate) && <div className="i-label mt-5 mb-1">Structure</div>}
            {scope.dependsOnScopeIds.map((id) => (
              <Row key={id} k="Depends on" v={scopeNameById.get(id) ?? id} />
            ))}
            {scope.targetDate && <Row k="Saved target" v={fmtFull(new Date(scope.targetDate))} note="Timeline owns this" />}

            <div className="mt-4 flex gap-3">
              <Link href="/portfolio" className="text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors">Portfolio →</Link>
              <Link href="/scope" className="text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors">Scope →</Link>
              <Link href="/decisions" className="text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors">Decisions →</Link>
            </div>
          </>
        )}

        {/* ── HISTORY ─────────────────────────────────────────────────── */}
        {mode === "history" && (
          <>
            <SectionNote>
              What the machine has said before, newest first. Momentum is computed from exactly these reports — it is
              an interpretation of the trail, never an input to the forecast.
            </SectionNote>
            <div className="mt-3">
              <Row
                k="Now · live"
                v={d(result.percentiles.p50)}
                tone={scenarioActive ? "var(--i-violet)" : undefined}
                note={scenarioActive ? "scenario preview — not Reality" : "current Reality simulation"}
              />
              {[...scope.reportHistory].reverse().map((r, i) => (
                <Row
                  key={i}
                  k={day(r.generatedAt)}
                  v={day(r.likelyDate)}
                  note={[
                    r.confidenceAtTarget !== null ? `${r.confidenceAtTarget}% at target` : null,
                    r.shippedCount > 0 ? `${r.shippedCount} shipped` : null,
                    r.resolvedSinceLastCount > 0 ? `${r.resolvedSinceLastCount} resolved` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined}
                />
              ))}
              {scope.reportHistory.length === 0 && (
                <p className="mt-2 text-[11px] text-[var(--i-text-faint)]">No reports yet — Momentum has nothing to read.</p>
              )}
            </div>
            {momentum && (
              <div className="mt-4">
                <Row
                  k="Momentum"
                  v={`${DIRECTION_GLYPH[momentum.direction]} ${DIRECTION_LABEL[momentum.direction]}`}
                  tone={directionTone(momentum.direction)}
                  note={trendPhrase(momentum)}
                />
              </div>
            )}
            <p className="mt-4 text-[10px] text-[var(--i-text-faint)] leading-relaxed">
              Movement between reports reflects accepted Reality changes — shipped work and resolved findings are
              recorded per report above. The system does not attribute movement it did not record.
            </p>
            <Link href="/reports" className="mt-3 block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors">
              Reports owns the trail →
            </Link>
          </>
        )}
      </div>
    </ToolWindow>
  );
}

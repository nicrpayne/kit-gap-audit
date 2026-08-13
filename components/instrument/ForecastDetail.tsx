"use client";

// FORECAST DETAIL — the summoned advanced panel of the instrument.
//
// Five pages on a mode rail, each one a complete answer to one question,
// each with its own composition — never five variations of a row list:
//
//   SUMMARY       the meeting sentence: answer, range gauge, stat cells
//   DRIVERS       what is shaping the outcome, grouped by what it IS
//   DISTRIBUTION  the statistical instrument: histogram, quantile ladder
//   INPUTS        read-only inspection of the model, grouped by OWNER
//   HISTORY       the trail: forecast movement chart + the reports
//
// Ownership rule: Forecast composes and previews assumptions; the
// specialist instruments own them. Nothing on these pages edits a
// canonical value — every group links to the instrument that does.
// Scenario overrides are displayed and tagged, not editable here.
//
// Every number is real: capacityBasis, reportHistory, three-point
// estimates and gates come straight from the model. Where the system
// cannot truthfully attribute an effect, the page shows the input's own
// magnitude and says so.

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

/** One recessed stat cell — the plug-in alternative to a row. */
function Cell({ k, v, note, tone, wide }: { k: string; v: string; note?: string; tone?: string; wide?: boolean }) {
  return (
    <div className={`i-meter rounded-md px-3 py-2.5 ${wide ? "col-span-2" : ""}`}>
      <div className="i-label">{k}</div>
      <div className="i-readout mt-1 text-[14px] leading-tight" style={{ color: tone ?? "var(--i-text)" }}>
        {v}
      </div>
      {note && <div className="mt-0.5 text-[9.5px] text-[var(--i-text-faint)] leading-snug">{note}</div>}
    </div>
  );
}

/** A grouped driver block with a structural accent. */
function Block({ accent, title, children }: { accent?: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 pl-3" style={{ borderLeft: `2px solid ${accent ?? "var(--i-border-strong)"}` }}>
      <div className="i-label mb-0.5" style={accent ? { color: accent } : undefined}>
        {title}
      </div>
      {children}
    </div>
  );
}

/** Section header naming the OWNING instrument, with the door to it. */
function OwnerHeader({ label, href, owner }: { label: string; href: string; owner: string }) {
  return (
    <div className="mt-5 mb-1 flex items-baseline justify-between gap-3">
      <span className="i-label">{label}</span>
      <Link
        href={href}
        className="shrink-0 text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
      >
        {owner} →
      </Link>
    </div>
  );
}

/** The answer's geography: P10–P90 band, waist marker, target tick, the
    Reality band behind it while a scenario is on. Same day-space rules as
    the object. */
function RangeGauge({
  result,
  reality,
  targetDay,
  startDate,
  scenarioActive,
}: {
  result: SimulationResult;
  reality: SimulationResult | null;
  targetDay: number | null;
  startDate: Date;
  scenarioActive: boolean;
}) {
  const showReality = scenarioActive && reality !== null;
  const lo = Math.min(result.percentiles.p10, targetDay ?? Infinity, showReality ? reality.percentiles.p10 : Infinity);
  const hi = Math.max(result.percentiles.p90, targetDay ?? -Infinity, showReality ? reality.percentiles.p90 : -Infinity);
  const pad = Math.max((hi - lo) * 0.07, 1);
  const span = hi - lo + pad * 2;
  const x = (day: number) => ((day - lo + pad) / span) * 100;
  const core = scenarioActive ? "var(--i-violet)" : "#5ec8d8";
  const day = (d: number) => fmtDay(new Date(startDate.getTime() + d * 86400000));
  return (
    <div>
      <div className="i-meter relative h-10 rounded-md overflow-hidden">
        {showReality && (
          <div
            className="absolute h-[3px] rounded-full"
            style={{
              top: "30%",
              left: `${x(reality.percentiles.p10)}%`,
              width: `${x(reality.percentiles.p90) - x(reality.percentiles.p10)}%`,
              background: "var(--i-reality)",
              opacity: 0.7,
            }}
          />
        )}
        <div
          className="absolute h-[7px] rounded-full"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            left: `${x(result.percentiles.p10)}%`,
            width: `${x(result.percentiles.p90) - x(result.percentiles.p10)}%`,
            background: core,
            opacity: 0.55,
          }}
        />
        <div
          className="absolute w-[2px]"
          style={{ top: "22%", bottom: "22%", left: `${x(result.percentiles.p50)}%`, background: "var(--i-text)" }}
        />
        {targetDay !== null && (
          <div
            className="absolute inset-y-0 w-px"
            style={{ left: `${x(targetDay)}%`, background: "var(--i-red)", opacity: 0.8 }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-[var(--i-text-faint)]">
        <span>{day(result.percentiles.p10)}</span>
        <span className="text-[var(--i-text-soft)]">{day(result.percentiles.p50)}</span>
        <span>{day(result.percentiles.p90)}</span>
      </div>
    </div>
  );
}

/** The real histogram, recessed like a meter window — same trials the
    object is drawn from, with the miss region hatched past the target. */
function Histogram({
  result,
  targetDay,
  startDate,
}: {
  result: SimulationResult;
  targetDay: number | null;
  startDate: Date;
}) {
  const W = 320;
  const H = 100;
  const BINS = 64;
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
  const targetIn = targetDay !== null && targetDay >= lo && targetDay <= hi;
  return (
    <div>
      <div className="i-meter rounded-md px-2 py-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
          <defs>
            <pattern id="fd-miss" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--i-red)" strokeWidth="1.3" strokeOpacity="0.5" />
            </pattern>
          </defs>
          {bars.map((v, i) => (
            <rect
              key={i}
              x={(i / BINS) * W + 0.4}
              width={W / BINS - 0.8}
              y={H - v * (H - 6)}
              height={v * (H - 6)}
              fill="var(--i-violet)"
              opacity={0.55}
            />
          ))}
          {targetIn && (
            <>
              <rect x={x(targetDay)} width={W - x(targetDay)} height={H} fill="url(#fd-miss)" opacity={0.5} />
              <line x1={x(targetDay)} x2={x(targetDay)} y1={0} y2={H} stroke="var(--i-red)" strokeWidth={1.3} />
            </>
          )}
          {([10, 50, 90] as const).map((p) => (
            <line
              key={p}
              x1={x(result.percentiles[`p${p}` as "p10"])}
              x2={x(result.percentiles[`p${p}` as "p10"])}
              y1={4}
              y2={H}
              stroke="var(--i-text-soft)"
              strokeWidth={p === 50 ? 1.2 : 0.7}
              strokeDasharray={p === 50 ? undefined : "2 3"}
            />
          ))}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-[var(--i-text-faint)]">
        <span>{fmtDay(new Date(startDate.getTime() + lo * 86400000))}</span>
        <span>
          P10 · P50 · P90{targetIn ? " · miss region hatched" : ""}
        </span>
        <span>{fmtDay(new Date(startDate.getTime() + hi * 86400000))}</span>
      </div>
    </div>
  );
}

/** Forecast movement across the report trail, plus the live point. Later
    is UP, so a rising line reads as slipping. Even index spacing; the
    endpoints carry the dates. */
function HistoryChart({
  scope,
  result,
  startDate,
  scenarioActive,
}: {
  scope: ProjectScope;
  result: SimulationResult;
  startDate: Date;
  scenarioActive: boolean;
}) {
  const pts = useMemo(() => {
    const hist = scope.reportHistory.map((r) => ({
      day: (new Date(r.likelyDate).getTime() - startDate.getTime()) / 86400000,
      live: false,
    }));
    return [...hist, { day: result.percentiles.p50, live: true }];
  }, [scope.reportHistory, result, startDate]);
  if (pts.length < 2) return null;
  const W = 320;
  const H = 72;
  const lo = Math.min(...pts.map((p) => p.day));
  const hi = Math.max(...pts.map((p) => p.day));
  const pad = Math.max((hi - lo) * 0.15, 1);
  const x = (i: number) => (i / (pts.length - 1)) * (W - 16) + 8;
  const y = (d: number) => H - 8 - ((d - lo + pad) / (hi - lo + pad * 2)) * (H - 16);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.day).toFixed(1)}`).join(" ");
  return (
    <div>
      <div className="i-meter rounded-md px-2 py-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
          <polyline points={line} fill="none" stroke="var(--i-text-soft)" strokeWidth={1.2} />
          {pts.map((p, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.day)}
              r={p.live ? 3.4 : 2.2}
              fill={p.live ? (scenarioActive ? "var(--i-violet)" : "#5ec8d8") : "var(--i-text-faint)"}
            />
          ))}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-[var(--i-text-faint)]">
        <span>{scope.reportHistory[0] ? fmtDay(new Date(scope.reportHistory[0].generatedAt)) : ""}</span>
        <span>likely date per report · later is up</span>
        <span>now{scenarioActive ? " · scenario" : ""}</span>
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
      width={448}
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
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="i-label">Lands</div>
                <div
                  className="i-readout text-[26px] leading-tight mt-0.5"
                  style={{ color: scenarioActive && moved !== 0 ? "var(--i-violet)" : "var(--i-text)" }}
                >
                  {d(result.percentiles.p50)}
                </div>
              </div>
              <div className="text-right">
                <div className="i-label">{dispersionWord(result)}</div>
                <div className="i-readout text-[13px] text-[var(--i-text-soft)] mt-0.5">{spread}d spread</div>
              </div>
            </div>

            <div className="mt-3">
              <RangeGauge
                result={result}
                reality={reality}
                targetDay={targetDay}
                startDate={startDate}
                scenarioActive={scenarioActive}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {targetDay !== null ? (
                <Cell
                  k="Target"
                  v={`${fmtDay(new Date(startDate.getTime() + targetDay * 86400000))} · ${confidence}%`}
                  tone={confidenceTone(confidence)}
                  note={`${confidence} of 100 runs land on or before it`}
                />
              ) : (
                <Cell k="Target" v="none set" note="the instrument stays neutral without one" />
              )}
              {scenarioActive && reality ? (
                <Cell k="Versus Reality" v={moved === 0 ? "no change" : deltaLabel(moved)} tone={deltaTone(moved)} note="scenario preview" />
              ) : sinceLast !== null && scope.lastReport ? (
                <Cell k="Since last report" v={deltaLabel(sinceLast)} tone={deltaTone(sinceLast)} note={`reported ${day(scope.lastReport.generatedAt)}`} />
              ) : (
                <Cell k="Since last report" v="no reports yet" />
              )}
              <Cell
                k="Primary constraint"
                v={openGates.length === 0 ? "none" : openGates[0].label}
                note={openGates.length === 0 ? "nothing structural in the way" : `serial · likely +${openGates[0].likely}d`}
                wide={!momentum}
              />
              {momentum && (
                <Cell
                  k="Momentum"
                  v={`${DIRECTION_GLYPH[momentum.direction]} ${DIRECTION_LABEL[momentum.direction]}`}
                  tone={directionTone(momentum.direction)}
                  note="interpretation — never forecast input"
                />
              )}
            </div>
          </>
        )}

        {/* ── DRIVERS ─────────────────────────────────────────────────── */}
        {mode === "drivers" && (
          <>
            <SectionNote>
              What is shaping the outcome, grouped by what it is. Magnitudes are the model&rsquo;s actual inputs —
              nothing here is a computed attribution, because the simulation doesn&rsquo;t produce one.
            </SectionNote>

            {openGates.length > 0 && (
              <Block accent="var(--i-amber)" title="Constraints — serial, people don't help">
                {openGates.map((g) => (
                  <Row key={g.id} k={g.label} v={`+${g.likely}d`} note="waits in every trial" />
                ))}
              </Block>
            )}

            <Block title="Uncertain work — where the spread comes from">
              {[...scope.items]
                .filter((i) => !scenario.excludedItemIds.has(i.id))
                .sort((a, b) => b.high - b.low - (a.high - a.low))
                .slice(0, 3)
                .map((i) => (
                  <Row key={i.id} k={i.label} v={`${i.low}–${i.high}d`} note="widest three-point estimate" />
                ))}
            </Block>

            <Block title="Scope — the mass being pushed">
              <Row
                k={`${scope.items.length - excluded.length} of ${scope.items.length} items in`}
                v={`${Math.round(scope.items.filter((i) => !scenario.excludedItemIds.has(i.id)).reduce((s, i) => s + i.likely, 0))}d likely`}
                note="divided across parallel capacity"
                changed={excluded.length > 0}
              />
            </Block>

            <Block title="Inherited from Portfolio">
              <Row k="Capacity" v={`${capacity.toFixed(2).replace(/0$/, "")} FTE`} note={capNote} changed={capOverride !== undefined} />
              {scope.capacityBasis.contributors
                ?.filter((c) => c.scopeCount > 1)
                .map((c) => (
                  <Row
                    key={c.personId}
                    k={c.name}
                    v={`${c.effectiveFte.toFixed(2)} effective`}
                    note={`across ${c.scopeCount} scopes · ${contextSwitchCostPct}% switch cost`}
                  />
                ))}
            </Block>

            {scope.dependsOnScopeIds.length > 0 && (
              <Block title="Dependencies — correlated, not additive">
                {scope.dependsOnScopeIds.map((id) => (
                  <Row key={id} k={`starts after ${scopeNameById.get(id) ?? id}`} v="lockstep" note="a late upstream run delays this scope in the same trial" />
                ))}
              </Block>
            )}
          </>
        )}

        {/* ── DISTRIBUTION ────────────────────────────────────────────── */}
        {mode === "distribution" && (
          <>
            <SectionNote>
              {result.completionDaysSorted.length.toLocaleString()} simulated runs of the remaining work — the same
              trials the object is drawn from. Each run samples every three-point estimate, waits out open
              decisions, and divides effort by parallel capacity.
            </SectionNote>
            <div className="mt-3">
              <Histogram result={result} targetDay={targetDay} startDate={startDate} />
            </div>

            <div className="mt-3 grid grid-cols-5 gap-1">
              {(
                [
                  ["P10", result.percentiles.p10, "earliest realistic"],
                  ["P50", result.percentiles.p50, "likely"],
                  ["P70", result.percentiles.p70, ""],
                  ["P85", result.percentiles.p85, "comfortable"],
                  ["P90", result.percentiles.p90, "worst realistic"],
                ] as const
              ).map(([label, value, note]) => (
                <div key={label} className="i-meter rounded px-1.5 py-2 text-center">
                  <div className="i-label">{label}</div>
                  <div className="i-readout mt-1 text-[11px] text-[var(--i-text)]">
                    {fmtDay(new Date(startDate.getTime() + value * 86400000))}
                  </div>
                  {note && <div className="mt-0.5 text-[8px] text-[var(--i-text-faint)] leading-tight">{note}</div>}
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Row k="Trials" v={result.completionDaysSorted.length.toLocaleString()} />
              <Row
                k="Full range"
                v={`${d(result.completionDaysSorted[0] ?? 0)} — ${d(result.completionDaysSorted[result.completionDaysSorted.length - 1] ?? 0)}`}
                note="the single earliest and latest simulated runs"
              />
              <Row k="Spread (P10–P90)" v={`${spread} ${spread === 1 ? "day" : "days"}`} note="what the object's length shows" />
              {targetDay !== null && (
                <>
                  <Row k="Target confidence" v={`${confidence}%`} tone={confidenceTone(confidence)} note={`runs landing on or before ${d(targetDay)}`} />
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
              What the simulation currently believes, by owning instrument. Read-only here — Forecast previews
              assumptions; the owners edit them. Scenario overrides are tagged.
            </SectionNote>

            <OwnerHeader label="People" href="/portfolio" owner="Portfolio" />
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

            <OwnerHeader label="Work" href="/scope" owner="Scope" />
            {scope.items.map((i) => {
              const out = scenario.excludedItemIds.has(i.id);
              return (
                <div key={i.id} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: "1px solid var(--i-border)" }}>
                  <span className="min-w-0">
                    <span
                      className="block text-[11.5px] truncate"
                      style={{ color: out ? "var(--i-text-faint)" : "var(--i-text)", textDecoration: out ? "line-through" : undefined }}
                    >
                      {i.label}
                    </span>
                    <span className="i-readout block text-[10px] text-[var(--i-text-faint)] mt-0.5">
                      {i.low} · {i.likely} · {i.high}d
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium"
                    style={{
                      background: out ? "var(--i-violet-soft)" : "var(--i-panel-raised)",
                      color: out ? "var(--i-violet)" : "var(--i-text-faint)",
                      border: `1px solid ${out ? "var(--i-violet)" : "var(--i-border)"}`,
                    }}
                  >
                    {out ? "out · scenario" : "in"}
                  </span>
                </div>
              );
            })}

            <OwnerHeader label="Decisions" href="/decisions" owner="Decisions" />
            {scope.gates.length === 0 && <p className="text-[11px] text-[var(--i-text-faint)]">No open decisions gate this scope.</p>}
            {scope.gates.map((g) => {
              const res = scenario.resolvedGateIds.has(g.id);
              return (
                <Row
                  key={g.id}
                  k={g.label}
                  v={res ? "assumed resolved" : `serial ${g.low} · ${g.likely} · ${g.high}d`}
                  tone={res ? "var(--i-violet)" : undefined}
                  changed={res}
                />
              );
            })}

            <OwnerHeader label="Structure" href="/timeline" owner="Timeline" />
            {scope.dependsOnScopeIds.map((id) => (
              <Row key={id} k="Depends on" v={scopeNameById.get(id) ?? id} />
            ))}
            {scope.targetDate ? (
              <Row k="Saved target" v={fmtFull(new Date(scope.targetDate))} />
            ) : (
              <Row k="Saved target" v="none" />
            )}
          </>
        )}

        {/* ── HISTORY ─────────────────────────────────────────────────── */}
        {mode === "history" && (
          <>
            <SectionNote>
              What the machine has said before. Momentum is computed from exactly these reports — an interpretation
              of the trail, never an input to the forecast.
            </SectionNote>

            <div className="mt-3">
              <HistoryChart scope={scope} result={result} startDate={startDate} scenarioActive={scenarioActive} />
            </div>

            {momentum && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Cell
                  k="Momentum"
                  v={`${DIRECTION_GLYPH[momentum.direction]} ${DIRECTION_LABEL[momentum.direction]}`}
                  tone={directionTone(momentum.direction)}
                  note={trendPhrase(momentum)}
                />
                {sinceLast !== null && scope.lastReport && (
                  <Cell k="Since last report" v={deltaLabel(sinceLast)} tone={deltaTone(sinceLast)} note={`reported ${day(scope.lastReport.generatedAt)}`} />
                )}
              </div>
            )}

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
            <p className="mt-3 text-[10px] text-[var(--i-text-faint)] leading-relaxed">
              Shipped work and resolved findings are recorded per report above. The system does not attribute
              movement it did not record.
            </p>
            <Link href="/reports" className="mt-2 block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors">
              Reports owns the trail →
            </Link>
          </>
        )}
      </div>
    </ToolWindow>
  );
}

"use client";

// TIMELINE — how does this delivery fit together over time? Play the sequence.
//
// Not a Gantt chart. A Gantt draws bars for tasks somebody typed in; this
// draws the SHAPE the model actually predicts: each scope's likely landing
// with its uncertainty spread, the dependency edges that make one wait for
// another, and the gates sitting in temporal context where they bite.
//
// What is real: cross-scope dependencies, targets, gate delay, the spread.
// What is NOT yet: arbitrary within-project sequencing, first-class
// milestones, dragging a dependency. Those are drawn as designed-not-wired.

import { useMemo, useState } from "react";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import { Panel, Prototype } from "@/components/instrument/Panel";
import { useProject, EMPTY_SCENARIO, fmtDay, confidenceTone } from "@/lib/instrument/useProject";
import { confidenceAtDay } from "@/lib/forecast/simulate";

const NAME_W = 168;
const ROW_H = 74;

export default function TimelineInstrument() {
  const m = useProject();
  const [hover, setHover] = useState<string | null>(null);
  const scopeNameById = useMemo(() => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])), [m.data]);

  const geom = useMemo(() => {
    if (!m.data || !m.startDate) return null;
    const days = [0];
    for (const s of m.data.scopes) {
      const r = m.preview?.get(s.scopeId) ?? m.baseline?.get(s.scopeId);
      if (r) days.push(r.percentiles.p10, r.percentiles.p90);
      if (s.targetDate) days.push((new Date(s.targetDate).getTime() - m.startDate.getTime()) / 86400000);
    }
    const min = Math.min(0, ...days);
    const max = Math.max(...days) * 1.08 + 4;
    const ticks: { day: number; label: string }[] = [];
    const step = max - min <= 70 ? 7 : 28;
    for (let d = Math.ceil(min / step) * step; d <= max; d += step) {
      const dt = new Date(m.startDate);
      dt.setUTCDate(dt.getUTCDate() + d);
      ticks.push({ day: d, label: fmtDay(dt) });
    }
    return { min, max, ticks, pct: (d: number) => ((d - min) / (max - min)) * 100 };
  }, [m.data, m.startDate, m.baseline, m.preview]);

  const strip = (
    <ScenarioStrip
      title="Timeline"
      owns="How this delivery fits together over time"
      active={m.active}
      chips={chipsFor(m.scenario, scopeNameById, m.scenario.excludedItemIds.size, m.scenario.resolvedGateIds.size)}
      onDiscard={() => m.setScenario(EMPTY_SCENARIO)}
    />
  );

  if (!m.data || !geom || !m.startDate)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
          {m.error ?? "Loading…"}
        </div>
      </InstrumentShell>
    );

  const order = [...m.data.scopes].sort((a, b) => a.dependsOnScopeIds.length - b.dependsOnScopeIds.length);
  const rowIndex = new Map(order.map((s, i) => [s.scopeId, i]));

  return (
    <InstrumentShell stateBar={strip} scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}>
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 overflow-auto">
        <Panel
          title="Sequence"
          subtitle="landing windows, dependencies and gates on one axis"
          accent="var(--i-violet)"
          bodyClass="!p-0"
          dataShoot="timeline-sequence"
        >
          <div className="relative" style={{ minHeight: order.length * ROW_H + 46 }}>
            {/* Ruler */}
            <div className="relative h-8" style={{ marginLeft: NAME_W }}>
              {geom.ticks.map((t) => (
                <div key={t.day} className="absolute top-2" style={{ left: `${geom.pct(t.day)}%` }}>
                  <div className="i-label -translate-x-1/2 whitespace-nowrap">{t.label}</div>
                </div>
              ))}
            </div>
            {/* Grid + today */}
            <div className="absolute inset-0 pointer-events-none" style={{ left: NAME_W, top: 32 }} aria-hidden>
              {geom.ticks.map((t) => (
                <div
                  key={t.day}
                  className="absolute inset-y-0 w-px"
                  style={{ left: `${geom.pct(t.day)}%`, background: "var(--i-border)", opacity: 0.4 }}
                />
              ))}
              <div
                className="absolute inset-y-0 w-px"
                style={{ left: `${geom.pct(0)}%`, background: "var(--i-text-soft)", opacity: 0.45 }}
              />
            </div>

            {/* Dependency edges, drawn behind the rows */}
            {/* viewBox in 0-100 x units with preserveAspectRatio="none":
                an SVG path `d` cannot take percentages, so the axis position
                is expressed as a plain number in a stretched coordinate
                space, with non-scaling strokes so the lines stay hairline. */}
            <svg
              className="absolute pointer-events-none"
              style={{ left: NAME_W, right: 0, top: 32, height: order.length * ROW_H }}
              viewBox={`0 0 100 ${order.length * ROW_H}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              {order.flatMap((s) =>
                s.dependsOnScopeIds.map((depId) => {
                  const from = rowIndex.get(depId);
                  const to = rowIndex.get(s.scopeId);
                  const dep = m.preview?.get(depId) ?? m.baseline?.get(depId);
                  if (from === undefined || to === undefined || !dep) return null;
                  const x = geom.pct(dep.percentiles.p50);
                  const y1 = from * ROW_H + ROW_H / 2;
                  const y2 = to * ROW_H + ROW_H / 2;
                  const lit = hover === s.scopeId || hover === depId;
                  return (
                    <g key={`${depId}-${s.scopeId}`} opacity={lit ? 1 : 0.4}>
                      <path
                        d={`M ${x} ${y1} C ${x} ${(y1 + y2) / 2}, ${x} ${(y1 + y2) / 2}, ${x} ${y2 - 8}`}
                        stroke={lit ? "var(--i-violet)" : "var(--i-border-strong)"}
                        strokeWidth={1.25}
                        vectorEffect="non-scaling-stroke"
                        fill="none"
                      />
                    </g>
                  );
                })
              )}
            </svg>

            {/* Rows */}
            <div className="relative" style={{ marginLeft: 0 }}>
              {order.map((s) => {
                const r = m.preview?.get(s.scopeId) ?? m.baseline?.get(s.scopeId);
                if (!r) return null;
                const targetDay = s.targetDate
                  ? (new Date(s.targetDate).getTime() - m.startDate!.getTime()) / 86400000
                  : null;
                const conf = targetDay !== null ? confidenceAtDay(r.completionDaysSorted, targetDay) : null;
                const gateDays = s.gates
                  .filter((g) => !m.scenario.resolvedGateIds.has(g.id))
                  .reduce((sum, g) => sum + g.likely, 0);
                return (
                  <div
                    key={s.scopeId}
                    onMouseEnter={() => setHover(s.scopeId)}
                    onMouseLeave={() => setHover(null)}
                    className="relative"
                    style={{ height: ROW_H, borderTop: "1px solid var(--i-border)" }}
                  >
                    <div
                      className="absolute left-0 top-0 h-full flex flex-col justify-center px-3"
                      style={{ width: NAME_W }}
                    >
                      <div className="text-[11.5px] uppercase tracking-[0.06em] text-[var(--i-text-soft)] truncate">
                        {s.name}
                      </div>
                      <div className="i-readout text-[15px] mt-1 leading-none text-[var(--i-text)]">
                        {fmtDay(r.likelyDate)}
                      </div>
                      {s.dependsOnScopeIds.length > 0 && (
                        <div className="text-[9.5px] text-[var(--i-text-faint)] mt-1 truncate">
                          waits on {s.dependsOnScopeIds.map((d) => scopeNameById.get(d) ?? d).join(", ")}
                        </div>
                      )}
                    </div>

                    <div className="absolute inset-y-0" style={{ left: NAME_W, right: 0 }}>
                      {/* P10–P90 landing window: the honest replacement for a bar */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 rounded-full transition-[left,right] duration-200"
                        style={{
                          left: `${geom.pct(r.percentiles.p10)}%`,
                          right: `${100 - geom.pct(r.percentiles.p90)}%`,
                          height: 12,
                          background: m.active ? "var(--i-violet)" : "var(--i-text)",
                          opacity: 0.18,
                        }}
                        title={`${fmtDay(new Date(m.startDate!.getTime() + r.percentiles.p10 * 86400000))} – ${fmtDay(
                          new Date(m.startDate!.getTime() + r.percentiles.p90 * 86400000)
                        )}`}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 rounded-full transition-[left,right] duration-200"
                        style={{
                          left: `${geom.pct(r.percentiles.p50)}%`,
                          right: `${100 - geom.pct(r.percentiles.p85)}%`,
                          height: 12,
                          background: m.active ? "var(--i-violet)" : "var(--i-text)",
                          opacity: 0.3,
                        }}
                      />
                      {/* Landing marker */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-[left] duration-200"
                        style={{ left: `${geom.pct(r.percentiles.p50)}%` }}
                      >
                        <div
                          className="rotate-45"
                          style={{
                            width: 9,
                            height: 9,
                            background: m.active ? "var(--i-violet)" : "var(--i-text)",
                          }}
                        />
                      </div>
                      {/* Gate marks, placed where the delay bites */}
                      {s.gates
                        .filter((g) => !m.scenario.resolvedGateIds.has(g.id))
                        .map((g, i) => (
                          <div
                            key={g.id}
                            className="absolute -translate-x-1/2"
                            style={{ left: `${geom.pct(Math.max(0, r.percentiles.p50 - gateDays + i))}%`, top: 8 }}
                            title={`${g.label} — +${Math.round(g.likely)}d while open`}
                          >
                            <span className="text-[10px]" style={{ color: "var(--i-amber)" }}>
                              ◆
                            </span>
                          </div>
                        ))}
                      {/* Target */}
                      {targetDay !== null && (
                        <div className="absolute inset-y-0" style={{ left: `${geom.pct(targetDay)}%` }}>
                          <div
                            className="absolute inset-y-0 w-px -translate-x-1/2"
                            style={{ background: confidenceTone(conf), opacity: 0.85 }}
                          />
                          <div
                            className="absolute -translate-x-1/2 bottom-1 rounded-[3px] px-1.5 py-[2px] whitespace-nowrap i-readout text-[9.5px]"
                            style={{
                              background: "var(--i-void)",
                              border: `1px solid ${confidenceTone(conf)}`,
                              color: confidenceTone(conf),
                            }}
                          >
                            {conf}% target
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          <Panel title="Reading this" accent="var(--i-text-soft)" dense>
            <ul className="space-y-2 p-1 text-[11px] text-[var(--i-text-soft)] leading-relaxed">
              <li>
                <strong className="text-[var(--i-text)]">The band</strong> is the landing window — wide means
                uncertain, not late. The diamond is the balance point.
              </li>
              <li>
                <strong className="text-[var(--i-text)]">Curved edges</strong> are real dependencies: the lower scope
                cannot finish before the upper one does.
              </li>
              <li>
                <span style={{ color: "var(--i-amber)" }}>◆</span>{" "}
                <strong className="text-[var(--i-text)]">Gates</strong> are open decisions. Their delay is serial —
                more people will not shorten it.
              </li>
            </ul>
          </Panel>
          <Panel
            title="Sequencing"
            accent="var(--i-text-faint)"
            dense
            actions={<Prototype note="The engine models cross-scope dependencies but has no within-project sequence or milestone entity, so these cannot be edited truthfully yet." />}
          >
            <div className="p-1 space-y-2 text-[11px] text-[var(--i-text-faint)] leading-relaxed">
              <p>
                Dragging a dependency, splitting a stream into parallel tracks and moving a milestone are the designed
                destination for this instrument.
              </p>
              <p>
                They are not offered as controls today because the engine has no first-class milestone or in-project
                ordering — a control here would move something the simulation never reads.
              </p>
              <p className="text-[var(--i-text-soft)]">
                What already works: change capacity, cut work, or settle a decision, and every band on this axis moves
                together.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </InstrumentShell>
  );
}

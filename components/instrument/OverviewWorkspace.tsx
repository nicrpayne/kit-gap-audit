"use client";

// OVERVIEW — the master operating surface. Conduct the project.
//
// This is a WORKSPACE, not a dashboard: a small set of purpose-built panels
// over one model, arranged so the five-second question ("what is happening
// right now") is answered by the top band alone, with everything else
// available in peripheral vision. Any panel can be promoted to fill the
// workspace when you need to work in it, and every panel hands off to the
// instrument that owns its subject rather than editing it here.
//
// Deliberately NOT twelve KPI cards: the forecast is physically dominant,
// the other panels are subordinate, and nothing here is a control except the
// workspace preset switch.

import { useMemo, useState } from "react";
import Link from "next/link";
import ForecastField from "@/components/portfolio/ForecastField";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import { Panel, Stat, SeverityDot, InheritedValue } from "@/components/instrument/Panel";
import { TrendSpark } from "@/components/instrument/Meter";
import {
  useProject,
  EMPTY_SCENARIO,
  fmtFull,
  fmtDay,
  deltaLabel,
  confidenceTone,
} from "@/lib/instrument/useProject";
import { DIRECTION_GLYPH, DIRECTION_LABEL, directionTone, trendPhrase } from "@/lib/momentum/trend";
import { confidenceAtDay } from "@/lib/forecast/simulate";

type Preset = "brief" | "field" | "risk";

const PRESETS: { id: Preset; label: string; help: string }[] = [
  { id: "brief", label: "Briefing", help: "Everything at a glance — the live-meeting default" },
  { id: "field", label: "Forecast", help: "Give the forecast the whole workspace" },
  { id: "risk", label: "What's wrong", help: "Constraints, decisions and attention" },
];

export default function OverviewWorkspace() {
  const m = useProject();
  const [preset, setPreset] = useState<Preset>("brief");
  const [maximized, setMaximized] = useState<string | null>(null);

  const scopeNameById = useMemo(
    () => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])),
    [m.data]
  );

  const fieldScopes = useMemo(
    () =>
      (m.data?.scopes ?? []).map((s) => ({
        scopeId: s.scopeId,
        name: s.name,
        dependsOnScopeIds: s.dependsOnScopeIds,
        targetDate: s.targetDate,
        changed: s.scopeId in m.scenario.capacityOverrideByScope,
      })),
    [m.data, m.scenario]
  );

  const axis = useMemo(() => {
    if (!m.data || !m.startDate) return null;
    const days = [0];
    for (const s of m.data.scopes) {
      for (const r of [m.baseline?.get(s.scopeId), m.preview?.get(s.scopeId)]) {
        if (r) days.push(r.percentiles.p10, r.percentiles.p90);
      }
      if (s.targetDate) days.push((new Date(s.targetDate).getTime() - m.startDate.getTime()) / 86400000);
    }
    const minDay = Math.min(0, ...days);
    const maxRaw = Math.max(...days);
    const maxDay = maxRaw + Math.max(8, maxRaw * 0.16);
    const ticks: { day: number; label: string }[] = [];
    const step = maxDay - minDay <= 70 ? 7 : 28;
    for (let d = Math.ceil(minDay / step) * step; d <= maxDay; d += step) {
      const dt = new Date(m.startDate);
      dt.setUTCDate(dt.getUTCDate() + d);
      ticks.push({ day: d, label: fmtDay(dt) });
    }
    return { minDay, maxDay, ticks };
  }, [m.data, m.startDate, m.baseline, m.preview]);

  // "Needs attention" is a ranking, not a dump: blocking decisions first,
  // then scopes whose confidence is genuinely poor, then open findings.
  const attention = useMemo(() => {
    if (!m.data) return [];
    const out: { id: string; tone: string; label: string; detail: string; href: string }[] = [];
    for (const s of m.data.scopes) {
      const r = m.preview?.get(s.scopeId) ?? m.baseline?.get(s.scopeId);
      if (!r || !s.targetDate || !m.startDate) continue;
      const conf = confidenceAtDay(
        r.completionDaysSorted,
        (new Date(s.targetDate).getTime() - m.startDate.getTime()) / 86400000
      );
      if (conf < 50)
        out.push({
          id: `conf-${s.scopeId}`,
          tone: conf < 25 ? "var(--i-red)" : "var(--i-amber)",
          label: `${s.name} is unlikely to hit its target`,
          detail: `${conf}% by ${fmtDay(new Date(s.targetDate))}`,
          href: "/forecast",
        });
    }
    const gates = m.data.scopes.flatMap((s) => s.gates.map((g) => ({ g, s })));
    for (const { g, s } of gates.slice(0, 4)) {
      if (m.scenario.resolvedGateIds.has(g.id)) continue;
      out.push({
        id: `gate-${g.id}`,
        tone: "var(--i-amber)",
        label: g.label,
        detail: `blocking ${s.name} · +${Math.round(g.likely)}d modelled`,
        href: "/decisions",
      });
    }
    const unticketed = m.data.findings.filter((f) => f.status === "open" && f.type === "missing_work");
    if (unticketed.length > 0)
      out.push({
        id: "unticketed",
        tone: "var(--i-violet)",
        label: `${unticketed.length} obligation${unticketed.length === 1 ? "" : "s"} with no ticket`,
        detail: "found in sources, not represented in Linear",
        href: "/audit",
      });
    return out;
  }, [m.data, m.baseline, m.preview, m.startDate, m.scenario]);

  const openDecisions = useMemo(
    () => (m.data?.findings ?? []).filter((f) => f.type === "decision" && f.status === "open"),
    [m.data]
  );

  const lead = m.data?.scopes[0];
  const leadTrend = lead ? m.momentumByScope.get(lead.scopeId) : undefined;
  const anyTrend = leadTrend ?? [...m.momentumByScope.values()][0];
  const trendScope = leadTrend ? lead : m.data?.scopes.find((s) => m.momentumByScope.has(s.scopeId));

  const strip = (
    <ScenarioStrip
      title="Overview"
      owns="What is happening with this project right now"
      active={m.active}
      chips={chipsFor(m.scenario, scopeNameById, m.scenario.excludedItemIds.size, m.scenario.resolvedGateIds.size)}
      onDiscard={() => m.setScenario(EMPTY_SCENARIO)}
      right={
        <div className="flex items-center gap-1 rounded-md p-0.5" style={{ background: "var(--i-void)" }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPreset(p.id);
                setMaximized(null);
              }}
              title={p.help}
              data-shoot={`preset-${p.id}`}
              className="rounded px-2.5 py-1 text-[10.5px] transition-colors"
              style={{
                background: preset === p.id ? "var(--i-panel-raised)" : "transparent",
                color: preset === p.id ? "var(--i-text)" : "var(--i-text-faint)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    />
  );

  if (m.loading && !m.data)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
          Loading the model…
        </div>
      </InstrumentShell>
    );
  if (m.error)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-red)]">{m.error}</div>
      </InstrumentShell>
    );
  if (!m.data) return null;

  const forecastPanel = (
    <Panel
      title="Forecast"
      subtitle={m.portfolioLikely.gatedBy ? `gated by ${m.portfolioLikely.gatedBy}` : undefined}
      accent="var(--i-violet)"
      href="/forecast"
      hrefLabel="Open Forecast"
      bodyClass="!p-0"
      dataShoot="panel-forecast"
      actions={
        <button
          onClick={() => setMaximized(maximized === "forecast" ? null : "forecast")}
          className="text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
        >
          {maximized === "forecast" ? "Restore" : "Maximise"}
        </button>
      }
    >
      <div className="h-full flex flex-col">
        <ForecastField
          scopes={fieldScopes}
          baseline={m.baseline}
          preview={m.preview}
          axis={axis}
          startDate={m.startDate!}
          dirty={m.active}
          selectedScopeId={null}
          onSelectScope={() => {}}
          onScrubTarget={() => {}}
          pendingTargets={new Map()}
          onSaveTarget={() => {}}
          portfolioLikely={m.portfolioLikely.date}
          portfolioDeltaDays={m.portfolioLikely.deltaDays}
          portfolioGatedBy={m.portfolioLikely.gatedBy}
        />
      </div>
    </Panel>
  );

  const attentionPanel = (
    <Panel
      title="Needs attention"
      accent="var(--i-amber)"
      href="/audit"
      hrefLabel="Intelligence"
      dense
      dataShoot="panel-attention"
      subtitle={`${attention.length} ranked`}
    >
      {attention.length === 0 ? (
        <p className="text-[11.5px] text-[var(--i-text-faint)] p-2">Nothing is currently blocking or off-target.</p>
      ) : (
        <ul className="space-y-px">
          {attention.map((a) => (
            <li key={a.id}>
              <Link
                href={a.href}
                className="flex items-start gap-2 rounded px-2 py-2 hover:bg-[var(--i-panel-raised)] transition-colors"
              >
                <span aria-hidden className="mt-[5px] h-1.5 w-1.5 rounded-full shrink-0" style={{ background: a.tone }} />
                <span className="min-w-0">
                  <span className="block text-[11.5px] text-[var(--i-text)] leading-snug">{a.label}</span>
                  <span className="block text-[10px] text-[var(--i-text-faint)] mt-0.5">{a.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  const upcomingPanel = (
    <Panel title="Upcoming" accent="var(--i-mint)" href="/timeline" hrefLabel="Timeline" dense dataShoot="panel-upcoming">
      <ul className="space-y-px">
        {m.data.scopes
          .filter((s) => s.targetDate)
          .sort((a, b) => new Date(a.targetDate!).getTime() - new Date(b.targetDate!).getTime())
          .map((s) => {
            const r = m.preview?.get(s.scopeId) ?? m.baseline?.get(s.scopeId);
            const conf =
              r && m.startDate
                ? confidenceAtDay(
                    r.completionDaysSorted,
                    (new Date(s.targetDate!).getTime() - m.startDate.getTime()) / 86400000
                  )
                : null;
            return (
              <li key={s.scopeId} className="flex items-center justify-between gap-2 px-2 py-2">
                <span className="min-w-0">
                  <span className="block text-[11.5px] text-[var(--i-text)] truncate">{s.name}</span>
                  <span className="block text-[10px] text-[var(--i-text-faint)]">
                    target {fmtDay(new Date(s.targetDate!))}
                  </span>
                </span>
                <span className="i-readout text-[13px] shrink-0" style={{ color: confidenceTone(conf) }}>
                  {conf === null ? "—" : `${conf}%`}
                </span>
              </li>
            );
          })}
        {m.data.scopes.every((s) => !s.targetDate) && (
          <li className="text-[11.5px] text-[var(--i-text-faint)] p-2">No targets set yet.</li>
        )}
      </ul>
    </Panel>
  );

  const decisionsPanel = (
    <Panel
      title="Open decisions"
      accent="var(--i-red)"
      href="/decisions"
      hrefLabel="Decisions"
      dense
      dataShoot="panel-decisions"
      subtitle={`${openDecisions.length} open`}
    >
      <ul className="space-y-px">
        {openDecisions.map((d) => (
          <li key={d.id}>
            <Link
              href="/decisions"
              className="flex items-start gap-2 rounded px-2 py-2 hover:bg-[var(--i-panel-raised)] transition-colors"
            >
              <SeverityDot severity={d.severity} />
              <span className="min-w-0">
                <span className="block text-[11.5px] text-[var(--i-text)] leading-snug">{d.title}</span>
                <span className="block text-[10px] text-[var(--i-text-faint)] mt-0.5">
                  {d.owner ? `${d.owner} · ` : ""}
                  {d.blocking ? "blocking" : "not blocking"}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {openDecisions.length === 0 && (
          <li className="text-[11.5px] text-[var(--i-text-faint)] p-2">No open decisions.</li>
        )}
      </ul>
    </Panel>
  );

  const contextPanel = (
    <Panel title="Context health" accent="var(--i-violet)" href="/audit" hrefLabel="Intelligence" dense>
      <ul className="space-y-px">
        {m.data.sources.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 px-2 py-2">
            <span className="min-w-0">
              <span className="block text-[11.5px] text-[var(--i-text)] truncate">{s.title}</span>
              <span className="block text-[10px] text-[var(--i-text-faint)]">{s.kind}</span>
            </span>
            <span className="text-[10px] text-[var(--i-text-faint)] shrink-0">{fmtDay(new Date(s.createdAt))}</span>
          </li>
        ))}
        {m.data.sources.length === 0 && (
          <li className="text-[11.5px] text-[var(--i-text-faint)] p-2">No sources ingested yet.</li>
        )}
      </ul>
    </Panel>
  );

  if (maximized === "forecast") {
    return (
      <InstrumentShell stateBar={strip} scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}>
        <div className="flex-1 min-h-0 p-3">{forecastPanel}</div>
      </InstrumentShell>
    );
  }

  const showField = preset !== "risk";

  return (
    <InstrumentShell stateBar={strip} scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}>
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
        {/* The five-second band. Four facts, in the order a person asks them. */}
        <div
          className="shrink-0 grid gap-px"
          style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", background: "var(--i-border)", borderRadius: 8 }}
        >
          {[
            <Stat
              key="a"
              label="Portfolio lands"
              size={26}
              value={m.portfolioLikely.date ? fmtFull(m.portfolioLikely.date) : "—"}
              tone={m.active && m.portfolioLikely.deltaDays !== 0 ? "var(--i-violet)" : undefined}
              sub={
                m.active && m.portfolioLikely.deltaDays !== 0
                  ? deltaLabel(m.portfolioLikely.deltaDays)
                  : m.portfolioLikely.gatedBy
                    ? `set by ${m.portfolioLikely.gatedBy}`
                    : undefined
              }
            />,
            <Stat
              key="b"
              label="Least likely to land"
              size={26}
              value={(() => {
                if (!m.startDate) return "—";
                let worst: { n: string; c: number } | null = null;
                for (const s of m.data!.scopes) {
                  const r = m.preview?.get(s.scopeId) ?? m.baseline?.get(s.scopeId);
                  if (!r || !s.targetDate) continue;
                  const c = confidenceAtDay(
                    r.completionDaysSorted,
                    (new Date(s.targetDate).getTime() - m.startDate.getTime()) / 86400000
                  );
                  if (!worst || c < worst.c) worst = { n: s.name, c };
                }
                return worst ? `${worst.c}%` : "—";
              })()}
              tone={(() => {
                if (!m.startDate) return undefined;
                let worst = 101;
                for (const s of m.data!.scopes) {
                  const r = m.preview?.get(s.scopeId) ?? m.baseline?.get(s.scopeId);
                  if (!r || !s.targetDate) continue;
                  worst = Math.min(
                    worst,
                    confidenceAtDay(
                      r.completionDaysSorted,
                      (new Date(s.targetDate).getTime() - m.startDate.getTime()) / 86400000
                    )
                  );
                }
                return worst > 100 ? undefined : confidenceTone(worst);
              })()}
              sub={(() => {
                if (!m.startDate) return undefined;
                let worst: { n: string; c: number } | null = null;
                for (const s of m.data!.scopes) {
                  const r = m.preview?.get(s.scopeId) ?? m.baseline?.get(s.scopeId);
                  if (!r || !s.targetDate) continue;
                  const c = confidenceAtDay(
                    r.completionDaysSorted,
                    (new Date(s.targetDate).getTime() - m.startDate.getTime()) / 86400000
                  );
                  if (!worst || c < worst.c) worst = { n: s.name, c };
                }
                return worst ? `${worst.n} against its target` : "no targets set";
              })()}
            />,
            anyTrend ? (
              <div key="c" className="min-w-0">
                <div className="i-label">Momentum</div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="i-readout text-[24px] leading-none" style={{ color: directionTone(anyTrend.direction) }}>
                      {DIRECTION_GLYPH[anyTrend.direction]}
                    </span>
                    <span
                      className="text-[15px] font-semibold uppercase tracking-wide leading-none"
                      style={{ color: directionTone(anyTrend.direction) }}
                    >
                      {DIRECTION_LABEL[anyTrend.direction]}
                    </span>
                  </div>
                  <TrendSpark
                    points={(trendScope?.reportHistory ?? []).map((r) => new Date(r.likelyDate).getTime())}
                    tone={directionTone(anyTrend.direction)}
                    invert
                    width={72}
                    height={26}
                  />
                </div>
                <div className="mt-1.5 text-[10px] text-[var(--i-text-faint)] leading-tight">
                  {trendScope?.name} · {trendPhrase(anyTrend)}
                </div>
              </div>
            ) : (
              <Stat key="c" label="Momentum" value="—" sub="no prior report yet" />
            ),
            <Stat
              key="d"
              label="Needs attention"
              size={26}
              value={String(attention.length)}
              tone={attention.length > 0 ? "var(--i-amber)" : "var(--i-mint)"}
              sub={attention.length > 0 ? attention[0].label : "nothing blocking"}
            />,
          ].map((el, i) => (
            <div key={i} className="px-4 py-3" style={{ background: "var(--i-panel)" }}>
              {el}
            </div>
          ))}
        </div>

        {/* The workspace proper. Flex rather than grid rows: a panel must
            never be able to paint over its neighbour, so each region owns a
            hard height and scrolls inside itself. */}
        <div className="flex-1 min-h-0 flex gap-3">
          {showField && <div className="flex-1 min-w-0 min-h-0">{forecastPanel}</div>}

          {preset === "brief" && (
            <div className="shrink-0 w-[380px] min-h-0 flex flex-col gap-3">
              <div className="min-h-0" style={{ flex: "1.15 1 0" }}>
                {attentionPanel}
              </div>
              <div className="min-h-0" style={{ flex: "0.85 1 0" }}>
                {upcomingPanel}
              </div>
              <div className="min-h-0" style={{ flex: "1 1 0" }}>
                {decisionsPanel}
              </div>
            </div>
          )}

          {preset === "risk" && (
            <>
              <div className="flex-1 min-w-0 min-h-0">{attentionPanel}</div>
              <div className="flex-1 min-w-0 min-h-0">{decisionsPanel}</div>
              <div className="flex-1 min-w-0 min-h-0">{contextPanel}</div>
            </>
          )}
        </div>

        {/* Values this surface reads but does not own. */}
        <div
          className="shrink-0 flex items-center gap-6 px-4 py-2.5 flex-wrap"
          style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)", borderRadius: 8 }}
        >
          <InheritedValue
            label="Capacity"
            value={`${m.data.scopes.reduce((s, x) => s + x.teamCapacity, 0).toFixed(1)} FTE`}
            href="/portfolio"
            hrefLabel="Portfolio"
          />
          <InheritedValue
            label="Context switch"
            value={`${m.data.contextSwitchCostPct}%`}
            href="/portfolio"
            hrefLabel="Portfolio"
          />
          <InheritedValue
            label="Modelled work"
            value={`${m.data.scopes.reduce((s, x) => s + x.items.length, 0)} items`}
            href="/scope"
            hrefLabel="Scope"
          />
          <span className="text-[10px] text-[var(--i-text-faint)]">
            Read here, changed in the instrument that owns them.
          </span>
        </div>
      </div>
    </InstrumentShell>
  );
}

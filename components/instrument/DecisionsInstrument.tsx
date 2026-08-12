"use client";

// DECISIONS — what choices must be made, and what do they change?
// Play the choices.
//
// Real today: a blocking decision is a serial gate in the simulation, so
// "assume this were settled" is a genuine, immediate scenario lever — the
// delay leaves the model and every dependent date moves. That is the one
// control here, and it is exact.
//
// Not real yet: enumerated options (A/B) with per-option consequences. The
// engine has no option entity, so options are drafted, never simulated, and
// are marked as such.

import { useMemo, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import { Panel, Prototype, SeverityDot, EpistemicBadge } from "@/components/instrument/Panel";
import { useProject, EMPTY_SCENARIO, fmtDay, deltaLabel, deltaTone } from "@/lib/instrument/useProject";

export default function DecisionsInstrument() {
  const m = useProject();
  const [openId, setOpenId] = useState<string | null>(null);
  const scopeNameById = useMemo(() => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])), [m.data]);

  // A decision finding and the simulation gate it produced are the same
  // thing seen from two sides; matching on title is how the pipeline already
  // relates them (buildForecastInputs labels a gate with the finding title).
  const gateByTitle = useMemo(() => {
    const map = new Map<string, { id: string; likely: number; scopeName: string }>();
    for (const s of m.data?.scopes ?? []) {
      for (const g of s.gates) map.set(g.label, { id: g.id, likely: g.likely, scopeName: s.name });
    }
    return map;
  }, [m.data]);

  const decisions = useMemo(() => {
    const list = (m.data?.findings ?? []).filter((f) => f.type === "decision");
    return list.sort(
      (a, b) =>
        Number(b.blocking) - Number(a.blocking) ||
        (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) ||
        a.title.localeCompare(b.title)
    );
  }, [m.data]);

  const strip = (
    <ScenarioStrip
      title="Decisions"
      owns="What choices must be made, and what they change"
      active={m.active}
      chips={chipsFor(m.scenario, scopeNameById, m.scenario.excludedItemIds.size, m.scenario.resolvedGateIds.size)}
      onDiscard={() => m.setScenario(EMPTY_SCENARIO)}
    />
  );

  if (!m.data)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
          {m.error ?? "Loading…"}
        </div>
      </InstrumentShell>
    );

  const blocking = decisions.filter((d) => d.blocking && d.status === "open");
  const other = decisions.filter((d) => !(d.blocking && d.status === "open"));
  const assumed = m.scenario.resolvedGateIds.size;

  return (
    <InstrumentShell stateBar={strip} scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}>
      <div className="flex-1 min-h-0 flex gap-3 p-3 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-auto space-y-3">
          <Panel
            title="Blocking"
            subtitle={`${blocking.length} holding work up`}
            accent="var(--i-red)"
            dense
            dataShoot="panel-blocking"
          >
            <ul className="space-y-2">
              {blocking.map((d) => {
                const gate = gateByTitle.get(d.title);
                const on = gate ? m.scenario.resolvedGateIds.has(gate.id) : false;
                const expanded = openId === d.id;
                return (
                  <li
                    key={d.id}
                    className="rounded-md"
                    style={{
                      background: on ? "var(--i-violet-soft)" : "var(--i-panel-raised)",
                      border: `1px solid ${on ? "var(--i-violet)" : "var(--i-border)"}`,
                    }}
                  >
                    <div className="flex items-start gap-2.5 px-3 py-2.5">
                      <SeverityDot severity={d.severity} />
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => setOpenId(expanded ? null : d.id)}
                          className="text-left w-full text-[12.5px] text-[var(--i-text)] leading-snug"
                        >
                          {d.title}
                        </button>
                        <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px] text-[var(--i-text-faint)]">
                          {d.owner && <span>{d.owner}</span>}
                          {gate && (
                            <span style={{ color: "var(--i-amber)" }}>
                              +{Math.round(gate.likely)}d on {gate.scopeName}
                            </span>
                          )}
                          <span>opened {fmtDay(new Date(d.createdAt))}</span>
                        </div>
                      </div>
                      {gate && (
                        <button
                          role="switch"
                          aria-checked={on}
                          aria-label={`Assume "${d.title}" is resolved`}
                          data-shoot="assume-decision"
                          onClick={() =>
                            m.setScenario((prev) => {
                              const n = new Set(prev.resolvedGateIds);
                              if (n.has(gate.id)) n.delete(gate.id);
                              else n.add(gate.id);
                              return { ...prev, resolvedGateIds: n };
                            })
                          }
                          className="shrink-0 rounded-md px-2.5 py-1.5 text-[10.5px] font-medium transition-colors whitespace-nowrap"
                          style={{
                            background: on ? "var(--i-violet)" : "transparent",
                            color: on ? "var(--i-void)" : "var(--i-text-soft)",
                            border: `1px solid ${on ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                          }}
                        >
                          {on ? "Assumed settled" : "What if settled?"}
                        </button>
                      )}
                    </div>

                    {expanded && (
                      <div className="px-3 pb-3 pt-1 space-y-2.5" style={{ borderTop: "1px solid var(--i-border)" }}>
                        <blockquote
                          className="text-[11px] italic text-[var(--i-text-soft)] pl-2.5"
                          style={{ borderLeft: "2px solid var(--i-border-strong)" }}
                        >
                          “{d.quote}”
                        </blockquote>
                        <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">{d.rationale}</p>
                        {d.blocks && (
                          <p className="text-[11px] text-[var(--i-text-faint)]">
                            <span className="i-label">Blocks</span> {d.blocks}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <EpistemicBadge kind="observed" />
                          <Link
                            href="/audit"
                            className="text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
                          >
                            See the source →
                          </Link>
                        </div>

                        <div
                          className="rounded-md p-2.5 space-y-2"
                          style={{ border: "1px dashed var(--i-border-strong)" }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="i-label">Options</span>
                            <Prototype note="The engine has no decision-option entity, so per-option consequences cannot be simulated. Drafting only." />
                          </div>
                          {["Option A", "Option B"].map((o) => (
                            <div key={o} className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-[var(--i-text-soft)]">{o}</span>
                              <span className="text-[10px] text-[var(--i-text-faint)]">consequence not modelled</span>
                            </div>
                          ))}
                          <p className="text-[10px] text-[var(--i-text-faint)] leading-relaxed">
                            Today the model can answer &ldquo;what if this were settled at all&rdquo; — the switch above
                            — but not &ldquo;what if we chose B&rdquo;.
                          </p>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {blocking.length === 0 && (
                <li className="text-[11.5px] text-[var(--i-text-faint)] p-2">Nothing is blocking right now.</li>
              )}
            </ul>
          </Panel>

          <Panel title="Everything else" subtitle={`${other.length}`} accent="var(--i-text-faint)" dense>
            <ul className="space-y-px">
              {other.map((d) => (
                <li key={d.id} className="flex items-start gap-2.5 px-2 py-2">
                  <SeverityDot severity={d.severity} />
                  <span className="min-w-0">
                    <span className="block text-[11.5px] text-[var(--i-text)] leading-snug">{d.title}</span>
                    <span className="block text-[10px] text-[var(--i-text-faint)] mt-0.5">
                      {d.status === "resolved" ? `resolved${d.resolution ? ` — ${d.resolution}` : ""}` : d.status}
                    </span>
                  </span>
                </li>
              ))}
              {other.length === 0 && (
                <li className="text-[11.5px] text-[var(--i-text-faint)] p-2">Nothing else on record.</li>
              )}
            </ul>
          </Panel>
        </div>

        <aside className="shrink-0 w-[290px] space-y-3 overflow-auto">
          <Panel title="Consequence" accent="var(--i-violet)" href="/forecast" hrefLabel="Forecast">
            {assumed === 0 ? (
              <p className="text-[11.5px] text-[var(--i-text-faint)] leading-relaxed">
                Switch a decision to <em>assumed settled</em> and every affected date re-simulates immediately. The
                delay a blocking decision adds is serial — it does not shrink when you add people, which is why
                settling one is often worth more than staffing.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-[var(--i-text-soft)]">
                  Assuming {assumed} decision{assumed === 1 ? "" : "s"} settled:
                </p>
                <ul className="space-y-2">
                  {m.data.scopes.map((s) => {
                    const b = m.baseline?.get(s.scopeId);
                    const p = m.preview?.get(s.scopeId);
                    if (!b || !p) return null;
                    const d = Math.round((p.likelyDate.getTime() - b.likelyDate.getTime()) / 86400000);
                    return (
                      <li key={s.scopeId} className="flex items-center justify-between gap-2 text-[11.5px]">
                        <span className="text-[var(--i-text-soft)] truncate">{s.name}</span>
                        <span className="i-readout shrink-0" style={{ color: deltaTone(d) }}>
                          {deltaLabel(d)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[10px] text-[var(--i-text-faint)] leading-relaxed">
                  This is a hypothetical. Marking a decision genuinely resolved happens against its source, not here.
                </p>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </InstrumentShell>
  );
}

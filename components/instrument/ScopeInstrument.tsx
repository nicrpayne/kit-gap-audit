"use client";

// SCOPE — what are we actually shipping? Play what ships.
//
// The engine genuinely supports inclusion/exclusion of modelled work, so
// that is what this instrument really does: every row is a real WorkItem,
// and switching it out removes it from the simulation on the next frame.
// Nothing about that is mocked.
//
// Release boundaries (Beta / Production / Later) are the designed
// destination and are NOT backed yet -- the engine has no first-class
// release entity, so an item cannot truthfully be "moved to Production".
// Those lanes are therefore presented as a prototype grouping: you can drag
// an item between them to see the shape of the interaction, and the surface
// says plainly that only the in/out switch reaches the model.

import { useMemo, useState } from "react";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import { Panel, Prototype, Stat } from "@/components/instrument/Panel";
import {
  useProject,
  EMPTY_SCENARIO,
  fmtFull,
  deltaLabel,
  type ProjectScope,
} from "@/lib/instrument/useProject";

type Lane = "beta" | "production" | "later";
const LANES: { id: Lane; label: string; help: string }[] = [
  { id: "beta", label: "Beta", help: "First release boundary" },
  { id: "production", label: "Production", help: "General availability" },
  { id: "later", label: "Later", help: "Explicitly deferred" },
];

export default function ScopeInstrument() {
  const m = useProject();
  const [scopeId, setScopeId] = useState<string | null>(null);
  // Prototype-only: which lane an item has been dragged into. Never read by
  // the simulation -- see the note in the header.
  const [lanes, setLanes] = useState<Map<string, Lane>>(new Map());
  const [dragId, setDragId] = useState<string | null>(null);

  const scopeNameById = useMemo(
    () => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])),
    [m.data]
  );
  const scope: ProjectScope | null = useMemo(() => {
    if (!m.data) return null;
    return m.data.scopes.find((s) => s.scopeId === scopeId) ?? m.data.scopes[0] ?? null;
  }, [m.data, scopeId]);

  const excluded = m.scenario.excludedItemIds;

  function toggleItem(id: string) {
    m.setScenario((prev) => {
      const next = new Set(prev.excludedItemIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, excludedItemIds: next };
    });
  }
  function setAll(items: { id: string }[], include: boolean) {
    m.setScenario((prev) => {
      const next = new Set(prev.excludedItemIds);
      for (const i of items) {
        if (include) next.delete(i.id);
        else next.add(i.id);
      }
      return { ...prev, excludedItemIds: next };
    });
  }

  const strip = (
    <ScenarioStrip
      title="Scope"
      owns="What we are actually shipping, and what we are not"
      active={m.active}
      chips={chipsFor(m.scenario, scopeNameById, excluded.size, m.scenario.resolvedGateIds.size)}
      onDiscard={() => m.setScenario(EMPTY_SCENARIO)}
    />
  );

  if (m.loading && !m.data)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">Loading…</div>
      </InstrumentShell>
    );
  if (!m.data || !scope) return <InstrumentShell stateBar={strip}><div className="flex-1" /></InstrumentShell>;

  const b = m.baseline?.get(scope.scopeId);
  const p = m.preview?.get(scope.scopeId) ?? b;
  const delta = b && p ? Math.round((p.likelyDate.getTime() - b.likelyDate.getTime()) / 86400000) : 0;

  const included = scope.items.filter((i) => !excluded.has(i.id));
  const effortIn = included.reduce((s, i) => s + i.likely, 0);
  const effortAll = scope.items.reduce((s, i) => s + i.likely, 0);

  const laneOf = (id: string): Lane => lanes.get(id) ?? "beta";

  return (
    <InstrumentShell
      stateBar={strip}
      scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
      onSelectScope={setScopeId}
    >
      <div className="flex-1 min-h-0 flex">
        {/* Scope switcher + consequence: the whole point is that cutting work
            here immediately moves the date on the right. */}
        <div
          className="shrink-0 w-[212px] flex flex-col"
          style={{ background: "var(--i-panel)", borderRight: "1px solid var(--i-border)" }}
        >
          <div className="p-3" style={{ borderBottom: "1px solid var(--i-border)" }}>
            <div className="i-label mb-2">Scopes</div>
            <div className="space-y-px">
              {m.data.scopes.map((s) => {
                const sel = s.scopeId === scope.scopeId;
                const cut = s.items.filter((i) => excluded.has(i.id)).length;
                return (
                  <button
                    key={s.scopeId}
                    onClick={() => setScopeId(s.scopeId)}
                    className="w-full text-left rounded px-2 py-2 transition-colors"
                    style={{ background: sel ? "rgba(243,240,230,0.05)" : "transparent" }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="text-[11.5px] truncate"
                        style={{ color: sel ? "var(--i-text)" : "var(--i-text-soft)" }}
                      >
                        {s.name}
                      </span>
                      {cut > 0 && (
                        <span
                          className="shrink-0 rounded-sm px-1 text-[9px] font-semibold"
                          style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
                        >
                          −{cut}
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] text-[var(--i-text-faint)] mt-0.5">
                      {s.items.length} items
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 space-y-3.5">
            <Stat
              label="Ships on"
              size={20}
              value={p ? fmtFull(p.likelyDate) : "—"}
              tone={delta !== 0 ? "var(--i-violet)" : undefined}
              sub={delta !== 0 ? deltaLabel(delta) : "unchanged from Reality"}
            />
            <div>
              <div className="i-label">Effort in scope</div>
              <div className="i-readout mt-1.5 text-[18px] leading-none text-[var(--i-text)]">
                {Math.round(effortIn)}
                <span className="text-[10px] font-normal"> / {Math.round(effortAll)}d</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--i-recess)" }}>
                <div
                  className="h-full transition-[width] duration-200"
                  style={{
                    width: `${effortAll ? (effortIn / effortAll) * 100 : 0}%`,
                    background: excluded.size > 0 ? "var(--i-violet)" : "var(--i-text-soft)",
                  }}
                />
              </div>
              <div className="mt-1.5 text-[10px] text-[var(--i-text-faint)]">
                {included.length} of {scope.items.length} items included
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setAll(scope.items, true)}
                className="rounded-md px-2 py-1.5 text-[10.5px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                Include all
              </button>
              <button
                onClick={() => setAll(scope.items, false)}
                className="rounded-md px-2 py-1.5 text-[10.5px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                Cut all
              </button>
            </div>
          </div>
        </div>

        {/* The lanes. */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 p-3 overflow-hidden">
          <div
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-md"
            style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
          >
            <Prototype note="Release lanes are designed, not modelled. The engine has no release entity yet, so dragging between lanes changes nothing in the simulation." />
            <span className="text-[10.5px] text-[var(--i-text-faint)]">
              Lanes are a prototype. The <strong className="text-[var(--i-text-soft)]">in / out switch is real</strong> — it
              adds or removes the item from the simulation immediately.
            </span>
          </div>

          <div className="flex-1 min-h-0 grid gap-3" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            {LANES.map((lane) => {
              const items = scope.items.filter((i) => laneOf(i.id) === lane.id);
              return (
                <div
                  key={lane.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragId) return;
                    setLanes((prev) => new Map(prev).set(dragId, lane.id));
                    setDragId(null);
                  }}
                  className="min-h-0"
                >
                  <Panel
                    title={lane.label}
                    subtitle={`${items.filter((i) => !excluded.has(i.id)).length} in · ${Math.round(
                      items.filter((i) => !excluded.has(i.id)).reduce((s, i) => s + i.likely, 0)
                    )}d`}
                    accent={lane.id === "beta" ? "var(--i-mint)" : lane.id === "production" ? "var(--i-violet)" : "var(--i-text-faint)"}
                    dense
                    dataShoot={`lane-${lane.id}`}
                  >
                    <ul className="space-y-1">
                      {items.map((item) => {
                        const out = excluded.has(item.id);
                        return (
                          <li
                            key={item.id}
                            draggable
                            onDragStart={() => setDragId(item.id)}
                            className="group rounded-md px-2 py-2 transition-colors"
                            style={{
                              background: out ? "transparent" : "var(--i-panel-raised)",
                              border: `1px solid ${out ? "var(--i-border)" : "var(--i-border-strong)"}`,
                              opacity: out ? 0.5 : 1,
                            }}
                          >
                            <div className="flex items-start gap-2">
                              {/* The one real control on this surface. */}
                              <button
                                role="switch"
                                aria-checked={!out}
                                aria-label={`${item.label} in scope`}
                                data-shoot="scope-switch"
                                onClick={() => toggleItem(item.id)}
                                className="shrink-0 mt-[2px] rounded-full transition-colors"
                                style={{
                                  width: 26,
                                  height: 15,
                                  background: out ? "var(--i-recess)" : "var(--i-mint)",
                                  border: `1px solid ${out ? "var(--i-border-strong)" : "var(--i-mint)"}`,
                                  position: "relative",
                                }}
                              >
                                <span
                                  className="absolute rounded-full transition-[left] duration-150"
                                  style={{
                                    top: 1,
                                    left: out ? 1 : 12,
                                    width: 11,
                                    height: 11,
                                    background: out ? "var(--i-text-faint)" : "var(--i-void)",
                                  }}
                                />
                              </button>
                              <span className="min-w-0 flex-1">
                                <span
                                  className="block text-[11px] leading-snug"
                                  style={{
                                    color: out ? "var(--i-text-faint)" : "var(--i-text)",
                                    textDecoration: out ? "line-through" : undefined,
                                  }}
                                >
                                  {item.label}
                                </span>
                                <span className="block text-[9.5px] text-[var(--i-text-faint)] mt-1 tabular-nums">
                                  {item.low}–{item.high}d · likely {item.likely}d
                                </span>
                              </span>
                            </div>
                          </li>
                        );
                      })}
                      {items.length === 0 && (
                        <li className="text-[10.5px] text-[var(--i-text-faint)] p-2">
                          Drag work here to plan it into {lane.label}.
                        </li>
                      )}
                    </ul>
                  </Panel>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </InstrumentShell>
  );
}

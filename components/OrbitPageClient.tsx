"use client";

// ORBIT.
//
// "Where is the project's ability to move being spent, blocked or wasted —
// and what happens if I change it?"
//
// This file is composition and wiring only. The truth is lib/orbit/graph.ts,
// the drawing is components/orbit/OrbitField.tsx, and the levers are the
// ones SuiteScenario already has. Three laws hold here:
//
//   IT WRITES NOTHING. There is no POST on this route. Looking at a project
//   cannot change it.
//
//   THERE IS ONE SCENARIO. Every hypothetical goes through useProject's
//   SuiteScenario — the same store Scope, Decisions and Portfolio write —
//   so what you build here is what Forecast is already showing, and
//   discarding it anywhere clears it everywhere.
//
//   IT IS NOT A SNAPSHOT. useProject revalidates on the shared reality bus,
//   so changing Reality in another instrument recomposes this one without a
//   refresh, and the simulation re-runs in the browser rather than on a
//   server round trip.

import { useCallback, useMemo, useState } from "react";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip from "@/components/instrument/ScenarioStrip";
import { useProject, EMPTY_SCENARIO, type SuiteScenario } from "@/lib/instrument/useProject";
import { useDecisions } from "@/lib/decisions/useDecisions";
import { adaptOrbitInput } from "@/lib/orbit/adapt";
import { buildOrbitGraph, type OrbitGraph, type OrbitLever } from "@/lib/orbit/graph";
import OrbitField from "@/components/orbit/OrbitField";
import OrbitInspector from "@/components/orbit/OrbitInspector";

export default function OrbitPageClient() {
  const m = useProject();
  const d = useDecisions();
  const [focusScopeId, setFocusScopeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const scopes = useMemo(() => m.data?.scopes ?? [], [m.data]);

  // WHERE ORBIT OPENS. The project whose own completion is setting the
  // portfolio's date — the one whose ability to move actually is the
  // project's. Deterministic, and overridden the moment a human chooses.
  const defaultFocus = useMemo(() => {
    if (!m.preview || scopes.length === 0) return null;
    let best: string | null = null;
    let latest = -Infinity;
    for (const s of scopes) {
      const r = m.preview.get(s.scopeId);
      if (r && r.likelyDate.getTime() > latest) {
        latest = r.likelyDate.getTime();
        best = s.scopeId;
      }
    }
    return best ?? scopes[0].scopeId;
  }, [m.preview, scopes]);

  const focus = focusScopeId ?? defaultFocus;

  const graph: OrbitGraph | null = useMemo(() => {
    if (!m.data || !m.preview || !m.baseline || !focus) return null;
    const input = adaptOrbitInput({
      data: m.data,
      scenario: m.scenario,
      scenarioActive: m.active,
      decisions: d.data?.decisions ?? [],
      preview: m.preview,
      baseline: m.baseline,
      focusScopeId: focus,
    });
    return input ? buildOrbitGraph(input) : null;
  }, [m.data, m.preview, m.baseline, m.scenario, m.active, d.data, focus]);

  const node = graph?.nodes.find((n) => n.id === selected) ?? null;

  // THE ONLY WRITES ON THIS ROUTE, AND THEY ARE NOT WRITES. Each one sets a
  // field SuiteScenario already owns; none of them touches Reality, and none
  // of them makes a network request.
  const pullLever = useCallback(
    (lever: OrbitLever) => {
      m.setScenario((s: SuiteScenario) => {
        if (lever.kind === "resolve-gate") {
          const next = new Set(s.resolvedGateIds);
          if (next.has(lever.gateId)) next.delete(lever.gateId);
          else next.add(lever.gateId);
          return { ...s, resolvedGateIds: next };
        }
        if (lever.kind === "bypass-capability") {
          // Both halves together, exactly as Scope writes them: the
          // product statement (this capability is out) and the engine one
          // (these items are not simulated). They must never disagree.
          const features = new Set(s.bypassedFeatureIds);
          const items = new Set(s.excludedItemIds);
          if (features.has(lever.featureId)) {
            features.delete(lever.featureId);
            for (const i of lever.itemIds) items.delete(i);
          } else {
            features.add(lever.featureId);
            for (const i of lever.itemIds) items.add(i);
          }
          return { ...s, bypassedFeatureIds: features, excludedItemIds: items };
        }
        return s;
      });
    },
    [m]
  );

  const leverIsOn = useCallback(
    (lever: OrbitLever) =>
      lever.kind === "resolve-gate"
        ? m.scenario.resolvedGateIds.has(lever.gateId)
        : lever.kind === "bypass-capability"
          ? m.scenario.bypassedFeatureIds.has(lever.featureId)
          : false,
    [m.scenario]
  );

  const strip = (
    <ScenarioStrip
      title="Orbit"
      owns="Where the project's ability to move is being spent, blocked or wasted"
      active={m.active}
      chips={[
        ...(m.scenario.resolvedGateIds.size > 0
          ? [
              {
                id: "gates",
                label: `${m.scenario.resolvedGateIds.size} ${m.scenario.resolvedGateIds.size === 1 ? "decision" : "decisions"} assumed answered`,
                href: "/decisions",
              },
            ]
          : []),
        ...(m.scenario.bypassedFeatureIds.size > 0
          ? [
              {
                id: "cut",
                label: `${m.scenario.bypassedFeatureIds.size} ${m.scenario.bypassedFeatureIds.size === 1 ? "capability" : "capabilities"} cut`,
                href: "/scope",
              },
            ]
          : []),
        ...(Object.keys(m.scenario.capacityOverrideByScope).length > 0
          ? [{ id: "cap", label: "capacity changed", href: "/portfolio" }]
          : []),
      ]}
      onDiscard={() => {
        m.setScenario(EMPTY_SCENARIO);
        setSelected(null);
      }}
      right={
        <div className="flex items-center gap-1">
          {scopes.map((s) => {
            const on = s.scopeId === focus;
            return (
              <button
                key={s.scopeId}
                data-shoot={`orbit-focus-${s.scopeId}`}
                onClick={() => {
                  setFocusScopeId(s.scopeId);
                  setSelected(null);
                }}
                className="rounded px-2.5 py-1 text-[11px] transition-colors"
                style={{
                  background: on ? "var(--i-panel-raised)" : "transparent",
                  color: on ? "var(--i-text)" : "var(--i-text-faint)",
                  border: `1px solid ${on ? "var(--i-border-strong)" : "transparent"}`,
                }}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      }
    />
  );

  if (!graph || !m.startDate)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center i-label" data-shoot="orbit-empty">
          {m.error ?? d.error ?? "Reading the project…"}
        </div>
      </InstrumentShell>
    );

  return (
    <InstrumentShell stateBar={strip}>
      <div className="flex min-h-0 flex-1" style={{ background: "var(--i-void)" }}>
        <div className="min-w-0 flex-1">
          <OrbitField graph={graph} startDate={m.startDate} selected={selected} onSelect={setSelected} />
        </div>
        {/* Quiet at rest. It is a margin note, not a second screen. */}
        <div
          className="w-[300px] shrink-0"
          style={{ borderLeft: "1px solid var(--i-border)", background: node ? "var(--i-panel)" : "transparent" }}
        >
          <OrbitInspector graph={graph} node={node} startDate={m.startDate} onLever={pullLever} isOn={leverIsOn} />
        </div>
      </div>
    </InstrumentShell>
  );
}

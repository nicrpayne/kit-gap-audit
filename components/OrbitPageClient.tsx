"use client";

// ORBIT — WIREFRAME.
//
// THIS IS NOT THE INSTRUMENT. It is the read model made visible so the
// structure can be argued with before anyone designs it: are these the right
// objects, are these the right relationships, and does the resting view stay
// quiet on real data? Every shape here is a plain circle and a plain line on
// purpose. Nothing in this file should survive the visual design pass except
// the questions it answers.
//
// What it must be honest about, even as a wireframe:
//
//   IT WRITES NOTHING. There is no POST on this route. Looking at the
//   project cannot change the project.
//
//   IT KEEPS ONE SCENARIO. Assuming a decision answered goes through
//   useProject's existing SuiteScenario.resolvedGateIds — the same field
//   Decisions writes — so the hypothetical you build here is the one
//   Forecast is already showing.
//
//   IT INVENTS NO NUMBER. Every figure on screen is copied from the module
//   that owns it (see lib/orbit/adapt.ts). There is no "project energy"
//   here, no score, and no unitless weight.

import { useMemo, useState } from "react";
import Link from "@/components/instrument/SignalLink";
import { useSearchParams } from "next/navigation";
import { useProjectParam } from "@/lib/shell/useProjectParam";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip from "@/components/instrument/ScenarioStrip";
import { useProject, EMPTY_SCENARIO } from "@/lib/instrument/useProject";
import { useDecisions } from "@/lib/decisions/useDecisions";
import { adaptOrbitInput } from "@/lib/orbit/adapt";
import { buildOrbitGraph, relatedTo, type OrbitGraph, type OrbitNode } from "@/lib/orbit/graph";
import { layoutOrbit } from "@/lib/orbit/layout";

const SIZE = 880;
const DAY = 86400000;

const KIND_COLOR: Record<OrbitNode["kind"], string> = {
  forecast: "var(--i-signal)",
  capability: "var(--i-mint)",
  dependency: "var(--i-text-soft)",
  gate: "var(--i-amber)",
  capacity: "var(--i-violet)",
};

const KIND_LABEL: Record<OrbitNode["kind"], string> = {
  forecast: "Forecast",
  capability: "Capability",
  dependency: "Waiting on",
  gate: "Decision gate",
  capacity: "People",
};

/** What each object is worth, in the unit its own model uses. Never a score,
    never normalised, and never a number this file computed. */
function quantityOf(n: OrbitNode): string {
  switch (n.kind) {
    case "capability":
      return `${n.loadDays.toFixed(1)}d`;
    case "capacity":
      return `${n.effective.toFixed(1)} FTE`;
    case "gate":
      return `${n.likely}d likely`;
    case "dependency":
      return `P50 +${Math.round(n.p50)}d`;
    default:
      return "";
  }
}

const dateOf = (start: Date, days: number) =>
  new Date(start.getTime() + days * DAY).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function OrbitPageClient() {
  const m = useProject();
  const d = useDecisions();
  // ARRIVING FROM SOMEWHERE ELSE. The Control Room sends people here with
  // a dependency already in mind: ?focus=<scopeId>&select=<node id>. The
  // ids are Orbit's own stable node ids, so nothing is translated on the
  // way in and an unknown one simply selects nothing.
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("select"));

  const scopes = useMemo(() => m.data?.scopes ?? [], [m.data]);

  // WHERE ORBIT OPENS. Not "the first scope in the list" — the scope whose
  // own completion is setting the portfolio's date, because that is the one
  // whose ability to move is actually the project's. Deterministic (ties
  // break on the payload's own order), and overridden the moment a human
  // picks a different focus.
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

  // FOCUS LIVES IN THE URL, on the same ?project= convention as every other
  // instrument (lib/shell/useProjectParam). Orbit already accepted ?focus=
  // on the way in from the Control Room but never wrote it back, so the
  // focus a person chose here could not be refreshed into or shared.
  //
  // The clever default is preserved by expressing it as ORDER rather than
  // as state: the hook falls back to the first available id, so putting the
  // date-setting scope first reproduces exactly the previous behaviour.
  const orderedScopeIds = useMemo(() => {
    if (scopes.length === 0) return [];
    const ids = scopes.map((s) => s.scopeId);
    if (!defaultFocus) return ids;
    return [defaultFocus, ...ids.filter((id) => id !== defaultFocus)];
  }, [scopes, defaultFocus]);

  const { projectId: focus, select: setFocusScopeId } = useProjectParam(
    m.preview && scopes.length > 0 ? orderedScopeIds : null
  );

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

  const places = useMemo(() => (graph ? layoutOrbit(graph, SIZE) : new Map()), [graph]);
  const related = useMemo(() => (graph && selected ? relatedTo(graph, selected) : null), [graph, selected]);
  const node = graph?.nodes.find((n) => n.id === selected) ?? null;

  const strip = (
    <ScenarioStrip
      title="Orbit"
      owns="Where the ability to move is being spent, blocked or wasted"
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
      ]}
      onDiscard={() => m.setScenario(EMPTY_SCENARIO)}
      right={
        <div className="flex items-center gap-1.5">
          <span className="i-label">Focus</span>
          {scopes.map((s) => (
            <button
              key={s.scopeId}
              data-shoot={`orbit-focus-${s.scopeId}`}
              onClick={() => {
                setFocusScopeId(s.scopeId);
                setSelected(null);
              }}
              className="rounded px-2 py-1 text-[11px]"
              style={{
                background: s.scopeId === focus ? "var(--i-panel-raised)" : "transparent",
                color: s.scopeId === focus ? "var(--i-text)" : "var(--i-text-faint)",
                border: "1px solid var(--i-border)",
              }}
            >
              {s.name}
            </button>
          ))}
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

  const start = m.startDate;
  const centre = graph.nodes.find((n) => n.kind === "forecast");
  const dim = (id: string) => (related && !related.nodes.has(id) ? 0.18 : 1);
  const edgeDim = (id: string) => (related && !related.edges.has(id) ? 0.1 : 1);

  return (
    <InstrumentShell stateBar={strip}>
      <div className="flex-1 min-h-0 flex">
        {/* THE FIELD */}
        <div className="flex-1 min-w-0 flex items-center justify-center" style={{ background: "var(--i-void)" }}>
          <svg
            data-shoot="orbit-field"
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            onClick={() => setSelected(null)}
          >
            {/* Orbit rings, so radius reads as a level and not as scatter. */}
            {[0.29, 0.43].map((f) => (
              <circle
                key={f}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={SIZE * f}
                fill="none"
                stroke="var(--i-border)"
                strokeDasharray="2 6"
                opacity={0.5}
              />
            ))}

            {graph.edges.map((e) => {
              const a = places.get(e.from);
              const b = places.get(e.to);
              if (!a || !b) return null;
              return (
                <line
                  key={e.id}
                  data-orbit-edge={e.id}
                  data-orbit-edge-kind={e.kind}
                  data-causal={e.causal ? "true" : "false"}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={e.causal ? "var(--i-text-soft)" : "var(--i-text-faint)"}
                  // A DASHED EDGE IS NOT DECORATION. Solid means the engine
                  // listens to it; dashed means it does not, and nothing on
                  // this surface may draw a candidate as solid.
                  strokeDasharray={e.causal ? undefined : "3 5"}
                  strokeWidth={e.causal ? 1.4 : 1}
                  opacity={edgeDim(e.id) * 0.75}
                />
              );
            })}

            {graph.nodes.map((n) => {
              const p = places.get(n.id);
              if (!p) return null;
              const lit = selected === n.id;
              return (
                <g
                  key={n.id}
                  data-orbit-node={n.id}
                  data-orbit-kind={n.kind}
                  data-candidate={n.candidate ? "true" : "false"}
                  opacity={dim(n.id)}
                  style={{ cursor: "pointer" }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelected(lit ? null : n.id);
                  }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill="var(--i-recess)"
                    stroke={KIND_COLOR[n.kind]}
                    // A candidate is drawn as not-yet-real, and is the only
                    // thing on the field allowed to be drawn that way.
                    strokeDasharray={n.candidate ? "3 4" : undefined}
                    strokeWidth={lit ? 2.4 : 1.4}
                  />
                  {n.kind === "forecast" && centre?.kind === "forecast" && (
                    <>
                      <text
                        x={p.x}
                        y={p.y - 10}
                        textAnchor="middle"
                        className="i-readout"
                        fill="var(--i-text)"
                        fontSize={15}
                        data-shoot="orbit-centre-p50"
                      >
                        {dateOf(start, centre.p50)}
                      </text>
                      <text x={p.x} y={p.y + 8} textAnchor="middle" fill="var(--i-text-faint)" fontSize={9}>
                        {dateOf(start, centre.p10)} → {dateOf(start, centre.p90)}
                      </text>
                      <text
                        x={p.x}
                        y={p.y + 26}
                        textAnchor="middle"
                        fill={centre.confidenceAtTarget === null ? "var(--i-text-faint)" : "var(--i-amber)"}
                        fontSize={10}
                        data-shoot="orbit-centre-confidence"
                      >
                        {centre.confidenceAtTarget === null
                          ? "no target set"
                          : `${centre.confidenceAtTarget}% by target`}
                      </text>
                    </>
                  )}
                  {n.kind !== "forecast" && (
                    <>
                      <text
                        x={p.x}
                        y={p.y + p.r + 13}
                        textAnchor="middle"
                        fill="var(--i-text-soft)"
                        fontSize={10}
                      >
                        {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                      </text>
                      {/* THE QUANTITY, ON THE FIELD. An object whose size on
                          screen means nothing must at least say what it is
                          worth, or the picture is only a diagram. */}
                      <text
                        x={p.x}
                        y={p.y + p.r + 25}
                        textAnchor="middle"
                        fill="var(--i-text-faint)"
                        fontSize={9}
                        className="i-readout"
                      >
                        {quantityOf(n)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* RESTRAINT, ADMITTED. What the resting view chose not to draw
                is counted on the field rather than left for someone to
                discover was missing. */}
            {graph.omitted.capabilities > 0 && (
              <text
                x={SIZE / 2}
                y={26}
                textAnchor="middle"
                fill="var(--i-text-faint)"
                fontSize={10}
                data-shoot="orbit-omitted"
              >
                {graph.omitted.capabilities} smaller{" "}
                {graph.omitted.capabilities === 1 ? "capability" : "capabilities"} not shown ·{" "}
                {graph.omitted.capabilityLoadDays.toFixed(1)}d
              </text>
            )}
          </svg>
        </div>

        {/* THE ATMOSPHERE: what any of this is based on. */}
        <div
          className="w-[340px] shrink-0 overflow-y-auto i-noscrollbar p-4"
          style={{ background: "var(--i-panel)", borderLeft: "1px solid var(--i-border)" }}
          data-shoot="orbit-inspector"
        >
          {!node && (
            <div className="i-label" data-shoot="orbit-inspector-rest">
              Touch anything to see what it does to the date.
            </div>
          )}
          {node && (
            <div className="flex flex-col gap-3">
              <div>
                <div className="i-label">{KIND_LABEL[node.kind]}</div>
                <div className="text-[14px] text-[var(--i-text)]">{node.label}</div>
              </div>

              {node.candidate && (
                <div
                  className="rounded p-2 text-[11px]"
                  style={{ background: "var(--i-recess)", color: "var(--i-text-soft)" }}
                  data-shoot="orbit-candidate-note"
                >
                  Not accepted. A machine suggested this; the forecast does not count it.
                </div>
              )}

              {node.kind === "gate" && (
                <div className="flex flex-col gap-2 text-[11px] text-[var(--i-text-soft)]">
                  <div>{node.dependency}</div>
                  <div style={{ color: "var(--i-text-faint)" }}>{node.evidenceForGate}</div>
                  <div className="i-readout">
                    {node.low} / {node.likely} / {node.high} days · {node.evidenceCount} pieces of evidence
                  </div>
                  <button
                    data-shoot={`orbit-assume-${node.id}`}
                    className="rounded px-2 py-1.5 text-[11px] self-start"
                    style={{
                      border: "1px solid var(--i-border)",
                      background: node.assumedResolved ? "var(--i-violet-soft)" : "transparent",
                      color: node.assumedResolved ? "var(--i-violet)" : "var(--i-text)",
                    }}
                    onClick={() =>
                      // THE EXISTING LEVER. This is the same set Decisions
                      // writes; there is no second scenario store.
                      node.scenarioLever?.kind === "resolve-gate" &&
                      m.setScenario((s) => {
                        const { gateId } = node.scenarioLever as { gateId: string };
                        const next = new Set(s.resolvedGateIds);
                        if (next.has(gateId)) next.delete(gateId);
                        else next.add(gateId);
                        return { ...s, resolvedGateIds: next };
                      })
                    }
                  >
                    {node.assumedResolved ? "Assuming answered" : "Assume answered"}
                  </button>
                  <Link href="/decisions" className="text-[11px]" style={{ color: "var(--i-signal)" }}>
                    Answer it for real in Decisions →
                  </Link>
                </div>
              )}

              {node.kind === "capacity" && (
                <div className="flex flex-col gap-1 text-[11px] text-[var(--i-text-soft)]">
                  <div className="i-readout">{node.raw.toFixed(2)} FTE allocated</div>
                  <div className="i-readout">{node.effective.toFixed(2)} FTE delivered</div>
                  <div style={{ color: node.switchLoss > 0 ? "var(--i-red)" : "var(--i-text-faint)" }}>
                    {node.switchLoss > 0
                      ? `${node.switchLoss.toFixed(2)} FTE lost to context switching across ${node.splitPeople} split ${node.splitPeople === 1 ? "person" : "people"}`
                      : "no context-switch loss"}
                  </div>
                  {node.required > 0 && (
                    <div style={{ color: "var(--i-amber)" }} data-shoot="orbit-capacity-required">
                      {node.required.toFixed(2)} FTE asked for that the roster does not contain
                    </div>
                  )}
                </div>
              )}

              {node.kind === "capability" && (
                <div className="flex flex-col gap-1.5 text-[11px] text-[var(--i-text-soft)]">
                  <div className="i-readout">{node.loadDays.toFixed(1)} days of schedule</div>
                  <div style={{ color: "var(--i-text-faint)" }}>
                    {node.range.low}/{node.range.likely}/{node.range.high} effort days · {node.itemIds.length} items
                    {node.placeholderCount > 0 ? ` · ${node.placeholderCount} unestimated` : ""}
                  </div>
                  {node.evidence?.quote && (
                    <div className="rounded p-2 italic" style={{ background: "var(--i-recess)" }}>
                      “{node.evidence.quote}”
                    </div>
                  )}
                  <button
                    data-shoot={`orbit-cut-${node.id}`}
                    className="rounded px-2 py-1.5 text-[11px] self-start"
                    style={{ border: "1px solid var(--i-border)", background: "transparent", color: "var(--i-text)" }}
                    onClick={() =>
                      // SCOPE'S LEVER, NOT A NEW ONE. Both halves are written
                      // together exactly as ScopeInstrument writes them: the
                      // product-level statement (this capability is out) and
                      // the engine-level one (these items are not simulated).
                      // They must never be able to disagree.
                      node.scenarioLever?.kind === "bypass-capability" &&
                      m.setScenario((s) => {
                        const lever = node.scenarioLever as { featureId: string; itemIds: string[] };
                        const features = new Set(s.bypassedFeatureIds);
                        const items = new Set(s.excludedItemIds);
                        features.add(lever.featureId);
                        for (const i of lever.itemIds) items.add(i);
                        return { ...s, bypassedFeatureIds: features, excludedItemIds: items };
                      })
                    }
                  >
                    Cut it from the release
                  </button>
                  <Link href="/scope" className="text-[11px]" style={{ color: "var(--i-signal)" }}>
                    Compose the release in Scope →
                  </Link>
                </div>
              )}

              {node.kind === "dependency" && (
                <div className="text-[11px] text-[var(--i-text-soft)]">
                  Lands around {dateOf(start, node.p50)}. Nothing here finishes before it does.
                </div>
              )}

              {/* WHAT THIS TOUCHES, IN WORDS. The edge sentences are the
                  product: a line you cannot explain should not be drawn. */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="i-label">What this does</div>
                {graph.edges
                  .filter((e) => e.from === node.id || e.to === node.id)
                  .map((e) => (
                    <div
                      key={e.id}
                      data-shoot={`orbit-meaning-${e.id}`}
                      className="rounded p-2 text-[11px]"
                      style={{ background: "var(--i-recess)", color: "var(--i-text-soft)" }}
                    >
                      <div className="flex items-center justify-between gap-2 pb-1">
                        <span className="i-label" style={{ color: e.causal ? "var(--i-signal)" : "var(--i-text-faint)" }}>
                          {e.causal ? "moves the date" : "explains only"}
                        </span>
                        {e.quantity && (
                          <span className="i-readout" style={{ color: "var(--i-text)" }}>
                            {e.quantity.value.toFixed(e.quantity.unit === "fte" ? 2 : 1)} {e.quantity.unit}
                          </span>
                        )}
                      </div>
                      {e.meaning}
                    </div>
                  ))}
              </div>

              <div className="i-label pt-1" style={{ color: "var(--i-text-faint)" }} data-shoot="orbit-provenance">
                {node.provenance.source} · {node.provenance.ref}
              </div>
            </div>
          )}
        </div>
      </div>
    </InstrumentShell>
  );
}

"use client";

// SCOPE — what are we actually shipping?
//
// THE OBJECT IS THE DESK. One channel per product CAPABILITY, feeding a master
// section that is the release itself. That is the correction V1 needed: a
// product manager composes features, not tickets, and tickets belong
// underneath as evidence.
//
// Each channel is a fixed-size module — its width never changes with effort,
// because a composition whose shape you can learn is worth more than a chart.
// What the data moves is the light: meter fill, uncertainty band, coverage,
// and whether the channel is lit at all.
//
// BYPASS, NOT DELETE. Taking a capability out of the release mutes its
// channel. It stays exactly where it was, goes dark, and its meter drains.
// Nothing flies off to a holding pen and nothing reflows, because a muted
// channel on a desk is the clearest statement any instrument makes that a
// thing still exists and simply is not in the mix right now.
//
// OWNERSHIP. Scope owns which capabilities are in. Capacity is Portfolio's,
// decisions are Decisions', the synthesized consequence is Forecast's, and
// release DATES are Timeline's. Each appears here only where it bears on the
// composition, read-only, with a door.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import FeatureDetail, { AddFeature } from "@/components/instrument/FeatureDetail";
import {
  useProject,
  EMPTY_SCENARIO,
  fmtFull,
  fmtDay,
  deltaLabel,
  deltaTone,
  type ProjectScope,
} from "@/lib/instrument/useProject";
import { composeFeatures, uncertaintyLabel, type Feature } from "@/lib/scope/features";
import { readDominance } from "@/lib/scope/constraint";
import { formatCapacity } from "@/lib/capacity/limits";

// Fixed module geometry. Effort never changes a channel's size -- it changes
// the light inside it. A rack you can learn the shape of survives the data
// changing underneath it; a chart does not.
const CHANNEL_W = 172;
const CHANNEL_H = 384;
const METER_H = 156;

const SOURCE_TAG: Record<Feature["source"], { label: string; tone: string; help: string }> = {
  linear: { label: "Linear", tone: "var(--i-text-faint)", help: "Derived from the issues' shared parent in Linear." },
  hermes: {
    label: "Candidate",
    tone: "var(--i-violet)",
    help: "Hermes found this in a source and nothing in Linear represents it. Not accepted Reality.",
  },
  manual: {
    label: "Draft",
    tone: "var(--i-violet)",
    help: "Declared by hand in this session. There is no Feature table yet, so it is not saved.",
  },
  unmapped: {
    label: "Unmapped",
    tone: "var(--i-amber)",
    help: "Work with no parent in Linear. Not a capability — a gap to close.",
  },
};

export default function ScopeInstrument() {
  const m = useProject();
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [openFeatureId, setOpenFeatureId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const scopeNameById = useMemo(
    () => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])),
    [m.data]
  );
  const scope: ProjectScope | null = useMemo(() => {
    if (!m.data) return null;
    return m.data.scopes.find((s) => s.scopeId === scopeId) ?? m.data.scopes[0] ?? null;
  }, [m.data, scopeId]);

  // Bypassing a capability writes BOTH halves of the truth: the product-level
  // decision, and the work-item exclusions the engine actually simulates. They
  // are set together so they can never disagree.
  const setBypassed = useCallback(
    (feature: Feature, out: boolean) =>
      m.setScenario((prev) => {
        const features = new Set(prev.bypassedFeatureIds);
        const items = new Set(prev.excludedItemIds);
        if (out) {
          features.add(feature.id);
          for (const i of feature.items) items.add(i.id);
        } else {
          features.delete(feature.id);
          for (const i of feature.items) items.delete(i.id);
        }
        return { ...prev, bypassedFeatureIds: features, excludedItemIds: items };
      }),
    [m]
  );

  const strip = (
    <ScenarioStrip
      title="Scope"
      owns="What we are actually shipping, and what we are not"
      active={m.active}
      chips={chipsFor(m.scenario, scopeNameById, m.scenario.excludedItemIds.size, m.scenario.resolvedGateIds.size)}
      onDiscard={() => {
        m.setScenario(EMPTY_SCENARIO);
        setOpenFeatureId(null);
      }}
      right={
        <div className="flex items-center gap-1.5">
          {(m.data?.scopes ?? []).map((s) => (
            <button
              key={s.scopeId}
              onClick={() => {
                setScopeId(s.scopeId);
                setOpenFeatureId(null);
              }}
              data-shoot={`scope-${s.scopeId}`}
              className="rounded px-2.5 py-1 text-[10.5px] transition-colors"
              style={{
                background: s.scopeId === scope?.scopeId ? "var(--i-panel-raised)" : "transparent",
                color: s.scopeId === scope?.scopeId ? "var(--i-text)" : "var(--i-text-faint)",
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      }
    />
  );

  if (!m.data || !scope || !m.startDate)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
          {m.error ?? "Loading…"}
        </div>
      </InstrumentShell>
    );

  const startDate = m.startDate;
  const base = m.baseline?.get(scope.scopeId) ?? null;
  const res = m.preview?.get(scope.scopeId) ?? base;
  if (!res || !base)
    return (
      <InstrumentShell stateBar={strip}>
        <div className="flex-1" />
      </InstrumentShell>
    );

  const capacity = m.scenario.capacityOverrideByScope[scope.scopeId] ?? scope.teamCapacity;

  const composition = composeFeatures(
    scope.items,
    scope.completedWork,
    capacity,
    m.scenario.bypassedFeatureIds,
    m.scenario.estimateOverrideByItemId,
    m.scenario.draftFeatures
  );
  // Reality's own composition, for the master's comparison. Computed with an
  // empty hypothetical so it is a fact, not a rearrangement of the scenario.
  const reality = composeFeatures(scope.items, scope.completedWork, scope.teamCapacity, new Set(), {}, []);

  const movedDays = Math.round((res.likelyDate.getTime() - base.likelyDate.getTime()) / 86400000);
  const dependencyNames = scope.dependsOnScopeIds.map((id) => scopeNameById.get(id) ?? id);
  const dom = readDominance(
    res,
    m.floorByScope?.get(scope.scopeId),
    startDate,
    scope.gates,
    m.scenario.resolvedGateIds,
    dependencyNames
  );

  const openFeature = composition.features.find((f) => f.id === openFeatureId) ?? null;
  const openGates = scope.gates.filter((g) => !m.scenario.resolvedGateIds.has(g.id));
  const epic = composition.features.find((f) => f.epic)?.epic ?? null;

  return (
    <InstrumentShell
      stateBar={strip}
      scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
      onSelectScope={(id) => {
        setScopeId(id);
        setOpenFeatureId(null);
      }}
    >
      <div className="flex-1 min-h-0 flex flex-col" style={{ background: "var(--i-void)" }}>
        {/* Centred in the viewport with air above and below: a rack of
            modules sitting in space, not columns stretched to fill a page. */}
        <div className="flex-1 min-h-0 flex items-center gap-5 px-6 overflow-y-auto">
          {/* ── THE DESK ─────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="shrink-0 flex items-baseline gap-3 mb-3">
              <h1 className="i-label" style={{ letterSpacing: "0.22em", color: "var(--i-text-soft)" }}>
                {scope.name} · capabilities
              </h1>
              <span className="text-[10.5px] text-[var(--i-text-faint)]">
                {composition.engaged.length} of {composition.features.length} in this release
                {epic ? ` · ${epic}` : ""}
              </span>
            </div>

            <div className="overflow-x-auto overflow-y-hidden pb-1" data-shoot="desk">
              <div className="flex gap-2.5" style={{ minWidth: "min-content" }}>
                {composition.features.map((f) => (
                  <FeatureChannel
                    key={f.id}
                    feature={f}
                    peakLoadDays={composition.peakLoadDays}
                    releaseLoadDays={composition.loadDays}
                    capacity={capacity}
                    onOpen={() => setOpenFeatureId(f.id)}
                    onToggle={() => setBypassed(f, !f.bypassed)}
                  />
                ))}
                <button
                  onClick={() => setAdding(true)}
                  data-shoot="add-feature"
                  className="shrink-0 rounded-lg flex flex-col items-center justify-center gap-2 transition-colors group"
                  style={{
                    width: CHANNEL_W,
                    height: CHANNEL_H,
                    border: "1px dashed var(--i-border-strong)",
                    color: "var(--i-text-faint)",
                  }}
                >
                  <span className="text-[20px] leading-none group-hover:text-[var(--i-text)] transition-colors">+</span>
                  <span className="text-[10.5px] group-hover:text-[var(--i-text-soft)] transition-colors">
                    Add capability
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* ── MASTER: the release these capabilities add up to ─────── */}
          <div
            className="shrink-0 flex flex-col rounded-lg overflow-hidden self-start"
            data-shoot="master"
            style={{ width: 288, background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
          >
            <div className="px-4 pt-4 pb-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
              <div className="i-label">{scope.name} lands</div>
              <div
                key={fmtFull(res.likelyDate)}
                className="i-readout i-fadeup mt-2 leading-none"
                style={{
                  fontSize: 27,
                  letterSpacing: "-0.03em",
                  color: movedDays !== 0 ? "var(--i-violet)" : "var(--i-text)",
                }}
              >
                {fmtFull(res.likelyDate)}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10.5px]">
                {movedDays !== 0 ? (
                  <>
                    <span style={{ color: deltaTone(movedDays) }}>{deltaLabel(movedDays)}</span>
                    <span className="text-[var(--i-text-faint)]">· Reality {fmtDay(base.likelyDate)}</span>
                  </>
                ) : (
                  <span className="text-[var(--i-text-faint)]">
                    {m.active ? "unchanged by this scenario" : "Reality"}
                  </span>
                )}
              </div>
              <Link
                href="/forecast"
                data-shoot="open-forecast"
                className="mt-3 block rounded-md px-3 py-2 text-center text-[11px] transition-colors"
                style={{
                  border: `1px solid ${m.active ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                  color: m.active ? "var(--i-violet)" : "var(--i-text-soft)",
                }}
              >
                See the consequence in Forecast →
              </Link>
            </div>

            <div className="px-4 py-3.5 space-y-3" style={{ borderBottom: "1px solid var(--i-border)" }}>
              <MasterRow
                label="Release load"
                value={`${composition.loadDays.toFixed(1)}d`}
                tone={m.active ? "var(--i-violet)" : undefined}
                note={
                  m.active
                    ? `Reality ${reality.loadDays.toFixed(1)}d · ${(reality.loadDays - composition.loadDays).toFixed(
                        1
                      )}d removed`
                    : `${composition.totalItems} work items across ${composition.features.length} capabilities`
                }
              />
              {composition.bypassed.length > 0 && (
                <div>
                  <div className="i-label" style={{ color: "var(--i-violet)" }}>
                    Out of this release
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {composition.bypassed.map((f) => (
                      <li key={f.id} className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-soft)]">{f.name}</span>
                        <button
                          onClick={() => setBypassed(f, false)}
                          data-shoot="master-put-back"
                          className="shrink-0 text-[10px] transition-[filter] hover:brightness-125"
                          style={{ color: "var(--i-violet)" }}
                        >
                          put back
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[9.5px] text-[var(--i-text-faint)] leading-snug">
                    Still in Reality. Nothing here is deleted.
                  </p>
                </div>
              )}
              {composition.unmappedItems > 0 && (
                <MasterRow
                  label="Coverage"
                  value={`${composition.totalItems - composition.unmappedItems}/${composition.totalItems} mapped`}
                  tone="var(--i-amber)"
                  note={`${composition.unmappedItems} work items belong to no capability yet`}
                />
              )}
            </div>

            {/* The V1 lesson, demoted to an output: sometimes the composition
                is not what decides the date, and that stays worth saying. */}
            {dom && dom.floorDays > 0.5 && (
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
                <div className="i-label" style={{ color: dom.dominated ? "var(--i-amber)" : undefined }}>
                  Can&apos;t land before
                </div>
                <div
                  className="i-readout mt-1.5 text-[13px]"
                  style={{ color: dom.dominated ? "var(--i-amber)" : "var(--i-text)" }}
                >
                  {fmtDay(new Date(startDate.getTime() + dom.floorDays * 86400000))}
                </div>
                <p className="mt-1 text-[10px] text-[var(--i-text-faint)] leading-snug">
                  {dom.dominated
                    ? `Taking capabilities out will not move this — ${dom.phrase}.`
                    : `Even with nothing left to build — ${dom.phrase}.`}
                </p>
              </div>
            )}

            {/* Inherited, never edited here. */}
            <div className="px-4 py-3.5 space-y-2.5">
              <InheritedRow
                label="Capacity"
                value={`${formatCapacity(capacity)} FTE`}
                href="/portfolio"
                owner="Portfolio"
                changed={m.scenario.capacityOverrideByScope[scope.scopeId] !== undefined}
              />
              <InheritedRow
                label="Context switch"
                value={`${m.scenario.contextSwitchCostPct ?? m.data.contextSwitchCostPct}%`}
                href="/portfolio"
                owner="Portfolio"
                changed={m.scenario.contextSwitchCostPct !== null}
              />
              <InheritedRow
                label="Open decisions"
                value={`${openGates.length}`}
                href="/decisions"
                owner="Decisions"
                changed={m.scenario.resolvedGateIds.size > 0}
              />
            </div>
          </div>
        </div>

        <div
          className="shrink-0 flex items-center gap-2 px-6 py-2.5 text-[10px] text-[var(--i-text-faint)]"
          style={{ borderTop: "1px solid var(--i-border)" }}
        >
          <span>Scope owns product shape. Timeline owns when. Portfolio owns who.</span>
          <span className="flex-1" />
          <span>Click a capability to open it · space toggles it in or out</span>
        </div>
      </div>

      <FeatureDetail
        feature={openFeature}
        onClose={() => setOpenFeatureId(null)}
        scopeName={scope.name}
        capacity={capacity}
        releaseLoadDays={composition.loadDays}
        onToggle={(out) => openFeature && setBypassed(openFeature, out)}
        onSetEstimate={(id, range) =>
          m.setScenario((prev) => ({
            ...prev,
            estimateOverrideByItemId: { ...prev.estimateOverrideByItemId, [id]: range },
          }))
        }
        onClearEstimate={(id) =>
          m.setScenario((prev) => {
            const next = { ...prev.estimateOverrideByItemId };
            delete next[id];
            return { ...prev, estimateOverrideByItemId: next };
          })
        }
      />

      <AddFeature
        open={adding}
        onClose={() => setAdding(false)}
        unmappedItems={composition.features.find((f) => f.source === "unmapped")?.items ?? []}
        capacity={capacity}
        onCreate={(draft) => {
          m.setScenario((prev) => ({ ...prev, draftFeatures: [...prev.draftFeatures, draft] }));
          setAdding(false);
          setOpenFeatureId(draft.id);
        }}
      />
    </InstrumentShell>
  );
}

// ── ONE CHANNEL ──────────────────────────────────────────────────────────
//
// Fixed geometry, variable light. The meter is RECESSED because it is a
// readout; the engage switch is RAISED because it is the one control. That
// split is the suite's rule for telling an input from an output without
// reading a label (docs/DESIGN-NORTH-STAR.md).
function FeatureChannel({
  feature,
  peakLoadDays,
  releaseLoadDays,
  capacity,
  onOpen,
  onToggle,
}: {
  feature: Feature;
  peakLoadDays: number;
  releaseLoadDays: number;
  capacity: number;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const f = feature;
  const tag = SOURCE_TAG[f.source];
  const out = f.bypassed;
  const cap = capacity > 0 ? capacity : 1;

  // Meter geometry, all derived. The fill is the expected load; the bracket
  // on the right spans the low-to-high range this could really take. Ticks
  // are a real scale in days, not decoration.
  const pct = (days: number) => Math.max(0, Math.min(100, (days / peakLoadDays) * 100));
  const fill = out ? 0 : pct(f.loadDays);
  const lowPct = pct(f.range.low / cap);
  const highPct = pct(f.range.high / cap);
  const share = releaseLoadDays > 0 && !out ? (f.loadDays / releaseLoadDays) * 100 : 0;
  const step = niceStep(peakLoadDays);
  const ticks: number[] = [];
  for (let d = step; d < peakLoadDays; d += step) ticks.push(pct(d));

  const accent =
    f.source === "unmapped" ? "var(--i-amber)" : f.source === "linear" ? "var(--i-text)" : "var(--i-violet)";
  const dashed = f.source === "hermes" || f.source === "manual";

  return (
    <div
      className="shrink-0 flex flex-col rounded-lg overflow-hidden transition-all duration-300"
      data-shoot="channel"
      data-bypassed={out ? "true" : "false"}
      style={{
        width: CHANNEL_W,
        height: CHANNEL_H,
        background: out ? "var(--i-bg)" : "var(--i-panel)",
        border: `1px ${dashed ? "dashed" : "solid"} ${
          out ? "var(--i-border)" : dashed ? "var(--i-violet)" : "var(--i-border-strong)"
        }`,
        opacity: out ? 0.6 : 1,
      }}
    >
      <button
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex-1 min-h-0 flex flex-col text-left px-3 pt-3"
        aria-label={`${f.name}, ${f.loadDays.toFixed(1)} days of load. Open detail.`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-sm px-1 py-px text-[8px] font-semibold uppercase tracking-[0.09em]"
            style={{ color: tag.tone, border: `1px solid ${tag.tone}`, opacity: 0.7 }}
            title={tag.help}
          >
            {tag.label}
          </span>
          {out && (
            <span className="text-[8px] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--i-violet)" }}>
              out
            </span>
          )}
        </div>

        <div
          className="mt-2 text-[12.5px] font-medium leading-[1.24]"
          style={{ color: out ? "var(--i-text-faint)" : "var(--i-text)", height: 31, overflow: "hidden" }}
        >
          {f.name}
        </div>

        {/* Readout sits ABOVE the meter, never over the fill -- a number you
            have to read through a gradient is not a readout. */}
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span
            className="i-readout leading-none"
            style={{ fontSize: 19, color: out ? "var(--i-text-faint)" : "var(--i-text)" }}
          >
            {f.loadDays.toFixed(1)}
            <span className="text-[10px] font-normal">d</span>
          </span>
          <span className="text-[9.5px] text-[var(--i-text-faint)]">
            {out ? "not in the release" : `${share.toFixed(0)}%`}
          </span>
        </div>

        {/* THE METER. Recessed -- a readout, never grabbable. */}
        <div className="i-meter relative mt-2 overflow-hidden" style={{ height: METER_H }}>
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute left-0 right-0"
              style={{ bottom: `${t}%`, height: 1, background: "var(--i-border)", opacity: 0.55 }}
            />
          ))}
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-500"
            style={{
              height: `${fill}%`,
              // Light falling away from the level, not a filled box: the eye
              // should land on where the level IS, not on the block below it.
              background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 26%, transparent) 0%, color-mix(in srgb, ${accent} 4%, transparent) 100%)`,
              opacity: out ? 0 : 1,
            }}
            aria-hidden
          />
          {f.source === "unmapped" && !out && (
            <div className="absolute inset-x-0 bottom-0 i-hatch" style={{ height: `${fill}%` }} aria-hidden />
          )}
          {/* The level line: where the load actually sits. */}
          <div
            className="absolute inset-x-0 transition-[bottom] duration-500"
            style={{
              bottom: `${fill}%`,
              height: 1.5,
              background: accent,
              opacity: out ? 0 : 1,
              boxShadow: out ? undefined : `0 0 10px color-mix(in srgb, ${accent} 60%, transparent)`,
            }}
            aria-hidden
          />
          {/* The range bracket: how far this could actually run. */}
          {!out && f.items.length > 0 && (
            <div
              className="absolute transition-all duration-500"
              style={{ right: 4, bottom: `${lowPct}%`, height: `${Math.max(1, highPct - lowPct)}%`, width: 5 }}
              aria-hidden
            >
              <span className="absolute inset-y-0 right-0" style={{ width: 1, background: accent, opacity: 0.5 }} />
              <span className="absolute top-0 right-0" style={{ width: 5, height: 1, background: accent, opacity: 0.5 }} />
              <span className="absolute bottom-0 right-0" style={{ width: 5, height: 1, background: accent, opacity: 0.5 }} />
            </div>
          )}
        </div>

        <div className="mt-1.5 flex items-baseline justify-between text-[9px] text-[var(--i-text-faint)]">
          <span>
            {f.items.length === 0 && f.done.length === 0
              ? "no work mapped"
              : `${f.items.length} open${f.done.length > 0 ? ` · ${f.done.length} done` : ""}`}
          </span>
          <span>{f.items.length > 0 ? `${uncertaintyLabel(f.uncertainty).toLowerCase()} certainty` : "—"}</span>
        </div>
      </button>

      {/* THE CONTROL. Raised, lit, and the only thing on the channel that
          changes the model. */}
      <button
        onClick={onToggle}
        data-shoot="engage"
        aria-pressed={!out}
        className="shrink-0 mx-3 mb-3 mt-2 rounded-md py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] transition-all duration-200"
        style={
          out
            ? {
                background: "var(--i-recess)",
                color: "var(--i-text-faint)",
                border: "1px solid var(--i-border-strong)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.5) inset",
              }
            : {
                background: "linear-gradient(180deg, var(--i-panel-raised), var(--i-panel))",
                color: "var(--i-text)",
                border: "1px solid #3f4950",
                boxShadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 6px rgba(0,0,0,0.45)",
              }
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full transition-colors duration-200"
            style={{ background: out ? "var(--i-text-faint)" : "var(--i-mint)", boxShadow: out ? undefined : "0 0 6px var(--i-mint)" }}
          />
          {out ? "Bring back" : "In release"}
        </span>
      </button>
    </div>
  );
}

// A round number of days per graduation: 4-6 ticks across the tallest meter,
// so the scale is readable rather than arbitrary.
function niceStep(peak: number): number {
  const raw = peak / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.01))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

function MasterRow({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="i-label">{label}</span>
        <span className="i-readout text-[13px]" style={{ color: tone ?? "var(--i-text)" }}>
          {value}
        </span>
      </div>
      {note && <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)] leading-snug">{note}</div>}
    </div>
  );
}

function InheritedRow({
  label,
  value,
  href,
  owner,
  changed,
}: {
  label: string;
  value: string;
  href: string;
  owner: string;
  changed: boolean;
}) {
  return (
    <Link href={href} className="flex items-baseline gap-2 group" title={`${owner} owns this`}>
      <span className="i-label group-hover:text-[var(--i-text-soft)] transition-colors">{label}</span>
      <span className="flex-1 h-px" style={{ background: "var(--i-border)" }} />
      <span className="i-readout text-[11.5px]" style={{ color: changed ? "var(--i-violet)" : "var(--i-text-soft)" }}>
        {value}
      </span>
      <span className="text-[9px] text-[var(--i-text-faint)] group-hover:text-[var(--i-text-soft)] transition-colors">
        {owner} →
      </span>
    </Link>
  );
}

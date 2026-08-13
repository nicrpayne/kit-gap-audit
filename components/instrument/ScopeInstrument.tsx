"use client";

// SCOPE — what are we actually trying to ship?
//
// THE OBJECT IS THE LOAD. One vertical column, read downward in days. Every
// slab in it is a real WorkItem, and its height is that item's exact
// contribution to the schedule (likely ÷ capacity — the simulation's own
// arithmetic, see lib/scope/load.ts). Pull a slab out and the column settles:
// everything below it rises by precisely the days that item was costing.
//
// The column is deliberately NOT the date. The date is a separate mark on the
// same axis, read from the simulation. That separation is the instrument's
// whole argument, and it is what no backlog tool tells you: cutting always
// makes the load smaller, and sometimes that buys you nothing, because a
// dependency or an open decision is what is really holding the release. When
// that happens you can see it — the column ends early and dangles above the
// date on a tether, and the amber floor in the gutter is what is actually
// setting it.
//
// OWNERSHIP. Scope owns which work is in, and the hypothetical size of that
// work. It does not own capacity (Portfolio), decisions (Decisions), the
// target date (evaluation) or the consequence analysis (Forecast) — each of
// those is shown where it bears on the load, read-only, with a door.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import { Prototype } from "@/components/instrument/Panel";
import { WorkDetail, ScopeComparison, ReleaseBoundary } from "@/components/instrument/ScopeTools";
import {
  useProject,
  EMPTY_SCENARIO,
  fmtFull,
  fmtDay,
  deltaLabel,
  deltaTone,
  type ProjectScope,
} from "@/lib/instrument/useProject";
import { composeLoad, readDominance, axisDepthDays, type Stratum } from "@/lib/scope/load";
import { formatCapacity } from "@/lib/capacity/limits";

type Tool = null | { kind: "work"; id: string } | { kind: "compare" } | { kind: "boundary" };

/** How far a slab must travel before it leaves the release. Below this the
    gesture reads as a click and selects instead — pulling scope out should
    take intent, not a twitch. */
const PULL_OUT_PX = 96;

// The stage. Three fixed lanes at any window width: the floor gutter, the
// column itself, and the names. Fixed rather than fluid because a column that
// stretches to fill a 27" display stops being an object and becomes a chart.
const GUTTER_W = 96;
const COL_LEFT = 116;
const COL_W = 330;
const LABEL_LEFT = COL_LEFT + COL_W + 20;
const STAGE_W = LABEL_LEFT + 372;
// The out-margin's width is reserved even in Reality. An empty lane is calm;
// a column that jumps sideways the first time you cut something is not.
const OUT_W = 236;

export default function ScopeInstrument() {
  const m = useProject();
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);

  const scopeNameById = useMemo(
    () => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])),
    [m.data]
  );

  const scope: ProjectScope | null = useMemo(() => {
    if (!m.data) return null;
    return m.data.scopes.find((s) => s.scopeId === scopeId) ?? m.data.scopes[0] ?? null;
  }, [m.data, scopeId]);

  const exclude = useCallback(
    (id: string) =>
      m.setScenario((prev) => {
        const next = new Set(prev.excludedItemIds);
        next.add(id);
        return { ...prev, excludedItemIds: next };
      }),
    [m]
  );

  const restore = useCallback(
    (id: string) =>
      m.setScenario((prev) => {
        const next = new Set(prev.excludedItemIds);
        next.delete(id);
        return { ...prev, excludedItemIds: next };
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
        setSelectedId(null);
      }}
      right={
        <div className="flex items-center gap-1.5">
          {(m.data?.scopes ?? []).map((s) => (
            <button
              key={s.scopeId}
              onClick={() => {
                setScopeId(s.scopeId);
                setSelectedId(null);
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

  // Reality's own composition, computed with an empty scenario — the yardstick
  // the axis is pinned to, and the thing the Comparison tool measures against.
  const reality = composeLoad(scope.items, scope.gates, scope.teamCapacity, new Set(), new Set(), {});
  const load = composeLoad(
    scope.items,
    scope.gates,
    capacity,
    m.scenario.excludedItemIds,
    m.scenario.resolvedGateIds,
    m.scenario.estimateOverrideByItemId
  );

  const toDays = (d: Date) => (d.getTime() - startDate.getTime()) / 86400000;
  const realityLandingDays = toDays(base.likelyDate);
  const landingDays = toDays(res.likelyDate);
  const movedDays = Math.round(landingDays - realityLandingDays);

  const dependencyNames = scope.dependsOnScopeIds.map((id) => scopeNameById.get(id) ?? id);
  const dom = readDominance(
    res,
    m.floorByScope?.get(scope.scopeId),
    startDate,
    scope.gates,
    m.scenario.resolvedGateIds,
    dependencyNames
  );

  const axisDepth = axisDepthDays(
    { loadDays: reality.loadDays, landingDays: realityLandingDays },
    Math.max(load.loadDays, landingDays)
  );
  const pct = (days: number) => `${Math.max(0, Math.min(100, (days / axisDepth) * 100))}%`;

  // The silhouette. Width carries uncertainty and nothing else, scaled against
  // REALITY's widest item so the shape does not quietly renormalise when the
  // least-known piece of work is the one you take out.
  const widthFrac = (s: Stratum) => 0.34 + 0.66 * Math.min(1, s.spreadDays / reality.maxSpreadDays);

  const selected = load.strata.concat(load.out).find((s) => s.item.id === selectedId) ?? null;
  const anyOut = load.out.length > 0;
  // The tether: the gap between where the load ends and where the release
  // actually lands. Only exists when something other than the backlog is
  // deciding, which is exactly when it is worth drawing.
  const tetherGap = Math.max(0, landingDays - load.loadDays);
  const openGateLabels = scope.gates.filter((g) => !m.scenario.resolvedGateIds.has(g.id)).map((g) => g.label);

  return (
    <InstrumentShell
      stateBar={strip}
      scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
      onSelectScope={(id) => {
        setScopeId(id);
        setSelectedId(null);
      }}
    >
      <div className="flex-1 min-h-0 relative overflow-hidden" style={{ background: "var(--i-void)" }}>
        {/* THE COLUMN. One stage, fixed width, so the object stays a column at
            any window size instead of stretching into a chart. Everything
            inside is positioned by DEPTH IN DAYS; the horizontal layout is
            three fixed lanes — floor gutter · column · names. */}
        <div
          className="absolute flex justify-center"
          style={{ top: 56, bottom: macrosOpen ? 236 : 132, left: 0, right: OUT_W }}
        >
          <div className="relative h-full" style={{ width: STAGE_W, maxWidth: "94%" }}>
            {/* Depth 0. Everything is measured down from here. */}
            <div className="absolute" style={{ top: 0, left: 0, right: 0 }}>
              <div className="h-px" style={{ background: "var(--i-border)", marginLeft: COL_LEFT }} />
              <span className="i-label absolute" style={{ left: 0, top: -4, width: GUTTER_W, textAlign: "right" }}>
                Today
              </span>
            </div>

            {/* THE FLOOR, in the gutter: the days no amount of cutting in this
                instrument can give back. Amber only when it is the thing
                actually setting the date. */}
            {dom && dom.floorDays > 0.5 && (
              <button
                type="button"
                data-shoot="floor"
                onClick={() => setTool({ kind: "compare" })}
                className="absolute text-left"
                style={{ left: 0, width: COL_LEFT - 10, top: 0, height: pct(dom.floorDays) }}
                aria-label={`Cannot land before ${fmtDay(new Date(startDate.getTime() + dom.floorDays * 86400000))}`}
              >
                <span
                  className="absolute inset-y-0 i-hatch"
                  style={{
                    right: 0,
                    width: 8,
                    borderRight: `1px solid ${dom.dominated ? "var(--i-amber)" : "var(--i-border-strong)"}`,
                    opacity: dom.dominated ? 1 : 0.4,
                  }}
                />
                <span
                  className="absolute text-[9px] leading-tight text-right"
                  style={{
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: GUTTER_W - 4,
                    color: dom.dominated ? "var(--i-amber)" : "var(--i-text-faint)",
                  }}
                >
                  can&apos;t land
                  <br />
                  before this
                </span>
              </button>
            )}

            {/* THE STRATA. Slab height = that item's expected days of schedule;
                slab width = how unsure we are of them. Positioned by cumulative
                depth, so pulling one out makes everything below RISE by exactly
                the days it was costing. */}
            {(() => {
              let cum = 0;
              return load.strata.map((s) => {
                const top = cum;
                cum += s.days;
                const isDrag = drag?.id === s.item.id;
                const isSel = selectedId === s.item.id;
                const h = (s.days / axisDepth) * 100;
                const slabW = COL_W * widthFrac(s);
                const placeholder =
                  s.item.estimateSource === "issue_placeholder" || s.item.estimateSource === "finding_placeholder";
                const tiny = h < 1.9;
                return (
                  <div
                    key={s.item.id}
                    className="group absolute"
                    style={{
                      top: pct(top),
                      height: pct(s.days),
                      left: 0,
                      right: 0,
                      transition: isDrag
                        ? "none"
                        : "top 300ms cubic-bezier(0.2,0,0.2,1), height 300ms cubic-bezier(0.2,0,0.2,1)",
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${s.item.label}, ${s.days.toFixed(1)} days of schedule`}
                      data-shoot="stratum"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(s.item.id);
                        }
                        if (e.key === "Backspace" || e.key === "Delete") {
                          e.preventDefault();
                          exclude(s.item.id);
                        }
                      }}
                      onPointerDown={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.setPointerCapture(e.pointerId);
                        el.dataset.x0 = String(e.clientX);
                        setDrag({ id: s.item.id, dx: 0 });
                      }}
                      onPointerMove={(e) => {
                        if (drag?.id !== s.item.id) return;
                        const startX = Number((e.currentTarget as HTMLElement).dataset.x0);
                        if (Number.isNaN(startX)) return;
                        setDrag({ id: s.item.id, dx: Math.max(0, e.clientX - startX) });
                      }}
                      onPointerUp={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        const travelled = drag?.dx ?? 0;
                        delete el.dataset.x0;
                        setDrag(null);
                        if (travelled >= PULL_OUT_PX) exclude(s.item.id);
                        else setSelectedId(s.item.id);
                      }}
                      onPointerCancel={(e) => {
                        delete (e.currentTarget as HTMLElement).dataset.x0;
                        setDrag(null);
                      }}
                      className="absolute cursor-grab active:cursor-grabbing"
                      style={{
                        left: COL_LEFT + (COL_W - slabW) / 2,
                        width: slabW,
                        top: 0,
                        bottom: 1,
                        transform: `translateX(${isDrag ? drag.dx : 0}px)`,
                        transition: isDrag ? "none" : "transform 300ms cubic-bezier(0.2,0,0.2,1)",
                        touchAction: "none",
                        background: s.overridden ? "var(--i-violet-soft)" : "rgba(243,240,230,0.075)",
                        border: `1px solid ${
                          isSel ? "var(--i-violet)" : s.overridden ? "var(--i-violet)" : "var(--i-border-strong)"
                        }`,
                        borderRadius: 2,
                        boxShadow: isDrag && drag.dx > 4 ? "0 12px 32px rgba(0,0,0,0.6)" : undefined,
                        opacity: isDrag && drag.dx >= PULL_OUT_PX ? 0.4 : 1,
                      }}
                    >
                      {placeholder && (
                        <span
                          aria-hidden
                          className="absolute inset-0 i-hatch"
                          title="No estimate — the forecast is using a deliberately wide guess"
                        />
                      )}
                    </div>

                    {/* Names live in their own lane, so a ragged silhouette
                        never makes the reading ragged too. */}
                    <div
                      className={`absolute inset-y-0 flex items-center pointer-events-none transition-opacity duration-200 ${
                        tiny && !isSel ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                      }`}
                      style={{ left: LABEL_LEFT, right: 0 }}
                    >
                      <span className="truncate text-[10.5px] leading-none">
                        <span style={{ color: isSel ? "var(--i-text)" : "var(--i-text-soft)" }}>{s.item.label}</span>
                        <span className="ml-2 text-[9.5px] text-[var(--i-text-faint)]">
                          {s.days.toFixed(1)}d
                          {s.item.kind === "inferred" && " · inferred"}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              });
            })()}

            {/* SERIAL DELAY. Part of the load, but capacity cannot divide it and
                Scope cannot cut it — Decisions owns this one. Full column width
                because its width is not on the uncertainty scale: it is a
                different kind of thing, and should not be read as one slab. */}
            {load.decisionDays > 0 && (
              <div
                className="absolute"
                style={{
                  top: pct(load.workDays),
                  height: pct(load.decisionDays),
                  left: 0,
                  right: 0,
                  transition: "top 300ms cubic-bezier(0.2,0,0.2,1), height 300ms cubic-bezier(0.2,0,0.2,1)",
                }}
              >
                <Link
                  href="/decisions"
                  data-shoot="decisions-band"
                  className="absolute i-hatch"
                  style={{
                    left: COL_LEFT,
                    width: COL_W,
                    top: 0,
                    bottom: 1,
                    border: "1px solid var(--i-amber)",
                    borderRadius: 2,
                    opacity: 0.85,
                  }}
                  title="Decisions owns this — open the Decisions instrument"
                />
                <div
                  className="absolute inset-y-0 flex items-center pointer-events-none"
                  style={{ left: LABEL_LEFT, right: 0 }}
                >
                  <span className="min-w-0 text-[10.5px]">
                    <span style={{ color: "var(--i-amber)" }}>waiting on decisions</span>
                    <span className="ml-2 text-[9.5px] text-[var(--i-text-faint)]">
                      {load.decisionDays.toFixed(1)}d · Decisions owns these
                    </span>
                    <span className="mt-1 block text-[9.5px] leading-snug text-[var(--i-text-faint)]">
                      {openGateLabels.join(" · ")}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* THE TETHER. Drawn only when the load ends before the release
                does — the visible form of "cutting more here changes nothing." */}
            {tetherGap > 0.35 && (
              <div
                className="absolute pointer-events-none"
                style={{
                  top: pct(load.loadDays),
                  height: pct(tetherGap),
                  left: COL_LEFT + COL_W / 2,
                  transition: "top 300ms cubic-bezier(0.2,0,0.2,1), height 300ms cubic-bezier(0.2,0,0.2,1)",
                }}
              >
                <div
                  className="h-full i-tether"
                  style={{
                    width: 1,
                    background: `repeating-linear-gradient(180deg, ${
                      dom?.dominated ? "var(--i-amber)" : "var(--i-text-faint)"
                    } 0 3px, transparent 3px 7px)`,
                  }}
                />
                {dom?.dominated && tetherGap > 1.5 && (
                  <span
                    className="absolute text-[9.5px] whitespace-nowrap"
                    style={{ left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--i-amber)" }}
                  >
                    {tetherGap.toFixed(1)}d of slack — the load is not what sets this date
                  </span>
                )}
              </div>
            )}

            {/* WHERE IT LANDS. Output only — nothing here is grabbable. */}
            <div
              className="absolute"
              style={{
                top: pct(landingDays),
                left: 0,
                right: 0,
                transition: "top 340ms cubic-bezier(0.2,0,0.2,1)",
              }}
            >
              <div
                className="h-px"
                style={{
                  marginLeft: COL_LEFT,
                  background: movedDays !== 0 ? "var(--i-violet)" : "var(--i-text-soft)",
                  opacity: 0.8,
                }}
              />
              <button
                type="button"
                data-shoot="landing"
                onClick={() => setTool({ kind: "compare" })}
                className="absolute flex items-baseline gap-3 text-left whitespace-nowrap"
                style={{ left: COL_LEFT, top: 10 }}
              >
                <span
                  key={fmtFull(res.likelyDate)}
                  className="i-readout i-fadeup leading-none"
                  style={{
                    fontSize: 32,
                    letterSpacing: "-0.035em",
                    color: movedDays !== 0 ? "var(--i-violet)" : "var(--i-text)",
                    transition: "color 300ms ease",
                  }}
                >
                  {fmtFull(res.likelyDate)}
                </span>
                <span className="i-label">{scope.name} lands</span>
                {movedDays !== 0 && (
                  <span className="i-readout text-[12px]" style={{ color: deltaTone(movedDays) }}>
                    {deltaLabel(movedDays)}
                  </span>
                )}
              </button>
            </div>

            {/* Reality's own landing, once a hypothetical exists. A ghost
                reference, never a competing headline. */}
            {m.active && Math.abs(realityLandingDays - landingDays) > 0.5 && (
              <div
                className="absolute pointer-events-none"
                style={{ top: pct(realityLandingDays), left: COL_LEFT, right: 0 }}
              >
                <div
                  className="h-px"
                  style={{ background: "repeating-linear-gradient(90deg, var(--i-reality) 0 4px, transparent 4px 9px)" }}
                />
                <span className="absolute text-[9.5px]" style={{ right: 0, top: 5, color: "var(--i-reality)" }}>
                  Reality {fmtDay(base.likelyDate)}
                </span>
              </div>
            )}
          </div>
        </div>
        {/* OUT IN THIS SCENARIO. Empty in Reality, so Reality is calm. Slabs
            keep their height here: what you set down still has a weight. */}
        {anyOut && (
          <div
            className="absolute overflow-y-auto"
            style={{
              top: 66,
              bottom: macrosOpen ? 178 : 74,
              right: 0,
              width: OUT_W,
              borderLeft: "1px solid var(--i-border)",
              background: "var(--i-bg)",
            }}
            data-shoot="out-margin"
          >
            <div className="px-3.5 pt-3 pb-2">
              <div className="i-label" style={{ color: "var(--i-violet)" }}>
                Out in this Scenario
              </div>
              <div className="mt-1 text-[10px] text-[var(--i-text-faint)] leading-snug">
                Still in Reality. Nothing here is deleted.
              </div>
            </div>
            <div className="px-3.5 pb-4 space-y-1.5">
              {load.out.map((s) => (
                <div key={s.item.id} className="group i-park">
                  <div
                    className="rounded-sm px-2 py-1.5"
                    style={{
                      minHeight: Math.max(24, (s.days / axisDepth) * 520),
                      background: "var(--i-violet-soft)",
                      border: "1px dashed var(--i-violet)",
                    }}
                  >
                    <div className="text-[10px] leading-snug text-[var(--i-text-soft)] line-clamp-3">
                      {s.item.label}
                    </div>
                    <div className="mt-1 text-[9.5px] text-[var(--i-violet)]">
                      gave back {s.days.toFixed(1)}d of load
                    </div>
                  </div>
                  <button
                    onClick={() => restore(s.item.id)}
                    data-shoot="put-back"
                    className="mt-1 w-full rounded px-2 py-1 text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                    style={{ border: "1px solid var(--i-border-strong)" }}
                  >
                    Put back in Scenario
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* What the cut actually bought, stated in words as well as geometry.
            Colour is never the only carrier of this. */}
        {m.active && (
          <div
            className="absolute text-[10.5px] leading-snug max-w-[380px]"
            style={{ left: 24, bottom: macrosOpen ? 190 : 88, color: "var(--i-text-faint)" }}
            data-shoot="verdict"
          >
            {movedDays === 0 ? (
              <>
                Load is down {(reality.loadDays - load.loadDays).toFixed(1)}d, but{" "}
                <strong style={{ color: "var(--i-amber)" }}>{scope.name} lands on the same day</strong>
                {dom && dom.phrase && <> — {dom.phrase}, not the backlog</>}.
              </>
            ) : (
              <>
                Load is down {(reality.loadDays - load.loadDays).toFixed(1)}d and{" "}
                <strong style={{ color: "var(--i-mint)" }}>{scope.name} lands {deltaLabel(movedDays)}</strong>
                {dom && dom.headroomDays > 0.5 && <> — {dom.headroomDays.toFixed(0)}d of cutting still available before other constraints take over</>}.
              </>
            )}
          </div>
        )}

        {/* THE MACRO STRIP. Closed in Reality. Every readout here is either a
            real lever or a door to the instrument that owns it. */}
        <div className="absolute bottom-0 left-0 right-0">
          {macrosOpen && (
            <div
              className="px-5 py-3.5 flex items-start gap-8 flex-wrap"
              style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
              data-shoot="macros"
            >
              <div className="min-w-[128px]">
                <div className="i-label mb-2">In this release</div>
                <div className="flex items-baseline gap-2">
                  <span className="i-readout text-[15px] text-[var(--i-text)]">
                    {load.strata.length}/{scope.items.length}
                  </span>
                  <span className="text-[10px] text-[var(--i-text-faint)]">items</span>
                </div>
                <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">
                  {load.out.length > 0 ? `${load.out.length} out in this Scenario` : "everything in"}
                </div>
              </div>

              <div className="min-w-[128px]">
                <div className="i-label mb-2">Load</div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="i-readout text-[15px]"
                    style={{ color: m.active ? "var(--i-violet)" : "var(--i-text)" }}
                  >
                    {load.loadDays.toFixed(1)}d
                  </span>
                  {m.active && (
                    <span className="text-[10px] text-[var(--i-text-faint)]">
                      Reality {reality.loadDays.toFixed(1)}d
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">
                  {load.workDays.toFixed(1)}d work + {load.decisionDays.toFixed(0)}d decisions
                </div>
              </div>

              {/* Displayed, never edited: this is the divisor in the number
                  above, and Portfolio owns it. */}
              <div className="min-w-[128px]" data-shoot="macro-capacity">
                <div className="i-label mb-2">Divided by</div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="i-readout text-[15px]"
                    style={{
                      color:
                        m.scenario.capacityOverrideByScope[scope.scopeId] !== undefined
                          ? "var(--i-violet)"
                          : "var(--i-text)",
                    }}
                  >
                    {formatCapacity(capacity)} FTE
                  </span>
                </div>
                <Link
                  href="/portfolio"
                  className="mt-1 block text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                >
                  Portfolio owns people →
                </Link>
              </div>

              <div className="min-w-[128px]">
                <div className="i-label mb-2">Can&apos;t land before</div>
                <div className="i-readout text-[15px]" style={{ color: dom?.dominated ? "var(--i-amber)" : "var(--i-text)" }}>
                  {dom && dom.floorDays > 0.5 ? fmtDay(new Date(startDate.getTime() + dom.floorDays * 86400000)) : "—"}
                </div>
                <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">
                  {dom && dom.causes.length > 0 ? dom.causes.map((c) => c.label).join(", ") : "nothing outside the backlog"}
                </div>
              </div>

              <div className="flex-1" />
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setTool({ kind: "compare" })}
                    data-shoot="open-compare"
                    className="rounded-md px-3 py-2 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] transition-colors"
                    style={{ border: "1px solid var(--i-border-strong)" }}
                  >
                    Compare to Reality
                  </button>
                  <Link
                    href="/forecast"
                    data-shoot="open-forecast"
                    className="rounded-md px-3 py-2 text-[11px] transition-colors"
                    style={{
                      border: `1px solid ${m.active ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                      color: m.active ? "var(--i-violet)" : "var(--i-text-soft)",
                    }}
                  >
                    See it in Forecast →
                  </Link>
                </div>
                <button
                  onClick={() => setTool({ kind: "boundary" })}
                  data-shoot="open-boundary"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                >
                  <Prototype note="Release boundaries are designed, not modelled. Opening this changes nothing in the simulation." />
                  What&apos;s in Beta? →
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 pb-3 pt-2">
            <button
              onClick={() => setMacrosOpen((v) => !v)}
              data-shoot="toggle-macros"
              className="rounded-full px-3.5 py-1.5 text-[10.5px] transition-colors"
              style={{
                background: macrosOpen ? "var(--i-panel-raised)" : "transparent",
                color: "var(--i-text-faint)",
                border: "1px solid var(--i-border)",
              }}
            >
              {macrosOpen ? "Hide what ships" : "Play with what ships"}
            </button>
          </div>
        </div>

        {/* The only permanent instruction on the canvas, and it retires the
            moment it has been obeyed once. */}
        {!m.active && !macrosOpen && (
          <div
            className="absolute text-[10px] text-[var(--i-text-faint)] pointer-events-none"
            style={{ left: 24, bottom: 88 }}
          >
            Pull a piece of work to the right to take it out of the release.
          </div>
        )}
      </div>

      <WorkDetail
        open={tool?.kind === "work"}
        onClose={() => setTool(null)}
        stratum={tool?.kind === "work" ? load.strata.concat(load.out).find((s) => s.item.id === tool.id) ?? null : null}
        scopeName={scope.name}
        capacity={capacity}
        loadDays={load.loadDays}
        onExclude={exclude}
        onRestore={restore}
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

      <ScopeComparison
        open={tool?.kind === "compare"}
        onClose={() => setTool(null)}
        scopeName={scope.name}
        reality={reality}
        scenario={load}
        realityResult={base}
        scenarioResult={res}
        startDate={startDate}
        dominance={dom}
        active={m.active}
        onRestore={restore}
      />

      <ReleaseBoundary
        open={tool?.kind === "boundary"}
        onClose={() => setTool(null)}
        scopeName={scope.name}
        strata={load.strata}
        axisDepth={axisDepth}
      />

      {/* Selecting a slab answers the small question inline; the tool answers
          the whole one. Depth on demand, one step at a time. */}
      {selected && !tool && (
        <div
          className="absolute z-10 rounded-lg px-4 py-3 flex items-center gap-4"
          style={{
            left: 24,
            bottom: macrosOpen ? 190 : 88,
            background: "var(--i-panel)",
            border: "1px solid var(--i-border-strong)",
            boxShadow: "0 16px 44px rgba(0,0,0,0.5)",
          }}
          data-shoot="selection"
        >
          <div className="min-w-0 max-w-[320px]">
            <div className="i-label">{selected.item.kind === "ticket" ? selected.item.id : "Inferred work"}</div>
            <div className="mt-1 text-[12px] text-[var(--i-text)] truncate">{selected.item.label}</div>
            <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">
              {selected.range.low}–{selected.range.high}d · {selected.days.toFixed(1)}d of schedule ·{" "}
              {((selected.days / Math.max(0.001, load.loadDays)) * 100).toFixed(0)}% of the load
            </div>
          </div>
          <button
            onClick={() => setTool({ kind: "work", id: selected.item.id })}
            className="rounded-md px-3 py-2 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] transition-colors"
            style={{ border: "1px solid var(--i-border-strong)" }}
          >
            Open detail
          </button>
          {selected.excluded ? (
            <button
              onClick={() => restore(selected.item.id)}
              className="rounded-md px-3 py-2 text-[11px] transition-colors"
              style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
            >
              Put back in Scenario
            </button>
          ) : (
            <button
              onClick={() => exclude(selected.item.id)}
              data-shoot="exclude-selected"
              className="rounded-md px-3 py-2 text-[11px] transition-colors"
              style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
            >
              Take out of Scenario
            </button>
          )}
          <button
            onClick={() => setSelectedId(null)}
            aria-label="Clear selection"
            className="h-7 w-7 rounded flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
          >
            ✕
          </button>
        </div>
      )}
    </InstrumentShell>
  );
}

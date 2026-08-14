"use client";

// SCOPE COMPOSER — the accepted reference mockup, executed over the real model.
//
// The composition is the reference's, element for element:
//
//   header      SCOPE COMPOSER + a master readout strip (landing date, release
//               load, scenario impact) that reads from across the room
//   left        IN THIS RELEASE — a 4-across rack of capability modules, each
//               with sigil, load, derived distribution trace and certainty hue
//   right       OUT OF THIS RELEASE — a subordinate column: parked modules and
//               one permanent drop slot that wakes with the pointer's approach
//   below       DECISION CONSTRAINTS — the amber structural strip of real open
//               gates, ending in the measured FLOOR the release cannot cut
//               through
//   bottom      inherited Portfolio inputs (read-only, with doors), the
//               scenario summary, and scenario controls — including the
//               mockup's own honest "Commit to Reality (not available)"
//   far right   FEATURE DETAIL, summoned as a docked plugin panel
//
// Everything on screen is derived: traces from summed three-point ranges,
// hues from certainty, the floor from a real empty-backlog simulation, the
// constraint strip from live gates. Semantics, engine paths and drag
// mechanics are unchanged from the accepted V3/material passes.

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, MotionConfig, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import FeatureDetail, { AddFeature } from "@/components/instrument/FeatureDetail";
import CapabilityTile, { Seat, materialOf, MODULE_H } from "@/components/instrument/CapabilityTile";
import {
  useProject,
  EMPTY_SCENARIO,
  fmtFull,
  fmtDay,
  deltaLabel,
  deltaTone,
  type ProjectScope,
} from "@/lib/instrument/useProject";
import { composeFeatures, type Feature } from "@/lib/scope/features";
import { readDominance } from "@/lib/scope/constraint";
import { formatCapacity } from "@/lib/capacity/limits";

const BAY_IN = "bay-in";
const BAY_OUT = "bay-out";
const FRAME_BG = "#0c1013";
// THE DECK PACKS ITSELF. A fixed column count leaves a release of six modules
// sitting in a ten-slot grid — four empty bays reading as dead space rather
// than as an instrument. So the column count is chosen per release, from the
// candidates that keep a module recognisably module-shaped: fewest rows first,
// then fewest empty bays, then the widest modules.
function packDeck(cellCount: number): { cols: number; rows: number } {
  // A small release goes in one taller row rather than filling a second row
  // with nothing: four modules over four empty bays is not a composition.
  if (cellCount <= 6) return { cols: Math.max(4, cellCount), rows: 1 };
  let best = { cols: 5, rows: 3, waste: Infinity };
  for (const cols of [4, 5, 6]) {
    const rows = Math.ceil(cellCount / cols);
    const waste = cols * rows - cellCount;
    if (rows < best.rows || (rows === best.rows && waste < best.waste)) best = { cols, rows, waste };
  }
  return { cols: best.cols, rows: best.rows };
}

// Rows divide the deck instead of being stamped out at a fixed height, so a
// release always fits its rack exactly and never clips a module. Only past two
// rows does the deck become a scrolling surface with fixed-size bays.
function rowGeometry(rows: number): React.CSSProperties {
  if (rows === 1)
    return { height: "100%", gridTemplateRows: `minmax(${MODULE_H}px, ${MODULE_H + 186}px)`, alignContent: "center" };
  if (rows === 2) return { height: "100%", gridTemplateRows: `repeat(2, minmax(${MODULE_H - 40}px, 1fr))` };
  return { minHeight: "100%", gridAutoRows: `${MODULE_H}px`, alignContent: "start" };
}

/** Where a module will land in a load-ordered rack — the seat that opens for
    it opens in the true place, not a flattering one. */
function seatIndexFor(list: Feature[], f: Feature): number {
  return list.filter((x) => x.loadDays > f.loadDays || (x.loadDays === f.loadDays && x.name.localeCompare(f.name) < 0))
    .length;
}

export default function ScopeInstrument() {
  const m = useProject();
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [openFeatureId, setOpenFeatureId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<Feature | null>(null);
  const [dragSize, setDragSize] = useState<{ w: number; h: number }>({ w: 250, h: MODULE_H });
  const [over, setOver] = useState<string | null>(null);

  // The out column's waking signal: 0 at rest, 1 with the pointer at its edge.
  // Continuous, from real pointer geometry — approach, not hover.
  const shelfPull = useMotionValue(0);
  // Restrained perspective from pointer velocity: the carried module leans
  // into its own motion by a couple of degrees at most.
  const tilt = useMotionValue(0);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const lastDX = useRef(0);
  const shelfEl = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const scopeNameById = useMemo(
    () => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])),
    [m.data]
  );
  const scope: ProjectScope | null = useMemo(() => {
    if (!m.data) return null;
    return m.data.scopes.find((s) => s.scopeId === scopeId) ?? m.data.scopes[0] ?? null;
  }, [m.data, scopeId]);

  // Unchanged from V3 — the model is frozen. Both halves of the truth are
  // written together so they can never disagree.
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
    m.scenario.draftFeatures,
    m.scenario.acceptedCandidateIds
  );
  const reality = composeFeatures(scope.items, scope.completedWork, scope.teamCapacity, new Set(), {}, []);

  const movedDays = Math.round((res.likelyDate.getTime() - base.likelyDate.getTime()) / 86400000);
  const dom = readDominance(
    res,
    m.floorByScope?.get(scope.scopeId),
    startDate,
    scope.gates,
    m.scenario.resolvedGateIds,
    scope.dependsOnScopeIds.map((id) => scopeNameById.get(id) ?? id)
  );

  const engaged = composition.features.filter((f) => !f.bypassed);
  const shareOf = (f: Feature) => (composition.loadDays > 0 ? f.loadDays / composition.loadDays : 0);
  const realityShareOf = (f: Feature) => {
    const r = reality.features.find((x) => x.id === f.id);
    return r && reality.loadDays > 0 ? r.loadDays / reality.loadDays : 0;
  };
  // The trace yardstick: the widest effort-day spread across the release.
  const maxSpread = Math.max(0.001, ...composition.features.map((f) => f.range.high - f.range.low));

  const openFeature = composition.features.find((f) => f.id === openFeatureId) ?? null;
  const openGates = scope.gates.filter((g) => !m.scenario.resolvedGateIds.has(g.id));
  const effortRemoved = reality.loadDays - composition.loadDays;

  const carryingSeated = !!dragging && !dragging.bypassed;
  const carryingParked = !!dragging && dragging.bypassed;
  const acquiringShelf = carryingSeated && over === BAY_OUT;
  const acquiringBay = carryingParked && over === BAY_IN;

  const onDragStart = (e: DragStartEvent) => {
    const f = composition.features.find((x) => x.id === e.active.id);
    setDragging(f ?? null);
    // The panel is docked over the destination. Picking something up is a
    // statement that you are done reading about it.
    setOpenFeatureId(null);
    const r = e.active.rect.current.initial;
    if (r) setDragSize({ w: r.width, h: r.height });
    const ev = e.activatorEvent as PointerEvent;
    dragOrigin.current = { x: ev?.clientX ?? 0, y: ev?.clientY ?? 0 };
    lastDX.current = 0;
  };
  const onDragMove = (e: DragMoveEvent) => {
    tilt.set(Math.max(-2.2, Math.min(2.2, (e.delta.x - lastDX.current) * 0.3)));
    lastDX.current = e.delta.x;
    if (!dragging || dragging.bypassed) return;
    const rect = shelfEl.current?.getBoundingClientRect();
    if (!rect) return;
    const px = dragOrigin.current.x + e.delta.x;
    const d = rect.left - px;
    shelfPull.set(d <= 0 ? 1 : Math.max(0, 1 - d / 320));
  };
  const endDrag = () => {
    setDragging(null);
    setOver(null);
    shelfPull.set(0);
    tilt.set(0);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const f = composition.features.find((x) => x.id === e.active.id);
    const target = e.over?.id;
    endDrag();
    if (!f || !target) return;
    if (target === BAY_OUT && !f.bypassed) setBypassed(f, true);
    if (target === BAY_IN && f.bypassed) setBypassed(f, false);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(composition.features, active.id)}.`,
    onDragOver: ({ over: o }) =>
      o?.id === BAY_OUT ? "Over: out of this release." : o?.id === BAY_IN ? "Over: in this release." : "Not over a surface.",
    onDragEnd: ({ active, over: o }) =>
      o?.id === BAY_OUT
        ? `${nameOf(composition.features, active.id)} taken out of this release.`
        : o?.id === BAY_IN
          ? `${nameOf(composition.features, active.id)} put back in this release.`
          : `${nameOf(composition.features, active.id)} returned to where it was.`,
    onDragCancel: ({ active }) => `Cancelled. ${nameOf(composition.features, active.id)} returned.`,
  };

  return (
    <InstrumentShell
      stateBar={strip}
      scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}
      onSelectScope={(id) => {
        setScopeId(id);
        setOpenFeatureId(null);
      }}
    >
      <MotionConfig reducedMotion="user">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          accessibility={{ announcements }}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragOver={(e) => setOver((e.over?.id as string) ?? null)}
          onDragEnd={onDragEnd}
          onDragCancel={endDrag}
        >
          <div className="flex-1 min-h-0 overflow-hidden p-3" style={{ background: "var(--i-void)" }}>
            {/* THE FACEPLATE — one framed instrument, not a page of panels. */}
            <div
              className="h-full flex flex-col rounded-2xl overflow-hidden"
              style={{ background: FRAME_BG, border: "1px solid var(--i-border)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}
            >
              {/* ── HEADER: title + master readout ─────────────────────── */}
              <div className="shrink-0 flex items-center gap-6 px-6 pt-3.5 pb-3">
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-semibold uppercase"
                    style={{ letterSpacing: "0.3em", color: "var(--i-violet)" }}
                  >
                    Scope Composer
                  </div>
                  <div className="mt-1 text-[10.5px] text-[var(--i-text-faint)]">
                    Compose what ships. Pull capabilities out to explore the impact.
                  </div>
                </div>
                <div className="flex-1" />
                <div
                  data-shoot="master"
                  className="flex items-stretch rounded-xl overflow-hidden"
                  style={{ background: "#11161a", border: "1px solid var(--i-border)" }}
                >
                  <MasterStat
                    label={`${scope.name} lands`}
                    value={
                      <motion.span
                        key={fmtFull(res.likelyDate)}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.42, ease: "easeOut" }}
                        className="inline-block i-readout"
                        style={{ color: movedDays !== 0 ? "var(--i-violet)" : "var(--i-text)" }}
                      >
                        {fmtFull(res.likelyDate)}
                      </motion.span>
                    }
                    caption={`best ${fmtDay(res.earliestDate)} · worst ${fmtDay(res.latestDate)}`}
                  />
                  <MasterStat
                    label="Release load"
                    value={
                      <motion.span
                        key={composition.loadDays.toFixed(1)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.26, delay: 0.24 }}
                        className="inline-block i-readout"
                        style={{ color: m.active ? "var(--i-violet)" : "var(--i-text)" }}
                      >
                        {composition.loadDays.toFixed(1)}d
                      </motion.span>
                    }
                    caption={
                      m.active
                        ? `Reality ${reality.loadDays.toFixed(1)}d`
                        : `at ${formatCapacity(capacity)} FTE`
                    }
                  />
                  <MasterStat
                    label="Scenario impact"
                    value={
                      <motion.span
                        key={`${movedDays}-${effortRemoved.toFixed(1)}-${m.active}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, delay: 0.5 }}
                        className="inline-block i-readout"
                        style={{
                          color:
                            movedDays !== 0
                              ? deltaTone(movedDays)
                              : m.active
                                ? "var(--i-text-soft)"
                                : "var(--i-text-faint)",
                        }}
                      >
                        {movedDays !== 0 ? deltaLabel(movedDays) : m.active ? "held" : "—"}
                      </motion.span>
                    }
                    caption={
                      carryingSeated && dragging
                        ? `setting down removes ${(dragging.effortDays / (capacity > 0 ? capacity : 1)).toFixed(1)}d of load`
                        : m.active
                          ? movedDays === 0 && dom?.dominated
                            ? dom.phrase
                            : `${effortRemoved.toFixed(1)}d of load removed`
                          : "no scenario"
                    }
                    captionTone={carryingSeated ? "var(--i-violet)" : undefined}
                  />
                </div>
              </div>

              {/* ── MAIN: the deck, then the strata it rests on ─────────── */}
              <div className="flex-1 min-h-0 flex flex-col gap-3.5 px-5 pb-3.5">
                <div className="flex-1 min-h-0 flex gap-3.5">
                  <ReleaseRack
                    engaged={engaged}
                    dragging={dragging}
                    shareOf={shareOf}
                    maxSpread={maxSpread}
                    offeringSeat={carryingParked}
                    seatArmed={over === BAY_IN}
                    onOpen={setOpenFeatureId}
                    onAdd={() => setAdding(true)}
                    scopeName={scope.name}
                    unmappedItems={composition.unmappedItems}
                    totalItems={composition.totalItems}
                    deckSize={composition.features.length}
                  />

                  {/* The destination is subordinate: it flanks the deck only,
                      and stops where the deck stops. */}
                  <OutColumn
                    shelfEl={shelfEl}
                    features={composition.bypassed}
                    shareOf={realityShareOf}
                    maxSpread={maxSpread}
                    dragging={dragging}
                    pull={shelfPull}
                    armed={acquiringShelf}
                    onOpen={setOpenFeatureId}
                  />
                </div>

                <ConstraintStrip gates={openGates} dominance={dom} startDate={startDate} />

                <div className="shrink-0 grid grid-cols-4 gap-3.5">
                  <PortfolioModule
                    label="Capacity"
                    big={`${formatCapacity(capacity)} FTE`}
                    changed={m.scenario.capacityOverrideByScope[scope.scopeId] !== undefined}
                    caption={
                      scope.capacitySource === "explicit"
                        ? "set by hand in Portfolio"
                        : scope.capacitySource === "allocations"
                          ? "from named allocations"
                          : "inferred from assignees"
                    }
                    fill={Math.min(1, capacity / Math.max(1, m.data.people.filter((p) => p.active).reduce((s, p) => s + p.fte, 0)))}
                    fillNote={`of ${m.data.people.filter((p) => p.active).reduce((s, p) => s + p.fte, 0).toFixed(1)} FTE in the portfolio`}
                  />
                  <PortfolioModule
                    label="Context switch"
                    big={`${m.scenario.contextSwitchCostPct ?? m.data.contextSwitchCostPct}%`}
                    changed={m.scenario.contextSwitchCostPct !== null}
                    caption="per additional scope"
                    fill={Math.min(1, (m.scenario.contextSwitchCostPct ?? m.data.contextSwitchCostPct) / 60)}
                    fillNote="capacity lost when people split"
                  />
                  <ScenarioSummary
                    included={engaged.length}
                    out={composition.bypassed.length}
                    loadRemoved={effortRemoved}
                    movedDays={movedDays}
                    active={m.active}
                  />
                  <ScenarioControls
                    active={m.active}
                    onDiscard={() => {
                      m.setScenario(EMPTY_SCENARIO);
                      setOpenFeatureId(null);
                    }}
                  />
                </div>
              </div>

              {/* ── FOOTER ─────────────────────────────────────────────── */}
              <div
                className="shrink-0 flex items-center gap-2 px-5 py-2 text-[9.5px] text-[var(--i-text-faint)]"
                style={{ borderTop: "1px solid var(--i-border)" }}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: m.active ? "var(--i-violet)" : "var(--i-mint)" }}
                />
                <span>
                  {m.active ? "Scenario active" : "Reality"} · {scope.name} · {formatCapacity(capacity)} FTE
                </span>
                <span className="flex-1" />
                <span>Scope owns product shape. Timeline owns when. Portfolio owns who.</span>
              </div>
            </div>
          </div>

          {/* THE HAND — lift, restrained velocity lean, straighten on acquire. */}
          <DragOverlay dropAnimation={{ duration: 240, easing: "cubic-bezier(0.25, 0, 0.2, 1)" }}>
            {dragging && (
              <motion.div
                initial={{ scale: 1, rotate: 0, y: 0 }}
                animate={
                  acquiringShelf
                    ? { scale: 1.0, rotate: 0, y: 3 }
                    : acquiringBay
                      ? { scale: 1.0, rotate: 0, y: -2 }
                      : { scale: 1.025, rotate: -0.6, y: 0 }
                }
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                style={{ cursor: "grabbing", width: dragSize.w, height: dragSize.h }}
              >
                <VelocityLean tilt={tilt} straight={acquiringShelf || acquiringBay}>
                  <CapabilityTile
                    feature={dragging}
                    share={dragging.bypassed ? realityShareOf(dragging) : shareOf(dragging)}
                    material={acquiringBay ? "seated" : materialOf(dragging)}
                    maxSpread={maxSpread}
                    compact={dragging.bypassed && !acquiringBay}
                    lifted
                  />
                </VelocityLean>
              </motion.div>
            )}
          </DragOverlay>
        </DndContext>
      </MotionConfig>

      <FeatureDetail
        feature={openFeature}
        onClose={() => setOpenFeatureId(null)}
        scopeName={scope.name}
        capacity={capacity}
        releaseLoadDays={composition.loadDays}
        onToggle={(out) => openFeature && setBypassed(openFeature, out)}
        onAccept={(id) =>
          m.setScenario((prev) => {
            const next = new Set(prev.acceptedCandidateIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { ...prev, acceptedCandidateIds: next };
          })
        }
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

function nameOf(features: Feature[], id: string | number) {
  return features.find((f) => f.id === id)?.name ?? "capability";
}

/** The carried module leans into its own horizontal motion — a couple of
    degrees at most, spring-smoothed, straightening on acquisition. */
function VelocityLean({
  tilt,
  straight,
  children,
}: {
  tilt: MotionValue<number>;
  straight: boolean;
  children: React.ReactNode;
}) {
  const lean = useSpring(tilt, { stiffness: 300, damping: 28 });
  const rotate = useTransform(lean, (v) => (straight ? 0 : v));
  return (
    <motion.div className="relative w-full h-full" style={{ rotate }}>
      {children}
    </motion.div>
  );
}

function MasterStat({
  label,
  value,
  caption,
  captionTone,
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
  captionTone?: string;
}) {
  return (
    <div className="px-6 py-3" style={{ borderLeft: "1px solid var(--i-border)" }}>
      <div className="i-label">{label}</div>
      <div className="mt-1.5 text-[25px] leading-none">{value}</div>
      <div className="mt-1.5 text-[9.5px]" style={{ color: captionTone ?? "var(--i-text-faint)" }}>
        {caption}
      </div>
    </div>
  );
}

// ── THE RACK ─────────────────────────────────────────────────────────────

function SeatedModule({
  feature,
  share,
  maxSpread,
  isDragging,
  compact,
  onOpen,
}: {
  feature: Feature;
  share: number;
  maxSpread: number;
  isDragging: boolean;
  compact?: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: feature.id });
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { delay: 0.16, duration: 0.26 } }}
      transition={{ type: "spring", stiffness: 330, damping: 33 }}
      className="relative w-full"
      style={compact ? { height: 150 } : { height: "100%" }}
    >
      <Seat />
      {!isDragging && (
        <CapabilityTile
          feature={feature}
          share={share}
          material={materialOf(feature)}
          maxSpread={maxSpread}
          compact={compact}
          onOpen={onOpen}
          setNodeRef={setNodeRef}
          dragHandleProps={{ ...listeners, ...attributes }}
        />
      )}
    </motion.div>
  );
}

function OfferedSeat({ armed, tone }: { armed: boolean; tone: string }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative w-full h-full"
      data-shoot="offered-seat"
    >
      <Seat armed={armed} tone={tone} />
    </motion.div>
  );
}

function ReleaseRack({
  engaged,
  dragging,
  shareOf,
  maxSpread,
  offeringSeat,
  seatArmed,
  onOpen,
  onAdd,
  scopeName,
  unmappedItems,
  totalItems,
  deckSize,
}: {
  engaged: Feature[];
  dragging: Feature | null;
  shareOf: (f: Feature) => number;
  maxSpread: number;
  offeringSeat: boolean;
  seatArmed: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  scopeName: string;
  unmappedItems: number;
  totalItems: number;
  /** Every capability in this release, seated or not — the chassis' size. */
  deckSize: number;
}) {
  const { setNodeRef } = useDroppable({ id: BAY_IN });
  const insertionAt = offeringSeat && dragging ? seatIndexFor(engaged, dragging) : -1;

  const cells: React.ReactNode[] = engaged.map((f) => (
    <SeatedModule
      key={f.id}
      feature={f}
      share={shareOf(f)}
      maxSpread={maxSpread}
      isDragging={dragging?.id === f.id}
      onOpen={() => onOpen(f.id)}
    />
  ));
  if (insertionAt >= 0 && dragging) {
    cells.splice(insertionAt, 0, <OfferedSeat key="__offered" armed={seatArmed} tone="var(--i-text)" />);
  }

  // Pack to the deck rather than to a fixed module height: the rows divide the
  // rack, so two rows always fit and modules take whatever height is going.
  // The deck is sized for every capability this release HAS, not just the ones
  // currently seated — so taking one out leaves a seat behind instead of
  // resizing the whole chassis. Geometry is a property of the release.
  const { cols, rows } = packDeck(deckSize + 1);
  // Whatever the packing cannot fill stays as bare seats. An empty recess is
  // already the surface's word for "a module could sit here" — spelling it out
  // as one wide labelled rail would just be negative space with a caption.
  const spare = Math.max(0, cols * rows - (cells.length + 1));

  return (
    <section
      ref={setNodeRef}
      data-shoot="bay-in"
      className="relative flex-1 min-h-0 rounded-xl"
      style={{
        border: "1px solid var(--i-border)",
        background: "linear-gradient(180deg, #10151a 0%, #0d1115 100%)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.035) inset",
      }}
    >
      <span
        className="absolute -top-[8px] left-4 px-2 i-label whitespace-nowrap z-10"
        style={{ background: FRAME_BG, color: "var(--i-text-soft)", letterSpacing: "0.18em" }}
      >
        In this release · {scopeName}
      </span>
      {unmappedItems > 0 && (
        <span
          className="absolute -top-[8px] right-4 px-2 text-[9px] whitespace-nowrap z-10"
          style={{ background: FRAME_BG, color: "var(--i-amber)" }}
        >
          {totalItems - unmappedItems}/{totalItems} mapped
        </span>
      )}
      <div className={`h-full px-4 pt-6 pb-4 ${rows > 2 ? "overflow-y-auto" : "overflow-hidden"}`}>
        <div
          className="grid gap-3.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ...rowGeometry(rows) }}
        >
          <AnimatePresence initial={false}>{cells}</AnimatePresence>
          <motion.button
            layout
            onClick={onAdd}
            data-shoot="add-feature"
            className="relative group h-full"
            transition={{ type: "spring", stiffness: 330, damping: 33 }}
          >
            <Seat />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-45 group-hover:opacity-95 transition-opacity px-4 text-center">
              <span className="text-[19px] leading-none text-[var(--i-text-soft)]">+</span>
              <span className="text-[10px] text-[var(--i-text-soft)]">Add capability</span>
              <span className="text-[8.5px] leading-snug text-[var(--i-text-faint)]">
                create, or claim unassigned work
              </span>
            </span>
          </motion.button>
          {Array.from({ length: spare }).map((_, i) => (
            <div key={`spare-${i}`} className="relative h-full" aria-hidden>
              <Seat />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── THE OUT COLUMN ───────────────────────────────────────────────────────

function OutColumn({
  shelfEl,
  features,
  shareOf,
  maxSpread,
  dragging,
  pull,
  armed,
  onOpen,
}: {
  shelfEl: React.MutableRefObject<HTMLDivElement | null>;
  features: Feature[];
  shareOf: (f: Feature) => number;
  maxSpread: number;
  dragging: Feature | null;
  pull: MotionValue<number>;
  armed: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: BAY_OUT });
  const parkedDays = features.reduce((s, f) => s + f.loadDays, 0);
  const wake = useSpring(pull, { stiffness: 170, damping: 26 });
  const slotGlow = useTransform(wake, [0, 1], [0, 1]);
  const labelTone = useTransform(wake, [0, 1], ["var(--i-text-faint)", "var(--i-violet)"]);

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        shelfEl.current = el;
      }}
      data-shoot="bay-out"
      data-armed={armed ? "true" : "false"}
      className="relative shrink-0 rounded-xl"
      style={{
        width: 172,
        border: "1px dashed var(--i-border)",
        background: "#0a0d10",
        boxShadow: "inset 0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <motion.span
        className="absolute -top-[8px] left-3 px-2 i-label whitespace-nowrap"
        style={{ background: FRAME_BG, letterSpacing: "0.16em", color: labelTone }}
      >
        Out of this release
      </motion.span>
      <div className="h-full overflow-y-auto px-2.5 pt-4 pb-2.5 flex flex-col justify-center gap-2.5">
        <AnimatePresence initial={false}>
          {features.map((f) => (
            <SeatedModule
              key={f.id}
              feature={f}
              share={shareOf(f)}
              maxSpread={maxSpread}
              isDragging={dragging?.id === f.id}
              compact
              onOpen={() => onOpen(f.id)}
            />
          ))}
        </AnimatePresence>

        {/* The permanent slot — the mockup's own device. It wakes with the
            pointer's approach and arms at contact. */}
        <motion.div
          className="relative shrink-0 rounded-lg flex flex-col items-center justify-center gap-1 px-3 text-center"
          style={{ height: 132 }}
          initial={false}
          animate={{
            borderColor: armed ? "var(--i-violet)" : "var(--i-border-strong)",
            backgroundColor: armed ? "color-mix(in srgb, var(--i-violet) 9%, transparent)" : "rgba(0,0,0,0.25)",
          }}
          transition={{ duration: 0.2 }}
        >
          <span className="absolute inset-0 rounded-lg pointer-events-none" style={{ border: "1px dashed inherit" }} aria-hidden />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-lg pointer-events-none"
            style={{
              opacity: slotGlow,
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--i-violet) 45%, transparent), 0 0 16px color-mix(in srgb, var(--i-violet) 14%, transparent)",
            }}
          />
          <span className="text-[15px] leading-none" style={{ color: armed ? "var(--i-violet)" : "var(--i-text-faint)" }}>
            +
          </span>
          <span className="text-[9px] leading-snug" style={{ color: armed ? "var(--i-violet)" : "var(--i-text-faint)" }}>
            {armed ? "let go — out of this release" : "drop here to take out of this release"}
          </span>
        </motion.div>

        {/* A real zero is still a readout. It anchors the column when the
            release is whole, and it is the honest number when it is not. */}
        <div className="shrink-0 px-1 pt-1 text-center" style={{ borderTop: "1px solid var(--i-border)" }}>
          <div className="pt-1.5 i-readout text-[15px] leading-none" style={{ color: features.length > 0 ? "var(--i-violet)" : "var(--i-text-faint)" }}>
            {parkedDays.toFixed(1)}
            <span className="text-[9px] font-normal">d</span>
          </div>
          <div className="mt-1 text-[8.5px] leading-snug text-[var(--i-text-faint)]">
            {features.length === 0
              ? "nothing taken out"
              : `${features.length} capabilit${features.length === 1 ? "y" : "ies"} · still in Reality`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── THE CONSTRAINT STRIP ─────────────────────────────────────────────────
//
// Real open gates, drawn as the structural layer the release rests on, ending
// in the measured FLOOR — the empty-backlog simulation's landing. This is the
// dominated case made physical: you cannot cut Scope through this band.
function ConstraintStrip({
  gates,
  dominance,
  startDate,
}: {
  gates: { id: string; label: string; likely: number }[];
  dominance: ReturnType<typeof readDominance>;
  startDate: Date;
}) {
  const dom = dominance;
  return (
    <div
      className="shrink-0 flex items-stretch rounded-xl overflow-hidden"
      style={{ border: "1px solid color-mix(in srgb, var(--i-amber) 26%, var(--i-border))", background: "#0e1013" }}
      data-shoot="constraints"
    >
      <div className="shrink-0 w-44 px-4 py-2.5">
        <div className="i-label" style={{ color: "var(--i-amber)" }}>
          Decision constraints
        </div>
        <div className="mt-1 text-[9px] leading-snug text-[var(--i-text-faint)]">
          serial delays under the release — capacity cannot divide them
        </div>
      </div>
      <div className="flex-1 min-w-0 flex items-stretch">
        {gates.length === 0 ? (
          <div className="flex items-center px-4 text-[10px] text-[var(--i-text-faint)]">
            no open decisions under this release
          </div>
        ) : (
          gates.map((g) => (
            <Link
              key={g.id}
              href="/decisions"
              className="relative flex-1 min-w-0 flex flex-col justify-center px-3.5 py-2 group"
              style={{ borderLeft: "1px solid color-mix(in srgb, var(--i-amber) 22%, transparent)" }}
              title="Decisions owns this — open the Decisions instrument"
            >
              <span aria-hidden className="absolute inset-0 i-hatch opacity-70" />
              <span className="relative truncate text-[10.5px] text-[var(--i-text)] group-hover:text-[var(--i-amber)] transition-colors">
                {g.label}
              </span>
              <span className="relative mt-0.5 text-[9px]" style={{ color: "var(--i-amber)" }}>
                serial · ≈{g.likely.toFixed(0)}d to decide
              </span>
            </Link>
          ))
        )}
      </div>
      {dom && dom.floorDays > 0.5 && (
        <div
          className="shrink-0 w-44 px-4 py-2.5"
          style={{
            borderLeft: "1px solid color-mix(in srgb, var(--i-amber) 40%, transparent)",
            boxShadow: "inset -3px 0 0 var(--i-amber)",
            background: "color-mix(in srgb, var(--i-amber) 5%, transparent)",
          }}
        >
          <div className="i-label" style={{ color: "var(--i-amber)" }}>
            Floor
          </div>
          <div className="i-readout mt-0.5 text-[15px]" style={{ color: "var(--i-amber)" }}>
            {fmtDay(new Date(startDate.getTime() + dom.floorDays * 86400000))}
          </div>
          <div className="mt-0.5 text-[8.5px] leading-snug text-[var(--i-text-faint)]">
            can&apos;t land sooner — {dom.phrase}
          </div>
        </div>
      )}
    </div>
  );
}

// ── BOTTOM MODULES ───────────────────────────────────────────────────────

function PortfolioModule({
  label,
  big,
  caption,
  fill,
  fillNote,
  changed,
}: {
  label: string;
  big: string;
  caption: string;
  fill: number;
  fillNote: string;
  changed: boolean;
}) {
  return (
    <Link
      href="/portfolio"
      className="rounded-xl px-4 py-3 group"
      style={{ border: "1px solid var(--i-border)", background: "#0f1418" }}
      title="Portfolio owns this"
    >
      <div className="flex items-baseline justify-between">
        <span className="i-label">{label}</span>
        <span className="text-[8.5px] text-[var(--i-text-faint)] group-hover:text-[var(--i-text-soft)] transition-colors">
          Portfolio →
        </span>
      </div>
      <div className="i-readout mt-1.5 text-[19px] leading-none" style={{ color: changed ? "var(--i-violet)" : "var(--i-text)" }}>
        {big}
      </div>
      <div className="mt-1 text-[9px] text-[var(--i-text-faint)]">{caption}</div>
      {/* A readout, not a control: recessed, unlit, no handle. */}
      <div className="i-meter mt-2 h-[6px] overflow-hidden" style={{ borderRadius: 4 }}>
        <motion.div
          className="h-full"
          initial={false}
          animate={{ width: `${Math.max(2, fill * 100)}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
          style={{ background: changed ? "var(--i-violet)" : "var(--i-text-soft)", opacity: 0.55 }}
        />
      </div>
      <div className="mt-1 text-[8px] text-[var(--i-text-faint)]">{fillNote}</div>
    </Link>
  );
}

function ScenarioSummary({
  included,
  out,
  loadRemoved,
  movedDays,
  active,
}: {
  included: number;
  out: number;
  loadRemoved: number;
  movedDays: number;
  active: boolean;
}) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ border: "1px solid var(--i-border)", background: "#0f1418" }}>
      <div className="i-label">Scenario summary</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <Mini v={`${included}`} k="included" />
        <Mini v={`${out}`} k="out" tone={out > 0 ? "var(--i-violet)" : undefined} />
        <Mini v={active ? `−${loadRemoved.toFixed(1)}d` : "—"} k="load removed" tone={active ? "var(--i-violet)" : undefined} />
        <Mini
          v={movedDays !== 0 ? `${Math.abs(movedDays)}d ${movedDays < 0 ? "↑" : "↓"}` : active ? "held" : "—"}
          k={movedDays !== 0 ? "forecast" : "date"}
          tone={movedDays !== 0 ? deltaTone(movedDays) : undefined}
        />
      </div>
      <Link
        href="/forecast"
        data-shoot="open-forecast"
        className="mt-2.5 block text-center rounded-md py-1.5 text-[10px] transition-colors"
        style={{
          border: `1px solid ${active ? "var(--i-violet)" : "var(--i-border-strong)"}`,
          color: active ? "var(--i-violet)" : "var(--i-text-soft)",
        }}
      >
        See consequence in Forecast →
      </Link>
    </div>
  );
}

function Mini({ v, k, tone }: { v: string; k: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="i-readout text-[14px] leading-none truncate" style={{ color: tone ?? "var(--i-text)" }}>
        {v}
      </div>
      <div className="mt-0.5 text-[8px] text-[var(--i-text-faint)] truncate">{k}</div>
    </div>
  );
}

function ScenarioControls({ active, onDiscard }: { active: boolean; onDiscard: () => void }) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col" style={{ border: "1px solid var(--i-border)", background: "#0f1418" }}>
      <div className="i-label">Scenario controls</div>
      <button
        onClick={onDiscard}
        disabled={!active}
        className="mt-2 rounded-md py-1.5 text-[10px] transition-colors disabled:opacity-30"
        style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
      >
        Discard scenario
      </button>
      {/* Straight from the accepted mockup, honesty included: Scope composes
          hypotheticals; it has nowhere to write an exclusion, so it does not
          commit. The button exists to say exactly that. */}
      <button
        disabled
        className="mt-1.5 rounded-md py-1.5 text-[10px]"
        style={{ background: "color-mix(in srgb, var(--i-violet) 26%, transparent)", color: "var(--i-text-soft)", opacity: 0.5 }}
      >
        Commit to Reality
      </button>
      <div className="mt-1 text-[8px] text-[var(--i-text-faint)]">(Not available — Scope does not commit)</div>
    </div>
  );
}

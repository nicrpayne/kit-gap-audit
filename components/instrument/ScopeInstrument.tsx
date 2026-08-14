"use client";

// SCOPE COMPOSER — a physical composition instrument. You compose what ships
// by picking capability modules up and putting them down.
//
//   header      a nameplate, and ONE piece of inset glass carrying the
//               landing date (dominant), the release load (secondary) and the
//               scenario impact (dark until there is a scenario)
//   deck        IN THIS RELEASE — a chassis of capability modules, each with
//               its own distribution display. The deck always shows its bays:
//               spare positions are drawn as empty seats, not as air
//   bay         OUT OF THIS RELEASE — a cassette cut into the chassis. It
//               sleeps, and wakes in proportion to a real pointer approach
//   rail        the LOCK RAIL — an amber conductor of read-only decision
//               gates, ending in the measured FLOOR, illuminated only when
//               the release is genuinely dominated
//   strip       one thin signal strip: what Scope inherited, what the
//               composition costs, and the actions
//   panel       FEATURE DETAIL, docked as the selected module's editor
//
// THE LIGHT LAW: nothing glows because it exists. Light means active,
// changing, uncertain, constrained, or being touched.
//
// THE STAGING IS THE ARGUMENT: the object moves first, the machine recomputes
// second, the interpretation arrives last. See STAGE below.
//
// Everything on screen is derived: displays from summed three-point ranges,
// the floor from a real empty-backlog simulation, the rail from live gates.
// Semantics, engine paths and drag mechanics are unchanged from the accepted
// V3 / material passes.

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
import { composeFeatures, type Feature, type ThreePoint } from "@/lib/scope/features";
import { readDominance } from "@/lib/scope/constraint";
import { formatCapacity } from "@/lib/capacity/limits";

const BAY_IN = "bay-in";
const BAY_OUT = "bay-out";
const FRAME_BG = "#0c1013";
// THE DECK PACKS ITSELF.
//
// A chassis shows its bays. Two rows, always — the columns are chosen so at
// most one bay is left spare, and whatever is spare is drawn as an empty seat
// rather than left as unexplained air. A four-capability release should read
// as "four modules racked, four bays open", which is true, instead of as a
// short row floating in the middle of a tall empty box.
function packDeck(cellCount: number): { cols: number; rows: number } {
  if (cellCount <= 2) return { cols: Math.max(2, cellCount), rows: 1 };
  const cols = Math.min(6, Math.max(3, Math.ceil(cellCount / 2)));
  return { cols, rows: Math.ceil(cellCount / cols) };
}

// Rows divide the deck rather than being stamped out at a fixed height, so a
// release always fits its rack and nothing is ever clipped. Past two rows the
// deck becomes a scrolling surface with fixed-size bays.
function rowGeometry(rows: number): React.CSSProperties {
  if (rows === 1)
    return { height: "100%", gridTemplateRows: `minmax(${MODULE_H}px, ${MODULE_H + 92}px)`, alignContent: "center" };
  if (rows === 2) return { height: "100%", gridTemplateRows: "repeat(2, minmax(0, 1fr))" };
  return { minHeight: "100%", gridAutoRows: `${MODULE_H}px`, alignContent: "start" };
}

/** Load moved by the composition. A re-estimate can make a release HEAVIER,
    so the sign is computed rather than prefixed — "−-0.8d" is not a number. */
function loadDelta(removed: number): { value: string; note: string } {
  if (Math.abs(removed) < 0.05) return { value: "0.0d", note: "no change" };
  return removed > 0
    ? { value: `−${removed.toFixed(1)}d`, note: "removed" }
    : { value: `+${Math.abs(removed).toFixed(1)}d`, note: "added" };
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
  // Reality's own distribution per capability. Passed to the display so a
  // Scenario re-estimate morphs off a visible ghost of where it started —
  // real data on both sides, never a fabricated "before".
  const realityRangeOf = (f: Feature) => reality.features.find((x) => x.id === f.id)?.range ?? null;
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
    // Under a degree: enough to feel the object has mass, never enough to
    // read as a cartoon.
    tilt.set(Math.max(-0.9, Math.min(0.9, (e.delta.x - lastDX.current) * 0.14)));
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
              {/* ── HEADER: nameplate + master display ─────────────────── */}
              <div className="shrink-0 flex items-center gap-6 px-5 pt-3.5 pb-3">
                <div className="min-w-0">
                  <div
                    className="text-[12px] font-semibold uppercase"
                    style={{ letterSpacing: "0.32em", color: "var(--i-text-soft)" }}
                  >
                    Scope Composer
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">
                    Compose what ships. Pull capabilities out to explore the impact.
                  </div>
                </div>
                <div className="flex-1" />
                <MasterDisplay
                  scopeName={scope.name}
                  date={fmtFull(res.likelyDate)}
                  best={fmtDay(res.earliestDate)}
                  worst={fmtDay(res.latestDate)}
                  loadDays={composition.loadDays}
                  realityLoadDays={reality.loadDays}
                  capacityLabel={formatCapacity(capacity)}
                  movedDays={movedDays}
                  effortRemoved={effortRemoved}
                  active={m.active}
                  dominancePhrase={dom?.dominated ? dom.phrase : null}
                  previewRelief={
                    carryingSeated && dragging ? dragging.effortDays / (capacity > 0 ? capacity : 1) : null
                  }
                />
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
                    ghostRangeOf={realityRangeOf}
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
                    ghostRangeOf={realityRangeOf}
                    dragging={dragging}
                    pull={shelfPull}
                    armed={acquiringShelf}
                    onOpen={setOpenFeatureId}
                  />
                </div>

                <ConstraintStrip gates={openGates} dominance={dom} startDate={startDate} />

                <SignalStrip
                  capacityLabel={formatCapacity(capacity)}
                  capacitySource={
                    scope.capacitySource === "explicit"
                      ? "set by hand in Portfolio"
                      : scope.capacitySource === "allocations"
                        ? "from named allocations"
                        : "inferred from assignees"
                  }
                  capacityChanged={m.scenario.capacityOverrideByScope[scope.scopeId] !== undefined}
                  contextPct={m.scenario.contextSwitchCostPct ?? m.data.contextSwitchCostPct}
                  contextChanged={m.scenario.contextSwitchCostPct !== null}
                  loadRemoved={effortRemoved}
                  movedDays={movedDays}
                  included={engaged.length}
                  out={composition.bypassed.length}
                  active={m.active}
                  onDiscard={() => {
                    m.setScenario(EMPTY_SCENARIO);
                    setOpenFeatureId(null);
                  }}
                />
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
                      : { scale: 1.02, rotate: -0.5, y: 0 }
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
                    ghostRange={realityRangeOf(dragging)}
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
        realityRange={openFeature ? realityRangeOf(openFeature) : null}
        maxSpread={maxSpread}
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

// ── THE MASTER DISPLAY ───────────────────────────────────────────────────
//
// One piece of glass inset into the chassis, not three KPI cards. At rest the
// machine is calm: the landing date is the only loud thing, load is secondary,
// and the scenario cell is dark because there is no scenario. Composing a
// scenario powers the cell on.
//
// The resolution is STAGED, and the order is the argument: the object lands
// first, then the machine recomputes, then it interprets. Nothing here
// animates on its own — every arrival is caused by something the user did.
const STAGE = { load: 0.24, date: 0.42, impact: 0.58 };

function MasterDisplay({
  scopeName,
  date,
  best,
  worst,
  loadDays,
  realityLoadDays,
  capacityLabel,
  movedDays,
  effortRemoved,
  active,
  dominancePhrase,
  previewRelief,
}: {
  scopeName: string;
  date: string;
  best: string;
  worst: string;
  loadDays: number;
  realityLoadDays: number;
  capacityLabel: string;
  movedDays: number;
  effortRemoved: number;
  active: boolean;
  /** Set only when the date is held by something Scope cannot cut. */
  dominancePhrase: string | null;
  /** Live during a carry: what setting this module down would remove. */
  previewRelief: number | null;
}) {
  const moved = movedDays !== 0;
  const impactTone = moved ? deltaTone(movedDays) : active ? "var(--i-text-soft)" : "var(--i-text-faint)";
  return (
    <div
      data-shoot="master"
      className="relative flex items-stretch rounded-lg overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #0a0e11 0%, #070a0c 100%)",
        boxShadow:
          "inset 0 2px 7px rgba(0,0,0,0.66), inset 0 -1px 0 rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.035)",
      }}
    >
      {/* LANDING — the loudest thing on the instrument. */}
      <div className="px-6 py-3">
        <div className="i-label">{scopeName} lands</div>
        <div className="mt-1.5 leading-none" style={{ fontSize: 30 }}>
          <motion.span
            key={date}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: STAGE.date, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block i-readout"
            style={{ color: moved ? "var(--i-violet)" : "var(--i-text)" }}
          >
            {date}
          </motion.span>
        </div>
        <div className="mt-1.5 text-[9.5px] text-[var(--i-text-faint)]">
          best {best} · worst {worst}
        </div>
      </div>

      <Engraving />

      {/* RELEASE LOAD — secondary, and the first number to resolve. */}
      <div className="px-6 py-3">
        <div className="i-label">Release load</div>
        <div className="mt-1.5 leading-none" style={{ fontSize: 21 }}>
          <motion.span
            key={loadDays.toFixed(1)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: STAGE.load }}
            className="inline-block i-readout"
            style={{ color: active ? "var(--i-violet)" : "var(--i-text-soft)" }}
          >
            {loadDays.toFixed(1)}d
          </motion.span>
        </div>
        <div className="mt-1.5 text-[9.5px] text-[var(--i-text-faint)]">
          {active ? `Reality ${realityLoadDays.toFixed(1)}d` : `at ${capacityLabel} FTE`}
        </div>
      </div>

      <Engraving />

      {/* SCENARIO — dark until there is a scenario to report. */}
      <motion.div
        className="px-6 py-3 min-w-[172px]"
        initial={false}
        animate={{ opacity: active || previewRelief !== null ? 1 : 0.34 }}
        transition={{ duration: 0.3, delay: active ? STAGE.impact : 0 }}
      >
        <div className="i-label" style={{ color: active ? "var(--i-violet)" : undefined }}>
          Scenario impact
        </div>
        <div className="mt-1.5 leading-none" style={{ fontSize: 21 }}>
          <motion.span
            key={`${movedDays}-${effortRemoved.toFixed(1)}-${active}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: STAGE.impact }}
            className="inline-block i-readout"
            style={{ color: impactTone }}
          >
            {moved ? deltaLabel(movedDays) : active ? "held" : "—"}
          </motion.span>
        </div>
        <div className="mt-1.5 text-[9.5px] leading-snug" style={{ color: previewRelief !== null ? "var(--i-violet)" : "var(--i-text-faint)" }}>
          {previewRelief !== null ? (
            `setting down removes ${previewRelief.toFixed(1)}d of load`
          ) : active ? (
            // The dominated case: the date did not move, and saying so is the
            // result. It re-arrives so the stillness reads as an answer.
            <motion.span
              key={dominancePhrase ?? effortRemoved.toFixed(1)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.34, delay: STAGE.impact + 0.06 }}
              className="inline-block"
            >
              {!moved && dominancePhrase
                ? `held — ${dominancePhrase}`
                : `${loadDelta(effortRemoved).value} of load ${loadDelta(effortRemoved).note}`}
            </motion.span>
          ) : (
            "no scenario"
          )}
        </div>
      </motion.div>
    </div>
  );
}

/** An engraved division in the glass — a scored line, not a border. */
function Engraving() {
  return (
    <span
      aria-hidden
      className="shrink-0 self-stretch my-2.5"
      style={{
        width: 1,
        background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.7) 20%, rgba(0,0,0,0.7) 80%, transparent)",
        boxShadow: "1px 0 0 rgba(255,255,255,0.04)",
      }}
    />
  );
}

// ── THE RACK ─────────────────────────────────────────────────────────────

function SeatedModule({
  feature,
  share,
  maxSpread,
  ghostRange,
  isDragging,
  compact,
  onOpen,
}: {
  feature: Feature;
  share: number;
  maxSpread: number;
  ghostRange?: ThreePoint | null;
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
          ghostRange={ghostRange}
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
  ghostRangeOf,
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
  ghostRangeOf: (f: Feature) => ThreePoint | null;
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
      ghostRange={ghostRangeOf(f)}
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
          className="absolute top-2 right-4 text-[8.5px] whitespace-nowrap z-10 uppercase tracking-[0.12em]"
          style={{ color: "color-mix(in srgb, var(--i-amber) 80%, transparent)" }}
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
              <Seat mark />
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
  ghostRangeOf,
  dragging,
  pull,
  armed,
  onOpen,
}: {
  shelfEl: React.MutableRefObject<HTMLDivElement | null>;
  features: Feature[];
  shareOf: (f: Feature) => number;
  maxSpread: number;
  ghostRangeOf: (f: Feature) => ThreePoint | null;
  dragging: Feature | null;
  pull: MotionValue<number>;
  armed: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: BAY_OUT });
  const parkedDays = features.reduce((s, f) => s + f.loadDays, 0);
  const wake = useSpring(pull, { stiffness: 190, damping: 28 });

  // Everything below is driven by ONE real quantity: how close the carried
  // module actually is. Nothing here is a hover state.
  const railOpacity = useTransform(wake, [0.06, 0.85], [0, 1]);
  const seatOpacity = useTransform(wake, [0.18, 0.8], [0, 1]);
  const seatLift = useTransform(wake, [0.18, 0.9], [7, 0]);
  const labelTone = useTransform(wake, [0.2, 1], ["var(--i-text-faint)", "var(--i-violet)"]);
  const bodyLift = useTransform(wake, [0, 1], ["#080b0d", "#0d0c15"]);

  return (
    <motion.div
      ref={(el: HTMLDivElement | null) => {
        setNodeRef(el);
        shelfEl.current = el;
      }}
      data-shoot="bay-out"
      data-armed={armed ? "true" : "false"}
      className="relative shrink-0 rounded-xl overflow-hidden"
      style={{
        width: 172,
        border: "1px solid var(--i-border)",
        // A bay cut into the chassis. It sleeps here — no dashed perimeter,
        // no instruction, nothing shouting "drop zone".
        background: bodyLift,
        boxShadow: "inset 0 3px 12px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.028)",
      }}
    >
      <span aria-hidden className="absolute inset-0 pointer-events-none">
        {[10, 161].map((x) => (
          <span
            key={x}
            className="absolute"
            style={{
              left: x,
              top: 26,
              bottom: 52,
              width: 1,
              background:
                "linear-gradient(180deg, transparent, rgba(255,255,255,0.055) 16%, rgba(255,255,255,0.055) 84%, transparent)",
            }}
          />
        ))}
      </span>

      {/* THE GUIDE RAILS — the mechanism lighting up as a module approaches.
          Driven by real pointer distance, not by hover. */}
      <motion.span aria-hidden className="absolute inset-0 pointer-events-none" style={{ opacity: railOpacity }}>
        {[10, 161].map((x) => (
          <span
            key={x}
            className="absolute"
            style={{
              left: x,
              top: 26,
              bottom: 52,
              width: 1,
              background:
                "linear-gradient(180deg, transparent, color-mix(in srgb, var(--i-violet) 60%, transparent) 18%, color-mix(in srgb, var(--i-violet) 60%, transparent) 82%, transparent)",
              boxShadow: "0 0 7px color-mix(in srgb, var(--i-violet) 34%, transparent)",
            }}
          />
        ))}
      </motion.span>

      <motion.span
        className="absolute top-2 left-3 right-3 i-label whitespace-nowrap z-10"
        style={{ letterSpacing: "0.16em", color: labelTone, fontSize: 8.5 }}
      >
        Out of this release
      </motion.span>

      <div className="h-full overflow-y-auto px-2.5 pt-7 pb-2.5 flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {features.map((f) => (
            <SeatedModule
              key={f.id}
              feature={f}
              share={shareOf(f)}
              maxSpread={maxSpread}
              ghostRange={ghostRangeOf(f)}
              isDragging={dragging?.id === f.id}
              compact
              onOpen={() => onOpen(f.id)}
            />
          ))}
        </AnimatePresence>

        {/* THE RECEIVING SEAT — depth opens only as far as the approach
            warrants, so crossing the boundary is progressively intentional. */}
        <motion.div
          className="relative shrink-0 rounded-lg"
          style={{ height: 116, opacity: seatOpacity, y: seatLift }}
          aria-hidden
        >
          <motion.span
            className="absolute inset-0 rounded-lg"
            initial={false}
            animate={{
              boxShadow: armed
                ? "inset 0 4px 12px rgba(0,0,0,0.7), inset 0 0 0 1px color-mix(in srgb, var(--i-violet) 62%, transparent), 0 0 22px color-mix(in srgb, var(--i-violet) 20%, transparent)"
                : "inset 0 4px 12px rgba(0,0,0,0.7), inset 0 0 0 1px color-mix(in srgb, var(--i-violet) 22%, transparent)",
              backgroundColor: armed
                ? "color-mix(in srgb, var(--i-violet) 11%, rgba(0,0,0,0.4))"
                : "rgba(0,0,0,0.4)",
            }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
          <motion.span
            className="absolute inset-x-0 bottom-3 text-center text-[9px] leading-snug px-3"
            initial={false}
            animate={{ opacity: armed ? 1 : 0, color: "var(--i-violet)" }}
            transition={{ duration: 0.16 }}
          >
            release — out of this release
          </motion.span>
        </motion.div>

        <div className="flex-1 min-h-0" />

        {/* A real zero is still a readout. It anchors the bay when the release
            is whole, and it is the honest number when it is not. */}
        <div className="shrink-0 px-1 pt-1.5 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div
            className="i-readout text-[15px] leading-none"
            style={{ color: features.length > 0 ? "var(--i-violet)" : "var(--i-text-faint)" }}
          >
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
    </motion.div>
  );
}

// ── THE LOCK RAIL ────────────────────────────────────────────────────────
//
// A mechanical stop under the release, not another dashboard section. Scope
// does not own decisions, so this is read-only and mostly black: one amber
// conductor engraved along the chassis, a lock indicator per open gate, and
// the measured FLOOR as its terminal.
//
// The conductor and the terminal illuminate only when the release is actually
// DOMINATED — when cutting scope can no longer reach the date. Individual
// locks stay quiet, because the model attributes the floor to open decisions
// and dependencies collectively; it does not know which single gate sets it,
// and inventing that attribution would be a lie the user could act on.
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
  const held = !!dom?.dominated;
  const hasFloor = !!dom && dom.floorDays > 0.5;
  const conductor = held
    ? "linear-gradient(90deg, transparent, var(--i-amber) 6%, var(--i-amber) 94%, transparent)"
    : "linear-gradient(90deg, transparent, color-mix(in srgb, var(--i-amber) 34%, transparent) 6%, color-mix(in srgb, var(--i-amber) 34%, transparent) 94%, transparent)";

  return (
    <div
      className="relative shrink-0 flex items-stretch rounded-lg overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #0a0c0e 0%, #070809 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -2px 6px rgba(0,0,0,0.5)",
        border: "1px solid #1a1c1e",
        height: 46,
      }}
      data-shoot="constraints"
    >
      {/* The conductor: one engraved amber line running the length of the
          rail. It is the only continuous thing down here. */}
      <motion.span
        aria-hidden
        className="absolute left-0 right-0 pointer-events-none"
        initial={false}
        animate={{ opacity: held ? 1 : 0.75 }}
        transition={{ duration: 0.3 }}
        style={{
          top: 0,
          height: 1,
          background: conductor,
          boxShadow: held ? "0 0 8px color-mix(in srgb, var(--i-amber) 40%, transparent)" : undefined,
        }}
      />

      <span
        aria-hidden
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          top: 1,
          height: 4,
          opacity: 0.5,
          backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.075) 0 1px, transparent 1px 14px)",
        }}
      />

      <div className="shrink-0 flex flex-col justify-center pl-4 pr-3.5">
        <span className="i-label" style={{ color: held ? "var(--i-amber)" : "var(--i-text-faint)", fontSize: 8.5 }}>
          Locks
        </span>
        <span className="mt-0.5 text-[8.5px] leading-none text-[var(--i-text-faint)]">serial · owned by Decisions</span>
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-1.5 px-1 overflow-hidden">
        {gates.length === 0 ? (
          <span className="text-[9.5px] text-[var(--i-text-faint)] px-2">no open decisions under this release</span>
        ) : (
          gates.map((g) => (
            <Link
              key={g.id}
              href="/decisions"
              className="group min-w-0 flex items-center gap-1.5 rounded px-2 py-1 transition-colors"
              style={{ border: "1px solid #23262a", background: "rgba(0,0,0,0.35)" }}
              title="Decisions owns this — open the Decisions instrument"
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className="shrink-0"
                style={{ color: "color-mix(in srgb, var(--i-amber) 70%, transparent)" }}
                aria-hidden
              >
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 018 0v3" />
              </svg>
              <span className="min-w-0 truncate text-[9.5px] text-[var(--i-text-soft)] group-hover:text-[var(--i-text)] transition-colors">
                {g.label}
              </span>
              <span className="shrink-0 text-[9px] tabular-nums" style={{ color: "color-mix(in srgb, var(--i-amber) 78%, transparent)" }}>
                {g.likely.toFixed(0)}d
              </span>
            </Link>
          ))
        )}
      </div>

      {hasFloor && (
        <motion.div
          className="shrink-0 flex items-center gap-2.5 pl-4 pr-4"
          initial={false}
          animate={{ opacity: held ? 1 : 0.7 }}
          transition={{ duration: 0.3 }}
          style={{
            borderLeft: `1px solid ${held ? "color-mix(in srgb, var(--i-amber) 50%, transparent)" : "#1e2124"}`,
            background: held ? "color-mix(in srgb, var(--i-amber) 6%, transparent)" : undefined,
            boxShadow: held ? "inset -3px 0 0 var(--i-amber)" : undefined,
          }}
          title={dom?.phrase ? `Can't land sooner — ${dom.phrase}` : undefined}
        >
          <div className="flex flex-col">
            <span className="i-label" style={{ color: "var(--i-amber)", fontSize: 8.5 }}>
              Floor
            </span>
            <span className="mt-0.5 text-[8.5px] leading-none text-[var(--i-text-faint)]">
              {held ? "the date is here" : "cutting can still reach the date"}
            </span>
          </div>
          <span className="i-readout text-[16px] leading-none" style={{ color: "var(--i-amber)" }}>
            {fmtDay(new Date(startDate.getTime() + dom.floorDays * 86400000))}
          </span>
        </motion.div>
      )}
    </div>
  );
}

// ── THE SIGNAL STRIP ─────────────────────────────────────────────────────
//
// The bottom of the instrument is not four equal cards. It is one thin strip
// carrying, left to right: what Scope INHERITED (quiet, with doors to the
// instrument that owns it), then what the current composition COSTS (loud
// only when there is a scenario), then the actions.
function SignalStrip({
  capacityLabel,
  capacitySource,
  capacityChanged,
  contextPct,
  contextChanged,
  loadRemoved,
  movedDays,
  included,
  out,
  active,
  onDiscard,
}: {
  capacityLabel: string;
  capacitySource: string;
  capacityChanged: boolean;
  contextPct: number;
  contextChanged: boolean;
  loadRemoved: number;
  movedDays: number;
  included: number;
  out: number;
  active: boolean;
  onDiscard: () => void;
}) {
  return (
    <div
      className="shrink-0 flex items-stretch rounded-lg overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #0f1417 0%, #0b0f12 100%)",
        border: "1px solid var(--i-border)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
        height: 62,
      }}
      data-shoot="signal-strip"
    >
      <InheritedSignal
        label="Capacity"
        value={`${capacityLabel} FTE`}
        note={capacitySource}
        changed={capacityChanged}
      />
      <Engraving />
      <InheritedSignal
        label="Context switch"
        value={`${contextPct}%`}
        note="per additional scope"
        changed={contextChanged}
      />
      <Engraving />

      {/* WHAT THE COMPOSITION COSTS — dark until composed. */}
      <motion.div
        className="shrink-0 flex items-center gap-8 px-5"
        initial={false}
        animate={{ opacity: active ? 1 : 0.42 }}
        transition={{ duration: 0.3, delay: active ? 0.24 : 0 }}
      >
        <Consequence
          label="Load"
          value={active ? loadDelta(loadRemoved).value : "—"}
          tone={active ? "var(--i-violet)" : "var(--i-text-faint)"}
          note={active ? `${included} in · ${out} out` : "no scenario"}
          delay={0.24}
        />
        <Consequence
          label="Landing"
          value={movedDays !== 0 ? deltaLabel(movedDays) : active ? "held" : "—"}
          tone={movedDays !== 0 ? deltaTone(movedDays) : active ? "var(--i-text-soft)" : "var(--i-text-faint)"}
          note={movedDays !== 0 ? "against Reality" : active ? "this scenario does not move it" : "no scenario"}
          delay={0.42}
        />
      </motion.div>

      <div className="flex-1 min-w-0" />
      <Engraving />

      <div className="shrink-0 flex items-center gap-1.5 px-4">
        <button
          onClick={onDiscard}
          disabled={!active}
          className="i-control px-3 py-1.5 text-[10px] transition-colors disabled:opacity-25 hover:text-[var(--i-text)]"
          style={{ color: "var(--i-text-soft)" }}
        >
          Discard
        </button>
        <Link
          href="/forecast"
          data-shoot="open-forecast"
          className="i-control px-3 py-1.5 text-[10px] transition-colors"
          style={{
            borderColor: active ? "var(--i-violet)" : undefined,
            color: active ? "var(--i-violet)" : "var(--i-text-soft)",
          }}
        >
          Forecast →
        </Link>
      </div>
    </div>
  );
}

/** A value Scope reads but does not own. Quiet, with a door. */
function InheritedSignal({
  label,
  value,
  note,
  changed,
}: {
  label: string;
  value: string;
  note: string;
  changed: boolean;
}) {
  return (
    <Link
      href="/portfolio"
      className="group shrink-0 flex flex-col justify-center px-5 transition-colors"
      title="Portfolio owns this"
    >
      <div className="flex items-baseline gap-2">
        <span className="i-label" style={{ fontSize: 8.5 }}>
          {label}
        </span>
        <span className="text-[8px] text-[var(--i-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity">
          Portfolio →
        </span>
      </div>
      <span
        className="i-readout mt-1 text-[16px] leading-none"
        style={{ color: changed ? "var(--i-violet)" : "var(--i-text-soft)" }}
      >
        {value}
      </span>
      <span className="mt-1 text-[8.5px] leading-none text-[var(--i-text-faint)]">{note}</span>
    </Link>
  );
}

/** A consequence of the composition. Resolves on the master's own schedule,
    so the whole instrument answers in one voice. */
function Consequence({
  label,
  value,
  tone,
  note,
  delay,
}: {
  label: string;
  value: string;
  tone: string;
  note: string;
  delay: number;
}) {
  return (
    <div className="min-w-0">
      <div className="i-label" style={{ fontSize: 8.5 }}>
        {label}
      </div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, delay }}
        className="i-readout mt-1 text-[19px] leading-none truncate"
        style={{ color: tone }}
      >
        {value}
      </motion.div>
      <div className="mt-1 text-[8.5px] leading-none text-[var(--i-text-faint)] truncate">{note}</div>
    </div>
  );
}

"use client";

// SCOPE — play what ships.
//
// THE OBJECT IS THE CHASSIS. One continuous instrument surface into which
// capability modules are seated. The SEAT (see CapabilityTile) is the whole
// physical vocabulary: every module occupies a recess; lifting one leaves its
// empty seat behind; a candidate hovers above a seat it has not accepted; a
// valid destination is nothing more than a new seat opening between modules.
// There is deliberately no "dropzone" language anywhere — no perimeter
// highlight, no giant labelled target. Destinations reveal themselves locally
// and physically, the way a magnet announces itself.
//
// THE SHELF below is where capabilities go when they leave this release. It
// SLEEPS as a quiet recess until a module is carried toward it, wakes with
// the pointer's approach (a continuous proximity signal, not a binary
// hover), offers a seat, receives the module, and settles.
//
// THE CONSEQUENCE IS STAGED. Object first, numbers second: the module lands
// (~240ms), the chassis closes its empty seat, the release load resolves,
// and the landing date resolves last. When the date does NOT move — the
// dominated case — that stillness is the feedback, and nothing manufactures
// motion to soften it.
//
// Semantics are untouched from V3: bypassing writes the product decision and
// the engine's work-item exclusions together; Monte Carlo and the portfolio
// simulation are not touched; ownership boundaries stand.

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
import CapabilityTile, { Seat, materialOf, tileWidth, TILE_H } from "@/components/instrument/CapabilityTile";
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

/** Where a module will land in a load-ordered row — so the seat that opens
    for it opens in the true place, not a flattering one. */
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
  const [over, setOver] = useState<string | null>(null);

  // The shelf's waking signal: 0 at rest, 1 with the pointer at its lip.
  // A continuous value driven from real pointer geometry — this is what makes
  // the exclusion boundary feel increasingly intentional on approach instead
  // of flipping on like form validation.
  const shelfPull = useMotionValue(0);
  const dragOriginY = useRef(0);
  const shelfEl = useRef<HTMLDivElement | null>(null);

  // A small distance constraint keeps click-to-open and drag-to-move as
  // separate gestures on the same object.
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

  // Bypassing writes BOTH halves of the truth: the product-level decision, and
  // the work-item exclusions the engine simulates. Set together, so they can
  // never disagree. (Unchanged from V3 — the model is frozen.)
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

  const shareOf = (f: Feature) => (composition.loadDays > 0 ? f.loadDays / composition.loadDays : 0);
  // A parked module keeps the footprint it had in Reality, so the shelf shows
  // what was set down rather than a shrunken souvenir of it.
  const realityShareOf = (f: Feature) => {
    const r = reality.features.find((x) => x.id === f.id);
    return r && reality.loadDays > 0 ? r.loadDays / reality.loadDays : 0;
  };

  const engaged = composition.features.filter((f) => !f.bypassed);
  const openFeature = composition.features.find((f) => f.id === openFeatureId) ?? null;
  const openGates = scope.gates.filter((g) => !m.scenario.resolvedGateIds.has(g.id));

  const carryingSeated = !!dragging && !dragging.bypassed;
  const carryingParked = !!dragging && dragging.bypassed;

  const onDragStart = (e: DragStartEvent) => {
    const f = composition.features.find((x) => x.id === e.active.id);
    setDragging(f ?? null);
    const ev = e.activatorEvent as PointerEvent;
    dragOriginY.current = typeof ev?.clientY === "number" ? ev.clientY : 0;
  };
  const onDragMove = (e: DragMoveEvent) => {
    if (!dragging || dragging.bypassed) return;
    const rect = shelfEl.current?.getBoundingClientRect();
    if (!rect) return;
    const pointerY = dragOriginY.current + e.delta.y;
    const distance = rect.top - pointerY;
    shelfPull.set(distance <= 0 ? 1 : Math.max(0, 1 - distance / 300));
  };
  const endDrag = () => {
    setDragging(null);
    setOver(null);
    shelfPull.set(0);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const f = composition.features.find((x) => x.id === e.active.id);
    const target = e.over?.id;
    endDrag();
    if (!f || !target) return; // cancelled or dropped on nothing: it goes home
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

  // The overlay straightens and eases toward a destination it can seat in —
  // acquisition, not validation.
  const acquiringShelf = carryingSeated && over === BAY_OUT;
  const acquiringBay = carryingParked && over === BAY_IN;

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
          <div className="flex-1 min-h-0 relative overflow-hidden" style={{ background: "var(--i-void)" }}>
            {/* ── THE CONSOLE: deck above, shelf directly beneath ─────── */}
            <div className="absolute flex flex-col" style={{ left: 30, right: 342, top: 34, bottom: 16 }}>
              <ChassisBay
                engaged={engaged}
                dragging={dragging}
                shareOf={shareOf}
                realityShareOf={realityShareOf}
                offeringSeat={carryingParked}
                seatArmed={over === BAY_IN}
                onOpen={setOpenFeatureId}
                onAdd={() => setAdding(true)}
                title={`${scope.name} · in this release`}
                subtitle={`${engaged.length} capabilit${engaged.length === 1 ? "y" : "ies"}${
                  composition.unmappedItems > 0
                    ? ` · ${composition.unmappedItems} unassigned work item${composition.unmappedItems === 1 ? "" : "s"}`
                    : ""
                }`}
              />

              <div aria-hidden style={{ height: 18, flexShrink: 0 }} />
              {/* ── THE SHELF ─────────────────────────────────────────── */}
              <OutShelf
                shelfEl={shelfEl}
                features={composition.bypassed}
                shareOf={realityShareOf}
                dragging={dragging}
                pull={shelfPull}
                receiving={carryingSeated}
                armed={over === BAY_OUT && carryingSeated}
                onOpen={setOpenFeatureId}
              />
            </div>

            {/* ── THE READOUT ─────────────────────────────────────────── */}
            <ReleaseReadout
              scopeName={scope.name}
              likelyDate={res.likelyDate}
              realityDate={base.likelyDate}
              movedDays={movedDays}
              loadDays={composition.loadDays}
              realityLoadDays={reality.loadDays}
              active={m.active}
              bypassed={composition.bypassed}
              onPutBack={(f) => setBypassed(f, false)}
              coverage={{ total: composition.totalItems, unmapped: composition.unmappedItems }}
              dominance={dom}
              startDate={startDate}
              capacity={capacity}
              capacityChanged={m.scenario.capacityOverrideByScope[scope.scopeId] !== undefined}
              switchPct={m.scenario.contextSwitchCostPct ?? m.data.contextSwitchCostPct}
              switchChanged={m.scenario.contextSwitchCostPct !== null}
              openDecisions={openGates.length}
              decisionsChanged={m.scenario.resolvedGateIds.size > 0}
            />
          </div>

          {/* THE HAND. Its own physics: a small lift and lean while carried;
              straightens and settles toward a seat it can take. No wobble. */}
          <DragOverlay dropAnimation={{ duration: 240, easing: "cubic-bezier(0.25, 0, 0.2, 1)" }}>
            {dragging && (
              <motion.div
                initial={{ scale: 1, rotate: 0, y: 0 }}
                animate={
                  acquiringShelf
                    ? { scale: 1.005, rotate: 0, y: 3 }
                    : acquiringBay
                      ? { scale: 1.005, rotate: 0, y: -2 }
                      : { scale: 1.028, rotate: -0.7, y: 0 }
                }
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="relative"
                style={{
                  cursor: "grabbing",
                  width: tileWidth(dragging.bypassed ? realityShareOf(dragging) : shareOf(dragging)),
                  height: TILE_H,
                }}
              >
                {/* Carried back over the deck, a parked module re-energizes in
                    the hand — the preview of coming back to life. The reverse
                    (dimming pre-drop) is deliberately absent: a thing going
                    dark while you hold it reads as losing grip, not intent. */}
                <CapabilityTile
                  feature={dragging}
                  share={dragging.bypassed ? realityShareOf(dragging) : shareOf(dragging)}
                  material={acquiringBay ? "seated" : materialOf(dragging)}
                  lifted
                />
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

// ── ONE SEATED MODULE ────────────────────────────────────────────────────
//
// A seat cut into the chassis, with its module in it. While the module is in
// the hand, the seat stays — same footprint, now visibly empty — so the
// composition never collapses under the pointer. When the module leaves for
// good, the seat closes AFTER the module has landed elsewhere: the chassis
// reaches its new equilibrium as a consequence, not simultaneously.
function SeatedModule({
  feature,
  share,
  isDragging,
  onOpen,
}: {
  feature: Feature;
  share: number;
  isDragging: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: feature.id });
  const w = tileWidth(share);
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, width: w }}
      exit={{ width: 0, marginRight: 0, opacity: 0, transition: { delay: 0.18, duration: 0.32, ease: [0.3, 0, 0.25, 1] } }}
      transition={{ type: "spring", stiffness: 330, damping: 33 }}
      className="relative shrink-0"
      style={{ width: w, height: TILE_H, marginRight: 12, marginBottom: 12 }}
    >
      <Seat />
      {!isDragging && (
        <CapabilityTile
          feature={feature}
          share={share}
          material={materialOf(feature)}
          onOpen={onOpen}
          setNodeRef={setNodeRef}
          dragHandleProps={{ ...listeners, ...attributes }}
        />
      )}
    </motion.div>
  );
}

/** A seat opening to receive an approaching module. It opens at the position
    the module will truly take, and the neighbours yield around it. */
function OfferedSeat({ width, armed, tone }: { width: number; armed: boolean; tone: string }) {
  return (
    <motion.div
      layout
      initial={{ width: 0, marginRight: 0, opacity: 0 }}
      animate={{ width, marginRight: 12, opacity: 1 }}
      exit={{ width: 0, marginRight: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative shrink-0"
      style={{ height: TILE_H, marginBottom: 12 }}
      data-shoot="offered-seat"
    >
      <Seat armed={armed} tone={tone} />
    </motion.div>
  );
}

// ── THE CHASSIS BAY ──────────────────────────────────────────────────────

function ChassisBay({
  engaged,
  dragging,
  shareOf,
  realityShareOf,
  offeringSeat,
  seatArmed,
  onOpen,
  onAdd,
  title,
  subtitle,
}: {
  engaged: Feature[];
  dragging: Feature | null;
  shareOf: (f: Feature) => number;
  realityShareOf: (f: Feature) => number;
  /** True while a parked module is in the hand: its seat opens here. */
  offeringSeat: boolean;
  seatArmed: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  title: string;
  subtitle: string;
}) {
  const { setNodeRef } = useDroppable({ id: BAY_IN });

  // Where the returning module will seat, honestly.
  const insertionAt = offeringSeat && dragging ? seatIndexFor(engaged, dragging) : -1;

  const row: React.ReactNode[] = engaged.map((f) => (
    <SeatedModule key={f.id} feature={f} share={shareOf(f)} isDragging={dragging?.id === f.id} onOpen={() => onOpen(f.id)} />
  ));
  if (insertionAt >= 0 && dragging) {
    row.splice(
      insertionAt,
      0,
      <OfferedSeat key="__offered" width={tileWidth(realityShareOf(dragging))} armed={seatArmed} tone="var(--i-text)" />
    );
  }

  return (
    <section ref={setNodeRef} data-shoot="bay-in">
      {/* One machined deck. No perimeter feedback, ever: what changes during a
          drag changes INSIDE it — a seat empties, a seat opens, a rim wakes. */}
      <div
        className="relative rounded-2xl px-5 pt-4 pb-2"
        style={{
          background: "linear-gradient(180deg, #13181c 0%, #0e1215 100%)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.045) inset, 0 -1px 0 rgba(0,0,0,0.55) inset, 0 22px 55px rgba(0,0,0,0.42)",
        }}
      >
        <div className="flex items-baseline gap-3 pb-3">
          <h1 className="i-label" style={{ letterSpacing: "0.2em", color: "var(--i-text-soft)" }}>
            {title}
          </h1>
          <span className="text-[10px] text-[var(--i-text-faint)]">{subtitle}</span>
        </div>
        {/* The datum: an engraved line the modules align to. */}
        <div aria-hidden className="mb-4" style={{ height: 1, background: "rgba(0,0,0,0.55)", boxShadow: "0 1px 0 rgba(255,255,255,0.035)" }} />

        <div className="flex flex-wrap items-start">
          <AnimatePresence initial={false}>{row}</AnimatePresence>

          {/* An unpopulated seat, not a dashed CTA box: the chassis has room
              for a capability that does not exist yet. */}
          <motion.button
            layout
            onClick={onAdd}
            data-shoot="add-feature"
            className="relative shrink-0 group"
            style={{ width: 132, height: TILE_H, marginRight: 12, marginBottom: 12 }}
            transition={{ type: "spring", stiffness: 330, damping: 33 }}
          >
            <Seat />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-45 group-hover:opacity-90 transition-opacity">
              <span className="text-[18px] leading-none text-[var(--i-text-soft)]">+</span>
              <span className="text-[10px] text-[var(--i-text-faint)]">Add capability</span>
            </span>
          </motion.button>
        </div>
      </div>
    </section>
  );
}

// ── THE SHELF ────────────────────────────────────────────────────────────
//
// Asleep, it is a shallow recess with an etched label — present, quiet,
// claiming almost nothing. It wakes with the pointer's APPROACH (the `pull`
// motion value, 0→1 over the last ~300px), opens a seat when a module is
// carried, arms fully at contact, and settles once the module is set down.
// Parked modules stay visible and dormant: still in Reality, not in the mix.
function OutShelf({
  shelfEl,
  features,
  shareOf,
  dragging,
  pull,
  receiving,
  armed,
  onOpen,
}: {
  shelfEl: React.MutableRefObject<HTMLDivElement | null>;
  features: Feature[];
  shareOf: (f: Feature) => number;
  dragging: Feature | null;
  pull: MotionValue<number>;
  receiving: boolean;
  armed: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: BAY_OUT });
  const wake = useSpring(pull, { stiffness: 170, damping: 26 });
  const lipGlow = useTransform(wake, [0, 1], [0, 0.55]);
  const labelTone = useTransform(wake, [0, 1], ["var(--i-text-faint)", "var(--i-violet)"]);
  // The recess OPENS in proportion to the pointer's approach — not a snap at
  // pickup, not a flip at hover. Holding parked modules, it stays open.
  const REST_H = 48;
  const OPEN_H = TILE_H + 66;
  const pullHeight = useTransform(wake, [0, 1], [REST_H, OPEN_H]);

  const holding = features.length > 0;
  const insertionAt = receiving && dragging ? seatIndexFor(features, dragging) : -1;

  const row: React.ReactNode[] = features.map((f) => (
    <SeatedModule key={f.id} feature={f} share={shareOf(f)} isDragging={dragging?.id === f.id} onOpen={() => onOpen(f.id)} />
  ));
  if (insertionAt >= 0 && dragging) {
    row.splice(
      insertionAt,
      0,
      <OfferedSeat key="__offered-out" width={tileWidth(shareOf(dragging))} armed={armed} tone="var(--i-violet)" />
    );
  }

  return (
    <motion.div
      ref={(el) => {
        setNodeRef(el);
        shelfEl.current = el;
      }}
      data-shoot="bay-out"
      data-armed={armed ? "true" : "false"}
      className="relative overflow-hidden rounded-xl shrink-0"
      style={{
        height: holding ? undefined : pullHeight,
        background: "#080b0d",
        boxShadow: "inset 0 5px 14px rgba(0,0,0,0.62), inset 0 1px 0 rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.035)",
      }}
      initial={false}
      {...(holding
        ? { animate: { height: OPEN_H }, transition: { type: "spring", stiffness: 260, damping: 30 } }
        : {})}
    >
      {/* The lip lighting as the hand approaches — the boundary announcing
          itself, in proportion to intent. */}
      <motion.span
        aria-hidden
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: 42,
          opacity: lipGlow,
          background: "linear-gradient(180deg, color-mix(in srgb, var(--i-violet) 16%, transparent), transparent)",
        }}
      />
      <div className="flex items-baseline gap-3 px-4 pt-3.5 pb-2">
        <motion.span className="i-label" style={{ letterSpacing: "0.2em", color: labelTone }}>
          Out of this release
        </motion.span>
        <AnimatePresence>
          {receiving && (
            <motion.span
              key={armed ? "let-go" : "bring"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[10px]"
              style={{ color: armed ? "var(--i-violet)" : "var(--i-text-faint)" }}
            >
              {armed ? "let go — out of this release" : "set it down here to try the release without it"}
            </motion.span>
          )}
          {!receiving && features.length > 0 && (
            <motion.span
              key="kept"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[10px] text-[var(--i-text-faint)]"
            >
              still in Reality — nothing here is deleted
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-start px-4">
        <AnimatePresence initial={false}>{row}</AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── THE READOUT ──────────────────────────────────────────────────────────
//
// An instrument readout, not a dashboard: one column on the void, values on
// leader lines, sections separated by space and small caps. The staging is
// the point — the load resolves first, the landing date last, both after the
// object has physically settled. In the dominated case the date does not
// move at all, and only its caption re-arrives to say the stillness is a
// result, not a hang.
function ReleaseReadout(props: {
  scopeName: string;
  likelyDate: Date;
  realityDate: Date;
  movedDays: number;
  loadDays: number;
  realityLoadDays: number;
  active: boolean;
  bypassed: Feature[];
  onPutBack: (f: Feature) => void;
  coverage: { total: number; unmapped: number };
  dominance: ReturnType<typeof readDominance>;
  startDate: Date;
  capacity: number;
  capacityChanged: boolean;
  switchPct: number;
  switchChanged: boolean;
  openDecisions: number;
  decisionsChanged: boolean;
}) {
  const p = props;
  const dom = p.dominance;
  const held = p.active && p.movedDays === 0;
  return (
    <div
      data-shoot="master"
      className="absolute flex flex-col"
      style={{ right: 30, top: 76, bottom: 16, width: 284, overflowY: "auto" }}
    >
      <div className="i-label">{p.scopeName} lands</div>
      {/* The date arrives LAST in the causal chain: object (~240ms) → seat
          closes → load → date. Keyed so an unchanged date never re-animates. */}
      <motion.div
        key={fmtFull(p.likelyDate)}
        initial={{ opacity: 0, y: 7 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.42, ease: "easeOut" }}
        className="i-readout mt-2 leading-none"
        style={{ fontSize: 30, letterSpacing: "-0.03em", color: p.movedDays !== 0 ? "var(--i-violet)" : "var(--i-text)" }}
      >
        {fmtFull(p.likelyDate)}
      </motion.div>
      {/* The caption re-arrives on every recomposition — including the one
          where the date held still. That re-arrival IS the dominated case's
          acknowledgement: reconsidered, unchanged. */}
      <motion.div
        key={`${p.loadDays.toFixed(1)}-${p.movedDays}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.5 }}
        className="mt-2 text-[10.5px]"
      >
        {p.movedDays !== 0 ? (
          <>
            <span style={{ color: deltaTone(p.movedDays) }}>{deltaLabel(p.movedDays)}</span>
            <span className="text-[var(--i-text-faint)]"> · Reality {fmtDay(p.realityDate)}</span>
          </>
        ) : held ? (
          <span className="text-[var(--i-text-soft)]">held — this scenario does not move the date</span>
        ) : (
          <span className="text-[var(--i-text-faint)]">Reality</span>
        )}
      </motion.div>
      <Link
        href="/forecast"
        data-shoot="open-forecast"
        className="mt-3.5 inline-block text-[11px] transition-colors"
        style={{ color: p.active ? "var(--i-violet)" : "var(--i-text-soft)" }}
      >
        See the consequence in Forecast →
      </Link>

      <div className="mt-7 space-y-2.5">
        <ReadoutRow
          label="Release load"
          value={
            <motion.span
              key={p.loadDays.toFixed(1)}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: 0.24 }}
              className="inline-block"
              style={{ color: p.active ? "var(--i-violet)" : "var(--i-text)" }}
            >
              {p.loadDays.toFixed(1)}d
            </motion.span>
          }
          note={
            p.active
              ? `Reality ${p.realityLoadDays.toFixed(1)}d · ${(p.realityLoadDays - p.loadDays).toFixed(1)}d removed`
              : `${p.coverage.total} work items underneath`
          }
        />
        {p.coverage.unmapped > 0 && (
          <ReadoutRow
            label="Coverage"
            value={<span style={{ color: "var(--i-amber)" }}>{p.coverage.total - p.coverage.unmapped}/{p.coverage.total} mapped</span>}
            note={`${p.coverage.unmapped} work item${p.coverage.unmapped === 1 ? "" : "s"} belong to no capability yet`}
          />
        )}
      </div>

      {p.bypassed.length > 0 && (
        <div className="mt-6">
          <div className="i-label" style={{ color: "var(--i-violet)" }}>
            Out of this release
          </div>
          <ul className="mt-1.5 space-y-1">
            {p.bypassed.map((f) => (
              <li key={f.id} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-soft)]">{f.name}</span>
                <button
                  onClick={() => p.onPutBack(f)}
                  data-shoot="master-put-back"
                  className="shrink-0 text-[10px] transition-[filter] hover:brightness-125"
                  style={{ color: "var(--i-violet)" }}
                >
                  put back
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dom && dom.floorDays > 0.5 && (
        <div className="mt-6">
          <div className="i-label" style={{ color: dom.dominated ? "var(--i-amber)" : undefined }}>
            Can&apos;t land before
          </div>
          <div className="i-readout mt-1.5 text-[13px]" style={{ color: dom.dominated ? "var(--i-amber)" : "var(--i-text)" }}>
            {fmtDay(new Date(p.startDate.getTime() + dom.floorDays * 86400000))}
          </div>
          <p className="mt-1 text-[10px] text-[var(--i-text-faint)] leading-snug">
            {dom.dominated
              ? `Taking capabilities out will not move this — ${dom.phrase}.`
              : `Even with nothing left to build — ${dom.phrase}.`}
          </p>
        </div>
      )}

      <div className="mt-7 space-y-2.5">
        <Inherited label="Capacity" value={`${formatCapacity(p.capacity)} FTE`} href="/portfolio" owner="Portfolio" changed={p.capacityChanged} />
        <Inherited label="Context switch" value={`${p.switchPct}%`} href="/portfolio" owner="Portfolio" changed={p.switchChanged} />
        <Inherited label="Open decisions" value={`${p.openDecisions}`} href="/decisions" owner="Decisions" changed={p.decisionsChanged} />
      </div>
    </div>
  );
}

function ReadoutRow({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="i-label">{label}</span>
        <span className="flex-1 h-px" style={{ background: "var(--i-border)" }} />
        <span className="i-readout text-[13px] text-[var(--i-text)]">{value}</span>
      </div>
      {note && <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)] leading-snug">{note}</div>}
    </div>
  );
}

function Inherited({
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

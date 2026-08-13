"use client";

// SCOPE — play what ships.
//
// THE OBJECT IS THE TRAY. Capabilities are physical tiles seated in a lit bay
// that IS this release. You pick one up, the bay makes room, you carry it to
// the dark shelf below, and the release recomposes around the hole it left.
// Manipulating the object is manipulating the model: a tile leaving the tray
// removes its work items from the simulation on the next frame.
//
// THREE MATERIALS, one glance (see CapabilityTile):
//   seated    accepted Reality, touching the surface, contact shadow
//   spectral  a Hermes candidate or an unsaved draft -- hovering just above the
//             tray, never seated, because its work is counted but its
//             existence as a capability is not settled
//   raw       unmapped work: uncut material that has not found its place
//
// DRAG ENGINE. @dnd-kit/core for sensors, collision, overlay and screen-reader
// announcements; Motion for the physics -- layout FLIP so neighbours make room
// continuously, and springs so things settle rather than bounce. See
// docs/SCOPE-INSTRUMENT.md for why those two and not the alternatives.
//
// The source tile deliberately does NOT carry dnd-kit's transform. It becomes
// a depression in the tray and the real tile flies in a DragOverlay, which
// keeps Motion's layout animation free of a competing transform and gives the
// lifted object its own physics.
//
// OWNERSHIP. Scope owns which capabilities are in. Capacity is Portfolio's,
// decisions are Decisions', release dates are Timeline's, and the synthesized
// consequence is Forecast's -- each shown where it bears on the composition,
// read-only, with a door.

import { useCallback, useMemo, useState } from "react";
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
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import FeatureDetail, { AddFeature } from "@/components/instrument/FeatureDetail";
import CapabilityTile, { TileSlot, materialOf, tileWidth, TILE_H } from "@/components/instrument/CapabilityTile";
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

export default function ScopeInstrument() {
  const m = useProject();
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [openFeatureId, setOpenFeatureId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<Feature | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // A small distance constraint keeps click-to-open and drag-to-move as
  // separate gestures on the same object -- you should not have to aim.
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
  // never disagree.
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
  // A bypassed tile keeps the footprint it had in Reality, so the shelf shows
  // what was set down rather than a shrunken souvenir of it.
  const realityShareOf = (f: Feature) => {
    const r = reality.features.find((x) => x.id === f.id);
    return r && reality.loadDays > 0 ? r.loadDays / reality.loadDays : 0;
  };

  const openFeature = composition.features.find((f) => f.id === openFeatureId) ?? null;
  const openGates = scope.gates.filter((g) => !m.scenario.resolvedGateIds.has(g.id));

  const onDragStart = (e: DragStartEvent) => {
    const f = composition.features.find((x) => x.id === e.active.id);
    setDragging(f ?? null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const f = composition.features.find((x) => x.id === e.active.id);
    const target = e.over?.id;
    setDragging(null);
    setOver(null);
    if (!f || !target) return; // cancelled, or dropped on nothing: it goes home
    if (target === BAY_OUT && !f.bypassed) setBypassed(f, true);
    if (target === BAY_IN && f.bypassed) setBypassed(f, false);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(composition.features, active.id)}.`,
    onDragOver: ({ over: o }) =>
      o?.id === BAY_OUT
        ? "Over: out of this release."
        : o?.id === BAY_IN
          ? "Over: in this release."
          : "Not over a bay.",
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
      {/* reducedMotion="user" makes every Motion animation below honour the OS
          setting without a single per-component check. */}
      <MotionConfig reducedMotion="user">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          accessibility={{ announcements }}
          onDragStart={onDragStart}
          onDragOver={(e) => setOver((e.over?.id as string) ?? null)}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setDragging(null);
            setOver(null);
          }}
        >
          <div className="flex-1 min-h-0 flex gap-5 px-6 py-5" style={{ background: "var(--i-void)" }}>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-4">
              <ReleaseBay
                features={composition.features.filter((f) => !f.bypassed)}
                shareOf={shareOf}
                draggingId={dragging?.id ?? null}
                active={over === BAY_IN && !!dragging?.bypassed}
                onOpen={setOpenFeatureId}
                onAdd={() => setAdding(true)}
                title={`${scope.name} · in this release`}
                subtitle={`${composition.engaged.length} capabilit${composition.engaged.length === 1 ? "y" : "ies"}${
                  composition.unmappedItems > 0 ? ` · ${composition.unmappedItems} unassigned work item${composition.unmappedItems === 1 ? "" : "s"}` : ""
                }`}
              />
              <OutShelf
                features={composition.bypassed}
                shareOf={realityShareOf}
                draggingId={dragging?.id ?? null}
                armed={over === BAY_OUT && !dragging?.bypassed}
                hasHand={!!dragging}
                onOpen={setOpenFeatureId}
              />
            </div>

            <ReleaseMaster
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

          {/* THE HAND. Rendered in a portal so it is never clipped by a bay,
              and given its own mass: it lifts, tilts a little, and casts. */}
          <DragOverlay dropAnimation={{ duration: 260, easing: "cubic-bezier(0.2, 0, 0.2, 1)" }}>
            {dragging && (
              <motion.div
                initial={{ scale: 1, rotate: 0 }}
                animate={{ scale: 1.04, rotate: -1.1 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                style={{ cursor: "grabbing" }}
              >
                <CapabilityTile
                  feature={dragging}
                  share={dragging.bypassed ? realityShareOf(dragging) : shareOf(dragging)}
                  material={materialOf(dragging)}
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

// ── THE BAY ──────────────────────────────────────────────────────────────

function ReleaseBay({
  features,
  shareOf,
  draggingId,
  active,
  onOpen,
  onAdd,
  title,
  subtitle,
}: {
  features: Feature[];
  shareOf: (f: Feature) => number;
  draggingId: string | null;
  active: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  title: string;
  subtitle: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BAY_IN });
  const lit = active || isOver;
  return (
    <section className="flex flex-col">
      <div className="shrink-0 flex items-baseline gap-3 mb-2.5">
        <h1 className="i-label" style={{ letterSpacing: "0.2em", color: "var(--i-text-soft)" }}>
          {title}
        </h1>
        <span className="text-[10.5px] text-[var(--i-text-faint)]">{subtitle}</span>
      </div>
      <motion.div
        ref={setNodeRef}
        className="overflow-y-auto rounded-xl px-4 py-4"
        animate={{
          borderColor: lit ? "var(--i-mint)" : "var(--i-border)",
          backgroundColor: lit ? "color-mix(in srgb, var(--i-mint) 4%, var(--i-bg))" : "var(--i-bg)",
        }}
        transition={{ duration: 0.22 }}
        style={{
          border: "1px solid var(--i-border)",
          boxShadow: "0 3px 16px rgba(0,0,0,0.4) inset",
          minHeight: TILE_H + 34,
          maxHeight: TILE_H * 2 + 62,
        }}
        data-shoot="bay-in"
      >
        <div className="flex flex-wrap gap-3 items-start">
          <AnimatePresence initial={false} mode="popLayout">
            {features.map((f) => (
              <DraggableTile
                key={f.id}
                feature={f}
                share={shareOf(f)}
                isDragging={draggingId === f.id}
                onOpen={() => onOpen(f.id)}
              />
            ))}
          </AnimatePresence>
          <motion.button
            layout
            onClick={onAdd}
            data-shoot="add-feature"
            className="shrink-0 rounded-[10px] flex flex-col items-center justify-center gap-1.5 group"
            style={{
              width: 140,
              height: TILE_H,
              border: "1px dashed var(--i-border-strong)",
              color: "var(--i-text-faint)",
            }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <span className="text-[19px] leading-none group-hover:text-[var(--i-text)] transition-colors">+</span>
            <span className="text-[10.5px] group-hover:text-[var(--i-text-soft)] transition-colors">Add capability</span>
          </motion.button>
        </div>
      </motion.div>
    </section>
  );
}

// The source tile does not move -- it becomes a depression, and the overlay
// carries the real object. That is what keeps the composition spatially
// continuous instead of collapsing under the hand.
function DraggableTile({
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
  if (isDragging) return <TileSlot width={tileWidth(share)} />;
  return (
    <CapabilityTile
      feature={feature}
      share={share}
      material={materialOf(feature)}
      onOpen={onOpen}
      setNodeRef={setNodeRef}
      dragHandleProps={{ ...listeners, ...attributes }}
    />
  );
}

// ── THE SHELF ────────────────────────────────────────────────────────────
//
// A dark recess below the lit bay. Empty in Reality, and it says so in one
// quiet line rather than a giant instructional box. It arms as the hand
// approaches, which is how the exclusion boundary becomes intentional.
function OutShelf({
  features,
  shareOf,
  draggingId,
  armed,
  hasHand,
  onOpen,
}: {
  features: Feature[];
  shareOf: (f: Feature) => number;
  draggingId: string | null;
  armed: boolean;
  hasHand: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BAY_OUT });
  const lit = armed || isOver;
  const empty = features.length === 0;
  return (
    <motion.section
      ref={setNodeRef}
      data-shoot="bay-out"
      data-armed={lit ? "true" : "false"}
      className="shrink-0 rounded-xl px-4"
      animate={{
        height: empty && !hasHand ? 78 : Math.max(118, TILE_H + 56),
        borderColor: lit ? "var(--i-violet)" : "var(--i-border)",
        backgroundColor: lit ? "color-mix(in srgb, var(--i-violet) 8%, var(--i-void))" : "var(--i-void)",
      }}
      transition={{ type: "spring", stiffness: 300, damping: 34 }}
      style={{ border: "1px dashed var(--i-border)", boxShadow: "0 6px 22px rgba(0,0,0,0.55) inset", paddingTop: 12, paddingBottom: 12 }}
    >
      <div className="flex items-baseline gap-3">
        <motion.span
          className="i-label"
          animate={{ color: lit ? "var(--i-violet)" : "var(--i-text-faint)" }}
          style={{ letterSpacing: "0.2em" }}
        >
          Out of this release
        </motion.span>
        <span className="text-[10px] text-[var(--i-text-faint)]">
          {empty
            ? lit
              ? "let go to take it out"
              : "nothing is out — drag a capability here to try the release without it"
            : "still in Reality; nothing here is deleted"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 items-start">
        <AnimatePresence initial={false} mode="popLayout">
          {features.map((f) => (
            <DraggableTile
              key={f.id}
              feature={f}
              share={shareOf(f)}
              isDragging={draggingId === f.id}
              onOpen={() => onOpen(f.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

// ── THE MASTER ───────────────────────────────────────────────────────────

function ReleaseMaster(props: {
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
  return (
    <div
      className="shrink-0 flex flex-col rounded-xl overflow-hidden self-center"
      data-shoot="master"
      style={{ width: 286, background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      <div className="px-4 pt-4 pb-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="i-label">{p.scopeName} lands</div>
        {/* The consequence arrives a beat AFTER the tile settles -- the object
            moves first, the number follows. */}
        <motion.div
          key={fmtFull(p.likelyDate)}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
          className="i-readout mt-2 leading-none"
          style={{ fontSize: 26, letterSpacing: "-0.03em", color: p.movedDays !== 0 ? "var(--i-violet)" : "var(--i-text)" }}
        >
          {fmtFull(p.likelyDate)}
        </motion.div>
        <div className="mt-2 text-[10.5px]">
          {p.movedDays !== 0 ? (
            <>
              <span style={{ color: deltaTone(p.movedDays) }}>{deltaLabel(p.movedDays)}</span>
              <span className="text-[var(--i-text-faint)]"> · Reality {fmtDay(p.realityDate)}</span>
            </>
          ) : (
            <span className="text-[var(--i-text-faint)]">
              {p.active ? "unchanged by this scenario" : "Reality"}
            </span>
          )}
        </div>
        <Link
          href="/forecast"
          data-shoot="open-forecast"
          className="mt-3 block rounded-md px-3 py-2 text-center text-[11px] transition-colors"
          style={{
            border: `1px solid ${p.active ? "var(--i-violet)" : "var(--i-border-strong)"}`,
            color: p.active ? "var(--i-violet)" : "var(--i-text-soft)",
          }}
        >
          See the consequence in Forecast →
        </Link>
      </div>

      <div className="px-4 py-3.5 space-y-3" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="i-label">Release load</span>
            <span className="i-readout text-[13px]" style={{ color: p.active ? "var(--i-violet)" : "var(--i-text)" }}>
              {p.loadDays.toFixed(1)}d
            </span>
          </div>
          <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)] leading-snug">
            {p.active
              ? `Reality ${p.realityLoadDays.toFixed(1)}d · ${(p.realityLoadDays - p.loadDays).toFixed(1)}d removed`
              : `${p.coverage.total} work items underneath`}
          </div>
        </div>

        {p.bypassed.length > 0 && (
          <div>
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

        {p.coverage.unmapped > 0 && (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="i-label">Coverage</span>
              <span className="i-readout text-[13px]" style={{ color: "var(--i-amber)" }}>
                {p.coverage.total - p.coverage.unmapped}/{p.coverage.total} mapped
              </span>
            </div>
            <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)] leading-snug">
              {p.coverage.unmapped} work item{p.coverage.unmapped === 1 ? "" : "s"} belong to no capability yet
            </div>
          </div>
        )}
      </div>

      {/* The dominated truth, as an output rather than the organising idea. */}
      {dom && dom.floorDays > 0.5 && (
        <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div className="i-label" style={{ color: dom.dominated ? "var(--i-amber)" : undefined }}>
            Can&apos;t land before
          </div>
          <div
            className="i-readout mt-1.5 text-[13px]"
            style={{ color: dom.dominated ? "var(--i-amber)" : "var(--i-text)" }}
          >
            {fmtDay(new Date(p.startDate.getTime() + dom.floorDays * 86400000))}
          </div>
          <p className="mt-1 text-[10px] text-[var(--i-text-faint)] leading-snug">
            {dom.dominated
              ? `Taking capabilities out will not move this — ${dom.phrase}.`
              : `Even with nothing left to build — ${dom.phrase}.`}
          </p>
        </div>
      )}

      <div className="px-4 py-3.5 space-y-2.5">
        <Inherited label="Capacity" value={`${formatCapacity(p.capacity)} FTE`} href="/portfolio" owner="Portfolio" changed={p.capacityChanged} />
        <Inherited label="Context switch" value={`${p.switchPct}%`} href="/portfolio" owner="Portfolio" changed={p.switchChanged} />
        <Inherited label="Open decisions" value={`${p.openDecisions}`} href="/decisions" owner="Decisions" changed={p.decisionsChanged} />
      </div>
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

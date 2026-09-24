"use client";

// SCOPE COMPOSER — a physical composition instrument. You compose what ships
// by picking capability modules up and putting them down.
//
//   header      a nameplate, and ONE piece of inset glass carrying the
//               landing date (dominant), the release load (secondary) and the
//               scenario impact (dark until there is a scenario)
//   deck        IN THIS RELEASE — a chassis of capability modules, each with
//               its own distribution display. Exactly three kinds of cell:
//               OCCUPIED, VACATED (a Scenario removal, holding its position),
//               and one RESERVE bay. Nothing is drawn to square off a grid
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/instrument/SignalLink";
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
import { useProjectParam } from "@/lib/shell/useProjectParam";
import { AnimatePresence, MotionConfig, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import FeatureDetail, { AddFeature } from "@/components/instrument/FeatureDetail";
import CapabilityTile, { Seat, materialOf, sigilPathFor, MODULE_H } from "@/components/instrument/CapabilityTile";
import {
  useProject,
  EMPTY_SCENARIO,
  fmtDay,
  deltaLabel,
  deltaTone,
  type ProjectScope,
} from "@/lib/instrument/useProject";
import { composeScopeFeatures, expectedDays, type Feature, type ThreePoint } from "@/lib/scope/features";
import { readDominance } from "@/lib/scope/constraint";
import { forecastDateAtDay } from "@/lib/forecast/simulate";
import { formatCapacity } from "@/lib/capacity/limits";
import { formatDateOnly } from "@/lib/time/dateContract";
import { partitionProductShape, type ShapeCapability } from "@/lib/scope/productShape";
import { evaluateForecastCoverage, type ForecastCoverageContract } from "@/lib/forecast/coverage";
import { mutateReality } from "@/lib/instrument/reality";
import type { ScopeWorkItem } from "@/lib/instrument/useProject";
import ToolWindow from "@/components/instrument/ToolWindow";
import ScopeReconciliation, { type ScopeProposalItemView, type ScopeProposalView } from "@/components/instrument/ScopeReconciliation";
import { bulkStageEligibleItems } from "@/lib/scope/proposalEligibility";

const BAY_IN = "bay-in";
const BAY_OUT = "bay-out";
const FRAME_BG = "#0c1013";
type PendingScopeChange =
  | { kind: "move"; capability: ShapeCapability; status: "accepted" | "outside"; itemIds: string[]; idempotencyKey: string }
  | { kind: "link"; capability: ShapeCapability; item: ScopeWorkItem; idempotencyKey: string }
  | { kind: "unlink"; capability: ShapeCapability; linkId: string; itemLabel: string; idempotencyKey: string };
type DraftCapabilityInput = {
  name: string;
  description: string;
  note: string;
  evidence: unknown[];
  workItemIds: string[];
  status: "accepted" | "outside" | "future";
};
// THE DECK LAYS OUT WHAT EXISTS. Cells are exactly: every capability this
// release has — seated or vacated — plus one reserve bay. There is no
// grid-completion step, so a small release is a short deck rather than a full
// rectangle of meaningless holes. A release only takes a second row when its
// real capabilities need one; a future row is never reserved in advance.
function packDeck(cellCount: number): { cols: number; rows: number } {
  if (cellCount <= 6) return { cols: Math.max(1, cellCount), rows: 1 };
  if (cellCount <= 12) return { cols: Math.ceil(cellCount / 2), rows: 2 };
  return { cols: 6, rows: Math.ceil(cellCount / 6) };
}

// Rows divide the deck rather than being stamped out at a fixed height, so a
// release always fits its rack and nothing is ever clipped. Past two rows the
// deck becomes a scrolling surface with fixed-size bays.
function rowGeometry(rows: number): React.CSSProperties {
  // A one-row release gets taller modules rather than a short row marooned in
  // a tall rack — the deck is the machine's face, so it keeps its height and
  // the modules take the proportions of a channel strip.
  if (rows === 1)
    return { height: "100%", gridTemplateRows: `minmax(${MODULE_H}px, ${MODULE_H + 150}px)`, alignContent: "center" };
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

export default function ScopeInstrument() {
  const m = useProject();
  // The URL owns which project is selected (lib/shell/useProjectParam), so
  // refresh, back/forward and a pasted link all reproduce it.
  const { projectId: scopeId, select: setScopeId } = useProjectParam(
    m.data ? m.data.scopes.map((s) => s.scopeId) : null
  );
  const [openFeatureId, setOpenFeatureId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<Feature | null>(null);
  const [draggingWork, setDraggingWork] = useState<ScopeWorkItem | null>(null);
  const [draggingOutside, setDraggingOutside] = useState<ShapeCapability | null>(null);
  const [pending, setPending] = useState<PendingScopeChange | null>(null);
  const [editing, setEditing] = useState<ShapeCapability | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [dragSize, setDragSize] = useState<{ w: number; h: number }>({ w: 250, h: MODULE_H });
  const [over, setOver] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ScopeProposalView | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalWarning, setProposalWarning] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalCommitting, setProposalCommitting] = useState(false);
  const [proposalCommitError, setProposalCommitError] = useState<string | null>(null);
  const [proposalCommitted, setProposalCommitted] = useState(false);

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

  const refreshProposal = useCallback(async () => {
    if (!scope?.scopeId) return;
    setProposalLoading(true);
    setProposalError(null);
    setProposalWarning(null);
    setProposalCommitted(false);
    try {
      const response = await fetch(`/api/scopes/${scope.scopeId}/proposal`, { method: "POST", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && !body.proposal) throw new Error(body.error ?? "Scope proposal could not be composed.");
      setProposal(body.proposal ? { ...body.proposal, stale: Boolean(body.stale) } : null);
      setProposalWarning(body.warning ?? null);
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "Scope proposal could not be composed.");
    } finally {
      setProposalLoading(false);
    }
  }, [scope?.scopeId]);

  useEffect(() => {
    setProposal(null);
    setProposalCommitError(null);
    void refreshProposal();
  }, [refreshProposal]);

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
              aria-pressed={s.scopeId === scope?.scopeId}
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

  const productShape = partitionProductShape(scope.capabilities);
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
  const proposalSelections = m.scenario.scopeProposalSelections.filter((selection) => selection.scopeId === scope.scopeId);
  const stagedWorkIds = new Set(proposalSelections.flatMap((selection) => selection.itemIds));
  const scenarioItems = [
    ...scope.items,
    ...scope.executionItems.filter((item) => (m.scenario.includedItemIds.has(item.id) || stagedWorkIds.has(item.id)) && !scope.items.some((baseItem) => baseItem.id === item.id)),
  ];
  const scenarioCapabilities = scope.capabilities.map((capability) => {
    const staged = proposalSelections.filter((selection) => selection.targetCapabilityId === capability.id);
    const stagedStatus = staged.at(-1)?.releaseStatus;
    const removedLinkIds = new Set(proposalSelections.flatMap((selection) => {
      if (selection.sourceCapabilityId !== capability.id) return [];
      if (selection.targetCapabilityId !== capability.id) return selection.itemIds;
      const selected = new Set(selection.itemIds);
      return selection.sourceAlreadyLinkedItemIds.filter((id) => !selected.has(id));
    }));
    const additionalLinks = staged.flatMap((selection) => selection.itemIds)
      .filter((id) => !capability.workLinks.some((link) => link.externalId === id))
      .map((externalId) => ({ id: `proposal-link:${capability.id}:${externalId}`, provider: "linear", externalId, externalUrl: null, state: "active" }));
    return {
      ...capability,
      status: stagedStatus ?? (m.scenario.includedCapabilityIds.has(capability.id) ? "accepted" : capability.status),
      workLinks: [...capability.workLinks.filter((link) => !removedLinkIds.has(link.externalId)), ...additionalLinks],
    };
  });
  const scenarioProductShape = partitionProductShape(scenarioCapabilities);
  const proposalDrafts = proposalSelections
    .filter((selection) => !selection.targetCapabilityId)
    .map((selection) => ({ id: `proposal:${selection.itemId}`, name: selection.title, intent: selection.description ?? "Proposed from current Linear hierarchy and structured context.", itemIds: selection.itemIds }));
  const proposalBypassed = new Set(m.scenario.bypassedFeatureIds);
  for (const selection of proposalSelections) {
    if (selection.releaseStatus !== "outside") continue;
    proposalBypassed.add(selection.targetCapabilityId ? `capability:${selection.targetCapabilityId}` : `proposal:${selection.itemId}`);
  }
  const scenarioCoverageCapabilities = [
    ...scenarioCapabilities.map((capability) => ({
      status: proposalBypassed.has(`capability:${capability.id}`) ? "outside" : capability.status,
      workLinks: capability.workLinks,
    })),
    ...proposalSelections
      .filter((selection) => !selection.targetCapabilityId)
      .map((selection) => ({
        status: selection.releaseStatus,
        workLinks: selection.itemIds.map((externalId) => ({ externalId, state: "active" })),
      })),
    ...m.scenario.draftFeatures.map((draft) => ({
      status: "accepted",
      workLinks: draft.itemIds.map((externalId) => ({ externalId, state: "active" })),
    })),
  ];
  const scenarioCoverage = evaluateForecastCoverage({
    executionState: scope.executionState,
    issueIds: scope.executionItems.map((item) => item.id),
    capabilities: scenarioCoverageCapabilities,
    openShapeDecisionCount: scope.openShapeQuestions.filter((question) => !m.scenario.resolvedGateIds.has(question.id)).length,
  });
  const displayedCoverage = m.active ? scenarioCoverage : scope.forecastCoverage;
  const composition = composeScopeFeatures(
    scenarioItems,
    scope.completedWork,
    scenarioCapabilities,
    capacity,
    proposalBypassed,
    m.scenario.estimateOverrideByItemId,
    [...m.scenario.draftFeatures, ...proposalDrafts],
    m.scenario.acceptedCandidateIds,
    m.scenario.knowledgeEstimateByCapabilityId,
    m.scenario.capabilityStaffingById,
    startDate,
    scope.targetDate ? new Date(scope.targetDate) : null,
  );
  const reality = composeScopeFeatures(scope.items, scope.completedWork, scope.capabilities, scope.teamCapacity, new Set(), {}, []);

  const activelyLinkedIds = new Set(
    scope.capabilities.flatMap((capability) => capability.workLinks)
      .filter((link) => link.state === "active" || link.state === "configured")
      .map((link) => link.externalId),
  );
  const unmappedExecution = scope.executionItems.filter((item) => !activelyLinkedIds.has(item.id));

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
  const scopeSourceIds = new Set(m.data.sources.filter((source) => source.scopeId === scope.scopeId).map((source) => source.id));
  const unrepresentedFindings = m.data.findings.filter(
    (finding) => finding.status === "open" && finding.matchedIssues.length === 0 && !!finding.sourceId && scopeSourceIds.has(finding.sourceId)
  );
  const dependencyNames = scope.dependsOnScopeIds.map((id) => scopeNameById.get(id) ?? id);
  const effortRemoved = reality.loadDays - composition.loadDays;

  const carryingSeated = !!dragging && !dragging.bypassed;
  const carryingParked = !!dragging && dragging.bypassed;
  const acquiringShelf = carryingSeated && over === BAY_OUT;
  const acquiringBay = carryingParked && (over === BAY_IN || Boolean(over?.startsWith("cap-drop:")));

  const onDragStart = (e: DragStartEvent) => {
    const activeId = String(e.active.id);
    if (activeId.startsWith("work:")) {
      setDraggingWork(scope.executionItems.find((item) => item.id === activeId.slice(5)) ?? null);
      setOpenFeatureId(null);
      return;
    }
    if (activeId.startsWith("outside:")) {
      setDraggingOutside(scope.capabilities.find((capability) => capability.id === activeId.slice(8)) ?? null);
      setOpenFeatureId(null);
      return;
    }
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
    setDraggingWork(null);
    setDraggingOutside(null);
    setOver(null);
    shelfPull.set(0);
    tilt.set(0);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const target = e.over?.id ? String(e.over.id) : null;
    if (activeId.startsWith("work:") && target?.startsWith("cap-drop:")) {
      const item = scope.executionItems.find((candidate) => candidate.id === activeId.slice(5));
      const capability = scope.capabilities.find((candidate) => candidate.id === target.slice(9));
      endDrag();
      if (item && capability) setPending({ kind: "link", capability, item, idempotencyKey: crypto.randomUUID() });
      return;
    }
    if (activeId.startsWith("outside:") && (target === BAY_IN || Boolean(target?.startsWith("cap-drop:")))) {
      const capability = scope.capabilities.find((candidate) => candidate.id === activeId.slice(8));
      endDrag();
      if (!capability) return;
      const ids = capability.workLinks.map((link) => link.externalId);
      m.setScenario((prev) => ({
        ...prev,
        includedCapabilityIds: new Set(prev.includedCapabilityIds).add(capability.id),
        includedItemIds: new Set([...prev.includedItemIds, ...ids]),
      }));
      setPending({ kind: "move", capability, status: "accepted", itemIds: ids, idempotencyKey: crypto.randomUUID() });
      return;
    }
    const f = composition.features.find((x) => x.id === e.active.id);
    endDrag();
    if (!f || !target) return;
    if (target === BAY_OUT && !f.bypassed) {
      setBypassed(f, true);
      if (f.canonicalCapability) setPending({ kind: "move", capability: f.canonicalCapability, status: "outside", itemIds: f.items.map((item) => item.id), idempotencyKey: crypto.randomUUID() });
    }
    if (target === BAY_IN && f.bypassed) setBypassed(f, false);
  };

  const commitPending = async () => {
    if (!pending) return;
    setWriting(true);
    setWriteError(null);
    try {
      const expectedRevision = pending.capability.revision ?? 1;
      const response = pending.kind === "move"
        ? await mutateReality(`/api/capabilities/${pending.capability.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedRevision, status: pending.status, idempotencyKey: pending.idempotencyKey }),
          })
        : pending.kind === "link"
          ? await mutateReality(`/api/capabilities/${pending.capability.id}/work-links`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expectedRevision, workItemIds: [pending.item.id], idempotencyKey: pending.idempotencyKey }),
            })
          : await mutateReality(`/api/capabilities/${pending.capability.id}/work-links/${pending.linkId}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expectedRevision, idempotencyKey: pending.idempotencyKey }),
            });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Scope Reality could not be saved.");
      if (pending.kind === "move") {
        m.setScenario((prev) => {
          const bypassedFeatureIds = new Set(prev.bypassedFeatureIds);
          bypassedFeatureIds.delete(`capability:${pending.capability.id}`);
          const excludedItemIds = new Set(prev.excludedItemIds);
          const includedItemIds = new Set(prev.includedItemIds);
          for (const id of pending.itemIds) {
            excludedItemIds.delete(id);
            includedItemIds.delete(id);
          }
          const includedCapabilityIds = new Set(prev.includedCapabilityIds);
          includedCapabilityIds.delete(pending.capability.id);
          return { ...prev, bypassedFeatureIds, excludedItemIds, includedItemIds, includedCapabilityIds };
        });
      }
      setPending(null);
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "Scope Reality could not be saved.");
    } finally {
      setWriting(false);
    }
  };

  const saveNewCapability = async (draft: DraftCapabilityInput) => {
    setWriting(true);
    setWriteError(null);
    try {
      const response = await mutateReality(`/api/scopes/${scope.scopeId}/capabilities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Capability could not be saved.");
      setAdding(false);
      return true;
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "Capability could not be saved.");
      return false;
    } finally {
      setWriting(false);
    }
  };

  const commitDraft = async (feature: Feature) => {
    const saved = await saveNewCapability({
      name: feature.name,
      description: feature.description ?? "",
      note: "Committed from a reviewed Scope Scenario.",
      evidence: [],
      workItemIds: feature.items.map((item) => item.id),
      status: "accepted",
    });
    if (!saved) return;
    m.setScenario((prev) => ({
      ...prev,
      draftFeatures: prev.draftFeatures.filter((draft) => draft.id !== feature.id),
    }));
    setOpenFeatureId(null);
  };

  const saveCapabilityEdit = async (input: { name: string; description: string; note: string; evidenceRef: string; workItemIds: string[] }) => {
    if (!editing) return;
    setWriting(true);
    setWriteError(null);
    try {
      const response = await mutateReality(`/api/capabilities/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: editing.revision ?? 1,
          name: input.name,
          description: input.description,
          note: input.note,
          evidence: input.evidenceRef.trim() ? [{ ref: input.evidenceRef.trim(), suppliedBy: "operator" }] : [],
          workItemIds: input.workItemIds,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Capability could not be saved.");
      setEditing(null);
      setOpenFeatureId(null);
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "Capability could not be saved.");
    } finally {
      setWriting(false);
    }
  };

  const stageProposalItem = (item: ScopeProposalItemView, targetCapabilityId: string | null, releaseStatus: "accepted" | "outside", itemIds: string[] = item.workItemIds) => {
    if (!proposal) return;
    const expectedRevision = targetCapabilityId
      ? scope.capabilities.find((capability) => capability.id === targetCapabilityId)?.revision ?? null
      : null;
    m.setScenario((prev) => ({
      ...prev,
      scopeProposalSelections: [
        ...prev.scopeProposalSelections.filter((selection) => !(selection.scopeId === scope.scopeId && selection.itemId === item.id)),
        {
          scopeId: scope.scopeId,
          proposalId: proposal.id,
          itemId: item.id,
          title: item.title,
          description: item.description,
          sourceCapabilityId: item.targetCapabilityId,
          sourceAlreadyLinkedItemIds: item.alreadyLinkedItemIds,
          targetCapabilityId,
          expectedRevision,
          itemIds,
          releaseStatus,
        },
      ],
    }));
    setProposalCommitError(null);
    setProposalCommitted(false);
  };

  const unstageProposalItem = (itemId: string) => m.setScenario((prev) => ({
    ...prev,
    scopeProposalSelections: prev.scopeProposalSelections.filter((selection) => !(selection.scopeId === scope.scopeId && selection.itemId === itemId)),
  }));

  const stageConfidentProposals = () => {
    if (!proposal) return;
    const alreadyStaged = new Set(proposalSelections.map((selection) => selection.itemId));
    for (const item of bulkStageEligibleItems(proposal.items, alreadyStaged)) {
      stageProposalItem(item, item.targetCapabilityId, item.releaseSignal === "likely_out" ? "outside" : "accepted");
    }
  };

  const commitProposalSelections = async () => {
    if (!proposal || proposalSelections.length === 0) return;
    setProposalCommitting(true);
    setProposalCommitError(null);
    try {
      const response = await mutateReality(`/api/scopes/${scope.scopeId}/proposal/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          idempotencyKey: crypto.randomUUID(),
          selections: proposalSelections.map(({ itemId, targetCapabilityId, expectedRevision, itemIds, releaseStatus }) => ({ itemId, targetCapabilityId, expectedRevision, workItemIds: itemIds, releaseStatus })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Reconciled Scope could not be committed.");
      m.setScenario((prev) => ({
        ...prev,
        scopeProposalSelections: prev.scopeProposalSelections.filter((selection) => selection.scopeId !== scope.scopeId),
      }));
      await refreshProposal();
      setProposalCommitted(true);
    } catch (error) {
      setProposalCommitError(error instanceof Error ? error.message : "Reconciled Scope could not be committed.");
    } finally {
      setProposalCommitting(false);
    }
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
                  date={formatDateOnly(res.likelyDate, { month: "short", day: "numeric", year: "numeric" })}
                  best={formatDateOnly(res.earliestDate)}
                  worst={formatDateOnly(res.latestDate)}
                  loadDays={composition.loadDays}
                  realityLoadDays={reality.loadDays}
                  capacityLabel={formatCapacity(capacity)}
                  movedDays={movedDays}
                  effortRemoved={effortRemoved}
                  active={m.active}
                  canonicalForecast={displayedCoverage.canonicalForecast && scope.capacityContract.reconciles}
                  dominancePhrase={dom?.dominated ? dom.phrase : null}
                  previewRelief={
                    carryingSeated && dragging ? dragging.effortDays / (capacity > 0 ? capacity : 1) : null
                  }
                />
              </div>

              <ProductShapeSummary
                accepted={m.active ? scenarioProductShape.accepted : productShape.accepted}
                coverage={displayedCoverage}
                executionSource={scope.executionSource}
                capacityReconciles={scope.capacityContract.reconciles}
                scenario={m.active}
              />

              {/* ── MAIN: the deck, then the strata it rests on ─────────── */}
              <div className="flex-1 min-h-0 flex flex-col gap-3.5 overflow-y-auto overscroll-contain px-5 pb-3.5" data-shoot="scope-workspace-scroll">
                <div className="h-[620px] shrink-0 flex gap-3.5">
                  <ReleaseRack
                    features={composition.features}
                    dragging={dragging}
                    shareOf={shareOf}
                    maxSpread={maxSpread}
                    seatArmed={acquiringBay}
                    onOpen={setOpenFeatureId}
                    onAdd={() => setAdding(true)}
                    ghostRangeOf={realityRangeOf}
                    scopeName={scope.name}
                    unmappedItems={composition.unmappedItems}
                    totalItems={composition.totalItems}
                    emptyTruth={{
                      openFindingCount: unrepresentedFindings.length,
                      gateDays: openGates.reduce((sum, gate) => sum + gate.likely, 0),
                      dependencyNames,
                      forecastAsOf: scope.executionSource.asOf,
                      sourceAvailability: scope.executionSource.availability,
                      scopeId: scope.scopeId,
                    }}
                    selectedId={openFeatureId}
                  />

                  <ScopeReconciliation
                    proposal={proposal}
                    loading={proposalLoading}
                    warning={proposalWarning}
                    error={proposalError}
                    realityRevision={scope.realityState?.realityRevision ?? 0}
                    capabilities={scope.capabilities.map(({ id, name, revision }) => ({ id, name, revision }))}
                    unmapped={unmappedExecution}
                    selections={proposalSelections}
                    committing={proposalCommitting}
                    commitError={proposalCommitError}
                    committed={proposalCommitted}
                    onRefresh={refreshProposal}
                    onStage={stageProposalItem}
                    onUnstage={unstageProposalItem}
                    onStageConfident={stageConfidentProposals}
                    onCommit={commitProposalSelections}
                  />
                </div>

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
                  governedOutside={scenarioProductShape.outsideRelease}
                  selectedId={openFeatureId}
                  onOpenOutside={setEditing}
                />

                <ConstraintStrip gates={openGates} openQuestions={scope.openShapeQuestions} scopeId={scope.scopeId} dominance={dom} startDate={startDate} truthReady={displayedCoverage.canonicalForecast && scope.capacityContract.reconciles} />

                <SignalStrip
                  capacityLabel={formatCapacity(capacity)}
                  capacitySource={
                    scope.capacitySource === "explicit"
                      ? "legacy explicit · unreconciled"
                      : scope.capacitySource === "allocations"
                        ? "named allocations · reconciled"
                        : "legacy inferred · unreconciled"
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
            {draggingWork && (
              <div className="w-[260px] rounded-lg border border-[var(--i-amber)]/50 bg-[#10151a] px-3 py-2 shadow-2xl">
                <div className="i-label text-[var(--i-amber)]">Linear execution</div>
                <div className="mt-1 truncate text-[11px] text-[var(--i-text)]">{draggingWork.label}</div>
              </div>
            )}
            {draggingOutside && (
              <div className="w-[220px] rounded-lg border border-[var(--i-violet)]/50 bg-[#10151a] px-3 py-3 shadow-2xl">
                <div className="i-label text-[var(--i-violet)]">Move into release</div>
                <div className="mt-1 text-[11px] text-[var(--i-text)]">{draggingOutside.name}</div>
              </div>
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
        staffingOptions={scope.capacityBasis.kind === "allocations"
          ? (scope.capacityBasis.contributors ?? []).map((contributor) => ({
              personId: contributor.personId,
              name: contributor.name,
              availableFte: contributor.effectiveFte,
            }))
          : []}
        onToggle={(out) => {
          if (!openFeature) return;
          setBypassed(openFeature, out);
          if (openFeature.canonicalCapability) {
            setPending({
              kind: "move",
              capability: openFeature.canonicalCapability,
              status: out ? "outside" : "accepted",
              itemIds: openFeature.items.map((item) => item.id),
              idempotencyKey: crypto.randomUUID(),
            });
          }
        }}
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
        onStageKnowledgeEstimate={(capabilityId, estimate) => {
          const range = estimate.range;
          if (!range) return;
          m.setScenario((prev) => ({
            ...prev,
            knowledgeEstimateByCapabilityId: {
              ...prev.knowledgeEstimateByCapabilityId,
              [capabilityId]: { estimateId: estimate.id, contextSnapshotId: estimate.contextSnapshotId, ...range },
            },
          }));
        }}
        onClearKnowledgeEstimate={(capabilityId) =>
          m.setScenario((prev) => {
            const next = { ...prev.knowledgeEstimateByCapabilityId };
            delete next[capabilityId];
            return { ...prev, knowledgeEstimateByCapabilityId: next };
          })
        }
        onSetCapabilityStaffing={(capabilityId, plan) =>
          m.setScenario((prev) => ({
            ...prev,
            capabilityStaffingById: { ...prev.capabilityStaffingById, [capabilityId]: plan },
          }))
        }
        onClearCapabilityStaffing={(capabilityId) =>
          m.setScenario((prev) => {
            const next = { ...prev.capabilityStaffingById };
            delete next[capabilityId];
            return { ...prev, capabilityStaffingById: next };
          })
        }
        onEditReality={(capability) => setEditing(capability)}
        onUnlinkReality={(capability, linkId, itemLabel) => setPending({
          kind: "unlink", capability, linkId, itemLabel, idempotencyKey: crypto.randomUUID(),
        })}
        onCommitDraft={commitDraft}
      />

      <AddFeature
        open={adding}
        onClose={() => setAdding(false)}
        unmappedItems={unmappedExecution}
        capacity={capacity}
        saving={writing}
        error={writeError}
        onSaveReality={saveNewCapability}
        onCreateScenario={(draft) => {
          m.setScenario((prev) => ({ ...prev, draftFeatures: [...prev.draftFeatures, draft] }));
          setAdding(false);
          setOpenFeatureId(draft.id);
        }}
      />

      <CapabilityRealityEditor
        capability={editing}
        unmappedItems={unmappedExecution}
        saving={writing}
        error={writeError}
        onClose={() => { setEditing(null); setWriteError(null); }}
        onSave={saveCapabilityEdit}
      />

      <ScopeImpactPreview
        change={pending}
        scope={scope}
        baseDate={base.likelyDate}
        previewDate={res.likelyDate}
        writing={writing}
        error={writeError}
        onKeepScenario={() => { setPending(null); setWriteError(null); }}
        onCommit={commitPending}
      />
    </InstrumentShell>
  );
}

function nameOf(features: Feature[], id: string | number) {
  return features.find((f) => f.id === id)?.name ?? "capability";
}

function CapabilityRealityEditor({
  capability,
  unmappedItems,
  saving,
  error,
  onClose,
  onSave,
}: {
  capability: ShapeCapability | null;
  unmappedItems: ScopeWorkItem[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: { name: string; description: string; note: string; evidenceRef: string; workItemIds: string[] }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setName(capability?.name ?? "");
    setDescription(capability?.description ?? "");
    setNote("");
    setEvidenceRef("");
    setPicked(new Set());
  }, [capability]);
  if (!capability) return null;
  return (
    <ToolWindow open onClose={onClose} title="Scope Reality" subtitle={`Edit · revision ${capability.revision ?? 1}`} width={430} dataShoot="edit-capability-reality">
      <div className="space-y-3 px-5 py-4">
        <label className="block"><span className="i-label">Capability</span><input value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded px-3 py-2 text-[12px]" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)" }} /></label>
        <label className="block"><span className="i-label">Outcome / description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded px-3 py-2 text-[11px]" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)" }} /></label>
        {unmappedItems.length > 0 && <div>
          <div className="i-label">Link unmapped Linear work</div>
          <p className="mt-1 text-[9.5px] leading-snug text-[var(--i-text-faint)]">Choose only tickets that implement this accepted capability. Saving updates Reality and coverage together.</p>
          <ul className="mt-2 max-h-[190px] overflow-y-auto rounded border border-[var(--i-border)] px-2">
            {unmappedItems.map((item) => {
              const selected = picked.has(item.id);
              return <li key={item.id} style={{ borderTop: "1px solid var(--i-border)" }}>
                <button type="button" onClick={() => setPicked((previous) => {
                  const next = new Set(previous);
                  if (selected) next.delete(item.id); else next.add(item.id);
                  return next;
                })} className="flex w-full items-center gap-2.5 py-2 text-left" data-shoot="edit-capability-claim-item">
                  <span aria-hidden className="shrink-0 rounded-sm" style={{ width: 13, height: 13, border: `1px solid ${selected ? "var(--i-signal)" : "var(--i-border-strong)"}`, background: selected ? "var(--i-signal)" : "transparent" }} />
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--i-text-soft)]">{item.label}</span>
                </button>
              </li>;
            })}
          </ul>
        </div>}
        <label className="block"><span className="i-label">Change note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why accepted Reality is changing" className="mt-1.5 w-full rounded px-3 py-2 text-[11px]" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)" }} /></label>
        <label className="block"><span className="i-label">Evidence reference · optional</span><input value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} placeholder="URL, document id, or source reference" className="mt-1.5 w-full rounded px-3 py-2 text-[11px]" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)" }} /></label>
        <div className="rounded border border-[var(--i-border)] bg-[var(--i-recess)] px-3 py-2 text-[9.5px] text-[var(--i-text-faint)]">
          {evidenceRef.trim() ? "Operator assertion · evidence attached" : "Operator assertion · no evidence yet"} · saved server-side with history
        </div>
        {error && <div className="text-[10px] text-[var(--i-red)]">{error}</div>}
        <button disabled={saving || !name.trim()} onClick={() => onSave({ name, description, note, evidenceRef, workItemIds: [...picked] })} className="w-full rounded-md border border-[var(--i-signal)] px-3 py-2 text-[11px] text-[var(--i-signal)] disabled:opacity-40" data-shoot="save-capability-reality">{saving ? "Saving Reality…" : `Save accepted Reality${picked.size > 0 ? ` · link ${picked.size} item${picked.size === 1 ? "" : "s"}` : ""}`}</button>
      </div>
    </ToolWindow>
  );
}

function ScopeImpactPreview({
  change,
  scope,
  baseDate,
  previewDate,
  writing,
  error,
  onKeepScenario,
  onCommit,
}: {
  change: PendingScopeChange | null;
  scope: ProjectScope;
  baseDate: Date;
  previewDate: Date;
  writing: boolean;
  error: string | null;
  onKeepScenario: () => void;
  onCommit: () => void;
}) {
  if (!change) return null;
  const isMove = change.kind === "move";
  const items = isMove
    ? scope.executionItems.filter((item) => change.itemIds.includes(item.id))
    : change.kind === "link" ? [change.item] : [];
  const effort = items.reduce((sum, item) => sum + expectedDays(item), 0);
  const schedule = effort / (scope.teamCapacity || 1);
  const dateDelta = Math.round((previewDate.getTime() - baseDate.getTime()) / 86_400_000);
  const title = change.kind === "link"
    ? `Link ${change.item.id} → ${change.capability.name}`
    : change.kind === "unlink"
      ? `Unlink ${change.itemLabel}`
      : `Move ${change.capability.name} ${change.status === "accepted" ? "into" : "out of"} release`;
  return (
    <ToolWindow open onClose={onKeepScenario} title="Scope impact preview" subtitle={title} width={430} dataShoot="scope-impact-preview">
      <div className="px-5 py-4">
        <div className="i-label text-[var(--i-violet)]">Preview · not Reality yet</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded border border-[var(--i-border)] bg-[var(--i-recess)] px-3 py-2"><div className="i-label">Execution</div><div className="mt-1 i-readout text-[15px]">{change.kind === "unlink" ? "−1" : `${change.kind === "move" && change.status === "outside" ? "−" : "+"}${items.length}`}</div><div className="text-[8.5px] text-[var(--i-text-faint)]">mapped item{items.length === 1 ? "" : "s"}</div></div>
          <div className="rounded border border-[var(--i-border)] bg-[var(--i-recess)] px-3 py-2"><div className="i-label">Modeled load</div><div className="mt-1 i-readout text-[15px]">{change.kind === "unlink" ? `−${schedule.toFixed(1)}d` : `${change.kind === "move" && change.status === "outside" ? "−" : "+"}${schedule.toFixed(1)}d`}</div><div className="text-[8.5px] text-[var(--i-text-faint)]">deterministic expected load</div></div>
        </div>
        {isMove && <div className="mt-2 rounded border border-[var(--i-border)] px-3 py-2 text-[10px] text-[var(--i-text-soft)]">Scenario window: {formatDateOnly(baseDate)} → {formatDateOnly(previewDate)} {dateDelta === 0 ? "(held)" : `(${deltaLabel(dateDelta)})`}</div>}
        <p className="mt-3 text-[10px] leading-relaxed text-[var(--i-text-faint)]">Commit writes canonical server Reality, increments the derived revision, recomputes Forecast coverage/readiness, and becomes visible to other devices. Keeping the preview leaves Reality unchanged.</p>
        {error && <div className="mt-2 text-[10px] text-[var(--i-red)]">{error}</div>}
        <div className="mt-4 flex gap-2"><button onClick={onKeepScenario} disabled={writing} className="flex-1 rounded-md border border-[var(--i-border-strong)] px-3 py-2 text-[11px] text-[var(--i-text-soft)]">{isMove ? "Keep hypothetical" : "Cancel"}</button><button onClick={onCommit} disabled={writing} className="flex-1 rounded-md border border-[var(--i-signal)] px-3 py-2 text-[11px] text-[var(--i-signal)]" data-shoot="commit-scope-reality">{writing ? "Committing…" : "Commit to Reality"}</button></div>
      </div>
    </ToolWindow>
  );
}

function ProductShapeSummary({
  accepted,
  coverage,
  executionSource,
  capacityReconciles,
  scenario,
}: {
  accepted: ShapeCapability[];
  coverage: ForecastCoverageContract;
  executionSource: { asOf: string; availability: "available" | "empty" };
  capacityReconciles: boolean;
  scenario: boolean;
}) {
  const ready = coverage.state === "forecastable" && capacityReconciles;
  const tone = ready ? "var(--i-signal)" : "var(--i-amber)";
  return (
    <div className="mx-5 mb-3 grid shrink-0 grid-cols-3 gap-2" data-shoot="scope-product-shape-summary">
      <div className="min-w-0 rounded-lg border bg-[var(--i-panel)] px-3 py-2" style={{ borderColor: `color-mix(in srgb, ${tone} 35%, var(--i-border))` }} data-shoot="scope-coverage-state">
        <div className="i-label" style={{ color: tone }}>{scenario ? ready ? "SCENARIO COVERAGE COMPLETE" : "SCENARIO READINESS BLOCKED" : ready ? "DELIVERY CLAIM READY" : "FORECAST READINESS BLOCKED"}</div>
        <div className="mt-1 truncate text-[9px] text-[var(--i-text-soft)]">{!capacityReconciles ? "Named capacity has not been reconciled to forecast capacity" : coverage.reason ?? "Canonical delivery forecast is supported"}</div>
      </div>
      <div className="min-w-0 rounded-lg border border-[var(--i-border)] bg-[var(--i-recess)] px-3 py-2">
        <div className="i-label">{scenario ? "Scenario shape mapped" : "Accepted shape mapped"}</div>
        <div className="mt-1 text-[9px] text-[var(--i-text-faint)]">{coverage.census.mappedAcceptedCapabilityCount}/{coverage.census.acceptedCapabilityCount} capabilities · {coverage.census.modeledExecutionIssueCount} modeled · {coverage.census.outsideExecutionIssueCount} out/later · {coverage.census.unmappedExecutionIssueCount} unresolved</div>
        {accepted.length === 0 && <div className="mt-0.5 truncate text-[8.5px] text-[var(--i-text-faint)]">No accepted Capability records; legacy execution grammar remains visible</div>}
      </div>
      <div className="min-w-0 rounded-lg border border-[var(--i-amber)]/20 bg-[var(--i-amber)]/[0.025] px-3 py-2">
        <div className="i-label text-[var(--i-text-faint)]">Execution owner read</div>
        <div className="mt-1 truncate text-[9px] text-[var(--i-text-faint)]">Linear · {executionSource.availability} · as of {formatDateOnly(executionSource.asOf, { month: "short", day: "numeric", year: "numeric" })}</div>
      </div>
    </div>
  );
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
  canonicalForecast,
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
  canonicalForecast: boolean;
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
      {/* LANDING is dominant only when coverage and named capacity reconcile. */}
      <div className="px-6 py-3 min-w-[225px]">
        <div className="i-label">{canonicalForecast ? `${scopeName} lands` : "Forecast boundary"}</div>
        <div className="mt-1.5 leading-none" style={{ fontSize: canonicalForecast ? 30 : 17 }}>
          <motion.span
            key={`${date}-${canonicalForecast}`}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: STAGE.date, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block i-readout"
            style={{ color: canonicalForecast ? (moved ? "var(--i-violet)" : "var(--i-text)") : "var(--i-amber)" }}
          >
            {canonicalForecast ? date : "Forecast not ready"}
          </motion.span>
        </div>
        <div className="mt-1.5 text-[9.5px] text-[var(--i-text-faint)]">
          {canonicalForecast ? `best ${best} · worst ${worst}` : `Modeled subset consequence ~${date} · not a delivery claim`}
        </div>
      </div>

      <Engraving />

      {/* RELEASE LOAD — secondary, and the first number to resolve. */}
      <div className="px-6 py-3">
        <div className="i-label">Release load</div>
        <div className="mt-1.5 leading-none" style={{ fontSize: 21 }}>
          <motion.span
            key={loadDays.toFixed(1)}
            initial={false}
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
  selected,
  onOpen,
}: {
  feature: Feature;
  share: number;
  maxSpread: number;
  ghostRange?: ThreePoint | null;
  isDragging: boolean;
  compact?: boolean;
  selected?: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: feature.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `cap-drop:${feature.canonicalCapability?.id ?? feature.id}`,
    disabled: !feature.canonicalCapability,
  });
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { delay: 0.16, duration: 0.26 } }}
      transition={{ type: "spring", stiffness: 330, damping: 33 }}
      className="relative w-full"
      style={{ ...(compact ? { height: 150 } : { height: "100%" }), outline: isOver ? "1px solid var(--i-amber)" : "none", borderRadius: 12 }}
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
          selected={selected}
          onOpen={onOpen}
          setNodeRef={(node) => { setNodeRef(node); setDropRef(node); }}
          dragHandleProps={{ ...listeners, ...attributes }}
        />
      )}
    </motion.div>
  );
}

// A VACATED SEAT — the position a capability holds in Reality, standing open
// because the active Scenario took it out. It is not a blank cell: it is the
// only thing on the deck that carries Reality-vs-Scenario meaning, and it
// stays exactly where the module was so the chassis geometry is identical in
// both states. The identity is ENGRAVED into the recess — dark, letterpressed,
// no fill and no light — so it reads as a machined label on bare metal rather
// than as another card.
function VacatedSeat({
  feature,
  armed,
  onOpen,
}: {
  feature: Feature;
  /** The capability itself is being carried back over the deck. */
  armed: boolean;
  onOpen: () => void;
}) {
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 330, damping: 33 }}
      className="relative w-full h-full"
      style={{ height: "100%" }}
      data-shoot="vacated-seat"
      data-capability={feature.id}
    >
      <Seat armed={armed} tone="var(--i-violet)" />
      {/* A vacated seat is a SCENARIO artifact, so the recess carries the
          scenario's own colour. That is what separates it at a glance from the
          reserve bay, which is simply a position nothing has ever occupied. */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: 12,
          boxShadow:
            "inset 0 0 0 1px color-mix(in srgb, var(--i-violet) 16%, transparent), inset 0 6px 18px rgba(0,0,0,0.5)",
        }}
      />
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
        aria-label={`${feature.name}, taken out of this release. Its seat is open. Click to open the capability.`}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          aria-hidden
          style={{ filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.045))" }}
        >
          <path d={sigilPathFor(feature.name)} />
        </svg>
        <span
          className="max-w-full font-semibold uppercase leading-[1.3]"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.11)",
            textShadow: "0 1px 0 rgba(255,255,255,0.05)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {feature.name}
        </span>
        <motion.span
          className="text-[8px] font-semibold uppercase tracking-[0.16em]"
          initial={false}
          animate={{ opacity: armed ? 1 : 0.55, color: "var(--i-violet)" }}
          transition={{ duration: 0.18 }}
        >
          {armed ? "reconnect" : "seat open"}
        </motion.span>
      </button>
    </motion.div>
  );
}

// THE RESERVE BAY — one quiet open position at the end of the composition,
// and the only unoccupied cell on the deck that is not a vacated seat. It says
// one thing: this instrument can take another capability. It is dark at rest
// and names itself only under the pointer.
function ReserveBay({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.button
      layout
      onClick={onAdd}
      data-shoot="add-feature"
      className="relative group h-full"
      transition={{ type: "spring", stiffness: 330, damping: 33 }}
    >
      <Seat mark />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
        <span
          className="text-[8px] font-semibold uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ color: "var(--i-text-soft)" }}
        >
          Open bay
        </span>
        <span
          className="text-[8.5px] leading-snug opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ color: "var(--i-text-faint)" }}
        >
          add a capability
        </span>
      </span>
    </motion.button>
  );
}

function ReleaseRack({
  features,
  dragging,
  shareOf,
  maxSpread,
  seatArmed,
  ghostRangeOf,
  onOpen,
  onAdd,
  scopeName,
  unmappedItems,
  totalItems,
  emptyTruth,
  selectedId,
}: {
  /** EVERY capability in this release, in the deck's canonical order. */
  features: Feature[];
  dragging: Feature | null;
  shareOf: (f: Feature) => number;
  maxSpread: number;
  /** A parked capability is being carried back over the deck. */
  seatArmed: boolean;
  ghostRangeOf: (f: Feature) => ThreePoint | null;
  onOpen: (id: string) => void;
  onAdd: () => void;
  scopeName: string;
  unmappedItems: number;
  totalItems: number;
  emptyTruth: { openFindingCount: number; gateDays: number; dependencyNames: string[]; forecastAsOf: string; sourceAvailability: "available" | "empty"; scopeId: string };
  selectedId: string | null;
}) {
  const { setNodeRef } = useDroppable({ id: BAY_IN });

  // THE DECK HAS EXACTLY THREE KINDS OF CELL. A capability is either seated in
  // its position or its position is standing vacated; every capability the
  // release has occupies one cell either way, which is what keeps the chassis
  // identical between Reality and Scenario and stops the remaining modules
  // reflowing into a hole. Then one reserve bay. Nothing else — a cell drawn
  // only to square off a grid would be a seat that means nothing.
  const cells = features.map((f) =>
    f.bypassed ? (
      <VacatedSeat
        key={f.id}
        feature={f}
        armed={seatArmed && dragging?.id === f.id}
        onOpen={() => onOpen(f.id)}
      />
    ) : (
      <SeatedModule
        key={f.id}
        feature={f}
        share={shareOf(f)}
        maxSpread={maxSpread}
        ghostRange={ghostRangeOf(f)}
        isDragging={dragging?.id === f.id}
        selected={selectedId === f.id}
        onOpen={() => onOpen(f.id)}
      />
    )
  );

  const { cols, rows } = packDeck(cells.length + 1);

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
        className="absolute top-2 left-4 px-2 i-label whitespace-nowrap z-10"
        data-shoot="release-rack-title"
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
        {features.length === 0 ? (
          <div data-shoot="scope-empty-truth" className="flex h-full items-center justify-center">
            <div className="max-w-[620px] rounded-xl border border-[var(--i-border)] bg-[var(--i-recess)] px-6 py-5 text-center">
              <div className="text-[13px] font-semibold text-[var(--i-text)]">No canonical executable work is currently represented for {scopeName}.</div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--i-text-soft)]">
                0 modeled executable days means this owner read found no remaining canonical work items. It does not prove there is no work.
              </p>
              <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--i-text-faint)]">
                Linear owner read {emptyTruth.sourceAvailability === "empty" ? "succeeded but returned no matching issue rows" : "succeeded"} as of {new Date(emptyTruth.forecastAsOf).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
                {emptyTruth.gateDays > 0 ? ` Forecast still includes ${emptyTruth.gateDays} likely days of serial DecisionGate delay.` : ""}
                {emptyTruth.dependencyNames.length ? ` This scope also waits on ${emptyTruth.dependencyNames.join(", ")}.` : ""}
              </p>
              {emptyTruth.openFindingCount > 0 && (
                <Link href={`/audit?project=${encodeURIComponent(emptyTruth.scopeId)}`} className="mt-3 inline-block text-[10.5px] text-[var(--i-amber)] hover:underline">
                  {emptyTruth.openFindingCount} open Audit {emptyTruth.openFindingCount === 1 ? "Finding describes" : "Findings describe"} unrepresented work · not promoted into Reality →
                </Link>
              )}
              <div className="mx-auto mt-4 max-w-[190px]"><ReserveBay onAdd={onAdd} /></div>
            </div>
          </div>
        ) : (
          <div
            className="grid gap-3.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ...rowGeometry(rows) }}
          >
            <AnimatePresence initial={false}>{cells}</AnimatePresence>
            <ReserveBay onAdd={onAdd} />
          </div>
        )}
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
  governedOutside,
  selectedId,
  onOpenOutside,
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
  governedOutside: ShapeCapability[];
  selectedId: string | null;
  onOpenOutside: (capability: ShapeCapability) => void;
}) {
  const { setNodeRef } = useDroppable({ id: BAY_OUT });
  const parkedDays = features.reduce((s, f) => s + f.loadDays, 0);
  const wake = useSpring(pull, { stiffness: 190, damping: 28 });
  const seatOpacity = useTransform(wake, [0.18, 0.8], [0, 1]);
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
      className="relative h-[168px] shrink-0 overflow-hidden rounded-xl"
      style={{
        border: "1px solid var(--i-border)",
        background: bodyLift,
        boxShadow: "inset 0 3px 12px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.028)",
      }}
    >
      <motion.span
        className="absolute left-4 top-3 z-10 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: labelTone }}
      >
        Out / later bank
      </motion.span>

      <div className="flex h-full items-stretch gap-2.5 overflow-x-auto px-3.5 pb-3 pt-9">
        {governedOutside.map((capability) => <div key={capability.id} className="w-[230px] shrink-0"><OutsideCapability capability={capability} onOpen={() => onOpenOutside(capability)} /></div>)}
        <AnimatePresence initial={false}>
          {features.map((f) => (
            <div key={f.id} className="w-[230px] shrink-0"><SeatedModule feature={f} share={shareOf(f)} maxSpread={maxSpread} ghostRange={ghostRangeOf(f)} isDragging={dragging?.id === f.id} compact selected={selectedId === f.id} onOpen={() => onOpen(f.id)} /></div>
          ))}
        </AnimatePresence>
        <motion.div
          className="relative w-[210px] shrink-0 rounded-lg"
          style={{ opacity: features.length || governedOutside.length ? seatOpacity : 1 }}
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
            className="absolute inset-0 flex items-center justify-center px-5 text-center text-[10px] leading-relaxed"
            initial={false}
            animate={{ opacity: armed ? 1 : 0.7, color: armed ? "var(--i-violet)" : "var(--i-text-faint)" }}
            transition={{ duration: 0.16 }}
          >
            {armed ? "Release here — move out / later" : governedOutside.length || features.length ? `${governedOutside.length + features.length} outside · ${parkedDays.toFixed(1)}d scenario load` : "Drag a capability here to model it out / later"}
          </motion.span>
        </motion.div>
      </div>
    </motion.div>
  );
}

function OutsideCapability({ capability, onOpen }: { capability: ShapeCapability; onOpen: () => void }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `outside:${capability.id}` });
  return (
    <div
      ref={setNodeRef}
      className="shrink-0 rounded-lg border px-3 py-3 touch-none"
      style={{ borderColor: "#252c30", background: "linear-gradient(180deg, #12171a 0%, #0d1114 100%)", opacity: isDragging ? 0.25 : 1, cursor: "grab" }}
      data-shoot="governed-outside-capability"
      data-capability={capability.id}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}
    >
      <div className="flex items-start gap-2">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.6" className="mt-0.5 shrink-0" aria-hidden><path d={sigilPathFor(capability.name)} /></svg>
        <div className="min-w-0">
          <div className="text-[9.5px] font-semibold leading-snug text-[var(--i-text-soft)]">{capability.name}</div>
          <div className="mt-1 text-[7.5px] uppercase tracking-[0.12em] text-[var(--i-amber)]">{capability.status.replaceAll("_", " ")}</div>
        </div>
      </div>
      <p className="mt-2 line-clamp-3 text-[8.5px] leading-relaxed text-[var(--i-text-faint)]">{capability.description ?? "Governed outside the current release."}</p>
      <div className="mt-2 text-[8px] text-[var(--i-text-faint)]">{capability.workLinks.length} linked item{capability.workLinks.length === 1 ? "" : "s"} · drag into release</div>
    </div>
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
  openQuestions,
  scopeId,
  dominance,
  startDate,
  truthReady,
}: {
  gates: { id: string; label: string; likely: number }[];
  openQuestions: { id: string; title: string; rationale: string | null; status: string }[];
  scopeId: string;
  dominance: ReturnType<typeof readDominance>;
  startDate: Date;
  truthReady: boolean;
}) {
  const dom = dominance;
  const held = !!dom?.dominated;
  const hasFloor = truthReady && !!dom && dom.floorDays > 0.5;
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
          Locks & questions
        </span>
        <span className="mt-0.5 text-[8.5px] leading-none text-[var(--i-text-faint)]">read-only · owned by Decisions</span>
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-1.5 px-1 overflow-hidden">
        {gates.length === 0 && openQuestions.length === 0 ? (
          <span className="text-[9.5px] text-[var(--i-text-faint)] px-2">no open decisions under this release</span>
        ) : (<>
          {gates.map((g) => (
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
          ))}
          {openQuestions.map((decision) => (
            <Link
              key={decision.id}
              href={`/decisions?project=${encodeURIComponent(scopeId)}&selected=decision%3A${encodeURIComponent(decision.id)}`}
              className="group min-w-0 flex items-center gap-1.5 rounded px-2 py-1 transition-colors"
              style={{ border: "1px solid #23262a", background: "rgba(0,0,0,0.35)" }}
              title={`${decision.title} · open shape Decision; not Scope`}
              data-shoot="open-shape-decision"
            >
              <span className="h-2 w-2 shrink-0 rounded-full border border-[var(--i-amber)]/70" aria-hidden />
              <span className="min-w-0 truncate text-[9.5px] text-[var(--i-text-soft)] group-hover:text-[var(--i-text)] transition-colors">{decision.title}</span>
              <span className="shrink-0 text-[7.5px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">shape</span>
            </Link>
          ))}
        </>)}
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
            {fmtDay(forecastDateAtDay(startDate, dom.floorDays))}
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
        label="Forecast basis"
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

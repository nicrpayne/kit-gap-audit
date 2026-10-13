"use client";

// THE DECISIONS INSTRUMENT.
//
// It owns one sentence: WHICH UNRESOLVED CHOICES EXIST, AND WHICH OF THEM
// ARE ACTUALLY HOLDING DELIVERY.
//
// The two halves of that sentence are drawn differently on purpose. A gate
// is inserted into the delivery path and is red because the path is
// physically constrained. Everything else sits in lanes below, touching
// nothing — and most real decisions live there forever. Red is not
// "important"; red is "blocked".
//
// Scenario state is the suite's, not this instrument's: assuming a gate
// decided writes SuiteScenario.resolvedGateIds, the same set Forecast and
// Scope already read, so walking to Forecast shows the same world without
// a refresh (§28).

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import { AttentionCallout, AttentionError } from "@/components/instrument/Attention";
import { presentForecastDeliveryClaim } from "@/lib/forecast/claims";
import ScenarioPreviewRefusal from "@/components/instrument/ScenarioPreviewRefusal";
import ScenarioStrip, { chipsFor } from "@/components/instrument/ScenarioStrip";
import DecisionCircuit, { type CircuitNode } from "@/components/decisions/DecisionCircuit";
import { CandidateTray, DecidedBand, DismissedBar, OpenLane } from "@/components/decisions/DecisionLanes";
import DecisionInspector, { type Selection } from "@/components/decisions/DecisionInspector";
import { ConnectTool, ImportTool, NewDecisionTool } from "@/components/decisions/DecisionTools";
import { useProjectParam } from "@/lib/shell/useProjectParam";
import { useDecisions } from "@/lib/decisions/useDecisions";
import { useFlip } from "@/lib/decisions/useFlip";
import { EMPTY_SCENARIO, fmtDay, useProject } from "@/lib/instrument/useProject";
import { LANE_COLOR, decisionCounts, forecastActive, openNotGating, type DecisionRow } from "@/lib/decisions/model";
import { DecisionDragProvider, DecisionDropZone, type DecisionDrop } from "@/components/decisions/DecisionDrag";
import DecisionModule from "@/components/decisions/DecisionModule";
import { decisionScenarioBasis, gateDraftError, type DecisionPlan } from "@/lib/scenario/decisionPlan";

type Filter = "all" | "candidates" | "open" | "gating" | "decided";

export default function DecisionsPageClient() {
  const project = useProject();
  const { data, loading, error, write } = useDecisions();
  const router = useRouter();
  const pathname = usePathname()!; // Mounted only in the App Router, where navigation is available.
  const params = useSearchParams()!; // Mounted only in the App Router, where navigation is available.

  const [selection, setSelection] = useState<Selection>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [showDismissed, setShowDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<"new" | "import" | "connect" | "scenario-connect" | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const selectObject = useCallback((nextSelection: Selection) => {
    setCandidateError(null);
    setSelection(nextSelection);
    const next = new URLSearchParams(params.toString());
    if (nextSelection) {
      next.set("select", `${nextSelection.kind}:${nextSelection.id}`);
      const owner = nextSelection.kind === "decision" ? data?.decisions.find(row => row.id === nextSelection.id) : data?.candidates.find(row => row.id === nextSelection.id);
      const target = owner && "gate" in owner ? owner.gate?.targetScopeId : null;
      if (owner && owner.scopeId !== params.get("project") && target !== params.get("project")) next.set("project", owner.scopeId);
    }
    else if (/^(decision|candidate):/.test(next.get("select") ?? "")) next.delete("select");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router, data]);

  const decisions = useMemo(() => data?.decisions ?? [], [data]);
  const allCandidates = useMemo(() => data?.candidates ?? [], [data]);
  const scopes = useMemo(() => data?.scopes ?? [], [data]);

  // URL-owned object identity makes Decision links shareable and lets
  // Back/Forward restore the same object, while an invalid/stale id simply
  // leaves the circuit unselected instead of selecting a neighbour.
  useEffect(() => {
    if (loading) return;
    const raw = params.get("select") ?? (params.get("decisionId") ? `decision:${params.get("decisionId")}` : null);
    if (!raw) {
      setSelection(null);
      return;
    }
    const [kind, ...idParts] = raw.split(":");
    const id = idParts.join(":");
    if (kind === "decision" && decisions.some((d) => d.id === id)) setSelection({ kind, id });
    else if (kind === "candidate" && allCandidates.some((c) => c.id === id)) setSelection({ kind, id });
    else setSelection(null);
  }, [params, loading, decisions, allCandidates]);

  // Which delivery path the circuit is about. Defaults to whichever project
  // actually has gates -- opening on a clear path when another is blocked
  // would be showing the least interesting truth first.
  const displayedDecisions = useMemo(() => decisions.map(decision => {
    const plan = project.scenario.decisionPlans?.[decision.id];
    if (!plan) return decision;
    if (plan.state === "resolved") return { ...decision, status: "decided" as const, gate: null };
    if (plan.state === "open") return { ...decision, gate: null };
    const gate = plan.gate!;
    return { ...decision, gate: { ...gate, id: `scenario-decision:${decision.id}`, decisionId: decision.id, serial: true,
      provenance: "scenario", targetScope: scopes.find(scope => scope.id === gate.targetScopeId)! } };
  }), [decisions, project.scenario.decisionPlans, scopes]);
  const gatingAll = useMemo(() => displayedDecisions.filter(forecastActive), [displayedDecisions]);

  // That preference is expressed as ORDER rather than as a setState, so the
  // URL can win while the fallback stays exactly as clever as it was: the
  // shared hook falls back to the first available id, so putting the
  // busiest-gating project first reproduces the old default precisely.
  const orderedScopeIds = useMemo(() => {
    if (scopes.length === 0) return [];
    const busiest = new Map<string, number>();
    for (const d of gatingAll) {
      const t = d.gate!.targetScopeId;
      busiest.set(t, (busiest.get(t) ?? 0) + 1);
    }
    const ids = scopes.map((s) => s.id);
    return [...ids].sort((a, b) => (busiest.get(b) ?? 0) - (busiest.get(a) ?? 0));
  }, [scopes, gatingAll]);

  const { projectId: activeScopeId, select: setScopeId } = useProjectParam(
    loading ? null : orderedScopeIds
  );
  const visibleDecisions = useMemo(() => displayedDecisions.filter(row => row.scopeId === activeScopeId || row.gate?.targetScopeId === activeScopeId), [displayedDecisions, activeScopeId]);
  const candidates = useMemo(() => allCandidates.filter(row => row.scopeId === activeScopeId), [allCandidates, activeScopeId]);
  const scenarioResolved = visibleDecisions.filter(row => project.scenario.decisionPlans?.[row.id]?.state === "resolved");

  // ── THE CIRCUIT'S NODES, from real structure only ─────────────────────
  const { origin, downstream } = useMemo(() => {
    const empty = { origin: null as CircuitNode | null, downstream: [] as CircuitNode[] };
    if (!project.data || !activeScopeId) return empty;
    const nodeFor = (id: string): CircuitNode | null => {
      const s = project.data!.scopes.find((x) => x.scopeId === id);
      if (!s) return null;
      const likely = project.active
        ? project.previewPending ? null : project.preview?.get(id)?.likelyDate ?? null
        : project.baseline?.get(id)?.likelyDate ?? null;
      return {
        claim: presentForecastDeliveryClaim({
          scopeName: s.name,
          coverage: project.coverageByScope.get(id) ?? s.forecastCoverage,
          likelyDate: likely ? fmtDay(likely) : null,
        }),
        id: s.scopeId,
        name: s.name,
        likely,
        targetDate: s.targetDate ? new Date(s.targetDate) : null,
        // What is holding this node RIGHT NOW. A gate assumed decided is
        // not holding anything, and counting it would contradict the date
        // beside it, which is already the scenario's.
        gateCount: gatingAll.filter(
          (d) => d.gate!.targetScopeId === id && !project.scenario.resolvedGateIds.has(d.gate!.id)
        ).length,
      };
    };
    const o = nodeFor(activeScopeId);
    if (!o) return empty;
    // Real downstream: any Scope that names this one in dependsOnScopeIds
    // and therefore cannot land before it. No invented releases.
    const down = project.data.scopes
      .filter((s) => s.dependsOnScopeIds.includes(activeScopeId))
      .map((s) => nodeFor(s.scopeId))
      .filter((n): n is CircuitNode => n !== null);
    return { origin: o, downstream: down };
  }, [project.data, project.coverageByScope, project.active, project.preview, project.previewPending, project.baseline, project.scenario.resolvedGateIds, activeScopeId, gatingAll]);

  // DETERMINISTIC PRESENTATION ORDER, and nothing more. The engine sums
  // gate durations in series and knows of no ordering between two gates on
  // the same scope, so sorting by when each was recorded is a stable way to
  // draw them -- not a claim about which must be settled first. The circuit
  // says so in a caption when there is more than one.
  const circuitGates = useMemo(
    () =>
      gatingAll
        .filter((d) => d.gate!.targetScopeId === activeScopeId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [gatingAll, activeScopeId]
  );
  const elsewhere = useMemo(() => {
    const byScope = new Map<string, number>();
    for (const d of gatingAll) {
      const t = d.gate!.targetScopeId;
      if (t === activeScopeId) continue;
      byScope.set(t, (byScope.get(t) ?? 0) + 1);
    }
    return [...byScope.entries()];
  }, [gatingAll, activeScopeId]);
  const openLane = useMemo(() => visibleDecisions.filter(openNotGating), [visibleDecisions]);
  const counts = useMemo(() => decisionCounts(visibleDecisions), [visibleDecisions]);
  const decided = visibleDecisions.filter(d => d.status === "decided" && !project.scenario.decisionPlans?.[d.id]);
  const dismissed = visibleDecisions.filter(d => d.status === "dismissed");

  const selectedDecision =
    selection?.kind === "decision" ? decisions.find((d) => d.id === selection.id) ?? null : null;
  const selectedCandidate =
    selection?.kind === "candidate" ? candidates.find((c) => c.id === selection.id) ?? null : null;
  const nextDecision = decisions.find((d) => forecastActive(d) && d.gate?.targetScopeId === activeScopeId)
    ?? decisions.find((d) => d.scopeId === activeScopeId && d.status === "open");
  const nextCandidate = candidates.find((c) => c.scopeId === activeScopeId);
  const selectedPlan = selectedDecision ? project.scenario.decisionPlans?.[selectedDecision.id] : undefined;
  const pendingDecision = tool === "scenario-connect" ? selectedDecision : null;
  const closeConnectTool = () => {
    const id = pendingDecision?.id;
    setTool(null);
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="decision-drag-${id}"]`)?.focus({ preventScroll: true }));
  };

  const setScenario = project.setScenario;
  const stageDecision = useCallback((id: string, plan: DecisionPlan | null) => {
    const decision = decisions.find(row => row.id === id);
    setScenario(current => {
      const decisionPlans = { ...current.decisionPlans };
      if (plan) decisionPlans[id] = plan; else delete decisionPlans[id];
      const resolvedGateIds = new Set(current.resolvedGateIds);
      if (decision?.gate) resolvedGateIds.delete(decision.gate.id);
      return { ...current, decisionPlans, resolvedGateIds };
    });
    setFlash(true);
  }, [decisions, setScenario]);
  function moveDecision(id: string, target: DecisionDrop) {
    const decision = decisions.find(row => row.id === id);
    if (!decision || decision.status !== "open") return;
    selectObject({ kind: "decision", id });
    if (target === "gating") {
      if (decision.gate?.serial && !project.scenario.decisionPlans?.[id]?.gate) stageDecision(id, null);
      else setTool("scenario-connect");
    } else if (target === "open" && !decision.gate) stageDecision(id, null);
    else stageDecision(id, { basis: decisionScenarioBasis(decision), state: target });
  }

  // ── SCENARIO ──────────────────────────────────────────────────────────
  // CONSEQUENCE LAST. Releasing a gate is a physical event; the date it
  // buys is an interpretation of that event, and showing both at once
  // makes neither legible. So the circuit moves first, and this flag gives
  // the resulting date a brief moment of presence before it settles into
  // the shared strip where it lives permanently.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 3600);
    return () => clearTimeout(t);
  }, [flash]);

  const assumeGate = useCallback(
    (gateId: string, assume: boolean) => {
      const decision = decisions.find(row => gateId === `scenario-decision:${row.id}` || row.gate?.id === gateId);
      if (decision) stageDecision(decision.id, assume ? { basis: decisionScenarioBasis(decision), state: "resolved" } : null);
    },
    [decisions, stageDecision]
  );

  // ── WRITES ────────────────────────────────────────────────────────────
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        return await fn();
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const updateDecision = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const res = await run(() => write(`/api/decisions/${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, expectedUpdatedAt: decisions.find(row => row.id === id)?.updatedAt }) }));
      if (!res.ok) throw new Error(String(res.body.error ?? "Could not save the decision. Retry."));
      stageDecision(id, null);
    },
    [run, write, decisions, stageDecision]
  );

  // A rejected candidate write must remain visible even when refresh removes
  // the stale candidate from the tray. Read errors and write errors differ.
  const writeCandidate = useCallback(async (url: string, init: RequestInit) => {
    setCandidateError(null);
    try {
      const res = await run(() => write(url, init));
      if (!res.ok) {
        setCandidateError(String(res.body.error ?? "Could not save that candidate action. Review the source and retry."));
        return null;
      }
      return res;
    } catch {
      setCandidateError("Connection interrupted. The result could not be confirmed. Refresh and retry; do not assume the action was saved.");
      return null;
    }
  }, [run, write]);

  const acceptCandidate = useCallback(
    async (id: string) => {
      const res = await writeCandidate(`/api/decision-candidates/${id}/accept`, { method: "POST" });
      if (!res) return;
      const decision = res.body.decision as { id?: string } | undefined;
      if (decision?.id) selectObject({ kind: "decision", id: decision.id });
    },
    [writeCandidate, selectObject]
  );

  const scopeNameById = useMemo(() => new Map(scopes.map((s) => [s.id, s.name])), [scopes]);

  const completeCoverage = origin?.claim.state === "forecastable";
  const baselineDate = activeScopeId ? project.baseline?.get(activeScopeId)?.likelyDate ?? null : null;
  const previewDate = activeScopeId ? project.preview?.get(activeScopeId)?.likelyDate ?? null : null;
  const scenarioForecastPending = project.active && project.previewPending;
  const deltaDays =
    baselineDate && previewDate ? Math.round((previewDate.getTime() - baselineDate.getTime()) / 86400000) : 0;

  const show = (lane: Filter) => filter === "all" || filter === lane;

  // A decision that changes seating -- candidate accepted into the open
  // bank, open decision inserted into a socket, gate decided into memory --
  // is ONE object moving, and the eye should be able to follow it. These
  // are the generations that can move a module between bays.
  useFlip([decisions, candidates, activeScopeId, filter, project.scenario.resolvedGateIds, project.scenario.decisionPlans]);

  return (
    <DecisionDragProvider decisions={decisions.filter(row => row.status === "open")} onMove={moveDecision}>
    <InstrumentShell
      scopes={scopes.map((s) => ({ scopeId: s.id, name: s.name }))}
      onSelectScope={(id) => setScopeId(id)}
      stateBar={
        <ScenarioStrip
          title="Decisions"
          owns="Which choices are unresolved, and which are actually holding delivery"
          active={project.active}
          chips={chipsFor(
            project.scenario,
            scopeNameById,
            project.scenario.excludedItemIds.size,
            project.scenario.resolvedGateIds.size
          )}
          onDiscard={() => project.setScenario(EMPTY_SCENARIO)}
          right={
            <div className="flex items-center gap-2">
              <button
                data-shoot="open-import"
                onClick={() => setTool("import")}
                className="rounded-md px-2.5 py-1.5 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                Import
              </button>
              <button
                data-shoot="open-new-decision"
                onClick={() => setTool("new")}
                className="rounded-md px-2.5 py-1.5 text-[11px] font-medium"
                style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)", border: "1px solid var(--i-violet)" }}
              >
                + New decision
              </button>
            </div>
          }
        />
      }
    >
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── FILTERS + WHICH PATH ──────────────────────────────────── */}
          {/* One recessed counter strip rather than a row of filter chips.
              It reads as instrument segmentation and must not compete with
              the circuit for the first look. */}
          <div
            className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-1.5"
            style={{ borderBottom: "1px solid var(--i-border)" }}
          >
            <div className="i-meter flex items-stretch overflow-hidden rounded-md">
              {(
                [
                  ["all", "All", visibleDecisions.length + candidates.length, "var(--i-text-soft)"],
                  ["candidates", "Cand", candidates.length, LANE_COLOR.candidate],
                  ["open", "Open", counts.open, LANE_COLOR.open],
                  ["gating", "Gating", counts.gating, LANE_COLOR.gating],
                  ["decided", "Decided", decided.length, LANE_COLOR.decided],
                ] as const
              ).map(([key, label, count, tone], i) => (
                <button
                  key={key}
                  data-shoot={`filter-${key}`}
                  onClick={() => setFilter(key)}
                  className="flex items-baseline gap-1.5 px-2.5 py-1 transition-colors"
                  style={{
                    borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)",
                    background: filter === key ? "rgba(255,255,255,0.055)" : "transparent",
                  }}
                >
                  <span
                    className="text-[9px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: filter === key ? "var(--i-text)" : "var(--i-text-faint)" }}
                  >
                    {label}
                  </span>
                  <span className="i-readout text-[11px]" style={{ color: count > 0 ? tone : "var(--i-text-faint)" }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="i-label">Project</span>
              <select
                data-shoot="circuit-scope"
                value={activeScopeId ?? ""}
                onChange={(e) => setScopeId(e.target.value)}
                className="rounded px-2 py-1 text-[11px]"
                style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              >
                {scopes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── THE INSTRUMENT ────────────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {project.scenarioPreviewRefusal ? (
              <ScenarioPreviewRefusal refusal={project.scenarioPreviewRefusal} surface="Decisions" onBackToReality={() => project.setScenario(EMPTY_SCENARIO)} />
            ) : loading && !data ? (
              <div className="px-5 py-6 text-[12px] text-[var(--i-text-faint)]">Reading decisions…</div>
            ) : error ? (
              <AttentionError message={error} />
            ) : (
              <>
                <p className="px-6 pt-3 text-[12px] text-[var(--i-text-soft)]">Drag a card to try a what-if. Blocking delay breaks the circuit; Assume resolved reconnects it. Reality stays unchanged until you explicitly record a decision.</p>
                {!selection && (nextDecision || nextCandidate) && <AttentionCallout
                  title={nextDecision ? "Review the next open choice" : "Review a suggested decision"}
                  detail={nextDecision?.title ?? nextCandidate!.title}
                  label={nextDecision ? "Open decision" : "Review suggestion"}
                  tone={nextDecision ? "required" : "review"}
                  onAction={() => { setFilter("all"); selectObject(nextDecision ? { kind: "decision", id: nextDecision.id } : { kind: "candidate", id: nextCandidate!.id }); }} />}
                {origin && (
                  <DecisionDropZone target="gating" title="1 · Blocking delay" detail="Drop here to test a serial wait. You supply the reason and delay range.">
                  <DecisionCircuit
                    startDate={project.startDate}
                    origin={origin}
                    downstream={downstream}
                    gates={circuitGates}
                    pendingDecision={pendingDecision}
                    assumedGateIds={project.scenario.resolvedGateIds}
                    selectedId={selectedDecision?.id ?? null}
                    onSelect={(id) => selectObject({ kind: "decision", id })}
                    onAssume={assumeGate}
                  />
                  </DecisionDropZone>
                )}

                {/* The consequence, given a moment of presence and then
                    left to the shared strip. Never permanently large. */}
                {flash && completeCoverage && project.active && baselineDate && previewDate && deltaDays !== 0 && (
                  <div className="flex px-6 pt-3">
                    <div
                      data-shoot="consequence-flash"
                      className="i-fadeup ml-auto flex items-center gap-4 rounded-lg px-4 py-2.5"
                      style={{
                        background: "var(--i-recess)",
                        border: `1px solid ${deltaDays < 0 ? "rgba(74,217,168,0.4)" : "rgba(224,176,74,0.4)"}`,
                      }}
                    >
                      <span className="i-label">Date consequence</span>
                      <span className="flex items-baseline gap-2">
                        <span className="i-readout text-[13px] text-[var(--i-text-faint)]">{fmtDay(baselineDate)}</span>
                        <span className="text-[11px] text-[var(--i-text-faint)]">→</span>
                        <span
                          className="i-readout text-[19px]"
                          style={{ color: deltaDays < 0 ? "var(--i-mint)" : "var(--i-amber)" }}
                        >
                          {fmtDay(previewDate)}
                        </span>
                      </span>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: deltaDays < 0 ? "var(--i-mint)" : "var(--i-amber)" }}
                      >
                        {Math.abs(deltaDays)} day{Math.abs(deltaDays) === 1 ? "" : "s"}{" "}
                        {deltaDays < 0 ? "earlier" : "later"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Gates that hold a DIFFERENT path. Real, gating, and not
                    gating THIS circuit -- a compact door rather than a
                    second circuit crowding the first. */}
                {elsewhere.length > 0 && (
                  <div data-shoot="gates-elsewhere" className="flex flex-wrap items-center gap-2 px-6 pt-2.5">
                    <span className="i-label">Gating another delivery path</span>
                    {elsewhere.map(([id, count]) => (
                      <button
                        key={id}
                        data-shoot={`elsewhere-${id}`}
                        onClick={() => setScopeId(id)}
                        className="rounded px-2 py-[3px] text-[10px] transition-colors hover:brightness-125"
                        style={{ border: "1px solid rgba(239,107,91,0.35)", color: "var(--i-red)" }}
                      >
                        {scopeNameById.get(id) ?? id} · {count} gate{count === 1 ? "" : "s"} →
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-1 px-6 pb-4 pt-3.5">
                  {show("candidates") && (
                    <CandidateTray
                      candidates={candidates}
                      selectedId={selectedCandidate?.id ?? null}
                      onSelect={(id) => selectObject({ kind: "candidate", id })}
                    />
                  )}
                  {show("open") && (
                    <DecisionDropZone target="open" title="2 · Open, without a delay" detail="The question stays open. No delay days are added.">
                    <OpenLane
                      decisions={openLane.filter(row => row.id !== pendingDecision?.id)}
                      selectedId={selectedDecision?.id ?? null}
                      onSelect={(id) => selectObject({ kind: "decision", id })}
                    />
                    </DecisionDropZone>
                  )}
                  <DecisionDropZone target="resolved" title="3 · Assume resolved" detail="Scenario only. A choice without a delay gate saves no days.">
                    <div className="flex min-h-24 gap-3 overflow-x-auto p-3" data-testid="scenario-resolved-decisions">
                      {!scenarioResolved.length && <p className="p-3 text-[12px] text-[var(--i-text-faint)]">Drop an open choice here to explore it being settled.</p>}
                      {scenarioResolved.filter(row => row.id !== pendingDecision?.id).map(row => <DecisionModule key={row.id} flipId={row.id} shoot={`scenario-resolved-${row.id}`}
                        seating="banked" accent="var(--i-violet)" chip="Assumed resolved" ident="Scenario" title={row.title} width={226}
                        onClick={() => selectObject({ kind: "decision", id: row.id })} />)}
                    </div>
                  </DecisionDropZone>
                  {show("decided") && (
                    <DecidedBand
                      decisions={decided}
                      selectedId={selectedDecision?.id ?? null}
                      onSelect={(id) => selectObject({ kind: "decision", id })}
                    />
                  )}
                  {filter === "all" && (
                    <DismissedBar
                      decisions={dismissed}
                      expanded={showDismissed}
                      onToggle={() => setShowDismissed((v) => !v)}
                      selectedId={selectedDecision?.id ?? null}
                      onSelect={(id) => selectObject({ kind: "decision", id })}
                    />
                  )}
                  <Legend />
                </div>
              </>
            )}
          </div>

          {/* ── STATUS STRIP ──────────────────────────────────────────── */}
          <div
            data-shoot="decision-status-strip"
            className="shrink-0 flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-2"
            style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
          >
            <span className="i-label">{scopeNameById.get(activeScopeId ?? "")} · {project.active ? "Scenario" : "Reality"}</span>
            <Count value={counts.open} label="open decisions" tone={LANE_COLOR.open} shoot="count-open" />
            <Count value={counts.gating} label="gating · subset of open" tone={LANE_COLOR.gating} shoot="count-gating" />
            <Count value={candidates.length} label="candidates" tone={LANE_COLOR.candidate} shoot="count-candidates" />
            <Count value={decided.length} label="decided" tone={LANE_COLOR.decided} shoot="count-decided" />
            <Count value={dismissed.length} label="dismissed" tone="var(--i-reality)" shoot="count-dismissed" />

            {/* The one number derived from an actual simulation: this
                scenario's landing against Reality's. Never a sum of gate
                days -- that would be a dashboard metric, not a forecast. */}
            <div className="ml-auto flex items-center gap-2 text-[11px]">
              {project.scenarioPreviewRefusal ? (
                <span>Scenario preview refused · Reality retained</span>
              ) : scenarioForecastPending ? (
                <span role="status" aria-live="polite" data-shoot="scenario-recalculating">Recalculating Scenario forecast…</span>
              ) : !completeCoverage ? (
                <span data-shoot="reality-landing" aria-label={origin?.claim.accessibleLabel}>
                  {origin?.name} · {origin?.claim.outcome ?? "Delivery outcome unavailable"} · not a full-project delivery forecast
                </span>
              ) : project.active && baselineDate && previewDate ? (
                <span data-shoot="scenario-consequence">
                  <span className="text-[var(--i-text-faint)]">{origin?.name ?? ""} </span>
                  <span data-shoot="reality-date" className="text-[var(--i-text-soft)]">
                    {fmtDay(baselineDate)}
                  </span>
                  <span className="text-[var(--i-text-faint)]"> → </span>
                  <span
                    data-shoot="scenario-date"
                    className="i-readout"
                    style={{ color: deltaDays < 0 ? "var(--i-mint)" : "var(--i-text)" }}
                  >
                    {fmtDay(previewDate)}
                  </span>
                  {deltaDays !== 0 && (
                    <span className="ml-1.5" style={{ color: deltaDays < 0 ? "var(--i-mint)" : "var(--i-amber)" }}>
                      {deltaDays > 0 ? "+" : ""}
                      {deltaDays}d
                    </span>
                  )}
                </span>
              ) : (
                <span data-shoot="reality-landing" className="text-[var(--i-text-faint)]">
                  {origin?.name} lands{" "}
                  <span data-shoot="reality-date">{baselineDate ? fmtDay(baselineDate) : "—"}</span> in Reality
                </span>
              )}
            </div>
          </div>
        </div>

        <DecisionInspector
          scenarioControls={selectedDecision?.status === "open" ? <div className="space-y-2 border-b border-[var(--i-border)] p-3 text-[12px]">
            <strong className="text-[var(--i-violet)]">{selectedPlan ? `What-if: ${selectedPlan.state === "gating" ? "blocking delay" : selectedPlan.state}` : "Try a what-if"}</strong>
            <div className="flex flex-wrap gap-2">
              <button className="i-control min-h-8 px-2 py-1" onClick={() => moveDecision(selectedDecision.id, "gating")}>Blocking delay</button>
              <button className="i-control min-h-8 px-2 py-1" onClick={() => moveDecision(selectedDecision.id, "open")}>Keep open</button>
              <button className="i-control min-h-8 px-2 py-1" onClick={() => moveDecision(selectedDecision.id, "resolved")}>Assume resolved</button>
              {selectedPlan && <button className="i-control min-h-8 px-2 py-1" data-testid="undo-decision-scenario" onClick={() => stageDecision(selectedDecision.id, null)}>Undo this what-if</button>}
            </div>
            <p className="text-[var(--i-text-faint)]">Below is the saved Reality record. To make an actual change, review the evidence and use the Reality actions.</p>
            {selectedPlan?.gate && <button className="i-control min-h-8 px-2 py-1" onClick={() => setTool("connect")}>Review & save real delay…</button>}
          </div> : undefined}
          candidateError={candidateError}
          decision={selectedDecision}
          candidate={selectedCandidate}
          assumed={selectedPlan?.state === "resolved" || !!selectedDecision?.gate && project.scenario.resolvedGateIds.has(selectedDecision.gate.id)}
          busy={busy}
          onClose={() => selectObject(null)}
          onAssume={(assume) => selectedDecision?.gate && assumeGate(selectedDecision.gate.id, assume)}
          onConnect={() => setTool("connect")}
          onDisconnect={async () => {
            if (!selectedDecision) return;
            const res = await run(() => write(`/api/decisions/${selectedDecision.id}/gate`, { method: "DELETE" }));
            if (!res.ok) throw new Error(String(res.body.error ?? "Could not disconnect the gate. Retry."));
          }}
          onUpdate={async (patch) => {
            if (selectedDecision) await updateDecision(selectedDecision.id, patch);
          }}
          onAcceptCandidate={() => selectedCandidate && void acceptCandidate(selectedCandidate.id)}
          onDismissCandidate={async () => {
            if (!selectedCandidate) return;
            const res = await writeCandidate(`/api/decision-candidates/${selectedCandidate.id}/dismiss`, { method: "POST" });
            if (!res) return;
            selectObject(null);
          }}
          onAttachToExisting={async (decisionId) => {
            if (!selectedCandidate) return;
            const res = await writeCandidate(`/api/decisions/${decisionId}/evidence`, {
                method: "POST",
                body: JSON.stringify({ fromCandidateId: selectedCandidate.id }),
              });
            if (!res) return;
            selectObject({ kind: "decision", id: decisionId });
          }}
          attachTargets={attachTargetsFor(decisions, selectedCandidate?.scopeId ?? null)}
        />
      </div>

      {/* ── TOOLS ──────────────────────────────────────────────────────── */}
      <NewDecisionTool
        open={tool === "new"}
        scopes={scopes}
        defaultScopeId={activeScopeId ?? ""}
        busy={busy}
        onClose={() => setTool(null)}
        onCreate={async (input) => {
          const res = await run(() =>
            write("/api/decisions", {
              method: "POST",
              body: JSON.stringify({
                requestId: input.requestId,
                scopeId: input.scopeId,
                title: input.title,
                rationale: input.rationale || null,
                owner: input.owner || null,
                neededBy: input.neededBy || null,
              }),
            })
          );
          if (!res.ok) throw new Error(String(res.body.error ?? "Could not create the decision. Retry."));
          const dup = res.body.possibleDuplicate as { title?: string } | null | undefined;
          const created = res.body.decision as { id?: string } | undefined;
          if (created?.id) selectObject({ kind: "decision", id: created.id });
          return { duplicateTitle: dup?.title ?? null };
        }}
      />

      <ImportTool
        open={tool === "import"}
        scopes={scopes}
        defaultScopeId={activeScopeId ?? ""}
        busy={busy}
        onClose={() => setTool(null)}
        onImport={async (input) => {
          const res = await run(() =>
            write("/api/decisions/import", { method: "POST", body: JSON.stringify(input) })
          );
          if (!res.ok) return { ok: false, message: String(res.body.error ?? "That import failed.") };
          if (input.mode === "candidates") {
            return { ok: true, message: `${res.body.imported} candidate(s) added, ${res.body.alreadyKnown} already known. No decisions and no gates were created.` };
          }
          const dupes = (res.body.possibleDuplicates as unknown[] | undefined)?.length ?? 0;
          return { ok: true, message: `${res.body.decisionsCreated} open decision(s) created${
            dupes > 0 ? `, ${dupes} skipped as possible duplicates` : ""
          }. No gates were created.` };
        }}
      />

      <ConnectTool
        open={(tool === "connect" || tool === "scenario-connect") && !!selectedDecision}
        scenario={tool === "scenario-connect"}
        anchorId={pendingDecision ? `pending-decision-${pendingDecision.id}` : undefined}
        decisionTitle={selectedDecision?.title ?? ""}
        gate={selectedPlan?.gate ? { ...selectedPlan.gate, targetScope: { id: selectedPlan.gate.targetScopeId } } : selectedDecision?.gate}
        scopes={scopes}
        defaultScopeId={selectedDecision?.scopeId ?? activeScopeId ?? ""}
        busy={busy}
        onClose={closeConnectTool}
        onConnect={async (input) => {
          if (!selectedDecision) return null;
          const validation = gateDraftError(input);
          if (validation) return { estimate: validation };
          if (tool === "scenario-connect") {
            stageDecision(selectedDecision.id, { basis: decisionScenarioBasis(selectedDecision), state: "gating", gate: input });
            setScopeId(input.targetScopeId);
            return null;
          }
          const res = await run(() =>
            write(`/api/decisions/${selectedDecision.id}/gate`, { method: "POST", body: JSON.stringify(input) })
          );
          if (res.ok) {
            stageDecision(selectedDecision.id, null);
            setScopeId(input.targetScopeId);
            return null;
          }
          const missing = (res.body.missing as Record<string, string>) ?? {};
          return Object.keys(missing).length > 0 ? missing : { dependency: String(res.body.error ?? "Rejected") };
        }}
      />
    </InstrumentShell>
    </DecisionDragProvider>
  );
}

/** §32: a candidate's evidence can join an existing decision in the same
    project instead of spawning a second canonical one. */
function attachTargetsFor(decisions: DecisionRow[], scopeId: string | null): DecisionRow[] {
  if (!scopeId) return [];
  return decisions.filter((d) => d.scopeId === scopeId && d.status !== "dismissed");
}

function Count({ value, label, tone, shoot }: { value: number; label: string; tone: string; shoot: string }) {
  return (
    <span data-shoot={shoot} className="flex items-baseline gap-1.5 text-[11px]">
      <span className="i-readout text-[13px]" style={{ color: value > 0 ? tone : "var(--i-text-faint)" }}>
        {value}
      </span>
      <span className="text-[var(--i-text-faint)]">{label}</span>
    </span>
  );
}

function Legend() {
  return (
    // Engraved on the chassis under the bays, the way a legend is silk-
    // screened onto a panel -- not set as a paragraph on a page.
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-3 py-1.5"
      style={{ background: "#090c0f", boxShadow: "inset 0 1px 4px rgba(0,0,0,0.55)" }}
    >
      <span className="i-label">Legend</span>
      {(
        [
          [LANE_COLOR.gating, "In delivery path (gating)", true],
          [LANE_COLOR.open, "Open — not gating", false],
          [LANE_COLOR.candidate, "Candidate — not accepted", false],
          [LANE_COLOR.decided, "Decided", false],
          ["var(--i-reality)", "Dismissed", false],
        ] as const
      ).map(([color, label, filled]) => (
        <span key={label} className="flex items-center gap-1.5 text-[10.5px] text-[var(--i-text-faint)]">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: filled ? color : "transparent", border: `1px solid ${color}` }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

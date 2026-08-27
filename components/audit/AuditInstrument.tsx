"use client";

// SIGNAL AUDIT — GRAPH-FIRST.
//
// The graph is the product surface. It owns the viewport; the inspector is a
// contextual panel beside it, and the review console exists only while a
// Finding is selected. Exploring the project should never cost you a permanent
// strip of screen for actions that do not apply to what you are looking at.
//
// ONE FETCH PER SCOPE, THEN PURE CLIENT WORK. The graph arrives once and is
// rebuilt into a graphology instance in the browser; selection, neighbourhood
// focus, search, expansion and Evidence Solo are all local traversals with no
// round trip. docs/DESIGN-NORTH-STAR.md treats that loop as a design
// constraint rather than an optimisation.
//
// WHAT MAY TOUCH REALITY: only the explicit human actions in the review
// console, each through an existing confirmed API route. Everything else here
// — camera, selection, expansion, solo, search — is presentation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Graph from "graphology";
import type { TruthMapModel, TruthFinding } from "@/lib/audit/truth";
import type { FindingProvenance, groundingLabel } from "@/lib/audit/provenance";
import type { PrimaryAction, ActionId } from "@/lib/audit/actions";
import {
  evidenceSolo,
  nodeId as gid,
  type AuditGraph,
  type AuditNodeAttributes,
  type AuditEdgeAttributes,
} from "@/lib/audit/graph";
import { layoutGraph, CLUSTER_ORDER, FIELD } from "@/lib/audit/graphLayout";
import { mutateReality } from "@/lib/instrument/reality";
import SignalGraph, { DEFAULT_CAMERA, MAX_ZOOM, MIN_ZOOM, focusCamera, type Camera } from "./SignalGraph";
import GraphInspector from "./GraphInspector";
import FindingInspector from "./FindingInspector";
import AuditReviewConsole, { type ConsoleMode } from "./AuditReviewConsole";
import { zoomLevel, nodeColor, KIND_LABEL } from "./graphTokens";

type Provenance = FindingProvenance & { grounding: ReturnType<typeof groundingLabel> };

interface GraphPayload {
  scopes: { id: string; name: string }[];
  scope: { id: string; name: string };
  graph: {
    nodes: { key: string; attributes: AuditNodeAttributes }[];
    edges: { source: string; target: string; attributes: AuditEdgeAttributes }[];
  };
  linearError: string | null;
}

interface TruthPayload {
  model: TruthMapModel;
  provenance: Record<string, Provenance>;
}

const SWEEP_MS = 2600;

export default function AuditInstrument({ initialScopeId }: { initialScopeId?: string }) {
  const [scopeId, setScopeId] = useState<string | undefined>(initialScopeId);
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [truth, setTruth] = useState<TruthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [solo, setSolo] = useState(false);
  const [mode, setMode] = useState<ConsoleMode>("A");
  const [awaiting, setAwaiting] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<ActionId | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [sweepAngle, setSweepAngle] = useState<number | null>(null);
  const [swept, setSwept] = useState<Set<string>>(new Set());
  const [sweepNote, setSweepNote] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  // ── LOAD ─────────────────────────────────────────────────────────────
  const load = useCallback(async (id?: string) => {
    const q = id ? `?scope=${encodeURIComponent(id)}` : "";
    const [gRes, tRes] = await Promise.all([
      fetch(`/api/audit/graph${q}${q ? "&" : "?"}slice=detail`),
      fetch(`/api/audit/truth${q}`),
    ]);
    if (!gRes.ok) {
      const body = (await gRes.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "The Signal Graph could not be read.");
      return;
    }
    setPayload((await gRes.json()) as GraphPayload);
    if (tRes.ok) setTruth((await tRes.json()) as TruthPayload);
    setError(null);
  }, []);

  useEffect(() => {
    void load(scopeId);
  }, [load, scopeId]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── THE CLIENT-SIDE GRAPH ────────────────────────────────────────────
  const graph: AuditGraph | null = useMemo(() => {
    if (!payload) return null;
    const g = new Graph<AuditNodeAttributes, AuditEdgeAttributes>({
      type: "directed",
      multi: true,
      allowSelfLoops: false,
    });
    for (const n of payload.graph.nodes) g.addNode(n.key, n.attributes);
    for (const e of payload.graph.edges) g.addDirectedEdge(e.source, e.target, e.attributes);
    return g;
  }, [payload]);

  const layout = useMemo(() => (graph ? layoutGraph(graph) : null), [graph]);

  // ── WHAT IS OPEN, NOT WHAT EXISTS ────────────────────────────────────
  //
  // This set used to be called `visible`, and that name was the bug: a node
  // outside it was not drawn at all, so 41 of the largest Scope's 65 things
  // simply were not there and no amount of zooming brought them back. It now
  // names something narrower and truer — which nodes are showing their
  // IDENTITY. Everything else is still on screen, at its real seat, as a
  // latent mark. The renderer owns that distinction; see graphTokens.
  const opened = useMemo(() => {
    const out = new Set<string>();
    if (!graph) return out;
    graph.forEachNode((n, a) => {
      if (a.slice === "core") out.add(n);
      else if (a.lane && expanded.has(a.lane)) out.add(n);
    });
    return out;
  }, [graph, expanded]);

  // ── SEARCH ───────────────────────────────────────────────────────────
  //
  // Deterministic, over label, identifier and the canonical ref. No semantic
  // search: a graph search that sometimes finds the wrong node is worse than
  // one that only finds what you typed.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !graph) return null;
    const out = new Set<string>();
    graph.forEachNode((n, a) => {
      const hay = `${a.label} ${a.ref} ${a.identifier ?? ""} ${a.kind}`.toLowerCase();
      if (hay.includes(q)) out.add(n);
    });
    return out;
  }, [query, graph]);

  const matchList = useMemo(() => {
    if (!matches || !graph) return [];
    return [...matches]
      .map((n) => ({ id: n, attrs: graph.getNodeAttributes(n) }))
      .sort((a, b) => String(a.attrs.label).localeCompare(String(b.attrs.label)))
      .slice(0, 40);
  }, [matches, graph]);

  // Searching reveals what it finds: a match inside a collapsed cluster would
  // otherwise be "found" and invisible, which reads as broken.
  useEffect(() => {
    if (!matches || !graph || matches.size === 0) return;
    const needed = new Set<string>();
    for (const n of matches) {
      const a = graph.getNodeAttributes(n);
      if (a.slice !== "core" && a.lane) needed.add(a.lane as string);
    }
    if (needed.size > 0) setExpanded((prev) => new Set([...prev, ...needed]));
  }, [matches, graph]);

  const selectedAttrs = selectedId && graph?.hasNode(selectedId) ? graph.getNodeAttributes(selectedId) : null;
  const selectedFinding: TruthFinding | null = useMemo(() => {
    if (!selectedAttrs || selectedAttrs.kind !== "finding" || !truth) return null;
    const id = selectedId!.replace("finding:", "");
    return truth.model.findings.find((f) => f.id === id) ?? null;
  }, [selectedAttrs, selectedId, truth]);

  // ── EVIDENCE SOLO — a guarded traversal, not a neighbourhood walk ─────
  const soloNodes = useMemo(() => {
    if (!solo || !graph || !selectedId) return null;
    return evidenceSolo(graph, selectedId).nodes;
  }, [solo, graph, selectedId]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setResult(null);
    if (id === null) {
      setSolo(false);
      setMode("A");
    }
  }, []);

  // EVIDENCE SOLO MUST REVEAL WHAT IT LIGHTS.
  //
  // The traversal reaches passages and sources, which live in the `evidence`
  // slice and are collapsed by default — so soloing a finding lit a route
  // whose far end was not mounted, and the answer to "why does Signal believe
  // this" was two nodes and some empty space. Turning solo on expands
  // whatever it needs, for the same reason searching does.
  useEffect(() => {
    if (!soloNodes || !graph) return;
    const needed = new Set<string>();
    for (const n of soloNodes) {
      if (!graph.hasNode(n)) continue;
      const a = graph.getNodeAttributes(n);
      if (a.slice !== "core" && a.lane) needed.add(a.lane as string);
    }
    if (needed.size > 0) setExpanded((prev) => new Set([...prev, ...needed]));
  }, [soloNodes, graph]);

  // Leaving a finding must drop the hypothetical with it.
  useEffect(() => {
    if (!selectedFinding) {
      setSolo(false);
      setMode("A");
    }
  }, [selectedFinding]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (query) setQuery("");
        else if (selectedId) select(null);
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-shoot="graph-search"]')?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, query, select]);

  // EXPANDING FLIES TO WHAT IT REVEALED.
  //
  // Clicking "+14" on a cluster whose contents appear off to one side looked
  // like nothing had happened. The reference pairs expansion with a camera
  // move for the same reason: revealing detail is useless if you are not
  // looking at where it appeared.
  const toggleCluster = useCallback(
    (cluster: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(cluster)) next.delete(cluster);
        else next.add(cluster);
        return next;
      });
      if (!expanded.has(cluster)) {
        const anchor = gid.lane(cluster);
        if (layout?.has(anchor)) {
          const p = layout.get(anchor)!;
          // Framed between the puck and the core, so the cluster's contents
          // AND its relationship to Reality stay in view.
          setCamera({
            x: FIELD.cx + (p.x - FIELD.cx) * 1.02,
            y: FIELD.cy + (p.y - FIELD.cy) * 1.02,
            k: 1.35,
          });
        }
      }
    },
    [expanded, layout]
  );

  const flyTo = useCallback(
    (id: string) => {
      if (!layout) return;
      setCamera((c) => focusCamera(layout, id, c, Math.max(c.k, 2.3)));
    },
    [layout]
  );

  // ── RUN AUDIT ────────────────────────────────────────────────────────
  //
  // A real pass: every cluster's checkpoints are recomputed from live data
  // while the sweep crosses it, and the note names the cluster actually being
  // tested. It does NOT generate new Findings — that needs new evidence, and
  // that path is "New evidence audit".
  const runAudit = useCallback(() => {
    if (sweepAngle != null || !graph) return;
    const started = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const refresh = load(scopeId);

    if (reduced) {
      setSweepNote("Re-comparing every cluster against Reality…");
      void refresh.then(() => {
        setSweepNote(null);
        setResult({ ok: true, message: "Re-compared every cluster against Reality." });
      });
      return;
    }

    setSwept(new Set());
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / SWEEP_MS);
      setSweepAngle(-90 + t * 360);
      const idx = Math.min(CLUSTER_ORDER.length - 1, Math.floor(t * CLUSTER_ORDER.length));
      const cluster = CLUSTER_ORDER[idx];
      setSwept((prev) => (prev.has(cluster) ? prev : new Set([...prev, cluster])));
      const lane = graph.hasNode(gid.lane(cluster)) ? graph.getNodeAttributes(gid.lane(cluster)) : null;
      if (lane) {
        setSweepNote(
          `Comparing ${lane.label}… ${
            lane.supplied ? (lane.state === "verified" ? "aligned" : String(lane.state)) : "not supplied"
          }`
        );
      }
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else {
        setSweepAngle(null);
        void refresh.then(() => {
          setSweepNote(null);
          setTimeout(() => setSwept(new Set()), 900);
        });
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [sweepAngle, graph, load, scopeId]);

  // ── HUMAN ACTIONS ────────────────────────────────────────────────────
  const runAction = useCallback(
    async (action: PrimaryAction, text: string) => {
      if (!selectedFinding) return;
      setResult(null);
      if (action.id === "need_more_evidence") {
        setAwaiting((prev) => {
          const next = new Set(prev);
          if (next.has(selectedFinding.id)) next.delete(selectedFinding.id);
          else next.add(selectedFinding.id);
          return next;
        });
        return;
      }
      if (action.id === "correct") {
        setResult({
          ok: false,
          message: "Correct / edit is not implemented yet — it lands with the finding-editing tranche.",
        });
        return;
      }
      setBusy(action.id);
      try {
        const done = await dispatchAction(action.id, selectedFinding.id, text);
        setResult(done);
        if (done.ok) {
          await load(scopeId);
          select(null);
        }
      } catch (e) {
        setResult({ ok: false, message: e instanceof Error ? e.message : "That did not go through." });
      } finally {
        setBusy(null);
      }
    },
    [selectedFinding, load, scopeId, select]
  );

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" style={{ background: "var(--i-bg)" }}>
        <div className="max-w-[40ch] text-center">
          <div className="i-label mb-2" style={{ color: "var(--i-amber)" }}>
            Audit could not read the project
          </div>
          <p className="text-[13px] leading-[1.6] text-[var(--i-text-soft)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload || !graph || !layout) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ background: "var(--i-bg)" }}>
        <span className="i-label" style={{ color: "var(--i-text-faint)" }}>
          Reading the project…
        </span>
      </div>
    );
  }

  const level = zoomLevel(camera.k);
  const counts = countKinds(graph);
  const expandableClusters = CLUSTER_ORDER.filter((c) =>
    graph.someNode((_n, a) => a.lane === c && a.slice !== "core")
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: "var(--i-bg)" }}>
      {/* ── HEADER ───────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-2.5"
        style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}
        data-shoot="audit-header"
      >
        <span className="text-[12px] font-medium tracking-[0.16em] text-[var(--i-text)]">SIGNAL AUDIT</span>
        <select
          value={payload.scope.id}
          onChange={(e) => {
            setScopeId(e.target.value);
            select(null);
            setExpanded(new Set());
            setCamera(DEFAULT_CAMERA);
          }}
          aria-label="Project"
          data-shoot="audit-scope"
          className="rounded-md px-2.5 py-1.5 text-[11.5px] outline-none"
          style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        >
          {payload.scopes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {truth?.model.lastRunAt && (
          <span className="text-[11px]" style={{ color: "var(--i-signal)" }}>
            Current audit · {fmt(truth.model.lastRunAt)}
            {truth.model.priorRunAt && (
              <span style={{ color: "var(--i-text-faint)" }}> ↔ Prior · {fmt(truth.model.priorRunAt)}</span>
            )}
          </span>
        )}
        {sweepNote && (
          <span data-shoot="sweep-note" className="text-[11px]" style={{ color: "var(--i-signal)" }}>
            {sweepNote}
          </span>
        )}

        <div className="flex-1" />

        {payload.linearError && (
          <span className="text-[11px]" style={{ color: "var(--i-amber)" }} data-shoot="linear-error">
            Linear unread — execution cluster empty
          </span>
        )}
        <Link
          href="/audit/new"
          className="rounded-md px-2.5 py-1.5 text-[11px] transition-colors hover:bg-white/[0.04]"
          style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
        >
          New evidence audit
        </Link>
        <Link href="/audit/history" className="text-[11px]" style={{ color: "var(--i-text-faint)" }}>
          History
        </Link>
        <button
          type="button"
          onClick={runAudit}
          disabled={sweepAngle != null}
          data-shoot="run-audit"
          className="rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-50"
          style={{ background: "var(--i-signal-soft)", border: "1px solid var(--i-signal)", color: "var(--i-signal)" }}
        >
          {sweepAngle != null ? "Scanning…" : "Run audit"}
        </button>
      </div>

      {/* ── BODY: the graph owns it ──────────────────────────────── */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(340px,376px)" }}>
        <div className="relative min-h-0" data-shoot="graph-viewport">
          <SignalGraph
            graph={graph}
            opened={opened}
            selectedId={selectedId}
            hoveredId={hoveredId}
            soloNodes={soloNodes}
            matches={matches}
            camera={camera}
            onCamera={setCamera}
            onSelect={select}
            onHover={setHoveredId}
            expanded={expanded}
            onToggleCluster={toggleCluster}
            sweepAngle={sweepAngle}
            swept={swept}
          />

          {/* SEARCH + CAMERA, floating over the field — the reference keeps
              its controls on the canvas rather than stealing a column. */}
          <div className="pointer-events-none absolute right-3 top-3 w-[266px]">
            <div
              className="pointer-events-auto rounded-lg p-2.5"
              style={{ background: "color-mix(in srgb, var(--i-panel) 92%, transparent)", border: "1px solid var(--i-border-strong)" }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${graph.order} nodes…  ( / )`}
                aria-label="Search the graph"
                data-shoot="graph-search"
                className="w-full rounded-md px-2.5 py-1.5 text-[11.5px] outline-none"
                style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              />
              {matchList.length > 0 && (
                <div className="mt-2 max-h-[220px] overflow-y-auto i-noscrollbar" data-shoot="search-results">
                  {matchList.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        select(m.id);
                        flyTo(m.id);
                      }}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: nodeColor(m.attrs) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text)]">
                        {String(m.attrs.label)}
                      </span>
                      <span className="shrink-0 text-[9px] text-[var(--i-text-faint)]">
                        {KIND_LABEL[m.attrs.kind] ?? m.attrs.kind}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {matches && matchList.length === 0 && (
                <p className="mt-2 px-1 text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                  Nothing in this project matches. Try a ticket id, a person, or a cluster name.
                </p>
              )}

              <div className="mt-2.5 flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--i-border)" }}>
                <span className="i-label" style={{ color: "var(--i-text-faint)" }}>
                  {level} · {Math.round(camera.k * 100)}%
                </span>
                <div className="flex gap-1">
                  <MiniButton onClick={() => setCamera((c) => ({ ...c, k: Math.max(MIN_ZOOM, c.k / 1.35) }))} label="−" title="Zoom out" />
                  <MiniButton onClick={() => setCamera((c) => ({ ...c, k: Math.min(MAX_ZOOM, c.k * 1.35) }))} label="+" title="Zoom in" />
                  <MiniButton onClick={() => setCamera(DEFAULT_CAMERA)} label="Fit" title="Fit the whole project" shoot="camera-fit" />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span
                  className="i-label"
                  style={{ color: "var(--i-text-faint)" }}
                  data-shoot="opened-readout"
                  title="Every node is drawn. This is how many are showing their identity rather than sitting as a mark."
                >
                  {opened.size} of {graph.order} opened
                </span>
                <div className="flex gap-1">
                  <MiniButton
                    onClick={() => setExpanded(new Set(expandableClusters))}
                    label="Expand all"
                    shoot="expand-all"
                  />
                  <MiniButton onClick={() => setExpanded(new Set())} label="Collapse" shoot="collapse-all" />
                </div>
              </div>
            </div>
          </div>

          {/* A legend only where it earns its place: what the two edge
              treatments mean. Everything else is learnable by clicking. */}
          <div
            className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-4 rounded-md px-2.5 py-1.5"
            style={{ background: "color-mix(in srgb, var(--i-panel) 88%, transparent)", border: "1px solid var(--i-border)" }}
            data-shoot="graph-legend"
          >
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--i-text-soft)" }}>
              <svg width="22" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="22" y2="3" stroke="var(--i-text-soft)" strokeWidth="1.4" />
              </svg>
              attested
            </span>
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--i-text-faint)" }}>
              <svg width="22" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="22" y2="3" stroke="var(--i-text-faint)" strokeWidth="1.4" strokeDasharray="4 4" />
              </svg>
              inferred
            </span>
            <span className="text-[10px]" style={{ color: "var(--i-text-faint)" }}>
              distance from centre = disagreement
            </span>
          </div>
        </div>

        {/* ── INSPECTOR ────────────────────────────────────────────── */}
        <div
          className="flex min-h-0 flex-col"
          style={{ background: "var(--i-panel)", borderLeft: "1px solid var(--i-border)" }}
          data-shoot="inspector"
        >
          {selectedFinding && truth ? (
            <FindingInspector
              model={truth.model}
              finding={selectedFinding}
              provenance={truth.provenance[selectedFinding.id] ?? null}
              onSelect={(id) => select(gid.finding(id))}
              onEvidenceSolo={() => setSolo(true)}
            />
          ) : selectedId && graph.hasNode(selectedId) ? (
            <GraphInspector graph={graph} nodeId={selectedId} onSelect={select} onFocusNode={flyTo} />
          ) : (
            <GraphOverview
              graph={graph}
              truth={truth}
              counts={counts}
              onSelect={(id) => {
                select(id);
                flyTo(id);
              }}
            />
          )}
        </div>
      </div>

      {/* ── REVIEW CONSOLE — only for a Finding ───────────────────────
          Graph-first means the default state is the graph owning the
          viewport. A console of acceptance actions has nothing to say about
          a Linear ticket, so it does not occupy space while one is selected. */}
      {selectedFinding && truth && (
        <AuditReviewConsole
          model={truth.model}
          finding={selectedFinding}
          provenance={truth.provenance[selectedFinding.id] ?? null}
          evidenceSolo={solo}
          onEvidenceSolo={setSolo}
          mode={mode}
          onMode={setMode}
          onAction={runAction}
          busy={busy}
          result={result}
          awaitingEvidence={awaiting.has(selectedFinding.id)}
        />
      )}
    </div>
  );
}

// ── RESTING INSPECTOR ──────────────────────────────────────────────────

function GraphOverview({
  graph,
  truth,
  counts,
  onSelect,
}: {
  graph: AuditGraph;
  truth: TruthPayload | null;
  counts: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  const top = useMemo(() => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    return graph
      .filterNodes((_n, a) => a.kind === "finding" && !a.handled)
      .sort(
        (a, b) =>
          (order[graph.getNodeAttribute(a, "tier") as keyof typeof order] ?? 9) -
          (order[graph.getNodeAttribute(b, "tier") as keyof typeof order] ?? 9)
      )
      .slice(0, 4);
  }, [graph]);

  const unsupplied = graph.filterNodes((_n, a) => a.kind === "lane" && a.supplied === false);

  return (
    <div className="flex h-full flex-col overflow-y-auto i-noscrollbar" data-shoot="inspector-overview">
      <div className="px-4 pt-4">
        <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
          Project shape
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="i-readout text-[30px] leading-none text-[var(--i-text)]">{graph.order}</span>
          <span className="text-[12px] text-[var(--i-text-soft)]">
            things Audit can see, and {graph.size} relationships between them —
            all of them on the field
          </span>
        </div>
      </div>

      <div className="mt-4 px-4">
        <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
          What is out there
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          {Object.entries(counts)
            .filter(([, n]) => n > 0)
            .map(([kind, n]) => (
              <div key={kind} className="flex items-baseline justify-between gap-2">
                <span style={{ color: "var(--i-text-soft)" }}>
                  {KIND_LABEL[kind as keyof typeof KIND_LABEL] ?? kind}
                </span>
                <span className="i-readout text-[11px] text-[var(--i-text)]">{n}</span>
              </div>
            ))}
        </div>
      </div>

      {top.length > 0 && (
        <div className="mt-5 px-4">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Where Reality disagrees
          </div>
          <div className="space-y-1.5">
            {top.map((id) => {
              const a = graph.getNodeAttributes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(id)}
                  data-shoot="overview-finding"
                  className="w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                  style={{ borderColor: "var(--i-border-strong)", background: "var(--i-panel)" }}
                >
                  <span
                    className="block text-[9px] uppercase tracking-[0.14em]"
                    style={{ color: nodeColor(a) }}
                  >
                    {String(a.kindLabel ?? "Finding")} · {String(a.tier)}
                    {a.needsHuman ? " · human" : ""}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-[1.45] text-[var(--i-text)]">
                    {String(a.label)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {unsupplied.length > 0 && (
        <div className="mt-5 px-4 pb-5">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Not supplying this project
          </div>
          <div className="space-y-1">
            {unsupplied.map((id) => (
              <div key={id} className="flex items-center gap-2 text-[11px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--i-reality)" }} />
                <span className="text-[var(--i-text-soft)]">{String(graph.getNodeAttribute(id, "label"))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {truth && (
        <div className="mt-auto border-t px-4 py-3" style={{ borderColor: "var(--i-border)" }}>
          <div className="flex items-center gap-2">
            <ShieldMark />
            <span className="i-label" style={{ color: "var(--i-signal)" }}>
              Reality protected
            </span>
          </div>
          <p className="mt-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--i-text-faint)" }}>
            No change to Reality occurs without human confirmation. Select a finding to review one.
          </p>
        </div>
      )}
    </div>
  );
}

function MiniButton({
  onClick,
  label,
  title,
  shoot,
}: {
  onClick: () => void;
  label: string;
  title?: string;
  shoot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-shoot={shoot}
      className="rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-white/[0.06]"
      style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
    >
      {label}
    </button>
  );
}

function ShieldMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--i-signal)" strokeWidth={1.6} aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The whole graph, by kind.
 *
 * Deliberately not filtered by what is open: the panel is headed "What is out
 * there", the field now draws every one of these, and a breakdown that summed
 * to 24 under a headline reading 65 was just wrong.
 */
function countKinds(graph: AuditGraph): Record<string, number> {
  const out: Record<string, number> = {};
  graph.forEachNode((_n, a) => {
    if (a.kind === "reality" || a.kind === "scope") return;
    out[a.kind] = (out[a.kind] ?? 0) + 1;
  });
  return out;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function dispatchAction(
  id: ActionId,
  findingId: string,
  text: string
): Promise<{ ok: boolean; message: string }> {
  switch (id) {
    case "open_decision": {
      const res = await mutateReality(`/api/findings/${findingId}/open-decision`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; note?: string };
      return res.ok
        ? { ok: true, message: body.note ?? "Decision opened." }
        : { ok: false, message: body.error ?? "The decision could not be opened." };
    }
    case "add_missing_work": {
      const res = await fetch(`/api/findings/${findingId}/ticket`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; preview?: { title?: string } };
      if (body.preview) {
        return {
          ok: false,
          message: `Preview ready — "${body.preview.title}". Filing to Linear needs explicit confirmation, which lands with the ticket-confirmation tranche.`,
        };
      }
      return { ok: false, message: body.error ?? "The ticket preview could not be composed." };
    }
    case "record_resolution": {
      const res = await mutateReality(`/api/findings/${findingId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok
        ? { ok: true, message: "Recorded. The finding is resolved." }
        : { ok: false, message: body.error ?? "That could not be recorded." };
    }
    case "reject": {
      const res = await mutateReality(`/api/findings/${findingId}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok
        ? { ok: true, message: "Dismissed with your reason." }
        : { ok: false, message: body.error ?? "A reason is required to dismiss a finding." };
    }
    default:
      return { ok: false, message: "That action is not wired up." };
  }
}

export { FIELD };

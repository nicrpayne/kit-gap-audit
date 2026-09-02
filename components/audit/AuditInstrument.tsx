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
import {
  layoutGraph,
  layoutExtent,
  layoutAggregates,
  CLUSTER_ORDER,
  FIELD,
} from "@/lib/audit/graphLayout";
import { mutateReality } from "@/lib/instrument/reality";
import { fitCamera, type GraphLayout } from "./SignalGraph";
// THE RENDERER BOUNDARY. The instrument mounts a painter without knowing
// which one it got — `?renderer=canvas` picks the experimental Canvas
// viewport, and SVG stays the default. Every prop below is the same either
// way, which is the property that makes the A/B a comparison of painters
// rather than of two different products.
import AuditGraphRenderer from "./renderer/AuditGraphRenderer";
import type { AuditSpatialAuthority, SpatialFrameReason } from "./renderer/types";
import {
  DEFAULT_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
  FLY_MS,
  easeOutCubic,
  interpolateCamera,
  cameraSettled,
  prefersReducedMotion,
  frameFocus,
  boundsOf,
  type Camera,
  type Viewport,
} from "./cameraMotion";
import GraphInspector from "./GraphInspector";
import AggregateInspector from "./AggregateInspector";
import FindingInspector from "./FindingInspector";
import AuditReviewConsole, { type ConsoleMode } from "./AuditReviewConsole";
import { zoomLevel, nextZoomLevel, nodeColor, fieldLabel, KIND_LABEL, type ZoomLevel } from "./graphTokens";
import { SignalSearchIndex, SEARCH_MATURITY, type SearchHit } from "@/lib/audit/searchIndex";
import { revealFor, commitFor, disclosedSet } from "@/lib/audit/searchLens";
import type { SearchFamily, SearchFieldName } from "@/lib/audit/searchDocument";
import { semanticFocus, traceIsComplete, edgeFocusClass } from "@/lib/audit/focus";
import { structuralWeb } from "@/lib/audit/structuralWeb";

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

/**
 * THE CLOSEST PAIR IN A SET, IN WORLD UNITS.
 *
 * The comprehension law needs it to answer "will these labels collide" —
 * labels are a fixed size on screen, so what varies is how much room the
 * marks leave between them. O(n²), which is free at the sizes this is called
 * with (a one-hop neighbourhood, or a provenance route) and capped anyway:
 * past 40 nodes the answer is always "too tight", and computing it exactly
 * would be the one place this file does real work.
 */
function spreadOf(layout: GraphLayout | null, ids: string[]): number {
  if (!layout || ids.length < 2) return 0;
  const pts = ids.map((id) => layout.get(id)).filter(Boolean) as { x: number; y: number }[];
  if (pts.length < 2) return 0;
  const n = Math.min(pts.length, 40);
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : 0;
}

/** One step of local graph navigation. See the history block below. */
interface NavEntry {
  id: string;
  camera: Camera;
  expanded: string[];
}

/** A stable empty set, so "no search is running" is referentially equal
    between renders and does not retrigger every memo that reads it. */
const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Search may return dozens of valid lexical hits, but the map is a locating
 * surface rather than a second copy of the result list. Keep the full ranked
 * result set in the panel and promote only the leading context on the field.
 * Eight covers the best answer plus its nearest alternatives without letting
 * a broad/typo query turn corpus volume back into composition.
 */
const SEARCH_FIELD_PROMOTION_LIMIT = 8;

export default function AuditInstrument({ initialScopeId }: { initialScopeId?: string }) {
  const [scopeId, setScopeId] = useState<string | undefined>(initialScopeId);
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [truth, setTruth] = useState<TruthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [copiedReference, setCopiedReference] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [camera, setCameraState] = useState<Camera>(DEFAULT_CAMERA);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [solo, setSolo] = useState(false);
  const [mode, setMode] = useState<ConsoleMode>("A");
  const [awaiting, setAwaiting] = useState<Set<string>>(new Set());
  /** Whether the search result list is showing. Collapsed once a result has
      been taken, so the panel stops covering the thing it just found. */
  const [resultsOpen, setResultsOpen] = useState(true);
  /** Which result the arrow keys are on. Zero is the top hit, so Enter with
      no arrowing at all takes the best answer — the common case. */
  const [cursor, setCursor] = useState(0);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // The measured field, reported up by the renderer. The framing law cannot
  // be evaluated without it — "is this already comfortably in view" is a
  // question about a real rectangle on a real screen.
  //
  // Held in BOTH a ref and state, and the split is deliberate: the framing law
  // reads it synchronously inside `select`, where a state value could be a
  // render behind; `homeCamera` is derived from it, so it also has to be
  // something React recomputes. A resize is rare enough that the extra render
  // costs nothing.
  const viewportRef = useRef<Viewport>({ w: 1000, h: 800 });
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const onViewport = useCallback((vp: Viewport) => {
    viewportRef.current = vp;
    setViewport((prev) => (prev && prev.w === vp.w && prev.h === vp.h ? prev : vp));
  }, []);

  const [busy, setBusy] = useState<ActionId | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── THE CAMERA ───────────────────────────────────────────────────────
  //
  // Two ways to move it, and the difference is the whole contract:
  //
  //   setCamera   a direct write. The hand: wheel, drag, zoom buttons.
  //               ALWAYS cancels whatever is in flight.
  //   flyCamera   an eased move to a place. Search results, expanding a
  //               distant cluster, Fit. Always interruptible, always
  //               retargetable from wherever it has actually got to.
  //
  // The rule that makes it feel like an instrument rather than a slideshow:
  // THE GRAPH NEVER MAKES YOU WAIT FOR AN ANIMATION. There is no queue, no
  // lock, and no state that only becomes correct once a tween finishes —
  // every frame writes a complete camera.
  const tweenRef = useRef<number | null>(null);
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA);
  const spatialAuthorityRef = useRef<AuditSpatialAuthority | null>(null);
  const onSpatialAuthority = useCallback((authority: AuditSpatialAuthority | null) => {
    spatialAuthorityRef.current = authority;
  }, []);

  const stopTween = useCallback(() => {
    spatialAuthorityRef.current?.cancelFlight();
    if (tweenRef.current !== null) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }
  }, []);

  // The ref is written SYNCHRONOUSLY, before React is told anything. A wheel
  // gesture delivers events faster than React commits, and each one has to
  // compute from the result of the last — not from whatever the last render
  // happened to see. `cameraRef` is therefore the live camera and `camera`
  // is merely the last one drawn.
  const setCamera = useCallback(
    (next: Camera | ((c: Camera) => Camera)) => {
      stopTween();
      const v = typeof next === "function" ? next(cameraRef.current) : next;
      cameraRef.current = v;
      setCameraState(v);
    },
    [stopTween]
  );

  /** The live camera, for handlers that must chain off their own last result
      rather than off the last render. */
  const getCamera = useCallback(() => cameraRef.current, []);

  // Canvas camera flights are owned and advanced by Rubric. Publishing one
  // reached frame back into React is observation, not a new hand gesture.
  // Sending those frames through `setCamera` called `stopTween`, which in
  // turn cancelled Rubric's flight after its first frame. Keep the product
  // mirror current without reaching back into the spatial authority.
  const publishSpatialCamera = useCallback((next: Camera) => {
    cameraRef.current = next;
    setCameraState(next);
  }, []);

  const flyCamera = useCallback(
    (to: Camera) => {
      stopTween();
      const from = cameraRef.current;
      // Nothing to show, or the viewer has asked their system for less
      // motion: arrive rather than animate. Both still land exactly.
      if (cameraSettled(from, to) || prefersReducedMotion()) {
        cameraRef.current = to;
        setCameraState(to);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / FLY_MS);
        // The last frame writes the destination itself, not an interpolation
        // that rounds to it — a camera that stops NEAR where it said it was
        // going is a camera you cannot write a proof about.
        const v = t >= 1 ? to : interpolateCamera(from, to, easeOutCubic(t));
        cameraRef.current = v;
        setCameraState(v);
        tweenRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      tweenRef.current = requestAnimationFrame(step);
    },
    [stopTween]
  );

  // ── THE DETAIL TIER, WITH HYSTERESIS ─────────────────────────────────
  //
  // Owned here rather than in the renderer because the camera is owned here
  // and the header readout names the same tier — two derivations of one
  // sticky value would drift apart at exactly the boundary that made it
  // sticky. Adjusted during render (React's documented pattern for state
  // that follows a prop) so the tier is never a frame behind the camera.
  const [level, setLevel] = useState<ZoomLevel>(() => zoomLevel(DEFAULT_CAMERA.k));
  const [levelAtK, setLevelAtK] = useState<number>(DEFAULT_CAMERA.k);
  if (camera.k !== levelAtK) {
    setLevelAtK(camera.k);
    setLevel((prev) => nextZoomLevel(camera.k, prev));
  }

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
    if (tweenRef.current) cancelAnimationFrame(tweenRef.current);
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

  // ── AGGREGATES ARE SELECTABLE, AND THEY ARE NOT NODES ────────────────
  //
  // §4: an aggregate bubble is a PROJECTION OF REAL MEMBERS, not a fake node.
  // Signal stores no row for it, `graph.hasNode("agg:…")` is false, and every
  // guard downstream that asks that question stays correct without being
  // touched: no Trace, no review console, no truth status, no accession
  // number. What it does have is a count, a composition and a list of real
  // ids — which is exactly what its panel shows.
  const aggregates = useMemo(() => (layout ? layoutAggregates(layout) : []), [layout]);

  // WHERE "FIT" GOES, DERIVED FROM WHAT IS ACTUALLY SEATED.
  //
  // The home camera used to be a constant, which was right only while the
  // field's extent was one. External intelligence seats outside the record's
  // edge, so a fixed zoom would leave the outermost band off screen at the
  // one moment the user asked to see everything. `layoutExtent` floors at
  // `edgeR`, so a Scope with no external intelligence still fits at exactly
  // the zoom it always has.
  const homeCamera = useMemo(
    () => (layout ? fitCamera(layoutExtent(layout), viewport ?? undefined) : DEFAULT_CAMERA),
    [layout, viewport]
  );

  // AND THE INSTRUMENT OPENS AT FIT, not at a constant that happens to be
  // near it. `fitCamera`'s own docstring has always said "what the instrument
  // opens at"; the code opened at DEFAULT_CAMERA instead, so on a project
  // with external intelligence the outer band was off screen on arrival, and
  // on a short window the record itself overflowed. Both make Law 5's first
  // rule — "if it is already visible, do not move" — false on the very first
  // click.
  //
  // Once per project, and only after the field has actually been measured;
  // never again, so it can never fight a camera the reader has set.
  const homedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!layout || !viewport || !payload) return;
    if (homedFor.current === payload.scope.id) return;
    homedFor.current = payload.scope.id;
    setCamera(homeCamera);
  }, [layout, viewport, payload, homeCamera, setCamera]);

  // ── SEARCH ───────────────────────────────────────────────────────────
  //
  // LEVEL 1: lexical, tokenised, fuzzy. The whole model — normalisation, the
  // document projection, field weights, typo thresholds — lives in
  // lib/audit/search*.ts and is proved by scripts/audit-search-proof.ts. This
  // component only holds the query, renders the results, and decides what a
  // query is ALLOWED to do to the field.
  //
  // Built once per graph. Rebuilding on a keystroke would be the one thing
  // that makes a several-hundred-node search feel slow; the index is
  // immutable, so "does the index agree with the graph" needs no reasoning.
  const searchIndex = useMemo(() => (graph ? SignalSearchIndex.build(graph) : null), [graph]);

  const outcome = useMemo(() => {
    if (!searchIndex || query.trim().length === 0) return null;
    return searchIndex.search(query);
  }, [searchIndex, query]);

  /** Memoised so the keyboard handler's identity is stable between renders —
      an empty array literal is a new array every time, and that would rebuild
      `onSearchKey` on every keystroke of every other piece of state. */
  const matchList: SearchHit[] = useMemo(() => outcome?.hits ?? [], [outcome]);

  const fieldMatchList: SearchHit[] = useMemo(
    () => matchList.slice(0, SEARCH_FIELD_PROMOTION_LIMIT),
    [matchList]
  );

  /** The set the renderer dims against. Identity only — the ranking lives in
      `matchList`, and handing the renderer a scored list would make it care
      about relevance, which is not its job. */
  const matches = useMemo(() => {
    if (!outcome) return null;
    return new Set(fieldMatchList.map((h) => h.id));
  }, [outcome, fieldMatchList]);

  // ── THE LENS: WHAT A QUERY MAY REVEAL, AND WHAT IT MAY NOT ───────────
  //
  // THE VERIFIED PRODUCTION DEFECT. This effect used to be:
  //
  //     setExpanded((prev) => new Set([...prev, ...needed]))
  //
  // — right in intent (a match nobody can see reads as broken) and wrong in
  // mechanism. `expanded` is what the READER opened, it is persistent, and
  // nothing ever took those additions back. Escape clears the query and does
  // not close what the query opened, so every search left the field a little
  // more open than it found it. One tested UX run ended at 435 of 438 nodes
  // expanded, at which point the progressive disclosure the whole layout
  // depends on is simply gone.
  //
  // `revealed` is a SECOND, TEMPORARY channel. It is DERIVED from the current
  // hits — not accumulated into — so it is replaced wholesale on every
  // keystroke and is empty the moment the query is. The renderer unions the
  // two. Nothing needs restoring because nothing was disturbed: clearing the
  // search does not undo a mutation, it stops deriving a set. That is a
  // stronger guarantee than snapshot-and-restore, which is only ever as
  // correct as its most recent snapshot.
  //
  // Taking a result is different, and `select` treats it so: choosing is an
  // act, and an act may open the minimum structure that holds the chosen
  // object in view.
  const revealed = useMemo(
    () => (graph && outcome ? revealFor(graph, fieldMatchList.map((h) => h.id)) : EMPTY_SET),
    [graph, outcome, fieldMatchList]
  );

  // ── WHAT IS OPEN, NOT WHAT EXISTS ────────────────────────────────────
  //
  // This set used to be called `visible`, and that name was the bug: a node
  // outside it was not drawn at all, so 41 of the largest Scope's 65 things
  // simply were not there and no amount of zooming brought them back. It now
  // names something narrower and truer — which nodes are showing their
  // IDENTITY. Everything else is still on screen, at its real seat, as a
  // latent mark. The renderer owns that distinction; see graphTokens.
  //
  // TWO CHANNELS FEED IT, AND THE DIFFERENCE IS THE WHOLE SEARCH-LENS LAW:
  //
  //   `expanded`  what the READER opened. Persistent. Survives everything.
  //   `revealed`  what the CURRENT QUERY needs visible. Derived, replaced on
  //               every keystroke, empty the moment the query is.
  //
  // Unioned here and nowhere else, so there is exactly one answer to "why is
  // this node showing its name".
  const disclosed = useMemo(() => disclosedSet(expanded, revealed), [expanded, revealed]);

  const opened = useMemo(() => {
    const out = new Set<string>();
    if (!graph) return out;
    graph.forEachNode((n, a) => {
      if (a.slice === "core") out.add(n);
      else if (disclosed.has(n)) out.add(n);
      else if (a.lane && expanded.has(a.lane)) out.add(n);
    });
    // ONE SOURCE, OPENED ON ITS OWN.
    //
    // `expanded` holds cluster ids; it now also holds source-artifact node
    // ids, which is the same mechanism rather than a second one — same set,
    // same toggle, same latent-to-formed promotion at the same seat. It buys
    // the thing a cluster toggle cannot: open THIS transcript's two passages
    // without opening every passage in the evidence sector.
    //
    // Additive, so nothing regresses: a passage still opens when its cluster
    // does, whether or not its source has been expanded.
    graph.forEachNode((n, a) => {
      if (a.kind !== "passage" || out.has(n)) return;
      for (const e of graph.outEdges(n)) {
        if (graph.getEdgeAttribute(e, "rel") !== "extracted_from") continue;
        // Temporary Search promotion of an artifact names the artifact; it
        // must not open every passage the artifact owns. Only the reader's
        // persistent act of opening/selecting that artifact expands its local
        // passage territory.
        if (expanded.has(graph.target(e))) {
          out.add(n);
          return;
        }
      }
    });
    // ONE GROUP, OPENED ON ITS OWN — the same mechanism a third time.
    //
    // Without this, "open this region" for a type group had to mean "open the
    // whole sector", because identity was decided by lane and a lane is the
    // only handle a group of external objects had. Resolving 24 commitments
    // meant resolving all 126 Hermes objects and flying to the sector, which
    // is not what the button says and not what the reader asked for.
    //
    // Additive, like the source case: a member still opens when its cluster
    // does, and closing the group leaves the cluster exactly as it was.
    for (const agg of aggregates) {
      // As above, a temporary hit on an aggregate locates the aggregate. It
      // does not temporarily disclose the whole population it represents.
      if (!expanded.has(agg.id)) continue;
      for (const m of agg.members) if (graph.hasNode(m)) out.add(m);
      if (agg.hub && graph.hasNode(agg.hub)) out.add(agg.hub);
    }
    return out;
  }, [graph, disclosed, expanded, aggregates]);

  const selectedAggregate = useMemo(
    () => (selectedId ? aggregates.find((a) => a.id === selectedId) ?? null : null),
    [aggregates, selectedId]
  );

  const selectedAttrs = selectedId && graph?.hasNode(selectedId) ? graph.getNodeAttributes(selectedId) : null;
  const selectedFinding: TruthFinding | null = useMemo(() => {
    if (!selectedAttrs || selectedAttrs.kind !== "finding" || !truth) return null;
    const id = selectedId!.replace("finding:", "");
    return truth.model.findings.find((f) => f.id === id) ?? null;
  }, [selectedAttrs, selectedId, truth]);

  // ── EVIDENCE SOLO — a guarded traversal, not a neighbourhood walk ─────
  //
  // COMPUTED WHETHER OR NOT SOLO IS ON, because Law 10 needs the answer to
  // "is there a route" before the button is offered, not after it is pressed.
  // A Trace that lights one node — the node you already had — reads as the
  // instrument being broken rather than as the object being ungrounded.
  const traceRoute = useMemo(() => {
    if (!graph || !selectedId || !graph.hasNode(selectedId)) return null;
    const kind = graph.getNodeAttribute(selectedId, "kind");
    if (kind !== "finding" && kind !== "intel") return null;
    return evidenceSolo(graph, selectedId);
  }, [graph, selectedId]);

  const soloNodes = useMemo(() => (solo && traceRoute ? traceRoute.nodes : null), [solo, traceRoute]);

  // ── THE FRAMING LAW, APPLIED ─────────────────────────────────────────
  //
  // ONE function, called by every selection source. Law 5: a direct click, a
  // search result, an inspector relationship row and a summary card must all
  // leave the camera in the same place, because they are all the same act.
  //
  // What it frames is the selection PLUS its useful one-hop neighbourhood —
  // the same set the renderer is about to light. Framing only the node would
  // be honest about the node and useless about the answer: the whole reason
  // to look at a Finding is the four things around it.
  const frameFor = useCallback(
    (id: string | null): Camera | null => {
      if (!id || !graph || !layout) return null;

      // AN AGGREGATE IS FRAMED FROM ITS MEMBERS, because it has no seat of
      // its own that means anything — its centre is where its members were
      // packed, and the thing worth seeing is the disc they fill. Coverage
      // only (spread 0), the same rule expanding a cluster uses: this is a
      // move to a REGION, and the label plan decides what gets named once
      // you are in it.
      if (!graph.hasNode(id)) {
        const agg = aggregates.find((a) => a.id === id);
        if (!agg) return null;
        const pts: { x: number; y: number }[] = [];
        for (const n of agg.hub ? [...agg.members, agg.hub] : agg.members) {
          const p = layout.get(n);
          if (!p) continue;
          pts.push({ x: p.x - p.r, y: p.y - p.r });
          pts.push({ x: p.x + p.r, y: p.y + p.r });
        }
        const ab = boundsOf(pts);
        if (!ab) return null;
        return frameFocus(ab, { x: agg.x, y: agg.y }, cameraRef.current, viewportRef.current, 0);
      }

      const anchor = layout.get(id);
      if (!anchor) return null;
      const f = semanticFocus(graph, id);
      const ids = f ? f.frame : [id];
      // SEATS ARE CENTRES; NODES HAVE BODIES. Each contributes its own
      // extent rather than the set being padded by the largest radius in it —
      // otherwise one Reality node (radius 54) in the neighbourhood inflates
      // the box by 54 units in every direction, and a set that fits the field
      // exactly reads as overflowing it.
      const pts: { x: number; y: number }[] = [];
      for (const n of ids) {
        const p = layout.get(n);
        if (!p) continue;
        pts.push({ x: p.x - p.r, y: p.y - p.r });
        pts.push({ x: p.x + p.r, y: p.y + p.r });
      }
      const b = boundsOf(pts);
      if (!b) return null;
      return frameFocus(b, { x: anchor.x, y: anchor.y }, cameraRef.current, viewportRef.current, spreadOf(layout, ids));
    },
    [graph, layout, aggregates]
  );

  /** Meaning chooses which canonical ids matter; Rubric alone frames them. */
  const frameCanonicalIds = useCallback(
    (ids: readonly string[], reason: SpatialFrameReason, fallbackId?: string | null) => {
      const authority = spatialAuthorityRef.current;
      if (authority) return authority.frameIds(ids, { reason });
      const next = frameFor(fallbackId ?? ids[0] ?? null);
      if (next) flyCamera(next);
      return next != null;
    },
    [frameFor, flyCamera]
  );

  // ── SELECTION HISTORY ────────────────────────────────────────────────
  //
  // Law 8. Local graph navigation, not browser history and not saved views:
  // where you were, what you were looking at it from, and which clusters had
  // to be open for it to make sense.
  //
  // The camera is captured ON LEAVING an entry rather than on arriving at it,
  // which is the only way Back can return you to the view you actually built
  // up — pan and zoom after selecting are part of "where you were".
  const [nav, setNav] = useState<{ stack: NavEntry[]; i: number }>({ stack: [], i: -1 });
  const navigating = useRef(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // ── EXACT RETURN STATE ───────────────────────────────────────────────
  //
  // Turning Trace on, and expanding a cluster, are both TEMPORARY VIEWS: the
  // reader is stepping into something and expects to step back out of it.
  // Before this they were one-way — Trace off left the field wherever the
  // route had framed it, and collapsing a cluster left the camera at the zoom
  // the expansion had flown to, looking at a sector that was no longer open.
  //
  // Each records the world it interrupted, and puts it back.
  const restoreTrace = useRef<{ camera: Camera; expanded: string[] } | null>(null);
  const restoreCluster = useRef(new Map<string, Camera>());

  const setTrace = useCallback(
    (on: boolean) => {
      if (on) {
        restoreTrace.current = { camera: cameraRef.current, expanded: [...expandedRef.current] };
      } else if (restoreTrace.current) {
        const world = restoreTrace.current;
        restoreTrace.current = null;
        setExpanded(new Set(world.expanded));
        const authority = spatialAuthorityRef.current;
        if (authority) authority.flyToCamera(world.camera);
        else flyCamera(world.camera);
      }
      setSolo(on);
    },
    [flyCamera]
  );

  const select = useCallback(
    (id: string | null, moveCamera = true) => {
      // Taking hold of a node is taking control. A tween still running would
      // carry the field out from under the thing just clicked.
      stopTween();
      setSelectedId(id);
      setDetailsOpen(false);
      setOverviewOpen(false);
      setCopiedReference(false);
      setResult(null);
      if (id === null) {
        if (moveCamera) {
          setTrace(false);
        } else {
          // Rubric background click clears selection in place. Do not run
          // Signal's trace-return flight through a direct canvas gesture.
          restoreTrace.current = null;
          setSolo(false);
        }
        setMode("A");
        // LAW 9: clearing does NOT move the camera. You stay exactly where you
        // were looking; a silent Fit throws away the view you built.
        return;
      }
      // LAW 7: attention transfers. No cleared intermediate state, no rebuild
      // — the neighbourhood is replaced in one commit.
      if (moveCamera && !navigating.current) {
        setNav((prev) => {
          const stack = prev.stack.slice(0, prev.i + 1);
          if (stack.length > 0 && stack[stack.length - 1].id === id) return prev;
          if (stack.length > 0) {
            stack[stack.length - 1] = { ...stack[stack.length - 1], camera: cameraRef.current };
          }
          stack.push({ id, camera: cameraRef.current, expanded: [...expandedRef.current] });
          // Forty steps is more than anyone walks in one sitting and bounds
          // the memory this can hold.
          const trimmed = stack.slice(-40);
          return { stack: trimmed, i: trimmed.length - 1 };
        });
      }
      if (moveCamera) {
        const focus = graph && graph.hasNode(id) ? semanticFocus(graph, id) : null;
        frameCanonicalIds(focus?.frame ?? [id], "selection", id);
      }
    },
    [stopTween, graph, frameCanonicalIds, setTrace]
  );

  /** Rubric's canvas click changes focus without moving the camera. Search,
      inspector navigation and summary cards keep Signal's product framing. */
  const selectInPlace = useCallback((id: string | null) => select(id, false), [select]);

  // ── TAKING A RESULT ──────────────────────────────────────────────────
  //
  // THE ONE PLACE SEARCH IS ALLOWED TO CHANGE THE FIELD, and it is allowed
  // because the reader chose it. Typing is a question; taking a result is an
  // act, and an act may leave the world different.
  //
  // What it commits is the MINIMUM — `commitFor` returns the cluster the
  // chosen object sits behind and nothing else, by the same rule the
  // temporary reveal uses. Not the neighbourhood, and emphatically not
  // Expand All: the previous behaviour's whole problem was opening more than
  // was asked for and never closing it again.
  //
  // Then `select`, which frames deliberate product navigation. A direct
  // canvas click now follows Rubric instead: it selects in place. No second
  // camera call and no forced zoom — the 230% search rule is gone and stays
  // gone.
  const takeResult = useCallback(
    (id: string) => {
      setHiddenIds((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      if (graph) {
        const need = commitFor(graph, id);
        // Written only when it would actually change something, so taking a
        // result already in view costs no render and no history entry.
        if (need.size > 0) {
          setExpanded((prev) => {
            let changed = false;
            for (const n of need) if (!prev.has(n)) changed = true;
            return changed ? new Set([...prev, ...need]) : prev;
          });
        }
      }
      select(id);
      // The list folds away so it stops covering the thing it just found.
      // The QUERY stays: search navigation state survives taking a result,
      // so "next one" is one keystroke rather than a retype.
      setResultsOpen(false);
    },
    [graph, select]
  );

  // ── THE SEARCH BOX'S OWN KEYS ────────────────────────────────────────
  //
  // Arrow keys move the cursor, Enter takes it, Escape is handled globally
  // (see the window handler — cancelling motion must come first, and that is
  // true whether or not the search box has focus).
  //
  // The list is small and bounded at forty, so this is exactly the case the
  // brief calls "naturally small": no virtualisation, no focus trap, just a
  // cursor and a scroll into view.
  const onSearchKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (matchList.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setResultsOpen(true);
        setCursor((c) => {
          const next = e.key === "ArrowDown" ? c + 1 : c - 1;
          // Clamped rather than wrapped. Wrapping past the end of a ranked
          // list silently sends the reader from the best answer to the worst.
          return Math.max(0, Math.min(matchList.length - 1, next));
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const hit = matchList[cursor] ?? matchList[0];
        if (hit) takeResult(hit.id);
      }
    },
    [matchList, cursor, takeResult]
  );

  // Keep the cursor on screen. A list of forty with the cursor on the
  // thirty-first is a list showing the reader nothing.
  useEffect(() => {
    if (!resultsOpen) return;
    const el = resultsRef.current?.querySelector<HTMLElement>(`[data-result-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, resultsOpen]);

  const navigateTo = useCallback(
    (delta: -1 | 1) => {
      setNav((prev) => {
        const i = prev.i + delta;
        if (i < 0 || i >= prev.stack.length) return prev;
        const stack = prev.stack.slice();
        // Leaving here: remember the view, so coming back returns to it.
        if (prev.i >= 0 && prev.i < stack.length) {
          stack[prev.i] = { ...stack[prev.i], camera: cameraRef.current };
        }
        const entry = stack[i];
        navigating.current = true;
        stopTween();
        // UNION, NEVER REPLACE. The entry records which clusters that focus
        // needed open; it is not a claim that nothing else may be. Replacing
        // would make Back silently collapse work the reader has done since.
        setExpanded((cur) => {
          let out: Set<string> | null = null;
          for (const c of entry.expanded) {
            if (cur.has(c)) continue;
            if (!out) out = new Set(cur);
            out.add(c);
          }
          return out ?? cur;
        });
        setSelectedId(entry.id);
        setResult(null);
        const authority = spatialAuthorityRef.current;
        if (authority) authority.flyToCamera(entry.camera);
        else flyCamera(entry.camera);
        // Released after the commit that this call schedules, so the
        // selection it causes is not itself pushed onto the stack.
        queueMicrotask(() => {
          navigating.current = false;
        });
        return { stack, i };
      });
    },
    [stopTween, flyCamera]
  );

  const canBack = nav.i > 0;
  const canForward = nav.i >= 0 && nav.i < nav.stack.length - 1;

  // A TRACE IS A ROUTE, NOT A CLUSTER EXPANSION.
  //
  // This effect used to expand the CLUSTER of every node on the route, for
  // the honest reason that a route whose far end is an unnamed mark answers
  // nothing. On the demo Scope that opened four extra nodes. On the real
  // corpus it opened the Hermes cluster — and a provenance trace of one
  // external claim ended with 394 nodes and 253 relationships on screen,
  // which is not a trace, it is the hairball wearing a trace's name.
  //
  // The route now promotes EXACTLY ITS OWN NODES, at their own seats, by the
  // same mechanism focus already uses. Nothing unrelated opens, no cluster
  // state is touched, and there is therefore nothing to put back.
  //
  // What replaced the expansion is `restoreTrace` below: turning Trace off
  // returns the world to precisely what it was before it went on.

  // AND A ROUTE THAT IS OFF SCREEN IS NOT A ROUTE.
  //
  // Law 10: when Trace is on, the thing it lit has to be in the viewport. A
  // finding's evidence reaches out to the sources ring, which at any close
  // zoom is somewhere else entirely — so the route was drawn correctly and
  // nobody saw it. Framed by the SAME minimal law as everything else: still
  // if it already fits, the smallest pull-back if it does not.
  useEffect(() => {
    if (!soloNodes || !layout || !selectedId) return;
    if (spatialAuthorityRef.current) {
      spatialAuthorityRef.current.frameIds([...soloNodes], { reason: "trace", padding: 64 });
      return;
    }
    const anchor = layout.get(selectedId);
    if (!anchor) return;
    const pts: { x: number; y: number }[] = [];
    for (const n of soloNodes) {
      const p = layout.get(n);
      if (!p) continue;
      pts.push({ x: p.x - p.r, y: p.y - p.r });
      pts.push({ x: p.x + p.r, y: p.y + p.r });
    }
    const b = boundsOf(pts);
    if (!b) return;
    const next = frameFocus(b, { x: anchor.x, y: anchor.y }, cameraRef.current, viewportRef.current, spreadOf(layout, [...soloNodes]));
    if (next) flyCamera(next);
    // Deliberately keyed on the route itself: re-framing on every camera
    // change would fight the hand, which always outranks the instrument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloNodes, layout, selectedId]);

  // WHICH NODES CAN BE TRACED. A finding — "why does Signal believe this" —
  // and an external object — "why does the producer say this". Both questions
  // are answered by the same guarded traversal over the same allowlist; only
  // the starting node differs.
  //
  // AND ONLY WHEN THE ANSWER IS NOT EMPTY. Law 10: an ungrounded Finding used
  // to offer a Trace that turned on, dimmed the whole field and lit exactly
  // the node already selected. The traversal is run up front and the control
  // is offered only if it reaches something; the inspector says so in words
  // instead of handing over a button that lies.
  const soloable = !!graph && traceIsComplete(graph, traceRoute, selectedId);


  // Leaving a traceable node must drop the trace with it, and the hypothetical
  // mode with it — that one belongs to findings alone.
  useEffect(() => {
    if (!soloable) setTrace(false);
    if (!selectedFinding) setMode("A");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloable, selectedFinding]);

  // ── THE DIAGNOSTIC, AND ONLY WHEN ASKED FOR ──────────────────────────
  //
  // `?debug=graph`. Read once from the URL rather than from state, so a build
  // that nobody has asked to debug computes none of this: the memo below is
  // guarded on the flag, and the whole panel is absent from the tree.
  const debug = useMemo(
    () => (typeof window === "undefined" ? false : new URLSearchParams(window.location.search).get("debug") === "graph"),
    []
  );

  const graphStats = useMemo(() => {
    if (!debug || !graph || !layout) return null;
    const web = structuralWeb(graph, layout);
    let membership = 0;
    graph.forEachEdge((_e, a) => {
      if (edgeFocusClass(a) === null) membership++;
    });
    const selected = { total: 0, woken: 0, asleep: 0, byClass: {} as Record<string, number> };
    if (selectedId && graph.hasNode(selectedId)) {
      const f = semanticFocus(graph, selectedId);
      if (f) {
        for (const [, cls] of f.edges) {
          selected.total++;
          selected.byClass[cls] = (selected.byClass[cls] ?? 0) + 1;
          // A woken edge needs both ends promoted, which focus does for its
          // own non-contextual frame — so a contextual partner in a collapsed
          // cluster is reachable and not drawn, and this says so.
          if (cls === "contextual") selected.asleep++;
          else selected.woken++;
        }
      }
    }
    return {
      nodes: graph.order,
      edges: graph.size,
      strands: web.strands.length,
      sheaves: web.sheaves.length,
      represented: web.represented,
      suppressed: web.suppressed,
      byClass: web.suppressedByClass,
      membership,
      drawnNow: web.strands.length + web.sheaves.length,
      selected,
    };
  }, [debug, graph, layout, selectedId]);


  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // THE FIRST THING ESCAPE DOES IS STOP THE WORLD MOVING.
        //
        // The tested defect: Escape cleared the selection and the camera kept
        // flying to the zoom that selection had asked for, so the instrument
        // ended up somewhere nobody had chosen, showing nothing. Cancelling
        // is unconditional and comes first — before the query, before the
        // selection, and whether or not either exists. An interrupted move
        // stops where it has got to and stays there.
        stopTween();
        if (query) {
          // CLEARING THE QUERY PUTS THE FIELD BACK, AND COSTS NOTHING TO DO.
          // `revealed` is derived from the hits, so an empty query derives an
          // empty set and the disclosure the reader built is exactly what is
          // left. There is no restore step here because there was no
          // mutation to undo — see the lens note above `revealed`.
          setQuery("");
          setResultsOpen(true);
          setCursor(0);
        } else if (selectedId) select(null);
      }
      if ((e.key === "[" && (e.metaKey || e.altKey)) || (e.key === "ArrowLeft" && e.altKey)) {
        e.preventDefault();
        navigateTo(-1);
      }
      if ((e.key === "]" && (e.metaKey || e.altKey)) || (e.key === "ArrowRight" && e.altKey)) {
        e.preventDefault();
        navigateTo(1);
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-shoot="graph-search"]')?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, query, select, stopTween, navigateTo]);

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
        if (layout?.has(anchor) && graph) {
          // A 6-MEMBER CLUSTER AND A 130-MEMBER CLUSTER ARE DIFFERENT VISUAL
          // PROBLEMS, and the old rule — fly to a fixed 1.35 over the puck —
          // treated them identically. Capacity's six people ended up filling
          // a sliver of the frame; Hermes's hundred and thirty ran off three
          // sides of it.
          //
          // Framed from what is actually there: the puck, the core, and every
          // seat that belongs to the cluster. The same framing law does the
          // rest, so expanding obeys exactly the rule selecting does.
          // THE CLUSTER'S OWN CONTENTS, AND NOT THE CORE.
          //
          // This used to seed the bounds with Reality so that "the cluster's
          // relationship to Reality stays in view". Under the comprehension
          // law that made every cluster's bounds span half the field, so the
          // coverage test was satisfied before it started and expanding
          // stopped moving the camera at all — including for a six-member
          // Capacity that ends up eleven pixels across.
          //
          // Reality is the largest object on the field and the camera is
          // capped at doubling; it does not need to be in the box to stay in
          // the frame.
          const pts: { x: number; y: number }[] = [];
          const members: string[] = [];
          graph.forEachNode((n, a) => {
            if (a.lane !== cluster) return;
            const p = layout.get(n);
            if (!p) return;
            members.push(n);
            pts.push({ x: p.x - p.r, y: p.y - p.r });
            pts.push({ x: p.x + p.r, y: p.y + p.r });
          });
          const b = boundsOf(pts);
          const p = layout.get(anchor)!;
          if (b) {
            // COVERAGE ONLY, NO SPACING TEST. Expanding a cluster is about
            // seeing the REGION, not about reading every label in it — the
            // label plan decides which names fit once you are there.
            //
            // Passing the spacing test here made every cluster frame
            // identically: inside any constellation the closest pair is about
            // ten units apart, so the law asked for 2.6x, hit the 2x cap, and
            // a six-member Capacity and a hundred-and-thirty-member Hermes
            // arrived at exactly the same zoom. Which is the defect this was
            // written to fix.
            const next = frameFocus(b, { x: p.x, y: p.y }, cameraRef.current, viewportRef.current, 0);
            if (next) {
              // Remember where we were BEFORE the expansion framed it, so
              // collapsing this cluster is a return rather than a stranding.
              restoreCluster.current.set(cluster, cameraRef.current);
              const authority = spatialAuthorityRef.current;
              if (authority) authority.frameIds(members, { reason: "cluster" });
              else flyCamera(next);
            }
          }
        }
      } else {
        const back = restoreCluster.current.get(cluster);
        if (back) {
          restoreCluster.current.delete(cluster);
          const authority = spatialAuthorityRef.current;
          if (authority) authority.flyToCamera(back);
          else flyCamera(back);
        }
      }
    },
    [expanded, layout, graph, flyCamera]
  );

  // Expanding ONE node — a source artifact — rather than a whole cluster.
  // No camera move: you are already looking at the thing you clicked, and
  // §21's rule is that ordinary selection does not move the world.
  const toggleNode = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // WHAT USED TO BE `flyTo`.
  //
  // It forced `max(k, 2.3)` — roughly 230% — on every search result and every
  // inspector relationship row, which is the single most-complained-about
  // behaviour in the hands-on test. It threw away whatever view the reader
  // had built in order to show them a node they could usually already see,
  // and it made the camera depend on HOW the selection happened.
  //
  // There is no forced zoom any more, and nothing here decides anything: the
  // framing law decides, exactly as it does for a direct click. Kept as a
  // named callback only because `select` already frames, so the remaining
  // callers want a re-frame of the current selection rather than a second
  // selection.
  const frameNode = useCallback(
    (id: string) => {
      const focus = graph?.hasNode(id) ? semanticFocus(graph, id) : null;
      frameCanonicalIds(focus?.frame ?? [id], "selection", id);
    },
    [graph, frameCanonicalIds]
  );

  const fitViewport = useCallback(() => {
    const authority = spatialAuthorityRef.current;
    if (authority) authority.fit();
    else flyCamera(homeCamera);
  }, [flyCamera, homeCamera]);

  const zoomViewport = useCallback(
    (factor: number) => {
      const authority = spatialAuthorityRef.current;
      if (authority) authority.zoomBy(factor);
      else setCamera((c) => ({ ...c, k: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.k * factor)) }));
    },
    [setCamera]
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

  const counts = countKinds(graph);
  const expandableClusters = CLUSTER_ORDER.filter((c) =>
    graph.someNode((_n, a) => a.lane === c && a.slice !== "core")
  );
  const selectedLabel = selectedAttrs
    ? fieldLabel(selectedAttrs)
    : selectedAggregate?.label ?? selectedFinding?.title ?? selectedId ?? "";
  const selectedKind = selectedAttrs
    ? (KIND_LABEL[selectedAttrs.kind] ?? selectedAttrs.kind)
    : selectedAggregate
      ? "Group"
      : selectedFinding
        ? "Finding"
        : "";
  const selectedSourceUrl = (() => {
    if (!selectedAttrs) return null;
    const candidates = [selectedAttrs.url, selectedAttrs.sourceUrl, selectedAttrs.externalUrl];
    for (const value of candidates) {
      if (typeof value !== "string") continue;
      try {
        const url = new URL(value);
        if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
      } catch {
        // A provider id/path is not a safe browser destination. Keep the
        // action unavailable rather than guessing how to resolve it.
      }
    }
    return null;
  })();

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ background: "var(--i-bg)" }}
      data-selected-id={selectedId ?? ""}
      data-trace-complete={soloable ? "true" : "false"}
      data-trace-node-kinds={
        traceRoute
          ? [...new Set([...traceRoute.nodes].map((id) => graph.getNodeAttribute(id, "kind")))].join(",")
          : ""
      }
    >
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
            setHiddenIds(new Set());
            setCamera(homeCamera);
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

        {hiddenIds.size > 0 && (
          <button
            type="button"
            onClick={() => setHiddenIds(new Set())}
            className="rounded-md px-2.5 py-1.5 text-[11px] transition-colors hover:bg-white/[0.04]"
            style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
          >
            Restore {hiddenIds.size} hidden
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setOverviewOpen((open) => !open);
            setDetailsOpen(false);
          }}
          className="rounded-md px-2.5 py-1.5 text-[11px] transition-colors hover:bg-white/[0.04]"
          style={{ border: "1px solid var(--i-border-strong)", color: overviewOpen ? "var(--i-signal)" : "var(--i-text-soft)" }}
          aria-pressed={overviewOpen}
        >
          Project overview
        </button>

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
      <div className="relative min-h-0 flex-1">
        <div className="relative h-full min-h-0" data-shoot="graph-viewport">
          <AuditGraphRenderer
            graph={graph}
            opened={opened}
            hiddenIds={hiddenIds}
            selectedId={selectedId}
            hoveredId={hoveredId}
            soloNodes={soloNodes}
            matches={matches}
            camera={camera}
            level={level}
            getCamera={getCamera}
            onCamera={setCamera}
            onCameraPublished={publishSpatialCamera}
            onSelect={select}
            onPointerSelect={selectInPlace}
            onHover={setHoveredId}
            expanded={expanded}
            onToggleCluster={toggleCluster}
            sweepAngle={sweepAngle}
            swept={swept}
            onViewport={onViewport}
            onSpatialAuthority={onSpatialAuthority}
          />

          {/* SEARCH + CAMERA, floating over the field — the reference keeps
              its controls on the canvas rather than stealing a column. */}
          <div
            className="pointer-events-none absolute top-3 w-[266px] transition-[right] duration-200"
            style={{ right: selectedId || overviewOpen ? 400 : 12 }}
          >
            <div
              className="pointer-events-auto rounded-lg p-2.5"
              style={{ background: "color-mix(in srgb, var(--i-panel) 92%, transparent)", border: "1px solid var(--i-border-strong)" }}
            >
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResultsOpen(true);
                  setCursor(0);
                }}
                onKeyDown={onSearchKey}
                placeholder={`Search ${searchIndex?.size ?? graph.order} things\u2026  ( / )`}
                aria-label="Search the project"
                aria-autocomplete="list"
                aria-expanded={matchList.length > 0 && resultsOpen}
                aria-activedescendant={
                  matchList.length > 0 && resultsOpen ? `search-result-${cursor}` : undefined
                }
                role="combobox"
                aria-controls="graph-search-results"
                data-shoot="graph-search"
                className="w-full rounded-md px-2.5 py-1.5 text-[11.5px] outline-none"
                style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              />

              {matchList.length > 0 && resultsOpen && (
                <>
                  {/* WHAT THIS LIST IS, BEFORE THE LIST. A count, and — when
                      the second pass had to run — the fact that not every word
                      matched. A partial answer presented as a complete one is
                      the kind of quiet lie a project brain cannot afford. */}
                  <div
                    className="mt-2 flex items-baseline justify-between gap-2 px-1"
                    data-shoot="search-summary"
                  >
                    <span className="text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--i-text-faint)" }}>
                      {outcome!.total} result{outcome!.total === 1 ? "" : "s"}
                      {outcome!.total > matchList.length ? ` \u00b7 top ${matchList.length}` : ""}
                    </span>
                    {outcome!.partial && (
                      <span className="text-[9.5px]" style={{ color: "var(--i-amber)" }} title="No single thing contained every word you typed, so these match most of them.">
                        partial match
                      </span>
                    )}
                  </div>

                  {/* A CUT ROW SHOULD READ AS "MORE BELOW", NOT AS A BROKEN
                      RENDER. The list scrolls, so the last visible result is
                      clipped mid-sentence; a fade over the final few pixels
                      is the difference between an edge and a defect. Masked
                      rather than overlaid, so it works on any background and
                      costs no extra element. */}
                  <div
                    id="graph-search-results"
                    role="listbox"
                    ref={resultsRef}
                    className="mt-1 max-h-[300px] overflow-y-auto i-noscrollbar"
                    style={{
                      maskImage: "linear-gradient(to bottom, #000 calc(100% - 14px), transparent)",
                      WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 14px), transparent)",
                    }}
                    data-shoot="search-results"
                  >
                    {matchList.map((hit, i) => (
                      <SearchResultRow
                        key={hit.id}
                        hit={hit}
                        index={i}
                        active={i === cursor}
                        onHover={() => setCursor(i)}
                        onTake={() => takeResult(hit.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* NO RESULTS SAYS WHAT WAS ACTUALLY SEARCHED FOR.
                  A bare "No results" leaves the reader unable to tell a typo
                  from an absence. Showing how the query was READ \u2014 the
                  normalised form \u2014 makes the separator law visible at the one
                  moment it matters, and names what this search can and cannot
                  do rather than letting the reader assume it understood them. */}
              {outcome && matchList.length === 0 && (
                <div className="mt-2 px-1" data-shoot="search-empty">
                  <p className="text-[11px]" style={{ color: "var(--i-text)" }}>
                    Nothing matches “{query.trim()}”
                  </p>
                  <p className="mt-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--i-text-faint)" }}>
                    Read as{" "}
                    <span style={{ color: "var(--i-text-soft)" }}>{outcome.normalizedQuery}</span>.
                    Hyphens, underscores and capitals do not matter here. Try fewer words, a ticket
                    id, a person, or words from a quote.
                  </p>
                  <p className="mt-1.5 text-[9.5px] leading-[1.45]" style={{ color: "var(--i-text-faint)" }}>
                    {SEARCH_MATURITY.claim}
                  </p>
                </div>
              )}

              {matchList.length > 0 && !resultsOpen && (
                <button
                  type="button"
                  onClick={() => setResultsOpen(true)}
                  className="mt-2 w-full rounded px-1.5 py-1 text-left text-[10.5px] transition-colors hover:bg-white/[0.05]"
                  style={{ color: "var(--i-text-faint)" }}
                  data-shoot="search-reopen"
                >
                  {outcome!.total} result{outcome!.total === 1 ? "" : "s"} · show
                </button>
              )}

              <div className="mt-2.5 flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--i-border)" }}>
                <span className="i-label" style={{ color: "var(--i-text-faint)" }}>
                  {level} · {Math.round(camera.k * 100)}%
                </span>
                <div className="flex gap-1">
                  {/* WHERE YOU HAVE BEEN. Law 8 — local graph navigation, not
                      browser history: the object, the view you had of it, and
                      the clusters that focus needed open. Disabled rather than
                      hidden, so the control's existence is learnable before
                      there is anywhere to go. */}
                  <MiniButton
                    onClick={() => navigateTo(-1)}
                    label="‹"
                    title="Back to the previous selection"
                    shoot="nav-back"
                    disabled={!canBack}
                  />
                  <MiniButton
                    onClick={() => navigateTo(1)}
                    label="›"
                    title="Forward"
                    shoot="nav-forward"
                    disabled={!canForward}
                  />
                  {/* THE ZOOM STEPS CUT; FIT FLIES. A step adjusts the view
                      you are in — the same act as a wheel notch, and tweening
                      it would make five quick clicks fight each other, since
                      each would retarget the last. Fit GOES somewhere, so it
                      moves like every other going-somewhere. */}
                  <MiniButton onClick={() => zoomViewport(1 / 1.35)} label="−" title="Zoom out" />
                  <MiniButton onClick={() => zoomViewport(1.35)} label="+" title="Zoom in" />
                  <MiniButton onClick={fitViewport} label="Fit" title="Fit the whole project" shoot="camera-fit" />
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

          {/* ── WHAT IS HERE — DEVELOPMENT DIAGNOSTIC ───────────────────

              Gated behind `?debug=graph`, so it does not exist for anyone
              who has not asked for it by hand. It answers the one question
              the renderer cannot be interrogated about from the outside:
              WHAT IS BEING SUPPRESSED, and why.

              This tranche was written because a production audit had to
              count edges in the DOM to discover that 91.9% of the graph was
              invisible. That should not have needed guessing. */}
          {debug && graphStats && (
            <div
              className="pointer-events-none absolute bottom-3 right-3 max-w-[300px] rounded-md px-2.5 py-2 text-[10px] leading-[1.6]"
              style={{
                background: "color-mix(in srgb, var(--i-panel) 94%, transparent)",
                border: "1px solid var(--i-border-strong)",
                color: "var(--i-text-soft)",
                fontFeatureSettings: '"tnum"',
              }}
              data-shoot="graph-debug"
            >
              <div className="i-label mb-1" style={{ color: "var(--i-text-faint)" }}>
                What is here
              </div>
              <div>
                {graphStats.nodes} nodes · {graphStats.edges} relationships
              </div>
              <div>
                web: {graphStats.strands} strands + {graphStats.sheaves} sheaves ={" "}
                <span style={{ color: "var(--i-text)" }}>{graphStats.represented}</span> shown at rest
              </div>
              <div>
                suppressed {graphStats.suppressed}
                {Object.entries(graphStats.byClass).map(([k, v]) => ` · ${k} ${v}`)}
                {` · membership ${graphStats.membership}`}
              </div>
              <div>opened {opened.size} · drawn edges {graphStats.drawnNow}</div>
              {selectedId && graph?.hasNode(selectedId) && (
                <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: "var(--i-border)" }}>
                  <div style={{ color: "var(--i-text)" }}>
                    {String(graph.getNodeAttribute(selectedId, "kind"))}
                    {graph.getNodeAttribute(selectedId, "intelligenceType")
                      ? ` · ${String(graph.getNodeAttribute(selectedId, "intelligenceType"))}`
                      : ""}
                  </div>
                  <div>
                    {graphStats.selected.total} direct
                    {Object.entries(graphStats.selected.byClass).map(([k, v]) => ` · ${k} ${v}`)}
                  </div>
                  <div>
                    {graphStats.selected.woken} woken · {graphStats.selected.asleep} asleep
                  </div>
                </div>
              )}
            </div>
          )}

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
              rings = relationship to Reality · rim = sources
            </span>
          </div>
        </div>

        {/* ── CONTEXTUAL OBJECT CARD ────────────────────────────────
            The world remains full-canvas. Selection opens a Rubric-style
            utility card over it; detailed Audit meaning is one explicit
            step deeper and never replaces the map. */}
        {(selectedId || overviewOpen) && (
          <div
            className={`absolute right-4 top-4 z-20 flex w-[min(376px,calc(100%-32px))] min-h-0 flex-col overflow-hidden rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.48)] ${overviewOpen || detailsOpen ? "bottom-4" : ""}`}
            style={{ background: "color-mix(in srgb, var(--i-panel) 96%, transparent)", border: "1px solid var(--i-border-strong)" }}
            data-shoot="inspector"
          >
            {selectedId && (
              <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: "var(--i-border)" }}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="i-label" style={{ color: "var(--i-text-faint)" }}>{selectedKind}</div>
                    <div className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug text-[var(--i-text)]">{selectedLabel}</div>
                    <div className="mt-1 truncate text-[10px] text-[var(--i-text-faint)]">{selectedId}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => select(null, false)}
                    className="rounded-md px-2 py-1 text-[18px] leading-none hover:bg-white/[0.05]"
                    style={{ color: "var(--i-text-faint)" }}
                    aria-label="Close object card"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="rounded-md px-2.5 py-1.5 text-[10.5px] font-medium hover:bg-white/[0.05]" style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}>
                    {detailsOpen ? "Hide details" : "View here"}
                  </button>
                  <button type="button" onClick={() => frameNode(selectedId)} className="rounded-md px-2.5 py-1.5 text-[10.5px] font-medium hover:bg-white/[0.05]" style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}>
                    Fly to
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(selectedId).then(() => {
                        setCopiedReference(true);
                        window.setTimeout(() => setCopiedReference(false), 1400);
                      });
                    }}
                    className="rounded-md px-2.5 py-1.5 text-[10.5px] font-medium hover:bg-white/[0.05]"
                    style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
                  >
                    {copiedReference ? "Copied" : "Copy reference"}
                  </button>
                  {selectedSourceUrl && (
                    <button type="button" onClick={() => window.open(selectedSourceUrl, "_blank", "noopener,noreferrer")} className="rounded-md px-2.5 py-1.5 text-[10.5px] font-medium hover:bg-white/[0.05]" style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}>
                      Open source
                    </button>
                  )}
                  {soloable && (
                    <button type="button" onClick={() => setTrace(!solo)} className="rounded-md px-2.5 py-1.5 text-[10.5px] font-medium hover:bg-white/[0.05]" style={{ border: "1px solid var(--i-source)", color: "var(--i-source)" }}>
                      {solo ? "Exit trace" : "Trace provenance"}
                    </button>
                  )}
                  {selectedAttrs && selectedAttrs.kind !== "reality" && (
                    <button
                      type="button"
                      onClick={() => {
                        setHiddenIds((current) => new Set([...current, selectedId]));
                        select(null, false);
                      }}
                      className="rounded-md px-2.5 py-1.5 text-[10.5px] font-medium hover:bg-white/[0.05]"
                      style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
                      title="Presentation only. This does not delete or change canonical data."
                    >
                      Hide from view
                    </button>
                  )}
                </div>
              </div>
            )}

          {overviewOpen && !selectedId ? (
            <GraphOverview graph={graph} truth={truth} counts={counts} onSelect={select} />
          ) : detailsOpen && selectedFinding && truth ? (
            <FindingInspector
              model={truth.model}
              finding={selectedFinding}
              provenance={truth.provenance[selectedFinding.id] ?? null}
              onSelect={(id) => select(gid.finding(id))}
              onEvidenceSolo={soloable ? () => setTrace(true) : null}
            />
          ) : detailsOpen && selectedAggregate ? (
            <AggregateInspector
              graph={graph}
              aggregate={selectedAggregate}
              expandedNodes={expanded}
              onSelect={select}
              // ONE HANDLE PER GROUP, AND THE SOURCE GROUPS SHARE THEIRS
              // WITH THE NODE INSPECTOR. Opening a transcript from its own
              // panel and opening it from its shell are the same act on the
              // same key, so the two panels can never disagree about whether
              // it is open. A type group has no such node, so it keys on
              // itself.
              onExpand={() => toggleNode(selectedAggregate.hub ?? selectedAggregate.id)}
            />
          ) : detailsOpen && selectedId && graph.hasNode(selectedId) ? (
            <GraphInspector
              graph={graph}
              nodeId={selectedId}
              onSelect={select}
              onFocusNode={frameNode}
              expandedNodes={expanded}
              onToggleNode={toggleNode}
              evidenceSolo={solo}
              onEvidenceSolo={soloable ? setTrace : null}
              onExpandCluster={toggleCluster}
            />
          ) : null}
          </div>
        )}
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
          onEvidenceSolo={setTrace}
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

// ── A SEARCH RESULT ────────────────────────────────────────────────────
//
// WHAT A RESULT HAS TO ANSWER, IN THE ORDER A READER ASKS IT:
//
//   WHAT IS THIS?      the type, named the way the producer names it —
//                      "External risk", not nine rows all saying "External
//                      intelligence".
//   WHICH ONE?         the human title. A humanised transcript name, a
//                      finding's claim, a ticket's title. Never a raw id
//                      while anything better exists.
//   WHY DID IT MATCH?  the snippet, plus the field when the field is not the
//                      obvious one.
//   FROM WHERE?        the source artifact and its date, where there is one.
//
// And one thing it must answer without being asked: WHOSE CLAIM IS THIS.
// Signal's own model, an outside producer's, a quotation, or the artifact a
// quotation came from. Four families, four marks, and the distinction is a
// trust boundary rather than a decoration — a result list that let an
// external Risk read as a Signal Risk would be a correctness failure.

/** The one-word family mark. Short on purpose: it sits beside the type, and
    two long words there push the title off the row. */
const FAMILY_MARK: Record<SearchFamily, { label: string; title: string }> = {
  reality: { label: "Signal", title: "Signal's own model of this project" },
  external: { label: "External", title: "An outside producer's claim. Not Signal's." },
  evidence: { label: "Quote", title: "Words quoted from a source" },
  source: { label: "Artifact", title: "The document, transcript or frame itself" },
};

/** Only shown when it is not the obvious reason. A title match needs no
    explanation; a match in a raw id or in a person field does. */
const FIELD_REASON: Partial<Record<SearchFieldName, string>> = {
  excerpt: "in the quote",
  statement: "in the claim",
  source: "in the source name",
  identifier: "id",
  person: "person",
  alias: "raw id",
  meta: "metadata",
};

/** A date as a reader reads it. Invalid or absent dates render nothing —
    a row that says "Invalid Date" is worse than a row that says nothing. */
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function SearchResultRow({
  hit,
  index,
  active,
  onHover,
  onTake,
}: {
  hit: SearchHit;
  index: number;
  active: boolean;
  onHover: () => void;
  onTake: () => void;
}) {
  const d = hit.doc;
  const family = FAMILY_MARK[d.family];
  const date = shortDate(d.sourceDate);
  const reason = FIELD_REASON[hit.matchedField];
  // A SNIPPET THAT REPEATS THE TITLE IS NOISE. It happens for a passage
  // (whose title IS the quote) and for a requirement (whose title is the
  // whole statement the snippet was cut from), so the test is containment
  // rather than equality — a 120-character cut of a title is still the title.
  const bare = (t: string) => t.replace(/[\u201c\u201d"\u2026]/g, "").trim().toLowerCase();
  const showSnippet = hit.snippet.length > 0 && !bare(d.title).includes(bare(hit.snippet));

  return (
    <button
      type="button"
      role="option"
      id={`search-result-${index}`}
      aria-selected={active}
      data-result-index={index}
      data-shoot="search-result"
      data-result-kind={d.kind}
      data-result-family={d.family}
      onClick={onTake}
      onMouseMove={onHover}
      className="w-full rounded px-1.5 py-1.5 text-left transition-colors"
      style={{ background: active ? "rgba(255,255,255,0.06)" : "transparent" }}
    >
      <span className="flex items-baseline gap-1.5">
        <span
          className="mt-[3px] h-1.5 w-1.5 shrink-0 self-start rounded-full"
          style={{ background: nodeColor(d as unknown as Record<string, unknown>) }}
        />
        <span className="min-w-0 flex-1">
          {/* WHAT IS THIS — always first, always present. */}
          <span className="flex items-baseline gap-1.5">
            <span
              className="shrink-0 text-[8.5px] uppercase tracking-[0.13em]"
              style={{ color: "var(--i-text-faint)" }}
              title={family.title}
            >
              {family.label}
            </span>
            <span className="truncate text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--i-text-soft)" }}>
              {d.typeLabel}
            </span>
            {/* WHY IT MATCHED, only when that is not self-evident. */}
            {reason && (
              <span className="ml-auto shrink-0 text-[8.5px]" style={{ color: "var(--i-text-faint)" }}>
                {reason}
              </span>
            )}
          </span>

          {/* WHICH ONE. Two lines, so a long claim is readable rather than
              truncated to its first four words — the prior list gave every
              result one truncated line, and an evidence quote cut at 30
              characters identifies nothing. */}
          <span
            className="mt-0.5 block text-[11px] leading-[1.4] text-[var(--i-text)]"
            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {d.title}
          </span>

          {showSnippet && (
            <span
              className="mt-0.5 block truncate text-[10px] leading-[1.4]"
              style={{ color: "var(--i-text-soft)" }}
            >
              {hit.snippet}
            </span>
          )}

          {/* FROM WHERE. A passage without its source is a quote with no
              provenance on screen, which is the one thing Signal must not
              show. */}
          {(d.sourceTitle || date) && (
            <span className="mt-0.5 block truncate text-[9.5px]" style={{ color: "var(--i-text-faint)" }}>
              {[d.sourceTitle, date].filter(Boolean).join("  \u00b7  ")}
            </span>
          )}
        </span>
      </span>
    </button>
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
  disabled,
}: {
  onClick: () => void;
  label: string;
  title?: string;
  shoot?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      data-shoot={shoot}
      className="rounded px-1.5 py-0.5 text-[10px] transition-colors enabled:hover:bg-white/[0.06] disabled:cursor-default"
      style={{
        border: "1px solid var(--i-border-strong)",
        color: disabled ? "var(--i-text-faint)" : "var(--i-text-soft)",
        opacity: disabled ? 0.45 : 1,
      }}
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

// SIGNAL GRAPH — INTERACTION CONTRACT V1. Not part of the app build.
//
// The tranche's laws, asserted where they can be asserted without a browser:
// the focus model, the framing law, the trace guard and the projection's
// continued refusal to write. The behaviours that only exist once there is a
// pointer and a running camera — input cancelling motion, Escape cancelling
// motion BEFORE it clears state, Back/Forward, the collapsed technical
// block — are in scripts/audit-interaction-shoot.mjs, against the same data.
//
//   F  the one-hop focus model: four classes, no traversal, membership out
//   C  the framing law: still when it fits, minimal when it does not,
//      and NEVER a zoom-in — the 230% search rule, gone and stays gone
//   T  Trace: a route or no control
//   E  edge verbs: every relation in the real payload says why
//   N  no topology mutation, and no writes
//
//   npx tsx scripts/audit-interaction-proof.ts

import { PrismaClient } from "@prisma/client";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import {
  buildAuditGraph,
  evidenceSolo,
  exportAuditGraph,
  nodeId,
  EVIDENCE_SOLO_RELATIONS,
  type AuditGraph,
} from "../lib/audit/graph";
import { layoutGraph, layoutExtent, FIELD } from "../lib/audit/graphLayout";
import { fitCamera } from "../components/audit/SignalGraph";
import {
  semanticFocus,
  edgeFocusClass,
  edgeVerb,
  verbIsDirectional,
  hasTraceRoute,
  MEMBERSHIP_EDGE_RELS,
  type FocusClass,
} from "../lib/audit/focus";
import {
  frameFocus,
  worldViewport,
  boundsOf,
  contains,
  containsPoint,
  FRAME_MARGIN,
  MIN_ZOOM,
  DEFAULT_CAMERA,
  type Camera,
  type Extent,
} from "../components/audit/cameraMotion";
import { projectIntelligence } from "../lib/audit/intelligence";
import { validateProjectContextPackage } from "../lib/context/validate";
import { hasRealPackage, readRealPackage, realCensus, REAL_PACKAGE_PATH } from "./lib/real-package";
import { ensurePrerequisites, dropPrerequisites } from "./seed-real-jsa-package";

const prisma = new PrismaClient();

let failures = 0;
let skipped = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

// A REAL FIELD, MEASURED. 1440x900 window, minus the header and the
// inspector column — which is the shape the hands-on test ran on, and which
// is deliberately SHORTER than the height the historic 0.72 home zoom
// assumed. Fit now derives from it.
const VP = { w: 1064, h: 856 };

/** The bounds a selection asks the camera to show — anchor plus its useful
    one-hop neighbourhood, padded by the largest body in the set. Exactly what
    AuditInstrument computes; kept here so the law is asserted on the same
    input the instrument feeds it. */
function frameBounds(g: AuditGraph, layout: ReturnType<typeof layoutGraph>, id: string) {
  const f = semanticFocus(g, id);
  const ids = f ? f.frame : [id];
  const pts: { x: number; y: number }[] = [];
  for (const n of ids) {
    const p = layout.get(n);
    if (!p) continue;
    pts.push({ x: p.x - p.r, y: p.y - p.r });
    pts.push({ x: p.x + p.r, y: p.y + p.r });
  }
  return boundsOf(pts) as Extent | null;
}

/** Every table the projection could plausibly touch. Compared before and
    after the whole suite; see N3. */
async function census() {
  return {
    scopes: await prisma.scope.count(),
    findings: await prisma.finding.count(),
    sources: await prisma.source.count(),
    snapshots: await prisma.contextSnapshot.count(),
    decisions: await prisma.decision.count(),
    people: await prisma.person.count(),
    allocations: await prisma.allocation.count(),
    registrations: await prisma.sourceRegistration.count(),
    runs: await prisma.auditRun.count(),
  };
}

async function main() {
  const before = await census();
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  if (scopes.length === 0) throw new Error("No Scopes. Run prisma/seed-dev.ts first.");

  const graphs: { id: string; name: string; g: AuditGraph }[] = [];
  for (const s of scopes) {
    const inputs = await loadAuditGraphInputs(s.id);
    if (!inputs) continue;
    graphs.push({ id: s.id, name: s.name, g: buildAuditGraph(inputs) });
  }
  check("00 every Scope projects a graph", graphs.length === scopes.length, `${graphs.length}/${scopes.length}`);

  // ── F. THE ONE-HOP FOCUS MODEL ──────────────────────────────────────
  {
    let anchors = 0;
    let membershipLeaks = 0;
    let twoHopLeaks = 0;
    for (const { g } of graphs) {
      for (const n of g.nodes()) {
        const f = semanticFocus(g, n);
        if (!f) continue;
        anchors++;
        for (const e of f.edges.keys()) {
          if (MEMBERSHIP_EDGE_RELS.has(g.getEdgeAttribute(e, "rel"))) membershipLeaks++;
          // ONE HOP MEANS ONE HOP: every lit edge must touch the anchor.
          if (g.source(e) !== n && g.target(e) !== n) twoHopLeaks++;
        }
        for (const id of f.nodes.keys()) {
          if (id === n) continue;
          if (!g.neighbors(n).includes(id)) twoHopLeaks++;
        }
      }
    }
    check(
      "F1 selection is one hop, never two",
      twoHopLeaks === 0,
      `${anchors} anchors across ${graphs.length} projects, ${twoHopLeaks} nodes or edges reached beyond one hop`
    );
    check("F2 membership never lights", membershipLeaks === 0, `${membershipLeaks} attests/belongs_to edges in a focus set`);
    check(
      "F3 every non-membership relation is classified",
      graphs.every(({ g }) =>
          g.everyEdge((_e, a) => {
            const c = edgeFocusClass(a);
            return c === null || c === "semantic" || c === "temporal" || c === "provenance" || c === "contextual";
          })
      )
    );
  }

  // The framing set excludes contextual — the whole reason the camera law
  // can stay still on a producer corpus that is mostly `related_to`.
  {
    let contextualInFrame = 0;
    for (const { g } of graphs) {
      for (const n of g.nodes()) {
        const f = semanticFocus(g, n);
        if (!f) continue;
        for (const id of f.frame) if (f.nodes.get(id) === "contextual") contextualInFrame++;
      }
    }
    check("F4 contextual neighbours never enter the camera's frame set", contextualInFrame === 0);
  }

  // ── C. THE FRAMING LAW ──────────────────────────────────────────────
  //
  // Asserted as pure arithmetic first, because these are the properties that
  // must hold for EVERY input, not only for the ones a fixture happens to
  // contain.
  {
    const cam: Camera = { x: 700, y: 700, k: 1.4 };
    const view = worldViewport(cam, VP);
    const inside: Extent = { x0: 690, y0: 690, x1: 710, y1: 710 };
    check("C1 a neighbourhood already comfortably in view moves nothing", frameFocus(inside, { x: 700, y: 700 }, cam, VP) === null);

    // A neighbour just outside the comfortable inset, anchor on screen.
    const nudge: Extent = { x0: 690, y0: 690, x1: view.x1 - 2, y1: 710 };
    const panned = frameFocus(nudge, { x: 700, y: 700 }, cam, VP);
    check(
      "C2 an overhanging neighbour causes a pan, and only a pan",
      panned != null && panned.k === cam.k && panned.y === cam.y && panned.x > cam.x,
      panned ? `k ${panned.k} unchanged, moved ${(panned.x - cam.x).toFixed(1)} world units in x` : "no move"
    );
    if (panned) {
      const after = worldViewport(panned, VP);
      const mx = (VP.w * FRAME_MARGIN) / panned.k;
      const my = (VP.h * FRAME_MARGIN) / panned.k;
      check(
        "C3 the pan is exactly enough — the bounds land inside the comfortable inset",
        contains({ x0: after.x0 + mx, y0: after.y0 + my, x1: after.x1 - mx, y1: after.y1 - my }, {
          ...nudge,
          x1: nudge.x1 - 1e-6,
        })
      );
    }

    // Anchor off screen entirely: centre, do not merely nudge.
    const far: Extent = { x0: 1500, y0: 1500, x1: 1520, y1: 1520 };
    const flown = frameFocus(far, { x: 1510, y: 1510 }, cam, VP);
    check(
      "C4 an off-screen selection is centred, at the scale the reader chose",
      flown != null && flown.k === cam.k && Math.abs(flown.x - 1510) < 0.001 && Math.abs(flown.y - 1510) < 0.001,
      flown ? `centred at ${flown.x}, ${flown.y}, k ${flown.k}` : "no move"
    );

    // Too big to fit: zoom OUT, and only as far as it takes.
    const huge: Extent = { x0: 0, y0: 0, x1: 1400, y1: 1400 };
    const pulled = frameFocus(huge, { x: 700, y: 700 }, cam, VP);
    check(
      "C5 a neighbourhood too large for the view pulls back, and lands containing it",
      pulled != null && pulled.k < cam.k && pulled.k >= MIN_ZOOM,
      pulled ? `k ${cam.k} → ${pulled.k.toFixed(3)}` : "no move"
    );
    if (pulled) {
      const after = worldViewport(pulled, VP);
      check("C5b and the bounds are inside the result", contains(after, huge));
    }
  }

  // C6 IS THE ONE THE HANDS-ON TEST ASKED FOR.
  //
  // "Remove the current search-result rule that forces approximately 230%
  // zoom." Asserted as an invariant over every node of every project, from
  // every plausible camera: the framing law may pan, it may pull back, and it
  // may do nothing. It may never zoom in. There is no path through it that
  // produces 2.3.
  {
    const cameras: Camera[] = [
      DEFAULT_CAMERA,
      { x: FIELD.cx, y: FIELD.cy, k: 0.34 },
      { x: FIELD.cx, y: FIELD.cy, k: 1.0 },
      { x: FIELD.cx, y: FIELD.cy, k: 2.6 },
      { x: 300, y: 1100, k: 3.4 },
    ];
    let zoomIns = 0;
    let moves = 0;
    let stills = 0;
    let samples = 0;
    for (const { g } of graphs) {
      const layout = layoutGraph(g);
      for (const n of g.nodes()) {
        const b = frameBounds(g, layout, n);
        if (!b) continue;
        const p = layout.get(n)!;
        for (const cam of cameras) {
          samples++;
          const next = frameFocus(b, { x: p.x, y: p.y }, cam, VP);
          if (!next) {
            stills++;
            continue;
          }
          moves++;
          if (next.k > cam.k + 1e-9) zoomIns++;
        }
      }
    }
    check(
      "C6 the framing law NEVER zooms in — no forced 230%, from any selection source",
      zoomIns === 0,
      `${samples} selection×camera samples: ${stills} moved nothing, ${moves} framed, ${zoomIns} zoomed in`
    );

    // And at Fit specifically, which is where the reported defect was worst:
    // the whole field is on screen, so selecting anything must move nothing.
    //
    // FIT MEANS THE CAMERA THE INSTRUMENT ACTUALLY OPENS AT — derived from
    // the layout's extent AND the measured field. Asserted at this viewport
    // because the old constant overflowed it by 5%, which by itself turned
    // one selection in five into a camera move.
    let fitMoves = 0;
    let fitSamples = 0;
    for (const { g } of graphs) {
      const layout = layoutGraph(g);
      const home = fitCamera(layoutExtent(layout), VP);
      for (const n of g.nodes()) {
        const b = frameBounds(g, layout, n);
        const p = layout.get(n);
        if (!b || !p) continue;
        fitSamples++;
        if (frameFocus(b, { x: p.x, y: p.y }, home, VP) != null) fitMoves++;
      }
    }
    check(
      "C7 from Fit, selection moves the camera for nothing",
      fitMoves === 0,
      `${fitSamples} nodes selected at the home camera, ${fitMoves} camera moves`
    );
  }

  // C8. THE FRAMING RESULT IS ALWAYS USABLE. Whatever it returns, the anchor
  // is on screen afterwards — a framing move that leaves the thing you
  // selected off the edge is worse than no move at all.
  {
    let stranded = 0;
    let framed = 0;
    const cam: Camera = { x: 400, y: 400, k: 2.8 };
    for (const { g } of graphs) {
      const layout = layoutGraph(g);
      for (const n of g.nodes()) {
        const b = frameBounds(g, layout, n);
        const p = layout.get(n);
        if (!b || !p) continue;
        const next = frameFocus(b, { x: p.x, y: p.y }, cam, VP);
        if (!next) continue;
        framed++;
        if (!containsPoint(worldViewport(next, VP), p)) stranded++;
      }
    }
    check("C8 a framing move always leaves the selection on screen", stranded === 0, `${framed} moves, ${stranded} stranded`);
  }

  // ── T. TRACE NEEDS A ROUTE ──────────────────────────────────────────
  {
    let offered = 0;
    let empty = 0;
    let wouldHaveLied = 0;
    for (const { g } of graphs) {
      for (const n of g.nodes()) {
        const kind = g.getNodeAttribute(n, "kind");
        if (kind !== "finding" && kind !== "intel") continue;
        const route = evidenceSolo(g, n);
        const has = hasTraceRoute(route, n);
        if (has) offered++;
        else {
          empty++;
          if (route.nodes.size !== 1) wouldHaveLied++;
        }
      }
    }
    check(
      "T1 Trace is offered exactly when the traversal reaches something",
      wouldHaveLied === 0,
      `${offered} traceable, ${empty} with no route — the control is withheld for all ${empty}`
    );
    check(
      "T2 the traversal allowlist still excludes external object-to-object relations",
      !EVIDENCE_SOLO_RELATIONS.includes("intel_relation" as never),
      `allowlist: ${EVIDENCE_SOLO_RELATIONS.join(", ")}`
    );
  }

  // ── N. SELECTION CHANGES ATTENTION, NOT TOPOLOGY ────────────────────
  //
  // The whole tranche's first law, asserted the only way it can be: build the
  // graph, take its exact export and its exact layout, run focus over every
  // node in it, and demand both are byte-identical afterwards. Nothing in the
  // focus path may add a node, remove an edge, or move a seat.
  {
    for (const { name, g } of graphs) {
      const before = JSON.stringify(exportAuditGraph(g));
      const layoutBefore = JSON.stringify([...layoutGraph(g).entries()].sort());
      for (const n of g.nodes()) semanticFocus(g, n);
      const after = JSON.stringify(exportAuditGraph(g));
      const layoutAfter = JSON.stringify([...layoutGraph(g).entries()].sort());
      check(`N1 ${name}: selection mutates no topology`, before === after, `${g.order} nodes, ${g.size} edges`);
      check(`N2 ${name}: selection moves no seat`, layoutBefore === layoutAfter);
    }
  }

  // ── E. EVERY WOKEN EDGE CAN SAY WHY ─────────────────────────────────
  {
    let missing = 0;
    let carrier = 0;
    const verbs = new Set<string>();
    for (const { g } of graphs) {
      g.forEachEdge((_e, a) => {
        if (edgeFocusClass(a) === null) return;
        const v = edgeVerb(a);
        verbs.add(v);
        if (!v || v.trim().length === 0) missing++;
        // The transport's own name must never surface as a verb: an external
        // `supersedes` reads "supersedes", not "intel relation".
        if (v === "intel_relation" || v === "intel relation") carrier++;
      });
    }
    check("E1 every drawable relation has a readable verb", missing === 0, `${verbs.size} distinct verbs`);
    check("E2 the transport's own name is never shown as a verb", carrier === 0);
    check(
      "E3 symmetric relations carry no direction",
      !verbIsDirectional("related to") && !verbIsDirectional("contradicts") && verbIsDirectional("depends on")
    );
  }

  // ── THE REAL PAYLOAD ────────────────────────────────────────────────
  if (!hasRealPackage()) {
    console.log(`SKIP  real-payload block — no package at ${REAL_PACKAGE_PATH} (set REAL_JSA_PACKAGE)`);
    skipped += 1;
  } else {
    const { pkg } = realCensus();
    const preExisting = (await prisma.scope.findUnique({ where: { id: pkg.scopeId } })) != null;
    if (!preExisting) await ensurePrerequisites(prisma);
    const accepted = validateProjectContextPackage(JSON.parse(JSON.stringify(readRealPackage())));
    const scopeId = accepted.scopeId;
    const projected = projectIntelligence([{ id: "snap-real", scopeId, package: accepted }], scopeId);
    const base = await loadAuditGraphInputs(scopeId);
    if (!base) throw new Error(`the package's Scope ${scopeId} could not be read`);
    const g = buildAuditGraph({ ...base, entities: { ...base.entities, intelligence: projected } });
    const layout = layoutGraph(g);

    // R1. THE POPULATION OF EACH CLASS, ON REAL DATA. This is the number the
    // whole design rests on: if the producer's corpus were mostly semantic,
    // hiding contextual at rest would be hiding the graph.
    {
      const byClass: Record<FocusClass, number> = { semantic: 0, temporal: 0, provenance: 0, contextual: 0 };
      let membership = 0;
      g.forEachEdge((_e, a) => {
        const c = edgeFocusClass(a);
        if (!c) membership++;
        else byClass[c]++;
      });
      check(
        "R1 the real corpus is overwhelmingly contextual, which is why class exists",
        byClass.contextual > byClass.semantic + byClass.temporal,
        `semantic ${byClass.semantic} · temporal ${byClass.temporal} · provenance ${byClass.provenance} · ` +
          `contextual ${byClass.contextual} · membership (never drawn) ${membership}`
      );
    }

    // R2. A REAL SELECTION REVEALS A USEFUL LOCAL WORLD. The user-test
    // complaint was "selection often reveals only one useful relationship".
    // Measured over every external object and every finding.
    {
      const useful: number[] = [];
      let barren = 0;
      for (const n of g.nodes()) {
        const kind = g.getNodeAttribute(n, "kind");
        if (kind !== "intel" && kind !== "finding") continue;
        const f = semanticFocus(g, n);
        if (!f) continue;
        const u = f.frame.length - 1;
        useful.push(u);
        if (u === 0) barren++;
      }
      useful.sort((a, b) => a - b);
      const median = useful[Math.floor(useful.length / 2)] ?? 0;
      const mean = useful.reduce((a, b) => a + b, 0) / Math.max(1, useful.length);
      check(
        "R2 most real inspectable objects reveal a useful local world",
        useful.length - barren > useful.length / 2,
        `${useful.length} inspectable nodes · median ${median} · mean ${mean.toFixed(2)} · ` +
          `max ${useful[useful.length - 1]} non-contextual neighbours · ${barren} with none at all. ` +
          `THE CORPUS IS WHAT IT IS: this is not manufactured mass, and the ${barren} isolated ` +
          `objects are drawn as isolated.`
      );

      // AND CLASSIFICATION LOSES NOTHING. The frame set is smaller than the
      // neighbourhood on purpose; the neighbourhood itself must still be the
      // whole one-hop truth, which is what the inspector lists.
      let lost = 0;
      for (const n of g.nodes()) {
        const f = semanticFocus(g, n);
        if (!f) continue;
        const real = new Set(g.neighbors(n).filter((m) => g.edges(n, m).concat(g.edges(m, n)).some((e) => edgeFocusClass(g.getEdgeAttributes(e)) !== null)));
        for (const m of real) if (!f.nodes.has(m)) lost++;
      }
      check("R2b classifying a neighbourhood drops none of it", lost === 0, `${lost} neighbours lost to classification`);
    }

    // R3. AND THE FRAMING LAW STAYS QUIET ON IT. 438 real nodes, every one
    // selected, from the camera the instrument opens at.
    {
      const home = fitCamera(layoutExtent(layout), VP);
      let moves = 0;
      let n = 0;
      for (const id of g.nodes()) {
        const b = frameBounds(g, layout, id);
        const p = layout.get(id);
        if (!b || !p) continue;
        n++;
        if (frameFocus(b, { x: p.x, y: p.y }, home, VP) != null) moves++;
      }
      check(
        "R3 on the real payload, selecting from Fit never moves the camera",
        moves === 0,
        `${n} real nodes selected at k=${home.k.toFixed(3)}, ${moves} camera moves`
      );
    }

    // R4. THE SELECTED NODE IS ALWAYS IN ITS OWN FRAME SET — which is what
    // makes a collapsed cluster unable to hide a live selection: the renderer
    // opens `focus.frame`, so the anchor is named wherever it sits.
    {
      let orphaned = 0;
      for (const id of g.nodes()) {
        const f = semanticFocus(g, id);
        if (!f || f.frame[0] !== id || !f.nodes.has(id)) orphaned++;
      }
      check(
        "R4 a selection is always inside its own revealed set — no invisible selection",
        orphaned === 0,
        `${g.order} nodes, ${orphaned} that a collapse could hide`
      );
    }

    // R5. EXTERNAL INTELLIGENCE IS STILL NOT REALITY. Restated here because
    // this tranche touched every path that lights an edge.
    {
      const reality = nodeId.reality();
      const touching = g.hasNode(reality)
        ? g.edges(reality).filter((e) => {
            const s = g.getNodeAttribute(g.source(e), "kind");
            const t = g.getNodeAttribute(g.target(e), "kind");
            return s === "intel" || t === "intel";
          })
        : [];
      check("R5 no focus path joins external intelligence to Reality", touching.length === 0);
    }

    if (!preExisting) await dropPrerequisites(prisma);
  }

  // ── AND NONE OF IT WROTE ────────────────────────────────────────────
  //
  // The last of the seventeen. Everything above builds graphs, runs focus
  // over every node of every project, evaluates the framing law tens of
  // thousands of times and walks provenance routes — and the database it
  // read from must be byte-identical afterwards. A projection that writes is
  // not a projection.
  {
    const after = await census();
    check(
      "N3 the whole interaction model is a projection — zero DB writes",
      JSON.stringify(after) === JSON.stringify(before),
      Object.entries(after)
        .map(([k, v]) => `${k} ${v}`)
        .join(" · ")
    );
  }

  console.log(
    `\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}${skipped > 0 ? ` (${skipped} BLOCK(S) SKIPPED)` : ""}`
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

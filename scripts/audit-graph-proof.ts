// SIGNAL GRAPH — MODEL PROOFS. Not part of the app build.
//
// The graph is a PROJECTION. Every assertion here defends that word: it must
// carry nothing the canonical model does not already say, and it must never
// write.
//
//   A  every node projects a real row, and says which one
//   B  every edge cites a construction rule that exists
//   C  no dangling edges, no self loops
//   D  geometry cannot create a relationship
//   E  an unsupplied lane has NO supports edge — the absence is the finding
//   F  provenance direction: finding -> passage -> source, never the reverse
//   G  an unconnected source stays unconnected
//   H  Evidence Solo follows the allowlist and stops
//   I  building the graph writes NOTHING
//   J  export round-trips without losing semantics
//   K  the build is deterministic
//   L  slices are monotonic and never invent nodes
//   M  passages are namespaced by snapshot
//   N  epistemic basis matches the rule registry
//   P  layout: deterministic, clustered by category, radial by disagreement
//      (inherited from the retired Truth Map's own layout proofs)
//
//   npx tsx scripts/audit-graph-proof.ts

import { PrismaClient } from "@prisma/client";
import Graph from "graphology";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import {
  buildAuditGraph,
  sliceGraph,
  exportAuditGraph,
  evidenceSolo,
  nodeId,
  EDGE_RULES,
  EVIDENCE_SOLO_RELATIONS,
  SLICE_ORDER,
  type AuditGraph,
  type AuditNodeAttributes,
  type AuditEdgeAttributes,
} from "../lib/audit/graph";
import { layoutGraph, FIELD, CLUSTER_ORDER, BANDS } from "../lib/audit/graphLayout";

const prisma = new PrismaClient();

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function main() {
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  if (scopes.length === 0) throw new Error("No Scopes. Run prisma/seed-dev.ts first.");

  // Built once per Scope, then every assertion runs across ALL of them —
  // a law that only holds for the demo Scope is not a law.
  const graphs: { id: string; name: string; g: AuditGraph }[] = [];
  for (const s of scopes) {
    const inputs = await loadAuditGraphInputs(s.id);
    if (!inputs) continue;
    graphs.push({ id: s.id, name: s.name, g: buildAuditGraph(inputs) });
  }
  check("00 every Scope projects a graph", graphs.length === scopes.length, `${graphs.length}/${scopes.length}`);

  const everyGraph = (fn: (g: AuditGraph) => boolean) => graphs.every((x) => fn(x.g));

  // ── A. EVERY NODE PROJECTS A REAL ROW ──────────────────────────────
  check(
    "A1 every node names the canonical row it projects",
    everyGraph((g) => g.everyNode((_, a: AuditNodeAttributes) => typeof a.ref === "string" && a.ref.includes(":")))
  );
  check(
    "A2 every node declares a slice",
    everyGraph((g) => g.everyNode((_, a) => (SLICE_ORDER as string[]).includes(a.slice)))
  );
  check(
    "A3 every node has a non-empty label",
    everyGraph((g) => g.everyNode((_, a) => typeof a.label === "string" && a.label.length > 0))
  );
  // The strongest form: finding nodes must correspond to Finding rows.
  {
    const dbFindingIds = new Set((await prisma.finding.findMany({ select: { id: true } })).map((f) => f.id));
    const projected = graphs.flatMap((x) =>
      x.g.filterNodes((_, a) => a.kind === "finding").map((n) => n.replace("finding:", ""))
    );
    check(
      "A4 every finding node corresponds to a Finding row",
      projected.length > 0 && projected.every((id) => dbFindingIds.has(id)),
      `${projected.length} finding nodes checked`
    );
  }
  {
    const dbDecisionIds = new Set((await prisma.decision.findMany({ select: { id: true } })).map((d) => d.id));
    const projected = graphs.flatMap((x) =>
      x.g.filterNodes((_, a) => a.kind === "decision").map((n) => n.replace("decision:", ""))
    );
    check(
      "A5 every decision node corresponds to a Decision row",
      projected.every((id) => dbDecisionIds.has(id)),
      `${projected.length} decision nodes checked`
    );
  }

  // ── B. EVERY EDGE CITES A RULE ─────────────────────────────────────
  check(
    "B1 every edge carries a rule id",
    everyGraph((g) => g.everyEdge((_e, a: AuditEdgeAttributes) => typeof a.rule === "string" && a.rule.length > 0))
  );
  check(
    "B2 every rule id exists in the registry",
    everyGraph((g) => g.everyEdge((_e, a) => EDGE_RULES[a.rule] !== undefined))
  );
  check(
    "B3 every rule names the canonical field it reads",
    Object.values(EDGE_RULES).every((r) => r.field.length > 0 && r.why.length > 0)
  );
  // N. The edge must agree with its own rule — otherwise the registry is
  // decoration rather than the thing that decided the edge.
  check(
    "N1 every edge's rel matches its rule's rel",
    everyGraph((g) => g.everyEdge((_e, a) => EDGE_RULES[a.rule].rel === a.rel))
  );
  check(
    "N2 every edge's basis matches its rule's basis",
    everyGraph((g) => g.everyEdge((_e, a) => EDGE_RULES[a.rule].basis === a.basis))
  );
  check(
    "N3 every edge's endpoints match the kinds its rule declares",
    everyGraph((g) =>
      g.everyEdge((_e, a, s, t, sa: AuditNodeAttributes, ta: AuditNodeAttributes) => {
        const r = EDGE_RULES[a.rule];
        return sa.kind === r.from && ta.kind === r.to;
      })
    )
  );
  check(
    "N4 basis is only ever attested or inferred — no numeric confidence",
    everyGraph((g) => g.everyEdge((_e, a) => a.basis === "attested" || a.basis === "inferred")) &&
      everyGraph((g) => g.everyEdge((_e, a) => !("confidence" in a) && !("score" in a) && !("weight" in a)))
  );

  // ── C. NO DANGLING EDGES ───────────────────────────────────────────
  check(
    "C1 every edge's endpoints exist",
    everyGraph((g) => g.everyEdge((_e, _a, s, t) => g.hasNode(s) && g.hasNode(t)))
  );
  check("C2 no self loops", everyGraph((g) => g.edges().every((e) => g.source(e) !== g.target(e))));

  // ── D. GEOMETRY CANNOT CREATE A RELATIONSHIP ───────────────────────
  //
  // Enforced structurally rather than by inspection: the semantic graph must
  // carry no coordinates at all. If x/y cannot enter this layer, a crossing
  // or a shared layout region cannot possibly become an edge.
  check(
    "D1 no node carries renderer state (x, y, colour, opacity, selected)",
    everyGraph((g) =>
      g.everyNode(
        (_n, a) =>
          !("x" in a) && !("y" in a) && !("color" in a) && !("opacity" in a) && !("selected" in a)
      )
    ),
    "a graph that knows about pixels is a graph a crossing can reach"
  );
  check(
    "D2 no edge carries geometry",
    everyGraph((g) => g.everyEdge((_e, a) => !("x1" in a) && !("path" in a) && !("d" in a)))
  );
  check(
    "D3 the graph module imports no layout",
    !(await import("node:fs")).readFileSync("lib/audit/graph.ts", "utf8").includes('from "./layout"'),
    "lib/audit/graph.ts must not depend on lib/audit/layout.ts"
  );

  // ── E. AN UNSUPPLIED LANE HAS NO SUPPORTS EDGE ─────────────────────
  {
    let unsuppliedSeen = 0;
    let violations = 0;
    for (const { g } of graphs) {
      g.forEachNode((n, a) => {
        if (a.kind !== "lane") return;
        const supports = g.outEdges(n).filter((e) => g.getEdgeAttribute(e, "rel") === "supports");
        if (!a.supplied) {
          unsuppliedSeen++;
          if (supports.length !== 0) violations++;
        } else if (supports.length !== 1) violations++;
      });
    }
    check(
      "E1 an unsupplied lane has NO supports edge; a supplied lane has exactly one",
      violations === 0 && unsuppliedSeen > 0,
      `${unsuppliedSeen} unsupplied lanes checked, ${violations} violations`
    );
  }

  // ── F. PROVENANCE DIRECTION ────────────────────────────────────────
  {
    let checked = 0;
    let wrong = 0;
    for (const { g } of graphs) {
      g.forEachEdge((_e, a, s, t, sa, ta) => {
        if (a.rel === "evidenced_by") {
          checked++;
          if (sa.kind !== "finding") wrong++;
          if (!["passage", "intelligence", "source"].includes(ta.kind)) wrong++;
        }
        if (a.rel === "extracted_from") {
          checked++;
          if (sa.kind !== "passage" || ta.kind !== "source") wrong++;
        }
      });
    }
    check(
      "F1 evidence flows finding -> passage/intelligence -> source, never the reverse",
      checked > 0 && wrong === 0,
      `${checked} provenance edges checked`
    );
    // No passage may cite a finding back — that would let a traversal turn
    // round at shared evidence and reach an unrelated finding.
    check(
      "F2 no passage or source points back at a finding",
      everyGraph((g) =>
        g.everyEdge((_e, _a, _s, _t, sa, ta) => !(["passage", "source"].includes(sa.kind) && ta.kind === "finding"))
      )
    );
  }

  // ── G. AN UNCONNECTED SOURCE STAYS UNCONNECTED ─────────────────────
  {
    // A Source row attached to the Scope that NO open finding cites must not
    // acquire an edge. Proven by construction: add such a row to the inputs
    // and confirm the graph does not link it.
    const jsa = await loadAuditGraphInputs("jsa");
    if (jsa) {
      const g = buildAuditGraph(jsa);
      const citedSourceNodes = new Set(
        g.filterNodes((_n, a) => a.kind === "source").filter((n) => g.inDegree(n) > 0 || g.outDegree(n) > 0)
      );
      const allSourceNodes = g.filterNodes((_n, a) => a.kind === "source");
      check(
        "G1 every source node in the graph is there because something cites it",
        allSourceNodes.every((n) => citedSourceNodes.has(n)),
        `${allSourceNodes.length} source nodes, all connected`
      );
      // And the converse, PROVEN BY CONSTRUCTION rather than by a count with
      // slack in it. Insert a Source row on this Scope that no finding cites,
      // rebuild, and assert the graph does not grow. A source only enters the
      // graph because something points at it; being attached to the Scope is
      // not enough.
      const orphan = await prisma.source.create({
        data: {
          scopeId: "jsa",
          kind: "notes",
          title: "[proof] uncited source — must never reach the graph",
          content: "Nothing cites this.",
        },
      });
      try {
        const after = buildAuditGraph((await loadAuditGraphInputs("jsa"))!);
        check(
          "G2 an uncited Source row produces no node at all",
          after.order === g.order &&
            !after.hasNode(nodeId.rowSource(orphan.id)),
          `graph stayed at ${after.order} nodes with an extra uncited Source row present`
        );
      } finally {
        await prisma.source.delete({ where: { id: orphan.id } });
      }
    }
  }

  // ── H. EVIDENCE SOLO FOLLOWS THE ALLOWLIST ─────────────────────────
  {
    const jsa = await loadAuditGraphInputs("jsa");
    const g = buildAuditGraph(jsa!);
    const findingNode = g.filterNodes((_n, a) => a.kind === "finding" && a.tier === "critical")[0];
    check("H0 a critical finding exists to solo", findingNode !== undefined);

    if (findingNode) {
      const solo = evidenceSolo(g, findingNode);
      check("H1 solo returns the finding plus its provenance", solo.nodes.size > 1, `${solo.nodes.size} nodes`);
      check(
        "H2 every edge in the result is an allowed relation",
        [...solo.edges].every((e) => EVIDENCE_SOLO_RELATIONS.includes(g.getEdgeAttribute(e, "rel"))),
        EVIDENCE_SOLO_RELATIONS.join(", ")
      );
      // THE ONE THAT MATTERS. An unguarded walk reaches Reality in two hops
      // and from there the whole graph — "explaining" a finding with material
      // that has nothing to do with it.
      check(
        "H3 solo does NOT reach Reality",
        !solo.nodes.has(nodeId.reality()),
        "an unguarded neighbourhood walk would swallow the entire graph via lane -> reality"
      );
      // The precondition that makes H4 worth asserting: at least one node in
      // the solo result IS cited by another finding too. Without shared
      // evidence in the fixture, "solo reaches no other finding" would pass
      // for want of anything to reach.
      const sharedEvidence = [...solo.nodes].some((n) => {
        if (n === findingNode) return false;
        const citers = g
          .inEdges(n)
          .map((e) => g.source(e))
          .filter((s2) => g.getNodeAttribute(s2, "kind") === "finding");
        return citers.length > 1;
      });
      check(
        "H4a the fixture actually contains evidence shared by several findings",
        sharedEvidence,
        "otherwise H4 passes for want of anything to reach"
      );
      check(
        "H4 solo reaches no other finding",
        [...solo.nodes].filter((n) => g.getNodeAttribute(n, "kind") === "finding").length === 1,
        "shared evidence must not connect two findings"
      );
      check(
        "H5 solo never traverses `supports` or `attests`",
        [...solo.edges].every((e) => !["supports", "attests"].includes(g.getEdgeAttribute(e, "rel")))
      );
      // Direction: restricting to an empty allowlist yields only the seed.
      check("H6 an empty allowlist returns only the seed", evidenceSolo(g, findingNode, []).nodes.size === 1);
    }
  }

  // ── I. BUILDING THE GRAPH WRITES NOTHING ───────────────────────────
  {
    const before = {
      findings: await prisma.finding.count(),
      decisions: await prisma.decision.count(),
      snapshots: await prisma.contextSnapshot.count(),
      sources: await prisma.source.count(),
      runs: await prisma.auditRun.count(),
      gates: await prisma.decisionGate.count(),
    };
    for (const s of scopes) {
      const inputs = await loadAuditGraphInputs(s.id);
      if (inputs) buildAuditGraph(inputs);
    }
    const after = {
      findings: await prisma.finding.count(),
      decisions: await prisma.decision.count(),
      snapshots: await prisma.contextSnapshot.count(),
      sources: await prisma.source.count(),
      runs: await prisma.auditRun.count(),
      gates: await prisma.decisionGate.count(),
    };
    check(
      "I1 projecting every Scope's graph writes nothing",
      JSON.stringify(before) === JSON.stringify(after),
      JSON.stringify(before)
    );
  }

  // ── J. EXPORT ROUND-TRIPS ──────────────────────────────────────────
  {
    const { g } = graphs.find((x) => x.id === "jsa") ?? graphs[0];
    const exported = exportAuditGraph(g);
    const rebuilt = new Graph<AuditNodeAttributes, AuditEdgeAttributes>({
      type: "directed",
      multi: true,
      allowSelfLoops: false,
    });
    for (const n of exported.nodes) rebuilt.addNode(n.key, n.attributes);
    for (const e of exported.edges) rebuilt.addDirectedEdge(e.source, e.target, e.attributes);
    check("J1 export/import preserves order and size", rebuilt.order === g.order && rebuilt.size === g.size);
    check(
      "J2 export/import preserves every relation and basis",
      JSON.stringify(exportAuditGraph(rebuilt as AuditGraph)) === JSON.stringify(exported)
    );
    check(
      "J3 export is stably sorted, so two audits can be diffed",
      JSON.stringify(exportAuditGraph(g)) === JSON.stringify(exportAuditGraph(g))
    );
  }

  // ── K. DETERMINISM ─────────────────────────────────────────────────
  {
    const inputs = await loadAuditGraphInputs("jsa");
    const a = exportAuditGraph(buildAuditGraph(inputs!));
    const b = exportAuditGraph(buildAuditGraph(inputs!));
    check("K1 same read model in, byte-identical graph out", JSON.stringify(a) === JSON.stringify(b));
  }

  // ── L. SLICES ──────────────────────────────────────────────────────
  {
    const { g } = graphs.find((x) => x.id === "jsa") ?? graphs[0];
    const sizes = SLICE_ORDER.map((s) => sliceGraph(g, s).order);
    check(
      "L1 slices grow monotonically with depth",
      sizes.every((n, i) => i === 0 || n >= sizes[i - 1]),
      sizes.join(" <= ")
    );
    check(
      "L2 a slice never invents a node",
      SLICE_ORDER.every((s) => sliceGraph(g, s).nodes().every((n) => g.hasNode(n)))
    );
    check(
      "L3 the deepest slice equals the full graph",
      sliceGraph(g, "detail").order === g.order && sliceGraph(g, "detail").size === g.size
    );
    check(
      "L4 slicing does not mutate the source graph",
      (() => {
        const before = g.order;
        sliceGraph(g, "core");
        return g.order === before;
      })()
    );
    check(
      "L5 the core slice carries no evidence or execution nodes",
      sliceGraph(g, "core").everyNode((_n, a) => a.slice === "core")
    );
  }

  // ── M. PASSAGE NAMESPACING ─────────────────────────────────────────
  //
  // EvidenceItem.id is documented as stable only WITHIN its package. Two
  // snapshots may each contain "row-14"; keying on the bare id would merge
  // two different passages into one node and misroute every citation through
  // it. Asserted on the id format so a future refactor cannot quietly drop it.
  check(
    "M1 every passage node id is namespaced by its snapshot",
    everyGraph((g) =>
      g
        .filterNodes((_n, a) => a.kind === "passage")
        .every((n) => n.split(":").length >= 3)
    ),
    "passage:<snapshotId>:<evidenceId>"
  );
  check(
    "M2 package sources and Source rows occupy separate namespaces",
    everyGraph((g) =>
      g
        .filterNodes((_n, a) => a.kind === "source")
        .every((n) => n.startsWith("source:pkg:") || n.startsWith("source:row:"))
    )
  );

  // ── P. LAYOUT ──────────────────────────────────────────────────────
  //
  // Geometry moved from the retired Truth Map to graphLayout.ts when the
  // renderer became graph-first, so its proofs moved with it. Layout is still
  // PRESENTATION — these assert it is deterministic and meaningful, not that
  // the graph knows about it.
  {
    const { g } = graphs.find((x) => x.id === "jsa") ?? graphs[0];
    const a = layoutGraph(g);
    const b = layoutGraph(g);
    check(
      "P1 layout is deterministic — same graph, same coordinates",
      [...a.keys()].every((k) => a.get(k)!.x === b.get(k)!.x && a.get(k)!.y === b.get(k)!.y),
      "a node must not change seat between renders"
    );
    check("P2 every node gets a seat", a.size === g.order, `${a.size}/${g.order}`);
    check(
      "P3 layout does not mutate the graph",
      !g.someNode((_n, at) => Boolean("x" in at || "y" in at)),
      "coordinates live in the returned map, never on the semantic node"
    );

    // ANGLE = CATEGORY. Every node of a cluster sits inside that cluster's
    // sector, which is what lets membership be shown by position instead of
    // by 74 drawn edges.
    const sectorHalf = 360 / CLUSTER_ORDER.length / 2;
    let strays = 0;
    let clustered = 0;
    a.forEach((p, id) => {
      const lane = g.getNodeAttribute(id, "lane") as string | undefined;
      if (!lane || !CLUSTER_ORDER.includes(lane as (typeof CLUSTER_ORDER)[number])) return;
      clustered++;
      const base = -90 + CLUSTER_ORDER.indexOf(lane as (typeof CLUSTER_ORDER)[number]) * (360 / CLUSTER_ORDER.length);
      // Shortest angular distance between the seat and its sector axis.
      let diff = Math.abs(p.angle - base) % 360;
      if (diff > 180) diff = 360 - diff;
      if (diff > sectorHalf + 0.6) strays++;
    });
    check(
      "P4 every clustered node sits inside its own sector",
      strays === 0 && clustered > 0,
      `${clustered} clustered nodes, ${strays} outside their sector`
    );

    // RADIUS = DISAGREEMENT. A critical finding must sit further from Reality
    // than a medium one; a handled finding collapses inward.
    const radiusOf = (id: string) => a.get(id)!.radius;
    const live = g.filterNodes((_n, at) => at.kind === "finding" && !at.handled);
    const criticals = live.filter((n) => g.getNodeAttribute(n, "tier") === "critical");
    const mediums = live.filter((n) => g.getNodeAttribute(n, "tier") === "medium");
    check(
      "P5 a critical finding sits further out than a medium one",
      criticals.length > 0 &&
        mediums.length > 0 &&
        Math.min(...criticals.map(radiusOf)) > Math.max(...mediums.map(radiusOf)),
      `critical ${criticals.map(radiusOf).join()} vs medium ${mediums.map(radiusOf).join()}`
    );
    const handled = g.filterNodes((_n, at) => at.kind === "finding" && Boolean(at.handled));
    check(
      "P6 a handled finding collapses toward Reality",
      handled.every((n) => radiusOf(n) < BANDS[0].r),
      "distance means live disagreement, and a handled finding is not one"
    );
    check(
      "P7 no finding is drawn outside the disagreement field",
      live.every((n) => radiusOf(n) <= FIELD.conflictR + 1),
      "the bands are the whole vocabulary — nothing sits past CONFLICT"
    );
    // The one that makes the composition worth having: a finding sits in the
    // GAP between Reality and its own cluster's puck.
    check(
      "P8 findings sit between Reality and their cluster's puck",
      live.every((n) => radiusOf(n) > FIELD.coreR && radiusOf(n) < FIELD.clusterR)
    );
  }

  // A sparse Scope must still seat every lane — the graph-first replacement
  // for the retired C5.
  {
    const design = graphs.find((x) => x.id === "design");
    if (design) {
      const l = layoutGraph(design.g);
      check(
        "P9 a Scope with almost nothing in it still lays out",
        l.size === design.g.order && design.g.order > 0,
        `${design.g.order} nodes on "design"`
      );
    }
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

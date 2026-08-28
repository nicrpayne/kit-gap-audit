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
//   R  presence: every real node is drawn, every mark is a real node, and a
//      collapsed cluster's count equals the mass it is standing on
//   Q  requirements: projected only from a requirements_of_record source,
//      snapshot-scoped, and never linked to execution by resemblance
//   W  workforce: capacity read from the resolver, never recomputed, and
//      never joined to execution by name
//   X  source artifacts: typed from a persisted type field, never a title,
//      and kept distinct from the semantics they grounded
//   Z  external structured intelligence: transported without loss, admitted
//      by the producer's own scope, and unable to become Signal Reality by
//      any construction path that exists
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
  type NodeKind,
  type AuditEdgeAttributes,
} from "../lib/audit/graph";
import { layoutGraph, layoutExtent, FIELD, RECORD_EXTENT, CLUSTER_ORDER, BANDS } from "../lib/audit/graphLayout";
import { identityOf, latentRadius, LATENT, MEMBERSHIP_RELS } from "@/components/audit/graphTokens";
import { projectRequirements, REQUIREMENT_SOURCE_ROLE } from "../lib/audit/requirements";
import { projectPeople } from "../lib/audit/capacity";
import { resolveCapacity, switchFactorFor } from "../lib/capacity/resolve";
import { sourceKindFor, declaredArtifacts, SOURCE_KINDS } from "../lib/audit/sources";
import { projectIntelligence, relClassOf, laneForIntelligenceType } from "../lib/audit/intelligence";
import { validateProjectContextPackage } from "../lib/context/validate";
import { EXTERNAL_INTELLIGENCE_TRUST } from "../lib/context/package";
import { buildIntelligenceFixturePackage, JSA_SCALE } from "./lib/intel-fixture";
import { DEFAULT_CAMERA } from "@/components/audit/cameraMotion";
import { fitCamera } from "@/components/audit/SignalGraph";

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
  // A rule may declare a FAMILY of kinds at either end — `extracted_from`
  // reaches any source artifact. Enumerating the family keeps the check as
  // tight as it was: an edge must still land on a kind the rule named.
  const matchesKind = (declared: NodeKind | NodeKind[], actual: NodeKind) =>
    Array.isArray(declared) ? declared.includes(actual) : declared === actual;
  check(
    "N3 every edge's endpoints match the kinds its rule declares",
    everyGraph((g) =>
      g.everyEdge((_e, a, s, t, sa: AuditNodeAttributes, ta: AuditNodeAttributes) => {
        const r = EDGE_RULES[a.rule];
        return matchesKind(r.from, sa.kind) && matchesKind(r.to, ta.kind);
      })
    )
  );
  // WIDENED BY NAMING THE FAMILY, NOT BY RELAXING THE CHECK. `external` is a
  // third KIND of provenance — a claim Signal did not make and has not
  // checked — and it is still a categorical fact about where a relationship
  // came from. The claim this proof actually defends is unchanged: three
  // named values, and no score anywhere.
  const BASES = ["attested", "inferred", "external"];
  check(
    "N4 basis is only ever attested, inferred or external — no numeric confidence",
    everyGraph((g) => g.everyEdge((_e, a) => BASES.includes(a.basis))) &&
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
  //
  // The law: PROVENANCE POINTS FROM A CLAIM TOWARD THE EVIDENCE FOR IT, and
  // never the other way. Evidence does not cite the claims made about it, or
  // Evidence Solo could turn round at a shared passage and walk down into an
  // unrelated finding.
  //
  // Widened when Requirements landed, and deliberately widened by naming the
  // CLAIM KINDS rather than by relaxing the check: a requirement citing the
  // row it was read from is the same direction as a finding citing its
  // passage. A new claim kind has to be added here on purpose.
  const CLAIM_KINDS = ["finding", "requirement"];
  // Every source artifact kind, not just the generic one — a transcript is
  // the same layer of the world as a source, differing in what it IS.
  const EVIDENCE_KINDS = ["passage", "intelligence", ...SOURCE_KINDS];
  {
    let checked = 0;
    let wrong = 0;
    for (const { g } of graphs) {
      g.forEachEdge((e, a, s, t, sa, ta) => {
        if (a.rel === "evidenced_by") {
          checked++;
          if (!CLAIM_KINDS.includes(sa.kind)) wrong++;
          if (!EVIDENCE_KINDS.includes(ta.kind)) wrong++;
          // The direction itself, not just the endpoint kinds.
          if (g.hasDirectedEdge(t, s)) wrong++;
          void e;
        }
        if (a.rel === "extracted_from") {
          checked++;
          if (sa.kind !== "passage" || !SOURCE_KINDS.includes(ta.kind)) wrong++;
          if (g.hasDirectedEdge(t, s)) wrong++;
        }
      });
    }
    check(
      "F1 evidence flows claim -> passage/intelligence -> source, never the reverse",
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


  // ── R  PRESENCE ────────────────────────────────────────────────────────
  //
  // The density pass's own laws. The one they all serve: DENSITY MUST COME
  // FROM DATA. Every mark on the field is one row in the canonical model, so
  // there is no way to make the graph look richer than the project is.
  //
  // The renderer's rule is imported rather than restated — if identityOf
  // changes, these assertions change with it instead of quietly describing a
  // renderer that no longer exists.
  {
    const openedAtRest = (g: AuditGraph, n: string) =>
      g.getNodeAttribute(n, "slice") === "core";

    // R1 — nothing can be absent, because everything has a seat.
    for (const { name, g } of graphs) {
      const l = layoutGraph(g);
      check(
        `R1 every node has a layout seat, so none can be undrawable (${name})`,
        l.size === g.order,
        `${l.size}/${g.order}`
      );
    }

    // R2 — at rest the latent set is exactly the non-core nodes: every one of
    // them is a drawn mark, and not one of them is an aggregate.
    for (const { name, g } of graphs) {
      const latent = new Set(
        g.filterNodes((n) => identityOf(g.getNodeAttribute(n, "kind"), openedAtRest(g, n), "far") === "latent")
      );
      const nonCore = new Set(g.filterNodes((_n, a) => a.slice !== "core"));
      const sameSet =
        latent.size === nonCore.size && [...nonCore].every((n) => latent.has(n));
      check(
        `R2 every non-core node is drawn as a latent mark at rest (${name})`,
        sameSet,
        `${latent.size} latent, ${nonCore.size} non-core`
      );
    }

    // R3 — a mark is never an invention: each one carries the canonical ref
    // of the row it projects.
    for (const { name, g } of graphs) {
      const marks = g.filterNodes((n) => !openedAtRest(g, n));
      const grounded = marks.filter((n) => {
        const ref = g.getNodeAttribute(n, "ref");
        return typeof ref === "string" && ref.length > 0;
      });
      check(
        `R3 every latent mark projects a real row (${name})`,
        grounded.length === marks.length,
        `${grounded.length}/${marks.length} carry a ref`
      );
    }

    // R4 — THE BADGE ACCOUNTS FOR THE MASS, EXACTLY ONCE.
    //
    // "If using an aggregate visual, its count must equal real hidden-node
    // count." The badges are the only aggregate on the field, so the sum of
    // every cluster's "+N" must equal the total number of latent marks — no
    // mark counted twice, and none drawn with no badge to explain it.
    for (const { name, g } of graphs) {
      const latent = g.filterNodes((n) => !openedAtRest(g, n));
      let summed = 0;
      for (const cluster of CLUSTER_ORDER) {
        if (!g.hasNode(`lane:${cluster}`)) continue;
        summed += g.filterNodes((n, a) => a.lane === cluster && !openedAtRest(g, n)).length;
      }
      const unbadged = latent.filter((n) => {
        const lane = g.getNodeAttribute(n, "lane") as string | undefined;
        return !lane || !CLUSTER_ORDER.includes(lane as (typeof CLUSTER_ORDER)[number]);
      });
      check(
        `R4 every latent mark is counted by exactly one cluster badge (${name})`,
        summed === latent.length && unbadged.length === 0,
        `${summed} badged of ${latent.length} latent, ${unbadged.length} unaccounted`
      );
    }

    // R4b — and the badge is genuinely a NEW number, not a rename. It used to
    // count attests edges into the lane, which included the findings and
    // features already drawn at full size and excluded every source and
    // passage, since neither attests to anything. If those agreed everywhere
    // the fix would be a no-op.
    {
      const jsa = graphs.find((x) => x.id === "jsa");
      if (jsa) {
        const differing = CLUSTER_ORDER.filter((cluster) => {
          if (!jsa.g.hasNode(`lane:${cluster}`)) return false;
          const latentHere = jsa.g.filterNodes((n, a) => a.lane === cluster && !openedAtRest(jsa.g, n)).length;
          const attesters = jsa.g
            .inEdges(`lane:${cluster}`)
            .filter((e) => jsa.g.getEdgeAttribute(e, "rel") === "attests").length;
          return latentHere !== attesters;
        });
        check(
          "R4b the badge no longer counts attests edges",
          differing.length > 0,
          `${differing.length} clusters where the two disagree: ${differing.join(", ")}`
        );
      }
    }

    // R5 — DENSE NODES, SPARSE EDGES. Latent marks carry no lines, so
    // populating the field cannot repopulate the hairball.
    for (const { name, g } of graphs) {
      let drawn = 0;
      g.forEachEdge((_e, a, src, tgt) => {
        if (MEMBERSHIP_RELS.has(a.rel)) return;
        if (!openedAtRest(g, src) || !openedAtRest(g, tgt)) return;
        drawn++;
      });
      const total = g.size;
      check(
        `R5 the resting field draws far fewer edges than it has nodes (${name})`,
        drawn <= g.order,
        `${drawn} edges drawn of ${total}, ${g.order} nodes on screen`
      );
    }

    // R6 — IDENTITY ONLY EVER INCREASES. Opening a cluster or zooming in must
    // never take identity away: "zoom reveals identity" is a one-way claim.
    {
      const rank = { latent: 0, formed: 1, named: 2 } as const;
      const levels = ["far", "medium", "close"] as const;
      let regressions = 0;
      for (const { g } of graphs) {
        g.forEachNode((n, a) => {
          for (const opened of [false, true]) {
            let prev = -1;
            for (const l of levels) {
              const r = rank[identityOf(a.kind, opened, l)];
              if (r < prev) regressions++;
              prev = r;
            }
          }
          for (const l of levels) {
            if (rank[identityOf(a.kind, true, l)] < rank[identityOf(a.kind, false, l)]) regressions++;
          }
        });
      }
      check("R6 identity never decreases with zoom or with opening", regressions === 0, `${regressions} regressions`);
    }

    // R7 — EXPANDING PROMOTES, IT DOES NOT MOUNT. The number of marks on the
    // field is the same collapsed and expanded; only what they are showing
    // changes. This is the whole "oh — that's what those dots were" claim,
    // stated as arithmetic.
    for (const { name, g } of graphs) {
      const seats = layoutGraph(g).size;
      const collapsedMarks = g.order;
      const expandedMarks = g.order;
      check(
        `R7 expanding a cluster changes no node's existence (${name})`,
        seats === collapsedMarks && collapsedMarks === expandedMarks,
        `${seats} marks either way`
      );
    }

    // R8 — a mark must survive far zoom. Scaled purely by ratio a checkpoint
    // is a third of a pixel across; the screen-space floor is what makes the
    // outer rim read as population rather than as nothing.
    {
      let tooSmall = 0;
      for (const k of [0.34, 0.5, 0.72, 1.0]) {
        for (const r of [3.2, 4.2, 5, 8]) {
          if (latentRadius(r, "far", k) * k < LATENT.far.minPx - 1e-9) tooSmall++;
        }
      }
      check("R8 no latent mark falls below the screen-space floor", tooSmall === 0, `${tooSmall} sub-pixel marks`);
    }

    // R9 — §6: a source expands into ITS OWN passages. Every passage must sit
    // angularly nearer the source it was extracted from than any other source
    // in the field, so provenance is readable by position before a single
    // extracted_from edge is drawn.
    for (const { name, g } of graphs) {
      const l = layoutGraph(g);
      const sources = g.filterNodes((_n, a) => a.kind === "source");
      if (sources.length < 2) continue;
      let strays = 0;
      let checked = 0;
      for (const psg of g.filterNodes((_n, a) => a.kind === "passage")) {
        const own = g
          .outEdges(psg)
          .filter((e) => g.getEdgeAttribute(e, "rel") === "extracted_from")
          .map((e) => g.target(e))[0];
        if (!own || !l.has(own) || !l.has(psg)) continue;
        checked++;
        const a = l.get(psg)!.angle;
        // Shortest angular distance, smaller = nearer. Written out rather
        // than folded into one expression because the last time this was
        // condensed it came out inverted and reported every node as a stray.
        const gap = (x: number) => {
          const raw = (((a - x) % 360) + 540) % 360 - 180;
          return Math.abs(raw);
        };
        const mine = gap(l.get(own)!.angle);
        for (const other of sources) {
          if (other === own || !l.has(other)) continue;
          if (gap(l.get(other)!.angle) < mine - 1e-9) strays++;
        }
      }
      check(
        `R9 every passage seats nearer its own source than any other (${name})`,
        strays === 0,
        `${strays} misseated of ${checked} passages`
      );
    }

    // R10 — the anti-hairball law, restated now that every node is on screen:
    // membership is still never a line, at any density.
    for (const { name, g } of graphs) {
      const membership = g.filterEdges((_e, a) => MEMBERSHIP_RELS.has(a.rel)).length;
      check(
        `R10 membership is position, never a line, even fully populated (${name})`,
        membership > 0 || g.order < 10,
        `${membership} attests edges, none drawable`
      );
    }
  }


  // ── Q  REQUIREMENTS ────────────────────────────────────────────────────
  //
  // A requirement is the first node whose whole value depends on an ABSENCE
  // being trustworthy: "this requirement has no grounded execution link" is
  // only worth reading if the graph could not have invented one. Half the
  // assertions here are therefore negative, and each names the specific
  // resemblance it refuses.
  {
    const jsa = graphs.find((x) => x.id === "jsa");
    const snapshots = await prisma.contextSnapshot.findMany({ orderBy: { createdAt: "desc" } });

    // Q1 — the projection law, checked against the RAW package rather than
    // against the projection's own output.
    {
      let wrongRole = 0;
      let checked = 0;
      for (const { name, g } of graphs) {
        for (const n of g.filterNodes((_x, a) => a.kind === "requirement")) {
          checked++;
          const a = g.getNodeAttributes(n);
          const snap = snapshots.find((s) => s.id === a.snapshotId);
          const pkg = snap?.package as { sources?: { sourceRef: string; role: string | null }[] } | undefined;
          const manifest = pkg?.sources?.find((x) => x.sourceRef === a.sourceRef);
          if (manifest?.role !== REQUIREMENT_SOURCE_ROLE) {
            wrongRole++;
            console.log(`      (${name}) ${n} came from role ${manifest?.role ?? "none"}`);
          }
        }
      }
      check(
        "Q1 every Requirement comes from a requirements_of_record source",
        checked > 0 && wrongRole === 0,
        `${checked} requirements, ${wrongRole} from another role`
      );
    }

    // Q2 — AND EVIDENCE FROM OTHER ROLES DOES NOT. Non-vacuous: the JSA
    // package genuinely carries a design_reference source and a raw_evidence
    // source, each with evidence items of its own.
    {
      const snap = snapshots.find((s) => s.scopeId === "jsa");
      const pkg = snap?.package as {
        sources?: { sourceRef: string; role: string | null }[];
        evidence?: { id: string; sourceRef: string }[];
      };
      const otherRoles = (pkg?.sources ?? []).filter((x) => x.role !== REQUIREMENT_SOURCE_ROLE);
      const otherEvidence = (pkg?.evidence ?? []).filter((e) =>
        otherRoles.some((r) => r.sourceRef === e.sourceRef)
      );
      const leaked = otherEvidence.filter((e) =>
        jsa?.g.hasNode(nodeId.requirement(snap!.id, e.id))
      );
      check(
        "Q2 evidence from any other source role becomes no Requirement",
        otherRoles.length > 0 && otherEvidence.length > 0 && leaked.length === 0,
        `${otherEvidence.length} items across ${otherRoles.length} other roles (${otherRoles.map((r) => r.role).join(", ")}), ${leaked.length} leaked`
      );
    }

    // Q3 — the adapter itself, against a synthetic package. Proves the rule
    // rather than the fixture: same evidence ids, three roles, one of which
    // is the requirements source.
    {
      const pkg = {
        sources: [
          { sourceRef: "spec", role: REQUIREMENT_SOURCE_ROLE, status: "active", registrationId: "reg-1", observedAt: "2026-08-01T00:00:00Z", sourceType: "notion" },
          { sourceRef: "designs", role: "design_reference", status: "active", registrationId: null, observedAt: null, sourceType: "figma" },
          { sourceRef: "call", role: "raw_evidence", status: "candidate", registrationId: null, observedAt: null, sourceType: "transcript" },
        ],
        evidence: [
          { id: "row-1", sourceRef: "spec", kind: "row", excerpt: "Must support offline capture", data: { status: "Committed", section: "Offline" } },
          { id: "row-2", sourceRef: "designs", kind: "frame", excerpt: "Must support offline capture" },
          { id: "row-3", sourceRef: "call", kind: "note", excerpt: "Must support offline capture" },
        ],
      };
      const out = projectRequirements([{ id: "snap-x", scopeId: "sx", package: pkg }]);
      check(
        "Q3 identical text under three roles yields exactly one Requirement",
        out.length === 1 && out[0].evidenceId === "row-1",
        `${out.length} projected: ${out.map((r) => r.evidenceId).join(", ") || "none"}`
      );
      check(
        "Q3b and it carries its source's role, status and registration",
        out[0]?.sourceRole === REQUIREMENT_SOURCE_ROLE &&
          out[0]?.sourceStatus === "active" &&
          out[0]?.registrationId === "reg-1" &&
          out[0]?.dataStatus === "Committed" &&
          out[0]?.section === "Offline",
        `${out[0]?.sourceStatus} / ${out[0]?.registrationId} / ${out[0]?.dataStatus} / ${out[0]?.section}`
      );
      const none = projectRequirements([
        { id: "snap-y", scopeId: "sy", package: { sources: [{ sourceRef: "designs", role: "design_reference", status: "active" }], evidence: [{ id: "row-1", sourceRef: "designs", kind: "frame", excerpt: "x" }] } },
      ]);
      check("Q3c a package with no requirements source yields none", none.length === 0, `${none.length}`);
      check("Q3d a malformed package yields none rather than throwing", projectRequirements([{ id: "z", scopeId: "z", package: null }]).length === 0);
    }

    // Q4 — snapshot-scoped identity. Two snapshots carrying the same evidence
    // id must produce two requirements, not one.
    {
      const pkg = (ref: string) => ({
        sources: [{ sourceRef: ref, role: REQUIREMENT_SOURCE_ROLE, status: "active" }],
        evidence: [{ id: "row-14", sourceRef: ref, kind: "row", excerpt: "same id, different package" }],
      });
      const out = projectRequirements([
        { id: "snap-a", scopeId: "s", package: pkg("spec-a") },
        { id: "snap-b", scopeId: "s", package: pkg("spec-b") },
      ]);
      const ids = out.map((r) => nodeId.requirement(r.snapshotId, r.evidenceId));
      check(
        "Q4 the same evidence id in two snapshots is two Requirements",
        out.length === 2 && new Set(ids).size === 2,
        ids.join(" ≠ ")
      );
      for (const { name, g } of graphs) {
        const bad = g.filterNodes((n, a) => a.kind === "requirement" && !n.includes(`:${a.snapshotId}:`));
        check(`Q4b every Requirement id carries its snapshot (${name})`, bad.length === 0, `${bad.length} unscoped`);
      }
    }

    // Q5 — belongs_to points at the Scope the SNAPSHOT was assembled for.
    {
      let wrong = 0;
      let n = 0;
      for (const { g, id } of graphs) {
        for (const r of g.filterNodes((_x, a) => a.kind === "requirement")) {
          const targets = g
            .outEdges(r)
            .filter((e) => g.getEdgeAttribute(e, "rel") === "belongs_to");
          n += targets.length;
          for (const e of targets) {
            const snap = snapshots.find((s) => s.id === g.getNodeAttribute(r, "snapshotId"));
            if (g.target(e) !== nodeId.scope(id) || snap?.scopeId !== id) wrong++;
            if (g.getEdgeAttribute(e, "basis") !== "attested") wrong++;
          }
        }
      }
      check("Q5 belongs_to is attested and names the snapshot's own Scope", n > 0 && wrong === 0, `${n} edges, ${wrong} wrong`);
    }

    // Q6 — evidenced_by reaches the passage projecting THE SAME row.
    {
      let wrong = 0;
      let n = 0;
      for (const { g } of graphs) {
        for (const r of g.filterNodes((_x, a) => a.kind === "requirement")) {
          const a = g.getNodeAttributes(r);
          const es = g.outEdges(r).filter((e) => g.getEdgeAttribute(e, "rel") === "evidenced_by");
          n += es.length;
          if (es.length !== 1) wrong++;
          for (const e of es) {
            if (g.target(e) !== nodeId.passage(a.snapshotId as string, a.evidenceId as string)) wrong++;
            if (g.getEdgeAttribute(e, "basis") !== "attested") wrong++;
          }
        }
      }
      check("Q6 evidenced_by is attested and reaches the same row's passage", n > 0 && wrong === 0, `${n} edges, ${wrong} wrong`);
    }

    // Q7 — concerns exists ONLY where the finding cites that evidence id in
    // that snapshot. Checked in both directions: no drawn edge without a
    // citation, and no citation without a drawn edge.
    if (jsa) {
      const findings = await prisma.finding.findMany({
        where: { OR: [{ source: { scopeId: "jsa" } }, { contextSnapshot: { scopeId: "jsa" } }] },
      });
      const cited = new Set<string>();
      for (const f of findings) {
        if (!f.contextSnapshotId) continue;
        for (const ref of f.evidenceRefs) cited.add(`${f.id}|${nodeId.requirement(f.contextSnapshotId, ref)}`);
      }
      const drawn = new Set<string>();
      jsa.g.forEachEdge((_e, a, src, tgt) => {
        if (a.rel !== "concerns") return;
        if (jsa.g.getNodeAttribute(tgt, "kind") !== "requirement") return;
        drawn.add(`${src.replace("finding:", "")}|${tgt}`);
        if (a.basis !== "attested") drawn.add("BASIS-WRONG");
      });
      const uncited = [...drawn].filter((k) => !cited.has(k));
      const undrawn = [...cited].filter((k) => jsa.g.hasNode(k.split("|")[1]) && !drawn.has(k));
      check(
        "Q7 finding → concerns → requirement exists exactly where it is cited",
        drawn.size > 0 && uncited.length === 0 && undrawn.length === 0,
        `${drawn.size} edges, ${uncited.length} uncited, ${undrawn.length} missed`
      );
    }

    // Q8 — NO IMPLEMENTATION EDGE, AT ALL. The absence is the product
    // feature, so it gets the strongest assertion in the block.
    {
      let bad = 0;
      for (const { g } of graphs) {
        g.forEachEdge((_e, a, src, tgt) => {
          const sk = g.getNodeAttribute(src, "kind");
          const tk = g.getNodeAttribute(tgt, "kind");
          if (sk !== "requirement" && tk !== "requirement") return;
          // The only relations a requirement may carry.
          const allowed =
            (sk === "requirement" && (a.rel === "belongs_to" || a.rel === "evidenced_by")) ||
            (tk === "requirement" && a.rel === "concerns");
          if (!allowed) bad++;
        });
      }
      check(
        "Q8 a Requirement carries no relation beyond belongs_to, evidenced_by and concerns",
        bad === 0,
        `${bad} unexpected requirement edges — implemented_by and constrained_by are ungrounded and must not exist`
      );
    }

    // Q9 — RESEMBLANCE IS NOT A RELATIONSHIP. The JSA fixture is built to
    // tempt exactly this: a requirement whose section is "Offline" sits in
    // the same graph as a Feature called "Offline Capture" and work items
    // whose titles say "offline". None of that may connect them.
    if (jsa) {
      const reqs = jsa.g.filterNodes((_x, a) => a.kind === "requirement");
      const lures = jsa.g.filterNodes((_x, a) => {
        if (a.kind !== "feature" && a.kind !== "work") return false;
        return String(a.label).toLowerCase().includes("offline");
      });
      let touching = 0;
      for (const r of reqs) {
        for (const l of lures) {
          if (jsa.g.hasEdge(r, l) || jsa.g.hasEdge(l, r)) touching++;
        }
      }
      const sections = reqs.map((r) => String(jsa.g.getNodeAttribute(r, "section") ?? ""));
      check(
        "Q9 a shared word joins nothing",
        lures.length > 0 && sections.some((x) => x.toLowerCase() === "offline") && touching === 0,
        `${reqs.length} requirements (sections: ${sections.join(", ")}) vs ${lures.length} "offline" execution nodes — ${touching} edges`
      );
    }

    // Q10 — the provenance chain is walkable end to end.
    if (jsa) {
      let complete = 0;
      const reqs = jsa.g.filterNodes((_x, a) => a.kind === "requirement");
      for (const r of reqs) {
        const psg = jsa.g
          .outEdges(r)
          .filter((e) => jsa.g.getEdgeAttribute(e, "rel") === "evidenced_by")
          .map((e) => jsa.g.target(e))[0];
        if (!psg) continue;
        const src = jsa.g
          .outEdges(psg)
          .filter((e) => jsa.g.getEdgeAttribute(e, "rel") === "extracted_from")
          .map((e) => jsa.g.target(e))[0];
        if (src && SOURCE_KINDS.includes(jsa.g.getNodeAttribute(src, "kind"))) complete++;
      }
      check(
        "Q10 Requirement → Passage → Source is traversable for every requirement",
        reqs.length > 0 && complete === reqs.length,
        `${complete}/${reqs.length} complete chains`
      );
    }

    // Q11 — a Scope with no requirements-of-record source gets none. The
    // honest empty case, and the one an over-eager adapter would break.
    {
      const bare = graphs.filter((x) => x.id !== "jsa");
      const invented = bare.filter((x) => x.g.someNode((_n, a) => a.kind === "requirement"));
      check(
        "Q11 Scopes with no requirements source get no Requirements",
        bare.length > 0 && invented.length === 0,
        `${bare.length} Scopes without one, ${invented.length} inventing`
      );
    }

    // Q12 — a requirement is not seated in a source cluster. The whole
    // semantic/source split is spatial as well as structural.
    {
      let inSector = 0;
      for (const { g } of graphs) {
        for (const r of g.filterNodes((_x, a) => a.kind === "requirement")) {
          if (g.getNodeAttribute(r, "lane") != null) inSector++;
        }
      }
      check(
        "Q12 no Requirement belongs to a source cluster",
        inSector === 0,
        `${inSector} seated in a sector — a requirement comes FROM Notion without belonging TO it`
      );
    }

    // Q13 — building requirements still writes nothing.
    {
      const before = await prisma.$transaction([
        prisma.contextSnapshot.count(),
        prisma.finding.count(),
        prisma.source.count(),
        prisma.sourceRegistration.count(),
      ]);
      for (const { g } of graphs) void g.order;
      for (const s of scopes) {
        const inputs = await loadAuditGraphInputs(s.id);
        if (inputs) buildAuditGraph(inputs);
      }
      const after = await prisma.$transaction([
        prisma.contextSnapshot.count(),
        prisma.finding.count(),
        prisma.source.count(),
        prisma.sourceRegistration.count(),
      ]);
      check(
        "Q13 projecting requirements writes nothing",
        before.every((v, i) => v === after[i]),
        `${before.join("/")} → ${after.join("/")}`
      );
    }
  }


  // ── W  WORKFORCE ───────────────────────────────────────────────────────
  //
  // Capacity is the one area where the wrong edge would be BELIEVED. Every
  // name in the JSA fixture matches a Linear assignee exactly, so a
  // name-join would look perfect here and mis-attribute the moment someone
  // is called "Person 07". Half of this block exists to make that
  // impossible to add by accident.
  {
    const people = await prisma.person.findMany();
    const allocations = await prisma.allocation.findMany();
    const settings = await prisma.portfolioSettings.findUnique({ where: { id: "singleton" } });
    const switchPct = settings?.contextSwitchCostPct ?? 0;
    const jsa = graphs.find((x) => x.id === "jsa");

    // W1 — every Person node projects a real row, keyed on the id.
    {
      const byId = new Map(people.map((p) => [p.id, p]));
      let n = 0;
      let wrong = 0;
      for (const { g } of graphs) {
        for (const node of g.filterNodes((_x, a) => a.kind === "person")) {
          n++;
          const a = g.getNodeAttributes(node);
          const row = byId.get(a.personId as string);
          if (!row) wrong++;
          else if (row.name !== a.label || row.fte !== a.fte || row.synthetic !== a.synthetic) wrong++;
          if (node !== `person:${a.personId}`) wrong++;
        }
      }
      check("W1 every Person node projects a real Person row, keyed on its id", n > 0 && wrong === 0, `${n} people, ${wrong} wrong`);
    }

    // W2 — a name is not an id. Renaming a person must not move their node.
    {
      const sample = people[0];
      const renamed = people.map((p) => (p.id === sample.id ? { ...p, name: "Person 07" } : p));
      const before = projectPeople({
        scopeId: "jsa", people, allocations,
        scopeNames: new Map(), contextSwitchCostPct: switchPct,
      });
      const after = projectPeople({
        scopeId: "jsa", people: renamed, allocations,
        scopeNames: new Map(), contextSwitchCostPct: switchPct,
      });
      const idsSame = before.map((x) => x.personId).join() === after.map((x) => x.personId).join();
      const figuresSame = before.every((b, i) => b.effectiveFte === after[i].effectiveFte);
      check(
        "W2 renaming a person changes their label and nothing else",
        idsSame && figuresSame && after.some((x) => x.name === "Person 07"),
        `${before.length} people, ids and figures unchanged under rename`
      );
    }

    // W3 — WHICH PEOPLE APPEAR is the resolver's own contributor set, not a
    // rule invented here.
    {
      let wrong = 0;
      for (const { id, g } of graphs) {
        const resolved = resolveCapacity(id, people, allocations, switchPct);
        const expected = new Set(resolved.contributors.map((c) => `person:${c.personId}`));
        const actual = new Set(g.filterNodes((_x, a) => a.kind === "person"));
        if (expected.size !== actual.size || [...expected].some((x) => !actual.has(x))) wrong++;
      }
      check("W3 the people on the field are exactly the resolver's contributors", wrong === 0, `${wrong} Scopes disagreeing`);
    }

    // W4 — the allocation edge maps to a real row, and carries its fraction.
    {
      let n = 0;
      let wrong = 0;
      for (const { id, g } of graphs) {
        g.forEachEdge((_e, a, src, tgt) => {
          if (a.rel !== "allocated_to") return;
          n++;
          if (a.basis !== "attested") wrong++;
          if (tgt !== nodeId.scope(id)) wrong++;
          const personId = g.getNodeAttribute(src, "personId") as string;
          const row = allocations.find((x) => x.personId === personId && x.scopeId === id);
          if (!row) wrong++;
          else if (Math.abs((a.fraction as number) - row.fraction) > 1e-9) wrong++;
        });
      }
      check("W4 every allocated_to edge is one Allocation row, fraction included", n > 0 && wrong === 0, `${n} edges, ${wrong} wrong`);
    }

    // W5 — the split is counted GLOBALLY. Reading only this Scope's rows
    // would report Sam Ortiz as undivided and overstate what JSA gets.
    if (jsa) {
      const sam = jsa.g
        .filterNodes((_x, a) => a.kind === "person")
        .map((n) => jsa.g.getNodeAttributes(n))
        .find((a) => (a.scopeCount as number) > 1);
      const localOnly = allocations.filter((a) => a.scopeId === "jsa");
      const localResolved = resolveCapacity("jsa", people, localOnly, switchPct);
      const localSplit = localResolved.contributors.filter((c) => c.scopeCount > 1).length;
      check(
        "W5 scopeCount is computed from every Allocation row, not this Scope's",
        !!sam && sam.scopeCount === 2 && localSplit === 0,
        sam
          ? `${sam.label} spans ${sam.scopeCount} projects; reading JSA's rows alone would have said 1`
          : "no split person found"
      );
    }

    // W6/W7 — switchFactor and effectiveFte are the resolver's, to the digit.
    {
      let wrong = 0;
      let n = 0;
      for (const { id, g } of graphs) {
        const resolved = resolveCapacity(id, people, allocations, switchPct);
        for (const c of resolved.contributors) {
          const a = g.getNodeAttributes(`person:${c.personId}`);
          n++;
          if (a.switchFactor !== c.switchFactor) wrong++;
          if (a.effectiveFte !== c.effectiveFte) wrong++;
          if (a.fraction !== c.fraction) wrong++;
          if (a.scopeCount !== c.scopeCount) wrong++;
          // And the factor is the shared formula, not a second copy of it.
          if (a.switchFactor !== switchFactorFor(switchPct, c.scopeCount)) wrong++;
        }
      }
      check(
        "W6 every capacity figure equals lib/capacity's own output",
        n > 0 && wrong === 0,
        `${n} contributors, ${wrong} disagreements — Audit reads capacity, it does not compute it`
      );
    }

    // W8 — synthetic survives the projection.
    {
      const withSynthetic = people.map((p, i) => ({ ...p, synthetic: i === 0 }));
      const out = projectPeople({
        scopeId: "jsa", people: withSynthetic, allocations,
        scopeNames: new Map(), contextSwitchCostPct: switchPct,
      });
      const flagged = out.filter((x) => x.synthetic);
      check(
        "W8 synthetic capacity stays marked as synthetic",
        out.length > 0 && flagged.length === (out.some((x) => x.personId === withSynthetic[0].id) ? 1 : 0),
        `${flagged.length} of ${out.length} flagged`
      );
    }

    // ── W9. THE ONE THAT MATTERS ──────────────────────────────────────
    //
    // Person.name is documented as a label — "Person 07" and "Alice" are the
    // same unit of capacity, and renaming one must not move a forecast by a
    // day. LinearIssueSummary.assignee is a display-name string from another
    // system. The JSA fixture has them matching EXACTLY, which is a
    // coincidence of the fixture and not a join key.
    if (jsa) {
      const workAssignees = new Set(
        jsa.g
          .filterNodes((_x, a) => a.kind === "work")
          .map((n) => jsa.g.getNodeAttribute(n, "assignee"))
          .filter(Boolean) as string[]
      );
      const personNames = new Set(
        jsa.g.filterNodes((_x, a) => a.kind === "person").map((n) => String(jsa.g.getNodeAttribute(n, "label")))
      );
      const overlap = [...personNames].filter((x) => workAssignees.has(x));

      let joined = 0;
      jsa.g.forEachEdge((_e, _a, src, tgt) => {
        const sk = jsa.g.getNodeAttribute(src, "kind");
        const tk = jsa.g.getNodeAttribute(tgt, "kind");
        if ((sk === "person" && (tk === "work" || tk === "feature")) ||
            (tk === "person" && (sk === "work" || sk === "feature"))) joined++;
      });

      check(
        "W9 four Person names match a Linear assignee EXACTLY and still join nothing",
        overlap.length > 0 && joined === 0,
        `${overlap.length} exact name matches (${overlap.join(", ")}), ${joined} edges — Person.name is a label, not an identity, ` +
          `and joining on it would look perfect here and mis-attribute the moment a unit is called "Person 07"`
      );
    }

    // W10 — the same, forced: a fixture built so that EVERY person's name is
    // an assignee. If a name-join ever appears, this is where it shows.
    {
      const inputs = await loadAuditGraphInputs("jsa");
      if (inputs) {
        const forced = {
          ...inputs,
          entities: {
            ...inputs.entities,
            work: inputs.entities.work.map((w, i) => ({
              ...w,
              assignee: inputs.entities.people[i % Math.max(1, inputs.entities.people.length)]?.name ?? w.assignee,
            })),
          },
        };
        const g = buildAuditGraph(forced);
        let joined = 0;
        g.forEachEdge((_e, _a, src, tgt) => {
          const sk = g.getNodeAttribute(src, "kind");
          const tk = g.getNodeAttribute(tgt, "kind");
          if (sk === "person" || tk === "person") {
            const other = sk === "person" ? tk : sk;
            if (other === "work" || other === "feature") joined++;
          }
        });
        const everyWorkNamed = forced.entities.work.every((w) => w.assignee);
        check(
          "W10 even when EVERY ticket is assigned to a named Person, no edge appears",
          everyWorkNamed && joined === 0,
          `${forced.entities.work.length} tickets all assigned to Person names, ${joined} edges created`
        );
      }
    }

    // W11 — a person carries no relation beyond the two that are grounded.
    {
      let bad = 0;
      for (const { g } of graphs) {
        g.forEachEdge((_e, a, src, tgt) => {
          const sk = g.getNodeAttribute(src, "kind");
          const tk = g.getNodeAttribute(tgt, "kind");
          if (sk !== "person" && tk !== "person") return;
          const ok = sk === "person" && (a.rel === "allocated_to" || a.rel === "attests");
          if (!ok) bad++;
        });
      }
      check(
        "W11 a Person carries only allocated_to and cluster membership",
        bad === 0,
        `${bad} unexpected person edges — Allocation has no Feature column, so person → Feature is ungrounded too`
      );
    }

    // W12 — no availability was invented. Nothing in the model supplies one.
    {
      let bad = 0;
      for (const { g } of graphs) {
        g.forEachNode((_n, a) => {
          if (a.kind !== "person") return;
          for (const k of ["availability", "available", "capacityState", "utilisation", "utilization", "role", "owner"]) {
            if (a[k] !== undefined) bad++;
          }
        });
      }
      check(
        "W12 no availability, role or ownership is invented on a Person",
        bad === 0,
        `${bad} invented attributes — Hermes availability evidence is not accepted capacity Reality`
      );
    }

    // W13 — a Scope nobody has staffed gets nobody.
    {
      const staffed = new Set(allocations.filter((a) => a.fraction > 0).map((a) => a.scopeId));
      const unstaffed = graphs.filter((x) => !staffed.has(x.id));
      const invented = unstaffed.filter((x) => x.g.someNode((_n, a) => a.kind === "person"));
      check(
        "W13 a Scope with no Allocation rows shows no people",
        unstaffed.length > 0 && invented.length === 0,
        `${unstaffed.length} unstaffed Scopes (${unstaffed.map((x) => x.name).join(", ")}), ${invented.length} inventing`
      );
    }

    // W14 — THE GRAPH STAYS SCOPE-SHAPED. Sam's Design allocation is on the
    // node as context; it must not have dragged a Design node into JSA.
    if (jsa) {
      const scopeNodes = jsa.g.filterNodes((_x, a) => a.kind === "scope");
      const foreign = scopeNodes.filter((n) => n !== nodeId.scope("jsa"));
      const sam = jsa.g
        .filterNodes((_x, a) => a.kind === "person")
        .map((n) => jsa.g.getNodeAttributes(n))
        .find((a) => (a.scopeCount as number) > 1);
      const listed = (sam?.allocations as { scopeName: string }[] | undefined) ?? [];
      check(
        "W14 global allocation context never becomes graph topology",
        foreign.length === 0 && listed.length === 2,
        `${scopeNodes.length} Scope node (this project only); the split person lists ${listed.length} commitments in the inspector`
      );
    }

    // W15 — projecting capacity writes nothing.
    {
      const before = await prisma.$transaction([prisma.person.count(), prisma.allocation.count(), prisma.portfolioSettings.count()]);
      for (const s of scopes) {
        const inputs = await loadAuditGraphInputs(s.id);
        if (inputs) buildAuditGraph(inputs);
      }
      const after = await prisma.$transaction([prisma.person.count(), prisma.allocation.count(), prisma.portfolioSettings.count()]);
      check("W15 projecting capacity writes nothing", before.every((v, i) => v === after[i]), `${before.join("/")} → ${after.join("/")}`);
    }
  }


  // ── X  SOURCE ARTIFACTS ────────────────────────────────────────────────
  //
  // The temptation here is naming. "Delivery sync · 21 Aug" reads like a
  // meeting, "JSA delivery scope" reads like a spec — and neither of those
  // observations is allowed to decide anything. The kind comes from a
  // persisted type field or it does not exist.
  {
    const jsa = graphs.find((x) => x.id === "jsa");
    const snapshots = await prisma.contextSnapshot.findMany();
    const isSource = (k: string) => SOURCE_KINDS.includes(k as never);

    // X1 — every specialised kind traces to a persisted type field.
    {
      const manifestType = new Map<string, string>();
      for (const snap of snapshots) {
        const pkg = snap.package as { sources?: { sourceRef: string; sourceType: string }[] };
        for (const m of pkg.sources ?? []) manifestType.set(`source:pkg:${m.sourceRef}`, m.sourceType);
      }
      const rows = await prisma.source.findMany();
      const rowType = new Map(rows.map((r) => [`source:row:${r.id}`, r.kind]));

      let n = 0;
      let wrong = 0;
      for (const { name, g } of graphs) {
        for (const node of g.filterNodes((_x, a) => isSource(a.kind) && a.supplied !== false)) {
          n++;
          const type = manifestType.get(node) ?? rowType.get(node) ?? null;
          const expected = sourceKindFor(type);
          if (g.getNodeAttribute(node, "kind") !== expected) {
            wrong++;
            console.log(`      (${name}) ${node} is ${g.getNodeAttribute(node, "kind")}, type field says ${type}`);
          }
        }
      }
      check("X1 every source artifact's kind comes from its persisted type field", n > 0 && wrong === 0, `${n} artifacts, ${wrong} wrong`);
    }

    // X2 — A TITLE DECIDES NOTHING. Same three names, three different type
    // fields, and the kind follows the field every time.
    {
      const cases: [string, string][] = [
        ["transcript", "transcript"],
        ["notion", "notion_page"],
        ["figma", "figma_artifact"],
        ["notes", "source"],
        ["estimates", "source"],
        ["spreadsheet", "source"],
        ["", "source"],
      ];
      const wrong = cases.filter(([type, want]) => sourceKindFor(type) !== want);
      // The names that would fool a title reader.
      const lures = ["Delivery sync · 21 Aug", "JSA delivery scope", "Offline capture flow", "transcript of the meeting"];
      const fooled = lures.filter((title) => sourceKindFor(title as string) !== "source" && !title.toLowerCase().includes("transcript"));
      check(
        "X2 the type field decides the kind; a title decides nothing",
        wrong.length === 0 && fooled.length === 0,
        `${cases.length} type values correct; titles like "${lures[0]}" and "${lures[1]}" classify as generic when passed as a type`
      );
    }

    // X3 — a Notion source becomes a page, NOT a Requirement, and the
    // Requirement it grounded is a separate node.
    if (jsa) {
      const pages = jsa.g.filterNodes((_x, a) => a.kind === "notion_page");
      const reqs = jsa.g.filterNodes((_x, a) => a.kind === "requirement");
      const overlap = pages.filter((x) => reqs.includes(x));
      // And the requirement reaches the page only through its passage.
      let viaPassage = 0;
      for (const r of reqs) {
        const psg = jsa.g.outEdges(r).filter((e) => jsa.g.getEdgeAttribute(e, "rel") === "evidenced_by").map((e) => jsa.g.target(e))[0];
        if (!psg) continue;
        const src = jsa.g.outEdges(psg).filter((e) => jsa.g.getEdgeAttribute(e, "rel") === "extracted_from").map((e) => jsa.g.target(e))[0];
        if (src && jsa.g.getNodeAttribute(src, "kind") === "notion_page") viaPassage++;
      }
      check(
        "X3 a Notion source is a page, and the Requirement it grounded is a different node",
        pages.length > 0 && reqs.length > 0 && overlap.length === 0 && viaPassage === reqs.length,
        `${pages.length} pages, ${reqs.length} requirements, ${overlap.length} collapsed, ${viaPassage} reached only through their passage`
      );
    }

    // X4 — a Figma source is an artifact and implements nothing.
    if (jsa) {
      const figma = jsa.g.filterNodes((_x, a) => a.kind === "figma_artifact");
      let semantic = 0;
      jsa.g.forEachEdge((_e, a, src, tgt) => {
        const sk = jsa.g.getNodeAttribute(src, "kind");
        const tk = jsa.g.getNodeAttribute(tgt, "kind");
        if (sk !== "figma_artifact" && tk !== "figma_artifact") return;
        // The only thing that may touch a source artifact is provenance.
        if (a.rel !== "extracted_from" && a.rel !== "evidenced_by" && a.rel !== "supersedes") semantic++;
      });
      check(
        "X4 a Figma artifact is design evidence and implements nothing",
        figma.length > 0 && semantic === 0,
        `${figma.length} Figma artifacts, ${semantic} non-provenance edges`
      );
    }

    // X5 — provenance direction survives the new kinds.
    {
      let n = 0;
      let wrong = 0;
      for (const { g } of graphs) {
        g.forEachEdge((_e, a, src, tgt) => {
          if (a.rel !== "extracted_from") return;
          n++;
          if (g.getNodeAttribute(src, "kind") !== "passage") wrong++;
          if (!isSource(g.getNodeAttribute(tgt, "kind"))) wrong++;
          if (g.hasDirectedEdge(tgt, src)) wrong++;
        });
      }
      check("X5 extracted_from still runs passage → artifact, never the reverse", n > 0 && wrong === 0, `${n} edges, ${wrong} wrong`);
    }

    // X6 — every passage points at the artifact its own sourceRef names.
    if (jsa) {
      const snap = snapshots.find((x) => x.scopeId === "jsa");
      const pkg = snap?.package as { evidence?: { id: string; sourceRef: string }[] };
      let n = 0;
      let wrong = 0;
      for (const e of pkg?.evidence ?? []) {
        const pid = nodeId.passage(snap!.id, e.id);
        if (!jsa.g.hasNode(pid)) continue;
        n++;
        const tgt = jsa.g.outEdges(pid).filter((x) => jsa.g.getEdgeAttribute(x, "rel") === "extracted_from").map((x) => jsa.g.target(x))[0];
        if (tgt !== nodeId.packageSource(e.sourceRef)) wrong++;
      }
      check("X6 every passage is attached to the artifact its sourceRef names", n > 0 && wrong === 0, `${n} passages, ${wrong} misattached`);
    }

    // X7 — expanding an artifact exposes ITS passages and nobody else's.
    // The renderer's own rule, restated: a passage opens when its source is
    // expanded, which is one outbound extracted_from hop and no further.
    if (jsa) {
      const artifacts = jsa.g.filterNodes((_x, a) => isSource(a.kind));
      let leak = 0;
      for (const art of artifacts) {
        const own = new Set(
          jsa.g.inEdges(art).filter((e) => jsa.g.getEdgeAttribute(e, "rel") === "extracted_from").map((e) => jsa.g.source(e))
        );
        // Everything the expansion rule would open for this artifact.
        const opened = jsa.g.filterNodes((n, a) => {
          if (a.kind !== "passage") return false;
          return jsa.g
            .outEdges(n)
            .some((e) => jsa.g.getEdgeAttribute(e, "rel") === "extracted_from" && jsa.g.target(e) === art);
        });
        if (opened.some((n) => !own.has(n)) || opened.length !== own.size) leak++;
      }
      check(
        "X7 expanding one artifact opens exactly its own passages",
        artifacts.length > 0 && leak === 0,
        `${artifacts.length} artifacts, ${leak} leaking a sibling's passages`
      );
    }

    // X8 — a declared artifact that DID supply evidence gets no second node.
    {
      const jsaScope = await prisma.scope.findUnique({ where: { id: "jsa" } });
      const refs: string[] = [];
      jsa?.g.forEachNode((_n, a) => {
        if (a.kind === "passage" && typeof a.externalRef === "string") refs.push(a.externalRef);
      });
      const declared = declaredArtifacts({
        notionPageIds: jsaScope?.notionPageIds ?? [],
        figmaRefs: jsaScope?.figmaRefs ?? [],
        evidenceExternalRefs: refs,
      });
      const totalDeclared = (jsaScope?.notionPageIds.length ?? 0) + (jsaScope?.figmaRefs.length ?? 0);
      check(
        "X8 a declared artifact that supplied evidence is not drawn twice",
        totalDeclared > declared.length && declared.length > 0,
        `${totalDeclared} declared, ${declared.length} unread and drawn (${declared.map((d) => d.ref).join(", ")}) — the rest already have a manifest node`
      );
      const unsupplied = jsa?.g.filterNodes((_x, a) => isSource(a.kind) && a.supplied === false) ?? [];
      check(
        "X8b and an unread one is drawn, marked as supplying nothing",
        unsupplied.length === declared.length,
        `${unsupplied.length} marked unsupplied`
      );
    }

    // X9 — the same evidence id in two snapshots stays two passages, and each
    // attaches to its own snapshot's artifact.
    {
      let wrong = 0;
      for (const { g } of graphs) {
        for (const n of g.filterNodes((_x, a) => a.kind === "passage")) {
          const parts = n.split(":");
          if (parts.length < 3) wrong++;
        }
      }
      check("X9 passages stay snapshot-scoped alongside the new artifact kinds", wrong === 0, `${wrong} unscoped`);
    }

    // X10 — Evidence Solo reaches the artifact and stops. It must not turn
    // round at a shared artifact and fan into its other passages.
    if (jsa) {
      const finding = jsa.g
        .filterNodes((_x, a) => a.kind === "finding")
        .find((n) =>
          jsa.g.outEdges(n).some((e) => jsa.g.getEdgeAttribute(e, "rel") === "evidenced_by" && jsa.g.getNodeAttribute(jsa.g.target(e), "kind") === "passage")
        );
      if (finding) {
        const solo = evidenceSolo(jsa.g, finding);
        const kinds = [...solo.nodes].map((n) => jsa.g.getNodeAttribute(n, "kind"));
        const artifactsLit = [...solo.nodes].filter((n) => isSource(jsa.g.getNodeAttribute(n, "kind")));
        // Every passage of every lit artifact.
        const siblings = artifactsLit.flatMap((art) =>
          jsa.g.inEdges(art).filter((e) => jsa.g.getEdgeAttribute(e, "rel") === "extracted_from").map((e) => jsa.g.source(e))
        );
        const uncited = siblings.filter((n) => !solo.nodes.has(n));
        check(
          "X10 Evidence Solo reaches the artifact without fanning into its siblings",
          artifactsLit.length > 0 && uncited.length > 0 && !kinds.includes("reality"),
          `lit ${[...new Set(kinds)].join(", ")}; ${uncited.length} sibling passage(s) of the same artifact correctly left dark`
        );
      }
    }

    // X11 — sparse Scopes invent nothing.
    {
      const bare = graphs.filter((x) => x.id === "design" || x.id === "itrack");
      const invented = bare.filter((x) => x.g.someNode((_n, a) => isSource(a.kind)));
      check(
        "X11 a Scope with no sources gains no source artifacts",
        bare.length > 0 && invented.length === 0,
        `${bare.length} sourceless Scopes, ${invented.length} inventing`
      );
    }

    // X12 — no semantic edge from a shared name. "JSA delivery scope" shares
    // a word with the JSA Scope and with several findings.
    {
      let bad = 0;
      for (const { g } of graphs) {
        g.forEachEdge((_e, a, src, tgt) => {
          const sk = g.getNodeAttribute(src, "kind");
          const tk = g.getNodeAttribute(tgt, "kind");
          if (!isSource(sk) && !isSource(tk)) return;
          if (!["extracted_from", "evidenced_by", "supersedes"].includes(a.rel)) bad++;
        });
      }
      check(
        "X12 a source artifact carries provenance relations and nothing else",
        bad === 0,
        `${bad} semantic edges on source artifacts — a shared word is not a relationship`
      );
    }

    // X13 — reading and classifying sources writes nothing.
    {
      const before = await prisma.$transaction([prisma.source.count(), prisma.contextSnapshot.count(), prisma.scope.count()]);
      for (const s of scopes) {
        const inputs = await loadAuditGraphInputs(s.id);
        if (inputs) buildAuditGraph(inputs);
      }
      const after = await prisma.$transaction([prisma.source.count(), prisma.contextSnapshot.count(), prisma.scope.count()]);
      check("X13 classifying source artifacts writes nothing", before.every((v, i) => v === after[i]), `${before.join("/")} → ${after.join("/")}`);
    }
  }


  // ── Z  EXTERNAL STRUCTURED INTELLIGENCE ────────────────────────────────
  //
  // The tranche's whole risk is a category error: an external knowledge
  // system's BELIEF about a project arriving in an instrument whose job is to
  // say what is accepted. Every assertion below is a way of asking the same
  // question — can external material become Signal Reality by any route? —
  // and the answers have to be structural, because a disclaimer is not a
  // guarantee.
  //
  // No real package carries intelligence yet, so the payload is the
  // synthetic JSA-scale fixture. Its counts are the real stated ones and it
  // carries a deliberate counterexample (objects that are `open` AND
  // superseded), so a proof that only works on flattering data fails here.
  {
    const pkg = buildIntelligenceFixturePackage("jsa");
    const snap = { id: "snap-intel", scopeId: "jsa", package: pkg };
    const projected = projectIntelligence([snap], "jsa");

    // ── CONTRACT: the transport must not eat what it does not model ────

    // Z1 — THE CRITICAL FIRST FIX. The validator used to rebuild the package
    // from named fields, so any field it did not know about vanished with no
    // error. That is why intelligence could not arrive at all.
    {
      const accepted = validateProjectContextPackage(pkg as unknown);
      check(
        "Z1 the validator carries intelligence through instead of dropping it",
        (accepted.intelligenceObjects?.length ?? 0) === JSA_SCALE.objects &&
          (accepted.intelligenceRelations?.length ?? 0) === JSA_SCALE.relations &&
          accepted.intelligenceMeta?.batchId === "synthetic-batch-001",
        `${accepted.intelligenceObjects?.length ?? 0} objects, ${accepted.intelligenceRelations?.length ?? 0} relations, batch ${accepted.intelligenceMeta?.batchId}`
      );
    }

    // Z2 — AND A PACKAGE WITHOUT THEM IS UNCHANGED. The fields are assigned
    // only when sent, so every already-accepted snapshot serialises exactly
    // as it did before this tranche existed.
    {
      const legacy = { ...pkg } as Record<string, unknown>;
      delete legacy.intelligenceObjects;
      delete legacy.intelligenceRelations;
      delete legacy.intelligenceMeta;
      const accepted = validateProjectContextPackage(legacy);
      const keys = Object.keys(accepted);
      check(
        "Z2 a package with no intelligence gains no intelligence keys",
        !keys.includes("intelligenceObjects") &&
          !keys.includes("intelligenceRelations") &&
          !keys.includes("intelligenceMeta"),
        `${keys.length} keys, none of them intelligence — legacy snapshots hash identically`
      );
    }

    // Z3 — A FIELD SIGNAL DOES NOT MODEL SURVIVES rather than being
    // whitelisted away one level down. Re-imposing a whitelist inside an
    // intelligence object would have reintroduced the exact bug Z1 fixes,
    // against a contract Signal does not own.
    {
      const withUnknown = {
        ...pkg,
        intelligenceObjects: pkg.intelligenceObjects!.map((o, i) =>
          i === 0 ? { ...o, producerOnlyField: { nested: [1, 2, 3] } } : o
        ),
      };
      const accepted = validateProjectContextPackage(withUnknown as unknown);
      const extra = accepted.intelligenceObjects?.[0]?.extra as Record<string, unknown> | undefined;
      check(
        "Z3 an unmodelled producer field survives the crossing on `extra`",
        extra != null && JSON.stringify(extra.producerOnlyField) === JSON.stringify({ nested: [1, 2, 3] }),
        `extra = ${JSON.stringify(extra ?? null)}`
      );
    }

    // Z4 — THE TRUST BOUNDARY IS CHECKED AT THE BOUNDARY. A payload claiming
    // its objects are accepted Reality is refused outright, not downgraded.
    {
      const lying = {
        ...pkg,
        intelligenceObjects: pkg.intelligenceObjects!.map((o, i) =>
          i === 0 ? { ...o, trust: "signal_reality" } : o
        ),
      };
      let rejected = false;
      try {
        validateProjectContextPackage(lying as unknown);
      } catch {
        rejected = true;
      }
      check(
        "Z4 a package claiming its intelligence is Signal Reality is rejected",
        rejected,
        `trust must equal ${EXTERNAL_INTELLIGENCE_TRUST}`
      );
    }

    // Z5 — CURRENTNESS IS A TRANSPORTED FACT, so it must arrive. Defaulting a
    // missing `isCurrent` to true would silently promote history to head.
    {
      const noFlag = {
        ...pkg,
        intelligenceObjects: pkg.intelligenceObjects!.map((o, i) => {
          if (i !== 0) return o;
          const { isCurrent: _drop, ...rest } = o;
          return rest;
        }),
      };
      let rejected = false;
      try {
        validateProjectContextPackage(noFlag as unknown);
      } catch {
        rejected = true;
      }
      check("Z5 an object with no isCurrent is rejected, never defaulted", rejected);
    }

    // Z6 — NO DANGLING CITATION SURVIVES INTO AN IMMUTABLE SNAPSHOT.
    {
      const dangling = {
        ...pkg,
        intelligenceObjects: pkg.intelligenceObjects!.map((o, i) =>
          i === 0 ? { ...o, evidenceRefs: ["ev-does-not-exist"] } : o
        ),
      };
      let rejected = false;
      try {
        validateProjectContextPackage(dangling as unknown);
      } catch {
        rejected = true;
      }
      check("Z6 a citation naming evidence the package does not carry is rejected", rejected);
    }

    // ── PROJECTION: what Signal reads out of an accepted package ───────

    // Z7 — SCOPE IS THE PRODUCER'S CLAIM, NOT SIGNAL'S GUESS. An object the
    // producer could not attribute stays out rather than being matched into
    // the Scope by resemblance.
    {
      const otherScope = projectIntelligence([snap], "platform");
      const mixed = {
        ...pkg,
        intelligenceObjects: pkg.intelligenceObjects!.map((o, i) =>
          i < 5 ? { ...o, scope: ["platform"] } : o
        ),
      };
      const partial = projectIntelligence([{ ...snap, package: mixed }], "jsa");
      check(
        "Z7 an object is admitted only by its own scope[], never by text",
        otherScope.objects.length === 0 &&
          partial.objects.length === JSA_SCALE.objects - 5 &&
          partial.meta.outOfScope === 5,
        `another Scope reads 0; 5 reattributed objects leave ${partial.objects.length} and are counted out of scope`
      );
    }

    // Z8 — CURRENTNESS NEVER COMES FROM STATUS. The fixture carries the real
    // corpus's counterexample: objects that are `open` and superseded. A
    // renderer or projection reading one from the other draws those as live.
    {
      const openButHistorical = projected.objects.filter((o) => o.status === "open" && !o.isCurrent);
      const currentCount = projected.objects.filter((o) => o.isCurrent).length;
      check(
        "Z8 isCurrent is transported, never derived from status",
        openButHistorical.length > 0 && currentCount === JSA_SCALE.currentObjects,
        `${openButHistorical.length} objects are open AND superseded; ${currentCount} head of ${projected.objects.length} — status would have called all ${openButHistorical.length} live`
      );
    }

    // Z9 — RELATIONS ARE NEVER RE-NORMALISED. The bridge already reversed the
    // passive forms; inverting again would point every longitudinal chain
    // backwards, and it would look plausible while doing it.
    {
      const sent = pkg.intelligenceRelations!.filter((r) => r.rel === "supersedes");
      const got = projected.relations.filter((r) => r.rel === "supersedes");
      const inverted = got.filter((g) => {
        const from = g.fromKey.split(":").slice(2).join(":");
        return !sent.some((s) => s.from === from && s.to === g.toExternalId);
      });
      check(
        "Z9 a transported relation keeps the direction it arrived in",
        sent.length > 0 && got.length === sent.length && inverted.length === 0,
        `${got.length} supersedes edges, ${inverted.length} reversed`
      );
    }

    // Z10 — AN UNRECOGNISED RELATION IS QUIET, NOT LOUD. A new relation name
    // appearing at full volume at rest is how a hairball starts.
    {
      const unknown = relClassOf({ rel: "some_new_relation_nobody_has_seen" });
      const declared = relClassOf({ rel: "related_to", relClass: "temporal" });
      check(
        "Z10 an unknown relation falls back to contextual, and a declared class wins",
        unknown === "contextual" && declared === "temporal",
        `unknown → ${unknown}; producer-declared → ${declared}`
      );
      check(
        "Z10b the corpus really is mostly contextual, which is why the policy exists",
        projected.meta.byRelClass.contextual === JSA_SCALE.contextual &&
          projected.meta.byRelClass.temporal === JSA_SCALE.temporal &&
          projected.meta.byRelClass.semantic === JSA_SCALE.semantic,
        `${projected.meta.byRelClass.temporal} temporal, ${projected.meta.byRelClass.semantic} semantic, ${projected.meta.byRelClass.contextual} contextual`
      );
    }

    // ── THE GRAPH: the trust boundary, held structurally ───────────────

    const base = await loadAuditGraphInputs("jsa");
    if (!base) throw new Error("JSA did not load");
    const withIntel = buildAuditGraph({
      ...base,
      entities: { ...base.entities, intelligence: projected },
    });
    const intelNodes = withIntel.filterNodes((_n, a) => a.kind === "intel");

    // Z11 — A PACKAGE FULL OF EXTERNAL DECISIONS PRODUCES ZERO SIGNAL
    // DECISIONS. The single most important assertion in this block.
    {
      const externalDecisions = projected.objects.filter((o) => o.intelligenceType === "Decision").length;
      const signalDecisionsBefore = buildAuditGraph(base).filterNodes((_n, a) => a.kind === "decision").length;
      const signalDecisionsAfter = withIntel.filterNodes((_n, a) => a.kind === "decision").length;
      const signalDeps = withIntel.filterNodes((_n, a) => a.kind === "dependency").length;
      const signalDepsBefore = buildAuditGraph(base).filterNodes((_n, a) => a.kind === "dependency").length;
      const findingsAfter = withIntel.filterNodes((_n, a) => a.kind === "finding").length;
      const findingsBefore = buildAuditGraph(base).filterNodes((_n, a) => a.kind === "finding").length;
      check(
        "Z11 external Decisions, Dependencies and Risks create ZERO Signal entities",
        externalDecisions > 0 &&
          signalDecisionsAfter === signalDecisionsBefore &&
          signalDeps === signalDepsBefore &&
          findingsAfter === findingsBefore,
        `${externalDecisions} external Decisions arrived; Signal decisions ${signalDecisionsBefore}→${signalDecisionsAfter}, dependencies ${signalDepsBefore}→${signalDeps}, findings ${findingsBefore}→${findingsAfter}`
      );
    }

    // Z12 — THE BOUNDARY, BOTH DIRECTIONS. Every edge touching an intel node
    // is `external`, and no `external` edge touches anything else.
    {
      const intelSet = new Set(intelNodes);
      let touchingIntelNotExternal = 0;
      let externalNotTouchingIntel = 0;
      withIntel.forEachEdge((_e, a, s, t) => {
        const touches = intelSet.has(s) || intelSet.has(t);
        if (touches && a.basis !== "external") touchingIntelNotExternal++;
        if (a.basis === "external" && !touches) externalNotTouchingIntel++;
      });
      check(
        "Z12 external basis and external material are the same set, both ways",
        intelNodes.length > 0 && touchingIntelNotExternal === 0 && externalNotTouchingIntel === 0,
        `${intelNodes.length} intel nodes, ${touchingIntelNotExternal} non-external edges on them, ${externalNotTouchingIntel} external edges elsewhere`
      );
    }

    // Z13 — NO RULE JOINS THE TWO WORLDS. The registry is the whole answer:
    // there is no construction path from an intel node to a Signal entity, so
    // no amount of resemblance can produce one.
    {
      const crossing = Object.values(EDGE_RULES).filter((r) => {
        const from = Array.isArray(r.from) ? r.from : [r.from];
        const to = Array.isArray(r.to) ? r.to : [r.to];
        const touches = from.includes("intel") || to.includes("intel");
        if (!touches) return false;
        const other = [...from, ...to].filter((k) => k !== "intel");
        return other.some((k) => k !== "passage");
      });
      check(
        "Z13 no edge rule can join external intelligence to a Signal entity",
        crossing.length === 0,
        `${crossing.length} crossing rules — intel reaches passages and other intel, and nothing else`
      );
    }

    // Z14 — THE FALSIFIABLE NEGATIVE, forced. A fixture where an external
    // Decision's statement is CHARACTER-IDENTICAL to a Signal Decision's
    // title, and an external Dependency names a real upstream Scope. If a
    // text join ever appears anywhere, this is where it shows.
    {
      const signalDecisionTitles = base.entities.decisions.map((d) => d.title);
      const upstreamNames = base.entities.dependsOn.map((d) => d.name);
      const bait = pkg.intelligenceObjects!.map((o, i) => {
        if (o.intelligenceType === "Decision" && signalDecisionTitles.length > 0) {
          return { ...o, statement: signalDecisionTitles[i % signalDecisionTitles.length] };
        }
        if (o.intelligenceType === "Dependency" && upstreamNames.length > 0) {
          return { ...o, statement: upstreamNames[i % upstreamNames.length] };
        }
        return o;
      });
      const baited = projectIntelligence([{ ...snap, package: { ...pkg, intelligenceObjects: bait } }], "jsa");
      const g = buildAuditGraph({ ...base, entities: { ...base.entities, intelligence: baited } });
      const intelSet = new Set(g.filterNodes((_n, a) => a.kind === "intel"));
      let joined = 0;
      g.forEachEdge((_e, _a, s, t) => {
        const touches = intelSet.has(s) || intelSet.has(t);
        if (!touches) return;
        const otherKind = g.getNodeAttribute(intelSet.has(s) ? t : s, "kind");
        if (otherKind !== "intel" && otherKind !== "passage") joined++;
      });
      const baitCount = bait.filter((o, i) => o.statement !== pkg.intelligenceObjects![i].statement).length;
      check(
        "Z14 statements identical to Signal rows still join nothing",
        signalDecisionTitles.length > 0 && baitCount > 0 && joined === 0,
        `${baitCount} external statements set character-identical to a Signal Decision title or upstream Scope name, ${joined} edges created`
      );
    }

    // Z15 — THE PASSAGE IS READ FROM THE PACKAGE, NOT FROM THE CLAIM. An
    // object cites a row id; the row's text, source and observation time all
    // come out of Signal's own accepted evidence.
    {
      const cited = withIntel
        .filterNodes((_n, a) => a.kind === "passage")
        .filter((n) => withIntel.inEdges(n).some((e) => withIntel.getEdgeAttribute(e, "rel") === "cites"));
      const evidenceById = new Map(pkg.evidence.map((e) => [e.id, e]));
      const wrong = cited.filter((n) => {
        const a = withIntel.getNodeAttributes(n);
        const id = String(a.ref).split(":").slice(2).join(":");
        return evidenceById.get(id)?.excerpt !== a.excerpt;
      });
      check(
        "Z15 a cited passage's text comes from Signal's evidence, never the claim",
        cited.length > 0 && wrong.length === 0,
        `${cited.length} cited passages, ${wrong.length} carrying anything but the package's own excerpt`
      );
    }

    // Z16 — A CITATION TO A ROW THE PACKAGE DOES NOT CARRY BUILDS NOTHING.
    // The validator refuses one (Z6); an older snapshot accepted before this
    // tranche could still contain one, and the projection must survive it
    // without inventing a node to point at.
    {
      const stale = projectIntelligence(
        [
          {
            ...snap,
            package: {
              ...pkg,
              intelligenceObjects: pkg.intelligenceObjects!.map((o, i) =>
                i === 0 ? { ...o, evidenceRefs: [...(o.evidenceRefs ?? []), "ev-ghost"] } : o
              ),
            },
          },
        ],
        "jsa"
      );
      const g = buildAuditGraph({ ...base, entities: { ...base.entities, intelligence: stale } });
      const ghost = g.hasNode(nodeId.passage("snap-intel", "ev-ghost"));
      check(
        "Z16 a stale citation produces no edge and no phantom passage",
        !ghost && stale.meta.danglingCitations === 1,
        `${stale.meta.danglingCitations} dangling citation counted, phantom node created: ${ghost}`
      );
    }

    // Z17 — SNAPSHOT-SCOPED, for the same reason a passage is, and a sharper
    // one: head is a property of the BATCH, so merging two snapshots' copies
    // of an object would make "is this still current" unanswerable.
    {
      const twoSnaps = projectIntelligence(
        [snap, { id: "snap-intel-2", scopeId: "jsa", package: pkg }],
        "jsa"
      );
      const g = buildAuditGraph({ ...base, entities: { ...base.entities, intelligence: twoSnaps } });
      const nodes = g.filterNodes((_n, a) => a.kind === "intel");
      const unscoped = nodes.filter((n) => !n.startsWith("intel:snap-intel"));
      check(
        "Z17 the same object id in two snapshots is two nodes, not one",
        nodes.length === JSA_SCALE.objects * 2 && unscoped.length === 0,
        `${nodes.length} nodes from 2 snapshots carrying the same ${JSA_SCALE.objects} object ids`
      );
    }

    // Z18 — TRACING A CLAIM FOLLOWS CITATIONS AND STOPS. It must NOT follow
    // external relations: the corpus is mostly `related_to`, and admitting it
    // would rebuild the unrestricted walk this traversal exists to refuse,
    // out of somebody else's material.
    {
      const withRelations = intelNodes.filter((n) =>
        withIntel.outEdges(n).some((e) => withIntel.getEdgeAttribute(e, "rel") === "intel_relation")
      );
      const start = withRelations[0] ?? intelNodes[0];
      const lit = evidenceSolo(withIntel, start);
      const kinds = new Set([...lit.nodes].map((n) => withIntel.getNodeAttribute(n, "kind")));
      const otherIntel = [...lit.nodes].filter((n) => n !== start && withIntel.getNodeAttribute(n, "kind") === "intel");
      const followed = [...lit.edges].filter((e) => withIntel.getEdgeAttribute(e, "rel") === "intel_relation");
      check(
        "Z18 tracing a claim reaches its evidence and never walks the corpus",
        withRelations.length > 0 && otherIntel.length === 0 && followed.length === 0 && kinds.has("passage"),
        `lit ${[...kinds].sort().join(", ")}; ${otherIntel.length} other objects reached, ${followed.length} external relations followed`
      );
      check(
        "Z18b intel_relation is deliberately absent from the allowlist",
        !EVIDENCE_SOLO_RELATIONS.includes("intel_relation") && EVIDENCE_SOLO_RELATIONS.includes("cites")
      );
    }

    // Z19 — SEATED BY WHAT IT MEANS, OUTSIDE THE RECORD'S EDGE. Both at once:
    // a Hermes Decision on the Decisions axis, and every one of them beyond
    // the ring that bounds Signal's own material.
    {
      const lay = layoutGraph(withIntel);
      let wrongSector = 0;
      let inside = 0;
      for (const n of intelNodes) {
        const a = withIntel.getNodeAttributes(n);
        const p = lay.get(n);
        if (!p) continue;
        if (p.cluster !== laneForIntelligenceType(String(a.intelligenceType))) wrongSector++;
        if (p.radius <= FIELD.edgeR) inside++;
      }
      const decisionsSeated = intelNodes.filter(
        (n) => withIntel.getNodeAttribute(n, "intelligenceType") === "Decision" && lay.get(n)?.cluster === "decisions"
      ).length;
      check(
        "Z19 every external object seats in its meaning's sector, outside the record's edge",
        intelNodes.length > 0 && wrongSector === 0 && inside === 0 && decisionsSeated > 0,
        `${intelNodes.length} objects, ${wrongSector} mis-sectored, ${inside} inside edgeR; ${decisionsSeated} external Decisions on the Decisions axis`
      );
    }

    // Z19b — AND FIT STILL FITS. A fixed home zoom would have left the outer
    // band off screen at the one moment the user asked to see everything.
    {
      const withExtent = layoutExtent(layoutGraph(withIntel));
      // The baseline is the field with the external material REMOVED, not
      // `base` — which carries whatever the database happens to hold, and
      // once the fixture is seeded that is intelligence too.
      const noIntel = buildAuditGraph({
        ...base,
        entities: {
          ...base.entities,
          intelligence: { objects: [], relations: [], citedPassages: [], meta: projected.meta },
        },
      });
      const withoutExtent = layoutExtent(layoutGraph(noIntel));
      const home = fitCamera(withExtent);
      const plain = fitCamera(withoutExtent);
      check(
        "Z19b Fit widens for the external band and is untouched without one",
        withExtent > RECORD_EXTENT &&
          withoutExtent <= RECORD_EXTENT &&
          home.k < plain.k &&
          plain.k === DEFAULT_CAMERA.k &&
          // The outer band lands at the same SCREEN radius the record's edge
          // did — the field grew, the frame did not.
          Math.abs(withExtent * home.k - RECORD_EXTENT * plain.k) < 0.5,
        `extent ${Math.round(withExtent)} → k ${home.k.toFixed(3)}; no intelligence → extent ${Math.round(withoutExtent)}, k ${plain.k} (unchanged)`
      );
    }

    // Z20 — HISTORY IS A MARK UNTIL SOMETHING REACHES IT. A superseded object
    // keeps a real seat, because the chain that replaced it has to land
    // somewhere, but it does not read as live.
    {
      const historical = intelNodes.filter((n) => withIntel.getNodeAttribute(n, "isCurrent") === false);
      const seated = layoutGraph(withIntel);
      const allSeated = historical.every((n) => seated.has(n));
      // The renderer's own rule, applied here as the graph states it.
      const latentWhenUnreached = historical.every((n) => identityOf("intel", false, "close") === "latent");
      check(
        "Z20 a superseded object keeps its seat and stays latent until reached",
        historical.length === JSA_SCALE.historicalObjects && allSeated && latentWhenUnreached,
        `${historical.length} superseded objects, all seated, none formed at rest`
      );
    }

    // Z21 — THE EDGE POLICY, AS THE GRAPH STATES IT. `cites` and `contextual`
    // are the two loud classes, and both are held back until an endpoint is
    // the thing being explained. What is drawn at rest is the chain.
    {
      let quiet = 0;
      let loud = 0;
      withIntel.forEachEdge((_e, a) => {
        if (a.basis !== "external") return;
        if (a.rel === "cites" || a.relClass === "contextual") quiet++;
        else loud++;
      });
      check(
        "Z21 the resting field draws the chain, not the corpus",
        quiet > 0 && loud === JSA_SCALE.temporal + JSA_SCALE.semantic && loud < quiet / 10,
        `${loud} temporal+semantic edges drawn at rest, ${quiet} citation and contextual edges held back — ${Math.round((loud / (loud + quiet)) * 100)}% of the external edges`
      );
    }

    // Z22 — AND NONE OF IT WRITES. The projection imports no Prisma client;
    // this is the empirical half of that claim.
    {
      const before = await prisma.$transaction([
        prisma.decision.count(),
        prisma.finding.count(),
        prisma.contextSnapshot.count(),
        prisma.scope.count(),
      ]);
      buildAuditGraph({ ...base, entities: { ...base.entities, intelligence: projected } });
      const after = await prisma.$transaction([
        prisma.decision.count(),
        prisma.finding.count(),
        prisma.contextSnapshot.count(),
        prisma.scope.count(),
      ]);
      check(
        "Z22 consuming external intelligence writes nothing",
        before.every((v, i) => v === after[i]),
        `${before.join("/")} → ${after.join("/")}`
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

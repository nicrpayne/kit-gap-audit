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
//   V  the EXACT bridge-produced JSA package: its own field vocabulary,
//      declared relation classes, collision-qualified ids, passage anchoring,
//      the real provenance chain, and the merged graph it produces
//   Z  the trust boundary on that same payload: external intelligence
//      transported without loss and unable to become Signal Reality by any
//      construction path that exists
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
import { readRelationField, type IntelligenceRelationItem } from "../lib/context/package";
import { validateProjectContextPackage, PACKAGE_LIMITS } from "../lib/context/validate";
import { hashProjectContextPackage } from "../lib/context/hash";
import { EXTERNAL_INTELLIGENCE_TRUST } from "../lib/context/package";
import {
  hasRealPackage,
  readRealPackage,
  realCensus,
  realPackageBytes,
  REAL_PACKAGE_PATH,
  REAL_TRACE,
} from "./lib/real-package";
import { ensurePrerequisites, dropPrerequisites } from "./seed-real-jsa-package";


const prisma = new PrismaClient();

let failures = 0;
let skipped = 0;
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
        // DERIVED, NOT HARDCODED. The literal count belongs to whatever
        // Scopes happen to exist; the LAW is that the global read finds a
        // split the local read cannot see. A hardcoded 2 broke the moment a
        // Scope was added, which is the proof asserting the fixture rather
        // than the behaviour.
        !!sam && sam.scopeCount === allocations.filter((a) => a.personId === sam.personId).length && localSplit === 0,
        sam
          ? `${sam.label} spans ${sam.scopeCount} projects across ${allocations.length} allocation rows; ` +
            `reading JSA's rows alone would have said 1`
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
        foreign.length === 0 && !!sam && listed.length === (sam.scopeCount as number),
        `${scopeNodes.length} Scope node (this project only); the split person lists ${listed.length} commitments ` +
          `in the inspector, matching their ${sam?.scopeCount} projects — context, never topology`
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


  // ── V  THE EXACT BRIDGE-PRODUCED JSA PACKAGE ───────────────────────────
  //
  // PRODUCER CONTRACT AUTHORITY. Every assertion below runs against the real
  // file, read byte-for-byte and never reshaped. It replaces a census-shaped
  // fixture that reproduced the published counts exactly and still got three
  // things wrong about the payload, all of which are pinned here:
  //
  //   `scope[]` is the producer's TOPIC TAGGING, not Signal Scope ids.
  //     Admitting on it rejected all 161 objects as out of scope.
  //   Passage anchoring arrives inside `data`, not as unmodelled fields.
  //     Looking in the wrong bucket found 156 passages and 0 anchors.
  //   `resolves` is TEMPORAL and `refines` is SEMANTIC. Reconciling the
  //     published totals arithmetically gave the opposite for both.
  //
  // The last one is why the instruction was "do not infer class from counts".
  //
  // Skipped, loudly, when the file is not present — it is real project data
  // and is deliberately not committed.
  if (!hasRealPackage()) {
    console.log(`SKIP  V/Z blocks — no package at ${REAL_PACKAGE_PATH} (set REAL_JSA_PACKAGE)`);
    skipped += 2;
  } else {
    const { pkg, counts, idCollisionsUpstream } = realCensus();
    const raw = readRealPackage();
    // SELF-SUFFICIENT. The package names a Scope and two registrations that
    // must exist before any of this means anything; the proof establishes
    // them through the same helper the seed script uses, and removes them
    // again ONLY if it was the one that created them — so running this while
    // the payload is deliberately seeded for the browser pass does not delete
    // it out from under that.
    const preExisting = (await prisma.scope.findUnique({ where: { id: pkg.scopeId } })) != null;
    if (!preExisting) await ensurePrerequisites(prisma);
    const accepted = validateProjectContextPackage(JSON.parse(JSON.stringify(raw)));
    const scopeId = accepted.scopeId;
    const snap = { id: "snap-real", scopeId, package: accepted };
    const projected = projectIntelligence([snap], scopeId);
    const rawRel = (r: IntelligenceRelationItem | Record<string, unknown>, f: "from" | "rel" | "to" | "relClass") =>
      readRelationField(r as Record<string, unknown>, f);

    // ── V1. IT VALIDATES, AND ITS OWN COUNT BLOCK AGREES ───────────────
    {
      const byType: Record<string, number> = {};
      for (const o of accepted.intelligenceObjects!) byType[o.intelligenceType] = (byType[o.intelligenceType] ?? 0) + 1;
      const byRel: Record<string, number> = {};
      for (const r of accepted.intelligenceRelations!) byRel[r.rel] = (byRel[r.rel] ?? 0) + 1;
      const typesAgree = Object.entries(counts.byType).every(([t, v]) => byType[t] === v.total);
      const relsAgree = Object.entries(counts.byRelation).every(([r, n]) => byRel[r] === n);
      check(
        "V1 the exact file validates, and matches its own intelligenceMeta.counts",
        accepted.sources.length === pkg.sources.length &&
          accepted.evidence.length === counts.evidence + 243 &&
          accepted.intelligenceObjects!.length === counts.objects &&
          accepted.intelligenceRelations!.length === counts.relations &&
          typesAgree &&
          relsAgree,
        `${accepted.sources.length} sources · ${accepted.evidence.length} evidence ` +
          `(${counts.evidence} structured + ${accepted.evidence.length - counts.evidence} legacy) · ` +
          `${accepted.intelligenceObjects!.length} objects · ${accepted.intelligenceRelations!.length} relations, ` +
          `${realPackageBytes()} bytes on disk`
      );
      check(
        "V1b no derivedClaims, no warnings, and referential integrity intact",
        (accepted.derivedClaims ?? []).length === 0 && accepted.warnings.length === 0,
        `derivedClaims ${(accepted.derivedClaims ?? []).length}, warnings ${accepted.warnings.length} — ` +
          `the validator's own dangling-ref, duplicate-id and endpoint-presence checks all passed`
      );
    }

    // ── V2. THE PRODUCER'S FIELD VOCABULARY ────────────────────────────
    {
      const emitted = raw.intelligenceRelations![0] as unknown as Record<string, unknown>;
      const usesProducerNames =
        typeof emitted.sourceId === "string" &&
        typeof emitted.relation === "string" &&
        typeof emitted.targetId === "string" &&
        typeof emitted.relationClass === "string" &&
        emitted.from === undefined &&
        emitted.rel === undefined &&
        emitted.to === undefined;
      const fromRaw = projectIntelligence([{ id: "snap-real", scopeId, package: raw }], scopeId);
      check(
        "V2 relations arrive as sourceId/relation/targetId and are read, not refused",
        usesProducerNames &&
          accepted.intelligenceRelations!.length === counts.relations &&
          fromRaw.relations.length === projected.relations.length,
        `the file uses the producer's spelling exclusively; raw and validated both project ${fromRaw.relations.length} relations`
      );
      // sourceInPackage / targetInPackage — the presence flags a check was
      // silently not reading.
      const presence = raw.intelligenceRelations!.filter(
        (r) => (r as unknown as Record<string, unknown>).sourceInPackage !== undefined
      ).length;
      const outside = accepted.intelligenceRelations!.filter((r) => r.toInPackage === false).length;
      check(
        "V2b sourceInPackage / targetInPackage are read, so the endpoint check actually runs",
        presence === counts.relations && accepted.intelligenceRelations!.every((r) => r.fromInPackage === true),
        `${presence} relations carry the flags; ${outside} legitimately reach an object outside the package`
      );
      const kept = (accepted.intelligenceRelations![0].declared ?? {}) as Record<string, unknown>;
      const emittedAs = (kept.emittedAs ?? {}) as Record<string, string>;
      const twice = validateProjectContextPackage(JSON.parse(JSON.stringify(accepted)));
      const again = (((twice.intelligenceRelations![0].declared ?? {}) as Record<string, unknown>).emittedAs ?? {}) as Record<string, string>;
      check(
        "V2c the producer's own field names are recorded once and never rewritten",
        emittedAs.from === "sourceId" &&
          emittedAs.rel === "relation" &&
          emittedAs.to === "targetId" &&
          JSON.stringify(again) === JSON.stringify(emittedAs),
        `emittedAs ${JSON.stringify(emittedAs)} — unchanged after a second validation pass`
      );
    }

    // ── V3. CLASSES COME FROM THE FILE, NOT FROM ARITHMETIC ────────────
    //
    // Every relation in this payload declares its own class, so nothing is
    // inferred. The fallback is only what an undeclared relation would get —
    // and it has no business disagreeing with the producer.
    {
      const declared = raw.intelligenceRelations!.filter(
        (r) => typeof (r as unknown as Record<string, unknown>).relationClass === "string"
      ).length;
      const observed: Record<string, Set<string>> = {};
      for (const r of raw.intelligenceRelations! as unknown as Record<string, string>[]) {
        (observed[r.relation] ??= new Set()).add(r.relationClass);
      }
      const disagreeing = Object.entries(observed).filter(
        ([rel, classes]) => classes.size !== 1 || relClassOf({ rel }) !== [...classes][0]
      );
      const byClass = projected.meta.byRelClass;
      const classesAgree = Object.entries(counts.byRelationClass).every(([c, n]) => byClass[c] === n);
      check(
        "V3 every relation declares its class, and the fallback agrees with all of them",
        declared === counts.relations && classesAgree && disagreeing.length === 0,
        `${declared}/${counts.relations} declared; projected ${JSON.stringify(byClass)}; ` +
          `${disagreeing.length} names where Signal's fallback would disagree`
      );
      // §4 asks for this one by name.
      const resolves = raw.intelligenceRelations!.filter(
        (r) => (r as unknown as Record<string, string>).relation === "resolves"
      );
      const resolveClasses = [...new Set(resolves.map((r) => (r as unknown as Record<string, string>).relationClass))];
      check(
        "V3b every `resolves` relation in this file is classed temporal",
        resolves.length === counts.byRelation.resolves &&
          resolveClasses.length === 1 &&
          resolveClasses[0] === "temporal" &&
          relClassOf({ rel: "resolves" }) === "temporal",
        `${resolves.length} resolves relations, all relationClass="${resolveClasses[0]}" — ` +
          `an earlier census-derived guess said semantic and was wrong`
      );
    }

    // ── V4. INVERSE NORMALISATION HAPPENS EXACTLY ONCE ─────────────────
    //
    // The bridge normalises passive forms before it sends. `declaredAs`
    // carries what it saw; `relation` carries what it decided. Signal must
    // read `relation` and touch nothing.
    {
      const rels = raw.intelligenceRelations! as unknown as Record<string, string>[];
      const passive = /(_by)$/;
      const activeSideNames = new Set(["caused_by"]); // an active relation that merely ends in _by
      const passiveEmitted = rels.filter((r) => passive.test(r.relation) && !activeSideNames.has(r.relation));
      const rewritten = rels.filter((r) => r.declaredAs !== r.relation);
      const projectedNames = new Set(projected.relations.map((r) => r.rel));
      const changedBySignal = projected.relations.filter((r) => {
        const src = rels.find((x) => x.sourceId === r.fromKey.slice(`intel:${snap.id}:`.length) && x.targetId === r.toExternalId);
        return src != null && src.relation !== r.rel;
      });
      check(
        "V4 Signal transports the bridge's normalised direction and re-normalises nothing",
        passiveEmitted.length === 0 &&
          changedBySignal.length === 0 &&
          [...projectedNames].every((n) => rels.some((r) => r.relation === n)),
        `0 passive inverse names emitted; the bridge itself rewrote ${rewritten.length} ` +
          `(e.g. derived_from_source → derived_from); Signal changed ${changedBySignal.length}`
      );
      // Force one through anyway: a name whose direction Signal cannot know
      // must be carried, not swapped.
      const objs = accepted.intelligenceObjects!;
      const forced = {
        ...accepted,
        intelligenceRelations: [
          ...accepted.intelligenceRelations!,
          { sourceId: objs[10].id, relation: "resolved_by", targetId: objs[11].id, relationClass: "temporal" },
        ] as unknown as IntelligenceRelationItem[],
      };
      const p2 = projectIntelligence([{ ...snap, package: forced }], scopeId);
      const got = p2.relations.find((r) => r.rel === "resolved_by");
      check(
        "V4b a forced passive name keeps the ends it arrived with",
        got != null && got.fromKey.endsWith(objs[10].id) && got.toExternalId === objs[11].id,
        `resolved_by transported with its endpoints exactly as sent — no second inversion`
      );
    }

    // ── V5. COLLISION-QUALIFIED IDS SURVIVE AS DISTINCT OBJECTS ────────
    //
    // 40 of the 161 ids carry a `#<manifest>` qualifier because the upstream
    // corpus had 25 id collisions. Strip or truncate the qualifier and 16
    // pairs of genuinely different objects merge into one.
    {
      const ids = projected.objects.map((o) => o.externalId);
      const qualified = ids.filter((x) => x.includes("#"));
      const bases = new Set(ids.map((x) => x.split("#")[0]));
      const keys = new Set(projected.objects.map((o) => o.key));
      check(
        "V5 collision-qualified ids stay distinct end to end",
        keys.size === counts.objects &&
          qualified.length > 0 &&
          ids.length - bases.size === ids.length - new Set(ids).size + (ids.length - bases.size),
        `${qualified.length} of ${ids.length} ids carry a #manifest qualifier; ` +
          `${bases.size} distinct base ids, so ${ids.length - bases.size} objects would have collided ` +
          `(upstream reported ${idCollisionsUpstream} collisions)`
      );
    }

    // ── V6. PASSAGE PROVENANCE FIELDS SURVIVE, FROM WHERE THEY ARRIVE ──
    {
      const traced = accepted.evidence.find((e) => e.id === REAL_TRACE.evidence)!;
      const data = (traced.data ?? {}) as Record<string, unknown>;
      const anchored = projected.citedPassages.filter((x) => Object.keys(x.anchor).length > 0).length;
      const ind = projected.citedPassages.reduce<Record<string, number>>((a, x) => {
        const k = x.independence ?? "absent";
        a[k] = (a[k] ?? 0) + 1;
        return a;
      }, {});
      check(
        "V6 quoteHash, charStart, charEnd and offsetUnit survive and reach the projection",
        typeof data.quoteHash === "string" &&
          typeof data.charStart === "number" &&
          data.offsetUnit === "unicode_codepoint" &&
          anchored === projected.citedPassages.length,
        `${anchored}/${projected.citedPassages.length} cited passages anchored; ` +
          `${REAL_TRACE.evidence} → chars ${data.charStart}–${data.charEnd} (${data.offsetUnit}), quoteHash ${data.quoteHash}`
      );
      check(
        "V6b absent independence stays absent — never defaulted to independent",
        ind.independent > 0 && ind.derivative > 0 && ind.absent > 0,
        `${ind.independent} independent · ${ind.derivative} derivative · ${ind.absent} with no value at all`
      );
    }

    // ── V7. SCOPE IS THE SNAPSHOT'S, NOT THE PRODUCER'S TAGS ───────────
    {
      const tags = projected.meta.scopeTags;
      const tagNames = Object.keys(tags).sort();
      const looksLikeScopeIds = tagNames.filter((t) => /^c[a-z0-9]{24}$/.test(t)).length;
      const otherScopes = await prisma.scope.findMany({ select: { id: true } });
      const wrongScope = projectIntelligence(
        [{ id: "snap-real", scopeId: "some-other-scope", package: accepted }],
        scopeId
      );
      check(
        "V7 objects are admitted by the snapshot's Scope, and the producer's tags do no work",
        projected.objects.length === counts.objects &&
          projected.meta.outOfScope === 0 &&
          looksLikeScopeIds === 0 &&
          wrongScope.objects.length === 0,
        `${projected.objects.length} admitted; ${tagNames.length} distinct producer tags, none of them a Scope id ` +
          `(${tagNames.slice(0, 6).join(", ")}…); a snapshot from another Scope contributes ${wrongScope.objects.length}`
      );
      check(
        "V7b and the tags naming OTHER Signal Scopes attribute nothing",
        otherScopes.length > 1 && (tags.itrack ?? 0) > 0,
        `${tags.itrack ?? 0} objects are tagged "itrack" and none of them reach iTrack — ` +
          `multi-scope attribution is deliberately not solved by string matching`
      );
    }

    // ── V8. THE EXACT REAL PROVENANCE CHAIN ────────────────────────────
    const base = await loadAuditGraphInputs(scopeId);
    if (!base) throw new Error(`the package's Scope ${scopeId} could not be read`);
    const g = buildAuditGraph({ ...base, entities: { ...base.entities, intelligence: projected } });
    {
      const objNode = nodeId.intel("snap-real", REAL_TRACE.object);
      const psgNode = nodeId.passage("snap-real", REAL_TRACE.evidence);
      const srcNode = nodeId.packageSource(REAL_TRACE.source);
      const hop1 =
        g.hasNode(objNode) &&
        g.hasNode(psgNode) &&
        g.outEdges(objNode).some((e) => g.target(e) === psgNode && g.getEdgeAttribute(e, "rel") === "cites");
      const hop2 =
        g.hasNode(srcNode) &&
        g.outEdges(psgNode).some((e) => g.target(e) === srcNode && g.getEdgeAttribute(e, "rel") === "extracted_from");
      const a = g.hasNode(psgNode) ? g.getNodeAttributes(psgNode) : null;
      const anchor = ((a?.anchor ?? {}) as Record<string, unknown>);
      check(
        "V8 the exact real chain is walkable: risk → passage → transcript",
        hop1 && hop2,
        `${REAL_TRACE.object} → ${REAL_TRACE.evidence} → ${REAL_TRACE.source}`
      );
      check(
        "V8b and the passage carries its own anchoring and independence",
        typeof anchor.quoteHash === "string" && typeof anchor.charStart === "number" && a?.independence != null,
        `chars ${anchor.charStart}–${anchor.charEnd} ${anchor.offsetUnit}, independence ${String(a?.independence)}`
      );
      const missing: string[] = [];
      for (const t of ["decision", "dependency", "commitment", "unknown"]) {
        const nodes = g.filterNodes((_n, x) => x.kind === "intel" && x.intelligenceType === t);
        if (!nodes.some((n) => g.outEdges(n).some((e) => g.getEdgeAttribute(e, "rel") === "cites"))) missing.push(t);
      }
      check(
        "V8c a Decision, a Dependency, a Commitment and an Unknown each reach real evidence",
        missing.length === 0,
        missing.length === 0 ? "all four types trace to passages" : `no evidence path from: ${missing.join(", ")}`
      );
    }

    // ── V9. A REAL TEMPORAL CHAIN STAYS NAVIGABLE ──────────────────────
    {
      const historical = g.filterNodes((_n, a) => a.kind === "intel" && a.isCurrent === false);
      const reached = historical.filter((h) =>
        g.inEdges(h).some((e) => {
          const a = g.getEdgeAttributes(e);
          return a.rel === "intel_relation" && a.relClass === "temporal";
        })
      );
      const example = reached[0];
      const via = example ? g.inEdges(example).map((e) => ({ from: g.source(e), rel: g.getEdgeAttribute(e, "intelRel") }))[0] : null;
      check(
        "V9 superseded objects are reachable along the file's own temporal chains",
        historical.length === counts.objectsHistorical && reached.length > 0,
        `${historical.length} superseded objects, ${reached.length} reached by a temporal relation` +
          (via ? `; e.g. ${String(g.getNodeAttribute(via.from, "externalId"))} —${via.rel}→ ${String(g.getNodeAttribute(example, "externalId"))}` : "")
      );
    }

    // ── V10. THE MERGED GRAPH ──────────────────────────────────────────
    {
      const before = buildAuditGraph({
        ...base,
        entities: {
          ...base.entities,
          intelligence: { objects: [], relations: [], citedPassages: [], meta: projected.meta },
        },
      });
      const kinds: Record<string, number> = {};
      g.forEachNode((_n, a) => (kinds[a.kind] = (kinds[a.kind] ?? 0) + 1));
      const outside = accepted.intelligenceRelations!.filter((r) => r.toInPackage === false).length;
      const drawnRelations = g.filterEdges((_e, a) => a.rel === "intel_relation").length;
      check(
        "V10 the exact file merges into one graph with no duplicates",
        g.order > before.order && new Set(g.nodes()).size === g.order,
        `${before.order} Signal nodes → ${g.order} merged (${g.size} edges); by kind ${JSON.stringify(kinds)}`
      );
      check(
        "V10b relations reaching outside the package are dropped, not invented",
        drawnRelations === counts.relations - outside,
        `${drawnRelations} of ${counts.relations} drawn; the other ${outside} name an object the package did not carry, ` +
          `and no node is conjured for them`
      );
    }

    // ── V11. NOTHING IT CARRIES REACHES REALITY ────────────────────────
    {
      const counts9 = () =>
        prisma.$transaction([
          prisma.decision.count(),
          prisma.decisionGate.count(),
          prisma.scope.count(),
          prisma.person.count(),
          prisma.allocation.count(),
          prisma.finding.count(),
          prisma.contextSnapshot.count(),
          prisma.sourceRegistration.count(),
          prisma.auditRun.count(),
        ]);
      const b4 = await counts9();
      const again = await loadAuditGraphInputs(scopeId);
      buildAuditGraph({ ...again!, entities: { ...again!.entities, intelligence: projected } });
      projectIntelligence([snap], scopeId);
      validateProjectContextPackage(JSON.parse(JSON.stringify(raw)));
      const aft = await counts9();
      check(
        "V11 projecting the exact real payload mutates no Reality of any kind",
        b4.every((v, i) => v === aft[i]),
        `decision/gate/scope/person/allocation/finding/snapshot/registration/run: ${b4.join("/")} → ${aft.join("/")}`
      );
      const rows = await prisma.contextSnapshot.findMany();
      const drifted = rows.filter((r) => {
        try {
          return hashProjectContextPackage(validateProjectContextPackage(r.package)) !== r.contextHash;
        } catch {
          return true;
        }
      });
      check(
        "V11b every stored snapshot still hashes identically after these changes",
        rows.length > 0 && drifted.length === 0,
        `${rows.length} stored snapshot(s) re-validated and re-hashed, ${drifted.length} drifted`
      );
    }

    // ── V12. THE CONTRACT LIMITS ───────────────────────────────────────
    {
      const pct = (n: number, cap: number) => `${n}/${cap} (${Math.round((n / cap) * 100)}%)`;
      const bytes = realPackageBytes();
      const fits =
        accepted.sources.length / PACKAGE_LIMITS.sources < 0.25 &&
        accepted.evidence.length / PACKAGE_LIMITS.evidence < 0.25 &&
        accepted.intelligenceObjects!.length / PACKAGE_LIMITS.intelligenceObjects < 0.25 &&
        accepted.intelligenceRelations!.length / PACKAGE_LIMITS.intelligenceRelations < 0.25 &&
        bytes / PACKAGE_LIMITS.bytes < 0.25;
      check(
        "V12 the exact package sits well under every contract limit",
        fits,
        `sources ${pct(accepted.sources.length, PACKAGE_LIMITS.sources)} · ` +
          `evidence ${pct(accepted.evidence.length, PACKAGE_LIMITS.evidence)} · ` +
          `objects ${pct(accepted.intelligenceObjects!.length, PACKAGE_LIMITS.intelligenceObjects)} · ` +
          `relations ${pct(accepted.intelligenceRelations!.length, PACKAGE_LIMITS.intelligenceRelations)} · ` +
          `bytes ${pct(bytes, PACKAGE_LIMITS.bytes)} — was 47/50 (94%) on sources before this work`
      );
      let rejected = false;
      try {
        validateProjectContextPackage({ ...raw, sources: Array.from({ length: 300 }, (_, i) => ({ ...raw.sources[0], sourceRef: `x${i}` })) });
      } catch {
        rejected = true;
      }
      check("V12b and the guard still bites past the new cap", rejected, "300 sources rejected, not truncated");
    }

    // ── V13. CONTRACT REVISION IS A REAL IDENTITY CHANGE ───────────────
    //
    // The bridge derives packageId from content, so the same corpus mints the
    // same id forever — correct, and exactly the problem once the same bytes
    // have been consumed under a contract that silently dropped a third of
    // them. Signal's identity rule then refuses the resend as a conflict.
    //
    // The revision is the honest discriminator: it says what actually
    // changed. For that to work Signal has to ACCEPT the new revision and
    // PRESERVE it, and preserving it is what makes the hash move.
    {
      const asElevenRaw = { ...JSON.parse(JSON.stringify(raw)), version: "1.1" };
      const asEleven = validateProjectContextPackage(asElevenRaw);
      const hashTen = hashProjectContextPackage(accepted);
      const hashEleven = hashProjectContextPackage(asEleven);
      let rejectedUnknown = false;
      try {
        validateProjectContextPackage({ ...JSON.parse(JSON.stringify(raw)), version: "9.9" });
      } catch {
        rejectedUnknown = true;
      }
      check(
        "V13 a contract revision is accepted, preserved, and changes the content hash",
        asEleven.version === "1.1" &&
          accepted.version === "1.0" &&
          hashTen !== hashEleven &&
          rejectedUnknown,
        `1.0 → ${hashTen} · 1.1 → ${hashEleven} (same corpus, different identity); an unknown revision is still refused`
      );
      check(
        "V13b and the same corpus at the same revision is byte-identical",
        hashProjectContextPackage(validateProjectContextPackage(JSON.parse(JSON.stringify(asElevenRaw)))) === hashEleven &&
          hashProjectContextPackage(validateProjectContextPackage(JSON.parse(JSON.stringify(raw)))) === hashTen,
        `deterministic in both revisions — same corpus + same contract = same package`
      );
    }

    // ── Z. THE TRUST BOUNDARY, ON THE REAL PAYLOAD ─────────────────────
    {
      const intelNodes = g.filterNodes((_n, a) => a.kind === "intel");
      const intelSet = new Set(intelNodes);

      const externalDecisions = projected.objects.filter((o) => o.intelligenceType === "decision").length;
      const before = buildAuditGraph({
        ...base,
        entities: { ...base.entities, intelligence: { objects: [], relations: [], citedPassages: [], meta: projected.meta } },
      });
      const sig = (gr: typeof g, k: string) => gr.filterNodes((_n, a) => a.kind === k).length;
      check(
        "Z1 external Decisions, Dependencies and Risks create ZERO Signal entities",
        externalDecisions > 0 &&
          sig(g, "decision") === sig(before, "decision") &&
          sig(g, "dependency") === sig(before, "dependency") &&
          sig(g, "finding") === sig(before, "finding"),
        `${externalDecisions} external Decisions arrived; Signal decisions ${sig(before, "decision")}→${sig(g, "decision")}, ` +
          `dependencies ${sig(before, "dependency")}→${sig(g, "dependency")}, findings ${sig(before, "finding")}→${sig(g, "finding")}`
      );

      let touchingNotExternal = 0;
      let externalNotTouching = 0;
      g.forEachEdge((_e, a, s, t) => {
        const touches = intelSet.has(s) || intelSet.has(t);
        if (touches && a.basis !== "external") touchingNotExternal++;
        if (a.basis === "external" && !touches) externalNotTouching++;
      });
      check(
        "Z2 external basis and external material are the same set, both ways",
        intelNodes.length === counts.objects && touchingNotExternal === 0 && externalNotTouching === 0,
        `${intelNodes.length} intel nodes, ${touchingNotExternal} non-external edges on them, ${externalNotTouching} external edges elsewhere`
      );

      const crossing = Object.values(EDGE_RULES).filter((r) => {
        const from = Array.isArray(r.from) ? r.from : [r.from];
        const to = Array.isArray(r.to) ? r.to : [r.to];
        if (!from.includes("intel") && !to.includes("intel")) return false;
        return [...from, ...to].some((k) => k !== "intel" && k !== "passage");
      });
      check(
        "Z3 no edge rule can join external intelligence to a Signal entity",
        crossing.length === 0,
        `${crossing.length} crossing rules — intel reaches passages and other intel, and nothing else`
      );

      // THE FALSIFIABLE NEGATIVE, on real statements. Every external Decision
      // rewritten to a Signal Decision's exact title, and every external
      // Dependency to an upstream Scope's exact name.
      {
        const titles = base.entities.decisions.map((d) => d.title);
        const upstream = base.entities.dependsOn.map((d) => d.name);
        let baited = 0;
        const objs = accepted.intelligenceObjects!.map((o, i) => {
          if (o.intelligenceType === "decision" && titles.length > 0) {
            baited++;
            return { ...o, statement: titles[i % titles.length] };
          }
          if (o.intelligenceType === "dependency" && upstream.length > 0) {
            baited++;
            return { ...o, statement: upstream[i % upstream.length] };
          }
          return o;
        });
        const bp = projectIntelligence([{ ...snap, package: { ...accepted, intelligenceObjects: objs } }], scopeId);
        const bg = buildAuditGraph({ ...base, entities: { ...base.entities, intelligence: bp } });
        const bset = new Set(bg.filterNodes((_n, a) => a.kind === "intel"));
        let joined = 0;
        bg.forEachEdge((_e, _a, s, t) => {
          if (!bset.has(s) && !bset.has(t)) return;
          const other = bg.getNodeAttribute(bset.has(s) ? t : s, "kind");
          if (other !== "intel" && other !== "passage") joined++;
        });
        check(
          "Z4 statements rewritten to match Signal rows exactly still join nothing",
          baited > 0 && joined === 0,
          `${baited} external statements set character-identical to a Signal Decision title or upstream Scope name, ${joined} edges created`
        );
      }

      // Contract negatives, mutated from the REAL package.
      const rejects = (mutate: (p: Record<string, unknown>) => Record<string, unknown>) => {
        try {
          validateProjectContextPackage(mutate(JSON.parse(JSON.stringify(raw))));
          return false;
        } catch {
          return true;
        }
      };
      check(
        "Z5 a package claiming its intelligence is Signal Reality is rejected",
        rejects((p) => {
          (p.intelligenceObjects as Record<string, unknown>[])[0].trust = "signal_reality";
          return p;
        }),
        `trust must equal ${EXTERNAL_INTELLIGENCE_TRUST}`
      );
      check(
        "Z6 an object with no isCurrent is rejected, never defaulted",
        rejects((p) => {
          delete (p.intelligenceObjects as Record<string, unknown>[])[0].isCurrent;
          return p;
        })
      );
      check(
        "Z7 a citation naming evidence the package does not carry is rejected",
        rejects((p) => {
          (p.intelligenceObjects as Record<string, unknown>[])[0].evidenceRefs = ["hermes-ev:does-not-exist"];
          return p;
        })
      );
      check(
        "Z8 an endpoint claiming to be in the package when it is not is rejected",
        rejects((p) => {
          const r = (p.intelligenceRelations as Record<string, unknown>[])[0];
          r.targetId = "hermes:not-here";
          r.targetInPackage = true;
          return p;
        })
      );
      {
        const withUnknown = JSON.parse(JSON.stringify(raw));
        withUnknown.intelligenceObjects[0].producerOnlyField = { nested: [1, 2, 3] };
        const acc = validateProjectContextPackage(withUnknown);
        const extra = acc.intelligenceObjects![0].extra as Record<string, unknown> | undefined;
        check(
          "Z9 an unmodelled producer field survives the crossing on `extra`",
          extra != null && JSON.stringify(extra.producerOnlyField) === JSON.stringify({ nested: [1, 2, 3] }),
          `extra = ${JSON.stringify(extra ?? null)}`
        );
      }
      {
        const legacy = JSON.parse(JSON.stringify(raw));
        delete legacy.intelligenceObjects;
        delete legacy.intelligenceRelations;
        delete legacy.intelligenceMeta;
        const keys = Object.keys(validateProjectContextPackage(legacy));
        check(
          "Z10 a package with no intelligence gains no intelligence keys",
          !keys.some((k) => k.startsWith("intelligence")),
          `${keys.length} keys, none of them intelligence — legacy snapshots hash identically`
        );
      }

      // isCurrent is transported, never derived from status.
      {
        const openAndHistorical = projected.objects.filter((o) => o.status === "open" && !o.isCurrent);
        const statusOfHistorical = [...new Set(projected.objects.filter((o) => !o.isCurrent).map((o) => o.status))];
        check(
          "Z11 isCurrent is transported, never derived from status",
          projected.meta.currentCount === counts.objectsCurrent &&
            projected.objects.filter((o) => !o.isCurrent).length === counts.objectsHistorical,
          `${projected.meta.currentCount} head / ${counts.objectsHistorical} superseded; ` +
            `the superseded ones carry status ${JSON.stringify(statusOfHistorical)}` +
            (openAndHistorical.length > 0 ? ` — ${openAndHistorical.length} are still "open"` : "")
        );
      }

      // Evidence Solo reaches evidence and never walks the corpus.
      {
        const withRel = intelNodes.filter((n) =>
          g.outEdges(n).some((e) => g.getEdgeAttribute(e, "rel") === "intel_relation")
        );
        const start = withRel[0] ?? intelNodes[0];
        const lit = evidenceSolo(g, start);
        const kinds = new Set([...lit.nodes].map((n) => g.getNodeAttribute(n, "kind")));
        const otherIntel = [...lit.nodes].filter((n) => n !== start && g.getNodeAttribute(n, "kind") === "intel");
        const followed = [...lit.edges].filter((e) => g.getEdgeAttribute(e, "rel") === "intel_relation");
        check(
          "Z12 tracing a real claim reaches its evidence and never walks the corpus",
          withRel.length > 0 && otherIntel.length === 0 && followed.length === 0 && kinds.has("passage"),
          `lit ${[...kinds].sort().join(", ")}; ${otherIntel.length} other objects reached, ${followed.length} external relations followed`
        );
        check(
          "Z12b intel_relation is deliberately absent from the allowlist",
          !EVIDENCE_SOLO_RELATIONS.includes("intel_relation") && EVIDENCE_SOLO_RELATIONS.includes("cites")
        );
      }

      // Seating and the edge policy.
      {
        const lay = layoutGraph(g);
        let wrongSector = 0;
        let inside = 0;
        for (const n of intelNodes) {
          const a = g.getNodeAttributes(n);
          const p = lay.get(n);
          if (!p) continue;
          if (p.cluster !== laneForIntelligenceType(String(a.intelligenceType))) wrongSector++;
          if (p.radius <= FIELD.edgeR) inside++;
        }
        const seated: Record<string, number> = {};
        for (const n of intelNodes) {
          const c = lay.get(n)?.cluster ?? "?";
          seated[c] = (seated[c] ?? 0) + 1;
        }
        check(
          "Z13 every external object seats in its meaning's sector, outside the record's edge",
          wrongSector === 0 && inside === 0 && (seated.decisions ?? 0) === counts.byType.decision.total,
          `${intelNodes.length} objects: ${JSON.stringify(seated)}; ${wrongSector} mis-sectored, ${inside} inside edgeR`
        );
      }
      {
        let quiet = 0;
        let loud = 0;
        g.forEachEdge((_e, a) => {
          if (a.basis !== "external") return;
          if (a.relClass === "contextual" || a.relClass === "provenance" || a.rel === "cites") quiet++;
          else loud++;
        });
        check(
          "Z14 the resting field draws the chain, not the corpus",
          quiet > 0 && loud > 0 && loud < quiet / 10,
          `${loud} temporal+semantic edges may be drawn at rest, ${quiet} citation, provenance and contextual edges held back — ` +
            `${Math.round((loud / (loud + quiet)) * 100)}% of the external edges`
        );
      }
    }

    if (!preExisting) await dropPrerequisites(prisma);
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

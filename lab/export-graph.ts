// THE LAB'S ONLY DOOR INTO SIGNAL.
//
// `lab/graph.json` is a real projection of a real customer package. It is
// NOT committed and never will be. What is committed is this script, so the
// fixture can be rebuilt from the database on any machine that has the
// package seeded:
//
//   npx tsx lab/export-graph.ts                          # list the Scopes
//   npx tsx lab/export-graph.ts cmrpatpkv0000ov1ylif2k088 # by id (or by name)
//
// It REFUSES to guess. A dev database holds two Scopes called "JSA" — the
// local demo and the mirror the bridge package names — and they are 72 nodes
// and 407 nodes respectively. Silently taking the first is how a bake-off
// ends up measuring the wrong corpus, so an ambiguous or absent name is an
// error with the ids printed, not a default.
//
// The whole point of the bake-off is that the candidate engines are handed
// Signal's OWN answer and may not re-derive it. So every field below comes
// from a production module — `buildAuditGraph` for the graph, `layoutGraph`
// for the seats, `layoutAggregates` for the groups, `edgeFocusClass` for the
// relationship class, `structuralWeb` for the corpus accounting. This script
// computes nothing of its own. If it ever needs to, that is the signal that
// a prototype has started reinterpreting semantics it was given.

import { prisma } from "../lib/prisma";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import { buildAuditGraph } from "../lib/audit/graph";
import { layoutGraph, layoutAggregates, layoutExtent, FIELD } from "../lib/audit/graphLayout";
import { CLUSTER_ORDER } from "../lib/audit/graphLayout";
import { structuralWeb } from "../lib/audit/structuralWeb";
import { edgeFocusClass } from "../lib/audit/focus";
import { nodeColor, fieldLabel } from "../components/audit/graphTokens";
import { writeFileSync } from "fs";
import { resolve } from "path";

const OUT = resolve(import.meta.dirname, "graph.json");

/** A fixture that is silently wrong is worse than no fixture. Every shape the
    harness depends on is asserted here, loudly, before anything is written. */
function must(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Error(`export-graph: ${what}`);
}

async function main() {
  const wanted = process.argv[2] ?? null;
  const scopes = await prisma.scope.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  must(scopes.length > 0, "no Scopes in this database — seed the package first");
  const table = scopes.map((s) => `    ${s.id.padEnd(28)} ${s.name}`).join("\n");
  if (!wanted) {
    throw new Error(`export-graph: name the Scope to export.\n\n${table}\n`);
  }
  const byId = scopes.find((s) => s.id === wanted);
  const byName = scopes.filter((s) => s.name === wanted);
  if (!byId && byName.length === 0) {
    throw new Error(`export-graph: no Scope "${wanted}".\n\n${table}\n`);
  }
  if (!byId && byName.length > 1) {
    throw new Error(
      `export-graph: "${wanted}" names ${byName.length} Scopes. Pass the id.\n\n` +
        byName.map((s) => `    ${s.id.padEnd(28)} ${s.name}`).join("\n") +
        "\n"
    );
  }
  const scope = byId ?? byName[0];

  const inputs = await loadAuditGraphInputs(scope.id);
  must(inputs, `Scope ${scope.id} loaded no inputs`);

  // `detail` — the whole graph. The prototypes are being asked the hardest
  // version of the question, not a slice of it.
  const graph = buildAuditGraph(inputs);
  const layout = layoutGraph(graph);
  const aggregates = layoutAggregates(layout);
  const web = structuralWeb(graph, layout);

  must(graph.order > 0, "empty graph");
  must(layout.size === graph.order, `layout seats ${layout.size} of ${graph.order} nodes`);

  const nodes = graph.nodes().sort().map((id) => {
    const a = graph.getNodeAttributes(id) as Record<string, unknown>;
    const p = layout.get(id)!;
    return {
      id,
      kind: a.kind,
      lane: (a.lane as string | undefined) ?? null,
      slice: a.slice,
      // `intelligenceType` is the attribute's real name. The prototypes
      // colour by it and pick their "select a Risk" targets from it, so an
      // export that reads a name the graph does not use produces a field of
      // grey observations and a bake-off that never selects a Risk. The
      // assertion below is what makes that impossible to ship twice.
      intelType: (a.intelligenceType as string | undefined) ?? null,
      isCurrent: (a.isCurrent as boolean | undefined) ?? null,
      // What Signal writes on the field, not the raw ref — a passage reads as
      // its excerpt and a source as a meeting. §10 measures whether selected
      // neighbours have room for their labels, so the fixture has to carry
      // the labels the product actually draws, at their real lengths.
      label: fieldLabel(a),
      color: nodeColor(a),
      x: p.x,
      y: p.y,
      r: p.r,
      angle: p.angle,
      radius: p.radius,
    };
  });

  const edges = graph.edges().map((e) => {
    const a = graph.getEdgeAttributes(e) as Record<string, unknown>;
    return {
      id: e,
      source: graph.source(e),
      target: graph.target(e),
      rel: a.rel,
      basis: a.basis,
      intelRel: (a.intelRel as string | undefined) ?? null,
      // The prototypes spring on this. It is Signal's classification, read
      // straight out of the app — a candidate engine never gets to decide
      // what kind of relationship an edge is.
      cls: edgeFocusClass(a as { rel: string; relClass?: string | null }),
    };
  });

  const payload = {
    scope: scope.name,
    counts: { nodes: graph.order, edges: graph.size },
    field: {
      cx: FIELD.cx,
      cy: FIELD.cy,
      coreR: FIELD.coreR,
      clusterR: FIELD.clusterR,
      extent: layoutExtent(layout),
    },
    clusters: [...CLUSTER_ORDER],
    nodes,
    edges,
    aggregates: aggregates.map((g) => ({
      id: g.id,
      kind: g.kind,
      cluster: g.cluster,
      label: g.label,
      count: g.count,
      members: g.members,
      hub: g.hub,
      homogeneous: g.homogeneous,
      // Carried so a prototype can tint a shell the way Signal does without
      // inventing a colour rule of its own.
      tint: g.homogeneous ? nodeColor({ kind: "intel", intelType: g.homogeneous }) : "var(--i-text-soft)",
      x: g.x,
      y: g.y,
      discR: g.discR,
    })),
    // Corpus accounting, so a prototype's edge count can be checked against
    // what Signal actually represents rather than against the raw total.
    web: {
      strands: web.strands.length,
      sheaves: web.sheaves.length,
      represented: web.represented,
      suppressed: web.suppressed,
    },
  };

  must(payload.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)), "a node has no seat");
  must(payload.aggregates.every((g) => g.members.length > 0), "an aggregate has no members");
  // A misspelt attribute name reads as `undefined` and exports as `null`,
  // which looks like a corpus with no typed intelligence rather than like a
  // bug. Every intel node in this corpus has a type, so the absence of one
  // is the failure, not a shrug.
  const untyped = payload.nodes.filter((n) => n.kind === "intel" && !n.intelType);
  must(untyped.length === 0, `${untyped.length} of ${payload.nodes.filter((n) => n.kind === "intel").length} intel nodes exported with no type`);
  must(payload.edges.some((e) => e.cls), "no edge carries a relationship class — the springs would all be zero");

  writeFileSync(OUT, JSON.stringify(payload));
  const cls = payload.edges.reduce<Record<string, number>>((m, e) => {
    const k = String(e.cls);
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
  console.log(`wrote ${OUT}`);
  console.log(`  scope       ${payload.scope}`);
  console.log(`  nodes       ${payload.counts.nodes}`);
  console.log(`  edges       ${payload.counts.edges}  ${JSON.stringify(cls)}`);
  console.log(`  aggregates  ${payload.aggregates.length}`);
  console.log(`  web         represented ${web.represented} + suppressed ${web.suppressed} + membership ${payload.counts.edges - web.represented - web.suppressed} = ${payload.counts.edges}`);
}

main()
  .catch((e) => {
    console.error(String(e?.stack ?? e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

// SIGNAL GRAPH — THE RENDERING BASELINE.
//
// Measures the real projection for EVERY Scope, collapsed and expanded, so
// the renderer decision is made against numbers rather than against a guess
// about how big the graph "probably" gets.
//
// This is Stage 2 of the graph tranche: schema is not locked until the sizes
// are known.
//
//   npx tsx scripts/audit-graph-measure.ts

import { PrismaClient } from "@prisma/client";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import { buildAuditGraph, sliceGraph, measureGraph, SLICE_ORDER, type GraphSlice } from "../lib/audit/graph";

const prisma = new PrismaClient();

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);

async function main() {
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  if (scopes.length === 0) throw new Error("No Scopes. Run prisma/seed-dev.ts first.");

  const rows: {
    id: string;
    name: string;
    bySlice: Record<GraphSlice, { nodes: number; edges: number }>;
    kinds: Record<string, number>;
    rels: Record<string, number>;
    basis: Record<string, number>;
    linearError: string | null;
  }[] = [];

  for (const scope of scopes) {
    const inputs = await loadAuditGraphInputs(scope.id);
    if (!inputs) continue;
    const full = buildAuditGraph(inputs);

    const bySlice = {} as Record<GraphSlice, { nodes: number; edges: number }>;
    for (const s of SLICE_ORDER) {
      const g = sliceGraph(full, s);
      bySlice[s] = { nodes: g.order, edges: g.size };
    }
    const m = measureGraph(full);
    rows.push({
      id: scope.id,
      name: scope.name,
      bySlice,
      kinds: m.nodesByKind,
      rels: m.edgesByRel,
      basis: m.edgesByBasis,
      linearError: inputs.linearError,
    });
  }

  // ── PER SCOPE ────────────────────────────────────────────────────────
  console.log("\n=== SIGNAL GRAPH SIZE BY SCOPE (expanded: every slice) ===\n");
  const KINDS = [
    "reality",
    "scope",
    "lane",
    "checkpoint",
    "finding",
    "work",
    "decision",
    "decisionGate",
    "dependency",
    "intelligence",
    "passage",
    "source",
  ];
  console.log(
    pad("scope", 12) +
      num("nodes", 6) +
      num("edges", 6) +
      "  " +
      KINDS.map((k) => num(k.slice(0, 7), 8)).join("")
  );
  console.log("-".repeat(12 + 12 + 2 + KINDS.length * 8));
  for (const r of rows) {
    console.log(
      pad(r.name, 12) +
        num(r.bySlice.detail.nodes, 6) +
        num(r.bySlice.detail.edges, 6) +
        "  " +
        KINDS.map((k) => num(r.kinds[k] ?? 0, 8)).join("")
    );
  }

  // ── PROGRESSIVE DETAIL ───────────────────────────────────────────────
  console.log("\n=== NODES / EDGES BY SLICE (progressive expansion) ===\n");
  console.log(pad("scope", 12) + SLICE_ORDER.map((s) => num(s, 16)).join(""));
  console.log("-".repeat(12 + SLICE_ORDER.length * 16));
  for (const r of rows) {
    console.log(
      pad(r.name, 12) +
        SLICE_ORDER.map((s) => num(`${r.bySlice[s].nodes}n / ${r.bySlice[s].edges}e`, 16)).join("")
    );
  }

  // ── RELATIONS ────────────────────────────────────────────────────────
  console.log("\n=== EDGES BY RELATION (all Scopes) ===\n");
  const allRels: Record<string, number> = {};
  const allBasis: Record<string, number> = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.rels)) allRels[k] = (allRels[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.basis)) allBasis[k] = (allBasis[k] ?? 0) + v;
  }
  for (const [rel, n] of Object.entries(allRels).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(rel, 20)} ${num(n, 5)}`);
  }
  console.log("\n=== EDGES BY EPISTEMIC BASIS ===\n");
  const basisTotal = Object.values(allBasis).reduce((a, b) => a + b, 0);
  for (const [b, n] of Object.entries(allBasis).sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${pad(b, 20)} ${num(n, 5)}  (${Math.round((n / basisTotal) * 100)}%)`);
  }

  // ── TOTALS AND THE RENDERING BASELINE ────────────────────────────────
  const largest = rows.reduce((a, b) => (b.bySlice.detail.nodes > a.bySlice.detail.nodes ? b : a));
  const combined = rows.reduce(
    (acc, r) => ({
      nodes: acc.nodes + r.bySlice.detail.nodes,
      edges: acc.edges + r.bySlice.detail.edges,
    }),
    { nodes: 0, edges: 0 }
  );
  const combinedCore = rows.reduce(
    (acc, r) => ({ nodes: acc.nodes + r.bySlice.core.nodes, edges: acc.edges + r.bySlice.core.edges }),
    { nodes: 0, edges: 0 }
  );

  console.log("\n=== RENDERING BASELINE ===\n");
  console.log(`  Scopes measured            ${rows.length}`);
  console.log(`  Largest single Scope       ${largest.name} — ${largest.bySlice.detail.nodes} nodes, ${largest.bySlice.detail.edges} edges (expanded)`);
  console.log(`  Largest, default slice     ${largest.name} — ${largest.bySlice.core.nodes} nodes, ${largest.bySlice.core.edges} edges`);
  console.log(`  All Scopes combined        ${combined.nodes} nodes, ${combined.edges} edges (expanded)`);
  console.log(`  All Scopes, default slice  ${combinedCore.nodes} nodes, ${combinedCore.edges} edges`);
  const linearFailures = rows.filter((r) => r.linearError);
  if (linearFailures.length > 0) {
    console.log(`\n  NOTE: Linear unread for ${linearFailures.map((r) => r.name).join(", ")} — work nodes absent, counts are a floor.`);
  }

  // The threshold the prior research set for revisiting Sigma, restated
  // against real numbers rather than against a guess.
  const SIGMA_THRESHOLD = 2000;
  console.log(
    `\n  Sigma revisit threshold    ${SIGMA_THRESHOLD} nodes in one view` +
      `\n  Headroom (largest Scope)   ${(SIGMA_THRESHOLD / largest.bySlice.detail.nodes).toFixed(0)}x` +
      `\n  Headroom (all combined)    ${(SIGMA_THRESHOLD / combined.nodes).toFixed(0)}x`
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

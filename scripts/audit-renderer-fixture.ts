// THE COMPARISON HARNESS'S DATA SOURCE.
//
// Writes the JSA-shaped fixture graph as the EXACT payload /api/audit/graph
// returns, so the renderer shoot can put a full-size field in a browser
// without a database, a Linear key or the bridge.
//
// ── WHY NOT JUST SEED A DATABASE ───────────────────────────────────────
//
// The real bridge-produced package is deliberately not committed — it carries
// real meeting transcript excerpts and named individuals (see
// ./lib/real-package.ts) — so a checkout that has not been handed it cannot
// reproduce the real corpus at all. The always-available stand-in is
// ./lib/jsa-shaped-fixture, built to the real package's SHAPES with invented
// content, and scaled here to the ~438-node census docs/SIGNAL-GRAPH.md names
// as the rendering baseline.
//
// Serving it through the network layer rather than through a dev branch in
// the route keeps the PRODUCT UNTOUCHED by the harness: no env var, no
// fixture import inside app/, nothing that could reach a deployment. The
// shoot fulfils the request; the instrument cannot tell the difference.
//
//   npx tsx scripts/audit-renderer-fixture.ts [outfile]

import { writeFileSync } from "fs";
import { jsaShapedGraphAtScale } from "./lib/jsa-shaped-fixture";
import { exportAuditGraph, measureGraph, EDGE_RULES } from "../lib/audit/graph";

const TARGET_NODES = 438;

const graph = jsaShapedGraphAtScale(TARGET_NODES);
const payload = {
  scopes: [{ id: "jsa", name: "JSA" }],
  scope: { id: "jsa", name: "JSA" },
  slice: "detail",
  measurement: measureGraph(graph),
  graph: exportAuditGraph(graph),
  rules: EDGE_RULES,
  linearError: null,
};

const out = process.argv[2] ?? "/tmp/signal-renderer-graph.json";
writeFileSync(out, JSON.stringify(payload));
console.log(`wrote ${out}  —  ${graph.order} nodes, ${graph.size} edges`);

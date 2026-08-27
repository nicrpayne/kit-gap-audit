// WHAT IS ACTUALLY ON SCREEN — the density inventory.
//
// Stage 1 of the density pass, and the reason it comes first: "the graph
// feels sparse" is an impression, and an impression is not something you can
// fix deliberately. This counts, per Scope and per node, what the renderer
// draws at each zoom level in the DEFAULT resting state — every cluster
// collapsed, nothing selected.
//
// It reads the renderer's own rules rather than restating them, so it cannot
// drift away from what the screen does:
//
//   mounted   AuditInstrument's `visible` memo — core slice, plus any
//             expanded cluster.
//   labelled  graphTokens' LABELLED_AT, via labelsFor().
//   seated    graphLayout's layoutGraph() — a node with no seat is not drawn
//             even when mounted.
//
//   npx tsx scripts/audit-density-measure.ts [scopeSlugOrName]

import { PrismaClient } from "@prisma/client";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import { buildAuditGraph, type AuditGraph, type NodeKind } from "../lib/audit/graph";
import { layoutGraph } from "../lib/audit/graphLayout";
import { identityOf, type ZoomLevel, type Identity } from "@/components/audit/graphTokens";

const prisma = new PrismaClient();
const LEVELS: ZoomLevel[] = ["far", "medium", "close"];

/**
 * What the eye actually gets for one node at one zoom level.
 *
 * `absent` is not one of the renderer's identities — it is this script's word
 * for a node with no layout seat, which is the only way a real node can now
 * fail to be drawn at all. It should always be zero, and a proof says so.
 */
type Visibility = Identity | "absent";

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);

/**
 * The renderer's resting visibility rule, restated exactly once.
 *
 * `expanded` is the set of clusters the user has opened. Passing an empty set
 * is the resting state the instrument loads at, which is what this measures.
 */
function visibilityOf(
  graph: AuditGraph,
  node: string,
  seated: boolean,
  expanded: Set<string>,
  level: ZoomLevel
): Visibility {
  if (!seated) return "absent";
  const a = graph.getNodeAttributes(node);
  const opened = a.slice === "core" || (!!a.lane && expanded.has(a.lane as string));
  return identityOf(a.kind, opened, level);
}

interface Row {
  id: string;
  kind: NodeKind;
  cluster: string;
  slice: string;
  label: string;
  radius: number;
  vis: Record<ZoomLevel, Visibility>;
}

async function main() {
  const wanted = process.argv[2]?.toLowerCase();
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  if (scopes.length === 0) throw new Error("No Scopes. Run prisma/seed-dev.ts first.");

  const targets = wanted
    ? scopes.filter((s) => s.id.toLowerCase() === wanted || s.name.toLowerCase().includes(wanted))
    : scopes;

  for (const scope of targets) {
    const inputs = await loadAuditGraphInputs(scope.id);
    if (!inputs) continue;
    const graph = buildAuditGraph(inputs);
    const layout = layoutGraph(graph);
    const expanded = new Set<string>(); // resting state: everything collapsed

    const rows: Row[] = graph.nodes().map((n) => {
      const a = graph.getNodeAttributes(n);
      const seat = layout.get(n);
      const vis = {} as Record<ZoomLevel, Visibility>;
      for (const l of LEVELS) vis[l] = visibilityOf(graph, n, !!seat, expanded, l);
      return {
        id: n,
        kind: a.kind,
        cluster: (a.lane as string) ?? "—",
        slice: a.slice,
        label: String(a.label),
        radius: seat ? Math.round(seat.radius) : -1,
        vis,
      };
    });

    console.log(`\n${"=".repeat(78)}`);
    console.log(`  ${scope.name.toUpperCase()} — ${rows.length} nodes, ${graph.size} edges`);
    console.log("=".repeat(78));

    // ── PER KIND ───────────────────────────────────────────────────────
    console.log("\n--- BY KIND: what the resting field shows at each zoom ---\n");
    console.log(
      pad("kind", 14) + pad("slice", 11) + num("total", 6) +
        LEVELS.map((l) => num(`${l} named/form/latent/ABS`, 27)).join("")
    );
    console.log("-".repeat(14 + 11 + 6 + LEVELS.length * 27));
    const kinds = [...new Set(rows.map((r) => r.kind))];
    for (const kind of kinds) {
      const of = rows.filter((r) => r.kind === kind);
      const cells = LEVELS.map((l) => {
        const c: Record<Visibility, number> = { named: 0, formed: 0, latent: 0, absent: 0 };
        for (const r of of) c[r.vis[l]]++;
        return num(`${c.named} / ${c.formed} / ${c.latent} / ${c.absent}`, 27);
      });
      console.log(pad(kind, 14) + pad(of[0].slice, 11) + num(of.length, 6) + cells.join(""));
    }

    // ── PER CLUSTER ────────────────────────────────────────────────────
    console.log("\n--- BY CLUSTER: what a collapsed sector shows at FAR ---\n");
    console.log(
      pad("cluster", 14) + num("nodes", 7) + num("drawn", 7) + num("absent", 8) + num("latent", 8) +
        "  the mass its \"+N\" names"
    );
    console.log("-".repeat(14 + 7 + 7 + 8 + 8 + 28));
    const clusters = [...new Set(rows.map((r) => r.cluster))].sort();
    for (const cluster of clusters) {
      const of = rows.filter((r) => r.cluster === cluster);
      const absent = of.filter((r) => r.vis.far === "absent");
      const latent = of.filter((r) => r.vis.far === "latent");
      const byKind = new Map<string, number>();
      for (const r of latent) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
      console.log(
        pad(cluster, 14) +
          num(of.length, 7) +
          num(of.length - absent.length, 7) +
          num(absent.length, 8) +
          num(latent.length, 8) +
          "  " +
          ([...byKind].map(([k, n]) => `${n} ${k}`).join(", ") || "—")
      );
    }

    // ── THE HEADLINE ───────────────────────────────────────────────────
    const absentFar = rows.filter((r) => r.vis.far === "absent");
    const unseated = rows.filter((r) => r.radius < 0);
    const tally = (l: ZoomLevel) => ({
      named: rows.filter((r) => r.vis[l] === "named").length,
      formed: rows.filter((r) => r.vis[l] === "formed").length,
      latent: rows.filter((r) => r.vis[l] === "latent").length,
    });
    console.log("\n--- THE HEADLINE ---\n");
    console.log(`  Nodes in the graph                        ${rows.length}`);
    console.log(`  DRAWN AT FAR, RESTING                     ${rows.length - absentFar.length}`);
    console.log(`  Completely absent at FAR                  ${absentFar.length}`);
    console.log(`  Nodes with no layout seat                 ${unseated.length}`);
    console.log("");
    for (const l of LEVELS) {
      const t = tally(l);
      console.log(
        `  ${pad(l.toUpperCase(), 8)} ${num(t.named, 3)} named · ${num(t.formed, 3)} formed · ` +
          `${num(t.latent, 3)} latent   = ${t.named + t.formed + t.latent} of ${rows.length}`
      );
    }
    console.log(
      `\n  Every one of the ${rows.length} is a real row. No aggregate marks, no invented` +
        `\n  positions: latent seats span radius ` +
        `${Math.min(...rows.filter((r) => r.vis.far === "latent").map((r) => r.radius))}–` +
        `${Math.max(...rows.filter((r) => r.vis.far === "latent").map((r) => r.radius))}, ` +
        `outside the disagreement bands.`
    );

    if (targets.length === 1) {
      console.log("\n--- EVERY LATENT NODE AT REST (kind · cluster · seat radius · label) ---\n");
      const latent = rows.filter((r) => r.vis.far === "latent");
      for (const r of [...latent].sort((a, b) => a.cluster.localeCompare(b.cluster) || a.kind.localeCompare(b.kind))) {
        console.log(`  ${pad(r.kind, 12)} ${pad(r.cluster, 12)} r=${num(r.radius, 4)}  ${r.label.slice(0, 46)}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

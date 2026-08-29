import { PrismaClient } from "@prisma/client";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import { buildAuditGraph } from "../lib/audit/graph";
import { layoutGraph, layoutAggregates, layoutExtent, FIELD } from "../lib/audit/graphLayout";
const prisma = new PrismaClient();
(async () => {
  for (const s of await prisma.scope.findMany()) {
    const inputs = await loadAuditGraphInputs(s.id);
    if (!inputs) continue;
    const g = buildAuditGraph(inputs);
    const l = layoutGraph(g);
    const aggs = layoutAggregates(l);
    console.log(`\n=== ${s.name} ${g.order} nodes · extent ${layoutExtent(l).toFixed(0)} · ${aggs.length} aggregates`);
    for (const a of aggs.sort((x, y) => y.count - x.count).slice(0, 8)) {
      console.log(`   ${a.kind.padEnd(6)} ${String(a.count).padStart(3)} · discR ${a.discR.toFixed(1).padStart(5)} · ${a.label.slice(0, 46)}`);
    }
    // sanity: passage nearest its own hub, euclidean
    let mis = 0, checked = 0;
    const hubs = g.filterNodes((_n, a) => ["source","transcript","notion_page","figma_artifact"].includes(a.kind));
    for (const psg of g.filterNodes((_n, a) => a.kind === "passage")) {
      const own = g.outEdges(psg).filter((e) => g.getEdgeAttribute(e, "rel") === "extracted_from").map((e) => g.target(e))[0];
      if (!own || !l.has(own) || !l.has(psg)) continue;
      checked++;
      const p = l.get(psg)!, o = l.get(own)!;
      const d = Math.hypot(p.x - o.x, p.y - o.y);
      for (const h of hubs) { if (h === own || !l.has(h)) continue;
        const q = l.get(h)!; if (Math.hypot(p.x - q.x, p.y - q.y) < d - 1e-9) { mis++; break; } }
    }
    console.log(`   passages nearest own hub: ${checked - mis}/${checked}`);
    // sector containment
    let outSector = 0, clustered = 0;
    l.forEach((p, id) => {
      const lane = g.getNodeAttribute(id, "lane") as string | undefined;
      if (!lane) return;
      const i = ["decisions","dependencies","capacity","linear","notion","figma","hermes","evidence"].indexOf(lane);
      if (i < 0) return;
      clustered++;
      const base = -90 + i * 45;
      let d = Math.abs(p.angle - base) % 360; if (d > 180) d = 360 - d;
      if (d > 22.5 + 0.6) outSector++;
    });
    console.log(`   inside own sector: ${clustered - outSector}/${clustered}`);
    // intel outside edgeR
    let inside = 0, intel = 0;
    g.forEachNode((n, a) => { if (a.kind !== "intel") return; intel++; if ((l.get(n)?.radius ?? 0) <= FIELD.edgeR) inside++; });
    console.log(`   intel outside edgeR: ${intel - inside}/${intel}`);
    // min separation among passages
    const pts = [...l.entries()].filter(([id]) => g.getNodeAttribute(id, "kind") === "passage").map(([, p]) => p);
    let min = Infinity;
    for (let i = 0; i < Math.min(pts.length, 200); i++) for (let j = i + 1; j < Math.min(pts.length, 200); j++)
      min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    if (pts.length > 1) console.log(`   closest two passages: ${min.toFixed(1)} units (body 8.4)`);
  }
  await prisma.$disconnect();
})();

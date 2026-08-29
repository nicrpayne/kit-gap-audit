import { PrismaClient } from "@prisma/client";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import { buildAuditGraph } from "../lib/audit/graph";
const prisma = new PrismaClient();
(async () => {
  const s = (await prisma.scope.findMany()).find((x) => x.name === "JSA" && x.id.startsWith("cm"))!;
  const g = buildAuditGraph((await loadAuditGraphInputs(s.id))!);
  const byLane = new Map<string, Record<string, number>>();
  g.forEachNode((n, a) => {
    const lane = String(a.lane ?? "—");
    const m = byLane.get(lane) ?? {};
    m[a.kind] = (m[a.kind] ?? 0) + 1;
    byLane.set(lane, m);
  });
  for (const [lane, m] of [...byLane].sort()) console.log(lane.padEnd(14), JSON.stringify(m));
  // passages per source
  const per = new Map<string, number>();
  g.forEachEdge((_e, a, src, tgt) => { if (a.rel === "extracted_from") per.set(tgt, (per.get(tgt) ?? 0) + 1); });
  const counts = [...per.values()].sort((a, b) => b - a);
  console.log("\npassages per source:", counts.join(","));
  console.log("sources with >=4:", counts.filter((c) => c >= 4).length, "· with <4:", counts.filter((c) => c < 4).length);
  // intel per lane per type
  const it = new Map<string, Record<string, number>>();
  g.forEachNode((n, a) => {
    if (a.kind !== "intel") return;
    const lane = String(a.lane);
    const m = it.get(lane) ?? {};
    const t = String(a.intelligenceType);
    m[t] = (m[t] ?? 0) + 1;
    it.set(lane, m);
  });
  console.log("\nintel by lane/type:");
  for (const [lane, m] of [...it].sort()) console.log(" ", lane.padEnd(14), JSON.stringify(m));
  await prisma.$disconnect();
})();

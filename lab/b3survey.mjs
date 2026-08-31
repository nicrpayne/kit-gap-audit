// WHAT IS ACTUALLY IN THIS CORPUS, AND WHERE COULD A BLOOM POSSIBLY MATTER.
//
// A bloom is a local event by construction, so before measuring one it is
// worth knowing how many objects in the JSA package even HAVE a crowded
// neighbourhood. Reporting that honestly is half the answer to §1: if most
// selections have nothing near them, "the topology visibly opens" is true of
// a minority and the tranche should say so rather than picking the one node
// that demos well.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:4400";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
await p.goto(`${BASE}/pb3.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);

const out = await p.evaluate(() => {
  const ns = window.__lab.nodes();
  const gs = window.__lab.groups();
  const near = (a, R) => ns.filter((n) => n !== a && Math.hypot(n.x - a.x, n.y - a.y) < R).length;
  const rows = ns.map((a) => ({
    id: a.id,
    kind: a.kind,
    type: a.intelType ?? null,
    label: String(a.label ?? "").slice(0, 52),
    n60: near(a, 60),
    n120: near(a, 120),
  }));
  return {
    rows,
    groups: gs.map((g) => ({ id: g.id, label: String(g.label).slice(0, 46), count: g.count, r: +g.r.toFixed(1) })),
    kinds: ns.reduce((m, n) => ((m[n.kind] = (m[n.kind] ?? 0) + 1), m), {}),
  };
});

const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * f)];
const n60 = out.rows.map((r) => r.n60);
console.log(`\nnodes ${out.rows.length} · kinds ${JSON.stringify(out.kinds)}\n`);
console.log("HOW CROWDED IS A NODE'S OWN NEIGHBOURHOOD (nodes within 60 world units)");
console.log(`  median ${q(n60, 0.5)} · p75 ${q(n60, 0.75)} · p90 ${q(n60, 0.9)} · max ${Math.max(...n60)}`);
console.log(`  with 0 neighbours within 60: ${n60.filter((x) => x === 0).length} of ${n60.length}`);
console.log(`  with ≥8 within 60:           ${n60.filter((x) => x >= 8).length}`);

console.log("\nTHE TWENTY MOST CROWDED NEIGHBOURHOODS");
for (const r of out.rows.slice().sort((a, b) => b.n60 - a.n60).slice(0, 20))
  console.log(`  ${String(r.n60).padStart(3)} @60  ${String(r.n120).padStart(3)} @120  ${r.kind.padEnd(11)} ${(r.type ?? "").padEnd(24)} ${r.label}`);

console.log("\nCELLS (Signal's own aggregates, plus region catch-alls)");
for (const g of out.groups.slice().sort((a, b) => b.count - a.count))
  console.log(`  ${String(g.count).padStart(3)}  r${String(g.r).padStart(6)}  ${g.id.slice(0, 18).padEnd(19)} ${g.label}`);

await b.close();

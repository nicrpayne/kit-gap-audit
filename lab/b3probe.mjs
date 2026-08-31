// FIRST QUESTION ONLY: does the topology actually open?
//
// One node, four approaches, the same node each time. If `off` and `ab` give
// the same spread then nothing has been built and no amount of further
// measurement will make that untrue.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:4400";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 160)); });
await p.goto(`${BASE}/pb3.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);

const ready = await p.evaluate(() => !!window.__lab?.ready?.());
console.log("ready:", ready);
if (!ready) { await b.close(); process.exit(1); }

// A Risk with real reach, chosen from the corpus rather than hard-coded.
const target = await p.evaluate(() => {
  const ns = window.__lab.nodes();
  const risks = ns.filter((n) => n.intelType === "risk");
  return risks[0]?.id ?? ns.find((n) => n.intelType)?.id ?? ns[1].id;
});
console.log("target:", String(target).slice(0, 70), "\n");

for (const a of ["off", "a", "b", "ab"]) {
  const r = await p.evaluate(
    async ([id, ap]) => {
      window.__lab.select(null);
      await new Promise((r) => setTimeout(r, 1400));
      window.__lab.approach(ap);
      const before = new Map([...window.__lab.positions()].map(([k, v]) => [k, { ...v }]));
      window.__lab.select(id, { silent: true });
      await new Promise((r) => setTimeout(r, 2200));
      const after = window.__lab.positions();
      const ring = window.__lab.rings();
      const moved = (ids) => {
        let s = 0, mx = 0, n = 0;
        for (const i of ids) {
          const x = before.get(i), y = after.get(i);
          if (!x || !y) continue;
          const d = Math.hypot(x.x - y.x, x.y - y.y);
          s += d; mx = Math.max(mx, d); n++;
        }
        return n ? { mean: +(s / n).toFixed(2), max: +mx.toFixed(2), n } : null;
      };
      return {
        approach: ap,
        bloom: window.__lab.bloom(),
        spread: window.__lab.spread(),
        overlap: window.__lab.localOverlap(),
        local: moved(ring.local),
        penumbra: moved(ring.penumbra),
        field: moved(ring.field),
      };
    },
    [target, a]
  );
  const sp = r.spread;
  console.log(
    `${a.padEnd(4)} spread ${sp ? `min ${String(sp.min).padStart(6)} med ${String(sp.median).padStart(6)} max ${String(sp.max).padStart(6)} (R0 ${sp.R0})` : "—".padEnd(40)}`
  );
  console.log(
    `     moved  local ${r.local ? `mean ${String(r.local.mean).padStart(6)} max ${String(r.local.max).padStart(6)} n ${r.local.n}` : "—"}` +
      ` · penumbra ${r.penumbra ? `mean ${r.penumbra.mean} n ${r.penumbra.n}` : "—"}` +
      ` · field ${r.field ? `mean ${r.field.mean} max ${r.field.max} n ${r.field.n}` : "—"}`
  );
  console.log(`     overlap ${r.overlap ? `${r.overlap.pairs} pairs (worst ${r.overlap.worst}) of ${r.overlap.nodes}` : "—"}   bands ${JSON.stringify(r.bloom?.bands ?? null)}\n`);
}
await b.close();

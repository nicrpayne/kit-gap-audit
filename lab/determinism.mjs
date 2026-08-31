// §1 — DETERMINISM, PROVEN BEFORE ANYTHING ELSE.
//
// Two questions, deliberately separated, because the previous "reload drift
// 7.6 / 45.2" conflated them:
//
//   IN-PAGE     ten fresh simulations in ONE page, same seed, same inputs.
//               If these disagree the physics itself is non-deterministic.
//   CROSS-PAGE  a reload — new JS context, new float scheduling, fresh
//               everything. If in-page agrees and this does not, the leak is
//               something the page carries in.
//
// Every node is compared, not a sample, and the tolerance is stated rather
// than assumed: settled coordinates must agree to 1e-6 world units.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:4400";
const PAGE = process.argv[2] ?? "pb2";
const RUNS = Number(process.argv[3] ?? 10);
const TOL = 1e-6;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 140)));
await p.goto(`${BASE}/${PAGE}.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);

/** One fresh run, settled synchronously so wall-clock scheduling cannot
    influence the answer. */
const run = () =>
  p.evaluate(() => {
    window.__lab.rerun();
    window.__lab.settleNow(900);
    return [...window.__lab.positions()].map(([id, q]) => [id, q.x, q.y]);
  });

console.log(`\ndeterminism · ${PAGE} · ${RUNS} fresh in-page runs, tolerance ${TOL}\n`);
const runs = [];
for (let i = 0; i < RUNS; i++) {
  runs.push(await run());
  process.stdout.write(`  run ${i + 1}/${RUNS}\r`);
}
const base = new Map(runs[0].map(([id, x, y]) => [id, [x, y]]));
let worst = 0;
let mismatched = 0;
let worstId = null;
for (let i = 1; i < runs.length; i++) {
  for (const [id, x, y] of runs[i]) {
    const b0 = base.get(id);
    if (!b0) { mismatched++; continue; }
    const d = Math.hypot(b0[0] - x, b0[1] - y);
    if (d > worst) { worst = d; worstId = id; }
    if (d > TOL) mismatched++;
  }
}
console.log(`  IN-PAGE   nodes ${base.size} × ${RUNS - 1} comparisons`);
console.log(`            max displacement ${worst.toExponential(3)}  (worst: ${String(worstId).slice(0, 44)})`);
console.log(`            nodes exceeding tolerance: ${mismatched}`);
console.log(`            ${mismatched === 0 ? "DETERMINISTIC" : "NON-DETERMINISTIC"}\n`);

// CROSS-PAGE: a real reload.
const first = await run();
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const second = await run();
const m2 = new Map(second.map(([id, x, y]) => [id, [x, y]]));
let worst2 = 0, bad2 = 0;
for (const [id, x, y] of first) {
  const q = m2.get(id);
  if (!q) { bad2++; continue; }
  const d = Math.hypot(q[0] - x, q[1] - y);
  worst2 = Math.max(worst2, d);
  if (d > TOL) bad2++;
}
console.log(`  RELOAD    max displacement ${worst2.toExponential(3)} · nodes exceeding tolerance: ${bad2}`);
console.log(`            ${bad2 === 0 ? "DETERMINISTIC" : "NON-DETERMINISTIC"}\n`);

await b.close();
process.exit(mismatched === 0 && bad2 === 0 ? 0 : 1);

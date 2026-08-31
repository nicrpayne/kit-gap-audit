// §12 — THE ACCEPTANCE CAPTURE.
//
// Ten JSA-shaped objects, four states each: REST, SELECTED-BLOOM (mid-ramp,
// where a click either reads as acknowledged or does not), SETTLED, and EXIT.
// Forty frames, one naming scheme, so the sequence can be read down a column
// rather than reasoned about from a table.
//
// The subjects are resolved from the corpus by shape rather than by id, and
// the group blooms are included because §4 and §5 are about opening a CELL,
// which is a different physical event from opening a node.
//
//   node b3shot.mjs                  balanced, ab
//   S=expressive A=b node b3shot.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:4400";
const OUT = process.env.OUT ?? "./b3shots";
const STRENGTH = process.env.S ?? "balanced";
const APPROACH = process.env.A ?? "ab";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 160)));
await page.goto(`${BASE}/pb3.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
await page.evaluate(
  ([s, a]) => {
    window.__lab.strength(s);
    window.__lab.approach(a);
    window.__quiet = async (m = 14000) => {
      const t = performance.now();
      while (performance.now() - t < m) {
        const b = window.__lab.busy();
        if (b.settled && b.alpha < 0.02) return true;
        await new Promise((r) => setTimeout(r, 90));
      }
      return false;
    };
  },
  [STRENGTH, APPROACH]
);

const SUBJECTS = await page.evaluate(() => {
  const ns = window.__lab.nodes();
  const gs = window.__lab.groups();
  const rank = (a) => a.map((n) => ({ n, s: window.__lab.preview(n.id).seats })).sort((x, y) => y.s - x.s).map((x) => x.n);
  const byType = (t) => ns.filter((n) => n.intelType === t);
  const G = (re) => gs.find((g) => re.test(String(g.label)));
  const node = (n, slug, why) => (n ? { kind: "node", id: n.id, slug, why, label: String(n.label).slice(0, 60) } : null);
  const group = (g, slug, why) => (g ? { kind: "group", id: g.id, slug, why, label: `${g.label} (${g.count})` } : null);
  return [
    node(rank(ns.filter((n) => n.kind === "transcript"))[0], "01-transcript-dense", "a transcript and its 26 passages — the densest bloom in the corpus"),
    node(rank(ns.filter((n) => n.kind === "source"))[0], "02-source", "a source artifact and its passages"),
    node(byType("risk")[0], "03-risk", "a Risk — its citations live in another sector"),
    node(byType("decision")[0], "04-decision", "a Decision"),
    node(byType("dependency")[0], "05-dependency", "a Dependency"),
    node(rank(byType("observation"))[0], "06-observation", "the most connected Observation"),
    node(rank(ns.filter((n) => n.kind === "passage"))[0], "07-passage", "a passage — the most numerous object here"),
    node(ns.find((n) => n.kind === "reality"), "08-reality", "Reality, the field's own centre"),
    group(G(/^Risk$/i), "09-group-risk", "the Risk cell, 17 members"),
    group(G(/^Observation$/i), "10-group-observation", "the Observation cell, 59 members"),
    group(gs.filter((g) => g.id.startsWith("agg:src:")).sort((a, b) => b.count - a.count)[0], "11-group-source", "the largest source cell"),
    group(G(/Lucas Sync/i), "12-group-lucas-sync", "§5 — Lucas Sync"),
  ].filter(Boolean);
});

const manifest = [];
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); manifest.push(name); };

for (const s of SUBJECTS) {
  // REST — always framed the same way, so the four states of one subject and
  // the first frames of every subject are comparable.
  await page.evaluate(() => window.__lab.select(null));
  await page.evaluate(() => window.__quiet());
  await page.evaluate(() => window.__lab.fit());
  await page.waitForTimeout(600);
  await shot(`${s.slug}-1-rest`);

  const t0 = Date.now();
  await page.evaluate(
    ([id, kind]) => (kind === "group" ? window.__lab.selectGroup(id) : window.__lab.select(id)),
    [s.id, s.kind]
  );
  // MID-RAMP. 150 ms in — roughly a third of the balanced ramp, which is
  // where the eye decides whether the click landed.
  await page.waitForTimeout(Math.max(0, 150 - (Date.now() - t0)));
  await shot(`${s.slug}-2-bloom`);

  await page.evaluate(() => window.__quiet());
  await page.waitForTimeout(200);
  await shot(`${s.slug}-3-settled`);

  await page.evaluate(() => window.__lab.select(null));
  await page.evaluate(() => window.__quiet());
  await page.waitForTimeout(200);
  await shot(`${s.slug}-4-exit`);

  const m = await page.evaluate((id) => window.__lab.clearance(id), s.kind === "group" ? null : s.id);
  console.log(`  ${s.slug.padEnd(22)} ${s.label}`);
  void m;
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ strength: STRENGTH, approach: APPROACH, subjects: SUBJECTS, frames: manifest }, null, 1));
console.log(`\n${manifest.length} frames → ${OUT}`);
await browser.close();

// EXTERNAL STRUCTURED INTELLIGENCE — THE BROWSER PASS.
//
// Run against the synthetic JSA-scale payload, which must be seeded first:
//
//   npx tsx scripts/seed-intel-fixture.ts
//   node scripts/audit-intelligence-shoot.mjs [outDir]
//   npx tsx scripts/seed-intel-fixture.ts --drop
//
// The fixture takes the JSA graph from 65 nodes to 466, which is the whole
// point: every density, hairball and latency number below is measured on a
// field at the real stated corpus scale rather than on the four-node demo.
// The other suites assert exact counts on unseeded JSA, so this one owns the
// seeded state and puts it back.
//
// WHAT IT DEFENDS:
//
//   1-3   the boundary is VISIBLE — external material reads as external
//         before anything is clicked
//   4-6   the resting field draws the chain, not the corpus
//   7-9   history is a mark until something reaches it
//   10-12 the panel explains the boundary and traces the claim
//   13-16 latency and frame budget at 466 nodes

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/intel-shots";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (!ok) failures++;
};
const measured = {};
const record = (k, v) => {
  measured[k] = v;
  return v;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

const settle = (ms = 450) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1560, 960); await settle(250); };
const fit = async () => { await p.locator('[data-shoot="camera-fit"]').click(); await settle(800); };
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log(`      shot ${n}`); };
const tier = () => p.getAttribute('[data-shoot="signal-graph"]', "data-zoom");
const cam = () => p.evaluate(() => {
  const s = document.querySelector('[data-shoot="signal-graph"]');
  const v = s.viewBox.baseVal;
  return { x: +(v.x + v.width / 2).toFixed(2), y: +(v.y + v.height / 2).toFixed(2), k: +(s.getBoundingClientRect().width / v.width).toFixed(4) };
});
const count = (sel) => p.locator(sel).count();
const inspector = () => p.locator('[data-shoot="graph-inspector"]').innerText();
const zoomTo = async (want) => {
  await p.mouse.move(700, 500);
  for (let i = 0; i < 60 && (await tier()) !== want; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(26); }
  await settle(500);
};
const INTEL = '[data-kind="intel"]';

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(2200);
await park();

// ── 1. THE FIELD ADMITS ITS OWN SIZE ─────────────────────────────────
{
  const nodes = await count('[data-shoot^="node-"]');
  const intel = await count(INTEL);
  const latent = await count(`${INTEL}[data-identity="latent"]`);
  record("nodes", nodes);
  record("intel", intel);
  await shot("01-far-rest");
  check("1. the corpus is on the field, as population", intel === 161 && nodes >= 460, `${intel} external objects among ${nodes} nodes`);
  check("1b. and none of it is claiming identity at rest", latent === intel, `${latent} latent of ${intel}`);
}

// ── 2. IT SITS OUTSIDE THE RECORD'S EDGE ─────────────────────────────
//
// The one structural claim a reader must be able to make without clicking:
// this material is not Signal's. Measured in world coordinates off the
// rendered geometry, not off the layout module.
{
  const radii = await p.evaluate(() => {
    const svg = document.querySelector('[data-shoot="signal-graph"]');
    const pick = (sel) =>
      [...document.querySelectorAll(sel)].map((g) => {
        const c = g.querySelector('[data-shoot="latent-mark"]');
        return c ? Math.hypot(+c.getAttribute("cx") - 700, +c.getAttribute("cy") - 700) : null;
      }).filter((v) => v != null);
    void svg;
    return { intel: pick('[data-kind="intel"]'), own: pick('[data-shoot^="node-"]:not([data-kind="intel"])') };
  });
  const minIntel = Math.min(...radii.intel);
  const maxOwn = Math.max(...radii.own);
  record("band", { minIntel: +minIntel.toFixed(1), maxOwn: +maxOwn.toFixed(1) });
  check(
    "2. every external object sits beyond every Signal node",
    minIntel > maxOwn,
    `external band starts at r=${minIntel.toFixed(0)}; Signal's own material ends at r=${maxOwn.toFixed(0)}`
  );
}

// ── 3. AND FIT ACTUALLY FITS IT ──────────────────────────────────────
{
  await fit();
  const c = await cam();
  const offscreen = await p.evaluate(() => {
    const svg = document.querySelector('[data-shoot="signal-graph"]');
    const r = svg.getBoundingClientRect();
    let out = 0;
    for (const g of document.querySelectorAll('[data-kind="intel"] [data-shoot="latent-mark"]')) {
      const box = g.getBoundingClientRect();
      if (box.left < r.left || box.right > r.right || box.top < r.top || box.bottom > r.bottom) out++;
    }
    return out;
  });
  record("fit", { k: c.k, offscreen });
  check("3. Fit frames the external band rather than cropping it", offscreen === 0 && c.k < 0.72, `k=${c.k}, ${offscreen} objects out of frame`);
  await shot("02-fit");
}

// ── 4. THE RESTING FIELD DRAWS THE CHAIN, NOT THE CORPUS ─────────────
{
  const drawn = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[data-shoot="graph-edges"] path')];
    return { total: e.length, external: e.filter((x) => x.getAttribute("data-basis") === "external").length };
  });
  record("edges.rest", drawn);
  check("4. no external edge is drawn at rest", drawn.external === 0, `${drawn.total} edges on the resting field, ${drawn.external} external`);
}

// ── 5. OPENING THE CORPUS DRAWS ITS CHAIN AND HOLDS BACK ITS NOISE ───
{
  await p.locator('[data-shoot="cluster-toggle-hermes"]').click();
  await settle(1200);
  await park();
  const drawn = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[data-shoot="graph-edges"] path')];
    const ext = e.filter((x) => x.getAttribute("data-basis") === "external");
    const rels = {};
    for (const x of ext) rels[x.getAttribute("data-rel")] = (rels[x.getAttribute("data-rel")] ?? 0) + 1;
    return { total: e.length, external: ext.length, rels };
  });
  record("edges.hermesOpen", drawn);
  await shot("03-hermes-open");
  check(
    "5. an opened corpus draws its chain, and only its chain",
    drawn.external > 0 && (drawn.rels.cites ?? 0) === 0,
    `${drawn.external} external edges drawn (${JSON.stringify(drawn.rels)}); 0 citation strokes`
  );
}

// ── 6. AND THE WHOLE FIELD OPEN IS STILL NOT A HAIRBALL ──────────────
{
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(1600);
  await park();
  const drawn = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[data-shoot="graph-edges"] path')];
    return { total: e.length, external: e.filter((x) => x.getAttribute("data-basis") === "external").length };
  });
  record("edges.allOpen", drawn);
  await shot("04-all-open");
  // 589 relationships exist once membership is excluded. The class policy is
  // what decides how many of them are strokes.
  check(
    "6. with every cluster open the class policy still holds the corpus back",
    drawn.external <= 20,
    `${drawn.total} edges drawn of 589 that exist; ${drawn.external} of them external`
  );
}

// ── 7. HISTORY IS A MARK UNTIL SOMETHING REACHES IT ──────────────────
{
  const state = await p.evaluate(() => {
    const all = [...document.querySelectorAll('[data-kind="intel"]')];
    const latent = all.filter((g) => g.getAttribute("data-identity") === "latent");
    return { all: all.length, latent: latent.length };
  });
  record("historical", state);
  check(
    "7. six superseded objects stay latent while everything else forms",
    state.latent === 6,
    `${state.latent} of ${state.all} still marks with the whole field open — the fixture carries exactly 6 superseded objects`
  );
}

// ── 8. SEARCH REVEALS WHAT IT FINDS, HISTORY INCLUDED ────────────────
{
  await p.locator('[data-shoot="graph-search"]').fill("KE-DEC-0005");
  await settle(900);
  const m = await p.evaluate(() => {
    const hit = [...document.querySelectorAll('[data-kind="intel"][data-matched="true"]')];
    return { n: hit.length, latent: hit.filter((g) => g.getAttribute("data-identity") === "latent").length,
             minOpacity: Math.min(...hit.map((g) => parseFloat(g.getAttribute("opacity") ?? "1"))) };
  });
  await shot("05-search-producer-id");
  check(
    "8. a producer id finds its object, and the object is bright",
    m.n > 0 && m.latent === 0 && m.minOpacity > 0.8,
    `${m.n} matched, ${m.latent} still latent, dimmest ${m.minOpacity}`
  );
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(500);
}

// ── 9. AND FINDS THEM BY WHAT THEY CLAIM ─────────────────────────────
{
  await p.locator('[data-shoot="graph-search"]').fill("access sign-off");
  await settle(900);
  const n = await count('[data-kind="intel"][data-matched="true"]');
  const listed = await p.locator('[data-shoot="search-results"] button').count();
  check("9. search reaches the corpus by statement", n > 100 && listed > 0, `${n} objects matched, ${listed} listed`);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(500);
}

// ── 10. THE PANEL SAYS WHOSE CLAIM THIS IS ───────────────────────────
{
  await p.evaluate(() => {
    document.querySelector('[data-kind="intel"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle(700);
  const text = await inspector();
  await shot("06-inspector");
  check(
    "10. the inspector names it external before anything else",
    text.includes("External intelligence") &&
      text.includes("A claim from outside Signal") &&
      text.includes("external_intelligence") &&
      /not an accepted Signal decision/i.test(text),
    text.split("\n").slice(0, 3).join(" · ")
  );
  check(
    "10b. and reports currentness as a transported fact",
    /Still current/.test(text) && /head of its chain|superseded/i.test(text),
    (text.match(/Still current\n?.*/) ?? ["—"])[0]
  );
}

// ── 11. AN EXTERNAL RELATION IS LABELLED WITH THE PRODUCER'S OWN NAME ─
{
  const selected = await p.evaluate(() => {
    // An object that actually carries a relation, so the connections list has
    // something external in it.
    for (const g of document.querySelectorAll('[data-kind="intel"] g[role="button"]')) {
      const label = g.getAttribute("aria-label") ?? "";
      if (label.includes("Decision")) { g.dispatchEvent(new MouseEvent("click", { bubbles: true })); return label; }
    }
    return null;
  });
  await settle(700);
  const text = await inspector();
  // The panel renders these uppercase; innerText returns the transformed
  // text, so the match must not care.
  const hasExternalChip = /\bEXTERNAL\b/i.test(text);
  await shot("07-inspector-relations");
  check(
    "11. connections carry the producer's vocabulary and the external basis",
    selected != null &&
      hasExternalChip &&
      /supersedes|refines|resolves|reopens|related_to|depends_on|caused_by|contradicts/i.test(text) &&
      /\btemporal\b/i.test(text) &&
      /\bcontextual\b/i.test(text),
    `${(selected ?? "").slice(0, 52)} — producer relation names, external basis and relation class all printed`
  );
}

// ── 12. TRACING A CLAIM REACHES EVIDENCE AND STOPS ───────────────────
{
  const btn = p.locator('[data-shoot="intel-solo"]');
  const present = (await btn.count()) > 0;
  if (present) {
    await btn.click();
    await settle(1000);
    const lit = await p.evaluate(() => {
      const bright = [...document.querySelectorAll('[data-shoot^="node-"]')].filter(
        (g) => parseFloat(g.getAttribute("opacity") ?? "1") > 0.5
      );
      const kinds = {};
      for (const g of bright) kinds[g.getAttribute("data-kind")] = (kinds[g.getAttribute("data-kind")] ?? 0) + 1;
      return { n: bright.length, kinds };
    });
    record("solo", lit);
    await shot("08-trace");
    check(
      "12. tracing lights the claim's own evidence, not the corpus",
      (lit.kinds.intel ?? 0) === 1 && (lit.kinds.passage ?? 0) > 0,
      `${lit.n} nodes lit: ${JSON.stringify(lit.kinds)}`
    );
    await btn.click();
    await settle(500);
  } else {
    check("12. tracing lights the claim's own evidence, not the corpus", false, "no trace control offered");
  }
  await p.keyboard.press("Escape");
  await settle(400);
}

// ── 13-16. WHAT IT COSTS AT 466 NODES ────────────────────────────────
//
// Warm, on a production build, after the field has been sitting open. These
// are the numbers that decide whether custom SVG is still the right renderer.
{
  await fit();
  await park();
  await p.evaluate(() => {
    window.__f = [];
    let last = performance.now();
    const tick = (t) => { window.__f.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  await p.mouse.move(700, 520);
  for (let i = 0; i < 28; i++) { await p.mouse.wheel(0, i % 2 ? 220 : -220); await p.waitForTimeout(30); }
  await p.mouse.down();
  for (let i = 0; i < 26; i++) await p.mouse.move(700 + i * 7, 520 + i * 4);
  await p.mouse.up();
  const f = await p.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__f.slice(3).sort((a, b) => a - b); });
  const q = (n) => f[Math.min(f.length - 1, Math.floor(f.length * n))];
  const frames = record("frames", { n: f.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), over50: f.filter((x) => x > 50).length });
  check("13. pan and zoom hold 60fps with the corpus on screen", frames.median <= 18, `median ${frames.median}ms, p95 ${frames.p95}ms, ${frames.over50} frames over 50ms of ${frames.n}`);
}
{
  const runs = [];
  for (let i = 0; i < 7; i++) {
    const ms = await p.evaluate(async () => {
      const t0 = performance.now();
      document.querySelector('[data-kind="intel"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (let k = 0; k < 240; k++) {
        if (document.querySelector('[data-shoot^="node-"][data-selected="true"]')) return performance.now() - t0;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return -1;
    });
    runs.push(ms);
    await p.keyboard.press("Escape");
    await settle(360);
  }
  runs.sort((a, b) => a - b);
  const v = record("lat.select", { median: Math.round(runs[3]), worst: Math.round(runs[6]) });
  check("14. selecting an external object responds within budget", v.median < 100, `median ${v.median}ms, worst ${v.worst}ms`);
}
{
  const runs = [];
  for (let i = 0; i < 7; i++) {
    const t0 = await p.evaluate(() => performance.now());
    await p.locator('[data-shoot="graph-search"]').fill(i % 2 ? "offline" : "sign-off");
    const t1 = await p.evaluate(async () => {
      for (let k = 0; k < 240; k++) {
        if (document.querySelector('[data-shoot^="node-"][data-matched="true"]')) return performance.now();
        await new Promise((r) => requestAnimationFrame(r));
      }
      return performance.now();
    });
    runs.push(t1 - t0);
    await settle(260);
  }
  runs.sort((a, b) => a - b);
  const v = record("lat.search", { median: Math.round(runs[3]), worst: Math.round(runs[6]) });
  check("15. searching 466 nodes responds within budget", v.median < 150, `median ${v.median}ms, worst ${v.worst}ms`);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(500);
}
{
  // FROM A KNOWN STATE. `expand-all` on an already-expanded field changes
  // nothing, so a poll waiting for the latent count to move runs to its own
  // timeout and reports four seconds of renderer cost that never happened.
  // Measured that exact false reading before this line existed.
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(800);
  const runs = [];
  const trace = [];
  for (let i = 0; i < 6; i++) {
    const before = await count('[data-shoot^="node-"][data-identity="latent"]');
    const t0 = await p.evaluate(() => performance.now());
    await p.locator(i % 2 ? '[data-shoot="collapse-all"]' : '[data-shoot="expand-all"]').click();
    const t1 = await p.evaluate(async (bfr) => {
      for (let k = 0; k < 240; k++) {
        if (document.querySelectorAll('[data-shoot^="node-"][data-identity="latent"]').length !== bfr) return performance.now();
        await new Promise((r) => requestAnimationFrame(r));
      }
      return -1; // nothing moved — a broken measurement, not a slow one
    }, before);
    if (t1 < 0) { check("16. opening the entire field responds within budget", false, "the field did not change state — measurement is not measuring anything"); break; }
    runs.push(t1 - t0);
    trace.push(`${i % 2 ? "collapse" : "expand"} ${Math.round(t1 - t0)}ms`);
    await settle(600);
  }
  runs.sort((a, b) => a - b);
  const v = record("lat.expand", { inOrder: trace, median: Math.round(runs[3]), worst: Math.round(runs[5]) });
  // Promoting ~390 marks at once is the heaviest single interaction on this
  // field, and it is a deliberate, one-shot action rather than something the
  // camera does continuously — so the budget it is held to is the one for a
  // discrete command, not for a frame.
  check("16. opening the entire field responds within budget", v.median < 250, `median ${v.median}ms, worst ${v.worst}ms`);
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(600);
}

await fit();
await park();
await shot("09-rest-final");
await zoomTo("medium");
await shot("10-medium");
await zoomTo("close");
await shot("11-close");
// Dispatched rather than clicked: at close zoom the cluster's own label is
// off-screen, which is the point of being at close zoom.
await p.evaluate(() => {
  document.querySelector('[data-shoot="cluster-toggle-hermes"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await settle(1200);
await park();
await shot("12-hermes-close");

check("17. no page errors during the whole run", errs.length === 0, errs.join(" | "));
console.log(`\nMEASURED ${JSON.stringify(measured, null, 1)}`);
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);

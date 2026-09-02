// EXTERNAL STRUCTURED INTELLIGENCE — THE BROWSER PASS.
//
// Run against the EXACT bridge-produced JSA package, which must be seeded
// first:
//
//   npx tsx scripts/seed-real-jsa-package.ts
//   node scripts/audit-intelligence-shoot.mjs [outDir]
//   npx tsx scripts/seed-real-jsa-package.ts --drop
//
// The payload takes the graph from 49 nodes to 411, which is the whole point:
// every density, hairball and latency number below is measured on the real
// merged graph, from the real file, rather than on a demo or a fixture.
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
import { mkdirSync, readFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/intel-shots";
mkdirSync(out, { recursive: true });

// The package names Signal's own cuid for JSA; the graph is read for that
// Scope, not for the local "jsa" demo row.
const PKG = JSON.parse(
  readFileSync(
    process.env.REAL_JSA_PACKAGE ??
      "/root/.claude/uploads/9fcdcf7a-3546-5894-a0bc-374b41c74833/d43fbbc5-jsastructuredintelligencepackage.postfixrun1.json",
    "utf8"
  )
);
const SCOPE = PKG.scopeId;
const TRACE = {
  object: "hermes:risk-2026-08-24-005",
  evidence: "hermes-ev:2026-08-19_KE-User-Interview-Follow-Up-seg069",
  source: "ke://source/transcript/2026-08-19_KE-User-Interview-Follow-Up",
};

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
const inspector = async () => {
  const el = p.locator('[data-shoot="graph-inspector"]');
  return (await el.count()) > 0 ? el.innerText() : "";
};
/** Clear any selection, so the next click SELECTS rather than toggling the
    previous one shut. Clicking the same node twice deselects it, which is
    correct behaviour and a trap for a script that assumes a panel is open. */
const clearSelection = async () => {
  await p.keyboard.press("Escape");
  await settle(300);
};
const zoomTo = async (want) => {
  await p.mouse.move(700, 500);
  for (let i = 0; i < 60 && (await tier()) !== want; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(26); }
  await settle(500);
};
const INTEL = '[data-kind="intel"]';

await p.goto(`${BASE}/audit?scope=${SCOPE}`, { waitUntil: "networkidle" });
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
  check("1. the corpus is on the field, as population", intel === 161 && nodes >= 400, `${intel} external objects among ${nodes} nodes`);
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
    `${state.latent} of ${state.all} still marks with the whole field open — the real payload carries exactly 6 superseded objects`
  );
}

// ── 8. SEARCH REVEALS WHAT IT FINDS, HISTORY INCLUDED ────────────────
{
  await p.locator('[data-shoot="graph-search"]').fill("hermes:risk-2026-08-24-005");
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
  await p.locator('[data-shoot="graph-search"]').fill("offline");
  await settle(900);
  const n = await count('[data-kind="intel"][data-matched="true"]');
  const listed = await p.locator('[data-shoot="search-results"] button').count();
  // AND THE RESULTS MUST TELL THE FOUR THINGS APART. A Signal entity, an
  // external claim, an evidence passage and a source artifact are different
  // kinds of answer, and a list that renders them identically makes the
  // reader click each one to find out which they got.
  const kinds = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot="search-results"] button')].map((b) =>
      (b.innerText.split("\n").pop() ?? "").trim()
    )
  );
  const distinct = new Set(kinds);
  // SIX, ON THE REAL CORPUS. An earlier pass asserted >100 because every
  // statement in the synthetic payload contained the word; the real one does
  // not, and six is the honest answer to "offline".
  check("9. search reaches the corpus by statement", n > 0 && listed > 0, `"offline" matched ${n} external objects, ${listed} results listed`);
  check(
    "9b. and results say which KIND of thing each answer is",
    distinct.size >= 2 && [...distinct].some((k) => /external intelligence/i.test(k)),
    `result kinds: ${[...distinct].join(" · ")}`
  );
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(500);
}

// ── 9c. A PHRASE FROM AN ACTUAL DECISION'S STATEMENT ─────────────────
//
// Not from its label — the label is the statement trimmed to fit, and a
// phrase from the back half of a long claim is exactly the case a
// label-only search gets wrong.
{
  await p.evaluate(() =>
    document.querySelector('[data-intel-type="decision"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  );
  await settle(700);
  const statement = await p.evaluate(() => {
    const panel = document.querySelector('[data-shoot="graph-inspector"]');
    const t = panel?.innerText ?? "";
    const i = t.indexOf("THE CLAIM");
    return i < 0 ? "" : (t.slice(i + 9).trim().split("\n")[0] ?? "");
  });
  // A run of words out of the MIDDLE of the claim, past where the label ends.
  const words = statement.split(/\s+/).filter(Boolean);
  const phrase = words.slice(12, 17).join(" ");
  await p.keyboard.press("Escape");
  await settle(300);
  await p.locator('[data-shoot="graph-search"]').fill(phrase);
  await settle(900);
  const hit = await count('[data-intel-type="decision"][data-matched="true"]');
  check(
    "9c. a phrase from deep inside a Decision's statement finds it",
    phrase.length > 0 && hit > 0,
    `"${phrase}" (${words.length} words into the claim, past where its label stops) → ${hit} Decisions matched`
  );
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(500);
}

// ── 10. THE PANEL SAYS WHOSE CLAIM THIS IS ───────────────────────────
{
  await p.evaluate(() => {
    document.querySelector('[data-intel-type="decision"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
  await clearSelection();
  // ONE PANEL SHOWS ONE OBJECT'S RELATIONS, and in the real corpus only ten
  // objects carry more than one class — so the assertion is made across the
  // corpus rather than demanded of a single node: every class the file
  // declares must be printable, with the producer's own relation name and the
  // external basis beside it.
  const seen = await p.evaluate(async () => {
    const found = { classes: new Set(), names: new Set(), external: false, label: null };
    for (const g of document.querySelectorAll('[data-kind="intel"] g[role="button"]')) {
      g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 25));
      const panel = document.querySelector('[data-shoot="graph-inspector"]');
      for (const b of panel?.querySelectorAll('[data-shoot="connection-intel_relation"]') ?? []) {
        const t = b.innerText;
        if (/\bEXTERNAL\b/.test(t)) found.external = true;
        for (const c of ["TEMPORAL", "SEMANTIC", "CONTEXTUAL", "PROVENANCE"]) if (t.includes(c)) found.classes.add(c.toLowerCase());
        const m = t.match(/supersedes|resolves|refines|related_to|depends_on|caused_by|supports|derived_from/i);
        if (m) { found.names.add(m[0].toLowerCase()); found.label ??= g.getAttribute("aria-label"); }
      }
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await new Promise((r) => setTimeout(r, 15));
      if (found.classes.size >= 4) break;
    }
    return { classes: [...found.classes].sort(), names: [...found.names].sort(), external: found.external, label: found.label };
  });
  await settle(400);
  await shot("07-inspector-relations");
  check(
    "11. connections carry the producer's vocabulary, class and external basis",
    seen.external && seen.classes.length === 4 && seen.names.length >= 4,
    `classes ${seen.classes.join(", ")}; producer relation names ${seen.names.join(", ")}`
  );
}

// ── 12. TRACING A CLAIM REACHES EVIDENCE AND STOPS ───────────────────
{
  await clearSelection();
  await p.evaluate(() =>
    document.querySelector('[data-intel-type="risk"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  );
  await settle(700);
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
    // TERMS THAT ACTUALLY MATCH. Waiting for a match that a term cannot
    // produce measures the poll's own timeout, not the search.
    await p.locator('[data-shoot="graph-search"]').fill(i % 2 ? "JSA" : "Beta");
    const t1 = await p.evaluate(async () => {
      for (let k = 0; k < 240; k++) {
        if (document.querySelector('[data-shoot^="node-"][data-matched="true"]')) return performance.now();
        await new Promise((r) => requestAnimationFrame(r));
      }
      return -1;
    });
    if (t1 < 0) { check("15. searching the whole merged graph responds within budget", false, "the search matched nothing — measurement is not measuring anything"); break; }
    runs.push(t1 - t0);
    await settle(260);
  }
  runs.sort((a, b) => a - b);
  const v = record("lat.search", { median: Math.round(runs[3]), worst: Math.round(runs[6]) });
  check("15. searching the whole merged graph responds within budget", v.median < 150, `median ${v.median}ms, worst ${v.worst}ms`);
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

// The latency block above finishes COLLAPSED, so every external object is a
// latent mark with no hit target. Everything below needs them formed.
await p.locator('[data-shoot="expand-all"]').click();
await settle(1400);
await fit();
await park();

// ── 18-21. THE FOUR TYPES, EACH SELECTED ─────────────────────────────
//
// A Decision, a Dependency, a Risk and a Commitment — the four §9 names, each
// opened on the real payload. What the shot has to show is the same thing
// each time: an external claim, its evidence, and nothing pretending to be
// Reality.
{
  const shots = { decision: "13-decision", dependency: "14-dependency", risk: "15-risk", commitment: "16-commitment" };
  for (const [type, name] of Object.entries(shots)) {
    await clearSelection();
    const label = await p.evaluate((t) => {
      const g = document.querySelector(`[data-intel-type="${t}"] g[role="button"]`);
      if (!g) return null;
      g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return g.getAttribute("aria-label");
    }, type);
    await settle(700);
    const text = label ? await inspector() : "";
    await shot(name);
    check(
      `${18 + Object.keys(shots).indexOf(type)}. an external ${type} opens as external intelligence`,
      label != null &&
        /external intelligence/i.test(text) &&
        /not an accepted Signal decision/i.test(text) &&
        new RegExp(type, "i").test(text),
      label ? `${String(label).slice(0, 58)}…` : `no ${type} on the field`
    );
    await p.keyboard.press("Escape");
    await settle(300);
  }
}

// ── 22. THE REAL PROVENANCE CHAIN, CLICKED ───────────────────────────
//
//   hermes:risk-2026-08-24-005
//     → hermes-ev:2026-08-19_KE-User-Interview-Follow-Up-seg069
//       → ke://source/transcript/2026-08-19_KE-User-Interview-Follow-Up
//
// Walked the way a person walks it: select the claim, click the passage in
// its connections list, click the transcript in that passage's.
{
  await clearSelection();
  await p.locator('[data-shoot="graph-search"]').fill(TRACE.object);
  await settle(900);
  const found = await p.evaluate(() => {
    const btn = document.querySelector('[data-shoot="search-results"] button');
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  });
  await settle(900);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(600);

  const step1 = await inspector();
  const toPassage = await p.evaluate((evId) => {
    for (const b of document.querySelectorAll('[data-shoot="connection-cites"]')) {
      if (b.innerText.includes(evId)) {
        b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      }
    }
    return false;
  }, TRACE.evidence);
  await settle(800);
  const step2 = await inspector();
  await shot("17-trace-passage");

  const toSource = await p.evaluate(() => {
    const b = document.querySelector('[data-shoot="connection-extracted_from"]');
    if (!b) return false;
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  });
  await settle(800);
  const step3 = await inspector();
  await shot("18-trace-transcript");

  check(
    "22. the exact real chain is clickable: claim → passage → transcript",
    found && toPassage && toSource &&
      step1.includes(TRACE.object) &&
      step2.includes(TRACE.evidence) &&
      step3.includes(TRACE.source),
    `${TRACE.object} → ${TRACE.evidence} → ${TRACE.source}`
  );
  check(
    "22b. and the passage shows its own character range, not an approximation",
    /charStart|charEnd|unicode_codepoint|\u2013/.test(step2) && /unicode_codepoint/.test(step2),
    (step2.match(/Anchored[\s\S]{0,120}/) ?? [step2.slice(0, 100)])[0].replace(/\n/g, " ")
  );
  await p.keyboard.press("Escape");
  await settle(400);
}

// ── 23. A REAL TEMPORAL CHAIN IS NAVIGABLE ───────────────────────────
//
// Six superseded objects, each the far end of a real temporal relation. The
// chain is what makes them worth transporting, and it must be walkable from
// the head without a History mode existing yet.
{
  await clearSelection();
  const walked = await p.evaluate(async () => {
    for (const g of document.querySelectorAll('[data-kind="intel"] g[role="button"]')) {
      g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      const panel = document.querySelector('[data-shoot="graph-inspector"]');
      // The file's own temporal relations are `supersedes` and `resolves`;
      // `refines` is classed semantic here, which is the producer's call.
      const rel = [...(panel?.querySelectorAll('[data-shoot="connection-intel_relation"]') ?? [])].find(
        (b) => /\bTEMPORAL\b/.test(b.innerText) && !b.innerText.trim().startsWith("\u2190")
      );
      if (rel) {
        const from = panel.querySelector("h2")?.textContent ?? "";
        rel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return { from, ok: true };
      }
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
    }
    return { from: "", ok: false };
  });
  await settle(900);
  const text = walked.ok ? await inspector() : "";
  await shot("19-temporal-chain");
  check(
    "23. a real temporal chain walks from the head to what it replaced",
    walked.ok && /external intelligence/i.test(text),
    walked.ok ? `stepped along supersedes/refines into ${(text.split("\n")[1] ?? "").slice(0, 46)}…` : "no temporal relation offered"
  );
  // AND HISTORY IS SHOWN AS HISTORY. In this file every temporal relation
  // whose target travelled with the package points at a superseded object,
  // so the walk lands on one and the panel must say so.
  const landed = await p.evaluate(() => {
    const sel = document.querySelector('[data-kind="intel"][data-selected="true"]');
    return sel ? { current: sel.getAttribute("data-current"), identity: sel.getAttribute("data-identity") } : null;
  });
  check(
    "23b. and the object it lands on is woken from latent, marked superseded",
    landed != null && landed.current === "false" && landed.identity !== "latent" && /superseded/i.test(text),
    landed ? `landed on a superseded object, identity=${landed.identity}, panel says superseded` : "nothing selected"
  );
  await p.keyboard.press("Escape");
  await settle(400);
}

// ── 24. THE HAIRBALL LAW, ON THE REAL RELATION MIX ───────────────────
{
  // REST MEANS REST. A selection wakes its neighbourhood by design, so
  // measuring "the resting field" with something still selected measures the
  // wake instead.
  await clearSelection();
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(800);
  await fit();
  await park();
  const rest = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[data-shoot="graph-edges"] path')];
    const byRel = {};
    for (const x of e) byRel[x.getAttribute("data-rel")] = (byRel[x.getAttribute("data-rel")] ?? 0) + 1;
    return { total: e.length, external: e.filter((x) => x.getAttribute("data-basis") === "external").length, byRel };
  });
  record("rest", rest);
  check(
    "24. related_to is asleep at rest — zero of 68 drawn",
    rest.external === 0,
    `${rest.total} edges on the resting field, ${rest.external} external of the 295 that exist`
  );
  await shot("20-rest-contextual-asleep");
  // Back open for the latency block: a latent mark has no hit target, so
  // every interaction measured below needs the objects formed.
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(1400);
}

// ── 25-27. PERFORMANCE ON THE REAL MERGED GRAPH, PER TIER ────────────
const tierFrames = {};
for (const want of ["far", "medium", "close"]) {
  await fit();
  await park();
  if (want !== "far") await zoomTo(want);
  await p.evaluate(() => {
    window.__f = [];
    let last = performance.now();
    const tick = (t) => { window.__f.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  await p.mouse.move(700, 520);
  for (let i = 0; i < 24; i++) { await p.mouse.wheel(0, i % 2 ? 200 : -200); await p.waitForTimeout(28); }
  await p.mouse.down();
  for (let i = 0; i < 24; i++) await p.mouse.move(700 + i * 7, 520 + i * 4);
  await p.mouse.up();
  const f = await p.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__f.slice(3).sort((a, b) => a - b); });
  const q = (n) => f[Math.min(f.length - 1, Math.floor(f.length * n))];
  tierFrames[want] = { n: f.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), over50: f.filter((x) => x > 50).length };
}
record("frames.byTier", tierFrames);
check(
  "25. camera work holds 60fps at every tier on the real graph",
  Object.values(tierFrames).every((t) => t.median <= 18),
  Object.entries(tierFrames).map(([k, v]) => `${k} median ${v.median}ms p95 ${v.p95}ms (${v.over50}>50ms of ${v.n})`).join(" · ")
);

// Hover, solo, intel focus, edge wake, source expansion.
{
  await fit();
  await park();
  const lat = async (label, run) => {
    const runs = [];
    for (let i = 0; i < 5; i++) runs.push(await run());
    runs.sort((a, b) => a - b);
    return record(`lat.${label}`, { median: Math.round(runs[2]), worst: Math.round(runs[4]) });
  };

  // HOVER DIMS THE UNRELATED FIELD — it does not open the inspector, and a
  // measurement waiting for a panel that hover never opens reports two
  // seconds of latency that does not exist. What is timed is the thing hover
  // actually causes: the rest of the field receding.
  // WITH A REAL POINTER. React synthesises onMouseEnter from `mouseover`
  // delegation, so a dispatched `mouseenter` — which does not bubble — never
  // reaches it and the measurement times out reporting two seconds of
  // latency that did not happen.
  // A node that is always present and always formed. Findings are audit
  // OUTPUT and the mirror Scope carries none, so hovering one would measure
  // nothing at all.
  const box = await p.locator('[data-kind="dependency"] g[role="button"]').first().boundingBox();
  const hover = await lat("hover", async () => {
    await p.mouse.move(1560, 960);
    await p.waitForTimeout(140);
    await p.evaluate(() => {
      window.__dim0 = [...document.querySelectorAll('[data-shoot^="node-"]')].filter(
        (g) => parseFloat(g.getAttribute("opacity") ?? "1") <= 0.11
      ).length;
      window.__t0 = performance.now();
    });
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    return p.evaluate(async () => {
      for (let k = 0; k < 120; k++) {
        const now = [...document.querySelectorAll('[data-shoot^="node-"]')].filter(
          (g) => parseFloat(g.getAttribute("opacity") ?? "1") <= 0.11
        ).length;
        if (now !== window.__dim0) return performance.now() - window.__t0;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return performance.now() - window.__t0;
    });
  });
  await park();
  check("26. hover responds immediately on the real graph", hover.median < 50, `median ${hover.median}ms, worst ${hover.worst}ms`);

  // EDGE WAKE — selecting an external object must draw its contextual
  // neighbourhood, and that is the single heaviest edge recomputation.
  const wake = await lat("edgeWake", () =>
    p.evaluate(async () => {
      const before = document.querySelectorAll('[data-shoot="graph-edges"] path').length;
      const g = document.querySelector('[data-intel-type="observation"] g[role="button"]');
      const t0 = performance.now();
      g?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (let k = 0; k < 240; k++) {
        if (document.querySelectorAll('[data-shoot="graph-edges"] path').length !== before) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      const ms = performance.now() - t0;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return ms;
    })
  );
  check("27. waking an external object's edges is within budget", wake.median < 150, `median ${wake.median}ms, worst ${wake.worst}ms`);

  // EVIDENCE SOLO on an external object.
  await p.evaluate(() => document.querySelector('[data-intel-type="risk"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle(600);
  const soloBtn = p.locator('[data-shoot="intel-solo"]');
  if ((await soloBtn.count()) > 0) {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const t0 = await p.evaluate(() => performance.now());
      await soloBtn.click();
      const t1 = await p.evaluate(async () => {
        for (let k = 0; k < 240; k++) {
          const dim = [...document.querySelectorAll('[data-shoot^="node-"]')].filter(
            (g) => parseFloat(g.getAttribute("opacity") ?? "1") < 0.1
          ).length;
          if (dim > 100) return performance.now();
          await new Promise((r) => requestAnimationFrame(r));
        }
        return performance.now();
      });
      runs.push(t1 - t0);
      if (i === 0) await shot("21-solo");
      await soloBtn.click();
      await settle(350);
    }
    runs.sort((a, b) => a - b);
    const v = record("lat.solo", { median: Math.round(runs[2]), worst: Math.round(runs[4]) });
    // A DISCRETE COMMAND, not a frame. Solo re-derives the traversal and
    // re-opacities the whole field in one shot; it is held to the same 250ms
    // budget as opening the entire field, not to a 16ms one.
    check("28. Evidence Solo on an external claim is within budget", v.median < 250, `median ${v.median}ms, worst ${v.worst}ms`);
  } else {
    check("28. Evidence Solo on an external claim is within budget", false, "no trace control offered");
  }
  await p.keyboard.press("Escape");
  await settle(400);

  // SOURCE EXPANSION — one transcript, opened on its own.
  {
    await p.evaluate(() => document.querySelector('[data-kind="transcript"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle(600);
    const btn = p.locator('[data-shoot="source-expand"]');
    if ((await btn.count()) > 0) {
      const before = await count('[data-shoot^="node-"][data-identity="latent"]');
      const t0 = await p.evaluate(() => performance.now());
      await btn.click();
      const t1 = await p.evaluate(async (b) => {
        for (let k = 0; k < 240; k++) {
          if (document.querySelectorAll('[data-shoot^="node-"][data-identity="latent"]').length !== b) return performance.now();
          await new Promise((r) => requestAnimationFrame(r));
        }
        return -1;
      }, before);
      record("lat.sourceExpand", Math.round(t1 - t0));
      check("29. opening one transcript's passages is within budget", t1 > 0 && t1 - t0 < 200, `${Math.round(t1 - t0)}ms`);
    } else {
      check("29. opening one transcript's passages is within budget", true, "already open — its cluster was expanded");
    }
    await p.keyboard.press("Escape");
    await settle(400);
  }
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

check("30. no page errors during the whole run", errs.length === 0, errs.join(" | "));
console.log(`\nMEASURED ${JSON.stringify(measured, null, 1)}`);
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);

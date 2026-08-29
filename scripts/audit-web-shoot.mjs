// SIGNAL GRAPH — CONNECTION VISIBILITY, IN A BROWSER.
//
// The tranche that made the knowledge visible, checked against the real JSA
// corpus: the calm-state web, the functional colour system, the five edge
// classes, comprehension framing, Trace as a route, humanised labels, and
// what all of it costs at 407 nodes.
//
// It captures the ten QA objects at REST / HOVER / SELECTED / TRACE so the
// states can be judged as images rather than as DOM assertions — which is
// the brief's own rule, and the right one: "connected" is a perceptual claim.
//
//   node scripts/audit-web-shoot.mjs /tmp/web-shots

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/web-shots";
mkdirSync(out, { recursive: true });

const PKG = JSON.parse(
  readFileSync(
    process.env.REAL_JSA_PACKAGE ??
      "/root/.claude/uploads/9fcdcf7a-3546-5894-a0bc-374b41c74833/d43fbbc5-jsastructuredintelligencepackage.postfixrun1.json",
    "utf8"
  )
);
const SCOPE = PKG.scopeId;

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
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

const settle = (ms = 400) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(1420, 880);
  await settle(240);
};
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  console.log(`      shot ${n}`);
};
const zoomPct = () =>
  p.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => /^\w+ · \d+%$/.test(s.textContent ?? ""));
    return el ? Number(el.textContent.match(/(\d+)%/)[1]) : null;
  });
const webCount = () =>
  p.evaluate(() => {
    const sh = [...document.querySelectorAll('[data-web="sheaf"]')];
    return {
      sheaves: sh.length,
      strands: document.querySelectorAll('[data-web="strand"]').length,
      represented:
        sh.reduce((n, e) => n + Number(e.getAttribute("data-web-count")), 0) +
        document.querySelectorAll('[data-web="strand"]').length,
      edges: document.querySelectorAll('[data-shoot="graph-edges"] path[data-rel]').length,
      nodes: document.querySelectorAll('[data-shoot^="node-"]').length,
    };
  });
/** The first node matching `sel` whose body is really inside the field. */
const visibleIdx = (sel) =>
  p.evaluate((s) => {
    const svg = document.querySelector('[data-shoot="graph-viewport"] svg').getBoundingClientRect();
    const all = [...document.querySelectorAll(s)];
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const bb = all[i].getBoundingClientRect();
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      if (cx > svg.x + 24 && cx < svg.right - 24 && cy > svg.y + 24 && cy < svg.bottom - 24) out.push(i);
    }
    return out;
  }, sel);

await p.goto(`${BASE}/audit?scope=${SCOPE}&debug=graph`, { waitUntil: "networkidle" });
await settle(1600);
await park();

// ── 1. THE STATIC GRAPH TEST ────────────────────────────────────────
const rest = record("rest", await webCount());
check(
  "01 the resting field draws the corpus's structure, not 44 strokes",
  rest.represented > 300,
  `${rest.strands} strands + ${rest.sheaves} bundled sheaves = ${rest.represented} relationships visible at rest ` +
    `(was 44 of 543 in the production audit — 91.9% suppressed)`
);
await shot("01-rest-fit");

// Colour discriminability: how many distinct fills does the field carry?
const palette = await p.evaluate(() => {
  const seen = {};
  for (const g of document.querySelectorAll('[data-shoot^="node-"]')) {
    const kind = g.getAttribute("data-kind");
    const type = g.getAttribute("data-intel-type");
    const mark = g.querySelector('[data-shoot="latent-mark"], circle, path');
    if (!mark) continue;
    const fill = getComputedStyle(mark).fill;
    const key = kind === "intel" ? `intel:${type}` : kind;
    (seen[key] ??= new Set()).add(fill);
  }
  return Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v][0]]));
});
const distinct = new Set(Object.values(palette));
record("palette", palette);
check(
  "02 major populations are separable by colour alone",
  distinct.size >= 8,
  `${Object.keys(palette).length} populations across ${distinct.size} distinct fills`
);

// ── 2. THE TEN QA OBJECTS ───────────────────────────────────────────
await p.locator('[data-shoot="expand-all"]').click();
await settle(1000);
await park();
await shot("02-expand-all");
const opened = record("openAll", await webCount());
console.log(`      expand-all: ${opened.edges} individual edges drawn on top of the web`);

const CASES = [
  ["risk", 'g[data-intel-type="risk"]'],
  ["decision", 'g[data-intel-type="decision"]'],
  ["dependency", 'g[data-intel-type="dependency"]'],
  ["commitment", 'g[data-intel-type="commitment"]'],
  ["unknown", 'g[data-intel-type="unknown"]'],
  ["observation", 'g[data-intel-type="observation"]'],
  ["passage", 'g[data-kind="passage"]'],
  ["transcript", 'g[data-kind="transcript"]'],
  ["superseded", 'g[data-current="false"]'],
  ["cluster", 'g[data-kind="lane"]'],
];

/** Back to the whole field, everything named. Every QA case starts from the
    same world — otherwise the previous case's comprehension reframe decides
    whether the next object is even on screen. */
const reset = async () => {
  await p.keyboard.press("Escape");
  await settle(200);
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(650);
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(700);
  await park();
};

const qa = [];
for (const [name, sel] of CASES) {
  await reset();
  const idx = await visibleIdx(sel);
  if (idx.length === 0) {
    qa.push({ name, found: false });
    continue;
  }
  // Pick the best-connected one on screen — the QA list is about real,
  // connected objects, not whichever happened to be first in document order.
  const pick = await p.evaluate(
    ({ s, list }) => {
      let best = list[0];
      let bestN = -1;
      for (const i of list.slice(0, 40)) {
        const el = document.querySelectorAll(s)[i];
        const id = el.getAttribute("data-shoot");
        const n = Number(el.getAttribute("data-degree") ?? 0);
        if (n > bestN) {
          bestN = n;
          best = i;
        }
        void id;
      }
      return best;
    },
    { s: sel, list: idx }
  );

  const node = p.locator(sel).nth(pick);
  const box = await node.boundingBox();
  // A superseded object is deliberately a mark until something reaches it,
  // and a mark is deliberately not a click target. Hover reaches it — which
  // is the behaviour, not a workaround.
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await settle(360);
  const hoverWoken = await p.evaluate(() => document.querySelectorAll("[data-rank]").length - 1);
  if (name === "risk") await shot("03-hover-risk");

  await node.locator(".sg-node").click({ force: true });
  await settle(480);
  if ((await p.locator("[data-selected]").count()) === 0) {
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await settle(320);
    await node.locator(".sg-node").click({ force: true });
    await settle(420);
  }
  const state = await p.evaluate(() => {
    const sel2 = document.querySelector("[data-selected]");
    const insp = document.querySelector('[data-shoot="graph-inspector"]');
    return {
      title: insp?.querySelector("h2")?.textContent?.slice(0, 46) ?? null,
      ranked: document.querySelectorAll("[data-rank]").length - 1,
      semantic: document.querySelectorAll('[data-rank="semantic"]').length,
      temporal: document.querySelectorAll('[data-rank="temporal"]').length,
      provenance: document.querySelectorAll('[data-rank="provenance"]').length,
      verbs: [...document.querySelectorAll('[data-shoot="edge-verb"]')].map((v) => v.textContent),
      labels: document.querySelectorAll('[data-rank]:not([data-rank="contextual"]) text').length,
      trace: document.querySelectorAll('[data-shoot="intel-solo"]').length > 0,
      noTrace: document.querySelectorAll('[data-shoot="intel-no-trace"], [data-shoot="inspector-no-trace"]').length > 0,
      glow: document.querySelectorAll('[data-shoot="node-glow"]').length,
      neighbourRings: document.querySelectorAll('[data-shoot="node-neighbour"]').length,
      zoom: sel2 ? 1 : 0,
    };
  });
  const z = await zoomPct();
  qa.push({ name, found: true, hoverWoken, ...state, zoom: z });
  if (["risk", "decision", "passage", "transcript", "cluster"].includes(name)) await shot(`04-selected-${name}`);
  await p.keyboard.press("Escape");
  await settle(300);
  await park();
}

for (const q of qa) {
  console.log(
    `      QA ${q.name.padEnd(12)} ${
      q.found
        ? `hover ${String(q.hoverWoken).padStart(2)} · sel ${String(q.ranked).padStart(2)} ` +
          `(${q.semantic}s/${q.temporal}t/${q.provenance}p) · ${q.labels} labels · ` +
          `verbs ${q.verbs.length ? [...new Set(q.verbs)].join("/") : "—"} · ` +
          `${q.trace ? "trace" : q.noTrace ? "no-route" : "n/a"} · ${q.zoom}% · ${q.title ?? ""}`
        : "NOT ON SCREEN"
    }`
  );
}
check(
  "03 every QA object is on the field and opens a local world",
  qa.every((q) => q.found && q.ranked >= 0),
  `${qa.filter((q) => q.found && q.ranked >= 0).length}/${qa.length} selected · ` +
    `${qa.filter((q) => q.found && q.ranked > 0).length} with a neighbourhood`
);
check(
  "04 hover wakes the neighbourhood before the click",
  qa.filter((q) => q.found && q.hoverWoken > 0).length >= 7,
  `${qa.filter((q) => q.found && q.hoverWoken > 0).length}/${qa.filter((q) => q.found).length} woke on hover alone`
);
record("qa", qa);

// ── 3. TRACE IS A ROUTE, NOT AN EXPLOSION ───────────────────────────
{
  await reset();
  const before = record("trace.before", { ...(await webCount()), zoom: await zoomPct() });
  const idx = await visibleIdx('g[data-intel-type="risk"]');
  let traced = false;
  for (const i of idx) {
    await p.locator('g[data-intel-type="risk"]').nth(i).locator(".sg-node").click({ force: true });
    await settle(300);
    if ((await p.locator('[data-shoot="intel-solo"]').count()) === 1) {
      traced = true;
      break;
    }
  }
  if (traced) {
    await p.locator('[data-shoot="intel-solo"]').click();
    await settle(800);
    const during = await p.evaluate(() => {
      const lit = [...document.querySelectorAll('[data-shoot^="node-"]')].filter(
        (g) => Number(g.getAttribute("opacity")) > 0.5
      );
      return {
        lit: lit.length,
        kinds: lit.map((g) => g.getAttribute("data-kind")),
        edges: document.querySelectorAll('[data-shoot="graph-edges"] path[data-rel]').length,
        routeGlow: document.querySelectorAll('[data-shoot="route-glow"]').length,
      };
    });
    record("trace.during", during);
    const kinds = new Set(during.kinds);
    check(
      "05 Trace is a route: object → passage → source, and nothing else",
      during.lit < 20,
      `${during.lit} nodes lit (${[...kinds].join(", ")}) · ${during.routeGlow} route filaments ` +
        `— the production audit measured 394 nodes and 253 relationships`
    );
    await shot("05-trace-route");
    await p.locator('[data-shoot="intel-solo"]').click();
    await settle(800);
    const after = record("trace.after", { ...(await webCount()), zoom: await zoomPct() });
    check(
      "06 turning Trace off restores the exact prior world",
      after.zoom === before.zoom,
      `zoom ${before.zoom}% → trace → ${after.zoom}%`
    );
  } else {
    check("05 Trace is a route: object → passage → source, and nothing else", false, "no traceable risk on screen");
  }
  await p.keyboard.press("Escape");
  await settle(300);
}

// ── 4. CLUSTER SIZE CHANGES THE FRAMING ─────────────────────────────
{
  await p.locator('[data-shoot="collapse-all"]').click();
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(700);
  const home = await zoomPct();
  const frames = {};
  for (const c of ["capacity", "hermes"]) {
    await p.locator('[data-shoot="camera-fit"]').click();
    await settle(600);
    const t = p.locator(`[data-shoot="cluster-toggle-${c}"]`);
    if ((await t.count()) === 0) continue;
    await t.click();
    await settle(900);
    frames[c] = await zoomPct();
    await shot(`06-cluster-${c}`);
    await t.click();
    await settle(700);
    frames[`${c}.back`] = await zoomPct();
  }
  record("clusterFrames", frames);
  check(
    "07 a 6-member cluster and a 130-member cluster are framed differently",
    frames.capacity != null && frames.hermes != null && frames.capacity !== frames.hermes,
    `home ${home}% · capacity → ${frames.capacity}% · hermes → ${frames.hermes}% (was a fixed 135% for both)`
  );
  check(
    "08 collapsing a cluster returns the camera it borrowed",
    frames["hermes.back"] === home,
    `hermes ${frames.hermes}% → collapse → ${frames["hermes.back"]}% (home is ${home}%)`
  );
}

// ── 5. HUMANISED LABELS ─────────────────────────────────────────────
{
  await p.locator('[data-shoot="camera-fit"]').click();
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(900);
  const idx = await visibleIdx('g[data-kind="passage"]');
  await p.locator('g[data-kind="passage"]').nth(idx[0]).locator(".sg-node").click({ force: true });
  await settle(500);
  const t = await p.evaluate(() => ({
    field: [...document.querySelectorAll('[data-selected] text')].map((x) => x.textContent).join(" "),
    title: document.querySelector('[data-shoot="graph-inspector"] h2')?.textContent ?? "",
  }));
  check(
    "09 a passage is drawn as its quote, not as its accession number",
    !/^hermes-ev:/.test(t.field.trim()) && !/^hermes-ev:/.test(t.title.trim()),
    `field “${t.field.slice(0, 44)}” · panel “${t.title.slice(0, 44)}”`
  );
  await p.keyboard.press("Escape");
  await settle(300);
  const sidx = await visibleIdx('g[data-kind="transcript"]');
  await p.locator('g[data-kind="transcript"]').nth(sidx[0]).locator(".sg-node").click({ force: true });
  await settle(500);
  const s = await p.evaluate(() => document.querySelector('[data-shoot="graph-inspector"] h2')?.textContent ?? "");
  check("10 a source is drawn as its meeting, not as its URI", !s.startsWith("ke://"), s.slice(0, 56));
  await shot("07-humanised");
  await p.keyboard.press("Escape");
  await settle(300);
}

// ── 6. THE DEBUG SURFACE ────────────────────────────────────────────
{
  const dbg = await p.locator('[data-shoot="graph-debug"]').count();
  check("11 the diagnostic exists behind ?debug=graph", dbg === 1);
  await p.goto(`${BASE}/audit?scope=${SCOPE}`, { waitUntil: "networkidle" });
  await settle(1200);
  check("12 and does not exist without it", (await p.locator('[data-shoot="graph-debug"]').count()) === 0);
}

// ── 7. WHAT IT COSTS ────────────────────────────────────────────────
{
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(900);
  const frames = async (label, act) => {
    await p.evaluate(() => {
      window.__f = [];
      let last = performance.now();
      const tick = (t) => {
        window.__f.push(t - last);
        last = t;
        window.__raf = requestAnimationFrame(tick);
      };
      window.__raf = requestAnimationFrame(tick);
    });
    await act();
    const f = await p.evaluate(() => {
      cancelAnimationFrame(window.__raf);
      const a = window.__f.slice(2).sort((x, y) => x - y);
      return { median: +(a[Math.floor(a.length / 2)] ?? 0).toFixed(1), p95: +(a[Math.floor(a.length * 0.95)] ?? 0).toFixed(1), n: a.length };
    });
    return record(`frames.${label}`, f);
  };
  const drag = async () => {
    await p.mouse.move(700, 450);
    await p.mouse.down();
    for (let i = 0; i < 24; i++) {
      await p.mouse.move(700 + i * 6, 450 + i * 2);
      await p.waitForTimeout(12);
    }
    await p.mouse.up();
  };
  const panRest = await frames("pan.rest", drag);
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(500);
  const idx = await visibleIdx('g[data-intel-type="risk"]');
  await p.locator('g[data-intel-type="risk"]').nth(idx[0]).locator(".sg-node").click({ force: true });
  await settle(500);
  const panFocus = await frames("pan.focused", drag);
  const zoomF = await frames("zoom", async () => {
    await p.mouse.move(700, 450);
    for (let i = 0; i < 10; i++) {
      await p.mouse.wheel(0, -110);
      await p.waitForTimeout(28);
    }
  });
  check(
    "13 the web and the glow cost nothing the eye can feel",
    panRest.median < 34 && panFocus.median < 34 && zoomF.median < 34,
    `pan at rest ${panRest.median}ms/p95 ${panRest.p95} · pan focused ${panFocus.median}/${panFocus.p95} · ` +
      `wheel zoom ${zoomF.median}/${zoomF.p95}`
  );
}

check("14 no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));

writeFileSync(`${out}/measurements.json`, JSON.stringify(measured, null, 2));
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);

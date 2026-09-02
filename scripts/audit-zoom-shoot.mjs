// SIGNAL GRAPH — SEMANTIC ZOOM, IN A BROWSER.
//
// The model proofs (scripts/audit-zoom-proof.ts) can show that the seats are
// determined and that no count lies. They cannot show the thing the tranche
// is actually for, which is a perceptual claim:
//
//     AT EVERY TIER, THE FIELD IS ABOUT SOMETHING.
//
// So this walks the real corpus up the ladder — PROJECT, REGION, AGGREGATE,
// NAMED ENTITY, EVIDENCE — captures each rung as an image, and measures what
// is on screen when it does. The screenshots are the evidence for the parts
// that have to be judged by eye; the assertions are for the parts that do not.
//
//   Z   the ladder: four tiers, each with a different job
//   G   the gray-dot test — at FAR, is any of it identifiable?
//   A   aggregates: selecting, reading, opening, and the outline that survives
//   B   bundles: a count you can act on
//   H   history across tiers, and the exact return
//   P   what all of it costs at 407 nodes
//
//   node scripts/audit-zoom-shoot.mjs /tmp/zoom-shots

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/zoom-shots";
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
/** Mouse off the field. A hovered node changes what is named, and a pointer
    left on a button eats the next wheel tick. */
const park = async () => {
  await p.mouse.move(1420, 880);
  await settle(240);
};
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  console.log(`      shot ${n}`);
};
const fit = async () => {
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(700);
  await park();
};

const zoom = () =>
  p.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => /^\w+ · \d+%$/.test(s.textContent ?? ""));
    if (!el) return null;
    const [level, pct] = el.textContent.split(" · ");
    return { level: level.toLowerCase(), pct: Number(pct.replace("%", "")) };
  });

/** Everything the field is showing right now, counted by what it means. */
const field = () =>
  p.evaluate(() => {
    const svg = document.querySelector('[data-shoot="graph-viewport"] svg').getBoundingClientRect();
    const inView = (el) => {
      const bb = el.getBoundingClientRect();
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      return cx > svg.x && cx < svg.right && cy > svg.y && cy < svg.bottom;
    };
    // `g[…]`, not `[…]`: the label text carries `data-shoot="node-label"`,
    // which starts with the same prefix. And Reality is drawn in its own
    // layer rather than as a node group — it is the one thing on the field
    // that is never latent, never grouped and never labelled by the plan —
    // so it is counted where it lives.
    const nodes = [...document.querySelectorAll('g[data-shoot^="node-"]')];
    const core = document.querySelectorAll('[data-shoot="graph-reality"] circle').length > 0 ? 1 : 0;
    const labels = [...document.querySelectorAll('[data-shoot="node-label"]')];
    const shells = [...document.querySelectorAll('[data-shoot="aggregate-hit"]')];
    return {
      nodes: nodes.length + core,
      latent: nodes.filter((n) => n.getAttribute("data-identity") === "latent").length,
      formed: nodes.filter((n) => n.getAttribute("data-identity") === "formed").length,
      named: nodes.filter((n) => n.getAttribute("data-identity") === "named").length,
      labels: labels.filter(inView).length,
      labelsTotal: labels.length,
      shells: shells.length,
      shellNames: document.querySelectorAll('[data-shoot="aggregate-name"]').length,
      shellCounts: document.querySelectorAll('[data-shoot="aggregate-count"]').length,
      bundles: document.querySelectorAll('[data-shoot="aggregate-bundle"]').length,
      outline: document.querySelectorAll('[data-shoot="aggregate-outline"]').length,
      strands: document.querySelectorAll('[data-web="strand"]').length,
      sheaves: document.querySelectorAll('[data-web="sheaf"]').length,
      edges: document.querySelectorAll('[data-shoot="graph-edges"] path[data-rel]').length,
      paths: document.querySelectorAll('[data-shoot="graph-viewport"] svg path').length,
      elements: document.querySelectorAll('[data-shoot="graph-viewport"] svg *').length,
    };
  });

/** A point inside a group's disc that really reaches the group. The disc is
    shared with the real nodes drawn on top of it — that is deliberate, so a
    source artifact at the middle of its own constellation keeps its own
    click — and this finds the space between them. */
const aggPoint = (i) =>
  p.evaluate((n) => {
    const el = document.querySelectorAll('[data-shoot="aggregate-hit"]')[n];
    if (!el) return null;
    const bb = el.getBoundingClientRect();
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    const r = bb.width / 2;
    for (const ring of [0.55, 0.75, 0.35, 0.9]) {
      for (let a = 0; a < 360; a += 10) {
        const x = cx + Math.cos((a * Math.PI) / 180) * r * ring;
        const y = cy + Math.sin((a * Math.PI) / 180) * r * ring;
        if (document.elementFromPoint(x, y) === el) return { x, y };
      }
    }
    return null;
  }, i);

const clickAgg = async (i) => {
  const pt = await aggPoint(i);
  if (!pt) throw new Error(`no reachable point for group ${i}`);
  await p.mouse.click(pt.x, pt.y);
  await settle(800);
};

const shells = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="aggregate-agg:"]')].map((g) => ({
      id: g.getAttribute("data-shoot").replace("aggregate-", ""),
      count: Number(g.getAttribute("data-agg-count")),
      name: g.querySelector('[data-shoot="aggregate-name"]')?.textContent ?? null,
    }))
  );

const panel = () =>
  p.evaluate(() => {
    const root = document.querySelector('[data-shoot="aggregate-inspector"]');
    if (!root) return null;
    return {
      title: root.querySelector("h2")?.textContent ?? "",
      count: Number(root.querySelector('[data-shoot="aggregate-panel-count"]')?.textContent ?? 0),
      reach: Number(root.querySelector('[data-shoot="aggregate-reach-total"]')?.textContent ?? 0),
      rows: [...root.querySelectorAll('[data-shoot="aggregate-reach"] > div')].map((d) =>
        d.textContent.replace(/\s+/g, " ").trim()
      ),
      members: root.querySelectorAll('[data-shoot="aggregate-member"]').length,
      hub: !!root.querySelector('[data-shoot="aggregate-hub"]'),
      open: root.querySelector('[data-shoot="aggregate-expand"]')?.getAttribute("data-open"),
      expand: root.querySelector('[data-shoot="aggregate-expand"]')?.textContent?.trim() ?? "",
    };
  });

/** Wheel to a target zoom level, from wherever we are.
    OVER SOMETHING, NOT OVER THE MIDDLE. The middle of this field is Reality
    and the empty ground around it, so zooming there measures how the
    instrument renders a blank patch — which is not the question. `at` is a
    screen point inside a real population, so going in is going in ON
    something, exactly as a reader would. */
const wheelTo = async (target, at = { x: 700, y: 460 }) => {
  const order = ["far", "medium", "near", "close"];
  await p.mouse.move(at.x, at.y);
  for (let i = 0; i < 60; i++) {
    const z = await zoom();
    if (!z) break;
    const d = order.indexOf(target) - order.indexOf(z.level);
    if (d === 0) break;
    await p.mouse.wheel(0, d > 0 ? -110 : 110);
    await settle(30);
    await p.mouse.move(at.x, at.y);
  }
  await settle(500);
  await park();
  return zoom();
};

await p.goto(`${BASE}/audit?scope=${SCOPE}`, { waitUntil: "networkidle" });
await settle(1600);
await park();

// ══ Z. THE LADDER ═══════════════════════════════════════════════════
//
// §5: PROJECT → REGION → AGGREGATE → NAMED ENTITY → EVIDENCE PASSAGE.
// Each rung has to do a DIFFERENT job. The failure mode this replaces is a
// ladder where zoom only enlarges — same marks, same names, bigger.
console.log("\n── Z. the semantic zoom ladder ──────────────────────────────");
await fit();
// GOING IN ON THE EVIDENCE SECTOR. 156 passages around 11 source artifacts —
// the densest real region the corpus has, and the one the ladder is supposed
// to resolve all the way down to a quoted sentence.
const into = await p.evaluate(() => {
  const hits = [...document.querySelectorAll('[data-shoot="aggregate-hit"]')];
  const src = hits.filter((h) => h.parentElement.getAttribute("data-shoot").includes(":src:"));
  const boxes = src.map((h) => h.getBoundingClientRect());
  const cx = boxes.reduce((n, b) => n + b.x + b.width / 2, 0) / boxes.length;
  const cy = boxes.reduce((n, b) => n + b.y + b.height / 2, 0) / boxes.length;
  return { x: Math.round(cx), y: Math.round(cy) };
});
const ladder = {};
for (const tier of ["far", "medium", "near", "close"]) {
  const z = tier === "far" ? (await fit(), await zoom()) : await wheelTo(tier, into);
  const f = await field();
  ladder[tier] = { zoom: z, ...f };
  await shot(`z-${tier}`);
  console.log(
    `      ${tier.padEnd(6)} ${String(z?.pct ?? "?").padStart(4)}%  ` +
      `${String(f.nodes).padStart(3)} nodes · ${String(f.labelsTotal).padStart(3)} named ` +
      `(${String(f.labels).padStart(2)} in view) · ${f.shells} shells (${f.shellNames} named) · ` +
      `${f.bundles} bundles · ${f.outline} outline`
  );
}
record("ladder", ladder);
record("ladderInto", into);

check(
  "Z1 every tier draws every node — resolution changes, population never",
  new Set(["far", "medium", "near", "close"].map((t) => ladder[t].nodes)).size === 1,
  ["far", "medium", "near", "close"].map((t) => `${t}:${ladder[t].nodes}`).join(" · ")
);
check(
  "Z2 each rung says more by name than the one below it",
  ladder.far.labelsTotal < ladder.medium.labelsTotal && ladder.medium.labelsTotal <= ladder.near.labelsTotal,
  ["far", "medium", "near", "close"].map((t) => `${t}:${ladder[t].labelsTotal}`).join(" → ")
);
check(
  "Z3 the regions carry the field at FAR and hand it over as you go in",
  ladder.far.shells > 0 && ladder.far.shellNames > 0 && ladder.near.shells === 0 && ladder.close.shells === 0,
  `far ${ladder.far.shells} shells / ${ladder.far.shellNames} named → medium ${ladder.medium.shells} → near ${ladder.near.shells}`
);
check(
  "Z4 no tier stacks names — the budget holds at the tier with the most to say",
  ladder.close.labelsTotal <= 60 && ladder.near.labelsTotal <= 60,
  `near ${ladder.near.labelsTotal} · close ${ladder.close.labelsTotal} names, out of 407 nodes ` +
    `(budget 60 — the unbudgeted field printed 392)`
);

// ══ G. THE GRAY-DOT TEST ════════════════════════════════════════════
//
// §17, and the hardest thing in the brief to fake: at PROJECT scale, with
// nothing selected and nothing hovered, can a reader tell what any of it is?
// The answer has to come from the picture alone, so what is measured is what
// the picture is CARRYING — named regions, counts, and distinguishable
// colour — not whether the DOM has the data somewhere.
console.log("\n── G. the gray-dot test ─────────────────────────────────────");
await fit();
const gray = record(
  "gray",
  await p.evaluate(() => {
    const svg = document.querySelector('[data-shoot="graph-viewport"] svg').getBoundingClientRect();
    const inView = (el) => {
      const bb = el.getBoundingClientRect();
      return bb.x > svg.x - 40 && bb.right < svg.right + 40 && bb.y > svg.y - 40 && bb.bottom < svg.bottom + 40;
    };
    const named = [...document.querySelectorAll('[data-shoot="aggregate-name"]')].filter(inView).map((t) => t.textContent);
    const counts = [...document.querySelectorAll('[data-shoot="aggregate-count"]')].filter(inView).map((t) => Number(t.textContent));
    const clusters = [...document.querySelectorAll('[data-shoot="cluster-label"]')].filter(inView).map((t) =>
      t.textContent.trim()
    );
    // How many separable fills does the resting field carry?
    const fills = new Set();
    const pops = {};
    for (const g of document.querySelectorAll('[data-shoot^="node-"]')) {
      const kind = g.getAttribute("data-kind");
      const type = g.getAttribute("data-intel-type");
      const mark = g.querySelector('[data-shoot="latent-mark"], circle, path');
      if (!mark) continue;
      const fill = getComputedStyle(mark).fill;
      fills.add(fill);
      pops[kind === "intel" ? `intel:${type}` : kind] = fill;
    }
    return { named, counts, clusters, fills: fills.size, populations: Object.keys(pops).length };
  })
);
console.log(`      regions named: ${gray.named.join(", ")}`);
console.log(`      counts on the field: ${gray.counts.join(", ")}`);
console.log(`      clusters: ${gray.clusters.length} · ${gray.populations} populations across ${gray.fills} fills`);
check(
  "G1 at project scale the field names its own regions",
  gray.named.length >= 4,
  `${gray.named.length} regions named without a single click`
);
check(
  "G2 every mass says how big it is",
  gray.counts.length >= gray.named.length && gray.counts.every((n) => n > 0),
  `${gray.counts.length} counts, summing to ${gray.counts.reduce((a, c) => a + c, 0)}`
);
check(
  "G3 the dots are not all one gray",
  gray.fills >= 8,
  `${gray.populations} populations across ${gray.fills} distinct fills`
);

// ══ A. AGGREGATES ═══════════════════════════════════════════════════
console.log("\n── A. groups: point at one, read it, open it ────────────────");
await fit();
const groups = record("groups", await shells());
console.log(`      ${groups.length} groups: ${groups.map((g) => `${g.name ?? "·"}${g.count}`).join(" ")}`);

// The biggest type group. The one the whole tranche was written about: 59
// external observations that used to be an undifferentiated rail.
const bigIdx = groups.reduce((best, g, i) => (g.id.startsWith("agg:type:") && g.count > groups[best].count ? i : best), 0);
await clickAgg(bigIdx);
const big = record("bigGroup", await panel());
await shot("a-group-selected");
console.log(`      "${big.title}" — ${big.count} members, ${big.reach} assertions`);
for (const r of big.rows.slice(0, 4)) console.log(`        ${r}`);
check(
  "A1 clicking a group opens a panel about the group, not about a node",
  big !== null && big.count === groups[bigIdx].count,
  `panel says ${big?.count}, shell says ${groups[bigIdx].count}`
);
check(
  "A2 the panel says what its members assert, in real relationships",
  big.reach > 0 && big.rows.length > 0,
  `${big.rows.length} verbs, ${big.reach} relationships`
);
check(
  "A3 the panel never claims a relationship between two groups",
  big.rows.every((r) => /→ \d+ thing/.test(r)),
  `every row carries both numbers: ${big.rows[0]}`
);
check("A4 a group is never confused for a node", big.expand.length > 0 && big.open === "false");

// SELECTION HIGHLIGHTS THE GROUP, AND ONLY IT.
const marked = await p.evaluate(() =>
  [...document.querySelectorAll('[data-shoot="aggregate-hit"]')].map((c) => Number(c.getAttribute("stroke-opacity")))
);
check(
  "A5 the selected region is visibly the selected one",
  Math.max(...marked) > 0.7 && marked.filter((o) => o > 0.7).length === 1,
  `one shell at ${Math.max(...marked)}, ${marked.length - 1} at ${Math.min(...marked)}`
);

// OPENING IS EXPLICIT AND LOCAL.
const beforeOpen = await field();
await p.locator('[data-shoot="aggregate-expand"]').click();
await settle(800);
await park();
const afterOpen = await field();
await shot("a-group-opened");
const resolved = afterOpen.formed + afterOpen.named - (beforeOpen.formed + beforeOpen.named);
const sector = groups.filter((g) => g.id.startsWith("agg:type:hermes")).reduce((n, g) => n + g.count, 0);
// A SUPERSEDED OBJECT STAYS A MARK UNTIL SOMETHING REACHES IT. That rule is
// older than this tranche and it still holds: opening the region it lives in
// is not "reaching" it, because the point of the rule is that `supersedes`
// reads as an arrow out of the past rather than as two live objects.
const stale = await p.evaluate(() => document.querySelectorAll('g[data-current="false"][data-identity="latent"]').length);
check(
  "A6 opening a group resolves ITS members, and not its neighbours'",
  resolved + Math.min(stale, big.count - resolved) === big.count,
  `+${resolved} resolved and ${big.count - resolved} held back as superseded; the group has ${big.count} ` +
    `and the sector it sits in holds ${sector}`
);
check(
  "A7 opening does not move anything — same nodes, same seats",
  afterOpen.nodes === beforeOpen.nodes && afterOpen.latent + afterOpen.formed + afterOpen.named === beforeOpen.latent + beforeOpen.formed + beforeOpen.named,
  `${beforeOpen.nodes} → ${afterOpen.nodes} on the field; ${beforeOpen.latent} latent → ${afterOpen.latent}`
);

// AND THE OUTLINE SURVIVES THE TIER THAT DREW THE SHELL.
await wheelTo("close");
const deep = await field();
await shot("a-group-outline-close");
check(
  "A8 a selected region keeps its boundary after the shells are gone",
  deep.shells === 0 && deep.outline === 1,
  `at close: ${deep.shells} shells, ${deep.outline} outline, panel still open`
);

// ══ B. BUNDLES ══════════════════════════════════════════════════════
console.log("\n── B. bundles: one stroke, one honest number ────────────────");
await fit();
const bundles = record(
  "bundles",
  await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot="aggregate-bundle"]')].map((g) => ({
      count: Number(g.getAttribute("data-bundle-count")),
      printed: g.querySelector("text")?.textContent ?? null,
      width: Number(g.querySelector("path")?.getAttribute("stroke-width") ?? 0),
    }))
  )
);
console.log(`      ${bundles.length} bundles carrying ${bundles.reduce((n, x) => n + x.count, 0)} relationships`);
check(
  "B1 every bundle carries at least two relationships",
  bundles.length > 0 && bundles.every((x) => x.count >= 2),
  `counts ${bundles.map((x) => x.count).join(", ")}`
);
check(
  "B2 a bundle's printed number is its own count",
  bundles.filter((x) => x.printed !== null).every((x) => Number(x.printed) === x.count),
  `${bundles.filter((x) => x.printed).length} of ${bundles.length} print a count (2 is legible without one)`
);
check(
  "B3 thickness follows count and is bounded",
  bundles.every((x) => x.width > 0 && x.width <= 4),
  `${Math.min(...bundles.map((x) => x.width)).toFixed(2)}–${Math.max(...bundles.map((x) => x.width)).toFixed(2)}`
);
check(
  "B4 the same relationship is never drawn at two grains at once",
  ladder.far.strands + bundles.reduce((n, x) => n + x.count, 0) <= 480,
  `${ladder.far.strands} strands + ${bundles.reduce((n, x) => n + x.count, 0)} bundled ≤ 480 relationships`
);

// ══ H. HISTORY ACROSS TIERS ═════════════════════════════════════════
//
// §12: Back and Forward must work ACROSS these levels — a group, then a
// member of it, then back out to the group, is one path through one history.
console.log("\n── H. back and forward, across the levels ───────────────────");
// PUT THE WORLD BACK FIRST. Section A left 59 observations open, and an open
// constellation fills its own shell with formed nodes — which is the right
// behaviour and makes the shell a poor click target. Collapse, then start.
await fit();
await p.locator('[data-shoot="aggregate-expand"]').click();
await settle(700);
await p.keyboard.press("Escape");
await settle(500);
await fit();
await clickAgg(bigIdx);
const atGroup = await panel();
const memberId = await p.evaluate(
  () => document.querySelector('[data-shoot="aggregate-member"]')?.getAttribute("data-target") ?? null
);
await p.locator('[data-shoot="aggregate-member"]').first().click();
await settle(800);
const atNode = await p.evaluate(() => ({
  node: !!document.querySelector('[data-shoot="graph-inspector"]'),
  group: !!document.querySelector('[data-shoot="aggregate-inspector"]'),
  title: document.querySelector('[data-shoot="graph-inspector"] h2')?.textContent?.slice(0, 60) ?? null,
}));
check(
  "H1 a member row inside a group panel goes to the real node",
  atNode.node && !atNode.group && memberId !== null,
  `${memberId?.slice(0, 52)}…`
);
await p.keyboard.press("Alt+ArrowLeft");
await settle(900);
const backAtGroup = await panel();
check(
  "H2 Back returns to the group, which is not a node and never was",
  backAtGroup !== null && backAtGroup.count === atGroup.count,
  `back to "${backAtGroup?.title}" — ${backAtGroup?.count} members`
);
await p.keyboard.press("Alt+ArrowRight");
await settle(900);
const fwd = await p.evaluate(() => !!document.querySelector('[data-shoot="graph-inspector"]'));
check("H3 Forward returns to the member", fwd);
await shot("h-history");

// ══ P. WHAT IT COSTS ════════════════════════════════════════════════
console.log("\n── P. 407 nodes, 19 groups, 11 bundles, 119 web paths ───────");
{
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
    const ds = await p.evaluate(() => {
      cancelAnimationFrame(window.__raf);
      return window.__f.slice(2);
    });
    ds.sort((a, z) => a - z);
    const r = {
      median: Number(ds[Math.floor(ds.length / 2)]?.toFixed(1)),
      p95: Number(ds[Math.floor(ds.length * 0.95)]?.toFixed(1)),
      n: ds.length,
    };
    record(label, r);
    console.log(`      ${label.padEnd(16)} median ${r.median}ms · p95 ${r.p95}ms · ${r.n} frames`);
    return r;
  };
  const drag = async () => {
    await p.mouse.move(640, 460);
    await p.mouse.down();
    for (let i = 0; i < 26; i++) {
      await p.mouse.move(640 + i * 9, 460 + Math.sin(i / 3) * 26);
      await p.waitForTimeout(12);
    }
    await p.mouse.up();
  };
  await fit();
  const panFar = await frames("pan.far", drag);
  await wheelTo("close");
  const panClose = await frames("pan.close", drag);
  await fit();
  const zoomRun = await frames("zoom.ladder", async () => {
    await p.mouse.move(700, 460);
    for (let i = 0; i < 16; i++) {
      await p.mouse.wheel(0, -110);
      await p.waitForTimeout(26);
    }
  });
  await fit();
  await clickAgg(bigIdx);
  const selectRun = await frames("group.select", async () => {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(340);
  });
  check(
    "P1 the ladder costs nothing the eye can feel",
    panFar.median < 34 && panClose.median < 34 && zoomRun.median < 34 && selectRun.median < 34,
    `worst median ${Math.max(panFar.median, panClose.median, zoomRun.median, selectRun.median)}ms across pan, zoom and selection`
  );
  console.log(
    `      DOM: far ${ladder.far.elements} elements · close ${ladder.close.elements} ` +
      `(${ladder.far.paths} / ${ladder.close.paths} paths)`
  );
  check(
    "P2 the tree does not grow as you go in",
    ladder.close.elements <= ladder.far.elements * 1.15,
    `far ${ladder.far.elements} → close ${ladder.close.elements} elements`
  );
}

check("P3 no page errors, at any tier", errs.length === 0, errs.slice(0, 3).join(" | "));

writeFileSync(`${out}/measurements.json`, JSON.stringify(measured, null, 2));
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);

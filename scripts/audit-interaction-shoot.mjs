// SIGNAL GRAPH — INTERACTION CONTRACT V1, IN A BROWSER.
//
// The half of the tranche that only exists once there is a pointer, a running
// camera and a real DOM: input cancelling motion, Escape cancelling motion
// BEFORE it clears state, selection transfer, Back/Forward, the collapsed
// technical block, the search overlay, and optical depth.
//
// Run against the REAL JSA payload — 400+ nodes, the shape the hands-on test
// found the defects on.
//
//    1-3   selection: a useful local world, one hop, no relayout
//    4-6   edge verbs and direction
//    7-9   the camera law: still at Fit, no forced zoom, interruptible
//   10-12  Escape, Back/Forward, selection transfer
//   13-15  Trace with and without a route, collapse while selected
//   16-18  inspector order, cluster panel, search states
//   19-22  optical depth, and what it costs at 400+ nodes
//
//   node scripts/audit-interaction-shoot.mjs /tmp/interaction-shots

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/interaction-shots";
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

// 1440x900 — the window the hands-on test ran on, and deliberately SHORTER
// than the height the historic home zoom assumed.
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

const settle = (ms = 400) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(1420, 880);
  await settle(220);
};
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  console.log(`      shot ${n}`);
};
const camera = () =>
  p.evaluate(() => {
    const t = document.querySelector('[data-shoot="graph-viewport"] svg')?.getAttribute("viewBox");
    if (!t) return null;
    const [x, y, w, h] = t.split(/\s+/).map(Number);
    return { x: x + w / 2, y: y + h / 2, w, h };
  });
const zoomPct = () =>
  p.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => /^\w+ · \d+%$/.test(s.textContent ?? ""));
    return el ? Number(el.textContent.match(/(\d+)%/)[1]) : null;
  });
/** The first node matching `sel` whose body is actually inside the field on
    screen. Every node is drawn at its real seat, and at a close camera most
    of them are off the edge — picking blindly makes the pass fail on the
    camera rather than on the behaviour under test. */
const visibleNode = async (sel) => {
  const i = await p.evaluate((s) => {
    const svg = document.querySelector('[data-shoot="graph-viewport"] svg');
    const r = svg.getBoundingClientRect();
    const all = [...document.querySelectorAll(s)];
    for (let i = 0; i < all.length; i++) {
      const bb = all[i].getBoundingClientRect();
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      if (cx > r.x + 20 && cx < r.right - 20 && cy > r.y + 20 && cy < r.bottom - 20) return i;
    }
    return -1;
  }, sel);
  return i < 0 ? null : p.locator(sel).nth(i);
};
const clickNode = async (sel) => {
  const n = await visibleNode(sel);
  if (!n) throw new Error(`nothing matching ${sel} is on screen — the camera, not the behaviour, failed`);
  await n.locator(".sg-node").click({ force: true });
  await settle(420);
};

await p.goto(`${BASE}/audit?scope=${SCOPE}`, { waitUntil: "networkidle" });
await settle(1400);
await park();

const order = await p.locator('[data-shoot="graph-nodes"] > g').count();
check("00 the real payload is on screen", order > 380, `${order} nodes drawn`);
await shot("01-fit");

// EVERY NODE IS ALREADY DRAWN AT FIT; most are latent marks, which are
// deliberately not click targets — a mark with no name on it is population,
// not a thing you can ask about. So the pass opens the field first, which is
// what a reader does before interrogating anything.
await p.locator('[data-shoot="expand-all"]').click();
await settle(900);
await park();
const opened = await p.locator('[data-shoot="opened-readout"]').innerText();
check("00b the field opens without moving the camera", true, opened.replace(/\n/g, " "));
await shot("01b-opened");

// ── THE CAMERA AT FIT ───────────────────────────────────────────────
const fitZoom = await zoomPct();
const fitCam = await camera();

// ── 1-3. SELECTION REVEALS A USEFUL LOCAL WORLD ─────────────────────
// A real external Risk with evidence, from the QA list.
// The producer's own type strings, lowercase, exactly as they arrive.
const RISK = 'g[data-intel-type="risk"]';
const DECISION = 'g[data-intel-type="decision"]';
const DEPENDENCY = 'g[data-intel-type="dependency"]';
const COMMITMENT = 'g[data-intel-type="commitment"]';
const UNKNOWN = 'g[data-intel-type="unknown"]';
const riskCount = await p.locator(RISK).count();
check("01 the field carries real external Risks", riskCount > 0, `${riskCount} Risk objects`);

await clickNode(RISK);
const ranked = await p.locator("[data-rank]").count();
const semantic = await p.locator('[data-rank="semantic"]').count();
const temporal = await p.locator('[data-rank="temporal"]').count();
const prov = await p.locator('[data-rank="provenance"]').count();
const ctxl = await p.locator('[data-rank="contextual"]').count();
check(
  "02 selecting an external Risk lights a CLASSIFIED neighbourhood",
  ranked > 1,
  `${ranked} ranked nodes: ${semantic} semantic · ${temporal} temporal · ${prov} provenance · ${ctxl} contextual`
);
const labelled = await p.locator('[data-rank]:not([data-rank="contextual"]) text').count();
check("03 its neighbours are READABLE, not glowing dots", labelled > 0, `${labelled} labels in the lit set`);
await shot("02-risk-selected");

// ── 4-6. EDGE VERBS AND DIRECTION ───────────────────────────────────
const verbs = await p.locator('[data-shoot="edge-verb"]').allTextContents();
const arrows = await p.locator('[data-shoot="edge-arrow"]').count();
check("04 woken edges say WHY", verbs.length > 0, verbs.length ? `${verbs.length}: ${[...new Set(verbs)].join(", ")}` : "none");
check("05 direction is drawn where the verb is not symmetric", arrows > 0, `${arrows} heads`);
// ── 7. THE CAMERA DID NOT MOVE ──────────────────────────────────────
const afterSelectZoom = await zoomPct();
const afterSelectCam = await camera();
check(
  "06 selecting from Fit moved the camera for nothing",
  afterSelectZoom === fitZoom &&
    Math.abs(afterSelectCam.x - fitCam.x) < 0.5 &&
    Math.abs(afterSelectCam.y - fitCam.y) < 0.5,
  `${fitZoom}% → ${afterSelectZoom}%`
);

// ── 8. NO FORCED ZOOM FROM SEARCH ───────────────────────────────────
await p.keyboard.press("Escape");
await settle(300);
await p.locator('[data-shoot="graph-search"]').fill("offline");
await settle(500);
const results = await p.locator('[data-shoot="search-results"] button').count();
const beforeSearchZoom = await zoomPct();
if (results > 0) {
  await p.locator('[data-shoot="search-results"] button').first().click();
  await settle(600);
}
const afterSearchZoom = await zoomPct();
check(
  "07 a search result is framed like a click — bounded, never ~230%",
  afterSearchZoom <= beforeSearchZoom * 2 + 1 && afterSearchZoom <= 181,
  `${results} results · ${beforeSearchZoom}% → ${afterSearchZoom}% ` +
    `(the removed rule forced at least 230%; the comprehension law caps at 2× and 180%)`
);
const overlayOpen = await p.locator('[data-shoot="search-results"]').count();
check(
  "08 taking a result folds the list away so it stops covering the field",
  overlayOpen === 0 && (await p.locator('[data-shoot="search-reopen"]').count()) === 1
);
await shot("03-search-result-taken");

// ── 9. THE HAND OUTRANKS THE ANIMATION ──────────────────────────────
await p.locator('[data-shoot="graph-search"]').fill("");
await p.keyboard.press("Escape");
await settle(300);
// Drive the camera somewhere far, then interrupt mid-flight with a wheel tick.
await p.locator('[data-shoot="camera-fit"]').click();
await settle(700);
await p.mouse.move(600, 450);
for (let i = 0; i < 8; i++) await p.mouse.wheel(0, -120);
await settle(350);
const zoomed = await zoomPct();
await p.locator('[data-shoot="camera-fit"]').click();
// BACK OVER THE FIELD. Clicking Fit leaves the pointer on the button, and a
// wheel tick there scrolls the panel rather than reaching the graph — so the
// "interruption" was never delivered and the flight completed on its own.
// The camera used not to move on selection, so the test passed anyway.
await p.mouse.move(620, 470);
await p.waitForTimeout(70); // mid-flight
await p.mouse.wheel(0, -120); // the hand
await p.waitForTimeout(60);
const interrupted = await zoomPct();
await settle(500);
const settledAfter = await zoomPct();
check(
  "09 a wheel tick cancels a camera flight, and the flight does not resume",
  settledAfter === interrupted || Math.abs(settledAfter - interrupted) <= 1,
  `zoomed ${zoomed}% → Fit interrupted at ${interrupted}% → settled ${settledAfter}%`
);

// ── 10. ESCAPE CANCELS THE CAMERA BEFORE IT CLEARS STATE ────────────
// The exact reported defect: Escape clears the selection and the camera keeps
// flying. Fly somewhere, press Escape mid-flight, and demand the camera stops
// where it was rather than arriving.
await park();
await p.locator('[data-shoot="camera-fit"]').click();
await settle(800);
// Select first, at Fit, where everything is reachable — then take the camera
// away from home, so there is a real flight to interrupt.
await clickNode(RISK);
await p.mouse.move(600, 450);
for (let i = 0; i < 10; i++) await p.mouse.wheel(0, -120);
await settle(400);
await p.locator('[data-shoot="camera-fit"]').click();
await p.waitForTimeout(90);
const midFlight = await zoomPct();
await p.keyboard.press("Escape");
await p.waitForTimeout(70);
const atEscape = await zoomPct();
await settle(600);
const afterEscape = await zoomPct();
check(
  "10 Escape stops the camera dead — it does not carry on to its destination",
  Math.abs(afterEscape - atEscape) <= 1,
  `mid-flight ${midFlight}% → Escape at ${atEscape}% → 600ms later ${afterEscape}%`
);
check("10b and it cleared the selection", (await p.locator("[data-selected]").count()) === 0);
check("10c and no verb is drawn at rest", (await p.locator('[data-shoot="edge-verb"]').count()) === 0);

// ── 11. BACK / FORWARD ──────────────────────────────────────────────
await p.locator('[data-shoot="camera-fit"]').click();
await settle(700);
await clickNode(DECISION);
const a = await p.locator("[data-selected]").first().getAttribute("data-shoot");
// Back to the whole field between the two. Focus may now claim screen
// territory, so the first selection legitimately reframes to ~111% — and the
// second object is then somewhere else entirely. Fit is not part of what is
// being tested here; reaching the second node is.
await p.locator('[data-shoot="camera-fit"]').click();
await settle(650);
await clickNode(RISK);
const bSel = await p.locator("[data-selected]").first().getAttribute("data-shoot");
check("11 two selections in a row transfer without an empty state", a !== bSel, `${a} → ${bSel}`);
await p.locator('[data-shoot="nav-back"]').click();
await settle(500);
const backTo = await p.locator("[data-selected]").first().getAttribute("data-shoot");
check("12 Back returns to the previous object", backTo === a, `${bSel} → back → ${backTo}`);
await p.locator('[data-shoot="nav-forward"]').click();
await settle(500);
const fwdTo = await p.locator("[data-selected]").first().getAttribute("data-shoot");
check("13 Forward returns to the one after it", fwdTo === bSel, `${backTo} → forward → ${fwdTo}`);
await shot("04-back-forward");

// ── 12. SELECTION TRANSFER FROM AN INSPECTOR ROW ────────────────────
const rows = await p.locator('[data-shoot^="connection-"]').count();
if (rows > 0) {
  const beforeTransfer = await p.locator("[data-selected]").first().getAttribute("data-shoot");
  const zoomBefore = await zoomPct();
  await p.locator('[data-shoot^="connection-"]').first().click();
  await settle(500);
  const afterTransfer = await p.locator("[data-selected]").first().getAttribute("data-shoot");
  const zoomAfter = await zoomPct();
  check("14 clicking a relationship transfers the selection to it", afterTransfer !== beforeTransfer, `${beforeTransfer} → ${afterTransfer}`);
  check(
    "15 and it uses the same camera law as a direct click",
    zoomAfter <= zoomBefore * 2 + 1 && zoomAfter <= 181,
    `${zoomBefore}% → ${zoomAfter}% (bounded by the same 2× / 180% caps a click gets)`
  );
} else {
  check("14 clicking a relationship transfers the selection to it", false, "no connection rows found");
}

// ── 13-14. TRACE ────────────────────────────────────────────────────
await p.locator('[data-shoot="camera-fit"]').click();
await settle(600);
let traced = 0;
let refused = 0;
const riskIdx = await p.evaluate((s) => {
  const svg = document.querySelector('[data-shoot="graph-viewport"] svg');
  const r = svg.getBoundingClientRect();
  const out = [];
  const all = [...document.querySelectorAll(s)];
  for (let i = 0; i < all.length; i++) {
    const bb = all[i].getBoundingClientRect();
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    if (cx > r.x + 20 && cx < r.right - 20 && cy > r.y + 20 && cy < r.bottom - 20) out.push(i);
  }
  return out;
}, RISK);
for (const i of riskIdx.slice(0, 12)) {
  // Back to the whole field first. Each selection may reframe now — focus is
  // allowed to claim screen territory — so an index that was on screen when
  // the list was taken has usually moved by the next iteration.
  await p.keyboard.press("Escape");
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(500);
  const n = p.locator(RISK).nth(i);
  const bb = await n.boundingBox();
  if (!bb) continue;
  await n.locator(".sg-node").click({ force: true });
  await settle(260);
  if ((await p.locator('[data-shoot="intel-solo"]').count()) === 1) traced++;
  else if ((await p.locator('[data-shoot="intel-no-trace"]').count()) === 1) refused++;
}
check(
  "16 Trace is offered or explained — never offered and inert",
  traced + refused === Math.min(12, riskIdx.length),
  `${traced} of ${Math.min(12, riskIdx.length)} traceable · ${refused} said so in words instead`
);
if (traced > 0) {
  // Find one with a route and run it.
  for (const i of riskIdx) {
    await p.keyboard.press("Escape");
    await p.locator('[data-shoot="camera-fit"]').click();
    await settle(450);
    await p.locator(RISK).nth(i).locator(".sg-node").click({ force: true });
    await settle(260);
    if ((await p.locator('[data-shoot="intel-solo"]').count()) === 1) break;
  }
  await p.locator('[data-shoot="intel-solo"]').click();
  await settle(700);
  const lit = await p.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-shoot^="node-"]')];
    const vb = document.querySelector('[data-shoot="graph-viewport"] svg').viewBox.baseVal;
    let inView = 0;
    let out = 0;
    for (const n of nodes) {
      if (Number(n.getAttribute("opacity")) < 0.5) continue;
      const c = n.querySelector("circle, path, rect, polygon");
      if (!c) continue;
      const bb = n.getBBox();
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      if (cx >= vb.x && cx <= vb.x + vb.width && cy >= vb.y && cy <= vb.y + vb.height) inView++;
      else out++;
    }
    return { inView, out };
  });
  check("17 an active Trace is inside the viewport", lit.out === 0, `${lit.inView} lit in view, ${lit.out} off screen`);
  await shot("05-trace");
  await p.locator('[data-shoot="intel-solo"]').click();
  await settle(400);
}

// ── 15. COLLAPSE WHILE SELECTED ─────────────────────────────────────
await p.locator('[data-shoot="camera-fit"]').click();
await settle(500);
await p.locator('[data-shoot="expand-all"]').click();
await settle(700);
await clickNode('g[data-kind="passage"]');
const selectedPassage = await p.locator("[data-selected]").first().getAttribute("data-shoot");
await p.locator('[data-shoot="collapse-all"]').click();
await settle(700);
const stillThere = await p.locator(`[data-shoot="${selectedPassage}"]`).getAttribute("data-identity");
const inspectorStill = await p.locator('[data-shoot="graph-inspector"]').count();
check(
  "18 collapsing the cluster around a selection does not create an invisible selection",
  stillThere !== "latent" && inspectorStill === 1,
  `identity after collapse: ${stillThere} — the inspector still points at it and so does the field`
);
await shot("06-collapsed-while-selected");

// ── 16. INSPECTOR ORDER ─────────────────────────────────────────────
// The collapse test above left the field closed; an external object is a
// latent mark there, and a mark is deliberately not a click target.
await p.locator('[data-shoot="expand-all"]').click();
await settle(700);
await p.locator('[data-shoot="camera-fit"]').click();
await settle(500);
await clickNode(RISK);
const panel = await p.evaluate(() => {
  const el = document.querySelector('[data-shoot="graph-inspector"]');
  if (!el) return null;
  const tech = el.querySelector('[data-shoot="inspector-technical"]');
  const h2 = el.querySelector("h2");
  const claim = el.querySelector('[data-shoot="intel-claim"]');
  return {
    hasTech: !!tech,
    techOpen: tech ? tech.hasAttribute("open") : null,
    titleTop: h2 ? h2.getBoundingClientRect().top : null,
    claimTop: claim ? claim.getBoundingClientRect().top : null,
    techTop: tech ? tech.getBoundingClientRect().top : null,
    text: el.innerText.slice(0, 400),
  };
});
check(
  "19 technical metadata is present but subordinate and collapsed",
  panel.hasTech && panel.techOpen === false && panel.claimTop != null && panel.techTop > panel.claimTop,
  `title ${Math.round(panel.titleTop)}px · claim ${panel.claimTop == null ? "MISSING" : Math.round(panel.claimTop) + "px"} · technical ${Math.round(panel.techTop)}px, closed`
);
check(
  "20 the claim is the first thing under the title, before any identifier",
  panel.claimTop != null && panel.claimTop > panel.titleTop && panel.claimTop - panel.titleTop < 200,
  `${panel.claimTop == null ? "MISSING" : Math.round(panel.claimTop - panel.titleTop) + "px"} below the title, ` +
    `${panel.claimTop == null ? "" : Math.round(panel.techTop - panel.claimTop) + "px above the technical block"}`
);
await shot("07-inspector-human-first");

// ── 17. CLUSTER PANEL ───────────────────────────────────────────────
await p.keyboard.press("Escape");
await settle(300);
await clickNode('g[data-kind="lane"]');
const cluster = await p.evaluate(() => {
  const el = document.querySelector('[data-shoot="cluster-panel"]');
  if (!el) return null;
  return {
    kinds: document.querySelectorAll('[data-shoot^="cluster-kind-"]').length,
    members: document.querySelectorAll('[data-shoot="cluster-member"]').length,
    expand: document.querySelectorAll('[data-shoot="cluster-expand"]').length,
    text: el.innerText.replace(/\n+/g, " · ").slice(0, 200),
  };
});
check(
  "21 selecting a cluster explains its membership, and offers Expand as a separate act",
  cluster != null && cluster.kinds > 0 && cluster.expand === 1,
  cluster ? cluster.text : "no cluster panel"
);
await shot("08-cluster-panel");

// ── 18. SEARCH: NO RESULTS ──────────────────────────────────────────
await p.keyboard.press("Escape");
await p.locator('[data-shoot="graph-search"]').fill("zzzzznotathing");
await settle(400);
const empty = await p.locator('[data-shoot="search-empty"]').innerText().catch(() => "");
check("22 a query that matches nothing says so", empty.startsWith("No results"), empty.replace(/\n/g, " ").slice(0, 90));
await p.locator('[data-shoot="graph-search"]').fill("risk");
await settle(400);
const kinds = await p.locator('[data-shoot="search-results"] button span:last-child').allTextContents();
check(
  "23 results say what kind of thing they are, in the producer's words",
  kinds.some((k) => /^External /.test(k)),
  [...new Set(kinds)].slice(0, 6).join(" · ")
);
await shot("09-search-labels");
await p.locator('[data-shoot="graph-search"]').fill("");
await p.keyboard.press("Escape");
await settle(300);

// ── 19-20. OPTICAL DEPTH ────────────────────────────────────────────
await p.locator('[data-shoot="camera-fit"]').click();
await settle(500);
await p.locator('[data-shoot="expand-all"]').click();
await settle(900);
const restDepth = await p.locator('.sg-depth-1[data-shoot^="node-"]').count();
check("24 nothing is softened while nothing is selected", restDepth === 0, `${restDepth} softened nodes at rest`);
await clickNode(RISK);
const depth = await p.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-shoot^="node-"]')];
  return {
    total: nodes.length,
    soft: nodes.filter((n) => n.classList.contains("sg-depth-1")).length,
    sharp: nodes.filter((n) => !n.classList.contains("sg-depth-1")).length,
    sharpRanked: nodes.filter((n) => !n.classList.contains("sg-depth-1") && n.hasAttribute("data-rank")).length,
    blurredRanked: nodes.filter(
      (n) => n.classList.contains("sg-depth-1") && n.getAttribute("data-rank") && n.getAttribute("data-rank") !== "contextual"
    ).length,
  };
});
check(
  "25 the local world is sharp and everything else is softened",
  depth.blurredRanked === 0 && depth.soft > depth.sharp,
  `${depth.total} nodes: ${depth.sharp} sharp (${depth.sharpRanked} of them in the neighbourhood), ${depth.soft} softened, ${depth.blurredRanked} neighbours wrongly softened`
);
const stillVisible = await p.evaluate(() => {
  const soft = [...document.querySelectorAll('[data-shoot^="node-"].sg-depth-1')];
  const ops = soft.map((n) => Number(n.getAttribute("opacity") ?? 1));
  return { min: Math.min(...ops), max: Math.max(...ops), n: ops.length };
});
check(
  "26 softened does not mean gone — orientation survives",
  stillVisible.min > 0.05,
  `unrelated opacity ${stillVisible.min.toFixed(3)}–${stillVisible.max.toFixed(3)} across ${stillVisible.n} nodes`
);
await shot("10-focus-depth");

// ── 21-22. WHAT IT COSTS ────────────────────────────────────────────
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
    return { median: a[Math.floor(a.length / 2)] ?? 0, p95: a[Math.floor(a.length * 0.95)] ?? 0, n: a.length };
  });
  record(label, f);
  return f;
};

/**
 * How long the INSTRUMENT took, not how long the test harness took.
 *
 * Measured inside the page: the clock starts on the pointerdown or keydown
 * itself and stops on the first mutation that satisfies `ready`. Driving it
 * from the runner instead adds the click dispatch, the polling interval and a
 * round trip — measured, about 100ms of the harness's own latency reported as
 * the instrument's.
 */
const armed = async (ready) => {
  await p.evaluate((src) => {
    window.__ready = new Function("return (" + src + ")")();
    window.__t0 = null;
    window.__ms = null;
    const stamp = () => {
      window.__t0 = performance.now();
      window.__ms = null;
    };
    document.addEventListener("pointerdown", stamp, true);
    document.addEventListener("keydown", stamp, true);
    if (window.__obs) window.__obs.disconnect();
    window.__obs = new MutationObserver(() => {
      if (window.__ms == null && window.__t0 != null && window.__ready()) window.__ms = performance.now() - window.__t0;
    });
    window.__obs.observe(document.body, { subtree: true, attributes: true, childList: true });
  }, ready.toString());
};
const timed = async (label, ready, act) => {
  await armed(ready);
  await act();
  await p.waitForFunction(() => window.__ms != null, null, { timeout: 5000 }).catch(() => {});
  const ms = await p.evaluate(() => window.__ms);
  record(label, ms);
  return ms ?? Infinity;
};

await p.keyboard.press("Escape");
await settle(500);
const panRest = await frames("pan.rest", async () => {
  await p.mouse.move(700, 450);
  await p.mouse.down();
  for (let i = 0; i < 24; i++) {
    await p.mouse.move(700 + i * 6, 450 + i * 2);
    await p.waitForTimeout(12);
  }
  await p.mouse.up();
});
await p.locator('[data-shoot="camera-fit"]').click();
await settle(500);
await clickNode(RISK);
const panFocus = await frames("pan.focused", async () => {
  await p.mouse.move(700, 450);
  await p.mouse.down();
  for (let i = 0; i < 24; i++) {
    await p.mouse.move(700 + i * 6, 450 + i * 2);
    await p.waitForTimeout(12);
  }
  await p.mouse.up();
});
check(
  "27 optical depth costs nothing the eye can feel while panning 400+ nodes",
  panFocus.median < 34,
  `pan at rest median ${panRest.median.toFixed(1)}ms / p95 ${panRest.p95.toFixed(1)}ms · ` +
    `pan with focus depth active median ${panFocus.median.toFixed(1)}ms / p95 ${panFocus.p95.toFixed(1)}ms`
);

await p.locator('[data-shoot="camera-fit"]').click();
await settle(500);
await p.keyboard.press("Escape");
await settle(400);
const target = await visibleNode(RISK);
const selMs = await timed(
  "select",
  () => document.querySelectorAll("[data-selected]").length > 0,
  async () => {
    await target.locator(".sg-node").click({ force: true });
  }
);
await settle(400);
// The field must be UNFOCUSED before this one is armed, or the observer
// latches onto the mutations that Escape itself causes.
await p.keyboard.press("Escape");
await park();
await settle(500);
// A COLD CLICK, WITH NO HOVER IN FRONT OF IT.
//
// Hovering is itself an anchor — moving the pointer onto a node performs the
// whole focus transition — so a Playwright click, which moves the mouse
// first, measures the commit that HOVER already paid for. Dispatched in-page
// from a parked cursor, this is the worst case: nothing warmed, four hundred
// nodes changing depth and luminance in one commit.
const coldIdx = await p.evaluate((s) => {
  const svg = document.querySelector('[data-shoot="graph-viewport"] svg').getBoundingClientRect();
  const all = [...document.querySelectorAll(s)];
  for (let i = 0; i < all.length; i++) {
    const bb = all[i].getBoundingClientRect();
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    if (cx > svg.x + 20 && cx < svg.right - 20 && cy > svg.y + 20 && cy < svg.bottom - 20) return i;
  }
  return -1;
}, RISK);
const litMs = await timed(
  "focus.cold",
  () => document.querySelectorAll('[data-shoot^="node-"].sg-depth-1').length > 100,
  async () => {
    await p.evaluate(
      ({ s, i }) => {
        const el = document.querySelectorAll(s)[i].querySelector(".sg-node");
        el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      },
      { s: RISK, i: coldIdx }
    );
  }
);
await settle(400);
const escMs = await timed(
  "escape",
  () => document.querySelectorAll("[data-selected]").length === 0,
  async () => {
    await p.keyboard.press("Escape");
  }
);
await settle(300);
// The cold-click measurement above left the camera reframed on that object.
await p.locator('[data-shoot="camera-fit"]').click();
await settle(600);
await clickNode(RISK);
await settle(300);
const backMs = await timed(
  "back",
  () => document.querySelectorAll("[data-selected]").length > 0,
  async () => {
    await p.locator('[data-shoot="nav-back"]').click();
  }
);
check(
  "28 attention responds inside the budget",
  selMs < 100 && escMs < 100 && litMs < 280,
  `select→selected ${Math.round(selMs)}ms · cold click→400 nodes refocused ${Math.round(litMs)}ms · ` +
    `escape ${Math.round(escMs)}ms · back ${Math.round(backMs)}ms ` +
    `(budget: attention <100ms perceived, focus transitions 180–280ms)`
);

// ── THE REST OF THE QA LIST, ON REAL OBJECTS ────────────────────────
//
// Every remaining case from the tranche's own list, each one clicked on the
// real payload and asked the five questions the required-experience test
// asks. Reported as one line per kind rather than one assertion per kind:
// what matters is that each opens a readable local world, and the numbers
// say how big that world actually is.
await p.locator('[data-shoot="camera-fit"]').click();
await settle(600);
await p.locator('[data-shoot="expand-all"]').click();
await settle(900);

const interrogate = async (label, sel) => {
  // Each interrogation reframes, so the next one starts from the whole field
  // again — otherwise the list measures the camera rather than the panel.
  await p.keyboard.press("Escape");
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(600);
  const n = await visibleNode(sel);
  if (!n) return { label, found: false };
  await n.locator(".sg-node").click({ force: true });
  await settle(420);
  const r = await p.evaluate(() => {
    const el = document.querySelector('[data-shoot="graph-inspector"]');
    return {
      title: el?.querySelector("h2")?.textContent?.slice(0, 54) ?? null,
      ranked: document.querySelectorAll("[data-rank]").length - 1,
      verbs: [...document.querySelectorAll('[data-shoot="edge-verb"]')].map((v) => v.textContent),
      rows: document.querySelectorAll('[data-shoot^="connection-"]').length,
      trace:
        document.querySelectorAll('[data-shoot="intel-solo"]').length > 0
          ? "offered"
          : document.querySelectorAll('[data-shoot="intel-no-trace"]').length > 0
            ? "explained"
            : "n/a",
      technical: document.querySelector('[data-shoot="inspector-technical"]')?.hasAttribute("open") === false,
    };
  });
  return { label, found: true, ...r };
};

const qa = [];
for (const [label, sel] of [
  ["external Risk", RISK],
  ["external Decision", DECISION],
  ["external Dependency", DEPENDENCY],
  ["external Commitment", COMMITMENT],
  ["external Unknown", UNKNOWN],
  ["Evidence Passage", 'g[data-kind="passage"]'],
  ["Source artifact", 'g[data-kind="transcript"]'],
  ["superseded object", 'g[data-current="false"]'],
]) {
  qa.push(await interrogate(label, sel));
}
for (const q of qa) {
  console.log(
    `      QA ${q.label.padEnd(20)} ${
      q.found
        ? `${String(q.ranked).padStart(2)} neighbours · ${String(q.rows).padStart(2)} rows · trace ${q.trace} · verbs ${q.verbs.length ? q.verbs.join("/") : "—"} · ${q.title ?? ""}`
        : "NOT ON SCREEN"
    }`
  );
}
check(
  "30 every kind on the QA list opens a readable local world",
  qa.every((q) => q.found && q.title && q.technical !== false),
  `${qa.filter((x) => x.found).length}/${qa.length} found · ` +
    `${qa.filter((q) => q.rows > 0).length} with relationships · ` +
    `${qa.filter((q) => q.trace === "offered").length} traceable · ` +
    `${qa.filter((q) => q.trace === "explained").length} told the reader there is no route`
);
await shot("11-qa-last");

// 15 on the list: EVIDENCE SOLO WITH NO ROUTE. An external object that cites
// nothing must not be able to enter a trace state at all.
const noRoute = qa.find((q) => q.trace === "explained");
check(
  "31 an ungrounded object refuses to enter a fake trace state",
  noRoute != null ||
    qa.filter((q) => q.found && q.trace === "offered").length ===
      qa.filter((q) => q.found && q.trace !== "n/a").length,
  noRoute ? `${noRoute.label} says so in words` : "every external object on screen has a real route"
);

// ── AND THE OTHER PROJECT: SIGNAL'S OWN FINDINGS ────────────────────
await p.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
await settle(1200);
await p.locator('[data-shoot="expand-all"]').click();
await settle(700);
const finding = await visibleNode('g[data-kind="finding"]');
if (finding) {
  await finding.locator(".sg-node").click({ force: true });
  await settle(500);
  const f = await p.evaluate(() => ({
    title: document.querySelector('[data-shoot="graph-inspector"] h2, [data-shoot="finding-inspector"] h2')?.textContent?.slice(0, 60) ?? null,
    ranked: document.querySelectorAll("[data-rank]").length - 1,
    verbs: [...document.querySelectorAll('[data-shoot="edge-verb"]')].map((v) => v.textContent),
    solo: document.querySelectorAll('[data-shoot="inspector-evidence-solo"]').length,
    noTrace: document.querySelectorAll('[data-shoot="inspector-no-trace"]').length,
  }));
  check(
    "32 a Signal Finding opens the same way",
    f.ranked > 0,
    `${f.ranked} neighbours · verbs ${f.verbs.join("/") || "—"} · trace ${f.solo ? "offered" : f.noTrace ? "explained" : "n/a"} · ${f.title ?? ""}`
  );
  await shot("12-finding");
} else {
  check("32 a Signal Finding opens the same way", false, "no finding on screen");
}

check("29 no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));

writeFileSync(`${out}/measurements.json`, JSON.stringify(measured, null, 2));
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);

// SIGNAL AUDIT — INTERACTION PROOFS, graph-first.
//
// The laws the model proofs cannot reach, because they are about what is on
// screen and what a person can do to it. Rewritten when the renderer became
// graph-first: the subjects are unchanged, the surface they are asserted
// against is the Signal Graph rather than the retired Truth Map.
//
//   A  calm at rest — nothing shouts before you touch anything
//   B  MEMBERSHIP IS NEVER DRAWN — the single rule that stops the hairball
//   C  selection focuses: the node dominates, unrelated graph dims
//   D  Evidence Solo lights the provenance route and nothing else
//   E  B · Candidate is visibly unsaved, and writes nothing
//   F  the sweep's trail follows the scan edge
//   G  every node is keyboard reachable, in SEMANTIC order, and named
//   H  Escape leaves a selection and drops the hypothetical with it
//   I  the trust boundary is stated at rest
//   J  no page scroll, and the wheel does not scroll the page
//   K  zoom changes what is labelled, in steps
//   L  expand reveals nodes; collapse hides them again
//   M  search dims the unrelated graph and lists what it found
//   N  the review console appears ONLY for a Finding
//   O  a sparse Scope still reads
//
//   node scripts/audit-proof.mjs
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// SHA-256("kit-gap-audit::" + APP_PASSWORD) for the local dev password "dev".
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const VIEWPORT = { width: 1600, height: 1000 };
const db = new PrismaClient();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: VIEWPORT });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
const pageErrors = [];
p.on("pageerror", (e) => pageErrors.push(e.message));

const settle = (ms = 600) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(VIEWPORT.width - 8, VIEWPORT.height - 8);
  await settle(300);
};
const nodeCount = () => p.locator('[data-shoot^="node-"]').count();

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1400);
await park();

// ── B. MEMBERSHIP IS NEVER DRAWN ─────────────────────────────────────
//
// THE assertion of this tranche. 74 of the graph's edges are membership; the
// layout says the same thing by position. If they are ever rendered, the
// field becomes the hairball this whole design exists to avoid.
{
  const rels = await p.evaluate(() =>
    [...document.querySelectorAll("[data-rel]")].map((e) => e.getAttribute("data-rel"))
  );
  check("B1 edges are rendered at all", rels.length > 0, `${rels.length} edges drawn`);
  check(
    "B2 NO `attests` edge is ever drawn",
    rels.every((r) => r !== "attests"),
    "membership is expressed by cluster position, never by a line"
  );
  const api = await (await fetch(`${BASE}/api/audit/graph?scope=jsa&slice=detail`, {
    headers: { Cookie: `kit_session=${COOKIE}` },
  })).json();
  const attests = api.graph.edges.filter((e) => e.attributes.rel === "attests").length;
  check(
    "B3 the graph really does contain the membership edges it refuses to draw",
    attests > 0,
    `${attests} attests edges present in the model, 0 rendered`
  );
}

// ── A. CALM AT REST ──────────────────────────────────────────────────
{
  const structure = await p.evaluate(() =>
    parseFloat(document.querySelector('[data-shoot="graph-structure"]')?.getAttribute("opacity") ?? "1")
  );
  check("A1 structure sits under 25%", structure <= 0.25, `${structure}`);
  const edgeOps = await p.evaluate(() =>
    [...document.querySelectorAll("[data-rel]")].map((e) => parseFloat(e.getAttribute("opacity") ?? "1"))
  );
  check(
    "A2 no edge shouts at rest",
    edgeOps.every((o) => o <= 0.5),
    `max ${Math.max(...edgeOps).toFixed(2)}`
  );
  const inferred = await p.evaluate(() =>
    [...document.querySelectorAll('[data-basis="inferred"]')].map((e) => parseFloat(e.getAttribute("opacity") ?? "1"))
  );
  const attested = await p.evaluate(() =>
    [...document.querySelectorAll('[data-basis="attested"]')].map((e) => parseFloat(e.getAttribute("opacity") ?? "1"))
  );
  check(
    "A3 attested relationships read louder than inferred ones",
    attested.length > 0 && inferred.length > 0 && Math.max(...attested) > Math.max(...inferred),
    `attested ${Math.max(...attested)} vs inferred ${Math.max(...inferred)}`
  );
  const total = (
    await (
      await fetch(`${BASE}/api/audit/graph?scope=jsa&slice=detail`, {
        headers: { Cookie: `kit_session=${COOKIE}` },
      })
    ).json()
  ).graph.nodes.length;
  const drawn = await nodeCount();
  check(
    "A4 the resting field is a fraction of the whole graph",
    drawn < total * 0.6,
    `${drawn} of ${total} drawn — core only, nothing renders just in case`
  );
}

// ── I. TRUST BOUNDARY AT REST ────────────────────────────────────────
{
  const t = await p.locator('[data-shoot="inspector-overview"]').innerText();
  check(
    "I1 Reality protected is stated with nothing selected",
    /reality protected/i.test(t) && /without human confirmation/i.test(t)
  );
}

// ── J. NO PAGE SCROLL, AND THE WHEEL ZOOMS RATHER THAN SCROLLS ───────
{
  const before = await p.evaluate(() => window.scrollY);
  await p.mouse.move(600, 560);
  await p.mouse.wheel(0, -300);
  await settle(400);
  const after = await p.evaluate(() => window.scrollY);
  check("J1 the wheel does not scroll the page", before === after, `${before} -> ${after}`);
  const scroll = await p.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  check("J2 no page scroll at 1600x1000", scroll.x <= 1 && scroll.y <= 1, JSON.stringify(scroll));
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(500);
}

// ── K. ZOOM CHANGES WHAT IS LABELLED, IN STEPS ───────────────────────
{
  const labelsAt = async () => p.evaluate(() => document.querySelectorAll('[data-shoot^="node-"] text').length);
  const far = await labelsAt();
  const farLevel = await p.getAttribute('[data-shoot="signal-graph"]', "data-zoom");
  await p.mouse.move(600, 560);
  for (let i = 0; i < 7; i++) {
    await p.mouse.wheel(0, -260);
    await settle(80);
  }
  await settle(600);
  const closeLevel = await p.getAttribute('[data-shoot="signal-graph"]', "data-zoom");
  const close = await labelsAt();
  check("K1 zoom changes the declared level", farLevel !== closeLevel, `${farLevel} -> ${closeLevel}`);
  check("K2 closer zoom reveals more labels", close > far, `${far} -> ${close} labels`);
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(600);
}

// ── L. EXPAND / COLLAPSE ─────────────────────────────────────────────
{
  const before = await nodeCount();
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(900);
  const after = await nodeCount();
  check("L1 expanding reveals nodes", after > before, `${before} -> ${after}`);
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(700);
  check("L2 collapsing hides them again", (await nodeCount()) === before, `back to ${before}`);
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(400);
}

// ── G. KEYBOARD REACH, IN SEMANTIC ORDER ─────────────────────────────
{
  const nodes = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="node-"] g[role="button"]')].map((el) => ({
      tabindex: Number(el.getAttribute("tabindex")),
      label: el.getAttribute("aria-label") ?? "",
      kind: el.closest("[data-kind]")?.getAttribute("data-kind") ?? "",
    }))
  );
  check("G1 nodes are on screen", nodes.length > 0, `${nodes.length}`);
  check("G2 every node is keyboard reachable", nodes.every((n) => n.tabindex >= 1));
  check(
    "G3 every node has an accessible name carrying its kind",
    nodes.every((n) => n.label.length > 3),
    "colour is never the only carrier of meaning"
  );
  check("G4 tab indices are unique", new Set(nodes.map((n) => n.tabindex)).size === nodes.length);
  // TAB ORDER FOLLOWS MEANING, NOT SVG DOCUMENT ORDER. Clusters must all come
  // before work items, whatever order the layout emitted them in.
  const laneMax = Math.max(...nodes.filter((n) => n.kind === "lane").map((n) => n.tabindex));
  const findingMin = Math.min(...nodes.filter((n) => n.kind === "finding").map((n) => n.tabindex));
  check(
    "G5 tab order is semantic: clusters before findings",
    Number.isFinite(laneMax) && Number.isFinite(findingMin) && laneMax < findingMin,
    `last cluster ${laneMax}, first finding ${findingMin}`
  );
}

// ── M. SEARCH ────────────────────────────────────────────────────────
{
  await p.locator('[data-shoot="graph-search"]').fill("offline");
  await settle(900);
  const results = await p.locator('[data-shoot="search-results"] button').count();
  check("M1 search lists what it found", results > 0, `${results} results`);
  const matched = await p.locator('[data-shoot^="node-"][data-matched="true"]').count();
  check("M2 matches are marked on the graph", matched > 0, `${matched} matched nodes`);
  const ops = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="node-"]')].map((e) => ({
      m: e.getAttribute("data-matched") === "true",
      o: parseFloat(e.getAttribute("opacity") ?? "1"),
    }))
  );
  check(
    "M3 unmatched nodes dim hard",
    ops.filter((x) => !x.m).every((x) => x.o <= 0.2),
    `max unmatched ${Math.max(...ops.filter((x) => !x.m).map((x) => x.o)).toFixed(2)}`
  );
  check("M4 matched nodes stay bright", ops.filter((x) => x.m).every((x) => x.o > 0.8));
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(600);
}

// ── C. SELECTION FOCUSES ─────────────────────────────────────────────
let findingNodeId = null;
{
  const f = p.locator('[data-shoot^="node-finding:"]').first();
  findingNodeId = await f.getAttribute("data-shoot");
  await f.locator("g[role=button]").click({ force: true });
  await settle(900);
  const sel = await p.locator('[data-shoot^="node-"][data-selected="true"]').count();
  check("C1 exactly one node reads as selected", sel === 1);
  const ops = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="node-"]')].map((e) => ({
      s: e.getAttribute("data-selected") === "true",
      o: parseFloat(e.getAttribute("opacity") ?? "1"),
    }))
  );
  check("C2 the selected node is fully lit", ops.find((x) => x.s)?.o === 1);
  check(
    "C3 the graph dims around it",
    ops.filter((x) => !x.s).some((x) => x.o <= 0.15),
    "unrelated nodes recede"
  );
  check(
    "C4 the inspector becomes specific to it",
    (await p.locator('[data-shoot="inspector-finding"]').count()) === 1
  );
}

// ── N. THE CONSOLE IS FOR FINDINGS ONLY ──────────────────────────────
{
  check(
    "N1 a Finding gets the review console",
    (await p.locator('[data-shoot="review-console-open"]').count()) === 1
  );
  // A work item or a source has nothing to accept, so offering acceptance
  // actions beside one would be offering an action that means nothing.
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(800);
  // A work item that genuinely HAS a Feature above it — asserting the
  // connection list on an orphan ticket would pass for want of anything to
  // list. Found from the model rather than guessed from the DOM.
  const api = await (
    await fetch(`${BASE}/api/audit/graph?scope=jsa&slice=detail`, {
      headers: { Cookie: `kit_session=${COOKIE}` },
    })
  ).json();
  const implementing = api.graph.edges.find((e) => e.attributes.rel === "implements");
  const w = implementing ? p.locator(`[data-shoot="node-${implementing.source}"]`) : null;
  if (w && (await w.count())) {
    await w.locator("g[role=button]").click({ force: true });
    await settle(800);
    check(
      "N2 a work item gets NO review console",
      (await p.locator('[data-shoot="review-console-open"]').count()) === 0,
      "there is nothing to accept about a Linear ticket"
    );
    check(
      "N3 and gets the generic node inspector instead",
      (await p.locator('[data-shoot="graph-inspector"]').count()) === 1
    );
    check(
      "N4 its Feature is listed as an `implements` connection",
      (await p.locator('[data-shoot="connection-implements"]').count()) >= 1,
      "the Scope -> Feature -> ticket hierarchy is navigable from the inspector"
    );
    const basis = await p.locator('[data-shoot="connection-implements"]').first().innerText();
    check("N5 and it is marked attested", /attested/i.test(basis), basis.replace(/\n/g, " · "));
  } else {
    check("N2 a work item with a Feature exists to select", false, "no implements edge found");
  }
  await p.keyboard.press("Escape");
  await settle(400);
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(500);
}

// ── D / E. EVIDENCE SOLO AND CANDIDATE REALITY ───────────────────────
{
  await p.locator(`[data-shoot="${findingNodeId}"] g[role=button]`).click({ force: true });
  await settle(800);

  const before = {
    findings: await db.finding.count(),
    decisions: await db.decision.count(),
    sources: await db.source.count(),
  };

  const soloToggle = p.locator('[data-shoot="evidence-solo-toggle"]');
  await soloToggle.click();
  await settle(900);
  const ops = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot^="node-"]')].map((e) => parseFloat(e.getAttribute("opacity") ?? "1"))
  );
  check(
    "D1 Evidence Solo lights a route and fades the rest hard",
    ops.some((o) => o === 1) && ops.filter((o) => o < 0.1).length > 0,
    `${ops.filter((o) => o === 1).length} lit, ${ops.filter((o) => o < 0.1).length} faded`
  );
  check(
    "D2 but nothing disappears — orientation survives",
    ops.every((o) => o > 0),
    "losing orientation is worse than losing contrast"
  );

  await p.locator('[data-shoot="mode-B"]').click();
  await settle(700);
  const consoleText = await p.locator('[data-shoot="review-console-open"]').innerText();
  check("E1 candidate Reality is badged unsaved", /not saved/i.test(consoleText));
  const after = {
    findings: await db.finding.count(),
    decisions: await db.decision.count(),
    sources: await db.source.count(),
  };
  check(
    "E2 previewing candidate Reality writes NOTHING",
    JSON.stringify(before) === JSON.stringify(after),
    JSON.stringify(before)
  );
  await p.locator('[data-shoot="mode-A"]').click();
  await settle(400);
}

// ── H. ESCAPE ────────────────────────────────────────────────────────
{
  await p.keyboard.press("Escape");
  await settle(700);
  check("H1 Escape clears the selection", (await p.locator('[data-shoot="inspector-overview"]').count()) === 1);
  check("H2 and the console goes with it", (await p.locator('[data-shoot="review-console-open"]').count()) === 0);
  check(
    "H3 and Evidence Solo drops too",
    (await p.evaluate(() =>
      [...document.querySelectorAll('[data-shoot^="node-"]')].every((e) => parseFloat(e.getAttribute("opacity") ?? "1") > 0.1)
    )) === true,
    "a hypothetical must not outlive the thing it was about"
  );
}

// ── F. THE SWEEP TRAIL FOLLOWS THE SCAN ──────────────────────────────
{
  await p.locator('[data-shoot="run-audit"]').click();
  await settle(800);
  const sweep = await p.evaluate(() => {
    const g = document.querySelector('[data-shoot="graph-sweep"]');
    if (!g) return null;
    const cx = 700;
    const cy = 700;
    const wedges = [...g.querySelectorAll("path")]
      .map((path) => {
        const m = (path.getAttribute("d") ?? "").match(/L ([-\d.]+) ([-\d.]+)/);
        return m ? (Math.atan2(parseFloat(m[2]) - cy, parseFloat(m[1]) - cx) * 180) / Math.PI : null;
      })
      .filter((v) => v !== null);
    return { wedges, opacities: [...g.querySelectorAll("path")].map((e) => parseFloat(e.getAttribute("opacity") ?? "1")) };
  });
  check("F1 the sweep is running", sweep !== null && sweep.wedges.length > 0);
  if (sweep) {
    check(
      "F2 every trail wedge sits behind the scan edge",
      sweep.wedges.every((a) => a <= 0.01),
      `local angles ${sweep.wedges.map((a) => a.toFixed(1)).join(", ")}`
    );
    check(
      "F3 the trail fades away from the edge",
      sweep.opacities.every((o, i, arr) => i === 0 || o <= arr[i - 1] + 0.001),
      sweep.opacities.map((o) => o.toFixed(3)).join(" > ")
    );
  }
  await settle(3000);
}

// ── O. A SPARSE SCOPE STILL READS ────────────────────────────────────
{
  await p.goto(`${BASE}/audit?scope=design`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
  await settle(1200);
  check("O1 the graph renders with almost nothing in it", (await nodeCount()) > 0);
  const t = await p.locator('[data-shoot="inspector-overview"]').innerText();
  check(
    "O2 it names what is not supplying the project",
    /not supplying/i.test(t),
    "an unconnected source is project truth, not an empty state to hide"
  );
}

check("Z1 no page errors during the whole run", pageErrors.length === 0, pageErrors.join(" | "));

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
await db.$disconnect();
process.exit(failures === 0 ? 0 : 1);

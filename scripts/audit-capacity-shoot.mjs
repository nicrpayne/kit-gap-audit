// CAPACITY — THE BROWSER PASS.
//
// The Capacity sector was the thinnest thing on the field: one puck and one
// checkpoint. The claim now is that it holds real people with real numbers —
// and, just as importantly, that it does NOT claim what any of them is
// working on. Both are checked here.
//
//   node scripts/audit-capacity-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/cap-shots";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

const settle = (ms = 450) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1560, 960); await settle(250); };
const fit = async () => { await p.locator('[data-shoot="camera-fit"]').click(); await settle(700); };
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log(`      shot ${n}`); };
const tier = () => p.getAttribute('[data-shoot="signal-graph"]', "data-zoom");
const cam = () => p.evaluate(() => {
  const s = document.querySelector('[data-shoot="signal-graph"]');
  const v = s.viewBox.baseVal;
  return { x: +(v.x + v.width / 2).toFixed(2), y: +(v.y + v.height / 2).toFixed(2), k: +(s.getBoundingClientRect().width / v.width).toFixed(4) };
});
const P = '[data-shoot^="node-person:"]';
const zoomTo = async (want) => {
  await p.mouse.move(700, 500);
  for (let i = 0; i < 40 && (await tier()) !== want; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(28); }
  await settle(450);
};

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1800);
await park();

// ── 1. FAR — the sector has population ───────────────────────────────
{
  const n = await p.locator(P).count();
  const identity = await p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.getAttribute("data-identity")), P);
  const labels = await p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.querySelector("text")).length, P);
  await shot("01-far");
  check("1. four people are on the field at far zoom", n === 4, `${n} person nodes`);
  check("1b. as formed marks, unlabelled", labels === 0 && identity.every((i) => i === "formed"), `${labels} labels, identity ${[...new Set(identity)].join("/")}`);
}

// ── 2. MEDIUM — they resolve ─────────────────────────────────────────
{
  await zoomTo("medium");
  await park();
  await shot("02-medium");
  const names = await p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.querySelector("text")?.textContent ?? null).filter(Boolean), P);
  check("2. all four resolve to names at medium", names.length === 4, names.join(" · "));
  await fit();
}

// ── 3. CLOSE — the Capacity sector, read up close ────────────────────
{
  // Capacity owns the sector at due east: -90 + 2*45 = 0 degrees.
  const pt = await p.evaluate(() => {
    const svg = document.querySelector('[data-shoot="signal-graph"]');
    const vb = svg.viewBox.baseVal;
    const r = svg.getBoundingClientRect();
    const wx = 700 + 470, wy = 700;
    return { x: r.left + ((wx - vb.x) / vb.width) * r.width, y: r.top + ((wy - vb.y) / vb.height) * r.height };
  });
  await p.mouse.move(pt.x, pt.y);
  for (let i = 0; i < 20 && (await tier()) !== "close"; i++) { await p.mouse.wheel(0, -140); await p.waitForTimeout(30); }
  await settle(500);
  const t = await tier();
  const n = await p.locator(P).count();
  const named = await p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.querySelector("text")).length, P);
  await park();
  await shot("03-close-capacity");
  check("3. the Capacity sector is readable at close zoom", t === "close" && n === 4 && named === 4, `tier ${t}, ${n} people, ${named} named`);
  await fit();
}

// ── 4 & 5. SEARCH, THEN SELECT ───────────────────────────────────────
{
  await p.locator('[data-shoot="graph-search"]').fill("Sam");
  await settle(700);
  const rows = await p.evaluate(() => [...document.querySelectorAll('[data-shoot="search-results"] button')].map((e) => e.textContent ?? ""));
  await park();
  await shot("04-search-sam");
  const personRow = rows.find((r) => r.includes("Person"));
  check("4. searching a name finds the Person, labelled as one", !!personRow, personRow ? `"${personRow.trim()}"` : rows.join(" | "));
  // Deterministic substring search, working exactly as designed: "Sam" also
  // matches "two devices editing the SAMe JSA" inside a requirement, and that
  // row sorts first. The kind label on each row is what tells them apart,
  // which is why the row is chosen by kind here rather than by position.
  check(
    "4b. and the results say which kind each one is",
    rows.length > 1 && rows.some((r) => r.includes("Requirement")),
    `${rows.length} results: ${rows.map((r) => r.replace(/\s+/g, " ").trim()).join(" | ")}`
  );

  const before = await cam();
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-shoot="search-results"] button')].find((e) => (e.textContent ?? "").includes("Person"));
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle(900);
  const after = await cam();
  // THIS USED TO ASSERT A FLIGHT, AND THE FLIGHT WAS THE DEFECT.
  //
  // A search result forced roughly 230% zoom, so finding a person threw away
  // whatever view of the project the reader had built. Selection source must
  // not change camera semantics: a result is now framed by the same law a
  // direct click uses, which at Fit — where the whole field is visible —
  // means the camera does not move at all.
  const settledStill = Math.abs(after.k - before.k) < 0.005 && Math.hypot(after.x - before.x, after.y - before.y) < 1;
  check(
    "5. choosing the result frames them under the same law a click uses — no forced zoom",
    settledStill,
    `k ${before.k} → ${after.k} at Fit, where they are already visible`
  );
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(400);
  await park();
  await shot("05-sam-selected");
}

// ── 6 & 7. THE INSPECTOR ─────────────────────────────────────────────
{
  const t = await p.locator('[data-shoot="graph-inspector"]').innerText();
  check("6. the inspector calls them a Person", /^PERSON/im.test(t), t.split("\n")[0]);
  check("6b. and shows their share of this project", /60%/.test(t), "Sam Ortiz is JSA 60%");
  check("6c. and names the other commitment as context", /design/i.test(t) && /40%/.test(t), "Design 40% — why the switch factor is what it is");
  check("6d. and marks them as split", /split across 2 projects/i.test(t));
  check(
    "7. the context-switch factor matches the capacity engine",
    /×0\.88/.test(t) && /12%/.test(t),
    "0.88 = 1 − 12% × 1 extra project, from lib/capacity/resolve.ts"
  );
  check("7b. and the effective FTE is shown", /0\.53 FTE|0\.52 FTE/.test(t), "0.6 × 1.0 × 0.88 = 0.528");
  check(
    "7c. the person→work gap is stated, not hidden",
    /no grounded link from a person to a Feature or a ticket/i.test(t),
    "the question everyone will ask, answered honestly"
  );
  const conns = await p.evaluate(() => [...document.querySelectorAll('[data-shoot="graph-inspector"] button')].map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()));
  check("7d. the allocation connection carries its share", conns.some((c) => /allocated to/i.test(c) && /60%/.test(c)), conns.find((c) => /allocated to/i.test(c)) ?? conns.slice(0, 3).join(" | "));
}

// ── 9. NO PERSON → TICKET EDGE, DESPITE MATCHING NAMES ───────────────
{
  const joined = await p.evaluate(() => {
    const rels = [...document.querySelectorAll("[data-rel]")];
    return rels.filter((e) => /assigned/i.test(e.getAttribute("data-rel") ?? "")).length;
  });
  const drawnRels = await p.evaluate(() => [...new Set([...document.querySelectorAll("[data-rel]")].map((e) => e.getAttribute("data-rel")))]);
  check(
    "9. no person→ticket edge is drawn, though every name matches an assignee",
    joined === 0 && !drawnRels.includes("assigned_to"),
    `relations on screen: ${drawnRels.join(", ")}`
  );
  await p.keyboard.press("Escape");
  await settle(400);
}

// ── 8. BACK TO THE WHOLE GRAPH ───────────────────────────────────────
{
  await fit();
  await park();
  const sel = await p.locator('[data-shoot^="node-"][data-selected="true"]').count();
  const n = await p.locator('[data-shoot^="node-"]').count();
  const c = await cam();
  check("8. clearing returns the resting world", sel === 0 && Math.abs(c.k - 0.72) < 0.005, `${sel} selected, k=${c.k}`);
  // Derived from the API rather than hardcoded — see the same note in the
  // requirements shoot.
  const total = (await (await fetch(`${BASE}/api/audit/graph?scope=jsa&slice=detail`, { headers: { Cookie: `kit_session=${COOKIE}` } })).json()).graph.nodes.length;
  check("8b. with every node on the field", n + 1 === total, `${n} marks + the Reality hero = ${total}`);
}

// ── 10. DESIGN — Sam at their Design share, not their JSA one ────────
{
  await p.goto(`${BASE}/audit?scope=design`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
  await settle(1500);
  const n = await p.locator(P).count();
  check("10. Design shows only its own one person", n === 1, `${n} person nodes`);
  await p.evaluate((s) => document.querySelector(`${s} g[role="button"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })), P);
  await settle(800);
  const t = await p.locator('[data-shoot="graph-inspector"]').innerText();
  check("10b. at their Design share, with JSA as the context", /40%/.test(t) && /jsa/i.test(t) && /60%/.test(t), "same person, other side of the split");
  await park();
  await shot("06-design-capacity");
  await p.keyboard.press("Escape");
}

// ── 11. UNSTAFFED SCOPES STAY HONEST ─────────────────────────────────
{
  for (const scope of ["platform", "itrack"]) {
    await p.goto(`${BASE}/audit?scope=${scope}`, { waitUntil: "networkidle" });
    await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
    await settle(1300);
    const n = await p.locator(P).count();
    check(`11. ${scope} has no Allocation rows and shows no people`, n === 0, `${n} person nodes`);
    if (scope === "platform") { await park(); await shot("07-unstaffed-capacity"); }
  }
}

check("12. no page errors during the whole run", errs.length === 0, errs.join(" | "));
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);

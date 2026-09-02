// REQUIREMENTS — THE BROWSER PASS.
//
// The claim this tranche makes is not "there are two more nodes". It is that
// a requirement is a DIFFERENT KIND OF THING from the source it came from,
// and that Signal can say "I have no link to execution" without saying
// "nobody built it". Both are claims about what is on screen, so both are
// checked here rather than only in the model.
//
//   node scripts/audit-requirements-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/req-shots";
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
const reqSel = '[data-shoot^="node-requirement:"]';
const zoomTo = async (want) => {
  await p.mouse.move(700, 500);
  for (let i = 0; i < 40 && (await tier()) !== want; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(28); }
  await settle(450);
};

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1800);
await park();

// ── 1. FAR — structural mass, no labels ──────────────────────────────
{
  const n = await p.locator(reqSel).count();
  const labels = await p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.querySelector("text")).length, reqSel);
  const identity = await p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.getAttribute("data-identity")), reqSel);
  await shot("01-far");
  check("1. Requirements are on the field at far zoom", n === 2, `${n} requirement nodes`);
  check("1b. drawn as formed structure, unlabelled", labels === 0 && identity.every((i) => i === "formed"), `${labels} labels, identity ${[...new Set(identity)].join("/")}`);
}

// ── 2. MEDIUM — identity resolves ────────────────────────────────────
{
  await zoomTo("medium");
  await park();
  await shot("02-medium");
  const labels = await p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.querySelector("text")?.textContent ?? null), reqSel);
  check("2. Requirement identity resolves at medium", labels.filter(Boolean).length === 2, labels.filter(Boolean).map((t) => `"${t}"`).join(" · "));
  await fit();
}

// ── 3. CLOSE — statement and source detail readable ──────────────────
{
  await zoomTo("close");
  await park();
  await shot("03-close");
  check("3. and stays named at close", (await p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.querySelector("text")).length, reqSel)) === 2);
  await fit();
}

// ── 4. SEARCH names it a Requirement ─────────────────────────────────
{
  await p.locator('[data-shoot="graph-search"]').fill("offline");
  await settle(700);
  const rows = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot="search-results"] button')].map((e) => e.textContent ?? "")
  );
  await park();
  await shot("04-search-offline");
  const reqRow = rows.find((r) => r.includes("Requirement"));
  check("4. searching finds the Requirement, labelled as one", !!reqRow, reqRow ? `"${reqRow.trim()}"` : rows.join(" | "));
  // Searching the full statement, not just the truncated label.
  await p.locator('[data-shoot="graph-search"]').fill("field pilot");
  await settle(600);
  const deep = await p.locator(`${reqSel}[data-matched="true"]`).count();
  check("4b. and matches text past the end of the trimmed label", deep === 1, `${deep} requirement matched on "field pilot"`);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(400);
  await fit();
}

// ── 5 & 6. SELECT — smooth focus, honest inspector ───────────────────
{
  const before = await cam();
  await p.evaluate((s) => document.querySelector(`${s} g[role="button"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })), reqSel);
  await settle(800);
  const after = await cam();
  check("5. selecting a Requirement does not move the camera", Math.abs(before.k - after.k) < 0.001 && Math.abs(before.x - after.x) < 0.5, `k ${before.k} → ${after.k}`);
  await park();
  await shot("05-selected-requirement");

  const t = await p.locator('[data-shoot="graph-inspector"]').innerText();
  check("6. the inspector calls it a Requirement", /^REQUIREMENT/im.test(t), t.split("\n")[0]);
  check("6b. and names its source role", /requirements_of_record/i.test(t));
  check("6c. and its source status, unvarnished", /candidate/i.test(t), "the JSA requirements source is a candidate, not accepted policy");
  check("6d. and says it is not registered", /not registered/i.test(t));
  check(
    "6e. and reports NO GROUNDED LINK rather than 'not implemented'",
    /no grounded implementation link/i.test(t) && !/not implemented/i.test(t),
    "absence of a link is a gap in what Signal was told, not evidence nobody built it"
  );
  check("6f. and says so in words", /not evidence that nobody built it/i.test(t));
  check("6g. it reports the producer's own status as theirs", /committed/i.test(t));
}

// ── 7. PROVENANCE — Requirement → Passage → Source ───────────────────
{
  const conns = await p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot="graph-inspector"] button')].map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim())
  );
  const toPassage = conns.find((c) => /evidenced by/i.test(c));
  check("7. the inspector offers the passage it was read from", !!toPassage, toPassage ?? conns.slice(0, 4).join(" | "));

  // Walk it: requirement → passage → source.
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('[data-shoot="graph-inspector"] button')].find((e) => /evidenced by/i.test(e.textContent ?? ""));
    b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle(800);
  const passageText = await p.locator('[data-shoot="graph-inspector"]').innerText();
  const onPassage = /^EVIDENCE PASSAGE/im.test(passageText);
  await park();
  await shot("06-requirement-provenance");
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('[data-shoot="graph-inspector"] button')].find((e) => /extracted from/i.test(e.textContent ?? ""));
    b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle(800);
  const sourceText = await p.locator('[data-shoot="graph-inspector"]').innerText();
  check(
    "7b. and the chain walks through to the Source",
    onPassage && /^SOURCE/im.test(sourceText) && /JSA delivery scope/i.test(sourceText),
    "Requirement → Passage → Source, three nodes, never collapsed into one"
  );
  await p.keyboard.press("Escape");
  await settle(400);
  await fit();
}

// ── 8. A FINDING THAT CONCERNS IT ────────────────────────────────────
{
  await p.evaluate((s) => document.querySelector(`${s} g[role="button"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })), reqSel);
  await settle(700);
  const findings = await p.locator('[data-shoot="requirement-finding"]').count();
  check("8. the Requirement lists the Findings that concern it", findings === 2, `${findings} findings`);
  await p.locator('[data-shoot="requirement-finding"]').first().click();
  await settle(900);
  const t = await p.locator('[data-shoot="inspector"]').innerText();
  await park();
  await shot("07-finding-concerning-requirement");
  check("8b. and selecting one opens that Finding", /finding|decision|contradiction|missing/i.test(t), t.split("\n")[0]);
}

// ── 9. EVIDENCE SOLO reaches the requirement's provenance ────────────
{
  const solo = p.locator('[data-shoot="evidence-solo-toggle"]');
  if (await solo.count()) {
    await solo.click();
    await settle(900);
    const lit = await p.evaluate(() =>
      [...document.querySelectorAll('[data-shoot^="node-"]')]
        .filter((e) => parseFloat(e.getAttribute("opacity") || "1") > 0.5)
        .map((e) => e.getAttribute("data-kind"))
    );
    await park();
    await shot("08-evidence-solo");
    check("9. Evidence Solo lights the requirement's provenance", lit.includes("requirement") && lit.includes("passage"), `lit: ${[...new Set(lit)].join(", ")}`);
    check("9b. and still never reaches Reality", !lit.includes("reality"), "solo explains a claim, it does not explain Reality");
    await solo.click();
    await settle(400);
  } else {
    check("9. Evidence Solo available on the selected finding", false, "no solo toggle — the selected node is not a finding");
  }
}

// ── 10. CLEAR — the world comes back ─────────────────────────────────
{
  await p.keyboard.press("Escape");
  await settle(400);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await fit();
  await park();
  const sel = await p.locator('[data-shoot^="node-"][data-selected="true"]').count();
  const matched = await p.locator('[data-shoot^="node-"][data-matched="true"]').count();
  const c = await cam();
  const n = await p.locator('[data-shoot^="node-"]').count();
  check("10. clearing returns the graph to its resting world", sel === 0 && matched === 0 && Math.abs(c.k - 0.72) < 0.005 && Math.abs(c.x - 700) < 2, `${sel} selected, ${matched} matched, k=${c.k}`);
  // Derived, not hardcoded: this number grows with every enrichment tranche,
  // and a literal here would go stale silently the next time it does.
  const total = (await (await fetch(`${BASE}/api/audit/graph?scope=jsa&slice=detail`, { headers: { Cookie: `kit_session=${COOKIE}` } })).json()).graph.nodes.length;
  check("10b. with every node still on the field", n + 1 === total, `${n} marks + the Reality hero = ${total}`);
  await shot("09-back-to-rest");
}

// ── SPARSE SCOPE — no invented requirements ──────────────────────────
{
  await p.goto(`${BASE}/audit?scope=design`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
  await settle(1400);
  const n = await p.locator(reqSel).count();
  check("11. a Scope with no requirements source shows none", n === 0, `${n} requirement nodes on Design`);
}

check("12. no page errors during the whole run", errs.length === 0, errs.join(" | "));
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);

// DIRECT MANIPULATION — THE ACCEPTANCE SESSION.
//
// Ten things a person actually does to this graph, driven as real input in a
// real browser, each one checked for the specific way it used to go wrong.
// The proofs next door assert laws; this asks whether the instrument
// survives being handled.
//
//   node scripts/audit-manipulation-check.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/manip";
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
const fit = async () => { await p.locator('[data-shoot="camera-fit"]').click(); await settle(650); };
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log(`      shot ${n}`); };
const cam = () => p.evaluate(() => {
  const s = document.querySelector('[data-shoot="signal-graph"]');
  const v = s.viewBox.baseVal;
  return { x: +(v.x + v.width / 2).toFixed(2), y: +(v.y + v.height / 2).toFixed(2), k: +(s.getBoundingClientRect().width / v.width).toFixed(4) };
});
const tier = () => p.getAttribute('[data-shoot="signal-graph"]', "data-zoom");
const sane = (c) => Number.isFinite(c.x) && Number.isFinite(c.y) && c.k > 0.3 && c.k < 4.6 && Math.abs(c.x) < 1e5 && Math.abs(c.y) < 1e5;

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1800);
await park();

// ── 1 & 2. CREEP ACROSS EACH BOUNDARY ────────────────────────────────
// Trackpad-sized steps, the way a hand actually crosses a threshold.
for (const [target, label, n] of [[1.05, "far/medium", 1], [2.1, "medium/close", 2]]) {
  await fit();
  await p.mouse.move(700, 500);
  for (let i = 0; i < 90; i++) {
    if ((await cam()).k >= target * 0.99) break;
    await p.mouse.wheel(0, -30);
    await p.waitForTimeout(14);
  }
  await settle(300);
  const seen = await p.evaluate(async () => {
    const svg = document.querySelector('[data-shoot="signal-graph"]');
    const t = [];
    for (let i = 0; i < 30; i++) {
      svg.dispatchEvent(new WheelEvent("wheel", { deltaY: i % 3 === 0 ? 9 : -6, clientX: 700, clientY: 500, bubbles: true, cancelable: true }));
      await new Promise((r) => requestAnimationFrame(r));
      t.push(svg.getAttribute("data-zoom"));
    }
    let f = 0;
    for (let i = 1; i < t.length; i++) if (t[i] !== t[i - 1]) f++;
    return { flips: f, tiers: [...new Set(t)].join("/") };
  });
  check(`${n}. creeping across the ${label} boundary does not chatter`, seen.flips <= 1, `${seen.flips} tier changes over 30 steps (${seen.tiers})`);
}

// ── 3. FAR → CLOSE → FAR, FAST ───────────────────────────────────────
{
  await fit();
  await p.mouse.move(700, 500);
  const t0 = Date.now();
  for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, -200); await p.waitForTimeout(12); }
  const deep = await cam();
  const deepTier = await tier();
  for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(12); }
  await settle(300);
  const back = await cam();
  check("3. a fast far → close → far sweep leaves the camera sane", sane(deep) && sane(back) && deepTier === "close", `close at k=${deep.k}, back at k=${back.k} (${await tier()}) in ${Date.now() - t0}ms`);
}

// ── 4. PAN WHILE ZOOMING ─────────────────────────────────────────────
{
  await fit();
  await p.mouse.move(700, 500);
  await p.mouse.down();
  for (let i = 0; i < 14; i++) {
    await p.mouse.move(700 + i * 9, 500 + i * 5);
    if (i % 3 === 0) await p.mouse.wheel(0, -70);
  }
  await p.mouse.up();
  await settle(400);
  const c = await cam();
  check("4. panning and zooming at once leaves the camera sane", sane(c), `k=${c.k} at (${Math.round(c.x)}, ${Math.round(c.y)})`);
}

// ── 5. RAPID CLICKING ────────────────────────────────────────────────
{
  await fit();
  const ids = await p.evaluate(() => [...document.querySelectorAll('[data-shoot^="node-"]:not([data-identity="latent"]) g[role="button"]')].slice(0, 6).map((e) => e.closest("[data-shoot]").getAttribute("data-shoot")));
  const before = await cam();
  for (const id of ids) {
    await p.evaluate((s) => document.querySelector(`[data-shoot="${s}"] g[role="button"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })), id);
    await p.waitForTimeout(70);
  }
  await settle(400);
  const sel = await p.locator('[data-shoot^="node-"][data-selected="true"]').count();
  const after = await cam();
  check("5. six clicks in half a second leave exactly one selection", sel === 1, `${sel} selected across ${ids.length} rapid clicks`);
  check("5b. and never move the camera", Math.abs(before.k - after.k) < 0.001 && Math.abs(before.x - after.x) < 0.5, `k ${before.k} → ${after.k}`);
  await p.keyboard.press("Escape");
  await settle(300);
}

// ── 6. SEARCH, THEN CHOOSE A RESULT ──────────────────────────────────
{
  await fit();
  await p.locator('[data-shoot="graph-search"]').fill("offline");
  await settle(650);
  await park();
  await shot("01-search-before-focus");
  const before = await cam();
  await p.locator('[data-shoot="search-results"] button').first().click();
  await settle(700);
  const after = await cam();
  await park();
  await shot("02-search-after-focus");
  check("6. choosing a search result flies to it", Math.abs(after.k - before.k) > 0.1 || Math.hypot(after.x - before.x, after.y - before.y) > 20, `k ${before.k} → ${after.k}`);
}

// ── 7. INTERRUPT A FLY-TO WITH A PAN ─────────────────────────────────
{
  await p.locator('[data-shoot="graph-search"]').fill("");
  await p.keyboard.press("Escape");
  await fit();
  await p.locator('[data-shoot="graph-search"]').fill("offline");
  await settle(600);
  await p.locator('[data-shoot="search-results"] button').first().click();
  await p.waitForTimeout(80); // mid-flight
  await p.mouse.move(700, 500);
  await p.mouse.down();
  await p.mouse.move(820, 580);
  await p.mouse.up();
  const grabbed = await cam();
  await p.waitForTimeout(600);
  const later = await cam();
  await park();
  await shot("03-flyto-interrupted-by-pan");
  check("7. a pan takes the camera off a running fly-to and keeps it", Math.abs(later.x - grabbed.x) < 1 && Math.abs(later.y - grabbed.y) < 1 && Math.abs(later.k - grabbed.k) < 0.005, `held at (${Math.round(later.x)}, ${Math.round(later.y)}) k=${later.k}`);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await p.keyboard.press("Escape");
  await settle(300);
}

// ── 8. INTERRUPT A FLY-TO WITH A ZOOM ────────────────────────────────
{
  await fit();
  await p.locator('[data-shoot="graph-search"]').fill("SOF");
  await settle(600);
  await p.locator('[data-shoot="search-results"] button').first().click();
  await p.waitForTimeout(80);
  await p.mouse.move(700, 500);
  await p.mouse.wheel(0, 240);
  const grabbed = await cam();
  await p.waitForTimeout(600);
  const later = await cam();
  check("8. a wheel zoom takes the camera off a running fly-to", Math.abs(later.k - grabbed.k) < 0.005 && Math.abs(later.x - grabbed.x) < 1, `held at k=${later.k}`);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await p.keyboard.press("Escape");
  await settle(300);
}

// ── 9. EXPAND, THEN INTERACT BEFORE IT LANDS ─────────────────────────
{
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
  await settle(400);
  await p.locator('[data-shoot="cluster-toggle-linear"]').click({ force: true });
  await p.waitForTimeout(70); // the tween is still running
  await p.evaluate(() => document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await p.waitForTimeout(60);
  const grabbed = await cam();
  await p.waitForTimeout(600);
  const later = await cam();
  const sel = await p.locator('[data-shoot^="node-"][data-selected="true"]').count();
  const opened = await p.locator('[data-shoot^="node-work:"]:not([data-identity="latent"])').count();
  check("9. clicking mid-expansion is heard, and stops the camera", sel === 1 && Math.abs(later.k - grabbed.k) < 0.005, `${sel} selected, camera held at k=${later.k}`);
  check("9b. and the expansion still completed", opened > 0, `${opened} work items identified`);
  await p.keyboard.press("Escape");
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// ── 10. FIT DURING AN ACTIVE TWEEN ───────────────────────────────────
{
  await p.locator('[data-shoot="cluster-toggle-linear"]').click({ force: true });
  await p.waitForTimeout(80);
  await p.locator('[data-shoot="camera-fit"]').click();
  await p.waitForTimeout(700);
  const c = await cam();
  check("10. Fit during a tween retargets cleanly to home", Math.abs(c.x - 700) < 2 && Math.abs(c.y - 700) < 2 && Math.abs(c.k - 0.72) < 0.005, `(${Math.round(c.x)}, ${Math.round(c.y)}) k=${c.k}`);
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// ── STABLE STATES, FOR THE RECORD ────────────────────────────────────
// Each sample re-aims at the field first: parking the pointer for a clean
// screenshot leaves it over the inspector, where wheel events belong to the
// panel and never reach the graph.
{
  // Zooms until the tier arrives rather than guessing a notch count: the
  // browser's effective wheel delta is not the number Playwright is handed,
  // so "three notches" is not a scale.
  const sample = async (name, want) => {
    await p.mouse.move(700, 500);
    for (let i = 0; i < 40 && (await tier()) !== want; i++) {
      await p.mouse.wheel(0, -120);
      await p.waitForTimeout(28);
    }
    await settle(500);
    const k = (await cam()).k;
    const t = await tier();
    await park();
    await shot(name);
    check(`${name} reads as ${want}`, t === want, `tier ${t} at k=${k}`);
  };
  await fit();
  await park();
  await shot("04-stable-far");
  check("04-stable-far reads as far", (await tier()) === "far", `tier ${await tier()} at k=${(await cam()).k}`);
  await sample("05-stable-medium", "medium");
  await sample("06-stable-close", "close");
  await fit();
}

// ── PAGE HEALTH ──────────────────────────────────────────────────────
{
  const s = await p.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, y: document.documentElement.scrollHeight - window.innerHeight }));
  check("11. no page scroll after the whole session", s.x <= 1 && s.y <= 1, JSON.stringify(s));
  check("12. no page errors after the whole session", errs.length === 0, errs.join(" | "));
  const c = await cam();
  check("13. the camera is still sane at the end", sane(c), `k=${c.k} at (${Math.round(c.x)}, ${Math.round(c.y)})`);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);

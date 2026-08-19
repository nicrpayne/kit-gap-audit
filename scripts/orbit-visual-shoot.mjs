// THE FIVE STATES, ON THE REAL PROJECT.
//
// Every one is reached by looking at a real project, pulling a Scenario
// lever that already exists, or changing a real stored input and putting it
// back. Nothing is staged, and no appearance state exists independently of
// the data behind it.
//
//   node scripts/orbit-visual-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "/tmp/orbit-visual";
mkdirSync(out, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1680, height: 1050 } });
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

let writes = 0;
await p.route("**/*", (r) => {
  if (r.request().method() !== "GET" && !/portfolio-settings|decisions/.test(r.request().url())) writes += 1;
  r.continue();
});

const settle = (ms = 900) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1672, 1042); await settle(400); };
const shot = async (n) => { await park(); await p.screenshot({ path: `${out}/${n}.png` }); console.log("  shot", n); };
const centre = () => p.locator('[data-shoot="orbit-centre-p50"]').evaluate((e) => e.textContent.trim());
const reopen = async () => {
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll("[data-orbit-node]").length > 0, { timeout: 30000 });
  await settle(2600);
};
const focus = async (id) => { await p.click(`[data-shoot="orbit-focus-${id}"]`); await settle(1500); };
const clear = async () => {
  const d = p.locator('[data-shoot="scenario-strip"] >> text=/back to reality/i').first();
  if ((await d.count()) > 0 && (await d.isEnabled())) { await d.click(); await settle(1700); }
};
const setSwitch = async (pct) =>
  fetch(`${BASE}/api/portfolio-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contextSwitchCostPct: pct }),
  });

const original = (await (await fetch(`${BASE}/api/portfolio-settings`)).json()).settings.contextSwitchCostPct;
await reopen();

// ── STATE 1 — BALANCED ─────────────────────────────────────────────────
// iTrack: work in three capabilities, no unanswered decision holding it,
// and enough people that the date is not in doubt. Nothing to shout about,
// and the picture is quiet.
await focus("itrack");
await shot("01-balanced");
console.log("  balanced:", await centre());

// ── STATE 2 — DECISION CHOKE ───────────────────────────────────────────
// JSA: two real unanswered decisions clamped across everything the project
// has. Every capability's work is visibly pinched where it crosses them.
await focus("jsa");
await shot("02-decision-choke");
const choked = await centre();
console.log("  choke:", choked);

// …and the same, with the obstruction explained.
await p.locator('[data-orbit-kind="gate"]').first().click();
await settle(900);
await shot("02b-decision-choke-inspected");
await p.click('[data-shoot="orbit-field"]', { position: { x: 12, y: 12 } });
await settle(700);

// ── STATE 3 — CAPACITY STARVATION ──────────────────────────────────────
// Driven by the real context-switch cost, which is Portfolio's own stored
// dial — and put back afterwards. Two captures, because starvation has two
// things to prove:
//
//   Design, where one split person IS the whole team, so most of the
//   capacity genuinely stops arriving and the channel runs visibly hollow;
//
//   JSA, the same project as the choke above, with the same objects in the
//   same places — the difference is entirely material.
await setSwitch(60);
await reopen();
await focus("design");
await shot("03-capacity-starvation");
await p.locator('[data-orbit-kind="capacity"]').click();
await settle(900);
await shot("03b-capacity-starvation-inspected");
console.log("  starved (design):", await centre());
await p.click('[data-shoot="orbit-field"]', { position: { x: 12, y: 12 } });
await settle(600);
await focus("jsa");
await shot("03c-same-shape-less-arriving");
console.log("  starved (jsa, same topology as 02):", await centre());
await setSwitch(original);
await reopen();

// ── STATE 4 — SCOPE HEAVY ──────────────────────────────────────────────
// Design: one capability carrying more than half the remaining work, and
// no target to measure it against. The release itself is the constraint.
await focus("design");
await shot("04-scope-heavy");
await p.locator('[data-orbit-kind="capability"]').first().click();
await settle(900);
await shot("04b-scope-heavy-inspected");
console.log("  scope heavy:", await centre());
await p.click('[data-shoot="orbit-field"]', { position: { x: 12, y: 12 } });
await settle(600);

// ── STATE 5 — SCENARIO RELIEF ──────────────────────────────────────────
// Decision choke, then both decisions assumed answered. The clamps open,
// the work gets through, the date moves, and Reality stays on screen as
// the thing the new date is being compared against.
await focus("jsa");
{
  const gates = p.locator('[data-orbit-kind="gate"]');
  const n = await gates.count();
  for (let i = 0; i < n; i += 1) {
    const g = gates.nth(i);
    const id = await g.getAttribute("data-orbit-node");
    if ((await g.getAttribute("data-gate-state")) !== "clamped") continue;
    await g.click();
    await settle(500);
    await p.click(`[data-shoot="orbit-assume-${id}"]`);
    await settle(1500);
  }
  await p.click('[data-shoot="orbit-field"]', { position: { x: 12, y: 12 } });
  await settle(1400);
  await shot("05-scenario-relief");
  console.log(`  relief: ${choked} → ${await centre()}`);
}

// ── SUPPORTING ─────────────────────────────────────────────────────────
await clear();
await focus("jsa");
{
  const cand = p.locator('[data-orbit-node][data-candidate="true"]').first();
  if ((await cand.count()) > 0) { await cand.click(); await settle(900); await shot("06-candidate-inert"); }
  await p.click('[data-shoot="orbit-field"]', { position: { x: 12, y: 12 } });
  await settle(600);
  await p.locator('[data-orbit-kind="forecast"]').click();
  await settle(900);
  await shot("07-forecast-selected");
  await p.click('[data-shoot="orbit-field"]', { position: { x: 12, y: 12 } });
  await settle(600);
  await p.locator('[data-orbit-kind="dependency"]').first().click();
  await settle(900);
  await shot("08-dependency-selected");
}

// Reduced motion must not break the picture.
{
  const ctx2 = await b.newContext({ viewport: { width: 1680, height: 1050 }, reducedMotion: "reduce" });
  const q = await ctx2.newPage();
  await q.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await q.waitForSelector('[data-shoot="orbit-field"]');
  await q.waitForTimeout(3000);
  await q.click('[data-shoot="orbit-focus-jsa"]');
  await q.waitForTimeout(1600);
  await q.mouse.move(1672, 1042);
  await q.waitForTimeout(400);
  await q.screenshot({ path: `${out}/09-reduced-motion.png` });
  console.log("  shot 09-reduced-motion");
  await ctx2.close();
}

await b.close();
console.log(
  writes === 0
    ? "\nNO WRITES from the instrument — every state was reached by looking, by hypothesising, or by a stored input that was put back"
    : `\n${writes} UNEXPECTED WRITE(S) — INVESTIGATE`
);
process.exit(writes === 0 ? 0 : 1);

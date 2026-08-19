// THE FIVE CONDITIONS, ON THE LIVE PROJECT.
//
// scripts/orbit-states-proof.ts proves the vocabulary can express all five
// deterministically. This one drives the real database through the real
// levers so each condition can be LOOKED at, which is what the foundation
// review is for.
//
// Every state below is reached by (a) choosing which project to look at, or
// (b) pulling a Scenario lever that already existed — assume a decision
// answered (SuiteScenario.resolvedGateIds, Decisions' own lever) or cut a
// capability (bypassedFeatureIds + excludedItemIds, Scope's own pair).
// Nothing is seeded, nothing is faked, and Reality is never written to.
//
//   node scripts/orbit-states-shoot.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "/tmp/orbit-states";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

let writes = 0;
await p.route("**/*", (r) => {
  if (r.request().method() !== "GET") { writes += 1; console.log("WRITE:", r.request().method(), r.request().url()); }
  r.continue();
});

const settle = (ms = 900) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1674, 1044); await settle(280); };
const shot = async (name) => { await park(); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log("  shot", name); };
const centre = () => p.locator('[data-shoot="orbit-centre-p50"]').evaluate((e) => e.textContent.trim());

const open = async () => {
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll("[data-orbit-node]").length > 0, { timeout: 30000 });
  await settle(2400);
};
const focus = async (id) => { await p.click(`[data-shoot="orbit-focus-${id}"]`); await settle(1100); };
const clear = async () => {
  const d = p.locator('[data-shoot="scenario-strip"] >> text=/back to reality/i').first();
  if ((await d.count()) > 0 && (await d.isEnabled())) { await d.click(); await settle(1500); }
};

await open();

// ── 01 BALANCED ────────────────────────────────────────────────────────
// A project where work and open questions are both present and neither is
// running the show. Platform: capabilities, no open gate, roster intact.
await focus("platform");
await shot("01-balanced");
console.log("  balanced centre:", await centre());

// ── 02 SCOPE HEAVY ─────────────────────────────────────────────────────
// JSA at rest. Five capabilities against two small decisions: the release
// itself is the constraint, and cutting scope is the real lever here.
await focus("jsa");
await shot("02-scope-heavy");
const sceneHeavy = await centre();
console.log("  scope-heavy centre:", sceneHeavy);

// ── 03 DECISION CHOKE ──────────────────────────────────────────────────
// Cut every capability with Scope's own lever. What is left holding the
// date is exactly what cutting scope cannot reach: the open decisions and
// the upstream project. This is the floor, drawn.
{
  let cut = 0;
  for (let i = 0; i < 8; i += 1) {
    const cap = p.locator('[data-orbit-kind="capability"]').first();
    if ((await cap.count()) === 0) break;
    const id = await cap.getAttribute("data-orbit-node");
    await cap.click();
    await settle(320);
    const btn = p.locator(`[data-shoot="orbit-cut-${id}"]`);
    if ((await btn.count()) === 0) break;
    await btn.click();
    await settle(1300);
    cut += 1;
  }
  await p.click('[data-shoot="orbit-field"]', { position: { x: 10, y: 10 } });
  await settle(900);
  console.log(`  cut ${cut} capabilities · centre now ${await centre()} (was ${sceneHeavy})`);
  await shot("03-decision-choke");

  // And the gate that is now the whole story, explained.
  const gate = p.locator('[data-orbit-kind="gate"]').first();
  if ((await gate.count()) > 0) { await gate.click(); await settle(700); await shot("03b-decision-choke-inspected"); }
}
await clear();
await settle(1200);

// ── 04 CAPACITY STARVATION ─────────────────────────────────────────────
// Not a lever in this wireframe — capacity is Portfolio's dial. What the
// foundation can show is the reading itself: allocation, delivery, and the
// gap between them named as switch loss rather than hidden in a date.
await focus("jsa");
{
  const cap = p.locator('[data-orbit-kind="capacity"]').first();
  if ((await cap.count()) > 0) { await cap.click(); await settle(800); }
  await shot("04-capacity-reading");
}

// ── 05 SCENARIO RELIEF ─────────────────────────────────────────────────
// Assume the open decisions answered, with Decisions' own lever, and watch
// the centre move. Reality is untouched: this is a hypothetical, and the
// strip says so.
{
  const before = await centre();
  const gates = p.locator('[data-orbit-kind="gate"]');
  const n = await gates.count();
  for (let i = 0; i < n; i += 1) {
    const g = gates.nth(i);
    const id = await g.getAttribute("data-orbit-node");
    await g.click();
    await settle(320);
    const btn = p.locator(`[data-shoot="orbit-assume-${id}"]`);
    if ((await btn.count()) > 0) { await btn.click(); await settle(1300); }
  }
  await p.click('[data-shoot="orbit-field"]', { position: { x: 10, y: 10 } });
  await settle(1100);
  console.log(`  relief: ${before} → ${await centre()}`);
  await shot("05-scenario-relief");
}

// ── 06 THE CANDIDATE ───────────────────────────────────────────────────
// A machine's suggestion, drawn as not-yet-real, explained as inert.
await clear();
await focus("jsa");
{
  const cand = p.locator('[data-orbit-node][data-candidate="true"]').first();
  if ((await cand.count()) > 0) { await cand.click(); await settle(800); await shot("06-candidate-inert"); }
  else console.log("  (no candidate in view)");
}

// ── 07 A DEPENDENCY, AND THE WHOLE FIELD AT REST ───────────────────────
{
  const dep = p.locator('[data-orbit-kind="dependency"]').first();
  if ((await dep.count()) > 0) { await dep.click(); await settle(800); await shot("07-dependency"); }
  await p.click('[data-shoot="orbit-field"]', { position: { x: 10, y: 10 } });
  await settle(700);
  await focus("itrack");
  await shot("08-itrack-rest");
  await focus("design");
  await shot("09-design-rest");
}

await b.close();
console.log(writes === 0 ? "\nNO WRITES — every state above was reached by looking and by hypothesising" : `\n${writes} WRITE(S) — INVESTIGATE`);
process.exit(writes === 0 ? 0 : 1);

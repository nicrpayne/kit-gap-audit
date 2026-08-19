// THE CONTROL ROOM V3, PHOTOGRAPHED.
//
// Five states, each one a question the surface has to answer without a
// paragraph. Every one is reached by driving the real product — no fixture
// injection, no forced props — so what is in the frame is what a person
// would actually see.
//
//   1  NORMAL          what is moving, what is waiting, where to look
//   2  CASCADE         one upstream, several launches riding on it
//   3  DECISION BLOCK  an unanswered question, drawn as an obstruction
//   4  CAPACITY        the same topology, a different ability situation
//   5  RELIEF          the clamp released, the forecast moving, Reality intact
//
// STATES 4 AND 5 ARE REACHED THROUGH THE INSTRUMENTS THAT OWN THOSE LEVERS
// (Portfolio for the switching cost, Orbit for the gate), not by writing to
// the Control Room — which owns nothing and can set nothing.
//
//   node scripts/control-room-v3-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "/tmp/control-room-v3";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const settle = (ms = 800) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(1674, 1046);
  await settle(300);
};
const shot = async (name) => {
  await park();
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  shot", name);
};
const openCR = async () => {
  await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="cr-field"]', { timeout: 30000 });
  await settle(3200);
};

// A clean workspace, so the shoot never photographs somebody's leftovers.
await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
await p.evaluate(() => localStorage.removeItem("kit.control-room.lens.v3"));
await openCR();

// ── 1. NORMAL ──────────────────────────────────────────────────────────
await shot("1-normal");

// ── 2. DEPENDENCY CASCADE ──────────────────────────────────────────────
// Select the upstream that carries more than one launch. Everything it
// reaches stays lit; everything it does not goes quiet.
{
  const lanes = await p
    .locator("[data-field-lane]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-field-lane")));
  // The shared upstream is the one the field itself drew an amber spine for.
  const shared = await p.locator('[data-shoot="cr-field-panel"] header').innerText();
  console.log("  field says:", shared.replace(/\n/g, " "));
  for (const id of lanes) {
    await p.click(`[data-field-lane="${id}"] rect`);
    await settle(700);
    const txt = await p.locator('[data-shoot="cr-inspector"]').innerText();
    if (/CARRIES[\s\S]*launches/i.test(txt)) break;
    await p.keyboard.press("Escape");
    await settle(300);
  }
  await shot("2-dependency-cascade");
}

// ── 3. DECISION BLOCK ──────────────────────────────────────────────────
{
  await p.keyboard.press("Escape");
  await settle(400);
  const gate = p.locator("[data-field-gate]").first();
  if ((await gate.count()) > 0) {
    await gate.click();
    await settle(800);
    await shot("3-decision-block");
  } else {
    console.log("  ! no gate on the field to photograph");
  }
}

// ── 4. CAPACITY CONSTRAINT ─────────────────────────────────────────────
// SAME TOPOLOGY, DIFFERENT ABILITY. The switching cost is Portfolio's
// lever, so it is moved in Portfolio; the field must show the difference
// as material, never by adding or moving a lane.
let originalSwitchCost = null;
{
  const settings = await (await fetch(`${BASE}/api/portfolio-settings`)).json();
  originalSwitchCost = settings.contextSwitchCostPct ?? settings?.settings?.contextSwitchCostPct ?? 12;
  const res = await fetch(`${BASE}/api/portfolio-settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contextSwitchCostPct: 45 }),
  });
  console.log("  switching cost → 45%:", res.status);
  await openCR();
  await p.keyboard.press("Escape");
  await settle(400);
  // Point the rail at a channel where the loss is REAL — an inferred
  // stand-in has no switching cost to show, so picking the first lane would
  // photograph the one row that cannot demonstrate the change.
  const channels = await p
    .locator("[data-field-capacity]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-field-capacity")));
  for (const id of channels) {
    await p.click(`[data-field-capacity="${id}"]`);
    await settle(700);
    if (/lost crossing between projects/i.test(await p.locator('[data-shoot="cr-inspector"]').innerText())) break;
    await p.keyboard.press("Escape");
    await settle(250);
  }
  await shot("4-capacity-constraint");
  await fetch(`${BASE}/api/portfolio-settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contextSwitchCostPct: originalSwitchCost }),
  });
  console.log("  switching cost restored →", originalSwitchCost);
}

// ── 5. SCENARIO RELIEF ─────────────────────────────────────────────────
// The gate is released in Orbit — the instrument that owns the lever — and
// the Control Room shows the hypothetical, with Reality still drawn beside
// it so nothing is lost.
{
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await settle(1400);
  const scopes = await p
    .locator('[data-shoot^="orbit-focus-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace("orbit-focus-", "")));
  let assumed = false;
  for (const s of scopes) {
    await p.click(`[data-shoot="orbit-focus-${s}"]`);
    await settle(700);
    const gate = p.locator('[data-orbit-kind="gate"]').first();
    if ((await gate.count()) === 0) continue;
    const id = await gate.getAttribute("data-orbit-node");
    await gate.click();
    await settle(600);
    await p.click(`[data-shoot="orbit-assume-${id}"]`);
    await settle(1600);
    assumed = true;
    break;
  }
  if (assumed) {
    await p.click('a[href="/control-room"]');
    await p.waitForURL("**/control-room", { timeout: 15000 });
    await p.waitForSelector('[data-shoot="cr-field"]');
    await settle(3400);
    await shot("5-scenario-relief");
    await p.click('[data-shoot="cr-discard"]');
    await settle(1600);
  } else {
    console.log("  ! no gate to release in Orbit");
  }
}

// Leave the browser as it was found.
await p.evaluate(() => localStorage.removeItem("kit.control-room.lens.v3"));

console.log(`\nStates in ${OUT}`);
await b.close();

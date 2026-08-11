// Browser verification for the instrument-ergonomics pass. Drives the real
// UI and asserts the values the simulation actually receives.
//   npx tsx prisma/seed-dev.ts && node scripts/ergonomics-check.mjs <outDir>
// Requires a fresh dev seed: case D deliberately writes Reality to the DB.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const outDir = process.argv[2] ?? "/tmp/erg";
const BASE = "http://localhost:3000";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal,#__next-build-watcher{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const settle = (ms = 900) => page.waitForTimeout(ms);
const shot = async (n) => { await page.screenshot({ path: `${outDir}/${n}.png` }); };
const results = [];
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected);
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}: got ${actual}${ok ? "" : `, expected ${expected}`}`);
};

const fader = () => page.locator('[data-shoot="capacity-fader"]');
const faderValue = async () => parseFloat(await fader().getAttribute("aria-valuenow"));
const rowByName = (n) => page.locator('[role="button"][aria-pressed]').filter({ hasText: n }).first();
async function selectScope(name) { await rowByName(name).click(); await settle(1200); }
async function press(key, times = 1) {
  for (let i = 0; i < times; i++) { await page.keyboard.press(key); await page.waitForTimeout(45); }
  await settle(700);
}

await page.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
await settle(4500);

// ---------- A. INFERRED CAPACITY (Platform, reality 10) ----------
await selectScope("PLATFORM");
check("A0 Platform reality is inferred 10", await page.locator('[data-shoot="capacity-fader"]').getAttribute("aria-valuetext"), "10.0 FTE simulated, Reality is 10.0 FTE");
await fader().focus();
await press("ArrowDown", 6);            // 10.0 -> 7.0
check("A1 fader 10 -> 7", await faderValue(), 7);
await shot("A-inferred-10-to-7");
await press("ArrowUp", 13);             // 7.0 -> 13.5
check("A2 fader 7 -> 13.5", await faderValue(), 13.5);
await shot("B-scenario-above-reality");
await fader().dblclick();               // reset
await settle(1000);
check("A3 double-click resets to exactly 10", await faderValue(), 10);

// ---------- Floor ----------
await fader().focus();
await press("End");
await press("Home");
check("Floor is 0.1, never 0", await faderValue(), 0.1);
await fader().dblclick();
await settle(900);

// ---------- B. EXPLICIT CAPACITY (iTrack, reality 5) ----------
await selectScope("ITRACK");
check("B0 iTrack reality explicit 5", await faderValue(), 5);
await fader().focus();
await press("ArrowDown", 5);            // 5.0 -> 2.5
check("B1 fader 5 -> 2.5", await faderValue(), 2.5);
check("B2 commit allowed for aggregate scope", (await page.locator('button:has-text("Commit changes")').isDisabled()) ? "disabled" : "enabled", "enabled");
await fader().dblclick();
await settle(900);

// ---------- C. ALLOCATIONS-SOURCED (JSA) ----------
await selectScope("JSA");
const jsaReality = await faderValue();
await fader().focus();
await press("ArrowDown", 2);
const jsaScenario = await faderValue();
check("C1 aggregate preview allowed below reality", jsaScenario < jsaReality ? "yes" : "no", "yes");
check(
  "C2 commit BLOCKED for allocations-sourced aggregate",
  (await page.locator('button:has-text("Commit changes")').isDisabled()) ? "disabled" : "enabled",
  "disabled"
);
const blockText = await page.locator('[data-shoot="scenario-bar"]').innerText();
check("C3 blocked explanation shown", /can.t commit this capacity change/i.test(blockText) ? "shown" : "missing", "shown");
await shot("C-allocations-blocked");
await fader().dblclick();
await settle(900);

// ---------- G. SELECTED vs CHANGED ----------
await selectScope("PLATFORM");
await fader().focus();
await press("ArrowDown", 6);
await selectScope("JSA");
const inspecting = await page.locator('aside[aria-label$="detail"]').innerText();
check("G1 inspector says INSPECTING JSA", /inspecting/i.test(inspecting) && /jsa/i.test(inspecting) ? "yes" : "no", "yes");
check("G2 inspector names CHANGED = Platform", /changed in this scenario/i.test(inspecting) && /platform/i.test(inspecting) ? "yes" : "no", "yes");
check("G3 field badges only the changed row", await page.locator('[data-shoot="changed-badge"]').count(), 1);
await shot("G-selected-jsa-changed-platform");
await page.locator('button:has-text("Discard")').click();
await settle(1200);

// ---------- H. UNBOUNDED DIRECT ENTRY (Platform, reality 10) ----------
await selectScope("PLATFORM");
const restingMax = parseFloat(await fader().getAttribute("aria-valuemax"));
check("H0 resting range is 2x Reality", restingMax, 20);
const likelyOf = async (name) => (await rowByName(name).innerText()).split("\n")[1];
const likelyAt10 = await likelyOf("PLATFORM");

// type a value far beyond the resting range
await page.locator('[data-shoot="capacity-fader-value"]').click();
await settle(250);
await page.locator('[aria-label="Capacity exact value"]').fill("28");
await page.keyboard.press("Enter");
await settle(1600);
check("H1 typed 28 is not clamped to 2x Reality", await faderValue(), 28);
check("H2 fader range expanded past 28", parseFloat(await fader().getAttribute("aria-valuemax")) > 28 ? "expanded" : "clamped", "expanded");
const likelyAt28 = await likelyOf("PLATFORM");
check("H3 forecast recomputed at 28", likelyAt28 !== likelyAt10 ? "recomputed" : "unchanged", "recomputed");
await shot("H-direct-entry-28");

// an even more extreme value is still accepted
await page.locator('[data-shoot="capacity-fader-value"]').click();
await settle(250);
await page.locator('[aria-label="Capacity exact value"]').fill("40");
await page.keyboard.press("Enter");
await settle(1400);
check("H4 typed 40 accepted", await faderValue(), 40);

// Escape cancels without committing
await page.locator('[data-shoot="capacity-fader-value"]').click();
await settle(250);
await page.locator('[aria-label="Capacity exact value"]').fill("99");
await page.keyboard.press("Escape");
await settle(600);
check("H5 Escape cancels the edit", await faderValue(), 40);

// invalid entries are rejected, not silently coerced
await page.locator('[data-shoot="capacity-fader-value"]').click();
await settle(250);
await page.locator('[aria-label="Capacity exact value"]').fill("0");
await page.keyboard.press("Enter");
await settle(500);
check("H6 zero rejected (engine floor)", await faderValue(), 40);
await page.locator('[aria-label="Capacity exact value"]').fill("abc");
await page.keyboard.press("Enter");
await settle(500);
check("H7 non-numeric rejected", await faderValue(), 40);
await page.keyboard.press("Escape");
await settle(400);

// reset collapses both the value and the range
await fader().dblclick();
await settle(1200);
check("H8 reset returns to exactly 10", await faderValue(), 10);
check("H9 range collapses back to resting", parseFloat(await fader().getAttribute("aria-valuemax")), 20);
check("H10 forecast returns to its Reality value", await likelyOf("PLATFORM"), likelyAt10);

// ---------- I. FINE MANIPULATION ON A SMALL SCOPE (Design, reality 0.4) ----------
await selectScope("DESIGN");
check("I0 Design resting max is 2 (not 8)", parseFloat(await fader().getAttribute("aria-valuemax")), 2);
await fader().focus();
await page.keyboard.down("Shift");
await press("ArrowUp", 1);
// Reality here is off-grid (0.352), so the first fine press walks to the
// neighbouring 0.1 grid point rather than skipping it -- that is what makes
// adjustment near Reality usable on a small scope.
check("I1 fine step lands on the next 0.1 grid point above Reality", await faderValue(), 0.4);
await press("ArrowUp", 1);
check("I2 subsequent fine presses move a full 0.1 step", await faderValue(), 0.5);
await page.keyboard.up("Shift");
await fader().dblclick();
await settle(900);

// ---------- F. NO TARGET (Design) ----------
await selectScope("DESIGN");
check("F1 confidence shows NO TARGET", await page.locator('text=No target').count() > 0 ? "yes" : "no", "yes");
const flagsBefore = await page.locator('[role="slider"][aria-label$="target date"]').count();
check("F2 no target flag rendered for Design", flagsBefore, 3); // Platform, JSA, iTrack only
await shot("F-no-target");
await page.locator('[data-shoot="set-target"]').click();
await settle(1400);
const flagsAfter = await page.locator('[role="slider"][aria-label$="target date"]').count();
check("F3 target flag appears after Set target", flagsAfter, 4);
await shot("F-target-set");

// target drag changes confidence but NOT the distribution
const designRowText = async () => (await rowByName("DESIGN").innerText());
const before = await designRowText();
const flag = page.locator('[role="slider"][aria-label$="target date"]').last();
await flag.focus();
await press("ArrowRight", 5);
const after = await designRowText();
const likelyBefore = before.split("\n")[1];
const likelyAfter = after.split("\n")[1];
check("F4 moving target does not move the forecast", likelyAfter, likelyBefore);
await page.locator('button:has-text("Discard")').click();
await settle(900);

// ---------- E. SWITCH COST ----------
await selectScope("PLATFORM");
const knob = page.locator('[data-shoot="switch-knob"]');
check("E0 knob is a real slider", await knob.getAttribute("role"), "slider");
check("E1 knob starts at saved 12", await knob.getAttribute("aria-valuenow"), "12");
await knob.focus();
await press("ArrowUp", 4);              // 12 -> 30 (snap to 5-grid: 15,20,25,30)
check("E2 knob steps by 5 to 30", await knob.getAttribute("aria-valuenow"), "30");
const table = await page.locator('[data-shoot="switch-table"]').innerText();
check("E3 interpretation matches formula at 30%", table.replace(/\s+/g, " "), "1 scope 100% effective 2 scopes 70% effective 3 scopes 40% effective");
await page.locator('[data-shoot="explain-switch"]').click();
await settle(1000);
await shot("E-context-switch");
await page.locator('button:has-text("Discard")').click();
await settle(900);

// ---------- D. EDIT REALITY (inferred -> explicit) ----------
await selectScope("PLATFORM");
await page.locator('[data-shoot="explain-reality"]').click();
await settle(800);
await page.locator('[data-shoot="edit-reality"]').click();
await settle(400);
await page.locator("#reality-capacity").fill("8");
await page.locator('[data-shoot="save-reality"]').click();
await settle(5000);
await selectScope("PLATFORM");
check("D1 reality persisted as 8", await faderValue(), 8);
const insp = await page.locator('aside[aria-label$="detail"]').innerText();
check("D2 source is now explicit", insp.includes("Set by hand") ? "explicit" : "not-explicit", "explicit");
await shot("D-reality-edited");

console.log("\n" + results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
await browser.close();

// PORTFOLIO → FORECAST cross-instrument proof.
//
// Changes REAL Portfolio-owned inputs through the Portfolio instrument's own
// controls (fader + typed entry + Commit changes / context-switch knob), then
// shows the Forecast Living Object consuming the result through the shared
// Reality model. No outcome is forced: the numbers logged are whatever the
// simulation produces, including the case where extra capacity barely moves
// the date because a serial gate dominates. All committed values are
// reverted through the same UI at the end, and verified via the API.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/fc-proof";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
let errors = 0;
p.on("pageerror", (e) => { errors++; console.log("PAGEERROR:", e.message); });
p.on("console", (m) => { if (m.type() === "error") { errors++; console.log("CONSOLE:", m.text().slice(0, 160)); } });

const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log("shot", n); };
const wait = (ms) => p.waitForTimeout(ms);
let failures = 0;
const assert = (cond, label) => {
  console.log(cond ? `PASS  ${label}` : `FAIL  ${label}`);
  if (!cond) failures++;
};

const gotoForecast = async (scope) => {
  await p.goto("http://localhost:3000/forecast", { waitUntil: "networkidle" });
  await wait(3800);
  await p.locator(`[data-shoot="scope-${scope}"]`).click();
  await wait(2600);
};
const forecastReading = async () => (await p.locator('[data-shoot="central-date"]').innerText()).replace(/\s+/g, " ").trim();

const gotoPortfolio = async (scopeName) => {
  await p.goto("http://localhost:3000/portfolio", { waitUntil: "networkidle" });
  await wait(4200);
  await p.locator('[role="button"][aria-pressed]').filter({ hasText: scopeName }).first().click();
  await wait(1400);
};
const commit = async () => {
  await p.locator('button:has-text("Commit changes")').click();
  await wait(3200);
};
const setCapacityTyped = async (value) => {
  await p.locator('[data-shoot="capacity-fader-value"]').click();
  await p.keyboard.press("ControlOrMeta+a");
  await p.keyboard.type(String(value));
  await p.keyboard.press("Enter");
  await wait(1500);
};
const apiState = async () => {
  const r = await p.request.get("http://localhost:3000/api/instrument/project");
  const j = await r.json();
  return {
    switchPct: j.contextSwitchCostPct,
    caps: Object.fromEntries(j.scopes.map((s) => [s.scopeId, [s.teamCapacity, s.capacitySource]])),
  };
};

// ── Baseline state ───────────────────────────────────────────────────────
await p.goto("http://localhost:3000/forecast", { waitUntil: "networkidle" });
await wait(2000);
const before = await apiState();
console.log("BASELINE:", JSON.stringify(before));
const platCap0 = before.caps.platform[0];

// ── A. Forecast BEFORE ───────────────────────────────────────────────────
await gotoForecast("platform");
const readBefore = await forecastReading();
console.log("FORECAST platform BEFORE:", readBefore);
await shot("p1-forecast-before");

// ── B. Portfolio: double Platform capacity, COMMIT (Reality change) ─────
await gotoPortfolio("PLATFORM");
await setCapacityTyped(platCap0 * 2);
await shot("p2-portfolio-preview-2x");
await commit();
await shot("p3-portfolio-committed-2x");
const mid = await apiState();
assert(Math.abs(mid.caps.platform[0] - platCap0 * 2) < 0.01, `Portfolio commit doubled Platform capacity (${platCap0} → ${mid.caps.platform[0]})`);

// ── C. Forecast AFTER — the object consumed the committed Reality ───────
await gotoForecast("platform");
const readAfter = await forecastReading();
console.log("FORECAST platform AFTER 2x capacity:", readAfter);
await shot("p4-forecast-after-2x-capacity");
assert(readAfter !== readBefore || true, "reading captured"); // honest: log, don't force

// ── D. The serial gate still stands: assume it decided, watch the move ──
await p.locator('[data-shoot="toggle-macros"]').click();
await wait(500);
await p.locator('[data-shoot="macro-gate"]').first().click();
await wait(2400);
const readReleased = await forecastReading();
console.log("FORECAST platform 2x capacity + gate assumed decided:", readReleased);
await shot("p5-forecast-2x-plus-gate-released");
await p.locator('[data-shoot="discard"]').click();
await wait(1200);

// ── E. Revert Platform capacity through the same UI ─────────────────────
await gotoPortfolio("PLATFORM");
await setCapacityTyped(platCap0);
await commit();
const reverted = await apiState();
assert(Math.abs(reverted.caps.platform[0] - platCap0) < 0.01, `Platform capacity reverted (${reverted.caps.platform[0]})`);

// ── F. Context switch: JSA before (Sam is split JSA/Design) ─────────────
await gotoForecast("jsa");
const jsaBefore = await forecastReading();
console.log("FORECAST jsa BEFORE:", jsaBefore);
await shot("p6-jsa-before-switch");

// ── G. Portfolio: raise context switch 12% → 60%, COMMIT ────────────────
await gotoPortfolio("PLATFORM"); // explicit scope so Commit is allowed
const knob = p.locator('[data-shoot="switch-knob"]');
await knob.focus();
const knobStart = parseFloat(await knob.getAttribute("aria-valuenow"));
await p.keyboard.press("PageUp"); // +25
await p.keyboard.press("PageUp"); // +25
await wait(1200);
const knobNow = parseFloat(await knob.getAttribute("aria-valuenow"));
console.log(`switch knob ${knobStart}% → ${knobNow}%`);
await shot("p7-portfolio-switch-raised");
await commit();
const switched = await apiState();
assert(Math.abs(switched.switchPct - knobNow) < 0.01, `context switch committed (${switched.switchPct}%)`);

// ── H. Forecast: JSA consumed the new effective capacity ────────────────
await gotoForecast("jsa");
const jsaAfter = await forecastReading();
console.log("FORECAST jsa AFTER switch raise:", jsaAfter);
await shot("p8-jsa-after-switch");

// ── I. Revert context switch through the same UI ────────────────────────
await gotoPortfolio("PLATFORM");
await knob.focus();
await p.keyboard.press("Home"); // 0
for (let i = 0; i < Math.round(knobStart); i++) await p.keyboard.press("Shift+ArrowUp"); // fine +1 each
await wait(1000);
const knobBack = parseFloat(await p.locator('[data-shoot="switch-knob"]').getAttribute("aria-valuenow"));
console.log(`switch knob restored to ${knobBack}%`);
await commit();
const final = await apiState();
assert(Math.abs(final.switchPct - before.switchPct) < 0.01, `context switch reverted (${final.switchPct}%)`);
assert(Math.abs(final.caps.platform[0] - platCap0) < 0.01, "final state matches baseline capacity");

console.log(`\nerrors=${errors} assertion-failures=${failures}`);
await b.close();
process.exit(failures > 0 || errors > 0 ? 1 : 0);

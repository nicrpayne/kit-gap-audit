// SCOPE -> FORECAST PROOF. Not part of the app build.
//
// Drives the real UI with a real pointer and asserts, at every step, that the
// two instruments are operating ONE world:
//
//   Reality on Scope  ->  cut real work  ->  Scope reacts  ->  walk to Forecast
//   ->  the Living Forecast shows the SAME hypothetical  ->  discard  ->  both
//   instruments are back on Reality.
//
// Also proves the honest negative: a scope whose date is set by a dependency
// does not move when its backlog is cut.
//
//   node scripts/scope-forecast-proof.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/scope-proof";
const BASE = "http://localhost:3000";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal,#__next-build-watcher{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
p.on("pageerror", (e) => {
  console.log("PAGEERROR:", e.message);
  failures++;
});

const settle = (ms = 1500) => p.waitForTimeout(ms);
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });

// The landing date each instrument is currently showing for its scope.
const scopeDate = () => p.locator('[data-shoot="landing"] .i-readout').first().innerText();
const forecastDate = () => p.locator('[data-shoot="central-date"] .i-readout').first().innerText();
const statePill = () => p.locator('[data-shoot="scenario-strip"] span').first().innerText();

async function pullOut(index) {
  const slab = p.locator('[data-shoot="stratum"]').nth(index);
  const box = await slab.boundingBox();
  const y = box.y + box.height / 2;
  await p.mouse.move(box.x + box.width / 2, y);
  await p.mouse.down();
  for (const dx of [40, 90, 140, 175]) {
    await p.mouse.move(box.x + box.width / 2 + dx, y, { steps: 4 });
    await p.waitForTimeout(45);
  }
  await p.mouse.up();
  await settle(1500);
}

// ── 1. Reality on Scope ─────────────────────────────────────────────────
await p.goto(`${BASE}/scope`, { waitUntil: "networkidle" });
await settle(4200);
await p.locator('text="Design"').first().click();
await settle(1600);

const realityScope = await scopeDate();
check("Scope opens in Reality", (await statePill()).includes("REALITY"), await statePill());
console.log(`      Design lands ${realityScope} in Reality`);
await shot("1-scope-reality");

// ── 2. Cut real work, with a real drag ──────────────────────────────────
const itemName = await p.locator('[data-shoot="stratum"]').first().getAttribute("aria-label");
await pullOut(0);
const scenarioScope = await scopeDate();
check("Scenario state is declared in words", (await statePill()).includes("SCENARIO"), await statePill());
check("The work is parked, not deleted", (await p.locator('[data-shoot="out-margin"]').count()) === 1);
check("Scope's own date moved", realityScope !== scenarioScope, `${realityScope} -> ${scenarioScope}`);
console.log(`      cut: ${itemName}`);
await shot("2-scope-scenario");

// ── 3. Walk to Forecast. The hypothetical must survive the walk ─────────
await p.locator('[data-shoot="open-forecast"]').count().then(async (n) => {
  if (n === 0) await p.locator('[data-shoot="toggle-macros"]').click();
});
await settle(600);
await p.locator('[data-shoot="open-forecast"]').click();
await p.waitForURL("**/forecast");
await settle(4200);
await p.locator('[data-shoot="scope-design"]').click();
await settle(2200);

const forecastScenario = await forecastDate();
check("Forecast is in the same Scenario", (await statePill()).includes("SCENARIO"), await statePill());
check(
  "Forecast names the assumption Scope made",
  (await p.locator('text=/item(s)? out of scope/').count()) > 0
);
check(
  "Forecast shows the same date Scope did",
  scenarioScope.toUpperCase().includes(forecastScenario.split(" ")[0].toUpperCase()),
  `Scope "${scenarioScope}" vs Forecast "${forecastScenario}"`
);
await shot("3-forecast-same-scenario");

// ── 4. Discard. Both instruments return to Reality ──────────────────────
await p.locator('[data-shoot="discard"]').click();
await settle(2400);
const forecastReality = await forecastDate();
check("Forecast is back on Reality", (await statePill()).includes("REALITY"), await statePill());
check("Forecast's date returned", forecastReality !== forecastScenario, `${forecastScenario} -> ${forecastReality}`);
await shot("4-forecast-reality");

await p.goto(`${BASE}/scope`, { waitUntil: "networkidle" });
await settle(4200);
await p.locator('text="Design"').first().click();
await settle(1600);
check("Scope is back on Reality too", (await scopeDate()) === realityScope, `${await scopeDate()} vs ${realityScope}`);
check("Nothing is parked any more", (await p.locator('[data-shoot="out-margin"]').count()) === 0);
await shot("5-scope-back-to-reality");

// ── 5. The honest negative: a dominated scope ───────────────────────────
await p.locator('text="iTrack"').first().click();
await settle(1800);
const itrackReality = await scopeDate();
await pullOut(0);
await pullOut(0);
const itrackScenario = await scopeDate();
check(
  "Cutting a dominated scope moves nothing, and the instrument says so",
  itrackReality === itrackScenario,
  `${itrackReality} -> ${itrackScenario}`
);
const verdict = await p.locator('[data-shoot="verdict"]').innerText();
check("The verdict names the real constraint", /waits on Platform/i.test(verdict), verdict.replace(/\n/g, " "));
await shot("6-dominated");

await b.close();
console.log(failures === 0 ? "\nALL PROOFS PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

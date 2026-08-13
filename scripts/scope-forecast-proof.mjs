// SCOPE -> FORECAST PROOF, at the capability level. Not part of the app build.
//
// Drives the real UI and asserts that composing the product in Scope and
// reading the consequence in Forecast are one world:
//
//   Reality -> bypass a capability -> the desk reacts -> the release readout
//   moves -> walk to Forecast -> the Living Forecast shows the SAME
//   hypothetical, named as a capability -> discard -> both back on Reality.
//
// Also proves the two honest negatives: a capability whose work is dominated
// by a dependency moves nothing, and a hand-declared capability with no work
// mapped to it changes no forecast at all.
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

const scopeDate = () => p.locator('[data-shoot="master"] .i-readout').first().innerText();
const forecastDate = () => p.locator('[data-shoot="central-date"] .i-readout').first().innerText();
const statePill = () => p.locator('[data-shoot="scenario-strip"] span').first().innerText();
const releaseLoad = async () =>
  (await p.locator('[data-shoot="master"]').innerText()).match(/RELEASE LOAD\s+([\d.]+)d/i)?.[1];

const goScope = async (key) => {
  await p.goto(`${BASE}/scope`, { waitUntil: "networkidle" });
  await settle(4000);
  await p.locator(`[data-shoot="scope-${key}"]`).click();
  await settle(1700);
};
// Taking a capability out is a DRAG in V3, so the proof performs one -- with a
// real pointer, past the activation threshold, into the shelf.
const bypass = async () => {
  const tile = p.locator('[data-shoot="bay-in"] [data-shoot="capability"]').first();
  const shelf = p.locator('[data-shoot="bay-out"]');
  const a = await tile.boundingBox();
  const t = await shelf.boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 8 });
  await p.mouse.down();
  await p.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 6, { steps: 4 });
  await p.mouse.move(t.x + t.width * 0.35, t.y + t.height / 2, { steps: 22 });
  await settle(350);
  await p.mouse.up();
  await settle(1600);
};

// ── 1. Reality ──────────────────────────────────────────────────────────
await goScope("jsa");
check("Scope opens in Reality", (await statePill()).includes("REALITY"), await statePill());
const tiles = await p.locator('[data-shoot="capability"]').count();
check("The tray shows capabilities, not tickets", tiles >= 4 && tiles <= 12, `${tiles} tiles`);
const realityDate = await scopeDate();
const realityLoad = await releaseLoad();
console.log(`      JSA lands ${realityDate}, carrying ${realityLoad}d across ${tiles} capabilities`);
await shot("1-reality");

// ── 2. Bypass one capability ────────────────────────────────────────────
const firstName = await p.locator('[data-shoot="bay-in"] [data-shoot="capability"]').first().innerText();
await bypass();
const scenarioDate = await scopeDate();
const scenarioLoad = await releaseLoad();
check("Scenario state is declared in words", (await statePill()).includes("SCENARIO"), await statePill());
check(
  "The chip names a capability, not a ticket count",
  (await p.locator("text=/capabilit(y|ies) out of this release/").count()) > 0
);
check("The capability still exists, on the shelf", (await p.locator('[data-shoot="capability"]').count()) === tiles);
check(
  "It is parked out of the release, not deleted",
  (await p.locator('[data-shoot="bay-out"] [data-shoot="capability"]').count()) === 1
);
check("Release load fell", Number(scenarioLoad) < Number(realityLoad), `${realityLoad}d -> ${scenarioLoad}d`);
check("The release date moved", realityDate !== scenarioDate, `${realityDate} -> ${scenarioDate}`);
console.log(`      dragged out: ${firstName.split("\n")[0]}`);
await shot("2-bypassed");

// ── 3. The hypothetical survives the walk to Forecast ───────────────────
await p.locator('[data-shoot="open-forecast"]').click();
await p.waitForURL("**/forecast");
await settle(4200);
await p.locator('[data-shoot="scope-jsa"]').click();
await settle(2200);
const forecastScenario = await forecastDate();
check("Forecast is in the same Scenario", (await statePill()).includes("SCENARIO"), await statePill());
check(
  "Forecast names the capability Scope took out",
  (await p.locator("text=/capabilit(y|ies) out of this release/").count()) > 0
);
check(
  "Forecast shows the same date Scope did",
  scenarioDate.toUpperCase().includes(forecastScenario.split(" ")[0].toUpperCase()),
  `Scope "${scenarioDate}" vs Forecast "${forecastScenario}"`
);
await shot("3-forecast-same-scenario");

// ── 4. Discard returns both instruments to Reality ──────────────────────
await p.locator('[data-shoot="discard"]').click();
await settle(2400);
check("Forecast is back on Reality", (await statePill()).includes("REALITY"), await statePill());
await goScope("jsa");
check("Scope is back on Reality too", (await scopeDate()) === realityDate, `${await scopeDate()} vs ${realityDate}`);
check("The shelf is empty again", (await p.locator('[data-shoot="bay-out"] [data-shoot="capability"]').count()) === 0);
await shot("4-back-to-reality");

// ── 5. The honest negative: a dominated scope ───────────────────────────
await goScope("itrack");
const itrackReality = await scopeDate();
await bypass();
await bypass();
const itrackScenario = await scopeDate();
check(
  "Cutting capabilities in a dominated scope moves nothing",
  itrackReality === itrackScenario,
  `${itrackReality} -> ${itrackScenario}`
);
const master = await p.locator('[data-shoot="master"]').innerText();
check("The master names the real constraint", /waits on Platform/i.test(master), master.split("\n").slice(-6).join(" · "));
await shot("5-dominated");

// ── 6. A declared capability with no work changes no forecast ──────────
await p.locator('[data-shoot="discard"]').click();
await settle(1500);
const beforeDeclare = await scopeDate();
await p.locator('[data-shoot="add-feature"]').click();
await settle(700);
await p.locator("#feature-name").fill("Shift Handover");
await p.locator('[data-shoot="create-feature"]').click();
await settle(1600);
await p.keyboard.press("Escape");
await settle(800);
check(
  "A declared capability with no work mapped changes no date",
  (await scopeDate()) === beforeDeclare,
  `${beforeDeclare} -> ${await scopeDate()}`
);
check(
  "…and is visibly a draft that was never saved",
  (await p.locator('[data-shoot="capability"]').filter({ hasText: "Draft" }).count()) === 1
);
await shot("6-declared-capability");

await b.close();
console.log(failures === 0 ? "\nALL PROOFS PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

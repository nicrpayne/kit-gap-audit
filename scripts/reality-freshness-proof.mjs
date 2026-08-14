// REALITY FRESHNESS ACROSS INSTRUMENTS. Not part of the app build.
//
// The bug this exists to keep dead: Portfolio and Forecast are separate
// routes over ONE project, and a Reality change committed in Portfolio was
// invisible in Forecast until the browser was refreshed. The suite showed
// two different worlds and called both of them Reality.
//
// Everything here happens through in-app navigation and real controls.
// page.reload() is used EXACTLY ONCE, at the very end, and only to prove the
// change was persisted rather than held in memory -- never to obtain the
// freshness the app is supposed to deliver on its own. A refresh anywhere
// else would hide the very bug being tested.
//
// It also pins the invariant behind Nic's original report: when both
// instruments are on Reality, showing the same Scope, reading the same P50
// landing date off the same simulation, those two dates MUST be the same
// date. They are computed by the same runPortfolioSimulation over the same
// payload, so any disagreement is a staleness bug, not a difference of
// meaning.
//
//   node scripts/reality-freshness-proof.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/freshness-proof";
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

// Every read of the shared project payload, so the proof can say WHERE
// freshness came from rather than only that it arrived.
let projectReads = 0;
p.on("request", (r) => {
  if (r.url().includes("/api/instrument/project")) projectReads++;
});

const settle = (ms = 1500) => p.waitForTimeout(ms);
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });

const statePill = () => p.locator('[data-shoot="scenario-strip"] span').first().innerText();

// ── the two dates under test ────────────────────────────────────────────
// Forecast: the central readout, for the selected Scope.
const forecastPlatformDate = async () => {
  await p.locator('[data-shoot="scope-platform"]').click();
  await settle(1800);
  const text = await p.locator('[data-shoot="central-date"]').innerText();
  return text.split("\n")[1].trim().toUpperCase();
};
// Portfolio: the same Scope's band readout on the field.
const portfolioPlatformDate = async () => {
  const band = p.locator('[aria-label^="Platform, likely"]');
  await band.click();
  await settle(1200);
  return (await band.locator(".i-readout").first().innerText()).trim().toUpperCase();
};

const goForecast = async () => {
  await p.locator('nav[aria-label="Sections"] a[href="/forecast"]').click();
  await p.waitForURL("**/forecast");
  await settle(4200);
};
const goPortfolio = async () => {
  await p.locator('nav[aria-label="Sections"] a[href="/portfolio"]').click();
  await p.waitForURL("**/portfolio");
  await settle(4200);
};

// The real "this changes what the system believes is true" control.
const setPlatformCapacity = async (fte) => {
  await p.locator('[aria-label^="Platform, likely"]').click();
  await settle(900);
  await p.locator('[data-shoot="edit-reality"]').click();
  await settle(500);
  await p.locator("#reality-capacity").fill(String(fte));
  await p.locator('[data-shoot="save-reality"]').click();
  await settle(3200);
};

const readCapacity = () =>
  p.evaluate(async () => {
    const r = await fetch("/api/portfolio/inputs", { cache: "no-store" });
    const j = await r.json();
    return j.scopes.find((s) => s.scopeId === "platform")?.teamCapacity ?? null;
  });

// ═══════════════════════════════════════════════════════════════════════
// 1. REALITY, as Forecast sees it
// ═══════════════════════════════════════════════════════════════════════
await p.goto(`${BASE}/forecast`, { waitUntil: "networkidle" });
await settle(4200);
check("Forecast opens on Reality", (await statePill()).includes("REALITY"), await statePill());
const forecast0 = await forecastPlatformDate();
console.log(`      Forecast says Platform lands ${forecast0}`);
await shot("1-forecast-reality");

// ═══════════════════════════════════════════════════════════════════════
// 2. THE SAME DATE, as Portfolio sees it  (the invariant from the report)
// ═══════════════════════════════════════════════════════════════════════
await goPortfolio();
const portfolio0 = await portfolioPlatformDate();
console.log(`      Portfolio says Platform lands ${portfolio0}`);
check(
  "Both instruments agree on Platform's landing date under Reality",
  forecast0 === portfolio0,
  `Forecast "${forecast0}" vs Portfolio "${portfolio0}"`
);
const capacity0 = await readCapacity();
await shot("2-portfolio-agrees");

// ═══════════════════════════════════════════════════════════════════════
// 3. COMMIT A REALITY CHANGE, and watch the shared truth be invalidated
//    WITHOUT leaving the route.
// ═══════════════════════════════════════════════════════════════════════
const readsBeforeSave = projectReads;
const capacity1 = Number(capacity0) + 6;
await setPlatformCapacity(capacity1);

const persisted = await readCapacity();
check("Platform's capacity persisted", Number(persisted) === capacity1, `${capacity0} -> ${persisted}`);
check(
  "Committing Reality revalidates shared project truth in place",
  projectReads > readsBeforeSave,
  `${projectReads - readsBeforeSave} read(s) of /api/instrument/project, still on /portfolio`
);

const portfolio1 = await portfolioPlatformDate();
check("Portfolio's own date moved", portfolio1 !== portfolio0, `${portfolio0} -> ${portfolio1}`);
await shot("3-reality-committed");

// ═══════════════════════════════════════════════════════════════════════
// 4. WALK TO FORECAST. No reload. This is the bug.
// ═══════════════════════════════════════════════════════════════════════
await goForecast();
const forecast1 = await forecastPlatformDate();
console.log(`      Forecast now says Platform lands ${forecast1}`);
check(
  "Forecast shows the new Reality after in-app navigation, with no refresh",
  forecast1 !== forecast0,
  `${forecast0} -> ${forecast1}`
);
check(
  "…and it is the SAME date Portfolio is showing",
  forecast1 === portfolio1,
  `Forecast "${forecast1}" vs Portfolio "${portfolio1}"`
);
check("Forecast is still on Reality", (await statePill()).includes("REALITY"), await statePill());
await shot("4-forecast-fresh-no-reload");

// ═══════════════════════════════════════════════════════════════════════
// 5. SCENARIO SAFETY: a Reality change must not destroy a live hypothetical.
//    Compose one in Scope, change Reality underneath it in Portfolio, and
//    the hypothetical must survive AND be applied on top of the new truth.
// ═══════════════════════════════════════════════════════════════════════
await p.locator('nav[aria-label="Sections"] a[href="/scope"]').click();
await p.waitForURL("**/scope");
await settle(4200);
await p.locator('[data-shoot="scope-jsa"]').click();
await settle(1700);

const tile = p.locator('[data-shoot="bay-in"] [data-shoot="capability"]').first();
const shelf = p.locator('[data-shoot="bay-out"]');
const ta = await tile.boundingBox();
const tb = await shelf.boundingBox();
await p.mouse.move(ta.x + ta.width / 2, ta.y + ta.height / 2, { steps: 8 });
await p.mouse.down();
await p.mouse.move(ta.x + ta.width / 2 + 12, ta.y + ta.height / 2 + 6, { steps: 4 });
await p.mouse.move(tb.x + tb.width * 0.35, tb.y + tb.height / 2, { steps: 22 });
await settle(350);
await p.mouse.up();
await settle(1800);
check("A Scenario is active in Scope", (await statePill()).includes("SCENARIO"), await statePill());
const cutName = (await p.locator('[data-shoot="bay-out"] [data-shoot="capability"]').first().innerText()).split("\n")[0];
await shot("5-scenario-composed");

// Change Reality underneath the live Scenario. Portfolio runs its own
// scenario bar rather than the suite's strip -- it is the instrument for
// people and allocation, and does not display Scope's release hypothetical --
// so the Scenario's survival is asserted where it is actually legible.
// A CUT, not another raise. Adding capacity to an already well-staffed Scope
// legitimately need not move its date -- work runs out of things to
// parallelise, and a gate or a dependency can dominate regardless -- so a
// raise is the wrong instrument for asserting that a date moved. Halving it
// always bites.
await goPortfolio();
const capacity2 = Math.max(1, Math.floor(Number(capacity0) / 2));
await setPlatformCapacity(capacity2);
check("Reality moved again underneath the live Scenario", Number(await readCapacity()) === capacity2, `-> ${capacity2}`);
const portfolio2 = await portfolioPlatformDate();
console.log(`      current Reality now puts Platform at ${portfolio2}`);

await goForecast();
check(
  "A Reality commit did not discard the active Scenario",
  (await statePill()).includes("SCENARIO"),
  await statePill()
);
check(
  "…and still names the capability Scope took out",
  (await p.locator("text=/capabilit(y|ies) out of this release/").count()) > 0,
  cutName
);
await shot("6-scenario-survived-reality-change");

// Discard must return to the CURRENT Reality, not the one the Scenario was
// built on.
await p.locator('[data-shoot="discard"]').click();
await settle(2600);
const forecastAfterDiscard = await forecastPlatformDate();
check("Discard returns Forecast to Reality", (await statePill()).includes("REALITY"), await statePill());

await goPortfolio();
const portfolioAfterDiscard = await portfolioPlatformDate();
check(
  "Discard lands on CURRENT Reality, and both instruments agree on it",
  forecastAfterDiscard === portfolioAfterDiscard,
  `Forecast "${forecastAfterDiscard}" vs Portfolio "${portfolioAfterDiscard}"`
);
check(
  "…which is the Reality committed most recently, not the one the Scenario was built on",
  forecastAfterDiscard === portfolio2 && forecastAfterDiscard !== forecast1,
  `built on "${forecast1}", committed since "${portfolio2}", discarded to "${forecastAfterDiscard}"`
);
await shot("7-discard-to-current-reality");

// ═══════════════════════════════════════════════════════════════════════
// 6. RESTORE, and only now confirm with a reload that all of this was
//    persisted rather than remembered.
// ═══════════════════════════════════════════════════════════════════════
await setPlatformCapacity(Number(capacity0));
const restored = await readCapacity();
check("Platform's capacity restored", Number(restored) === Number(capacity0), `back to ${restored}`);

await p.reload({ waitUntil: "networkidle" });
await settle(4200);
const portfolioRestored = await portfolioPlatformDate();
check(
  "After restore, Portfolio is back where it started",
  portfolioRestored === portfolio0,
  `${portfolio0} -> ${portfolioRestored}`
);
await goForecast();
const forecastRestored = await forecastPlatformDate();
check(
  "…and so is Forecast",
  forecastRestored === forecast0,
  `${forecast0} -> ${forecastRestored}`
);
await shot("8-restored");

await b.close();
console.log(`\n/api/instrument/project reads over the whole run: ${projectReads}`);
console.log(failures === 0 ? "\nALL PROOFS PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

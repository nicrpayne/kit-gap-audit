// Design-loop screenshot harness for the Scope Composer. Not part of the app
// build.   node scripts/scope-shots.mjs <outDir>
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/scope";
const BASE = "http://localhost:3000";
mkdirSync(out, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal,#__next-build-watcher{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
p.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200));
});

const settle = (ms = 1300) => p.waitForTimeout(ms);
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  console.log("shot", n);
};
const goScope = async (name) => {
  await p.goto(`${BASE}/scope`, { waitUntil: "networkidle" });
  await settle(3800);
  if (name) {
    await p.locator(`[data-shoot="scope-${name}"]`).click();
    await settle(1500);
  }
};
const bypass = async (i) => {
  await p.locator('[data-shoot="engage"]').nth(i).click();
  await settle(1400);
};
const openFeature = async (i) => {
  await p.locator('[data-shoot="channel"] button').nth(i * 2).click();
  await settle(800);
};
const mode = async (m) => {
  await p.locator(`[data-shoot="mode-${m}"]`).click();
  await settle(600);
};

// 1. REALITY — the whole product shape at a glance.
await goScope("jsa");
await shot("1-reality");

// 2. One capability bypassed.
await bypass(0);
await shot("2-one-bypassed");

// 3. Several bypassed.
await bypass(2);
await bypass(3);
await shot("3-several-bypassed");

// 4-8. Feature Detail, every mode.
await p.locator('[data-shoot="discard"]').click();
await settle(1500);
await openFeature(0);
await shot("4-detail-overview");
await mode("work");
await shot("5-detail-work");
await mode("evidence");
await shot("6-detail-evidence");
await mode("estimate");
await p.locator('[data-shoot="tune-estimate"]').first().click();
await settle(700);
await shot("7-detail-estimate");
await mode("history");
await shot("8-detail-history");
await p.keyboard.press("Escape");
await settle(500);

// 9. The Hermes candidate — a capability Linear does not represent.
const candidate = p.locator('[data-shoot="channel"]').filter({ hasText: "Candidate" }).first();
if ((await candidate.count()) > 0) {
  await candidate.locator("button").first().click();
  await settle(800);
  await mode("evidence");
  await shot("9-hermes-candidate");
  await p.keyboard.press("Escape");
  await settle(500);
}

// 10. Adding a capability by hand, claiming unmapped work.
await p.locator('[data-shoot="add-feature"]').click();
await settle(700);
await p.locator("#feature-name").fill("Crew Directory");
await p.locator("#feature-intent").fill("Supervisors need an accurate crew list before a JSA can be signed off.");
await settle(300);
const claims = p.locator('[data-shoot="claim-item"]');
if ((await claims.count()) > 0) {
  await claims.first().click();
  await settle(300);
}
await shot("10-add-capability");
await p.locator('[data-shoot="create-feature"]').click();
await settle(1400);
await shot("11-draft-created");
await p.keyboard.press("Escape");
await settle(600);
await shot("12-desk-with-draft");

// 13. Cross-instrument: the same hypothetical, in Forecast.
await p.locator('[data-shoot="discard"]').click();
await settle(1400);
await bypass(0);
await shot("13-scenario-before-forecast");
await p.locator('[data-shoot="open-forecast"]').click();
await p.waitForURL("**/forecast");
await settle(4000);
await shot("14-forecast-consequence");

await b.close();
